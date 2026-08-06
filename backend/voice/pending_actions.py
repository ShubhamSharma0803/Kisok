"""
Ephemeral pending destructive-action confirmations keyed by session_id.

In-memory (not DB) because:
- Confirmation state lasts at most one voice turn and is lost on restart (acceptable).
- No migration or schema change required.
- Avoids polluting the Session model with transient UI/voice state.
"""

from __future__ import annotations

import re
from typing import Any, Optional

_pending: dict[str, dict[str, Any]] = {}

_AFFIRMATIVE = re.compile(
    r"\b(yes|yeah|yep|sure|confirm|correct|haan|ha|ji|do it|go ahead|okay|ok)\b",
    re.IGNORECASE,
)
_NEGATIVE = re.compile(
    r"\b(no|nah|nope|nahi|don't|dont|stop|keep it|never mind|not really)\b",
    re.IGNORECASE,
)
_SHORT_AFFIRMATIVE = frozenset({"yes", "yeah", "yep", "sure", "haan", "ha", "ji", "ok", "okay"})
_SHORT_NEGATIVE = frozenset({"no", "nah", "nope", "nahi"})


def set_pending(
    session_id: str,
    action: str,
    items: list | None = None,
    question: str = "",
) -> None:
    _pending[session_id] = {
        "action": action,
        "items": items or [],
        "question": question,
    }


def get_pending(session_id: str) -> Optional[dict[str, Any]]:
    return _pending.get(session_id)


def clear_pending(session_id: str) -> None:
    _pending.pop(session_id, None)


def classify_confirmation_response(transcript: str) -> str:
    """
    Classify a follow-up utterance while a destructive confirmation is pending.

    Returns: 'affirmative' | 'negative' | 'unrelated'
    """
    text = transcript.strip().lower()
    if not text:
        return "unrelated"

    words = re.findall(r"[a-z']+", text)
    if len(words) <= 2 and words and words[0] in _SHORT_AFFIRMATIVE:
        return "affirmative"
    if len(words) <= 2 and words and words[0] in _SHORT_NEGATIVE:
        return "negative"

    has_yes = bool(_AFFIRMATIVE.search(text))
    has_no = bool(_NEGATIVE.search(text))

    if has_yes and not has_no:
        return "affirmative"
    if has_no and not has_yes:
        return "negative"
    return "unrelated"
