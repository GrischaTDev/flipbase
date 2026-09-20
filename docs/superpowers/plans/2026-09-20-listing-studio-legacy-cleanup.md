# Listing Studio Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused `listing_drafts` storage and the obsolete multi-platform generator while preserving the current Kleinanzeigen text generation and failing safely if legacy production data appears before deployment.

**Architecture:** The existing `ListingService` and `public.listings` remain the only persistence and lifecycle path. A small feature-local `ListingTemplateService` retains only the Kleinanzeigen title and description generation used by the editor. The generated release migration refuses to drop `public.listing_drafts` when any row exists, so a change between the production audit and deployment cannot cause silent data loss.

**Tech Stack:** Angular 22, TypeScript, Signals, Vitest, Supabase/PostgreSQL, pgTAP, GitHub Actions release migrations

**Spec:** `docs/superpowers/specs/2026-09-20-listing-studio-saved-listings-design.md`

## Global Constraints

- Production audit on 2026-09-20 found exactly `0` rows in `public.listing_drafts`; only aggregate counts were read.
- Never copy titles, descriptions, user identifiers, or other business content into logs or documentation.
- The release migration must be transactional and must abort before `drop table` if `public.listing_drafts` contains any row.
- Do not edit an existing migration. Generate one new migration from the declarative schema with suffix `remove_legacy_listing_drafts`, then inspect and add only the data guard and required header.
- Keep `public.listings`, its lifecycle RPCs, workspace isolation, extension transfer, and UI behavior unchanged.
- Keep only Kleinanzeigen generation. Remove eBay, Vinted, social, custom-store, HTML, SEO, direct webshop publication, direct inventory status writes, and the duplicate extension sender from the legacy service.
- Put the remaining generator under `src/app/features/listings/`; it is used only by that feature.
- Use Angular `inject()`, standalone components, signals, native control flow, OnPush, strict TypeScript, and Tailwind according to `AGENTS.md`.
- SQL keywords and identifiers remain lowercase. Database changes are declared under `supabase/schemas/` and represented by a generated migration.
- Before the final PR, merge the current `origin/master` into this branch so the other agent's additive `docs/AI-CHANGELOG.md` work is preserved.

## Review Focus

1. A legacy row created after the audit must stop the release migration and remain readable; Task 3 verifies the failing migration path against a scratch database.
2. An empty legacy table must be removed without changing `public.listings`; Task 3 verifies the successful migration path and Task 4 runs all database tests.
3. Kleinanzeigen titles must remain limited to 65 characters and keep the selected tax wording; Task 1 pins both behaviors in focused tests.
4. Removing `ListingStudioService` must leave no Supabase query, inventory write, extension sender, or old platform type reachable; Task 2 uses repository-wide reference scans and the full TypeScript/Angular checks.
5. Archived workspaces must remain protected through the new `listings` lifecycle after the old child-table fixture is removed; Task 4 retains the existing listing archive regression and reruns the retention suite.

---

### Task 1: Replace the legacy generator with one feature-local Kleinanzeigen template service

**Files:**

- Create: `src/app/features/listings/services/listing-template.service.ts`
- Create: `src/app/features/listings/services/listing-template.service.spec.ts`
- Modify: `src/app/features/listings/models/listing.models.ts`

**Interfaces:**

- Consumes: `InventoryItem` from `src/app/core/models/flipbase.models.ts` and `WorkspaceService.currentWorkspace()`.
- Produces: `ListingStyleTone`, `KleinanzeigenGenerationOptions`, `GeneratedListingText`, and `ListingTemplateService.generateKleinanzeigenListing(item, price, options)`.

- [ ] **Step 1: Add the focused model contracts**

Append these contracts to `src/app/features/listings/models/listing.models.ts`:

```ts
export type ListingStyleTone = 'dealer' | 'bargain' | 'collector';

export interface KleinanzeigenGenerationOptions {
  readonly includeDisclaimer: boolean;
  readonly includeNonSmoking: boolean;
  readonly styleTone: ListingStyleTone;
}

export interface GeneratedListingText {
  readonly title: string;
  readonly description: string;
}
```

