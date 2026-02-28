# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy package files first
COPY package*.json ./

# Install dependencies (this runs postinstall -> prisma generate)
RUN npm install

# Now copy the rest of the project INCLUDING prisma/
COPY . .

# Ensure Prisma client is regenerated with schema present
RUN npx prisma generate

# Build Next.js
RUN npm run build


# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]# ---------- Builder ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy full project
COPY . .

# Generate Prisma client (now schema exists)
RUN npx prisma generate

# Build Next.js (must use standalone output)
RUN npm run build


# ---------- Runner ----------
FROM node:18-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma runtime files
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]# ---------- Builder ----------
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


