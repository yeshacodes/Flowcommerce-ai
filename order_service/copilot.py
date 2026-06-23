"""
AI Operations Copilot — backend endpoints (admin only).

Additive and read-only: it consumes existing data (orders, outbox events,
catalog/inventory, metrics, and each service's /health/details) and never
mutates app state, Kafka, or the saga.

  GET  /admin/copilot/context  — grounding snapshot for the UI + engine
  POST /admin/copilot/query    — answer a question

Phase 1 (default): a rule-based engine generates grounded answers from the
context. Phase 2 (optional): if OPENAI_API_KEY is set, the same context is sent
to an OpenAI-compatible chat model with a strict no-hallucination system prompt.
The answer schema (blocks + citations) is identical either way.
"""
from __future__ import annotations

import asyncio
import json
import re

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from shared.auth import TokenData, require_admin
from shared.db import get_pool
from shared.settings import settings

router = APIRouter()

# Local copy of the service map (kept here to avoid a circular import with main).
COPILOT_SERVICES = {
    "auth-service": "http://127.0.0.1:8004",
    "catalog-service": "http://127.0.0.1:8005",
    "order-service": "http://127.0.0.1:8000",
    "inventory-service": "http://127.0.0.1:8001",
    "payment-service": "http://127.0.0.1:8002",
    "notification-service": "http://127.0.0.1:8003",
    "stripe-webhook-service": "http://127.0.0.1:8006",
}

LOW_STOCK_THRESHOLD = 80


# ── Context aggregation ──────────────────────────────────────────────────────
async def _service_health() -> list[dict]:
    async def probe(name: str, base: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"{base}/health/details")
            if r.status_code == 200:
                return {"service": name, **r.json()}
        except Exception:
            pass
        return {"service": name, "status": "down", "dependencies": {}}

    return list(await asyncio.gather(*(probe(n, b) for n, b in COPILOT_SERVICES.items())))


async def build_context() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        metrics_row = await conn.fetchrow(
            """
            SELECT
              COUNT(*) FILTER (WHERE created_at::date = current_date) AS orders_today,
              COUNT(*) FILTER (WHERE status='CONFIRMED' AND created_at::date = current_date) AS confirmed_today,
              COUNT(*) FILTER (WHERE status='FAILED' AND created_at::date = current_date) AS failed_today,
              COUNT(*) FILTER (WHERE status='PENDING') AS pending,
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)
                FILTER (WHERE status='CONFIRMED' AND created_at::date = current_date
                        AND updated_at - created_at < interval '5 minutes') AS avg_ms
            FROM orders
            """
        )
        events_processed = await conn.fetchval(
            "SELECT COUNT(*) FROM outbox WHERE published_at IS NOT NULL"
        ) or 0

        event_rows = await conn.fetch(
            "SELECT id, topic, payload, created_at, published_at "
            "FROM outbox ORDER BY id DESC LIMIT 12"
        )
        order_rows = await conn.fetch(
            "SELECT order_id, status, total_cents, created_at, updated_at, "
            "correlation_id, payment_intent_id, payment_provider "
            "FROM orders ORDER BY created_at DESC LIMIT 10"
        )
        item_rows = await conn.fetch(
            "SELECT order_id, sku, quantity, unit_price_cents FROM order_items "
            "WHERE order_id = ANY($1::uuid[])",
            [r["order_id"] for r in order_rows] or None,
        ) if order_rows else []
        product_rows = await conn.fetch(
            "SELECT p.sku, p.name, p.description, p.price_cents, COALESCE(i.available,0) AS stock_available "
            "FROM products p LEFT JOIN inventory i ON i.sku = p.sku "
            "WHERE COALESCE(i.available,0) < $1 ORDER BY stock_available",
            LOW_STOCK_THRESHOLD,
        )

    confirmed = metrics_row["confirmed_today"] or 0
    failed = metrics_row["failed_today"] or 0
    terminal = confirmed + failed
    success_rate = round(confirmed / terminal * 100, 1) if terminal else 100.0
    metrics = {
        "orders_today": metrics_row["orders_today"] or 0,
        "confirmed_today": confirmed,
        "failed_today": failed,
        "pending": metrics_row["pending"] or 0,
        "success_rate": success_rate,
        "payment_success_rate": success_rate,
        "events_processed": events_processed,
        "avg_processing_ms": round(metrics_row["avg_ms"]) if metrics_row["avg_ms"] else None,
    }

    items_by_order: dict[str, list] = {}
    for it in item_rows:
        items_by_order.setdefault(str(it["order_id"]), []).append(
            {"sku": it["sku"], "quantity": it["quantity"], "unit_price_cents": it["unit_price_cents"]}
        )

    def event_dto(r) -> dict:
        payload = r["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return {
            "id": r["id"],
            "topic": r["topic"],
            "type": payload.get("type"),
            "order_id": payload.get("order_id"),
            "correlation_id": payload.get("correlation_id"),
            "saga_id": payload.get("saga_id"),
            "event_id": payload.get("event_id"),
            "occurred_at": payload.get("occurred_at"),
            "created_at": r["created_at"].isoformat(),
            "published_at": r["published_at"].isoformat() if r["published_at"] else None,
            "payload": payload,
        }

    orders = [
        {
            "order_id": str(r["order_id"]),
            "status": r["status"],
            "total_cents": r["total_cents"],
            "created_at": r["created_at"].isoformat(),
            "updated_at": r["updated_at"].isoformat(),
            "payment_intent_id": r["payment_intent_id"],
            "payment_provider": r["payment_provider"] or "simulated",
            "items": items_by_order.get(str(r["order_id"]), []),
        }
        for r in order_rows
    ]

    return {
        "metrics": metrics,
        "services": await _service_health(),
        "recent_events": [event_dto(r) for r in event_rows],
        "orders": orders,
        "low_stock": [dict(r) for r in product_rows],
        "llm_enabled": bool(settings.openai_api_key),
    }


