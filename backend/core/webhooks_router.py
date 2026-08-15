import json
import logging

import razorpay  # type: ignore[import-untyped]
from fastapi import APIRouter, Request, HTTPException

from core.config import settings
from core.database import SessionLocal
from core.models import Order
from core.enums import OrderStatus
from core.ws_manager import manager
from core.events import EventType

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    # 1. Read the raw body (bytes) — needed for signature verification
    raw_body = await request.body()

    # 2. Read the signature header
    signature = request.headers.get("X-Razorpay-Signature", "")

    # 3. Verify the webhook signature using the Razorpay SDK
    client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    try:
        client.utility.verify_webhook_signature(
            raw_body.decode("utf-8"),
            signature,
            settings.razorpay_webhook_secret,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    # 4. Parse the raw body as JSON
    payload = json.loads(raw_body)

    # 5. Ignore events we don't care about
    event = payload.get("event", "")
    if event != "payment_link.paid":
        return {"status": "ignored"}

    # 6. Extract the payment_link_id
    payment_link_id = payload["payload"]["payment_link"]["entity"]["id"]

    # 7. Look up the Order by payment_link_id
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.payment_link_id == payment_link_id).first()
        if not order:
            logger.warning(
                "Razorpay webhook: no order found for payment_link_id=%s",
                payment_link_id,
            )
            return {"status": "order_not_found"}

        # 8. Idempotency check — only update if not already paid
        if order.status != OrderStatus.paid:
            order.status = OrderStatus.paid
            db.commit()
            db.refresh(order)

            await manager.send_event(
                order.session_id,
                EventType.order_paid,
                {"order_id": order.id, "payment_link_id": payment_link_id},
            )

        # 9. Return success
        return {"status": "success"}
    finally:
        db.close()
