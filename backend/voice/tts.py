"""
Text-to-speech module using gTTS.

gTTS over pyttsx3/other offline engines because gTTS's Hindi voice (lang="hi")
is genuinely intelligible, whereas most offline TTS engines have poor or no
Hindi support. Tradeoff: gTTS needs internet access (fine for a kiosk that's
already online for STT/LLM calls anyway).
"""

from gtts import gTTS
import io


def speak(text: str, lang: str = "en") -> bytes:
    """
    Converts text to speech and returns MP3 audio bytes (so the frontend can
    play it directly without writing temp files).

    lang: "en" for English, "hi" for Hindi. Pick based on what language
    the user has been speaking, or default to "en" if unsure.
    """
    buf = io.BytesIO()
    tts = gTTS(text=text, lang=lang)
    tts.write_to_fp(buf)
    buf.seek(0)
    return buf.read()


def build_confirmation_text(cart: list, menu_lookup: dict, lang: str = "en") -> tuple:
    """
    Builds the "here's your order and total" readback text.

    Kept bilingual-friendly: if lang="hi", item names are read in Hindi
    (name_hi) with the price still in numerals (numbers read fine in either
    language via gTTS).

    Returns:
        (summary_text, total_amount)
    """
    lines = []
    total = 0
    for entry in cart:
        item = menu_lookup[entry["id"]]
        qty = entry["quantity"]
        price = item["price"] * qty
        total += price
        name = item.get("name_hi", item["name"]) if lang == "hi" else item["name"]
        mods = f" ({', '.join(entry['modifiers'])})" if entry.get("modifiers") else ""
        if lang == "hi":
            lines.append(f"{qty} {name}{mods}, {price} रुपये")
        else:
            lines.append(f"{qty} {name}{mods}, {price} rupees")

    if lang == "hi":
        summary = "आपका ऑर्डर: " + "; ".join(lines) + f"। कुल राशि {total} रुपये है। क्या यह सही है?"
    else:
        summary = "Your order: " + "; ".join(lines) + f". Your total is {total} rupees. Is that correct?"

    return summary, total
