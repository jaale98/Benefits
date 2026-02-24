import type { Role } from './auth.js';

export type InviteTargetRole = 'COMPANY_ADMIN' | 'EMPLOYEE';
export type BenefitClass = 'FULL_TIME_ELIGIBLE' | 'INELIGIBLE';
export type EmploymentStatus = 'ACTIVE' | 'TERMED';
export type PlanType = 'MEDICAL' | 'DENTAL' | 'VISION';
export type CoverageTier = 'EMPLOYEE_ONLY' | 'EMPLOYEE_SPOUSE' | 'EMPLOYEE_CHILDREN' | 'FAMILY';
export type EnrollmentStatus = 'DRAFT' | 'SUBMITTED';
export type DependentRelationship = 'SPOUSE' | 'CHILD';

export interface TenantRecord {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  replacedBySessionId: string | null;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface SecurityEventRecord {
  id: string;
  userId: string | null;
  tenantId: string | null;
  eventType: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface InviteCodeRecord {
  id: string;
  tenantId: string;
  code: string;
  targetRole: InviteTargetRole;
  createdByUserId: string;
  expiresAt: string | null;
  maxUses: number | null;
  usesCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface EmployeeProfileRecord {
  userId: string;
  tenantId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dob: string;
  hireDate: string;
  salaryAmount: number;
  benefitClass: BenefitClass;
  employmentStatus: EmploymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlanYearRecord {
  id: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRecord {
  id: string;
  tenantId: string;
  planYearId: string;
  type: PlanType;
  carrier: string;
  planName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanPremiumRecord {
  id: string;
  planId: string;
  coverageTier: CoverageTier;
  employeeMonthlyCost: number;
  employerMonthlyCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface DependentRecord {
  id: string;
  tenantId: string;
  employeeUserId: string;
  relationship: DependentRelationship;
  firstName: string;
  lastName: string;
  dob: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentElectionSnapshot {
  planType: PlanType;
  planId: string;
  coverageTier: CoverageTier;
  employeeMonthlyCost: number;
  employerMonthlyCost: number;
}

export interface EnrollmentRecord {
  id: string;
  tenantId: string;
  employeeUserId: string;
  planYearId: string;
  status: EnrollmentStatus;
  effectiveDate: string | null;
  submittedAt: string | null;
  confirmationCode: string | null;
  elections: EnrollmentElectionSnapshot[];
  dependentIds: string[];
  createdAt: string;
  updatedAt: string;
}
