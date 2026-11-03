import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  completeListingMigration,
  completeListingJobsMigration,
  completeRelistingLifecycleMigration,
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
const lifecycleFunction =
  "CREATE OR REPLACE FUNCTION public.marketplace_bind_relisting_entry() RETURNS text LANGUAGE sql AS $$ SELECT 'DROP VIEW public.unchanged; KeepCase'; $$;";

function lifecycleFixture(extra = '') {
  const raw = `alter table public.label_brands drop constraint label_brands_name_check;
alter table public.label_brands add constraint label_brands_name_check CHECK (name <> ''::text) not valid;
alter table public.label_brands validate constraint label_brands_name_check;
drop view if exists public.unchanged;
create or replace view public.unchanged as select 1;
alter table public.marketplace_listing_jobs add column relist_entry_id uuid;
CREATE INDEX marketplace_listing_jobs_relist_entry ON public.marketplace_listing_jobs USING btree (relist_entry_id) WHERE (relist_entry_id IS NOT NULL);
alter table public.marketplace_listing_jobs drop constraint marketplace_listing_jobs_editing_previous_state_check;
alter table public.marketplace_listing_jobs add constraint marketplace_listing_jobs_editing_previous_state_check CHECK (editing_previous_state = 'cancelled') not valid;
alter table public.marketplace_listing_jobs validate constraint marketplace_listing_jobs_editing_previous_state_check;
alter table public.marketplace_listing_jobs add constraint marketplace_listing_jobs_relist_entry_check CHECK (relist_entry_id IS NULL OR snapshot ? 'relistExternalId') not valid;
alter table public.marketplace_listing_jobs validate constraint marketplace_listing_jobs_relist_entry_check;
alter table public.marketplace_listing_jobs add constraint marketplace_listing_jobs_workspace_id_connection_id_relist_fkey FOREIGN KEY (workspace_id, connection_id, relist_entry_id) REFERENCES public.marketplace_account_entries(workspace_id, connection_id, id) ON DELETE SET NULL (relist_entry_id) not valid;
alter table public.marketplace_listing_jobs validate constraint marketplace_listing_jobs_workspace_id_connection_id_relist_fkey;
${lifecycleFunction}
${extra}`;
  const proof = {
    rawSha256: createHash('sha256').update(raw).digest('hex'),
    constraints: [
      {
        schema: 'public',
        table: 'label_brands',
        name: 'label_brands_name_check',
        beforeDefinition: "CHECK (name <> ''::text)",
        afterDefinition: "CHECK (name <> ''::text)",
      },
    ],
    views: [
      {
        schema: 'public',
        name: 'unchanged',
        beforeDefinition: 'SELECT 1;',
        afterDefinition: 'SELECT 1;',
        beforeOptions: ['security_invoker=true'],
        afterOptions: ['security_invoker=true'],
        beforeAcl: [],
        afterAcl: [],
      },
    ],
    functions: [
      {
        schema: 'public',
        name: 'marketplace_bind_relisting_entry',
        isNew: true,
        beforeHash: null,
        afterHash: createHash('sha256')
          .update(lifecycleFunction.slice(0, -1) + '\n')
          .digest('hex'),
      },
    ],
  };
  const schema =
    'revoke all on function public.marketplace_bind_relisting_entry() from public,anon,authenticated;\ngrant execute on function public.marketplace_bind_relisting_entry() to service_role;';
  return { raw, proof, schema };
}

test('generates lifecycle SQL from proven task changes while retaining quoted function content', () => {
  const { raw, proof, schema } = lifecycleFixture();
  const result = completeRelistingLifecycleMigration(raw, [schema], proof);
  assert.doesNotMatch(result, /label_brands/);
  assert.doesNotMatch(result, /^(?:drop view|create or replace view)/gimu);
  assert.match(result, /add column relist_entry_id uuid/);
  assert.match(result, /foreign key \(workspace_id, connection_id, relist_entry_id\)/);
  assert.match(result, /select 'DROP VIEW public.unchanged; KeepCase'/);
  assert.match(
    result,
    /revoke all on function public.marketplace_bind_relisting_entry\(\) from public,anon,authenticated/,
  );
  assert.match(
    result,
    /grant execute on function public.marketplace_bind_relisting_entry\(\) to service_role/,
  );
});

