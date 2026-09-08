import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Ausschließlich die kurzlebige lokale Runner-Datenbank, niemals ein verknüpftes Projekt.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
);
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const client = createClient(status.API_URL, status.ANON_KEY, options);
const email = `storage-${randomUUID()}@example.test`;
const password = randomUUID();
const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
assert.equal(user.error, null);
assert.ok(user.data.user);
const workspaceId = randomUUID();
const productId = randomUUID();
for (const [table, row] of [
  ['workspaces', { id: workspaceId, name: 'Disposable media runtime' }],
  ['workspace_members', { workspace_id: workspaceId, user_id: user.data.user.id, role: 'owner' }],
  ['catalog_products', { id: productId, workspace_id: workspaceId, title: 'Runtime product' }],
])
  assert.equal((await admin.from(table).insert(row)).error, null);
assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
const path = `catalog-products/${workspaceId}/${productId}/${randomUUID()}.png`;
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=',
  'base64',
);
assert.equal(
  (
    await client.storage
      .from('item-media')
      .upload(path, bytes, { contentType: 'image/png', upsert: false })
  ).error,
  null,
);
const denied = await client.storage.from('item-media').createSignedUrl(path, 60);
assert.equal(String(denied.error?.statusCode), '404', 'Unregistered object must be hidden by RLS');
const metadata = await client
  .from('catalog_product_media')
  .insert({
    workspace_id: workspaceId,
    catalog_product_id: productId,
    storage_path: path,
    sort_order: -1,
  });
assert.equal(metadata.error?.code, '23514', 'Invalid sort order must fail its check constraint');
const removed = await client.storage.from('item-media').remove([path]);
assert.equal(removed.error, null);
assert.equal(removed.data?.length, 1, 'Real Storage API must remove the exact orphan upload');
const missing = await admin.storage.from('item-media').download(path);
assert.equal(String(missing.error?.statusCode), '404', 'Object must actually be gone');
console.log(
  'Storage runtime: upload, denied read, metadata failure and exact-path rollback passed.',
);
