# Serverkonfiguration

Die Dateien in diesem Ordner beschreiben die vorgesehene Serverkonfiguration.
Der installierte Stand kann älter sein. Der neue Migrationsweg ist vorbereitet,
aber noch nicht installiert; Voraussetzungen und Freigaben stehen in
[RELEASE-PIPELINE.md](RELEASE-PIPELINE.md).
Sie liegen hier, damit die Einrichtung nachvollziehbar und wiederherstellbar
ist – die nächtliche Sicherung erfasst Datenbank und Schlüssel, aber nicht die
Konfiguration des Reverse Proxy.

Sie werden **nicht automatisch ausgerollt**. Wer hier etwas ändert, muss es
auch auf den Server bringen. Die Ausnahme sind die Anwendung und der
Sniper-Dienst – beide rollen bei einem passenden Push auf `master` von allein
aus.

## Deployment der Anwendung

Bei jedem Push auf `master` läuft [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. **Required checks** – Format, Lint, Typen und alle ausgewählten Prüfungen.
   PRs bauen Angular in Quality, master im Docker-Job. Ohne erfolgreiche
   Gesamtfreigabe gibt es kein Deployment.
2. **Publish image** – baut bei Anwendungsänderungen das Webabbild und bei
   Änderungen unter `services/sniper` zusätzlich das separate Botabbild. Beide
   werden geprüft und unter `sha-<kurz>` in die GitHub Container Registry gelegt.
   Der vollständige Digest des Webabbilds wird für den neuen Releaseweg
   weitergereicht.
3. **Deploy** – meldet sich per SSH am Server an und startet
   `/opt/flipbase/deploy.sh` mit den geänderten Diensten. Das Skript lädt die
   passenden Kennzeichnungen, tauscht Web- und/oder Sniper-Container aus und
   wartet, bis jeder gestartete Container sich gesund meldet. Danach verlangt
   die Pipeline von der öffentlichen Startseite HTTP 200 und vergleicht die
   dort ausgelieferte vollständige Build-SHA mit dem auslösenden Git-Commit.

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
- **Migrationen brauchen eine geprüfte Freigabe.** Bis zum Serverbootstrap bleibt
  der bisherige Abgleich aktiv. Danach führt der neue Runner ausschließlich
  freigegebene Migrationen aus dem Release-Digest aus; Details einschließlich
  Backup und getrenntem Altbestand in [RELEASE-PIPELINE.md](RELEASE-PIPELINE.md).
- **Die Pipeline prüft aber, ob sie gelaufen sind.** Vor dem Ausliefern
  vergleicht sie die Dateien in `supabase/migrations/` mit dem, was die
  Datenbank als angewendet meldet, und **bricht ab**, wenn eine fehlt — samt
  Namen und Verweis auf den geprüften Bootstrapweg. Grund: Am 21.08.2026 lag eine
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

| Datei                           | Ort auf dem Server                               |
| ------------------------------- | ------------------------------------------------ |
| `Caddyfile`                     | `/opt/supabase/volumes/proxy/caddy/Caddyfile`    |
| `docker-compose.localports.yml` | `/opt/supabase/`                                 |
| `docker-compose.landing.yml`    | `/opt/supabase/`                                 |
| `docker-compose.app.yml`        | `/opt/flipbase/docker-compose.yml`               |
| `docker-compose.sniper.yml`     | `/opt/flipbase-sniper/docker-compose.sniper.yml` |
| `backup.sh`                     | `/opt/flipbase/backup.sh`                        |
| `deploy.sh`                     | `/opt/flipbase/deploy.sh` (ausführbar)           |
| `cron-aufraeumen-n8n-server`    | `/etc/cron.d/…` auf dem **zweiten** Server       |
| `docker-compose.authelia.yml`   | `/opt/supabase/`                                 |
| `authelia/configuration.yml`    | `/opt/authelia/config/configuration.yml`         |
| `authelia/passwort-setzen.sh`   | `/opt/authelia/passwort-setzen.sh`               |
| `authelia/users.example.yml`    | Vorlage für `/opt/authelia/config/users.yml`     |
| `landing/index.html`            | `/opt/flipbase-landing/index.html`               |

Die beiden Zusatzdateien unter `/opt/supabase` sind in `COMPOSE_FILE` in der
`.env` eingetragen. Reihenfolge beachten: `docker-compose.caddy.yml` muss vor
`docker-compose.landing.yml` stehen, und beide nach `docker-compose.yml`.

**Die Landingpage hängt am Caddyfile.** Sie ist eine Caddy-Vorlage und wertet
im Kopfbereich eine Cookie-Bedingung aus. Ohne einen `flipbase.de`-Block mit
`templates` in der Ausrollung liefert Caddy diese Bedingung als rohen Text
aus – sichtbar für jeden Besucher. Deshalb darf die Seite nur zusammen mit
einem passenden Caddyfile ausgerollt werden. Das Release-Abbild enthält deshalb
beides. `deploy.sh` prüft und lädt zuerst das Caddyfile und synchronisiert erst
danach die Landingpage. Bei einer ungültigen Konfiguration stellt es den vorigen
Caddy-Stand wieder her.

_Hinweis zur Automatisierung:_ `deploy.sh` spiegelt die im Web-Container
enthaltene Landingpage nach einem erfolgreichen Container-Start automatisch nach
`/opt/flipbase-landing/`. Der eingeschränkte CI-Schlüssel darf das Deployskript
nicht selbst ersetzen. Vor dem ersten Release mit dieser Kopplung muss daher
einmalig die geprüfte Fassung von `deploy/deploy.sh` über den getrennten
Betreiberzugang nach `/opt/flipbase/deploy.sh` installiert werden.

### Beta-Bewerbungsformular

Die Landingpage lädt für den Bewerbungsweg genau ein lokales Skript aus
`landing/landing.js`. Die Content-Security-Policy erlaubt Skripte ausschließlich
von derselben Herkunft und benötigt dadurch keinen bei jeder Änderung neu zu
berechnenden Inline-Hash. Daraus folgen drei Dinge, die beim Ausrollen
zusammengehören:

1. **Caddyfile und Landingpage stammen aus demselben Release.** `deploy.sh` lädt
   die passende CSP vor der Seite. Der öffentliche Nachtest prüft zusätzlich,
   dass `landing.js` erreichbar ist und die ausgelieferte `script-src`-Richtlinie
   lokale Skripte tatsächlich erlaubt. So kann ein veralteter Header nicht mehr
   unbemerkt einen wirkungslosen Formularbutton hinterlassen.
2. **Das Skript bleibt lokal und eingebetteter Code bleibt gesperrt.** Der Test
   `src/app/core/services/landing-template.spec.ts` hält HTML, Skriptquelle,
   `script-src` und `connect-src` zusammen.
3. **Die Edge Functions rollt keine Pipeline aus.** Alle vom Repository
   verwalteten Ordner unter `supabase/functions/` müssen gemeinsam nach
   `/opt/supabase/volumes/functions/` übertragen werden. Das umfasst mindestens
   `beta-application`, `beta-invite` und deren gemeinsames `_shared`-Verzeichnis.
   Einzelne Funktionsordner dürfen nicht getrennt ausgerollt werden, weil beide
   Beta-Funktionen dieselben Mailbausteine importieren. Die Ordner werden jeweils
   einzeln gespiegelt: Ein `rsync --delete` auf dem übergeordneten Zielordner
   würde die von der Supabase-Installation bereitgestellten Ordner `main` und
   `hello` löschen und den Funktionsdienst unstartbar machen. Danach werden
   Funktions- und Auth-Dienst gemeinsam neu erzeugt:

   ```sh
   for function_directory in supabase/functions/*/; do
     function_name="$(basename "$function_directory")"
     rsync -a --delete "$function_directory" "/opt/supabase/volumes/functions/$function_name/"
   done
   docker compose up -d --force-recreate functions auth
   ```

   Für `barcode-ai-search` muss `OPENAI_API_KEY` in `/opt/supabase/.env`
   stehen. `deploy/docker-compose.barcode-ai.yml` reicht den Schlüssel nur an
   den Funktionsdienst durch. Die Datei gehört nach `/opt/supabase/` und als
   letzter Eintrag in `COMPOSE_FILE`; ein Eintrag in `.env` allein reicht nicht.
   Die Funktion wird mit den anderen Funktionsordnern im obigen Schritt
   übertragen. Der Schlüssel darf nicht in den Angular-Bau gelangen.

   **Mehrfoto-Suche:** Die App-Version ab 25.09.2026 sendet zusätzlich zur alten
   `imageDataUrl` eine Liste `additionalImageDataUrls`. Die alte Serverfunktion verwendet
   davon nur das erste Foto; die App kennzeichnet solche Ergebnisse. Damit alle
   Fotos ausgewertet werden, muss die aktuelle Funktion aus demselben geprüften
   Commit mit dem obigen Verfahren auf den Server übertragen und der
   Funktionsdienst neu gestartet werden. Ein grüner Web-Deployment-Lauf belegt
   diesen Schritt nicht. Nach dem Rollout die Suche mit mehreren echten Fotos
   in der App prüfen; der Hinweis auf das erste Foto darf nicht mehr erscheinen.

   Die beiden Beta-Variablen unten gehören in `/opt/supabase/.env` **und** müssen
   an den Container durchgereicht werden: Der `environment:`-Block des Dienstes
   `functions` in der mitgelieferten `docker-compose.yml` zählt die Variablen
   einzeln auf, eine neue Zeile in der `.env` allein erreicht ihn also nicht.
   Dafür gibt es `deploy/docker-compose.beta-application.yml`; sie gehört nach
   `/opt/supabase/` und in die Liste `COMPOSE_FILE` in `/opt/supabase/.env`.

   Die Zusatzdatei setzt am Auth-Dienst außerdem
   `GOTRUE_DISABLE_SIGNUP=true`. Damit weist der produktive GoTrue-Endpunkt
   `/auth/v1/signup` freie Registrierungen ab; Betreiber-Einladungen bleiben
   möglich. Nach dem Neustart muss ein anonymer Signup-Smoke-Test fehlschlagen,
   während eine Einladung über den Betreiberbereich weiterhin versendet werden
   kann. Die Einstellung nur in `supabase/config.toml` reicht für den
   selbstgehosteten Produktionsdienst nicht aus.

   In `/opt/supabase/.env` muss außerdem
   `ADDITIONAL_REDIRECT_URLS=https://app.flipbase.de/auth/set-password` enthalten
   sein. GoTrue verwirft sonst das Ziel aus dem Einladungslink und leitet nur auf
   die Startadresse der App weiter; die verpflichtende Passwortvergabe würde
   dadurch übersprungen. Weitere bereits benötigte Zieladressen bleiben als
   kommagetrennte Werte in derselben Variablen erhalten.

   Dieselbe Zusatzdatei reicht die vorhandenen GoTrue-SMTP-Werte unter eigenen
   `BETA_SMTP_*`-Namen an die Edge Functions weiter. Dadurch verwenden
   Eingangsbestätigung und spätere Einladungswiederholung dasselbe
   Mailbox.org-Konto, ohne Zugangsdaten im Repository zu speichern:

   | Edge-Variable          | Vorhandener Serverwert |
   | ---------------------- | ---------------------- |
   | `BETA_SMTP_HOST`       | `SMTP_HOST`            |
   | `BETA_SMTP_PORT`       | `SMTP_PORT`            |
   | `BETA_SMTP_USER`       | `SMTP_USER`            |
   | `BETA_SMTP_PASS`       | `SMTP_PASS`            |
   | `BETA_SMTP_FROM_EMAIL` | `SMTP_ADMIN_EMAIL`     |
   | `BETA_SMTP_FROM_NAME`  | `SMTP_SENDER_NAME`     |

   `BETA_APP_URL` ist die öffentliche App-Adresse für Registrierungslinks und
   wird in der Zusatzdatei standardmäßig auf `https://app.flipbase.de` gesetzt.

   **Beta-Bewerbungen:** Jede neu gespeicherte Bewerbung löst zusätzlich zur
   Eingangsbestätigung eine Betreiber-Mail aus. Empfänger ist standardmäßig
   `beta@flipbase.de`; bei Bedarf setzt `BETA_OPERATOR_EMAIL` in
   `/opt/supabase/.env` eine andere Adresse. Mehrfachbewerbungen senden keine
   weitere Benachrichtigung. Der Versandstatus steht an der Bewerbung in der
   Datenbank (`operator_email_status`); ein fehlgeschlagener Versand blockiert
   weder die Bewerbung noch die Eingangsbestätigung. In der Bewerbungsübersicht
   erscheint dann ein Hinweis mit einer Aktion zum erneuten Versand.

   **Discord für freigeschaltete Beta-Nutzer:** In der vorhandenen Discord-App
   einen Bot aktivieren und ihn auf den Flipbase-Server einladen. Der Bot braucht
   `Manage Roles` (Berechtigungswert `268435456`); seine höchste Rolle muss in
   der Server-Rollenliste oberhalb von „Beta-Tester“ stehen. Unter OAuth2 die
   Weiterleitungsadresse
   `https://app.flipbase.de/auth/discord-callback` exakt eintragen. Die
   Anwendung fordert nur `identify` und `guilds.join` an. Der Nutzer stimmt
   auf Discord ausdrücklich zu, bevor der Bot ihn hinzufügt und die Rolle
   vergibt. Bei aktivierter Discord-Mitgliedschaftsprüfung muss der Nutzer
   diese zusätzlich abschließen.

   Die Registrierung zeigt Passwort, Workspace und Discord als drei Schritte.
   Nach der Discord-Freigabe kehrt der Nutzer zum dritten Schritt zurück und
   sieht dort eine Willkommensbestätigung mit einem Link direkt zum Server.
   Der Discord-Schritt kann übersprungen werden; solange die Verbindung fehlt,
   erinnert das Dashboard später daran. Eine Kanalnachricht versendet der Bot
   nicht, daher benötigt er keine Nachrichtenberechtigung.

   Folgende Werte gehören ausschließlich in `/opt/supabase/.env` und werden
   über `deploy/docker-compose.beta-application.yml` an den Funktionsdienst
   durchgereicht:

   | Variable                     | Inhalt                                                   |
   | ---------------------------- | -------------------------------------------------------- |
   | `DISCORD_CLIENT_ID`          | Anwendungs-ID aus dem Discord Developer Portal           |
   | `DISCORD_CLIENT_SECRET`      | OAuth2-Client-Secret                                     |
   | `DISCORD_BOT_TOKEN`          | Token des Bots                                           |
   | `DISCORD_GUILD_ID`           | ID des Flipbase-Servers                                  |
   | `DISCORD_BETA_ROLE_ID`       | ID der Rolle „Beta-Tester“                               |
   | `DISCORD_OAUTH_STATE_SECRET` | Zufälliger, langer Serverschlüssel für den OAuth-Zustand |

   Den Zustandsschlüssel einmalig mit `openssl rand -hex 32` erzeugen. Solange
   die Discord-Werte fehlen, zeigt das Dashboard keinen Verbindungsbanner.
   Nach dem Eintragen den Funktionsdienst neu erzeugen. Die neue Edge Function
   `beta-discord` muss zusammen mit den anderen Funktionsordnern ausgerollt
   werden. Anschließend einen angenommenen Beta-Testnutzer durch Registrierung,
   Discord-Freigabe und Rollenprüfung führen; mit einem nicht angenommenen
   Konto muss die Verbindung abgewiesen werden. Geheimnisse weder in den
   Angular-Bau noch in Git eintragen.

   Ohne die Durchreichung antwortet die Funktion mit **500 statt 400** – der
   fehlende Pfeffer wird absichtlich laut, nicht still.

   | Variable                           | Wozu                                                                                                                                                                                                                      |
   | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `BETA_APPLICATION_PEPPER`          | Serverschlüssel für den Streuwert der Herkunft. **Fehlt er, verweigert die Funktion den Dienst** – absichtlich, denn ohne ihn wäre der Streuwert ungesalzenes SHA-256 über die IP-Adresse und vollständig zurückrechenbar |
   | `BETA_APPLICATION_ALLOWED_ORIGINS` | Kommaliste der erlaubten Herkünfte. Bewusst **nicht** `ALLOWED_ORIGINS` – die liest bereits `marketplace-search`, und alle Edge Functions teilen sich beim Selbsthosten eine Umgebung                                     |

   Der Pfeffer ist ein Zugangsschlüssel: Wer ihn kennt, kann Streuwerte
   nachrechnen. Er gehört in die Servergeheimnisse, nicht ins Projekt.

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
| `GOTRUE_JWT_EXP`                     | `900`  | 15 Minuten Laufzeit des Zugriffstokens (Sekunden).    |

Die beiden Grenzen im Go-Zeitformat. Die Variable **weglassen** bedeutet "nie";
`0` wird abgelehnt. `GOTRUE_JWT_EXP` zählt dagegen in Sekunden.

Warum diese Werte: Ohne Timebox wird das Refresh-Token endlos erneuert, eine
Anmeldung lief also nie ab. NIST 800-63B nennt für die Anmeldung nur mit
Passwort 30 Tage als Obergrenze. Kurze Inaktivitätsgrenzen scheiden aus, weil
ein Rauswurf mitten im Formular Eingaben kostet.

Die Prüfung greift bei der nächsten Token-Erneuerung, nicht sekundengenau –
die tatsächliche Dauer kann eine Token-Laufzeit länger sein.

### Warum "Von allen Geräten abmelden" nicht sofort wirkt

Das ist keine Schwäche dieser Installation, sondern die Bauweise von JWT:
Auth0, Cognito und Clerk verhalten sich genauso. Abmelden entwertet das
**Erneuerungstoken** und löscht die Sitzung; das bereits ausgegebene
**Zugriffstoken** bleibt bis zu seiner Ablaufzeit gültig, weil niemand beim
Aussteller nachfragt.

Nachgemessen an dieser Installation, nachdem die Sitzung gelöscht wurde:

| Anfrage mit dem alten Token | Antwort                    |
| --------------------------- | -------------------------- |
| `/auth/v1/user`             | 403 – sofort abgewiesen    |
| `/rest/v1/<tabelle>`        | **200, mit Daten**         |
| Token erneuern              | 400 – Token nicht gefunden |

Ein abgemeldetes Gerät kann also bis zum Ablauf seines Tokens **weiter Daten
lesen und schreiben**: PostgREST prüft nur Signatur und Ablaufzeit und weiß
von gelöschten Sitzungen nichts. Deshalb `GOTRUE_JWT_EXP=900` – 15 Minuten
sind der Branchenstandard für Zugriffstoken (Okta erlaubt 5 Minuten bis
24 Stunden und empfiehlt 15).

Was in der Praxis passiert, wenn "Von allen Geräten abmelden" gedrückt wird:

- Anderes Gerät **offen und online**: fliegt **sofort** raus. Die abmeldende
  Instanz schickt vorher ein Signal über einen privaten Realtime-Kanal
  (`user:<id>:sessions`), das die anderen Fenster empfangen. Nachgemessen:
  unter drei Sekunden, ohne Klick und ohne Neuladen.
- Anderes Gerät **lädt neu**: sofort abgemeldet. Die App fragt beim Start
  einmal über `getUser()` nach und bekommt den 403.
- Anderes Gerät **war offline** oder hat das Signal verpasst: meldet sich
  **von allein** ab, sobald die Token-Erneuerung fällig wird und scheitert –
  spätestens nach 15 Minuten.

Das Signal ist bewusst nur ein Hinweis, keine Sperre: Es meldet niemanden ab,
sondern loest eine Nachfrage bei `/auth/v1/user` aus. Erst deren 403
entscheidet. Wer das Signal ignoriert, behaelt sein Token bis zum Ablauf – die
harte Grenze bleiben die 15 Minuten.

Der Kanal ist ueber Policies auf `realtime.messages` an die eigene Kennung
gebunden (Migration `20260823160000_sitzungskanal_freigeben.sql`), niemand
hoert fremde Kanaele mit.

Wirklich sekundengenau ginge nur mit serverseitig geprüften Sitzungen bei
jeder Anfrage – eine andere Bauweise, nicht nachrüstbar.

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
Authenticator-App unter _Einmal-Passwort_ hinterlegen. Authelia versendet den
Bestätigungscode an die E-Mail-Adresse des Benutzers in
`/opt/authelia/config/users.yml`. _WebAuthn Zugangsdaten_ sind für Passkeys und
Sicherheitsschlüssel, nicht für Authenticator-Apps.

Der Authelia-Dienst verwendet die vorhandenen Mailbox.org-Werte aus
`/opt/supabase/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` und
`SMTP_ADMIN_EMAIL`. Docker Compose reicht `SMTP_PASS` als Secret-Datei weiter;
das Passwort steht weder in `configuration.yml` noch in der Container-Umgebung.
Vor dem Neustart müssen `deploy/docker-compose.authelia.yml` und
`deploy/authelia/configuration.yml` an die oben genannten Serverorte kopiert
werden. Die bestehende `COMPOSE_FILE`-Liste bindet die Authelia-Zusatzdatei
bereits ein. Danach auf dem Server:

```bash
cd /opt/supabase
docker compose config --quiet
docker compose up -d --force-recreate authelia
docker compose ps authelia
```

Der SMTP-Starttest muss erfolgreich sein. Anschließend _Einmal-Passwort →
Hinzufügen_ öffnen und prüfen, dass der neue Bestätigungscode per E-Mail
ankommt. Einen bereits offenen Code-Dialog zuerst abbrechen und neu öffnen.
Nach der Eingabe des E-Mail-Codes erscheint der QR-Code für die
Authenticator-App; deren aktuellen Code zur Registrierung bestätigen.

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
