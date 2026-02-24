# Backend Scaffold (MVP)

This backend scaffold implements:

- Email/password auth with JWT
- Invite-code signup (`COMPANY_ADMIN`, `EMPLOYEE`)
- RBAC middleware
- Tenant guard middleware
- Core tenant/admin/employee MVP endpoints
- In-memory persistence (for workflow scaffolding)

## Run

1. Copy `.env.example` to `.env`.
2. Install deps:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

Default URL: `http://localhost:4000`

## Seeded User

From `.env`:

- `SEED_FULL_ADMIN_EMAIL`
- `SEED_FULL_ADMIN_PASSWORD`

Use these credentials with `POST /auth/login`.

## Notes

- Database migration SQL is in `/db/migrations/001_init.sql`.
- API contract is in `/docs/api/openapi.yaml`.
- This is scaffold code and intentionally uses in-memory storage until DB repositories are wired.
