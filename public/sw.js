/* Nur geprüfte App-Dateien; Anmeldung, API und Privatmedien bleiben im Netzwerk. */
const BUILD_ID = '__PWA_BUILD_ID__';
const INVENTORY_HASH = '__PWA_INVENTORY_SHA256__';
const CACHE_PREFIX = 'flipbase-app-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const CLIENT_CACHE = 'flipbase-pwa-clients';
const repairs = new Set();
let inventoryPromise;
let assetsReady = false;
let updateAttempt;

async function digest(response) {
  const bytes = await response.clone().arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function allowedPath(path) {
  return (
    /^\/(?:index\.html|manifest\.webmanifest|favicon\.ico|[\w-]+\.(?:js|css))$/.test(path) ||
    /^\/(?:images|icons|fonts|i18n)\/[\w./-]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|ico|webp|avif|json)$/.test(
      path,
    )
  );
}
function validateInventory(inventory, buildId = BUILD_ID) {
  if (
    inventory.version !== 1 ||
    inventory.buildId !== buildId ||
    !Array.isArray(inventory.assets) ||
    inventory.assets.length > 5000
  )
    throw new Error('Ungültiger PWA-Dateistand.');
  const paths = new Set();
  for (const asset of inventory.assets) {
    if (
      !asset ||
      !allowedPath(asset.url) ||
      asset.url.includes('..') ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      paths.has(asset.url)
    )
      throw new Error('Ungültige App-Datei.');
    paths.add(asset.url);
  }
  if (!paths.has('/index.html')) throw new Error('App-Startdatei fehlt.');
  return inventory;
}
async function fetchInventory() {
  const response = await fetch('/pwa-assets.json', { cache: 'no-store' });
  if (!response.ok || (await digest(response)) !== INVENTORY_HASH)
    throw new Error('PWA-Inventar passt nicht zum Worker.');
  const inventory = validateInventory(await response.clone().json());
  return { response, inventory };
}
async function inventory() {
  if (!inventoryPromise)
    inventoryPromise = (async () => {
      const cached = await (await caches.open(CACHE_NAME)).match('/pwa-assets.json');
      if (cached && (await digest(cached)) === INVENTORY_HASH)
        return validateInventory(await cached.json());
      const current = await fetchInventory();
      await (await caches.open(CACHE_NAME)).put('/pwa-assets.json', current.response);
      return current.inventory;
    })().catch((error) => {
      inventoryPromise = undefined;
      throw error;
    });
  return inventoryPromise;
}
async function announce(type, details = {}) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type, buildId: BUILD_ID, ...details });
}
async function installBuild() {
  try {
    const current = await fetchInventory();
    const cache = await caches.open(CACHE_NAME);
    // Ein Fehler entfernt ausschließlich diesen unfertigen neuen Bau.
    for (const asset of current.inventory.assets) {
      const response = await fetch(asset.url, { cache: 'no-store' });
      if (!response.ok || (await digest(response)) !== asset.sha256)
        throw new Error(`App-Datei fehlt oder passt nicht: ${asset.url}`);
      await cache.put(asset.url, response);
    }
    await cache.put('/pwa-assets.json', current.response);
    inventoryPromise = Promise.resolve(current.inventory);
    assetsReady = true;
    await announce('PWA_UPDATE_READY');
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}
self.addEventListener('install', (event) => event.waitUntil(installBuild()));

self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      // Alte Chunks bleiben für noch laufende Ansichten verfügbar. Fremde Caches nie löschen.
      await caches.delete('flipbase-os-v4');
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const clientCache = await caches.open(CLIENT_CACHE);
      const referenced = new Set([CACHE_NAME]);
      for (const client of clients) {
        const binding = await clientCache.match(`/__pwa_clients/${encodeURIComponent(client.id)}`);
        if (binding) referenced.add(`${CACHE_PREFIX}${await binding.text()}`);
      }
      const ownCaches = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
      const previous = ownCaches.filter((name) => name !== CACHE_NAME).at(-1);
      if (previous) referenced.add(previous);
      for (const name of ownCaches) if (!referenced.has(name)) await caches.delete(name);
      for (const request of await clientCache.keys()) {
        const id = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1));
        if (!clients.some((client) => client.id === id)) await clientCache.delete(request);
      }
      await self.clients.claim();
      for (const client of clients) await reportAssets(client);
    })(),
  ),
);

