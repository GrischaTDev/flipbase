# ──────────────────────────────────────────────
# Stage 1 – Build
# ──────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies zuerst kopieren → Docker-Layer-Caching nutzen
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Quellcode kopieren & produktions-Build erstellen
COPY . .
RUN npx ng build --configuration production

# ──────────────────────────────────────────────
# Stage 2 – Serve mit Nginx
# ──────────────────────────────────────────────
FROM nginx:stable-alpine AS production

# Custom Nginx-Konfiguration für Angular SPA-Routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Build-Artefakte aus Stage 1 holen
COPY --from=build /app/dist/re-flip/browser /usr/share/nginx/html

# Port 80 freigeben
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
