# Vinted-Bot betreiben

Der Bot ist ein eigener Node-Dienst. Das Nginx-Abbild der Webanwendung startet
ihn nicht. Er liest den Vinted-Kategoriebaum auch ohne persönliche Feeds ein.
Welche Artikel im Live-Feed gesammelt werden, bestimmen die gestarteten Feeds
mit gültigem Zugang. Geteilte Sammelaufträge liest er über
`public.sniper_active_personal_collections`.

Änderungen unter `services/sniper` bauen und veröffentlichen über die
Produktionspipeline automatisch ein eigenes Botabbild. Der Webcontainer und der
Snipercontainer werden dabei getrennt aktualisiert; ein erfolgreicher
Webdeploy allein beweist deshalb noch kein Botupdate.

## Nachgewiesener Ausgangsfehler am 12.09.2026

Auf dem Flipbase-Server war kein Bot-Container oder Bot-Systemdienst vorhanden.
`vinted_category_syncs.requested_at` war gesetzt, aber es gab keinen letzten
Versuch, null Kategorien, null Suchaufträge und null Artikel. Ein einzelner
Abruf der Vinted-Startseite vom Server lieferte HTTP 200. Der vorhandene Parser
las daraus 2.920 Kategorien, davon 2.500 Blätter. Die fehlende Inbetriebnahme
war damit die Ursache der unbearbeiteten Anforderung.

## Lokal prüfen

```sh
cd services/sniper
npm ci
npm test
npm run typecheck
npm run build
```

Für einen lokalen Start die Werte aus `.env.example` in einer lokalen `.env`
setzen und `npm start` ausführen. Nur die dafür vorgesehene Datenbank verwenden.
Ein gestarteter Bot arbeitet die dort angeforderten Live-Suchen ab.

## Abbild und isolierter Starttest

Der Build-Kontext ist ausschließlich `services/sniper`. Die Positivliste in
`.dockerignore` schließt insbesondere `.env`, Testdaten und lokale Abhängigkeiten
aus. Das fertige Abbild enthält nur Laufzeitabhängigkeiten und übersetzten Code.

```sh
docker build --tag flipbase-sniper:review services/sniper
node services/sniper/scripts/smoke-image.mjs flipbase-sniper:review
```

Der Starttest verwendet keine gültigen Schlüssel, kein Netzwerk und kein
beschreibbares Container-Dateisystem. Er prüft den echten Prozesseinstieg,
den unprivilegierten Benutzer und die Trennung der beiden Statusendpunkte:

- `/live`: HTTP 200 bedeutet, der Node-Prozess beantwortet Anfragen. Das ist
  der Docker-Healthcheck, damit null Suchaufträge keinen falschen Alarm auslösen.
- `/health`: HTTP 503 bis zur ersten erfolgreichen Suchrunde, danach HTTP 200
  mit deren Zeitstempel. Das ist kein Nachweis für eine aktuell funktionierende
  Verbindung. Im Betrieb immer auch das Alter des Zeitstempels sowie Logs und
  Kategorienstatus prüfen. `/live` allein belegt keinen funktionierenden Sammler.

Die bestehende CI führt Build und Starttest im Job `Sniper service` aus.
Das testet die Betriebsdateien, installiert aber noch keinen Dienst auf dem Server.

