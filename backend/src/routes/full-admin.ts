import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRoles } from '../middleware/rbac.js';
import { db } from '../services/db.js';
import { formatSecurityEventsCsv } from '../services/security-events-csv.js';

const createTenantSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
});

const createCompanyAdminInviteSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const listTenantsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const listSecurityEventsSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
  tenantId: z.string().uuid().optional(),
  severity: z.enum(['INFO', 'WARN', 'ERROR']).optional(),
  eventType: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  export: z.enum(['json', 'csv']).optional(),
});

const fullAdminRouter = Router();

fullAdminRouter.use(authenticate, requireRoles('FULL_ADMIN'));

fullAdminRouter.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    const query = listTenantsQuerySchema.parse(req.query);
    const tenants = await db.listTenants();
    const page = paginateList(tenants, query.limit, query.offset);
    res.json({ tenants: page.items, page: page.meta });
  }),
);

fullAdminRouter.get(
  '/security-events',
  asyncHandler(async (req, res) => {
    const query = listSecurityEventsSchema.parse(req.query);
    const shouldExportCsv = query.export === 'csv';

    if (shouldExportCsv) {
      const events = await db.listSecurityEvents({
        limit: Math.min(query.limit, 500),
        offset: query.offset,
        tenantId: query.tenantId,
        severity: query.severity,
        eventType: query.eventType,
        q: query.q,
      });

      const csv = formatSecurityEventsCsv(events);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="full-admin-security-events.csv"');
      res.status(200).send(csv);
      return;
    }

    const dbLimit = Math.min(query.limit + 1, 500);
    const events = await db.listSecurityEvents({
      limit: dbLimit,
      offset: query.offset,
      tenantId: query.tenantId,
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

fullAdminRouter.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const payload = createTenantSchema.parse(req.body);
    const tenant = await db.createTenant({
      name: payload.name,
      companyId: payload.companyId,
    });

    res.status(201).json({ tenant });
  }),
);

fullAdminRouter.post(
  '/tenants/:tenantId/invite-codes/company-admin',
  asyncHandler(async (req, res) => {
    const payload = createCompanyAdminInviteSchema.parse(req.body ?? {});
    const tenantId = req.params.tenantId;

    const inviteCode = await db.createInviteCode({
      creatorUserId: req.user!.id,
      tenantId,
      targetRole: 'COMPANY_ADMIN',
      expiresAt: payload.expiresAt,
      maxUses: payload.maxUses,
    });

    res.status(201).json({ inviteCode });
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

export { fullAdminRouter };
