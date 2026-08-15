import logging
import razorpay  # type: ignore[import-untyped]
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from core.config import settings
from core.database import get_db
from core.models import Session, Order, OrderItem, MenuItem
from core.schemas import (
    OrderResponse,
    MenuItemResponse,
    AddItemRequest,
    UpdateItemQuantityRequest,
)
from core.ws_manager import manager
from core.events import EventType
from core.enums import OrderStatus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["orders"])

def _order_response(order: Order) -> dict:
    total = sum(item.unit_price * item.quantity for item in order.items)
    return {
        "id": order.id,
        "session_id": order.session_id,
        "status": order.status,
        "items": order.items,
        "total": total,
        "updated_at": order.updated_at,
    }

def _get_or_create_order(db: DBSession, session_id: str) -> Order:
    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        order = Order(session_id=session_id)
        db.add(order)
        db.commit()
        db.refresh(order)
    return order

@router.get("/menu", response_model=list[MenuItemResponse])
def list_menu(db: DBSession = Depends(get_db)):
    return db.query(MenuItem).all()

@router.get("/sessions/{session_id}/orders", response_model=OrderResponse)
def get_order(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    order = _get_or_create_order(db, session_id)
    return _order_response(order)

@router.post("/sessions/{session_id}/orders/items", response_model=OrderResponse)
async def add_item(session_id: str, body: AddItemRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    menu_item = db.query(MenuItem).filter(MenuItem.id == body.menu_item_id).first()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    order = _get_or_create_order(db, session_id)

    # Prevent duplicate rows: check if menu_item_id + modifiers already exists in order
    existing_item = None
    for item in order.items:
        if item.menu_item_id == menu_item.id and item.modifiers == body.modifiers:
            existing_item = item
            break

    if existing_item:
        existing_item.quantity += body.quantity
    else:
        item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            item_name=menu_item.name,
            unit_price=menu_item.price,
            quantity=body.quantity,
            modifiers=body.modifiers,
        )
        db.add(item)

    db.commit()
    db.refresh(order)

    response = _order_response(order)
    await manager.send_event(session_id, EventType.order_updated, response)
    return response


@router.patch("/sessions/{session_id}/orders/items/{item_id}", response_model=OrderResponse)
async def update_item_quantity(
    session_id: str,
    item_id: str,
    body: UpdateItemQuantityRequest,
    db: DBSession = Depends(get_db),
):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Cannot modify order items after the order has been confirmed.")

    order_item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).first()

    if not order_item:
        raise HTTPException(status_code=404, detail="Order item not found")

    if body.quantity > 0:
        order_item.quantity = body.quantity
    else:
        db.delete(order_item)

    db.commit()
    db.refresh(order)

    response = _order_response(order)
    await manager.send_event(session_id, EventType.order_updated, response)
    return response


@router.delete("/sessions/{session_id}/orders/items/{item_id}", response_model=OrderResponse)
async def delete_item(
    session_id: str,
    item_id: str,
    db: DBSession = Depends(get_db),
):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Cannot modify order items after the order has been confirmed.")

    order_item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).first()

    if not order_item:
        raise HTTPException(status_code=404, detail="Order item not found")

    db.delete(order_item)
    db.commit()
    db.refresh(order)

    response = _order_response(order)
    await manager.send_event(session_id, EventType.order_updated, response)
    return response


@router.post("/sessions/{session_id}/confirm-order", response_model=OrderResponse)
async def confirm_order(session_id: str, db: DBSession = Depends(get_db)):
    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if len(order.items) == 0:
        raise HTTPException(status_code=400, detail="Cannot confirm an empty order.")

    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Order has already been confirmed or paid.")

    order.status = OrderStatus.confirmed
    db.commit()
    db.refresh(order)

    response = _order_response(order)
    await manager.send_event(session_id, EventType.order_confirmed, response)
    return response


@router.post("/sessions/{session_id}/create-payment")
async def create_payment(session_id: str, db: DBSession = Depends(get_db)):
    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order.status != OrderStatus.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Order must be confirmed before payment can be created.",
        )

    # Calculate total in rupees and convert to paise
    amount_rupees = sum(item.unit_price * item.quantity for item in order.items)
    amount_paise = int(amount_rupees * 100)

    # Initialize Razorpay client and create payment link
    client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    try:
        payment_link = client.payment_link.create({
            "amount": amount_paise,
            "currency": "INR",
            "accept_partial": False,
            "description": f"Kiosk Order {order.id}",
            "callback_url": "https://example.com/payment-complete",
            "callback_method": "get",
        })
    except Exception as e:
        logger.error("Razorpay payment link creation failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Failed to create payment link. Please try again.",
        )

    # Persist the payment link details on the order
    order.payment_link_id = payment_link["id"]
    order.payment_link_url = payment_link["short_url"]
    db.commit()

    return {
        "order_id": order.id,
        "payment_link_url": payment_link["short_url"],
        "amount_rupees": amount_rupees,
    }