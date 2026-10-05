// Reine Verträge und Parser; Chrome-Zugriff bleibt im Hintergrundadapter.
(function exposeVintedLocalCore(root) {
  const requestTypes = new Set([
    'PREPARE',
    'BIND',
    'SYNC',
    'INBOX_SYNC',
    'INBOX_DETAIL',
    'MESSAGES_SEND',
    'DISCONNECT',
  ]);
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
  function identityChangedError() {
    const error = new Error('Das Vinted-Konto wurde gewechselt.');
    error.code = 'identity_changed';
    return error;
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
        : action === 'INBOX_DETAIL'
          ? ['workspaceId', 'connectionId', 'conversationId']
          : ['workspaceId', 'connectionId'];
    if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) return null;
    if (action === 'INBOX_DETAIL' && !uuid(payload.conversationId)) return null;
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
    if (state !== 'ready') {
      const error = new Error(errors[state] ?? 'Der Vinted-Browser ist nicht bereit.');
      error.code = state;
      throw error;
    }
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
        throw identityChangedError();
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
      throw identityChangedError();
    return parseSnapshot(identity, profile, items, now(), complete);
  }

  const publicBinding = (binding) => ({
    workspaceId: binding.workspaceId,
    connectionId: binding.connectionId,
    externalAccountId: binding.externalAccountId,
    expiresAt: binding.expiresAt,
  });

  function inboxDate(input) {
    if (typeof input === 'string' && /^[0-9]{10,13}$/.test(input)) input = Number(input);
    if (typeof input === 'number' && Number.isFinite(input) && input > 0)
      input = input < 10_000_000_000 ? input * 1000 : input;
    const parsed = new Date(input);
    if (
      (typeof input !== 'string' && typeof input !== 'number') ||
      !Number.isFinite(parsed.getTime())
    )
      throw new Error('Vinted lieferte eine ungültige Nachrichtenzeit.');
    return parsed.toISOString();
  }

  async function inboxMessageEntry(message, conversationId, accountId) {
    if (!record(message) || !record(message.entity))
      throw new Error('Vinted lieferte eine unvollständige Nachricht.');
    const entity = message.entity;
    let externalId = identifier(message.id) ?? identifier(entity.id);
    if (!externalId) {
      const source = JSON.stringify({
        conversationId,
        type: message.entity_type,
        createdAt: message.created_at_ts,
        eventGroup: message.event_group,
        eventType: message.event_type,
        entity,
      });
      const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      externalId = `event:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    const senderId = identifier(entity.user_id) ?? identifier(entity.sender_id);
    const occurredAt = inboxDate(message.created_at_ts);
    return {
      kind: 'message',
      externalId,
      parentExternalId: conversationId,
      sortAt: occurredAt,
      body: {
        title: text(entity.title) ?? text(message.entity_type) ?? 'Nachricht',
        text:
          text(entity.body) ??
          text(entity.text) ??
          text(entity.message) ??
          text(record(entity.message) ? entity.message.body : null) ??
          text(entity.title) ??
          text(entity.status_title),
        occurredAt,
        direction: senderId ? (senderId === accountId ? 'outbound' : 'inbound') : 'unknown',
        messageType: text(message.entity_type),
        priceLabel: text(entity.price_label),
        imageUrls: [
          ...new Set(
            [
              ...(Array.isArray(entity.photos)
                ? entity.photos.map((photo) =>
                    typeof photo === 'string'
                      ? photo
                      : (photo?.url ??
                        photo?.full_size_url ??
                        photo?.image_url ??
                        photo?.thumbnail),
                  )
                : []),
              ...(Array.isArray(entity.photo_urls) ? entity.photo_urls : []),
            ]
              .map(image)
              .filter(Boolean),
          ),
        ].slice(0, 10),
        eventType: text(message.event_type),
        eventGroup: text(message.event_group),
        offerStatus:
          typeof entity.status === 'number' && Number.isSafeInteger(entity.status)
            ? String(entity.status)
            : text(entity.status),
      },
    };
  }

  async function readInbox(readJson, expectedId, state, now = () => new Date().toISOString()) {
    if (
      !record(state) ||
      !Number.isInteger(state.nextPage) ||
      state.nextPage < 1 ||
      state.nextPage > 20 ||
      !Array.isArray(state.versions) ||
      state.versions.length > 400
    )
      throw new Error('Der gespeicherte Postfachstand ist ungültig.');
    const identity = parseIdentity(await readJson('/api/v2/users/current'));
    if (identity.id !== expectedId) throw identityChangedError();
    const observedAt = now();
    const page = state.mode === 'latest' ? 1 : state.nextPage;
    const response = await readJson(`/api/v2/inbox?page=${page}&per_page=20`);
    if (
      !record(response) ||
      !Array.isArray(response.conversations) ||
      response.conversations.length > 20 ||
      !record(response.pagination) ||
      !Number.isInteger(response.pagination.total_pages) ||
      response.pagination.total_pages < 0
    )
      throw new Error('Vinted lieferte eine unvollständige Gesprächsliste.');
    const totalPages = response.pagination.total_pages;
    if (totalPages === 0 && response.conversations.length > 0)
      throw new Error('Vinted lieferte eine widersprüchliche Gesprächsliste.');
    const entries = [];
    const conversationIds = new Set();
    const messageIds = new Set();
    const versions = new Map(state.versions.map((version) => [version.externalId, version]));
    let detailReads = 0;
    let messageCount = 0;
    for (const conversation of response.conversations) {
      const externalId = record(conversation) ? identifier(conversation.id) : null;
      if (!externalId || conversationIds.has(externalId))
        throw new Error('Vinted lieferte mehrdeutige Gespräche.');
      conversationIds.add(externalId);
      const sourceUpdatedAt = inboxDate(conversation.updated_at);
      const previous = versions.get(externalId);
      const reusable =
        previous?.sourceUpdatedAt === sourceUpdatedAt &&
        Number.isFinite(Date.parse(previous.detailCheckedAt));
      const other = record(conversation.opposite_user) ? conversation.opposite_user : {};
      const entry = {
        kind: 'conversation',
        externalId,
        sortAt: sourceUpdatedAt,
        body: {
          title: text(other.login) ?? 'Gespräch',
          text: reusable ? previous.text : text(conversation.description),
          occurredAt: reusable ? previous.occurredAt : sourceUpdatedAt,
          sourceUpdatedAt,
          detailCheckedAt: reusable ? previous.detailCheckedAt : null,
          unread: typeof conversation.unread === 'boolean' ? conversation.unread : null,
          imageUrl: image(record(other.photo) ? other.photo.url : null),
          ...inboxMetadata(conversation),
        },
      };
      entries.push(entry);
      const checkedAt = reusable ? Date.parse(previous.detailCheckedAt) : NaN;
      if (
        conversation.unread !== false ||
        detailReads >= 3 ||
        messageCount >= 200 ||
        (Number.isFinite(checkedAt) &&
          checkedAt <= Date.parse(observedAt) &&
          Date.parse(observedAt) - checkedAt < 86_400_000)
      )
        continue;
      if (parseIdentity(await readJson('/api/v2/users/current')).id !== expectedId)
        throw identityChangedError();
      const detail = await readJson(`/api/v2/conversations/${externalId}`);
      detailReads++;
      if (
        !record(detail) ||
        !record(detail.conversation) ||
        identifier(detail.conversation.id) !== externalId ||
        !Array.isArray(detail.conversation.messages)
      )
        throw new Error('Vinted lieferte einen anderen oder unvollständigen Gesprächsverlauf.');
      const remaining = 200 - messageCount;
      const messages = detail.conversation.messages;
      for (const [field, value] of Object.entries(inboxMetadata(detail.conversation))) {
        if (value !== null) entry.body[field] = value;
      }
      // Eine begrenzte Teilkopie bestätigt niemals die vollständige Detailrevision.
      if (messages.length <= remaining) entry.body.detailCheckedAt = observedAt;
      let latestMessageAt = null;
      for (const message of [...messages]
        .sort((left, right) =>
          inboxDate(right.created_at_ts).localeCompare(inboxDate(left.created_at_ts)),
        )
        .slice(0, remaining)) {
        const messageEntry = await inboxMessageEntry(message, externalId, expectedId);
        if (messageIds.has(messageEntry.externalId))
          throw new Error('Vinted lieferte mehrdeutige Nachrichten.');
        messageIds.add(messageEntry.externalId);
        entries.push(messageEntry);
        messageCount++;
        if (
          messageEntry.body.text &&
          (latestMessageAt === null || messageEntry.sortAt > latestMessageAt)
        ) {
          latestMessageAt = messageEntry.sortAt;
          entry.body.text = messageEntry.body.text;
          entry.body.occurredAt = messageEntry.sortAt;
          entry.sortAt = messageEntry.sortAt;
        }
      }
    }
    if (parseIdentity(await readJson('/api/v2/users/current')).id !== expectedId)
      throw identityChangedError();
    const batch = {
      identity: { id: identity.id },
      observedAt,
      page,
      nextPage:
        state.mode === 'latest' && state.nextPage > 1
          ? state.nextPage
          : page < Math.min(totalPages, 20)
            ? page + 1
            : 1,
      conversationsComplete: (totalPages === 0 || page === totalPages) && totalPages <= 20,
      entries,
    };
    // Reserve für RPC-Hülle und die größere JSONB-Darstellung auf dem Server.
    const encoder = new TextEncoder();
    let bytes = encoder.encode(JSON.stringify(batch)).length;
    for (let index = entries.length - 1; bytes > 400 * 1024 && index >= 0; index--) {
      const entry = entries[index];
      if (entry.kind !== 'message') continue;
      bytes -= encoder.encode(JSON.stringify(entry)).length + 1;
      entries.splice(index, 1);
      const conversation = entries.find(
        (parent) => parent.kind === 'conversation' && parent.externalId === entry.parentExternalId,
      );
      if (conversation) conversation.body.detailCheckedAt = null;
    }
    if (bytes > 400 * 1024)
      throw new Error(
        'Die Gesprächsliste überschreitet die maximale Größe dieses Lesepiloten. Es wurde nichts importiert.',
      );
    return batch;
  }

  function inboxMetadata(conversation) {
    const item = record(conversation.item) ? conversation.item : {};
    const transaction = record(conversation.transaction) ? conversation.transaction : {};
    const other = record(conversation.opposite_user) ? conversation.opposite_user : {};
    const price = transaction.offer_price ?? item.price;
    const photos = item.photos ?? conversation.item_photos;
    const photo = Array.isArray(photos) ? photos[0] : null;
    let lastActiveAt = null;
    try {
      if (other.last_logged_in_at ?? other.last_loged_on_ts)
        lastActiveAt = inboxDate(other.last_logged_in_at ?? other.last_loged_on_ts);
    } catch {
      /* Unbekannte Aktivitätsangaben bleiben leer. */
    }
    return {
      itemId: identifier(conversation.item_id ?? item.id ?? transaction.item_id),
      itemTitle: text(conversation.item_title ?? item.title ?? transaction.item_title),
      itemImageUrl: image(
        photo?.url ??
          conversation.item_photo?.url ??
          item.photo?.url ??
          transaction.item_photo?.url,
      ),
      itemPrice: decimal(record(price) ? price.amount : price),
      itemCurrency: text(record(price) ? price.currency_code : null),
      partnerId: identifier(other.id),
      lastActiveAt,
      transactionStatus: text(transaction.status_title),
    };
  }

  async function readInboxDetail(readJson, expectedId, state, now) {
    const externalId = identifier(state.externalConversationId);
    if (!externalId) throw new Error('Das Gespräch wurde nicht bestätigt.');
    let detail;
    const batch = await readInbox(
      async (path) => {
        if (path.startsWith('/api/v2/inbox?')) {
          detail = await readJson(`/api/v2/conversations/${externalId}`);
          if (identifier(detail?.conversation?.id) !== externalId)
            throw new Error('Das Gespräch wurde gewechselt.');
          return {
            conversations: [{ ...detail.conversation, unread: false }],
            pagination: { total_pages: 1 },
          };
        }
        if (path === `/api/v2/conversations/${externalId}`) return detail;
        return readJson(path);
      },
      expectedId,
      { ...state, nextPage: 1, mode: 'latest', versions: [] },
      now,
    );
    batch.nextPage = state.nextPage;
    batch.conversationsComplete = false;
    const conversation = batch.entries.find((entry) => entry.kind === 'conversation');
    conversation.body.unread =
      typeof detail.conversation.unread === 'boolean' ? detail.conversation.unread : null;
    return batch;
  }

  function createRuntime(adapter) {
    let running = false;
    async function run(request, origin) {
      if (running) throw new Error('Ein lokaler Vorgang läuft bereits. Warte bis er beendet ist.');
      running = true;
      adapter.begin?.(request);
      let acquired = false;
      try {
        let installation = await adapter.load();
        if (
          installation?.schedule?.retryAfter > adapter.now() &&
          request.action !== 'DISCONNECT' &&
          !(request.action === 'MESSAGES_SEND' && installation.pendingFinish)
        ) {
          const error = new Error(
            'Vinted begrenzt die Abrufe. Warte bis die Pause abgelaufen ist.',
          );
          error.code = 'rate_limited';
          error.retryAfter = installation.schedule.retryAfter;
          throw error;
        }
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
          if (current.identity.id !== payload.externalAccountId) throw identityChangedError();
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
        if (action === 'MESSAGES_SEND' && installation.pendingFinish) {
          const finished = await adapter.edge(binding, installation.secret, {
            action: 'message_finish',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            ...installation.pendingFinish,
          });
          if (finished?.ok !== true) throw new Error('Das Auftragsergebnis wurde nicht bestätigt.');
          delete installation.pendingFinish;
          await adapter.save(installation);
          return { reported: true };
        }
        if (Date.parse(binding.expiresAt) <= adapter.now())
          throw new Error('Die lokale Verbindung ist abgelaufen. Verbinde das Konto erneut.');
        const currentGrant = await heartbeat(binding, installation.secret);
        if (action === 'MESSAGES_SEND') {
          if (currentGrant.messagesSend !== true) return { skipped: true };
          const claimed = await adapter.edge(binding, installation.secret, {
            action: 'message_claim',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
          });
          if (claimed?.ok !== true)
            throw new Error('Der Nachrichtenauftrag wurde nicht bestätigt.');
          if (!claimed.command) return { pending: false };
          const command = claimed.command;
          if (
            !uuid(command.id) ||
            !uuid(command.claimToken) ||
            !identifier(command.externalConversationId)
          )
            throw new Error('Der Nachrichtenauftrag ist ungültig.');
          installation.pendingFinish = {
            id: command.id,
            claimToken: command.claimToken,
            outcome: 'outcome_unknown',
            errorCode: 'interrupted',
          };
          await adapter.save(installation);
          const started = await adapter.edge(binding, installation.secret, {
            action: 'message_start',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            id: command.id,
            claimToken: command.claimToken,
          });
          if (started?.ok !== true)
            throw new Error('Der Nachrichtenversand wurde nicht freigegeben.');
          let outcome;
          try {
            outcome = (
              await adapter.sendMessage(installation.tabId, binding.externalAccountId, command)
            ).outcome;
          } catch (error) {
            outcome = {
              outcome: 'outcome_unknown',
              errorCode: error.code ?? 'interrupted',
              ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
            };
          }
          if (!['sent', 'failed', 'outcome_unknown'].includes(outcome?.outcome))
            throw new Error('Der Versandstatus ist ungültig.');
          const { retryAfter, ...reportedOutcome } = outcome;
          installation.pendingFinish = {
            id: command.id,
            claimToken: command.claimToken,
            ...reportedOutcome,
          };
          if (outcome.errorCode === 'rate_limited')
            installation.schedule = {
              ...installation.schedule,
              retryAfter: retryAfter ?? adapter.now() + 300_000,
            };
          else if (
            [
              'identity_changed',
              'login_required',
              'interaction_required',
              'verification_required',
              'session_blocked',
            ].includes(outcome.errorCode)
          )
            installation.schedule = { ...installation.schedule, pauseReason: outcome.errorCode };
          await adapter.save(installation);
          const finished = await adapter.edge(binding, installation.secret, {
            action: 'message_finish',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            ...installation.pendingFinish,
          });
          if (finished?.ok !== true) throw new Error('Das Auftragsergebnis wurde nicht bestätigt.');
          delete installation.pendingFinish;
          await adapter.save(installation);
          if (outcome.errorCode === 'rate_limited') {
            const error = new Error('Vinted begrenzt die Abrufe.');
            error.code = 'rate_limited';
            error.retryAfter = retryAfter;
            throw error;
          }
          if (
            [
              'identity_changed',
              'login_required',
              'interaction_required',
              'verification_required',
              'session_blocked',
            ].includes(outcome.errorCode)
          ) {
            const error = new Error('Die Vinted-Sitzung muss geprüft werden.');
            error.code = outcome.errorCode;
            throw error;
          }
          return { outcome: outcome.outcome };
        }
        if (action === 'INBOX_SYNC' || action === 'INBOX_DETAIL') {
          if (request.automatic && currentGrant.messagesRead !== true) return { skipped: true };
          if (currentGrant.messagesRead !== true)
            throw new Error('Erteile zuerst die Nachrichtenfreigabe für dieses Konto in Flipbase.');
          const inboxState = await adapter.edge(binding, installation.secret, {
            action: action === 'INBOX_DETAIL' ? 'inbox_detail_state' : 'inbox_state',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            ...(action === 'INBOX_DETAIL'
              ? { conversationId: payload.conversationId }
              : { mode: request.mode ?? 'latest' }),
          });
          if (
            inboxState?.ok !== true ||
            inboxState.messagesRead !== true ||
            inboxState.externalAccountId !== binding.externalAccountId ||
            Date.parse(inboxState.expiresAt) !== Date.parse(binding.expiresAt)
          )
            throw new Error(
              'Die Nachrichtenfreigabe wurde nicht bestätigt. Prüfe das Konto in Flipbase.',
            );
          const inbox = await adapter.readInbox(installation.tabId, binding.externalAccountId, {
            ...inboxState,
            mode: request.mode ?? 'latest',
            detail: action === 'INBOX_DETAIL',
          });
          if (inbox.batch.identity.id !== binding.externalAccountId) throw identityChangedError();
          if ((await heartbeat(binding, installation.secret)).messagesRead !== true)
            throw new Error('Die Nachrichtenfreigabe ist nicht mehr gültig.');
          const importedInbox = await adapter.edge(binding, installation.secret, {
            action: action === 'INBOX_DETAIL' ? 'inbox_detail_import' : 'inbox_import',
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            batch: inbox.batch,
            ...(action === 'INBOX_DETAIL'
              ? { conversationId: payload.conversationId }
              : { mode: request.mode ?? 'latest' }),
          });
          if (
            importedInbox?.ok !== true ||
            !record(importedInbox.counts) ||
            count(importedInbox.counts.conversation) === null ||
            count(importedInbox.counts.message) === null ||
            importedInbox.counts.conversation > 20 ||
            importedInbox.counts.message > 200 ||
            !Number.isFinite(Date.parse(importedInbox.observedAt)) ||
            importedInbox.nextPage !== inbox.batch.nextPage ||
            importedInbox.conversationsComplete !== inbox.batch.conversationsComplete
          )
            throw new Error(
              'Der Postfachimport wurde nicht bestätigt. Prüfe den gespeicherten Stand in Flipbase.',
            );
          installation.tabId = inbox.tabId;
          await adapter.save(installation);
          return {
            ...publicBinding(binding),
            counts: importedInbox.counts,
            observedAt: importedInbox.observedAt,
            nextPage: importedInbox.nextPage,
            conversationsComplete: importedInbox.conversationsComplete,
          };
        }
        const read = await adapter.readSnapshot(installation.tabId, binding.externalAccountId);
        if (read.snapshot.identity.id !== binding.externalAccountId) throw identityChangedError();
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
      } catch (error) {
        if (acquired && error.code) {
          const saved = await adapter.load();
          if (saved) {
            const schedule = { ...saved.schedule, lastError: error.code };
            if (error.code === 'rate_limited')
              schedule.retryAfter = error.retryAfter ?? adapter.now() + 300_000;
            else if (
              [
                'identity_changed',
                'login_required',
                'interaction_required',
                'verification_required',
                'session_blocked',
                'local_binding_invalid',
              ].includes(error.code)
            )
              schedule.pauseReason = error.code;
            await adapter.save({ ...saved, schedule });
          }
        }
        throw error;
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
      return result;
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
    readInbox,
    readInboxDetail,
    createRuntime,
  };
  root.FlipbaseVintedLocal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
