import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateSecuritySupplement } from './product-security-supplement.mjs';

const sources = [
  'database.sql',
  '60_catalog_product_media.sql',
  '65_purchase_receipts.sql',
  '80_workspace_retention.sql',
].map((name) => readFileSync(new URL(`../supabase/schemas/${name}`, import.meta.url), 'utf8'));

test('generates all eight exact storage policies and explicit security resets from source', () => {
  const sql = generateSecuritySupplement(sources);
  assert.equal((sql.match(/create policy /gi) ?? []).length, 8);
  assert.equal((sql.match(/drop policy if exists /gi) ?? []).length, 8);
  assert.match(
    sql,
    /revoke all on function public\.protect_workspace_media_object\(\) from public,anon,authenticated,service_role;/,
  );
  assert.match(
    sql,
    /revoke all on table public\.purchase_receipt_requests from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.receive_purchase_lines_idempotent\(uuid,uuid,uuid,jsonb\) to authenticated;/,
  );
  assert.equal(sql, generateSecuritySupplement(sources));
});

test('fails closed for missing or duplicate policy definitions and missing ACL resets', () => {
  assert.throws(
    () =>
      generateSecuritySupplement(
        sources.map((source) =>
          source.replace('"Artikelmedien lesen"', '"Unrelated storage policy"'),
        ),
      ),
    /unexpected policy/i,
  );
  const withSemicolon = sources.map((source) =>
    source.replaceAll("bucket_id = 'item-media'", "bucket_id = 'item;media'"),
  );
  assert.match(generateSecuritySupplement(withSemicolon), /bucket_id = 'item;media'/);
  assert.throws(() => generateSecuritySupplement(sources.slice(1)), /polic/i);
  assert.throws(() => generateSecuritySupplement([...sources, sources[1]]), /duplicate/i);
  assert.throws(
    () =>
      generateSecuritySupplement(
        sources.map((source) =>
          source.replace(
            /revoke all on function public\.protect_workspace_media_object\(\)[^;]+;/,
            '',
          ),
        ),
      ),
    /ACL/i,
  );
});
