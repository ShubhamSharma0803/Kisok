# Kiosk Vision AI — Product Spec
### Target architecture, full user flow, and build roadmap

**Purpose of this document:** This describes what we are building toward — the finished, correct system. It does not describe current code state (see `PROGRESS.md` for that, which is verified against actual code and updated after every step). This file changes rarely — only when scope genuinely changes. Use it to check whether a piece of work is drifting off-target.

---

## 1. The Problem We're Solving

Kiosk Vision AI is a self-service kiosk assistant for restaurants, retail, and pharmacy environments, built to serve users with visual impairment, hearing impairment, low digital familiarity, motor impairment, and other accessibility needs — alongside ordinary sighted, tech-comfortable customers.

The naive approach is to build separate "modes" (voice, touch, gaze, big-icons) as exclusive silos the user picks between. **We are deliberately not doing that**, because every silo-based design has dead ends: some user, in some mode, will hit a wall they can't escape using that mode's own tools.

---

## 2. User Segments — Who We're Building For

| Segment | Core need | Best-fit starting layout |
|---|---|---|
| Blind / severely visually impaired | Fully audio-driven, no reliance on visual UI | Any layout — voice channel is always live and does the real work |
| Low vision (not blind) | High contrast, large text/icons | Big Icons |
| Deaf / hard of hearing | Everything spoken must have a visual/text equivalent | Standard Touch (captions always cover the audio side) |
| Motor impairment | No precision tapping required | Voice channel (always live), or Gaze if speech is also hard |
| Low digital familiarity | Conversational, forgiving interaction | Voice channel (always live) or Big Icons |
| Cognitively disabled / neurodivergent | Reduced choices, no time pressure | Big Icons |
| General sighted, tech-comfortable | Speed | Standard Touch |
| Severe speech impairment, sighted | Never rely on voice input | Standard Touch or Big Icons |
| Non-native language / limited literacy | Icon-heavy or code-switched voice | Big Icons or voice channel (Hinglish) |

**Critical insight:** wrong-layout guesses are not equally bad in all directions. This is the constraint that shapes everything below — and it's less severe than it first appears, because voice, captions, and touch are never actually turned off (see Section 3).

---

## 3. The Core Architectural Decision: Layered Channels, Not Mode Silos

**There are exactly three visual layouts (`ui_emphasis` values): `standard_touch`, `big_icons`, `gaze_active`.**

**Voice input, voice output, and captions are not modes — they are an always-on layer that sits underneath whichever of the three layouts is showing, all the time, everywhere.** The kiosk is always listening, always able to speak proactively, and always captioning — regardless of which layout is currently on screen.

### Confirmed flow diagram (hand-sketched, verified against this spec)

```
        5-second welcome animation
                    |
             Camera detection logic
                    |
                  Menu
       ____________/|\____________
      /              |             \
Standard Touch   Gaze Active    Big Icons
      \______________|_____________/
                     |
      [Voice Assistant ✓ | Captions ✓ | Touch ✓]
         (always-on layer, same underneath
          all three layouts — not a 4th branch)
                     |
               Add to Cart
                     |
            Confirmation Screen
                     |
                  Payment
                     |
              Thank You Screen
                     |
           (loop back to welcome animation)
```

The three layouts are **not three separate implementations** with their own menu/cart logic — that was the trap the current codebase fell into (`/voice`, `/order`, `/gaze`, `/large-ui` as genuinely separate routes with separate behavior). There is **one shared menu/order state and one shared set of channels**; `ui_emphasis` only changes how that same data is *presented* — layout density, icon size, how proactively the assistant narrates on top of it.

### What this means concretely:

1. **Captions are always on, in every layout.** Every word the assistant speaks is captioned live on screen in large text, with the relevant item/button visually highlighted at the same time.

2. **Every layout accepts every input, always.** The mic and touchscreen are never turned off just because a layout is showing — only the visual layout and the assistant's proactive behavior change.

