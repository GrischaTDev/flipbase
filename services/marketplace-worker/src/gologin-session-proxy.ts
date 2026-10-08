import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { request } from 'node:https';
import type { Duplex } from 'node:stream';

/** Der globale Anbieterschlüssel bleibt im Broker; nur ein opaker Profilkanal verlässt ihn. */
export class GoLoginSessionProxy {
  private readonly sessions = new Map<
    string,
    { token: string; profileId: string; expiresAt: number; sockets: Set<Duplex> }
  >();
  readonly server = createServer((_request, response) => response.writeHead(404).end());
  private readonly options: { request?: typeof request; now?: () => number };
  constructor(options: { request?: typeof request; now?: () => number } = {}) {
    this.options = options;
    this.server.on('upgrade', (incoming, socket, head) => {
      const id = incoming.url?.match(/^\/session\/([0-9a-f-]{36})$/)?.[1];
      const session = id ? this.sessions.get(id) : undefined;
      if (
        !session ||
        session.expiresAt <= (this.options.now?.() ?? Date.now()) ||
        !/^172\.30\.88\.(?:12[89]|1[3-9]\d|2[0-4]\d|25[0-4])$/.test(
          incoming.socket.remoteAddress ?? '',
        ) ||
        session.sockets.size >= 2
      ) {
        socket.destroy();
        return;
      }
      const endpoint = new URL('https://cloudbrowser.gologin.com/connect');
      endpoint.searchParams.set('token', session.token);
      endpoint.searchParams.set('profile', session.profileId);
      let upstream: ReturnType<typeof request>;
      try {
        upstream = (this.options.request ?? request)(endpoint, {
          method: 'GET',
          timeout: 30000,
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            'Sec-WebSocket-Key': incoming.headers['sec-websocket-key'] ?? '',
            'Sec-WebSocket-Version': '13',
          },
        });
      } catch {
        socket.destroy();
        return;
      }
      session.sockets.add(socket);
      const expiry = setTimeout(
        () => socket.destroy(),
        Math.max(1, session.expiresAt - (this.options.now?.() ?? Date.now())),
      );
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => {
        clearTimeout(expiry);
        session.sockets.delete(socket);
        upstream.destroy();
      });
      upstream.on('upgrade', (response, remote, remoteHead) => {
        const accept = response.headers['sec-websocket-accept'];
        if (typeof accept !== 'string' || !/^[A-Za-z0-9+/=]{28}$/.test(accept)) {
          remote.destroy();
          socket.destroy();
          return;
        }
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
        if (remoteHead.length) socket.write(remoteHead);
        if (head.length) remote.write(head);
        socket.pipe(remote).pipe(socket);
        remote.on('error', () => socket.destroy());
        remote.on('close', () => socket.destroy());
        socket.on('close', () => remote.destroy());
      });
      upstream.on('response', (response) => {
        response.destroy();
        socket.destroy();
      });
      upstream.on('error', () => socket.destroy());
      upstream.on('timeout', () => {
        upstream.destroy();
        socket.destroy();
      });
      upstream.end();
    });
  }
  open(profileId: string, token: string): { endpoint: string; close(): void } {
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(profileId) ||
      !token.trim() ||
      token.length > 4096 ||
      this.sessions.size
    )
      throw new Error('Ungültige GoLogin-Sitzung');
    const id = randomUUID();
    const session = {
      profileId,
      token,
      expiresAt: (this.options.now?.() ?? Date.now()) + 12 * 60_000,
      sockets: new Set<Duplex>(),
    };
    this.sessions.set(id, session);
    return {
      endpoint: `ws://172.30.88.3:4181/session/${id}`,
      close: () => {
        this.sessions.delete(id);
        for (const socket of session.sockets) socket.destroy();
      },
    };
  }
}
