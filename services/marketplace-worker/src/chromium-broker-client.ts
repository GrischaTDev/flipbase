import { posix } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { chromium } from 'playwright';
import { browserCommandLimit, isolatedBrowserActions } from './isolated-browser-actions.ts';
import {
  CloudBrowserStopUncertainError,
  type BrowserDesktop,
  type CloudBrowserHandle,
} from './gologin-cloud-browser.ts';

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
      if (!response.body) throw new Error('Brokerantwort fehlt');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > browserCommandLimit) {
          await reader.cancel();
          throw new Error('Brokerantwort zu groß');
        }
        chunks.push(chunk.value);
      }
      const serialized = Buffer.concat(chunks).toString('utf8');
      if (Buffer.byteLength(serialized) > browserCommandLimit)
        throw new Error('Brokerantwort zu groß');
      const result: unknown = JSON.parse(serialized);
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
  ): Promise<CloudBrowserHandle> {
    const profileId = this.profileId(directory);
    try {
      const { session } = await this.command(profileId, 'launch', { settings });
      if (typeof session !== 'string' || !/^[0-9a-f-]{36}$/.test(session))
        throw new Error('Ungültige Sitzungsberechtigung');
      const browser = isolatedBrowserActions({
        request: (command) => this.command(profileId, 'invoke', { session, command }),
      });
      let closed = false;
      let closing: Promise<void> | undefined;
      return {
        run: async (operation) => {
          if (closed || closing) throw new Error('Browsersitzung beendet');
          return operation(browser);
        },
        close: () => {
          closing ??= this.recover(profileId)
            .then(() => {
              closed = true;
            })
            .catch((error: unknown) => {
              closing = undefined;
              throw error;
            });
          return closing;
        },
      };
    } catch {
      await this.recover(profileId);
      throw new Error('Chromium-Start fehlgeschlagen');
    }
  }
  async launchGoLogin(profileId: string, token: string): Promise<CloudBrowserHandle> {
    const { session } = await this.command(profileId, 'launchGoLogin', { token });
    if (typeof session !== 'string' || !/^[0-9a-f-]{36}$/.test(session))
      throw new Error('Ungültige Sitzungsberechtigung');
    const browser = isolatedBrowserActions({
      request: (command) => this.command(profileId, 'invoke', { session, command }),
    });
    return { run: (operation) => operation(browser), close: () => this.recover(profileId) };
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
