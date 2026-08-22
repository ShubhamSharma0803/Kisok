## Verified as of 2026-08-22

### Phase A — Step 1: Session Model Migration Status: COMPLETE ✅
- **Session Model**: Fully migrated from single-mode `current_mode` to layered state model (`active_channels`, `ui_emphasis`, `detection_confidence`, `detection_source`, `detection_set_at`).
- **Enums**: `SessionMode` completely removed from codebase; replaced by `UIEmphasis` with 3 allowed values (`standard_touch`, `big_icons`, `gaze_active`).
- **Orchestrator**: `evaluate_rules` now sets `session.ui_emphasis = UIEmphasis.big_icons` upon high idle / failed taps without touching `active_channels`.
- **Handoff Router**: `GET /orchestrator-state` and `POST /resolve-handoff` updated to return the new fields (`ui_emphasis`, `active_channels`, `detection_confidence`, `detection_source`, `detection_set_at`).
- **Schemas**: `SessionResponse` updated to serialize the new layered fields.
- **Frontend SessionStart**: 4-card manual mode picker ("Talk to order", "Tap to order", "Look to order", "Easy View") completely removed; kiosk automatically transitions to `/order` after the welcome animation finishes.
- **Codebase Cleanliness**: Confirmed 0 remaining occurrences of `SessionMode` or `current_mode` across both `backend/` and `frontend/src/`.

---

### Caption Regression Fix (2026-08-22): RESOLVED ✅

**Problem**: Captions were not visible anywhere in the running app (user-verified in Chrome), despite `#global-caption-overlay` being added to `ScreenNarrationBridge.jsx`.

**Root Causes Identified (5)**:
1. **`push_ws` default `false` in backend**: `NarrateRequest.push_ws` in `vision/router.py` defaulted to `False`. Frontend `api.js` never sent `push_ws: true`. Backend returned narration via HTTP response only — never emitted WebSocket `screen_narration` event. Since `ScreenNarrationBridge` only listened to WS events, no caption appeared.
2. **Timer cleanup bug**: Timer ID stored in React state (`setClearTimer`), with a `useEffect([clearTimer])` cleanup that cleared the timer immediately on state change before it could fire the 6s fadeout.
3. **Voice reply captions never emitted**: `POST /sessions/{id}/voice` returned TTS audio in HTTP response but never emitted `screen_narration` WS event.
4. **Missing `useRef` import**: Refactored `ScreenNarrationBridge` used `useRef` without importing it → `ReferenceError` crash.
5. **Missing `useEffect` import in SessionContext**: Auto-init `useEffect` added without import → `ReferenceError` crash on direct URL navigation.

**Files Changed**:
- `backend/vision/router.py`: `push_ws` default `False` → `True`
- `backend/voice/router.py`: Emit `screen_narration` WS event on voice TTS reply
- `frontend/src/core/api.js`: Pass `push_ws: true`; dispatch `kiosk:show_caption` CustomEvent as sync fallback
- `frontend/src/core/ScreenNarrationBridge.jsx`: `useRef` for timer; added import; dual listener (WS + CustomEvent); stable refs
- `frontend/src/core/SessionContext.jsx`: Auto-init session on mount; expose `window.__SESSION_ID__`; added `useEffect` import
- `frontend/src/core/useSessionSocket.js`: Removed diagnostic `console.log` lines
- `frontend/src/orders/OrdersScreen.jsx`: Move `lastNarratedHash` update inside setTimeout; add `order?.total` to deps

**Verification** (Puppeteer headless Chrome against `localhost:3000` dev server):
- ✅ `#global-caption-overlay` found in DOM with `display: block`, `opacity: 1`, `visibility: visible`, `zIndex: 9999`
- ✅ Caption text: "You are browsing the full menu. 26 dishes shown. Current total is 0 rupees."
- ✅ Auto-fadeout after 6s confirmed (overlay removed from DOM)
- ✅ Pushed narration via `POST /narrate/push` triggers new caption with updated text
- ✅ WebSocket `screen_narration` events received with full payload
- ✅ 0 console errors

---

