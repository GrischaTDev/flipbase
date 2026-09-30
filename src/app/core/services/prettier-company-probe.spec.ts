import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as prettier from 'prettier';

const paths = [
  'docs/superpowers/plans/2026-09-30-company-settings-foundation.md',
  'src/app/core/models/company-profile.models.ts',
  'src/app/core/services/audit-export.service.spec.ts',
  'src/app/core/services/company-profile.service.dom.spec.ts',
  'src/app/core/services/company-profile.service.ts',
  'src/app/core/utils/company-logo-validation.dom.spec.ts',
  'src/app/core/utils/company-logo-validation.ts',
  'src/app/features/settings/pages/company-settings/company-settings.component.angular.spec.ts',
  'src/app/features/settings/pages/company-settings/company-settings.component.html',
  'src/app/features/settings/pages/company-settings/company-settings.component.ts',
  'src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts',
  'src/app/features/settings/settings.routes.spec.ts',
] as const;

describe('Company prettier probe', () => {
  it('prints exact prettier output for company files', async () => {
    for (const path of paths) {
      const source = await readFile(path, 'utf8');
      const config = (await prettier.resolveConfig(path)) ?? {};
      const formatted = await prettier.format(source, { ...config, filepath: path });
      console.log(`PRETTIER_COMPANY:${path}:${Buffer.from(formatted).toString('base64')}`);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});
