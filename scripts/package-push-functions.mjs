import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [destination, requestedCommit] = process.argv.slice(2);
const commit = requestedCommit || '0000000000000000000000000000000000000000';
if (!destination || !/^[a-f0-9]{40}$/u.test(commit ?? ''))
  throw new Error('Push artifact requires a release commit');
const sources = {
  'push-main/index.ts': 'deploy/push-main/index.ts',
  'push-settings/index.ts': 'supabase/functions/push-settings/index.ts',
  'push-settings/handler.ts': 'supabase/functions/push-settings/handler.ts',
  'push-settings/contracts.ts': 'supabase/functions/push-settings/contracts.ts',
  'push-revoke/index.ts': 'supabase/functions/push-revoke/index.ts',
  'push-revoke/handler.ts': 'supabase/functions/push-revoke/handler.ts',
  'ebay-order-observer/index.ts': 'supabase/functions/ebay-order-observer/index.ts',
  'ebay-order-observer/handler.ts': 'supabase/functions/ebay-order-observer/handler.ts',
};
for (const name of [
  'ebay-api',
  'ebay-config',
  'ebay-token-encryption',
  'ebay-contracts',
  'ebay-xml',
  'ebay-order-source',
  'ebay-order-amounts',
  'ebay-order-import-contracts',
  'marketplace-contracts',
])
  sources[`_shared/${name}.ts`] = `supabase/functions/_shared/${name}.ts`;
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'deployment.json'), `${JSON.stringify({ commit })}\n`);
for (const [file, source] of Object.entries(sources)) {
  await mkdir(join(destination, file, '..'), { recursive: true });
  await copyFile(source, join(destination, file));
}
const manifest = [];
for (const file of [...Object.keys(sources), 'deployment.json'].sort())
  manifest.push(
    `${createHash('sha256')
      .update(await readFile(join(destination, file)))
      .digest('hex')}  ${file}`,
  );
await writeFile(join(destination, 'manifest.sha256'), `${manifest.join('\n')}\n`);
