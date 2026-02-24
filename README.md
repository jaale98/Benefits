# Benefits Enrollment MVP

US-only, multi-tenant benefits enrollment app MVP.

Supported scope:

- Benefits: Medical, Dental, Vision
- Premiums: Monthly employee/employer split
- Dependents: Spouse and Child (child under 26)
- Roles: Full Admin, Company Admin, Employee

## Quick Start

### Local full stack (dev)

```bash
make dev-up
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Stop:

```bash
make dev-down
```

### Local Postgres only

```bash
make dev-db-up
make migrate-backend
```

## Key Docs

- PRD: `docs/prd.md`
- RBAC Matrix: `docs/rbac-matrix.md`
- Data Model: `docs/data-model.md`
- API Contract: `docs/api/openapi.yaml`
- Dev stack guide: `docs/dev-stack.md`
- Production-like compose profile: `docs/deploy.md`
- Workable app stop point: `docs/workable-app-stop-point.md`

## App Packages

- Backend: `backend/README.md`
- Frontend: `frontend/README.md`
