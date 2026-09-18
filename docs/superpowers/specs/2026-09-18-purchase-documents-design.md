# Einkauf: Originalbelege als private Dateien

Stand: 18. September 2026. Teil 2 von 3 des Einkaufsumbaus; Teil 1 (Quelle,
Verkäufer-Snapshot, Nachtrag) ist mit PR #103 veröffentlicht. Teil 3 ist der
Einkaufsdruck. Zweig `feat/purchase-documents`.

## Nutzerentscheidungen (18.09.2026)

1. Löschen nur, solange der Einkauf nicht abgeschlossen ist. Danach kann man
   Belege nur noch ergänzen.
2. Im Demo-Modus ist das Hochladen deaktiviert und erklärt das; es landet keine
   private Datei unbemerkt nur im Browser.
3. Belege werden im Dialog angezeigt (Bild oder PDF) und lassen sich herunterladen.

## Speicher

Neuer privater Bucket `purchase-documents`: `public = false`, höchstens 20 MiB je
Datei, erlaubte Typen `application/pdf`, `image/jpeg`, `image/png`,
`application/xml`, `text/xml`. Die Bucket-Zeile wird in der Migration idempotent
gesetzt, damit eine abweichende Konfiguration nicht bestehen bleibt.

Pfad: `purchase-documents/<workspace_id>/<purchase_id>/<document_id>.<endung>`.
`public.is_purchase_document_path(path, workspace_id, purchase_id)` prüft diese
Form; die Tabelle erzwingt sie als Check. Originaldateien werden nicht verändert,
nicht komprimiert und nie über eine öffentliche Adresse ausgeliefert. Die Anzeige
lädt die Datei wie bei Produktbildern über den Client.

## Tabelle `purchase_documents`

`id`, `workspace_id`, `purchase_id`, `document_type`, `original_file_name`,
`storage_path` (eindeutig), `mime_type`, `file_size`, `created_at`, `created_by`.
Belegarten: `invoice` (Rechnung/Quittung), `purchase_proof` (Kaufnachweis),
`payment_proof` (Zahlungsnachweis), `other` (Sonstiges).

RLS aktiv, getrennte Regeln je Operation und Rolle `authenticated`:

- `select`: Mitglied des Workspace.
- `insert`: Mitglied, `created_by = (select auth.uid())`, Einkauf gehört zum
  selben Workspace.
- `delete`: Mitglied und Einkauf ist **nicht** abgeschlossen.
- kein `update`: Metadaten sind unveränderlich.

Dieselben Bedingungen gelten für `storage.objects` im neuen Bucket. Ein Upload
verändert weder Kosten noch Positionen, Bestand oder Abschlussstatus.

## Historie

Trigger schreiben `purchase_document_added` und `purchase_document_removed` als
Fachereignis am Einkauf, mit Belegart und Dateiname. Die Trigger laufen als
`security definer`, weil `business_events` für Nutzer gesperrt ist. Es entsteht
keine zweite Historientabelle.

## Oberfläche

Neue Karte „Belege“ auf der Einkaufs-Detailseite: Liste mit Belegart, Dateiname,
Größe und Datum, Knopf „Beleg hinzufügen“ mit Auswahl der Belegart und
Dateiauswahl. Vorschau öffnet einen Dialog mit Bild oder PDF und bietet
Herunterladen an. „Entfernen“ erscheint nur vor dem Abschluss. Bei abgeschlossenen
Einkäufen bleibt das Hinzufügen möglich; ein Hinweis erklärt, dass Belege dann
nicht mehr entfernt werden können. Im Demo-Modus ist das Hinzufügen deaktiviert.

Grenzen werden vor dem Upload geprüft: Typ und 20 MiB. Fehler nennen Dateiname und
Grund. Schlägt das Schreiben der Metadaten fehl, wird die hochgeladene Datei wieder
entfernt; gelingt das nicht, erscheint der verwaiste Pfad in der Fehlermeldung.

## Tests

Datenbank (`supabase/tests/purchase_documents.test.sql`): Pfadform erzwungen;
fremder Workspace kann weder lesen noch schreiben; Löschen vor Abschluss erlaubt,
danach abgelehnt; kein Update möglich; Ereignisse mit Belegart und Dateiname;
Einkaufsdaten bleiben unverändert.

Anwendung: Dienst-Tests für Upload mit Rücknahme, abgelehnte Typen und Größen,
Demo-Sperre und Download; Komponententests für Liste, Vorschau, Löschregel und
Leerzustand. Keine neuen Playwright-Tests.

## Nicht enthalten

Eigenbeleg, Texterkennung, automatische Buchung von Beträgen, Sicherungskonzept
für den Storage-Ordner (bestehendes `deploy/backup.sh` bleibt unverändert).
