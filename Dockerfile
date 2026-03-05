FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production 2>/dev/null || npm install --only=production

FROM node:20-alpine AS runner
# curl is required by Coolify's external healthcheck probe (curl preferred over wget)
RUN apk add --no-cache dumb-init curl
WORKDIR /app
RUN addgroup --system --gid 1001 flash && adduser --system --uid 1001 --ingroup flash flash
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=flash:flash server.js ./
COPY --chown=flash:flash src/ ./src/
COPY --chown=flash:flash public/ ./public/
USER flash
EXPOSE 3000
# start-period=90s: gives DB migration + bot init enough time before probing starts.
# interval=15s + retries=5: fast feedback once the server is up.
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=5 \
  CMD curl -fs http://localhost:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
