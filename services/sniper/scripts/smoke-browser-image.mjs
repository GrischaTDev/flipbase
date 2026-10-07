import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const image = process.argv[2];
if (!image || image.startsWith('-')) throw new Error('Ein Bot-Abbild angeben.');
const name = `flipbase-sniper-browser-smoke-${randomUUID()}`;
const seccomp = fileURLToPath(new URL('../../../deploy/chromium-seccomp.json', import.meta.url));
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
// Ein ausschließlich lokaler Katalog beweist Transport und Bedienung ohne Vinted-Abrufe.
const probe = String.raw`
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { ChromeVintedBrowser } from './dist/browser/vinted-browser.js';
import { chromium } from 'playwright';
await mkdir(process.env.HOME, { recursive: true });
let scripts = 0;
let input = '';
let cookie = '';
const server = createServer((request, response) => {
  if (request.url.startsWith('/executed')) { scripts++; response.end('ok'); return; }
  if (request.url.startsWith('/input')) { input = new URL(request.url, 'http://localhost').searchParams.get('text'); response.end('ok'); return; }
  cookie = request.headers.cookie ?? '';
  response.setHeader('Set-Cookie', 'sniper_smoke=persisted; Max-Age=3600; Path=/');
  response.end('<html><body><h1>Local catalog</h1><input id="text" autofocus oninput="fetch(\'/input?text=\'+encodeURIComponent(this.value))"><script>fetch(\'/executed\')</script></body></html>');
});
await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
const baseUrl = 'http://127.0.0.1:8765';
const options = { profileDir: '/profile', cdpPort: 9228 };
let browser = new ChromeVintedBrowser(baseUrl, options);
try {
  assert.notEqual(process.getuid(), 0);
  const first = await browser.fetch(baseUrl + '/catalog', { signal: AbortSignal.timeout(20000) });
  assert.equal(first.status, 200);
  assert.match(await first.text(), /Local catalog/);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(scripts, 0, 'Automatic document interception must prevent JavaScript');
  assert.equal(first.headers.get('set-cookie'), null, 'Chrome owns cookies');
  const listeners = await readFile('/proc/net/tcp', 'utf8');
  assert.match(listeners, /0100007F:240C/, 'CDP must listen on loopback');
  assert.doesNotMatch(listeners, /00000000:240C/, 'CDP must not listen publicly');
  const inspection = await chromium.connectOverCDP('http://127.0.0.1:9228', { noDefaults: true });
  try {
    const page = inspection.contexts()[0].pages()[0];
    await page.goto('chrome://sandbox');
    const status = await page.locator('body').innerText();
    assert.match(status, /Seccomp-BPF sandbox\s+Yes/, 'Chrome renderer sandbox must be active');
    assert.match(status, /Layer 1 Sandbox\s+Namespace/, 'Chrome namespace sandbox must be active');
    assert.match(status, /PID namespaces\s+Yes/, 'Chrome PID isolation must be active');
    await page.goto('about:blank');
  } finally { await inspection.close(); }
  await browser.openManual(new URL(baseUrl + '/catalog'));
  for (let attempt = 0; attempt < 50 && !scripts; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(scripts, 1, 'Native manual navigation must execute the ordinary page');
  const frame = await browser.captureFrame();
  assert.ok(frame.length > 100);
  assert.equal(frame[0], 255); assert.equal(frame[1], 216);
  await browser.input({ kind: 'text', text: 'manual-smoke' });
  for (let attempt = 0; attempt < 50 && input !== 'manual-smoke'; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(input, 'manual-smoke', 'Native desktop typing must reach the focused page');
  await browser.stopManual();
  await browser.close();
  browser = new ChromeVintedBrowser(baseUrl, options);
  const afterRestart = await browser.fetch(baseUrl + '/catalog', { signal: AbortSignal.timeout(20000) });
  assert.equal(afterRestart.status, 200);
  assert.match(cookie, /sniper_smoke=persisted/, 'Cookies must survive native Chrome restart');
  assert.equal(scripts, 1, 'Restarted automatic navigation must still prevent JavaScript');
  console.log('Chrome sandbox, private CDP, manual image/input, intercepted document and profile persistence verified.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
`;
let created = false;
try {
  docker(
    'create',
    '--name',
    name,
    '--network',
    'none',
    '--read-only',
    '--init',
    '--cap-drop',
    'ALL',
    '--cap-add',
    'SYS_CHROOT',
    '--security-opt',
    'no-new-privileges:true',
    '--security-opt',
    `seccomp=${seccomp}`,
    '--tmpfs',
    '/tmp:size=384m,mode=1777',
    '--tmpfs',
    '/profile:size=128m,uid=1000,gid=1000,mode=0700',
    '--shm-size',
    '128m',
    '--memory',
    '1g',
    '--pids-limit',
    '256',
    image,
    'node',
    '--input-type=module',
    '-e',
    probe,
  );
  created = true;
  console.log(docker('start', '--attach', name).trim());
  const exitCode = Number(docker('inspect', '--format', '{{.State.ExitCode}}', name).trim());
  if (exitCode !== 0) throw new Error(`Browser-Smoke fehlgeschlagen (${exitCode}).`);
} finally {
  if (created) docker('rm', '--force', name);
}