### Phase A — Step 2a: Backend WS event standardization Status: COMPLETE ✅
- **vision/router.py**: Fixed broken `broadcast_to_session` call by replacing it with `send_event(session_id, EventType.screen_narration, payload)`.
- **voice/router.py**: Removed dead, unmounted duplicate `narrate_router` (lines ~404-461).
- **WS Payload**: Ensured all `screen_narration` events carry a consistent payload shape: `text`, `tts_audio_b64`, `source`, `highlight_target`, including updating the `repeat_narration` intent in `voice/router.py`.
- **EventType Enum**:
  - Removed unused `payment_status` (backend uses `order_paid` and no frontend component listens to `payment_status`).
  - `caption` and `processing` are retained and **have real frontend WS subscribers** (`HandoffWaiting.jsx`, `VoiceScreen.jsx` call `subscribe('caption', ...)` and `subscribe('processing', ...)`).
  - `error` and `gaze_event` are retained but **have no frontend WS subscriber** — both are purely reserved for future work (error: future error handling; gaze_event: Step 10). The earlier grep for `error` produced false positives from local JS variable names and `console.error` calls; confirmed no `subscribe('error', ...)` call exists in `frontend/src/`.
  - Final EventType enum: `voice_transcript`, `order_updated`, `order_confirmed`, `mode_change`, `handoff_triggered`, `screen_narration`, `order_paid`, `navigate`, `caption` (reserved Phase A Step 2b), `processing` (reserved future), `error` (reserved future), `gaze_event` (reserved Step 10).

### Backend — what exists

#### `/core` module
- **`backend/core/config.py`**:
  - `Settings(BaseSettings)`: Defines configuration parameters loaded from `.env`: `database_url` (default `"sqlite:///./kiosk.db"`), `environment` (`"development"`), `groq_api_key`, `gladia_api_key`, `razorpay_key_id`, `razorpay_key_secret`, `razorpay_webhook_secret`.
- **`backend/core/database.py`**:
  - Sets up SQLAlchemy SQLite connection with `check_same_thread: False`, auto-creates parent directory if SQLite path requires it, defines `SessionLocal`, `Base = declarative_base()`, and `get_db()` dependency generator.
- **`backend/core/enums.py`**:
  - Defines string enums:
    - `UIEmphasis`: `"standard_touch"`, `"big_icons"`, `"gaze_active"`
    - `SessionStatus`: `"active"`, `"handed_off"`, `"completed"`
    - `OrderStatus`: `"pending"`, `"confirmed"`, `"paid"`
    - `HandoffReason`: `"manual"`, `"automatic"`
- **`backend/core/events.py`**:
  - Defines `EventType(str, enum.Enum)` with 13 members: `"caption"`, `"voice_transcript"`, `"order_updated"`, `"order_confirmed"`, `"mode_change"`, `"payment_status"`, `"handoff_triggered"`, `"screen_narration"`, `"gaze_event"`, `"processing"`, `"error"`, `"order_paid"`, `"navigate"`.
- **`backend/core/models.py`**:
  - Defines 5 SQLAlchemy ORM models: `Session`, `MenuItem`, `Order`, `OrderItem`, `HandoffLog`.
- **`backend/core/schemas.py`**:
  - Defines Pydantic schemas: `SessionResponse`, `MenuItemResponse`, `OrderItemResponse`, `OrderResponse`, `AddItemRequest`, `UpdateItemQuantityRequest`.
- **`backend/core/ws_manager.py`**:
  - `ConnectionManager`: Manages in-memory active WebSockets per `session_id` (`dict[str, set[WebSocket]]`). Implements `connect(session_id, websocket)`, `disconnect(session_id, websocket)`, and `send_event(session_id, event_type, payload)` which formats the event into an envelope `{ "type": event_type.value, "session_id": session_id, "payload": payload, "timestamp": "<ISO-8601 UTC>" }`.
- **`backend/core/orchestrator.py`**:
  - In-memory state: `_failed_tap_counts: dict[str, int]`.
  - Constants: `IDLE_THRESHOLD_SECONDS = 8`, `FAILED_TAP_THRESHOLD = 3`.
  - Functions: `increment_failed_tap(session_id)`, `reset_failed_tap(session_id)`, `get_idle_seconds(session)`.
  - `evaluate_rules(db, session)`: Checks if `idle_seconds > 8` and `failed_taps >= 3`. If true: updates `session.ui_emphasis = UIEmphasis.big_icons` (does NOT touch `active_channels`), emits WS `mode_change`, logs `HandoffLog` with `reason=automatic`, sets `session.status = SessionStatus.handed_off`, and emits WS `handoff_triggered`.
