# Ausgaben: Betriebskosten, Wiederholungen und Belege

> **Aktueller UX-Stand:** Die fachliche Grundlage dieses Dokuments bleibt gültig.
> Die Erfassungs- und Tabellen-UX wurde am 19. September 2026 durch
> `docs/superpowers/specs/2026-09-19-expense-entry-redesign-design.md`
> konkretisiert. Insbesondere ersetzt dort „Gesamtbetrag + eingeklappte
> Steuerdetails“ die hier beschriebene gleichwertige Brutto/MwSt.-Darstellung;
> Anbieter und Menge wurden additiv ergänzt.

Stand: 18. September 2026. Ziel ist ein eigenständiger Finanzbaustein für allgemeine
Betriebsausgaben. Wareneinkäufe bleiben im bestehenden Einkaufsbereich.

## Nutzerentscheidungen

1. Wiederkehrende Kosten erzeugen echte einzelne Ausgaben.
2. Wareneinkäufe (Sneaker, Kleidung, Paletten usw.) bleiben unter „Einkäufe“.
   „Ausgaben“ erfasst allgemeine Betriebsausgaben.
3. Betragserfassung: Bruttobetrag Pflicht; MwSt.-Satz optional (keine Angabe, 0 %, 7 %, 19 %).
   Netto und Steueranteil werden daraus berechnet.
4. Flipbase liefert gängige Standardkategorien und erlaubt eigene Kategorien je Workspace.
5. Wiederholungen: monatlich, quartalsweise, jährlich; Startdatum Pflicht, Enddatum optional.
6. Belege hängen an der konkreten Ausgabe, nicht an der Wiederholungsregel.
7. Ausgabe-Status: offen oder bezahlt. Nur bezahlte Ausgaben beeinflussen den Cashflow.
   Manuelle neue Ausgaben starten im Formular standardmäßig als bezahlt.
8. Ausgabedatum/Rechnungsdatum und Zahlungsdatum werden getrennt gespeichert.
   Bei offenen Ausgaben ist ein Fälligkeitsdatum möglich.
9. Wiederkehrende Ausgaben werden erst fälligkeitsnah materialisiert. Zukünftige Instanzen
   werden nicht vorab gespeichert; kommende Fixkosten erscheinen nur als Vorschau.

## Begriffe und Abgrenzung

### Wareneinkauf

Alles, was zum Weiterverkauf beschafft wird, bleibt ein bestehender `Purchase`:

- Sneaker
- Kleidung
- Paletten / Retourenware
- sonstige Handelsware

Diese Daten bestimmen Wareneinsatz, Lagerwert und Verkaufsmarge.

### Betriebsausgabe

Alles, was den Geschäftsbetrieb kostet, aber keine zum Weiterverkauf bestimmte Ware ist:

- Versandmaterial
- Paketband / Etiketten
- Labeldrucker / Technik
- Bürobedarf
- Software & Abos
- Hosting & Server
- Miete & Räume
- Werbung
- Dienstleistungen
- Gebühren
- Fahrzeug & Fahrtkosten
- Versicherungen
- Steuer & Beratung
- Sonstiges

Betriebsausgaben beeinflussen den Cashflow, aber nicht die bestehende Verkaufsmarge eines
Artikels. Ein späteres Betriebsergebnis / eine operative Marge kann diese Kosten zusätzlich
auswerten; das ist nicht Teil dieses ersten Ausgabenbausteins.

## Navigation und Seitenstruktur

Unter „Finanzen“ lautet die Reihenfolge:

1. Ausgaben
2. Steuern & DATEV
3. Auswertungen

Neue Route: `/expenses`.

Die Seite besitzt zwei Ansichten:

- **Ausgaben**: konkrete einmalige oder aus Regeln erzeugte Ausgaben.
- **Wiederkehrend**: Regeln für monatliche, quartalsweise oder jährliche Kosten.

Die Hauptansicht zeigt oberhalb der Tabelle kompakte Summen für den gewählten Zeitraum:

- Ausgaben gesamt
- bezahlt
- offen

Filter:

- Zeitraum
- Kategorie
- Status
- Suche

Tabelle:

- Datum
- Bezeichnung
- Kategorie
- Brutto
- MwSt.
- Status
- Fällig / bezahlt am
- Wiederholung
- Beleg
- Aktionen

## Datenmodell

### `expense_categories`

Workspace-spezifische Kategorien.

- `id uuid primary key`
- `workspace_id uuid not null`
- `name text not null`
- `sort_order integer not null`
- `is_default boolean not null default false`
- `is_archived boolean not null default false`
- `created_at timestamptz`
- `created_by uuid`
- `updated_at timestamptz`

Eindeutig: `(workspace_id, lower(name))` für nicht archivierte Kategorien.

Die Migration legt für bestehende Workspaces folgende Startwerte an:

- Versandmaterial
- Technik & Geräte
- Bürobedarf
- Software & Abos
- Hosting & Server
- Miete & Räume
- Werbung
- Dienstleistungen
- Gebühren
- Fahrzeug & Fahrtkosten
- Versicherungen
- Steuer & Beratung
- Sonstiges

