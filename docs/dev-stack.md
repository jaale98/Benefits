# Local Dev Stack

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
