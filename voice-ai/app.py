"""
Kiosk Vision — Feature 1: Conversational Voice Ordering

Flow per turn:
  1. User speaks into mic (st.audio_input)
  2. stt.transcribe() -> raw transcript (Hindi/English/Hinglish, via Gladia)
  3. llm.parse_order_intent() -> structured action (add/remove/confirm/unclear), via Groq
  4. Cart state updated in st.session_state
  5. tts.speak() reads back either a clarification question or the order+total, via gTTS
  6. Loop continues until user confirms -> order placed

Run with:
    streamlit run app.py

Requires GLADIA_API_KEY and GROQ_API_KEY set in a local .env file.
"""

import json
import tempfile
import os
import streamlit as st

from dotenv import load_dotenv
load_dotenv()

import stt
import llm
import tts

st.set_page_config(page_title="Kiosk Vision — Voice Ordering", page_icon="🎙️", layout="centered")

# ---- Load menu ----
with open("menu.json", "r", encoding="utf-8") as f:
    MENU = json.load(f)
MENU_LOOKUP = {item["id"]: item for item in MENU["items"]}

# ---- Session state ----
if "cart" not in st.session_state:
    st.session_state.cart = []          # list of {id, quantity, modifiers}
if "last_language" not in st.session_state:
    st.session_state.last_language = "en"
if "transcript_log" not in st.session_state:
    st.session_state.transcript_log = []
if "status_message" not in st.session_state:
    st.session_state.status_message = "Tap the mic and place your order."
if "audio_reply" not in st.session_state:
    st.session_state.audio_reply = None
if "order_confirmed" not in st.session_state:
    st.session_state.order_confirmed = False

st.title("🎙️ Kiosk Vision — Voice Ordering")
st.caption("Speak in English, Hindi, or a mix of both. Say things like "
           "'mujhe ek veg burger chahiye' or 'add two samosas'.")

# ---- Menu display (for sighted/low-vision users who still want to glance) ----
with st.expander("View menu"):
    for item in MENU["items"]:
        st.write(f"**{item['name']}** ({item['name_hi']}) — ₹{item['price']}")

st.divider()

# ---- Mic input ----
audio_value = st.audio_input("Speak your order")

# Streamlit keeps returning the SAME recording on every rerun until the user
# records something new. Without this check, every st.rerun() below would
# reprocess the identical audio forever. We track a hash of the last audio
# we actually processed and skip anything we've already handled.
if "last_processed_audio_hash" not in st.session_state:
    st.session_state.last_processed_audio_hash = None

if audio_value is not None:
    audio_bytes = audio_value.getvalue()
    audio_hash = hash(audio_bytes)
else:
    audio_hash = None

if audio_value is not None and audio_hash != st.session_state.last_processed_audio_hash:
    st.session_state.last_processed_audio_hash = audio_hash

    with st.spinner("Listening and understanding... (this can take 10-20 seconds)"):
        # Save uploaded audio to a temp file for Gladia to upload
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            try:
                result = stt.transcribe(tmp_path)
            except (TimeoutError, Exception) as e:
                # Graceful degradation (per architecture doc Section 5): a slow or
                # failed pipeline call should never crash the whole app — show a
                # friendly message and let the user just try again.
                print(f"[app] STT failed: {e}")
                st.session_state.status_message = (
                    "That took too long — the voice service might be slow right now. "
                    "Please try speaking again."
                )
                st.session_state.audio_reply = tts.speak(
                    st.session_state.status_message, lang="en"
                )
                st.rerun()

            transcript = result["text"]
            detected_lang = result["language"]  # "hi" or "en"
            st.session_state.last_language = detected_lang
            st.session_state.transcript_log.append(transcript)

            if not transcript:
                st.session_state.status_message = "I didn't catch any speech — try again?"
                reply_text = st.session_state.status_message
                st.session_state.audio_reply = tts.speak(reply_text, lang="en")
            else:
                try:
                    intent = llm.parse_order_intent(transcript, MENU, st.session_state.cart)
                except Exception as e:
                    print(f"[app] LLM failed: {e}")
                    st.session_state.status_message = (
                        "Sorry, I had trouble understanding that. Could you repeat your order?"
                    )
                    st.session_state.audio_reply = tts.speak(
                        st.session_state.status_message, lang=detected_lang
                    )
                    st.rerun()

                # ---- Handle the parsed intent ----
                if intent["needs_clarification"] or intent["action"] == "unclear":
                    st.session_state.status_message = intent["clarification_question"] or \
                        "Sorry, could you say that again?"
                    reply_text = st.session_state.status_message

                elif intent["action"] == "add_item":
                    for new_item in intent["items"]:
                        st.session_state.cart.append(new_item)
                    st.session_state.status_message = "Item added. Anything else?"
                    reply_text = "Added to your order. Anything else, or shall I read your total?"

                elif intent["action"] == "remove_item":
                    remove_ids = {i["id"] for i in intent["items"]}
                    st.session_state.cart = [c for c in st.session_state.cart if c["id"] not in remove_ids]
                    st.session_state.status_message = "Item removed."
                    reply_text = "Removed that item. Anything else?"

                elif intent["action"] == "confirm_order":
                    if st.session_state.cart:
                        summary, total = tts.build_confirmation_text(
                            st.session_state.cart, MENU_LOOKUP, lang=detected_lang
                        )
                        st.session_state.status_message = summary
                        reply_text = summary
                        st.session_state.order_confirmed = True
                    else:
                        st.session_state.status_message = "Your cart is empty. What would you like to order?"
                        reply_text = st.session_state.status_message

                elif intent["action"] == "cancel_order":
                    st.session_state.cart = []
                    st.session_state.order_confirmed = False
                    st.session_state.status_message = "Order cancelled. Starting fresh."
                    reply_text = st.session_state.status_message

                else:
                    reply_text = "Sorry, I didn't understand that."
                    st.session_state.status_message = reply_text

                # ---- Speak the reply ----
                st.session_state.audio_reply = tts.speak(reply_text, lang=detected_lang)

        finally:
            os.unlink(tmp_path)

    st.rerun()

# ---- Status + audio reply ----
st.info(st.session_state.status_message)

if st.session_state.audio_reply:
    st.audio(st.session_state.audio_reply, format="audio/mp3", autoplay=True)

# ---- Current cart display ----
st.divider()
st.subheader("Current order")
if st.session_state.cart:
    running_total = 0
    for entry in st.session_state.cart:
        item = MENU_LOOKUP[entry["id"]]
        line_total = item["price"] * entry["quantity"]
        running_total += line_total
        mods = f" ({', '.join(entry['modifiers'])})" if entry.get("modifiers") else ""
        st.write(f"- {entry['quantity']}x {item['name']}{mods} — ₹{line_total}")
    st.write(f"**Total: ₹{running_total}**")
else:
    st.write("_Empty — say something like 'I want a paneer wrap'_")

if st.session_state.order_confirmed:
    st.success("✅ Order confirmed! Proceeding to payment...")

# ---- Debug panel (helpful while you're building/demoing) ----
with st.expander("Debug: transcript log"):
    for i, t in enumerate(st.session_state.transcript_log):
        st.write(f"{i+1}. {t}")

if st.button("Reset session"):
    for key in ["cart", "transcript_log", "status_message", "audio_reply", "order_confirmed"]:
        st.session_state.pop(key, None)
    st.rerun()