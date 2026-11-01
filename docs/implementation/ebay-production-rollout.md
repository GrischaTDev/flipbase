# eBay: produktive Einrichtung und Rollout

Stand: 1. Oktober 2026. Geprüfte Grundlage: `a987e304`, Release `v0.276.1`.

## Durchgeführter Funktionsrollout vom 1. November 2026

Auf ausdrücklichen Nutzerauftrag den öffentlichen Dienst aus dem erfolgreich
geprüften Merge `a495b333e136dc593dfb69b199bc37a7987a846c` aktualisiert.
Die 26 Dateien der vollständigen relativen Importkette von `ebay-account/index.ts`
stammen aus diesem Commit. Elf Dateien aktualisiert oder ergänzt, davon sechs
neu. Die fünf ersetzten Fassungen entsprechen bekannten Git-Quellen.

Vorher alle öffentlichen Funktionsquellen, `.env` und die aktiven Compose-Dateien
ausschließlich für root lesbar gesichert. Quelle und Konfiguration unmittelbar
vor der Änderung nochmals mit den aufgenommenen Ausgangswerten verglichen.
Nur die elf vorgesehenen Dateien atomar ersetzt. Die 90 übrigen Funktionsdateien,
alle Zugangswerte und Verschlüsselungsschlüssel bleiben gleich. Keine anderen
Container oder Datenbankschemata verändert.

Mit den bestehenden Compose-Dateien ausschließlich den öffentlichen Dienst
`functions` neu erzeugt:

```sh
docker compose up -d --no-deps --no-build --pull never --force-recreate --wait --wait-timeout 90 functions
```

Der Dienst ist `healthy`. Alle 26 Dateien zusätzlich im laufenden Container
per SHA-256 bestätigt; keine Bootfehler. Vor und nach der Umstellung erfolgreich:

| Öffentliche Prüfung             | Ergebnis                                       |
| ------------------------------- | ---------------------------------------------- |
| Browser-Vorabfrage aus der App  | 200 am Envoy-Gateway, App-Ursprung freigegeben |
| Konto-POST ohne Anmeldung       | 401                                            |
| Bestätigung des Löschendpoints  | 200, Antwort mit vorhandenem Token berechnet   |
| Löschmeldung ohne Signatur      | 412                                            |
| Bewusst deaktivierter Vergleich | 410                                            |
| Abgelehnter OAuth-Rückweg       | 303 zur App                                    |

Die private Sicherung liegt auf dem Server unter
`/root/flipbase-ebay-rollout-20261101-listing-inbox-a495b333/backup`.
Sie enthält `public-functions/` und `config/`; Konfigurationsdateien sind nur
für root lesbar. Ein Rückweg stellt ausschließlich die betroffenen Quellen
wieder her, entfernt die sechs neuen Dateien nach Wertabgleich und erzeugt
wieder nur `functions`. Zwischenzeitliche fremde Änderungen erhalten.

### Erneute Kontofreigabe durch den Nutzer

