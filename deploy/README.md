# Serverkonfiguration

Die Dateien in diesem Ordner sind **Abbilder dessen, was auf dem Server läuft**.
Sie liegen hier, damit die Einrichtung nachvollziehbar und wiederherstellbar
ist – die nächtliche Sicherung erfasst Datenbank und Schlüssel, aber nicht die
Konfiguration des Reverse Proxy.

Sie werden **nicht automatisch ausgerollt**. Wer hier etwas ändert, muss es
auch auf den Server bringen.

## Was wohin gehört

| Datei                           | Ort auf dem Server                            |
| ------------------------------- | --------------------------------------------- |
| `Caddyfile`                     | `/opt/supabase/volumes/proxy/caddy/Caddyfile` |
| `docker-compose.localports.yml` | `/opt/supabase/`                              |
| `docker-compose.landing.yml`    | `/opt/supabase/`                              |
| `docker-compose.app.yml`        | `/opt/reflip/docker-compose.yml`              |
| `backup.sh`                     | `/opt/reflip/backup.sh`                       |

Die beiden Zusatzdateien unter `/opt/supabase` sind in `COMPOSE_FILE` in der
`.env` eingetragen. Reihenfolge beachten: `docker-compose.caddy.yml` muss vor
`docker-compose.landing.yml` stehen, und beide nach `docker-compose.yml`.

## Warum eigene Zusatzdateien

Das offizielle Supabase-Paket bringt `docker-compose.yml` und seine Varianten
mit und überschreibt sie beim Aktualisieren. Eigene Anpassungen gehören
deshalb in separate Dateien:

- **`docker-compose.localports.yml`** bindet Datenbank, Pooler und
  API-Gateway ausschliesslich an `127.0.0.1`. Notwendig, weil Docker
  veröffentlichte Ports an der `ufw`-Firewall vorbeischleust – ohne diese
  Datei wäre Postgres aus dem Internet erreichbar.
- **`docker-compose.landing.yml`** hängt das Verzeichnis der Landingpage
  schreibgeschützt in den Caddy-Container.

## Adressen

| Adresse           | Was dort liegt                                     |
| ----------------- | -------------------------------------------------- |
| `flipbase.de`     | statische Landingpage aus `/opt/flipbase-landing`  |
| `www.flipbase.de` | Weiterleitung auf die nackte Domain                |
| `app.flipbase.de` | die Angular-Anwendung im Container `reflip-web`    |
| `api.flipbase.de` | Supabase – API offen, Studio hinter Passwortschutz |

## Nach einer Änderung

```bash
# Caddy: Konfiguration prüfen, dann neu laden
docker exec supabase-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Compose-Dateien geändert: Dienst neu erzeugen
cd /opt/supabase && sh run.sh recreate caddy
```
