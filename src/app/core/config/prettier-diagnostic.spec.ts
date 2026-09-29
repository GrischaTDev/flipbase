import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { format, resolveConfig } from 'prettier';

const paths = [
  'src/app/core/config/master-data-table.config.ts',
  'src/app/core/services/sources.service.ts',
  'src/app/features/master-data/master-data.component.html',
  'src/app/features/master-data/master-data.component.ts',
  'src/app/features/sellers/sellers.component.html',
] as const;

describe('temporary prettier diagnostic', () => {
  it('prints canonical formatting for the remaining files', async () => {
    for (const path of paths) {
      const source = await readFile(path, 'utf8');
      const config = (await resolveConfig(path)) ?? {};
      const formatted = await format(source, { ...config, filepath: path });
      console.log(`FORMAT_RESULT:${path}:${Buffer.from(formatted).toString('base64')}`);
    }

    expect(false).toBe(true);
  });
});
