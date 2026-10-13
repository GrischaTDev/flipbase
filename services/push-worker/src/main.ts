import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig } from './config.ts';
import { createPushDeliveryStore } from './push-delivery-store.ts';
import { createPushProvider } from './push-provider.ts';
import { PushDispatcher } from './push-dispatcher.ts';
import { EbayOrderObserver } from './ebay-order-observer.ts';

const config = readConfig();
const store = createPushDeliveryStore(config);
const dispatcher = new PushDispatcher(config, store, createPushProvider(config));
const observer = new EbayOrderObserver(config);
let lastSuccess = Date.now();
let counts: Record<string, number> = {
  waiting: 0,
  accepted: 0,
  retry: 0,
  expired: 0,
  configuration_error: 0,
};
let stopped = false;
const shutdown = new AbortController();
const server = createServer((request, response) => {
  if (request.url !== '/healthz') {
    response.writeHead(404).end();
    return;
  }
  const healthy = !config.enabled || Date.now() - lastSuccess < 120000;
  response
    .writeHead(healthy ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    .end(
      JSON.stringify({
        healthy,
        enabled: config.enabled,
        scope: config.allowAll ? 'global' : 'pilot',
        commit: config.commit,
        counts,
        configurationError: (counts.configuration_error ?? 0) > 0,
      }),
    );
});
server.listen(config.port, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    stopped = true;
    shutdown.abort();
    server.close();
  });
async function run() {
  let nextCleanup = 0;
  while (!stopped) {
    const started = Date.now();
    try {
      await dispatcher.dispatch();
      if (config.supabaseUrl && config.serviceKey) {
        counts = await store.health();
        if (Date.now() >= nextCleanup) {
          await store.cleanup();
          nextCleanup = Date.now() + 3600000;
        }
      }
      lastSuccess = Date.now();
    } catch {
      process.stderr.write('Push worker database unavailable!\n');
    }
    try {
      await delay(Math.max(0, 5000 - (Date.now() - started)), undefined, {
        signal: shutdown.signal,
      });
    } catch {
      if (!stopped) throw new Error('Push polling interrupted');
    }
  }
}
async function observeOrders() {
  while (!stopped) {
    try {
      await observer.observe();
    } catch {
      process.stderr.write('eBay observer unavailable!\n');
    }
    try {
      await delay(5000, undefined, { signal: shutdown.signal });
    } catch {
      if (!stopped) throw new Error('Observer interrupted');
    }
  }
}
await Promise.all([run(), observeOrders()]);
