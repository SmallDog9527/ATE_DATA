#!/bin/sh
set -e

# Disable core dumps to prevent large core.* files on container exit
ulimit -c 0 || true

echo "========================================"
echo "  Chip ATE Analysis System - Backend"
echo "========================================"

# Wait for database to be ready
echo "[1/4] Waiting for database..."

# Better extraction of host and port from DATABASE_URL
# Expected format: postgresql://user:pass@host:port/db
DB_HOST=$(echo "$DATABASE_URL" | sed -e 's|.*@||' -e 's|:.*||' -e 's|/.*||')
DB_PORT=$(echo "$DATABASE_URL" | sed -e 's|.*:||' -e 's|/.*||')

DB_HOST=${DB_HOST:-db}
DB_PORT=${DB_PORT:-5432}

echo "  Targeting Database at $DB_HOST:$DB_PORT"

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "${POSTGRES_USER:-admin}" > /dev/null 2>&1; do
  echo "  Database is unavailable - sleeping"
  sleep 1
done
echo "  Database is ready!"

# Run database migrations
echo "[2/4] Running database migrations..."
cd /app
alembic upgrade head
python migrate_auth.py

# Initialize default data (admin user)
echo "[3/4] Initializing default data..."
python init_db.py

# Start application
echo "[4/4] Starting FastAPI server..."
if [ "$APP_ENV" = "development" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
fi
