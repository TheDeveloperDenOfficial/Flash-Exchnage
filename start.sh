#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Wait for DB to be ready
echo "⏳ Waiting for DB..."
until nc -z ${DB_HOST:-db} ${DB_PORT:-5432}; do
  echo "⏳ Database not ready yet..."
  sleep 1
done

echo "✅ Database is ready!"

# Run Prisma migrations
echo "🛠 Running Prisma migrations..."
npx prisma migrate deploy

# Start Next.js server on all interfaces (0.0.0.0) so Coolify healthchecks can access it
echo "🌐 Starting Next.js server..."
exec node server.js --port 3000 --hostname 0.0.0.0#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Wait for DB to be ready
echo "⏳ Waiting for DB..."
until nc -z ${DB_HOST:-localhost} ${DB_PORT:-5432}; do
  sleep 1
done

# Run Prisma migrations
echo "🛠 Running Prisma migrations..."
npx prisma migrate deploy

# Start Next.js server on all interfaces
echo "🌐 Starting Next.js server..."
exec node server.js -p 3000 -H 0.0.0.0