- **`backend/core/router.py`** (`prefix="/sessions"`, mounted in `main.py`):
  - `POST /sessions` -> Creates a new `Session` record in DB with layered defaults and returns `SessionResponse`.
  - `GET /sessions/{session_id}` -> Fetches `Session` record by ID or raises 404.
- **`backend/core/ws_router.py`** (mounted in `main.py`):
  - `WebSocket /sessions/{session_id}/ws` -> Verifies session exists in DB (closes with code `4004` if not found), connects websocket to `ws_manager`, and keeps connection alive with an incoming text loop.
- **`backend/core/handoff_router.py`** (mounted in `main.py`):
  - `POST /sessions/{session_id}/failed-tap` -> Increments failed tap counter, calls `evaluate_rules`, returns `{"failed_tap_count": count, "idle_seconds": float}`.
  - `GET /sessions/{session_id}/orchestrator-state` -> Returns current session orchestrator state (`failed_tap_count`, `idle_seconds`, `ui_emphasis`, `active_channels`, `detection_confidence`, `detection_source`, `detection_set_at`, `status`).
  - `POST /sessions/{session_id}/handoff` -> Triggers manual handoff: creates `HandoffLog(reason=manual, detail="user_requested")`, sets `session.status = handed_off`, emits WS `handoff_triggered` event.
  - `POST /sessions/{session_id}/resolve-handoff` -> Resolves handoff: verifies `session.status == handed_off`, sets `session.status = active`, resets failed taps to 0, emits WS `mode_change` with `ui_emphasis`, returns updated session state.
- **`backend/core/webhooks_router.py`** (mounted in `main.py`):
  - `POST /webhooks/razorpay` -> Razorpay webhook receiver. Validates signature from header `X-Razorpay-Signature` against `settings.razorpay_webhook_secret` using `razorpay.Client.utility.verify_webhook_signature`. For event `"payment_link.paid"`, finds `Order` by `payment_link_id`, idempotently marks `order.status = OrderStatus.paid`, and emits WS `EventType.order_paid`.

#### `/orders` module
- **`backend/orders/router.py`** (mounted in `main.py`):
  - `GET /menu` -> Returns all `MenuItem` records from DB as `list[MenuItemResponse]`.
  - `GET /sessions/{session_id}/orders` -> Returns active `Order` for session (creates a pending `Order` if one does not exist).
  - `POST /sessions/{session_id}/orders/items` -> Accepts `AddItemRequest(menu_item_id, quantity, modifiers)`, adds or merges item into the session's order, commits to DB, emits WS `EventType.order_updated`, returns `OrderResponse`.
  - `PATCH /sessions/{session_id}/orders/items/{item_id}` -> Accepts `UpdateItemQuantityRequest(quantity)`. Enforces `order.status == pending`. Updates quantity or deletes item if quantity <= 0, emits WS `EventType.order_updated`, returns `OrderResponse`.
  - `DELETE /sessions/{session_id}/orders/items/{item_id}` -> Deletes item from pending order, emits WS `EventType.order_updated`, returns `OrderResponse`.
  - `POST /sessions/{session_id}/confirm-order` -> Enforces order has items and is `pending`. Transitions `order.status = OrderStatus.confirmed`, emits WS `EventType.order_confirmed`, returns `OrderResponse`.
  - `POST /sessions/{session_id}/create-payment` -> Enforces `order.status == confirmed`. Calculates total paise, calls Razorpay API `client.payment_link.create(...)`, saves `payment_link_id` and `payment_link_url` on `Order`, returns `{"order_id": order.id, "payment_link_url": payment_link["short_url"], "amount_rupees": amount_rupees}`.

#### `/voice` module
- **`backend/voice/stt.py`**:
  - Gladia API client (`https://api.gladia.io/v2`): `_upload_audio` -> `POST /v2/upload`, `_submit_transcription` -> `POST /v2/pre-recorded` (`model="solaria-1"`, `enable_code_switching=True`), `_poll_result` -> `GET /v2/transcription/{id}`. `transcribe(audio_path)` returns `{"text": full_transcript, "language": detected_lang}` with Devanagari character detection fallback for Hindi.
