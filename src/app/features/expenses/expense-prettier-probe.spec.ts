import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import prettier from 'prettier';

const cases = [
  {
    label: 'HTML',
    path: 'src/app/features/expenses/components/expense-dialog/expense-dialog.component.html',
    parser: 'angular',
  },
  {
    label: 'SPEC',
    path: 'src/app/features/expenses/expenses.component.angular.spec.ts',
    parser: 'typescript',
  },
] as const;

describe('expense formatter probe', () => {
  it('prints exact project formatter output', async () => {
    let changed = false;

    for (const entry of cases) {
      const source = readFileSync(entry.path, 'utf8');
      const formatted = await prettier.format(source, {
        parser: entry.parser,
        printWidth: 100,
        singleQuote: true,
      });

      if (formatted !== source) {
        changed = true;
        console.log(`EXPENSE_${entry.label}_FORMAT_START`);
        console.log(formatted);
        console.log(`EXPENSE_${entry.label}_FORMAT_END`);
      }
    }

    expect(changed).toBe(false);
  });
});
