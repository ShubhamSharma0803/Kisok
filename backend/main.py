from fastapi import FastAPI
from core.config import settings

app = FastAPI(title="Kiosk Vision AI Backend")

@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}

@app.get("/")
def fun():
    return{"greeting" : "Hey I am Shubham Sharma" , "message": "I welcome you to my beautiful project : Kisok Vision AI"}