- **`backend/voice/llm.py`**:
  - Intent parser using Groq (`llama-3.3-70b-versatile`).
  - Strict system prompt returning JSON: `action`, `items`, `needs_clarification`, `clarification_question`, `confidence`.
  - Supported actions: `"add_item"`, `"remove_item"`, `"modify_item"`, `"confirm_order"`, `"cancel_order"`, `"navigate_menu"`, `"navigate_order"`, `"navigate_start"`, `"request_help"`, `"repeat_narration"`, `"unclear"`.
  - Enforces safety confirmation rule for destructive actions (`remove_item`, `cancel_order`).
- **`backend/voice/tts.py`**:
  - `speak(text, lang="en")` -> Converts text to speech using `gTTS`, returns MP3 bytes.
  - `build_confirmation_text(cart, menu_lookup, lang="en")` -> Generates bilingual readback text with totals in rupees.
- **`backend/voice/pending_actions.py`**:
  - In-memory dictionary `_pending: dict[str, dict]` for session confirmation tracking with regex-based affirmative (`yes|yeah|haan|sure|correct...`) and negative (`no|nah|nahi|stop...`) response classifier `classify_confirmation_response()`.
- **`backend/voice/menu.json`**:
  - Static JSON menu file with 11 items used for voice intent context.
- **`backend/voice/router.py`** (`prefix="/sessions/{session_id}/voice"`, mounted in `main.py`):
  - `POST /sessions/{session_id}/voice` -> Main voice turn endpoint. Receives uploaded audio file, executes Gladia STT, emits WS `voice_transcript`, checks pending confirmations / calls Groq LLM, executes order mutations (`add_item`, `modify_item`, `remove_item`, `confirm_order`, `cancel_order`) or navigation (`navigate_menu`, `navigate_order`, `navigate_start`, `request_help`, `repeat_narration`), emits WS `order_updated` / `navigate` / `handoff_triggered` / `screen_narration`, generates gTTS audio, returns response JSON with `transcript`, `language`, `intent`, `action`, `message`, `order`, `tts_audio_b64`.
  - `GET /sessions/{session_id}/voice/cart` -> Returns serialized order summary.
  - `POST /sessions/{session_id}/voice/reset` -> Empties order items, commits, emits WS `order_updated`.
  - *Unmounted router in file*: `narrate_router` (`POST /sessions/{session_id}/narrate`) at lines 404–461 (dead code).

#### `/vision` module
- **`backend/vision/vlm_client.py`**:
  - `VLMClient`: Supports Groq (`llama-3.2-11b-vision-preview`) or OpenAI (`gpt-4o-mini`). `describe_screen(image_b64, context_hint)` returns `(description_text, elapsed_ms)`.
- **`backend/vision/narration_engine.py`**:
  - Caches narration results in memory with blake2b state hash (`screen|context|image_prefix`), TTL 300s, max 200 items.
  - Pre-defined template dictionary for `"start"`, `"menu"`, `"cart"`, `"gaze"`, `"handoff"`, `"payment"`, `"default"`.
  - `narrate(screen, context, screenshot_b64, prefer_vision, lang)`: Fast path (<50ms) using template formatted string or VLM vision path (~300-1200ms), followed by gTTS audio generation via `asyncio.to_thread(voice.tts.speak, text, lang)`.
- **`backend/vision/router.py`** (mounted in `main.py` as `narrate_router`):
  - `POST /sessions/{session_id}/narrate` -> Accepts `NarrateRequest(screen, context, screenshot_b64, prefer_vision, push_ws)`, runs `narrate()`, returns `NarrateResponse(narration, tts_audio_b64, source, cached, elapsed_ms)`.
  - `POST /sessions/{session_id}/narrate/push` -> Queues `_push_task` background task to run narration and push to WebSocket.

#### `/gaze` module
- **`backend/gaze/__init__.py`**:
  - Completely empty file. No routes, endpoints, or logic exist in the `/gaze` backend module.

#### `/payment` module
- **`backend/payment/__init__.py`**:
  - Completely empty file. No routes, endpoints, or logic exist in the `/payment` backend module (payment link generation is in `backend/orders/router.py` and webhook handling is in `backend/core/webhooks_router.py`).

#### Root / Application entrypoint (`backend/main.py`)
- `GET /health` -> Returns `{"status": "ok", "environment": settings.environment}`.
- SPA Catch-All & Static Files: Mounts `/assets` directory from `frontend/dist/assets` if present, serves static files or returns SPA `index.html` fallback.

