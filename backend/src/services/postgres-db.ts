import { randomBytes } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { env } from '../config/env.js';
import type { AuthUser, Role } from '../types/auth.js';
import type {
  AuthSessionRecord,
  DependentRecord,
  EmployeeProfileRecord,
  EnrollmentElectionSnapshot,
  EnrollmentRecord,
  InviteCodeRecord,
  PasswordResetTokenRecord,
  PlanPremiumRecord,
  PlanRecord,
  PlanYearRecord,
  SecurityEventRecord,
  TenantRecord,
  UserRecord,
} from '../types/domain.js';
import { HttpError } from '../types/http-error.js';
import { assertUniqueDependentIds, validateEnrollmentCoverageSelection } from './enrollment-coverage-validator.js';
import { hashPassword } from './password-service.js';
import { assertSchemaUpToDate, runMigrations } from './migration-runner.js';
import type {
  AddDependentInput,
  CreateAuthSessionInput,
  CreateEnrollmentDraftInput,
  CreateInviteCodeInput,
  CreatePasswordResetTokenInput,
  CreatePlanInput,
  CreatePlanYearInput,
  CreateSecurityEventInput,
  DbAdapter,
  EmployeeProfileInput,
  RevokeAuthSessionInput,
  ReplacePlanPremiumsInput,
  SignupWithInviteInput,
  SubmitEnrollmentInput,
} from './db.types.js';

const COMPANY_ID_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

type Queryable = Pool | PoolClient;

