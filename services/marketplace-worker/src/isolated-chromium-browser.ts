import type { CloudBrowserHandle } from './gologin-cloud-browser.ts';
import { CloudBrowserStopUncertainError } from './gologin-cloud-browser.ts';
import type { ChromiumProfileStore } from './chromium-profile-store.ts';
import type { ChromiumBrokerClient } from './chromium-broker-client.ts';
import type { ChromiumProfileNetwork } from './chromium-persistent-browser.ts';

interface IsolatedChromiumOptions {
  profiles: Pick<ChromiumProfileStore, 'acquire' | 'prepareStopped'>;
  launcher: Pick<ChromiumBrokerClient, 'launch' | 'recover'>;
  network: { resolve(profileId: string): Promise<ChromiumProfileNetwork> };
}

/** Der Controller verwaltet Profile und Reservierungen, aber keine Playwright-Verbindung. */
export class IsolatedChromiumBrowser {
  private readonly options: IsolatedChromiumOptions;
  constructor(options: IsolatedChromiumOptions) {
    this.options = options;
  }
  async open(profileId: string): Promise<CloudBrowserHandle> {
    const lease = await this.options.profiles.acquire(profileId);
    let handle: CloudBrowserHandle;
    try {
      const network = await this.options.network.resolve(profileId);
      handle = await this.options.launcher.launch(lease.directory, {
        headless: false,
        chromiumSandbox: true,
        acceptDownloads: false,
        locale: 'de-DE',
        viewport: { width: 1280, height: 900 },
        timeout: 60000,
        args: ['--disable-dev-shm-usage'],
        ...(network.kind === 'proxy'
          ? {
              proxy: {
                server: network.server,
                username: network.username,
                password: network.password,
              },
            }
          : {}),
      });
      await handle.run(async (browser) => browser.initialize?.());
    } catch (error) {
      if (error instanceof CloudBrowserStopUncertainError) throw error;
      try {
        await this.options.launcher.recover(profileId);
        await lease.confirmStopped();
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      // Private Anbieterantworten dürfen die öffentliche Fehlergrenze nicht verlassen.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('Chromium-Start fehlgeschlagen');
    }
    let stopped = false;
    return {
      run: (operation) => handle.run(operation),
      close: async () => {
        if (stopped) return;
        await handle.close();
        await lease.confirmStopped();
        stopped = true;
      },
    };
  }
  async stop(profileId: string): Promise<void> {
    await this.options.launcher.recover(profileId);
    await this.options.profiles.prepareStopped(profileId);
  }
}
