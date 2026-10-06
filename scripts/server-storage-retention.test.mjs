import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Speicherbereinigung schützt Container, Rückfallversionen und externe Sicherungen', () => {
  const script = fileURLToPath(new URL('./server-storage-retention.test.py', import.meta.url));
  const python =
    process.env.FLIPBASE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-B', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});
