from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from server.config import settings
from server.database.connection import engine, Base
from server.routes import auth_routes, admin_routes, patient_routes, doctor_routes
from server.websocket import ws_router, redis_subscriber

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    # Startup: ensure tables exist if sqlite fallback
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Auto-seed default demo accounts if missing
    try:
        from scripts.seed_db import seed
        await seed()
    except Exception as e:
        print(f"⚠️ Auto-seed notice: {e}")
    # Start Redis Pub/Sub subscriber for WebSocket fan-out (non-fatal if Redis down)
    asyncio.create_task(redis_subscriber())
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
    "https://medpulse-ai.onrender.com",
    "https://medpulse-api.onrender.com",
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
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
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
