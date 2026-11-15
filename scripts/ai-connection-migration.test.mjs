import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { completeAiConnectionMigration } from './ai-connection-migration.mjs';

test('generated migration retains AI statements and explicit rights, without unrelated schema drift', async () => {
  const schema = await readFile('supabase/schemas/570_ai_connections.sql', 'utf8');
  const generated = `create table public.ai_connections(id uuid); create table public.ai_connection_accounts(id bigint); create table public.ai_connection_requests(id uuid);
    alter table public.marketplace_listing_jobs add column ai_connection_id uuid;
    create or replace function public.marketplace_listing_job_valid() returns boolean language sql as $$ select true $$;
    drop view public.inventory_item_sale_states; revoke delete on public.beta_discord_links from authenticated;`;
  const result = completeAiConnectionMigration(generated, schema);
  assert.ok(result.includes('add column ai_connection_id'));
  assert.ok(result.includes('marketplace_listing_job_valid'));
  assert.ok(result.includes('to supabase_auth_admin;'));
  assert.ok(result.includes('from public,anon,authenticated;'));
  assert.ok(!result.includes('inventory_item_sale_states'));
  assert.ok(!result.includes('beta_discord_links'));
  assert.throws(() => completeAiConnectionMigration('', schema), /Tabelle fehlt/);
});
