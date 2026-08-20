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
| `cron-aufraeumen-n8n-server`    | `/etc/cron.d/…` auf dem **zweiten** Server    |
| `docker-compose.authelia.yml`   | `/opt/supabase/`                              |
| `authelia/configuration.yml`    | `/opt/authelia/config/configuration.yml`      |
| `authelia/passwort-setzen.sh`   | `/opt/authelia/passwort-setzen.sh`            |
| `authelia/users.example.yml`    | Vorlage für `/opt/authelia/config/users.yml`  |

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
- **`docker-compose.authelia.yml`** ergänzt Authelia, das die
  Studio-Oberfläche absichert.

## Adressen

| Adresse            | Was dort liegt                                    |
| ------------------ | ------------------------------------------------- |
| `flipbase.de`      | statische Landingpage aus `/opt/flipbase-landing` |
| `www.flipbase.de`  | Weiterleitung auf die nackte Domain               |
| `app.flipbase.de`  | die Angular-Anwendung im Container `reflip-web`   |
| `api.flipbase.de`  | Supabase – API offen, Studio hinter Authelia      |
| `auth.flipbase.de` | Anmeldeseite von Authelia                         |

## Nach einer Änderung

```bash
# Caddy: Konfiguration prüfen, dann neu laden
docker exec supabase-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Compose-Dateien geändert: Dienst neu erzeugen
cd /opt/supabase && sh run.sh recreate caddy
```

## Authelia

Sichert Supabase Studio ab. Die API-Pfade unter `api.flipbase.de` bleiben
unberührt – sie sind für den Browser gedacht und durch Schlüssel und RLS
geschützt.

**Was hier bewusst fehlt:** `/opt/authelia/secrets/` (drei zufällige
Schlüssel) und die echte `users.yml` mit dem Passwort-Hash. Beides gehört
nicht in ein Repository, auch nicht in ein privates.

### Passwort setzen oder ändern

```bash
ssh root@168.119.246.33
bash /opt/authelia/passwort-setzen.sh grischa
```

Die Eingabe ist verdeckt und landet weder in der Kommando-Historie noch in
einer Datei – gespeichert wird nur der Argon2-Hash. Authelia liest die Datei
im laufenden Betrieb neu ein, ein Neustart ist nicht nötig.

### Weitere Person aufnehmen

Einen Block nach demselben Muster in `/opt/authelia/config/users.yml`
ergänzen, dann `passwort-setzen.sh <name>` aufrufen. So bekommt zum Beispiel
die Steuerkanzlei einen eigenen Zugang, ohne dass ein Passwort weitergegeben
wird.

### Zweiter Faktor

Nach der ersten Anmeldung unter `auth.flipbase.de` im Bereich _Settings_ eine
Authenticator-App hinterlegen. Es ist kein Mailversand eingerichtet – der Link
zur Einrichtung landet deshalb in einer Datei:

```bash
docker exec authelia cat /config/notification.txt | tail -20
```

## Sicherung

Läuft nachts um 03:30 Uhr auf dem Flipbase-Server und erfasst Datenbank
(inklusive Rollen), hochgeladene Dateien und die `.env` mit allen Schlüsseln.

Danach wird alles **verschlüsselt** und auf den zweiten Server (n8n,
`168.119.165.201`) übertragen. Aufbewahrung: 14 Tage örtlich, 30 Tage dort.

### ⚠️ Der private Schlüssel muss auch woanders liegen

Die ausgelagerten Sicherungen sind mit `age` verschlüsselt. Der passende
private Schlüssel liegt unter `/opt/reflip/sicherung-schluessel.txt` – **auf
demselben Server**. Stirbt die Maschine, sind die Kopien auf dem zweiten
Server ohne ihn wertlos.

Deshalb einmalig auslesen und im Passwortmanager ablegen:

```bash
ssh root@168.119.246.33 'cat /opt/reflip/sicherung-schluessel.txt'
```

### Wie die Rechte verteilt sind

Der Flipbase-Server darf auf dem zweiten Server **nur hinzufügen**:

- eigener, unprivilegierter Benutzer `flipbackup` – kein Zugriff auf n8n
- Schlüssel auf `rrsync -wo -no-del` festgelegt: nur `rsync`, nur dieses
  Verzeichnis, kein Herunterladen, **kein Löschen**
- Das Aufräumen alter Stände erledigt ein Cron-Auftrag auf dem zweiten Server

Damit kann ein kompromittierter Flipbase-Server die ausgelagerten Kopien
weder lesen noch vernichten.

### Wiederherstellen

```bash
# 1. Verschlüsselte Sicherung vom zweiten Server holen
scp 168.119.165.201:/srv/flipbase-backup/daten/db_JJJJ-MM-TT_HHMM.sql.gz.age .

# 2. Entschlüsseln (Schlüssel aus dem Passwortmanager)
age -d -i sicherung-schluessel.txt -o db.sql.gz db_JJJJ-MM-TT_HHMM.sql.gz.age

# 3. Einspielen
zcat db.sql.gz | docker exec -i supabase-db psql -U postgres
```

Der Weg wurde vollständig durchgespielt: Datei vom zweiten Server geholt,
entschlüsselt, geprüft – 32 Tabellen, 127 Policies, 16 Rollen vollständig.
