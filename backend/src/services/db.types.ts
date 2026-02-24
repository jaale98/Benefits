import type { AuthUser } from '../types/auth.js';
import type {
  AuthSessionRecord,
  CoverageTier,
  DependentRecord,
  DependentRelationship,
  EmployeeProfileRecord,
  EnrollmentRecord,
  InviteCodeRecord,
  InviteTargetRole,
  PlanPremiumRecord,
  PlanRecord,
  PlanType,
  PlanYearRecord,
  PasswordResetTokenRecord,
  SecurityEventRecord,
  TenantRecord,
  UserRecord,
} from '../types/domain.js';

export interface CreateInviteCodeInput {
  creatorUserId: string;
  tenantId: string;
  targetRole: InviteTargetRole;
  expiresAt?: string;
  maxUses?: number;
}

export interface SignupWithInviteInput {
  code: string;
  email: string;
  passwordHash: string;
}

export interface EmployeeProfileInput {
  employeeId: string;
  firstName: string;
  lastName: string;
  dob: string;
  hireDate: string;
  salaryAmount: number;
  benefitClass: EmployeeProfileRecord['benefitClass'];
  employmentStatus: EmployeeProfileRecord['employmentStatus'];
}

export interface CreatePlanYearInput {
  actorUserId: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface CreatePlanInput {
  tenantId: string;
  planYearId: string;
  type: PlanType;
  carrier: string;
  planName: string;
}

export interface PlanPremiumInput {
  coverageTier: CoverageTier;
  employeeMonthlyCost: number;
  employerMonthlyCost: number;
}

export interface ReplacePlanPremiumsInput {
  tenantId: string;
  planId: string;
  tiers: PlanPremiumInput[];
}

export interface AddDependentInput {
  tenantId: string;
  employeeUserId: string;
  relationship: DependentRelationship;
  firstName: string;
  lastName: string;
  dob: string;
}

export interface EnrollmentElectionInput {
  planType: PlanType;
  planId: string;
  coverageTier: CoverageTier;
}

export interface CreateEnrollmentDraftInput {
  tenantId: string;
  employeeUserId: string;
  planYearId: string;
  elections: EnrollmentElectionInput[];
  dependentIds: string[];
}

export interface SubmitEnrollmentInput {
  tenantId: string;
  employeeUserId: string;
  enrollmentId: string;
}

export interface CreateAuthSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface RevokeAuthSessionInput {
  sessionId: string;
  reason: string;
  replacedBySessionId?: string | null;
}

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

export interface CreateSecurityEventInput {
  userId?: string | null;
  tenantId?: string | null;
  eventType: string;
  severity?: 'INFO' | 'WARN' | 'ERROR';
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type MaybePromise<T> = T | Promise<T>;

export interface DbAdapter {
  init(): Promise<void>;
  listTenants(): MaybePromise<TenantRecord[]>;
  createTenant(input: { name: string; companyId?: string }): MaybePromise<TenantRecord>;
  findUserByEmail(email: string): MaybePromise<UserRecord | undefined>;
  findUserById(userId: string): MaybePromise<UserRecord | undefined>;
  toAuthUser(user: UserRecord): AuthUser;
  createInviteCode(input: CreateInviteCodeInput): MaybePromise<InviteCodeRecord>;
  signupWithInvite(input: SignupWithInviteInput): MaybePromise<UserRecord>;
  upsertEmployeeProfile(
    tenantId: string,
    employeeUserId: string,
    payload: EmployeeProfileInput,
  ): MaybePromise<EmployeeProfileRecord>;
  createPlanYear(input: CreatePlanYearInput): MaybePromise<PlanYearRecord>;
  createPlan(input: CreatePlanInput): MaybePromise<PlanRecord>;
  replacePlanPremiums(input: ReplacePlanPremiumsInput): MaybePromise<PlanPremiumRecord[]>;
  addDependent(input: AddDependentInput): MaybePromise<DependentRecord>;
  createEnrollmentDraft(input: CreateEnrollmentDraftInput): MaybePromise<EnrollmentRecord>;
  submitEnrollment(input: SubmitEnrollmentInput): MaybePromise<EnrollmentRecord>;
  createAuthSession(input: CreateAuthSessionInput): MaybePromise<AuthSessionRecord>;
  findAuthSessionByRefreshTokenHash(refreshTokenHash: string): MaybePromise<AuthSessionRecord | undefined>;
  revokeAuthSession(input: RevokeAuthSessionInput): MaybePromise<void>;
  revokeAllAuthSessionsForUser(userId: string, reason: string): MaybePromise<void>;
  isAuthSessionActive(sessionId: string): MaybePromise<boolean>;
  createPasswordResetToken(input: CreatePasswordResetTokenInput): MaybePromise<PasswordResetTokenRecord>;
  findPasswordResetTokenByHash(tokenHash: string): MaybePromise<PasswordResetTokenRecord | undefined>;
  markPasswordResetTokenUsed(tokenId: string): MaybePromise<void>;
  updateUserPasswordHash(userId: string, passwordHash: string): MaybePromise<void>;
  listTenantUsers(tenantId: string, role?: 'COMPANY_ADMIN' | 'EMPLOYEE'): MaybePromise<UserRecord[]>;
  listPlanYears(tenantId: string): MaybePromise<PlanYearRecord[]>;
  listPlans(tenantId: string, planYearId?: string): MaybePromise<PlanRecord[]>;
  listEmployeeDependents(tenantId: string, employeeUserId: string): MaybePromise<DependentRecord[]>;
  listEmployeeEnrollments(tenantId: string, employeeUserId: string): MaybePromise<EnrollmentRecord[]>;
  createSecurityEvent(input: CreateSecurityEventInput): MaybePromise<SecurityEventRecord>;
  listSecurityEvents(input?: { tenantId?: string; limit?: number }): MaybePromise<SecurityEventRecord[]>;
}
