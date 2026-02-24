import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRoles } from '../middleware/rbac.js';
import { db } from '../services/db.js';

const createTenantSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
});

const createCompanyAdminInviteSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const listSecurityEventsSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  tenantId: z.string().uuid().optional(),
});

const fullAdminRouter = Router();

fullAdminRouter.use(authenticate, requireRoles('FULL_ADMIN'));

fullAdminRouter.get(
  '/tenants',
  asyncHandler(async (_req, res) => {
    const tenants = await db.listTenants();
    res.json({ tenants });
  }),
);

fullAdminRouter.get(
  '/security-events',
  asyncHandler(async (req, res) => {
    const query = listSecurityEventsSchema.parse(req.query);
    const events = await db.listSecurityEvents({
      limit: query.limit,
      tenantId: query.tenantId,
    });

    res.json({ events });
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

export { fullAdminRouter };