---

### Session model — actual current fields

Verbatim from `backend/core/models.py` (lines 18–31):

```python
class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.active, nullable=False)
    active_channels = Column(JSON, default=lambda: dict(DEFAULT_ACTIVE_CHANNELS), nullable=False)
    ui_emphasis = Column(SQLEnum(UIEmphasis), default=UIEmphasis.standard_touch, nullable=False)
    detection_confidence = Column(Float, default=0.0, nullable=False)
    detection_source = Column(String, default="not_yet_implemented", nullable=False)
    detection_set_at = Column(DateTime, default=utcnow, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    last_active_at = Column(DateTime, default=utcnow, onupdate=utcnow)
```

---

### WS event contract — actual current state

#### `EventType` Enum (`backend/core/events.py`)
```python
class EventType(str, enum.Enum):
    caption = "caption"
    voice_transcript = "voice_transcript"
    order_updated = "order_updated"
    order_confirmed = "order_confirmed"
    mode_change = "mode_change"
    payment_status = "payment_status"
    handoff_triggered = "handoff_triggered"
    screen_narration = "screen_narration"
    gaze_event = "gaze_event"
    processing = "processing"
    error = "error"
    order_paid = "order_paid"
    navigate = "navigate"
```

#### WebSocket Envelope Shape (`backend/core/ws_manager.py:22-27`)
```json
{
  "type": "<EventType.value>",
  "session_id": "<session_id>",
  "payload": { /* event payload object */ },
  "timestamp": "<ISO-8601 UTC timestamp>"
}
```

#### Actual Event Payloads Emitted by Backend Code
1. **`voice_transcript`** (Emitted in `backend/voice/router.py:223`):
   ```json
   {
     "transcript": "<string>",
     "language": "<string e.g. 'en' | 'hi'>"
   }
   ```
2. **`order_updated`** (Emitted in `backend/orders/router.py:90, 129, 163` & `backend/voice/router.py:339, 390`):
   ```json
   {
     "id": "<order_id>",
     "session_id": "<session_id>",
     "status": "<OrderStatus e.g. 'pending'>",
     "items": [
       {
         "id": "<order_item_id>",
         "menu_item_id": "<menu_item_id>",
         "item_name": "<string>",
         "unit_price": "<float>",
         "quantity": "<int>",
         "modifiers": "<string | null>"
       }
     ],
     "total": "<float>",
     "updated_at": "<datetime>"
   }
   ```
3. **`order_confirmed`** (Emitted in `backend/orders/router.py:184`):
   ```json
   {
     "id": "<order_id>",
     "session_id": "<session_id>",
     "status": "confirmed",
     "items": [ /* list of item objects */ ],
     "total": "<float>",
     "updated_at": "<datetime>"
   }
   ```
4. **`mode_change`**:
   - From Orchestrator (`backend/core/orchestrator.py:41`):
     ```json
     {
       "ui_emphasis": "big_icons",
       "reason": "idle_and_failed_taps"
     }
     ```
   - From Resolve Handoff (`backend/core/handoff_router.py:72`):
     ```json
     {
       "ui_emphasis": "<UIEmphasis e.g. 'standard_touch'>",
       "status": "active"
     }
     ```
5. **`handoff_triggered`**:
   - From Orchestrator (`backend/core/orchestrator.py:54`):
     ```json
     {
       "reason": "automatic",
       "detail": "idle_timeout_and_failed_tap_threshold"
     }
     ```
   - From Handoff Router / Voice (`backend/core/handoff_router.py:46`, `backend/voice/router.py:322`):
     ```json
     {
       "reason": "manual",
       "detail": "<string e.g. 'user_requested' | 'voice_requested'>"
     }
     ```
6. **`screen_narration`** (Emitted in `backend/voice/router.py:328`):
   ```json
   {
     "request_repeat": true
   }
   ```
7. **`order_paid`** (Emitted in `backend/core/webhooks_router.py:68`):
   ```json
   {
     "order_id": "<order_id>",
     "payment_link_id": "<payment_link_id>"
   }
   ```
8. **`navigate`** (Emitted in `backend/voice/router.py:310, 314, 317`):
   ```json
   {
     "target": "menu" | "order" | "start"
   }
   ```

