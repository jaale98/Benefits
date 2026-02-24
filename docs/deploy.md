# Production Deploy Profile

This repo includes a baseline production-like compose stack using:

- `postgres`
- `backend` (Node runtime build)
- `frontend` (Vite preview server)

Run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Endpoints:

- Frontend: `http://localhost:4173`
- Backend: `http://localhost:4000`

Required change before real deployment:

- Set a strong `JWT_SECRET` in `docker-compose.prod.yml`.

Stop:

```bash
docker compose -f docker-compose.prod.yml down
```
