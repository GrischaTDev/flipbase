import { chromium, type BrowserContext } from 'playwright';
import {
  CloudBrowserStopUncertainError,
  type BrowserConnection,
  type CloudBrowserHandle,
} from './gologin-cloud-browser.ts';
import { ChromiumProfileStore, type ChromiumProfileLease } from './chromium-profile-store.ts';
import { vintedBrowserActions } from './vinted-browser-actions.ts';

export type ChromiumProfileNetwork =
  { kind: 'direct' } | { kind: 'proxy'; server: string; username?: string; password?: string };

export interface ChromiumPersistentBrowserOptions {
  profileStore: ChromiumProfileStore;
  network?: { resolve(profileId: string): Promise<ChromiumProfileNetwork> };
  launch?: typeof chromium.launchPersistentContext;
  recoverRuntime?: (profileId: string) => Promise<void>;
  headless?: boolean;
  trustedTestStartUrl?: string;
}

interface ActiveProfile {
  lease?: ChromiumProfileLease;
  context?: BrowserContext;
  startPromise?: Promise<CloudBrowserHandle>;
  closePromise?: Promise<void>;
  contextClosed: boolean;
  closing: boolean;
  stopped: boolean;
}

function childEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const key of [
    'PATH',
    'HOME',
    'LANG',
    'LC_ALL',
    'TZ',
    'DISPLAY',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
  ]) {
    const setting = process.env[key];
    if (setting !== undefined) environment[key] = setting;
  }
  return environment;
}

function validateProxy(
  network: ChromiumProfileNetwork,
): { server: string; username?: string; password?: string } | undefined {
  if (network.kind === 'direct') return undefined;
  try {
    const server = new URL(network.server);
    if (
      !['http:', 'https:', 'socks5:'].includes(server.protocol) ||
      !server.hostname ||
      server.username ||
      server.password ||
      server.search ||
      server.hash ||
      (server.pathname !== '/' && server.pathname !== '')
    ) {
      throw new Error();
    }
    return { server: network.server, username: network.username, password: network.password };
  } catch {
    throw new Error('Ungültige Chromium-Proxykonfiguration');
  }
}

export class ChromiumPersistentBrowser {
  private readonly profileStore: ChromiumProfileStore;
  private readonly network: NonNullable<ChromiumPersistentBrowserOptions['network']>;
  private readonly launch: typeof chromium.launchPersistentContext;
  private readonly recoverRuntime?: (profileId: string) => Promise<void>;
  private readonly startUrl: string;
  private readonly headless: boolean;
  private readonly active = new Map<string, ActiveProfile>();

  constructor(options: ChromiumPersistentBrowserOptions) {
    this.profileStore = options.profileStore;
    this.network = options.network ?? { resolve: async () => ({ kind: 'direct' }) };
    this.launch =
      options.launch ??
      ((directory, settings) => chromium.launchPersistentContext(directory, settings));
    this.recoverRuntime = options.recoverRuntime;
    this.headless = options.headless ?? false;
    this.startUrl = 'https://www.vinted.de/';
    if (options.trustedTestStartUrl) {
      const address = new URL(options.trustedTestStartUrl);
      if (
        address.protocol !== 'http:' ||
        !['127.0.0.1', '[::1]', 'localhost'].includes(address.hostname) ||
        address.username ||
        address.password
      ) {
        throw new Error('Ungültige interne Chromium-Testadresse');
      }
      this.startUrl = address.toString();
    }
  }

  async open(profileId: string): Promise<CloudBrowserHandle> {
    this.profileStore.directory(profileId);
    if (this.active.has(profileId)) throw new Error('Chromium-Profil läuft bereits');
    const entry: ActiveProfile = { contextClosed: false, closing: false, stopped: false };
    this.active.set(profileId, entry);
    entry.startPromise = this.start(profileId, entry);
    return entry.startPromise;
  }

  private async start(profileId: string, entry: ActiveProfile): Promise<CloudBrowserHandle> {
    try {
      entry.lease = await this.profileStore.acquire(profileId);
      const proxy = validateProxy(await this.network.resolve(profileId));
      entry.context = await this.launch(entry.lease.directory, {
        headless: this.headless,
        chromiumSandbox: true,
        acceptDownloads: false,
        args: ['--disable-dev-shm-usage'],
        env: childEnvironment(),
        proxy,
        viewport: { width: 1280, height: 900 },
        locale: 'de-DE',
        timeout: 60_000,
      });
      const browser = entry.context.browser();
      if (!browser) throw new Error('Chromium-Browserverbindung fehlt');
      const context = entry.context;
      const connection: BrowserConnection = {
        close: async () => context.close(),
        version: () => browser.version(),
        contexts: () => [context],
      };
      const page = context.pages().at(0) ?? (await context.newPage());
      await page.goto(this.startUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const browserInfo = vintedBrowserActions(connection);
      return {
        run: async (operation) => {
          if (entry.stopped || entry.contextClosed || entry.closing)
            throw new Error('Chromium-Browser ist beendet');
          return operation(browserInfo);
        },
        close: () => this.closeEntry(profileId, entry),
      };
    } catch {
      await this.closeEntry(profileId, entry);
      throw new Error('Chromium-Browser konnte nicht gestartet werden');
    }
  }

  private async closeEntry(profileId: string, entry: ActiveProfile): Promise<void> {
    if (entry.stopped) return;
    if (entry.closePromise) return entry.closePromise;
    entry.closing = true;
    entry.closePromise = (async () => {
      try {
        if (entry.context && !entry.contextClosed) {
          await entry.context.close();
          entry.contextClosed = true;
        }
        if (entry.lease) await entry.lease.confirmStopped();
        // Fehlgeschlagenes acquire kann bereits einen unsicheren Marker hinterlassen haben.
        else await this.profileStore.recoverStopped(profileId);
        entry.stopped = true;
        this.active.delete(profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
    })();
    try {
      await entry.closePromise;
    } finally {
      entry.closePromise = undefined;
    }
  }

  async stop(profileId: string): Promise<void> {
    this.profileStore.directory(profileId);
    const entry = this.active.get(profileId);
    if (entry) {
      try {
        await entry.startPromise;
      } catch {
        // Start hat den Stopp bereits versucht; unsichere Zustände müssen erneut bestätigt werden.
      }
      await this.closeEntry(profileId, entry);
      return;
    }
    try {
      if (this.recoverRuntime) await this.recoverRuntime(profileId);
      await this.profileStore.recoverStopped(profileId);
    } catch {
      throw new CloudBrowserStopUncertainError();
    }
  }
}
