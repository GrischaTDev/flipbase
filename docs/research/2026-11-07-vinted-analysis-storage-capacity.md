# Speicherbedarf einer internen Vinted-Vergleichsdatenbank

Stand: 7. November 2026. Fortsetzung der internen Artikelanalyse auf dem eigenen
Zweig `juna/product-price-analysis-research`, nach erneutem GitHub-Abgleich.
Keine Änderung an Anwendung, Datenbankschema oder Produktionskonfiguration.

## Aktueller Server und Einordnung

Rein lesend am Produktionsserver ermittelt:

- Dateisystem: 80.279.486.464 Bytes gesamt, 18.795.307.008 Bytes verfügbar,
  angezeigte Belegung 76 Prozent.
- Produktionsdatenbank `postgres`: 1.336.519.827 Bytes.
- Arbeitsspeicher: 8.122.281.984 Bytes, zum Messzeitpunkt rund 4,75 GB verfügbar.

Alle GB/MB-Angaben hier sind dezimal. Dies ist eine Momentaufnahme. Freier
Dateisystemplatz steht auch für Bilder, Releases, Protokolle, Sicherungen und
PostgreSQL-Schreibprotokolle bereit und ist kein vollständig verfügbares
Budget für die neue Tabelle. Die momentane CPU-/RAM-Anzeige ist kein
Kapazitäts- oder Lastnachweis.

## Isolierte Größenmessung

Eine eigene lokale PostgreSQL-17-Instanz wurde mit zwei CPUs und 1 GiB RAM
begrenzt. Kein Netzanschluss und keine eingebundenen Datenverzeichnisse.
Ausschließlich künstliche Daten; keine Produktions- oder Nutzerdaten kopiert.

Die Musterstruktur enthält:

- Artikelkennung, Vinted-Kennung, vollständigen Quelllink und kurzen Titel;
- Kategorie, Marke, Modell, vier Schlüsselwörter, Größe und Zustand;
- Währung, Artikelpreis in Cent, Erstfund, letzten Prüfzeitpunkt und Status;
- getrennte Preis-/Statusbeobachtungen mit Artikelzuordnung und Zeitpunkt;
- insgesamt sieben Indizes einschließlich Primär-/Eindeutigkeitsschlüsseln,
  Vergleichsfilter, Schlüsselwortsuche, Prüfwarteschlange und Artikelverlauf.

Keine Bilder, Beschreibungen, Seitenkopien, Verkäuferprofile oder großen
JSON-Antworten. Pro Artikel wurden fünf Beobachtungszeilen erzeugt.

| Artikelreferenzen | Beobachtungszeilen | Tabellen und Indizes zusammen     | Nachweis                             |
| ----------------- | ------------------ | --------------------------------- | ------------------------------------ |
| 100.000           | 500.000            | 133.226.496 Bytes, rund 133 MB    | Gemessen                             |
| 1.000.000         | 5.000.000          | 1.288.290.304 Bytes, rund 1,29 GB | Gemessen                             |
| 5.000.000         | 25.000.000         | Größenordnung 6,5 GB              | Lineare Hochrechnung, nicht gemessen |
| 10.000.000        | 50.000.000         | Größenordnung 13 GB               | Lineare Hochrechnung, nicht gemessen |

Bei einer Million Artikeln entfallen rund 372 MB auf die Referenztabelle,
219 MB auf deren Indizes, 301 MB auf die Beobachtungstabelle und 396 MB auf deren
Indizes. Gemessen mit `pg_table_size`, `pg_indexes_size` und
`pg_total_relation_size`.
[Definition der Größenfunktionen](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-DBSIZE).

Die Zahlen schließen Schreibprotokolle, Sicherungen, temporäre Dateien und
später entstehende ungenutzte Seiten nach Änderungen nicht ein. Tatsächliche
Titel-/Linklängen, weitere Indizes und viel mehr Beobachtungen können den
Bedarf erhöhen. Sie sind keine Messung eines bereits beschlossenen
Produktionsschemas.

## Abfragen und Ladezeiten

Auf der Millionengröße wurden drei kleine, gefilterte Beispielabfragen mit
`EXPLAIN (ANALYZE, BUFFERS)` ausgeführt:

- 50 passende Artikel nach Kategorie, Marke, Modell, Zustand und Größe:
  Ausführungszeit 1,028 ms.
- Median und Fallzahl einer eingegrenzten Modell-/Zustandsgruppe: 2,377 ms.
- Fünf Beobachtungen eines einzelnen Artikels: 0,454 ms.

Das sind lokale Einzelmessungen auf frisch erzeugten synthetischen Daten,
keine Kaltstart-, Parallelitäts-, RLS-, Netzwerk- oder Produktionsmessung und
keine Garantie für spätere Antwortzeiten. Sie belegen lediglich, dass diese
Beispielabfragen den Gesamtbestand nicht in die Oberfläche laden müssen.

Für die Umsetzung entscheidend:

1. Vergleichsfilter und Sortierung durch passende Indizes unterstützen.
2. Nur benötigte Spalten und beispielsweise 50 Treffer pro Seite übertragen;
   weitere Seiten über einen stabilen Cursor abrufen.
3. Preisstatistiken für die relevante Modellgruppe serverseitig berechnen.
   Breite Kategorien mit vielen Treffern gegebenenfalls vorab zusammenfassen.
4. Volltext-/Schlüsselwortsuche indexieren, keine unbegrenzten Textscans je Klick.
5. Tatsächliche Abfragen und Nebenläufigkeit vor Freigabe mit dem fertigen Schema
   prüfen; die Datensatzanzahl allein ist keine Geschwindigkeitszusage.

PostgreSQL kann passende Indizes für `ORDER BY` mit `LIMIT` verwenden, ohne
sämtliche übrigen Treffer zu sortieren. Große `OFFSET`-Werte verursachen dagegen
weiterhin Arbeit für übersprungene Zeilen.
[Index und Sortierung](https://www.postgresql.org/docs/17/indexes-ordering.html),
[Seitenauswahl](https://www.postgresql.org/docs/17/queries-limit.html).

## Empfehlung für den Anfang

**Ergänzende Zulaufmessung:** Die folgende Millionengröße ist keine Aussage
über eine feste Aufbewahrungsdauer. Die anschließende Untersuchung ergab rund
56.000 Feedaufnahmen täglich, also rechnerisch eine Million nach 18 Tagen.
Konkrete Fristen, gemessene kompakte Belege und aktualisierte Speicherbudgets
stehen im [Aufbewahrungsbericht](2026-11-07-vinted-analysis-retention-strategy.md).

Eine Million schlanke Artikelreferenzen samt wenigen Änderungen je Artikel
ist eine sinnvolle erste Planungsgröße. Dafür zunächst etwa 3 GB reine
Tabellen-/Indexkapazität vorsehen, zusätzlich Betriebsspielraum für
Schreibprotokolle, Sicherungen und Releases erhalten. Das ist ein vorgeschlagener
Rahmen, keine eingerichtete Grenze oder bereits reservierter Serverspeicher.
Mehrere Millionen sind technisch plausibel; zehn Millionen wären auf dem
aktuellen Dateisystem unter diesen Annahmen kein vernünftiger Startumfang.

Bei unverändertem Preis/Status nur den letzten Prüfzeitpunkt aktualisieren;
eine neue Historienzeile nur bei einer tatsächlichen Änderung. Eine tägliche
unveränderte Momentaufnahme würde die Beobachtungstabelle unnötig vervielfachen.
Aktualisierungen erzeugen ebenfalls PostgreSQL-Schreibarbeit; Wartung und
Autovacuum bleiben notwendig. Alte Rohverläufe können nach einer später
festgelegten Aufbewahrung zusammengefasst werden. Keine Daten werden aufgrund
dieser Analyse gelöscht.

## Protokolle und Bereinigung

Private Dateien unter
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/`:
`capacity-fixture.sql`, `capacity-fixture.log`, `capacity-measurement.json` und
`production-capacity-snapshot.log`.
Der Messlauf endete erfolgreich mit Exitcode 0. Der eigens angelegte Container
`flipbase-vinted-capacity-20261107` wurde nach Identitäts- und Mount-Prüfung
entfernt. Andere Container und die fremde primäre Arbeitskopie blieben erhalten.
Nur Dokumentation formatiert/geprüft; keine Anwendungstests oder Builds nötig.
