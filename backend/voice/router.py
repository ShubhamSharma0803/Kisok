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
from core.enums import HandoffReason
from core.handoff_router import perform_handoff
from core.ws_manager import manager
from core.events import EventType
from core.orchestrator import increment_successful_action

from voice import stt, llm, tts
from voice import pending_actions

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


def _apply_intent(
    db: DBSession,
    order: Order,
    action: str,
    intent: dict,
    detected_lang: str,
) -> str:
    """Apply a parsed (or pending) intent to the order. Returns spoken reply text."""
    if action == "add_item":
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
        return "Added to your order. Anything else, or shall I read your total?"

    if action == "modify_item":
        existing_items_map = {item.menu_item_id: item for item in order.items}
        for mod_item in intent.get("items", []):
            item_id = mod_item.get("id")
            if item_id in existing_items_map:
                order_item = existing_items_map[item_id]
                if "quantity" in mod_item and mod_item["quantity"] is not None:
                    order_item.quantity = mod_item["quantity"]
                if "modifiers" in mod_item and mod_item["modifiers"] is not None:
                    order_item.modifiers = ", ".join(mod_item["modifiers"]) or None
            else:
                menu_item = MENU_LOOKUP.get(item_id)
                if menu_item:
                    order_item = OrderItem(
                        order_id=order.id,
                        menu_item_id=item_id,
                        item_name=menu_item["name"],
                        unit_price=menu_item["price"],
                        quantity=mod_item.get("quantity", 1),
                        modifiers=", ".join(mod_item.get("modifiers", [])) or None,
                    )
                    db.add(order_item)
        db.commit()
        db.refresh(order)
        return "Updated your order. Anything else?"

    if action == "remove_item":
        remove_ids = {i["id"] for i in intent.get("items", [])}
        for order_item in list(order.items):
            if order_item.menu_item_id in remove_ids:
                db.delete(order_item)
        db.commit()
        db.refresh(order)
        return "Removed that item. Anything else?"

    if action == "confirm_order":
        if order.items:
            cart_for_tts = _cart_from_order(order)
            summary, _total = tts.build_confirmation_text(
                cart_for_tts, MENU_LOOKUP, lang=detected_lang
            )
            return summary
        return "Your cart is empty. What would you like to order?"

    if action == "cancel_order":
        for order_item in list(order.items):
            db.delete(order_item)
        db.commit()
        db.refresh(order)
        return "Order cancelled. Starting fresh."

    return "Sorry, I didn't understand that."


# ---- TTS Failure Tracking ----
_consecutive_tts_failures: dict[str, int] = {}

def _record_tts_success(session_id: str):
    _consecutive_tts_failures[session_id] = 0

def _record_tts_failure(session_id: str) -> int:
    count = _consecutive_tts_failures.get(session_id, 0) + 1
    _consecutive_tts_failures[session_id] = count
    return count