- [ ] **Step 2: Write focused generator tests before moving the implementation**

Create `listing-template.service.spec.ts` with a representative `InventoryItem` and tests that assert:

```ts
it('limits generated Kleinanzeigen titles to 65 characters');
it('uses the workspace tax mode in the legal notice');
it('omits a tax paragraph when no workspace tax mode is known');
it('keeps pickup, shipping, non-smoking and tone options in the generated text');
```

Instantiate the service through `TestBed` with a stubbed `WorkspaceService`; do not use `Object.create()` or private-field mutation.

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
npx vitest run src/app/features/listings/services/listing-template.service.spec.ts
```

Expected: FAIL because `ListingTemplateService` does not exist.

- [ ] **Step 4: Implement the minimal template service**

Create an Angular root service with this public surface:

```ts
@Injectable({ providedIn: 'root' })
export class ListingTemplateService {
  private readonly workspaceService = inject(WorkspaceService);

  generateKleinanzeigenListing(
    item: InventoryItem,
    price: number,
    options: KleinanzeigenGenerationOptions,
  ): GeneratedListingText {
    const title = this.buildTitle(item, options.styleTone).slice(0, 65);
    return {
      title,
      description: this.buildDescription(item, price, options),
    };
  }
}
```

Move only the current Kleinanzeigen title, condition text, description, and tax-notice behavior. Keep the current German user-facing wording unchanged. Do not carry over `SupabaseService`, `InventoryService`, `LoggerService`, signals, effects, browser APIs, platform URLs, HTML generation, hashtag generation, or SEO analysis.

- [ ] **Step 5: Run the focused tests GREEN**

Run:

```powershell
npx vitest run src/app/features/listings/services/listing-template.service.spec.ts
```

Expected: all four focused tests PASS.

- [ ] **Step 6: Commit the self-contained template service**

```powershell
git add src/app/features/listings/models/listing.models.ts src/app/features/listings/services/listing-template.service.ts src/app/features/listings/services/listing-template.service.spec.ts
git commit -m "refactor(sales): isolate Kleinanzeigen template generation"
```

---

### Task 2: Switch the editor and remove obsolete frontend code

**Files:**

- Modify: `src/app/features/listings/pages/listing-editor/listing-editor.component.ts`
- Modify: `src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts`
- Delete: `src/app/core/services/listing-studio.service.ts`
- Delete: `src/app/core/services/listing-studio.spec.ts`
- Delete: `src/app/core/services/listing-studio.dom.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts`

**Interfaces:**

- Consumes: `ListingTemplateService` and `ListingStyleTone` from Task 1.
- Produces: an editor with unchanged visible generation behavior and no legacy service references.

- [ ] **Step 1: Update the editor test provider first**

Replace the `ListingStudioService` stub with `ListingTemplateService` while keeping the existing `generateKleinanzeigenListing` spy and all editor expectations.

- [ ] **Step 2: Run the editor test and verify RED**

Run:

```powershell
npx vitest run src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts
```

Expected: FAIL until the component imports and injects the new service.

- [ ] **Step 3: Switch the editor to the new service**

Import `ListingStyleTone` from `../../models/listing.models` and inject `ListingTemplateService` from `../../services/listing-template.service`. Keep the existing form, overwrite confirmation, 65-character counter, and patch behavior unchanged.

- [ ] **Step 4: Delete the unreachable legacy surface**

Delete the old service and its two test files. Remove only `ListingDraft` from `flipbase.models.ts`. Do not remove `InventoryItem` or any current listing feature contract.

- [ ] **Step 5: Prove that no old frontend dependency remains**

Run:

```powershell
rg -n "ListingStudioService|ListingDraft|savedDrafts|loadDrafts|publishToCustomStore|markItemAsListed|analyzeAndOptimizeListing|publishViaExtension" src/app
npm run typecheck
npm run build
```

Expected: the reference scan returns no matches; typecheck and build PASS with only the three already known unrelated `LucideDynamicIcon` warnings.

- [ ] **Step 6: Commit the frontend cleanup**

```powershell
git add src/app/core/models/flipbase.models.ts src/app/core/services src/app/features/listings
git commit -m "refactor(sales): remove legacy listing generator"
```

---

### Task 3: Remove the empty legacy table with a fail-closed release migration

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/schemas/80_workspace_retention.sql`
- Create: one generated `supabase/migrations/*_remove_legacy_listing_drafts.sql`
- Create: `docs/audit/2026-09-20-listing-studio-legacy-cleanup.md`

