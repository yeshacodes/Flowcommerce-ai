.PHONY: infra-up infra-down order inventory payment notification auth catalog load

infra-up:
	docker compose up -d

infra-down:
	docker compose down

auth:
	uvicorn auth_service.main:app --reload --port 8004

catalog:
	uvicorn catalog_service.main:app --reload --port 8005

order:
	uvicorn order_service.main:app --reload --port 8000

inventory:
	python -m inventory_service.main

payment:
	python -m payment_service.main

notification:
	python -m notification_service.main

load:
	k6 run load_tests/order_load_test.js
