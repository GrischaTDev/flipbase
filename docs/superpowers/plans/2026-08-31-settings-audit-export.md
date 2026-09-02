# Settings, Audit Log, and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the growing settings page into clear sections and make the immutable business history searchable, understandable, and exportable without putting compliance controls into everyday workflows.

**Architecture:** `/settings` becomes a lazy child-route shell with desktop navigation and a mobile shared select. Existing settings behavior moves into focused page components without duplicating services or persistence. `BusinessEventService` calls role-checked workspace and entity-history RPCs; one shared record-history panel handles local context; an audit page provides filters, print/PDF view, and machine-readable ZIP/CSV export.

**Tech Stack:** Angular 22 standalone components, Angular Router, Signals, Reactive Forms, Tailwind CSS, Supabase, JSZip 3.10.1, Vitest 4, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md`

## Global Constraints

- Complete `2026-08-31-purchase-costing-foundation.md` before this plan.
- Keep all user-facing copy German; commit messages, branch names, PR titles, and workflow titles must be English.
- Do not create a branch containing `codex`.
- Preserve all current settings capabilities while moving them; do not silently drop payment, shipping, webhook, app, team, workspace, profile, or export behavior.
- Use child routes and standalone components; do not recreate a second monolithic settings component.
- Use `CustomSelectComponent` for mobile section navigation and all styled selects.
- Query events through a feature service, never from a component.
- Audit exports must contain stable identifiers, timestamps, actor, event type, entity relation, before/after payloads, and export metadata.
- Do not claim that a browser-generated PDF alone is a complete machine-readable archive.
- Do not advertise the feature as automatic legal compliance; describe it as support for documentation and retention duties.

---

## File Structure

| File                                                  | Responsibility                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/app/features/settings/settings.routes.ts`        | Lazy child routes and default redirect                                    |
| `src/app/features/settings/settings-shell/*`          | Desktop sidebar, mobile selector, router outlet                           |
| `src/app/features/settings/pages/*`                   | Focused account/workspace/team/notification/store/shipping/app/data pages |
| `src/app/core/models/business-event.models.ts`        | Event filters, rows, export manifest contracts                            |
| `src/app/core/services/business-event.service.ts`     | Typed paged event and entity-history queries                              |
| `src/app/core/services/audit-export.service.ts`       | CSV/JSON/ZIP and printable report preparation                             |
| `src/app/shared/components/record-history/*`          | Reusable local history timeline                                           |
| `src/app/features/settings/pages/data-and-audit/*`    | Global audit filters, archive/export, retention help                      |
| `src/app/features/settings/pages/audit-print/*`       | Readable print/PDF document                                               |
| `docs/compliance/flipbase-verfahrensdokumentation.md` | Maintainer documentation for data flow and controls                       |

### Task 1: Define and test the settings route map

**Files:**

- Create: `src/app/features/settings/settings.routes.ts`
- Create: `src/app/features/settings/settings.routes.spec.ts`
- Modify: `src/app/app.routes.ts`

**Route contract:**

```text
/settings/account
/settings/workspace
/settings/team
/settings/notifications
/settings/store
/settings/shipping
/settings/app
/settings/data
/settings/data/print
```

- [ ] **Step 1: Write the failing route test**

Assert `/settings` redirects to `/settings/account`, every section is lazy-loaded below one shell, unknown settings children redirect safely, and `data/print` remains inside the authenticated settings route tree.

- [ ] **Step 2: Run the route test and verify failure**

Run: `npx vitest run src/app/features/settings/settings.routes.spec.ts`
Expected: FAIL because settings is currently one component route.

- [ ] **Step 3: Implement the lazy route tree**

Change the top-level settings route to `loadChildren`. Use explicit `loadComponent` entries and one child redirect. Do not move auth responsibility out of the authenticated shell.

- [ ] **Step 4: Run the route test and typecheck**

