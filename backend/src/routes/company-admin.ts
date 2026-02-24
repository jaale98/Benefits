import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRoles } from '../middleware/rbac.js';
import { requireTenantAccess } from '../middleware/tenant-guard.js';
import { db } from '../services/db.js';

const employeeProfileSchema = z.object({
  employeeId: z.string().min(1).max(64),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dob: z.string().date(),
  hireDate: z.string().date(),
  salaryAmount: z.number().nonnegative(),
  benefitClass: z.enum(['FULL_TIME_ELIGIBLE', 'INELIGIBLE']),
  employmentStatus: z.enum(['ACTIVE', 'TERMED']),
});

const createEmployeeInviteSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const createPlanYearSchema = z.object({
  name: z.string().min(1).max(64),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

const createPlanSchema = z.object({
  planYearId: z.string().uuid(),
  type: z.enum(['MEDICAL', 'DENTAL', 'VISION']),
  carrier: z.string().min(1).max(120),
  planName: z.string().min(1).max(120),
});

const setPremiumsSchema = z.object({
  tiers: z
    .array(
      z.object({
        coverageTier: z.enum(['EMPLOYEE_ONLY', 'EMPLOYEE_SPOUSE', 'EMPLOYEE_CHILDREN', 'FAMILY']),
        employeeMonthlyCost: z.number().nonnegative(),
        employerMonthlyCost: z.number().nonnegative(),
      }),
    )
    .min(1),
});

const companyAdminRouter = Router({ mergeParams: true });

companyAdminRouter.use(authenticate, requireRoles('COMPANY_ADMIN', 'FULL_ADMIN'), requireTenantAccess('tenantId'));

companyAdminRouter.post(
  '/invite-codes/employee',
  asyncHandler(async (req, res) => {
    const payload = createEmployeeInviteSchema.parse(req.body ?? {});
    const tenantId = req.params.tenantId;

    const inviteCode = await db.createInviteCode({
      creatorUserId: req.user!.id,
      tenantId,
      targetRole: 'EMPLOYEE',
      expiresAt: payload.expiresAt,
      maxUses: payload.maxUses,
    });

    res.status(201).json({ inviteCode });
  }),
);

companyAdminRouter.put(
  '/employees/:employeeUserId/profile',
  asyncHandler(async (req, res) => {
    const payload = employeeProfileSchema.parse(req.body);
    const tenantId = req.params.tenantId;
    const employeeUserId = req.params.employeeUserId;

    const profile = await db.upsertEmployeeProfile(tenantId, employeeUserId, payload);
    res.json({ profile });
  }),
);

companyAdminRouter.post(
  '/plan-years',
  asyncHandler(async (req, res) => {
    const payload = createPlanYearSchema.parse(req.body);

    const planYear = await db.createPlanYear({
      actorUserId: req.user!.id,
      tenantId: req.params.tenantId,
      name: payload.name,
      startDate: payload.startDate,
      endDate: payload.endDate,
    });

    res.status(201).json({ planYear });
  }),
);

companyAdminRouter.post(
  '/plans',
  asyncHandler(async (req, res) => {
    const payload = createPlanSchema.parse(req.body);

    const plan = await db.createPlan({
      tenantId: req.params.tenantId,
      planYearId: payload.planYearId,
      type: payload.type,
      carrier: payload.carrier,
      planName: payload.planName,
    });

    res.status(201).json({ plan });
  }),
);

companyAdminRouter.put(
  '/plans/:planId/premiums',
  asyncHandler(async (req, res) => {
    const payload = setPremiumsSchema.parse(req.body);
    const planId = req.params.planId;

    const premiums = await db.replacePlanPremiums({
      tenantId: req.params.tenantId,
      planId,
      tiers: payload.tiers,
    });

    res.json({ premiums });
  }),
);

export { companyAdminRouter };
