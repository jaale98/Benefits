.PHONY: dev-up dev-down dev-db-up dev-db-down prod-up prod-down migrate-backend

dev-up:
	docker compose --profile app up -d

dev-db-up:
	docker compose up -d postgres

dev-db-down:
	docker compose down

dev-down:
	docker compose --profile app down

prod-up:
	docker compose -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f docker-compose.prod.yml down

migrate-backend:
	cd backend && npm run migrate
