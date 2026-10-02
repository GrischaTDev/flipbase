import { createBetaEmailBrowserFixture } from './beta-email-browser-fixture.mjs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const source = process.env.EBAY_BROWSER_SUPABASE_WORKDIR
  ? resolve(process.env.EBAY_BROWSER_SUPABASE_WORKDIR)
  : root;
const config = await readFile(join(source, 'supabase/config.toml'), 'utf8');
if (!/port = 54351\b/.test(config))
  throw new Error('Browserfixture benötigt ausdrücklich die lokale Test-API auf Port 54351.');
const scratch = await mkdtemp(join(tmpdir(), 'flipbase-ebay-browser-'));
await mkdir(join(scratch, 'supabase'));
await writeFile(join(scratch, 'supabase/config.toml'), config);
await cp(join(root, 'supabase/functions'), join(scratch, 'supabase/functions'), {
  recursive: true,
});
const entry = join(scratch, 'supabase/functions/ebay-account');
await cp(join(entry, 'index.ts'), join(entry, 'index.production.ts'));
await cp(
  join(root, 'supabase/test-support/ebay-order-provider-fixture.ts'),
  join(entry, 'provider-fixture.ts'),
);
await writeFile(
  join(entry, 'index.ts'),
  "import { installEbayOrderProviderFixture } from './provider-fixture.ts';\ninstallEbayOrderProviderFixture();\nawait import('./index.production.ts');\nconsole.log('FLIPBASE_EBAY_TEST_PROVIDER_READY');\n",
);
const betaEmail = await createBetaEmailBrowserFixture();
const environment = join(scratch, 'test.env');
await writeFile(
  environment,
  `BETA_APPLICATION_PEPPER=local-browser-only-pepper
BETA_APPLICATION_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200
BETA_INVITE_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200
BETA_APP_URL=http://127.0.0.1:4200
BETA_SMTP_HOST=${process.platform === 'linux' ? '172.17.0.1' : 'host.docker.internal'}
BETA_SMTP_PORT=54361
BETA_SMTP_USER=local
BETA_SMTP_PASS=local
BETA_SMTP_FROM_EMAIL=beta@flipbase.local
BETA_SMTP_FROM_NAME=Flipbase
FLIPBASE_EBAY_TEST_PROVIDER=isolated
EBAY_CLIENT_ID=flipbase-local-test
EBAY_CLIENT_SECRET=local-test-only
EBAY_REDIRECT_URI_NAME=local-test-only
EBAY_TOKEN_ENCRYPTION_KEY=${Buffer.alloc(32, 7).toString('base64')}
EBAY_APP_URL=http://127.0.0.1:4200
EBAY_ALLOWED_ORIGINS=http://127.0.0.1:4200
EBAY_ENVIRONMENT=production
EBAY_DELETION_VERIFICATION_TOKEN=flipbase_local_deletion_test_only_1234
EBAY_DELETION_ENDPOINT=https://example.test/ebay-deletion
`,
  { mode: 0o600 },
);
const cli = resolve(root, 'node_modules/supabase/dist/supabase.js');
const child = spawn(
  process.execPath,
  [cli, 'functions', 'serve', '--workdir', scratch, '--env-file', environment],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let providerReady = false;
for (const output of [child.stdout, child.stderr])
  output.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.includes('FLIPBASE_EBAY_TEST_PROVIDER_READY')) providerReady = true;
    process.stdout.write(text);
  });
child.on('error', (error) => {
  console.error(error);
  stopped = true;
  process.exitCode = 1;
});
let stopped = false;
const stop = () => {
  stopped = true;
  child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  stopped = true;
  server.close();
  void betaEmail.close();
  process.exitCode = code ?? 0;
});
const server = createServer((_request, response) => {
  response.end('eBay-Testanbieter bereit');
});
for (let attempt = 0; attempt < 90 && !stopped; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:54351/functions/v1/ebay-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (
      providerReady &&
      response.status === 401 &&
      (await response.json()).error === 'unauthorized'
    ) {
      server.listen(54359, '127.0.0.1');
      break;
    }
  } catch {
    /* Die Edge-Runtime startet noch. */
  }
  await delay(500);
  if (attempt === 89) {
    stop();
    throw new Error('eBay-Testanbieter startet nicht.');
  }
}