test('rejects unproven, changed or incomplete lifecycle generator excess', () => {
  for (const change of [
    (proof) => {
      proof.rawSha256 = '0'.repeat(64);
    },
    (proof) => {
      proof.constraints[0].afterDefinition = 'CHECK (false)';
    },
    (proof) => {
      proof.constraints = [];
    },
    (proof) => {
      proof.views[0].afterOptions = [];
    },
    (proof) => {
      proof.views[0].afterAcl = ['authenticated=arwdDxt/postgres'];
    },
    (proof) => {
      proof.functions = [];
    },
  ]) {
    const { raw, proof, schema } = lifecycleFixture();
    change(proof);
    assert.throws(() => completeRelistingLifecycleMigration(raw, [schema], proof));
  }
  const { raw, proof, schema } = lifecycleFixture();
  const partial = raw.replace(
    'alter table public.label_brands validate constraint label_brands_name_check;',
    '',
  );
  assert.throws(() =>
    completeRelistingLifecycleMigration(partial, [schema], {
      ...proof,
      rawSha256: createHash('sha256').update(partial).digest('hex'),
    }),
  );
});

test('rejects unrelated DDL and requires existing integrity checks plus explicit private helper rights', () => {
  for (const extra of [
    'DROP TABLE public.workspaces;',
    'ALTER TABLE public.marketplace_listing_jobs DROP CONSTRAINT marketplace_listing_jobs_check;',
    'CREATE OR REPLACE FUNCTION public.foreign_function() RETURNS int LANGUAGE sql AS $$select 1$$;',
    'GRANT ALL ON TABLE public.marketplace_listing_jobs TO authenticated;',
  ]) {
    const { raw, proof, schema } = lifecycleFixture(extra);
    assert.throws(() => completeRelistingLifecycleMigration(raw, [schema], proof));
  }
  const { raw, proof, schema } = lifecycleFixture();
  assert.throws(() =>
    completeRelistingLifecycleMigration(raw, [schema.replace(',authenticated', '')], proof),
  );
  const missingColumn = raw.replace(
    'alter table public.marketplace_listing_jobs add column relist_entry_id uuid;',
    '',
  );
  assert.throws(() =>
    completeRelistingLifecycleMigration(missingColumn, [schema], {
      ...proof,
      rawSha256: createHash('sha256').update(missingColumn).digest('hex'),
    }),
  );
});

test('requires complete view options and ACL evidence', () => {
  for (const field of ['beforeOptions', 'afterOptions', 'beforeAcl', 'afterAcl']) {
    const { raw, proof, schema } = lifecycleFixture();
    delete proof.views[0][field];
    assert.throws(() => completeRelistingLifecycleMigration(raw, [schema], proof));
  }
  const { raw, proof, schema } = lifecycleFixture();
  for (const field of ['beforeOptions', 'afterOptions', 'beforeAcl', 'afterAcl'])
    delete proof.views[0][field];
  assert.throws(() => completeRelistingLifecycleMigration(raw, [schema], proof));
});

test('checks the complete raw function against the independent catalog hash', () => {
  for (const [before, after] of [
    ['KeepCase', 'ChangedCase'],
    ['marketplace_bind_relisting_entry()', 'marketplace_bind_relisting_entry(uuid)'],
  ]) {
    const { raw, proof, schema } = lifecycleFixture();
    const changed = raw.replace(before, after);
    proof.rawSha256 = createHash('sha256').update(changed).digest('hex');
    assert.throws(
      () => completeRelistingLifecycleMigration(changed, [schema], proof),
      /Funktionsdefinition/,
    );
  }
});

test('accepts CRLF transport without changing quoted function values', () => {
  const { raw, proof, schema } = lifecycleFixture();
  const windows = raw.replace(/\n/gu, '\r\n');
  proof.rawSha256 = createHash('sha256').update(windows).digest('hex');
  assert.match(completeRelistingLifecycleMigration(windows, [schema], proof), /KeepCase/);
});

