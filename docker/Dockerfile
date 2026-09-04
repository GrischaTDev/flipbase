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

# Der Commit kommt von aussen herein: `.git` steht in .dockerignore, und das
# soll es auch, damit das Abbild keine Historie mitschleppt. Ohne diese
# Angaben traegt die Versionsanzeige einen Platzhalter - der Build laeuft
# trotzdem durch.
ARG FLIPBASE_COMMIT=""
ARG FLIPBASE_COMMIT_DATE=""
ARG FLIPBASE_VERSION=""
ENV FLIPBASE_COMMIT=$FLIPBASE_COMMIT
ENV FLIPBASE_COMMIT_DATE=$FLIPBASE_COMMIT_DATE
ENV FLIPBASE_VERSION=$FLIPBASE_VERSION

# `npm run build` statt `npx ng build`: Nur so laeuft der prebuild-Haken mit,
# der src/app/core/version.ts erzeugt. Diese Datei steht in .gitignore und
# liegt im Abbild deshalb nicht vor - mit `npx` brach der Build genau daran
# ab, waehrend er auf jedem Rechner mit vorhandener Datei durchlief.
RUN npm run build -- --configuration production

# Die öffentlich prüfbare Metadatendatei enthält ausschließlich die Git-SHA
# dieses Builds. Der Deployment-Job vergleicht sie nach dem Rollout mit
# github.sha und erkennt dadurch auch einen gesunden, aber veralteten Container.
RUN node scripts/write-deployment-metadata.mjs /app/dist/flipbase/browser/deployment.json

# ──────────────────────────────────────────────
# Stage 2 – Serve mit Nginx
# ──────────────────────────────────────────────
FROM nginx:stable-alpine AS production

# Custom Nginx-Konfiguration für Angular SPA-Routing
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf

# Build-Artefakte aus Stage 1 holen
COPY --from=build /app/dist/flipbase/browser /usr/share/nginx/html

# Port 80 freigeben
EXPOSE 80

# Zustandspruefung: Docker erkennt damit, ob der Server wirklich antwortet
# und nicht nur der Prozess laeuft.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3   CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
