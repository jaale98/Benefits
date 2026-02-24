import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRoles } from '../middleware/rbac.js';
import { requireTenantAccess } from '../middleware/tenant-guard.js';
import { db } from '../services/db.js';
import { HttpError } from '../types/http-error.js';

const employeeProfileSchema = z.object({
  employeeUserId: z.string().uuid().optional(),
  employeeId: z.string().min(1).max(64),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dob: z.string().date(),
  hireDate: z.string().date(),
  salaryAmount: z.number().nonnegative(),
  benefitClass: z.enum(['FULL_TIME_ELIGIBLE', 'INELIGIBLE']),
  employmentStatus: z.enum(['ACTIVE', 'TERMED']),
});

const dependentSchema = z.object({
  employeeUserId: z.string().uuid().optional(),
  relationship: z.enum(['SPOUSE', 'CHILD']),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dob: z.string().date(),
});

const draftEnrollmentSchema = z.object({
  employeeUserId: z.string().uuid().optional(),
  planYearId: z.string().uuid(),
  elections: z
    .array(
      z.object({
        planType: z.enum(['MEDICAL', 'DENTAL', 'VISION']),
        planId: z.string().uuid(),
        coverageTier: z.enum(['EMPLOYEE_ONLY', 'EMPLOYEE_SPOUSE', 'EMPLOYEE_CHILDREN', 'FAMILY']),
      }),
    )
    .min(1),
  dependentIds: z.array(z.string().uuid()).default([]),
});

const submitEnrollmentSchema = z.object({
  employeeUserId: z.string().uuid().optional(),
});

const listPlansQuerySchema = z.object({
  planYearId: z.string().uuid().optional(),
  employeeUserId: z.string().uuid().optional(),
});

const listDependentsQuerySchema = z.object({
  employeeUserId: z.string().uuid().optional(),
});

const employeeRouter = Router({ mergeParams: true });

employeeRouter.use(authenticate, requireRoles('EMPLOYEE', 'FULL_ADMIN'), requireTenantAccess('tenantId'));

employeeRouter.get(
  '/plan-years',
  asyncHandler(async (req, res) => {
    const planYears = await db.listPlanYears(req.params.tenantId);
    res.json({ planYears });
  }),
);

employeeRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const query = listPlansQuerySchema.parse(req.query);
    const plans = await db.listPlans(req.params.tenantId, query.planYearId);
    res.json({ plans });
  }),
);

employeeRouter.get(
  '/dependents',
  asyncHandler(async (req, res) => {
    const query = listDependentsQuerySchema.parse(req.query);
    const employeeUserId = resolveEmployeeUserId(req.user!, query.employeeUserId);
    const dependents = await db.listEmployeeDependents(req.params.tenantId, employeeUserId);
    res.json({ dependents });
  }),
);

employeeRouter.get(
  '/enrollments',
  asyncHandler(async (req, res) => {
    const query = listDependentsQuerySchema.parse(req.query);
    const employeeUserId = resolveEmployeeUserId(req.user!, query.employeeUserId);
    const enrollments = await db.listEmployeeEnrollments(req.params.tenantId, employeeUserId);
    res.json({ enrollments });
  }),
);

employeeRouter.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const payload = employeeProfileSchema.parse(req.body);
    const employeeUserId = resolveEmployeeUserId(req.user!, payload.employeeUserId);

    const profile = await db.upsertEmployeeProfile(req.params.tenantId, employeeUserId, payload);
    res.json({ profile });
  }),
);

employeeRouter.post(
  '/dependents',
  asyncHandler(async (req, res) => {
    const payload = dependentSchema.parse(req.body);
    const employeeUserId = resolveEmployeeUserId(req.user!, payload.employeeUserId);

    const dependent = await db.addDependent({
      tenantId: req.params.tenantId,
      employeeUserId,
      relationship: payload.relationship,
      firstName: payload.firstName,
      lastName: payload.lastName,
      dob: payload.dob,
    });

    res.status(201).json({ dependent });
  }),
);

employeeRouter.post(
  '/enrollments/draft',
  asyncHandler(async (req, res) => {
    const payload = draftEnrollmentSchema.parse(req.body);
    const employeeUserId = resolveEmployeeUserId(req.user!, payload.employeeUserId);

    const enrollment = await db.createEnrollmentDraft({
      tenantId: req.params.tenantId,
      employeeUserId,
      planYearId: payload.planYearId,
      elections: payload.elections,
      dependentIds: payload.dependentIds,
    });

    res.status(201).json({ enrollment });
  }),
);

employeeRouter.post(
  '/enrollments/:enrollmentId/submit',
  asyncHandler(async (req, res) => {
    const payload = submitEnrollmentSchema.parse(req.body ?? {});
    const employeeUserId = resolveEmployeeUserId(req.user!, payload.employeeUserId);

    const enrollment = await db.submitEnrollment({
      tenantId: req.params.tenantId,
      employeeUserId,
      enrollmentId: req.params.enrollmentId,
    });

    res.json({ enrollment });
  }),
);

function resolveEmployeeUserId(
  authUser: { id: string; role: 'FULL_ADMIN' | 'COMPANY_ADMIN' | 'EMPLOYEE' },
  providedEmployeeUserId?: string,
): string {
  if (authUser.role === 'EMPLOYEE') {
    return authUser.id;
  }

  if (authUser.role === 'FULL_ADMIN' && providedEmployeeUserId) {
    return providedEmployeeUserId;
  }

  throw new HttpError(400, 'employeeUserId is required for FULL_ADMIN operations');
}

export { employeeRouter };
