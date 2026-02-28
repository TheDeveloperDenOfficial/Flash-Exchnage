# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies needed by Prisma and build
RUN apk add --no-cache openssl bash

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema first to generate client
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the app
COPY . .

# Build Next.js app in standalone mode
RUN npm run build

# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL=${DATABASE_URL}

# Install runtime dependencies including curl for healthcheck
RUN apk add --no-cache openssl bash curl netcat-openbsd

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma client & schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy the start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose the port
EXPOSE 3000

# Start the app via start.sh
CMD ["/start.sh"]
