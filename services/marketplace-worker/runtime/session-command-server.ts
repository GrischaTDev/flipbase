import { createServer } from 'node:net';
import { chmod } from 'node:fs/promises';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { browserCommandLimit } from '../src/isolated-browser-actions.ts';

export async function startSessionCommands(browser: BrowserInfo) {
  const commands = new BrowserSessionCommands(browser);
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let length = 0;
    const chunks: Buffer[] = [];
    socket.setTimeout(15000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > browserCommandLimit) socket.destroy();
      else chunks.push(chunk);
    });
    socket.on('end', () => {
      if (socket.destroyed) return;
      void Promise.resolve()
        .then(() => commands.request(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
        .then((result) => socket.end(JSON.stringify(result)))
        .catch(() => socket.end('{"kind":"error","code":"failed"}'));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen('/tmp/flipbase-session.sock', () => {
      server.off('error', reject);
      resolve();
    });
  });
  await chmod('/tmp/flipbase-session.sock', 0o600);
  return server;
}
