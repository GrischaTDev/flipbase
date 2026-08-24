# Task 4 – Abschlussbericht

## Status

Task 4 ist in Commit `448aab6` (`feat: Inventaraktionen einheitlich bestätigen`) umgesetzt.
Der Commit umfasst ausschließlich Inventar-, Artikel- und Medienaktionen sowie ihre gezielten
Persistenz- und Verhaltenstests. Die drei fremden ungetrackten Dokumente unter
`docs/superpowers/` blieben unverändert und uncommitted.

## Umsetzung

- Inventarliste meldet Statuswechsel sowie Shop-Veröffentlichung und -Entfernung.
- Artikeldetail meldet Uploads mit korrektem Singular/Plural, Hauptbildwechsel, Bildlöschung,
  Status, Artikelkosten, Shop-Freigabe und Artikellöschung.
- Erstellen und Bearbeiten von Artikeln verwenden den `title`-/`description`-Vertrag. Ein
  Bildfehler nach erfolgreicher Artikelpersistenz ist eine sechssekündige Warnung mit dem Titel
  „Artikel wurde angelegt.“ beziehungsweise „Artikel wurde aktualisiert.“ und der Beschreibung
  „Das Bild konnte nicht hochgeladen werden.“
- Lokale und fachliche Fehler ohne SyncStatus werden als persistente Fehler-Toasts mit Ursache
  angezeigt. Bereits zentral gemeldete SyncStatus-Fehler erzeugen keinen zweiten Feature-Toast.
- Dialogschluss, Navigation und lokale UI-Zustände erfolgen erst nach bestätigtem Erfolg. Bei
  Fehlern bleiben Shop-Zustand, Medienliste, Kostenformular und Artikelseite erhalten.
- `InventoryService` übernimmt Artikel-, Status-, Kosten- und Löschänderungen erst nach
  erfolgreicher Datenbankoperation. `MediaService` prüft Upload-, Speicher-, Lösch- und
  Hauptbildoperationen und meldet technische Fehler über SyncStatus.

## TDD-Nachweis

### Red

Der erste fokussierte Lauf umfasste fünf Testdateien und 30 Tests. 20 Tests schlugen aus den
erwarteten Gründen fehl: fehlende Inventar-/Medientoasts, alte `toast.message`-Assertions,
ungeprüfte Media-Ergebnisse, vorzeitige lokale Mutationen und doppelte SyncStatus-Meldungen.

Eine zusätzliche Regression für einen zentral gemeldeten Bildfehler im Artikeldialog war vor der
Korrektur ebenfalls rot, weil zusätzlich eine Warnung erzeugt wurde.

### Green

- Fokussierter Task-4-Lauf nach dem Commit: 5/5 Dateien, 33/33 Tests, Exitcode 0.
- Erweiterter Artikeldialog-Lauf: 1/1 Datei, 7/7 Tests, Exitcode 0.
- Vollsuite: 71/71 Dateien, 494/494 Tests, Exitcode 0.

## Verifikation

- `npm run typecheck`: Exitcode 0.
- `npm run lint`: Exitcode 0; 48 vorbestehende `no-explicit-any`-Warnungen, keine Fehler.
- `npm run format:check`: Exitcode 0.
- `npm run build`: Exitcode 0; nur die vorbestehenden CommonJS-Warnungen für `jszip` und
  `jsbarcode`.

## Fix-Runde 4

### Korrekturen

- Geworfene Fehler aus `createItem()` und `uploadItemMedia()` werden innerhalb der jeweiligen
  Batch-Handler abgefangen. Die Handler lösen danach regulär auf, zeigen einen persistenten
  Feature-Fehler mit Ursache und erzeugen weder Erfolgs- noch Teil-Erfolgs-Warnungen.
- Die äußeren `finally`-Blöcke beenden weiterhin den Sync-Aktionskontext und setzen zusätzlich
  `isSubmitting` beziehungsweise `isUploading` garantiert auf `false`; der Upload-Dateieingang
  wird auch auf dem Throw-Pfad geleert.
- `InventoryComponent` verwendet für zentrale Fehler ausschließlich
  `SyncStatusService.istZentralGemeldet()`. Ein nur gleichlautender lokaler `Error` bleibt damit
  sichtbar, während ein echter typisierter Sync-Fehler keinen zweiten Feature-Toast erzeugt.

### TDD-Nachweis

- Red: Die bisherigen Throw-Tests wurden in UI-Lifecycle-Regressionen überführt und schlugen
  fehl, weil beide Handler ablehnten. Ein lokaler Fehler mit demselben Text wie ein offener
  Sync-Fehler wurde fälschlich unterdrückt.
- Green: Tests sichern nun das reguläre Auflösen, Ladezustands-Reset, Upload-Feld-Cleanup und den
  persistenten Feature-Toast ab sowie die Unterscheidung lokaler und zentraler Provenienz.

### Verifikation

