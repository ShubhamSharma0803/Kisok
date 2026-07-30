from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from core.database import get_db
from core.models import Session
from core.schemas import SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("", response_model=SessionResponse)
def create_session(db: DBSession = Depends(get_db)):
    session = Session()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session