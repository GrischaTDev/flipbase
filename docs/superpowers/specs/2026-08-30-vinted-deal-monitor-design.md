# Vinted Deal Monitor – Design

**Stand:** 2026-08-30
**Ausgangslage:** Fremdentwurf `marketplace-sniper-mvp` (TypeScript, nie ausgeführt), eigene Messungen gegen den Vinted-Katalog am 30.08.2026

## Ziel

Flipbase überwacht neue Vinted-Angebote und meldet Treffer je Arbeitsbereich an Telegram oder Discord. Die gefundenen Preise füttern zusätzlich den Konkurrenz-Radar, der bislang mit gerechneten Fantasiewerten arbeitet. Das Feature hängt an einem Paketmerkmal und ist damit die erste kostenpflichtige Funktion der Anwendung.

## Kurzentscheidung

1. **Gepollt wird pro Abfrage, nicht pro Kategorie.** Der breite Kategorie-Feed von Vinted ist nachweislich eine Zufallsauswahl und niemals vollständig; enge Abfragen sind stabil. Das steht bewusst gegen die verbreitete Empfehlung, nicht je Suche einzeln abzufragen.
2. **Gleiche Filter mehrerer Arbeitsbereiche teilen sich eine Abfrage.** Die Anfragemenge wächst mit der Zahl verschiedener Filter, nicht mit der Kundenzahl.
3. **Ein eigener Node-Dienst im vorhandenen Docker-Compose**, kein Edge-Function-Konstrukt. Die Vinted-Sitzung muss dauerhaft im Speicher bleiben.
4. **Verkäuferdaten werden nie gespeichert.** Der Katalog liefert Name, Profil und Profilfoto mit; all das wird im Normalizer verworfen.
5. **Vollständigkeit wird nicht zugesagt.** Weder technisch erreichbar noch von Wettbewerbern behauptet.
6. **Zwei Paketgrenzen:** Anzahl eigener Filter und Abfragetakt je Filter. Beide verursachen echte Kosten.

## Gemessener Ist-Zustand

Alle Werte am 30.08.2026 direkt gegen `https://www.vinted.de/api/v2/catalog/items` erhoben.

### Erreichbarkeit

| Prüfung                                         | Ergebnis                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Startseite abrufen                              | HTTP 200, setzt `access_token_web` (JWT, 24 h) und sechs weitere Cookies |
| Katalog ohne Cookies                            | HTTP 401 `invalid_authentication_token`                                  |
| Katalog mit Cookies                             | HTTP 200, echte Daten                                                    |
| Eingefrorene Sitzung, 14 Minuten im Minutentakt | durchgehend HTTP 200                                                     |
| Sporadischer Ausfall                            | ein HTTP 401 bei rund 25 Anfragen, Ursache nicht isolierbar              |

### Stabilität der Antwort

Identische Abfrage zweimal im Abstand von 20 Sekunden, Anteil gleich gebliebener Artikel:

| Abfrage                                      | wiedergefunden |
| -------------------------------------------- | -------------: |
| breite Kategorie (`catalog_ids=2050`)        |       0 von 96 |
| `search_text=nike air max`                   |      81 von 96 |
| `search_text=nike air max 95`, `price_to=50` |      95 von 96 |
| `search_text=carhartt jacke`, `price_to=60`  |      94 von 96 |

Zwei identische Abfragen **eine Sekunde** auseinander unterscheiden sich in der breiten Kategorie bereits um 16 von 96 Artikeln.

### Durchsatz der breiten Kategorie

Über 74 Sekunden, gezählt werden eindeutige frische Artikel:

```text
Abfrage alle  6 s  ->  893 Artikel   (100 %)
Abfrage alle 18 s  ->  374 Artikel   ( 42 %)
Abfrage alle 30 s  ->  281 Artikel   ( 31 %)
Abfrage alle 60 s  ->  186 Artikel   ( 21 %)
```

Die Kurve wird bis zum kürzesten geprüften Takt nicht flach. Es gibt also keinen Takt, bei dem die breite Abfrage vollständig wird.

### Weitere Randbedingungen

