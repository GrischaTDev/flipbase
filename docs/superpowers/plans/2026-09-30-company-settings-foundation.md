# Company Settings Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workspace-scoped company profile as the single editable source for legal business, address, tax, bank, and logo data, exposed through a new `/settings/company` page without yet changing invoice, shop, or shipping consumers.

**Architecture:** Persist company data in a dedicated one-to-one `workspace_company_profiles` table. Read settings through a member-safe RPC and write profile + `workspaces.tax_mode` atomically through an owner/admin-only RPC that also writes a redacted business event. A focused `CompanyProfileService` owns workspace loading, normalization, document-readiness, and versioned private logo storage; the settings page composes existing Flipbase Shared UI and remains read-only for non-admin members.

**Tech Stack:** Angular 22 standalone components/signals/reactive forms, Supabase/PostgreSQL/RLS/Storage, generated Supabase TypeScript types, Lucide, Vitest, pgTAP, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-09-30-account-company-settings-design.md`

## Global Constraints

- Company data belongs to the active workspace, never to the user profile.
- PR 2 does not change invoice generation, credit notes, self-receipts, shop payment consumption, shipping address consumption, or remove the Workspace tax selector; those are PRs 3–4.
- Existing workspace names must not be copied into legal/company fields during backfill.
- Existing workspaces receive an empty company-profile row; new workspaces receive one during creation.
- Members may read company data; only `owner` and `admin` may change company data or logos.
- The login/account profile is untouched in this PR.
- `workspaces.tax_mode` remains the technical tax-mode source but is also editable from the new company page.
- Company profile and tax mode are saved in one database transaction through `update_workspace_company_settings`.
- Audit events record changed field names only; do not duplicate full IBAN, tax number, VAT ID, or logo storage paths in human-facing audit details.
- Logo bucket `company-assets` is private. V1 accepts PNG/JPEG/WebP only, max 5 MiB, max 4096 × 4096 px, path `<workspace-id>/logos/<uuid>.<ext>`.
- New logos always get a new object path. Replacing/removing a logo never deletes older successful logo objects in this PR.
- The UI uses current Shared Cards, Buttons, TextFields, Selects, Checkbox, Badge/Notice, Modal/Toast conventions and Flipbase theme tokens.
- No decorative uppercase headings, `tracking-wider`, Indigo/Violet parallel palette, local button replicas, or card-in-card layouts.
- Primary save/upload actions use the existing Flipbase yellow through Shared buttons.
- Company settings may be saved while incomplete; document-readiness is a status, not a save blocker in PR 2.
- Country is stored as an ISO-3166-1 alpha-2 code. V1 uses a two-letter text field with normalization to uppercase rather than introducing a new country-data dependency.
- When company settings are dirty, workspace switching is blocked until the user saves or discards; route navigation still uses the existing unsaved-entry confirmation.

## Review Focus

1. **Cross-workspace leakage:** switching from workspace A to B must clear A immediately and ignore late A responses; B may never render A’s company or logo.
2. **Unauthorized writes:** `member`, `fulfillment`, `accountant`, and `readonly` can read but must fail company/profile/logo writes server-side even if the UI is bypassed.
3. **Atomic save failure:** invalid tax mode/profile data must roll back both the company row and `workspaces.tax_mode` and must not write an audit event.
4. **Logo partial failure:** if Storage upload succeeds but database logo activation fails, remove only the just-uploaded object and retain the previously active logo.
5. **Dirty workspace switch:** while form values differ from the last confirmed server state, the header workspace selector stays blocked; after save/discard it is released and a clean switch reloads the target workspace.

---

### Task 1: Introduce the company-profile database contract

**Files:**
- Create: `supabase/schemas/280_company_profiles.sql`
- Create: `supabase/migrations/20260930141000_company_profiles.sql`
- Create: `supabase/tests/company_profiles.test.sql`
- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/schemas/60_audit_snapshot.sql`
- Modify: `src/app/core/models/supabase.types.ts` (generated, not hand-edited)
- Modify: `src/app/core/models/business-event.models.ts`
- Modify: `src/app/core/services/business-event.service.ts`
- Modify: `src/app/core/services/audit-export.service.ts`
- Modify: `src/app/core/services/audit-export.service.spec.ts`

