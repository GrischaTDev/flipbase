import { chromium, type Browser, type Page } from 'playwright';
import { readVintedAccountImport, type VintedAccountImport } from './vinted-account-import.ts';
import { readVintedAccountIdentity, type VintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  submitVintedLogin,
  type VintedLoginCredentials,
  type VintedLoginResult,
} from './vinted-browser-login.ts';
import {
  submitVintedVerificationCode,
  type VintedVerificationResult,
} from './vinted-browser-verification.ts';

type BrowserConnection = Pick<Browser, 'close' | 'version'> & Partial<Pick<Browser, 'contexts'>>;
export interface BrowserInfo extends Pick<Browser, 'version'> {
  capture?(): Promise<Uint8Array>;
  click?(xRatio: number, yRatio: number): Promise<void>;
  type?(value: string): Promise<void>;
  press?(key: 'Enter' | 'Tab' | 'Escape' | 'Backspace'): Promise<void>;
  identify?(): Promise<VintedAccountIdentity | null>;
  importAccount?(authorize: () => Promise<void>): Promise<VintedAccountImport>;
  login?(
    credentials: VintedLoginCredentials,
    authorize: () => Promise<void>,
  ): Promise<VintedLoginResult>;
  verify?(code: string, authorize: () => Promise<void>): Promise<VintedVerificationResult>;
}

export interface CloudBrowserHandle {
  close(): Promise<void>;
  run<T>(operation: (browser: BrowserInfo) => Promise<T>): Promise<T>;
}

interface GoLoginCloudBrowserOptions {
  token: string;
  startUrl?: 'https://www.vinted.de/';
  fetch?: typeof fetch;
  connect?: (url: string) => Promise<BrowserConnection>;
}

const apiBaseUrl = 'https://api.gologin.com';
const cloudBrowserUrl = 'wss://cloudbrowser.gologin.com/connect';
const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export class CloudBrowserStopUncertainError extends Error {
  constructor() {
    super('Browser-Stopp muss geprüft werden');
  }
}

export class GoLoginCloudBrowser {
  private readonly token: string;
  private readonly request: typeof fetch;
  private readonly connect: (url: string) => Promise<BrowserConnection>;
  private readonly startUrl?: 'https://www.vinted.de/';

  constructor(options: GoLoginCloudBrowserOptions) {
    if (!options.token.trim()) throw new Error('GoLogin-Zugang fehlt');
    this.token = options.token;
    this.request = options.fetch ?? fetch;
    this.connect = options.connect ?? ((url) => chromium.connectOverCDP(url, { timeout: 30_000 }));
    this.startUrl = options.startUrl;
  }

  async open(profileId: string): Promise<CloudBrowserHandle> {
    if (!profileIdPattern.test(profileId)) throw new Error('Ungültige Browserprofil-ID');
    let connection: BrowserConnection;
    try {
      const endpoint = new URL(cloudBrowserUrl);
      endpoint.searchParams.set('token', this.token);
      endpoint.searchParams.set('profile', profileId);
      connection = await this.connect(endpoint.toString());
    } catch {
      try {
        await this.stop(profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      throw new Error('Browser-Verbindung fehlgeschlagen');
    }

    let connectionClosed = false;
    let providerStopped = false;
    let stopPromise: Promise<void> | undefined;
    const currentPage = (): Page => {
      const pages = connection.contexts?.().flatMap((context) => context.pages()) ?? [];
      const page = pages.at(-1);
      if (!page) throw new Error('Browserseite fehlt');
      return page;
    };
    const browserInfo: BrowserInfo = {
      version: () => connection.version(),
      capture: () =>
        currentPage().screenshot({
          type: 'jpeg',
          quality: 65,
          scale: 'css',
          animations: 'disabled',
          timeout: 5_000,
        }),
      click: async (xRatio, yRatio) => {
        const page = currentPage();
        const size =
          page.viewportSize() ??
          (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));
        if (size.width <= 0 || size.height <= 0) throw new Error('Browserfenster fehlt');
        await page.mouse.click(Math.floor(xRatio * size.width), Math.floor(yRatio * size.height));
      },
      type: async (value) => currentPage().keyboard.insertText(value),
      press: async (key) => currentPage().keyboard.press(key),
      identify: () => readVintedAccountIdentity(currentPage()),
      importAccount: (authorize) => readVintedAccountImport(currentPage(), authorize),
      login: (credentials, authorize) => submitVintedLogin(currentPage(), credentials, authorize),
      verify: (code, authorize) => submitVintedVerificationCode(currentPage(), code, authorize),
    };
    const handle: CloudBrowserHandle = {
      run: (operation) => operation(browserInfo),
      close: async () => {
        if (providerStopped) return;
        if (stopPromise) return stopPromise;
        stopPromise = (async () => {
          if (!connectionClosed) {
            try {
              await connection.close();
            } catch {
              // Der Anbieter-Stopp ist für die Freigabe maßgeblich.
            }
            connectionClosed = true;
          }
          await this.stop(profileId);
          providerStopped = true;
        })();
        try {
          await stopPromise;
        } finally {
          stopPromise = undefined;
        }
      },
    };
    if (this.startUrl) {
      try {
        await currentPage().goto(this.startUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      } catch {
        try {
          await handle.close();
        } catch {
          throw new CloudBrowserStopUncertainError();
        }
        throw new Error('Vinted-Startseite konnte nicht geöffnet werden');
      }
    }
    return handle;
  }

  async stop(profileId: string): Promise<void> {
    if (!profileIdPattern.test(profileId)) throw new Error('Ungültige Browserprofil-ID');
    let response: Response;
    try {
      response = await this.request(`${apiBaseUrl}/browser/${profileId}/web`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('Browseranbieter nicht erreichbar');
    }
    if (!response.ok) throw new Error(`Browseranbieter antwortete mit HTTP ${response.status}`);
  }
}
