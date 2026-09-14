# Vinted-Bot betreiben

Der Bot ist ein eigener Node-Dienst. Das Nginx-Abbild der Webanwendung startet
ihn nicht. Er liest Kategorien auch dann ein, wenn noch keine Suchaufträge
existieren. Welche Artikel gesammelt werden, bestimmen ausschließlich aktive
Zeilen in `public.sniper_queries`.

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

Die Administrationsseite liest den Status jetzt alle fünf Sekunden nach.
Eine seit mindestens einer Minute unbeantwortete Anforderung wird ausdrücklich
angezeigt. Das ist ein Hinweis auf eine ausstehende Bearbeitung, kein sicherer
Nachweis, dass der Dienst ausgefallen ist. Nach Verlassen der Seite endet die
Abfrage. Sie löst selbst keinen Vinted-Abruf aus.

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
Ein gestarteter Bot arbeitet alle dort aktiven Suchaufträge ab.

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

Node bleibt in der vorhandenen Hauptversion 22. Verwendet wird der bei dieser
Änderung geprüfte stabile Patch `22.23.2-alpine3.24`, entsprechend dem
[offiziellen Node-Abbild](https://hub.docker.com/_/node).
Neue npm-Abhängigkeiten oder Hauptversionsupdates sind nicht erforderlich.

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
SNIPER_REQUESTS_PER_MINUTE=30
SNIPER_TICK_INTERVAL_MS=5000
SNIPER_HEALTH_PORT=8080
SNIPER_CATEGORY_MAX_AGE_MS=86400000
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
einzigen Dienst voraus. Es wird kein Port des Hosts geöffnet. Der Container
verbindet sich ausgehend mit der bestehenden HTTPS-API und Vinted; er benötigt
keinen Zugriff auf den Docker-Socket oder andere Containerdateien.

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
`refreshed_at` muss aktuell und `last_error` leer sein. Danach „Neu einlesen“ in
der Administration anfordern und prüfen, dass der Zeitpunkt ohne Seitenneuladen
fortschreitet. Die Kategorienzahl kann sich bei Vinted ändern; 2.920 ist ein
Messwert und kein dauerhaft festgelegter Sollwert.

Bei Problemen den Bot mit `docker compose -f docker-compose.sniper.yml stop`
anhalten oder `FLIPBASE_SNIPER_IMAGE` auf das vorherige geprüfte Abbild setzen
und `up -d` ausführen. Kategorien und Geschäftsdaten dabei nicht löschen.

## Sammelaufträge und Betrieb

Die Administration enthält jetzt **Sammelaufträge** (`/admin/queries`) und
**Botbetrieb** (`/admin/operation`). Ein Auftrag braucht eine gespeicherte
Blattkategorie, eine Marke oder einen Suchbegriff. Ein deutscher Vinted-Suchlink kann eine
Kategorie, eine Markenkennung und Preisgrenzen übernehmen; nicht unterstützte
Filter werden abgelehnt. Eine Live-Markensuche nach Namen ist noch nicht enthalten.
Neue Aufträge werden pausiert gespeichert. Aktivieren setzt eine höchstens zwei
Minuten alte Betriebsmeldung voraus. Der Suchzuschnitt bleibt nach dem Anlegen
unveränderlich, damit bisherige Funde und Preisvergleiche ihre Bedeutung behalten;
Takt und Notiz bleiben bearbeitbar. Für andere Filter einen neuen Auftrag anlegen.

Reine Markenaufträge brauchen weder Suchtext noch Preisgrenzen. Leere
Preisfelder bedeuten unbegrenzt, ein leerer Suchtext setzt keinen zusätzlichen
Titelfilter. Im Formular genügt beispielsweise
`https://www.vinted.de/catalog?brand_ids[]=53` für Nike. Vollständig ungefilterte
Aufträge bleiben gesperrt. Ohne bekannte Artikelkategorie gibt es weiterhin
keinen Referenzpreis oder bewerteten Deal; die Artikelansicht funktioniert.

### Gewünschter Markenstart vom 12.09.2026

Der Nutzer wählt Nike, adidas und Ralph Lauren ohne Preisgrenzen. Geplant ist
je ein eigener Auftrag mit leeren Kategorie-/Suchtext-/Preisfeldern und zunächst
20 Sekunden Takt, zusammen etwa neun Katalogabrufe pro Minute. Diese Tabelle ist
die Vorbereitung, kein Nachweis bereits angelegter oder aktivierter Aufträge.

| Marke        | Vinted-Suchlink                                                  | Preisgrenzen |
| ------------ | ---------------------------------------------------------------- | ------------ |
| Nike         | [Nike](https://www.vinted.de/catalog?brand_ids%5B%5D=53)         | keine        |
| adidas       | [adidas](https://www.vinted.de/catalog?brand_ids%5B%5D=14)       | keine        |
| Ralph Lauren | [Ralph Lauren](https://www.vinted.de/catalog?brand_ids%5B%5D=88) | keine        |

Alle drei Markenfilter lieferten vom Server HTTP 200 und ausschließlich die
jeweilige Marke. Zwei Abrufe im Abstand von rund zwölf Sekunden ergaben
13/5/2 neue Artikel für Nike/adidas/Ralph Lauren. Das ist eine kurze Stichprobe,
keine Garantie lückenloser Erfassung. Antworten enthalten keine Kategoriekennung;
die Kategorie wird nicht aus Titel oder Marke geraten. Separate Marken wie
„Polo Ralph Lauren“ sind nicht automatisch Bestandteil der Kennung 88.

Nach Veröffentlichung der Markenauftrag-Migration die drei Aufträge über die
Administration pausiert anlegen, Kriterien kontrollieren und aktivieren.
Anschließend Erstbestand, mindestens einen weiteren Sammellauf und Botfehler
prüfen. Persönliche Merkzettel bleiben die zweite Filterebene auf dem Bestand.
Diese Änderung benötigt keinen neuen Sammlercode; der veröffentlichte Bot
unterstützt die Kombination bereits.

Die Migration `20260912165527_sniper_administration.sql` muss **vor** dem neuen
Botabbild angewendet werden. Danach genau den bisherigen Container aktualisieren.
Die alte Botversion sendet keine Betriebsmeldung; die neue Aktivierung bleibt
deshalb bis zum Botupdate gesperrt. Nach dem Wechsel lesend prüfen:

```sql
select reported_at, requests_last_minute, rejected_last_minute,
       request_budget, last_cycle_error
from public.sniper_runtime_status where id = 1;
```

Der Bot meldet nach jedem Takt den Stand seines echten 60-Sekunden-Fensters.
403 und 429 zählen als abgewiesene Antworten, Netzwerkfehler als versuchte
Anfragen. Die Oberfläche unterscheidet die letzte Betriebsmeldung von einem
erfolgreichen Vinted-Abruf und kennzeichnet alte Werte. Fundzahlen über 24 Stunden
zählen beim ersten entdeckenden Auftrag, nicht mehrfach bei Überlappung.

## Nutzerfilter und Artikelansicht

Unter **Werkzeuge → Deal-Monitor** (`/deal-monitor`) stehen drei neueste Funde
und ein chronologisches Artikelraster bereit. Auf dem Handy sind die drei
Highlights seitlich durchblätterbar. Die Ansicht fragt alle zehn Sekunden nach;
der sichtbare Zulauf lässt sich pausieren. Ältere Seiten laden pausiert nach,
höchstens 300 Artikel gleichzeitig. Fortsetzen beginnt wieder bei den neuesten.

Merkzettel gehören zum Arbeitsbereich. Sie filtern Kategorie, Markenname,
Suchtext, Zustand und Preis und legen den gewünschten Preisabstand für Deals fest.
Sie lösen keine Vinted-Anfragen aus und verändern keine zentralen Sammelaufträge.
Eine neue oder geänderte Suche meldet nur künftig entdeckte Deals; die
Artikelansicht zeigt auch passenden Bestand. Pausierte Merkzettel behalten ihre
historischen Treffer. Löschen entfernt den Merkzettel samt Treffern, keine Artikel.

Die beiden Migrationen `20260912190016_sniper_watchlists_feed.sql` und
`20260912191519_sniper_watchlist_legacy_permissions.sql` übernehmen bestehende
Abonnements und Treffer in getrennte Merkzetteltabellen. Die alten Tabellen
bleiben erhalten; der alte Browser-Schreibweg für Sammelaufträge wird gesperrt.
Der aktualisierte Bot bewertet ausschließlich die neuen Merkzettel. Jeder Fund
kann zu mehreren passenden Merkzetteln gehören, unabhängig vom ersten Auftrag.
Übernommene Markenkennungen bleiben kompatibel, bis ein Markenname gesetzt wird;
für einen Filter ohne diese alte Markenbindung einen neuen Merkzettel anlegen.

**Release-Reihenfolge:** Den bisherigen Bot vor der Datenübernahme anhalten,
dann Migrationen und Anwendung veröffentlichen, anschließend den Bot mit dem
geprüften Abbild desselben Releases starten. So entstehen während der Übernahme
keine ausschließlich alten Treffer. Keine zweite Instanz parallel starten.
Nach einem Rückwechsel auf die alte Botversion würden neue Merkzettel nicht mehr
bewertet; das ist kein vollständiger fachlicher Rollback.

## Referenzpreise und Aufbewahrung

Neue Treffer nutzen den Median der letzten 14 Tage aus derselben Kategorie,
Marke und demselben Zustand. Die Marke wird ohne äußere Leerzeichen und ohne
Unterscheidung der Großschreibung verglichen. Unter acht passenden Angeboten
fällt der Vergleich auf Kategorie und Zustand zurück. Fehlt auch dort eine
ausreichende Grundlage, entsteht kein bewerteter Treffer. Nur positive,
endliche EUR-Artikelpreise fließen ein. Klebt mehr als ein Drittel der Gruppe
am jeweiligen Preislimit des entdeckenden Auftrags, bleibt die Bewertung aus;
eine solche Markengruppe wird nicht durch einen allgemeineren Vergleich ersetzt.

Die erste bekannte Kategorie wird am Artikel festgehalten. Ein späterer Fund
durch einen Kategorieauftrag kann sie ergänzen, ohne Erstfund und ursprünglichen
Entdeckungsauftrag zu ändern. Dessen Kategoriequelle liefert dann auch das
Preislimit für den Vergleich. Reine Textfunde ohne bekannte Kategorie bekommen
keinen geschätzten Referenzpreis. Mehrere Aufträge derselben Kategorie tragen gemeinsam zum
Vergleich bei. Jeder Treffer speichert `reference_scope` und den damaligen
Preis; historische Treffer bleiben als `legacy_query_condition` erkennbar.
Die bisherige RPC-Signatur für Abfrage/Zustand bleibt kompatibel erhalten.

Die vom Nutzer gewählte Aufbewahrung beträgt **30 Tage seit Erstfund**.
Der Bot bereinigt beim Start und danach einmal pro Minute bis zu 1.000
abgelaufene Artikel. War das Paket voll, setzt er die Bereinigung bereits im
nächsten Sammeltakt fort, damit ein Rückstand abgebaut wird. Ihre Treffer werden
mitgelöscht; Aufträge und Abonnements bleiben erhalten. Fehler stehen bis zum erfolgreichen Wiederholen
im Botbetrieb. Steht der Bot still, pausiert auch die Bereinigung.

Die Migration für Gruppenvergleich und Aufbewahrung muss vor dem neuen
Botabbild angewendet werden. Sie löscht selbst keine Artikel; die Bereinigung
beginnt beim Start des aktualisierten Dienstes. Ein Rückwechsel auf das alte
Abbild stoppt die neue Bereinigung, stellt bereits gelöschte Artikel aber nicht
wieder her. Dafür ist das Datenbankbackup nötig.

Die Statistik zählt mehrfach gefundene Artikel weiterhin beim ersten Auftrag;
die unabhängige Merkzettelbewertung ist davon getrennt. Gelöschte Artikel können bei
einem erneuten Fund wieder aufgenommen werden; eine dauerhafte Liste gelöschter
Marktplatzkennungen wird nicht geführt.
