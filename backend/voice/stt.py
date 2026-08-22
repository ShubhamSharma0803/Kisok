"""
Speech-to-text module using Gladia's async pre-recorded transcription API.

Why Gladia (per locked architecture, Section 11.1):
- Free tier covers 480 min/month, plenty for hackathon dev + demo
- Native code-switching support (enable_code_switching=True) — built specifically
  for audio that mixes languages mid-sentence, which is exactly our Hindi-English
  Hinglish use case
- Uses the "solaria-1" model, which has the widest language coverage and supports
  code switching (solaria-3 is higher-accuracy but English/French/German/Spanish/
  Italian only, single-language — not what we need here)

Flow (3 REST calls):
  1. POST /v2/upload           -> upload the audio file, get back an audio_url
  2. POST /v2/pre-recorded     -> submit a transcription job for that audio_url
  3. GET  /v2/transcription/{id} -> poll until status == "done"
"""

import os
import time
import mimetypes
import requests

from core.config import settings

GLADIA_API_KEY = settings.gladia_api_key
BASE_URL = "https://api.gladia.io/v2"


def _headers():
    return {"x-gladia-key": GLADIA_API_KEY}


class STTError(Exception):
    """Raised when speech-to-text processing fails."""
    pass


def _upload_audio(audio_path: str) -> str:
    """Uploads a local audio file to Gladia, returns the audio_url to transcribe."""
    print("[stt] Step 1/3: uploading audio to Gladia...")
    start = time.time()

    content_type, _ = mimetypes.guess_type(audio_path)
    if content_type is None:
        content_type = "application/octet-stream"

    try:
        with open(audio_path, "rb") as f:
            files = {"audio": (os.path.basename(audio_path), f, content_type)}
            response = requests.post(f"{BASE_URL}/upload", headers=_headers(), files=files, timeout=30)

        if not response.ok:
            print("[stt] Gladia upload error response:", response.text)
        response.raise_for_status()
        data = response.json()
        if "audio_url" not in data:
            raise STTError("Gladia upload response missing audio_url")
        print(f"[stt] Upload done in {time.time() - start:.1f}s")
        return data["audio_url"]
    except Exception as e:
        print(f"[stt] Upload failed: {e}")
        if isinstance(e, STTError):
            raise
        raise STTError(f"STT audio upload failed: {e}") from e


def _submit_transcription(audio_url: str) -> str:
    """Submits a transcription job, returns the job id."""
    print("[stt] Step 2/3: submitting transcription job...")
    start = time.time()

    payload = {
        "audio_url": audio_url,
        "model": "solaria-1",          # widest language coverage + code switching support
        "detect_language": True,
        "enable_code_switching": True,  # critical for Hindi-English mid-sentence mixing
    }
    try:
        response = requests.post(
            f"{BASE_URL}/pre-recorded",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        if not response.ok:
            print("[stt] Gladia job submission error response:", response.text)
        response.raise_for_status()
        data = response.json()
        if "id" not in data:
            raise STTError("Gladia job submission response missing job id")
        print(f"[stt] Job submitted in {time.time() - start:.1f}s")
        return data["id"]
    except Exception as e:
        print(f"[stt] Job submission failed: {e}")
        if isinstance(e, STTError):
            raise
        raise STTError(f"STT transcription submission failed: {e}") from e


def _poll_result(job_id: str, timeout_seconds: int = 90, poll_interval: float = 2.0) -> dict:
    """Polls until the job is done or errors, or we hit the timeout."""
    print("[stt] Step 3/3: polling for result...")
    start = time.time()
    elapsed = 0.0
    while elapsed < timeout_seconds:
        try:
            response = requests.get(f"{BASE_URL}/transcription/{job_id}", headers=_headers(), timeout=20)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"[stt] Poll request error at {elapsed:.0f}s: {e}")
            raise STTError(f"STT poll request error: {e}") from e

        print(f"[stt] Poll at {elapsed:.0f}s -> status: {data.get('status')}")

        if data.get("status") == "done":
            print(f"[stt] Transcription completed in {time.time() - start:.1f}s total")
            return data
        elif data.get("status") == "error":
            raise STTError(f"Gladia transcription failed: {data.get('error_code')}")

        time.sleep(poll_interval)
        elapsed += poll_interval

    raise STTError("Gladia transcription did not finish in time")


def transcribe(audio_path: str) -> dict:
    """
    Full pipeline: upload -> submit -> poll -> return transcript.

    Returns:
        {
            "text": full transcript (str),
            "language": detected primary language code,
        }
    """
    try:
        audio_url = _upload_audio(audio_path)
        job_id = _submit_transcription(audio_url)
        result = _poll_result(job_id)

        transcription = result.get("result", {}).get("transcription", {})
        full_text = transcription.get("full_transcript", "").strip()

        # Try Gladia's own language metadata first.
        languages = result.get("result", {}).get("metadata", {}).get("languages", [])
        detected_lang = languages[0] if languages else None

        # Fallback heuristic: if Gladia's language field is missing/unhelpful, check
        # whether the transcript itself contains Devanagari script — reliable signal
        # for Hindi/Hinglish speech, since gTTS only needs to know "hi" vs "en" anyway.
        if not detected_lang or detected_lang == "unknown":
            has_devanagari = any("\u0900" <= ch <= "\u097F" for ch in full_text)
            detected_lang = "hi" if has_devanagari else "en"

        return {
            "text": full_text,
            "language": detected_lang,
        }
    except Exception as e:
        print(f"[stt] transcribe failed: {e}")
        if isinstance(e, STTError):
            raise
        raise STTError(f"STT pipeline error: {e}") from e
