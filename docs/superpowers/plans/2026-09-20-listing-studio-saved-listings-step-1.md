# Listing Studio Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workspace-safe Kleinanzeigen listing workflow with saved listings, lifecycle actions, an overview, and create/edit pages while preserving the existing browser-extension transfer.

**Architecture:** A dedicated `ListingService` owns all Supabase access and workspace-scoped state. Database RPCs own lifecycle transitions and inventory coupling; Angular pages consume typed signals and shared UI components. The legacy `listing_drafts` table and old generator internals remain in place until Step 2, but the new flow no longer reads them.

**Tech Stack:** Angular 22 standalone components, signals, reactive forms, Tailwind CSS, Supabase/PostgreSQL 17, pgTAP, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-20-listing-studio-saved-listings-design.md`

## Global Constraints

- Platform scope is exactly Kleinanzeigen; do not add eBay, Vinted, WhatsApp, social, or webshop publication to the new flow.
- Listing states are exactly `prepared`, `online`, and `ended`; `end_reason` is exactly `sold`, `manual`, or `null`.
- At most one listing whose status is not `ended` may exist for one inventory item and platform.
- A real sale ends open listings automatically with `end_reason = 'sold'`.
- The app does not claim that opening Kleinanzeigen published the listing; the user confirms the `online` state.
- Keep `public.listing_drafts` and its existing schema, policies, and generated types unchanged in this PR.
- Add declarative SQL in `supabase/schemas/230_listings.sql`; never hand-edit an existing migration.
- Generate migrations with `supabase stop` followed by `supabase db diff -f create_saved_listings` or `supabase db diff -f add_listing_lifecycle`, inspect them, and regenerate `src/app/core/models/supabase.types.ts`.
- New UI text is German; code identifiers and file names are English.
- Use standalone OnPush components, signals, reactive forms, native control flow, `inject()`, external templates, and Tailwind classes.
- Use shared table, badge, button, field, thumbnail, dialog, and page-layout components; no native replacement controls and no new SCSS.
- Preserve the brand yellow `#fcc601` and the contracts in `docs/design/admin-ui-guidelines.md`.
- Every new table has RLS with separate policies per operation and explicit roles. Use `(select auth.uid())` through the existing workspace membership helper.
- No component performs a Supabase query directly.
- Every behavior change follows RED → GREEN; every task ends with the named targeted tests and the relevant broader suite.

## Review Focus

1. A response for workspace A arriving after switching to workspace B must be ignored and must not overwrite B's listing state; Task 4 adds this race test.
2. Two simultaneous `prepare_listing` calls for the same item must leave exactly one open listing and a deterministic counter; Task 3 adds the concurrent database test.
3. Missing or partially failed signed image URLs must keep the saved listing usable and transfer only resolved images with a visible warning; Tasks 5 and 7 add tests.
4. Setting a listing online for an item from a reopened purchase must preserve the existing inventory guard and return its concrete error; Task 3 adds the database regression and Task 4 preserves the message.
5. Exact Kleinanzeigen boundaries—65 title characters, 4,000 description characters, five-digit postal code, and 99,999,999 maximum price—must agree in PostgreSQL and Angular; Tasks 1, 2, and 7 test both boundary and one-over-boundary values.

---

## File Structure

### New files

- `supabase/schemas/230_listings.sql` — table, indexes, RLS, grants, lifecycle RPCs, sale trigger.
- `supabase/tests/listings.test.sql` — complete database contract.
- `supabase/migrations/*_create_saved_listings.sql` — CLI-generated table/RLS migration with a UTC timestamp prefix.
- `supabase/migrations/*_add_listing_lifecycle.sql` — CLI-generated RPC/trigger migration with a UTC timestamp prefix.
- `src/app/features/listings/models/listing.models.ts` — domain types and database-to-view projections.
- `src/app/features/listings/models/listing.rules.ts` — pure limits, eligibility, labels, badge tones, validation helpers.
- `src/app/features/listings/models/listing.rules.spec.ts` — pure contract tests.
- `src/app/features/listings/services/listing.service.ts` — workspace-scoped persistence and media payloads.
- `src/app/features/listings/services/listing.service.angular.spec.ts` — service state, RPC, and race tests.
- `src/app/features/listings/services/listing-extension.service.ts` — extension detection and transfer bridge.
- `src/app/features/listings/services/listing-extension.service.dom.spec.ts` — browser message contract tests.
- `src/app/features/listings/components/listing-extension-help/listing-extension-help.component.ts`
- `src/app/features/listings/components/listing-extension-help/listing-extension-help.component.html`
- `src/app/features/listings/pages/listing-overview/listing-overview.component.ts`
- `src/app/features/listings/pages/listing-overview/listing-overview.component.html`
- `src/app/features/listings/pages/listing-overview/listing-overview.component.angular.spec.ts`
- `src/app/features/listings/pages/listing-editor/listing-editor.component.ts`
- `src/app/features/listings/pages/listing-editor/listing-editor.component.html`
- `src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts`
- `src/app/features/listings/listings.routes.ts` — lazy child routes for overview/create/edit.
- `src/app/features/listings/listings.routes.angular.spec.ts` — lazy route and guard contract.
- `src/app/core/config/listings-navigation.ts` — sidebar children.
- `e2e/listing-studio.spec.ts` — saved listing lifecycle acceptance.

### Modified files

- `supabase/config.toml` — register `230_listings.sql` after `220_purchase_open_prices.sql`.
- `src/app/core/models/supabase.types.ts` — regenerated database types.
- `src/app/core/config/workspace-navigation.ts` — rename navigation entry and attach children.
- `src/app/core/config/workspace-navigation.spec.ts` — navigation contract.
- `src/app/app.routes.ts` — lazy-load `listings.routes.ts`.
- `src/app/core/services/listing-studio.service.ts` — expose only the existing Kleinanzeigen template call needed by the new editor; deeper cleanup waits for Step 2.
- `src/app/core/services/listing-studio.spec.ts` — preserve template and tax-copy behavior.
- `scripts/check-admin-shared-ui.mjs` — no logic change expected; run it against the new templates.
- `docs/AI-CHANGELOG.md` — implementation and actual verification.

### Removed files

- `src/app/features/listings/listings.component.ts`
- `src/app/features/listings/listings.component.html`
- `src/app/features/listings/listings-toast-actions.angular.spec.ts`

Removal happens only in Task 8 after the new overview and editor cover every retained Kleinanzeigen behavior.