Run: `npx vitest run src/app/features/settings/settings.routes.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.routes.ts src/app/features/settings/settings.routes.ts src/app/features/settings/settings.routes.spec.ts
git commit -m "Add structured settings routes"
```

### Task 2: Build the responsive settings shell

**Files:**

- Create: `src/app/features/settings/settings-shell/settings-shell.component.ts`
- Create: `src/app/features/settings/settings-shell/settings-shell.component.html`
- Create: `src/app/features/settings/settings-shell/settings-shell.component.spec.ts`
- Modify: `src/app/features/settings/settings.routes.ts`

**Interfaces:**

```ts
export interface SettingsNavigationItem {
  readonly path: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIconData;
}
```

- [ ] **Step 1: Write failing shell tests**

Assert the desktop sidebar links have active state and keyboard focus, the mobile view uses `CustomSelectComponent`, selecting a section navigates, the current child title is exposed to assistive technology, and a `RouterOutlet` renders the page.

- [ ] **Step 2: Run the shell test and verify failure**

Run: `npx vitest run src/app/features/settings/settings-shell/settings-shell.component.spec.ts`
Expected: FAIL because the shell does not exist.

- [ ] **Step 3: Implement one navigation source**

Derive sidebar links and mobile options from the same readonly array. Labels: `Konto`, `Workspace`, `Team & Rollen`, `Benachrichtigungen`, `Shop & Zahlungen`, `Versand`, `App & Geräte`, and `Daten & Protokolle`. Use `aria-current="page"` and do not nest interactive controls.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/app/features/settings/settings-shell/settings-shell.component.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/settings/settings-shell src/app/features/settings/settings.routes.ts
git commit -m "Add responsive settings navigation shell"
```

### Task 3: Split the monolithic settings component without losing behavior

**Files:**

- Create: `src/app/features/settings/pages/account-settings/account-settings.component.ts`
- Create: `src/app/features/settings/pages/account-settings/account-settings.component.html`
- Create: `src/app/features/settings/pages/workspace-settings/workspace-settings.component.ts`
- Create: `src/app/features/settings/pages/workspace-settings/workspace-settings.component.html`
- Create: `src/app/features/settings/pages/team-settings/team-settings.component.ts`
- Create: `src/app/features/settings/pages/team-settings/team-settings.component.html`
- Create: `src/app/features/settings/pages/notification-settings/notification-settings.component.ts`
- Create: `src/app/features/settings/pages/notification-settings/notification-settings.component.html`
- Create: `src/app/features/settings/pages/store-settings/store-settings.component.ts`
- Create: `src/app/features/settings/pages/store-settings/store-settings.component.html`
- Create: `src/app/features/settings/pages/shipping-settings/shipping-settings.component.ts`
- Create: `src/app/features/settings/pages/shipping-settings/shipping-settings.component.html`
- Create: `src/app/features/settings/pages/app-settings/app-settings.component.ts`
- Create: `src/app/features/settings/pages/app-settings/app-settings.component.html`
- Create: `src/app/features/settings/pages/settings-pages.spec.ts`
- Modify: `src/app/features/settings/settings.routes.ts`
- Delete after parity is proven: `src/app/features/settings/settings.component.ts`
- Delete after parity is proven: `src/app/features/settings/settings.component.html`
- Modify: `src/app/features/settings/settings-toast-actions.spec.ts`
- Modify: `src/app/features/settings/settings-workspace-config.spec.ts`
- Modify: `src/app/core/services/settings-persistence-actions.spec.ts`

- [ ] **Step 1: Create a behavior inventory test before moving code**

Turn every current settings heading and primary action into a parity assertion: profile update, workspace update/create/switch, member invite/role/remove, notification/webhook configuration and test, store/payment configuration, shipping/carrier configuration, PWA/push actions, eBay/app configuration, and existing data exports.

- [ ] **Step 2: Run the parity test against the route design and verify failure**

Run: `npx vitest run src/app/features/settings/pages/settings-pages.spec.ts src/app/features/settings/settings-toast-actions.spec.ts src/app/features/settings/settings-workspace-config.spec.ts src/app/core/services/settings-persistence-actions.spec.ts`
Expected: FAIL because focused pages are absent.

- [ ] **Step 3: Move one responsibility at a time**

Move templates, forms, signals, and injected services to the relevant page. Keep persistence in existing core services. Use small feature-local helper components only where a page remains too large. Do not copy the same effect or save handler into multiple pages.

- [ ] **Step 4: Remove the old component only after parity passes**

Search for imports and route references first:

Run: `rg -n "SettingsComponent|settings\.component" src/app`
Expected before deletion: only old component/tests; expected after deletion: no runtime reference.

- [ ] **Step 5: Run settings tests and typecheck**

Run: `npx vitest run src/app/features/settings src/app/core/services/settings-persistence-actions.spec.ts && npm run typecheck`
Expected: PASS with every previous action reachable from exactly one new section.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/settings src/app/core/services/settings-persistence-actions.spec.ts
git commit -m "Split settings into focused pages"
```