#### Unemitted / Unwired Events in Backend
- `caption`: Defined in enum; frontend subscribes to it in `VoiceScreen`, but backend voice router returns the text in the HTTP response instead of emitting this WS event.
- `payment_status`: Defined in enum; backend uses `order_paid` instead.
- `gaze_event`: Defined in enum; never emitted anywhere in backend.
- `processing`: Defined in enum; listened to by frontend `HandoffWaiting` / `VoiceScreen`, but never emitted by active backend routes.
- `error`: Defined in enum; listened to by frontend `HandoffWaiting`, but never emitted by active backend routes.

---

### Frontend — actual current screens

All routes registered in `frontend/src/App.jsx`:

1. **`SessionStart` (`/`) — Fully Wired**:
   - Calls `createSession` (`POST /sessions`) on mount.
   - Plays intro video `<OrderSplashAnimation />` (`/assets/wlcm1.mp4`).
   - Automatically navigates to `/order` once the welcome animation completes (4-card manual mode picker removed in Step 1).

2. **`OrdersScreen` (`/order`) — Fully Wired**:
   - Fetches menu (`GET /menu`) and session order (`GET /sessions/{session_id}/orders`).
   - Category filtering navigation bar (all, drinks, food, dessert).
   - Menu cards displaying food images, price formatting, veg indicator, and "Add" button.
   - Customizer modal for items with `available_modifiers`.
   - Modifies order via `addOrderItem` (`POST /sessions/{id}/orders/items`), `updateOrderItemQuantity` (`PATCH ...`), `deleteOrderItem` (`DELETE ...`).
   - Real-time updates via WebSocket `order_updated` listener.
   - Floating bottom cart button that opens `<CartSummary />` drawer with review action directing to `/review`.
   - Triggers screen narration on category change / menu load.

3. **`VoiceScreen` (`/voice`) — Fully Wired**:
   - Voice ordering state machine (`idle` -> `listening` -> `processing` -> `speaking`).
   - Audio capture via `MediaRecorder` sent to `POST /sessions/{session_id}/voice`.
   - WebSocket listeners for `voice_transcript`, `caption`, `order_updated`, `processing`, `navigate`.
   - Auto-plays returned base64 TTS audio; auto-resumes listening if `autoListenEnabled` is on.
   - Text fallback input: converts typed text to speech audio via browser `SpeechSynthesisUtterance` + `MediaRecorder` stream, and submits audio to `/voice`.
   - Floating cart drawer `<CartSummary />` and button to navigate to `/order`.

4. **`GazeActivePlaceholder` (`/gaze`) — Stubbed Placeholder**:
   - Inline component in `App.jsx`. Displays an eye icon, placeholder badge, explanatory text, and buttons to navigate to `/order` or `/`.
   - Contains no eye-tracking, camera access, MediaPipe, or dwell-selection logic.

5. **`LargeUIScreen` (`/large-ui`) — Fully Wired**:
   - Accessible large-format touch ordering screen.
   - Fetches menu and order state, renders extra-large food cards, large typography, and prominent ADD / Quantity controls.
   - Sticky bottom bar leading to `/review`.

6. **`ConfirmationScreen` (`/review`) — Fully Wired**:
   - Fetches order details (`GET /sessions/{session_id}/orders`).
   - Renders itemized receipt list with unit prices, modifiers, quantities, and total amount.
   - "Confirm Order" button calls `confirmOrder` (`POST /sessions/{session_id}/confirm-order`) and navigates to `/payment`.

7. **`PaymentScreen` (`/payment`) — Fully Wired**:
   - Calls `createPayment` (`POST /sessions/{session_id}/create-payment`) to generate a Razorpay payment link.
   - Renders QR code using the `qrcode` library for UPI scanning, alongside a fallback direct link.
   - Listens to WebSocket event `order_paid`; displays success confirmation badge and automatically navigates to `/thank-you` after 1.5 seconds.

8. **`ThankYouScreen` (`/thank-you`) — Fully Wired**:
   - Displays kitchen placement confirmation, item count, and amount paid.
   - 8-second auto-redirect countdown timer returning to `/` to start a fresh session.