---

### Task 1: Define listing domain contracts and boundary rules

**Files:**

- Create: `src/app/features/listings/models/listing.models.ts`
- Create: `src/app/features/listings/models/listing.rules.ts`
- Test: `src/app/features/listings/models/listing.rules.spec.ts`

**Interfaces:**

- Consumes: `InventoryItem`, `ItemStatus`, and `BadgeTone` from current shared models/components.
- Produces: `Listing`, `ListingContent`, `ListingRow`, `ListingEditorItem`, `ListingFilter`, `ListingStatus`, `ListingEndReason`, `ListingPriceType`, `ListingShippingType`, `LISTING_LIMITS`, `canPrepareListing(item)`, `validateListingContent(content)`, `listingStatusLabel(status)`, and `listingStatusTone(status)`.

- [ ] **Step 1: Write the failing boundary and eligibility tests**

Create `listing.rules.spec.ts` with explicit cases:

```ts
import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '../../../core/models/flipbase.models';
import {
  LISTING_LIMITS,
  canPrepareListing,
  listingStatusLabel,
  validateListingContent,
} from './listing.rules';

const item = (
  status: InventoryItem['status'],
  archivedAt: string | null = null,
): InventoryItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Bosch Akkuschrauber',
  condition: 'very_good',
  status,
  allocated_purchase_cost: 20,
  archived_at: archivedAt,
});

describe('listing rules', () => {
  it.each(['received', 'needs_review', 'researched', 'ready', 'listed', 'returned'] as const)(
    'allows %s inventory items',
    (status) => expect(canPrepareListing(item(status))).toEqual({ allowed: true }),
  );

  it.each(['reserved', 'sold', 'defective', 'archived'] as const)(
    'rejects %s inventory items with a user-facing reason',
    (status) => expect(canPrepareListing(item(status))).toMatchObject({ allowed: false }),
  );

  it('rejects archived metadata independently of the status', () => {
    expect(canPrepareListing(item('ready', '2026-09-20T00:00:00Z'))).toMatchObject({
      allowed: false,
    });
  });

  it('accepts exact Kleinanzeigen boundaries', () => {
    expect(
      validateListingContent({
        title: 'x'.repeat(LISTING_LIMITS.title),
        description: 'x'.repeat(LISTING_LIMITS.description),
        price: LISTING_LIMITS.price,
        priceType: 'FIXED',
        shippingType: 'shipping',
        shippingPrice: 0,
        postalCode: '12345',
      }),
    ).toEqual([]);
  });

  it('rejects values one unit beyond every boundary', () => {
    const errors = validateListingContent({
      title: 'x'.repeat(LISTING_LIMITS.title + 1),
      description: 'x'.repeat(LISTING_LIMITS.description + 1),
      price: LISTING_LIMITS.price + 0.01,
      priceType: 'FIXED',
      shippingType: 'shipping',
      shippingPrice: -0.01,
      postalCode: '123456',
    });
    expect(errors.map((error) => error.field)).toEqual([
      'title',
      'description',
      'price',
      'shippingPrice',
      'postalCode',
    ]);
  });

  it('uses the agreed German status labels', () => {
    expect(['prepared', 'online', 'ended'].map(listingStatusLabel)).toEqual([
      'Vorbereitet',
      'Online',
      'Beendet',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test:node -- src/app/features/listings/models/listing.rules.spec.ts
```

Expected: FAIL because `listing.rules.ts` and its exports do not exist.

- [ ] **Step 3: Add the exact domain types**

Create `listing.models.ts` with this public surface:

```ts
import type { InventoryItem, ItemMedia, ItemStatus } from '../../../core/models/flipbase.models';

export type ListingPlatform = 'kleinanzeigen';
export type ListingStatus = 'prepared' | 'online' | 'ended';
export type ListingEndReason = 'sold' | 'manual' | null;
export type ListingPriceType = 'FIXED' | 'NEGOTIABLE';
export type ListingShippingType = 'pickup' | 'shipping' | 'both';
export type ListingFilter = 'open' | 'online' | 'ended' | 'all';

export interface ListingContent {
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly priceType: ListingPriceType;
  readonly shippingType: ListingShippingType;
  readonly shippingPrice: number | null;
  readonly postalCode: string | null;
}

export interface Listing {
  readonly id: string;
  readonly workspaceId: string;
  readonly inventoryItemId: string;
  readonly platform: ListingPlatform;
  readonly status: ListingStatus;
  readonly endReason: ListingEndReason;
  readonly content: ListingContent;
  readonly listedCount: number;
  readonly lastListedAt: string | null;
  readonly onlineSince: string | null;
  readonly endedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListingEditorItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly condition: InventoryItem['condition'];
  readonly conditionNotes: string | null;
  readonly description: string | null;
  readonly status: ItemStatus;
  readonly archivedAt: string | null;
  readonly expectedValue: number | null;
  readonly allocatedPurchaseCost: number | null;
  readonly media: readonly ItemMedia[];
}

export interface ListingRow {
  readonly listing: Listing;
  readonly item: ListingEditorItem;
  readonly primaryImagePath: string | null;
}

export interface ListingValidationError {
  readonly field: keyof ListingContent;
  readonly message: string;
}
```

- [ ] **Step 4: Implement pure listing rules**

Create `listing.rules.ts`. Use these exact limits and outcomes:

