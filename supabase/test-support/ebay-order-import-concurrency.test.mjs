import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEbayTestContainer } from './ebay-order-import-concurrency.mjs';
test('Paralleltest verlangt einen ausdrücklich benannten getrennten Testcontainer', () => {
  for (const name of [undefined, '', 'supabase-db', 'production', 'supabase_db_test;rm'])
    assert.throws(() => validateEbayTestContainer(name));
  assert.equal(
    validateEbayTestContainer('supabase_db_flipbase-ebay-test'),
    'supabase_db_flipbase-ebay-test',
  );
  assert.equal(
    validateEbayTestContainer('flipbase-ebay-test-20261001-import'),
    'flipbase-ebay-test-20261001-import',
  );
});
