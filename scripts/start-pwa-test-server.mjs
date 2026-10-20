import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { build } from 'esbuild';

const root = resolve(process.env.PWA_TEST_ROOT ?? 'dist/flipbase/browser');
const secondRoot = process.env.PWA_TEST_BUILD_B ? resolve(process.env.PWA_TEST_BUILD_B) : null;
let activeRoot = root;
let delayedAsset = '';
const port = Number(process.env.PWA_TEST_PORT ?? 4218);
const security = await readFile(
  new URL('../docker/security-headers.conf', import.meta.url),
  'utf8',
);
const axeSource = await readFile(resolve('node_modules/axe-core/axe.min.js'));
const storeFixture = await build({
  entryPoints: ['e2e/support/offline-store-browser-fixture.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});
const csp = security.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
if (!csp) throw new Error('Produktions-CSP fehlt.');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};
const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  const path = requestUrl.pathname;
  if (path === '/api/__pwa_test__/asset-delay' && request.method === 'POST') {
    const asset = requestUrl.searchParams.get('path') ?? '';
    if (asset && !/^\/fonts\/[\w.-]+$/.test(asset)) {
      response.writeHead(400).end();
      return;
    }
    delayedAsset = asset;
    response.setHeader('Cache-Control', 'no-store');
    response.end('ok');
    return;
  }
  if (path === '/api/__pwa_test__/file-roundtrip' && request.method === 'POST') {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 21 * 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    response.setHeader(
      'Content-Type',
      request.headers['content-type'] ?? 'application/octet-stream',
    );
    response.setHeader('X-File-Name', request.headers['x-file-name'] ?? '');
    response.setHeader('Cache-Control', 'no-store');
    response.end(Buffer.concat(chunks));
    return;
  }
  if (path === '/api/__pwa_test__/legacy-worker.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Service-Worker-Allowed', '/');
    response.end(`
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', event => {
        if (new URL(event.request.url).origin === self.location.origin)
          event.respondWith(fetch(event.request));
      });
    `);
    return;
  }
  if (path === '/api/__pwa_test__/legacy-page') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(
      '<!doctype html><html lang="de"><title>Bisherige Ansicht</title><body>Bisherige Ansicht</body></html>',
    );
    return;
  }
  if (path === '/api/__pwa_test__/axe.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.setHeader('Cache-Control', 'no-store');
    response.end(axeSource);
    return;
  }
  if (path === '/api/__pwa_test__/offline-store.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.setHeader('Cache-Control', 'no-store');
    response.end(storeFixture.outputFiles[0].contents);
    return;
  }
  if (path === '/api/__pwa_test__/build' && request.method === 'POST') {
    if (!secondRoot) {
      response.writeHead(409).end();
      return;
    }
    activeRoot = activeRoot === root ? secondRoot : root;
    response.setHeader('Cache-Control', 'no-store');
    response.end('ok');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  try {
    let file = resolve(activeRoot, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(`${activeRoot}${sep}`) && file !== activeRoot) {
      response.writeHead(403).end();
      return;
    }
    const existing = await stat(file).catch(() => null);
    if (!existing?.isFile()) {
      if (request.headers.accept?.includes('text/html') || path === '/')
        file = resolve(activeRoot, 'index.html');
      else {
        response.writeHead(404).end();
        return;
      }
    }
    const extension = extname(file);
    if (path === delayedAsset) await new Promise((resolve) => setTimeout(resolve, 12_000));
    response.setHeader('Content-Type', mime[extension] ?? 'application/octet-stream');
    response.setHeader(
      'Cache-Control',
      /-[\w-]{8,}\.(?:js|css|woff2?)$/.test(file)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, no-store, must-revalidate',
    );
    response.end(request.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    response.writeHead(500).end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`PWA-Produktionsvorschau: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
