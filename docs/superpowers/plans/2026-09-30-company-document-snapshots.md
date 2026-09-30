# Unternehmensdaten in Dokumenten – PR 3

Grundlage: `../specs/2026-09-30-account-company-settings-design.md`, Abschnitte zu Dokumenten und PR 3.

## Verbindliches Verhalten

Neue Rechnungen erhalten einen gespeicherten Absender aus den Unternehmensdaten. Unvollständige Daten verhindern die Erstellung. Vorhandene Rechnungen bleiben lesbar und werden nie aus heutigen Stammdaten ergänzt. Gutschriften übernehmen den ursprünglichen Rechnungsabsender; neue Retouren ohne Rechnung speichern die aktuellen Unternehmensdaten, sofern vollständig. Eine Erstattung bleibt auch ohne ausstellbaren Beleg möglich. Eigenbelege speichern dieselben Daten im PDF und in den Metadaten. Alte PDFs bleiben unverändert. Logos verwenden ausschließlich den gespeicherten Dateipfad.

## Aufgaben und Prüfungen

1. Gemeinsames Dokumentmodell, strukturierter Fehler und Unternehmensabbildung; fehlende Daten, optionale Werte und Workspace-Wechsel gezielt testen.
2. Datenbankseitige Erzeugung und Schutz der Snapshots; Rechnungswiederholung, Originalrechnung einer Gutschrift, Eigenbeleg-Abgleich und Mitgliedschaft mit Datenbanktests prüfen. Schema deklarativ bearbeiten, Migration erzeugen und Typen generieren.
3. Rechnungen und Gutschriften integrieren; keine Demo-Absender, historische Werte unverändert, fehlende Daten verständlich anzeigen. Betroffene Diensttests ausführen.
4. Eigenbeleg-PDF und Metadaten integrieren; bestehende Belege überspringen, Kontextwechsel und Speicherfehler prüfen.
5. Historisches Logo im Rechnungsdialog darstellen; fehlendes Logo auslassen und Hinweis anzeigen. Dialogtests, Formatierung, Lint, Typprüfung und Bau prüfen.
6. Gesamten Zweig mit frischem Review prüfen, Befunde beheben, Änderungsprotokoll aktualisieren und erst dann PR-/Merge-Freigabe anfragen.

## Fortschritt

- Basis: `ea81bdf6`, Arbeitskopie `.worktrees/company-document-snapshots`.
- Schnittstellen: `InvoiceParty` wird gemeinsam von Rechnung, Gutschrift und Eigenbeleg verwendet; gespeicherte JSON-Werte enthalten keine temporären URLs.
- Entscheidung: Unvollständige Unternehmensdaten blockieren neue Rechnungen/Eigenbelege, nicht die finanzielle Retourenbuchung. Eine Gutschrift ohne historischen Snapshot bleibt ausdrücklich nicht ausstellbar.
- Lokale Datenbank: Docker-Start zunächst fehlgeschlagen, später erreichbar. Eigene Prüfdatenbank `flipbase-company-documents` auf Port 63352; nur diese neu angelegte Datenbank wurde zum Migrationstest zurückgesetzt.
- Entscheidung: Der erste Schemaabgleich enthielt ältere sachfremde Unterschiede. Die Migration wurde erneut aus bestehender Migrationsbasis und neuem deklarativem Schema erzeugt. Fehlende Rechteentzüge und Kommentare werden aus dem Schema automatisiert übernommen, weil migra sie nicht ausgibt.
- Aufgaben 1–5 umgesetzt. Belegt durch 46 Node-, 38 DOM-, 21 Angular-Tests, 2.293 Datenbankprüfungen, einen echten Browserfall mit automatischer WCAG-AA-Prüfung sowie Typprüfung, Lint und Produktionsbau.
- Aufgabe 6 abgeschlossen: Unabhängiges Review fand zwei Fehler beim Steuerverfahren. Beide wurden zuerst mit fehlschlagenden Tests nachgestellt und korrigiert. Retouren ohne Rechnung verwenden historische Verkaufssteuern; Shoprechnungen berücksichtigen frisch gespeicherte Unternehmenssteuern ohne Seitenneuladen und werden serverseitig abgesichert.
- Die Browserprüfung erfolgt nach Ende der Dialoganimation. Schwache Textkontraste und die fehlende Tastaturbedienung des scrollbaren Belegs wurden korrigiert. Die vorübergehende lokale Testkonfiguration wurde zurückgesetzt.
- PR-Erstellung und Merge bleiben bis zur ausdrücklichen Freigabe offen. Danach folgt PR 4 für Shop-, Bank-, Impressums- und Versanddaten.
