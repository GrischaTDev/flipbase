# Betriebsausgaben: Erfassung, Wiederholung und Dashboard-Anbindung

Stand: 18. September 2026. Branch `feat/expense-management`.

## Ziel

Flipbase bekommt unter **Finanzen** einen eigenen Bereich **Ausgaben** für allgemeine Betriebsausgaben, die keine zum Wiederverkauf bestimmte Ware sind. Wareneinkäufe bleiben ausschließlich unter **Einkäufe**.

Der Bereich bildet sowohl einzelne Ausgaben als auch wiederkehrende Fixkosten ab, speichert optional Originalbelege privat und liefert bezahlte Betriebsausgaben an den Dashboard-Cashflow.

## Fachliche Abgrenzung

**Einkäufe**:
- Sneaker, Kleidung, Paletten, Retourenware und andere Ware zum Weiterverkauf.
- Bleiben im bestehenden Einkaufsmodul.
- Neue Ware beeinflusst Cashflow, aber nicht die Verkaufsmarge, solange sie nicht verkauft ist.

**Ausgaben**:
- Versandmaterial, Paketband, Bürobedarf.
- Technik und Geräte wie Labeldrucker.
- Software-Abos, Hosting, Server.
- Miete, Werbung, Versicherungen, Steuerberatung, Dienstleistungen, Gebühren usw.
- Gehören nicht zum Wareneinsatz einzelner Verkäufe.

Die Dashboard-Marge bleibt die bereits eingeführte umsatzgewichtete Verkaufsmarge nach direktem Wareneinsatz und direkten Verkaufskosten. Betriebsausgaben verändern diese Kennzahl nicht. Bezahlte Betriebsausgaben fließen dagegen in Cashflow und Ausgabenübersicht ein.

## Standardkategorien

Jeder Workspace erhält editierbare Standardkategorien:
- Versandmaterial
- Technik & Geräte
- Software & Abos
- Hosting & Server
- Miete & Räume
- Werbung
- Dienstleistungen
- Gebühren
- Bürobedarf
- Fahrzeug & Fahrtkosten
- Versicherungen
- Steuer & Beratung
- Sonstiges

Zusätzlich können Nutzer eigene Kategorien anlegen. Kategorien sind Workspace-gebunden, können umbenannt und archiviert werden. Archivierte Kategorien bleiben an historischen Ausgaben erhalten, erscheinen aber nicht mehr standardmäßig im Auswahlfeld. Kategorien mit bestehenden Ausgaben werden nicht physisch gelöscht.

## Datenmodell

### `operating_expense_categories`

- `id uuid primary key`
- `workspace_id uuid not null`
- `name text not null`
- `default_key text null` für die ausgelieferten Standardkategorien
- `archived_at timestamptz null`
- `created_at timestamptz not null default now()`
- `created_by uuid null`
- eindeutig: `(workspace_id, lower(name))`
- eindeutig: `(workspace_id, default_key)` für nicht-null `default_key`

Beim Rollout werden Standardkategorien für bestehende Workspaces erzeugt. Ein Trigger erzeugt dieselben Kategorien für neu angelegte Workspaces. Nutzer dürfen auch Standardkategorien umbenennen oder archivieren; `default_key` bleibt nur als stabile interne Herkunft erhalten.

### `recurring_operating_expenses`

Eine Regel beschreibt nur zukünftige Fälligkeiten.

- `id uuid primary key`
- `workspace_id uuid not null`
- `category_id uuid not null`
- `title text not null`
- `gross_amount numeric(12,2) not null > 0`
- `vat_rate smallint null`, erlaubt `0, 7, 19`; null = keine Angabe
- `interval text not null`, erlaubt `monthly, quarterly, yearly`
- `start_date date not null` = erste Fälligkeit
- `end_date date null`
- `next_due_date date not null`
- `archived_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid null`

Änderungen an einer Regel wirken nur auf noch nicht erzeugte Fälligkeiten. Bereits erzeugte Ausgaben bleiben unverändert.

### `operating_expenses`

- `id uuid primary key`
- `workspace_id uuid not null`
- `category_id uuid not null`
- `recurring_rule_id uuid null`
- `recurrence_date date null` zur idempotenten Materialisierung
- `title text not null`
- `gross_amount numeric(12,2) not null > 0`
- `vat_rate smallint null`, erlaubt `0, 7, 19`
- `expense_date date not null` = Rechnungs-/Ausgabedatum
- `status text not null`, erlaubt `open, paid`
- `due_date date null`
- `paid_at date null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid null`

