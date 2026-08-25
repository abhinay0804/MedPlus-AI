#!/bin/bash
# Render Production Startup Script
# Runs Celery worker+beat in the background and Gunicorn API in the foreground

# Set memory optimization variables for tiny 512MB Render container
export MALLOC_ARENA_MAX=2
export PYTHONMALLOC=malloc

echo "🚀 Starting MedPulse AI Production Services..."

# Start Celery worker + beat scheduler in the background
echo "⏰ Starting Celery worker + beat..."
celery -A microservices.celery_app worker --beat --loglevel=warning --concurrency=1 --max-tasks-per-child=10 &
CELERY_PID=$!
echo "✅ Celery started (PID: $CELERY_PID)"

# Start Gunicorn (FastAPI) in the foreground with 1 worker (sufficient for async I/O)
echo "🌐 Starting Gunicorn API server on port $PORT..."
exec gunicorn server.app:app \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
