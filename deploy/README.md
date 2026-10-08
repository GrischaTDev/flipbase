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

### Marktplatz-Browser für den Admin-Pilot

Die Vinted-Seite ist nur für Plattformbetreiber mit Adminrechten im eigenen
Workspace erreichbar. Die Datenbank prüft diese Rechte auch bei direkten
Anfragen. Für die interaktive Anmeldung braucht die App zusätzlich den
separaten Marktplatz-Worker. Das [Worker-Abbild](../services/marketplace-worker/Dockerfile),
die [Compose-Vorlage](docker-compose.marketplace-worker.yml) und die
[Caddy-Route](Caddyfile) sind vorbereitet, werden aber nicht durch das
Web-Deployment aktiviert.

Nach geprüftem PR und ausdrücklicher Freigabe für die Servereinrichtung:

1. Das Worker-Abbild über den manuellen GitHub-Workflow
   `Publish Marketplace Worker Image` vom gemergten `master`-Commit
   veröffentlichen. Die Compose-Variable `FLIPBASE_MARKETPLACE_IMAGE` auf den
   vollständigen `sha-<40-stellige Commit-SHA>`-Tag setzen.
2. Die Compose-Vorlage nach `/opt/flipbase-marketplace/` kopieren und dort eine
   nur für den Serverbetreiber lesbare `marketplace-worker.env` nach
   [dieser Vorlage](marketplace-worker.env.example) anlegen. Der GoLogin-Token,
   Service-Role-Schlüssel und der Supabase-Anon-Schlüssel gehören nur dorthin.
   Der lokal per Windows geschützte Testtoken kann nicht unverändert in einem
   Linux-Container genutzt werden. Keine Werte in CI-Logs oder das Repository
   schreiben.
3. Die vorhandene produktive Caddy-Konfiguration mit der neuen
   `/marketplace-browser/*`-Route abgleichen und den Worker im selben
   `supabase_default`-Netz starten. Vor der Freigabe prüfen, dass
   `/marketplace-browser/healthz`
   intern erreichbar ist, die App-Navigation für Nichtbetreiber verborgen
   bleibt und der direkte API-Zugriff ohne Berechtigung scheitert.
4. Mit einer eigenen freigegebenen Kontoverbindung den Start, Browserbild,
   Kontowechsel, Ablauf, Widerruf und Stopp zuerst ohne Anmeldung prüfen.
   Erst danach die eigene Vinted-Anmeldung auf Desktop und iPad durchführen.

Ohne die Servereinrichtung zeigt die Admin-Seite „Browser-Testdienst ist nicht
verbunden“. Das Zusammenführen dieses Branches allein schaltet den
Live-Browser nicht frei.

### Webhooks und privater Chromium-Broker

Vor dem Merge der Webhook-Umstellung den geprüften Ordner
`supabase/functions/webhook-dispatch` nach
`/opt/supabase/volumes/functions/webhook-dispatch` installieren und den
Funktionsdienst neu laden. Die vorhandenen Supabase-Umgebungsvariablen genügen;
keine neuen Zugangsdaten sind erforderlich. Eine Anfrage ohne Anmeldung muss
abgewiesen werden. Erst danach darf der Release die Migration anwenden: sie
entzieht auch alten Browsern den direkten Zugriff auf gespeicherte Zugangsdaten.
Die Funktion muss beim Rückfall auf ältere Webversionen erhalten bleiben;
ein Rückfall darf die Datenbankrechte nicht wieder öffnen.

