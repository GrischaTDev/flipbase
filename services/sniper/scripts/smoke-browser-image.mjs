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
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { ChromeVintedBrowser } from './dist/browser/vinted-browser.js';
import { chromium } from 'playwright';
await mkdir(process.env.HOME, { recursive: true });
let scripts = 0;
const inputEvents = new Set();
let cookie = '';
let renewalExpires = 0;
let catalogRequests = 0;
let sessionRefreshes = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/session-refresh') {
    sessionRefreshes++;
    if ((url.searchParams.get('ref_url') ?? '').includes('session_refresh_challenge')) {
      response.end('<title>Just a moment...</title>challenge-running');
      return;
    }
    response.setHeader('Set-Cookie', 'refreshed=yes; Path=/');
    response.end('<html><script>setTimeout(() => location.replace(' + JSON.stringify(url.searchParams.get('ref_url')) + '), 25)</script></html>');
    return;
  }
  if (url.searchParams.has('session_refresh') || url.searchParams.has('session_loop') || url.searchParams.has('session_refresh_challenge')) {
    if (!(request.headers.cookie ?? '').includes('refreshed=yes') || url.searchParams.has('session_loop') || url.searchParams.has('session_refresh_challenge')) {
      response.writeHead(307, { location: '/session-refresh?ref_url=' + encodeURIComponent(request.url) });
      response.end();
    } else response.end('<html>Refreshed catalog</html>');
    return;
  }
  if (request.url.startsWith('/executed')) { scripts++; renewalExpires = Date.now() + 1800; response.end('ok'); return; }
  if (request.url === '/renew.js') { response.setHeader('Content-Type', 'application/javascript'); response.end('setTimeout(() => fetch("/executed"), 75)'); return; }
  if (request.url.startsWith('/input')) { inputEvents.add(new URL(request.url, 'http://localhost').searchParams.get('text')); response.end('ok'); return; }
  if (request.url.includes('challenge')) { response.writeHead(403, { 'cf-mitigated': 'challenge' }); response.end('<title>Just a moment...</title>challenge-running'); return; }
  if (request.url.includes('slow')) { return; }
  if (request.url.startsWith('/catalog')) {
    if (++catalogRequests === 1) renewalExpires = Date.now() + 1800;
    if (Date.now() > renewalExpires) { response.statusCode = 403; response.end('Script renewal expired'); return; }
  }
  cookie = request.headers.cookie ?? '';
  response.setHeader('Set-Cookie', 'sniper_smoke=persisted; Max-Age=3600; Path=/');
  response.end('<html><body><h1>Local catalog</h1><input id="text" autofocus oninput="fetch(\'/input?text=\'+encodeURIComponent(this.value))"><script src="/renew.js"></script></body></html>');
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
  assert.equal(scripts, 1, 'Automatic catalog navigation must allow external and delayed session scripts');
  assert.equal(first.headers.get('set-cookie'), null, 'Chrome owns cookies');
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 900));
    const next = await browser.fetch(baseUrl + '/catalog', { signal: AbortSignal.timeout(20000) });
    assert.equal(next.status, 200, 'Automatic catalogs must renew the session past its initial expiry');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(scripts, 4);
  const refreshed = await browser.fetch(baseUrl + '/catalog?session_refresh');
  assert.equal(refreshed.status, 200);
  assert.match(await refreshed.text(), /Refreshed catalog/);
  assert.equal(sessionRefreshes, 1, 'A normal session refresh must complete before returning catalog data');
  const loop = await browser.fetch(baseUrl + '/catalog?session_loop');
  assert.equal(loop.status, 307, 'A repeated session refresh must remain an error');
  assert.equal(sessionRefreshes, 2, 'Each catalog attempt may refresh its session only once');
  const refreshChallenge = await browser.fetch(baseUrl + '/catalog?session_refresh_challenge');
  assert.equal(refreshChallenge.status, 200, 'The original challenge status must reach the collector');
  assert.match(await refreshChallenge.text(), /challenge-running/, 'The existing HTML challenge detection must also receive refresh pages');
  assert.equal(sessionRefreshes, 3);
  const challenge = await browser.fetch(baseUrl + '/catalog?challenge');
  assert.equal(challenge.status, 403, 'Native rendering must not turn a challenge into success');
  assert.equal(challenge.headers.get('cf-mitigated'), 'challenge');
  assert.match(await challenge.text(), /challenge-running/);
  await assert.rejects(browser.fetch(baseUrl + '/catalog?slow', { signal: AbortSignal.timeout(250) }), error => error.name === 'TimeoutError');
  renewalExpires = Date.now() + 10000;
  assert.equal((await browser.fetch(baseUrl + '/catalog')).status, 200, 'Aborted navigation must not strand the next catalog');
  await new Promise(resolve => setTimeout(resolve, 250));
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
  const beforeManual = scripts;
  renewalExpires = Date.now() + 10000;
  await browser.openManual(new URL(baseUrl + '/catalog'));
  await assert.rejects(browser.fetch(baseUrl + '/catalog'), /manuell bedient/);
  for (let attempt = 0; attempt < 50 && scripts === beforeManual; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(scripts, beforeManual + 1, 'Native manual navigation must execute the ordinary page');
  const frame = await browser.captureFrame();
  assert.ok(frame.length > 100);
  assert.equal(frame[0], 255); assert.equal(frame[1], 216);
  await browser.input({ kind: 'text', text: 'manual-smoke' });
  // Pro Tastendruck entsteht ein unabhängiger Request; deren Ankunftsreihenfolge
  // sagt nichts über den aktuellen Feldinhalt aus.
  for (let attempt = 0; attempt < 50 && !inputEvents.has('manual-smoke'); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(inputEvents.has('manual-smoke'), 'Native desktop typing must reach the page input handler');
  const inputInspection = await chromium.connectOverCDP('http://127.0.0.1:9228', { noDefaults: true });
  try {
    const manualPage = inputInspection.contexts()[0].pages().find(page => page.url().startsWith(baseUrl));
    assert.ok(manualPage, 'Native manual page must remain open');
    assert.equal(await manualPage.locator('#text').inputValue(), 'manual-smoke', 'Native desktop typing must leave the complete text in the focused page');
  } finally { await inputInspection.close(); }
  await browser.stopManual();
  await browser.close();
  browser = new ChromeVintedBrowser(baseUrl, options);
  renewalExpires = Date.now() + 10000;
  const beforeRestart = scripts;
  const afterRestart = await browser.fetch(baseUrl + '/catalog', { signal: AbortSignal.timeout(20000) });
  assert.equal(afterRestart.status, 200);
  assert.match(cookie, /sniper_smoke=persisted/, 'Cookies must survive native Chrome restart');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(scripts, beforeRestart + 1, 'Restarted automatic navigation must allow session renewal');
  // Mehrere Wechsel mit echten Tabs, Cookies und unverändertem Browserprofil.
  renewalExpires = Date.now() + 60000;
  const tabIds = new Set();
  const memorySamples = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await browser.fetch(baseUrl + '/catalog');
    assert.equal(response.status, 200);
    assert.match(cookie, /sniper_smoke=persisted/);
    const targets = await (await fetch('http://127.0.0.1:9228/json/list')).json();
    const pages = targets.filter(target => target.type === 'page');
    assert.equal(pages.length, 1, 'Tab replacement must leave exactly one page');
    tabIds.add(pages[0].id);
    const bytes = await readFile('/sys/fs/cgroup/memory.current', 'utf8').catch(() => null);
    if (bytes !== null) memorySamples.push(Number(bytes));
  }
  assert.ok(tabIds.size >= 3, 'Forty automatic requests must actually replace the tab repeatedly');
  await browser.close();
  await symlink('feed-2147483647', '/profile/SingletonLock');
  await symlink('123456789', '/profile/SingletonCookie');
  await symlink('/tmp/com.google.Chrome.orphan/SingletonSocket', '/profile/SingletonSocket');
  browser = new ChromeVintedBrowser(baseUrl, options);
  renewalExpires = Date.now() + 10000;
  const recovered = await browser.fetch(baseUrl + '/catalog');
  assert.equal(recovered.status, 200, 'A stopped owner with orphaned profile links must not block restart');
  assert.match(cookie, /sniper_smoke=persisted/, 'Orphan cleanup must preserve browser cookies');
  console.log(JSON.stringify({ automaticRequests: 40, observedTabs: tabIds.size,
    maximumSampledMemoryMiB: memorySamples.length ? Math.ceil(Math.max(...memorySamples) / 1024 / 1024) : null }));
  console.log('Chrome sandbox, private CDP, manual image/input, automatic script and redirect renewal, bounded refresh loops, original challenge status, abort recovery, repeated tab replacement, orphaned profile recovery and cookie persistence verified.');
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
