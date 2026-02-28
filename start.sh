#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Parse DB host and port directly from DATABASE_URL so it always matches
# Works with both postgres:// and postgresql:// schemes
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_PORT=${DB_PORT:-5432}

echo "⏳ Waiting for DB at $DB_HOST:$DB_PORT ..."
MAX_RETRIES=30
RETRIES=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
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

# Start Next.js standalone server
# Next.js reads PORT and HOSTNAME as env vars, NOT CLI flags
echo "🌐 Starting Next.js server..."
export PORT=3000
export HOSTNAME=0.0.0.0
exec node server.js
