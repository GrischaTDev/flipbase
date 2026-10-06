import { posix } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, type BrowserContext } from 'playwright';
import { CloudBrowserStopUncertainError, type BrowserDesktop } from './gologin-cloud-browser.ts';

export class ChromiumBrokerClient {
  private readonly profileRoot: string;
  private readonly token: string;
  private constructor(profileRoot: string, token: string) {
    this.profileRoot = profileRoot;
    this.token = token;
  }
  static async create(profileRoot: string): Promise<ChromiumBrokerClient> {
    const token = (await readFile('/run/secrets/chromium-broker-token', 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Privater Broker-Schlüssel fehlt');
    return new ChromiumBrokerClient(profileRoot, token);
  }
  private profileId(directory: string): string {
    const profileId = posix.relative(this.profileRoot, directory);
    if (
      directory !== posix.join(this.profileRoot, profileId) ||
      !/^chromium_[0-9a-f-]{36}$/.test(profileId)
    )
      throw new Error('Ungültige Profilkennung');
    return profileId;
  }
  private async command(
    profileId: string,
    action: string,
    parameters: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    try {
      const response = await fetch('http://chromium-host-control:4180/command', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({ profileId, action, ...parameters }),
      });
      if (!response.ok) throw new Error('Brokerauftrag fehlgeschlagen');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new Error('Brokerantwort fehlt');
      return result as Record<string, unknown>;
    } catch {
      throw new CloudBrowserStopUncertainError();
    }
  }
  async inspectProfileProcesses(directory: string): Promise<number[]> {
    const { processes } = await this.command(this.profileId(directory), 'inspect');
    if (
      !Array.isArray(processes) ||
      processes.some(
        (process) => typeof process !== 'number' || !Number.isSafeInteger(process) || process <= 0,
      )
    )
      throw new CloudBrowserStopUncertainError();
    return processes as number[];
  }
  async recover(profileId: string): Promise<void> {
    await this.command(profileId, 'recover');
  }
  async archive(profileId: string): Promise<void> {
    await this.command(profileId, 'archive');
  }
  async launch(
    directory: string,
    settings: NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>,
  ): Promise<BrowserContext> {
    const profileId = this.profileId(directory);
    try {
      const { endpoint } = await this.command(profileId, 'launch', { settings });
      if (
        typeof endpoint !== 'string' ||
        !/^http:\/\/172\.30\.88\.(?:12[89]|1[3-9]\d|2[0-4]\d|25[0-4]):9222$/.test(endpoint)
      )
        throw new Error('Ungültiger Browserendpunkt');
      const browser = await chromium.connectOverCDP(endpoint, {
        timeout: 10_000,
        noDefaults: true,
      });
      const context = browser.contexts()[0];
      if (!context || browser.contexts().length !== 1) throw new Error('Browserkontext fehlt');
      let closing: Promise<void> | undefined;
      context.close = () => {
        closing ??= this.recover(profileId).catch((error: unknown) => {
          closing = undefined;
          throw error;
        });
        return closing;
      };
      return context;
    } catch {
      await this.recover(profileId);
      throw new Error('Chromium-Start fehlgeschlagen');
    }
  }
  desktop(directory: string): BrowserDesktop {
    const profileId = this.profileId(directory);
    return {
      capture: async () => {
        const { image } = await this.command(profileId, 'capture');
        if (typeof image !== 'string' || image.length > 8 * 1024 * 1024)
          throw new Error('Browserbild fehlt');
        return Buffer.from(image, 'base64');
      },
      click: async (x, y) => {
        await this.command(profileId, 'click', { x, y });
      },
      type: async (text) => {
        await this.command(profileId, 'type', { text });
      },
      press: async (key) => {
        await this.command(profileId, 'press', { key });
      },
      drag: async (points) => {
        await this.command(profileId, 'drag', { points });
      },
    };
  }
}