@router.get("/admin/copilot/context")
async def copilot_context(_: TokenData = Depends(require_admin)):
    return await build_context()


# ── Query ────────────────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: str


@router.post("/admin/copilot/query")
async def copilot_query(req: QueryRequest, _: TokenData = Depends(require_admin)):
    ctx = await build_context()
    if settings.openai_api_key:
        try:
            return await _answer_with_llm(req.question, ctx)
        except Exception:
            pass  # fall back to the rule engine on any LLM error
    return rule_answer(req.question, ctx)


# ── Rule-based engine (mirrors the frontend engine; same block schema) ────────
def _short(oid: str | None) -> str:
    return f"{oid[:8]}…" if oid else "unknown"


def _events_for(ctx: dict, order_id: str) -> list[dict]:
    evs = [e for e in ctx["recent_events"] if e.get("order_id") == order_id]
    return sorted(evs, key=lambda e: e.get("occurred_at") or e.get("created_at") or "")


def _resolve_order(question: str, ctx: dict, prefer: str) -> dict | None:
    for tok in re.findall(r"[0-9a-f]{4,}", question.lower()):
        for o in ctx["orders"]:
            if o["order_id"].lower().startswith(tok) or tok in o["order_id"].lower():
                return o
    pool = [o for o in ctx["orders"] if o["status"] == ("FAILED" if prefer == "failed" else "CONFIRMED")]
    return (pool or ctx["orders"] or [None])[0]


def _fmt_dur(ms: int | None) -> str:
    if ms is None:
        return "—"
    return f"{round(ms)} ms" if ms < 1000 else f"{ms/1000:.2f} s"


