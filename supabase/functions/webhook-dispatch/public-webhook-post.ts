import { customTarget } from './webhook-settings.ts';

// Nur globale IPv4-Ziele: IPv6 wird für eigene Webhooks bewusst nicht verwendet.
export function isPublicIpv4(address: string): boolean {
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address)) return false;
  const parts = address.split('.').map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [first, second, third] = parts;
  return (
    first > 0 &&
    first < 224 &&
    first !== 10 &&
    first !== 127 &&
    !(first === 100 && second >= 64 && second <= 127) &&
    !(first === 169 && second === 254) &&
    !(first === 172 && second >= 16 && second <= 31) &&
    !(first === 192 && (second === 168 || second === 0 || (second === 88 && third === 99))) &&
    !(first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) &&
    !(first === 203 && second === 0 && third === 113)
  );
}

export interface WebhookTransport {
  resolve(hostname: string): Promise<string[]>;
  connect(
    address: string,
    hostname: string,
    signal: AbortSignal,
  ): Promise<Pick<Deno.TlsConn, 'read' | 'write' | 'close'>>;
}
const transport: WebhookTransport = {
  resolve: (hostname) => Deno.resolveDns(hostname, 'A'),
  connect: async (address, hostname, signal) => {
    const connection = await Deno.connect({ hostname: address, port: 443, signal });
    try {
      return await Deno.startTls(connection, { hostname, alpnProtocols: ['http/1.1'] });
    } catch (error) {
      connection.close();
      throw error;
    }
  },
};

export async function postPublicWebhook(
  secret: string,
  payload: unknown,
  network = transport,
): Promise<void> {
  const target = customTarget(secret);
  const controller = new AbortController();
  let connection: Awaited<ReturnType<WebhookTransport['connect']>> | undefined;
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    controller.abort();
    try {
      connection?.close();
    } catch {
      /* Bereits geschlossen. */
    }
  }, 10_000);
  try {
    const addresses = await network.resolve(target.hostname);
    if (expired || !addresses.length || addresses.some((address) => !isPublicIpv4(address)))
      throw new Error('Webhook-Ziel ist nicht öffentlich erreichbar');
    // Die geprüfte IP wird direkt gewählt; TLS prüft weiterhin den ursprünglichen Hostnamen.
    connection = await network.connect(addresses[0], target.hostname, controller.signal);
    if (expired) throw new Error('Webhook-Zeitlimit');
    const body = new TextEncoder().encode(JSON.stringify(payload));
    if (body.length > 16_384) throw new Error('Webhook-Nachricht zu groß');
    const header = new TextEncoder().encode(
      `POST ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.hostname}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
    );
    for (const bytes of [header, body]) {
      let offset = 0;
      while (offset < bytes.length) {
        const written = await connection.write(bytes.subarray(offset));
        if (written <= 0) throw new Error('Webhook-Verbindung beendet');
        offset += written;
      }
    }
    let response = '';
    const buffer = new Uint8Array(2048);
    while (!response.includes('\r\n\r\n')) {
      const count = await connection.read(buffer);
      if (count === null || response.length + count > 16_384)
        throw new Error('Ungültige Webhook-Antwort');
      response += new TextDecoder().decode(buffer.subarray(0, count));
    }
    const status = /^HTTP\/1\.[01] ([0-9]{3}) /.exec(response)?.[1];
    // Umleitungen werden niemals verfolgt, auch nicht zurück ins private Netz.
    if (!status || Number(status) < 200 || Number(status) >= 300)
      throw new Error('Webhook-Versand fehlgeschlagen');
  } finally {
    clearTimeout(deadline);
    try {
      connection?.close();
    } catch {
      /* Bereits geschlossen. */
    }
  }
}
