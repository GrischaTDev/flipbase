# Task 5 – Verkäufe, Retouren und Rechnungen

## Umsetzung

- Verkaufsabschluss und -bearbeitung melden Erfolg erst nach bestätigtem Service-Ergebnis.
- Fehler im Verkaufsformular bleiben feldnah sichtbar; lokale Fehler erhalten zusätzlich einen persistenten Toast. Bereits zentral gemeldete Fehler werden über `SyncStatusService.istZentralGemeldet()` nicht doppelt gemeldet.
- Retouren und das Löschen eines Verkaufs liefern klar unterscheidbare `success`-, `partial`- und `error`-Ergebnisse. Teilfehler erhalten eine Warnung statt einer grünen Vollzugsmeldung.
- Der E-Mail-Versand meldet Erfolg und Fehler per Toast. Ein lokaler Versandstatus wird erst nach bestätigtem Erfolg gesetzt.
- Verkaufs-, Retouren- und E-Mail-Persistenz erfolgt außerhalb des Demo-Modus zuerst in der Datenbank. Nulltreffer werden als Fehler behandelt.
- Bestätigte Teilabschlüsse übernehmen den Elternsatz sofort lokal, schließen den Create-Dialog und melden präzise per 6-Sekunden-Warnung statt als Vollerfolg. Dadurch erzeugt ein zweites Absenden keinen weiteren Verkauf oder keine weitere Gutschrift.
- Fehlende Artikelstatus- und Retourenvermerk-Nachschritte werden als persistente, idempotente Follow-ups gespeichert und beim nächsten Laden der Verkäufe nachgeholt.
- Die Löschung friert ihren Workspace vor dem Datenbankzugriff ein und verwendet ihn sowohl für die Löschabfrage als auch für den Nachholauftrag. Beschädigte Follow-up-Speicherstände werden zur Laufzeit validiert, zentral sichtbar gemeldet und bereinigt; valide Einträge bleiben erhalten.

## Tests und Prüfungen

- Gezielte Specs: 25 Tests grün (fünf Task-5-Specs).
- Vollsuite: 75 Dateien, 535 Tests grün.
- Typecheck: grün.
- Prettier: grün.
- ESLint: keine Fehler; 48 bestehende `any`-Warnungen außerhalb dieses Task-Scope.
- Produktions-Build: grün; bestehende CommonJS-Hinweise für `jszip` und `jsbarcode`.

## Hinweise

Die drei ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden absichtlich nicht verändert oder gestaged.