### Task 4: Add typed, paged business-event queries

**Files:**

- Create: `src/app/core/models/business-event.models.ts`
- Create: `src/app/core/services/business-event.service.ts`
- Create: `src/app/core/services/business-event.service.spec.ts`

**Interfaces:**

```ts
export interface BusinessEventFilter {
  readonly workspaceId: string;
  readonly entityType?: BusinessEntityType;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly actorId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly pageSize: number;
}

export interface BusinessEventPage {
  readonly events: readonly BusinessEvent[];
  readonly nextCursor: string | null;
}
```

- [ ] **Step 1: Write failing service tests**

Mock the typed Supabase client. Assert current workspace is mandatory, allowed page size is bounded, filters are passed to the role-checked `list_business_events` RPC, ordering is deterministic by `(created_at desc, id desc)`, cursor pagination cannot skip equal timestamps, and another workspace's entity cannot be queried. Assert local history calls `list_entity_business_events` instead of the global RPC. Cover owner/admin/accountant global access and a normal member's denied global request.

- [ ] **Step 2: Run the service test and verify failure**

Run: `npx vitest run src/app/core/services/business-event.service.spec.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the read-only query boundary**

Expose Signals for loading/error only if shared consumers need them; otherwise return typed results. Never select `business_events` directly. Translate known event types into plain German presentation labels in a pure mapper, while preserving raw event types for export.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/app/core/services/business-event.service.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/models/business-event.models.ts src/app/core/services/business-event.service.ts src/app/core/services/business-event.service.spec.ts
git commit -m "Add typed business event queries"
```

### Task 5: Add reusable local record history

**Files:**

- Create: `src/app/shared/components/record-history/record-history.component.ts`
- Create: `src/app/shared/components/record-history/record-history.component.html`
- Create: `src/app/shared/components/record-history/record-history.component.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/features/sales/sales-toast-actions.spec.ts`

**Interfaces:**

```ts
readonly entityType = input.required<BusinessEntityType>();
readonly entityId = input.required<string>();
readonly heading = input('Änderungsverlauf');
```

- [ ] **Step 1: Write failing component tests**