```ts
import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { InventoryItem } from '../../../core/models/flipbase.models';
import type { ListingContent, ListingStatus, ListingValidationError } from './listing.models';

export const LISTING_LIMITS = {
  title: 65,
  description: 4_000,
  price: 99_999_999,
  postalCode: 5,
} as const;

const PREPARABLE_STATUSES = new Set<InventoryItem['status']>([
  'received',
  'needs_review',
  'researched',
  'ready',
  'listed',
  'returned',
]);

export type ListingEligibility =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export function canPrepareListing(item: InventoryItem): ListingEligibility {
  if (item.archived_at) return { allowed: false, reason: 'Der Artikel ist archiviert.' };
  if (PREPARABLE_STATUSES.has(item.status)) return { allowed: true };
  const reasons: Partial<Record<InventoryItem['status'], string>> = {
    reserved: 'Der Artikel ist reserviert.',
    sold: 'Der Artikel wurde bereits verkauft.',
    defective: 'Der Artikel ist als defekt markiert.',
    archived: 'Der Artikel ist archiviert.',
  };
  return {
    allowed: false,
    reason: reasons[item.status] ?? 'Dieser Artikel kann nicht inseriert werden.',
  };
}

export function listingStatusLabel(status: ListingStatus): string {
  return { prepared: 'Vorbereitet', online: 'Online', ended: 'Beendet' }[status];
}

export function listingStatusTone(status: ListingStatus): BadgeTone {
  return { prepared: 'caution', online: 'success', ended: 'neutral' }[status];
}

export function validateListingContent(content: ListingContent): ListingValidationError[] {
  const errors: ListingValidationError[] = [];
  const title = content.title.trim();
  if (!title || title.length > LISTING_LIMITS.title)
    errors.push({ field: 'title', message: 'Der Titel muss 1 bis 65 Zeichen enthalten.' });
  if (content.description.length > LISTING_LIMITS.description)
    errors.push({
      field: 'description',
      message: 'Die Beschreibung darf höchstens 4.000 Zeichen enthalten.',
    });
  if (!Number.isFinite(content.price) || content.price < 0 || content.price > LISTING_LIMITS.price)
    errors.push({ field: 'price', message: 'Der Preis muss zwischen 0 und 99.999.999 € liegen.' });
  if (
    content.shippingPrice !== null &&
    (!Number.isFinite(content.shippingPrice) || content.shippingPrice < 0)
  )
    errors.push({ field: 'shippingPrice', message: 'Versandkosten dürfen nicht negativ sein.' });
  if (content.shippingType === 'pickup' && content.shippingPrice !== null)
    errors.push({
      field: 'shippingPrice',
      message: 'Bei Abholung dürfen keine Versandkosten gespeichert sein.',
    });
  if (content.postalCode !== null && !/^\d{5}$/.test(content.postalCode))
    errors.push({
      field: 'postalCode',
      message: 'Die Postleitzahl muss aus fünf Ziffern bestehen.',
    });
  return errors;
}
```

- [ ] **Step 5: Run targeted and broader tests**

Run:

```powershell
npm run test:node -- src/app/features/listings/models/listing.rules.spec.ts
npm test
```

