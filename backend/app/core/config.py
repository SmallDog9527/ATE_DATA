from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    APP_ENV: str = "development"
    SECRET_KEY: str
    DEBUG: bool = True
    UPLOAD_DIR: str
    MAX_USER_STORAGE_GB: int = 1
    ANTHROPIC_API_KEY: Optional[str] = None

    # Email / SMTP
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "noreply@ate-system.com"
    APP_URL: str = "http://localhost:5174"

    class Config:
        env_file = ".env"

settings = Settings()
