#!/bin/bash
# Render Production Startup Script
# Runs Celery worker+beat in the background and Gunicorn API in the foreground

set -e

echo "🚀 Starting MedPulse AI Production Services..."

# Start Celery worker + beat scheduler in the background
echo "⏰ Starting Celery worker + beat..."
celery -A microservices.celery_app worker --beat --loglevel=warning --concurrency=1 &
CELERY_PID=$!
echo "✅ Celery started (PID: $CELERY_PID)"

# Start Gunicorn (FastAPI) in the foreground
echo "🌐 Starting Gunicorn API server on port $PORT..."
exec gunicorn server.app:app \
    --workers 2 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:$PORT \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