Expected: targeted file PASS; all existing suites PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/listings/models
git commit -m "feat(sales): define saved listing contracts"
```

---

### Task 2: Add the listings table, RLS, and exact data constraints

**Files:**

- Create: `supabase/schemas/230_listings.sql`
- Create: `supabase/tests/listings.test.sql`
- Modify: `supabase/config.toml`
- Create: `supabase/migrations/*_create_saved_listings.sql` through `supabase db diff`
- Modify: `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Consumes: `public.workspaces`, `public.inventory_items`, `public.is_workspace_member(uuid)`, and `public.protect_archived_workspace_data()`.
- Produces: `public.listings`, its row type, the exact database constraints from Task 1, and authenticated SELECT/update-content access.

- [ ] **Step 1: Write the failing pgTAP table and permission contract**

Create `supabase/tests/listings.test.sql` with a transaction and a fixed plan. Seed two users, two workspaces, membership rows, and one inventory item per workspace using the fixture patterns already used by `purchase_documents.test.sql`. The first assertions must cover:

```sql
select has_table('public', 'listings', 'listings table exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.listings'::regclass),
  'listings has rls'
);
select has_check('public', 'listings', 'listings validates domain values');
select has_index('public', 'listings', 'listings_one_open_per_item', 'one open listing index exists');
select ok(not has_table_privilege('anon', 'public.listings', 'select'), 'anon cannot read listings');
select ok(has_table_privilege('authenticated', 'public.listings', 'select'), 'members can read listings');
select ok(not has_table_privilege('authenticated', 'public.listings', 'insert'), 'direct insert is denied');
select ok(not has_table_privilege('authenticated', 'public.listings', 'delete'), 'direct delete is denied');
select ok(has_column_privilege('authenticated', 'public.listings', 'title', 'update'), 'title is editable');
select ok(not has_column_privilege('authenticated', 'public.listings', 'status', 'update'), 'status is rpc-only');
```

Add explicit insert attempts as `postgres` to prove exact boundaries and constraint failures:

- 65-character title succeeds; 66 fails.
- 4,000-character description succeeds; 4,001 fails.
- `price = 99999999` succeeds; `99999999.01` fails.
- `postal_code = '12345'` succeeds; `'1234'` and `'123456'` fail.
- `pickup` accepts only `shipping_price is null`.
- `ended` requires an end reason and timestamp; open states require both to be null.
- two open listings for the same item fail; a new row after an ended row succeeds.
- a member sees only their workspace; a non-member sees zero rows.

- [ ] **Step 2: Verify the new database test is RED**

Run:

```powershell
npx supabase test db --local supabase/tests/listings.test.sql
```

Expected: FAIL on `has_table` because `public.listings` does not exist.

- [ ] **Step 3: Register and define the table**

Append `./schemas/230_listings.sql` after `220_purchase_open_prices.sql` in `schema_paths`.

Create `230_listings.sql` using lowercase SQL. The table definition must implement this exact shape:

```sql
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null,
  platform text not null default 'kleinanzeigen' check (platform = 'kleinanzeigen'),
  status text not null default 'prepared' check (status in ('prepared', 'online', 'ended')),
  end_reason text check (end_reason in ('sold', 'manual')),
  title text not null check (char_length(btrim(title)) between 1 and 65),
  description text not null check (char_length(description) <= 4000),
  price numeric(12,2) not null check (price between 0 and 99999999),
  price_type text not null check (price_type in ('FIXED', 'NEGOTIABLE')),
  shipping_type text not null check (shipping_type in ('pickup', 'shipping', 'both')),
  shipping_price numeric(12,2) check (shipping_price >= 0),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  listed_count integer not null default 0 check (listed_count >= 0),
  last_listed_at timestamptz,
  online_since timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_workspace_id_id_key unique (workspace_id, id),
  constraint listings_item_workspace_fkey foreign key (workspace_id, inventory_item_id)
    references public.inventory_items(workspace_id, id) on delete cascade,
  constraint listings_shipping_price_check check (
    (shipping_type = 'pickup' and shipping_price is null)
    or (shipping_type in ('shipping', 'both'))
  ),
  constraint listings_end_state_check check (
    (status = 'ended' and end_reason is not null and ended_at is not null)
    or (status <> 'ended' and end_reason is null and ended_at is null)
  )
);

comment on table public.listings is 'Gespeicherte und statusgeführte Verkaufsinserate eines Workspace.';
create unique index listings_one_open_per_item
  on public.listings (inventory_item_id, platform) where status <> 'ended';
create index listings_workspace_status_updated_idx
  on public.listings (workspace_id, status, updated_at desc, id desc);
create index listings_inventory_item_id_idx on public.listings (inventory_item_id);
alter table public.listings enable row level security;
```

Add the archived-workspace trigger and a local `updated_at` trigger function in the same file. Revoke all table rights from `public`, `anon`, and `authenticated`; grant SELECT and UPDATE only on `title`, `description`, `price`, `price_type`, `shipping_type`, `shipping_price`, and `postal_code` to `authenticated`.

Create separate permissive policies:

```sql
create policy "Inserate lesen" on public.listings for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Inseratsinhalt ändern" on public.listings for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
```

Do not create INSERT or DELETE policies. Explicit column grants and missing policies enforce the RPC-only lifecycle.

- [ ] **Step 4: Reset the declarative database and run the test GREEN**

Run:

```powershell
npx supabase db reset --local
npx supabase test db --local supabase/tests/listings.test.sql
```

Expected: reset succeeds; every table/RLS/constraint assertion passes.

- [ ] **Step 5: Generate and inspect the table migration**

Run in sequence:

```powershell
npx supabase stop
npx supabase db diff -f create_saved_listings
```

Inspect the generated migration. It may create only `public.listings`, its table-owned trigger function, indexes, grants, policies, and triggers. It must not alter Sniper, purchases, catalog media, extensions, or existing migrations. If unrelated drift appears, discard only the newly generated migration, restore the local database from `origin/master`, apply `230_listings.sql`, and rerun the diff.

- [ ] **Step 6: Regenerate Supabase types and verify the complete database suite**

Run:

```powershell
npx supabase start
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
npm run test:db
node scripts/check-schema-registration.mjs
node scripts/check-migration-changes.mjs
```

Expected: all database files PASS; schema and migration guards report no findings.

- [ ] **Step 7: Commit**

```powershell
git add supabase/config.toml supabase/schemas/230_listings.sql supabase/tests/listings.test.sql supabase/migrations src/app/core/models/supabase.types.ts
git commit -m "feat(sales): add saved listing storage"
```

---

### Task 3: Add transactional listing lifecycle functions and sale coupling

**Files:**

- Modify: `supabase/schemas/230_listings.sql`
- Modify: `supabase/tests/listings.test.sql`
- Create: `supabase/migrations/*_add_listing_lifecycle.sql` through `supabase db diff`
- Modify: `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Consumes: `public.listings` from Task 2 and current inventory/purchase integrity triggers.
- Produces: `prepare_listing(uuid, uuid, jsonb)`, `set_listing_online(uuid, uuid)`, `end_listing(uuid, uuid)`, and `end_listings_after_inventory_sale()` returning or updating `public.listings` rows.

- [ ] **Step 1: Extend pgTAP with failing lifecycle tests**

Before implementation, add tests that call each RPC as an authenticated member and assert:

```sql
select has_function('public', 'prepare_listing', array['uuid', 'uuid', 'jsonb']);
select has_function('public', 'set_listing_online', array['uuid', 'uuid']);
select has_function('public', 'end_listing', array['uuid', 'uuid']);
select function_privs_are(
  'public', 'prepare_listing', array['uuid', 'uuid', 'jsonb'],
  'authenticated', array['EXECUTE'], 'authenticated can prepare listings'
);
select function_privs_are(
  'public', 'prepare_listing', array['uuid', 'uuid', 'jsonb'],
  'anon', array[]::text[], 'anon cannot prepare listings'
);
```

Add behavioral blocks for:

1. first prepare creates `prepared`, `listed_count = 1`, and `last_listed_at`;
2. preparing an online listing reuses the same ID and increments to 2;
3. reopening a manually ended listing reuses the same ID;
4. a sold-ended listing and a sold item cannot be reopened;
5. `set_listing_online` changes `prepared → online` and `ready → listed`;
6. a second `set_listing_online` fails with SQLSTATE `22023`;
7. `end_listing` changes an open listing to `ended/manual` and `listed → ready`;
8. a sale transition to `sold` changes every open listing to `ended/sold`;
9. non-members and archived workspaces fail with `42501`;
10. invalid content and reserved/defective/archived items fail with `22023`;
11. a package-content item tied to a reopened purchase fails when setting online and retains both original statuses;
12. two concurrent prepare calls leave one open row and `listed_count = 2`.

Use two independent psql sessions or `dblink` for assertion 12, following the repository's existing race tests. Both calls must target the same workspace and inventory item.

- [ ] **Step 2: Run the focused database test RED**

Run:

```powershell
npx supabase test db --local supabase/tests/listings.test.sql
```

Expected: FAIL because the three lifecycle functions do not exist.

- [ ] **Step 3: Implement shared validation and `prepare_listing`**

Add a private helper `public.validate_listing_content(jsonb)` with `security invoker`, `set search_path = ''`, and execute revoked from every API role. It returns normalized columns or raises `22023` using the same exact limits as Task 1.

Implement this signature:

```sql
create function public.prepare_listing(
  p_workspace_id uuid,
  p_inventory_item_id uuid,
  p_content jsonb
) returns public.listings
language plpgsql security definer set search_path = '';
```

The body must, in this order:

1. verify `public.is_workspace_member(p_workspace_id)`;
2. reject an archived workspace;
3. lock the inventory row with `for update` and verify matching workspace;
4. reject `reserved`, `sold`, `defective`, `archived`, and non-null `archived_at`;
5. normalize and validate `p_content`;
6. acquire `pg_advisory_xact_lock(hashtextextended(p_inventory_item_id::text || ':kleinanzeigen', 0))` so simultaneous first inserts serialize;
7. lock the newest Kleinanzeigen listing for that item;
8. create a row when none exists, otherwise reuse an open row or a `ended/manual` row;
9. set `prepared`, clear end/online timestamps, increment `listed_count`, and set `last_listed_at = statement_timestamp()`;
10. return the written row.

Catch `unique_violation` only to reselect and update the row created by the competing transaction; do not swallow unrelated errors.

- [ ] **Step 4: Implement online, manual end, and sold-trigger transitions**

Use these signatures:

```sql
create function public.set_listing_online(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = '';

create function public.end_listing(p_workspace_id uuid, p_listing_id uuid)
returns public.listings language plpgsql security definer set search_path = '';

create function public.end_listings_after_inventory_sale()
returns trigger language plpgsql security definer set search_path = '';
```

Each RPC locks the listing and its inventory item, verifies workspace membership and archive state, then enforces its exact source states. `set_listing_online` updates the item to `listed` only from `received`, `needs_review`, `researched`, `ready`, or `returned`; an already `listed` item stays `listed`. Before that update, it must explicitly join the item's `purchase_id` to `public.purchases` whenever `source_package_line_id` is not null and raise SQLSTATE `42501` with `Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.` unless `entry_status = 'finalized'`. This explicit check is required because the RPC is `security definer` and the older trigger deliberately exempts `current_user = 'postgres'`. `end_listing` changes the item back to `ready` only when its current status is `listed`.

The sale trigger runs only when `new.status = 'sold'` and `old.status is distinct from new.status`; it ends open rows with `end_reason = 'sold'`, `ended_at = statement_timestamp()`, and updated timestamp. It never reopens or manually ends anything.

Set owner `postgres`, revoke execute from `public`, `anon`, and `service_role`, and grant execute only to `authenticated` for the three public RPCs. Keep trigger execution unavailable to API roles.

- [ ] **Step 5: Run lifecycle tests GREEN and the full database suite**

Run:

```powershell
npx supabase db reset --local
npx supabase test db --local supabase/tests/listings.test.sql
npm run test:db
```

Expected: focused listing tests and all database tests PASS, including the concurrent prepare and reopened-purchase cases.

- [ ] **Step 6: Generate and inspect the lifecycle migration and types**

Run:

```powershell
npx supabase stop
npx supabase db diff -f add_listing_lifecycle
npx supabase start
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
```

Inspect the new migration. It may contain only functions, grants/revokes, and the sale trigger added in this task. Re-run `npm run test:db` after applying the generated migration path.

- [ ] **Step 7: Commit**

```powershell
git add supabase/schemas/230_listings.sql supabase/tests/listings.test.sql supabase/migrations src/app/core/models/supabase.types.ts
git commit -m "feat(sales): add listing lifecycle functions"
```

---

### Task 4: Build the workspace-safe ListingService

**Files:**

- Create: `src/app/features/listings/services/listing.service.ts`
- Test: `src/app/features/listings/services/listing.service.angular.spec.ts`

**Interfaces:**

- Consumes: generated `Database` rows/RPCs, `WorkspaceService.currentWorkspace`, `MediaService.resolveMediaUrls`, Task 1 domain types, and Task 3 RPCs.
- Produces: signals `rows`, `items`, `loading`, `error`, `loadedWorkspaceId`; methods `load(workspaceId)`, `prepare(itemId, content)`, `updateContent(listingId, content)`, `setOnline(listingId)`, `end(listingId)`, `getById(listingId)`, `buildExtensionPayload(row)`, and `clear()`.

- [ ] **Step 1: Write failing service contract tests**

Create Angular tests with `TestBed`, typed Supabase query doubles, and real signals. Cover:

```ts
it('maps listings and inventory media into rows ordered newest first');
it('clears state while a new workspace loads');
it('ignores a workspace A response after workspace B became active');
it('keeps rows empty and exposes a retryable error when loading fails');
it('calls prepare_listing with camelCase content mapped to database keys');
it('updates only editable content columns and verifies the returned row');
it('calls set_listing_online and end_listing with the active workspace');
it('preserves the concrete reopened-purchase database error');
it('does not mutate another workspace when an action resolves late');
it('resolves fresh image URLs and omits failed paths from the extension payload');
it('returns failed image file names alongside the partial payload');
```

For the race test, resolve deferred workspace A and B promises in reverse order and assert `loadedWorkspaceId() === 'workspace-b'` and every row belongs to B.

- [ ] **Step 2: Run the service test RED**

Run:

```powershell
npm run test:angular -- src/app/features/listings/services/listing.service.angular.spec.ts
```

Expected: FAIL because `ListingService` does not exist.

- [ ] **Step 3: Implement typed mapping and workspace state**

Create a root-provided service with this public contract:

```ts
@Injectable({ providedIn: 'root' })
export class ListingService {
  readonly rows = signal<readonly ListingRow[]>([]);
  readonly items = signal<readonly ListingEditorItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);

  async load(workspaceId: string): Promise<void>;
  async prepare(itemId: string, content: ListingContent): Promise<ListingActionResult>;
  async updateContent(listingId: string, content: ListingContent): Promise<ListingActionResult>;
  async setOnline(listingId: string): Promise<ListingActionResult>;
  async end(listingId: string): Promise<ListingActionResult>;
  getById(listingId: string): ListingRow | null;
  async buildExtensionPayload(row: ListingRow): Promise<ListingPayloadResult>;
  clear(): void;
}
```

Define results in `listing.models.ts`:

```ts
export interface ListingActionResult {
  readonly data: Listing | null;
  readonly error: Error | null;
}

export interface ListingPayloadResult {
  readonly payload: KleinanzeigenListingPayload;
  readonly missingImages: readonly string[];
}
```

Use a monotonically increasing `loadGeneration`. At each load, clear rows/items/error, capture the generation and workspace ID, query listings plus inventory rows, and apply results only if both still match the active workspace. Every mutation captures workspace ID before awaiting and reloads only when it is still active.

Query inventory items through this feature service, not through the component. Include media ordered by `sort_order`. Include all statuses; eligibility is a presentation rule from Task 1.

- [ ] **Step 4: Implement lifecycle methods and fresh media payloads**

Map `ListingContent` to RPC JSON/database columns in one private function. For direct content updates, use `.update(...).eq('workspace_id', workspaceId).eq('id', listingId).select(...).single()` and reject a missing returned row.

`buildExtensionPayload` must call `MediaService.resolveMediaUrls` on current item media paths at action time. Build this exact existing extension contract:

```ts
{
  itemId: row.item.id,
  title: row.listing.content.title,
  description: row.listing.content.description,
  price: row.listing.content.price,
  priceType: row.listing.content.priceType,
  postalCode: row.listing.content.postalCode ?? undefined,
  shippingType: row.listing.content.shippingType,
  shippingPrice: row.listing.content.shippingPrice ?? undefined,
  images: resolvedImagesInSortOrder.map(({ url, name }) => ({ url, name })),
}
```

Return unresolved file names separately. Do not fail the saved listing because one or all images cannot be signed.

- [ ] **Step 5: Run targeted and broader suites**

Run:

```powershell
npm run test:angular -- src/app/features/listings/services/listing.service.angular.spec.ts
npm test
```

Expected: service tests PASS; all existing application suites PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/listings/models/listing.models.ts src/app/features/listings/services
git commit -m "feat(sales): add workspace-safe listing service"
```

---

### Task 5: Extract the reusable Kleinanzeigen extension bridge

**Files:**

- Create: `src/app/features/listings/services/listing-extension.service.ts`
- Test: `src/app/features/listings/services/listing-extension.service.dom.spec.ts`
- Create: `src/app/features/listings/components/listing-extension-help/listing-extension-help.component.ts`
- Create: `src/app/features/listings/components/listing-extension-help/listing-extension-help.component.html`

**Interfaces:**

- Consumes: existing `KleinanzeigenListingPayload` and the established window messages `FLIPBASE_CHECK_EXTENSION`, `FLIPBASE_EXTENSION_READY`, `flipbase:extension-ready`, and `FLIPBASE_PUBLISH_KLEINANZEIGEN`.
- Produces: signals `available`, `checking`, methods `start()`, `checkNow()`, `publish(payload)`, and automatic cleanup via `DestroyRef`.

- [ ] **Step 1: Write failing DOM message tests**

Cover the real browser protocol:

```ts
it('posts FLIPBASE_CHECK_EXTENSION on start and manual checks');
it('accepts both the CustomEvent and message response used by released extensions');
it('ignores messages whose source is not the current window');
it('posts FLIPBASE_PUBLISH_KLEINANZEIGEN with the unchanged payload');
it('removes listeners on destroy');
```

Use `window.dispatchEvent` and spy on `window.postMessage`; do not test a mock-only abstraction.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:dom -- src/app/features/listings/services/listing-extension.service.dom.spec.ts
```

Expected: FAIL because `ListingExtensionService` does not exist.

- [ ] **Step 3: Implement the bridge and help component**

Move detection behavior from the legacy component into a root-provided service. Register listeners once in `start()`, post an immediate check, repeat twice at 300 ms and 1,000 ms, and clear timers/listeners through `DestroyRef.onDestroy`. `checkNow()` resets `checking` and posts a new check. `publish()` only posts the established payload; navigation stays the extension's responsibility.

Build the help component from the existing install modal copy. Inputs/outputs:

```ts
readonly open = input(false);
readonly checking = input(false);
readonly closeRequested = output<void>();
readonly checkRequested = output<void>();
```

Use the shared modal shell and buttons, restore focus on close, support Escape, and keep `chrome://extensions` plus `tools/flipbase-extension` instructions.

- [ ] **Step 4: Run DOM and existing extension regressions**

Run:

```powershell
npm run test:dom -- src/app/features/listings/services/listing-extension.service.dom.spec.ts src/app/features/listings/kleinanzeigen-autofill-core.dom.spec.ts src/app/core/services/listing-studio.dom.spec.ts
npm test
```

Expected: all extension contracts and all application suites PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/features/listings/services/listing-extension.service.* src/app/features/listings/components/listing-extension-help
git commit -m "refactor(sales): share listing extension bridge"
```

---

### Task 6: Build the listing overview and lifecycle actions

**Files:**

- Create: `src/app/features/listings/pages/listing-overview/listing-overview.component.ts`
- Create: `src/app/features/listings/pages/listing-overview/listing-overview.component.html`
- Test: `src/app/features/listings/pages/listing-overview/listing-overview.component.angular.spec.ts`

**Interfaces:**

- Consumes: `ListingService`, `ListingExtensionService`, `WorkspaceService`, Task 1 rules, Router, shared DataTable/Badge/Button/ProductThumbnail/ConfirmDialog/Toast components.
- Produces: `/listings` page behavior, filters, search, responsive table/cards, and actions `setOnline`, `openAgain`, `relist`, `edit`, and `end`.

- [ ] **Step 1: Write failing component behavior tests**

Use TestBed with real signals and service spies. Add exact cases:

```ts
it('loads the active workspace and reloads after a workspace switch');
it('keeps search and filters visible for zero matches');
it('distinguishes loading, no listings, no matches, and retryable error states');
it('filters open, online, ended, and all listings');
it('shows prepared actions only for prepared rows');
it('shows relist only for online or manually ended eligible items');
it('shows the sold cleanup hint without a relist action');
it('sets a prepared listing online and reports success after the rpc resolves');
it('asks before ending and does nothing when cancelled');
it('asks whether the old listing was removed before relisting');
it('opens extension help when the bridge is unavailable');
it('publishes partial image payload and warns about missing images');
it('has no axe violations in populated and empty states');
```

- [ ] **Step 2: Run overview tests RED**

Run:

```powershell
npm run test:angular -- src/app/features/listings/pages/listing-overview/listing-overview.component.angular.spec.ts
```

Expected: FAIL because the overview component does not exist.

- [ ] **Step 3: Implement state, filtering, and action guards**

The component exposes signals:

```ts
readonly filter = signal<ListingFilter>('open');
readonly search = signal('');
readonly actionListingId = signal<string | null>(null);
readonly confirmAction = signal<{ kind: 'end' | 'relist'; row: ListingRow } | null>(null);
readonly helpOpen = signal(false);
readonly filteredRows = computed(() => /* stable search + filter + newest first */);
```

Start the extension bridge once and load whenever `currentWorkspace()?.id` changes. An action must capture the row workspace and refuse to apply feedback after a workspace switch. Only show success after the service resolves without error.

`openAgain` builds and publishes the payload without calling `prepare`. `relist` confirms, calls `prepare` with the stored content, then builds/publishes the updated row. Missing images produce a caution toast naming the count, while the extension still receives resolved images.

- [ ] **Step 4: Implement shared table and mobile cards**

Use `app-page-header` with primary link `/listings/new`. Wrap every desktop `<table>` in the `table-content` slot of `app-data-table`; provide mobile cards through `table-mobile`. Columns are exactly:

1. Artikel: thumbnail, listing title, item title, link to `/inventory/:id`;
2. Preis;
3. Status badge;
4. Eingestellt: count and last date;
5. Online seit;
6. row actions with accessible names.

Use filter buttons in `table-filters`. Search binds through `searchValue`/`searchValueChange`. Render four distinct table states with the shared inputs and action slots. No hover-only action and no native select.

- [ ] **Step 5: Run component, shared-UI, and broader tests**

Run:

```powershell
npm run test:angular -- src/app/features/listings/pages/listing-overview/listing-overview.component.angular.spec.ts
node scripts/check-admin-shared-ui.mjs
npm test
```

Expected: overview tests PASS, shared UI reports zero findings, all application suites PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/listings/pages/listing-overview
git commit -m "feat(sales): add saved listing overview"
```