- Höchstens **96 Artikel pro Seite**; `per_page=200` liefert ebenfalls 96.
- Höchstens **960 Treffer je Abfrage** insgesamt, tiefer blättern ist ausgeschlossen.
- `order=newest_first` ist nicht streng nach Zeit sortiert und enthält auch ältere, wieder hochgeschobene Artikel; eine Seite spannt mehrere Tage.
- Die Antwort liefert zwei Preise: `price` (Artikelpreis) und `total_item_price` (mit Käuferschutz), im Test 45,00 € gegenüber 47,95 €.
- `photo.high_resolution.timestamp` liegt vor der Veröffentlichung, weil das Foto vor dem Absenden des Inserats hochgeladen wird. Er taugt als Näherung für das Alter, **nicht** als exakte Veröffentlichungszeit.
- Mitgeliefert werden `user.id`, `user.login`, `user.profile_url` und das Profilfoto des Verkäufers.

## Architektur

```text
                 Vinted  (enge Abfragen, 96 pro Seite)
                              |
                 +------------v-------------+
                 |     flipbase-sniper      |   neuer Container neben app und caddy
                 |  Session · Collector ·   |
                 |  Normalizer · Matcher ·  |
                 |  Dispatcher · Aggregator |
                 +------------+-------------+
                              |  Service-Role-Schluessel
                 +------------v-------------+
                 |         Supabase         |
                 |  sniper_queries          |
                 |  sniper_filters          |
                 |  sniper_listings         |
                 |  sniper_matches          |
                 |  webhook_configs   (da)  |
                 |  price_tracked_items(da) |
                 +------------+-------------+
                              |
                        Angular flipbase
```

### Bausteine

| Baustein            | Aufgabe                                           | kennt nicht   |
| ------------------- | ------------------------------------------------- | ------------- |
| `VintedSession`     | Cookies halten, bei 401 neu aufwärmen             | Artikel       |
| `VintedCollector`   | eine Abfrage ausführen, Rohdaten liefern          | Filter        |
| `ListingNormalizer` | Rohdaten in `MarketplaceListing` überführen       | Datenbank     |
| `ListingStore`      | schreiben, neu von bekannt trennen                | Vinted        |
| `FilterMatcher`     | reine Funktion `(Listing, Filter[]) => Treffer[]` | jedes I/O     |
| `MatchStore`        | Treffer je Arbeitsbereich ablegen                 | Zustellung    |
| `Dispatcher`        | senden, wiederholen, Zustand fortschreiben        | Vinted        |
| `PriceAggregator`   | Median und Tiefstpreis in den Radar schreiben     | Zustellung    |
| `QueryScheduler`    | fällige Abfragen im Anfragebudget verteilen       | Filterinhalte |

Der `FilterMatcher` ist bewusst frei von Seiteneffekten, damit die gesamte Trefferlogik ohne Netz und ohne Datenbank prüfbar bleibt.

## Datenmodell

Neue Tabellen im Schema `public`, Bezeichner englisch wie im übrigen Schema. Alle mit aktiviertem RLS und getrennten Richtlinien je Operation und Rolle.

### `sniper_queries`

Die Einheit, die tatsächlich gepollt wird.

| Spalte                                                  | Zweck                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                                                    | Primärschlüssel                                                               |
| `query_key`                                             | normalisierter Fingerabdruck der Vinted-Parameter, eindeutig                  |
| `marketplace`                                           | derzeit immer `vinted`                                                        |
| `search_text`                                           | Suchbegriff                                                                   |
| `catalog_id`                                            | optionale Vinted-Kategorie                                                    |
| `brand_id`                                              | optionale Vinted-Marke                                                        |
| `price_to`                                              | optionale Preisobergrenze                                                     |
| `is_standard`                                           | vorgegebenes Profil statt selbst angelegt                                     |
| `poll_interval_ms`                                      | gewünschter Takt, ergibt sich aus dem höchsten Paket aller angehängten Filter |
| `is_seeded`                                             | Einlese-Lauf abgeschlossen                                                    |
| `last_polled_at`, `last_status`, `consecutive_failures` | Betriebszustand                                                               |
| `is_active`                                             | stillgelegt, wenn kein Filter mehr daran hängt                                |

### `sniper_filters`

Je Arbeitsbereich, verweist auf genau eine Abfrage.

| Spalte                                 | Zweck                                     |
| -------------------------------------- | ----------------------------------------- |
| `workspace_id`, `sniper_query_id`      | Zuordnung                                 |
| `name`                                 | Anzeigename                               |
| `include_keywords`, `exclude_keywords` | Textprüfung auf dem Titel                 |
| `brands`, `sizes`, `conditions`        | feine Prüfung, die Vinted nicht übernimmt |
| `price_min`, `price_max`               | geprüft gegen den Gesamtpreis             |
| `max_age_seconds`                      | Frischegrenze                             |
| `is_active`                            | abschaltbar ohne Löschen                  |

