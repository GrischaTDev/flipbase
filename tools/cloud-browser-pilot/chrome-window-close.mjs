import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** WM_CLOSE beendet Chrome wie das Schließen seiner Fenster, bevor die Anzeige endet. */
export async function closeChromeWindows(run = execute) {
  const { stdout } = await run('wmctrl', ['-lx'], { timeout: 2_000 });
  for (const line of stdout.split('\n')) {
    const [id, , windowClass] = line.trim().split(/\s+/);
    if (
      /^0x[0-9a-f]+$/i.test(id ?? '') &&
      ['google-chrome', 'google-chrome.google-chrome'].includes(windowClass?.toLowerCase())
    ) {
      await run('wmctrl', ['-ic', id], { timeout: 2_000 });
    }
  }
}
