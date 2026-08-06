from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    environment: str = "development"
    groq_api_key: str = ""
    gladia_api_key: str = ""

    class Config:
        env_file= ".env"

settings=Settings()