async def _synthesize_and_narrate(
    session_id: str,
    text: str,
    lang: str = "en",
    source: str = "voice_reply",
) -> str:
    """
    Synthesizes TTS audio for text, tracks failure threshold,
    emits screen_narration WS event for always-on captions,
    and returns base64 audio string (or empty string on failure).
    """
    import base64
    tts_b64 = ""
    if not text:
        return tts_b64

    tts_audio = tts.speak(text, lang=lang)
    if tts_audio:
        tts_b64 = base64.b64encode(tts_audio).decode()
        _record_tts_success(session_id)
    else:
        fail_count = _record_tts_failure(session_id)
        if fail_count >= 2:
            await manager.send_event(
                session_id,
                EventType.error,
                {
                    "source": "tts",
                    "message": "Voice audio output is unavailable. Captions and touch controls remain active.",
                },
            )

    await manager.send_event(
        session_id,
        EventType.screen_narration,
        {
            "text": text,
            "tts_audio_b64": tts_b64,
            "source": source,
            "highlight_target": None,
        },
    )
    return tts_b64


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
    - TTS audio reply (base64-encoded MP3) — optional

    Also emits WebSocket events: voice_transcript, order_updated, screen_narration, error.
    """
    session = _get_session_or_404(db, session_id)
    order = _get_or_create_order(db, session_id)
    order_data = _order_response(order)

    # Save uploaded audio to a temp file for Gladia
    suffix = Path(audio.filename).suffix if audio.filename else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # ---- Step 1: Speech-to-text ----
        transcript = ""
        detected_lang = "en"
        try:
            stt_result = stt.transcribe(tmp_path)
            transcript = stt_result.get("text", "")
            detected_lang = stt_result.get("language", "en")
        except Exception as e:
            print(f"[voice] STT failed: {e}")
            fallback_msg = "Sorry, I couldn't hear that clearly. Please try again."
            
            # Emit WS error event with source: stt
            await manager.send_event(
                session_id,
                EventType.error,
                {
                    "source": "stt",
                    "message": fallback_msg,
                },
            )

            # Generate TTS fallback if possible and emit screen_narration for captions
            tts_b64 = await _synthesize_and_narrate(session_id, fallback_msg, lang="en")

            return {
                "status": "ok",
                "transcript": "",
                "language": "en",
                "intent": {
                    "action": "unclear",
                    "items": [],
                    "needs_clarification": True,
                    "clarification_question": fallback_msg,
                    "confidence": 0.0,
                },
                "action": "unclear",
                "message": fallback_msg,
                "order": order_data,
                "tts_audio_b64": tts_b64,
            }

        # Emit transcript event via WebSocket
        await manager.send_event(
            session_id,
            EventType.voice_transcript,
            {"transcript": transcript, "language": detected_lang},
        )

        if not transcript:
            reply = "I didn't catch any speech — try again?"
            tts_b64 = await _synthesize_and_narrate(session_id, reply, lang=detected_lang or "en")
            return {
                "status": "ok",
                "transcript": "",
                "language": detected_lang or "en",
                "intent": {
                    "action": "unclear",
                    "items": [],
                    "needs_clarification": True,
                    "clarification_question": reply,
                    "confidence": 0.0,
                },
                "action": "unclear",
                "message": reply,
                "order": order_data,
                "tts_audio_b64": tts_b64,
            }

        # ---- Step 2: Resolve pending destructive confirmation OR parse new intent ----
        cart_state = _cart_from_order(order)
        intent = None
        action = "unclear"
        reply = ""
        skip_tts = False

        pending = pending_actions.get_pending(session_id)
        if pending:
            classification = pending_actions.classify_confirmation_response(transcript)
            if classification == "affirmative":
                pending_actions.clear_pending(session_id)
                action = pending["action"]
                intent = {
                    "action": action,
                    "items": pending.get("items", []),
                    "needs_clarification": False,
                }
                reply = _apply_intent(db, order, action, intent, detected_lang)
            elif classification == "negative":
                pending_actions.clear_pending(session_id)
                action = "confirmation_declined"
                intent = {"action": action, "needs_clarification": False}
                reply = "Okay, no changes were made to your order. What else would you like?"
            else:
                pending_actions.clear_pending(session_id)

        if intent is None:
            try:
                intent = llm.parse_order_intent(transcript, MENU, cart_state)
            except Exception as e:
                print(f"[voice] LLM failed: {e}")
                fallback_msg = "Sorry, I had trouble understanding that. Please try rephrasing or use touch ordering."
                
                # Emit WS error event with source: llm
                await manager.send_event(
                    session_id,
                    EventType.error,
                    {
                        "source": "llm",
                        "message": fallback_msg,
                    },
                )

                tts_b64 = await _synthesize_and_narrate(session_id, fallback_msg, lang=detected_lang or "en")

                return {
                    "status": "ok",
                    "transcript": transcript,
                    "language": detected_lang or "en",
                    "intent": {
                        "action": "unclear",
                        "items": [],
                        "needs_clarification": True,
                        "clarification_question": fallback_msg,
                        "confidence": 0.0,
                    },
                    "action": "unclear",
                    "message": fallback_msg,
                    "order": order_data,
                    "tts_audio_b64": tts_b64,
                }

            action = intent.get("action", "unclear")

            if intent.get("needs_clarification") or action == "unclear":
                if action in ("remove_item", "cancel_order") and intent.get("needs_clarification"):
                    pending_actions.set_pending(
                        session_id,
                        action,
                        intent.get("items", []),
                        intent.get("clarification_question", ""),
                    )
                reply = intent.get("clarification_question", "Sorry, could you say that again?")

            elif action == "add_item":
                reply = _apply_intent(db, order, action, intent, detected_lang)
                increment_successful_action(session_id)

            elif action == "modify_item":
                reply = _apply_intent(db, order, action, intent, detected_lang)
                increment_successful_action(session_id)

            elif action == "remove_item":
                reply = _apply_intent(db, order, action, intent, detected_lang)
                increment_successful_action(session_id)

            elif action == "confirm_order":
                reply = _apply_intent(db, order, action, intent, detected_lang)
                increment_successful_action(session_id)

            elif action == "cancel_order":
                reply = _apply_intent(db, order, action, intent, detected_lang)

            elif action == "navigate_menu":
                await manager.send_event(session_id, EventType.navigate, {"target": "menu"})
                reply = "Sure, taking you to the menu."

            elif action == "navigate_order":
                await manager.send_event(session_id, EventType.navigate, {"target": "order"})
                reply = "Here is your current order."

            elif action == "navigate_start":
                await manager.send_event(session_id, EventType.navigate, {"target": "start"})
                reply = "Taking you back to the start screen."

            elif action == "request_help":
                await perform_handoff(db, session_id, HandoffReason.manual, "voice_requested")
                reply = "I am notifying a team member to assist you right away. Someone will be with you shortly."

            elif action == "repeat_narration":
                await manager.send_event(
                    session_id,
                    EventType.screen_narration,
                    {
                        "request_repeat": True,
                        "text": "",
                        "tts_audio_b64": "",
                        "source": "voice_request",
                        "highlight_target": None,
                    },
                )
                reply = ""
                skip_tts = True

            else:
                reply = "Sorry, I didn't understand that."

        # Emit order_updated event via WebSocket
        order_data = _order_response(order)
        await manager.send_event(session_id, EventType.order_updated, order_data)

        # ---- Step 4: Text-to-speech reply ----
        tts_b64 = ""
        if not skip_tts and reply:
            tts_b64 = await _synthesize_and_narrate(session_id, reply, lang=detected_lang or "en")

        return {
            "status": "ok",
            "transcript": transcript,
            "language": detected_lang,
            "intent": intent,
            "action": action,
            "message": reply,
            "order": order_data,
            "tts_audio_b64": tts_b64,
        }

    finally:
        if os.path.exists(tmp_path):
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


