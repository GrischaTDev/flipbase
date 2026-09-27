import { chromium, type Browser } from 'playwright-core';

type BrowserConnection = Pick<Browser, 'close' | 'version'>;
export type BrowserInfo = Pick<Browser, 'version'>;

export interface CloudBrowserHandle {
  close(): Promise<void>;
  run<T>(operation: (browser: BrowserInfo) => Promise<T>): Promise<T>;
}

interface GoLoginCloudBrowserOptions {
  token: string;
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

  constructor(options: GoLoginCloudBrowserOptions) {
    if (!options.token.trim()) throw new Error('GoLogin-Zugang fehlt');
    this.token = options.token;
    this.request = options.fetch ?? fetch;
    this.connect = options.connect ?? ((url) => chromium.connectOverCDP(url, { timeout: 30_000 }));
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
    return {
      run: (operation) => operation(connection),
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
