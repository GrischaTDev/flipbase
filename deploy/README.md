# Serverkonfiguration

Die Dateien in diesem Ordner sind **Abbilder dessen, was auf dem Server läuft**.
Sie liegen hier, damit die Einrichtung nachvollziehbar und wiederherstellbar
ist – die nächtliche Sicherung erfasst Datenbank und Schlüssel, aber nicht die
Konfiguration des Reverse Proxy.

Sie werden **nicht automatisch ausgerollt**. Wer hier etwas ändert, muss es
auch auf den Server bringen. Die Ausnahme ist die Anwendung selbst – die rollt
seit der Einrichtung der Pipeline bei jedem Push auf `master` von allein aus.

## Deployment der Anwendung

Bei jedem Push auf `master` läuft [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. **Verify** – Format, Lint, Typen, Tests, Build. Schlägt einer fehl, endet es hier.
2. **Publish image** – baut das Docker-Abbild und legt es in die GitHub
   Container Registry, zweifach gekennzeichnet: `latest` und `sha-<kurz>`.
3. **Deploy** – meldet sich per SSH am Server an und startet
   `/opt/flipbase/deploy.sh`, das genau diese Kennzeichnung lädt, den Container
   austauscht und wartet, bis er sich gesund meldet. Danach prüft die Pipeline
   noch `https://app.flipbase.de/healthz` von außen.

Der Server baut also **nichts** mehr selbst. Er lädt ein fertiges Abbild.

### Warum das so aufgebaut ist

- **Der Deploy-Schlüssel kann nur dieses eine Skript starten.** In
  `authorized_keys` ist er per `command="…"` auf `deploy.sh` festgelegt; eine
  Shell öffnet er nicht. Die gewünschte Kennzeichnung kommt über
  `SSH_ORIGINAL_COMMAND` und wird im Skript streng geprüft.
- **Auf dem Server liegt kein dauerhafter Registry-Zugang.** Das Token gehört
  dem laufenden CI-Auftrag, wird über die Standardeingabe übergeben (steht also
  nie in der Prozessliste) und nach dem Laden wieder verworfen. Ein
  gespeichertes Token würde entweder irgendwann ablaufen und das Deployment
  still zerlegen – oder ewig gültig herumliegen.
- **Ausgerollt wird die feste Kennzeichnung, nicht `latest`.** So geht genau
  das Abbild live, das dieser Lauf gebaut hat, auch wenn parallel ein zweiter
  Lauf etwas hochlädt.
- **Migrationen laufen bewusst nicht mit.** Schemaänderungen automatisch bei
  jedem Push auf die Produktivdatenbank loszulassen, ist ein anderes Kaliber
  als ein Frontend auszutauschen. Das bleibt ein bewusster Schritt über
  `apply-migrations.sh`.
- **Die Pipeline prüft aber, ob sie gelaufen sind.** Vor dem Ausliefern
  vergleicht sie die Dateien in `supabase/migrations/` mit dem, was die
  Datenbank als angewendet meldet, und **bricht ab**, wenn eine fehlt — samt
  Namen und den beiden nötigen Befehlen. Grund: Am 21.08.2026 lag eine
  Migration einen Tag lang unangewendet im Repository. Die Anwendung liefert
  sich selbst aus, Migrationen nicht — also können sie schlicht vergessen
  werden. Code, dessen Spalten in der Datenbank fehlen, soll gar nicht erst
  live gehen.

### Rückfall auf eine ältere Fassung

Jedes Abbild bleibt unter seiner Kennzeichnung liegen. Auf dem Server:

```bash
cd /opt/flipbase
IMAGE_TAG=sha-1a2b3c4 docker compose up -d web
```

Die Kennzeichnung steht in der GitHub-Action des jeweiligen Laufs. Liegt das
Abbild lokal nicht mehr vor, muss vorher einmal `docker login ghcr.io`
erfolgen.

### Einmalige Einrichtung

Nötig sind drei Secrets im Repository (bereits gesetzt) und die Vorbereitung
des Servers:

| Secret               | Inhalt                                                          |
| -------------------- | --------------------------------------------------------------- |
| `SUPABASE_ANON_KEY`  | Der öffentliche Schlüssel aus `/opt/supabase/.env` (`ANON_KEY`) |
| `DEPLOY_SSH_KEY`     | Privater Teil des Deploy-Schlüsselpaars                         |
| `DEPLOY_KNOWN_HOSTS` | Hostschlüssel des Servers, damit SSH ihn nicht blind akzeptiert |

Der `ANON_KEY` wird gebraucht, weil `src/environments/environment.ts` im Repo
auf ein lokales Supabase zeigt. Früher hat `prepare.sh` diese Datei auf dem
Server vor dem Bauen überschrieben; da jetzt die CI baut, schreibt sie die
Datei dort. Ohne den Schlüssel bricht der Lauf ab, statt eine Anwendung ohne
Backend auszuliefern.

## Was wohin gehört

| Datei                           | Ort auf dem Server                            |
| ------------------------------- | --------------------------------------------- |
| `Caddyfile`                     | `/opt/supabase/volumes/proxy/caddy/Caddyfile` |
| `docker-compose.localports.yml` | `/opt/supabase/`                              |
| `docker-compose.landing.yml`    | `/opt/supabase/`                              |
| `docker-compose.app.yml`        | `/opt/flipbase/docker-compose.yml`            |
| `backup.sh`                     | `/opt/flipbase/backup.sh`                     |
| `deploy.sh`                     | `/opt/flipbase/deploy.sh` (ausführbar)        |
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
| `app.flipbase.de`  | die Angular-Anwendung im Container `flipbase-web` |
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

## Sitzungsdauer

Supabase Auth erzwingt zwei unabhängige Grenzen. Beide gehören in die
Umgebung des Auth-Containers (`docker-compose.yml` der Supabase-Installation):

| Variable                             | Wert   | Bedeutung                                             |
| ------------------------------------ | ------ | ----------------------------------------------------- |
| `GOTRUE_SESSIONS_TIMEBOX`            | `720h` | 30 Tage ab der Anmeldung, unabhängig von der Nutzung. |
| `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` | `168h` | 7 Tage ohne Nutzung.                                  |

Go-Zeitformat. Die Variable **weglassen** bedeutet "nie"; `0` wird abgelehnt.

Warum diese Werte: Ohne Timebox wird das Refresh-Token endlos erneuert, eine
Anmeldung lief also nie ab. NIST 800-63B nennt für die Anmeldung nur mit
Passwort 30 Tage als Obergrenze. Kurze Inaktivitätsgrenzen scheiden aus, weil
ein Rauswurf mitten im Formular Eingaben kostet.

Die Prüfung greift bei der nächsten Token-Erneuerung, nicht sekundengenau –
die tatsächliche Dauer kann eine Token-Laufzeit länger sein.

Sofort wirksam abmelden geht über "Von allen Geräten abmelden" in den
Einstellungen der App.

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
private Schlüssel liegt unter `/opt/flipbase/sicherung-schluessel.txt` – **auf
demselben Server**. Stirbt die Maschine, sind die Kopien auf dem zweiten
Server ohne ihn wertlos.

Deshalb einmalig auslesen und im Passwortmanager ablegen:

```bash
ssh root@168.119.246.33 'cat /opt/flipbase/sicherung-schluessel.txt'
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
