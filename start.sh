#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Wait for DB to be ready (with a timeout so we don't hang forever)
echo "⏳ Waiting for DB..."
MAX_RETRIES=30
RETRIES=0
until nc -z ${DB_HOST:-db} ${DB_PORT:-5432}; do
  RETRIES=$((RETRIES+1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "❌ Database not reachable after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "⏳ Database not ready yet (attempt $RETRIES/$MAX_RETRIES)..."
  sleep 2
done

echo "✅ Database is ready!"

# Run Prisma migrations
echo "🛠 Running Prisma migrations..."
npx prisma migrate deploy

# Start Next.js standalone server on all interfaces
# NOTE: Next.js standalone server.js uses PORT and HOSTNAME env vars, NOT CLI flags
echo "🌐 Starting Next.js server..."
export PORT=3000
export HOSTNAME=0.0.0.0
exec node server.js
