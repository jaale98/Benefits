.PHONY: dev-up dev-down dev-db-up dev-db-down migrate-backend

dev-up:
	docker compose --profile app up -d

dev-db-up:
	docker compose up -d postgres

dev-db-down:
	docker compose down

dev-down:
	docker compose --profile app down

migrate-backend:
	cd backend && npm run migrate