3. **The voice assistant is a proactive agent, not a scripted responder.** It initiates conversation without being asked, understands the current screen/menu via vision (screen understanding, not static templates), lets the user navigate purely conversationally ("what's in my order," "go back," "show me desserts"), and can drive the full order lifecycle through dialogue — add items, review, confirm, proceed to payment. It also uses ongoing camera observation to keep refining its read of the user throughout the session, not just once during the welcome animation.

4. **Detection is a starting guess, not a commitment.** The camera makes its best guess during the welcome animation and the UI opens in that layout. Because all channels stay live underneath, the user's first real action can confirm or correct the guess.

5. **Gaze calibration is the one partially-exclusive case**, since it requires an active calibration step. Even there, voice and touch stay live throughout, so a failed calibration never traps anyone.

6. **The orchestrator/handoff safety net stays as the final backstop** — idle + failed-attempt escalation to a human attendant. Escalation adjusts `ui_emphasis` (e.g. to `big_icons`) — it never disables a channel.

**There is no manual mode-picker screen anywhere in the target design.** (Known deviation in current code: a 4-card manual picker exists on session start — being corrected, not preserved.)

---

## 4. The Full User Flow (target)

1. **Screen on.** Kiosk wakes, begins a 5-second welcome animation.
2. **During the animation**, the camera silently classifies the user. No interactive UI shown during this window.
3. **Animation ends → the kiosk lands directly in the guessed `ui_emphasis`.** No manual "pick a layout" screen ever appears. The proactive voice assistant is already active regardless of which layout loaded, and greets/narrates as appropriate.
4. **The assistant has full screen control via voice** — what's shown, what's added to the order — and can navigate purely from voice commands.
5. **Every screen carries a permanent, low-emphasis "switch layout" affordance** (a small icon on screen; a standing voice command works from any layout) — present from the first frame.
6. **User builds their order** via voice, touch, or a mix — channels are layered, not exclusive.
7. **User confirms order** → itemized review screen.
8. **Payment screen** (QR-code-based, Razorpay Payment Links).
9. **Thank-you screen** with order summary, auto-reset countdown.
10. **Loop back** to screen-on / welcome animation, ready for the next customer.

---

## 5. Resolved Design Decisions

These were explicitly brainstormed and locked in. Treat these as settled unless revisited deliberately.

1. **Low-confidence detection fallback:** If camera confidence is low at the end of the welcome animation, default to **`standard_touch`** — the most universally usable visual layout when the system doesn't know if someone needs simplification (`big_icons`) or gaze support (`gaze_active`). The voice channel works identically regardless, so this default only affects the visual layer.

2. **Welcome animation screen content:** *(Open — not yet decided. Placeholder: likely a passive splash/animation with no interactive elements during the 5-second window.)*

3. **What counts as a mode-correcting action:** Only a clear, unambiguous user action — a tap on an actual interactive element, or a spoken sentence/command — flips `ui_emphasis`. The assistant never self-triggers a layout switch just from reading confusion or non-response via camera; that signal stays in the orchestrator's existing friction-detection path (idle timeout + failed-attempt threshold), which is a separate, deliberate escalation mechanism.

4. **Timing of visual layout switches:** `detection_confidence` / `detection_source` can update immediately in the background at any time. The **visual** layout only actually changes at a natural break point: a screen/navigation transition, **or** the user going idle on the current screen (reusing the existing 8-second idle threshold already defined for orchestrator friction detection — no new timing concept introduced).

5. **Manual switch voice command wording:** *(Open — not yet decided. Needs an exact standing phrase, e.g. "switch to touch" / "show me buttons.")*

6. **Post-handoff resume layout:** When a human attendant resolves a handoff, **the attendant chooses** which `ui_emphasis` the session resumes in — not an automatic revert to the pre-escalation layout, and not a reset to auto-detect. Maps to `detection_source: "attendant_set"` (already a valid source per Section 6) with high `detection_confidence`. **Implementation note:** the `POST /sessions/{id}/resolve-handoff` endpoint needs to accept a layout-choice input; it currently only flips status back to active.

