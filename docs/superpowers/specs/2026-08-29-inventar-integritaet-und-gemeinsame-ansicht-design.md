# Inventar-Integrität und gemeinsame Ansicht – Design

**Datum:** 2026-08-29  
**Status:** für den technischen Teilscope freigegeben; keine steuerliche oder rechtliche Produktivfreigabe
**Ersetzt:** die getrennten Inventar-Tabs und die freie Behandlung von `sold` aus `2026-08-26-warenwirtschaft-und-verkaufsmodell-design.md`

## Ziel

Flipbase zeigt Mengenartikel und einzeln nachverfolgte Artikel in einer gemeinsamen Inventartabelle. Die Menge ist bei neuen Einkaufspositionen standardmäßig eins und kann bei gleichartigen Artikeln erhöht werden. Ob ein Stück einzeln nachverfolgt wird, bleibt eine unabhängige fachliche Entscheidung.

Der Status **Verkauft** wird nicht mehr manuell gesetzt. Er ist das Ergebnis eines bestandswirksamen Verkaufs. Bereits vorhandene Altdaten mit `status = 'sold'`, aber ohne Verkaufsdatensatz, werden sichtbar als ungeklärt markiert. Flipbase erzeugt daraus weder Umsatz noch Steuerdaten noch geschätzte Verkaufspreise.

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

## Verkaufsintegrität und Verkaufbarkeit getrennt

Für Einzelartikel wird ein abgeleiteter Integritätszustand eingeführt:

| Zustand                           | Bedeutung                                                                          | Verhalten                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `no_active_sale`                  | kein bestandswirksamer Verkauf und nicht als verkauft markiert                     | Integrität unauffällig; nicht automatisch verkaufbar                |
| `sold`                            | genau ein bestandswirksamer Verkauf und Status `sold`                              | schreibgeschützte Anzeige `Verkauft`                                |
| `legacy_sold_unverified`          | Status `sold`, aber kein bestandswirksamer Verkauf                                 | nicht verkaufbar, Warnung und Klärungsaktionen                      |
| `legacy_sale_header_without_line` | ein älterer Verkaufskopf verweist auf den Artikel, aber die Verkaufsposition fehlt | nicht neu buchen; bestehenden Verkauf kontrolliert vervollständigen |
| `sale_status_conflict`            | bestandswirksamer Verkauf, aber Status nicht `sold`                                | nicht verkaufbar, technische Prüfwarnung                            |
| `multiple_active_sales`           | mehr als ein bestandswirksamer Verkauf zum Einzelartikel                           | nicht verkaufbar, kritische Prüfwarnung                             |

`Bestandswirksam` ist hier ausschließlich ein technischer Begriff für Verfügbarkeit: Der Verkauf ist nicht als vollständig retourniert behandelt. Daraus folgt keine rückwirkende steuerliche oder buchhalterische Behandlung. Die reguläre Zuordnung wird über `sale_lines.inventory_item_id` geprüft. Der ältere Kopfverweis `sales.inventory_item_id` wird zusätzlich gelesen, damit ein vorhandener Verkaufsheader ohne Position nicht fälschlich als „kein Verkauf“ gilt.

Der Integritätszustand entscheidet nicht allein über Verkaufbarkeit. In diesem Paket sind Einzelartikel nur verkaufbar, wenn der Integritätszustand `no_active_sale` lautet und der Arbeitsstatus ausdrücklich `ready` oder `listed` ist. `received`, `needs_review`, `researched`, `reserved`, `returned`, `defective`, `archived` und `sold` sind nicht verkaufbar. Inventar, Verkaufsdialog, Listings und Store verwenden dasselbe Prädikat.

Eine `security_invoker`-View stellt den abgeleiteten Zustand bereit. RLS der zugrunde liegenden Tabellen bleibt dadurch wirksam. Die View erhält nur die ausdrücklich benötigten Data-API-Rechte.

## Schutz vor neuen Inkonsistenzen

Auf Datenbankebene gelten am Transaktionsende folgende Regeln:

1. Ein Einzelartikel mit einem bestandswirksamen Verkauf muss den Status `sold` haben.
2. Ein Einzelartikel mit Status `sold` muss genau einen bestandswirksamen Verkauf besitzen.
3. Ein Einzelartikel darf nicht gleichzeitig mehr als einen bestandswirksamen Verkauf besitzen.
4. Verkauf, Verkaufsposition und Artikelstatus werden gemeinsam innerhalb einer Transaktion geändert.

Die Prüfung erfolgt verzögert am Transaktionsende. Dadurch kann `record_sale` zuerst den Artikel und danach die Verkaufsposition schreiben, ohne zwischenzeitlich eine falsche Fehlermeldung auszulösen. Direkte manuelle Statusänderungen auf `sold` scheitern dagegen zuverlässig.

Vorhandene inkonsistente Altdaten werden beim Einspielen der additiven Migration nicht verändert. Erst eine spätere Änderung des betroffenen Verkaufszustands muss die neue Regel erfüllen.

## Altdaten klären

Für `legacy_sold_unverified` gibt es zwei erste Auflösungswege:

### Verkauf nachtragen oder vorhandenen Kopf vervollständigen

Der gemeinsame Verkaufsdialog wird mit dem betroffenen Artikel geöffnet. Er verlangt weiterhin Datum, Plattform und Preis. Der Aufruf trägt ausdrücklich die Information `legacyReconciliation = true`. Die Datenbank akzeptiert diesen Sonderfall nur, wenn:

- der Artikel zum Workspace gehört;
- er weiterhin `sold` ist;
- weder eine Verkaufsposition noch ein älterer Verkaufskopf existiert;
- genau eine Einzelartikelposition mit Menge eins gebucht wird.

Der bestehende Status bleibt `sold`. Umsatz und Kosten entstehen erst aus den vom Nutzer eingegebenen, tatsächlichen Verkaufsdaten.

Existiert bereits ein Verkaufsheader ohne Position, wird kein zweiter Verkauf angelegt. Der Fall erhält `legacy_sale_header_without_line` und wird über einen getrennten, kontrollierten Reparaturpfad am vorhandenen Header vervollständigt.

### Wieder in den Bestand nehmen

Eine eigene atomare Datenbankfunktion setzt den Artikel nach Bestätigung auf `ready`. Sie verlangt einen Grund, protokolliert Benutzer und Zeitpunkt in einem nur lesbaren fachlichen Ereignisjournal und darf nur auf einen weiterhin ungeklärten `sold`-Artikel angewendet werden. Es wird kein Verkauf gelöscht oder erfunden. Der Artikelstatus kann bei diesem Vorgang nicht durch einen direkten Tabellen-Update umgangen werden.

Weitere spätere Auflösungen wie Verlust oder Entsorgung gehören in das geplante vollständige Bestandsjournal und sind nicht Teil dieses Pakets.

## Verkäufe nicht mehr hart löschen

Dieses Paket baut bewusst noch keine pauschale Storno- oder Fehlbuchungsfunktion. Das einfache Zurücklegen der FIFO-Menge wäre fachlich falsch, weil auch die bereits zugeordneten Kosten, Rundungsreste, Belege, Zahlungen und Perioden korrigiert werden müssten. Eine spätere Retoure darf außerdem nicht rückwirkend aus einer früheren Steuer- oder Bankperiode verschwinden.

Deshalb entfallen zunächst direkte Update- und Delete-Policies für gebuchte Verkäufe sowie die Löschaktion in der Oberfläche. Tatsächlich zurückgekehrte Ware nutzt den vorhandenen atomaren Retouren- und Gutschriftprozess. Ein Erfassungsfehler wird sichtbar als `Korrektur erforderlich` markiert und erst im nachfolgenden Korrekturjournal-Paket mit Gegenbuchung, Ereigniszeitpunkt, Kostenreversal und Belegbezug aufgelöst. Die vorbereitenden Aufhebungsfelder dürfen bis dahin nicht durch Clients gesetzt werden.

Ein Workspace mit Einkäufen, Verkäufen, Rechnungen oder anderen aufbewahrungsrelevanten Geschäftsdaten kann nicht hart gelöscht werden. Bis ein Archivierungs- und Aufbewahrungsprozess umgesetzt ist, blockiert die Datenbank diesen Vorgang.

## Oberfläche

### Inventarliste

Die gemeinsame Tabelle zeigt mindestens:

- Artikel;
- Art `Mengenartikel` oder `Einzeln nachverfolgt`;
- verfügbare Menge;
- vorhandene Menge und Reservierungen, sofern vorhanden;
- Waren-Einstandskosten bzw. älteste verfügbare Einstandskosten; der §-25a-Einkaufspreis bleibt davon getrennt;
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

1. Integritätszustand und unveränderliches Klärungsjournal ergänzen;
2. abgeleitete View anlegen;
3. atomare Altdaten-Klärungsfunktionen anlegen;
4. verzögerte Integritätsprüfungen aktivieren;
5. direkte Update-/Delete-Policies für Buchungen entfernen und Grants ausdrücklich setzen;
6. vorhandene Daten nur klassifizieren, nicht verändern.

Vor Produktivfreigabe wird ein Bericht mit mindestens diesen Zahlen erzeugt:

- `sold` ohne bestandswirksamen Verkauf;
- bestandswirksamer Verkauf ohne `sold`;
- mehr als ein bestandswirksamer Verkauf pro Einzelartikel;
- Verkaufsheader ohne Position;
- Anzahl und IDs vorhandener Verkaufsheader ohne Position.

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
10. Direktes Ändern oder Löschen gebuchter Verkäufe und des fachlichen Klärungsjournals wird abgelehnt.
11. Der vorhandene Retourenprozess lehnt vorbereitend aufgehobene Verkäufe ab; Steuer- und Bankhistorien werden nicht rückwirkend entfernt.
12. Ein Workspace mit aufbewahrungsrelevanten Geschäftsdaten kann nicht hart gelöscht werden.
13. Verkaufbarkeit ist zentral auf `ready` oder `listed` ohne Integritätskonflikt begrenzt.
14. RLS trennt Workspaces auch über die neue View und die neuen Funktionen.

## Nachfolgende Pakete

Dieses Paket schafft noch kein vollständig GoBD-fähiges Gesamtsystem. Danach folgen getrennt geplant und abgenommen:

1. Steuer- und Belegfundament mit Erwerbsnachweis, Lieferantensnapshot, Originaldokumenten und korrekter §-25a-Trennung;
2. einheitliches Bestands- und Korrekturjournal mit Reservierungen, Listings, Fehlbuchungs-Gegenbuchungen, Kostenreversal, Verlust und Inventur;
3. kalenderjährliche Einzel-/Gesamtdifferenz und getrennte wirtschaftliche Kostenrechnung;
4. Aufbewahrung, Datenschutz, maschinell auswertbarer Prüfexport und Verfahrensdokumentation.

Vor einer steuerlichen Produktivfreigabe ist eine Abnahme anhand echter Geschäftsfälle durch die Steuerkanzlei erforderlich.