function shouldHandle(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (
    url.origin === self.location.origin &&
    request.mode === 'navigate' &&
    ['/auth/login', '/auth/register', '/auth/set-password'].includes(url.pathname)
  )
    return true;
  if (
    url.origin !== self.location.origin ||
    /^\/(?:api|rest|auth|storage|functions|marketplace-browser|proxy)(?:\/|$)/.test(url.pathname)
  )
    return false;
  return request.mode === 'navigate' || allowedPath(url.pathname);
}
async function buildForClient(clientId) {
  const binding = clientId
    ? await (
        await caches.open(CLIENT_CACHE)
      ).match(`/__pwa_clients/${encodeURIComponent(clientId)}`)
    : null;
  const build = binding ? await binding.text() : BUILD_ID;
  if (!/^[a-f0-9]{64}$/.test(build)) throw new Error('Ungültige App-Zuordnung.');
  return build;
}
async function inventoryForBuild(build) {
  if (build === BUILD_ID) return inventory();
  const previous = await (await caches.open(`${CACHE_PREFIX}${build}`)).match('/pwa-assets.json');
  if (!previous) throw new Error('Vorheriger App-Dateistand fehlt.');
  return validateInventory(await previous.json(), build);
}
async function reportAssets(client) {
  let build = BUILD_ID;
  let ready = false;
  try {
    build = await buildForClient(client.id);
    const manifest = await inventoryForBuild(build);
    const cache = await caches.open(`${CACHE_PREFIX}${build}`);
    ready = true;
    for (const asset of manifest.assets) {
      const response = await cache.match(asset.url);
      if (!response || (await digest(response)) !== asset.sha256) {
        ready = false;
        break;
      }
    }
  } catch {
    /* Fehlende App-Dateien gelten nie als vorbereitet. */
  }
  client.postMessage({ type: 'PWA_ASSETS_STATE', buildId: build, ready });
}
async function reportBrokenBuild(build) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if ((await buildForClient(client.id)) === build)
      client.postMessage({ type: 'PWA_ASSETS_STATE', buildId: build, ready: false });
  }
}
async function readAsset(path, clientId = '', repairClientId = clientId) {
  const build = await buildForClient(clientId);
  const current = await inventoryForBuild(build);
  const asset = current.assets.find((candidate) => candidate.url === path);
  if (!asset) {
    // Ausschließlich inhaltsversionierte Chunks früherer eigener Bauten übernehmen.
    if (/^\/[\w-]+-[\w-]{8,}\.(?:js|css)$/.test(path)) {
      for (const name of await caches.keys()) {
        if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
        const cache = await caches.open(name);
        const previous = await cache.match('/pwa-assets.json');
        const manifest = previous ? await previous.json() : null;
        const expected = manifest?.assets?.find((candidate) => candidate.url === path);
        const response = expected ? await cache.match(path) : null;
        if (response && (await digest(response)) === expected.sha256) return response;
      }
    }
    return build === BUILD_ID
      ? fetch(new URL(path, self.location.origin).href)
      : new Response('Die App-Datei gehört nicht zu dieser Ansicht.', { status: 503 });
  }
  const cache = await caches.open(`${CACHE_PREFIX}${build}`);
  const cached = await cache.match(path);
  if (cached && (await digest(cached)) === asset.sha256) return cached;
  assetsReady = false;
  await reportBrokenBuild(build);
  const repairKey = `${repairClientId}:${build}:${path}`;
  if (!repairs.has(repairKey)) {
    repairs.add(repairKey);
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (response.ok && (await digest(response)) === asset.sha256) {
        await cache.put(path, response.clone());
        return response;
      }
    } catch {
      /* Ohne Verbindung wird kein fremder/neuer Dateistand eingesetzt. */
    }
  }
  return new Response(
    'Diese App-Datei ist offline nicht verfügbar. Bitte öffne Flipbase mit einer Verbindung erneut.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
async function readNavigation(event) {
  const clientId = event.resultingClientId || event.clientId;
  // Ein Neustart lädt immer den aktivierten Bau, auch ohne neue Browser-Client-ID.
  // Nur dieses Dokument wechselt; andere offene Ansichten behalten ihre Zuordnung.
  const response = await readAsset('/index.html', '', clientId);
  if (response.ok && clientId) {
    await (
      await caches.open(CLIENT_CACHE)
    ).put(`/__pwa_clients/${encodeURIComponent(clientId)}`, new Response(BUILD_ID));
  }
  return response;
}
self.addEventListener('fetch', (event) => {
  if (!shouldHandle(event.request)) return;
  const path =
    event.request.mode === 'navigate' ? '/index.html' : new URL(event.request.url).pathname;
  event.respondWith(
    (event.request.mode === 'navigate'
      ? readNavigation(event)
      : readAsset(path, event.clientId)
    ).catch(async () => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      client?.postMessage({ type: 'PWA_ASSETS_STATE', ready: false });
      return new Response('App-Dateien sind noch nicht bereit.', { status: 503 });
    }),
  );
});

