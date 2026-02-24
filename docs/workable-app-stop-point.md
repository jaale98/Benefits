# Workable App Stop Point (MVP)

This is the recommended stopping point where the app is usable end-to-end for MVP scope.

## Done Criteria

- Full Admin can:
  - Log in.
  - Create tenant.
  - Create company-admin invite code.
  - View security events (JSON) and export CSV.
- Company Admin can:
  - Sign up with invite code and log in.
  - Create employee invite code.
  - Set employee profile.
  - Create non-overlapping plan years.
  - Create medical/dental/vision plans.
  - Set all four coverage-tier premiums (employee/employer monthly split).
  - View tenant security events (JSON) and export CSV.
- Employee can:
  - Sign up with invite code and log in.
  - Save profile.
  - Add spouse/child dependents.
  - Save enrollment draft for a plan year.
  - Re-save draft for same plan year and replace prior draft (single draft behavior).
  - Submit enrollment and receive confirmation code.
- Core validations enforced:
  - Tenant isolation.
  - Plan-year overlap blocked.
  - Child dependent age >= 26 blocked at submit.
  - Ineligible/termed employee blocked at submit.

## Verification Commands

From repo root:

```bash
make dev-up
cd backend && npm test && npm run test:postgres && npm run typecheck && npm run build
cd ../frontend && npm run build && npm run e2e
```

## Manual Smoke Flow

1. Log in as seeded full admin (`platform-admin@example.com` / `ChangeMe123!`).
2. Create tenant and company-admin invite.
3. Sign up company admin using invite, then create employee invite.
4. Sign up employee using invite.
5. As company admin, set employee profile, create plan year, create plan, and set premiums.
6. As employee, add dependent, create draft, replace draft, and submit enrollment.
7. Confirm enrollment appears as `SUBMITTED` with confirmation code.
