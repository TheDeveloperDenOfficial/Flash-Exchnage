# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Prisma requires OpenSSL on Alpine
RUN apk add --no-cache openssl

# Copy only package files first (for better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema before generate
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy rest of the app
COPY . .

# Build Next.js app
RUN npm run build


# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

# Copy built standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma client & schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]
