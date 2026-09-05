# Purchase Entry Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue Einkäufe auf einer übersichtlichen eigenen Seite mit direkter Artikelerfassung und rechter Kostenübersicht erfassen.

**Architecture:** Bestehende Formular- und Speicherlogik aus PurchaseCreateModalComponent in eine wiederverwendbare PurchaseEntryFormComponent verschieben. Der bisherige Bearbeitungsdialog bleibt ein dünner Wrapper. Eine eigene lazy Route nutzt dasselbe Formular ohne Dialograhmen; keine zweite Buchungsimplementierung.

**Tech Stack:** Angular 22, vorhandene Tailwind- und Shared-Komponenten, bestehende PurchaseService/PurchaseCostingService-Verträge.

**Spec:** docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md, freigegebenes Paket 2; zuletzt ausdrücklich zur Umsetzung bestätigt.

## Global Constraints

- Keine Datenbank-, Migrations-, Abhängigkeits- oder Rechteänderung. Keine Produktionsdaten verändern oder veröffentlichen.
- Normale Einkäufe: Mengen und echte Stückpreise. Mystery Box: Gesamtpreis, Inhalt später, kein erfundener Stückpreis; vorhandene Aufteilung unverändert.
- Bestehende Teilfehler-/Wiederholungsbehandlung sowie endgültige Buchung über die vorhandenen Services erhalten.
- Lieferant und Quelle optional, direkt neu anlegbar. Keine zusätzlichen Pflichtfelder für Adresse, Zahlungsziele oder Lagerstandorte.
- Deutsche verständliche Oberfläche, englische neue Codebezeichner, gelbe gemeinsame Akzente, Dark/Shop/Landing nicht umgestalten.
- Neu erstellen ist dieses Paket; bestehende Detail-/Bearbeitungsfunktionen bleiben erhalten. Chronik, Archivierung, EAN/CSV sind spätere Pakete.

## Task 1: Gemeinsames Formular und eigene Einkaufsseite

**Files:** Create `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.ts`, `.html`, `.angular.spec.ts`; create `src/app/features/purchases/pages/purchase-create/purchase-create.component.ts`, `.html`, `.angular.spec.ts`; create `src/app/features/purchases/guards/purchase-entry.guard.ts` and `.spec.ts` if the route guard is extracted; modify existing `components/purchase-create-modal/*`, `components/purchase-line-editor/*`, `purchases.component.ts`, `purchases.component.html`, `purchases.component.angular.spec.ts`, `src/app/app.routes.ts`; create `e2e/purchase-entry.spec.ts`; adapt affected existing E2E assertions only when they reference the replaced creation modal.

**Interfaces:**

```ts
// Common form retains purchase input, closed/created outputs and onSubmit/onFinalize.
readonly purchase = input<Purchase | null>(null);
readonly presentation = input<'dialog' | 'page'>('dialog');
readonly closed = output<void>();
readonly created = output<void>();
// Used by page guard; successful persisted completion permits navigation.
hasUnsavedChanges(): boolean;
// New route appears BEFORE purchases/:id:
{ path: 'purchases/new', loadComponent: () => import('./features/purchases/pages/purchase-create/purchase-create.component').then(m => m.PurchaseCreateComponent) }
```

- [x] Add failing route/browser tests before implementing:

```ts
await startDemoMode(page);
await page.goto('/purchases');
await page.getByRole('button', { name: 'Neuer Einkauf', exact: true }).click();
await expect(page).toHaveURL(/\/purchases\/new$/);
await expect(page.getByRole('heading', { name: 'Einkauf erfassen', exact: true })).toBeVisible();
await expect(page.getByRole('dialog')).toHaveCount(0);
await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toBeVisible();
```

- [x] Extract the existing single persistence implementation intact into the common form. Move existing action tests to the new owner; keep a wrapper test proving purchase input/events and modal accessibility wiring. Preserve partial-save retry IDs and cost targets, centralized error handling, submitting guard and finalized editing behavior. No fake forwarding of every private method just to retain old tests.
- [x] Page form layout: heading and back action, supplier/source and purchase type/title/date in compact labelled cards; inline article section and additional-cost editor in main column; summary right on large screens and stacked on small ones. Use semantic labelled sections and existing components. No page max-height or body scroll lock. Keep normal purchase price derived from line sums and Mystery Box total editable. Reuse one form DOM (no duplicate controls/IDs) across page/dialog presentations.
- [x] Keep direct item choices in the page: existing catalogue product, new repeatable product, individual item. Simplify visible labels to `Artikel`, `Vorhandenen Artikel wählen`, `Neuen Artikel anlegen`, `Einzelstück hinzufügen`; explain quantities default to one. Preserve quantity/product identity constraints. Change confusing `Positionssumme` to `Gesamt` and `EK je Stück` to `Stückpreis` where present in the touched editor. Mystery mode must not require prices; estimated market value remains optional.
- [x] Remove nested HTML forms from the line editor's quick-create UI if present; a quick-create action must not submit the purchase. Verify repeated clicks cannot create duplicate catalogue products; surface thrown/returned failures and clear pending state. Avoid changing catalogue service contracts.
- [x] Route creation buttons from list/empty state to `/purchases/new`. Page closes/success returns to `/purchases`; do not alter unrelated rapid flea-market modal. Existing purchase editing remains dialog-based via thin wrapper. Query the page's shared form via `viewChild` for navigation state, not duplicated state.
- [x] Warn before abandoning changed, unsaved purchase input through back link, route change, or browser close. Use route canDeactivate plus beforeunload through Angular host; do not install global unremoved listeners. Block leaving while submission is running; allow successful completion to return normally. Include reactive-form edits, added/removed/changed line drafts and costs; initial emissions must not prompt on pristine page. Successful quick catalogue creation must not silently discard the not-yet-saved purchase.
- [x] Regression tests: normal 2 pieces at10 +5shipping ->25 total; mystery100 +10shipping with no contents can save as draft, no completion without contents; direct item create/select flows; invalid/failed/partial/finalize-retry retains existing protections; cancelled leave preserves edits, confirmed leave navigates, pristine leave no prompt; quick catalogue creation no accidental purchase save.
- [x] Run focused Angular tests and new/existing impacted Playwright tests, ESLint/Prettier on changed files, `npm run build`. Report actual RED/GREEN. Commit `feat(purchases): add dedicated purchase entry page` without AI signature; leave shared changelog to controller.

## Task 2: Abnahme

- [x] Main validates local `/purchases` -> create -> add/choose article -> edit quantity/price/cost -> save -> purchase list, plus mystery draft and cancellation; read browser screenshots in light/dark at390/1440/2560, axe, no page errors or document overflow.
- [x] Independent task review and final whole-branch review. Fix findings with original implementer. Final full application tests and build, not repeated after each small edit.
- [x] Document verified behavior and limits in AI changelog. Local completion only. Existing user accounts, production data, other worktrees untouched.

## Self-review

One shared form owns persistence; page and modal only host it. Tests follow moved ownership. No contract change to bookkeeping. Pristine vs dirty and partial persistence explicitly distinguished. Single implementation task is one cohesive page/form/navigation deliverable, QA is independent validation rather than another implementation agent. Wider edit-page conversion deferred explicitly to avoid altering finalized purchase correction contracts.
