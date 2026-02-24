import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/services/db.js';

describe('API integration (MVP core flows)', () => {
  beforeAll(async () => {
    await db.init();
  });

  it('authenticates seeded full admin', async () => {
    const response = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('FULL_ADMIN');
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('enforces tenant isolation and enrollment business rules end-to-end', async () => {
    const suffix = Date.now().toString();

    const fullAdminLogin = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });
    const fullAdminToken = fullAdminLogin.body.accessToken as string;

    const tenantAResponse = await request(app)
      .post('/full-admin/tenants')
      .set('Authorization', `Bearer ${fullAdminToken}`)
      .send({ name: `Acme ${suffix}`, companyId: `acme-${suffix}` });

    const tenantBResponse = await request(app)
      .post('/full-admin/tenants')
      .set('Authorization', `Bearer ${fullAdminToken}`)
      .send({ name: `Beta ${suffix}`, companyId: `beta-${suffix}` });

    expect(tenantAResponse.status).toBe(201);
    expect(tenantBResponse.status).toBe(201);

    const tenantAId = tenantAResponse.body.tenant.id as string;
    const tenantBId = tenantBResponse.body.tenant.id as string;

    const companyAdminInvite = await request(app)
      .post(`/full-admin/tenants/${tenantAId}/invite-codes/company-admin`)
      .set('Authorization', `Bearer ${fullAdminToken}`)
      .send({ maxUses: 1 });

    expect(companyAdminInvite.status).toBe(201);

    const companyAdminSignup = await request(app).post('/auth/signup-invite').send({
      inviteCode: companyAdminInvite.body.inviteCode.code,
      email: `company-admin-${suffix}@example.com`,
      password: 'StrongPass123!',
    });

    expect(companyAdminSignup.status).toBe(201);
    expect(companyAdminSignup.body.user.role).toBe('COMPANY_ADMIN');

    const companyAdminToken = companyAdminSignup.body.accessToken as string;

    const crossTenantInviteAttempt = await request(app)
      .post(`/tenants/${tenantBId}/company-admin/invite-codes/employee`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({ maxUses: 1 });

    expect(crossTenantInviteAttempt.status).toBe(403);

    const employeeInvite = await request(app)
      .post(`/tenants/${tenantAId}/company-admin/invite-codes/employee`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({ maxUses: 2 });

    expect(employeeInvite.status).toBe(201);

    const employeeSignup = await request(app).post('/auth/signup-invite').send({
      inviteCode: employeeInvite.body.inviteCode.code,
      email: `employee-${suffix}@example.com`,
      password: 'StrongPass123!',
    });

    expect(employeeSignup.status).toBe(201);
    expect(employeeSignup.body.user.role).toBe('EMPLOYEE');

    const employeeToken = employeeSignup.body.accessToken as string;

    const planYearStart = '2026-01-01';
    const planYearEnd = '2026-12-31';

    const createPlanYear = await request(app)
      .post(`/tenants/${tenantAId}/company-admin/plan-years`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        name: '2026 Plan Year',
        startDate: planYearStart,
        endDate: planYearEnd,
      });

    expect(createPlanYear.status).toBe(201);
    const planYearId = createPlanYear.body.planYear.id as string;

    const overlappingPlanYear = await request(app)
      .post(`/tenants/${tenantAId}/company-admin/plan-years`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        name: 'Overlap Plan Year',
        startDate: '2026-06-01',
        endDate: '2027-05-31',
      });

    expect(overlappingPlanYear.status).toBe(409);

    const createMedicalPlan = await request(app)
      .post(`/tenants/${tenantAId}/company-admin/plans`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        planYearId,
        type: 'MEDICAL',
        carrier: 'Aetna',
        planName: 'Aetna Gold PPO',
      });

    expect(createMedicalPlan.status).toBe(201);
    const planId = createMedicalPlan.body.plan.id as string;

    const setPremiums = await request(app)
      .put(`/tenants/${tenantAId}/company-admin/plans/${planId}/premiums`)
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({
        tiers: [
          { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
          { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
        ],
      });

    expect(setPremiums.status).toBe(200);

    const employeeProfile = await request(app)
      .put(`/tenants/${tenantAId}/employee/profile`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        employeeId: `E-${suffix}`,
        firstName: 'Taylor',
        lastName: 'Employee',
        dob: '1990-02-01',
        hireDate: '2024-01-15',
        salaryAmount: 75000,
        benefitClass: 'FULL_TIME_ELIGIBLE',
        employmentStatus: 'ACTIVE',
      });

    expect(employeeProfile.status).toBe(200);

    const overAgeChild = await request(app)
      .post(`/tenants/${tenantAId}/employee/dependents`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        relationship: 'CHILD',
        firstName: 'Older',
        lastName: 'Child',
        dob: '1990-01-01',
      });

    expect(overAgeChild.status).toBe(201);

    const draftWithOverAgeChild = await request(app)
      .post(`/tenants/${tenantAId}/employee/enrollments/draft`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        planYearId,
        elections: [{ planType: 'MEDICAL', planId, coverageTier: 'EMPLOYEE_ONLY' }],
        dependentIds: [overAgeChild.body.dependent.id],
      });

    expect(draftWithOverAgeChild.status).toBe(201);

    const submitWithOverAgeChild = await request(app)
      .post(`/tenants/${tenantAId}/employee/enrollments/${draftWithOverAgeChild.body.enrollment.id}/submit`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({});

    expect(submitWithOverAgeChild.status).toBe(422);

    const underAgeChild = await request(app)
      .post(`/tenants/${tenantAId}/employee/dependents`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        relationship: 'CHILD',
        firstName: 'Younger',
        lastName: 'Child',
        dob: '2015-05-01',
      });

    expect(underAgeChild.status).toBe(201);

    const validDraft = await request(app)
      .post(`/tenants/${tenantAId}/employee/enrollments/draft`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        planYearId,
        elections: [{ planType: 'MEDICAL', planId, coverageTier: 'EMPLOYEE_ONLY' }],
        dependentIds: [underAgeChild.body.dependent.id],
      });

    expect(validDraft.status).toBe(201);

    const validSubmit = await request(app)
      .post(`/tenants/${tenantAId}/employee/enrollments/${validDraft.body.enrollment.id}/submit`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({});

    expect(validSubmit.status).toBe(200);
    expect(validSubmit.body.enrollment.status).toBe('SUBMITTED');
    expect(validSubmit.body.enrollment.confirmationCode).toContain('ENR-');
    expect(validSubmit.body.enrollment.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
