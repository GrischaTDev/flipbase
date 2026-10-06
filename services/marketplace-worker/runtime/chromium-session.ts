import { spawn, type ChildProcess } from 'node:child_process';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import { createProxyForwarder } from '../../../tools/cloud-browser-pilot/proxy-forwarder.mjs';
import { closeChromeWindows } from '../../../tools/cloud-browser-pilot/chrome-window-close.mjs';
import { parseChromeSessionConfiguration } from './chrome-session-config.ts';

let browser: ChildProcess | undefined;
let display: ChildProcess | undefined;
let windowManager: ChildProcess | undefined;
let proxy: Server | undefined;
let finishing = false;
let isReady = false;
const sockets = new Set<import('node:net').Socket>();
const server = createServer((incoming, outgoing) => {
  if (!['172.30.88.2', '172.30.88.3'].includes(incoming.socket.remoteAddress ?? '')) {
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
    !['172.30.88.2', '172.30.88.3'].includes(incoming.socket.remoteAddress ?? '') ||
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

// 78 kennzeichnet ausschließlich einen Startfehler mit erfolgreich geschlossenem Profil.
async function finish(exitCode: 0 | 1 | 78): Promise<void> {
  if (finishing) return;
  finishing = true;
  process.exitCode = exitCode;
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, 8_000);
      browser?.once('exit', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    try {
      await closeChromeWindows();
    } catch {
      process.exitCode = 75;
    }
    await exited;
    // 75 hält Profil und IP reserviert, wenn ein sauberer Chrome-Stopp unbestätigt bleibt.
    if (browser.exitCode === null && browser.signalCode === null) {
      process.exitCode = 75;
      browser.kill('SIGKILL');
    }
  }
  for (const socket of sockets) socket.destroy();
  server.close();
  proxy?.closeAllConnections();
  proxy?.close();
  windowManager?.kill('SIGTERM');
  display?.kill('SIGTERM');
}
process.on('SIGTERM', () => {
  void finish(0);
});
process.on('SIGINT', () => {
  void finish(0);
});
server.on('error', () => {
  void finish(isReady ? 1 : 78);
});

async function waitForSocket(address: string | number): Promise<void> {
  for (let attempt = 0; attempt < 100 && !finishing; attempt++) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = typeof address === 'string' ? connect(address) : connect(address, '127.0.0.1');
      socket.setTimeout(250);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chrome-Sitzungsdienst nicht bereit');
}

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
  const metadata = await lstat('/tmp/startup.json');
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
    throw new Error('Private Sitzungskonfiguration erforderlich');
  await unlink('/tmp/startup.json');
  const settings = parseChromeSessionConfiguration(JSON.parse(serialized));
  try {
    await lstat('/profile/SingletonLock');
    throw new Error('Chromeprofil ist noch gesperrt');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  process.env.DISPLAY = ':99';
  process.env.HOME = '/home/node';
  process.env.TZ = 'Europe/Berlin';
  if (settings.proxy) {
    proxy = createProxyForwarder(settings.proxy);
    proxy.on('error', () => {
      void finish(isReady ? 1 : 78);
    });
    await new Promise<void>((resolve) => proxy?.listen(3128, '127.0.0.1', resolve));
  }
  if (finishing) return;
  display = spawn(
    'Xvfb',
    [':99', '-screen', '0', `${settings.width}x${settings.height}x24`, '-nolisten', 'tcp', '-ac'],
    { stdio: 'ignore' },
  );
  display.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  display.on('exit', () => {
    if (!finishing) void finish(isReady ? 1 : 78);
  });
  await waitForSocket('/tmp/.X11-unix/X99');
  if (finishing) return;
  windowManager = spawn('openbox', [], { stdio: 'ignore' });
  windowManager.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  windowManager.on('exit', () => {
    if (!finishing) void finish(isReady ? 1 : 78);
  });
  browser = spawn('google-chrome-stable', settings.argumentsList, { stdio: 'ignore' });
  browser.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  browser.on('exit', (code) => {
    if (!finishing) void finish(isReady ? (code === 0 ? 0 : 1) : 78);
  });
  await waitForSocket(9223);
  if (finishing) return;
  server.listen(9222, '0.0.0.0', () => {
    isReady = true;
  });
}
// Fehlermeldungen können Browser-URLs oder Zugangsdaten enthalten und werden nicht ausgegeben.
startup().catch(() => {
  void finish(isReady ? 1 : 78);
});
