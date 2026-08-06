from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import Base, engine
from core.router import router as sessions_router
from core.ws_router import router as ws_router
from orders.router import router as orders_router
from core.handoff_router import router as handoff_router
from voice.router import router as voice_router



Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kiosk Vision AI Backend")

# CORS — allow frontend (will be built next) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(ws_router)
app.include_router(orders_router)
app.include_router(handoff_router)
app.include_router(voice_router)

@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}



@app.get("/")
def fun():
    return{"greeting" : "Hey I am Shubham Sharma" , "message": "I welcome you to my beautiful project : Kisok Vision AI"}