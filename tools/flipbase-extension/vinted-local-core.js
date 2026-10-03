// Reine Verträge und Parser; Chrome-Zugriff bleibt im Hintergrundadapter.
(function exposeVintedLocalCore(root) {
  const requestTypes = new Set(['PREPARE', 'BIND', 'SYNC', 'DISCONNECT']);
  const storageKey = 'vinted_local_installation';
  const requestPrefix = 'FLIPBASE_VINTED_LOCAL_';
  class LocalBindingInvalidError extends Error {
    constructor() {
      super(
        'Die lokale Verbindung ist nicht mehr gültig. Prüfe das Konto erneut und erteile eine neue Freigabe.',
      );
      this.code = 'local_binding_invalid';
    }
  }
  const identifier = (value) => {
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    return typeof text === 'string' && /^[1-9][0-9]{0,31}$/.test(text) ? text : null;
  };
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const uuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const hex = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
  const decimal = (value) => {
    const amount =
      typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : value;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
  };
  const image = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  };

  function isAppOrigin(origin) {
    try {
      const url = new URL(origin);
      return (
        url.origin === origin &&
        ((url.protocol === 'https:' && ['app.flipbase.de', 'flipbase.de'].includes(url.hostname)) ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }

  function isApiUrl(address, appOrigin) {
    try {
      const url = new URL(address);
      const app = new URL(appOrigin);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/functions/v1/marketplace-local-extension' &&
        (url.origin === 'https://api.flipbase.de' ||
          (['localhost', '127.0.0.1'].includes(app.hostname) &&
            app.protocol === 'http:' &&
            ['http://127.0.0.1:54351', 'http://localhost:54351'].includes(url.origin)))
      );
    } catch {
      return false;
    }
  }

  function parseRequest(message, origin) {
    if (
      !isAppOrigin(origin) ||
      !record(message) ||
      typeof message.type !== 'string' ||
      !message.type.startsWith(requestPrefix) ||
      typeof message.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(message.requestId)
    )
      return null;
    const action = message.type.slice(requestPrefix.length);
    if (!requestTypes.has(action)) return null;
    const allowedKeys =
      action === 'PREPARE' ? ['type', 'requestId'] : ['type', 'requestId', 'payload'];
    if (Object.keys(message).some((key) => !allowedKeys.includes(key))) return null;
    if (action === 'PREPARE') return { action, requestId: message.requestId };
    const payload = message.payload;
    if (!record(payload) || !uuid(payload.workspaceId) || !uuid(payload.connectionId)) return null;
    const payloadKeys =
      action === 'BIND'
        ? ['workspaceId', 'connectionId', 'externalAccountId', 'apiUrl', 'expiresAt', 'tokenHash']
        : ['workspaceId', 'connectionId'];
    if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) return null;
    if (
      action === 'BIND' &&
      (!identifier(payload.externalAccountId) ||
        !hex(payload.tokenHash) ||
        !isApiUrl(payload.apiUrl, origin) ||
        typeof payload.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(payload.expiresAt)))
    )
      return null;
    return { action, requestId: message.requestId, payload };
  }

  function parseIdentity(profile) {
    const user = record(profile) && record(profile.user) ? profile.user : null;
    const id = identifier(user?.id);
    const username = user?.login ?? user?.username;
    if (
      !id ||
      typeof username !== 'string' ||
      !/^[^\p{Cc}]{1,120}$/u.test(username) ||
      !username.trim()
    ) {
      throw new Error(
        'Vinted-Anmeldung nicht bestätigt. Melde Dich im reservierten Vinted-Tab an und versuche es erneut.',
      );
    }
    return { id, username: username.trim() };
  }

  function detectPageState({
    pathname = '',
    text: pageText = '',
    hasPassword = false,
    hasChallenge = false,
  }) {
    if (/deine sitzung wurde blockiert|your session (?:has been|was) blocked/i.test(pageText))
      return 'session_blocked';
    if (hasChallenge || /bist du ein mensch|verify you are human|mensch.prüfung/i.test(pageText))
      return 'interaction_required';
    if (pathname.includes('/2fa') || /bestätigungscode|verification code|sms.code/i.test(pageText))
      return 'verification_required';
    if (hasPassword || pathname.startsWith('/member/login')) return 'login_required';
    return 'ready';
  }

  function assertPageReady(state) {
    const errors = {
      session_blocked:
        'Vinted hat die Sitzung blockiert. Der Abgleich wurde gestoppt. Prüfe die Sitzung direkt bei Vinted.',
      interaction_required:
        'Vinted verlangt eine manuelle Prüfung. Löse sie im reservierten Vinted-Tab und versuche es erneut.',
      verification_required:
        'Vinted verlangt einen Bestätigungscode. Gib ihn direkt im reservierten Vinted-Tab ein.',
      login_required: 'Melde Dich zuerst im reservierten Vinted-Tab an und versuche es erneut.',
    };
    if (state !== 'ready') throw new Error(errors[state] ?? 'Der Vinted-Browser ist nicht bereit.');
  }

  function parseSnapshot(identity, profile, items, observedAt, publicationsComplete) {
    if (parseIdentity(profile).id !== identity.id)
      throw new Error('Das Vinted-Konto wurde gewechselt. Verbinde es erneut.');
    const user = profile.user;
    const bio = user.about ?? user.bio;
    const entries = [
      {
        kind: 'profile',
        externalId: identity.id,
        sortAt: observedAt,
        body: {
          username: identity.username,
          displayName: text(user.name) ?? identity.username,
          location: text(user.city),
          bio: typeof bio === 'string' ? bio : null,
          bioState: typeof bio === 'string' ? 'loaded' : 'not_loaded',
          imageUrl: image(user.photo?.url),
          feedbackCount: count(user.feedback_count),
          feedbackReputation: decimal(user.feedback_reputation),
          positiveFeedbackCount: count(user.positive_feedback_count),
          neutralFeedbackCount: count(user.neutral_feedback_count),
          negativeFeedbackCount: count(user.negative_feedback_count),
          itemCount: count(user.item_count),
          observedAt,
        },
      },
    ];
    const ids = new Set();
    for (const item of items) {
      const id = record(item) ? identifier(item.id) : null;
      if (!id || identifier(item.user_id) !== identity.id || ids.has(id)) {
        throw new Error(
          'Vinted lieferte unvollständige oder fremde Anzeigen. Es wurden keine Daten importiert.',
        );
      }
      ids.add(id);
      if (item.is_closed === true) continue;
      const photos = Array.isArray(item.photos) ? item.photos.slice(0, 20) : [];
      entries.push({
        kind: 'publication',
        externalId: id,
        sortAt: observedAt,
        body: {
          title: text(item.title) ?? 'Inserat',
          text: typeof item.description === 'string' ? item.description : null,
          textState: typeof item.description === 'string' ? 'loaded' : 'not_loaded',
          price: decimal(item.price?.amount),
          currency:
            typeof item.price?.currency_code === 'string' &&
            /^[A-Z]{3}$/.test(item.price.currency_code)
              ? item.price.currency_code
              : 'EUR',
          status: text(item.status),
          imageUrl: image(photos[0]?.url),
          imageUrls: photos.map((photo) => image(photo?.url)).filter(Boolean),
          promoted: typeof item.promoted === 'boolean' ? item.promoted : null,
          isClosed: typeof item.is_closed === 'boolean' ? item.is_closed : null,
          isReserved: typeof item.is_reserved === 'boolean' ? item.is_reserved : null,
          brand: text(item.brand),
          size: text(item.size),
          metrics: {
            views: count(item.view_count),
            favorites: count(item.favourite_count),
            observedAt,
          },
        },
      });
    }
    return { identity, observedAt, entries, publicationsComplete };
  }

  async function readSnapshot(readJson, expectedId, now = () => new Date().toISOString()) {
    const profile = await readJson('/api/v2/users/current');
    const identity = parseIdentity(profile);
    if (identity.id !== expectedId)
      throw new Error('Das Vinted-Konto wurde gewechselt. Verbinde es erneut.');
    const items = [];
    let complete = false;
    let totalPages;
    for (let page = 1; page <= 25; page++) {
      if (parseIdentity(await readJson('/api/v2/users/current')).id !== expectedId)
        throw new Error('Das Vinted-Konto wurde gewechselt.');
      const response = await readJson(
        `/api/v2/wardrobe/${expectedId}/items?page=${page}&per_page=20`,
      );
      const currentTotal = count(response?.pagination?.total_pages);
      if (
        !record(response) ||
        !Array.isArray(response.items) ||
        response.items.length > 20 ||
        currentTotal === null ||
        (currentTotal < page &&
          !(page === 1 && currentTotal === 0 && response.items.length === 0)) ||
        (totalPages !== undefined && totalPages !== currentTotal)
      )
        throw new Error(
          'Vinted lieferte keine gültige vollständige Seitenfolge. Versuche den Abgleich später erneut.',
        );
      totalPages = currentTotal;
      items.push(...response.items);
      if (page >= totalPages) {
        complete = true;
        break;
      }
    }
    if (parseIdentity(await readJson('/api/v2/users/current')).id !== expectedId)
      throw new Error('Das Vinted-Konto wurde gewechselt.');
    return parseSnapshot(identity, profile, items, now(), complete);
  }

  const publicBinding = (binding) => ({
    workspaceId: binding.workspaceId,
    connectionId: binding.connectionId,
    externalAccountId: binding.externalAccountId,
    expiresAt: binding.expiresAt,
  });

  function createRuntime(adapter) {
    let running = false;
    async function run(request, origin) {
      if (running) throw new Error('Ein lokaler Vorgang läuft bereits. Warte bis er beendet ist.');
      running = true;
      adapter.begin?.();
      let acquired = false;
      try {
        let installation = await adapter.load();
        if (installation?.leaseUntil > adapter.now())
          throw new Error(
            'Ein lokaler Vorgang wird noch ausgeführt. Warte kurz und versuche es erneut.',
          );
        installation = { ...installation, leaseUntil: adapter.now() + 55_000 };
        await adapter.save(installation);
        acquired = true;
        const { action, payload } = request;
        if (action === 'DISCONNECT') {
          const scope = installation.binding ?? installation.pendingScope;
          if (
            !scope ||
            scope.workspaceId !== payload.workspaceId ||
            scope.connectionId !== payload.connectionId ||
            scope.appOrigin !== origin
          ) {
            throw new Error('Diese Verbindung gehört nicht zu diesem Browserprofil.');
          }
          await adapter.remove();
          return { disconnected: true };
        }
        if (action === 'PREPARE') {
          if (installation.binding) {
            try {
              await heartbeat(installation.binding, installation.secret);
            } catch (error) {
              if (!(error instanceof LocalBindingInvalidError)) throw error;
              // Nur eine definitive Serverablehnung entfernt die alte Installation.
              installation = { tabId: installation.tabId, leaseUntil: installation.leaseUntil };
              await adapter.save(installation);
            }
          }
          const identity = await adapter.readIdentity(installation.tabId);
          if (
            installation.binding &&
            installation.binding.externalAccountId !== identity.identity.id
          )
            throw new Error(
              'Im Browser ist ein anderes Vinted-Konto aktiv. Trenne zuerst die bisherige Verbindung.',
            );
          if (
            !installation.secret ||
            (!installation.binding && installation.pendingUntil <= adapter.now())
          ) {
            const secret = adapter.randomSecret();
            installation.secret = secret;
            installation.tokenHash = await adapter.hash(secret);
            delete installation.pendingScope;
          }
          installation.identity = identity.identity;
          installation.tabId = identity.tabId;
          installation.pendingUntil = adapter.now() + 5 * 60_000;
          await adapter.save(installation);
          return { tokenHash: installation.tokenHash, identity: installation.identity };
        }
        if (!installation.secret || !installation.identity)
          throw new Error('Bereite die lokale Verbindung zuerst erneut vor.');
        if (action === 'BIND') {
          if (
            installation.tokenHash !== payload.tokenHash ||
            installation.identity.id !== payload.externalAccountId ||
            (!installation.binding && installation.pendingUntil <= adapter.now()) ||
            Date.parse(payload.expiresAt) <= adapter.now()
          )
            throw new Error(
              'Die vorbereitete Verbindung ist abgelaufen oder passt nicht zum Vinted-Konto.',
            );
          const existingScope = installation.binding ?? installation.pendingScope;
          if (
            existingScope &&
            (existingScope.workspaceId !== payload.workspaceId ||
              existingScope.connectionId !== payload.connectionId ||
              existingScope.appOrigin !== origin)
          )
            throw new Error(
              'Dieses Browserprofil ist bereits mit einem anderen Konto verbunden. Trenne es zuerst.',
            );
          installation.pendingScope = {
            workspaceId: payload.workspaceId,
            connectionId: payload.connectionId,
            appOrigin: origin,
          };
          await adapter.save(installation);
          const current = await adapter.readIdentity(installation.tabId);
          if (current.identity.id !== payload.externalAccountId)
            throw new Error('Das Vinted-Konto wurde gewechselt.');
          const binding = { ...payload, appOrigin: origin };
          await heartbeat(binding, installation.secret);
          installation.binding = binding;
          delete installation.pendingScope;
          installation.tabId = current.tabId;
          await adapter.save(installation);
          return publicBinding(binding);
        }
        const binding = installation.binding;
        if (
          !binding ||
          binding.workspaceId !== payload.workspaceId ||
          binding.connectionId !== payload.connectionId ||
          binding.appOrigin !== origin
        )
          throw new Error(
            'Diese Verbindung gehört nicht zu diesem Browserprofil oder Arbeitsplatz.',
          );
        if (Date.parse(binding.expiresAt) <= adapter.now())
          throw new Error('Die lokale Verbindung ist abgelaufen. Verbinde das Konto erneut.');
        await heartbeat(binding, installation.secret);
        const read = await adapter.readSnapshot(installation.tabId, binding.externalAccountId);
        if (read.snapshot.identity.id !== binding.externalAccountId)
          throw new Error('Das Vinted-Konto wurde gewechselt.');
        // Vor dem Import erneut auf Widerruf prüfen; kein Teilstand bei Lesefehlern.
        await heartbeat(binding, installation.secret);
        const imported = await adapter.edge(binding, installation.secret, {
          action: 'import',
          workspaceId: binding.workspaceId,
          connectionId: binding.connectionId,
          snapshot: read.snapshot,
        });
        if (
          imported?.ok !== true ||
          !record(imported.counts) ||
          count(imported.counts.profile) === null ||
          count(imported.counts.publication) === null ||
          typeof imported.observedAt !== 'string' ||
          !Number.isFinite(Date.parse(imported.observedAt))
        )
          throw new Error(
            'Der Import wurde nicht bestätigt. Prüfe den gespeicherten Stand in Flipbase.',
          );
        installation.tabId = read.tabId;
        await adapter.save(installation);
        return {
          ...publicBinding(binding),
          counts: imported.counts,
          observedAt: imported.observedAt,
          publicationsComplete: read.snapshot.publicationsComplete,
        };
      } finally {
        try {
          if (acquired) {
            const saved = await adapter.load();
            if (saved) {
              delete saved.leaseUntil;
              await adapter.save(saved);
            }
          }
        } finally {
          running = false;
        }
      }
    }
    async function heartbeat(binding, secret) {
      if (!isApiUrl(binding.apiUrl, binding.appOrigin))
        throw new Error('Die gespeicherte Serveradresse ist nicht erlaubt.');
      const result = await adapter.edge(binding, secret, {
        action: 'heartbeat',
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
      });
      if (
        result?.ok !== true ||
        result.externalAccountId !== binding.externalAccountId ||
        Date.parse(result.expiresAt) !== Date.parse(binding.expiresAt) ||
        Date.parse(result.expiresAt) <= adapter.now()
      )
        throw new Error(
          'Die lokale Verbindung ist abgelaufen oder wurde widerrufen. Verbinde das Konto erneut.',
        );
    }
    return { run };
  }

  const api = {
    LocalBindingInvalidError,
    storageKey,
    isAppOrigin,
    isApiUrl,
    parseRequest,
    parseIdentity,
    detectPageState,
    assertPageReady,
    parseSnapshot,
    readSnapshot,
    createRuntime,
  };
  root.FlipbaseVintedLocal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