9. **`HandoffWaiting` (Global Overlay via `<HandoffProvider />`) — Fully Wired**:
   - Rendered over all routes whenever `isHandedOff === true`.
   - Triggered either manually via the persistent bottom-right "Get Help" button (`POST /sessions/{session_id}/handoff`) or automatically via orchestrator state / WS `handoff_triggered`.
   - Polls orchestrator state every 5 seconds (`GET /sessions/{session_id}/orchestrator-state`).
   - "Simulate Attendant Resolution (Dev)" button calls `resolveHandoff` (`POST /sessions/{session_id}/resolve-handoff`).
   - "Return to Order" button only unblocks and resumes ordering when backend status confirms `active`.

10. **`BigIconScreen` (`frontend/src/orders/BigIconScreen.jsx`) — Dead / Unused Component**:
    - Imported in `App.jsx` but never referenced in any `<Route>`. Contains hardcoded mock cards with emojis (🍔, ☕, 🥪) and does not interact with the backend API.

---

### Known deviations / dead code / bugs found during this audit

1. **Dead Router in `voice/router.py`**:
   - `backend/voice/router.py` defines a second `narrate_router` (lines 404–461) with endpoint `POST /sessions/{session_id}/narrate`. It is never imported or included in `backend/main.py` (which instead imports `vision.router.router`).
2. **Broken WebSocket Call in `vision/router.py`**:
   - In `backend/vision/router.py` (lines 51–65 and 91–96), the code attempts `ws_manager.broadcast_to_session(...)` to send event `"narration_ready"`. `ConnectionManager` in `core/ws_manager.py` only implements `send_event(session_id, event_type, payload)` and has no `broadcast_to_session` method. As a result, WS push for narration is a no-op / broken.
3. **Empty / Dead Modules**:
   - `backend/gaze/`: Contains only an empty `__init__.py`.
   - `backend/payment/`: Contains only an empty `__init__.py` (all payment logic is implemented in `orders/router.py` and `core/webhooks_router.py`).
4. **Dead Frontend Component**:
   - `frontend/src/orders/BigIconScreen.jsx` is imported in `App.jsx` but never assigned to any `<Route>` (the `/large-ui` route uses `LargeUIScreen.jsx` instead).
5. **WebSocket Event Type Mismatch**:
   - In `core/webhooks_router.py:68`, the webhook emits `EventType.order_paid` (`"order_paid"`), and `PaymentScreen.jsx` listens for `"order_paid"`. However, `EventType.payment_status` (`"payment_status"`) from the architecture spec is never emitted anywhere.
6. **Unemitted Events Defined in Contract**:
   - `caption`, `processing`, `error`, `gaze_event`, `payment_status` are declared in `EventType` and listened to by various frontend components, but are never actually emitted by any active backend endpoint.
7. **Menu Dataset Divergence**:
   - `backend/voice/menu.json` contains a static 11-item menu with short mock IDs (e.g. `"veg_burger"`, `"blueberry_muffin"`), which is what `voice/llm.py` passes to Groq.
   - `backend/seed_menu.py` contains 18 items with full descriptions, prices, categories, and image URLs seeded to SQLite.
   - If a user orders one of the 7 new items in `seed_menu.py` (e.g., `"paneer_tikka"`, `"butter_paneer"`, `"chole_bhature"`, `"masala_dosa"`, `"chicken_biryani"`, `"margherita_pizza"`), the voice LLM does not have them in its prompt menu and may fail or classify them as unclear.

---

### Gaps vs. planned architecture

1. **Leftover Single-Mode Gating & Routing vs. Layered Channels**:
   - **Mode-Gated Screen Narration**: In `frontend/src/core/ScreenNarrationBridge.jsx:19` and `HandoffWaiting.jsx:18`, screen narration is currently gated behind `sessionMode === 'voice_first'`. Under Phase A Steps 2–4, narration and captions will be un-gated global layers.
   - **Separated Siloed Mode Routes**: The frontend routes (`/voice`, `/order`, `/large-ui`, `/gaze`) will be unified into one shared canvas in later phases.
2. **Missing Gaze Tracking Implementation**:
   - The planned webcam dwell-selection / gaze calibration pipeline is completely unbuilt in both backend (`backend/gaze` is empty) and frontend (`/gaze` is a static placeholder).
3. **Audio Streaming vs. Chunked Upload**:
   - Architecture Section 11.4 specified live streaming audio transport to Gladia. The actual implementation uses HTTP multipart upload of recorded `.wav` blobs (`POST /sessions/{id}/voice`), which Gladia then processes via pre-recorded async polling.
