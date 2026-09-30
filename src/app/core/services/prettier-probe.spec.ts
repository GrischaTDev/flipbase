import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as prettier from 'prettier';

const path = 'src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts';

describe('Prettier probe', () => {
  it('prints the exact formatted account settings test', async () => {
    const source = await readFile(path, 'utf8');
    const config = (await prettier.resolveConfig(path)) ?? {};
    const formatted = await prettier.format(source, { ...config, filepath: path });
    console.log(`PRETTIER_PROBE:${Buffer.from(formatted).toString('base64')}`);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
