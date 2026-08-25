from fastapi import FastAPI, Request, status, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import engine, Base, get_db
from server.database import models as _models  # Ensure all ORM models are registered on metadata
from server.routes import auth_routes, admin_routes, patient_routes, doctor_routes
from server.websocket import ws_router, redis_subscriber

async def auto_migrate_schema(conn):
    from sqlalchemy import text
    columns = [
        ("appointments", "doctor_joined", "BOOLEAN DEFAULT FALSE"),
        ("appointments", "patient_joined", "BOOLEAN DEFAULT FALSE"),
        ("appointments", "unattended_by", "VARCHAR(20)"),
        ("appointments", "cancel_reason", "VARCHAR(255)"),
        ("users", "unattended_count", "INTEGER DEFAULT 0"),
        ("doctor_profiles", "unattended_count", "INTEGER DEFAULT 0")
    ]
    for table, col, col_type in columns:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
            print(f"✅ Auto-migrated: added column {col} to table {table}")
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "duplicate column" in err_str or "duplicate column name" in err_str:
                pass
            else:
                print(f"⚠️ Auto-migration info: {table}.{col} not added: {e}")

    try:
        await conn.execute(text("UPDATE appointments SET doctor_joined = FALSE WHERE doctor_joined IS NULL"))
        await conn.execute(text("UPDATE appointments SET patient_joined = FALSE WHERE patient_joined IS NULL"))
        await conn.execute(text("UPDATE users SET unattended_count = 0 WHERE unattended_count IS NULL"))
        await conn.execute(text("UPDATE doctor_profiles SET demerit_points = 0 WHERE demerit_points IS NULL"))
        await conn.execute(text("UPDATE doctor_profiles SET unattended_count = 0 WHERE unattended_count IS NULL"))
        print("✅ Backfilled existing nulls with default values.")
    except Exception as e:
        print(f"⚠️ Backfill nulls info: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    # Startup: ensure tables exist — retry up to 5 times for cold-start DB readiness
    for attempt in range(5):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                await auto_migrate_schema(conn)
            print("✅ Database tables ready.")
            break
        except Exception as e:
            print(f"⚠️ DB connection attempt {attempt + 1}/5 failed: {e}")
            if attempt < 4:
                await asyncio.sleep(3)
            else:
                print("❌ Could not connect to database after 5 attempts. Starting without DB init.")
    # Auto-seed default demo accounts if missing
    try:
        from scripts.seed_db import seed
        await seed()
    except Exception as e:
        print(f"⚠️ Auto-seed notice: {e}")
    # Start Redis Pub/Sub subscriber for WebSocket fan-out (non-fatal if Redis down)
    try:
        asyncio.create_task(redis_subscriber())
    except Exception as e:
        print(f"⚠️ Redis subscriber not started: {e}")
    yield
    # Shutdown
    await engine.dispose()

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="A full-stack healthcare appointment platform with AI symptom summaries, post-visit notes, email notifications, and Google Calendar sync.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# CORS Configuration
origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    # Render production URLs
    "https://medpulse-ai-yroh.onrender.com",
    "https://medplus-ai-yroh.onrender.com",
    "https://medplus-web-yroh.onrender.com",
    "https://medpulse-api-mtje.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_routes.router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")
app.include_router(patient_routes.router, prefix="/api")
app.include_router(doctor_routes.router, prefix="/api")
app.include_router(ws_router)  # WebSocket — no /api prefix (ws:// protocol)

# Health check endpoint
@app.get("/api/health", tags=["Health"])
async def health_check(
    db: AsyncSession = Depends(get_db)
):
    db_status = "ok"
    db_error = None
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "error"
        db_error = str(e)

    return {
        "status": "healthy" if db_status == "ok" else "unhealthy",
        "database": db_status,
        "database_error": db_error,
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

# SMTP connection diagnostic endpoint
@app.get("/api/health/smtp", tags=["Health"])
async def smtp_health_check():
    from server.services.email_service import is_smtp_configured
    import smtplib
    
    configured = is_smtp_configured()
    smtp_user = settings.SMTP_USER
    
    status_str = "unconfigured"
    error_msg = None
    
    if configured:
        try:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=5)
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.quit()
            status_str = "connected"
        except Exception as e:
            status_str = "auth_error"
            error_msg = str(e)
            
    return {
        "smtp_configured": configured,
        "smtp_user": smtp_user,
        "smtp_status": status_str,
        "smtp_error": error_msg
    }

# Global exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An unexpected internal server error occurred.",
            "error": str(exc) if settings.ENVIRONMENT == "development" else None
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=settings.BACKEND_PORT, reload=True)
