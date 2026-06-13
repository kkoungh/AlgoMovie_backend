import os
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

_db_url = os.getenv("DATABASE_URL")
if _db_url:
    _p = urlparse(_db_url)
    DB_HOST     = _p.hostname
    DB_PORT     = _p.port or 5432
    DB_NAME     = _p.path.lstrip("/")
    DB_USER     = _p.username
    DB_PASSWORD = _p.password
else:
    DB_HOST     = os.getenv("DB_HOST",     "localhost")
    DB_PORT     = int(os.getenv("DB_PORT", "5432"))
    DB_NAME     = os.getenv("DB_NAME",     "algomovie")
    DB_USER     = os.getenv("DB_USER",     "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

REDIS_HOST     = os.getenv("REDIS_HOST",     "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None) or None
