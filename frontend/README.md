# Frontend Shell (MVP)

Role-aware React shell for:

- `FULL_ADMIN` tenant + company-admin invite workflows
- `COMPANY_ADMIN` employee invite/profile + plan year/plan/premiums workflows
- `EMPLOYEE` profile + dependent + enrollment draft/submit workflows
- Invite-based self-signup from the UI
- Premium configuration for all four coverage tiers
- Security event visibility for full admin and company admin
- Employee enrollment receipt view

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:5173`

Set API base URL via `VITE_API_BASE_URL` or use the in-app API URL field.

## API Types

Generate frontend API types from OpenAPI:

```bash
npm run generate:api
```

## E2E Tests

```bash
npm run e2e
```
