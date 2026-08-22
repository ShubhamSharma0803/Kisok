import os
from pathlib import Path
from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _BACKEND_DIR / "kiosk.db"

class Settings(BaseSettings):
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    environment: str = "development"
    groq_api_key: str = ""
    gladia_api_key: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()