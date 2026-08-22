"""
Screen narration engine.

- Caches by state hash (screen + context + image prefix).
- Template path: < 50 ms, no external API.
- Vision path: ~300–1200 ms via Groq/OpenAI (only if screenshot provided).
- Always falls back to template on VLM failure.
- Calls Person 1's gTTS directly (voice.tts.speak).
"""

import asyncio
import base64
import hashlib
import os
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass

from voice.tts import speak

try:
    from vision.vlm_client import VLMClient
    _vlm = VLMClient()
except Exception:
    _vlm = None


# -----------------------------------------------------------------------------
# Cache
# -----------------------------------------------------------------------------

@dataclass
class _Entry:
    result: dict
    ts: datetime
    hits: int = 0


_cache: Dict[str, _Entry] = {}
_CACHE_TTL = timedelta(seconds=300)
_MAX_CACHE = 200


def _prune():
    if len(_cache) <= _MAX_CACHE:
        return
    for k, _ in sorted(_cache.items(), key=lambda x: x[1].ts)[: len(_cache) - _MAX_CACHE]:
        del _cache[k]


def _state_hash(screen: str, ctx: Dict[str, Any], img_b64: Optional[str]) -> str:
    """Deterministic hash. Uses image length + head to avoid hashing massive b64."""
    ctx_s = str(sorted(ctx.items())) if ctx else ""
    img_s = f"len={len(img_b64 or '')};head={(img_b64 or '')[:200]}"
    payload = f"{screen}|{ctx_s}|{img_s}"
    return hashlib.blake2b(payload.encode(), digest_size=16).hexdigest()


def _get_cached(h: str) -> Optional[dict]:
    e = _cache.get(h)
    if not e:
        return None
    if datetime.utcnow() - e.ts > _CACHE_TTL:
        del _cache[h]
        return None
    e.hits += 1
    return dict(e.result)


def _set_cached(h: str, result: dict):
    _prune()
    _cache[h] = _Entry(result=dict(result), ts=datetime.utcnow())


# -----------------------------------------------------------------------------
# Templates (fast path)
# -----------------------------------------------------------------------------

_TEMPLATES = {
    "start": "Welcome to Kiosk Vision. Tap start to begin, or say 'start ordering'.",
    "menu": "You are browsing the {category} menu. {count} dishes shown. Current total is {total} rupees. Tap a dish to add it, or say its name.",
    "cart": "Order review. You have {item_count} items for {total} rupees. Tap review to pay, or keep shopping.",
    "gaze": "Gaze calibration. Look at each target on screen to set up eye tracking.",
    "handoff": "A human assistant will help you shortly. Please wait.",
    "payment": "Payment screen. Total is {total} rupees. Follow the instructions on screen.",
    "default": "You are on the {screen} screen. Use touch or voice to navigate.",
}


def _template(screen: str, ctx: Dict[str, Any]) -> str:
    tmpl = _TEMPLATES.get(screen, _TEMPLATES["default"])
    safe = {
        "screen": screen,
        "category": ctx.get("category", "all"),
        "count": ctx.get("count", 0),
        "total": ctx.get("total", 0),
        "item_count": ctx.get("item_count", 0),
    }
    try:
        return tmpl.format(**safe)
    except KeyError:
        return _TEMPLATES["default"].format(screen=screen)


# -----------------------------------------------------------------------------
# Public API
# -----------------------------------------------------------------------------

async def narrate(
    screen: str,
    context: Dict[str, Any],
    screenshot_b64: Optional[str] = None,
    prefer_vision: bool = False,
    lang: str = "en",
) -> Dict[str, Any]:
    """
    Returns {
        narration: str,
        tts_audio_b64: str,
        source: "template" | "vision" | "vision_fallback",
        cached: bool,
        elapsed_ms: int,
    }
    """
    import time as _time

    t0 = _time.monotonic()
    h = _state_hash(screen, context, screenshot_b64)

    # 1. Cache hit → instant return
    cached = _get_cached(h)
    if cached:
        cached["cached"] = True
        cached["elapsed_ms"] = int((_time.monotonic() - t0) * 1000)
        return cached

    # 2. Vision path?
    text = None
    source = "template"
    if prefer_vision and screenshot_b64 and len(screenshot_b64) > 1000 and _vlm:
        try:
            hint = f"Screen: {screen}. {context}"
            text, _ = _vlm.describe_screen(screenshot_b64, hint)
            source = "vision"
        except Exception:
            text = None
            source = "vision_fallback"

    # 3. Template fallback
    if text is None:
        text = _template(screen, context)

    # 4. TTS via Person 1's pipeline (run in thread so event loop isn't blocked)
    audio_bytes = await asyncio.to_thread(speak, text, lang)
    audio_b64 = base64.b64encode(audio_bytes).decode() if audio_bytes else ""

    result = {
        "narration": text,
        "tts_audio_b64": audio_b64,
        "source": source,
        "cached": False,
    }
    _set_cached(h, result)

    result["elapsed_ms"] = int((_time.monotonic() - t0) * 1000)
    return result