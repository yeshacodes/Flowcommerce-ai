import asyncio
import logging

from shared.events import Event, Topics
from shared.kafka_utils import run_consumer
from shared.metrics import EVENTS, serve_metrics
from shared.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("notification-service")

SERVICE = "notification-service"

_resend_enabled = bool(settings.resend_api_key)

if _resend_enabled:
    import resend
    resend.api_key = settings.resend_api_key
    log.info("Resend email notifications enabled (from=%s)", settings.from_email)
else:
    log.info("RESEND_API_KEY not set — email notifications disabled, will log only")


def _fmt(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def _confirmed_html(order_id: str, total_cents: int) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
      <h1 style="font-size:22px;color:#16a34a;margin:0 0 8px">Order confirmed ✓</h1>
      <p style="color:#374151;margin:0 0 24px">
        Your order has been confirmed and is being processed.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="color:#6b7280;padding:6px 0;font-size:14px">Order ID</td>
          <td style="color:#111827;font-family:monospace;font-size:13px;text-align:right">{order_id}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:6px 0;font-size:14px">Total</td>
          <td style="color:#111827;font-weight:bold;text-align:right">{_fmt(total_cents)}</td>
        </tr>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin:0">— FlowCommerce AI</p>
    </div>
    """


def _failed_html(order_id: str, reason: str) -> str:
    reason_label = {
        "card_declined": "Your card was declined.",
        "payment_failed": "Payment could not be processed.",
        "inventory_failed": "One or more items went out of stock.",
    }.get(reason, "An unexpected error occurred.")

    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
      <h1 style="font-size:22px;color:#dc2626;margin:0 0 8px">Order could not be completed</h1>
      <p style="color:#374151;margin:0 0 24px">{reason_label}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="color:#6b7280;padding:6px 0;font-size:14px">Order ID</td>
          <td style="color:#111827;font-family:monospace;font-size:13px;text-align:right">{order_id}</td>
        </tr>
      </table>
      <p style="color:#374151;font-size:14px">
        No charge has been made. Please try again or contact support.
      </p>
      <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">— FlowCommerce AI</p>
    </div>
    """


def _send_email_sync(to: str, subject: str, html: str) -> None:
    resend.Emails.send({
        "from": settings.from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    })


async def _send_email(to: str, subject: str, html: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email_sync, to, subject, html)


async def main():
    serve_metrics(8003)

    async def handle(event: Event, topic: str) -> None:
        order_id = event.order_id
        customer_email = event.data.get("customer_email")
        total_cents = event.data.get("total_cents", 0)
        reason = event.data.get("reason", "")

        log.info("NOTIFY order=%s type=%s email=%s", order_id, event.type, customer_email or "none")
        EVENTS.labels(SERVICE, event.type, "ok").inc()

        if not _resend_enabled:
            return

        if not customer_email:
            log.warning("No customer_email in event %s — skipping email", event.event_id)
            return

        try:
            if topic == Topics.ORDER_CONFIRMED.value:
                await _send_email(
                    customer_email,
                    f"Your order has been confirmed — {_fmt(total_cents)}",
                    _confirmed_html(order_id, total_cents),
                )
                log.info("Confirmation email sent → %s", customer_email)

            elif topic == Topics.ORDER_FAILED.value:
                await _send_email(
                    customer_email,
                    "Your FlowCommerce order could not be completed",
                    _failed_html(order_id, reason),
                )
                log.info("Failure email sent → %s", customer_email)

        except Exception:
            # Never let an email failure break the saga or block Kafka offset commit
            log.exception("Email send failed for order %s — continuing", order_id)

    await run_consumer([Topics.ORDER_CONFIRMED, Topics.ORDER_FAILED], SERVICE, handle)


if __name__ == "__main__":
    asyncio.run(main())
