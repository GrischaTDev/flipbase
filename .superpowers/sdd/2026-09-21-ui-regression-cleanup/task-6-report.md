# Task 6: Artikelnamen in Einkaufspositionen linksbündig ausrichten

## Umsetzung

- `ButtonComponent` besitzt den Signal-Input `contentAlign` mit den Werten
  `center` und `start`; der Standard bleibt `center`.
- Die bisher fest im gemeinsamen Button hinterlegte Zentrierung ist in eine
  Ausrichtungsregel überführt. `start` setzt `justify-start text-left`, alle
  anderen Buttons erhalten weiterhin `justify-center`.
- Der Artikelnamen-Button im Einkaufspositionseditor ist über
  `data-purchase-line-title` markiert und setzt `contentAlign="start"`.
- Die Angular-Test-Metadaten in beiden Testdateien bilden den neuen Input ab,
  damit die JIT-Testvorlagen den Signal-Input wie die übrigen Button-Inputs
  verarbeiten.

## RED / GREEN / Refactor

- **RED:** Der fokussierte Lauf schlug mit zwei Fehlern fehl: Der neue
  `contentAlign`-Input war noch nicht im Button vorhanden, und der gerenderte
  Artikelnamen-Button blieb dadurch zentriert.
- **GREEN:** Nach Ergänzung des Inputs, der dynamischen Ausrichtung und der
  Template-Bindung bestanden beide fokussierten Testdateien mit 33 Tests.
- **Refactor:** Die Ausrichtungslogik liegt zentral im Shared-Button. Es gibt
  keine lokale Sonderklasse im Einkaufsfeature; bestehende Aufrufer bleiben
  ohne Änderung zentriert.

## Tests und Prüfungen

- `npx vitest run --project=angular src/app/shared/components/button/button.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts` — zuerst 2 Fehler (RED), danach 33 bestanden (GREEN)
- `npx prettier --write src/app/shared/components/button src/app/features/purchases/components/purchase-line-editor` — bestanden
- `npx eslint src/app/shared/components/button/button.component.ts src/app/shared/components/button/button.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts` — bestanden
- `npm run build` — bestanden; der Bau meldet nur die drei bereits bestehenden NG8113-Warnungen zu ungenutztem `LucideDynamicIcon` in Dashboard, Purchases und Sellers.

## Dateien

- `src/app/shared/components/button/button.component.ts`
- `src/app/shared/components/button/button.component.angular.spec.ts`
- `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`
- `docs/AI-CHANGELOG.md`
- `.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-6-report.md`

## Selbstprüfung

- Der Standardwert `center` schützt alle bestehenden Icon-, Dialog- und sonstigen
  Button-Aufrufer vor einer Verhaltensänderung.
- Der Featuretest prüft das tatsächlich gerenderte innere native `<button>` auf
  `justify-start` und `text-left`; der Shared-Test prüft zusätzlich das Fehlen
  von `justify-center` im Start-Modus.
- Keine Datenbank-, Supabase-, Docker- oder migrationsbezogenen Dateien wurden
  verändert. Die Änderung bleibt auf Shared-Button und Einkaufspositionen
  begrenzt.
- Der Arbeitsbaum enthält neben den vier Umsetzung-/Testdateien nur den
  Changelog und diesen Bericht.

## Bedenken

Keine Task-spezifischen Bedenken. Die drei genannten Build-Warnungen bestehen
außerhalb dieses Scopes fort.