- Fokussierter Task-4-Lauf einschließlich SyncStatus: 6/6 Testdateien, 70/70 Tests, Exitcode 0.
- Vollsuite: 71/71 Testdateien, 513/513 Tests, Exitcode 0.
- `npm run typecheck`: Exitcode 0.
- `npm run lint`: Exitcode 0; 48 vorbestehende Warnungen, keine Fehler.
- `npm run format:check`: Exitcode 0.
- `npm run build`: Exitcode 0; nur die vorbestehenden CommonJS-Warnungen für `jszip` und
  `jsbarcode`.

## Fix-Runde 3

### Status und Korrekturen

Die zwei verbleibenden Findings zur Batch-Deduplizierung sind behoben.

- `SyncStatusService` verwaltet für jede aktive, typisierte Batch-Aktion ein vom sichtbaren
  Fehlerstatus unabhängiges Seen-Set. Das Schließen oder Verwerfen eines persistenten
  Sync-Toasts löscht dieses Gedächtnis nicht mehr. `beendeFehlerAktion()` gibt es erst nach dem
  Abschluss der Aktion frei; eine spätere neue Aktion kann dieselbe Ursache wieder sichtbar
  melden.
- Die Batch-Schleifen für Mehrfachanlegen und Mehrfachupload schließen ihren Aktionskontext in
  `finally` – auch wenn der aufgerufene Service wirft oder ein Ablauf vorzeitig endet.
- Der Deduplizierungsschlüssel besteht stabil aus Vorgang, technischem Code und fachlich
  normalisierter Ursache. Gleiche Ursachen werden zusammengefasst; unterschiedliche Ursachen mit
  identischem unbekannten Fehlercode bleiben getrennt sichtbar. Komponenten vergleichen hierfür
  weiterhin keine UI-Texte, sondern nutzen die typisierte Fehlerprovenienz.

### TDD-Nachweis

- Red: Ein nach `verwerfen()` erneut gemeldeter identischer Fehler derselben Aktion erschien
  erneut statt unterdrückt zu bleiben. Zwei fachlich verschiedene Meldungen mit Code `23514`
  wurden fälschlich zu einem Eintrag zusammengefasst.
- Green: Direkte SyncStatus-Tests decken Seen-Lebenszyklus, neue Aktion und unterschiedliche
  Ursachen ab. Create- und Upload-Batchtests prüfen zusätzlich das Lifecycle-Cleanup auf einem
  geworfenen Service-Fehlerpfad.

### Verifikation

- Fokussierter Task-4-Lauf einschließlich SyncStatus: 6/6 Testdateien, 69/69 Tests, Exitcode 0.
- Vollsuite: 71/71 Testdateien, 512/512 Tests, Exitcode 0.
- `npm run typecheck`: Exitcode 0.
- `npm run lint`: Exitcode 0; 48 vorbestehende Warnungen, keine Fehler.
- `npm run format:check`: Exitcode 0.
- `npm run build`: Exitcode 0; nur die vorbestehenden CommonJS-Warnungen für `jszip` und
  `jsbarcode`.
- `git diff --cached --check`: ohne Befund vor dem Commit.
- Commit-Selbstprüfung: zehn Task-4-Dateien, keine fremden Dokumente oder Änderungen.

## Restrisiken

- Hauptbildwechsel und Medienlöschung bestehen aus mehreren Supabase-Operationen und sind nicht
  transaktional. Fehler werden korrekt sichtbar und lokale Zustände nicht vorzeitig geändert;
  ein bereits ausgeführter Storage-/Datenbank-Teilschritt kann technisch dennoch nicht atomar
  zurückgerollt werden.
- Die 48 Lint-Warnungen und beiden CommonJS-Buildhinweise bestanden bereits vor Task 4 und liegen
  außerhalb dieses Scopes.

## Review-Runde 1

### Status und Commit

Alle fünf Important-Findings aus `task-4-review.md` sind in Commit `1395557`
(`fix: Inventarpersistenz und Teilerfolge absichern`) behoben. Der Fix-Commit enthält genau acht
Inventory-/Media-Service-, Komponenten- und Testdateien.

### Korrekturen

- `createItem()` veröffentlicht im Backendmodus keinen vorläufigen Artikel mehr. Store und Signal
  werden erst nach bestätigtem Insert mit der echten Datenbankzeile ergänzt; ein Test hält das
  Insert-Promise offen und prüft den Zwischenzustand.
- Artikelupdate, Statusupdate, Kostenlöschung, Artikellöschung, Medienlöschung und
  Hauptbildwechsel fordern einen exakten Supabase-Count an. `count === 0` wird als zentral
  gemeldeter Nichtgefunden-Fehler behandelt; lokale Zustände bleiben unverändert.
