import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as prettier from 'prettier';

const target = 'e2e/company-settings.spec.ts';

describe('Company e2e formatting', () => {
  it('prints the formatter result', async () => {
    const source = await readFile(target, 'utf8');
    const config = (await prettier.resolveConfig(target)) ?? {};
    const formatted = await prettier.format(source, { ...config, filepath: target });
    console.log(`COMPANY_E2E_FORMAT:${Buffer.from(formatted).toString('base64')}`);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