### `sniper_listings`

Geteilt über alle Arbeitsbereiche, eindeutig über `(marketplace, external_id)`.

Enthält Titel, Adresse, Bildadresse, Gesamtpreis mit Währung, Marke, Größe, Zustand, Näherungswert für das Alter, Erstsichtung und die entdeckende Abfrage.

**Keine Verkäuferspalten.** Kein Name, keine Kennung, keine Profiladresse, kein Profilfoto. Ein Test prüft das gegen eine echte aufgezeichnete Antwort.

### `sniper_matches`

Ein Treffer je Arbeitsbereich, Filter und Artikel, eindeutig über diese drei.

| Spalte                                       | Zweck                                  |
| -------------------------------------------- | -------------------------------------- |
| `delivery_state`                             | `pending`, `sent`, `failed`, `skipped` |
| `delivery_attempts`, `last_error`, `sent_at` | Zustellverlauf                         |
| `user_state`                                 | `new`, `saved`, `dismissed`            |

### Bestehende Tabellen

- `workspaces` erhält `plan` mit Vorgabewert `free`. Die zugehörigen Grenzen liegen als Konfiguration im Dienst. Ein echtes Abrechnungsmodell ist ausdrücklich nicht Teil dieses Entwurfs.
- `price_tracked_items` erhält `sniper_query_id`. Ist die Spalte gesetzt, stammen `current_market_average` und `current_market_lowest` aus gemessenen Listings.
- `webhook_configs` bleibt unverändert in der Struktur, siehe Abschnitt Zugangsschlüssel.

### Aufbewahrung

`sniper_listings` älter als 30 Tage werden gelöscht, `sniper_matches` folgen über den Fremdschlüssel. Der Wert ist konfigurierbar; die Preishistorie des Radars wird vorher verdichtet.

## Ablauf einer Runde

```text
1. QueryScheduler waehlt faellige Abfragen im Rahmen des Anfragebudgets
2. VintedCollector holt Seite 1 (96 Artikel)
3. ListingNormalizer wandelt um, verwirft Verkaeuferdaten, nimmt total_item_price
4. ListingStore schreibt und meldet ausschliesslich die wirklich neuen zurueck
5. bei is_seeded = false: nur schreiben, nichts melden, danach is_seeded setzen
6. FilterMatcher prueft die neuen Artikel gegen alle Filter dieser Abfrage
7. MatchStore legt Treffer mit delivery_state = pending an
8. Dispatcher sendet und setzt erst danach auf sent
9. PriceAggregator aktualisiert die verknuepften Radar-Eintraege
```

Schritt 7 und 8 sind getrennt. Der Fremdentwurf markiert einen Artikel als gesehen, bevor die Nachricht heraus ist; fällt Telegram aus, ist der Treffer dauerhaft verloren. Hier bleibt er offen und wird erneut versucht.

## Filter zu Abfrage zusammenfassen

Beim Anlegen eines Filters wird aus Suchbegriff, Kategorie, Marke und Preisobergrenze ein `query_key` gebildet. Existiert eine Abfrage mit diesem Schlüssel, wird der Filter angehängt, sonst eine neue angelegt. Fällt der letzte Filter weg, wird die Abfrage auf `is_active = false` gesetzt statt gelöscht, damit die entdeckten Artikel ihren Bezug behalten.

Die Vinted-Abfrage bleibt bewusst grob, die feine Prüfung passiert lokal. Ein Filter „Nike Air Max, Größe 43, nicht Kinder" wird zu einer Abfrage `nike air max` mit Preisobergrenze plus lokaler Prüfung auf Größe und Ausschlusswort. So können sich mehrere Filter dieselbe Abfrage teilen.

## Anfragebudget und Takt

Zwei Größen wirken zusammen und dürfen nicht verwechselt werden:

- **`poll_interval_ms` je Abfrage** ist der _Sollwert_. Er ergibt sich aus dem höchsten Paket aller angehängten Filter: hängt ein Filter aus dem großen Paket daran, wird die Abfrage für alle schneller.
- **Das Anfragebudget** ist die _Obergrenze_ des gesamten Dienstes je Minute. Reicht es nicht für alle fälligen Abfragen, entscheidet der `QueryScheduler` nach Wartezeit seit dem letzten Lauf, nicht nach Paket.

