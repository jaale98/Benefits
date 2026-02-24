# Local Dev Stack

## One-command full stack boot (postgres + backend + frontend)

From repo root:

```bash
make dev-up
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Postgres: `localhost:5432`

Stop:

```bash
make dev-down
```

## One-command Postgres boot

From repo root:

```bash
make dev-db-up
```

This starts PostgreSQL via `docker-compose.yml` on `localhost:5432`.

## Apply migrations

```bash
make migrate-backend
```

## Start backend

```bash
cd backend
npm run dev
```

## Start frontend

```bash
cd frontend
npm run dev
```
