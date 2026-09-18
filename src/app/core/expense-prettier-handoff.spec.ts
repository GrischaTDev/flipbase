import { readFile } from 'node:fs/promises';
import { describe, it } from 'vitest';
import { format, resolveConfig } from 'prettier';

const files = [
  'src/app/app.routes.ts',
  'src/app/core/config/workspace-navigation.spec.ts',
  'src/app/core/config/workspace-navigation.ts',
  'src/app/core/i18n/translations.spec.ts',
  'src/app/core/i18n/translations.ts',
  'src/app/core/models/flipbase.models.ts',
  'src/app/core/models/operating-expense.models.spec.ts',
  'src/app/core/models/operating-expense.models.ts',
  'src/app/core/models/supabase.types.ts',
  'src/app/core/services/dashboard-report.service.spec.ts',
  'src/app/core/services/dashboard-report.service.ts',
  'src/app/core/services/operating-expense-actions.dom.spec.ts',
  'src/app/core/services/operating-expense-document.service.dom.spec.ts',
  'src/app/core/services/operating-expense-document.service.ts',
  'src/app/core/services/operating-expense.service.angular.spec.ts',
  'src/app/core/services/operating-expense.service.ts',
  'src/app/features/dashboard/dashboard.component.html',
  'src/app/features/dashboard/dashboard.component.ts',
  'src/app/features/expenses/components/expense-documents/expense-documents.component.angular.spec.ts',
  'src/app/features/expenses/components/expense-documents/expense-documents.component.ts',
  'src/app/features/expenses/expenses.component.angular.spec.ts',
  'src/app/features/expenses/expenses.component.ts',
  'docs/superpowers/specs/2026-09-18-expenses-foundation-design.md',
  'docs/superpowers/plans/2026-09-18-expenses-foundation.md',
];

describe('temporary expense prettier handoff', () => {
  it('prints CI-formatted changed files', async () => {
    for (const file of files) {
      try {
        const source = await readFile(file, 'utf8');
        const config = (await resolveConfig(file)) ?? {};
        const formatted = await format(source, { ...config, filepath: file });
        const encoded = Buffer.from(formatted, 'utf8').toString('base64');
        const chunks = encoded.match(/.{1,7000}/g) ?? [''];
        chunks.forEach((chunk, index) => {
          console.log(`__EXPENSE_FMT__|${file}|${index}|${chunks.length}|${chunk}`);
        });
      } catch {
        // Files absent from this branch are intentionally skipped.
      }
    }
  });
});