Assert loading, empty, error/retry, paged load-more, actor/time/event label, and expandable before/after details. Assert raw JSON is not dumped by default and fields containing secrets are redacted by the mapper.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npx vitest run src/app/shared/components/record-history/record-history.component.spec.ts`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement and embed the timeline**

Use semantic ordered-list markup and buttons for expandable detail. Add it below the operational content on purchase and item detail. Because there is no dedicated sale-detail page yet, add `Änderungsverlauf ansehen` to each sale row and open the same component in an accessible dialog for that sale. Show `Zuletzt geändert am …` wherever a latest event exists.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/app/shared/components/record-history src/app/features/purchases/pages/purchase-detail src/app/features/inventory/pages/item-detail src/app/features/sales`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/record-history src/app/features/purchases/pages/purchase-detail src/app/features/inventory/pages/item-detail src/app/features/sales
git commit -m "Add contextual record history"
```

### Task 6: Build the global `Daten & Protokolle` page

**Files:**

- Create: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts`
- Create: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.html`
- Create: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts`
- Modify: `src/app/features/settings/settings.routes.ts`
- Modify: `src/app/core/services/workspace.service.ts`
- Modify: `src/app/core/services/workspace.service.spec.ts`
- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/workspace_retention.sql`

- [ ] **Step 1: Write failing audit-page tests**

Assert sections `Prüfprotokoll`, `Export & Archiv`, and `Aufbewahrung & Löschung`. Assert filters for Zeitraum, Benutzer, Datensatzart, Vorgangstyp, and Änderungsart; paged results; clear empty/error states; and actions `Datenarchiv herunterladen` and `Druckansicht / PDF`. Assert export controls are available to owner, admin, and accountant, while a normal member receives only entity-local history where otherwise authorized.

- [ ] **Step 2: Run the page test and verify failure**

Run: `npx vitest run src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts`
Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement URL-backed filters**

Reflect filter state in query parameters so a view can be restored after navigation. Validate dates and limit ranges. Load only the active page and do not fetch the entire audit history into browser memory.

- [ ] **Step 4: Add careful explanatory copy**

Use: `Das Prüfprotokoll dokumentiert abgeschlossene und steuerlich relevante Änderungen. Entwürfe erscheinen erst nach dem Abschließen.` Explain the conservative ten-year application retention for relevant records and direct users to professional legal/tax advice for their concrete duties.

Preserve and extend the database guard that rejects hard deletion of a workspace containing purchases, stock, sales, returns, documents, or business events. Add nullable `workspaces.archived_at` and owner-only `archive_workspace`/`restore_workspace` RPCs; archiving blocks new operational writes but preserves read/export access for owner, admin, and accountant. Before any deletion attempt, offer `Datenarchiv herunterladen`. For an empty workspace, retain the existing explicit confirmation. For a workspace with business data, do not retry deletion; show `Dieser Workspace enthält aufbewahrungsrelevante Geschäftsdaten und kann nicht direkt gelöscht werden.` and offer `Workspace archivieren`. Do not present the ten-year period as an automatic purge deadline.

In `workspace_retention.sql`, assert business events also block hard deletion, only the owner can archive/restore, archived workspaces reject new purchase/sale/stock writes, existing records remain readable/exportable to allowed roles, and another workspace remains unaffected.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx supabase test db supabase/tests/workspace_retention.sql && npx vitest run src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts src/app/core/services/workspace.service.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/settings/pages/data-and-audit src/app/features/settings/settings.routes.ts src/app/core/services/workspace.service.ts src/app/core/services/workspace.service.spec.ts supabase/schemas/database.sql supabase/tests/workspace_retention.sql
git commit -m "Add data and audit settings page"
```

### Task 7: Create machine-readable archive and printable report exports

**Files:**

- Create: `src/app/core/services/audit-export.service.ts`
- Create: `src/app/core/services/audit-export.service.spec.ts`
- Create: `src/app/features/settings/pages/audit-print/audit-print.component.ts`
- Create: `src/app/features/settings/pages/audit-print/audit-print.component.html`
- Create: `src/app/features/settings/pages/audit-print/audit-print.component.spec.ts`
- Modify: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts`
- Modify: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.html`
- Modify: `src/app/features/settings/settings.routes.ts`

**Archive contract:**

```text
flipbase-audit-YYYY-MM-DDTHH-mm-ssZ.zip
├── manifest.json
├── business-events.csv
├── business-events.json
├── purchases.csv
├── purchase-lines.csv
├── purchase-costs.csv
├── inventory-items.csv
├── stock-lots.csv
├── stock-movements.csv
├── sales.csv
├── sale-lines.csv
└── sale-costs.csv
```

- [ ] **Step 1: Write failing archive tests**

