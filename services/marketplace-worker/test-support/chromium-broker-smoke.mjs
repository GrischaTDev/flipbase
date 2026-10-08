import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { ChromiumBrokerClient } from '../dist/chromium-broker-client.js';

const root = '/var/lib/flipbase-marketplace/profiles';
const profileId = 'chromium_41000000-0000-4000-8000-000000000001';
await mkdir(root, { recursive: true });
// Selbst ein kompromittierter Worker kann damit den vom Broker gewählten Host-Bind nicht ändern.
await symlink('/etc', `${root}/${profileId}`);
const client = await ChromiumBrokerClient.create(root);
for (let attempt = 0; ; attempt++) {
  try {
    assert.deepEqual(await client.inspectProfileProcesses(`${root}/${profileId}`), []);
    break;
  } catch (error) {
    if (attempt === 19) throw error;
    await setTimeout(250);
  }
}
const handle = await client.launch(`${root}/${profileId}`, {
  headless: false,
  chromiumSandbox: true,
  locale: 'de-DE',
  viewport: { width: 1280, height: 900 },
  args: ['--disable-dev-shm-usage'],
  acceptDownloads: false,
  timeout: 60000,
});
await handle.run(async (browser) => {
  const image = await browser.capture();
  assert.deepEqual([...image.subarray(0, 3)], [255, 216, 255]);
  assert.equal(await browser.identify(), null);
  await browser.click(0.5, 0.75);
  await browser.type('broker-fixture');
  await browser.press('Escape');
});
// Die feste API gibt weder BrowserContext noch CDP-Endpunkt an den Controller zurück.
assert.equal(Object.hasOwn(handle, 'contexts'), false);
await handle.close();
assert.deepEqual(await client.inspectProfileProcesses(`${root}/${profileId}`), []);
await client.recover(profileId);
await client.archive(profileId);
await client.archive(profileId);
process.stdout.write(
  'Privater Broker: isolierte Aktionen, native Bedienung, Stopp und Archivierung bestätigt.\n',
);