---

### Task 7: Build the create/edit listing editor around the existing generator

**Files:**

- Create: `src/app/features/listings/pages/listing-editor/listing-editor.component.ts`
- Create: `src/app/features/listings/pages/listing-editor/listing-editor.component.html`
- Test: `src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts`
- Modify: `src/app/core/services/listing-studio.service.ts`
- Modify: `src/app/core/services/listing-studio.spec.ts`

**Interfaces:**

- Consumes: `ListingService`, `ListingExtensionService`, current `ListingStudioService.generateListing`, route param `id`, Task 1 rules, shared fields/select/number input/page layout, and `UnsavedEntryPage`.
- Produces: one editor component for `/listings/new` and `/listings/:id`, with `hasUnsavedChanges()` and `isSaving()`.

- [ ] **Step 1: Write failing editor tests**

Cover create and edit modes:

```ts
it('loads all unarchived unsold items and displays status hints');
it('disables prepare when the selected item already has an open listing');
it('uses expected value, then allocated purchase cost, then zero as the price suggestion');
it('generates a Kleinanzeigen title and description without claiming AI');
it('enforces 65 and 4000 characters at the exact boundary');
it('requires a five-digit postal code only when supplied');
it('clears shipping price when shipping type changes to pickup');
it('creates a prepared listing before opening the extension');
it('keeps the prepared listing and opens help when the extension is absent');
it('loads an existing listing by route id and locks the item selector');
it('saves only content in edit mode');
it('asks before overwriting manually edited title or description from the template');
it('reports unsaved changes and saving state to unsavedEntryGuard');
it('warns but continues when one or all media URLs cannot be resolved');
it('has no axe violations in create, edit, and validation-error states');
```

