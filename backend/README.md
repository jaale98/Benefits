# Backend Scaffold (MVP)

This backend scaffold implements:

- Email/password auth with JWT
- Invite-code signup (`COMPANY_ADMIN`, `EMPLOYEE`)
- RBAC middleware
- Tenant guard middleware
- PostgreSQL-backed repository service (default runtime)
- Transaction-safe enrollment submit flow
- Core tenant/admin/employee MVP endpoints
- In-memory provider for integration tests

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

## DB Provider

- Default: `DB_PROVIDER=postgres` (requires `DATABASE_URL`).
- Test mode: `DB_PROVIDER=memory` (used by `npm test`).

## Seeded User

From `.env`:

- `SEED_FULL_ADMIN_EMAIL`
- `SEED_FULL_ADMIN_PASSWORD`

Use these credentials with `POST /auth/login`.

## Notes

- Database migration SQL is in `/db/migrations/001_init.sql`.
- API contract is in `/docs/api/openapi.yaml`.
- Integration tests: `npm test`.
