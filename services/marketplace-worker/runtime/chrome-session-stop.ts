import type { Browser } from 'playwright';
import { setTimeout as wait } from 'node:timers/promises';
import { closeChromeWindows } from '../../../tools/cloud-browser-pilot/chrome-window-close.mjs';

export async function closeChromeSession(
  connection: Pick<Browser, 'newBrowserCDPSession'> | undefined,
  isRunning: () => boolean,
): Promise<void> {
  if (!isRunning()) return;
  if (!connection) return closeChromeWindows(undefined, isRunning);
  const deadline = Date.now() + 30_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Ein Fensterschluss beendet Hintergrundaufgaben nicht zuverlässig. Browser.close
    // fordert ausdrücklich den regulären Browserabschluss einschließlich Profilspeicherung an.
    await Promise.race([
      connection.newBrowserCDPSession().then((session) => session.send('Browser.close')),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Browserabschluss nicht bestätigt')), 2_000);
      }),
    ]);
  } catch {
    // Ein verlorener CDP-Kanal kann den Abschluss bereits ausgelöst haben.
    // Ohne Bestätigung bleibt der native Fensterschluss ein begrenzter Ersatzweg.
    await closeChromeWindows(undefined, isRunning).catch(() => undefined);
  } finally {
    clearTimeout(timeout);
  }
  while (isRunning() && Date.now() < deadline) await wait(100);
  if (isRunning()) throw new Error('Chrome-Stopp unbestätigt');
}