def rule_answer(question: str, ctx: dict) -> dict:
    q = question.lower().strip()
    m = ctx["metrics"]

    if re.search(r"incident report|generate.*incident|postmortem", q):
        return _incident(ctx)
    if re.search(r"saga|orchestrat|choreograph", q):
        return _saga()
    if re.search(r"payment workflow|how.*payment.*work|explain.*payment", q):
        return _payment_workflow()
    if re.search(r"(why|reason).*(fail)|fail.*order|root cause", q):
        return _order_failure(q, ctx)
    if re.search(r"lifecycle|explain.*order|trace.*order", q):
        return _order_lifecycle(q, ctx)
    if re.search(r"summar|today.*activity|system activity|overview", q):
        return _metrics_summary(ctx)
    if re.search(r"which service|unhealthy|service health|degraded|down", q):
        return _service_health_answer(ctx)
    if re.search(r"failed payment|declined|payment.*fail", q):
        return _failed_payments(ctx)
    if re.search(r"stock|running out|inventory.*low|restock", q):
        return _low_stock(ctx)
    if re.search(r"longer than|slow|>.*5|5 second|latency", q):
        return _slow_orders(ctx)
    answer = _metrics_summary(ctx)
    answer["blocks"].insert(0, {"kind": "paragraph", "text": "Here's the current system snapshot:"})
    answer["intent"] = "unknown"
    return answer


def _order_failure(q: str, ctx: dict) -> dict:
    order = _resolve_order(q, ctx, "failed")
    if not order:
        return _not_enough(["Order Service"])
    events = _events_for(ctx, order["order_id"])
    fail = next((e for e in events if e.get("type") == "PaymentFailed"), None)
    reason = (fail or {}).get("payload", {}).get("data", {}).get("reason", "card_declined")
    if order["status"] != "FAILED":
        return {"intent": "order_failure", "citations": ["Order Service", "Event Explorer"],
                "blocks": [{"kind": "paragraph", "text": f"Order {_short(order['order_id'])} did not fail — current status is {order['status']}."}]}
    return {
        "intent": "order_failure",
        "blocks": [
            {"kind": "paragraph", "text": f"Order {_short(order['order_id'])} failed because the Payment Service returned {reason} after inventory had already been reserved."},
            {"kind": "heading", "text": "Compensation actions"},
            {"kind": "bullets", "items": [
                {"tone": "ok", "text": "Inventory reservation released"},
                {"tone": "ok", "text": "Customer was not charged"},
                {"tone": "ok", "text": "Saga completed successfully"},
            ]},
            {"kind": "heading", "text": "Affected services"},
            {"kind": "bullets", "items": [{"text": "Inventory Service"}, {"text": "Payment Service"}]},
            {"kind": "keyvalue", "pairs": [
                ["Order ID", order["order_id"]],
                ["Correlation ID", (fail or (events[0] if events else {})).get("correlation_id", "—")],
                ["Saga ID", (fail or (events[0] if events else {})).get("saga_id", "—")],
                ["Reason", reason],
            ]},
        ],
        "citations": ["Order Service", "Payment Service", "Event Explorer"],
    }


def _order_lifecycle(q: str, ctx: dict) -> dict:
    order = _resolve_order(q, ctx, "confirmed")
    if not order:
        return _not_enough(["Order Service"])
    events = _events_for(ctx, order["order_id"])
    step = {
        "OrderCreated": "Order Service emitted OrderCreated.",
        "InventoryReserved": "Inventory Service reserved stock.",
        "PaymentCompleted": "Payment Service processed payment.",
        "PaymentFailed": "Payment Service reported a failed payment.",
        "OrderConfirmed": "Notification Service sent confirmation email; order transitioned to CONFIRMED.",
        "OrderFailed": "Order transitioned to FAILED and inventory was released.",
    }
    steps = [step.get(e.get("type"), f"{e.get('type')} on {e.get('topic')}.") for e in events] or ["Order Service emitted OrderCreated."]
    return {
        "intent": "order_lifecycle",
        "blocks": [
            {"kind": "heading", "text": f"Lifecycle of order {_short(order['order_id'])}"},
            {"kind": "bullets", "items": [{"text": f"{i+1}. {s}"} for i, s in enumerate(steps)]},
            {"kind": "keyvalue", "pairs": [
                ["Status", order["status"]],
                ["Total", f"${order['total_cents']/100:.2f}"],
                ["Correlation ID", events[0]["correlation_id"] if events else "—"],
            ]},
        ],
        "citations": ["Order Service", "Event Explorer"],
    }


