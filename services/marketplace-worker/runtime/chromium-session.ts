import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { chromium, type BrowserContext } from 'playwright';

let context: BrowserContext | undefined;
let display: ChildProcess | undefined;
let finishing = false;
const sockets = new Set<import('node:net').Socket>();
const server = createServer((incoming, outgoing) => {
  if (incoming.socket.remoteAddress !== '172.30.88.2') {
    outgoing.writeHead(403).end();
    return;
  }
  // Playwright fragt /json/version/ ab; Chromium akzeptiert auch die Form ohne Schluss-Slash.
  const path = incoming.url?.replace(/\/$/, '');
  if (!['/json/version', '/json/list', '/json'].includes(path ?? '') || incoming.method !== 'GET') {
    outgoing.writeHead(404).end();
    return;
  }
  const upstream = request({ host: '127.0.0.1', port: 9223, path, method: 'GET' }, (response) => {
    let payload = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      payload += chunk;
    });
    response.on('end', () => {
      if (payload.length > 1024 * 1024) {
        outgoing.writeHead(502).end();
        return;
      }
      const authority = incoming.headers.host;
      if (!authority || !/^172\.30\.88\.\d{1,3}:9222$/.test(authority)) {
        outgoing.writeHead(400).end();
        return;
      }
      outgoing.writeHead(response.statusCode ?? 502, { 'Content-Type': 'application/json' });
      outgoing.end(
        payload
          .replaceAll('ws://localhost:9223', `ws://${authority}`)
          .replaceAll('ws://127.0.0.1:9223', `ws://${authority}`),
      );
    });
  });
  upstream.on('error', () => outgoing.writeHead(502).end());
  upstream.end();
});
server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
server.on('upgrade', (incoming, socket, head) => {
  if (
    incoming.socket.remoteAddress !== '172.30.88.2' ||
    !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(incoming.url ?? '')
  ) {
    socket.destroy();
    return;
  }
  const upstream = connect(9223, '127.0.0.1', () => {
    const headers = Object.entries(incoming.headers)
      .filter(([name]) => name !== 'host')
      .map(
        ([name, contents]) =>
          `${name}: ${Array.isArray(contents) ? contents.join(', ') : (contents ?? '')}`,
      );
    upstream.write(
      `GET ${incoming.url} HTTP/1.1\r\nHost: localhost:9223\r\n${headers.join('\r\n')}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});

async function finish(success: boolean): Promise<void> {
  if (finishing) return;
  finishing = true;
  process.exitCode = success ? 0 : 1;
  try {
    await context?.close();
  } catch {
    process.exitCode = 1;
  }
  for (const socket of sockets) socket.destroy();
  server.close();
  display?.kill('SIGTERM');
}
process.on('SIGTERM', () => {
  void finish(true);
});
process.on('SIGINT', () => {
  void finish(true);
});

async function startup(): Promise<void> {
  let serialized: string | undefined;
  const deadline = Date.now() + 60_000;
  while (!serialized && Date.now() < deadline && !finishing) {
    try {
      serialized = await readFile('/tmp/startup.json', 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!serialized || serialized.length > 16_384) throw new Error('Sitzungskonfiguration fehlt');
  await unlink('/tmp/startup.json');
  const options: unknown = JSON.parse(serialized);
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Ungültige Sitzungskonfiguration');
  const settings = options as Record<string, unknown>;
  if (
    Object.keys(settings).some(
      (key) => !['headless', 'locale', 'viewport', 'proxy'].includes(key),
    ) ||
    typeof settings.headless !== 'boolean' ||
    typeof settings.locale !== 'string'
  )
    throw new Error('Ungültige Sitzungskonfiguration');
  if (!settings.headless) {
    display = spawn('Xvfb', [':99', '-screen', '0', '1280x900x24', '-nolisten', 'tcp', '-ac'], {
      stdio: 'ignore',
    });
    display.on('error', () => {
      void finish(false);
    });
    display.on('exit', () => {
      if (!finishing) void finish(false);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  context = await chromium.launchPersistentContext('/profile', {
    headless: settings.headless,
    locale: settings.locale,
    viewport: settings.viewport as { width: number; height: number },
    ...(settings.proxy
      ? { proxy: settings.proxy as { server: string; username?: string; password?: string } }
      : {}),
    chromiumSandbox: true,
    acceptDownloads: false,
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', HOME: '/home/node', DISPLAY: ':99' },
    args: ['--remote-debugging-port=9223'],
  });
  context.on('close', () => {
    void finish(true);
  });
  if (finishing) {
    await context.close();
    return;
  }
  server.listen(9222, '0.0.0.0');
}
// Fehlermeldungen können Browser-URLs oder Zugangsdaten enthalten und werden nicht ausgegeben.
startup().catch(() => {
  void finish(false);
});