- [ ] **Step 2: Run editor tests RED**

Run:

```powershell
npm run test:angular -- src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts
```

Expected: FAIL because `ListingEditorComponent` does not exist.

- [ ] **Step 3: Implement the typed reactive form and mode loading**

Use this form shape:

```ts
readonly form = new FormGroup({
  inventoryItemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(65)] }),
  description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
  price: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(99_999_999)]),
  priceType: new FormControl<ListingPriceType>('FIXED', { nonNullable: true }),
  shippingType: new FormControl<ListingShippingType>('pickup', { nonNullable: true }),
  shippingPrice: new FormControl<number | null>(null, [Validators.min(0)]),
  postalCode: new FormControl('', [Validators.pattern(/^\d{5}$/)]),
  styleTone: new FormControl<ListingStyleTone>('dealer', { nonNullable: true }),
  includeNonSmoking: new FormControl(false, { nonNullable: true }),
  includeDisclaimer: new FormControl(true, { nonNullable: true }),
});
```

Create mode gets no route ID; edit mode reads `id`, loads rows, patches the form, and disables `inventoryItemId`. Save an immutable baseline after load/save and compare normalized values in `hasUnsavedChanges`. `isSaving()` reads a signal. A `beforeunload` host handler prevents navigation only with unsaved changes.