**Interfaces:**

- Consumes: the production audit result `total=0` recorded on 2026-09-20.
- Produces: a declarative schema without `public.listing_drafts` and a migration that refuses to delete nonempty legacy data.

- [ ] **Step 1: Record the privacy-safe production audit**

Write the audit document with these exact aggregate findings:

```text
total rows: 0
invalid titles: 0
invalid descriptions: 0
invalid prices: 0
missing inventory items: 0
conflicts with open listings: 0
inventory items with multiple drafts: 0
```

State that no titles, descriptions, user identifiers, or other row content were read or recorded.

- [ ] **Step 2: Remove every declarative definition of the old table**

From `database.sql`, remove the `create table`, `alter table ... enable row level security`, four operation-specific policies, and `idx_listing_drafts_item_id`. From `80_workspace_retention.sql`, remove only the trigger installed on `public.listing_drafts`.

- [ ] **Step 3: Generate the schema migration**

Run from the worktree:

```powershell
npx supabase stop
npx supabase db diff -f remove_legacy_listing_drafts
```

Inspect the single generated migration. It may drop only `public.listing_drafts` and objects that belong to that table. Remove unrelated diff noise before continuing.

- [ ] **Step 4: Add the fail-closed data guard to the generated migration**

Place this block immediately before the generated `drop table` statement:

```sql
do $$
begin
  if exists (select 1 from public.listing_drafts) then
    raise exception using
      errcode = '55000',
      message = 'listing_drafts enthält nach der geprüften Leerstandsprüfung wieder Daten; Migration vor dem Löschen abbrechen.';
  end if;
end;
$$;
```

Add a header that names the audited table and explains that the guard prevents silent loss when data appears after the production audit. Do not add transaction commands; the release runner owns the transaction.

- [ ] **Step 5: Verify both migration outcomes against a scratch database**

Start local Supabase, create a disposable PostgreSQL database inside `supabase-db`, and define a minimal `public.listing_drafts` table. Insert one row, apply the generated migration with `on_error_stop`, and assert that it fails with SQLSTATE `55000` while the row remains. Remove the row, apply the migration again, and assert that `to_regclass('public.listing_drafts')` is null. Drop the disposable database afterward.

Never run this destructive verification against production. Production is queried only for aggregate counts.

- [ ] **Step 6: Commit schema, migration, and audit together**

```powershell
git add supabase/schemas/database.sql supabase/schemas/80_workspace_retention.sql supabase/migrations docs/audit/2026-09-20-listing-studio-legacy-cleanup.md
git commit -m "refactor(sales): remove empty legacy listing storage"
```

---

### Task 4: Update database coverage, generated types, and retention documentation

**Files:**

- Modify: `supabase/tests/workspace_retention.sql`
- Modify: `supabase/tests/listings.test.sql`
- Modify: `src/app/core/models/supabase.types.ts`
- Modify: `docs/workspace-retention.md`

**Interfaces:**

- Consumes: final declarative schema and migration from Task 3.
- Produces: tests and generated types that contain no `listing_drafts` contract while retaining archived-workspace protection for `listings`.

- [ ] **Step 1: Replace the old retention fixture with final-state assertions**

Remove the `listing_drafts` insert and its three dynamic child-table rows from `workspace_retention.sql`. Add this assertion to `listings.test.sql` near the existing archived-workspace checks:

