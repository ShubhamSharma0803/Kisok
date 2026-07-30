from fastapi import FastAPI
from core.config import settings
from core.database import Base, engine
from core.router import router as sessions_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kiosk Vision AI Backend")
app.include_router(sessions_router)

@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}

@app.get("/")
def fun():
    return{"greeting" : "Hey I am Shubham Sharma" , "message": "I welcome you to my beautiful project : Kisok Vision AI"}