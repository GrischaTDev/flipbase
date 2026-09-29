import { readFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'src/app/core/config/workspace-navigation.ts',
  'src/app/core/config/workspace-navigation.spec.ts',
  'src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts',
  'src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html',
  'src/app/features/sales/components/sale-create-modal/sale-entry-refactor.angular.spec.ts',
  'src/app/features/sales/pages/sale-create/sale-create.component.ts',
  'src/app/features/sales/pages/sale-create/sale-create.component.html',
  'docs/sales-entry-refactor-2026-09-29.md',
];

// Zeigt bei Abweichungen den konkreten Unterschied statt nur des Dateinamens.
// Der Test liest ausschließlich Quellen; er ändert weder Dateien noch CI-Regeln.
describe('Format der überarbeiteten Verkaufserfassung', () => {
  it.each(files)('entspricht der Projektformatierung: %s', async (filepath) => {
    const source = await readFile(filepath, 'utf8');
    const options = await resolveConfig(filepath);
    const expected = await format(source, { ...options, filepath });

    expect(source).toBe(expected);
  });
});