Die Chromium-Umstellung erfolgt nach erfolgreichen Image-Smokes getrennt vom
Web-Release. Worker und Kontobrowser zuerst über ihre bisherigen regulären
Stoppwege bestätigt beenden; bei Exitcode 75, 137 oder unklarem Zustand abbrechen.
Dann auf dem Pilothost `node deploy/prepare-chromium-broker.mjs` aus dem geprüften
Dateistand ausführen. Das Werkzeug kopiert ausschließlich Zuordnungen,
Worker-PID-Sperren und `cloud-networks.json` nach
`/opt/flipbase-marketplace/chromium-worker`. Die echten
Profile und Archive unter `chromium` bleiben erhalten. Ein vorhandenes oder
unvollständiges Metadatenziel muss vor erneutem Aufruf geprüft werden.
Ohne Node auf dem Host kann das geprüfte Broker-Abbild das Werkzeug einmalig
als root ausführen: Netzwerk deaktivieren und ausschließlich das Werkzeug lesend,
`/opt/flipbase-marketplace` sowie den Docker-Socket einbinden. Es werden keine
Supabase-Zugangsdaten an dieses Werkzeug übergeben. Die privaten Worker-Einstellungen
einschließlich `MARKETPLACE_CHROMIUM_NETWORK_FILE` müssen erhalten bleiben.

Worker, Broker und Sitzungsimage aus demselben gemergten Commit veröffentlichen.
`FLIPBASE_CHROMIUM_BROKER_IMAGE` auf den vollständigen SHA-Tag setzen und die
neue `docker-compose.marketplace-chromium-pilot.yml` installieren. Der Broker
bekommt weder `marketplace-worker.env` noch Supabase-Schlüssel. Den geprüften
Firewall-Skriptstand als root installieren und `setup`, danach `verify` ausführen;
ältere installierte Skripte werden vom Setup bewusst nicht überschrieben.
Der Broker erhält ausschließlich den zweiten CDP-Zugang `172.30.88.3`; die
Attestierung muss `v2` melden. Das alte Sitzungsimage erlaubt diesen Zugang nicht.
Erst danach die neue Compose-Konfiguration starten und Start, native Bedienung,
Stopp, Wiederanlauf und Archivierung mit einem freigegebenen Konto abnehmen.
Ein bloßer Web-Release schaltet den neuen Broker nicht produktiv frei.

Der Chromium-Worker startet mit `restart: unless-stopped` nach einem unerwarteten
Prozessende erneut. Ein ausdrücklich gestoppter Dienst bleibt gestoppt. Vor neuen
Aufträgen muss der Worker seine alleinige Datenbankberechtigung beanspruchen und
ungeklärte Browserreservierungen bereinigen; eine fehlgeschlagene Recovery gibt
keinen Kontozugriff frei. Hostbroker und Kontobrowser behalten ihre bisherigen
Startregeln. Die Neustartregel muss auch in der aktiven Compose-Datei auf dem
Server übernommen werden.

Das Ereignis `marketplace_runtime_lost` enthält ausschließlich eine feste
Fehlerkategorie in `reason`: `claim_failed`, `run_failed`, `heartbeat_rejected`,
`heartbeat_expired`, `heartbeat_failed`, `runtime_expired` oder
`reservation_uncertain`. Es enthält weder Anbieterantworten noch Zugangsdaten.

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

### Lokalen Speicher begrenzen

Die Aufbewahrung ist getrennt nach Zweck:

- Alle von laufenden oder gestoppten Containern verwendeten Images bleiben bestehen.
  Zusätzlich bleiben je Flipbase-Dienst zwei unbenutzte Rückfallversionen erhalten.
  Ein Dienst ohne Container behält seine drei neuesten Versionen. Mit
  `--include-supabase` gilt dieselbe Grenze für Supabase. Docker-Hub- und ECR-Namen
  desselben Dienstes teilen die Grenze; ein Image wird anhand seiner ID gezählt.
  Alle in den aktiven Compose-Dateien vorgesehenen Images bleiben zusätzlich
  geschützt. Fehlende Compose-Metadaten brechen die Bereinigung ab. Fremde Images,
  Container und Volumes werden nicht entfernt.
- Lokal bleiben drei verschlüsselte Sicherungen vor Release-Migrationen sowie
  sieben vollständige nächtliche Sätze aus Datenbank, Dateien und Konfiguration.
  Unvollständige oder unbekannte Dateien werden nicht automatisch gelöscht.
  Lesbare Duplikate vollständiger Sätze werden nach der externen Prüfung entfernt.
