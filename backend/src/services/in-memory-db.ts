import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import type { AuthUser, Role } from '../types/auth.js';
import type {
  AuthSessionRecord,
  CoverageTier,
  DependentRecord,
  DependentRelationship,
  EmployeeProfileRecord,
  EnrollmentElectionSnapshot,
  EnrollmentRecord,
  InviteCodeRecord,
  InviteTargetRole,
  PasswordResetTokenRecord,
  PlanPremiumRecord,
  PlanRecord,
  PlanType,
  PlanYearRecord,
  TenantRecord,
  SecurityEventRecord,
  UserRecord,
} from '../types/domain.js';
import { HttpError } from '../types/http-error.js';
import { assertUniqueDependentIds, validateEnrollmentCoverageSelection } from './enrollment-coverage-validator.js';
import { hashPassword } from './password-service.js';
import type { DbAdapter } from './db.types.js';

const COMPANY_ID_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

interface CreateInviteCodeInput {
  creatorUserId: string;
  tenantId: string;
  targetRole: InviteTargetRole;
  expiresAt?: string;
  maxUses?: number;
}

interface SignupWithInviteInput {
  code: string;
  email: string;
  passwordHash: string;
}

interface EmployeeProfileInput {
  employeeId: string;
  firstName: string;
  lastName: string;
  dob: string;
  hireDate: string;
  salaryAmount: number;
  benefitClass: EmployeeProfileRecord['benefitClass'];
  employmentStatus: EmployeeProfileRecord['employmentStatus'];
}

interface CreatePlanYearInput {
  actorUserId: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface CreatePlanInput {
  tenantId: string;
  planYearId: string;
  type: PlanType;
  carrier: string;
  planName: string;
}

interface PlanPremiumInput {
  coverageTier: CoverageTier;
  employeeMonthlyCost: number;
  employerMonthlyCost: number;
}

interface ReplacePlanPremiumsInput {
  tenantId: string;
  planId: string;
  tiers: PlanPremiumInput[];
}

interface AddDependentInput {
  tenantId: string;
  employeeUserId: string;
  relationship: DependentRelationship;
  firstName: string;
  lastName: string;
  dob: string;
}

interface EnrollmentElectionInput {
  planType: PlanType;
  planId: string;
  coverageTier: CoverageTier;
}

interface CreateEnrollmentDraftInput {
  tenantId: string;
  employeeUserId: string;
  planYearId: string;
  elections: EnrollmentElectionInput[];
  dependentIds: string[];
}

interface SubmitEnrollmentInput {
  tenantId: string;
  employeeUserId: string;
  enrollmentId: string;
}

export class InMemoryDb implements DbAdapter {
  private initialized = false;

  private tenants: TenantRecord[] = [];
  private users: UserRecord[] = [];
  private inviteCodes: InviteCodeRecord[] = [];
  private employeeProfiles: EmployeeProfileRecord[] = [];
  private planYears: PlanYearRecord[] = [];
  private plans: PlanRecord[] = [];
  private planPremiums: PlanPremiumRecord[] = [];
  private dependents: DependentRecord[] = [];
  private enrollments: EnrollmentRecord[] = [];
  private authSessions: AuthSessionRecord[] = [];
  private passwordResetTokens: PasswordResetTokenRecord[] = [];
  private securityEvents: SecurityEventRecord[] = [];

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const now = this.nowIso();
    const seededAdmin: UserRecord = {
      id: uuidv4(),
      tenantId: null,
      email: env.SEED_FULL_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(env.SEED_FULL_ADMIN_PASSWORD),
      role: 'FULL_ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.users.push(seededAdmin);
    this.initialized = true;
  }

  listTenants(): TenantRecord[] {
    return [...this.tenants];
  }

  getTenantById(tenantId: string): TenantRecord | undefined {
    return this.tenants.find((tenant) => tenant.id === tenantId);
  }

  createTenant(input: { name: string; companyId?: string }): TenantRecord {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new HttpError(400, 'Tenant name is required');
    }

    const companyId = input.companyId?.trim() || this.generateCompanyId(trimmedName);
    if (!COMPANY_ID_REGEX.test(companyId)) {
      throw new HttpError(400, 'companyId must match ^[a-zA-Z0-9_-]{3,32}$');
    }

    const duplicate = this.tenants.find((tenant) => tenant.companyId.toLowerCase() === companyId.toLowerCase());
    if (duplicate) {
      throw new HttpError(409, 'companyId already exists');
    }

