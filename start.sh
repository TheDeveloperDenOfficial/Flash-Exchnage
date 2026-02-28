#!/bin/bash
set -e

echo "=============================="
echo "🚀 Starting Flash-Exchange..."
echo "=============================="

# Run Prisma migrations (creates tables if they don't exist)
echo "🛠 Running Prisma migrations..."
npx prisma migrate deploy

# Start the Next.js standalone server
echo "🌐 Starting Next.js server..."
node server.js