- Die externe Aufbewahrung auf dem zweiten Server bleibt bei etwa 30 Tagen.
  Sie ersetzt keine getrennte Wiederherstellungsprüfung. Änderungen ihrer
  Aufbewahrung erfolgen ausschließlich auf dem zweiten Server; der
  Produktionsschlüssel erhält weiterhin keine Löschrechte dort.

`cleanup-server-storage.py` zeigt ohne `--apply` nur die Auswahl. Mit
`--verify-offsite` vergleicht die Vorschau die verbleibenden Sicherungen über den
bestehenden SSH-/rsync-Zugang inhaltlich. Fehlende oder abweichende Kopien verhindern
die lokale Backup-Löschung. Bei laufenden Deployments oder Sicherungen bricht die
Bereinigung an der gemeinsamen Sperre ab und der nächste Cronlauf versucht es erneut.
Die Images werden unabhängig von der Erreichbarkeit des Backupservers bereinigt.
Freigegebene Bytes der Backupdateien sind exakt; Imagegrößen enthalten gemeinsam
genutzte Schichten und erlauben erst nach der Bereinigung eine exakte Aussage.

Nach Review und ausdrücklicher Freigabe auf dem Produktionsserver installieren:
`cleanup-server-storage.py` als root-eigene Datei mit Modus `0700` unter
`/opt/flipbase/`, die geprüften `backup.sh` und `migration-backup.sh` ebenfalls
root-eigen mit Modus `0700`. Die bisherige automatische altersbasierte Löschung
in `backup.sh` entfällt zugunsten der Inhaltsprüfung und Satzaufbewahrung.
Zunächst `python3 -B /opt/flipbase/cleanup-server-storage.py --include-supabase --verify-offsite`
prüfen, dann die freigegebene Auswahl einmal mit `--apply` ausführen und freien
Speicher sowie Dienste gegenprüfen. `cron-server-storage` als root-eigene Datei
mit Modus `0644` nach `/etc/cron.d/flipbase-server-storage` legen; der Auftrag
läuft stündlich. Er erfordert nur das bereits vorhandene Python 3, Docker und rsync.
Eine entfallene Rückfallversion kann später aus der Registry geladen werden;
ein Datenbank-Rollback bleibt eine gesondert zu prüfende Wiederherstellung.

