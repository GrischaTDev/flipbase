import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeListingMigration } from './vinted-listing-migration.mjs';
const schemas = [
  'revoke all on public.marketplace_listing_drafts from public,anon,authenticated;\ngrant select on public.marketplace_listing_drafts to authenticated;',
  "insert into storage.buckets(id,name,public) values('marketplace-listing-media','marketplace-listing-media',false) on conflict(id) do nothing;\nrevoke all on public.marketplace_listing_images from public,anon,authenticated;\ncreate policy \"Inseratfotos lesen\" on storage.objects for select to authenticated using (false);",
  'revoke all on public.marketplace_listing_templates from public,anon,authenticated;',
];
const generated =
  'CREATE TABLE public.marketplace_listing_drafts (id bigint);\nCREATE TABLE public.marketplace_listing_images (id bigint);\nCREATE TABLE public.marketplace_listing_templates (id bigint);';
test('completes generated SQL from declarative permissions and private bucket only', () => {
  const result = completeListingMigration(generated, schemas);
  assert.match(result, /revoke all on public.marketplace_listing_drafts/);
  assert.match(result, /values\('marketplace-listing-media'/);
  assert.match(result, /create policy \"Inseratfotos lesen\"/);
  assert.doesNotMatch(result, /CREATE TABLE/);
});
test('rejects drift in unrelated tables', () => {
  assert.throws(() =>
    completeListingMigration(
      generated + '\nALTER TABLE public.marketplace_connections DROP CONSTRAINT x;',
      schemas,
    ),
  );
});
test('rejects an already completed or incomplete migration', () => {
  assert.throws(() => completeListingMigration('select 1;', schemas));
  assert.throws(() =>
    completeListingMigration(completeListingMigration(generated, schemas), schemas),
  );
});
