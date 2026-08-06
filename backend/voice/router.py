"""
FastAPI router for voice ordering endpoints.

Exposes the STT → LLM → TTS pipeline as REST endpoints that the frontend
(or any client) can call. Bridges voice intents to the existing Orders DB
and emits WebSocket events for real-time UI updates.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session as DBSession

from core.database import get_db
from core.models import Session, Order, OrderItem, MenuItem
from core.ws_manager import manager
from core.events import EventType

from voice import stt, llm, tts

router = APIRouter(prefix="/sessions/{session_id}/voice", tags=["voice"])

# ---- Load the static menu for LLM reference ----
_MENU_PATH = Path(__file__).parent / "menu.json"
with open(_MENU_PATH, "r", encoding="utf-8") as f:
    MENU = json.load(f)
MENU_LOOKUP = {item["id"]: item for item in MENU["items"]}


# ---- Helpers ----

def _get_session_or_404(db: DBSession, session_id: str) -> Session:
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _get_or_create_order(db: DBSession, session_id: str) -> Order:
    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        order = Order(session_id=session_id)
        db.add(order)
        db.commit()
        db.refresh(order)
    return order


def _cart_from_order(order: Order) -> list:
    """Convert DB OrderItems into the cart format the LLM expects."""
    cart = []
    for item in order.items:
        cart.append({
            "id": item.menu_item_id,
            "quantity": item.quantity,
            "modifiers": item.modifiers.split(", ") if item.modifiers else [],
        })
    return cart


def _order_response(order: Order) -> dict:
    """Build a JSON-serialisable order summary."""
    total = sum(item.unit_price * item.quantity for item in order.items)
    return {
        "id": order.id,
        "session_id": order.session_id,
        "items": [
            {
                "id": item.id,
                "menu_item_id": item.menu_item_id,
                "item_name": item.item_name,
                "unit_price": item.unit_price,
                "quantity": item.quantity,
                "modifiers": item.modifiers,
            }
            for item in order.items
        ],
        "total": total,
    }


# ---- Endpoints ----

@router.post("")
async def process_voice(
    session_id: str,
    audio: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """
    Main voice ordering endpoint.

    Accepts an audio file upload, runs the full STT → LLM → TTS pipeline,
    updates the order in the database, and returns:
    - The transcript
    - The parsed intent and action taken
    - The updated cart
    - A reply message (text)
    - TTS audio reply (base64-encoded MP3) — optional, set ?tts=false to skip

    Also emits WebSocket events: voice_transcript, order_updated.
    """
    session = _get_session_or_404(db, session_id)
    order = _get_or_create_order(db, session_id)

    # Save uploaded audio to a temp file for Gladia
    suffix = Path(audio.filename).suffix if audio.filename else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # ---- Step 1: Speech-to-text ----
        try:
            stt_result = stt.transcribe(tmp_path)
        except (TimeoutError, Exception) as e:
            print(f"[voice] STT failed: {e}")
            error_msg = (
                "That took too long — the voice service might be slow right now. "
                "Please try speaking again."
            )
            tts_audio = tts.speak(error_msg, lang="en")
            import base64
            return {
                "status": "stt_error",
                "message": error_msg,
                "tts_audio_b64": base64.b64encode(tts_audio).decode(),
            }

        transcript = stt_result["text"]
        detected_lang = stt_result["language"]

        # Emit transcript event via WebSocket
        await manager.send_event(
            session_id,
            EventType.voice_transcript,
            {"transcript": transcript, "language": detected_lang},
        )

        if not transcript:
            reply = "I didn't catch any speech — try again?"
            tts_audio = tts.speak(reply, lang="en")
            import base64
            return {
                "status": "empty_transcript",
                "transcript": "",
                "message": reply,
                "tts_audio_b64": base64.b64encode(tts_audio).decode(),
            }

        # ---- Step 2: LLM intent parsing ----
        cart_state = _cart_from_order(order)
        try:
            intent = llm.parse_order_intent(transcript, MENU, cart_state)
        except Exception as e:
            print(f"[voice] LLM failed: {e}")
            reply = "Sorry, I had trouble understanding that. Could you repeat your order?"
            tts_audio = tts.speak(reply, lang=detected_lang)
            import base64
            return {
                "status": "llm_error",
                "transcript": transcript,
                "message": reply,
                "tts_audio_b64": base64.b64encode(tts_audio).decode(),
            }

        # ---- Step 3: Apply the intent to the DB order ----
        action = intent.get("action", "unclear")
        reply = ""

        if intent.get("needs_clarification") or action == "unclear":
            reply = intent.get("clarification_question", "Sorry, could you say that again?")

        elif action == "add_item":
            for new_item in intent.get("items", []):
                menu_item = MENU_LOOKUP.get(new_item["id"])
                if not menu_item:
                    continue
                order_item = OrderItem(
                    order_id=order.id,
                    menu_item_id=new_item["id"],
                    item_name=menu_item["name"],
                    unit_price=menu_item["price"],
                    quantity=new_item.get("quantity", 1),
                    modifiers=", ".join(new_item.get("modifiers", [])) or None,
                )
                db.add(order_item)
            db.commit()
            db.refresh(order)
            reply = "Added to your order. Anything else, or shall I read your total?"

        elif action == "remove_item":
            remove_ids = {i["id"] for i in intent.get("items", [])}
            for order_item in list(order.items):
                if order_item.menu_item_id in remove_ids:
                    db.delete(order_item)
            db.commit()
            db.refresh(order)
            reply = "Removed that item. Anything else?"

        elif action == "confirm_order":
            if order.items:
                cart_for_tts = _cart_from_order(order)
                summary, total = tts.build_confirmation_text(
                    cart_for_tts, MENU_LOOKUP, lang=detected_lang
                )
                reply = summary
            else:
                reply = "Your cart is empty. What would you like to order?"

        elif action == "cancel_order":
            for order_item in list(order.items):
                db.delete(order_item)
            db.commit()
            db.refresh(order)
            reply = "Order cancelled. Starting fresh."

        else:
            reply = "Sorry, I didn't understand that."

        # Emit order_updated event via WebSocket
        order_data = _order_response(order)
        await manager.send_event(session_id, EventType.order_updated, order_data)

        # ---- Step 4: Text-to-speech reply ----
        tts_audio = tts.speak(reply, lang=detected_lang)

        import base64
        return {
            "status": "ok",
            "transcript": transcript,
            "language": detected_lang,
            "intent": intent,
            "action": action,
            "message": reply,
            "order": order_data,
            "tts_audio_b64": base64.b64encode(tts_audio).decode(),
        }

    finally:
        os.unlink(tmp_path)


@router.get("/cart")
async def get_voice_cart(
    session_id: str,
    db: DBSession = Depends(get_db),
):
    """Returns the current cart/order state for a session."""
    _get_session_or_404(db, session_id)
    order = _get_or_create_order(db, session_id)
    return _order_response(order)


@router.post("/reset")
async def reset_voice_order(
    session_id: str,
    db: DBSession = Depends(get_db),
):
    """Clears all items from the session's order."""
    _get_session_or_404(db, session_id)
    order = _get_or_create_order(db, session_id)
    for item in list(order.items):
        db.delete(item)
    db.commit()
    db.refresh(order)

    await manager.send_event(
        session_id,
        EventType.order_updated,
        _order_response(order),
    )

    return {"status": "reset", "message": "Order cleared."}
