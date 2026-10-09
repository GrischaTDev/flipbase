import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completeListingMigration,
  completeListingJobsMigration,
} from './vinted-listing-migration.mjs';
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

const jobsGenerated =
  'CREATE TABLE public.marketplace_listing_jobs (id bigint);\nCREATE TABLE public.marketplace_listing_permissions (id bigint);';
const jobsSchema =
  'revoke all on public.marketplace_listing_jobs from public,anon,authenticated;\nrevoke all on public.marketplace_listing_permissions from public,anon,authenticated;\ngrant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text) to authenticated;';

test('completes job permissions without recreating existing media storage', () => {
  const result = completeListingJobsMigration(jobsGenerated, jobsSchema);
  assert.match(result, /revoke all on public.marketplace_listing_jobs/);
  assert.match(result, /grant execute on function public.marketplace_enqueue_listing/);
  assert.doesNotMatch(result, /storage\.buckets|CREATE TABLE/);
});

test('rejects unrelated, incomplete or already completed job migrations', () => {
  assert.throws(() =>
    completeListingJobsMigration(
      jobsGenerated + '\nALTER TABLE public.workspaces ADD COLUMN x text;',
      jobsSchema,
    ),
  );
  assert.throws(() => completeListingJobsMigration('select 1;', jobsSchema));
  assert.throws(() => completeListingJobsMigration(jobsGenerated, 'select 1;'));
  assert.throws(() =>
    completeListingJobsMigration(
      completeListingJobsMigration(jobsGenerated, jobsSchema),
      jobsSchema,
    ),
  );
});

test('completes a planning supplement without modifying the original migration', () => {
  const generated =
    'ALTER TABLE public.marketplace_listing_jobs ADD COLUMN replaces_job_id bigint;\nCREATE FUNCTION public.marketplace_replace_planned_listing() RETURNS jsonb LANGUAGE SQL AS $$select null::jsonb$$;';
  const result = completeListingJobsMigration(generated, jobsSchema, 'planning');
  assert.match(result, /add column replaces_job_id/);
  assert.match(result, /revoke all on public.marketplace_listing_jobs/);
  assert.throws(() => completeListingJobsMigration('select 1;', jobsSchema, 'planning'));
  assert.throws(() =>
    completeListingJobsMigration(
      generated + '\nALTER TABLE public.workspaces ADD COLUMN x text;',
      jobsSchema,
      'planning',
    ),
  );
});