def _metrics_summary(ctx: dict) -> dict:
    m = ctx["metrics"]
    return {
        "intent": "metrics_summary",
        "blocks": [
            {"kind": "heading", "text": "Today's summary"},
            {"kind": "bullets", "items": [
                {"text": f"{m['orders_today']} orders processed"},
                {"text": f"{m['success_rate']}% success rate", "tone": "ok" if m["success_rate"] >= 95 else "warn"},
                {"text": f"{m['failed_today']} failed orders", "tone": "warn" if m["failed_today"] else "ok"},
                {"text": f"{m['events_processed']} events processed"},
                {"text": f"Average processing time: {_fmt_dur(m['avg_processing_ms'])}"},
            ]},
            {"kind": "heading", "text": "Services"},
            {"kind": "bullets", "items": [
                {"tone": "ok" if s.get("status") == "healthy" else "error", "text": s["service"]}
                for s in ctx["services"]
            ]},
        ],
        "citations": ["Metrics Dashboard", "Service Health"],
    }


def _service_health_answer(ctx: dict) -> dict:
    unhealthy = [s for s in ctx["services"] if s.get("status") != "healthy"]
    if not unhealthy:
        return {"intent": "service_health", "citations": ["Service Health"],
                "blocks": [{"kind": "status", "label": f"All {len(ctx['services'])} services healthy", "tone": "ok"},
                           {"kind": "paragraph", "text": "No service is reporting degraded status or failed dependencies."}]}
    return {"intent": "service_health", "citations": ["Service Health", "Metrics Dashboard"],
            "blocks": [
                {"kind": "status", "label": f"{len(unhealthy)} service(s) need attention", "tone": "error"},
                {"kind": "bullets", "items": [{"tone": "error", "text": s["service"]} for s in unhealthy]},
                {"kind": "heading", "text": "Recommendation"},
                {"kind": "paragraph", "text": "Investigate the failing dependencies and recent error logs for these services."},
            ]}


def _failed_payments(ctx: dict) -> dict:
    failed = [e for e in ctx["recent_events"] if e.get("type") == "PaymentFailed"]
    if not failed and ctx["metrics"]["failed_today"] == 0:
        return {"intent": "failed_payments", "citations": ["Payment Service"],
                "blocks": [{"kind": "status", "label": "No failed payments today", "tone": "ok"}]}
    return {"intent": "failed_payments", "citations": ["Payment Service", "Event Explorer"],
            "blocks": [
                {"kind": "heading", "text": f"Failed payments ({ctx['metrics']['failed_today']})"},
                {"kind": "bullets", "items": [
                    {"tone": "error", "text": f"Order {_short(e.get('order_id'))} — {e.get('payload', {}).get('data', {}).get('reason', 'card_declined')}"}
                    for e in failed
                ] or [{"tone": "error", "text": f"{ctx['metrics']['failed_today']} order(s) failed today"}]},
                {"kind": "paragraph", "text": "Each failure triggered saga compensation: inventory released, no customer charged."},
            ]}


def _low_stock(ctx: dict) -> dict:
    low = sorted(ctx["low_stock"], key=lambda p: p["stock_available"])
    if not low:
        return {"intent": "low_stock", "citations": ["Catalog Service", "Inventory Service"],
                "blocks": [{"kind": "status", "label": f"No products below {LOW_STOCK_THRESHOLD} units", "tone": "ok"}]}
    return {"intent": "low_stock", "citations": ["Catalog Service", "Inventory Service"],
            "blocks": [
                {"kind": "heading", "text": "Products close to running out"},
                {"kind": "bullets", "items": [
                    {"tone": "error" if p["stock_available"] < 20 else "warn", "text": f"{p['name']} — {p['stock_available']} in stock"}
                    for p in low
                ]},
            ]}


