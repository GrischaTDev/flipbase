import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkAdminSharedUi, findAdminSharedUiViolations } from './check-admin-shared-ui.mjs';

test('rejects native selects and locally styled status pills in admin feature templates', () => {
  const source = `
    <select class="linear-input"><option>Alle</option></select>
    <span class="rounded-full bg-emerald-500/20 px-2 text-emerald-300">Aktiv</span>
  `;

  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'native-select', line: 2 },
    { rule: 'local-status-pill', line: 3 },
  ]);
});

test('accepts shared controls and documented native technical inputs', () => {
  const source = `
    <app-custom-select label="Status" />
    <app-badge tone="success">Aktiv</app-badge>
    <input type="file" class="sr-only" data-shared-ui-exception="native-file-picker" />
  `;

  assert.deepEqual(
    findAdminSharedUiViolations('src/app/features/example/example.html', source),
    [],
  );
});

test('requires zero findings in admin feature templates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-shared-ui-'));
  try {
    const feature = join(root, 'src/app/features/example');
    await mkdir(feature, { recursive: true });
    const path = 'src/app/features/example/example.html';
    await writeFile(join(root, path), '<app-custom-select />', 'utf8');
    await assert.doesNotReject(checkAdminSharedUi(root));

    await writeFile(join(root, path), '<select></select>', 'utf8');
    await assert.rejects(checkAdminSharedUi(root), /example\.html:1 native-select/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
