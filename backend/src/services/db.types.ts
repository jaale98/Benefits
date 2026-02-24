import type { AuthUser } from '../types/auth.js';
import type {
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
}
