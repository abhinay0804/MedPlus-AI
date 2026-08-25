#!/bin/bash
# 🏥 MedPulse AI — Single-Click Local Container Stack Launcher
# This script handles environment template copying, builds Docker images, 
# starts all services (PostgreSQL, Redis, Celery, API, React), and seeds the DB.

set -e

echo "🏥 Initializing MedPulse AI Local Container Stack..."

# 1. Check for .env file and copy template if missing
if [ ! -f .env ]; then
  echo "📝 No .env file found. Copying .env.example template..."
  cp .env.example .env
  echo "✅ Created .env from template. You can configure custom API keys in it later."
else
  echo "✅ Existing .env configuration detected."
fi

# 2. Build and launch Docker Compose stack
echo "🚀 Building and launching Docker containers..."
docker-compose up --build -d

# 3. Wait for backend service to be ready and database schema to be created
echo "⏳ Waiting for backend database schema initialization..."
sleep 5

# 4. Seed default demo accounts in the PostgreSQL container
echo "🌱 Seeding default demo accounts..."
docker-compose exec -T backend python scripts/seed_db.py

echo "🎉 MedPulse AI is ready!"
echo "🌐 Web Application URL: http://localhost"
echo "📡 Interactive API Docs: http://localhost:8000/docs"
echo "💡 To inspect container logs, run: docker-compose logs -f"