Für neu angelegte Workspaces werden dieselben Kategorien über die bestehende
Workspace-Erzeugung bzw. eine idempotente Initialisierung angelegt.

Standardkategorien sind Startwerte, keine Kontenrahmen. Nutzer können eigene Kategorien
anlegen. Kategorien, die bereits verwendet werden, werden archiviert statt hart gelöscht.

### `expense_recurring_rules`

- `id uuid primary key`
- `workspace_id uuid not null`
- `title text not null`
- `category_id uuid not null`
- `gross_amount numeric(12,2) not null check > 0`
- `vat_rate numeric(5,2) null check in (0,7,19)`
- `frequency text not null check in ('monthly','quarterly','yearly')`
- `start_date date not null`
- `end_date date null`
- `is_active boolean not null default true`
- `notes text null`
- `created_at / created_by / updated_at`

Regeländerungen wirken nur auf noch nicht erzeugte Ausgaben. Bereits erzeugte Ausgaben
bleiben historische Einzelbuchungen und werden nicht rückwirkend überschrieben.

### `expenses`

- `id uuid primary key`
- `workspace_id uuid not null`
- `category_id uuid not null`
- `recurring_rule_id uuid null`
- `occurrence_date date null`
- `title text not null`
- `gross_amount numeric(12,2) not null check > 0`
- `vat_rate numeric(5,2) null check in (0,7,19)`
- `expense_date date not null`
- `due_date date null`
- `status text not null check in ('open','paid')`
- `payment_date date null`
- `notes text null`
- `deleted_at timestamptz null`
- `created_at / created_by / updated_at`

Regeln:

- `status = 'paid'` verlangt `payment_date`.
- `status = 'open'` verlangt `payment_date is null`.
- Bei manueller Erfassung setzt die UI „bezahlt“ voraus und schlägt das Ausgabedatum als
  Zahlungsdatum vor.
- Wiederkehrend erzeugte Ausgaben starten als „offen“.
- Eindeutig: `(workspace_id, recurring_rule_id, occurrence_date)`, sofern
  `recurring_rule_id` gesetzt ist. Dadurch können parallele Clients keine Dubletten erzeugen.
- Löschen ist Soft-Delete. Dadurch wird eine gelöschte wiederkehrende Instanz nicht beim
  nächsten Laden erneut erzeugt.

Netto und Steueranteil werden nicht redundant gespeichert:

- ohne MwSt.-Angabe: Netto/Steuer = unbekannt
- 0 %: Netto = Brutto, Steuer = 0
- 7/19 %: Netto = Brutto / (1 + Satz/100), Steuer = Brutto - Netto

Berechnung und Rundung erfolgen zentral über eine gemeinsame Utility.

## Wiederkehrende Ausgaben

Es gibt keinen externen Cron-Zwang.

Beim Laden von Dashboard/Ausgaben sowie nach dem Speichern einer Wiederholungsregel ruft
der Expense-Service eine idempotente Materialisierung auf:

1. aktive Regeln des Workspaces laden,
2. alle Fälligkeiten vom Startdatum bis zum lokalen heutigen Datum bestimmen,
3. fehlende konkrete Ausgaben einfügen,
4. Dubletten über den Unique-Key ignorieren.

Beispiel: Server 29,90 € monatlich, Start 01.09. Wird Flipbase erst am 05.12. wieder
geöffnet, entstehen die fälligen Instanzen für 01.09., 01.10., 01.11. und 01.12.
Zukünftige Monate werden nicht gespeichert.

„Demnächst fällig“ wird rein aus den Regeln berechnet, z. B. die nächsten 30 Tage. Diese
Vorschau beeinflusst weder Ausgaben noch Cashflow.

## Belege

Die bestehende private Einkaufsbeleg-Architektur wird wiederverwendet:

- gleiche Datei-Validierung und Größenbegrenzung (20 MiB)
- PDF, JPG, PNG, XML
- private Supabase-Storage-Auslieferung
- Vorschau und Download
- keine öffentlichen URLs

Für saubere RLS-Grenzen erhält der Bereich einen privaten Bucket `expense-documents` und
eine Tabelle `expense_documents`, statt den semantisch einkaufsbezogenen
`purchase-documents`-Pfad zu missbrauchen. Gemeinsame Client-Utilities für Dateiprüfung,
Vorschau und Download werden extrahiert, damit kein zweites Dokumentensystem entsteht.

`expense_documents`:

- `id`
- `workspace_id`
- `expense_id`
- `document_type` (invoice, receipt, payment_proof, other)
- `original_file_name`
- `storage_path`
- `mime_type`
- `file_size`
- `created_at`
- `created_by`

Belege hängen ausschließlich an konkreten Ausgaben. Eine Wiederholungsregel selbst besitzt
keinen Beleg.

## Dashboard-Anbindung

Nach Einführung der Ausgaben erweitert sich die aktuelle Ausgaben-/Cashflow-Logik:

**Cashflow im gewählten Zeitraum**

