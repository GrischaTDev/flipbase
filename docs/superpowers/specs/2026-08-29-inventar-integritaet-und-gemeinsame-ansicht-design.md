# Inventar-Integrität und gemeinsame Ansicht – Design

**Datum:** 2026-08-29  
**Status:** fachlich freigegeben  
**Ersetzt:** die getrennten Inventar-Tabs und die freie Behandlung von `sold` aus `2026-08-26-warenwirtschaft-und-verkaufsmodell-design.md`

## Ziel

Flipbase zeigt Mengenartikel und einzeln nachverfolgte Artikel in einer gemeinsamen Inventartabelle. Die Menge ist bei neuen Einkaufspositionen standardmäßig eins und kann bei gleichartigen Artikeln erhöht werden. Ob ein Stück einzeln nachverfolgt wird, bleibt eine unabhängige fachliche Entscheidung.

Der Status **Verkauft** wird nicht mehr manuell gesetzt. Er ist das Ergebnis eines wirksamen Verkaufs. Bereits vorhandene Altdaten mit `status = 'sold'`, aber ohne Verkaufsdatensatz, werden sichtbar als ungeklärt markiert. Flipbase erzeugt daraus weder Umsatz noch Steuerdaten noch geschätzte Verkaufspreise.

Dieses Paket ist die erste, risikobegrenzende Stufe des umfassenderen Warenwirtschafts- und Compliance-Umbaus. Steuer- und Belegmodell, vollständiges Bestandsjournal, Reservierungen, Aufbewahrung und Prüfexport folgen als getrennte Pakete.

## Fachliche Leitlinien

### Eine Inventaransicht

Die Inventarseite besitzt keine Tabs `Bestand` und `Einzelstücke` mehr. Sie zeigt:

- Mengenartikel als eine Zeile je Artikelstamm mit verfügbarer, reservierter und vorhandener Menge;
- einzeln nachverfolgte Artikel als Zeile mit Menge eins;
- einen gemeinsamen Such- und Filterbereich;
- Wareneingänge und Einkaufspreise ausklappbar unter Mengenpositionen;
- eine verständliche Kennzeichnung, wenn Altdaten geprüft werden müssen.

Die Oberfläche verwendet nicht mehr das ungebräuchliche Wort `Lose`. Nutzer sehen stattdessen `Wareneingänge und Einkaufspreise`. Im Datenmodell darf `stock_lot` als technischer Begriff bestehen bleiben.

### Menge und Nachverfolgung sind unabhängig

Eine Einkaufsposition startet mit Menge eins. Eine größere Menge bedeutet nicht automatisch, dass keine Einzelverfolgung nötig ist. Der Nachverfolgungsmodus bleibt:

- `quantity`: gleichartige Stücke werden als Menge geführt;
- `individual`: jedes Stück hat individuelle Daten wie Zustand, Fotos oder eine interne Identität.

Eine gesetzliche Pflicht zu Hersteller-Seriennummern oder einer bestimmten Tabellenstruktur wird nicht behauptet. Maßgeblich ist die nachvollziehbare Zuordnung der tatsächlichen Einkaufs- und Verkaufsdaten.

## Verbindlicher Verkaufszustand

Für Einzelartikel wird ein abgeleiteter Verkaufszustand eingeführt:

| Zustand                  | Bedeutung                                                      | Verhalten                                      |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------- |
| `available`              | kein wirksamer Verkauf und Artikel nicht als verkauft markiert | normal verkaufbar                              |
| `sold`                   | genau ein wirksamer Verkauf und Artikelstatus `sold`           | schreibgeschützte Anzeige `Verkauft`           |
| `legacy_sold_unverified` | Artikelstatus `sold`, aber kein wirksamer Verkauf              | nicht verkaufbar, Warnung und Klärungsaktionen |
| `sale_status_conflict`   | wirksamer Verkauf, aber Artikelstatus nicht `sold`             | nicht verkaufbar, technische Prüfwarnung       |
| `multiple_active_sales`  | mehr als ein wirksamer Verkauf zum Einzelartikel               | nicht verkaufbar, kritische Prüfwarnung        |

