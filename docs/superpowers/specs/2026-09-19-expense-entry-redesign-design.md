# Ausgaben-Erfassung: Menge, Anbieter, Belege und vereinfachte Steuerlogik

Stand: 19. September 2026.

## Ziel

Die Ausgabenseite soll sich wie die übrigen verwaltbaren Flipbase-Listen verhalten:
ruhiges Laden ohne sichtbares Tabellenflackern, kompakte Icon-Aktionen, eine schnelle
Erfassung normaler Betriebsausgaben und ein Belegfluss, der direkt beim Erfassen beginnt.

Die normale Erfassung soll sich auf die Angaben konzentrieren, die auf einem realen Beleg
leicht zu finden sind:

- Bezeichnung
- Händler / Anbieter
- Kategorie
- Menge
- Gesamtbetrag
- Datum / Zahlungsstatus
- optional ein Beleg

Steuerdetails bleiben vorhanden, stehen aber nicht mehr im Mittelpunkt der Eingabe.

## Aktueller Befund

### Tabellenflackern

`ExpenseService` startet beim Wechsel des aktiven Workspace bereits selbst
`ensureCurrentWorkspaceLoaded()`. Die Seite führt in `ngOnInit()` parallel dazu noch einmal
`categoryService.load()`, `recurringService.load()`, `materializeDue()` und
`expenseService.load()` aus. Damit existieren zwei konkurrierende Ladepfade. Zusätzlich
beginnt die Seite beim ersten Rendern noch nicht in einem eindeutigen Initial-Ladezustand.

Der neue Ablauf besitzt genau einen orchestrierten Initialisierungspfad und hält die Tabelle
bis zu dessen Abschluss stabil im Ladezustand.

### Belege

Die private Belegarchitektur existiert bereits und ist technisch korrekt, ist aber im
Ausgaben-Workflow zu weit von der Erfassung entfernt. In der Tabelle gibt es nur einen
Textbutton „Belege“. Im Erfassungsdialog kann noch keine Datei vorgemerkt werden.

### Tabellenaktionen

Bearbeiten und Löschen sind als Textbuttons umgesetzt. Das widerspricht den übrigen
verwaltbaren Tabellen, in denen kompakte Icon-Aktionen mit klaren Tooltips und
ARIA-Beschriftungen verwendet werden.

### Betrags- und Steuerdarstellung

Der aktuelle Dialog stellt `Bruttobetrag` und `MwSt.` gleichwertig nebeneinander. Das wirkt
so, als müsse bei jeder Ausgabe eine steuerliche Aufteilung vorgenommen werden. Für den
normalen Ablauf ist jedoch der tatsächlich bezahlte Gesamtbetrag die primäre Information.

## Datenmodell

### Konkrete Ausgaben

`expenses` erhält:

- `vendor_name text null` — Händler / Anbieter, maximal 160 Zeichen.
- `quantity integer not null default 1 check (quantity > 0)`.

`gross_amount` bleibt der **Gesamtbetrag des gesamten Belegs / Vorgangs**. Er ist niemals
der Einzelpreis.

Beispiel:

- Menge: 10
- Gesamtbetrag: 25,00 €
- berechneter Stückpreis: 2,50 €

Der Stückpreis wird nur berechnet und angezeigt. Er wird nicht redundant gespeichert.

Bestehende Datensätze erhalten durch den Default `quantity = 1`. `vendor_name` bleibt
bei Altdaten leer.

### Wiederkehrende Ausgaben

`expense_recurring_rules` erhält dieselben Felder:

- `vendor_name text null`
- `quantity integer not null default 1 check (quantity > 0)`

Materialisierte Ausgaben übernehmen Anbieter und Menge aus der Regel. So bleibt eine
monatliche Ausgabe wie „5 Software-Lizenzen bei Anbieter X“ fachlich vollständig.

### Steuerdaten

`vat_rate` bleibt technisch unverändert:

- `19` = 19 % enthalten
- `7` = 7 % enthalten
- `0` = tatsächlich 0 %
- `null` = nicht ausgewiesen / unbekannt

`0 %` und „nicht ausgewiesen“ bleiben bewusst getrennte Zustände.

Netto- und Steuerbetrag werden weiterhin mit der bestehenden zentralen
`calculateExpenseTax()`-Logik aus dem Gesamtbetrag berechnet und nicht gespeichert.

## Erfassungsdialog

Der Dialog wird auf den normalen Arbeitsablauf optimiert.

### Sichtbare Hauptfelder

1. Bezeichnung
2. Händler / Anbieter
3. Kategorie
4. Menge — Standardwert 1
5. Gesamtbetrag — der tatsächlich gezahlte oder berechnete Gesamtbetrag
6. Ausgabedatum
7. Status
8. je nach Status: bezahlt am oder fällig am
9. optionaler Beleg
10. Notizen

### Steuerdetails

Die normale Ansicht zeigt keine separaten Netto-/Steuer-Eingabefelder.

Unter dem Gesamtbetrag steht kompakt:

`19 % MwSt. enthalten · Steuerdetails ändern`

19 % ist bei neuen manuellen Ausgaben der UI-Standard. Die Steuerdetails sind
standardmäßig eingeklappt und bieten:

- 19 % enthalten
- 7 % enthalten
- 0 %
- nicht ausgewiesen / unbekannt

Wenn die Details geöffnet sind, zeigt Flipbase rein informativ z. B.:

`Netto 100,00 € · enthaltene MwSt. 19,00 €`

bei einem Gesamtbetrag von 119,00 € und 19 %.

Der Gesamtbetrag wird dabei niemals verändert. Die MwSt. wird nicht zusätzlich
aufgeschlagen.

Bei bestehenden Datensätzen bleibt der gespeicherte Wert maßgeblich. Ein bestehendes
`vat_rate = null` wird beim Bearbeiten nicht automatisch auf 19 % geändert.

## Belegfluss

### Beim Erfassen

Im Dialog gibt es eine Drag-and-Drop-Fläche mit Dateiauswahl. Erlaubte Dateitypen und
20-MiB-Grenze bleiben identisch zur bestehenden privaten Dokumentarchitektur.

Eine Datei wird vor dem Speichern nur lokal als `File` vorgemerkt. Beim Speichern:

1. Ausgabe erfolgreich anlegen.
2. Wenn eine Datei vorgemerkt ist, Beleg für die neue Expense-ID hochladen.
3. Erfolgreichen Belegstatus in der Übersicht aktualisieren.

Die Ausgabe ist die führende fachliche Buchung. Schlägt nur der optionale Belegupload fehl,
bleibt die Ausgabe gespeichert. Die UI meldet klar, dass die Ausgabe gespeichert wurde,
der Beleg aber erneut hinzugefügt werden muss. Die Tabellenzeile zeigt danach weiterhin
„Beleg hinzufügen“.

Damit wird eine gültige Ausgabe nicht wegen eines Storage-Problems verloren.

### Nachträglich

Die Tabelle kennt pro Ausgabe, ob mindestens ein Beleg vorhanden ist. Dafür lädt der
`ExpenseDocumentService` eine schlanke Metadatenübersicht für die aktuell sichtbaren
Ausgaben und hält sie getrennt von der Detailansicht des ausgewählten Belegs.

Tabellenzustände:

- kein Beleg: Dokument-plus-Icon, Tooltip/ARIA „Beleg hinzufügen“
- Beleg vorhanden: Dokument-Icon, Tooltip/ARIA „Beleg ansehen“

Beide öffnen denselben Belegdialog.

Im Belegdialog sind Drag-and-Drop, Vorschau, Download und Entfernen verfügbar. Drucken
bzw. die browserseitige Druck-/Öffnen-Aktion gehört in die Vorschau, nicht als zusätzlicher
Tabellenbutton.

## Tabellenaufbau

Die Seite bleibt auf dem gemeinsamen `DataTableComponent`.

### Standardmäßig sichtbare Spalten

- Datum
- Bezeichnung
- Anbieter
- Kategorie
- Menge
- Gesamtbetrag
- Status
- Beleg
- Aktionen

### Standardmäßig optionale / ausgeblendete Spalten

- Steuer
- Fällig / bezahlt am
- Wiederholung

Der Spaltenwechsler bleibt die zentrale Stelle für diese Detailinformationen.

`Brutto` wird im sichtbaren UI in `Gesamtbetrag` umbenannt. Das Datenfeld
`gross_amount` bleibt intern bestehen.

Die Suche berücksichtigt mindestens Bezeichnung und Anbieter; die Kategorie kann über den
bestehenden Fachfilter eingeschränkt werden.

### Aktionen

Aktionen sind icon-only und verwenden die Shared-Button-Komponente:

- offene Ausgabe als bezahlt markieren: Check-Icon
- bearbeiten: Stift-Icon
- löschen: Papierkorb-Icon
- Beleg: eigenes Icon in der Belegspalte

Jede Aktion besitzt einen eindeutigen Tooltip und `aria-label`.

Löschen verwendet den bestehenden gemeinsamen Bestätigungsdialog statt `window.confirm()`.

## Flackerfreier Ladeablauf

Die Seite erhält einen synchron initialisierten Seiten-Ladezustand.

Der Initialisierungspfad lautet:

1. Kategorien laden.
2. Parallel dazu `ExpenseService.ensureCurrentWorkspaceLoaded()` aufrufen.
   Dieser Pfad übernimmt Laden der Wiederholungsregeln, Materialisierung und Laden der
   konkreten Ausgaben und dedupliziert parallele Aufrufe bereits über `syncPromise`.
3. Nach vorhandenen Ausgaben die Belegübersicht laden.
4. Erst danach den Initialzustand beenden.

`ExpensesComponent.ngOnInit()` ruft nicht mehr separat `recurringService.load()`,
`materializeDue()` und `expenseService.load()` auf.