`Verkaufseinnahmen - Wareneinkäufe - direkte Verkaufskosten - bezahlte Betriebsausgaben`

Für Betriebsausgaben zählt das **Zahlungsdatum**, nicht das Rechnungsdatum.

Die Ausgaben-Aufschlüsselung im Dashboard zeigt:

- Einkäufe
- Gebühren & Versand
- Betriebsausgaben
- Gesamt

Die bestehende **Marge** bleibt die umsatzgewichtete Verkaufsmarge aus Verkäufen mit
bekannten direkten Kosten. Allgemeine Betriebsausgaben werden dort nicht hineingerechnet,
damit Lager-/Verkaufsprofitabilität und Unternehmens-Cashflow getrennt bleiben.

Offene Betriebsausgaben beeinflussen den Cashflow nicht. Sie können in „Zu erledigen“ bzw.
auf der Ausgaben-Seite als fällig sichtbar sein.

## RLS und Sicherheit

Alle neuen Tabellen liegen im exponierten `public`-Schema und erhalten RLS. Entsprechend
der aktuellen Supabase-Empfehlung werden Grants explizit entzogen und nur die tatsächlich
benötigten Operationen an `authenticated` vergeben.

Zugriff ist ausschließlich für Mitglieder des jeweiligen Workspaces erlaubt:

- select
- insert
- update
- soft delete

Insert/Update prüfen zusätzlich, dass Kategorie und Wiederholungsregel demselben Workspace
gehören. `created_by` entspricht beim Insert `auth.uid()`.

Der private Storage-Bucket prüft Bucket, kanonischen Pfad, Expense-Zugehörigkeit und
Workspace-Mitgliedschaft über getrennte Policies für Lesen, Hochladen und Entfernen.

Referenzen:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/buckets/fundamentals

## Service-Grenzen

### `ExpenseService`

Verantwortet:

- Laden konkreter Ausgaben
- CRUD
- Statuswechsel offen/bezahlt
- Materialisierung fälliger Wiederholungen
- Summen für Dashboard/Seite

### `ExpenseRecurringService`

Verantwortet:

- Regeln laden/anlegen/ändern/deaktivieren
- nächste Fälligkeiten berechnen
- keine direkte Dashboard-Formatierung

### `ExpenseCategoryService`

Verantwortet:

- Standard-/eigene Kategorien
- anlegen, umbenennen, archivieren
- idempotente Standardinitialisierung

### Dokumentendienst

Die dateibezogenen Basisteile des bestehenden PurchaseDocumentService werden so
herausgezogen, dass Einkaufs- und Ausgabenbelege dieselbe Validierungs-/Download-Logik
nutzen. Die fachlichen Services bleiben getrennt.

## Fehler- und Offline-Verhalten

- Fehlgeschlagene Speicherung wird über den bestehenden `SyncStatusService` gemeldet.
- Eine Ausgabe erscheint erst nach bestätigter Persistierung als gespeichert.
- Beleg-Upload folgt dem bestehenden Kompensationsmuster: schlägt der Metadatensatz fehl,
  wird die zuvor hochgeladene Datei wieder entfernt.
- Materialisierung ist idempotent; ein Teilfehler darf beim nächsten Laden wiederholt werden.
- Demo-Modus speichert weder Ausgaben noch Belege dauerhaft; Demo-Daten bleiben klar als
  Demo gekennzeichnet.

## Tests

### Datenbank

Neue SQL-Tests prüfen:

- Workspace-Isolation für alle Tabellen
- Kategorie-Fremdzuordnung wird verhindert
- Regel-Fremdzuordnung wird verhindert
- Status/Zahlungsdatum-Constraints
- erlaubte MwSt.-Sätze
- Unique-Key für Wiederholungsinstanzen
- Soft-Delete verhindert Rematerialisierung
- Storage-Pfade und private Dokumentrechte

### Anwendung

Unit-/DOM-/Angular-Tests prüfen:

- Netto-/MwSt.-Berechnung und Rundung
- monatliche, quartalsweise, jährliche Fälligkeiten
- Enddatum
- Nachziehen mehrerer verpasster Fälligkeiten
- keine zukünftigen Instanzen
- keine Dubletten
- manuelle Ausgabe standardmäßig „bezahlt“
- offene/bezahlt Statuswechsel
- Kategorien anlegen/archivieren
- Beleg-Upload/-Vorschau
- Filter/Tabelle
- Dashboard-Cashflow berücksichtigt nur bezahlte Betriebsausgaben
- Dashboard-Marge bleibt unverändert

## Nicht enthalten

- automatische OCR
- automatische DATEV-Kontenfindung
- automatische Bankzuordnung zu Ausgaben
- Abschreibungslogik für Anlagegüter wie einen Labeldrucker
- GoBD-/Steuerberater-Vollbuchhaltung
- Betriebsergebnis / operative Marge als neue Dashboard-KPI
- Import von Kreditkarten- oder Bankumsätzen als Ausgaben

Das Datenmodell lässt spätere Bankzuordnung, DATEV-Auswertung und Anlagenlogik zu, ohne
diese Funktionen jetzt vorzutäuschen.
