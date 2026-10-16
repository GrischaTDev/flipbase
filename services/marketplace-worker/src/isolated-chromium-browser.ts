import type { CloudBrowserHandle } from './gologin-cloud-browser.ts';
import { setTimeout as wait } from 'node:timers/promises';
import {
  ChromiumStartError,
  CloudBrowserStopUncertainError,
  CloudBrowserStoppedUncleanlyError,
} from './gologin-cloud-browser.ts';
import { BrowserActionFailedError, unexpectedFailureDetail } from './vinted-listing-read-error.ts';
import type { ChromiumProfileStore, ChromiumProfileLease } from './chromium-profile-store.ts';
import type { ChromiumBrokerClient } from './chromium-broker-client.ts';
import type { ChromiumProfileNetwork } from './chromium-persistent-browser.ts';

interface IsolatedChromiumOptions {
  /** Pause vor dem zweiten Ladeversuch der Startseite; nur Tests verkürzen sie. */
  initializeRetryDelayMs?: number;
  profiles: Pick<ChromiumProfileStore, 'acquire' | 'prepareStopped' | 'recoverStopped'>;
  launcher: Pick<ChromiumBrokerClient, 'launch' | 'recover'>;
  network: { resolve(profileId: string): Promise<ChromiumProfileNetwork> };
}

/** Der Controller verwaltet Profile und Reservierungen, aber keine Playwright-Verbindung. */
export class IsolatedChromiumBrowser {
  private readonly options: IsolatedChromiumOptions;
  private readonly leases = new Map<string, ChromiumProfileLease>();
  constructor(options: IsolatedChromiumOptions) {
    this.options = options;
  }
  async open(profileId: string): Promise<CloudBrowserHandle> {
    const lease = await this.options.profiles.acquire(profileId);
    this.leases.set(profileId, lease);
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
      let unclean = error instanceof CloudBrowserStoppedUncleanlyError;
      try {
        try {
          await this.options.launcher.recover(profileId);
        } catch (stopError) {
          if (!(stopError instanceof CloudBrowserStoppedUncleanlyError)) throw stopError;
          unclean = true;
        }
        await lease.confirmStopped();
        this.leases.delete(profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      if (unclean) throw new CloudBrowserStoppedUncleanlyError();
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
        let warning: CloudBrowserStoppedUncleanlyError | undefined;
        try {
          await handle.close();
        } catch (error) {
          if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
          warning = error;
        }
        await lease.confirmStopped();
        this.leases.delete(profileId);
        stopped = true;
        if (warning) throw warning;
      },
    };
  }
  async stop(profileId: string): Promise<void> {
    let warning: CloudBrowserStoppedUncleanlyError | undefined;
    try {
      await this.options.launcher.recover(profileId);
    } catch (error) {
      if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
      warning = error;
    }
    const lease = this.leases.get(profileId);
    if (lease) {
      await lease.confirmStopped();
      this.leases.delete(profileId);
    } else await this.options.profiles.recoverStopped(profileId);
    await this.options.profiles.prepareStopped(profileId);
    if (warning) throw warning;
  }
}