Node 24.22.3 LTS wird für Bau und Laufzeit mit `24.22.3-bookworm-slim` verwendet,
entsprechend dem [offiziellen Node-Abbild](https://hub.docker.com/_/node).
Die Projektversion steht in der zentralen `.nvmrc`; npm bleibt auf 11.13.0.

## Einmalige Installation nach PR-Freigabe

Nur den über einen grünen PR integrierten Stand als Produktionsabbild bauen.
Auf einem Docker-Buildrechner im geprüften Checkout:

```sh
revision=$(git rev-parse HEAD)
image="flipbase-sniper:sha-$revision"
docker build --label "org.opencontainers.image.revision=$revision" --tag "$image" services/sniper
node services/sniper/scripts/smoke-image.mjs "$image"
docker save --output sniper-image.tar "$image"
```

`sniper-image.tar` und `deploy/docker-compose.sniper.yml` auf den Server nach
`/opt/flipbase-sniper/` übertragen. Dort ausschließlich eine minimale
`sniper.env` mit Modus `0600` anlegen; das Verzeichnis erhält `0700`.
Den vorhandenen Dienstschlüssel serverseitig aus der Supabase-Konfiguration
übernehmen, ohne ihn in Logs, Chat oder Kommandoargumenten auszugeben.
Nicht die gesamte Supabase-Umgebungsdatei an den Bot weiterreichen.

```dotenv
SUPABASE_URL=https://api.flipbase.de
SUPABASE_SERVICE_ROLE_KEY=<vorhandener Dienstschlüssel>
VINTED_BASE_URL=https://www.vinted.de
SNIPER_REQUESTS_PER_MINUTE=24
SNIPER_TICK_INTERVAL_MS=1000
SNIPER_REQUEST_MIN_INTERVAL_MS=2500
SNIPER_REQUEST_TIMEOUT_MS=20000
SNIPER_HEALTH_PORT=8080
SNIPER_CATEGORY_MAX_AGE_MS=86400000
SNIPER_FRESH_CATALOG_REQUESTS=true
```

Auf dem Server das geprüfte Abbild laden und dessen exakte Kennzeichnung setzen:

```sh
cd /opt/flipbase-sniper
docker load --input sniper-image.tar
export FLIPBASE_SNIPER_IMAGE=flipbase-sniper:sha-<geprüfte vollständige Commit-ID>
docker compose -f docker-compose.sniper.yml up -d
docker compose -f docker-compose.sniper.yml ps
docker compose -f docker-compose.sniper.yml logs --tail 30 sniper
```

Der feste Containername verhindert einen zweiten Start über diese Konfiguration.
Keine weiteren Kopien starten: Der bisherige Kategorie-Schreibweg setzt einen
einzigen Dienst voraus. Der Healthcheck bindet nur an localhost, deshalb wird
kein öffentlich erreichbarer Port des Hosts benötigt. Der Container verbindet
sich ausgehend mit der bestehenden HTTPS-API und Vinted; er benötigt keinen
Zugriff auf den Docker-Socket oder andere Containerdateien.

`restart: unless-stopped` startet den Dienst nach einem Prozessabbruch oder
Serverneustart wieder. Ein Docker-Status `unhealthy` allein löst keinen Neustart
aus; dann zuerst Logs und Verbindung prüfen. Rotierende Logs begrenzen den
Platzverbrauch. Ein Wechsel des Webabbilds aktualisiert den Bot nicht automatisch.
Bot-Updates erfolgen mit einem neuen geprüften Abbild über dieselbe Anleitung.

## Abnahme auf dem Server

In den Logs muss `categories_refreshed` erscheinen; andernfalls steht dort
`categories_refresh_failed`, `category_sync_state_failed` oder `tick_failed`.
Den Abschluss zusätzlich lesend gegen die Datenbank prüfen:

```sql
select refreshed_at, requested_at, last_attempt_at, category_count, last_error
from public.vinted_category_syncs where id = 1;
select count(*) from public.vinted_categories;
select count(*) as queries, count(*) filter (where is_active) as active_queries,
       max(last_polled_at) as last_poll
from public.sniper_queries;
```

Die Kategorienzahl muss mit dem gespeicherten Stand übereinstimmen;
`refreshed_at` muss aktuell und `last_error` leer sein. Die Kategorienzahl kann
sich bei Vinted ändern. Die 2.920 Kategorien aus der ersten Abnahme sind ein
historischer Messwert.

Bei Problemen den Bot mit `docker compose -f docker-compose.sniper.yml stop`
anhalten oder `FLIPBASE_SNIPER_IMAGE` auf das vorherige geprüfte Abbild setzen
und `up -d` ausführen. Kategorien und Geschäftsdaten dabei nicht löschen.

## Sammelaufträge und Betrieb

Nutzer legen ihre Feeds unter **Werkzeuge → Vinted Feed** (`/vinted-bot`) an.
Ein Feed erzeugt keine eigene Vinted-Abfrage. Er liest aus einer gemeinsamen
Quelle (Schlüssel in `sniper_queries.query_key`):

| Quelle          | Schlüssel                       | Abfrage                | Takt                                                  |
| --------------- | ------------------------------- | ---------------------- | ----------------------------------------------------- |
| Markenquelle    | `vinted-source\|brand\|<id>`    | nur `brand_ids=<id>`   | `sniper_feed_settings.category_poll_interval_seconds` |
| Kategoriequelle | `vinted-source\|category\|<id>` | nur `catalog_ids=<id>` | `sniper_feed_settings.category_poll_interval_seconds` |

Jeder persönliche Feed benötigt mindestens eine konkrete Unterkategorie oder
eine ausgewählte Marke. Feeds mit Unterkategorie lesen aus der gemeinsamen
Kategoriequelle; Feeds ohne Unterkategorie (oder mit Wurzelkategorie Damen `1904`
bzw. Herren `5`) lesen über ihre Marken-ID ausschließlich aus der gemeinsamen
Markenquelle (`vinted-source|brand|<id>`). Pauschale Hauptquellen für „alle Damen“
oder „alle Herren“ entfallen. Marke, Suchtext, Größe, Zustand und Preis filtert
`sniper_feed_search` in der Datenbank. Die Katalogliste liefert keine Kategorie
und nur den Markennamen; ein Feed mit Marken-ID speichert deshalb immer auch den
Namen.

Der Dienst liest die Sicht `sniper_active_feed_sources`: nur Quellen, die
mindestens ein aktiver, zugangsberechtigter Feed braucht. Wer zuerst fällig ist,
wird zuerst abgerufen; bei gesetzter `SNIPER_BROWSER_CONCURRENCY` (Standard 2,
erlaubt 1 bis 4) verarbeitet der Dienst unabhängige Quellen parallel über eigene
Chrome-Tabs bei gemeinsamem Startabstand und Anfragebudget. Eine neue Quelle
reiht sich als fällig hinter bereits überfällige ein. Eine Quelle ohne Bedarf
wird beendet, behält aber Fehlerzähler und Wartezeit; ein Neustart umgeht keine
Vinted-Pause. Ruhende Quellen löscht die Bereinigung nach einem Tag.

Die Zahl gleichzeitig laufender Kategoriequellen begrenzt
`sniper_feed_settings.max_category_sources` (Standard 10). Ein Feed, der eine
neue Kategorie bräuchte, wird beim Start über der Grenze abgelehnt; laufende
Kategorien kann jeder nutzen. Je Nutzer laufen höchstens zwölf Feeds. Grenze
und Takt stellt die Administration in **Systemzustand → Vinted-Quellen** ein
(`set_sniper_feed_settings`); eine Senkung beendet keine laufenden Quellen.
Die Karte zeigt dazu Quellen, Feeds, Abdeckung und Abrufe je Minute.

Nach einem Lauf mit neuen sichtbaren Treffern benachrichtigt der Dienst über
`sniper_notify_feed_updates(query_id)` nur die Arbeitsbereiche, deren aktive
Feeds an dieser Quelle hängen. Unsichtbare Einleseläufe senden keinen Hinweis.
Ein Feed gilt in der Ansicht nur als abgedeckt, wenn jede seiner Quellen läuft,
nicht `limited` meldet und zuletzt innerhalb des doppelten Takts (mindestens
60 s) plus 30 s erfolgreich war.

**Administration → Systemzustand** (`/admin/system`) zeigt in der Karte
**Vinted-Feed-Dienst** Betriebsmeldung, Anfragebudget und letzte Fehler. Falls
der Sammler eine manuelle Prüfung meldet, öffnet **Vinted-Zugriff prüfen** die
bestehende Sitzungsansicht. Betriebsmeldung auch lesend prüfen:

```sql
select reported_at, requests_last_minute, rejected_last_minute,
       request_budget, last_cycle_error
from public.sniper_runtime_status where id = 1;
```

Der Bot meldet nach jedem Takt den Stand seines echten 60-Sekunden-Fensters.
403 und 429 zählen als abgewiesene Antworten, Netzwerkfehler als versuchte
Anfragen. Der Zeitstempel der Betriebsmeldung zeigt, wann sich der Dienst zuletzt
gemeldet hat.

### Sitzungserneuerung und Feeddiagnose

Vinted kann einen Katalogabruf mit HTTP 307 auf `/session-refresh` umleiten.
Der Browser darf diese reguläre Erneuerung einmal je Abruf abschließen, wenn
sie auf derselben Herkunft bleibt und `ref_url` exakt auf die ursprünglich
angeforderte Katalog- oder Startseite zeigt. Erst der danach geladene Katalog
wird ausgewertet; die Erneuerungsseite selbst zählt nicht als Fund oder Erfolg.
Das gemeinsame Abrufzeitlimit bleibt bestehen. Andere Weiterleitungen,
Anmeldeseiten, wiederholte Erneuerungen und markierte Prüfseiten bleiben Fehler.

Für einen tatsächlichen Feedstillstand immer gemeinsam prüfen:

- `sniper_queries.last_success_at`, `last_error_kind`, `last_error_message`
  und `consecutive_failures`: Erfolg und Fehler je aktiver Quelle.
- `sniper_runtime_status.reported_at` gegenüber `vinted_last_success_at`:
  eine aktuelle Betriebsmeldung belegt noch keinen erfolgreichen Vinted-Abruf.
- `sniper_listings.first_seen_at`: tatsächlicher neuer Artikelzulauf.
- Docker-Logs mit `query_failed`, `categories_refresh_failed` und `cycle`.

Der Dockerzustand `healthy` bestätigt einen lebendigen Sammeltakt. Er genügt
nicht als Nachweis für frische Artikel. Betriebsmeldungen werden überschrieben;
Docker-Logs rotieren. Für längere Rückblicke zusätzlich die gespeicherten
Erfolgs-/Fehlerzeiten je Auftrag heranziehen. Keine Cookies oder Tokens für eine
Diagnose ausgeben. Der aktuelle Ausfallbericht steht unter
[`docs/audit/2026-10-19-vinted-feed-session-refresh.md`](../../docs/audit/2026-10-19-vinted-feed-session-refresh.md).

### Erholung nach Browserausfällen

Der automatische Leser ersetzt seinen Tab nach `SNIPER_BROWSER_MAX_REQUESTS_PER_TAB`
abgeschlossenen Abrufen (Standard 150, konfigurierbar von 5 bis 1.000).
Der Ersatz öffnet zuerst, damit Chrome beim Schließen des bisherigen letzten
Tabs weiterläuft. Cookies bleiben im selben Profil; manuelle Bedienung setzt
diesen Zähler nach sicherem Abschluss zurück. Ein ungeklärter Wechsel erzeugt
keine weiteren Tabs.

Dokumentbereinigung, Ablösen der Sitzung und Verbindungsabbau teilen eine
Frist von zwei Sekunden. Ein unbrauchbarer Browser wird nicht weiterverwendet.
Eine unabhängige Überwachung prüft alle 15 Sekunden den bestehenden
Taktfortschritt und den Browserzustand. Nach echtem Stillstand oder bestätigtem
Browserausfall beendet sie den Dienst nach begrenztem geordnetem Schließen mit
Fehlercode; die vorhandene Docker-Neustartregel übernimmt. Abgeschlossene
Fehlversuche, leere Runden und bewusst pausierte Abfragen bleiben Fortschritt
und lösen allein keinen Neustart aus.

Beim Start dürfen nur nachweislich verwaiste, benutzereigene Sperr-Symlinks
entfernt werden: bestätigtes Profil, gültige fehlende Besitzer-PID und tatsächlich
freier Browserport. Unbekannte Eigentümer, Dateitypen und Prozesszustände bleiben
gesperrt. Ausschließlich eine Containerinstanz darf dieses Profil verwenden.
Cookies, Profildaten und Symlinkziele werden nicht gelöscht. Eine bestehende
Vinted-Pause bleibt bei einem Neustart gespeichert.

### Gleichmäßige Abrufe und Zugriffspausen

Alle vom Sammler gestarteten Vinted-Abrufe teilen sich einen Mindestabstand:
standardmäßig 1,5 Sekunden zwischen zwei Starts (`SNIPER_REQUEST_MIN_INTERVAL_MS`,
konfigurierbar von 250 bis 60.000 ms), höchstens 40 Starts in einem rollenden
Minutenfenster (`SNIPER_REQUESTS_PER_MINUTE`) und bis zu 4 fällige Abrufe je
Takt (`SNIPER_MAX_REQUESTS_PER_CYCLE`), um unnötige Datenbank-Rundreisen zwischen
einzelnen Seitenabrufen zu vermeiden. Das gilt auch für Kategorien und
Wiederholungen nach Serverfehlern. Der Browser arbeitet seriell im bestehenden Profil. Nach dem
regulären Sitzungsaufbau lädt er Katalogantworten ohne Browsercache per Fetch;
eine reguläre Sitzungsauffrischung darf weiterhin navigieren. Das Budget zählt
Sammlerabrufe, nicht jedes durch Navigation ausgelöste Netzwerkpaket.

Vor jedem Quellauftrag werden fällige Filter neu gelesen. Nur exakt gleiche
Quellparameter teilen eine Rohantwort; Titelbegriffe und Ausschlüsse werden
anschließend je Filter geprüft. Kategorie, Marke, Preis und vorhandener Suchtext
werden dabei nicht erweitert. Mehrere Marken und ODER-Begriffe bleiben eigene
Teilabfragen. Der Takt der Quelle bestimmt die früheste Fälligkeit, garantiert
aber keinen festen Abstand: weitere Quellen, Antwortzeiten und Anbieterpausen
wirken weiterhin mit. Bestehende Umgebungswerte haben Vorrang vor neuen Vorgaben.

Bei einer vollen Seite ohne Überschneidung mit dem eigenen vorherigen Abruf werden
höchstens drei Seiten mit je 96 Artikeln geladen. Jeder Filter hält seinen eigenen
bestätigten Ausschnitt je Revision und Teilabfrage. Ein schnellerer Filter derselben
Quelle kann den Stand eines langsameren oder fehlgeschlagenen Empfängers nicht
vorziehen. Gemeinsame Seiten werden nur bis zum jeweils eigenen Ausschnitt übernommen;
die Abdeckung und Zahl der Seiten gelten je Empfänger. Der Dienst hält höchstens
2.048 solche Ausschnitte mit jeweils höchstens 288 Artikelkennungen im Speicher.
Nach Verdrängung oder Neustart ist die Abdeckung einer bereits eingelesenen
Teilabfrage zunächst unbekannt; sie wird nicht erneut als stiller Erstbestand ausgegeben.
Die Anzeige unterscheidet den
Erstabruf, einen wieder erreichten vorherigen Ausschnitt, eine begrenzte und eine
unbekannte Abdeckung. Keine dieser Angaben beweist, dass sämtliche passenden
Vinted-Artikel erfasst sind. Nach einem Neustart beginnt dieser Vergleich neu.
Ein begrenztes Fenster wird nicht als vollständiger Abruf ausgegeben.

Die wiederhergestellte Produktionskonfiguration aus der Messung am 29.10.2026
setzt die bisherigen Werte ausdrücklich: 30 Starts/min, 10.000 ms Mindestabstand
und 5.000 ms Diensttakt. Ein Imagewechsel allein beschleunigt diesen Betrieb
deshalb nicht. Erst nach gesondert freigegebenem Rollout die bestehende
Konfiguration mit eingeschränkten Dateirechten sichern, genau diese drei Felder
auf 24, 2500 und 1000 setzen und den regulären Dienst neu erstellen. Danach die
effektiv geladenen drei nicht geheimen Werte, den Image-Digest, neue erfolgreiche
Abrufzeiten, Herkunftsstatus und Fehlerzähler prüfen. Der Sicherungsstand erlaubt
die Rückkehr zu den vorherigen Werten. Anbieterpausen werden dabei erhalten.
Diese Umsetzung hat keine Produktionskonfiguration geändert; kurze Messungen
belegen keine dauerhaft sichere Abrufrate und keine zugesicherte Fundlatenz.

Fehlerpausen beginnen am tatsächlichen Fehlerzeitpunkt. Ein fehlgeschlagenes
Speichern der gemeinsamen Pause hält weitere Starts auch lokal gesperrt. Die
Wiederholung der Speicherung oder ein erfolgreicher Probeabruf verwendet den
bestehenden Herkunftsstatus; eine manuelle Sitzung hebt keine Anbieterfrist auf.

Seit dem 19.11.2026 speichert Vinted anonyme Katalogseiten je Abfrage rund zwei
Minuten zwischen. Jeder Katalogabruf erhält deshalb eine wechselnde, wirkungslose
Preisgrenze und wird frisch gelesen (Regeln in `freshVintedCatalogUrl`).
Lehnt Vinted das ab, stellt `SNIPER_FRESH_CATALOG_REQUESTS=false` in `sniper.env`
nach dem Neuerstellen des Dienstes die festen Adressen wieder her; der Feed ist
dann wieder bis zu zwei Minuten alt.

`SNIPER_REQUEST_MIN_INTERVAL_MS` ist zwischen 1.000 und 60.000 Millisekunden
konfigurierbar. `SNIPER_REQUEST_TIMEOUT_MS` begrenzt einen einzelnen Abruf
standardmäßig auf 20 Sekunden und erlaubt ebenfalls 1.000 bis 60.000.
Diese Werte sind Flipbase-Betriebsentscheidungen, keine dokumentierten
Vinted-Anfragegrenzen und kein Nachweis, dass Vinted die Abrufe dauerhaft zulässt.

Nach HTTP 403 pausieren alle Quellen. Nach Ablauf prüft
genau eine fällige Abfrage den Zugang. Dabei wird die zuletzt abgewiesene,
weiterhin aktive Abfrage bevorzugt. Bei einer erkannten Cloudflare-Prüfseite
darf alle fünf Minuten genau eine Probe laufen, auch nach wiederholten Fehlern
und Dienstneustarts. Zwischen diesen Proben bleiben alle Quellen pausiert. Die fünf Minuten sind eine begrenzte betriebliche
Wiederprüfung, keine von Vinted bestätigte Anfragegrenze.
Andere 403-Ablehnungen führen anhand der gespeicherten Fehlerzähler weiterhin
zu 5, 10, 20, 40 und höchstens 60 Minuten Pause, auch nach einem Neustart.
Braucht kein Feed sie mehr, dient eine andere aktive, fällige Quelle als Ersatz;
dabei beginnt gegebenenfalls deren Fehlerzähler.
Ein längeres `Retry-After` des Anbieters wird auch bei 403 eingehalten.
Erst ein erfolgreicher Katalogabruf gibt den gemeinsamen Zugang wieder frei.
Ohne aktive fällige Quelle bleibt die gemeinsame Pause erhalten. Die manuelle
Zugriffsprüfung nutzt ohne laufenden Feed die zuletzt abgerufene Feed-Quelle.

Der Betriebsstatus nennt die Pause und die früheste Wiederprüfung durchgehend.
In `query_failed` stehen zusätzlich HTTP-Status, Phase, erkannter
Challenge-Hinweis und Anbieterwartezeit. Antwortinhalte und Cookies werden
dafür nicht protokolliert. Ein fehlender Challenge-Hinweis beweist keine
Abwesenheit anderer Schutzmechanismen.

## Persönliche Feeds und Artikelansicht

Ein Feed wird unter dem eigenen Konto im gewählten Arbeitsbereich gespeichert.
Starten und Stoppen steuern die Sammlung für diesen Feed. Die Ansicht zeigt
höchstens 100 Funde seit dem letzten Start und aus den letzten zehn Minuten.
Favoriten bleiben in der eigenen Favoritenansicht sichtbar, wenn sie aus dem
laufenden Feed herausfallen.

Die frühere Deal-Erkennung (Rabattschwelle je Merkzettel, Referenzpreis aus dem
Gruppenmedian, festgehaltene Treffer) ist verworfen und seit der Migration
`20261114150000_sniper_remove_deal_detection.sql` vollständig entfernt.

## Kategorie und Aufbewahrung

Die erste bekannte Kategorie wird am Artikel festgehalten. Ein späterer Fund
durch eine Kategoriequelle kann sie ergänzen, ohne Erstfund und ursprüngliche
Entdeckungsquelle zu ändern.

Normale Artikeldaten verfallen 15 Minuten nach dem Erstfund. Der Sammler löscht
sie in Paketen. Kompakte externe IDs bleiben drei Tage erhalten, damit ein erneut
entdeckter Artikel als bereits gesehen erkannt wird – über alle Quellen hinweg.
Eine Quelle, die länger als 15 Minuten nicht drankommt, sieht Funde einer
anderen Quelle danach nicht mehr. Die
Favoriten speichern die für ihre Anzeige benötigten Artikeldaten separat.

Ein Rückwechsel auf ein älteres Abbild stellt bereits gelöschte Artikel nicht
wieder her. Dafür ist das Datenbankbackup nötig.

Die Statistik zählt mehrfach gefundene Artikel weiterhin bei der ersten Quelle.
Gelöschte Artikel können bei
einem erneuten Fund wieder aufgenommen werden; eine dauerhafte Liste gelöschter
Marktplatzkennungen wird nicht geführt.
