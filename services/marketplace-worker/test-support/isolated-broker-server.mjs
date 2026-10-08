import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ChromiumContainerLauncher } from '../dist/chromium-container-launcher.js';
import { chromiumHostHandler, chromiumHostOperations } from '../dist/chromium-host-broker.js';

// Nur lokale Docker-Desktop-Abnahme: der produktive Launcher verlangt zusätzlich
// die echte Host-Firewall. GitHub prüft diese weiterhin mit dem Bootstrap-Skript.
const launcher = new ChromiumContainerLauncher({
  image: process.env.SESSION_IMAGE,
  profileRoot: '/var/lib/flipbase-chromium/profiles',
  hostProfileRoot: `${process.env.FIXTURE_HOST_ROOT}/profiles`,
  seccompProfile: '/var/lib/flipbase-chromium/chromium-seccomp.json',
  hostId: 'pilot-01',
  network: 'flipbase-browser',
  verifyFirewall: async () => undefined,
});
const handler = chromiumHostHandler(
  (await readFile('/run/secrets/chromium-broker-token', 'utf8')).trim(),
  chromiumHostOperations(launcher, '/var/lib/flipbase-chromium/profiles'),
);
createServer((request, response) => {
  void handler(request, response);
}).listen(4180, '0.0.0.0');
