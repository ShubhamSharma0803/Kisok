import json
from datetime import datetime, timezone
from fastapi import WebSocket
from core.events import EventType

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        connections = self.active_connections.get(session_id)
        if connections:
            connections.discard(websocket)
            if not connections:
                del self.active_connections[session_id]

    async def send_event(self, session_id: str, event_type: EventType, payload: dict):
        envelope = {
            "type": event_type.value,
            "session_id": session_id,
            "payload": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        connections = self.active_connections.get(session_id, set())
        dead = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps(envelope))
            except Exception:
                dead.add(ws)
        for ws in dead:
            connections.discard(ws)

manager = ConnectionManager()