async function finishUpdate(result) {
  const attempt = updateAttempt;
  if (!attempt) return;
  updateAttempt = undefined;
  clearTimeout(attempt.timer);
  for (const client of attempt.clients)
    client.postMessage({
      type: 'PWA_UPDATE_RESULT',
      buildId: BUILD_ID,
      attemptId: attempt.id,
      result,
    });
  attempt.resolve();
}
async function beginUpdate(event) {
  if (
    updateAttempt ||
    event.data.buildId !== BUILD_ID ||
    typeof event.data.attemptId !== 'string' ||
    !event.source?.id
  )
    return;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!clients.length || !clients.some((client) => client.id === event.source.id)) return;
  return new Promise((resolve) => {
    const attempt = {
      id: event.data.attemptId,
      requester: event.source.id,
      clients,
      acks: new Map(),
      phase: 'prepare',
      resolve,
    };
    updateAttempt = attempt;
    attempt.timer = setTimeout(() => {
      if (updateAttempt === attempt) void finishUpdate('blocked');
    }, 2000);
    for (const client of clients)
      client.postMessage({ type: 'PWA_PREPARE_UPDATE', buildId: BUILD_ID, attemptId: attempt.id });
  });
}
async function updateReply(event) {
  const attempt = updateAttempt;
  if (
    !attempt ||
    event.data.buildId !== BUILD_ID ||
    event.data.attemptId !== attempt.id ||
    !attempt.clients.some((client) => client.id === event.source?.id)
  )
    return;
  if (event.data.type === 'PWA_UPDATE_REVOKE' || event.data.safe !== true)
    return finishUpdate('blocked');
  const expectedType = attempt.phase === 'prepare' ? 'PWA_UPDATE_ACK' : 'PWA_UPDATE_COMMIT_ACK';
  if (event.data.type !== expectedType) return;
  attempt.acks.set(event.source.id, event.data.clientBuildId);
  if (attempt.acks.size !== attempt.clients.length) return;
  const currentClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (updateAttempt !== attempt) return;
  if (
    currentClients.length !== attempt.clients.length ||
    currentClients.some((client) => !attempt.clients.some((expected) => expected.id === client.id))
  )
    return finishUpdate('blocked');
  if (attempt.phase === 'prepare') {
    attempt.phase = 'commit';
    attempt.acks.clear();
    for (const client of currentClients)
      client.postMessage({ type: 'PWA_COMMIT_UPDATE', buildId: BUILD_ID, attemptId: attempt.id });
    return;
  }
  const clientCache = await caches.open(CLIENT_CACHE);
  for (const client of currentClients) {
    const clientBuild = attempt.acks.get(client.id);
    if (!/^[a-f0-9]{64}$/.test(clientBuild)) return finishUpdate('blocked');
    await clientCache.put(
      `/__pwa_clients/${encodeURIComponent(client.id)}`,
      new Response(clientBuild),
    );
  }
  if (updateAttempt !== attempt) return;
  const finalClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (updateAttempt !== attempt) return;
  if (
    finalClients.length !== attempt.clients.length ||
    finalClients.some((client) => !attempt.clients.some((expected) => expected.id === client.id))
  )
    return finishUpdate('blocked');
  await self.skipWaiting();
  await finishUpdate('applied');
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PWA_ACTIVE_QUERY')
    event.source?.postMessage({ type: 'PWA_ACTIVE_STATUS', buildId: BUILD_ID });
  if (event.data?.type === 'PWA_UPDATE_QUERY')
    event.source?.postMessage({ type: 'PWA_WAITING_STATUS', buildId: BUILD_ID });
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(beginUpdate(event));
  if (['PWA_UPDATE_ACK', 'PWA_UPDATE_COMMIT_ACK', 'PWA_UPDATE_REVOKE'].includes(event.data?.type))
    event.waitUntil(updateReply(event));
  if (event.data?.type === 'PWA_STATUS')
    event.waitUntil(
      (async () => {
        try {
          if (event.source) await reportAssets(event.source);
        } catch {
          assetsReady = false;
        }
      })(),
    );
});