- [ ] **Step 4: Implement template generation, prepare/save, and transfer**

Keep the existing `ListingStudioService.generateListing` implementation in this PR, but add a narrow `generateKleinanzeigenListing(item, price, options)` wrapper so the editor never sees other platform types. Update its tests to prove the wrapper uses current tax-mode text and 65-character title limit.

Create mode sequence:

1. validate and show inline errors;
2. call `ListingService.prepare`;
3. keep the returned listing in service state;
4. if extension available, build fresh payload and publish;
5. navigate to `/listings` and say „Kleinanzeigen wurde geöffnet. Setze das Inserat nach dem Aufgeben auf Online.“;
6. if unavailable, remain saved as `prepared` and open help.

Edit mode „Speichern“ calls only `updateContent`. „Neu einstellen“ uses the same confirmation and prepare/publish sequence as Task 6. „Texte kopieren“ uses the Clipboard API and reports success only after the promise resolves.

- [ ] **Step 5: Build the responsive editor template**

Use `app-entry-page-layout` or `app-two-column-layout`: title/description and item selection in the main column; price, price type, shipping, postal code, and template settings in the side column. Use shared form components and visible character counters. Show selected item thumbnail, status, category, brand, and purchase cost. Keep exactly one primary action per mode.

Do not render platform cards, AI score, keyword badges, webshop publication, HTML mode, or „als gelistet markieren“ in the new page.

- [ ] **Step 6: Run editor, generator, UI, and broader suites**

Run:

```powershell
npm run test:angular -- src/app/features/listings/pages/listing-editor/listing-editor.component.angular.spec.ts
npm run test:node -- src/app/core/services/listing-studio.spec.ts
node scripts/check-admin-shared-ui.mjs
npm test
```

