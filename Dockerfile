FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production 2>/dev/null || npm install --only=production

FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
RUN addgroup --system --gid 1001 flash && adduser --system --uid 1001 --ingroup flash flash
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=flash:flash server.js ./
COPY --chown=flash:flash src/ ./src/
COPY --chown=flash:flash public/ ./public/
USER flash
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
