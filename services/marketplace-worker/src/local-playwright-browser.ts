import { chromium, type Browser } from 'playwright';
import {
  CloudBrowserStopUncertainError,
  type BrowserInfo,
  type CloudBrowserHandle,
} from './gologin-cloud-browser.ts';
import { allowedPublicRequest } from './local-playwright-request-policy.ts';

const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export class LocalPlaywrightBrowser {
  private readonly active = new Map<string, Browser>();
  private readonly testUrl: string;

  constructor(testUrl: string) {
    this.testUrl = testUrl;
  }

  async open(profileId: string): Promise<CloudBrowserHandle> {
    if (!profileIdPattern.test(profileId) || this.active.has(profileId))
      throw new Error('Browserprofil nicht verfügbar');
    const browser = await chromium.launch({ headless: true });
    this.active.set(profileId, browser);
    try {
      const context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: 'block',
        viewport: { width: 1100, height: 720 },
      });
      await context.route('**/*', (route) => {
        const request = route.request();
        return allowedPublicRequest(request.url(), request.method())
          ? route.continue()
          : route.abort();
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const page = await context.newPage();
      const response = await page.goto(this.testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      if (!response || !response.ok()) throw new Error('Öffentliche Testseite nicht erreichbar');
      if (page.url() !== this.testUrl) throw new Error('Öffentliche Testseite wurde umgeleitet');
      const info: BrowserInfo = {
        version: () => browser.version(),
        capture: () =>
          page.screenshot({
            type: 'jpeg',
            quality: 50,
            scale: 'css',
            animations: 'disabled',
            timeout: 5_000,
          }),
      };
      return {
        run: (operation) => operation(info),
        close: () => this.stop(profileId),
      };
    } catch {
      try {
        await this.stop(profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      throw new Error('Öffentliche Testseite nicht erreichbar');
    }
  }

  async stop(profileId: string): Promise<void> {
    if (!profileIdPattern.test(profileId)) throw new Error('Ungültige Browserprofil-ID');
    const browser = this.active.get(profileId);
    // Nach einem Worker-Neustart gibt es keinen verifizierbaren Prozess-Stopp.
    // Die Datenbank-Sperre bleibt deshalb bestehen, bis die Bereinigung geklärt ist.
    if (!browser) throw new CloudBrowserStopUncertainError();
    await browser.close();
    this.active.delete(profileId);
  }
}