7. **Session identity:** Every session is 100% anonymous with zero memory across visits. No login, no returning-user recognition, no exceptions planned. `detection_source` will never have an identity-based value.

8. **Gaze calibration failure:** Fails on **timeout OR failed dwell-attempt count, whichever comes first** (mirrors the existing orchestrator pattern of combining an idle timeout with a failure count, rather than inventing a new rule shape). Exact thresholds are Sanyam's call once built against real hardware. On failure, falls back to **`standard_touch`** — same reasoning as Decision 1.

---

## 6. Session State Model (target)

Replaces the single `current_mode` field with independent concerns:

### `active_channels` (JSON) — what's currently live, never exclusive
```json
{
  "voice_input": true,
  "voice_output": true,
  "touch_input": true,
  "gaze_input": false,
  "captions": true
}
```
Nothing here is ever turned off purely because of the current `ui_emphasis` — only `gaze_input` toggles based on calibration success.

### `ui_emphasis` (enum) — exactly three values, the visual layout only
```
standard_touch | big_icons | gaze_active
```
Purely cosmetic/behavioral (layout density, icon size, how proactively the assistant narrates). Does **not** gate what input the backend accepts. Voice is not a value in this enum — it is part of `active_channels` and is always on.

### `detection_confidence` + `detection_source` + `detection_set_at` — how we got here
```json
{
  "source": "camera_auto" | "user_touch_signal" | "user_voice_signal" | "manual_override" | "attendant_set",
  "confidence": 0.0–1.0,
  "set_at": "<timestamp>"
}
```
Can update continuously — not just once at session start — since the proactive voice assistant keeps observing the user via camera throughout a `standard_touch`/`big_icons`/`gaze_active` session.

### Behavioral rules this model must satisfy
- Orchestrator friction detection (idle/failed-taps) escalates by setting `ui_emphasis` to `big_icons` — `active_channels` stays untouched, nothing is ever locked out.
- WebSocket/route handlers do not branch on "if mode == X" to decide whether to accept input — they react to whichever channel produced an event and update the same underlying order state regardless of `ui_emphasis`.
- Captions are a core WS event payload field (`text`, `highlight_target`) attached to every assistant-output event — never gated behind any `ui_emphasis` value.
- Visual layout changes only apply at the natural break points defined in Decision 4 above.

---

## 7. WebSocket Event Contract (target discipline)

- One registered `EventType` enum, no ad-hoc string literals in emitted events.
- Every event actually defined in the contract must be actually emitted somewhere, or removed from the contract — no "aspirational" events the frontend listens for that never arrive.
- Every narration-type event carries a consistent payload shape including `text`, `tts_audio_b64`, `source`, `highlight_target`.
- Single delivery mechanism (`send_event`) — no calls to methods that don't exist on `ConnectionManager`.

---

## 8. The Build Sequence (Phases A–D)

*Each step is one focused, testable unit of work — never move to the next step until the current one is verified working against real code/DB/network activity, not just "looks like it compiled."*

### Phase A — Foundation Rework (state model + captions) — **starting fresh**
- **Step 1** — `Session` model migration: replace `current_mode` with `active_channels`, `ui_emphasis` (3-value enum), `detection_confidence`, `detection_source`, `detection_set_at`. Update every reference across backend and frontend, including removing the frontend's 4-card manual picker.
- **Step 2a** — Backend WS event standardization: fix broken `broadcast_to_session` call, remove dead `narrate_router` duplicate, ensure consistent payload shape.
- **Step 2b** — Frontend caption wiring: make captions global/persistent, not gated behind any mode check.
- **Step 3** — Backend: remove mode-gating on input handlers; they update `active_channels` instead of rejecting input.
- **Step 4** — Frontend: persistent caption/highlight layer mounted globally across all screens.

