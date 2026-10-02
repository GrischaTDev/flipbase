import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isIP } from 'node:net';

export type ChromiumNetwork =
  | { kind: 'direct' }
  | {
      kind: 'proxy';
      server: string;
      username?: string;
      password?: string;
    };

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

function publicProxyAddress(server: string): boolean {
  try {
    const address = new URL(server);
    if (
      !['http:', 'https:', 'socks5:'].includes(address.protocol) ||
      !address.port ||
      address.username ||
      address.password ||
      (address.pathname !== '' && address.pathname !== '/') ||
      address.search ||
      address.hash
    )
      return false;
    const hostname = address.hostname;
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.includes(':') ||
      hostname.startsWith('[')
    )
      return false;
    if (isIP(hostname) === 4) {
      const octets = hostname.split('.').map(Number);
      const [first, second] = octets;
      if (
        first === undefined ||
        second === undefined ||
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 100 && second >= 64 && second <= 127)
      )
        return false;
    }
    return hostname.includes('.') && /^[a-z0-9.-]+$/i.test(hostname);
  } catch {
    return false;
  }
}

/** Netzwerkzugänge werden ausschließlich aus einer privaten Serverdatei geladen. */
export class ChromiumNetworkProfiles {
  private readonly profiles = new Map<string, ChromiumNetwork>([['direct', { kind: 'direct' }]]);

  static async load(path?: string): Promise<ChromiumNetworkProfiles> {
    const networks = new ChromiumNetworkProfiles();
    if (!path) return networks;
    try {
      const metadata = await lstat(path);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size > 64 * 1024 ||
        (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)
      )
        throw new Error('Dateizugriff verweigert');
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let parsed: unknown;
      try {
        const actual = await handle.stat();
        if (
          actual.ino !== metadata.ino ||
          (process.platform !== 'win32' && actual.dev !== metadata.dev) ||
          actual.size > 64 * 1024
        )
          throw new Error('Datei verändert');
        parsed = JSON.parse(await handle.readFile('utf8'));
      } finally {
        await handle.close();
      }
      if (
        !isRecord(parsed) ||
        !Array.isArray(parsed['networkProfiles']) ||
        parsed['networkProfiles'].length > 128
      )
        throw new Error('Ungültige Netzwerke');
      for (const profile of parsed['networkProfiles']) {
        if (
          !isRecord(profile) ||
          typeof profile['id'] !== 'string' ||
          !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile['id']) ||
          networks.profiles.has(profile['id']) ||
          profile['kind'] !== 'proxy' ||
          typeof profile['server'] !== 'string' ||
          !publicProxyAddress(profile['server']) ||
          ['username', 'password'].some(
            (key) =>
              profile[key] !== undefined &&
              (typeof profile[key] !== 'string' || profile[key].length > 1024),
          )
        )
          throw new Error('Ungültiges Netzwerk');
        networks.profiles.set(profile['id'], {
          kind: 'proxy',
          server: profile['server'],
          ...(typeof profile['username'] === 'string' ? { username: profile['username'] } : {}),
          ...(typeof profile['password'] === 'string' ? { password: profile['password'] } : {}),
        });
      }
      return networks;
    } catch {
      throw new Error('Chromium-Netzwerkkonfiguration konnte nicht bestätigt werden');
    }
  }

  resolve(networkId: string): ChromiumNetwork {
    const network = this.profiles.get(networkId);
    if (!network) throw new Error('Chromium-Netzwerk fehlt');
    return { ...network };
  }
}