Use deterministic fixture data and fake time. Assert UTF-8 CSV with stable English machine headers, ISO-8601 timestamps, IDs/foreign keys, escaped spreadsheet-formula prefixes, JSON preservation of before/after payloads, schema/export version in `manifest.json`, applied filters, row counts, workspace ID, and SHA-256 checksum entries where the browser API is available.

- [ ] **Step 2: Run export tests and verify failure**

Run: `npx vitest run src/app/core/services/audit-export.service.spec.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement bounded, paged export collection**

Use existing JSZip. Fetch pages through services, report progress, allow cancellation, and fail with a visible message rather than producing an incomplete archive. Do not log payload contents. Revoke generated object URLs after download.

- [ ] **Step 4: Build the printable report**

Render organization/workspace, filter range, export creation time, event summaries, and selected before/after detail in semantic HTML. Support a global filtered report and a single-record report selected by `entityType` and `entityId`; expose the latter from purchase detail and each sale row. `Drucken / als PDF speichern` calls `window.print()` only from a user action. Add print-only Tailwind-compatible global utility rules only if existing print styling cannot cover page breaks.

- [ ] **Step 5: Run export and print tests**

Run: `npx vitest run src/app/core/services/audit-export.service.spec.ts src/app/features/settings/pages/audit-print/audit-print.component.spec.ts src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/audit-export.service.ts src/app/core/services/audit-export.service.spec.ts src/app/features/settings/pages/audit-print src/app/features/settings/pages/data-and-audit src/app/features/settings/settings.routes.ts
git commit -m "Add audit archive and printable report exports"
```

### Task 8: Document retention, corrections, and recovery procedures

**Files:**

- Create: `docs/compliance/flipbase-verfahrensdokumentation.md`
- Modify: `README.md` only to link the document if an operator-documentation section already exists.

- [ ] **Step 1: Write the operational document**

Document in plain German: record types and owners; draft versus finalized states; purchase and sale correction paths; immutable event generation; allocation formulas and cent rounding; export formats; role/access controls; backups and restore test cadence; retention/deletion decisions; software-release traceability; legacy migration procedure; and known boundaries requiring tax/legal advice.

- [ ] **Step 2: Verify every statement against implementation**

Run targeted searches for named RPCs, tables, routes, and labels. Do not document a control that does not exist. Link the approved design spec and implementation plans.

- [ ] **Step 3: Check for accidental promises or vague placeholders**

Run: `rg -n "garantiert|rechtssicher|TBD|TODO|spaeter ergaenzen" docs/compliance/flipbase-verfahrensdokumentation.md`
Expected: no unconditional compliance promise and no placeholder.

- [ ] **Step 4: Commit**

```bash
git add docs/compliance/flipbase-verfahrensdokumentation.md README.md
git commit -m "Document accounting data procedures"
```

### Task 9: Verify settings and audit capabilities end to end

**Files:**

- Modify only if a regression is found in files already named above.

- [ ] **Step 1: Run focused settings and audit tests**

Run: `npx vitest run src/app/features/settings src/app/shared/components/record-history src/app/core/services/business-event.service.spec.ts src/app/core/services/audit-export.service.spec.ts src/app/core/services/settings-persistence-actions.spec.ts`
Expected: PASS.

- [ ] **Step 2: Run static checks and build**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify role and export behavior**

As an authorized admin/accounting role: navigate every settings section on desktop and mobile, filter the global audit log, open a purchase's local history, create a printable report, download the ZIP, inspect manifest/CSV/JSON relations, and confirm values match the UI. As a restricted role: verify workspace-isolated reads and disabled/hidden export actions according to the implemented policy.

- [ ] **Step 4: Run an accessibility smoke test**

Check keyboard-only navigation, visible focus, select usage, headings/landmarks, table headers, modal focus, and AXE on the shell, data page, and print page. Resolve every serious/critical violation.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add src/app/features/settings src/app/shared/components/record-history src/app/core/services docs/compliance
git commit -m "Harden settings and audit exports"
```
