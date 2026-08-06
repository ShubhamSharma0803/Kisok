from fastapi import FastAPI
from core.config import settings
from core.database import Base, engine
from core.router import router as sessions_router
from core.ws_router import router as ws_router
from orders.router import router as orders_router
from core.handoff_router import router as handoff_router



Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kiosk Vision AI Backend")
app.include_router(sessions_router)
app.include_router(ws_router)
app.include_router(orders_router)
app.include_router(handoff_router)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}

@app.get("/")
def fun():
    return{"greeting" : "Hey I am Shubham Sharma" , "message": "I welcome you to my beautiful project : Kisok Vision AI"}