type UserRow = {
  id: string;
  tenant_id: string | null;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export class PostgresDb implements DbAdapter {
  private readonly pool: Pool;
  private initialized = false;

  constructor() {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DB_PROVIDER=postgres');
    }

    this.pool = new Pool({ connectionString: env.DATABASE_URL });
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.pool.query('SELECT 1');
    if (env.DB_AUTO_MIGRATE) {
      await runMigrations(this.pool);
    }
    if (env.DB_REQUIRE_SCHEMA_CHECK) {
      await assertSchemaUpToDate(this.pool);
    }
    await this.seedFullAdmin();
    this.initialized = true;
  }

  async listTenants(): Promise<TenantRecord[]> {
    const result = await this.pool.query(
      `SELECT id, company_id, name, created_at, updated_at
       FROM tenants
       ORDER BY created_at DESC`,
    );

    return result.rows.map(mapTenant);
  }

  async createTenant(input: { name: string; companyId?: string }): Promise<TenantRecord> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new HttpError(400, 'Tenant name is required');
    }

    const companyId = input.companyId?.trim() || (await this.generateCompanyId(trimmedName));
    if (!COMPANY_ID_REGEX.test(companyId)) {
      throw new HttpError(400, 'companyId must match ^[a-zA-Z0-9_-]{3,32}$');
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO tenants (company_id, name)
         VALUES ($1, $2)
         RETURNING id, company_id, name, created_at, updated_at`,
        [companyId, trimmedName],
      );

      return mapTenant(result.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email.toLowerCase()],
    );

    if (!result.rowCount) {
      return undefined;
    }

    return mapUser(result.rows[0]);
  }

  async findUserById(userId: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );

    if (!result.rowCount) {
      return undefined;
    }

    return mapUser(result.rows[0]);
  }

  async listTenantUsers(tenantId: string, role?: 'COMPANY_ADMIN' | 'EMPLOYEE'): Promise<UserRecord[]> {
    const values: unknown[] = [tenantId];
    let whereClause = 'tenant_id = $1';

    if (role) {
      values.push(role);
      whereClause += ` AND role = $${values.length}`;
    }

    const result = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE ${whereClause}
       ORDER BY created_at DESC`,
      values,
    );

    return result.rows.map(mapUser);
  }

  async listEmployeeProfiles(tenantId: string): Promise<EmployeeProfileRecord[]> {
    const result = await this.pool.query(
      `SELECT
         user_id, tenant_id, employee_id, first_name, last_name,
         dob, hire_date, salary_amount, benefit_class, employment_status,
         created_at, updated_at
       FROM employee_profiles
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );

    return result.rows.map(mapEmployeeProfile);
  }

  async listPlanYears(tenantId: string): Promise<PlanYearRecord[]> {
    const result = await this.pool.query(
      `SELECT
         id, tenant_id, name, start_date, end_date,
         created_by_user_id, created_at, updated_at
       FROM plan_years
       WHERE tenant_id = $1
       ORDER BY start_date ASC`,
      [tenantId],
    );

    return result.rows.map(mapPlanYear);
  }

  async listPlans(tenantId: string, planYearId?: string): Promise<PlanRecord[]> {
    const values: unknown[] = [tenantId];
    let whereClause = 'tenant_id = $1';

    if (planYearId) {
      values.push(planYearId);
      whereClause += ` AND plan_year_id = $${values.length}`;
    }

    const result = await this.pool.query(
      `SELECT
         id, tenant_id, plan_year_id, type, carrier, plan_name,
         is_active, created_at, updated_at
       FROM plans
       WHERE ${whereClause}
       ORDER BY created_at DESC`,
      values,
    );

    return result.rows.map(mapPlan);
  }

  async listEmployeeDependents(tenantId: string, employeeUserId: string): Promise<DependentRecord[]> {
    const result = await this.pool.query(
      `SELECT
         id, tenant_id, employee_user_id, relationship,
         first_name, last_name, dob, created_at, updated_at
       FROM dependents
       WHERE tenant_id = $1 AND employee_user_id = $2
       ORDER BY created_at DESC`,
      [tenantId, employeeUserId],
    );

    return result.rows.map(mapDependent);
  }

  async listEmployeeEnrollments(tenantId: string, employeeUserId: string): Promise<EnrollmentRecord[]> {
    const idsResult = await this.pool.query<{ id: string }>(
      `SELECT id\n       FROM enrollments\n       WHERE tenant_id = $1 AND employee_user_id = $2\n       ORDER BY created_at DESC`,
      [tenantId, employeeUserId],
    );

    const enrollments: EnrollmentRecord[] = [];
    for (const row of idsResult.rows) {
      enrollments.push(await this.getEnrollment(this.pool, row.id));
    }
    return enrollments;
  }

  async createSecurityEvent(input: CreateSecurityEventInput): Promise<SecurityEventRecord> {
    const result = await this.pool.query(
      `INSERT INTO security_events\n        (user_id, tenant_id, event_type, severity, ip_address, user_agent, metadata)\n       VALUES ($1, $2, $3, $4, $5, $6, $7)\n       RETURNING\n         id, user_id, tenant_id, event_type, severity,\n         ip_address, user_agent, metadata, created_at`,
      [
        input.userId ?? null,
        input.tenantId ?? null,
        input.eventType,
        input.severity ?? 'INFO',
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );

    return mapSecurityEvent(result.rows[0]);
  }

  async listSecurityEvents(input?: {
    tenantId?: string;
    limit?: number;
    offset?: number;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    eventType?: string;
    q?: string;
  }): Promise<SecurityEventRecord[]> {
    const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
    const offset = Math.max(input?.offset ?? 0, 0);
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (input?.tenantId) {
      values.push(input.tenantId);
      conditions.push(`tenant_id = $${values.length}`);
    }

    if (input?.severity) {
      values.push(input.severity);
      conditions.push(`severity = $${values.length}`);
    }

    if (input?.eventType?.trim()) {
      values.push(`%${input.eventType.trim()}%`);
      conditions.push(`event_type ILIKE $${values.length}`);
    }

    if (input?.q?.trim()) {
      values.push(`%${input.q.trim()}%`);
      const qParam = `$${values.length}`;
      conditions.push(
        `(event_type ILIKE ${qParam} OR severity ILIKE ${qParam} OR COALESCE(user_id::text, '') ILIKE ${qParam} OR COALESCE(tenant_id::text, '') ILIKE ${qParam} OR COALESCE(metadata::text, '') ILIKE ${qParam})`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await this.pool.query(
      `SELECT
         id, user_id, tenant_id, event_type, severity,
         ip_address, user_agent, metadata, created_at
       FROM security_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitParam}
       OFFSET ${offsetParam}`,
      values,
    );

    return result.rows.map(mapSecurityEvent);
  }

  toAuthUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  async createInviteCode(input: CreateInviteCodeInput): Promise<InviteCodeRecord> {
    const creator = await this.findUserById(input.creatorUserId);
    if (!creator) {
      throw new HttpError(404, 'Invite code creator not found');
    }

    const tenantExists = await this.pool.query(`SELECT 1 FROM tenants WHERE id = $1`, [input.tenantId]);
    if (!tenantExists.rowCount) {
      throw new HttpError(404, 'Tenant not found');
    }

    if (input.targetRole === 'COMPANY_ADMIN' && creator.role !== 'FULL_ADMIN') {
      throw new HttpError(403, 'Only FULL_ADMIN can create COMPANY_ADMIN invite codes');
    }

    if (input.targetRole === 'EMPLOYEE') {
      if (creator.role !== 'COMPANY_ADMIN') {
        throw new HttpError(403, 'Only COMPANY_ADMIN can create EMPLOYEE invite codes');
      }
      if (creator.tenantId !== input.tenantId) {
        throw new HttpError(403, 'COMPANY_ADMIN can only create employee invite codes for their own tenant');
      }
    }

    const code = await this.generateInviteCode();

    try {
      const result = await this.pool.query(
        `INSERT INTO invite_codes (tenant_id, code, target_role, created_by_user_id, expires_at, max_uses)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id, tenant_id, code, target_role, created_by_user_id,
           expires_at, max_uses, uses_count, is_active, created_at`,
        [input.tenantId, code, input.targetRole, input.creatorUserId, input.expiresAt ?? null, input.maxUses ?? null],
      );

      return mapInviteCode(result.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async signupWithInvite(input: SignupWithInviteInput): Promise<UserRecord> {
    return this.withTransaction(async (client) => {
      const inviteResult = await client.query(
        `SELECT
           id, tenant_id, code, target_role, created_by_user_id,
           expires_at, max_uses, uses_count, is_active, created_at
         FROM invite_codes
         WHERE code = $1
         FOR UPDATE`,
        [input.code],
      );

      if (!inviteResult.rowCount) {
        throw new HttpError(404, 'Invite code not found');
      }

      const invite = mapInviteCode(inviteResult.rows[0]);

      if (!invite.isActive) {
        throw new HttpError(400, 'Invite code is inactive');
      }

      if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
        throw new HttpError(400, 'Invite code is expired');
      }

      if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
        throw new HttpError(400, 'Invite code has reached max uses');
      }

      const existingUser = await client.query(`SELECT 1 FROM users WHERE email = $1`, [input.email.toLowerCase()]);
      if (existingUser.rowCount) {
        throw new HttpError(409, 'Email already exists');
      }

      const createdUser = await client.query<UserRow>(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, tenant_id, email, password_hash, role, is_active, created_at, updated_at`,
        [invite.tenantId, input.email.toLowerCase(), input.passwordHash, invite.targetRole],
      );

      const nextUsesCount = invite.usesCount + 1;
      const nextIsActive = invite.maxUses === null ? true : nextUsesCount < invite.maxUses;

      await client.query(
        `UPDATE invite_codes
         SET uses_count = $2, is_active = $3
         WHERE id = $1`,
        [invite.id, nextUsesCount, nextIsActive],
      );

      return mapUser(createdUser.rows[0]);
    });
  }

  async upsertEmployeeProfile(
    tenantId: string,
    employeeUserId: string,
    payload: EmployeeProfileInput,
  ): Promise<EmployeeProfileRecord> {
    const employeeResult = await this.pool.query(
      `SELECT role, tenant_id
       FROM users
       WHERE id = $1`,
      [employeeUserId],
    );

    if (!employeeResult.rowCount) {
      throw new HttpError(404, 'Employee user not found in tenant');
    }

    const employee = employeeResult.rows[0] as { role: Role; tenant_id: string | null };
    if (employee.role !== 'EMPLOYEE' || employee.tenant_id !== tenantId) {
      throw new HttpError(404, 'Employee user not found in tenant');
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO employee_profiles
          (
            user_id, tenant_id, employee_id, first_name, last_name,
            dob, hire_date, salary_amount, benefit_class, employment_status
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id)
         DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           dob = EXCLUDED.dob,
           hire_date = EXCLUDED.hire_date,
           salary_amount = EXCLUDED.salary_amount,
           benefit_class = EXCLUDED.benefit_class,
           employment_status = EXCLUDED.employment_status,
           updated_at = NOW()
         RETURNING
           user_id, tenant_id, employee_id, first_name, last_name,
           dob, hire_date, salary_amount, benefit_class, employment_status,
           created_at, updated_at`,
        [
          employeeUserId,
          tenantId,
          payload.employeeId,
          payload.firstName,
          payload.lastName,
          payload.dob,
          payload.hireDate,
          payload.salaryAmount,
          payload.benefitClass,
          payload.employmentStatus,
        ],
      );

      return mapEmployeeProfile(result.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async createPlanYear(input: CreatePlanYearInput): Promise<PlanYearRecord> {
    try {
      const result = await this.pool.query(
        `INSERT INTO plan_years (tenant_id, name, start_date, end_date, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
           id, tenant_id, name, start_date, end_date,
           created_by_user_id, created_at, updated_at`,
        [input.tenantId, input.name, input.startDate, input.endDate, input.actorUserId],
      );

      return mapPlanYear(result.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async createPlan(input: CreatePlanInput): Promise<PlanRecord> {
    try {
      const result = await this.pool.query(
        `INSERT INTO plans (tenant_id, plan_year_id, type, carrier, plan_name, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING
           id, tenant_id, plan_year_id, type, carrier, plan_name,
           is_active, created_at, updated_at`,
        [input.tenantId, input.planYearId, input.type, input.carrier, input.planName],
      );

      return mapPlan(result.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async replacePlanPremiums(input: ReplacePlanPremiumsInput): Promise<PlanPremiumRecord[]> {
    return this.withTransaction(async (client) => {
      const planResult = await client.query(`SELECT id FROM plans WHERE id = $1 AND tenant_id = $2`, [
        input.planId,
        input.tenantId,
      ]);
      if (!planResult.rowCount) {
        throw new HttpError(404, 'Plan not found for tenant');
      }

      const seenTiers = new Set<string>();
      for (const tier of input.tiers) {
        if (seenTiers.has(tier.coverageTier)) {
          throw new HttpError(400, `Duplicate coverage tier: ${tier.coverageTier}`);
        }
        seenTiers.add(tier.coverageTier);
      }

      await client.query(`DELETE FROM plan_premiums WHERE plan_id = $1`, [input.planId]);

      const created: PlanPremiumRecord[] = [];
      for (const tier of input.tiers) {
        const result = await client.query(
          `INSERT INTO plan_premiums
            (plan_id, coverage_tier, employee_monthly_cost, employer_monthly_cost)
           VALUES ($1, $2, $3, $4)
           RETURNING
             id, plan_id, coverage_tier,
             employee_monthly_cost, employer_monthly_cost,
             created_at, updated_at`,
          [input.planId, tier.coverageTier, tier.employeeMonthlyCost, tier.employerMonthlyCost],
        );
        created.push(mapPlanPremium(result.rows[0]));
      }

      return created;
    });
  }

  async addDependent(input: AddDependentInput): Promise<DependentRecord> {
    const employeeResult = await this.pool.query(
      `SELECT id
       FROM users
       WHERE id = $1 AND tenant_id = $2 AND role = 'EMPLOYEE'`,
      [input.employeeUserId, input.tenantId],
    );
    if (!employeeResult.rowCount) {
      throw new HttpError(404, 'Employee not found in tenant');
    }

    const result = await this.pool.query(
      `INSERT INTO dependents
        (tenant_id, employee_user_id, relationship, first_name, last_name, dob)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id, tenant_id, employee_user_id, relationship,
         first_name, last_name, dob, created_at, updated_at`,
      [input.tenantId, input.employeeUserId, input.relationship, input.firstName, input.lastName, input.dob],
    );

    return mapDependent(result.rows[0]);
  }

  async createEnrollmentDraft(input: CreateEnrollmentDraftInput): Promise<EnrollmentRecord> {
    return this.withTransaction(async (client) => {
      await this.assertEmployeeInTenant(client, input.employeeUserId, input.tenantId);
      assertUniqueDependentIds(input.dependentIds);

      const planYearResult = await client.query(`SELECT id FROM plan_years WHERE id = $1 AND tenant_id = $2`, [
        input.planYearId,
        input.tenantId,
      ]);
      if (!planYearResult.rowCount) {
        throw new HttpError(404, 'Plan year not found for tenant');
      }

      const seenPlanTypes = new Set<string>();
      for (const election of input.elections) {
        if (seenPlanTypes.has(election.planType)) {
          throw new HttpError(400, `Duplicate election plan type: ${election.planType}`);
        }
        seenPlanTypes.add(election.planType);
      }

      const selectedDependents =
        input.dependentIds.length === 0
          ? []
          : (
              await client.query<{ id: string; relationship: DependentRecord['relationship'] }>(
                `SELECT id, relationship
                 FROM dependents
                 WHERE tenant_id = $1
                   AND employee_user_id = $2
                   AND id = ANY($3::uuid[])`,
                [input.tenantId, input.employeeUserId, input.dependentIds],
              )
            ).rows;
      if (selectedDependents.length !== input.dependentIds.length) {
        throw new HttpError(422, 'One or more dependentIds do not belong to employee');
      }

      validateEnrollmentCoverageSelection({
        electionCoverageTiers: input.elections.map((election) => election.coverageTier),
        dependents: selectedDependents,
      });

      const enrollmentResult = await client.query(
        `INSERT INTO enrollments
          (tenant_id, employee_user_id, plan_year_id, status, effective_date)
         VALUES ($1, $2, $3, 'DRAFT', NULL)
         RETURNING id`,
        [input.tenantId, input.employeeUserId, input.planYearId],
      );
      const enrollmentId = enrollmentResult.rows[0].id as string;

      for (const election of input.elections) {
        const planResult = await client.query(
          `SELECT id, type
           FROM plans
           WHERE id = $1 AND tenant_id = $2 AND plan_year_id = $3`,
          [election.planId, input.tenantId, input.planYearId],
        );

        if (!planResult.rowCount) {
          throw new HttpError(404, `Plan ${election.planId} not found in tenant plan year`);
        }

        const foundPlanType = planResult.rows[0].type as string;
        if (foundPlanType !== election.planType) {
          throw new HttpError(400, `Election planType ${election.planType} does not match plan type ${foundPlanType}`);
        }

        const premiumResult = await client.query(
          `SELECT employee_monthly_cost, employer_monthly_cost
           FROM plan_premiums
           WHERE plan_id = $1 AND coverage_tier = $2`,
          [election.planId, election.coverageTier],
        );

        if (!premiumResult.rowCount) {
          throw new HttpError(422, `No premium configured for plan ${election.planId} and tier ${election.coverageTier}`);
        }

        await client.query(
          `INSERT INTO enrollment_elections
            (
              enrollment_id, plan_type, plan_id, coverage_tier,
              employee_monthly_cost, employer_monthly_cost
            )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            enrollmentId,
            election.planType,
            election.planId,
            election.coverageTier,
            premiumResult.rows[0].employee_monthly_cost,
            premiumResult.rows[0].employer_monthly_cost,
          ],
        );
      }

      for (const dependentId of input.dependentIds) {
        await client.query(
          `INSERT INTO enrollment_dependents (enrollment_id, dependent_id)
           VALUES ($1, $2)`,
          [enrollmentId, dependentId],
        );
      }

      return this.getEnrollment(client, enrollmentId);
    });
  }

  async submitEnrollment(input: SubmitEnrollmentInput): Promise<EnrollmentRecord> {
    return this.withTransaction(async (client) => {
      await this.assertEmployeeInTenant(client, input.employeeUserId, input.tenantId);

      const enrollmentResult = await client.query(
        `SELECT id, employee_user_id, plan_year_id, status
         FROM enrollments
         WHERE id = $1 AND tenant_id = $2 AND employee_user_id = $3
         FOR UPDATE`,
        [input.enrollmentId, input.tenantId, input.employeeUserId],
      );

      if (!enrollmentResult.rowCount) {
        throw new HttpError(404, 'Enrollment not found for employee in tenant');
      }

      const enrollment = enrollmentResult.rows[0] as {
        id: string;
        employee_user_id: string;
        plan_year_id: string;
        status: 'DRAFT' | 'SUBMITTED';
      };

      if (enrollment.status === 'SUBMITTED') {
        throw new HttpError(409, 'Enrollment already submitted');
      }

      const existingSubmitted = await client.query(
        `SELECT id
         FROM enrollments
         WHERE employee_user_id = $1
           AND plan_year_id = $2
           AND status = 'SUBMITTED'
           AND id <> $3
         LIMIT 1
         FOR UPDATE`,
        [enrollment.employee_user_id, enrollment.plan_year_id, enrollment.id],
      );

      if (existingSubmitted.rowCount) {
        throw new HttpError(409, 'Employee already has a submitted enrollment for this plan year');
      }

      const profileResult = await client.query(
        `SELECT hire_date, benefit_class, employment_status
         FROM employee_profiles
         WHERE user_id = $1`,
        [input.employeeUserId],
      );

      if (!profileResult.rowCount) {
        throw new HttpError(422, 'Employee profile is required before enrollment submit');
      }

      const profile = profileResult.rows[0] as {
        hire_date: string;
        benefit_class: EmployeeProfileRecord['benefitClass'];
        employment_status: EmployeeProfileRecord['employmentStatus'];
      };

      if (profile.benefit_class !== 'FULL_TIME_ELIGIBLE' || profile.employment_status !== 'ACTIVE') {
        throw new HttpError(422, 'Employee is not benefits-eligible');
      }

      const effectiveDate = calculateEffectiveDate(profile.hire_date);

      const dependentRows = await client.query(
        `SELECT d.id, d.dob, d.relationship
         FROM enrollment_dependents ed
         JOIN dependents d ON d.id = ed.dependent_id
         WHERE ed.enrollment_id = $1`,
        [enrollment.id],
      );

      const coverageTierRows = await client.query<{ coverage_tier: EnrollmentElectionSnapshot['coverageTier'] }>(
        `SELECT coverage_tier
         FROM enrollment_elections
         WHERE enrollment_id = $1`,
        [enrollment.id],
      );

      validateEnrollmentCoverageSelection({
        electionCoverageTiers: coverageTierRows.rows.map((row) => row.coverage_tier),
        dependents: (dependentRows.rows as Array<{ id: string; relationship: DependentRecord['relationship'] }>).map((row) => ({
          id: row.id,
          relationship: row.relationship,
        })),
      });

      for (const child of dependentRows.rows as Array<{ id: string; dob: string; relationship: DependentRecord['relationship'] }>) {
        if (child.relationship !== 'CHILD') {
          continue;
        }
        const childAge = calculateAgeOnDate(parseDate(child.dob), parseDate(effectiveDate));
        if (childAge >= 26) {
          throw new HttpError(422, `Dependent ${child.id} is age ${childAge}; child dependents must be under 26`);
        }
      }

      const electionPremiums = await client.query(
        `SELECT
           ee.id,
           pp.employee_monthly_cost,
           pp.employer_monthly_cost
         FROM enrollment_elections ee
         LEFT JOIN plan_premiums pp
           ON pp.plan_id = ee.plan_id
          AND pp.coverage_tier = ee.coverage_tier
         WHERE ee.enrollment_id = $1`,
        [enrollment.id],
      );

      for (const row of electionPremiums.rows as Array<{
        id: string;
        employee_monthly_cost: number | null;
        employer_monthly_cost: number | null;
      }>) {
        if (row.employee_monthly_cost === null || row.employer_monthly_cost === null) {
          throw new HttpError(422, `Cannot submit enrollment; missing premium for election ${row.id}`);
        }

        await client.query(
          `UPDATE enrollment_elections
           SET employee_monthly_cost = $2, employer_monthly_cost = $3
           WHERE id = $1`,
          [row.id, row.employee_monthly_cost, row.employer_monthly_cost],
        );
      }

      await client.query(
        `UPDATE enrollments
         SET status = 'SUBMITTED',
             effective_date = $2,
             submitted_at = NOW(),
             confirmation_code = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [enrollment.id, effectiveDate, this.generateConfirmationCode()],
      );

      return this.getEnrollment(client, enrollment.id);
    });
  }

  async createAuthSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const result = await this.pool.query(
      `INSERT INTO auth_sessions\n        (user_id, refresh_token_hash, user_agent, ip_address, expires_at)\n       VALUES ($1, $2, $3, $4, $5)\n       RETURNING\n         id, user_id, refresh_token_hash, user_agent, ip_address,\n         created_at, expires_at, revoked_at, revoked_reason, replaced_by_session_id`,
      [input.userId, input.refreshTokenHash, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt],
    );

    return mapAuthSession(result.rows[0]);
  }

  async findAuthSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionRecord | undefined> {
    const result = await this.pool.query(
      `SELECT\n         id, user_id, refresh_token_hash, user_agent, ip_address,\n         created_at, expires_at, revoked_at, revoked_reason, replaced_by_session_id\n       FROM auth_sessions\n       WHERE refresh_token_hash = $1\n       LIMIT 1`,
      [refreshTokenHash],
    );

    if (!result.rowCount) {
      return undefined;
    }

    return mapAuthSession(result.rows[0]);
  }

  async revokeAuthSession(input: RevokeAuthSessionInput): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions\n       SET revoked_at = COALESCE(revoked_at, NOW()),\n           revoked_reason = COALESCE(revoked_reason, $2),\n           replaced_by_session_id = COALESCE(replaced_by_session_id, $3)\n       WHERE id = $1`,
      [input.sessionId, input.reason, input.replacedBySessionId ?? null],
    );
  }

  async revokeAllAuthSessionsForUser(userId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions\n       SET revoked_at = COALESCE(revoked_at, NOW()),\n           revoked_reason = COALESCE(revoked_reason, $2)\n       WHERE user_id = $1`,
      [userId, reason],
    );
  }

  async isAuthSessionActive(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ active: boolean }>(
      `SELECT EXISTS (\n         SELECT 1\n         FROM auth_sessions\n         WHERE id = $1\n           AND revoked_at IS NULL\n           AND expires_at > NOW()\n       ) AS active`,
      [sessionId],
    );

    return Boolean(result.rows[0]?.active);
  }

  async createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const result = await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)\n       VALUES ($1, $2, $3)\n       RETURNING id, user_id, token_hash, created_at, expires_at, used_at`,
      [input.userId, input.tokenHash, input.expiresAt],
    );

    return mapPasswordResetToken(result.rows[0]);
  }

  async findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined> {
    const result = await this.pool.query(
      `SELECT id, user_id, token_hash, created_at, expires_at, used_at\n       FROM password_reset_tokens\n       WHERE token_hash = $1\n       LIMIT 1`,
      [tokenHash],
    );

    if (!result.rowCount) {
      return undefined;
    }

    return mapPasswordResetToken(result.rows[0]);
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await this.pool.query(
      `UPDATE password_reset_tokens\n       SET used_at = COALESCE(used_at, NOW())\n       WHERE id = $1`,
      [tokenId],
    );
  }

  async updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE users\n       SET password_hash = $2,\n           updated_at = NOW()\n       WHERE id = $1`,
      [userId, passwordHash],
    );
  }

  private async seedFullAdmin(): Promise<void> {
    const existing = await this.pool.query(`SELECT id, role FROM users WHERE email = $1 LIMIT 1`, [
      env.SEED_FULL_ADMIN_EMAIL.toLowerCase(),
    ]);

    if (!existing.rowCount) {
      const passwordHash = await hashPassword(env.SEED_FULL_ADMIN_PASSWORD);
      await this.pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active)
         VALUES (NULL, $1, $2, 'FULL_ADMIN', TRUE)`,
        [env.SEED_FULL_ADMIN_EMAIL.toLowerCase(), passwordHash],
      );
      return;
    }

    const role = existing.rows[0].role as Role;
    if (role !== 'FULL_ADMIN') {
      throw new Error(`Seed admin email ${env.SEED_FULL_ADMIN_EMAIL} already exists with non-FULL_ADMIN role`);
    }
  }

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  private async assertEmployeeInTenant(client: Queryable, employeeUserId: string, tenantId: string): Promise<void> {
    const result = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND tenant_id = $2
         AND role = 'EMPLOYEE'`,
      [employeeUserId, tenantId],
    );

    if (!result.rowCount) {
      throw new HttpError(404, 'Employee not found in tenant');
    }
  }

  private async getEnrollment(client: Queryable, enrollmentId: string): Promise<EnrollmentRecord> {
    const enrollmentResult = await client.query(
      `SELECT
         id, tenant_id, employee_user_id, plan_year_id,
         status, effective_date, submitted_at, confirmation_code,
         created_at, updated_at
       FROM enrollments
       WHERE id = $1`,
      [enrollmentId],
    );

    if (!enrollmentResult.rowCount) {
      throw new HttpError(404, 'Enrollment not found');
    }

    const electionsResult = await client.query(
      `SELECT
         plan_type, plan_id, coverage_tier,
         employee_monthly_cost, employer_monthly_cost
       FROM enrollment_elections
       WHERE enrollment_id = $1`,
      [enrollmentId],
    );

    const dependentsResult = await client.query(
      `SELECT dependent_id
       FROM enrollment_dependents
       WHERE enrollment_id = $1`,
      [enrollmentId],
    );

    return mapEnrollment(enrollmentResult.rows[0], electionsResult.rows, dependentsResult.rows);
  }

  private async generateCompanyId(companyName: string): Promise<string> {
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);

    const base = slug.length >= 3 ? slug : 'company';
    let candidate = base;

    while (true) {
      const existing = await this.pool.query(`SELECT 1 FROM tenants WHERE company_id = $1 LIMIT 1`, [candidate]);
      if (!existing.rowCount) {
        return candidate;
      }
      candidate = `${base}-${randomBytes(2).toString('hex')}`;
    }
  }

  private async generateInviteCode(): Promise<string> {
    while (true) {
      const candidate = `INV-${randomBytes(6).toString('base64url').toUpperCase()}`;
      const existing = await this.pool.query(`SELECT 1 FROM invite_codes WHERE code = $1 LIMIT 1`, [candidate]);
      if (!existing.rowCount) {
        return candidate;
      }
    }
  }

  private generateConfirmationCode(): string {
    return `ENR-${randomBytes(5).toString('hex').toUpperCase()}`;
  }
}

function mapTenant(row: Record<string, unknown>): TenantRecord {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapInviteCode(row: Record<string, unknown>): InviteCodeRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    code: row.code as string,
    targetRole: row.target_role as InviteCodeRecord['targetRole'],
    createdByUserId: row.created_by_user_id as string,
    expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
    usesCount: Number(row.uses_count),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
  };
}

function mapEmployeeProfile(row: Record<string, unknown>): EmployeeProfileRecord {
  return {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    employeeId: row.employee_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    dob: toDateOnlyString(row.dob),
    hireDate: toDateOnlyString(row.hire_date),
    salaryAmount: Number(row.salary_amount),
    benefitClass: row.benefit_class as EmployeeProfileRecord['benefitClass'],
    employmentStatus: row.employment_status as EmployeeProfileRecord['employmentStatus'],
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapPlanYear(row: Record<string, unknown>): PlanYearRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    startDate: toDateOnlyString(row.start_date),
    endDate: toDateOnlyString(row.end_date),
    createdByUserId: row.created_by_user_id as string,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapPlan(row: Record<string, unknown>): PlanRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    planYearId: row.plan_year_id as string,
    type: row.type as PlanRecord['type'],
    carrier: row.carrier as string,
    planName: row.plan_name as string,
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapPlanPremium(row: Record<string, unknown>): PlanPremiumRecord {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    coverageTier: row.coverage_tier as PlanPremiumRecord['coverageTier'],
    employeeMonthlyCost: Number(row.employee_monthly_cost),
    employerMonthlyCost: Number(row.employer_monthly_cost),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapDependent(row: Record<string, unknown>): DependentRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    employeeUserId: row.employee_user_id as string,
    relationship: row.relationship as DependentRecord['relationship'],
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    dob: toDateOnlyString(row.dob),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAuthSession(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    refreshTokenHash: row.refresh_token_hash as string,
    userAgent: (row.user_agent as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
    revokedReason: (row.revoked_reason as string | null) ?? null,
    replacedBySessionId: (row.replaced_by_session_id as string | null) ?? null,
  };
}

function mapPasswordResetToken(row: Record<string, unknown>): PasswordResetTokenRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    usedAt: row.used_at ? toIsoString(row.used_at) : null,
  };
}

function mapSecurityEvent(row: Record<string, unknown>): SecurityEventRecord {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    tenantId: (row.tenant_id as string | null) ?? null,
    eventType: row.event_type as string,
    severity: row.severity as SecurityEventRecord['severity'],
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: (row.user_agent as string | null) ?? null,
    metadata: row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null,
    createdAt: toIsoString(row.created_at),
  };
}

function mapEnrollment(
  row: Record<string, unknown>,
  electionRows: Array<Record<string, unknown>>,
  dependentRows: Array<Record<string, unknown>>,
): EnrollmentRecord {
  const elections: EnrollmentElectionSnapshot[] = electionRows.map((election) => ({
    planType: election.plan_type as EnrollmentElectionSnapshot['planType'],
    planId: election.plan_id as string,
    coverageTier: election.coverage_tier as EnrollmentElectionSnapshot['coverageTier'],
    employeeMonthlyCost: Number(election.employee_monthly_cost),
    employerMonthlyCost: Number(election.employer_monthly_cost),
  }));

  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    employeeUserId: row.employee_user_id as string,
    planYearId: row.plan_year_id as string,
    status: row.status as EnrollmentRecord['status'],
    effectiveDate: row.effective_date ? toDateOnlyString(row.effective_date) : null,
    submittedAt: row.submitted_at ? toIsoString(row.submitted_at) : null,
    confirmationCode: (row.confirmation_code as string | null) ?? null,
    elections,
    dependentIds: dependentRows.map((dep) => dep.dependent_id as string),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function toDateOnlyString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value);
  if (raw.length >= 10 && raw[4] === '-' && raw[7] === '-') {
    return raw.slice(0, 10);
  }

  return new Date(raw).toISOString().slice(0, 10);
}

function parseDate(input: string | Date): Date {
  const normalized =
    input instanceof Date
      ? new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
      : new Date(`${toDateOnlyString(input)}T00:00:00.000Z`);

  const date = normalized;
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Invalid date value: ${String(input)}`);
  }
  return date;
}

