"""
Intent parsing module using Groq (llama-3.3-70b-versatile).

NOTE: The locked architecture doc (Section 11.2) specifies OpenAI gpt-4o-mini.
This file is temporarily using Groq instead because:
  - Groq's free tier requires no card/billing setup
  - OpenAI requires a prepaid credit balance before gpt-4o-mini calls work
  - Groq was already proven working in this project (tested earlier — correctly
    parsed Hinglish orders into structured JSON)

Swapping back to OpenAI later is a small, contained change (see the commented
block at the bottom) once the team decides on a funding approach for API costs.

Job of this module either way: take a raw (possibly Hinglish, possibly messy)
transcript and turn it into a structured order action the backend/UI can act on.
"""

import os
import json
from groq import Groq
from core.config import settings

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)
    return _client

SYSTEM_PROMPT = """You are the order-parsing brain for an accessible voice kiosk.
Users speak in English, Hindi, or a mix of both (Hinglish). Menu item names
may come to you transliterated, misspelled, or partially in Hindi script —
match them to the closest real menu item by meaning, not exact spelling.

You will be given:
1. The current menu (JSON list of items with id, name, name_hi, price, modifiers)
2. The current cart state (what's already been ordered so far)
3. The user's latest spoken transcript

Return ONLY valid JSON (no markdown, no preamble, no explanation) in this exact shape:

{
  "action": "add_item" | "remove_item" | "modify_item" | "confirm_order" | "cancel_order" | "unclear",
  "items": [
    {"id": "<menu item id>", "quantity": <int>, "modifiers": ["<modifier strings>"]}
  ],
  "needs_clarification": true | false,
  "clarification_question": "<question to ask the user, in the SAME language mix they used, or empty string>",
  "confidence": <float 0.0 to 1.0>
}

Rules:
- If the user's request is ambiguous (e.g. item not found, quantity unclear), set
  needs_clarification=true and action="unclear", and write a short clarification
  question in the same language style the user used.
- If confidence is below 0.6, treat it as needs_clarification=true.
- "items" should be empty for actions like confirm_order/cancel_order.
- Never invent a menu item id that isn't in the provided menu.
- Keep clarification_question short — it will be read aloud by TTS.
"""


def parse_order_intent(transcript: str, menu: dict, cart_state: list) -> dict:
    """
    Sends transcript + context to Groq and returns parsed structured intent.

    Falls back to a safe "unclear" response if the model output isn't valid JSON,
    since a kiosk should never crash mid-order because of a parsing hiccup.
    """
    user_content = json.dumps({
        "menu": menu["items"],
        "current_cart": cart_state,
        "transcript": transcript,
    }, ensure_ascii=False)

    response = _get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        max_tokens=500,
    )

    raw = response.choices[0].message.content.strip()

    # Strip accidental markdown fences, since models sometimes add them anyway
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {
            "action": "unclear",
            "items": [],
            "needs_clarification": True,
            "clarification_question": "Sorry, I didn't catch that. Could you repeat your order?",
            "confidence": 0.0,
        }

    return parsed


# ---------------------------------------------------------------------------
# TO SWITCH BACK TO OPENAI LATER (once billing is sorted), replace the two
# lines below and change client.chat.completions.create(...) to add:
#     response_format={"type": "json_object"}
# and drop the "no markdown" fence-stripping block above (OpenAI's json_object
# mode guarantees clean JSON, so it isn't needed).
#
# from openai import OpenAI
# client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
# model="gpt-4o-mini"  (instead of "llama-3.3-70b-versatile")
# ---------------------------------------------------------------------------