✅ Checkpoint: no layout locks any input or output channel.

### Phase B — Detection & Layout Behavior
- **Step 5** — Camera auto-detect wired into `detection_confidence`/`detection_source` at session start, with low-confidence fallback to `standard_touch` (Decision 1); replaces the manual 4-card picker screen entirely.
- **Step 6** — "First real action confirms/corrects" logic (Decision 3) — backend flips `ui_emphasis` based on actual first user action, applied at natural break points (Decision 4).

✅ Checkpoint: auto-detect + self-correcting layout fully testable with mocked confidence scores, no real camera hardware needed.

### Phase C — Resume Feature Work
- **Step 7** — Module 7: full proactive voice loop integration against the new state model, with real screen control, continuous camera-based detection updates, and captions wired in from Phase A.
- **Step 8** — Module 9: reliability layer (failure injection: kill STT mid-call, drop WS, confirm graceful degradation).
- **Step 9** — Big Icons: route it properly, wire to real menu data (currently `BigIconScreen.jsx` is dead/unused; `LargeUIScreen.jsx` is the live one — reconcile these).
- **Step 10** — Gaze integration once Sanyam's CV work lands, plugged in as another `active_channels`/`ui_emphasis` entry, not a new silo. Calibration failure per Decision 8.

✅ Checkpoint: all 3 layouts functional, sharing the same channels, captions, and session state.

### Phase D — Polish & Close Remaining Gaps
- **Step 11** — Attendant layout-choice input added to `resolve-handoff` endpoint (Decision 6).
- **Step 12** — Confidence-weighted handoff escalation: orchestrator factors in low `detection_confidence` alongside friction signals.
- **Step 13** — End-to-end full-flow regression test, once per layout: screen-on → welcome animation → order → payment → thank-you → loop back.

---

## 9. Known Issues to Fold Into the Above (from audit, not new scope)

- `voice/menu.json` (11 items, used by voice LLM) is out of sync with `seed_menu.py` (18 items, in DB) — 7 real items are invisible to voice ordering. Fix during Step 7 at the latest.
- Dead/duplicate `narrate_router` inside `voice/router.py` — remove during Step 2a.
- `EventType.payment_status` defined but never emitted (backend uses `order_paid` instead) — reconcile during Step 2a; either wire it or remove it from the enum.
- `caption`, `processing`, `error`, `gaze_event` defined but never emitted — same treatment.

---

## 10. Working Principles (apply throughout every step)

- **One discrete change per step, always tested before moving on** — no step is "done" just because the code runs without errors.
- **Review AI-generated code skeptically before accepting it.**
- **Test with real signals, not assumptions** — Network tab / WebSocket inspection, DB row counts, deliberately triggering failure paths, running things twice to check idempotency.
- **Captions-always-on is a hard accessibility default**, not a mode-specific nice-to-have.
- **Idempotent operations matter** — seed scripts, webhook handlers, status updates must be safe to run/receive more than once.
- **Async correctness in FastAPI is non-negotiable** — any blocking call inside `async def` must be wrapped in `asyncio.to_thread(...)`.
- **PowerShell on Windows** for all terminal commands.
- **Discussion before code** — scope confirmed before building each module.

---

## 11. What Success Looks Like

By the end of Phase D:
- No user, in any layout, can ever get stuck with no way to interact — every channel (voice, touch, captions) is always live underneath whatever the screen currently emphasizes.
- Layout detection is a helpful default, never a trap — the system corrects itself based on what the user actually does, with no separate menu to hunt for.
- The three `ui_emphasis` values (standard touch, big icons, gaze-active) all share one session state model, one WebSocket event contract, and one caption/highlight layer, with voice as a constant layer underneath all three.
- The human-handoff safety net remains the final backstop for cases nothing else resolves in time.