function validatedPush(candidate) {
  const uuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    candidate.version !== 1 ||
    !uuid(candidate.eventId) ||
    !uuid(candidate.workspaceId) ||
    typeof candidate.title !== 'string' ||
    candidate.title.length > 80 ||
    typeof candidate.body !== 'string' ||
    candidate.body.length > 160 ||
    Object.keys(candidate).some(
      (key) =>
        !['version', 'eventId', 'workspaceId', 'category', 'title', 'body', 'target'].includes(key),
    )
  )
    return null;
  const target = candidate.target;
  if (!target || typeof target !== 'object') return null;
  const count = Object.keys(target).length;
  const valid =
    (target.kind === 'settings' && candidate.category === 'test' && count === 1) ||
    (target.kind === 'store_orders' && candidate.category === 'order' && count === 1) ||
    (target.kind === 'vinted_message' &&
      candidate.category === 'message' &&
      uuid(target.connectionId) &&
      uuid(target.conversationId) &&
      count === 3) ||
    (target.kind === 'ebay_orders' &&
      candidate.category === 'order' &&
      uuid(target.connectionId) &&
      count === 2) ||
    (target.kind === 'vinted_favorites' &&
      candidate.category === 'favorite' &&
      uuid(target.connectionId) &&
      count === 2) ||
    (target.kind === 'connection' &&
      candidate.category === 'connection' &&
      uuid(target.connectionId) &&
      count === 2);
  return valid ? candidate : null;
}
self.addEventListener('push', (event) =>
  event.waitUntil(
    (async () => {
      let payload = null;
      try {
        const text = event.data?.text() ?? '';
        if (text.length <= 4096) payload = validatedPush(JSON.parse(text));
      } catch {
        /* Ein kaputter Payload bekommt nur eine allgemeine sichtbare Meldung. */
      }
      // Favoriten zeigen die serverseitig belegten Konto-/Artikeldetails.
      // Nachrichten und Bestellungen enthalten weiterhin keine Kontaktdaten.
      const notificationContent = {
        message: {
          title: 'Neue Marktplatznachricht',
          body: 'Du hast eine neue Nachricht.',
          action: 'Nachricht öffnen',
        },
        order: {
          title: 'Neue Bestellung',
          body: 'Eine neue Bestellung ist eingegangen.',
          action: 'Bestellungen öffnen',
        },
        favorite: {
          title: 'Neue Favoriten auf Vinted',
          body: 'Deine Inserate haben neue Favoriten.',
          action: 'Inserate öffnen',
        },
        connection: {
          title: 'Kontoverbindung prüfen',
          body: 'Dein Marktplatzkonto braucht eine Anmeldung.',
          action: 'Konto prüfen',
        },
        test: {
          title: 'Flipbase: Testbenachrichtigung',
          body: 'Deine Testmeldung ist angekommen.',
          action: 'Einstellungen öffnen',
        },
      };
      const content = payload ? notificationContent[payload.category] : null;
      const favoriteDetails =
        payload?.category === 'favorite' &&
        /^(?:Artikel wurde favorisiert|\d+ Artikel wurden favorisiert) · .+/.test(payload.title);
      const isMobile =
        self.navigator?.userAgentData?.mobile ||
        /Android|iPhone|iPad|iPod/i.test(self.navigator?.userAgent ?? '');
      await self.registration.showNotification(
        favoriteDetails ? payload.title : (content?.title ?? 'Flipbase'),
        {
          body: favoriteDetails
            ? payload.body
            : (content?.body ?? 'Öffne Flipbase, um deine Benachrichtigungen zu prüfen.'),
          ...(isMobile ? {} : { icon: '/images/logo-mark-192.png' }),
          badge: '/icons/push-badge-monochrome-96.png',
          actions:
            content && self.Notification?.maxActions > 0
              ? [{ action: 'open', title: content.action }]
              : [],
          tag: payload ? `flipbase-event-${payload.eventId}` : 'flipbase-invalid-push',
          data: payload,
          renotify: false,
        },
      );
    })(),
  ),
);
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const payload = validatedPush(event.notification.data);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients.find(
        (candidate) => new URL(candidate.url).origin === self.location.origin,
      );
      if (client) {
        await client.focus();
        if (payload) client.postMessage({ type: 'PWA_PUSH_OPEN', payload });
        return;
      }
      const target = new URL(payload ? '/push/open' : '/auth/login', self.location.origin);
      if (payload) target.searchParams.set('context', JSON.stringify(payload));
      await self.clients.openWindow(target.href);
    })(),
  );
});
