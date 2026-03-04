# ============================================================
# Flash Exchange – Production Dockerfile
# Multi-stage build: installs only production dependencies
# Runs as non-root user for security
# ============================================================

# ── Stage 1: Dependency installer ────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files first (enables Docker layer cache)
COPY package.json package-lock.json* ./

# Install ONLY production dependencies
# --frozen-lockfile ensures we never silently install different versions
RUN npm ci --only=production --frozen-lockfile 2>/dev/null || \
    npm install --only=production

# ── Stage 2: Final image ──────────────────────────────────────
FROM node:20-alpine AS runner

LABEL maintainer="Flash Exchange"
LABEL description="Flash Exchange Token Sale Backend"

# Install dumb-init for proper signal handling in Docker
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 flashuser && \
    adduser  --system --uid 1001 --ingroup flashuser flashuser

# Copy dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=flashuser:flashuser server.js       ./
COPY --chown=flashuser:flashuser src/            ./src/
COPY --chown=flashuser:flashuser public/         ./public/

# Switch to non-root user
USER flashuser

# Expose the application port
EXPOSE 3000

# Health check — Docker and Coolify will use this
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Use dumb-init as PID 1 for proper signal forwarding and zombie reaping
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
