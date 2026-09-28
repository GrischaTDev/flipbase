import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmVintedEdit } from '../src/vinted-edit-confirmation.ts';

test('bestätigt erst nach einem späteren passenden Anbieterwert', async () => {
  let reads = 0;
  const result = await confirmVintedEdit(
    async () => (++reads === 1 ? 'Alt' : 'Neu'),
    (value) => value === 'Neu',
    1_000,
  );
  assert.equal(result, 'confirmed');
  assert.equal(reads, 2);
});

test('ein Lesefehler nach dem Klick bedeutet keinen sicheren Misserfolg', async () => {
  const result = await confirmVintedEdit(
    async () => {
      throw new Error('Verbindung unterbrochen');
    },
    () => true,
    5,
  );
  assert.equal(result, 'unconfirmed');
});
