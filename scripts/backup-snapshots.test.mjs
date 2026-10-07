import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Tagesstände und Borg schützen unbestätigte, beschädigte und fehlende Sicherungen', () => {
  const script = fileURLToPath(new URL('./backup-snapshots.test.py', import.meta.url));
  const python =
    process.env.FLIPBASE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-B', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});
