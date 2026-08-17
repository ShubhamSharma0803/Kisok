"""
Thin VLM client. Defaults to Groq (fastest/cheapest for hackathons).
Set env: VLM_PROVIDER=groq|openai, GROQ_API_KEY or OPENAI_API_KEY.
"""

import os
import time
from typing import Tuple

try:
    from groq import Groq
    GROQ_OK = True
except ImportError:
    GROQ_OK = False

try:
    from openai import OpenAI
    OPENAI_OK = True
except ImportError:
    OPENAI_OK = False


class VLMClient:
    def __init__(self):
        provider = os.getenv("VLM_PROVIDER", "groq").lower()
        self.model = os.getenv("VLM_MODEL", "llama-3.2-11b-vision-preview")

        if provider == "groq" and GROQ_OK:
            key = os.getenv("GROQ_API_KEY")
            if not key:
                raise RuntimeError("GROQ_API_KEY not set")
            self.client = Groq(api_key=key)
        elif provider == "openai" and OPENAI_OK:
            key = os.getenv("OPENAI_API_KEY")
            if not key:
                raise RuntimeError("OPENAI_API_KEY not set")
            self.client = OpenAI(api_key=key)
            if self.model == "llama-3.2-11b-vision-preview":
                self.model = "gpt-4o-mini"
        else:
            raise RuntimeError(f"VLM provider '{provider}' unavailable. Install groq or openai.")

    def describe_screen(self, image_b64: str, context_hint: str = "") -> Tuple[str, float]:
        """
        Returns (description_text, elapsed_ms).
        Typical Groq latency: 250–700 ms.
        """
        system = (
            "You are a concise screen narrator for visually impaired kiosk users. "
            "Describe the screen in 1-2 short sentences. Mention the section, key buttons/items, and any totals. "
            "Do NOT describe colors or styling. Do NOT hallucinate prices. Keep it under 25 words."
        )
        user_text = "Describe this kiosk screen."
        if context_hint:
            user_text += f" Context: {context_hint}"

        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_b64}",
                            "detail": "low",  # low = faster + cheaper
                        },
                    },
                ],
            },
        ]

        t0 = time.monotonic()
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=80,
            temperature=0.2,
        )
        elapsed = (time.monotonic() - t0) * 1000

        text = resp.choices[0].message.content.strip()
        if len(text) > 300:
            text = text[:300] + "..."
        return text, elapsed