test('rejects mixed ACL targets and client grants in raw SQL and declarative helper rights', () => {
  for (const permission of [
    'grant execute on function public.marketplace_bind_relisting_entry(), public.foreign_function() to service_role;',
    'grant execute on function public.marketplace_bind_relisting_entry() to authenticated;',
    'grant execute on function public.marketplace_bind_relisting_entry() to service_role,authenticated;',
    'grant public to authenticated -- function public.marketplace_bind_relisting_entry()\n;',
  ]) {
    const { raw, proof, schema } = lifecycleFixture(permission);
    assert.throws(() => completeRelistingLifecycleMigration(raw, [schema], proof));
    const clean = lifecycleFixture();
    assert.throws(() =>
      completeRelistingLifecycleMigration(clean.raw, [clean.schema, permission], clean.proof),
    );
  }
});

test('completes the rescheduling function with explicit permissions', () => {
  const generated =
    'CREATE FUNCTION public.marketplace_reschedule_listing() RETURNS jsonb LANGUAGE SQL AS $$select null::jsonb$$;';
  assert.match(
    completeListingJobsMigration(generated, jobsSchema, 'reschedule'),
    /revoke all on public.marketplace_listing_jobs/,
  );
  assert.throws(() => completeListingJobsMigration('select 1;', jobsSchema, 'reschedule'));
});

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

test('completes execution grants and rejects incomplete or unrelated execution supplements', () => {
  const generated =
    'ALTER TABLE public.marketplace_listing_jobs ADD COLUMN claim_token uuid;\nCREATE FUNCTION public.marketplace_local_listing_claim() RETURNS jsonb LANGUAGE SQL AS $$select null::jsonb$$;';
  assert.match(
    completeListingJobsMigration(generated, jobsSchema, 'execution'),
    /revoke all on public.marketplace_listing_jobs/,
  );
  assert.throws(() => completeListingJobsMigration('select 1;', jobsSchema, 'execution'));
  assert.throws(() =>
    completeListingJobsMigration(
      generated + '\nALTER TABLE public.workspaces ADD COLUMN x text;',
      jobsSchema,
      'execution',
    ),
  );
});

test('completes cloud execution grants and rejects incomplete or unrelated supplements', () => {
  const generated =
    'ALTER TABLE public.marketplace_listing_jobs ADD COLUMN cloud_worker_id uuid;\nCREATE FUNCTION public.marketplace_cloud_listing_claim() RETURNS jsonb LANGUAGE SQL AS $$select null::jsonb$$;';
  assert.match(
    completeListingJobsMigration(generated, jobsSchema, 'cloud'),
    /revoke all on public.marketplace_listing_jobs/,
  );
  assert.throws(() => completeListingJobsMigration('select 1;', jobsSchema, 'cloud'));
  assert.throws(() =>
    completeListingJobsMigration(
      generated + '\nALTER TABLE public.workspaces ADD COLUMN x text;',
      jobsSchema,
      'cloud',
    ),
  );
});

test('completes only the generated private job update function, trigger and policy', async () => {
  const { completeListingJobUpdatesMigration } = await import('./vinted-listing-migration.mjs');
  const schema = await readFile('supabase/schemas/466_marketplace_listing_job_updates.sql', 'utf8');
  const generated = schema.replace(/^revoke[^;]+;\n|^grant[^;]+;\n/gim, '');
  const result = completeListingJobUpdatesMigration(generated, schema);
  const missingPolicy = generated.replace(/create policy[^;]+;/iu, '');
  assert.match(
    completeListingJobUpdatesMigration(missingPolicy, schema),
    /create policy "Kontoverwalter empfangen Inserataufträge" on realtime\.messages/,
  );
  assert.match(
    result,
    /revoke all on function public.marketplace_notify_listing_job_change\(\) from public,anon,authenticated/,
  );
  assert.match(
    result,
    /grant execute on function public.marketplace_notify_listing_job_change\(\) to service_role/,
  );
  assert.doesNotMatch(result, /revoke all on public\.marketplace_listing_jobs/);
  for (const invalid of [
    'select 1;',
    generated + '\nALTER TABLE public.workspaces ADD COLUMN x text;',
    generated + '\nDROP TABLE public.marketplace_listing_jobs;',
    result,
  ])
    assert.throws(() => completeListingJobUpdatesMigration(invalid, schema));
});