```sql
select hasnt_table('public', 'listing_drafts', 'legacy listing drafts table is removed');
```

Keep the existing `prepare_listing` archived-workspace regression as the authoritative replacement for the removed legacy trigger fixture.

- [ ] **Step 2: Update the retention documentation**

Remove `listing_drafts` from the child-table mapping in `docs/workspace-retention.md`. Add `listings` only where the document enumerates workspace-owned protected business data, matching its direct `workspace_id` relationship.

- [ ] **Step 3: Reset the local database and regenerate types**

Run:

```powershell
npx supabase db reset
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
```

Verify that the generated type file still contains `listings` and no longer contains `listing_drafts`.

- [ ] **Step 4: Run focused and complete database verification**

Run:

```powershell
npm run test:db -- --file supabase/tests/listings.test.sql
npm run test:db -- --file supabase/tests/workspace_retention.sql
npm run test:db
```

Expected: all focused and full database tests PASS.

- [ ] **Step 5: Commit tests, types, and documentation**

```powershell
git add supabase/tests src/app/core/models/supabase.types.ts docs/workspace-retention.md
git commit -m "test(sales): verify legacy listing removal"
```

---

### Task 5: Final verification, shared changelog integration, and PR preparation

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Modify: `docs/audit/2026-09-20-listing-studio-legacy-cleanup.md`

**Interfaces:**

- Consumes: all completed tasks and the latest `origin/master`.
- Produces: a reviewable branch with current parallel documentation preserved.

- [ ] **Step 1: Integrate the current base before editing the shared changelog**

Fetch `origin`, confirm the worktree is clean, and merge the current `origin/master` into `codex/listing-studio-legacy-cleanup`. Resolve `docs/AI-CHANGELOG.md` additively so the beta-registration entry from the other agent remains intact.

- [ ] **Step 2: Add the session changelog entry**

Document the zero-row production audit, fail-closed migration, removed frontend surface, generated types, exact test counts, and known unrelated warnings. Do not include production content or credentials.

- [ ] **Step 3: Run the complete local gates**

Run:

```powershell
npm run format
npm run verify
npm run test:db
npm run test:e2e:pr
git diff --check origin/master...HEAD
```

Record exact counts and any warnings in the audit. Treat any new warning or skipped required check as open until explained or fixed.

- [ ] **Step 4: Perform the final reference and migration review**

Run:

```powershell
rg -n "listing_drafts|ListingDraft|ListingStudioService|savedDrafts|loadDrafts" src supabase/schemas supabase/tests docs/workspace-retention.md
git diff --stat origin/master...HEAD
git status --short
```

Expected: no legacy reference in active code, schema, tests, or retention documentation; historical migrations and dated design/audit documents may still name the removed table. The branch is clean.

- [ ] **Step 5: Commit final documentation**

```powershell
git add docs/AI-CHANGELOG.md docs/audit/2026-09-20-listing-studio-legacy-cleanup.md
git commit -m "docs(sales): record legacy listing cleanup"
```

- [ ] **Step 6: Request the project-defined PR authorization**

Report the final evidence and ask exactly:

```text
Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?
```

Do not push, create the PR, merge, or clean the branch before that answer.

---

## Self-Review Against the Spec

- Production data inspection is explicit and privacy-safe; the observed empty table makes a content migration unnecessary.
- The migration remains safe if the production state changes after the audit because it aborts before dropping a nonempty table.
- `listing_drafts`, its policies, index, retention trigger, generated type, manual model, and frontend query are all assigned to removal tasks.
- Old platform cards no longer exist after Step 1; all remaining obsolete platform, HTML, webshop, SEO, and duplicate extension behavior is confined to the legacy service and removed in Task 2.
- Current Kleinanzeigen generation, lifecycle RPCs, extension bridge, workspace isolation, and accessibility behavior remain covered and unchanged.
- The plan includes focused RED/GREEN tests, scratch migration verification, full database verification, full application verification, browser smoke, and final repository scans.
- Parallel beta-registration work is protected by isolation and an additive merge before editing the shared changelog.
