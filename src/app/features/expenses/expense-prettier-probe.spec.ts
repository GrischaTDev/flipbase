import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import prettier from 'prettier';

describe('expense dialog formatter probe', () => {
  it('prints the exact Angular formatter output', async () => {
    const path =
      'src/app/features/expenses/components/expense-dialog/expense-dialog.component.html';
    const source = readFileSync(path, 'utf8');
    const formatted = await prettier.format(source, { parser: 'angular' });

    if (formatted !== source) {
      console.log('EXPENSE_FORMAT_START');
      console.log(formatted);
      console.log('EXPENSE_FORMAT_END');
    }

    expect(source).toBe(formatted);
  });
});
