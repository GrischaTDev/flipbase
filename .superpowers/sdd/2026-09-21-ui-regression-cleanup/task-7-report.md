# Task 7: Kosteneditor auf Zusatzausgabe und Betrag reduzieren

## Umsetzung

- Der Kosteneditor stellt nur noch Zusatzausgabe, Betrag und die zugängliche
  Entfernen-Aktion dar. Die Hinzufügen-Aktion heißt ebenfalls
  „Zusatzausgabe hinzufügen“.
- Steuerherkunft, Verteilung und Zielposition sind aus der Oberfläche entfernt.
  Ihre bestehenden FormControls, die Zielpositionsprüfung, die Mystery-
  Normalisierung und die Serialisierung bleiben unverändert, damit bestehende
  technische Werte beim Ändern des Betrags erhalten bleiben.
- Neue normale Kosten starten weiterhin mit `taxTreatment: null` und
  `allocationMethod: 'by_value'`; Mystery-Pakete verwenden
  `allocationMethod: 'by_quantity'`.
- Die Entfernen-Aktion verwendet nun direkt das Lucide-Papierkorb-SVG. Der
  Übersichtsdialog heißt „Zusatzausgaben verwalten“ und behält seinen lokalen
  Speichern- und Abbrechen-Vertrag.

## RED / GREEN / Refactor

- **RED:** Die angepassten Editor- und Dialogtests schlugen zuerst mit drei
  erwarteten Fehlern fehl: „Zusatzausgabe“ und die neue Hinzufügen-Aktion fehlten,
  außerdem trug der Dialog noch den alten Titel. Die sichtbaren technischen
  Bereiche waren damit noch vorhanden.
- **GREEN:** Nach Reduktion der Vorlage, Umbenennung der sichtbaren Texte und
  Anpassung des Dialogtitels bestanden beide Testdateien mit 10 Tests.
- **Refactor:** Ausschließlich unbenutzte UI-Zustände und Optionen wurden entfernt.
  Die technischen Formwerte und deren bestehende Serialisierung bleiben bewusst
  bestehen.

## Tests und Prüfungen

- `npx vitest run --project=angular src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts` — zuerst 3 erwartete Fehler (RED), danach 10 bestanden (GREEN)
- `npx vitest run --project=node src/app/features/purchases/components/purchase-cost-editor/purchase-cost-adjustments.spec.ts` — 8 bestanden
- `npx vitest run --project=angular src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.angular.spec.ts` — 18 bestanden
- `npx prettier --write src/app/features/purchases/components/purchase-cost-editor src/app/features/purchases/components/purchase-cost-overview-dialog` — bestanden
- `npx eslint src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.ts src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts` — bestanden
- `npm run typecheck` — nicht bestanden wegen zehn bereits vorhandener,
  fachfremder Testtypfehler in `purchase-documents-card`, `purchase-entry-form`,
  `purchase-source-dialog` und `purchase-seller-dialog`; keine Task-Datei ist
  betroffen.
- `npm run build` — bestanden; drei bereits vorhandene NG8113-Warnungen zu
  ungenutztem `LucideDynamicIcon` in Dashboard, Purchases und Sellers.

## Dateien

- `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.ts`
- `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.html`
- `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts`
- `src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.html`
- `src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts`
- `docs/AI-CHANGELOG.md`
- `.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-7-report.md`

## Selbstprüfung

- Der gerenderte Vertrag belegt, dass keine Steuerherkunft, Verteilungsaktion
  oder Zielposition sichtbar ist.
- Der Wertvertrag belegt, dass eine vorhandene direkte Zuordnung einschließlich
  Steuerherkunft bei einer sichtbaren Betragsänderung unverändert serialisiert
  wird.
- Die Standardwerte neuer normaler und Mystery-Zeilen sind separat abgedeckt;
  Rabatt bleibt über den bestehenden Vertrag getrennt von Zusatzkosten.
- Keine Datenbank-, Supabase-, Docker-, Snapshot- oder Migrationsdatei wurde
  verändert.

## Bedenken

Die globale Typprüfung bleibt wegen der oben genannten fachfremden Fehler offen.
Die lokale Änderung selbst ist durch die fokussierten Tests, Lint und einen
erfolgreichen Produktionsbau abgesichert.
