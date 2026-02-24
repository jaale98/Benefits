import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/services/db.js';

describe('API integration (postgres provider)', () => {
  beforeAll(async () => {
    await db.init();
  });

  it('runs with migrated schema and records security events', async () => {
    const loginResponse = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });

    expect(loginResponse.status).toBe(200);
    expect(typeof loginResponse.body.accessToken).toBe('string');
    expect(typeof loginResponse.body.refreshToken).toBe('string');
    expect(typeof loginResponse.body.user.sessionId).toBe('string');

    const eventsResponse = await request(app)
      .get('/full-admin/security-events?limit=20&offset=0&severity=INFO')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`);

    expect(eventsResponse.status).toBe(200);
    const eventTypes = (eventsResponse.body.events as Array<{ eventType?: string }>).map((event) => event.eventType);
    expect(eventTypes).toContain('AUTH_LOGIN_SUCCESS');
    expect(eventsResponse.body.page.limit).toBe(20);
    expect(eventsResponse.body.page.offset).toBe(0);
  });

  it('rotates refresh tokens and rejects replayed refresh tokens', async () => {
    const loginResponse = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });

    const originalRefreshToken = loginResponse.body.refreshToken as string;

    const refreshResponse = await request(app).post('/auth/refresh').send({ refreshToken: originalRefreshToken });
    expect(refreshResponse.status).toBe(200);

    const replayResponse = await request(app).post('/auth/refresh').send({ refreshToken: originalRefreshToken });
    expect(replayResponse.status).toBe(401);
  });

  it('supports draft enrollments with null effective date and validates dependent rules at submit', async () => {
    const suffix = Date.now().toString();

    const fullAdminLogin = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });
    expect(fullAdminLogin.status).toBe(200);
    const fullAdminToken = fullAdminLogin.body.accessToken as string;

    const tenantResponse = await request(app)
      .post('/full-admin/tenants')
      .set('Authorization', `Bearer ${fullAdminToken}`)
      .send({ name: `PG Tenant ${suffix}`, companyId: `pg-${suffix}` });
    expect(tenantResponse.status).toBe(201);
    const tenantId = tenantResponse.body.tenant.id as string;

    const companyAdminInvite = await request(app)
      .post(`/full-admin/tenants/${tenantId}/invite-codes/company-admin`)
      .set('Authorization', `Bearer ${fullAdminToken}`)
      .send({ maxUses: 1 });
    expect(companyAdminInvite.status).toBe(201);

    const companyAdminSignup = await request(app).post('/auth/signup-invite').send({
      inviteCode: companyAdminInvite.body.inviteCode.code,
      email: `pg-company-admin-${suffix}@example.com`,
      password: 'StrongPass123!',
    });
    expect(companyAdminSignup.status).toBe(201);
    const companyAdminToken = companyAdminSignup.body.accessToken as string;

    const employeeInvite = await request(app)
      .post(`/tenants/${tenantId}/company-admin/invite-codes/employee`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({ maxUses: 1 });
    expect(employeeInvite.status).toBe(201);

    const employeeSignup = await request(app).post('/auth/signup-invite').send({
      inviteCode: employeeInvite.body.inviteCode.code,
      email: `pg-employee-${suffix}@example.com`,
      password: 'StrongPass123!',
    });
    expect(employeeSignup.status).toBe(201);
    const employeeToken = employeeSignup.body.accessToken as string;

    const planYearResponse = await request(app)
      .post(`/tenants/${tenantId}/company-admin/plan-years`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        name: '2028 Plan Year',
        startDate: '2028-01-01',
        endDate: '2028-12-31',
      });
    expect(planYearResponse.status).toBe(201);
    const planYearId = planYearResponse.body.planYear.id as string;

    const planResponse = await request(app)
      .post(`/tenants/${tenantId}/company-admin/plans`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        planYearId,
        type: 'MEDICAL',
        carrier: 'Aetna',
        planName: 'Aetna PG Plan',
      });
    expect(planResponse.status).toBe(201);
    const planId = planResponse.body.plan.id as string;

    const premiumsResponse = await request(app)
      .put(`/tenants/${tenantId}/company-admin/plans/${planId}/premiums`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        tiers: [
          { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
          { coverageTier: 'EMPLOYEE_SPOUSE', employeeMonthlyCost: 240, employerMonthlyCost: 760 },
          { coverageTier: 'EMPLOYEE_CHILDREN', employeeMonthlyCost: 260, employerMonthlyCost: 840 },
          { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
        ],
      });
    expect(premiumsResponse.status).toBe(200);

    const profileResponse = await request(app)
      .put(`/tenants/${tenantId}/employee/profile`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        employeeId: `PG-EMP-${suffix}`,
        firstName: 'Postgres',
        lastName: 'Employee',
        dob: '1990-02-01',
        hireDate: '2024-01-15',
        salaryAmount: 75000,
        benefitClass: 'FULL_TIME_ELIGIBLE',
        employmentStatus: 'ACTIVE',
      });
    expect(profileResponse.status).toBe(200);

    const spouseTierWithoutSpouse = await request(app)
      .post(`/tenants/${tenantId}/employee/enrollments/draft`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        planYearId,
        elections: [{ planType: 'MEDICAL', planId, coverageTier: 'EMPLOYEE_SPOUSE' }],
        dependentIds: [],
      });
    expect(spouseTierWithoutSpouse.status).toBe(422);

    const overAgeChild = await request(app)
      .post(`/tenants/${tenantId}/employee/dependents`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        relationship: 'CHILD',
        firstName: 'Older',
        lastName: 'Child',
        dob: '1990-01-01',
      });
    expect(overAgeChild.status).toBe(201);

    const draftResponse = await request(app)
      .post(`/tenants/${tenantId}/employee/enrollments/draft`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        planYearId,
        elections: [{ planType: 'MEDICAL', planId, coverageTier: 'EMPLOYEE_CHILDREN' }],
        dependentIds: [overAgeChild.body.dependent.id],
      });
    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.enrollment.effectiveDate).toBeNull();

    const submitResponse = await request(app)
      .post(`/tenants/${tenantId}/employee/enrollments/${draftResponse.body.enrollment.id}/submit`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({});
    expect(submitResponse.status).toBe(422);
  });
});
