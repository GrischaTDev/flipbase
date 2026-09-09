import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const schemaPath = fileURLToPath(new URL('../supabase/schemas/database.sql', import.meta.url));

async function extractCreatePurchaseSupplierPattern() {
  const schema = await readFile(schemaPath, 'utf8');
  const functionStart = schema.indexOf('create or replace function public.create_purchase(');
  const functionEnd = schema.indexOf('\n$$;', functionStart);
  assert.notEqual(functionStart, -1, 'create_purchase fehlt im deklarativen Schema');
  assert.notEqual(functionEnd, -1, 'create_purchase ist im deklarativen Schema unvollständig');
  const functionDefinition = schema.slice(functionStart, functionEnd);
  const match = functionDefinition.match(/p_purchase ->> 'supplier_id'\) !~\* '([^']+)'/u);
  assert.ok(match, 'create_purchase enthält keine Lieferanten-ID-Formprüfung');
  return new RegExp(match[1], 'i');
}

test('create_purchase akzeptiert eine vollständige UUID als Lieferanten-ID', async () => {
  const supplierPattern = await extractCreatePurchaseSupplierPattern();
  assert.equal(supplierPattern.test('a8100000-0000-4000-8000-000000000021'), true);
});

test('create_purchase lehnt unvollständige und ungültige Lieferanten-IDs ab', async () => {
  const supplierPattern = await extractCreatePurchaseSupplierPattern();
  assert.equal(supplierPattern.test('a8100000-0000-4000-8000-000000000021-extra'), false);
  assert.equal(supplierPattern.test('a8100000-0000-4000-000000000021'), false);
  assert.equal(supplierPattern.test('kein-lieferant'), false);
});
