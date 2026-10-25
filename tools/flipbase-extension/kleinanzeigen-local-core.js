// Kleinanzeigen-Bindungen besitzen einen eigenen Speicherplatz und keine Vinted-Befugnisse.
(function defineKleinanzeigenLocal(root) {
  const storageKey = 'kleinanzeigen_local_installation';
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
  const identifier = (value) => typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  function appOrigin(origin) {
    try {
      const u = new URL(origin);
      return (
        u.origin === origin &&
        ((u.protocol === 'https:' && ['app.flipbase.de', 'flipbase.de'].includes(u.hostname)) ||
          (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
      );
    } catch {
      return false;
    }
  }
  function apiUrl(address, origin) {
    try {
      const u = new URL(address);
      const app = new URL(origin);
      return (
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        u.pathname === '/functions/v1/kleinanzeigen-local-extension' &&
        (u.origin === 'https://api.flipbase.de' ||
          (app.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(app.hostname) &&
            [
              'http://127.0.0.1:54351',
              'http://localhost:54351',
              'http://127.0.0.1:28351',
              'http://localhost:28351',
            ].includes(u.origin)))
      );
    } catch {
      return false;
    }
  }
  function parseRequest(message, origin) {
    if (
      !appOrigin(origin) ||
      !record(message) ||
      typeof message.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/u.test(message.requestId) ||
      typeof message.type !== 'string' ||
      !message.type.startsWith('FLIPBASE_KLEINANZEIGEN_')
    )
      return null;
    const action = message.type.replace(/^FLIPBASE_KLEINANZEIGEN_/u, '');
    const fields = {
      PREPARE_ACCOUNT: ['type', 'requestId', 'workspaceId', 'apiUrl', 'canPublish'],
      CONNECT: ['type', 'requestId', 'nonce', 'binding'],
      STATUS: ['type', 'requestId'],
      SYNC: ['type', 'requestId', 'workspaceId', 'connectionId', 'runId', 'generation'],
      FORM_SCHEMA: [
        'type',
        'requestId',
        'workspaceId',
        'connectionId',
        'generation',
        'categoryPath',
      ],
      QUOTA: ['type', 'requestId', 'workspaceId', 'connectionId', 'generation'],
      RELIST_LISTING: [
        'type',
        'requestId',
        'workspaceId',
        'connectionId',
        'generation',
        'externalId',
        'categoryPaths',
      ],
      RELIST_ATTEMPTS: ['type', 'requestId', 'workspaceId', 'connectionId', 'generation'],
      OPEN_LISTING: [
        'type',
        'requestId',
        'workspaceId',
        'connectionId',
        'generation',
        'handoffId',
        'payload',
      ],
      PUBLISH_JOB: [
        'type',
        'requestId',
        'workspaceId',
        'connectionId',
        'generation',
        'jobId',
        'mode',
      ],
      DISCONNECT: ['type', 'requestId', 'workspaceId', 'connectionId'],
    }[action];
    if (
      !fields ||
      fields.length !== Object.keys(message).length ||
      Object.keys(message).some((key) => !fields.includes(key))
    )
      return null;
    if (
      action === 'PREPARE_ACCOUNT' &&
      (!uuid.test(message.workspaceId ?? '') ||
        !apiUrl(message.apiUrl, origin) ||
        typeof message.canPublish !== 'boolean')
    )
      return null;
    if (action === 'CONNECT' && (!uuid.test(message.nonce ?? '') || !record(message.binding)))
      return null;
    if (
      action === 'DISCONNECT' &&
      (!uuid.test(message.workspaceId ?? '') || !identifier(message.connectionId))
    )
      return null;
    if (
      action === 'SYNC' &&
      (!uuid.test(message.workspaceId ?? '') ||
        ![message.connectionId, message.runId].every(
          (value) =>
            typeof value === 'string' &&
            /^[1-9][0-9]{0,18}$/u.test(value) &&
            BigInt(value) <= 9223372036854775807n,
        ) ||
        !Number.isSafeInteger(message.generation) ||
        message.generation < 1)
    )
      return null;
    if (
      action === 'FORM_SCHEMA' &&
      (!uuid.test(message.workspaceId ?? '') ||
        typeof message.connectionId !== 'string' ||
        !/^[1-9][0-9]{0,18}$/u.test(message.connectionId) ||
        BigInt(message.connectionId) > 9223372036854775807n ||
        !Number.isSafeInteger(message.generation) ||
        message.generation < 1 ||
        typeof message.categoryPath !== 'string' ||
        message.categoryPath.length > 160 ||
        (message.categoryPath !== '' &&
          !/^[1-9][0-9]*(?:\/[a-z0-9_]+){0,5}$/u.test(message.categoryPath)))
    )
      return null;
    if (
      ['QUOTA', 'PUBLISH_JOB', 'OPEN_LISTING', 'RELIST_LISTING', 'RELIST_ATTEMPTS'].includes(
        action,
      ) &&
      (!uuid.test(message.workspaceId ?? '') ||
        typeof message.connectionId !== 'string' ||
        !/^[1-9][0-9]{0,18}$/u.test(message.connectionId) ||
        BigInt(message.connectionId) > 9223372036854775807n ||
        !Number.isSafeInteger(message.generation) ||
        message.generation < 1 ||
        (action === 'PUBLISH_JOB' &&
          (typeof message.jobId !== 'string' ||
            !/^[1-9][0-9]{0,18}$/u.test(message.jobId) ||
            BigInt(message.jobId) > 9223372036854775807n ||
            !['publish', 'reconcile'].includes(message.mode))))
    )
      return null;
    if (
      action === 'RELIST_LISTING' &&
      (!identifier(message.externalId) ||
        !record(message.categoryPaths) ||
        Object.keys(message.categoryPaths).length > 5000 ||
        Object.entries(message.categoryPaths).some(
          ([label, path]) =>
            !label ||
            label.length > 600 ||
            typeof path !== 'string' ||
            path.length > 160 ||
            !/^[1-9][0-9]*(?:\/[a-z0-9_ -]+){0,5}$/u.test(path),
        ))
    )
      return null;
    if (
      action === 'OPEN_LISTING' &&
      (!uuid.test(message.handoffId ?? '') ||
        !record(message.payload) ||
        typeof message.payload.itemId !== 'string' ||
        typeof message.payload.title !== 'string' ||
        !message.payload.title.trim() ||
        message.payload.title.length > 65 ||
        typeof message.payload.description !== 'string' ||
        !message.payload.description.trim() ||
        message.payload.description.length > 4000 ||
        !Number.isSafeInteger(message.payload.price) ||
        message.payload.price < 0 ||
        message.payload.price > 99999999 ||
        !['FIXED', 'NEGOTIABLE'].includes(message.payload.priceType) ||
        !['pickup', 'both'].includes(message.payload.shippingType) ||
        (message.payload.postalCode !== undefined &&
          !/^\d{5}$/u.test(message.payload.postalCode)) ||
        (message.payload.categoryPath != null &&
          (typeof message.payload.categoryPath !== 'string' ||
            message.payload.categoryPath.length > 160 ||
            !/^[1-9][0-9]*(?:\/[a-z0-9_ -]+){0,5}$/u.test(message.payload.categoryPath))) ||
        !Array.isArray(message.payload.images) ||
        message.payload.images.length > 20 ||
        message.payload.images.some(
          (image) =>
            !record(image) ||
            typeof image.name !== 'string' ||
            typeof image.url !== 'string' ||
            !image.url.startsWith('https://'),
        ))
    )
      return null;
    return { action, ...message };
  }
  function publicBinding(value) {
    const b = value.binding;
    return {
      workspaceId: b.workspaceId,
      connectionId: b.connectionId,
      externalAccountId: b.externalAccountId,
      displayName: b.displayName,
      accountType: b.accountType,
      status: b.status,
      generation: b.generation,
      expiresAt: b.expiresAt,
      canPublish: b.canPublish,
    };
  }
  function validIdentity(value) {
    return (
      record(value) &&
      identifier(value.externalAccountId) &&
      typeof value.displayName === 'string' &&
      value.displayName.trim().length > 0 &&
      value.displayName.length <= 120 &&
      ['private', 'commercial'].includes(value.accountType)
    );
  }
  function createAccountRuntime(adapter) {
    let busy = false;
    async function exclusive(action) {
      if (busy) throw new Error('Die Kontoprüfung läuft bereits.');
      busy = true;
      try {
        return await action();
      } finally {
        busy = false;
      }
    }
    function proposal(pending) {
      return {
        ...pending.identity,
        installationId: pending.installationId,
        tokenHash: pending.tokenHash,
        nonce: pending.nonce,
      };
    }
    return {
      prepare: (input, origin) =>
        exclusive(async () => {
          if (parseRequest(input, origin)?.action !== 'PREPARE_ACCOUNT')
            throw new Error('Ungültige Kontoprüfung.');
          const old = await adapter.load();
          if (old?.phase === 'connected' && Date.parse(old.binding.expiresAt) > adapter.now())
            throw new Error('Trenne zuerst die vorhandene Kleinanzeigen-Verbindung.');
          const identity = await adapter.readIdentity();
          if (!validIdentity(identity)) throw new Error('Melde Dich zuerst bei Kleinanzeigen an.');
          if (
            old?.phase === 'prepared' &&
            old.appOrigin === origin &&
            old.workspaceId === input.workspaceId &&
            old.apiUrl === input.apiUrl &&
            old.canPublish === input.canPublish &&
            old.identity.externalAccountId === identity.externalAccountId &&
            old.preparedAt + 300000 > adapter.now()
          )
            return proposal(old);
          if (
            !(await adapter.confirm({
              identity,
              workspaceId: input.workspaceId,
              appOrigin: origin,
              canPublish: input.canPublish,
            }))
          )
            throw new Error('Kontobindung abgebrochen.');
          if ((await adapter.readIdentity())?.externalAccountId !== identity.externalAccountId)
            throw new Error('Das Kleinanzeigen-Konto hat sich geändert.');
          const secret = adapter.secret();
          const tokenHash = await adapter.hash(secret);
          if (!/^[0-9a-f]{64}$/u.test(secret) || !/^[0-9a-f]{64}$/u.test(tokenHash))
            throw new Error('Die lokale Freigabe konnte nicht erzeugt werden.');
          const pending = {
            phase: 'prepared',
            workspaceId: input.workspaceId,
            appOrigin: origin,
            apiUrl: input.apiUrl,
            identity,
            canPublish: input.canPublish,
            installationId: adapter.uuid(),
            nonce: adapter.uuid(),
            secret,
            tokenHash,
            preparedAt: adapter.now(),
          };
          await adapter.save(pending);
          return proposal(pending);
        }),
      connect: (input, origin) =>
        exclusive(async () => {
          const pending = await adapter.load();
          const b = input?.binding;
          if (
            !appOrigin(origin) ||
            !pending ||
            pending.appOrigin !== origin ||
            pending.nonce !== input.nonce ||
            pending.preparedAt + 300000 <= adapter.now() ||
            !record(b) ||
            Object.keys(b).sort().join(',') !==
              'accountType,canPublish,connectionId,displayName,expiresAt,externalAccountId,generation,status,workspaceId' ||
            b.workspaceId !== pending.workspaceId ||
            !identifier(b.connectionId) ||
            b.externalAccountId !== pending.identity.externalAccountId ||
            b.accountType !== pending.identity.accountType ||
            b.displayName !== pending.identity.displayName ||
            b.canPublish !== pending.canPublish ||
            !Number.isSafeInteger(b.generation) ||
            b.generation < 1 ||
            !['needs_login', 'connected'].includes(b.status) ||
            typeof b.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(b.expiresAt)) ||
            Date.parse(b.expiresAt) <= adapter.now() ||
            Date.parse(b.expiresAt) > adapter.now() + 86520000
          )
            throw new Error('Die Bindungsbestätigung passt nicht zu Deiner Anfrage.');
          if ((await adapter.readIdentity())?.externalAccountId !== b.externalAccountId)
            throw new Error('Das Kleinanzeigen-Konto hat sich geändert.');
          const session = await adapter.session(pending, {
            action: 'heartbeat',
            workspaceId: b.workspaceId,
            connectionId: b.connectionId,
            generation: b.generation,
          });
          if (
            session?.workspaceId !== b.workspaceId ||
            session.connectionId !== b.connectionId ||
            session.externalAccountId !== b.externalAccountId ||
            session.generation !== b.generation ||
            session.canPublish !== b.canPublish ||
            session.expiresAt !== b.expiresAt
          )
            throw new Error('Die serverseitige Freigabe passt nicht.');
          const connected = { ...pending, phase: 'connected', binding: { ...b } };
          await adapter.save(connected);
          return publicBinding(connected);
        }),
      async status() {
        const value = await adapter.load();
        return value?.phase === 'connected' && Date.parse(value.binding.expiresAt) > adapter.now()
          ? publicBinding(value)
          : null;
      },
      disconnect: (scope) =>
        exclusive(async () => {
          const value = await adapter.load();
          if (
            value?.binding?.workspaceId !== scope.workspaceId ||
            value.binding.connectionId !== scope.connectionId
          )
            throw new Error('Die Kontobindung passt nicht.');
          await adapter.save(null);
          return { ok: true };
        }),
    };
  }
  root.FlipbaseKleinanzeigenLocal = Object.freeze({
    storageKey,
    appOrigin,
    apiUrl,
    parseRequest,
    createAccountRuntime,
  });
})(globalThis);
