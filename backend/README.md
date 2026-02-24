# Backend Scaffold (MVP)

This backend scaffold implements:

- Email/password auth with JWT access tokens + rotated refresh tokens
- Invite-code signup (`COMPANY_ADMIN`, `EMPLOYEE`)
- Password reset request/confirm flow
- Session invalidation (`/auth/logout`, `/auth/logout-all`)
- Login brute-force lockout guard
- Structured JSON request logs with request IDs
- Persisted security event stream (`security_events`)
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

## Local Postgres

From repo root:

```bash
docker compose up -d postgres
```

Then run migrations:

```bash
npm run migrate
```

## DB Provider

- Default: `DB_PROVIDER=postgres` (requires `DATABASE_URL`).
- Test mode: `DB_PROVIDER=memory` (used by `npm test`).

## Seeded User

From `.env`:

- `SEED_FULL_ADMIN_EMAIL`
- `SEED_FULL_ADMIN_PASSWORD`

Use these credentials with `POST /auth/login`.

## Notes

- Database migration SQLs are in `/db/migrations`.
- API contract is in `/docs/api/openapi.yaml`.
- Integration tests: `npm test`.
- Postgres integration tests: `npm run test:postgres` (requires `DATABASE_URL`).