Constraints:
- `paid` verlangt `paid_at`.
- `open` hat kein `paid_at`.
- Bei wiederkehrenden Ausgaben ist `(recurring_rule_id, recurrence_date)` eindeutig.
- Kategorie und Regel müssen zum selben Workspace gehören.

Netto- und Steueranteil werden aus Bruttobetrag und optionalem MwSt.-Satz berechnet und nicht redundant gespeichert.

## Wiederkehrende Ausgaben

Unterstützte Intervalle:
- monatlich
- quartalsweise
- jährlich

Die Datenbank stellt die transaktionale RPC `materialize_due_operating_expenses(p_workspace_id, p_through_date)` bereit.

Verhalten:
1. Nur aktive Regeln des Workspace mit `next_due_date <= p_through_date` werden verarbeitet.
2. Für jede fällige Regel wird eine konkrete `operating_expenses`-Zeile angelegt.
3. Die erzeugte Ausgabe ist zunächst **offen** und damit noch kein Cash-Abfluss.
4. `expense_date` und `due_date` werden zunächst auf die Fälligkeit gesetzt.
5. `next_due_date` wird auf die nächste Monats-/Quartals-/Jahresfälligkeit gesetzt.
6. Sind seit dem letzten App-Aufruf mehrere Fälligkeiten vergangen, werden alle bis `p_through_date` fehlenden Instanzen nachgezogen.
7. Es werden niemals zukünftige Ausgaben erzeugt.
8. Eindeutigkeit von Regel + Fälligkeitsdatum verhindert Doppelbuchungen.

Monatsenden bleiben stabil: Eine am letzten Kalendertag beginnende Regel bleibt am Monatsende; andere Tage werden bei kürzeren Monaten auf den letzten gültigen Tag gekappt.

Der `OperatingExpenseService` ruft die RPC vor dem Laden seiner Daten auf. Damit werden Fälligkeiten beim Öffnen der Anwendung bzw. beim Wechsel in einen Workspace materialisiert, ohne einen separaten Cron-Dienst zu benötigen.

## Zahlungslogik

Manuelle Ausgaben:
- Status **bezahlt** ist im Formular vorausgewählt.
- Bei bezahlt ist Zahlungsdatum Pflicht; Vorgabe ist das Ausgabedatum.
- Alternativ kann eine Ausgabe als **offen** gespeichert werden.

Offene Ausgaben:
- optionales Fälligkeitsdatum
- kein Zahlungsdatum
- zählen nicht in den Cashflow

Bezahlte Ausgaben:
- Zahlungsdatum Pflicht
- zählen nach Zahlungsdatum in den Dashboard-Cashflow

Rechnungs-/Ausgabedatum bleibt unabhängig vom Zahlungsdatum erhalten.

## MwSt.

Pflichtfeld ist nur der **Bruttobetrag**.

Optionaler MwSt.-Satz:
- keine Angabe
- 0 %
- 7 %
- 19 %

UI berechnet bei bekanntem Satz:
- Nettobetrag = Brutto / (1 + Satz/100)
- Steueranteil = Brutto - Netto

Diese Werte dienen Anzeige, Export und späterer Buchhaltung; gespeichert werden nur Brutto und Satz.

## Belege

Jede konkrete Ausgabe kann beliebig viele private Originalbelege erhalten. Wiederkehrende Regeln selbst besitzen keine Belege.

Neue Tabelle `operating_expense_documents` und privater Bucket `operating-expense-documents`. Technisches Muster entspricht den bestehenden Einkaufsbelegen:
- PDF, JPG/JPEG, PNG, XML
- maximal 20 MiB
- Pfad: `operating-expense-documents/<workspace_id>/<expense_id>/<document_id>.<endung>`
- kein öffentlicher URL-Zugriff
- Download über authentifizierten Storage-Client
- Metadaten werden nach erfolgreichem Upload geschrieben
- schlägt der Metadateneintrag fehl, wird die Datei zurückgenommen

Belegarten:
- Rechnung / Quittung
- Zahlungsnachweis
- Sonstiges

Beim Löschen einer Ausgabe entfernt der Service zuerst ihre Storage-Dateien und Dokumentmetadaten und anschließend die Ausgabe.

## Sicherheit

Alle neuen Tabellen in `public`:
- RLS aktiviert
- `anon` erhält keine Rechte
- `authenticated` nur die im UI benötigten Operationen
- jede Policy prüft `public.is_workspace_member(workspace_id)`
- Insert/Update prüft zusätzlich, dass referenzierte Kategorie/Regel zum selben Workspace gehören
- Update-Policies besitzen `USING` und `WITH CHECK`

