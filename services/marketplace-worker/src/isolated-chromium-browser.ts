import type { CloudBrowserHandle } from './gologin-cloud-browser.ts';
import { setTimeout as wait } from 'node:timers/promises';
import { ChromiumStartError, CloudBrowserStopUncertainError } from './gologin-cloud-browser.ts';
import { BrowserActionFailedError, unexpectedFailureDetail } from './vinted-listing-read-error.ts';
import type { ChromiumProfileStore } from './chromium-profile-store.ts';
import type { ChromiumBrokerClient } from './chromium-broker-client.ts';
import type { ChromiumProfileNetwork } from './chromium-persistent-browser.ts';

interface IsolatedChromiumOptions {
  /** Pause vor dem zweiten Ladeversuch der Startseite; nur Tests verkürzen sie. */
  initializeRetryDelayMs?: number;
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
    let phase: ChromiumStartError['phase'] = 'network';
    try {
      const network = await this.options.network.resolve(profileId);
      phase = 'launch';
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
      phase = 'initialize';
      const initialize = () => handle.run(async (browser) => browser.initialize?.());
      try {
        await initialize();
      } catch (firstError) {
        if (firstError instanceof CloudBrowserStopUncertainError) throw firstError;
        // Die Cloud-IP lehnt die erste Verbindung gelegentlich ab; der Browser selbst läuft.
        await wait(this.options.initializeRetryDelayMs ?? 1_500);
        await initialize();
      }
    } catch (error) {
      if (error instanceof CloudBrowserStopUncertainError) throw error;
      try {
        await this.options.launcher.recover(profileId);
        await lease.confirmStopped();
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      // Private Anbieterantworten dürfen die öffentliche Fehlergrenze nicht verlassen.
      throw new ChromiumStartError(
        phase,
        error instanceof BrowserActionFailedError ? error.detail : unexpectedFailureDetail(error),
      );
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
