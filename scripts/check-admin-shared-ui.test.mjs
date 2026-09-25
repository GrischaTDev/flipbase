import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkAdminSharedUi, findAdminSharedUiViolations } from './check-admin-shared-ui.mjs';

test('rejects native selects, local status pills and black primary variants in admin templates', () => {
  const source = `
    <select class="linear-input"><option>Alle</option></select>
    <span class="rounded-full bg-emerald-500/20 px-2 text-emerald-300">Aktiv</span>
    <app-button variant="primary-dark">Speichern</app-button>
  `;

  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'native-select', line: 2 },
    { rule: 'local-status-pill', line: 3 },
    { rule: 'black-primary-variant', line: 4 },
  ]);
});

test('requires an icon for compact remove and delete actions', () => {
  const source = `
    <app-button size="slim">Entfernen</app-button>
    <app-button size="slim">Löschen</app-button>
    <app-button size="slim" [icon]="trashIcon" [iconOnly]="true" ariaLabel="Bild entfernen" />
    <app-button modal-footer>Schließen</app-button>
  `;
  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'text-only-destructive-action', line: 2 },
    { rule: 'text-only-destructive-action', line: 3 },
  ]);
});

test('rejects native standard form controls and custom modal shells outside the legacy allowlist', () => {
  assert.deepEqual(
    findAdminSharedUiViolations(
      'src/app/features/example/example.html',
      '<input type="number" />\n<textarea></textarea>',
    ),
    [
      { rule: 'native-form-control', line: 1 },
      { rule: 'native-form-control', line: 2 },
    ],
  );
  assert.deepEqual(
    findAdminSharedUiViolations(
      'src/app/features/example/dialog.component.html',
      '<div appModalDialog></div>',
    ),
    [{ rule: 'custom-modal-shell', line: 1 }],
  );
});

test('keeps technical native inputs outside the standard-form rule', () => {
  const source = `
    <input type="file" class="sr-only" />
    <input type="range" />
    <input type="checkbox" />
    <input type="radio" />
  `;
  assert.deepEqual(
    findAdminSharedUiViolations('src/app/features/example/example.html', source),
    [],
  );
});

test('rejects local managed-table shells and native table search controls', () => {
  const source = `
    <app-table-column-menu />
    <app-table-toolbar></app-table-toolbar>
    <input type="search" />
    <table class="linear-table"></table>
  `;

  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'direct-table-column-menu', line: 2 },
    { rule: 'legacy-table-toolbar', line: 3 },
    { rule: 'native-table-search', line: 4 },
    { rule: 'managed-table-without-data-table', line: 5 },
  ]);
});

test('rejects a table outside a data table even when another data table is present', () => {
  const source = `
    <app-data-table>
      <div table-content><table class="linear-table"></table></div>
    </app-data-table>
    <table class="linear-table"></table>
  `;

  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'managed-table-without-data-table', line: 5 },
  ]);
});

test('accepts a managed table in the table-content slot', () => {
  const source = `
    <app-data-table>
      <div table-content><table class="linear-table"></table></div>
    </app-data-table>
  `;

  assert.deepEqual(
    findAdminSharedUiViolations('src/app/features/example/example.html', source),
    [],
  );
});

test('rejects a table exception outside the exact allowlist', () => {
  const source = '<table data-shared-ui-exception="static-table"></table>';
  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'unapproved-table-exception', line: 1 },
  ]);
});

test('requires a managed table to use the table-content slot', () => {
  const source = '<app-data-table><div><table></table></div></app-data-table>';
  assert.deepEqual(findAdminSharedUiViolations('src/app/features/example/example.html', source), [
    { rule: 'table-outside-content-slot', line: 1 },
  ]);
});

test('accepts a managed table inside the table-content slot', () => {
  const source = '<app-data-table><div table-content><table></table></div></app-data-table>';
  assert.deepEqual(
    findAdminSharedUiViolations('src/app/features/example/example.html', source),
    [],
  );
});

test('accepts only the declared exception kind at its declared path', () => {
  const path = 'src/app/features/purchases/pages/purchase-print/purchase-print.component.html';
  assert.deepEqual(
    findAdminSharedUiViolations(path, '<table data-shared-ui-exception="static-table"></table>'),
    [],
  );
  assert.deepEqual(
    findAdminSharedUiViolations(path, '<table data-shared-ui-exception="embedded-table"></table>'),
    [{ rule: 'unapproved-table-exception', line: 1 }],
  );
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
    await writeFile(
      join(root, path),
      '<app-data-table><div table-content><table></table></div></app-data-table>',
      'utf8',
    );
    await assert.doesNotReject(checkAdminSharedUi(root));

    await writeFile(join(root, path), '<select></select>', 'utf8');
    await assert.rejects(checkAdminSharedUi(root), /example\.html:1 native-select/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('prevents native form controls in migrated expenses and settings areas', () => {
  for (const path of [
    'src/app/features/expenses/components/example/example.component.html',
    'src/app/features/settings/pages/example/example.component.html',
  ]) {
    assert.deepEqual(
      findAdminSharedUiViolations(path, '<input type="text" />\n<textarea></textarea>'),
      [
        { rule: 'native-form-control', line: 1 },
        { rule: 'native-form-control', line: 2 },
      ],
    );
    assert.deepEqual(
      findAdminSharedUiViolations(
        path,
        '<input type="file" class="sr-only" data-shared-ui-exception="native-file-picker" />',
      ),
      [],
    );
    assert.deepEqual(findAdminSharedUiViolations(path, '<input type="file" />'), [
      { rule: 'native-form-control', line: 1 },
    ]);
  }
});

test('prevents new native controls in the unified purchase workspace but allows hidden file transport', () => {
  const path =
    'src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html';
  assert.deepEqual(
    findAdminSharedUiViolations(
      path,
      '<button>Save</button>\n<input type="text" />\n<textarea></textarea>',
    ),
    [
      { rule: 'native-workspace-control', line: 1 },
      { rule: 'native-workspace-control', line: 2 },
      { rule: 'native-workspace-control', line: 3 },
    ],
  );
  assert.deepEqual(
    findAdminSharedUiViolations(
      path,
      '<app-button>Import</app-button><input type="file" class="hidden" data-shared-ui-exception="native-file-picker" />',
    ),
    [],
  );
  assert.deepEqual(findAdminSharedUiViolations(path, '<input type="file" />'), [
    { rule: 'native-workspace-control', line: 1 },
  ]);
});
