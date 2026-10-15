import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

/** Eigener Testbrowser ohne erzwungen sichtbare Tabs: nur so friert Chromium sie ein. */
export async function launchPwaLifecycleBrowser() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Testport fehlt.');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const profileRoot = resolve(tmpdir());
  const profile = await mkdtemp(join(profileRoot, 'flipbase-pwa-lifecycle-'));
  // Nur eine Steuerverbindung: zwei Playwright-Verbindungen können unter Linux
  // die Worker-Abfrage anhalten, bevor der Test eine Ansicht einfriert.
  const owner = spawn(
    chromium.executablePath(),
    [
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${address.port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    {
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  let launchError: Error | undefined;
  const stopped = new Promise<void>((resolve) => {
    owner.once('exit', () => resolve());
    owner.once('error', (error) => {
      launchError = error;
      resolve();
    });
  });
  const closeOwner = async () => {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill();
    await stopped;
    if (
      dirname(profile) !== profileRoot ||
      !basename(profile).startsWith('flipbase-pwa-lifecycle-')
    )
      throw new Error('Unerwarteter Pfad des Testbrowserprofils.');
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  const endpoint = `http://127.0.0.1:${address.port}`;
  try {
    await expect
      .poll(async () => {
        if (launchError) throw launchError;
        try {
          return (await fetch(`${endpoint}/json/version`)).ok;
        } catch {
          return false;
        }
      })
      .toBe(true);
    // Der Standardkontext muss seine echten Sichtbarkeits-/Lebenszykluszustände behalten.
    const connection = await chromium.connectOverCDP(endpoint, {
      noDefaults: true,
    });
    return {
      context: connection.contexts()[0],
      async close() {
        try {
          const session = await connection.newBrowserCDPSession();
          await session.send('Browser.close').catch(() => undefined);
          await connection.close();
        } finally {
          await closeOwner();
        }
      },
    };
  } catch (error) {
    await closeOwner();
    throw error;
  }
}
