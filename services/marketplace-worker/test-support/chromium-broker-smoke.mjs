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
const context = await client.launch(`${root}/${profileId}`, {
  headless: false,
  chromiumSandbox: true,
  locale: 'de-DE',
  viewport: { width: 1280, height: 900 },
  args: ['--disable-dev-shm-usage'],
  acceptDownloads: false,
  timeout: 60_000,
});
const page = context.pages()[0];
assert.ok(page);
await page.setContent(
  '<html><body style="margin:0"><textarea id="native-input" aria-label="Broker test" style="width:100vw;height:100vh;box-sizing:border-box"></textarea></body></html>',
);
const desktop = client.desktop(`${root}/${profileId}`);
await desktop.click(0.5, 0.75);
await desktop.type('broker-fixture');
assert.equal(await page.locator('#native-input').inputValue(), 'broker-fixture');
const image = await desktop.capture();
assert.deepEqual([...image.subarray(0, 3)], [255, 216, 255]);
await desktop.press('Tab');
await context.close();
assert.deepEqual(await client.inspectProfileProcesses(`${root}/${profileId}`), []);
// Stopp und Archivierung sind wiederholbar, ohne unklare Zustände freizugeben.
await client.recover(profileId);
await client.archive(profileId);
await client.archive(profileId);
process.stdout.write(
  'Privater Broker: Start, native Bedienung, Stopp und Archivierung bestätigt.\n',
);
