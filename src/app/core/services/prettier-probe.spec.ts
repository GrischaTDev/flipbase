import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as prettier from 'prettier';

const paths = [
  'docs/superpowers/plans/2026-09-30-account-settings-modernization.md',
  'docs/superpowers/specs/2026-09-30-account-company-settings-design.md',
  'src/app/core/services/auth.service.spec.ts',
  'src/app/core/services/auth.service.ts',
  'src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts',
  'src/app/features/settings/pages/account-settings/account-settings.component.html',
  'src/app/features/settings/pages/account-settings/account-settings.component.ts',
] as const;

describe('Prettier probe', () => {
  it('prints the exact formatted sources for the account PR', async () => {
    for (const path of paths) {
      const source = await readFile(path, 'utf8');
      const config = (await prettier.resolveConfig(path)) ?? {};
      const formatted = await prettier.format(source, { ...config, filepath: path });
      console.log(`PRETTIER_PROBE:${path}:${Buffer.from(formatted).toString('base64')}`);
    }

    expect(paths).toHaveLength(7);
  });
});