1. Öffne [eBay-Konten](https://app.flipbase.de/marketplaces/ebay/connection)
   und wähle den Workspace mit Deinem bisherigen eBay-Konto.
2. Öffne über das Zahnrad die Einstellungen dieses Kontos und wähle
   **Verbindung trennen**.
3. Wähle danach **Mit eBay verbinden**, melde Dich bei demselben eBay-Konto an
   und bestätige eBays erweiterte Freigabe für Inserate und Nachrichten.
4. Warte auf die Rückkehr zu Flipbase. Prüfe den Verbindungsstatus, bei Bedarf
   mit **Status aktualisieren**, und öffne anschließend **Postfach**.

Der neue Server fordert die vollständigen Rechte an. Ein bestehender Refresh
Token erhält sie nicht allein durch den Rollout. Zugangswerte müssen dafür
nicht geändert werden. Die persönliche eBay-Freigabe und ein echter angemeldeter
Abruf sind noch offen. Beim Rollout wurden keine echten eBay-Nachrichten oder
Inserate gesendet, veröffentlicht oder gelöscht.

## Vorbereitung vom 1. November 2026: Listing API und Postfach

Der neue Aufgabenstand verwendet für Inseratdetails, Bearbeitung und Erstellung
die GraphQL Listing API 1.0.0. Das Postfach verwendet die Message API 1.0.0.
Dies beschreibt den geprüften lokalen Stand, keinen bereits erfolgten Rollout.

- Den öffentlichen Einstieg `ebay-account` samt vollständiger relativer
  Quellen aus demselben freigegebenen Merge aktualisieren. Der Anwendungsrollout
  allein aktualisiert diesen Dienst weiterhin nicht. Die vorhandene
  Verschlüsselung und Kontobindung erhalten; keine Datenbankmigration erforderlich.
- Der Status bestätigt die neuen Serverfähigkeiten mit
  `listingCreationAvailable` und `messagingAvailable`. Fehlen diese Angaben,
  starten die neuen Oberflächen keine entsprechenden Anbieteraktionen.
- Die OAuth-Freigabe ergänzt `sell.listing`, `sell.listing.read`,
  `commerce.message` und `sell.account.readonly` (jeweils unter
  `https://api.ebay.com/oauth/api_scope/`). Bestehende Refresh Tokens erhalten
  dadurch keine zusätzlichen Rechte. Das betroffene Konto muss bewusst erneut
  verbunden werden; ein Zugriff ohne Freigabe bleibt gesperrt.
- Die Erstellung unterstützt zunächst Festpreis, EUR, eBay Deutschland,
  Versand aus Deutschland und vorhandene Kontorichtlinien. Kategorien, Merkmale
  und Zustände werden bei eBay gelesen, Fotos über die Media API hochgeladen.
  Die Anbieterprüfung veröffentlicht nichts. Gebühren und Hinweise werden vor
  dem bestätigten Erstellen erneut verglichen.
- Eine unklare Veröffentlichung bleibt mit fester Idempotenzkennung und SKU
  gesperrt; die Statusklärung liest nur. Bei unklarem Nachrichtenversand erfolgt
  ebenfalls kein automatischer zweiter Versuch. Die Sperren überstehen ein
  Neuladen desselben Browsertabs; sie sind keine geräteübergreifende Entwurfsablage.
- Der Hintergrundcache bleibt vorerst beim bewährten Trading-Lesevertrag.
  Bestellungen und Verkaufsprüfung bleiben erhalten. Eine vollständige Ablösung
  aller Trading-Aufrufe ist mit diesem Aufgabenstand nicht behauptet.

Für eine produktive Abnahme nach Freigabe zuerst Serverfähigkeiten und erneute
Kontofreigabe prüfen. Danach eigene Inseratdetails und Postfach lesend prüfen.
Eine echte Veröffentlichung oder Nachricht braucht einen ausdrücklich dafür
gewählten Inhalt und Empfänger. Die lokalen Prüfungen verwenden Anbieterantworten
aus Testfällen und belegen keine erfolgreiche Aktion im echten eBay-Konto.

## Nachtrag vom 23. Oktober 2026: öffentliche Bestellprüfung abgleichen

Bei Bestellung 7587 lag keine Erstattung vor: eBay lieferte `PAID`, `FULFILLED`
und `paymentSummary.refunds: []`, ließ aber `lineItems[].refunds` weg. Die bereits
geprüfte Normalisierung behandelt diese Kombination korrekt. Der öffentliche
Funktionsdienst verwendete noch die alte Normalisierung und erzeugte deshalb
`refund_or_unknown`.

Der Anwendungsrollout und das Paket für `flipbase-push-functions` aktualisieren
nicht automatisch die öffentlichen Quellen unter
`/opt/supabase/volumes/functions`. Ein aktueller Hintergrunddienst oder eine
aktuelle App-Version belegt daher keinen aktuellen Stand von `ebay-account`.
Bei Änderungen an dieser Funktion ist Schritt 4–5 weiterhin erforderlich.

Für die Reparatur wurden ausschließlich der Einstieg `ebay-account/index.ts`
und seine relativen Quellen aus dem erfolgreichen Merge `d5268ee3` verwendet:
20 Dateien anhand ihrer SHA-256-Werte geprüft, neun abweichende oder fehlende
Dateien aktualisiert. Die ursprünglichen Quellen und die Konfiguration wurden
vorher ausschließlich für root lesbar gesichert. Vor dem Kopieren wurden die
bekannten Ausgangswerte erneut geprüft, um zwischenzeitliche Änderungen nicht
zu überschreiben. Alle übrigen Funktionsdateien blieben nachweislich gleich;
nur der öffentliche Dienst `functions` wurde neu erzeugt.

Nachweise: anonymer eBay-POST 401, Löschbestätigung 200, unsignierte Löschmeldung
412 und der bewusst deaktivierte Marktvergleich 410. Die echte erneute
Bestellprüfung lieferte `blockers: []`, `hasRefund: false` und 468 Cent belegte
Gebühren. Es wurde kein realer Verkauf gebucht oder zugeordnet.

Für künftige Rollouts die geprüften öffentlichen Funktionsdateien zusammen mit
ihren benötigten gemeinsamen Quellen aus demselben Merge abgleichen. Erst die
Dateiwerte im tatsächlich angesprochenen Dienst und eine echte Bestellprüfung
bestätigen die Aktualisierung. Bei einem Fehler die Sicherung gemäß Rückweg
wiederherstellen; vorhandene Zugangswerte und Verschlüsselungsschlüssel erhalten.

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