    const now = this.nowIso();
    const tenant: TenantRecord = {
      id: uuidv4(),
      companyId,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.push(tenant);
    return tenant;
  }

  findUserByEmail(email: string): UserRecord | undefined {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(userId: string): UserRecord | undefined {
    return this.users.find((user) => user.id === userId);
  }

  listTenantUsers(tenantId: string, role?: 'COMPANY_ADMIN' | 'EMPLOYEE'): UserRecord[] {
    return this.users.filter((user) => user.tenantId === tenantId && (!role || user.role === role));
  }

  listEmployeeProfiles(tenantId: string): EmployeeProfileRecord[] {
    return this.employeeProfiles
      .filter((profile) => profile.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  toAuthUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  createInviteCode(input: CreateInviteCodeInput): InviteCodeRecord {
    const creator = this.findUserById(input.creatorUserId);
    if (!creator) {
      throw new HttpError(404, 'Invite code creator not found');
    }

    const tenant = this.getTenantById(input.tenantId);
    if (!tenant) {
      throw new HttpError(404, 'Tenant not found');
    }

    if (input.targetRole === 'COMPANY_ADMIN') {
      if (creator.role !== 'FULL_ADMIN') {
        throw new HttpError(403, 'Only FULL_ADMIN can create COMPANY_ADMIN invite codes');
      }
    }

    if (input.targetRole === 'EMPLOYEE') {
      if (creator.role !== 'COMPANY_ADMIN') {
        throw new HttpError(403, 'Only COMPANY_ADMIN can create EMPLOYEE invite codes');
      }
      if (creator.tenantId !== input.tenantId) {
        throw new HttpError(403, 'COMPANY_ADMIN can only create employee invite codes for their own tenant');
      }
    }

    const now = this.nowIso();
    const inviteCode: InviteCodeRecord = {
      id: uuidv4(),
      tenantId: input.tenantId,
      code: this.generateInviteCode(),
      targetRole: input.targetRole,
      createdByUserId: creator.id,
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
      usesCount: 0,
      isActive: true,
      createdAt: now,
    };

    this.inviteCodes.push(inviteCode);
    return inviteCode;
  }

  signupWithInvite(input: SignupWithInviteInput): UserRecord {
    const invite = this.inviteCodes.find((candidate) => candidate.code === input.code);
    if (!invite) {
      throw new HttpError(404, 'Invite code not found');
    }

    if (!invite.isActive) {
      throw new HttpError(400, 'Invite code is inactive');
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new HttpError(400, 'Invite code is expired');
    }

    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new HttpError(400, 'Invite code has reached max uses');
    }

    if (this.findUserByEmail(input.email)) {
      throw new HttpError(409, 'Email already exists');
    }

    const now = this.nowIso();
    const userRole: Role = invite.targetRole;
    const createdUser: UserRecord = {
      id: uuidv4(),
      tenantId: invite.tenantId,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: userRole,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.users.push(createdUser);
    invite.usesCount += 1;
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      invite.isActive = false;
    }

    return createdUser;
  }

  upsertEmployeeProfile(tenantId: string, employeeUserId: string, payload: EmployeeProfileInput): EmployeeProfileRecord {
    const employee = this.findUserById(employeeUserId);
    if (!employee || employee.role !== 'EMPLOYEE' || employee.tenantId !== tenantId) {
      throw new HttpError(404, 'Employee user not found in tenant');
    }

    if (payload.salaryAmount < 0) {
      throw new HttpError(400, 'salaryAmount must be >= 0');
    }

    const duplicateEmployeeId = this.employeeProfiles.find(
      (profile) => profile.tenantId === tenantId && profile.employeeId === payload.employeeId && profile.userId !== employeeUserId,
    );
    if (duplicateEmployeeId) {
      throw new HttpError(409, 'employeeId already exists in tenant');
    }

    const existing = this.employeeProfiles.find((profile) => profile.userId === employeeUserId);
    const now = this.nowIso();
    if (!existing) {
      const createdProfile: EmployeeProfileRecord = {
        userId: employeeUserId,
        tenantId,
        employeeId: payload.employeeId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        dob: payload.dob,
        hireDate: payload.hireDate,
        salaryAmount: payload.salaryAmount,
        benefitClass: payload.benefitClass,
        employmentStatus: payload.employmentStatus,
        createdAt: now,
        updatedAt: now,
      };
      this.employeeProfiles.push(createdProfile);
      return createdProfile;
    }

    existing.employeeId = payload.employeeId;
    existing.firstName = payload.firstName;
    existing.lastName = payload.lastName;
    existing.dob = payload.dob;
    existing.hireDate = payload.hireDate;
    existing.salaryAmount = payload.salaryAmount;
    existing.benefitClass = payload.benefitClass;
    existing.employmentStatus = payload.employmentStatus;
    existing.updatedAt = now;

    return existing;
  }

  getEmployeeProfile(employeeUserId: string): EmployeeProfileRecord | undefined {
    return this.employeeProfiles.find((profile) => profile.userId === employeeUserId);
  }

  createPlanYear(input: CreatePlanYearInput): PlanYearRecord {
    const tenant = this.getTenantById(input.tenantId);
    if (!tenant) {
      throw new HttpError(404, 'Tenant not found');
    }

    const start = parseDate(input.startDate);
    const end = parseDate(input.endDate);
    if (start.getTime() > end.getTime()) {
      throw new HttpError(400, 'startDate must be before or equal to endDate');
    }

    const overlapping = this.planYears.find((planYear) => {
      if (planYear.tenantId !== input.tenantId) {
        return false;
      }
      const existingStart = parseDate(planYear.startDate);
      const existingEnd = parseDate(planYear.endDate);
      return start.getTime() <= existingEnd.getTime() && end.getTime() >= existingStart.getTime();
    });

    if (overlapping) {
      throw new HttpError(409, 'Plan year overlaps with an existing plan year for tenant');
    }

    const now = this.nowIso();
    const planYear: PlanYearRecord = {
      id: uuidv4(),
      tenantId: input.tenantId,
      name: input.name,
      startDate: toDateOnly(start),
      endDate: toDateOnly(end),
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.planYears.push(planYear);
    return planYear;
  }

  listPlanYears(tenantId: string): PlanYearRecord[] {
    return this.planYears
      .filter((planYear) => planYear.tenantId === tenantId)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  createPlan(input: CreatePlanInput): PlanRecord {
    const planYear = this.planYears.find((candidate) => candidate.id === input.planYearId && candidate.tenantId === input.tenantId);
    if (!planYear) {
      throw new HttpError(404, 'Plan year not found for tenant');
    }

    const now = this.nowIso();
    const plan: PlanRecord = {
      id: uuidv4(),
      tenantId: input.tenantId,
      planYearId: input.planYearId,
      type: input.type,
      carrier: input.carrier,
      planName: input.planName,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.plans.push(plan);
    return plan;
  }

  listPlans(tenantId: string, planYearId?: string): PlanRecord[] {
    return this.plans.filter((plan) => {
      if (plan.tenantId !== tenantId) {
        return false;
      }
      if (planYearId && plan.planYearId !== planYearId) {
        return false;
      }
      return true;
    });
  }

  replacePlanPremiums(input: ReplacePlanPremiumsInput): PlanPremiumRecord[] {
    const plan = this.plans.find((candidate) => candidate.id === input.planId);
    if (!plan || plan.tenantId !== input.tenantId) {
      throw new HttpError(404, 'Plan not found for tenant');
    }

    const seenTiers = new Set<CoverageTier>();
    for (const tier of input.tiers) {
      if (seenTiers.has(tier.coverageTier)) {
        throw new HttpError(400, `Duplicate coverage tier: ${tier.coverageTier}`);
      }
      seenTiers.add(tier.coverageTier);
      if (tier.employeeMonthlyCost < 0 || tier.employerMonthlyCost < 0) {
        throw new HttpError(400, 'Premium costs must be >= 0');
      }
    }

    this.planPremiums = this.planPremiums.filter((premium) => premium.planId !== input.planId);

    const now = this.nowIso();
    const premiums = input.tiers.map((tier) => ({
      id: uuidv4(),
      planId: input.planId,
      coverageTier: tier.coverageTier,
      employeeMonthlyCost: tier.employeeMonthlyCost,
      employerMonthlyCost: tier.employerMonthlyCost,
      createdAt: now,
      updatedAt: now,
    }));

    this.planPremiums.push(...premiums);
    return premiums;
  }

  addDependent(input: AddDependentInput): DependentRecord {
    const employee = this.findUserById(input.employeeUserId);
    if (!employee || employee.role !== 'EMPLOYEE' || employee.tenantId !== input.tenantId) {
      throw new HttpError(404, 'Employee not found in tenant');
    }

    const now = this.nowIso();
    const dependent: DependentRecord = {
      id: uuidv4(),
      tenantId: input.tenantId,
      employeeUserId: input.employeeUserId,
      relationship: input.relationship,
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dob,
      createdAt: now,
      updatedAt: now,
    };

    this.dependents.push(dependent);
    return dependent;
  }

  listEmployeeDependents(tenantId: string, employeeUserId: string): DependentRecord[] {
    return this.dependents.filter(
      (dependent) => dependent.tenantId === tenantId && dependent.employeeUserId === employeeUserId,
    );
  }

  listEmployeeEnrollments(tenantId: string, employeeUserId: string): EnrollmentRecord[] {
    return this.enrollments.filter(
      (enrollment) => enrollment.tenantId === tenantId && enrollment.employeeUserId === employeeUserId,
    );
  }

  createEnrollmentDraft(input: CreateEnrollmentDraftInput): EnrollmentRecord {
    this.assertEmployeeInTenant(input.employeeUserId, input.tenantId);
    assertUniqueDependentIds(input.dependentIds);

    const planYear = this.planYears.find((candidate) => candidate.id === input.planYearId && candidate.tenantId === input.tenantId);
    if (!planYear) {
      throw new HttpError(404, 'Plan year not found for tenant');
    }

    const electionPlanTypes = new Set<PlanType>();
    const electionSnapshots: EnrollmentElectionSnapshot[] = [];
    for (const election of input.elections) {
      if (electionPlanTypes.has(election.planType)) {
        throw new HttpError(400, `Duplicate election plan type: ${election.planType}`);
      }
      electionPlanTypes.add(election.planType);

      const plan = this.plans.find((candidate) => candidate.id === election.planId);
      if (!plan || plan.tenantId !== input.tenantId || plan.planYearId !== input.planYearId) {
        throw new HttpError(404, `Plan ${election.planId} not found in tenant plan year`);
      }

      if (plan.type !== election.planType) {
        throw new HttpError(400, `Election planType ${election.planType} does not match plan type ${plan.type}`);
      }

      const premium = this.planPremiums.find(
        (candidate) => candidate.planId === election.planId && candidate.coverageTier === election.coverageTier,
      );
      if (!premium) {
        throw new HttpError(422, `No premium configured for plan ${election.planId} and tier ${election.coverageTier}`);
      }

      electionSnapshots.push({
        planType: election.planType,
        planId: election.planId,
        coverageTier: election.coverageTier,
        employeeMonthlyCost: premium.employeeMonthlyCost,
        employerMonthlyCost: premium.employerMonthlyCost,
      });
    }

    const selectedDependents: DependentRecord[] = [];
    for (const dependentId of input.dependentIds) {
      const dependent = this.dependents.find((candidate) => candidate.id === dependentId);
      if (!dependent || dependent.tenantId !== input.tenantId || dependent.employeeUserId !== input.employeeUserId) {
        throw new HttpError(422, `Dependent ${dependentId} does not belong to employee`);
      }
      selectedDependents.push(dependent);
    }

    validateEnrollmentCoverageSelection({
      electionCoverageTiers: input.elections.map((election) => election.coverageTier),
      dependents: selectedDependents.map((dependent) => ({
        id: dependent.id,
        relationship: dependent.relationship,
      })),
    });

    const now = this.nowIso();
    const existingDrafts = this.enrollments.filter(
      (candidate) =>
        candidate.tenantId === input.tenantId &&
        candidate.employeeUserId === input.employeeUserId &&
        candidate.planYearId === input.planYearId &&
        candidate.status === 'DRAFT',
    );

    if (existingDrafts.length > 0) {
      const draft = existingDrafts[0];
      const duplicateDraftIds = new Set(existingDrafts.slice(1).map((candidate) => candidate.id));
      if (duplicateDraftIds.size > 0) {
        this.enrollments = this.enrollments.filter((candidate) => !duplicateDraftIds.has(candidate.id));
      }

      draft.elections = electionSnapshots;
      draft.dependentIds = [...input.dependentIds];
      draft.effectiveDate = null;
      draft.submittedAt = null;
      draft.confirmationCode = null;
      draft.updatedAt = now;
      return draft;
    }

    const enrollment: EnrollmentRecord = {
      id: uuidv4(),
      tenantId: input.tenantId,
      employeeUserId: input.employeeUserId,
      planYearId: input.planYearId,
      status: 'DRAFT',
      effectiveDate: null,
      submittedAt: null,
      confirmationCode: null,
      elections: electionSnapshots,
      dependentIds: [...input.dependentIds],
      createdAt: now,
      updatedAt: now,
    };

    this.enrollments.push(enrollment);
    return enrollment;
  }

  submitEnrollment(input: SubmitEnrollmentInput): EnrollmentRecord {
    this.assertEmployeeInTenant(input.employeeUserId, input.tenantId);

    const enrollment = this.enrollments.find((candidate) => candidate.id === input.enrollmentId);
    if (!enrollment || enrollment.tenantId !== input.tenantId || enrollment.employeeUserId !== input.employeeUserId) {
      throw new HttpError(404, 'Enrollment not found for employee in tenant');
    }

    if (enrollment.status === 'SUBMITTED') {
      throw new HttpError(409, 'Enrollment already submitted');
    }

    const existingSubmitted = this.enrollments.find(
      (candidate) =>
        candidate.id !== enrollment.id &&
        candidate.employeeUserId === enrollment.employeeUserId &&
        candidate.planYearId === enrollment.planYearId &&
        candidate.status === 'SUBMITTED',
    );
    if (existingSubmitted) {
      throw new HttpError(409, 'Employee already has a submitted enrollment for this plan year');
    }

    const profile = this.employeeProfiles.find((candidate) => candidate.userId === enrollment.employeeUserId);
    if (!profile) {
      throw new HttpError(422, 'Employee profile is required before enrollment submit');
    }

    if (profile.benefitClass !== 'FULL_TIME_ELIGIBLE' || profile.employmentStatus !== 'ACTIVE') {
      throw new HttpError(422, 'Employee is not benefits-eligible');
    }

    const effectiveDate = this.calculateEffectiveDate(profile.hireDate);

    const selectedDependents: DependentRecord[] = [];
    for (const dependentId of enrollment.dependentIds) {
      const dependent = this.dependents.find((candidate) => candidate.id === dependentId);
      if (!dependent) {
        throw new HttpError(422, `Dependent ${dependentId} not found`);
      }
      selectedDependents.push(dependent);
    }

    validateEnrollmentCoverageSelection({
      electionCoverageTiers: enrollment.elections.map((election) => election.coverageTier),
      dependents: selectedDependents.map((dependent) => ({
        id: dependent.id,
        relationship: dependent.relationship,
      })),
    });

    for (const dependent of selectedDependents) {
      if (dependent.relationship === 'CHILD') {
        const childAge = calculateAgeOnDate(parseDate(dependent.dob), parseDate(effectiveDate));
        if (childAge >= 26) {
          throw new HttpError(422, `Dependent ${dependent.id} is age ${childAge}; child dependents must be under 26`);
        }
      }
    }

    const refreshedElections = enrollment.elections.map((election) => {
      const premium = this.planPremiums.find(
        (candidate) => candidate.planId === election.planId && candidate.coverageTier === election.coverageTier,
      );
      if (!premium) {
        throw new HttpError(
          422,
          `Cannot submit enrollment; missing premium for plan ${election.planId} tier ${election.coverageTier}`,
        );
      }
      return {
        ...election,
        employeeMonthlyCost: premium.employeeMonthlyCost,
        employerMonthlyCost: premium.employerMonthlyCost,
      };
    });

    const now = this.nowIso();
    enrollment.status = 'SUBMITTED';
    enrollment.submittedAt = now;
    enrollment.effectiveDate = effectiveDate;
    enrollment.confirmationCode = this.generateConfirmationCode();
    enrollment.elections = refreshedElections;
    enrollment.updatedAt = now;

    return enrollment;
  }

  createAuthSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): AuthSessionRecord {
    const now = this.nowIso();
    const session: AuthSessionRecord = {
      id: uuidv4(),
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revokedReason: null,
      replacedBySessionId: null,
    };
    this.authSessions.push(session);
    return session;
  }

  findAuthSessionByRefreshTokenHash(refreshTokenHash: string): AuthSessionRecord | undefined {
    return this.authSessions.find((session) => session.refreshTokenHash === refreshTokenHash);
  }

  revokeAuthSession(input: { sessionId: string; reason: string; replacedBySessionId?: string | null }): void {
    const session = this.authSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session || session.revokedAt) {
      return;
    }

    session.revokedAt = this.nowIso();
    session.revokedReason = input.reason;
    session.replacedBySessionId = input.replacedBySessionId ?? null;
  }

  revokeAllAuthSessionsForUser(userId: string, reason: string): void {
    const now = this.nowIso();
    for (const session of this.authSessions) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        session.revokedReason = reason;
      }
    }
  }

  isAuthSessionActive(sessionId: string): boolean {
    const session = this.authSessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      return false;
    }

    if (session.revokedAt) {
      return false;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return false;
    }

    return true;
  }

  createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): PasswordResetTokenRecord {
    const token: PasswordResetTokenRecord = {
      id: uuidv4(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: this.nowIso(),
      expiresAt: input.expiresAt,
      usedAt: null,
    };
    this.passwordResetTokens.push(token);
    return token;
  }

  findPasswordResetTokenByHash(tokenHash: string): PasswordResetTokenRecord | undefined {
    return this.passwordResetTokens.find((candidate) => candidate.tokenHash === tokenHash);
  }

  markPasswordResetTokenUsed(tokenId: string): void {
    const token = this.passwordResetTokens.find((candidate) => candidate.id === tokenId);
    if (!token) {
      return;
    }
    token.usedAt = this.nowIso();
  }

  updateUserPasswordHash(userId: string, passwordHash: string): void {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    user.passwordHash = passwordHash;
    user.updatedAt = this.nowIso();
  }

  createSecurityEvent(input: {
    userId?: string | null;
    tenantId?: string | null;
    eventType: string;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }): SecurityEventRecord {
    const event: SecurityEventRecord = {
      id: uuidv4(),
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      eventType: input.eventType,
      severity: input.severity ?? 'INFO',
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
      createdAt: this.nowIso(),
    };

    this.securityEvents.push(event);
    return event;
  }

  listSecurityEvents(input?: {
    tenantId?: string;
    limit?: number;
    offset?: number;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    eventType?: string;
    q?: string;
  }): SecurityEventRecord[] {
    const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
    const offset = Math.max(input?.offset ?? 0, 0);
    const queryText = input?.q?.trim().toLowerCase() ?? '';
    const eventType = input?.eventType?.trim().toLowerCase() ?? '';

    return this.securityEvents
      .filter((event) => !input?.tenantId || event.tenantId === input.tenantId)
      .filter((event) => !input?.severity || event.severity === input.severity)
      .filter((event) => !eventType || event.eventType.toLowerCase().includes(eventType))
      .filter((event) => {
        if (!queryText) {
          return true;
        }

        const metadataText = event.metadata ? JSON.stringify(event.metadata).toLowerCase() : '';
        return (
          event.eventType.toLowerCase().includes(queryText) ||
          event.severity.toLowerCase().includes(queryText) ||
          (event.userId ?? '').toLowerCase().includes(queryText) ||
          (event.tenantId ?? '').toLowerCase().includes(queryText) ||
          metadataText.includes(queryText)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit);
  }

  private assertEmployeeInTenant(employeeUserId: string, tenantId: string): void {
    const employee = this.findUserById(employeeUserId);
    if (!employee || employee.role !== 'EMPLOYEE' || employee.tenantId !== tenantId) {
      throw new HttpError(404, 'Employee not found in tenant');
    }
  }

  private calculateEffectiveDate(hireDateIso: string): string {
    const today = new Date();
    const hireDate = parseDate(hireDateIso);

    if (hireDate.getTime() > Date.now()) {
      throw new HttpError(422, 'hireDate cannot be in the future');
    }

    const hireSameMonth =
      hireDate.getUTCFullYear() === today.getUTCFullYear() && hireDate.getUTCMonth() === today.getUTCMonth();

    if (hireSameMonth) {
      const firstOfNextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      return toDateOnly(firstOfNextMonth);
    }

    return toDateOnly(today);
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private generateInviteCode(): string {
    let code = '';
    do {
      code = `INV-${randomBytes(6).toString('base64url').toUpperCase()}`;
    } while (this.inviteCodes.some((invite) => invite.code === code));
    return code;
  }

  private generateConfirmationCode(): string {
    return `ENR-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private generateCompanyId(companyName: string): string {
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);

    const base = slug.length >= 3 ? slug : 'company';

    let candidate = base;
    while (this.tenants.some((tenant) => tenant.companyId.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${base}-${randomBytes(2).toString('hex')}`;
    }

    return candidate;
  }
}

function parseDate(input: string): Date {
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Invalid date value: ${input}`);
  }
  return date;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateAgeOnDate(dob: Date, onDate: Date): number {
  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = onDate.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = onDate.getUTCDate() - dob.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

export const db = new InMemoryDb();
