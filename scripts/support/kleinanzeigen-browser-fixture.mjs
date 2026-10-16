// Ausschließlich lokaler TLS-Testproxy: keine Weiterleitung ins Internet, keine echten Zugangsdaten.
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export async function createKleinanzeigenBrowserFixture(directory, handler) {
  const tlsDirectory = join(directory, 'fixture-tls');
  mkdirSync(tlsDirectory, { recursive: true });
  const key = join(tlsDirectory, 'fixture.key');
  const cert = join(tlsDirectory, 'fixture.crt');
  const openssl =
    process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
      ? 'C:/Program Files/Git/usr/bin/openssl.exe'
      : 'openssl';
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '2',
      '-subj',
      '/CN=flipbase-synthetic-browser-test',
    ],
    { stdio: 'ignore' },
  );
  const errors = [];
  const sockets = new Set();
  const serve = async (request, response) => {
    let chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1048576) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const binary = Buffer.concat(chunks);
    const body = binary.toString('utf8');
    const address = 'https://' + request.headers.host + request.url;
    const route = {
      request: () => ({
        url: () => address,
        method: () => request.method,
        postDataJSON: () => JSON.parse(body),
        postDataBuffer: () => binary,
        headers: () => request.headers,
      }),
      fulfill: async ({
        contentType = 'application/json',
        body: content,
        json,
        status = 200,
        headers = {},
      }) => {
        response.writeHead(status, {
          'content-type': contentType.includes('charset=')
            ? contentType
            : contentType + '; charset=utf-8',
          ...headers,
        });
        response.end(json === undefined ? (content ?? '') : JSON.stringify(json));
      },
      abort: async () => {
        response.writeHead(403).end();
      },
    };
    try {
      await handler(route);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (!response.headersSent) response.writeHead(502);
      response.end();
    }
  };
  const tls = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, serve);
  tls.on('tlsClientError', () => {});
  const proxy = createHttpServer((request, response) => {
    response.writeHead(403).end();
  });
  proxy.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  proxy.on('connect', (request, socket, head) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) socket.unshift(head);
    tls.emit('connection', socket);
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: 'http://127.0.0.1:' + proxy.address().port,
    errors,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => proxy.close(resolve));
    },
  };
}
