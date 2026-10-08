import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChromiumBrokerClient } from '../dist/chromium-broker-client.js';

const execute = promisify(execFile);
const profileRoot = '/var/lib/flipbase-marketplace/profiles';
const first = 'chromium_42000000-0000-4000-8000-000000000001';
const second = 'chromium_42000000-0000-4000-8000-000000000002';
const client = await ChromiumBrokerClient.create(profileRoot);
const settings = {
  headless: false,
  chromiumSandbox: true,
  locale: 'de-DE',
  viewport: { width: 1280, height: 900 },
  acceptDownloads: false,
  timeout: 60000,
};
async function container(profileId) {
  const { stdout } = await execute('docker', [
    'ps',
    '--quiet',
    '--no-trunc',
    '--filter',
    `label=de.flipbase.chromium.profile=${profileId}`,
  ]);
  const id = stdout.trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  return id;
}
async function inside(id, source) {
  // Das simuliert vollständige Codeausführung im unprivilegierten Sitzungsprozess.
  const { stdout } = await execute('docker', [
    'exec',
    '-i',
    id,
    'node',
    '--input-type=module',
    '-e',
    source,
  ]);
  return stdout.trim();
}
async function start(profileId) {
  const before = performance.now();
  const handle = await client.launch(`${profileRoot}/${profileId}`, settings);
  process.stdout.write(
    `${JSON.stringify({ event: 'startup', milliseconds: Math.round(performance.now() - before) })}\n`,
  );
  return handle;
}
const handle = await start(first);
const id = await container(first);
// Auch ein vollständig übernommener Sitzungsprozess erhält keinen externen CDP-Zugang.
const { stdout: inspect } = await execute('docker', ['inspect', id]);
const address = Object.values(JSON.parse(inspect)[0].NetworkSettings.Networks)[0].IPAddress;
await assert.rejects(
  new Promise((resolve, reject) => {
    import('node:net')
      .then(({ connect }) => {
        const socket = connect({ host: address, port: 9222 });
        socket.setTimeout(1500, () => {
          socket.destroy();
          reject(new Error('CDP closed'));
        });
        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.on('error', reject);
      })
      .catch(reject);
  }),
);
await inside(
  id,
  `import assert from 'node:assert/strict';import{access,readFile}from'node:fs/promises';for(const path of ['/var/run/docker.sock','/run/secrets/chromium-broker-token','/var/lib/flipbase-chromium','/var/lib/flipbase-marketplace','/profile/../${second}'])await assert.rejects(access(path));assert.equal(Object.keys(process.env).some(key=>/SUPABASE|SERVICE_ROLE|GOLOGIN|BROKER_TOKEN/i.test(key)),false);const{chromium}=await import('playwright');const browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});await browser.contexts()[0].addCookies([{name:'fixture_marker',value:'persistent',domain:'fixture.invalid',path:'/',expires:Date.now()/1000+3600}]);assert.equal(await browser.contexts()[0].pages()[0].evaluate(()=>navigator.webdriver),false);process.exit(0);`,
);
for (let index = 0; index < 3; index++) {
  const before = performance.now();
  await handle.run(async (browser) => {
    assert.equal(await browser.identify(), null);
    const image = await browser.capture();
    assert.deepEqual([...image.subarray(0, 3)], [255, 216, 255]);
  });
  assert.equal(await container(first), id);
  process.stdout.write(
    `${JSON.stringify({ event: 'reused_actions', milliseconds: Math.round(performance.now() - before) })}\n`,
  );
}
const { stdout: stats } = await execute('docker', [
  'stats',
  '--no-stream',
  '--format',
  '{{json .}}',
  id,
]);
process.stdout.write(`${stats.trim()}\n`);
await handle.close();
await assert.rejects(handle.run((browser) => browser.identify()));
assert.deepEqual(await client.inspectProfileProcesses(`${profileRoot}/${first}`), []);
const other = await start(second);
const otherId = await container(second);
assert.notEqual(otherId, id);
await inside(
  otherId,
  `import assert from'node:assert/strict';const{chromium}=await import('playwright');const browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});assert.equal((await browser.contexts()[0].cookies()).some(cookie=>cookie.name==='fixture_marker'),false);process.exit(0);`,
);
await other.close();
const resumed = await start(first);
const resumedId = await container(first);
assert.notEqual(resumedId, id);
await inside(
  resumedId,
  `import assert from'node:assert/strict';const{chromium}=await import('playwright');const browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});assert.equal((await browser.contexts()[0].cookies()).find(cookie=>cookie.name==='fixture_marker')?.value,'persistent');process.exit(0);`,
);
await resumed.close();
process.stdout.write(
  'Isolierte Aktionen, Profilpersistenz, frische Kontowechsel und fehlende globale Rechte bestätigt.\n',
);
