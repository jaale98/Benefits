.PHONY: dev-db-up dev-db-down migrate-backend

dev-db-up:
	docker compose up -d postgres

dev-db-down:
	docker compose down

migrate-backend:
	cd backend && npm run migrate
