from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session as DBSession
from core.database import get_db
from core.models import Session
from core.ws_manager import manager

router = APIRouter()

@router.websocket("/sessions/{session_id}/ws")
async def session_websocket(session_id: str, websocket: WebSocket, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        await websocket.close(code=4004)
        return

    await manager.connect(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # keeps connection alive; incoming msgs unused for now
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)