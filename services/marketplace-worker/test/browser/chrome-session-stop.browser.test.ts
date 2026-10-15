import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';
import { closeChromeSession } from '../../runtime/chrome-session-stop.ts';

const supported =
  process.platform === 'linux' &&
  (() => {
    try {
      execFileSync('google-chrome-stable', ['--version']);
      return true;
    } catch {
      return false;
    }
  })();

if (process.env.REQUIRE_CHROME_STOP_TESTS === '1' && !supported)
  throw new Error(
    'Die verpflichtende Chrome-Stoppprüfung benötigt Linux und das Sitzungsimage mit Chrome',
  );

for (const background of [false, true]) {
  test(
    `Chrome stops cleanly and persists cookies with background keepalive=${background}`,
    { skip: !supported, timeout: 60_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'flipbase-chrome-stop-'));
      const previousDisplay = process.env.DISPLAY;
      process.env.DISPLAY = ':97';
      const env = { ...process.env, DISPLAY: ':97' };
      const display = spawn(
        'Xvfb',
        [':97', '-screen', '0', '1280x900x24', '-nolisten', 'tcp', '-ac'],
        { env, stdio: 'ignore' },
      );
      await wait(300);
      const wm = spawn('openbox', [], { env, stdio: 'ignore' });
      let browser: ReturnType<typeof spawn> | undefined;
      try {
        for (const phase of ['write', 'read']) {
          await rm(join(root, 'DevToolsActivePort'), { force: true });
          browser = spawn(
            'google-chrome-stable',
            [
              `--user-data-dir=${root}`,
              '--no-first-run',
              '--remote-debugging-port=0',
              ...(background ? ['--keep-alive-for-test'] : []),
              'about:blank',
            ],
            { env, stdio: 'ignore' },
          );
          let endpoint: string | undefined;
          for (let attempt = 0; attempt < 100; attempt++) {
            try {
              const [port, path] = (await readFile(join(root, 'DevToolsActivePort'), 'utf8'))
                .trim()
                .split('\n');
              endpoint = `ws://127.0.0.1:${port}${path}`;
              break;
            } catch {
              await wait(100);
            }
          }
          assert.ok(endpoint, 'Chrome muss bereit sein');
          const connection = await chromium.connectOverCDP(endpoint, { noDefaults: true });
          const context = connection.contexts()[0]!;
          if (phase === 'write')
            await context.addCookies([
              {
                name: 'stop_fixture',
                value: 'persisted',
                domain: 'fixture.invalid',
                path: '/',
                expires: Date.now() / 1000 + 3600,
              },
            ]);
          else
            assert.equal(
              (await context.cookies()).find((cookie) => cookie.name === 'stop_fixture')?.value,
              'persisted',
            );
          const child = browser;
          try {
            await closeChromeSession(
              connection,
              () => child.exitCode === null && child.signalCode === null,
            );
            assert.equal(child.exitCode, 0);
            assert.equal(child.signalCode, null);
            const preferences = JSON.parse(
              await readFile(join(root, 'Default', 'Preferences'), 'utf8'),
            ) as { profile: { exit_type: string } };
            assert.equal(preferences.profile.exit_type, 'Normal');
          } finally {
            await connection.close();
          }
        }
      } finally {
        if (browser && browser.exitCode === null && browser.signalCode === null) {
          const ended = new Promise<void>((resolve) => browser!.once('exit', () => resolve()));
          browser.kill('SIGKILL');
          await ended;
        }
        wm.kill();
        display.kill();
        await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        if (previousDisplay === undefined) delete process.env.DISPLAY;
        else process.env.DISPLAY = previousDisplay;
      }
    },
  );
}
