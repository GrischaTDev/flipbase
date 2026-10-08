import { spawn, type ChildProcess } from 'node:child_process';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
let remoteConnection: Browser | undefined;
import { vintedBrowserActions } from '../src/vinted-browser-actions.ts';
import { ChromiumDesktopControls } from '../src/chromium-desktop-controls.ts';
import { commandRecord } from '../src/isolated-browser-actions.ts';
import { startSessionCommands } from './session-command-server.ts';
import { connect } from 'node:net';
import { createProxyForwarder } from '../../../tools/cloud-browser-pilot/proxy-forwarder.mjs';
import { closeChromeWindows } from '../../../tools/cloud-browser-pilot/chrome-window-close.mjs';
import { parseChromeSessionConfiguration } from './chrome-session-config.ts';

let browser: ChildProcess | undefined;
let display: ChildProcess | undefined;
let windowManager: ChildProcess | undefined;
let proxy: Server | undefined;
let finishing = false;
let isReady = false;
let commandServer: Awaited<ReturnType<typeof startSessionCommands>> | undefined;
// 78 kennzeichnet ausschließlich einen Startfehler mit erfolgreich geschlossenem Profil.
async function finish(exitCode: 0 | 1 | 78): Promise<void> {
  if (finishing) return;
  finishing = true;
  process.exitCode = exitCode;
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, 8_000);
      browser?.once('exit', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    try {
      await closeChromeWindows(
        undefined,
        () => browser?.exitCode === null && browser.signalCode === null,
      );
    } catch {
      process.exitCode = 75;
    }
    await exited;
    // 75 hält Profil und IP reserviert, wenn ein sauberer Chrome-Stopp unbestätigt bleibt.
    if (browser.exitCode === null && browser.signalCode === null) {
      process.exitCode = 75;
      browser.kill('SIGKILL');
    }
  }
  commandServer?.close();
  if (remoteConnection)
    await remoteConnection.close().catch(() => {
      process.exitCode = 75;
    });
  proxy?.closeAllConnections();
  proxy?.close();
  windowManager?.kill('SIGTERM');
  display?.kill('SIGTERM');
}
process.on('SIGTERM', () => {
  void finish(0);
});
process.on('SIGINT', () => {
  void finish(0);
});
async function waitForSocket(address: string | number): Promise<void> {
  for (let attempt = 0; attempt < 100 && !finishing; attempt++) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = typeof address === 'string' ? connect(address) : connect(address, '127.0.0.1');
      socket.setTimeout(250);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chrome-Sitzungsdienst nicht bereit');
}

async function startup(): Promise<void> {
  let serialized: string | undefined;
  const deadline = Date.now() + 60_000;
  while (!serialized && Date.now() < deadline && !finishing) {
    try {
      serialized = await readFile('/tmp/startup.json', 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!serialized || serialized.length > 16_384) throw new Error('Sitzungskonfiguration fehlt');
  const metadata = await lstat('/tmp/startup.json');
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
    throw new Error('Private Sitzungskonfiguration erforderlich');
  await unlink('/tmp/startup.json');
  const configuration = commandRecord(JSON.parse(serialized));
  if (configuration.remoteEndpoint !== undefined) {
    if (
      typeof configuration.remoteEndpoint !== 'string' ||
      !/^ws:\/\/172\.30\.88\.3:4181\/session\/[0-9a-f-]{36}$/.test(configuration.remoteEndpoint)
    )
      throw new Error('Ungültiger GoLogin-Sitzungskanal');
    const connection = await chromium.connectOverCDP(configuration.remoteEndpoint, {
      timeout: 30000,
    });
    remoteConnection = connection;
    const page = connection.contexts()[0]?.pages()[0];
    if (!page) throw new Error('Browserseite fehlt');
    commandServer = await startSessionCommands(vintedBrowserActions(connection));
    isReady = true;
    return;
  }
  const settings = parseChromeSessionConfiguration(configuration);
  try {
    await lstat('/profile/SingletonLock');
    throw new Error('Chromeprofil ist noch gesperrt');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  process.env.DISPLAY = ':99';
  process.env.HOME = '/home/node';
  process.env.TZ = 'Europe/Berlin';
  if (settings.proxy) {
    proxy = createProxyForwarder(settings.proxy);
    proxy.on('error', () => {
      void finish(isReady ? 1 : 78);
    });
    await new Promise<void>((resolve) => proxy?.listen(3128, '127.0.0.1', resolve));
  }
  if (finishing) return;
  display = spawn(
    'Xvfb',
    [':99', '-screen', '0', `${settings.width}x${settings.height}x24`, '-nolisten', 'tcp', '-ac'],
    { stdio: 'ignore' },
  );
  display.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  display.on('exit', () => {
    if (!finishing) void finish(isReady ? 1 : 78);
  });
  await waitForSocket('/tmp/.X11-unix/X99');
  if (finishing) return;
  windowManager = spawn('openbox', [], { stdio: 'ignore' });
  windowManager.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  windowManager.on('exit', () => {
    if (!finishing) void finish(isReady ? 1 : 78);
  });
  browser = spawn('google-chrome-stable', settings.argumentsList, { stdio: 'ignore' });
  browser.on('error', () => {
    void finish(isReady ? 1 : 78);
  });
  browser.on('exit', (code) => {
    if (!finishing) void finish(isReady ? (code === 0 ? 0 : 1) : 78);
  });
  await waitForSocket(9223);
  if (finishing) return;
  const connection = await chromium.connectOverCDP('http://127.0.0.1:9223', {
    timeout: 10000,
    noDefaults: true,
  });
  const page = connection.contexts()[0]?.pages()[0];
  if (!page) throw new Error('Browserseite fehlt');
  const desktop = new ChromiumDesktopControls({
    width: settings.width,
    height: settings.height,
    authorize: async () => {
      if (finishing) throw new Error('Sitzung beendet');
    },
    execute: (argumentsList, input) =>
      new Promise((resolve, reject) => {
        const program = argumentsList[0];
        if (!program) return reject(new Error('Browserbedienung fehlt'));
        const child = execFile(
          program,
          argumentsList.slice(1),
          { encoding: 'buffer', timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
          (error, stdout) =>
            error ? reject(new Error('Browserbedienung fehlgeschlagen')) : resolve(stdout),
        );
        child.stdin?.end(input ?? '');
      }),
  });
  commandServer = await startSessionCommands(vintedBrowserActions(connection, desktop));
  isReady = true;
}
// Fehlermeldungen können Browser-URLs oder Zugangsdaten enthalten und werden nicht ausgegeben.
startup().catch(() => {
  void finish(isReady ? 1 : 78);
});