Die Zahlen für drei Releases, sieben lokale Tagesstände und zwei Rückfallimages
sind die konkrete Flipbase-Regel, keine allgemeingültige Sicherheitsnorm.
Zweckbezogene, tägliche und längere getrennte Aufbewahrung sowie eine Vorschau
entsprechen den dokumentierten Möglichkeiten von
[restic](https://restic.readthedocs.io/en/stable/060_forget.html).
[CISA](https://www.cisa.gov/stopransomware/ransomware-guide) empfiehlt verschlüsselte,
getrennt geschützte Sicherungen und regelmäßige Wiederherstellungsprüfungen.

### Speicher im Betreiberbereich anzeigen

Ein lokaler, gehärteter Systemd-Timer meldet jede Minute ausschließlich Gesamtgröße,
belegten und für die Anwendung verfügbaren Speicher sowie Messzeit für die
Root-Partition. Dieser Prozess braucht für die Größenmessung weder
Rootrechte noch einen Docker-Socket. Das Ergebnis wird über eine eng begrenzte
Schreibfunktion mit eigenen Zugangsdaten an die bestehende Datenbank gemeldet.
Der Zugang darf ausschließlich den einen Messdatensatz aktualisieren, nicht
Kundendaten lesen oder die allgemeine Service-Rolle verwenden.

Die Tabelle `server_storage_status` mit RLS gibt Leserechte ausschließlich bestehenden
Plattformbetreibern über `public.is_platform_operator()`. Das Adminpanel verwendet
seine bestehende Anmeldung. Öffentlich neue Ports, SSH-Zugang aus dem Browser,
Docker-Socket im Webcontainer und frei ausführbare Serverbefehle sind dafür nicht
erforderlich. Unter **Administration → Server-Speicher** stehen absolute Werte,
Prozent und Messzeit. Nach drei Minuten ohne neue Messung oder einem Ladefehler
ist der Stand unbestätigt. Warnstufen: 80/90 Prozent oder weniger als 10/5 GiB frei.
Die Prozentberechnung entspricht `df`: Reservierte Systemblöcke zählen nicht zum
für Anwendungen verfügbaren Platz. Reservierter Speicher wird separat erläutert.

Die Migration erzeugt weder einen Login noch ein Passwort. Nach ihrem regulären
Release wird der lokale Zugang einmalig auf dem Server eingerichtet:

1. Falls `/usr/bin/psql` fehlt, nur den PostgreSQL-Client installieren
   (`apt-get install postgresql-client`), keinen zusätzlichen Datenbankserver.
2. `install-server-storage-monitor.py`, `report-server-storage.py`,
   `flipbase-server-storage.service` und `flipbase-server-storage.timer` in einen
   ausschließlich von root beschreibbaren Installationsordner kopieren.
3. Dort als root `python3 -B install-server-storage-monitor.py` ausführen.
   Der Installer prüft die vorhandene Meldefunktion, erzeugt ein eigenes Passwort,
   legt das root-eigene Credential unter `/etc/flipbase/server-storage.pg_service.conf`
   mit Modus 0600 ab und startet zunächst eine Meldung, danach den Minutentimer.
4. `systemctl status flipbase-server-storage.timer` und
   `journalctl -u flipbase-server-storage.service -n 10` prüfen. Im Adminpanel müssen
   aktuelle Werte mit aktuellem Messzeitpunkt erscheinen; Nichtbetreiber sehen sie nicht.

Der Meldeprozess läuft als temporärer unprivilegierter Systemd-Nutzer. Er verbindet
sich ausschließlich mit dem schon vorhandenen Loopback-Datenbankport. Der eigene
Login besitzt keine Rollenmitgliedschaften, keine Tabellenrechte und ausschließlich
EXECUTE auf `report_server_storage(bigint,bigint,bigint)`. Die Funktion kann nur den
Datensatz mit ID 1 ersetzen, keine Messhistorie aufbauen. Sie läuft mit festen
Tabellenbezügen und leerem `search_path`; PUBLIC, Anon, Anmeldung und allgemeine
Dienstrolle erhalten keine Ausführungsrechte. Der Browser erhält keine Meldezugangsdaten.

Systemd reicht die Zugangsdaten über `LoadCredential` an libpq weiter;
`PGSERVICEFILE` verweist nur auf diesen geschützten Dateipfad. Passwort und
Verbindungsfehler werden nicht protokolliert. Schon beim Einrichten gelangt nur
ein SCRAM-Verifier ins SQL, kein Klartextpasswort für Datenbank-Auditlogs.
Die PostgreSQL-
[Service-Datei](https://www.postgresql.org/docs/17/libpq-pgservice.html) verhindert
Passwörter in Prozessargumenten. Die Rechte folgen dem Supabase-
[RLS-Modell](https://supabase.com/docs/guides/database/postgres/row-level-security).
Eine erneute Installation rotiert ausschließlich dieses Meldepasswort. Nach einem
Restore den Installer erneut ausführen; Kundenzugangsdaten bleiben davon unabhängig.

Der CLI-Abgleich hat bei neuen Objekten pauschale bestehende Default-Grants nicht
vollständig aufgehoben. `scripts/server-storage-migration.mjs` ergänzt deshalb die
expliziten Rechte aus dem deklarativen Schema in die neu erzeugte Migration.
Die DB-Tests prüfen diesen Fall einschließlich sofortigem Entzug von Betreiberrechten.

### Gemessene Restbelegung am 6. Oktober 2026

Nach der ersten Bereinigung: ungefähr 44 GiB belegt, 29 GiB verfügbar, 61 Prozent.
Die folgenden Größen sind gemessene Verzeichnisgrößen; Docker-Imagegrößen und
Container-Mounts dürfen nicht zusätzlich dazu addiert werden.

| Bereich                             | Belegung      | Einordnung                                                                           |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Docker/containerd                   | etwa 30 GiB   | Komprimierte Images und entpackte Schichten; mehrere Supabase- und Browser-Versionen |
| Docker-Verwaltung, Logs und Volumes | etwa 1,7 GiB  | Containerlogs knapp 1 GiB, überwiegend Envoy, Realtime und Pooler                    |
| Swapdatei                           | 4 GiB         | Auslagerungsspeicher des Betriebssystems                                             |
| Lokale Sicherungen                  | etwa 2,7 GiB  | Drei Release-Sicherungen und sieben vollständige Tagesstände                         |
| PostgreSQL-Daten                    | etwa 2,2 GiB  | Feed allein etwa 1,9 GiB inklusive Indizes und ausgelagerter Werte                   |
| Systemlogs                          | etwa 0,6 GiB  | Journal etwa 0,5 GiB                                                                 |
| Betriebssystem unter `/usr`         | etwa 1,9 GiB  | Programme und Bibliotheken                                                           |
| Browserprofile und Diagnoseordner   | etwa 0,45 GiB | Echte Profile nicht als Cache löschen                                                |

Weitere unbenutzte Supabase-Versionen und große Browser-Rückfallversionen erklären
den Hauptteil des zusätzlichen Einsparpotenzials. Der aktive Chromium-Stand ist
kleiner als die beiden erhaltenen Vorgänger. Zusätzlich laufen zeitweise isolierte
Datenbanktests anderer Sitzungen; deren Container und Images werden nicht entfernt.
Die freigegebene Supabase-Begrenzung ist im stündlichen Auftrag eingeschaltet;
sie schützt alle Container- und Compose-Versionen plus zwei zusätzliche Versionen
je Dienst. Das Entfernen eines Images verändert keine Datenbank und keine Volumes.
Ein späterer Bereinigungsschritt muss Aliasse aus Docker Hub/ECR, aktuelle
Compose-Konfigurationen und alle Container gemeinsam berücksichtigen. Docker-
Volumen, Datenbankdateien und Browserprofile sind keine pauschalen Löschkandidaten.

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
   `beta-application`, `beta-invite`, `beta-register` und deren gemeinsames `_shared`-Verzeichnis.
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

   Die zentrale Vinted-Markenauswahl benötigt die Edge Function
   `vinted-brand-search`. Sie muss mit den übrigen Funktionsordnern vor der
   Freischaltung der neuen Admin-Oberfläche auf den Server gelangen. Die
   Funktion prüft die Anmeldung und das Plattformbetreiberrecht selbst; für
   die Abfrage bei Vinted ist kein zusätzlicher Schlüssel nötig.

   Die Referenzbibliothek benötigt `brand-label-media` vor ihrer Leserfreigabe.
   Der Endpunkt prüft Anmeldung und Bildzugang selbst, erstellt private Bildlinks
   mit 60 Sekunden Laufzeit und lässt Uploads nur für Plattformbetreiber zu.
   Er wird mit den übrigen Funktionsordnern übertragen; zusätzliche Schlüssel
   oder öffentliche Storage-Buckets sind nicht erforderlich.

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

Der vorbereitete Borg-Umbau, die Umschaltung und der vollständige Restore-Test sind
in [BACKUP-OPERATIONS.md](BACKUP-OPERATIONS.md) beschrieben. Die folgende age-Anleitung
bleibt für den bisherigen Betrieb und die vorhandenen Release-/Altsicherungen relevant.

Läuft nachts um 03:30 Uhr auf dem Flipbase-Server und erfasst Datenbank
(inklusive Rollen), hochgeladene Dateien und die `.env` mit allen Schlüsseln.

Danach wird alles **verschlüsselt** und auf den zweiten Server (n8n,
`168.119.165.201`) übertragen. Bisherige lokale Aufbewahrung: sieben vollständige
Tagesstände und drei Release-Punkte; der externe Altbestand war altersbasiert auf
etwa 30 Tage begrenzt. Nach der Borg-Umschaltung gelten die begrenzten Tages- und
Wochenstände aus der Betriebsanleitung.

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
