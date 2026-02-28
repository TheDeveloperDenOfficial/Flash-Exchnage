# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl

# Copy package files for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema first (needed for generate)
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy rest of app
COPY . .

# Build Next.js app
RUN npm run build


# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma runtime files
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# ----- NEW: run migrations on startup -----
ENV DATABASE_URL=${DATABASE_URL}

# Run migrations automatically when container starts
RUN npx prisma migrate deploy

EXPOSE 3000

CMD ["node", "server.js"]
