export const ROLES = ['FULL_ADMIN', 'COMPANY_ADMIN', 'EMPLOYEE'] as const;

export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
  sessionId?: string;
}