**Interfaces:**
- Produces table `public.workspace_company_profiles` keyed by `workspace_id`.
- Produces RPC:
  - `get_workspace_company_settings(p_workspace_id uuid) returns jsonb`
  - `update_workspace_company_settings(p_workspace_id uuid, p_profile jsonb, p_tax_mode text) returns jsonb`
  - `set_workspace_company_logo(p_workspace_id uuid, p_logo_path text) returns jsonb`
- RPC result shape:
  - `{ profile: <workspace_company_profiles row>, tax_mode: TaxMode, can_edit: boolean }`
- Adds business entity type `company_profile` and event type `company_profile_updated`.

- [ ] **Step 1: Write the pgTAP contract before schema code**

Create `supabase/tests/company_profiles.test.sql` with tests that initially fail for missing table/RPC/bucket.

Assert:
- `workspace_company_profiles` exists, RLS is enabled, direct authenticated mutation privileges are absent.
- `company-assets` exists and is private.
- `get_workspace_company_settings`, `update_workspace_company_settings`, and `set_workspace_company_logo` are executable by authenticated but not anon.
- a normal member can read settings and receives `can_edit=false`.
- owner/admin receives `can_edit=true` and can update.
- foreign-workspace read is `42501`.
- member update is `42501`.
- successful settings save updates both profile and `workspaces.tax_mode`.
- invalid `p_tax_mode='invalid'` throws `22023` and leaves both profile and tax mode unchanged.
- unknown profile JSON keys throw `22023`.
- audit event is exactly one `company_profile_updated` record when values change.
- event `changes` contains a `fields` array but no old/new IBAN, tax number, VAT ID, or other full field values.
- saving the same normalized values creates no duplicate event.
- `create_workspace` creates an empty company row.
- existing/backfilled test workspace has a row whose legal/company fields are null, not copied from workspace name.
- logo activation rejects noncanonical paths and member callers.
- owner/admin can activate `<workspace-id>/logos/<uuid>.webp`.

Storage-policy checks must prove:
- authenticated workspace member can read objects below its own workspace prefix,
- only owner/admin can insert/delete in its own prefix,
- member insert and foreign-workspace access are denied.

- [ ] **Step 2: Run DB tests and verify RED**

Run after local Supabase reset/preparation:

```bash
npm run supabase:reset
npm run test:db -- company_profiles
```

If the repo’s Supabase CLI does not support a filename selector, run:

```bash
npm run test:db
```

Expected: FAIL because the company schema/RPC/bucket does not exist.

- [ ] **Step 3: Implement `workspace_company_profiles` in the schema and migration**

Table columns and limits:

```text
workspace_id uuid primary key references workspaces(id) on delete cascade
company_name text null max 200
legal_name text null max 200
legal_form text null in sole_proprietorship|gbr|ug|gmbh|other
email text null max 320
phone text null max 50
website text null max 500
street text null max 200
house_number text null max 30
postal_code text null max 20
city text null max 120
country_code text null exactly 2 uppercase ASCII letters
mailing_address_enabled boolean not null default false
mailing_street text null max 200
mailing_house_number text null max 30
mailing_postal_code text null max 20
mailing_city text null max 120
mailing_country_code text null exactly 2 uppercase ASCII letters
tax_number text null max 50
vat_id text null max 32
tax_office text null max 160
federal_state text null max 100
bank_account_holder text null max 200
bank_name text null max 160
iban text null max 34
bic text null max 11
logo_path text null max 500
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Normalize empty strings to SQL null inside write RPCs. Store:
- `country_code`, `mailing_country_code`, `iban`, `bic` uppercase,
- IBAN/BIC without spaces.

Backfill:

```sql
insert into public.workspace_company_profiles(workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;
```

Do not infer names or addresses.

- [ ] **Step 4: Add restrictive RLS and privileges**

- enable RLS,
- revoke table mutations from `authenticated`,
- grant select to `authenticated`,
- SELECT policy: `is_workspace_member(workspace_id)`,
- no client INSERT/UPDATE/DELETE policy.

All mutations go through owner/admin-only security-definer RPCs.

- [ ] **Step 5: Implement the read RPC**

`get_workspace_company_settings(p_workspace_id uuid)`:

- reject null/anonymous/foreign workspace with `42501`,
- ensure the profile row exists via migration/create flows rather than mutating in the read RPC,
- return exactly:
  `profile`, current workspace `tax_mode`, and `can_edit = is_workspace_admin(...)`.

A missing profile row is a data-integrity error, not an invented default legal identity.

- [ ] **Step 6: Implement the atomic settings-write RPC**

`update_workspace_company_settings(p_workspace_id, p_profile, p_tax_mode)`:

- require authenticated owner/admin,
- reject archived/missing workspace,
- require JSON object and reject unknown keys,
- allow only the fields from the V1 table except `workspace_id/created_at/updated_at`,
- reject tax mode outside `diff_25a|kleinunternehmer_19|regular_19`,
- normalize strings/codes/IBAN/BIC,
- update the company row and `workspaces.tax_mode` in the same PostgreSQL transaction,
- compute changed field names including `tax_mode`,
- insert `business_events` only when normalized values actually changed,
- event:
  - `entity_type='company_profile'`,
  - `entity_id=p_workspace_id`,
  - `event_type='company_profile_updated'`,
  - `changes=jsonb_build_object('fields', <sorted changed field names>)`,
- return the same `profile/tax_mode/can_edit` shape as the read RPC.

- [ ] **Step 7: Implement the dedicated logo activation RPC**

`set_workspace_company_logo(p_workspace_id, p_logo_path)`:

- owner/admin only,
- allow null to remove the active logo,
- for non-null enforce exact prefix `<workspace-id>/logos/`,
- enforce filename extension `.png|.jpg|.jpeg|.webp`,
- update only `logo_path` + `updated_at`,
- audit `fields=['logo_path']` only when value changes,
- return the standard company settings shape.

Do not delete Storage objects from SQL.

- [ ] **Step 8: Add private Storage bucket and policies**

Create bucket `company-assets` with `public=false`.

Policies:
- SELECT: authenticated workspace members for paths whose first folder is their workspace UUID and second folder is `logos`.
- INSERT/DELETE: `is_workspace_admin(workspace_uuid_from_path)`.
- no client UPDATE policy because successful logos are versioned, never overwritten.

- [ ] **Step 9: Update workspace creation flows**

Modify both canonical functions:
- `create_workspace`
- `handle_new_user`

After workspace creation, insert `workspace_company_profiles(workspace_id)`.

Do not populate legal/company names.

- [ ] **Step 10: Extend the immutable business-event contract**

Update the database `business_events.entity_type` check to include `company_profile`.

Update TypeScript:
- `BusinessEntityType` includes `'company_profile'`,
- `mapBusinessEventLabel('company_profile_updated')` returns `Unternehmensdaten geändert`.

Update `src/app/core/services/business-event.service.angular.spec.ts` to assert the new entity/event label.

- [ ] **Step 11: Include company profile in the audit export**

Update `export_audit_snapshot` to include `workspace_company_profiles`.

In `AuditExportService`:
- add `workspace_company_profiles` to `ArchiveTableName`/`ARCHIVE_TABLES`,
- add deterministic headers for all company fields,
- add `companyProfiles` to `AuditArchiveData`,
- emit `company-profile.csv`,
- bump audit `schemaVersion` and `exportVersion` from `1.3.0` to `1.4.0`.

Update audit-export tests to assert the new file and manifest version.

- [ ] **Step 12: Regenerate Supabase types**

After the schema applies locally:

```bash
npm run supabase:reset
npx supabase gen types typescript --local --schema public > src/app/core/models/supabase.types.ts
```

Do not hand-edit generated table/RPC signatures.

- [ ] **Step 13: Run the DB/type/audit slice and verify GREEN**

Run:

```bash
npm run test:db
npx vitest run --project=node   src/app/core/services/business-event.service.spec.ts   src/app/core/services/audit-export.service.spec.ts
npm run typecheck
node scripts/check-migration-changes.mjs $(git merge-base master HEAD) HEAD
```

Expected: all commands exit 0.

- [ ] **Step 14: Commit the database contract**

```bash
git add   supabase/schemas/280_company_profiles.sql   supabase/migrations/20260930141000_company_profiles.sql   supabase/tests/company_profiles.test.sql   supabase/schemas/database.sql   supabase/schemas/60_audit_snapshot.sql   src/app/core/models/supabase.types.ts   src/app/core/models/business-event.models.ts   src/app/core/services/business-event.service.ts   src/app/core/services/audit-export.service.ts   src/app/core/services/audit-export.service.spec.ts
git commit -m "feat(company): add workspace company profile contract"
```

---

### Task 2: Add company models, readiness, loading, saving, and logo storage

**Files:**
- Create: `src/app/core/models/company-profile.models.ts`
- Create: `src/app/core/services/company-profile.service.ts`
- Create: `src/app/core/services/company-profile.service.dom.spec.ts`
- Create: `src/app/core/utils/company-logo-validation.ts`
- Create: `src/app/core/utils/company-logo-validation.dom.spec.ts`

**Interfaces:**
- Produces:
  - `CompanyLegalForm = 'sole_proprietorship' | 'gbr' | 'ug' | 'gmbh' | 'other'`
  - `WorkspaceCompanyProfile`
  - `CompanyProfileInput`
  - `CompanySettingsState { profile, taxMode, canEdit }`
  - `CompanyReadiness { complete: boolean; missingFields: readonly CompanyRequiredField[] }`
  - `CompanyProfileService.profile`
  - `CompanyProfileService.taxMode`
  - `CompanyProfileService.canEdit`
  - `CompanyProfileService.loadedWorkspaceId`
  - `CompanyProfileService.isLoading`
  - `CompanyProfileService.loadError`
  - `CompanyProfileService.logoUrl`
  - `CompanyProfileService.readiness`
  - `load(workspaceId: string): Promise<void>`
  - `save(input: CompanyProfileInput, taxMode: TaxMode): Promise<MutationResult<WorkspaceCompanyProfile>>`
  - `replaceLogo(file: File): Promise<MutationResult<WorkspaceCompanyProfile>>`
  - `removeLogo(): Promise<MutationResult<WorkspaceCompanyProfile>>`

- [ ] **Step 1: Write failing pure-logo validation tests**

Test `validateCompanyLogo(file)`:

- accepts PNG/JPEG/WebP below 5 MiB and <=4096×4096,
- rejects SVG and arbitrary MIME,
- rejects >5 MiB before image decode,
- rejects width or height >4096,
- returns a canonical extension (`png|jpg|webp`) independent of unsafe filename text.

Use a deterministic image-dimension decoder seam rather than relying on browser image decoding in every unit assertion.

- [ ] **Step 2: Run logo tests and verify RED**

```bash
npx vitest run --project=dom src/app/core/utils/company-logo-validation.dom.spec.ts
```

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement the logo validator**

Expose:

```ts
export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const COMPANY_LOGO_MAX_DIMENSION = 4096;

export async function validateCompanyLogo(
  file: File,
  readDimensions?: (file: File) => Promise<{ width: number; height: number }>,
): Promise<{ extension: 'png' | 'jpg' | 'webp' }>;
```

Default dimension reader uses browser image APIs. Error messages are German and user-readable.

- [ ] **Step 4: Write failing CompanyProfileService tests**

Cover:
- active workspace load calls `get_workspace_company_settings`,
- A→B switch clears visible A state before B resolves,
- late A response cannot overwrite B,
- read result maps snake_case to camelCase models,
- save calls only `update_workspace_company_settings` and adopts confirmed DB result,
- save without active workspace fails without local mutation,
- member `canEdit=false` is preserved,
- readiness requires:
  - legal name,
  - street,
  - house number,
  - postal code,
  - city,
  - country code,
  - valid tax mode,
  - at least one of tax number/VAT ID,
- company name, bank data, phone, website, logo are not readiness blockers,
- signed logo URL belongs to the loaded workspace/path,
- workspace switch clears prior signed URL.

Cover Review Focus #4:
- successful upload then failed `set_workspace_company_logo` calls Storage remove on exactly the new object,
- old active path remains in service state,
- successful activation adopts new path,
- successful replace never deletes old active object,
- removal sets DB logo path null but does not delete old object.

- [ ] **Step 5: Run focused service tests and verify RED**

```bash
npx vitest run --project=dom   src/app/core/services/company-profile.service.dom.spec.ts   src/app/core/utils/company-logo-validation.dom.spec.ts
```

Expected: FAIL for missing service/models.

- [ ] **Step 6: Implement models and row mapping**

Keep persistence names out of feature templates. Map generated DB rows to camelCase models in the service or focused pure mapping helpers.

Normalize input client-side consistently with the RPC:
- trim ordinary strings,
- blank → `null`,
- country/IBAN/BIC uppercase,
- remove IBAN/BIC spaces.

The RPC remains authoritative.

- [ ] **Step 7: Implement workspace-safe loading**

Use an incrementing request version like other workspace-scoped services:

- on active workspace change: clear profile/logo state first,
- load exact workspace ID,
- apply response only if request version and current workspace still match,
- set `loadedWorkspaceId` only after confirmed response,
- centralize load failures through `SyncStatusService` and expose a retryable `loadError`.

- [ ] **Step 8: Implement save**

`save(input, taxMode)`:

- requires current loaded workspace and `canEdit=true`,
- calls `update_workspace_company_settings`,
- sends normalized V1 JSON,
- does not optimistically mutate,
- applies only confirmed DB result for same current workspace,
- returns `MutationResult` with central-error metadata.

- [ ] **Step 9: Implement signed-logo loading**

For non-null `logoPath`, call:

```ts
supabase.client.storage.from('company-assets').createSignedUrl(path, 3600)
```

Store only the returned temporary URL in `logoUrl`; never persist it.

A signed-URL failure leaves the profile usable and reports the logo preview failure without marking the whole company settings load as empty.

- [ ] **Step 10: Implement replace/remove logo**

`replaceLogo(file)`:
1. validate,
2. require loaded current workspace and edit permission,
3. create `<workspace>/logos/<crypto.randomUUID()>.<ext>`,
4. Storage upload with `upsert:false`,
5. call `set_workspace_company_logo`,
6. if DB activation fails, remove only the new object,
7. on success apply returned profile and refresh signed URL.

`removeLogo()` calls `set_workspace_company_logo(..., null)` and clears preview only after DB success.

- [ ] **Step 11: Run focused service tests and verify GREEN**

```bash
npx vitest run --project=dom   src/app/core/services/company-profile.service.dom.spec.ts   src/app/core/utils/company-logo-validation.dom.spec.ts
```

Expected: PASS.

- [ ] **Step 12: Commit the application service**

```bash
git add   src/app/core/models/company-profile.models.ts   src/app/core/services/company-profile.service.ts   src/app/core/services/company-profile.service.dom.spec.ts   src/app/core/utils/company-logo-validation.ts   src/app/core/utils/company-logo-validation.dom.spec.ts
git commit -m "feat(company): add company profile service"
```

---

### Task 3: Add the Unternehmen settings page and navigation

**Files:**
- Create: `src/app/features/settings/pages/company-settings/company-settings.component.ts`
- Create: `src/app/features/settings/pages/company-settings/company-settings.component.html`
- Create: `src/app/features/settings/pages/company-settings/company-settings.component.angular.spec.ts`
- Modify: `src/app/features/settings/settings.routes.ts`
- Modify: `src/app/features/settings/settings-shell/settings-shell.component.ts`
- Modify: `src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts`
- Modify: `src/app/features/settings/pages/settings-behavior.angular.spec.ts` only where shared metadata/test expectations require the new page

**Interfaces:**
- Consumes `CompanyProfileService`, `WorkspaceContextLockService`, `WorkspaceService`, `unsavedEntryGuard`, Shared UI.
- Produces route `/settings/company`.
- Implements `UnsavedEntryPage`:
  - `hasUnsavedChanges(): boolean`
  - `isSaving(): boolean`
  - `beforeUnload(event: BeforeUnloadEvent): void`

- [ ] **Step 1: Write failing route/navigation tests**

Assert:
- `SETTINGS_NAVIGATION` order starts `Konto`, `Unternehmen`, `Workspace`,
- company description is `Geschäfts- und Rechnungsdaten`,
- desktop and mobile navigation both include it,
- route `company` loads the new component,
- route has `canDeactivate: [unsavedEntryGuard]`,
- route sets `data.workspaceContextLocked=false` so a clean page does not permanently block the header switcher.

Run focused shell/route tests and verify RED.

- [ ] **Step 2: Write failing company component structure tests**

Using CompanyProfileService signals/fakes, assert four sibling cards:

1. `Unternehmensprofil`
2. `Geschäftsanschrift`
3. `Steuerdaten`
4. `Bankverbindung`

Assert no nested `app-card`, no uppercase/tracking heading classes, and only Shared visible buttons/fields/selects/checkboxes.

Assert company profile card includes:
- company name,
- legal name,
- legal form select,
- email, phone, website,
- logo area and hidden native file input only.

Address card:
- street, house number, postal code, city, country code,
- `Abweichende Postanschrift verwenden` checkbox,
- mailing fields absent until checked.

Tax card:
- tax mode options exactly:
  - `§ 25a Differenzbesteuerung (Gebrauchtwaren)`
  - `§ 19 Kleinunternehmer (0% USt)`
  - `19% Regelbesteuerung (Standard)`
- tax number, VAT ID, federal state, tax office.

Bank card:
- account holder, bank name, IBAN, BIC.

- [ ] **Step 3: Write failing role/read-only tests**

For `canEdit=false`:
- all form controls are disabled/read-only through Angular form state,
- no save/discard/logo change/remove actions render,
- page shows `Nur Inhaber und Administratoren können Unternehmensdaten ändern.`,
- values remain visible.

For `canEdit=true`, actions render.

- [ ] **Step 4: Write failing load/error/retry tests**

- loading state does not render an empty editable form,
- load error shows an alert + Shared `Erneut versuchen` action,
- retry calls `CompanyProfileService.load(activeWorkspaceId)`,
- confirmed load resets form pristine and fills values/tax mode.

- [ ] **Step 5: Write failing dirty/save/discard tests**

- changing a field sets dirty,
- dirty acquires one manual `WorkspaceContextLockService` lock,
- saving/discarding releases it,
- repeated changes do not leak multiple locks,
- component destroy releases a remaining lock,
- `hasUnsavedChanges()` reflects dirty state,
- `beforeUnload` prevents unload only while dirty/saving,
- discard restores the last confirmed server snapshot,
- save calls service once with form payload and selected tax mode,
- failed save keeps dirty values,
- successful save adopts confirmed server response, marks pristine, shows success toast.

This is the concrete implementation of Review Focus #5: users choose Save or Verwerfen before workspace switching becomes available again.

- [ ] **Step 6: Write failing readiness-status tests**

For incomplete data:
- show neutral/caution status `Rechnungsdaten unvollständig`,
- show the number of missing required fields,
- do not disable save.

For ready data:
- show `Rechnungsdaten vollständig`.

Avoid wording that promises legal compliance.

- [ ] **Step 7: Write failing logo UI tests**

- hidden input accepts only `image/png,image/jpeg,image/webp`,
- visible action is a Shared Button,
- selecting a file calls `replaceLogo`,
- preview uses service `logoUrl`,
- remove action calls `removeLogo`,
- while upload/remove is running, relevant actions are disabled,
- upload error appears without destroying unsaved text form values.

- [ ] **Step 8: Run focused Angular tests and verify RED**

```bash
npx vitest run --project=angular   src/app/features/settings/pages/company-settings/company-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
```

Expected: FAIL for missing route/page/navigation.

- [ ] **Step 9: Implement route and navigation**

Add after account:

```ts
{
  path: 'company',
  canDeactivate: [unsavedEntryGuard],
  data: { workspaceContextLocked: false },
  loadComponent: () =>
    import('./pages/company-settings/company-settings.component').then(
      (m) => m.CompanySettingsComponent,
    ),
}
```

Add navigation:
- label `Unternehmen`,
- description `Geschäfts- und Rechnungsdaten`,
- a neutral Lucide business/building icon already available in the project dependency.

Keep all remaining navigation order unchanged.

- [ ] **Step 10: Implement the reactive form**

One form containing the V1 profile fields plus `taxMode`.

Validators:
- max lengths match DB,
- optional email uses `Validators.email`,
- country codes use `^[A-Za-z]{2}$`,
- IBAN max 34 after whitespace removal,
- BIC max 11 after whitespace removal,
- tax mode required,
- legal form restricted to the five codes.

Do not make readiness fields `Validators.required`; incomplete profiles must still save.

- [ ] **Step 11: Implement dirty/workspace-lock lifecycle**

Track a confirmed snapshot after every successful load/save.

- form change from snapshot → dirty and acquire one manual workspace lock,
- returning exactly to snapshot or discard/save → release,
- destroy → release,
- clean workspace switch triggers CompanyProfileService reload through its active-workspace effect,
- route navigation uses the existing unsaved-entry guard.

Render Save + Verwerfen only for editors. Save is primary Flipbase button; discard is secondary.

- [ ] **Step 12: Implement the four-card template**

Use Shared Card headers and normal German capitalization.

Logo sits in the Unternehmensprofil layout as a sibling region, not a nested card.

Use the one allowed raw input only as:

```html
<input
  #logoInput
  type="file"
  class="sr-only"
  accept="image/png,image/jpeg,image/webp"
  ...
/>
```

All visible upload/remove interactions use Shared Buttons.

- [ ] **Step 13: Re-run focused Angular tests and Shared-UI checks**

```bash
npx vitest run --project=angular   src/app/features/settings/pages/company-settings/company-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
node scripts/check-admin-shared-ui.mjs
```

Expected: PASS / exit 0.

- [ ] **Step 14: Commit the company settings UI**

```bash
git add   src/app/features/settings/pages/company-settings   src/app/features/settings/settings.routes.ts   src/app/features/settings/settings-shell/settings-shell.component.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts   src/app/features/settings/pages/settings-behavior.angular.spec.ts
git commit -m "feat(company): add company settings page"
```

---

### Task 4: Add browser coverage and finish PR 2

**Files:**
- Create: `e2e/company-settings.spec.ts`
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**
- Consumes final `/settings/company` route/service/database behavior.
- Produces PR-smoke coverage for layout, read/write states, dirty handling, logo UI, responsive design, and accessibility.

- [ ] **Step 1: Write Playwright coverage before final polish**

Create tests for:
- desktop 1280×900 and mobile 390×844 without horizontal overflow,
- light and dark theme,
- four card headings visible,
- mailing-address fields toggle,
- dirty form shows save/discard and workspace selector is disabled,
- discard restores clean state and re-enables workspace selector,
- document-readiness status changes without blocking save,
- logo file control has the exact accepted MIME list,
- no WCAG AA violations on main page.

Do not upload a real logo in PR smoke unless the fixture has an isolated disposable workspace/storage setup; service-level tests already prove upload rollback/security.

- [ ] **Step 2: Run focused Playwright and fix only real layout/interaction failures**

```bash
npx playwright test e2e/company-settings.spec.ts --project=chromium
```

Expected final result: PASS.

- [ ] **Step 3: Update changelog with implemented facts**

Document:
- new Unternehmen navigation/page,
- workspace-scoped company profile,
- owner/admin-only mutation,
- tax mode atomic save,
- private versioned logo storage,
- readiness status,
- audit event without sensitive old/new values,
- exact verification run.

Explicitly state invoice/shop/shipping consumers are **not yet switched** in PR 2.

- [ ] **Step 4: Run full PR-2 verification**

```bash
npm run format:check
npm run lint
npm run typecheck
node scripts/check-admin-shared-ui.mjs
npm run test:workflow
npm run test:db
npm test
npx playwright test e2e/company-settings.spec.ts --project=chromium
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Commit verification artifacts**

```bash
git add e2e/company-settings.spec.ts docs/AI-CHANGELOG.md
git commit -m "test(company): cover company settings foundation"
```

---

## Plan Self-Review Result

- **Spec coverage:** PR 2 covers schema/migration/RLS, company service, logo storage, company route/navigation, four-section UI, tax-mode editing, role-based write access, audit event, readiness, workspace safety, and testing.
- **Intentionally deferred:** Invoice/credit-note/self-receipt snapshots (PR 3); removal of duplicate Shop bank/imprint data, shipping inheritance, and Workspace tax-mode UI (PR 4).
- **Additional integration found during repo review:** `business_events.entity_type` must add `company_profile`, and the audit export should include the new company profile so the new business master data is not absent from the existing archive.
- **Workspace-switch ruling:** the route opts out of permanent route-based workspace locking; the component manually locks the header only while dirty, forcing a clear Save/Verwerfen decision while still allowing clean workspace switching.
- **Logo-write ruling:** logo activation uses a dedicated RPC rather than the full settings-save RPC so an immediate logo action can never overwrite unsaved text-form fields.
- **Type consistency:** database RPC result, service state, and component inputs all use the same `profile/taxMode/canEdit` contract.
- **Review Focus:** all five high-risk conditions have explicit DB/service/component tests.
- **No placeholders:** all V1 limits, legal-form codes, tax modes, logo limits, routes, and RPC names are fixed.
