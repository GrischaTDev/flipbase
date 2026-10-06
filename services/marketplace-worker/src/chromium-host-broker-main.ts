import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ChromiumContainerLauncher } from './chromium-container-launcher.ts';
import { chromiumHostHandler, chromiumHostOperations } from './chromium-host-broker.ts';

async function main(): Promise<void> {
  const profileRoot = '/var/lib/flipbase-chromium/profiles';
  const launcher = new ChromiumContainerLauncher({
    image: process.env['MARKETPLACE_CHROMIUM_IMAGE'] ?? '',
    hostId: process.env['MARKETPLACE_CHROMIUM_HOST_ID'] ?? '',
    network: 'flipbase-browser',
    profileRoot,
    hostProfileRoot: '/opt/flipbase-marketplace/chromium/profiles',
  });
  const token = (await readFile('/run/secrets/chromium-broker-token', 'utf8')).trim();
  const handler = chromiumHostHandler(token, chromiumHostOperations(launcher, profileRoot));
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 64;
  server.listen(4180, '0.0.0.0');
}
void main().catch(() => {
  process.stderr.write('Privater Chromium-Broker konnte nicht gestartet werden.\n');
  process.exitCode = 1;
});
