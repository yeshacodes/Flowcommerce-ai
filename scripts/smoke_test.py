"""Post an order and poll its status until it reaches a terminal state.

Run AFTER infra + all services are up:
    python scripts/smoke_test.py

Creates a throw-away test user, logs in, places an order, and polls until
the saga reaches CONFIRMED or FAILED (both are valid terminal states).
"""
import sys
import time
import uuid

import httpx

ORDER_BASE = "http://localhost:8000"
AUTH_BASE = "http://localhost:8004"


def main() -> int:
    # Register a unique test user so repeated runs don't conflict
    email = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
    r = httpx.post(
        AUTH_BASE + "/auth/register",
        json={"email": email, "password": "smokepass123", "name": "Smoke Test"},
        timeout=10,
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    print("registered test user:", email)

    headers = {"Authorization": f"Bearer {token}"}

    r = httpx.post(
        ORDER_BASE + "/orders",
        json={"items": [{"sku": "SKU-PHONE", "quantity": 1}]},
        headers=headers,
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    order_id = body["order_id"]
    print(f"created order: {order_id}  total: {body['total_cents']}¢")

    for _ in range(30):
        r = httpx.get(f"{ORDER_BASE}/orders/{order_id}", headers=headers, timeout=10)
        r.raise_for_status()
        status = r.json()["status"]
        print("status:", status)
        if status in ("CONFIRMED", "FAILED"):
            print("DONE:", status)
            return 0
        time.sleep(1)

    print("timed out waiting for terminal state")
    return 1


if __name__ == "__main__":
    sys.exit(main())