function calculateEffectiveDate(hireDateInput: string | Date): string {
  const today = new Date();
  const hireDate = parseDate(hireDateInput);

  if (hireDate.getTime() > Date.now()) {
    throw new HttpError(422, 'hireDate cannot be in the future');
  }

  const hireSameMonth =
    hireDate.getUTCFullYear() === today.getUTCFullYear() && hireDate.getUTCMonth() === today.getUTCMonth();

  if (hireSameMonth) {
    const firstOfNextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    return firstOfNextMonth.toISOString().slice(0, 10);
  }

  return today.toISOString().slice(0, 10);
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

function mapDatabaseError(error: unknown): Error {
  if (error instanceof HttpError) {
    return error;
  }

  if (!isPgError(error)) {
    return new HttpError(500, 'Unexpected database error');
  }

  if (error.code === '23505') {
    if ((error.constraint ?? '').includes('company_id')) {
      return new HttpError(409, 'companyId already exists');
    }

    if ((error.constraint ?? '').includes('users_email_key')) {
      return new HttpError(409, 'Email already exists');
    }

    if ((error.constraint ?? '').includes('employee_id_unique_per_tenant')) {
      return new HttpError(409, 'employeeId already exists in tenant');
    }

    return new HttpError(409, 'Unique constraint violation');
  }

  if (error.code === '23P01') {
    return new HttpError(409, 'Plan year overlaps with an existing plan year for tenant');
  }

  if (error.code === '23503') {
    return new HttpError(404, 'Related record not found');
  }

  if (error.code === '23514') {
    return new HttpError(400, 'Validation constraint failed');
  }

  if (typeof error.message === 'string') {
    if (error.message.includes('Only FULL_ADMIN can create COMPANY_ADMIN invite codes')) {
      return new HttpError(403, 'Only FULL_ADMIN can create COMPANY_ADMIN invite codes');
    }
    if (error.message.includes('Only COMPANY_ADMIN can create EMPLOYEE invite codes')) {
      return new HttpError(403, 'Only COMPANY_ADMIN can create EMPLOYEE invite codes');
    }
    if (error.message.includes('COMPANY_ADMIN can only create employee invites for same tenant')) {
      return new HttpError(403, 'COMPANY_ADMIN can only create employee invite codes for their own tenant');
    }
    if (error.message.includes('Submitted enrollments are immutable')) {
      return new HttpError(409, 'Submitted enrollments are immutable');
    }
  }

  return new HttpError(500, 'Unexpected database error');
}

function isPgError(error: unknown): error is { code?: string; message?: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}