- Mehrfachanlegen besitzt einen expliziten `success`-/`partial`-/`failed`-Ausgang mit exakten
  Anzahlen. Bei Teilerfolg wird kein Bild hochgeladen, der Dialog schließt gegen Duplikat-Resubmit
  und eine lokale Ursache erhält eine sechssekündige Warnung mit gespeicherter und
  fehlgeschlagener Anzahl.
- Mehrfachuploads zählen Erfolg und Fehler. Bei zuvor leerer Medienliste bleibt der
  Hauptbildbedarf nach einem Fehler bestehen, sodass der erste tatsächliche Upload-Erfolg primär
  wird. Teilerfolge erhalten eine sechssekündige Warnung mit exakten Anzahlen.
- Ein Fehler beim Zurücksetzen des bisherigen Hauptbilds bricht einen primären Upload vor dem
  Datenbank-Insert ab.
- Bereits durch SyncStatus gemeldete Create-/Upload-Teilfehler erzeugen keinen zweiten
  Feature-Warn-Toast.

### TDD-Nachweis

- Service-RED: 6 erwartete Fehler für offenen Create-Zwischenzustand, Nulltreffer und
  Hauptbild-Reset.
- UI-RED: 2 erwartete Fehler für partielles Mehrfachanlegen und partiellen Mehrfachupload.
- Deduplizierungs-RED: 2 erwartete zusätzliche Warn-Toasts bei zentral gemeldeten Teilfehlern.
- Finaler fokussierter Lauf vor der Vollsuite: 5/5 Dateien, 41/41 Tests, Exitcode 0; nach den zwei
  Deduplizierungsregressionen bestanden die beiden UI-Dateien 23/23 Tests.

### Verifikation

- Vollsuite: 71/71 Testdateien, 504/504 Tests, Exitcode 0.
- `npm run typecheck`: Exitcode 0.
- `npm run lint`: Exitcode 0; 48 vorbestehende Warnungen, keine Fehler.
- `npm run format:check`: Exitcode 0.
- `npm run build`: Exitcode 0; nur die vorbestehenden CommonJS-Warnungen für `jszip` und
  `jsbarcode`.
- `git diff --cached --check`: ohne Befund vor dem Fix-Commit.

### Verbleibendes technisches Risiko

Supabase-Storage und Datenbankänderungen sind weiterhin nicht transaktional. Ein bereits
erfolgreicher Datei-Upload kann bei einem nachfolgenden Reset- oder Insertfehler als verwaiste
Storage-Datei zurückbleiben. Die Anwendung meldet in diesem Fall keinen Erfolg und übernimmt
keinen falschen lokalen Zustand; automatische Storage-Kompensation liegt außerhalb von Task 4.

## Fix-Runde 2

### Status und Commit

Der verbleibende Review-Befund zur Batch-Deduplizierung ist behoben. Der separate Fix-Commit
fasst zentrale Fehler einer einzelnen Mehrfachanlage beziehungsweise eines Mehrfachuploads nach
Aktion, Vorgang und fachlich normalisierter Ursache zusammen.

### Korrekturen

- `SyncStatusService` kennzeichnet zentral zurückgegebene Fehler typisiert und erhält einen
  eindeutigen Kontext pro Nutzer-Batch. Die Komponenten erkennen zentrale Fehler damit über ihre
  Provenienz statt über zusammengesetzte Fehlermeldungstexte.
- `InventoryService.createItem()` und `MediaService.uploadItemMedia()` übernehmen den optionalen
  Aktionskontext. Gleichartige zentrale Fehler derselben Batch-Aktion erzeugen nur noch einen
  offenen Sync-Fehler und damit höchstens einen persistenten Sync-Toast; unterschiedliche
  Ursachen oder Vorgänge bleiben eigenständig sichtbar.
- Gemischte Mehrfachanlagen und Mehrfachuploads zählen ausschließlich lokale Fehler in ihrer
  sechssekündigen Batch-Warnung. Zentral bereits repräsentierte Teilfehler werden weder als
  zweiter Feature-Toast noch in deren Fehlerzahl erneut ausgewiesen.

### TDD-Nachweis

- Red: Vier neue Tests schlugen erwartungsgemäß fehl. Gleiche zentrale Create-/Upload-Fehler
  wurden dreimal beziehungsweise zweimal als Sync-Fehler gespeichert, statt einmal; gemischte
  Batches zählten die zentralen Fehler zusätzlich in der lokalen Warnung.
- Green: Die beiden fokussierten Komponenten-Testdateien bestehen mit 27/27 Tests. Der
  Task-4-Fokuslauf besteht mit 47/47 Tests.

### Verifikation

- Vollsuite: 71/71 Testdateien, 508/508 Tests, Exitcode 0.
- `npm run typecheck`: Exitcode 0.
- `npm run lint`: Exitcode 0; 48 vorbestehende Warnungen, keine Fehler.
- `npm run format:check`: Exitcode 0.
- `npm run build`: Exitcode 0; nur die vorbestehenden CommonJS-Warnungen für `jszip` und
  `jsbarcode`.
