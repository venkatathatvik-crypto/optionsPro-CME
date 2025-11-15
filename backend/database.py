# backend/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Prefer .env; if not found, fallback to .env.local
loaded = load_dotenv()
if not loaded:
    load_dotenv(".env.local")

DATABASE_URL = os.getenv("DATABASE_URL")

# Fix malformed values like: DATABASE_URL=DATABASE_URL="postgres://..."
if DATABASE_URL and "DATABASE_URL=" in DATABASE_URL:
    # take the last segment after the last '='
    DATABASE_URL = DATABASE_URL.split("=", 1)[-1]

# Strip surrounding quotes if present
if DATABASE_URL and ((DATABASE_URL.startswith('"') and DATABASE_URL.endswith('"')) or (DATABASE_URL.startswith("'") and DATABASE_URL.endswith("'"))):
    DATABASE_URL = DATABASE_URL[1:-1]

# The asyncpg driver is needed for FastAPI, but SQLAlchemy uses psycopg2
# We will modify the URL for standard SQLAlchemy sync operations
db_url = DATABASE_URL
if db_url and db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

if not db_url:
    raise ValueError(
        "DATABASE_URL is not set. Ensure backend/.env (or .env.local) contains a valid DATABASE_URL."
    )

engine = create_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Dependency to get DB session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

