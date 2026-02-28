#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Optional: wait for database to be ready
echo "⏳ Waiting for DB..."
until nc -z ${DB_HOST:-localhost} ${DB_PORT:-5432}; do
  sleep 1
done

# Run Prisma migrations
echo "🛠 Running Prisma migrations..."
npx prisma migrate deploy

# Start Next.js
echo "🌐 Starting Next.js server..."
exec node server.js
