import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "MedPulse AI — Smart Healthcare Portal"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    BACKEND_PORT: int = 8001
    FRONTEND_URL: str = "http://localhost:5173"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./healthcare.db"
    SQLITE_FALLBACK: bool = True
    
    # JWT Auth
    JWT_SECRET: str = "super-secret-jwt-key-change-in-production-min-32-chars"
    JWT_REFRESH_SECRET: str = "super-secret-refresh-key-change-in-production-min-32-chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    
    # LLM (Google Gemini)
    GOOGLE_GENAI_API_KEY: Optional[str] = None
    
    # Email SMTP (fastapi-mail / aiosmtplib)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM_NAME: str = "MedPulse AI Care Team"
    EMAIL_FROM_ADDRESS: str = "noreply.medpulse@gmail.com"
    
    # Google Calendar OAuth 2.0
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8001/api/auth/google/callback"
    
    # Redis & Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
