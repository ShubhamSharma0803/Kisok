import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from core.config import settings

db_url = settings.database_url

# Automatically ensure parent directory exists for SQLite database files
if db_url.startswith("sqlite:///"):
    raw_path = db_url.replace("sqlite:///", "")
    if raw_path and not raw_path.startswith(":memory:"):
        db_path = Path(raw_path).resolve()
        os.makedirs(db_path.parent, exist_ok=True)

connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()