import { createServer, request } from 'node:http';
import { isIP } from 'node:net';

export function isPublicHost(hostname) {
  if (isIP(hostname) === 4) {
    const [first, second] = hostname.split('.').map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  return (
    /^[a-z0-9.-]+$/i.test(hostname) &&
    hostname.includes('.') &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local')
  );
}

function targetAllowed(target) {
  try {
    const address = new URL(target);
    return (
      ['http:', 'https:'].includes(address.protocol) &&
      !address.username &&
      !address.password &&
      isPublicHost(address.hostname)
    );
  } catch {
    return false;
  }
}

/** Der Browser erreicht nur diesen lokalen Proxy; TLS bleibt unverändert verschlüsselt. */
export function createProxyForwarder(proxy) {
  const address = new URL(proxy.server);
  if (address.protocol !== 'http:') throw new Error('HTTP-Proxy erforderlich.');
  const authorization = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  };
  const upstreamOptions = (method, path, headers = {}) => ({
    hostname: address.hostname,
    port: Number(address.port) || 80,
    method,
    path,
    headers: { ...headers, 'proxy-authorization': authorization },
  });
  const server = createServer((incoming, outgoing) => {
    if (!targetAllowed(incoming.url)) {
      outgoing.writeHead(403).end('Ziel nicht erlaubt.');
      return;
    }
    const headers = { ...incoming.headers, host: new URL(incoming.url).host };
    delete headers['proxy-connection'];
    const upstream = request(
      upstreamOptions(incoming.method, incoming.url, headers),
      (response) => {
        const responseHeaders = { ...response.headers };
        delete responseHeaders['proxy-authenticate'];
        delete responseHeaders['proxy-authorization'];
        // Auch Anbieterfehler dürfen keine Zugangsdaten in Browserantworten enthalten.
        if (response.statusCode === 407) {
          response.resume();
          outgoing.writeHead(502).end('Proxy nicht erreichbar.');
          return;
        }
        outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
        response.pipe(outgoing);
      },
    );
    upstream.on('socket', track);
    upstream.setTimeout(30_000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502).end('Proxy nicht erreichbar.');
      else outgoing.destroy();
    });
    outgoing.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  server.on('connection', track);
  server.on('connect', (incoming, socket, head) => {
    if (
      !targetAllowed(`https://${incoming.url}`) ||
      !/^[a-z0-9.-]+:(80|443)$/i.test(incoming.url)
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = request(upstreamOptions('CONNECT', incoming.url, { host: incoming.url }));
    upstream.setTimeout(30_000, () => upstream.destroy());
    upstream.on('connect', (response, remote, buffered) => {
      track(remote);
      if (response.statusCode !== 200) {
        remote.destroy();
        socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        return;
      }
      remote.setTimeout(0);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (buffered.length) socket.write(buffered);
      if (head.length) remote.write(head);
      socket.pipe(remote).pipe(socket);
      socket.on('close', () => remote.destroy());
      remote.on('close', () => socket.destroy());
    });
    upstream.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
    socket.on('close', () => upstream.destroy());
    upstream.end();
  });
  server.on('upgrade', (_incoming, socket) => socket.destroy());
  server.closeAllConnections = () => {
    for (const socket of sockets) socket.destroy();
  };
  return server;
}