Der Sollwert bestimmt also, wann eine Abfrage fällig wird; das Budget entscheidet, wer bei Knappheit zuerst drankommt. Ohne diese Trennung bremst ein Arbeitsbereich mit vielen Filtern alle anderen aus und das Sperrrisiko wächst ungeplant.

Vorschlag als Ausgangswert:

| `plan`    | eigene Filter |                Takt |
| --------- | ------------: | ------------------: |
| `free`    |             0 | nur Standardprofile |
| `starter` |            10 |                60 s |
| `pro`     |            40 |                15 s |

Die Auslastung des Budgets wird protokolliert. Sie ist die Kennzahl, an der sich später ablesen lässt, ob ein Paket zu billig ist.

## Zustellung

Der `Dispatcher` liest offene Treffer, prüft das Paketmerkmal des Arbeitsbereichs und dessen `webhook_configs`, baut die Nachricht und sendet.

Die Nachricht enthält Titel, Gesamtpreis mit Hinweis auf den Käuferschutz, Marke, Größe, Zustand, Bild und den Link zum Angebot. Telegram erhält sie als `sendPhoto` mit Bildunterschrift, Discord als Einbettung.

Jeder Arbeitsbereich sendet über seinen **eigenen** Telegram-Bot beziehungsweise seine eigene Discord-Adresse. Zentrale Sendegrenzen entstehen dadurch nicht.

Fehlgeschlagene Zustellungen werden bis zu dreimal wiederholt, danach auf `failed` gesetzt und in der Oberfläche sichtbar gemacht.

## Anbindung an den Konkurrenz-Radar

Ist ein Eintrag in `price_tracked_items` mit einer Abfrage verknüpft, berechnet der `PriceAggregator` aus den Listings der letzten 30 Tage Median und Tiefstpreis und schreibt sie zusammen mit einem Zeitstempel fort.

**Verpflichtender Nebenpunkt:** Solange keine Verknüpfung besteht, darf `price-tracker.service.ts` die Werte nicht länger als Marktdaten ausgeben. Heute entstehen `current_market_average` und `current_market_lowest` als `eigener Preis × 0,95` beziehungsweise `× 0,88` und werden als „günstigster Konkurrent" angezeigt. In einem kostenpflichtigen Produkt ist das eine unzutreffende Aussage über den Markt. Entweder die Werte werden als Schätzung gekennzeichnet oder sie entfallen bis zur ersten echten Messung.

## Datenschutz

Der Katalog liefert Verkäuferdaten mit, darunter Profilfotos realer Personen. Diese Daten werden im Normalizer verworfen und erreichen weder Datenbank noch Nachricht. Verarbeitet werden ausschließlich Angebotsdaten.

Bilder werden als Adresse übernommen und nicht gespeichert; die Anzeige lädt sie direkt bei Vinted.

## Zugangsschlüssel

`webhook_configs.telegram_bot_token` liegt heute im Klartext in einer Tabelle, die das Frontend liest. Der Dienst braucht den Schlüssel serverseitig, die Oberfläche nur die Information, ob einer hinterlegt ist. Der Lesezugriff für die Rolle `authenticated` wird deshalb auf eine Sicht ohne die Geheimnisspalten umgestellt.

## Fehlerbehandlung

| Fall                                | Reaktion                                                              |
| ----------------------------------- | --------------------------------------------------------------------- |
| HTTP 401                            | Sitzung neu aufwärmen, Runde einmal wiederholen, danach nächste Runde |
| HTTP 429                            | mindestens 60 s Pause für diese Abfrage, Budget global drosseln       |
| HTTP 403                            | Abfrage pausieren, Betreiber benachrichtigen, Kunden nicht            |
| HTTP 5xx oder Netzfehler            | zwei Versuche mit 500 ms und 1000 ms                                  |
| Antwort verletzt das Schema         | Runde verwerfen, nichts als gesehen markieren, Vorfall protokollieren |
| Zustellung scheitert                | Treffer bleibt offen, drei Versuche, dann sichtbar `failed`           |
| Kaltstart einer Abfrage             | erste Runde liest nur ein und meldet nichts                           |
| Artikel älter als die Frischegrenze | nicht melden                                                          |

Bei drei aufeinanderfolgenden Fehlschlägen wird die Abfrage automatisch stillgelegt und gemeldet.

## Betrieb

