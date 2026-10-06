import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { connect, isIP } from 'node:net';
import { createProxyForwarder, isPublicHost } from './proxy-forwarder.mjs';
import { closeChromeWindows } from './chrome-window-close.mjs';

const children = new Set();
let proxy;
let browser;
let finishing = false;
async function finish(exitCode) {
  if (finishing) return;
  finishing = true;
  process.exitCode = exitCode;
  // Die Anzeige bleibt bis zum Browserende bestehen, damit Chrome das Profil schließen kann.
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise((resolve) => {
      const deadline = setTimeout(resolve, 8_000);
      browser.once('exit', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    try {
      await closeChromeWindows();
    } catch {
      process.stderr.write('Chrome konnte nicht über die Fensterverwaltung geschlossen werden!\n');
      process.exitCode = 1;
    }
    await exited;
    if (browser.exitCode === null && browser.signalCode === null) {
      process.stderr.write('Chrome-Stopp unbestätigt; Profil vor Wiederverwendung prüfen!\n');
      process.exitCode = 1;
    }
  }
  proxy?.closeAllConnections();
  proxy?.close();
  for (const child of children) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 8_000);
  deadline.unref();
}
function launch(name, command, argumentsList) {
  if (finishing) throw new Error('Pilot wird beendet.');
  const child = spawn(command, argumentsList, { stdio: 'ignore' });
  children.add(child);
  child.on('error', () => {
    process.stderr.write(`${name}: Start fehlgeschlagen!\n`);
    void finish(1);
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!finishing) {
      process.stderr.write(`${name}: beendet.\n`);
      void finish(name === 'Chrome' && code === 0 ? 0 : 1);
    }
  });
  return child;
}
async function waitForSocket(address) {
  for (let attempt = 0; attempt < 100 && !finishing; attempt++) {
    const ready = await new Promise((resolve) => {
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
  throw new Error('Dienst nicht bereit.');
}
async function start() {
  const metadata = await lstat('/run/pilot/networks.json');
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > 65_536 ||
    (metadata.mode & 0o077) !== 0
  )
    throw new Error('Private Proxydatei erforderlich.');
  const configuration = JSON.parse(await readFile('/run/pilot/networks.json', 'utf8'));
  const network = configuration.networkProfiles?.find(
    (entry) => entry.id === process.env.PILOT_NETWORK_ID,
  );
  const address = new URL(network?.server);
  if (
    network?.kind !== 'proxy' ||
    address.protocol !== 'http:' ||
    isIP(address.hostname) !== 4 ||
    !isPublicHost(address.hostname) ||
    address.username ||
    address.password ||
    address.pathname !== '/' ||
    address.search ||
    address.hash ||
    !address.port ||
    typeof network.username !== 'string' ||
    typeof network.password !== 'string' ||
    !network.username ||
    !network.password
  )
    throw new Error('Proxykonfiguration ungültig.');
  await mkdir('/profile/home', { recursive: true, mode: 0o700 });
  process.env.HOME = '/profile/home';
  process.env.DISPLAY = ':99';
  process.env.TZ = 'Europe/Berlin';
  if (finishing) return;
  proxy = createProxyForwarder(network);
  proxy.on('error', () => {
    void finish(1);
  });
  await new Promise((resolve) => proxy.listen(3128, '127.0.0.1', resolve));
  if (finishing) {
    proxy.close();
    return;
  }
  launch('Anzeige', 'Xvfb', [':99', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp', '-ac']);
  await waitForSocket('/tmp/.X11-unix/X99');
  launch('Fensterverwaltung', 'openbox', []);
  launch('Fernbedienung', 'x11vnc', [
    '-display',
    ':99',
    '-localhost',
    '-rfbport',
    '5900',
    '-forever',
    '-shared',
    '-nopw',
    '-noxdamage',
    '-quiet',
  ]);
  await waitForSocket(5900);
  launch('Browseransicht', 'websockify', [
    '--web=/usr/share/novnc',
    '0.0.0.0:6080',
    '127.0.0.1:5900',
  ]);
  const argumentsList = [
    '--user-data-dir=/profile/chrome',
    '--no-first-run',
    '--lang=de-DE',
    '--start-maximized',
    '--proxy-server=http://127.0.0.1:3128',
    '--proxy-bypass-list=<-loopback>',
  ];
  if (process.env.PILOT_DEBUG === '1') argumentsList.push('--remote-debugging-port=9222');
  browser = launch('Chrome', 'google-chrome-stable', [...argumentsList, 'about:blank']);
  await waitForSocket(6080);
  process.stdout.write(
    `Cloud-Browserpilot bereit. Playwright getrennt; Debug=${process.env.PILOT_DEBUG === '1'}.\n`,
  );
}
process.on('SIGTERM', () => {
  void finish(0);
});
process.on('SIGINT', () => {
  void finish(0);
});
start().catch(() => {
  process.stderr.write('Cloud-Browserpilot konnte nicht gestartet werden!\n');
  void finish(1);
});