Expected: editor and generator tests PASS, shared UI zero findings, all suites PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/app/features/listings/pages/listing-editor src/app/core/services/listing-studio.service.ts src/app/core/services/listing-studio.spec.ts
git commit -m "feat(sales): add listing create and edit flow"
```

---

### Task 8: Wire routes and navigation, then retire the legacy page

**Files:**

- Create: `src/app/features/listings/listings.routes.ts`
- Create: `src/app/core/config/listings-navigation.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/config/workspace-navigation.ts`
- Modify: `src/app/core/config/workspace-navigation.spec.ts`
- Remove: `src/app/features/listings/listings.component.ts`
- Remove: `src/app/features/listings/listings.component.html`
- Remove: `src/app/features/listings/listings-toast-actions.angular.spec.ts`

**Interfaces:**

- Consumes: overview/editor pages, shared `unsavedEntryGuard`, and `SubNavigationItem`.
- Produces: lazy routes `/listings`, `/listings/new`, `/listings/:id` and sidebar children.

- [ ] **Step 1: Write failing navigation and route tests**

Extend `workspace-navigation.spec.ts` to assert:

```ts
expect(listingsItem).toMatchObject({ path: '/listings', label: 'Inserate' });
expect(listingsItem?.children).toEqual([
  { label: 'Übersicht', path: '/listings' },
  { label: 'Erstellen', path: '/listings/new' },
]);
expect(isNavigationItemActive(listingsItem!, '/listings/123')).toBe(true);
expect(isNavigationChildActive(listingsItem!.children![0], '/listings/new')).toBe(false);
expect(isNavigationChildActive(listingsItem!.children![1], '/listings/new')).toBe(true);
```

Add a small route contract test beside `listings.routes.ts` asserting the empty overview route, `new`, `:id`, lazy components, and guards on create/edit.

- [ ] **Step 2: Run navigation tests RED**

Run:

```powershell
npm run test:node -- src/app/core/config/workspace-navigation.spec.ts
npm run test:angular -- src/app/features/listings/listings.routes.angular.spec.ts
```

Expected: FAIL because the current item is still „Inserate erstellen“ and no child routes exist.

- [ ] **Step 3: Add lazy listing routes and sidebar children**

Create:

```ts
export const LISTINGS_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Übersicht', path: '/listings' },
  { label: 'Erstellen', path: '/listings/new' },
];
```

Create route order exactly as follows so `new` is not captured as an ID:

```ts
export const LISTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/listing-overview/listing-overview.component').then(
        (m) => m.ListingOverviewComponent,
      ),
  },
  {
    path: 'new',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/listing-editor/listing-editor.component').then(
        (m) => m.ListingEditorComponent,
      ),
  },
  {
    path: ':id',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/listing-editor/listing-editor.component').then(
        (m) => m.ListingEditorComponent,
      ),
  },
];
```

Change the app route to `loadChildren` and the navigation label to `Inserate` with `LISTINGS_NAVIGATION` children.

- [ ] **Step 4: Remove the legacy page only after parity checks**

Before deletion, compare the new editor/bridge against these retained behaviors from the old component:

- extension detection and manual recheck;
- title, description, price type, shipping type, shipping price, postal code;
- fresh signed image URLs and partial-image warning;
- German tax text from the current workspace;
- clipboard action;
- installation help.

When each is covered by Tasks 5–7 tests, delete the three legacy files. Do not remove `ListingDraft`, `savedDrafts`, or other old `ListingStudioService` internals in this PR; Step 2 owns that cleanup.

- [ ] **Step 5: Run route, navigation, UI, and full application tests**

Run:

```powershell
npm run test:node -- src/app/core/config/workspace-navigation.spec.ts
npm run test:angular -- src/app/features/listings/listings.routes.angular.spec.ts
node scripts/check-admin-shared-ui.mjs
npm test
npm run build
```

Expected: all tests and production build PASS; no import refers to the removed component.

- [ ] **Step 6: Commit**

```powershell
git add src/app/app.routes.ts src/app/core/config src/app/features/listings
git commit -m "refactor(sales): route the saved listing workspace"
```

---

### Task 9: Add browser acceptance, audit the PR scope, and record verification

**Files:**

- Create: `e2e/listing-studio.spec.ts`
- Modify: `docs/AI-CHANGELOG.md`
- Create: `docs/audit/2026-09-20-listing-studio-step-1.md`

**Interfaces:**

- Consumes: complete Step 1 flow and existing authenticated Playwright fixtures.
- Produces: executable acceptance proof and an honest closeout record.

- [ ] **Step 1: Write failing browser acceptance scenarios**

Use the existing authenticated workspace fixture and cover:

```ts
test('creates a prepared listing, opens Kleinanzeigen, and marks it online');
test('edits and manually ends an online listing');
test('re-lists a manually ended listing after confirmation');
test('blocks a second open listing for the same item');
test('shows install help while preserving the prepared listing without the extension');
test('keeps workspace listings isolated after switching workspaces');
```

Stub only the browser-extension window protocol; use the real Angular pages and local Supabase database. Assert the database status after each action, not only toast text.

- [ ] **Step 2: Run browser tests RED, then fix only integration gaps**

Run:

```powershell
npx playwright test e2e/listing-studio.spec.ts --workers=1 --reporter=line
```

Expected before final wiring: at least the create lifecycle scenario FAILS at its first missing integration. Fix gaps through the owning service/page and add or extend its targeted test before rerunning.

- [ ] **Step 3: Run browser tests GREEN and required project checks**

Run in sequence and retain exit codes:

```powershell
npx playwright test e2e/listing-studio.spec.ts --workers=1 --reporter=line
npm run test:e2e:pr
npm run test:db
npm run verify
git diff --check origin/master...HEAD
```

Expected: listing acceptance, PR browser set, all database tests, complete verification, build, and diff check PASS. Record any existing warning by exact file and warning code; do not call warnings clean.

- [ ] **Step 4: Perform the manual visual and accessibility acceptance**

Inspect `/listings`, `/listings/new`, and one `/listings/:id` page in:

- desktop light;
- desktop dark;
- mobile light;
- mobile dark;
- keyboard-only navigation;
- 200% zoom;
- reduced motion;
- AXE scan.

Check table/mobile switching, focus after dialogs/help, error visibility, character counters, contrast, and action availability. Record each matrix cell as passed or open in the audit; never claim an unrun cell.

- [ ] **Step 5: Update changelog and create the audit**

`docs/AI-CHANGELOG.md` must name the delivered behavior, migration files, actual commands/counts, known warnings, and state that `listing_drafts` cleanup remains Step 2.

`docs/audit/2026-09-20-listing-studio-step-1.md` must contain:

- base commit and final branch head;
- changed behavior and deliberate exclusions;
- migration inspection result;
- automated commands with pass/fail counts;
- manual matrix with exact results;
- remaining Step 2 work;
- any rulings from the execution ledger.

- [ ] **Step 6: Commit**

```powershell
git add e2e/listing-studio.spec.ts docs/AI-CHANGELOG.md docs/audit/2026-09-20-listing-studio-step-1.md
git commit -m "test(sales): verify saved listing workflow"
```

---

## Self-Review Against the Spec

- Stored listings, statuses, lifecycle functions, sale coupling, overview, create/edit, navigation, extension transfer, workspace isolation, errors, and accessibility each map to a task above.
- The legacy `listing_drafts` table is explicitly retained; no Step 2 cleanup leaks into this PR.
- Limits and status names are identical in Tasks 1–3 and Task 7.
- Every later interface is produced by an earlier task with exact method names.
- All five Review Focus risks have an owning test.
- No other platform, AI service, category automation, or browser-extension rewrite is introduced.
- Generated migration filenames are intentionally tool-generated; the required suffix and allowed contents are explicit.
