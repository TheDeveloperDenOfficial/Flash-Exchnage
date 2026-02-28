# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies needed for Prisma
RUN apk add --no-cache openssl bash

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema first (needed for generate)
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy rest of app
COPY . .

# Build Next.js app (standalone)
RUN npm run build


# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL=${DATABASE_URL}

# Install runtime dependencies
RUN apk add --no-cache openssl bash

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma runtime files
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Expose the port
EXPOSE 3000

# ---------- Start script ----------
# Create start.sh inside the container to run migrations then server
COPY <<'EOF' /start.sh
#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting Next.js server..."
node server.js
EOF

# Make start.sh executable
RUN chmod +x /start.sh

# Run the start script
CMD ["/start.sh"]
