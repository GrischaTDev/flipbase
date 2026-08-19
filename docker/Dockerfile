# ──────────────────────────────────────────────
# Stage 1 – Build
# ──────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies zuerst kopieren → Docker-Layer-Caching nutzen
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

# Quellcode kopieren & produktions-Build erstellen
COPY . .
RUN npx ng build --configuration production

# ──────────────────────────────────────────────
# Stage 2 – Serve mit Nginx
# ──────────────────────────────────────────────
FROM nginx:stable-alpine AS production

# Custom Nginx-Konfiguration für Angular SPA-Routing
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf

# Build-Artefakte aus Stage 1 holen
COPY --from=build /app/dist/re-flip/browser /usr/share/nginx/html

# Port 80 freigeben
EXPOSE 80

# Zustandspruefung: Docker erkennt damit, ob der Server wirklich antwortet
# und nicht nur der Prozess laeuft.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3   CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
