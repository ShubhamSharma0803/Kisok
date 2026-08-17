from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./kiosk.db"
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