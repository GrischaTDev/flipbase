FROM node:22.23.2-alpine3.24 AS build
WORKDIR /app/services/marketplace-worker
COPY services/marketplace-worker/package.json services/marketplace-worker/package-lock.json ./
RUN npm ci --ignore-scripts
COPY services/marketplace-worker/tsconfig.json services/marketplace-worker/tsconfig.build.json ./
COPY services/marketplace-worker/src ./src
COPY supabase/functions/_shared/marketplace-message-contracts.d.ts supabase/functions/_shared/marketplace-inbox-event-contracts.d.ts supabase/functions/_shared/marketplace-negotiation-contracts.d.ts /app/supabase/functions/_shared/
RUN npm run build

FROM node:22.23.2-alpine3.24 AS dependencies
WORKDIR /app
COPY services/marketplace-worker/package.json services/marketplace-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22.23.2-alpine3.24 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/services/marketplace-worker/dist ./dist
USER node
EXPOSE 4179
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4179/marketplace-browser/healthz', {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

# Nur dieses getrennte Abbild besitzt den Docker-Client; es enthält keine Supabase-Schlüssel.
FROM runtime AS chromium-broker
USER root
RUN apk add --no-cache docker-cli
USER node
EXPOSE 4180
HEALTHCHECK NONE
CMD ["node", "dist/chromium-host-broker-main.js"]

FROM runtime AS production