Ein wirksamer Verkauf ist ein Verkauf, der weder retourniert noch storniert wurde. Die Zuordnung wird über `sale_lines.inventory_item_id` geprüft. Der ältere Kopfverweis `sales.inventory_item_id` bleibt nur für Rückwärtskompatibilität erhalten.

Eine `security_invoker`-View stellt den abgeleiteten Zustand bereit. RLS der zugrunde liegenden Tabellen bleibt dadurch wirksam. Die View erhält nur die ausdrücklich benötigten Data-API-Rechte.

## Schutz vor neuen Inkonsistenzen

Auf Datenbankebene gelten am Transaktionsende folgende Regeln:

1. Ein Einzelartikel mit einem wirksamen Verkauf muss den Status `sold` haben.
2. Ein Einzelartikel mit Status `sold` muss genau einen wirksamen Verkauf besitzen.
3. Ein Einzelartikel darf nicht gleichzeitig mehr als einen wirksamen Verkauf besitzen.
4. Verkauf, Verkaufsposition und Artikelstatus werden gemeinsam innerhalb einer Transaktion geändert.

Die Prüfung erfolgt verzögert am Transaktionsende. Dadurch kann `record_sale` zuerst den Artikel und danach die Verkaufsposition schreiben, ohne zwischenzeitlich eine falsche Fehlermeldung auszulösen. Direkte manuelle Statusänderungen auf `sold` scheitern dagegen zuverlässig.

Vorhandene inkonsistente Altdaten werden beim Einspielen der additiven Migration nicht verändert. Erst eine spätere Änderung des betroffenen Verkaufszustands muss die neue Regel erfüllen.

## Altdaten klären

Für `legacy_sold_unverified` gibt es zwei erste Auflösungswege:

### Verkauf nachtragen

Der gemeinsame Verkaufsdialog wird mit dem betroffenen Artikel geöffnet. Er verlangt weiterhin Datum, Plattform und Preis. Der Aufruf trägt ausdrücklich die Information `legacyReconciliation = true`. Die Datenbank akzeptiert diesen Sonderfall nur, wenn:

- der Artikel zum Workspace gehört;
- er weiterhin `sold` ist;
- kein wirksamer Verkauf existiert;
- genau eine Einzelartikelposition mit Menge eins gebucht wird.

Der bestehende Status bleibt `sold`. Umsatz und Kosten entstehen erst aus den vom Nutzer eingegebenen, tatsächlichen Verkaufsdaten.

### Wieder in den Bestand nehmen

Eine eigene atomare Datenbankfunktion setzt den Artikel nach Bestätigung auf `ready`. Sie verlangt einen Grund, protokolliert Benutzer und Zeitpunkt und darf nur auf einen weiterhin ungeklärten `sold`-Artikel angewendet werden. Es wird kein Verkauf gelöscht oder erfunden.

Weitere spätere Auflösungen wie Verlust oder Entsorgung gehören in das geplante vollständige Bestandsjournal und sind nicht Teil dieses Pakets.

## Verkauf stornieren statt löschen

Ein gebuchter Verkauf wird nicht mehr hart gelöscht. Die Aktion `Verkauf stornieren`:

- verlangt einen Grund;
- setzt `voided_at`, `voided_by` und `void_reason`;
- führt Einzelartikel auf `ready` zurück;
- führt Mengen aus den gespeicherten FIFO-Zuordnungen in die ursprünglichen Wareneingänge zurück;
- erzeugt für Mengenartikel Gegenbewegungen mit Grund `sale_void`;
- erhält Verkauf, Positionen, Kosten-Snapshots und ursprüngliche Bewegungen.

Stornierte Verkäufe bleiben in der Verkaufsliste sichtbar, zählen jedoch nicht zu Umsatz, Gewinn, Steuerdaten oder Bankabgleich. Die Verkaufsseite kennzeichnet sie als `Storniert`. Eine bereits vollständig retournierte oder bereits stornierte Buchung kann nicht erneut storniert werden.

Die direkte Delete-Policy auf `sales` entfällt. Auch ein direkter Delete-Versuch durch ein Workspace-Mitglied wird abgelehnt.

## Oberfläche

### Inventarliste

Die gemeinsame Tabelle zeigt mindestens:

- Artikel;
- Art `Mengenartikel` oder `Einzeln nachverfolgt`;
- verfügbare Menge;
- vorhandene Menge und Reservierungen, sofern vorhanden;
- Einkaufspreis bzw. ältesten verfügbaren Einkaufspreis;
- Status oder Datenqualitätswarnung;
- Aktion `Verkaufen` oder `Details`.

Ein gültig verkaufter Einzelartikel zeigt einen festen Status-Badge. Ein ungeklärter Altartikel zeigt eine auffällige, aber sachliche Warnung und die beiden Klärungsaktionen. Er wird nicht als verfügbar gezählt.

### Artikeldetail

Für einen gültig verkauften Artikel ersetzt ein fester `Verkauft`-Badge das Auswahlfeld. Damit erscheint nicht mehr `Status bitte wählen`, obwohl der gespeicherte Wert `sold` lautet.

Für ungeklärte Altdaten erscheinen:

- Erklärung, dass kein zugehöriger Verkauf gefunden wurde;
- `Verkauf nachtragen`;
- `Wieder in Bestand nehmen`.

Andere Arbeitszustände bleiben vorerst auswählbar. Die vollständige Trennung von Zustand, Listing, Reservierung und Verfügbarkeit folgt im Journal-Paket.

## Datenmigration und Rollout

Die Migration ist additiv:

1. neue Stornofelder und Bewegungsgrund ergänzen;
2. abgeleitete View anlegen;
3. atomare Klärungs- und Stornofunktionen anlegen;
4. verzögerte Integritätsprüfungen aktivieren;
5. Delete-Policy entfernen und Grants ausdrücklich setzen;
6. vorhandene Daten nur klassifizieren, nicht verändern.

Vor Produktivfreigabe wird ein Bericht mit mindestens diesen Zahlen erzeugt:

- `sold` ohne wirksamen Verkauf;
- wirksamer Verkauf ohne `sold`;
- mehr als ein wirksamer Verkauf pro Einzelartikel;
- Verkaufsheader ohne Position;
- Summe und IDs stornierter Testverkäufe.

Die Produktionsmigration wird nicht automatisch in dieser Entwicklungssitzung ausgeführt.

## Tests und Abnahmekriterien

1. Ein Mengenartikel mit Menge fünf und ein Einzelartikel erscheinen in derselben Tabelle.
2. Eine neue Einkaufsposition startet mit Menge eins.
3. Kein Tab `Bestand` oder `Einzelstücke` bleibt auf der Inventarseite.
4. Nutzertexte enthalten `Wareneingänge und Einkaufspreise` statt `Lose`.
5. Ein gültig verkaufter Artikel zeigt im Detail einen festen `Verkauft`-Badge und kein leeres Auswahlfeld.
6. Ein vorhandener `sold`-Artikel ohne Verkauf bleibt ohne erfundenen Umsatz und wird `legacy_sold_unverified`.
7. Ein normaler direkter Statuswechsel auf `sold` wird von der Datenbank abgelehnt.
8. Ein nachgetragener echter Verkauf löst den ungeklärten Zustand auf.
9. `Wieder in Bestand nehmen` verlangt einen Grund und erzeugt einen Verlaufseintrag.
10. Stornieren erhält den Verkaufsdatensatz und stellt Einzel- oder Mengenbestand atomar wieder her.
11. Stornierte Verkäufe verändern Umsatz, Gewinn, Steuerberechnung und Bankabgleich nicht.
12. RLS trennt Workspaces auch über die neue View und die neuen Funktionen.

## Nachfolgende Pakete

Dieses Paket schafft noch kein vollständig GoBD-fähiges Gesamtsystem. Danach folgen getrennt geplant und abgenommen:

1. Steuer- und Belegfundament mit Erwerbsnachweis, Lieferantensnapshot, Originaldokumenten und korrekter §-25a-Trennung;
2. einheitliches Bestandsjournal mit Reservierungen, Listings, Korrekturen, Verlust und Inventur;
3. kalenderjährliche Einzel-/Gesamtdifferenz und getrennte wirtschaftliche Kostenrechnung;
4. Aufbewahrung, Datenschutz, maschinell auswertbarer Prüfexport und Verfahrensdokumentation.

Vor einer steuerlichen Produktivfreigabe ist eine Abnahme anhand echter Geschäftsfälle durch die Steuerkanzlei erforderlich.
