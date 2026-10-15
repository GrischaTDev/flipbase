import { chromium } from '@playwright/test';
import { createServer } from 'node:net';

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
  const owner = await chromium.launch({
    channel: 'chromium',
    args: [`--remote-debugging-port=${address.port}`],
  });
  try {
    // Der Standardkontext muss seine echten Sichtbarkeits-/Lebenszykluszustände behalten.
    const connection = await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, {
      noDefaults: true,
    });
    return {
      context: connection.contexts()[0],
      async close() {
        try {
          await connection.close();
        } finally {
          await owner.close();
        }
      },
    };
  } catch (error) {
    await owner.close();
    throw error;
  }
}
