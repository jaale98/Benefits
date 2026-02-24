import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRoles } from '../middleware/rbac.js';
import { requireTenantAccess } from '../middleware/tenant-guard.js';
import { db } from '../services/db.js';
import { formatSecurityEventsCsv } from '../services/security-events-csv.js';

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

const listUsersQuerySchema = z.object({
  role: z.enum(['COMPANY_ADMIN', 'EMPLOYEE']).optional(),
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const listPlansQuerySchema = z.object({
  planYearId: z.string().uuid().optional(),
});

const listSecurityEventsSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
  severity: z.enum(['INFO', 'WARN', 'ERROR']).optional(),
  eventType: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  export: z.enum(['json', 'csv']).optional(),
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

companyAdminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const query = listUsersQuerySchema.parse(req.query);
    const users = await db.listTenantUsers(req.params.tenantId, query.role);
    const page = paginateList(users, query.limit, query.offset);
    res.json({ users: page.items, page: page.meta });
  }),
);

companyAdminRouter.get(
  '/employee-profiles',
  asyncHandler(async (req, res) => {
    const profiles = await db.listEmployeeProfiles(req.params.tenantId);
    res.json({ profiles });
  }),
);

companyAdminRouter.get(
  '/security-events',
  asyncHandler(async (req, res) => {
    const query = listSecurityEventsSchema.parse(req.query);
    const shouldExportCsv = query.export === 'csv';

    if (shouldExportCsv) {
      const events = await db.listSecurityEvents({
        tenantId: req.params.tenantId,
        limit: Math.min(query.limit, 500),
        offset: query.offset,
        severity: query.severity,
        eventType: query.eventType,
        q: query.q,
      });

      const csv = formatSecurityEventsCsv(events);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tenant-security-events.csv"');
      res.status(200).send(csv);
      return;
    }

    const dbLimit = Math.min(query.limit + 1, 500);
    const events = await db.listSecurityEvents({
      tenantId: req.params.tenantId,
      limit: dbLimit,
      offset: query.offset,
      severity: query.severity,
      eventType: query.eventType,
      q: query.q,
    });

    const hasMore = events.length > query.limit;
    const items = hasMore ? events.slice(0, query.limit) : events;
    res.json({
      events: items,
      page: {
        limit: query.limit,
        offset: query.offset,
        returned: items.length,
        hasMore,
        nextOffset: hasMore ? query.offset + query.limit : null,
      },
    });
  }),
);

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

companyAdminRouter.get(
  '/plan-years',
  asyncHandler(async (req, res) => {
    const planYears = await db.listPlanYears(req.params.tenantId);
    res.json({ planYears });
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

companyAdminRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const query = listPlansQuerySchema.parse(req.query);
    const plans = await db.listPlans(req.params.tenantId, query.planYearId);
    res.json({ plans });
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

function paginateList<T>(items: T[], limit: number, offset: number): {
  items: T[];
  meta: { limit: number; offset: number; returned: number; hasMore: boolean; nextOffset: number | null };
} {
  const pagedItems = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;
  return {
    items: pagedItems,
    meta: {
      limit,
      offset,
      returned: pagedItems.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    },
  };
}

export { companyAdminRouter };
