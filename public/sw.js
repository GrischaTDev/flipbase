/* Nur geprüfte App-Dateien; Anmeldung, API und Privatmedien bleiben im Netzwerk. */
const BUILD_ID = '__PWA_BUILD_ID__';
const VERSION = __PWA_VERSION_JSON__;
const INVENTORY_HASH = '__PWA_INVENTORY_SHA256__';
const CACHE_PREFIX = 'flipbase-app-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const CLIENT_CACHE = 'flipbase-pwa-clients';
const VERSION_CACHE = 'flipbase-pwa-versions';
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
async function fetchInventory(path = '/pwa-assets.json') {
  const response = await fetch(path, { cache: 'no-store' });
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
      const current = await fetchInventory().catch(() =>
        fetchInventory(`/app-builds/${BUILD_ID}/pwa-assets.json`),
      );
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
      const versions = await caches.open(VERSION_CACHE);
      const now = Date.now();
      for (const name of ownCaches) {
        const key = `/__pwa_versions/${name.slice(CACHE_PREFIX.length)}`;
        const record = await versions.match(key);
        const created = record ? Number(await record.text()) : now;
        if (!record) await versions.put(key, new Response(String(now)));
        // Ältere/unbekannte Dokumente können beim ersten Protokollwechsel noch
        // ohne Zuordnung sein. Ihre eigenen Caches erhalten eine Übergangsfrist.
        if (Number.isFinite(created) && now - created < 30 * 86400_000) referenced.add(name);
      }
      const previous = ownCaches.filter((name) => name !== CACHE_NAME).at(-1);
      if (previous) referenced.add(previous);
      for (const name of ownCaches) if (!referenced.has(name)) await caches.delete(name);
      for (const request of await clientCache.keys()) {
        const id = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1));
        if (!clients.some((client) => client.id === id)) await clientCache.delete(request);
      }
      await self.clients.claim();
      for (const client of clients) {
        try {
          await reportAssets(client);
        } catch {
          /* Ein inzwischen geschlossenes Fenster ist kein Aktivierungsfehler. */
        }
      }
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
  const cache = await caches.open(`${CACHE_PREFIX}${build}`);
  let previous = await cache.match('/pwa-assets.json');
  if (!previous) {
    previous = await fetch(`/app-builds/${build}/pwa-assets.json`, { cache: 'no-store' });
    if (!previous.ok) throw new Error('Vorheriger App-Dateistand fehlt.');
    validateInventory(await previous.clone().json(), build);
    await cache.put('/pwa-assets.json', previous.clone());
  }
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
    try {
      if ((await buildForClient(client.id)) === build)
        client.postMessage({ type: 'PWA_ASSETS_STATE', buildId: build, ready: false });
    } catch {
      // Eine fremde unbekannte Ansicht darf die Reparatur dieses Baus nicht verhindern.
    }
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
    for (const source of [`/app-builds/${build}${path}`, path]) {
      try {
        const response = await fetch(source, { cache: 'no-store' });
        if (response.ok && (await digest(response)) === asset.sha256) {
          await cache.put(path, response.clone());
          return response;
        }
      } catch {
        /* Ohne Verbindung wird kein fremder/neuer Dateistand eingesetzt. */
      }
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

async function finishUpdate(result, reason = '') {
  const attempt = updateAttempt;
  if (!attempt) return;
  updateAttempt = undefined;
  clearTimeout(attempt.timer);
  attempt.client.postMessage({
    type: 'PWA_UPDATE_RESULT',
    buildId: BUILD_ID,
    attemptId: attempt.id,
    result,
    reason,
  });
  attempt.resolve();
}

async function beginUpdate(event) {
  if (
    event.data.buildId !== BUILD_ID ||
    typeof event.data.attemptId !== 'string' ||
    event.data.attemptId.length > 100 ||
    !event.source?.id
  )
    return;
  if (updateAttempt) {
    event.source.postMessage({
      type: 'PWA_UPDATE_RESULT',
      buildId: BUILD_ID,
      attemptId: event.data.attemptId,
      result: 'blocked',
      reason: 'another_attempt',
    });
    return;
  }
  return new Promise((resolve) => {
    const attempt = {
      id: event.data.attemptId,
      client: event.source,
      phase: 'prepare',
      advancing: false,
      resolve,
      clientBuild: '',
    };
    updateAttempt = attempt;
    attempt.timer = setTimeout(() => {
      if (updateAttempt === attempt) void finishUpdate('blocked', 'requester_timeout');
    }, 4000);
    // Nur dieses Dokument wird gesperrt. Fremde Fenster behalten ihre Eingaben.
    attempt.client.postMessage({
      type: 'PWA_PREPARE_UPDATE',
      buildId: BUILD_ID,
      attemptId: attempt.id,
    });
  });
}

async function updateReply(event) {
  const attempt = updateAttempt;
  if (
    !attempt ||
    event.source?.id !== attempt.client.id ||
    event.data.buildId !== BUILD_ID ||
    event.data.attemptId !== attempt.id
  )
    return;
  if (event.data.type === 'PWA_UPDATE_REVOKE' || event.data.safe !== true)
    return finishUpdate('blocked', 'requester_busy');
  const expected = attempt.phase === 'prepare' ? 'PWA_UPDATE_ACK' : 'PWA_UPDATE_COMMIT_ACK';
  if (event.data.type !== expected || attempt.advancing) return;
  if (!/^[a-f0-9]{64}$/.test(event.data.clientBuildId ?? ''))
    return finishUpdate('blocked', 'requester_build');
  if (attempt.phase === 'prepare') {
    attempt.clientBuild = event.data.clientBuildId;
    attempt.phase = 'commit';
    attempt.client.postMessage({
      type: 'PWA_COMMIT_UPDATE',
      buildId: BUILD_ID,
      attemptId: attempt.id,
    });
    return;
  }
  if (attempt.clientBuild !== event.data.clientBuildId)
    return finishUpdate('blocked', 'requester_build');
  attempt.advancing = true;
  try {
    const bindings = await caches.open(CLIENT_CACHE);
    await bindings.put(
      `/__pwa_clients/${encodeURIComponent(attempt.client.id)}`,
      new Response(attempt.clientBuild),
    );
    // Vorhandene Zuordnungen stammen aus der Navigation des bisherigen Workers.
    // Unbekannte Alt-Dokumente nie stillschweigend mit neuen Dateien bedienen.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      const key = `/__pwa_clients/${encodeURIComponent(client.id)}`;
      if (!(await bindings.match(key))) await bindings.put(key, new Response('unassigned'));
    }
    if (updateAttempt !== attempt) return;
    if (!(await self.clients.get(attempt.client.id)))
      return finishUpdate('blocked', 'requester_closed');
    await self.skipWaiting();
    if (updateAttempt === attempt) await finishUpdate('applied');
  } catch {
    if (updateAttempt === attempt) await finishUpdate('blocked', 'storage');
  }
}

async function bindDocument(event) {
  const build = event.data.clientBuildId;
  if (!event.source?.id || !/^[a-f0-9]{64}$/.test(build ?? '')) return;
  // Der Dateistand muss bekannt sein. Die laufende Ansicht meldet ausschließlich
  // ihre eigene Identität; sie kann kein fremdes Dokument umhängen.
  await inventoryForBuild(build);
  await (
    await caches.open(CLIENT_CACHE)
  ).put(`/__pwa_clients/${encodeURIComponent(event.source.id)}`, new Response(build));
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PWA_BIND_CLIENT')
    event.waitUntil(bindDocument(event).catch(() => undefined));
  if (event.data?.type === 'PWA_ACTIVE_QUERY')
    event.source?.postMessage({ type: 'PWA_ACTIVE_STATUS', buildId: BUILD_ID, version: VERSION });
  if (event.data?.type === 'PWA_UPDATE_QUERY')
    event.source?.postMessage({ type: 'PWA_WAITING_STATUS', buildId: BUILD_ID, version: VERSION });
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
