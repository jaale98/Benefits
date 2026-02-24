import { env } from '../config/env.js';
import { db } from '../services/db.js';
import type { CoverageTier, PlanType } from '../types/domain.js';

const PREMIUMS: Array<{
  coverageTier: CoverageTier;
  employeeMonthlyCost: number;
  employerMonthlyCost: number;
}> = [
  { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
  { coverageTier: 'EMPLOYEE_SPOUSE', employeeMonthlyCost: 240, employerMonthlyCost: 760 },
  { coverageTier: 'EMPLOYEE_CHILDREN', employeeMonthlyCost: 260, employerMonthlyCost: 840 },
  { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
];

async function main() {
  await db.init();

  const suffix = process.argv[2] ?? Date.now().toString();
  const fullAdmin = await db.findUserByEmail(env.SEED_FULL_ADMIN_EMAIL);
  if (!fullAdmin) {
    throw new Error(`Seed full admin not found for email ${env.SEED_FULL_ADMIN_EMAIL}`);
  }

  const companyId = `demo-${suffix}`.slice(0, 32);
  const tenant = await db.createTenant({
    name: `Demo Company ${suffix}`,
    companyId,
  });

  const companyAdminInvite = await db.createInviteCode({
    creatorUserId: fullAdmin.id,
    tenantId: tenant.id,
    targetRole: 'COMPANY_ADMIN',
    maxUses: 1,
  });

  const companyAdminEmail = `company-admin+${suffix}@example.com`;
  const companyAdmin = await db.signupWithInvite({
    code: companyAdminInvite.code,
    email: companyAdminEmail,
    passwordHash: fullAdmin.passwordHash,
  });

  const employeeInvite = await db.createInviteCode({
    creatorUserId: companyAdmin.id,
    tenantId: tenant.id,
    targetRole: 'EMPLOYEE',
    maxUses: 1,
  });

  const employeeEmail = `employee+${suffix}@example.com`;
  const employee = await db.signupWithInvite({
    code: employeeInvite.code,
    email: employeeEmail,
    passwordHash: fullAdmin.passwordHash,
  });

  await db.upsertEmployeeProfile(tenant.id, employee.id, {
    employeeId: `E-${suffix}`.slice(0, 64),
    firstName: 'Demo',
    lastName: 'Employee',
    dob: '1990-02-01',
    hireDate: '2024-01-15',
    salaryAmount: 72000,
    benefitClass: 'FULL_TIME_ELIGIBLE',
    employmentStatus: 'ACTIVE',
  });

  const planYear = await db.createPlanYear({
    actorUserId: companyAdmin.id,
    tenantId: tenant.id,
    name: 'Current Plan Year',
    startDate: `${new Date().getUTCFullYear()}-01-01`,
    endDate: `${new Date().getUTCFullYear()}-12-31`,
  });

  const planTypes: PlanType[] = ['MEDICAL', 'DENTAL', 'VISION'];
  const planIdsByType: Record<PlanType, string> = {
    MEDICAL: '',
    DENTAL: '',
    VISION: '',
  };

  for (const planType of planTypes) {
    const plan = await db.createPlan({
      tenantId: tenant.id,
      planYearId: planYear.id,
      type: planType,
      carrier: 'Aetna',
      planName: `Demo ${planType} Plan`,
    });

    await db.replacePlanPremiums({
      tenantId: tenant.id,
      planId: plan.id,
      tiers: PREMIUMS,
    });

    planIdsByType[planType] = plan.id;
  }

  const spouse = await db.addDependent({
    tenantId: tenant.id,
    employeeUserId: employee.id,
    relationship: 'SPOUSE',
    firstName: 'Demo',
    lastName: 'Spouse',
    dob: '1991-03-10',
  });

  const child = await db.addDependent({
    tenantId: tenant.id,
    employeeUserId: employee.id,
    relationship: 'CHILD',
    firstName: 'Demo',
    lastName: 'Child',
    dob: '2016-06-15',
  });

  const draft = await db.createEnrollmentDraft({
    tenantId: tenant.id,
    employeeUserId: employee.id,
    planYearId: planYear.id,
    elections: [
      {
        planType: 'MEDICAL',
        planId: planIdsByType.MEDICAL,
        coverageTier: 'FAMILY',
      },
    ],
    dependentIds: [spouse.id, child.id],
  });

  const submitted = await db.submitEnrollment({
    tenantId: tenant.id,
    employeeUserId: employee.id,
    enrollmentId: draft.id,
  });

  console.log(
    JSON.stringify(
      {
        tenant: {
          id: tenant.id,
          companyId: tenant.companyId,
          name: tenant.name,
        },
        users: {
          fullAdminEmail: env.SEED_FULL_ADMIN_EMAIL,
          companyAdminEmail,
          employeeEmail,
          password: env.SEED_FULL_ADMIN_PASSWORD,
        },
        enrollment: {
          id: submitted.id,
          status: submitted.status,
          effectiveDate: submitted.effectiveDate,
          confirmationCode: submitted.confirmationCode,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