Ein zusätzlicher Dienst `sniper` in `deploy/docker-compose.app.yml`. Er benötigt die Supabase-Adresse, den Service-Role-Schlüssel, das Anfragebudget und die Aufbewahrungsdauer. Ein Health-Endpunkt meldet letzte erfolgreiche Runde, Budgetauslastung und Zahl stillgelegter Abfragen.

Node 22 oder neuer. Für lokale Zwischenspeicher wird `node:sqlite` verwendet, falls überhaupt nötig; eine native Abhängigkeit wie `better-sqlite3` wird vermieden.

## Tests

Der Fremdentwurf prüft seine Vinted-Anbindung gegen handgeschriebenes Wunsch-JSON. Solche Tests bleiben grün, wenn Vinted das Format ändert. Hier gilt:

- **Vertragstest** gegen eine echt aufgezeichnete Antwort. Er schlägt an, sobald sich das Format ändert.
- **Datenschutztest**, der fehlschlägt, sobald ein Verkäuferfeld den Normalizer passiert.
- **Preistest**, der sicherstellt, dass der Gesamtpreis und nicht der Artikelpreis verwendet wird.
- **`FilterMatcher`** als reine Funktion mit vielen Fällen, unter anderem Ausschlusswörter, Größen und Frischegrenze.
- **`VintedSession` und `VintedCollector`** mit eingespeistem `fetch`, inklusive 401 mit anschließendem Neuaufwärmen.
- **`Dispatcher`** mit eingespeistem `fetch`, prüft Wiederholung, Paketgrenze und dass `sent` erst nach erfolgreicher Antwort gesetzt wird.
- **Datenbanktests** für die Richtlinien: ein fremder Arbeitsbereich darf weder Filter noch Treffer sehen.

Kein Test darf im Lauf echte Anfragen an Vinted, Telegram oder Discord stellen.

## Natürliche Etappen

Der Entwurf ist als Ganzes gedacht, zerfällt für die Umsetzung aber in drei Teile, die einzeln lauffähig sind:

1. **Sammeln und Speichern** – Sitzung, Collector, Normalizer, `sniper_queries`, `sniper_listings`, Einlese-Lauf, Anfragebudget. Ergebnis: Artikel landen nachweislich in der Datenbank, noch ohne Nutzer.
2. **Filtern und Zustellen** – `sniper_filters`, `sniper_matches`, Matcher, Dispatcher, Paketmerkmal, Oberfläche für Filter und Trefferliste. Ergebnis: das verkaufbare Feature.
3. **Radar auf echte Daten** – `PriceAggregator`, Verknüpfung mit `price_tracked_items`, Entfernen der gerechneten Fantasiewerte.

Etappe 1 ist Voraussetzung für 2. Etappe 3 ist unabhängig von 2 und kann später kommen; die Korrektur der Fantasiewerte im Radar sollte davon unabhängig sofort erfolgen.

## Bewusst nicht enthalten

Redis, BullMQ, die Verfolgung neu entstehender Artikelkennungen, KI-Bewertung, automatischer Kauf, eBay und Kleinanzeigen, mehrere Seiten je Abruf, mehrere Länder. Jeder Punkt ist später ohne Bruch ergänzbar, weil die Abfrage die Einheit bleibt.

## Offene Punkte und Risiken

1. **Rechtlich.** Vinteds Bedingungen untersagen automatisierte Zugriffe in Abschnitt 6. Als kostenpflichtiges Angebot kommen das Datenbankherstellerrecht und die gewerbliche Dimension hinzu. Vor der ersten Rechnung sollte das anwaltlich geprüft werden; dieser Entwurf ersetzt das nicht.
2. **Betriebsrisiko.** Die Quelle kann jederzeit brechen. Das Feature wird deshalb im Paket als solches gekennzeichnet und nicht als Kernversprechen beworben.
3. **Der sporadische 401** ist nicht erklärt. Die Behandlung fängt ihn ab, die Häufigkeit im Dauerbetrieb ist unbekannt und muss beobachtet werden.
4. **Kein Vollständigkeitsversprechen.** Auch enge Abfragen sind zu 98 Prozent stabil, nicht zu 100. Marketingaussagen müssen das aushalten.
5. **Skalierungsgrenze.** Etwa 100 verschiedene Abfragen im Minutentakt entsprechen knapp zwei Anfragen je Sekunde. Ab etwa 1.000 muss der Takt sinken oder der Ausgang verteilt werden.