`DataTableComponent.loading` berücksichtigt den Initialzustand und den Service-Ladezustand.
Dadurch erscheint beim Navigieren nicht kurz eine leere Tabelle, bevor die Daten eintreffen.

Workspace-Wechsel bleibt reaktiv; bereits vorhandene Service-Deduplizierung wird genutzt.

## Separater Rollen-Bug bei Daten & Protokolle

Der parallel gemeldete Rollenfehler ist fachlich unabhängig vom Ausgabenumbau und wird als
kleiner eigener Bugfix behandelt.

Ursache: `DataAndAuditComponent` wertet eine vorübergehend leere Mitgliederliste als
fehlende Berechtigung und markiert den Workspace bereits als geladen. Wenn
`WorkspaceMemberService` kurz danach die echte `owner`-Rolle liefert, wird der
Prüfprotokoll-Ladevorgang wegen des bereits gesetzten Workspace-Merkers nicht erneut
gestartet.

Der Fix führt einen expliziten „Mitgliederkontext für diesen Workspace geladen“-Zustand ein.
Eine temporäre Rolle `null` während des Ladens erzeugt keinen Berechtigungsfehler.
Erst ein abgeschlossener Mitglieder-Ladevorgang darf zu „nicht berechtigt“ führen.
Ändert sich der aufgelöste Rollenstatus, reagiert die Prüfprotokollseite darauf.

Das rote Admin-Badge im Header bleibt unverändert: Es bezeichnet weiterhin den
Plattform-Operator und ist bewusst unabhängig von der Workspace-Rolle.

## Migration und Kompatibilität

Die Datenbankänderung erfolgt additiv:

- neue nullable `vendor_name`-Spalte
- neue `quantity`-Spalte mit Default 1 und positiver Check-Constraint
- identisch für `expenses` und `expense_recurring_rules`

Bestehende API-Aufrufer bleiben gültig, solange die TypeScript-Eingabetypen für neue Felder
geeignete Defaults setzen. Supabase-Typen werden nach der Migration regeneriert.

Gespeicherte Tabellenpräferenzen müssen neue Spalten mit den neuen Defaults ergänzen,
ohne bestehende Nutzerreihenfolge unnötig zurückzusetzen.

## Fehlerbehandlung

- Ausgabenspeicherung fehlgeschlagen: Dialog bleibt offen, kein Belegupload.
- Ausgabe gespeichert, Belegupload fehlgeschlagen: Ausgabe bleibt erhalten, klare Warnung,
  spätere Belegergänzung möglich.
- Belegübersicht fehlgeschlagen: Tabelle bleibt nutzbar; Belegstatus zeigt keinen falschen
  positiven Zustand und der zentrale Sync-Fehler wird nicht dupliziert.
- Rollen werden noch geladen: kein Berechtigungsfehler.
- Rollen geladen und Rolle unberechtigt: bestehende Berechtigungsmeldung bleibt bestehen.

## Tests

### Ausgaben

Regressionstests decken ab:

- beim Seitenstart nur ein deduplizierter Expense-Ladepfad
- Initialzustand verhindert leeren Tabellen-Flash
- Anbieter und Menge werden gespeichert und wieder geladen
- Gesamtbetrag ist Gesamtpreis; Stückpreis wird nur berechnet
- Menge muss mindestens 1 sein
- neue manuelle Ausgabe startet mit 19 % Steuerdetail
- bestehendes `vat_rate = null` bleibt beim Bearbeiten `null`
- 119 € bei 19 % ergibt 100 € netto / 19 € enthaltene Steuer
- vorgemerkter Beleg wird erst nach erfolgreicher Ausgabe hochgeladen
- fehlgeschlagener optionaler Belegupload löscht die Ausgabe nicht
- Tabellen-Belegicon unterscheidet „hinzufügen“ und „ansehen“
- Bearbeiten/Löschen/Bezahlt sind Icon-Aktionen mit ARIA-Beschriftung
- Löschen nutzt den Shared-Confirm-Dialog
- Suche findet Anbieter
- neue Spalten werden in gespeicherte Tabellenpräferenzen integriert

### Rollen-Bug

Regressionstest:

1. aktiver Workspace vorhanden
2. Mitgliederkontext noch nicht geladen → Rolle vorübergehend `null`
3. keine Berechtigungsfehlermeldung
4. Mitgliederkontext wird mit aktueller Rolle `owner` geladen
5. Prüfprotokoll wird automatisch geladen
6. Fehlermeldung bleibt verschwunden

Zusätzlich wird der echte unberechtigte Zustand nach abgeschlossenem Laden getestet.

## Nicht enthalten

- OCR oder automatische Belegerkennung
- automatisches Auslesen von Händler, Betrag oder MwSt. aus Dateien
- automatische DATEV-Kontierung
- Vorsteuerberechtigungsentscheidung durch Flipbase
- mehrere Mengeneinheiten oder Dezimalmengen
- Positionserfassung innerhalb eines einzelnen Ausgabenbelegs
- Verknüpfung mit Banktransaktionen
- Änderung der Plattform-Admin-Logik