Die Materialisierungs-RPC läuft als `security invoker` und prüft den Workspace explizit. Sie wird nur `authenticated` und `service_role` gewährt.

Storage bleibt privat und wird über RLS auf Workspace + konkrete Ausgabe begrenzt.

## Oberfläche

Neuer Navigationspunkt unter **Finanzen**, vor **Steuern & DATEV**:
- **Ausgaben** → `/expenses`

Seite:
- Titel „Ausgaben“
- kompakte Zusammenfassung des gewählten Zeitraums: Gesamt, bezahlt, offen
- Zeitraumfilter standardmäßig aktueller Monat
- Tab **Ausgaben**
- Tab **Wiederkehrend**
- Button **Ausgabe hinzufügen**

Ausgaben-Tabelle:
- Datum
- Beschreibung
- Kategorie
- Betrag
- Status
- Fällig / bezahlt
- Beleg
- Aktionen

Formular „Ausgabe hinzufügen/bearbeiten“:
- Beschreibung
- Kategorie
- Bruttobetrag
- MwSt.-Satz
- Ausgabedatum
- Status offen/bezahlt
- Fällig am bei offen
- Bezahlt am bei bezahlt
- Belege nach dem ersten Speichern

Wiederkehrende Regeln:
- Beschreibung
- Kategorie
- Betrag
- Intervall
- nächste Fälligkeit
- optional endet am
- aktiv/archiviert
- bearbeiten, archivieren

Kategorieverwaltung:
- vorhandene aktive Kategorien
- neue Kategorie anlegen
- umbenennen
- archivieren
- archivierte Kategorien werden historisch weiter angezeigt

## Dashboard

`DashboardReportService` erhält die geladenen Betriebsausgaben als weitere Datenquelle.

Für den gewählten Zeitraum:
- `operatingExpenseSpend` summiert nur **bezahlte** Betriebsausgaben nach `paid_at`
- nur bei Plattformfilter „Alle Plattformen“
- `totalExpenses = purchaseSpend + sellingCosts + operatingExpenseSpend`
- Cashflow bleibt `revenue - totalExpenses`
- Verkaufsmarge und Verkaufsgewinn bleiben unverändert

Ausgaben-Aufschlüsselung:
- Einkäufe
- Gebühren & Versand
- Betriebsausgaben

Bei einem Plattformfilter sind Einkäufe, Betriebsausgaben, Gesamtausgaben und Cashflow bewusst nicht als vollständige Werte darstellbar; die plattformbezogenen Gebühren bleiben sichtbar.

## Bankabgleich und DATEV

Nicht Bestandteil dieses ersten Schritts:
- automatisches Matching von Banktransaktionen mit Betriebsausgaben
- DATEV-Konten/Kontenrahmen je Kategorie
- automatische Buchung aus Belegen/OCR
- Abschreibungen von Anlagegütern
- Steuerliche Bewertung, ob eine konkrete Ausgabe sofort abzugsfähig ist

Das Datenmodell hält Zahlungsdatum, MwSt., Kategorie und Belege jedoch so vor, dass diese Integrationen später ohne Neuaufbau möglich sind.

## Demo-Modus

Der Demo-Modus darf lokal Beispielausgaben und Standardkategorien anzeigen und CRUD simulieren. Private Beleg-Uploads bleiben wie bei Einkaufsbelegen deaktiviert und erklären dies.

## Tests

Datenbank:
- RLS Mitglied vs. fremder Workspace
- Standardkategorien für bestehende und neue Workspaces
- Kategorien anlegen/umbenennen/archivieren
- Expense-Status-Constraints
- VAT-Constraints
- gleiche-Workspace-FKs
- Wiederholungen monatlich/quartalsweise/jährlich
- Monatsende
- mehrere verpasste Fälligkeiten nachholen
- keine Zukunftsinstanzen
- idempotente Materialisierung
- Storage-Pfad/RLS für Belege

Anwendung:
- Service lädt Materialisierung vor Ausgaben
- CRUD und Fehlerzustände
- MwSt.-Berechnung
- Status/Fällig/Zahlungsdatum
- Wiederkehrende Regeln
- Kategorieverwaltung
- Beleg-Upload/Download/Löschen
- Dashboard-Cashflow enthält bezahlte Betriebsausgaben, offene nicht
- Dashboard-Marge bleibt unverändert
- Plattformfilter zeigt keinen unvollständigen Cashflow als echten Wert
- Seite und Dialoge bestehen Accessibility-Checks.
