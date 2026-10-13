import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const origin = 'https://app.flipbase.test';
const hash = (text) => createHash('sha256').update(text).digest('hex');

export function createWorker({ corrupt = false, clients = [] } = {}) {
  const resources = new Map([
    ['/index.html', '<html>build-a</html>'],
    ['/chunk-A1.js', 'lazy-a'],
    ['/app-startup.js', 'startup-a'],
  ]);
  const inventory = {
    version: 1,
    buildId: 'a'.repeat(64),
    assets: [...resources].map(([url, content]) => ({ url, sha256: hash(content) })),
  };
  const inventoryText = JSON.stringify(inventory);
  resources.set(
    '/pwa-assets.json',
    corrupt
      ? inventoryText.replace('lazy', 'evil').replace(inventory.buildId, 'b'.repeat(64))
      : inventoryText,
  );
  const storage = new Map();
  const absolute = (request) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async addAll(urls) {
          for (const url of urls)
            entries.set(absolute(url), new Response(resources.get(url) ?? 'fixture-static'));
        },
        async put(request, response) {
          entries.set(absolute(request), response.clone());
        },
        async match(request) {
          return entries.get(absolute(request))?.clone();
        },
        async delete(request) {
          return entries.delete(absolute(request));
        },
        async keys() {
          return [...entries.keys()].map((url) => new Request(url));
        },
      };
    },
    async keys() {
      return [...storage.keys()];
    },
    async delete(name) {
      return storage.delete(name);
    },
    async match(request) {
      for (const name of storage.keys()) {
        const found = await (await caches.open(name)).match(request);
        if (found) return found;
      }
    },
  };
  const handlers = new Map();
  const messages = [];
  const calls = [];
  let skipCount = 0;
  const self = {
    location: { origin, href: `${origin}/sw.js` },
    registration: {
      scope: `${origin}/`,
      async showNotification(title, options) {
        messages.push({ title, options });
      },
    },
    clients: {
      async matchAll() {
        return clients;
      },
      async get(id) {
        return clients.find((client) => client.id === id);
      },
      async claim() {},
      async openWindow(url) {
        calls.push(`open:${url}`);
      },
    },
    addEventListener(name, handler) {
      handlers.set(name, handler);
    },
    async skipWaiting() {
      skipCount++;
    },
  };
  const fetch = async (request) => {
    const url = new URL(typeof request === 'string' ? request : request.url, origin);
    calls.push(url.href);
    if (!resources.has(url.pathname)) throw new Error('offline or missing');
    return new Response(resources.get(url.pathname), { status: 200 });
  };
  const context = vm.createContext({
    self,
    caches,
    fetch,
    crypto: webcrypto,
    URL,
    Request,
    Response,
    TextEncoder,
    Uint8Array,
    setTimeout,
    clearTimeout,
    console,
  });
  const template = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  vm.runInContext(
    template
      .replaceAll('__PWA_BUILD_ID__', inventory.buildId)
      .replaceAll('__PWA_INVENTORY_SHA256__', hash(inventoryText)),
    context,
  );
  async function dispatch(name, details = {}) {
    const waiting = [];
    let response;
    handlers.get(name)?.({
      waitUntil(promise) {
        waiting.push(promise);
      },
      respondWith(promise) {
        response = promise;
      },
      ...details,
    });
    await Promise.all(waiting);
    return response;
  }
  return {
    dispatch,
    resources,
    caches,
    storage,
    inventory,
    calls,
    messages,
    clients,
    get skipCount() {
      return skipCount;
    },
    async request(path, clientId = '', resultingClientId = '') {
      const isNavigation = path.startsWith('navigate:');
      const request = isNavigation
        ? { url: `${origin}${path.slice(9)}`, method: 'GET', mode: 'navigate' }
        : new Request(new URL(path, origin));
      return dispatch('fetch', { request, clientId, resultingClientId });
    },
  };
}
