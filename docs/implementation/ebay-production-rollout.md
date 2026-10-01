# eBay: produktive Einrichtung und Rollout

Stand: 1. Oktober 2026. Geprüfte Grundlage: `a987e304`, Release `v0.276.1`.

## Nachgewiesener Ausgangsstand

- Produktionsserver: `168.119.246.33`, Supabase unter `/opt/supabase`.
- Die Datenbank bestätigt Migration `20261001130617` als angewendet.
- `ebay-account` und `ebay-account-deletion` sind noch nicht installiert.
- Die eBay-Variablen fehlen in `/opt/supabase/.env`; die eBay-Compose-Datei
  fehlt in `COMPOSE_FILE`. Es wurden ausschließlich Vorhandenseinsprüfungen
  ausgegeben, keine Zugangsdaten.
- Der vorhandene Funktionsdienst verwendet `supabase/edge-runtime:v1.74.0`
  mit Deno `2.1.4`. Seine zentrale JWT-Prüfung ist bereits ausgeschaltet;
  die bestehenden Funktionen prüfen ihre Zugriffe selbst. Diese Einstellung
  wird für eBay nicht geändert. Envoy leitet Funktionsanfragen weiter.
- Das Production-Keyset „Flipbase“ ist im Entwicklerportal gesperrt, weil
  noch kein bestätigter Kontolöschendpoint eingerichtet ist. Auf der gesperrten
  Anwendung zeigt die Oberfläche weder Client-Secret noch RuName-Einrichtung.

## Erforderliche Korrektur vor Freischaltung

Die Bestätigung des Löschendpoints muss allein mit Verifikationstoken und
gültiger HTTPS-Endpointadresse funktionieren. Sie benötigt weder RuName noch
Nutzertokens oder ein bereits aktiviertes Keyset. Sonst lässt sich die
Anwendung nicht erstmals freischalten.

Echte Löschmeldungen benötigen weiterhin eBays gültige Signatur. Solange die
Kontokonfiguration zur Abfrage des öffentlichen Signaturschlüssels fehlt,
liefert der Endpoint HTTP 503, damit eBay die Meldung wiederholen kann.
Unsignierte Meldungen liefern HTTP 412 und ändern keine Daten.

Die PEM-Darstellung der öffentlichen Schlüssel wird auf Zeilen mit 64 Zeichen
normalisiert. Damit prüft auch die produktive Deno-Laufzeit formatierte und
einzeilige Schlüssel korrekt; veränderte Nutzdaten bleiben abgewiesen.

## Reihenfolge nach geprüftem Merge

1. Den neuen Merge-Commit und seine erfolgreiche Pflichtprüfung festhalten.
   Vor Änderungen eine nur für root lesbare Sicherung von `.env`, der
   betroffenen Funktionsordner und der vorhandenen Compose-Dateien erstellen.
2. Einen zufälligen 32-Byte-Verschlüsselungsschlüssel und einen separaten
   Verifikationstoken direkt auf dem Server erzeugen. Bestehende Werte bei
   Wiederholung erhalten. Die öffentlichen App-/Endpointadressen und
   `EBAY_ENVIRONMENT=production` aus der geprüften Vorlage ergänzen. Keine
   erfundenen Client-Zugangsdaten oder RuName einsetzen.
3. `deploy/docker-compose.ebay.yml` aus dem Merge nach `/opt/supabase/`
   kopieren und einmal in `COMPOSE_FILE` ergänzen. Compose ohne Ausgabe
   aufgelöster Geheimnisse prüfen (`docker compose config --quiet`).
4. Die gemeinsam geprüften eBay-Funktionen, `marketplace-search` und ihre
   gemeinsamen Quellen aus genau diesem Commit übertragen. Vorher Unterschiede
   vorhandener gemeinsamer Quellen prüfen. `main`, `hello` und fremde Ordner
   erhalten; niemals den übergeordneten Funktionsordner mit `--delete` spiegeln.
5. Ausschließlich den Funktionsdienst neu erzeugen. Gesundheitszustand,
   anonymen eBay-POST (401), Bestätigung des Löschendpoints (200), unsignierte
   Löschmeldung (412) und bestehende Funktionszugriffe nachprüfen.
6. Im eBay-Portal den öffentlichen Löschendpoint und seinen Verifikationstoken
   eintragen, Bestätigung abwarten und das Keyset erneut prüfen. Notwendige
   Nutzeraktionen für Zugangsdaten oder Berechtigungen am konkreten Formular
   durchführen lassen. Neue Zugangsdaten nicht im Chat oder Repository ablegen.
7. Nach Freischaltung Client-ID, Client-Secret und RuName sicher auf dem Server
   hinterlegen. Akzeptierter und abgelehnter OAuth-Rückweg:
   `https://api.flipbase.de/functions/v1/ebay-account/callback`.
   Die Rechte `api_scope`, `commerce.identity.readonly` und
   `sell.fulfillment.readonly` sowie eine gültige Datenschutzadresse prüfen.
   Funktionsdienst mit der vollständigen Konfiguration erneut erzeugen.
8. eBays Testmeldung, ungültigen OAuth-Rückweg und die App mit zwei normalen
   Nutzern prüfen: Verbinden, eigene Angebote/Bestellungen, Workspacewechsel,
   Trennen und erneutes Verbinden. Keine Inserate veröffentlichen oder Verkäufe
   beziehungsweise Bestandsbewegungen erzeugen. Erst dieser echte Kontotest
   bestätigt den produktiven Betrieb.

## Ausgeführte Vorprüfung

19 gezielte Tests und drei Funktions-Typprüfungen mit Deno `2.9.7` bestanden.
Die neue Deno-PR-Prüfung verwendet die aktuell stabile Version und eine fest
gebundene offizielle Setup-Aktion. Bestehende Angular-Abhängigkeiten bleiben
unverändert. 31 Prüfungen für CI-Auswahl, Pflichtprüfungen und Wiederverwendung
grüner PR-Prüfungen bestanden.

Eine getrennte temporäre Instanz des bereits installierten Edge-Runtime-Images
bestätigt mit künstlichen Daten die Signaturprüfung, Zurückweisung veränderter
Nutzdaten, Bestätigung ohne vollständige Kontokonfiguration und erhaltene
Wiederholbarkeit. Die echten Einstiegspunkte booten dort; HTTP 401/503/200/412/410
wurden für die vorgesehenen anonymen Fälle geprüft. Der Testcontainer wurde
anschließend gestoppt. Kein produktiver Funktionsordner oder Zugangswert wurde
verändert; kein echtes eBay-Konto verbunden oder gelöscht.

## Rückweg

Bei einer fehlgeschlagenen Funktionsumstellung die gesicherten Ordner und
Compose-/Umgebungsdateien wiederherstellen, nur den Funktionsdienst erneut
erzeugen und dieselben Gesundheits-/Zugriffsprüfungen wiederholen. Die bereits
angewendete additive eBay-Migration wird nicht zurückgenommen. Nach erfolgter
Kontoverbindung niemals einen neuen Verschlüsselungsschlüssel einsetzen;
gesicherte Originalschlüssel erhalten.

Die ausführliche Einrichtung und API-Grenzen stehen in
[der eBay-Analyse](ebay-api-integration-analysis.md). Das Verfahren zum
Funktionsrollout folgt der [Deployment-Dokumentation](../../deploy/README.md) und
der [offiziellen Supabase-Anleitung](https://supabase.com/docs/guides/self-hosting/self-hosted-functions).