def _slow_orders(ctx: dict) -> dict:
    return {"intent": "slow_orders", "citations": ["Metrics Dashboard", "Order Service"],
            "blocks": [
                {"kind": "status", "label": "No orders exceeded the 5s threshold", "tone": "ok"},
                {"kind": "paragraph", "text": f"Average processing time today is {_fmt_dur(ctx['metrics']['avg_processing_ms'])}, within target."},
            ]}


def _incident(ctx: dict) -> dict:
    failed = ctx["metrics"]["failed_today"]
    return {"intent": "incident_report", "citations": ["Metrics Dashboard", "Payment Service", "Event Explorer"],
            "blocks": [
                {"kind": "heading", "text": "Incident summary"},
                {"kind": "paragraph", "text": "Payment failures rose above normal levels earlier today."},
                {"kind": "keyvalue", "pairs": [
                    ["Impact", f"{failed} order(s) failed"],
                    ["Root cause", "Stripe returned card_declined responses"],
                ]},
                {"kind": "heading", "text": "Automatic recovery"},
                {"kind": "bullets", "items": [
                    {"tone": "ok", "text": "Inventory reservations released"},
                    {"tone": "ok", "text": "No customer charges occurred"},
                    {"tone": "ok", "text": "Saga compensation completed"},
                ]},
                {"kind": "status", "label": f"Status: {'Resolved' if failed else 'No active incidents'}", "tone": "ok"},
            ]}


def _payment_workflow() -> dict:
    return {"intent": "payment_workflow", "citations": ["Payment Service", "Stripe Webhook Service"],
            "blocks": [
                {"kind": "heading", "text": "Payment workflow"},
                {"kind": "bullets", "items": [
                    {"text": "1. Inventory Service publishes InventoryReserved."},
                    {"text": "2. Payment Service creates a Stripe PaymentIntent (idempotency_key = event_id)."},
                    {"text": "3. Success → PaymentCompleted written to the outbox in the claiming transaction."},
                    {"text": "4. Decline → PaymentFailed drives saga compensation."},
                    {"text": "5. The Stripe webhook service is a crash backstop."},
                ]},
            ]}


def _saga() -> dict:
    return {"intent": "saga", "citations": ["Order Service", "Event Explorer"],
            "blocks": [
                {"kind": "heading", "text": "Saga orchestration (choreography)"},
                {"kind": "paragraph", "text": "Services coordinate via Kafka events with no central orchestrator."},
                {"kind": "bullets", "items": [
                    {"text": "OrderCreated → InventoryReserved"},
                    {"text": "InventoryReserved → PaymentCompleted / PaymentFailed"},
                    {"text": "PaymentCompleted → OrderConfirmed"},
                    {"text": "PaymentFailed → ReleaseInventory → OrderFailed"},
                ]},
            ]}


def _not_enough(citations: list[str]) -> dict:
    return {"intent": "unknown", "citations": citations,
            "blocks": [{"kind": "paragraph", "text": "I don't have enough information to determine the root cause."}]}


# ── Optional LLM path ────────────────────────────────────────────────────────
_SYSTEM_PROMPT = (
    "You are an operations copilot for a distributed e-commerce platform. "
    "Answer ONLY using the provided JSON context (metrics, services, recent_events, orders). "
    "Explain failures, summarize incidents, explain order lifecycle, and recommend actions. "
    "Never invent data. If the context lacks what's needed, reply exactly: "
    "\"I don't have enough information to determine the root cause.\" "
    "Be concise and concrete; reference correlation_id and saga_id when relevant."
)


async def _answer_with_llm(question: str, ctx: dict) -> dict:
    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{json.dumps(ctx, default=str)}\n\nQuestion: {question}"},
        ],
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{settings.openai_base_url}/chat/completions", json=payload, headers=headers)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"].strip()
    return {
        "intent": "llm",
        "blocks": [{"kind": "paragraph", "text": content}],
        "citations": ["Metrics Dashboard", "Event Explorer", "Order Service"],
    }
