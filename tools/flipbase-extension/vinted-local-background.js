(function initVintedLocalBackground() {
  const core = globalThis.FlipbaseVintedLocal;
  const key = core.storageKey;
  const now = () => Date.now();
  const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const load = async () => {
    await storageReady;
    return (await chrome.storage.local.get(key))[key];
  };
  const save = async (installation) => chrome.storage.local.set({ [key]: installation });
  let operationDeadline = 0;
  let recoveredTab = false;

  // Das Installationsgeheimnis ist für Content Scripts nicht lesbar.

  async function ensureTab(preferredTabId) {
    if (
      chrome.permissions &&
      !(await chrome.permissions.contains({ origins: ['https://www.vinted.de/*'] }))
    ) {
      const error = new Error(
        'Erlaube der Flipbase-Erweiterung in Chrome den Zugriff auf www.vinted.de.',
      );
      error.code = 'permission_required';
      throw error;
    }
    let tab;
    let created = false;
    if (Number.isInteger(preferredTabId)) {
      try {
        tab = await chrome.tabs.get(preferredTabId);
      } catch {
        /* Geschlossenen Arbeitstab neu anlegen. */
      }
    }
    if (tab && (tab.incognito || !tab.url?.startsWith('https://www.vinted.de/'))) tab = undefined;
    if (!tab) {
      tab = await chrome.tabs.create({
        url: 'https://www.vinted.de/',
        active: false,
        pinned: true,
        index: 0,
      });
      created = true;
      const installation = await load();
      await save({ ...installation, tabId: tab.id });
    }
    if (!tab.pinned || tab.autoDiscardable !== false)
      tab = await chrome.tabs.update(tab.id, { pinned: true, autoDiscardable: false });
    if (Number.isInteger(tab.index) && tab.index > 0)
      tab = await chrome.tabs.move(tab.id, { index: 0 });
    const startedAt = now();
    while (tab.status !== 'complete' && now() - startedAt < 12_000 && now() < operationDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      tab = await chrome.tabs.get(tab.id);
    }
    if (
      tab.status !== 'complete' ||
      tab.incognito ||
      !tab.url?.startsWith('https://www.vinted.de/')
    )
      throw new Error(
        'Der reservierte Vinted-Tab ist noch nicht bereit. Melde Dich dort an und versuche es erneut.',
      );
    return { tabId: tab.id, created };
  }

  async function waitForReceiver(tabId, readDeadline) {
    const readyDeadline = Math.min(now() + 2_000, readDeadline);
    while (now() < readyDeadline) {
      let timeout;
      try {
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'VINTED_LOCAL_READY' }),
          new Promise((resolve) => {
            timeout = setTimeout(() => resolve(undefined), Math.min(300, readyDeadline - now()));
          }),
        ]);
        if (response?.success === true && response.ready === true) return true;
      } catch {
        // document_idle kann erst nach dem complete-Status den Empfänger anmelden.
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(150, Math.max(0, readyDeadline - now()))),
      );
    }
    return false;
  }

  async function readFromTab(tabId, request) {
    const readDeadline =
      operationDeadline - (request.type === 'VINTED_LOCAL_IDENTITY' ? 1_000 : 13_000);
    let reserved = await ensureTab(tabId);
    let ready = await waitForReceiver(reserved.tabId, readDeadline);
    if (!ready && !reserved.created && !recoveredTab && now() < readDeadline) {
      // Nach einem Erweiterungs-Reload bleibt der alte Tab ohne gültiges Content Script offen.
      // Nur unseren gespeicherten Arbeitstab ersetzen; keine Nutzertabs neu laden.
      recoveredTab = true;
      const staleTabId = reserved.tabId;
      reserved = await ensureTab();
      ready = await waitForReceiver(reserved.tabId, readDeadline);
      if (ready) await chrome.tabs.remove(staleTabId);
      else {
        await chrome.tabs.remove(reserved.tabId);
        const installation = await load();
        if (installation) await save({ ...installation, tabId: staleTabId });
      }
    }
    if (!ready)
      throw new Error(
        'Die Erweiterung konnte den Vinted-Arbeitstab nicht vorbereiten. Prüfe in Chrome, ob sie auf vinted.de zugreifen darf, und versuche es erneut.',
      );
    const reservedTabId = reserved.tabId;
    const timeoutMs = Math.min(35_000, readDeadline - now());
    if (timeoutMs <= 0) throw new Error('Der lokale Vorgang dauerte zu lange. Versuche es erneut.');
    let response;
    let timeout;
    try {
      response = await Promise.race([
        chrome.tabs.sendMessage(reservedTabId, { ...request, timeoutMs }),
        new Promise((resolve) => {
          timeout = setTimeout(
            () =>
              resolve({
                success: false,
                error: 'Der Vinted-Tab hat nicht rechtzeitig geantwortet.',
              }),
            timeoutMs + 500,
          );
        }),
      ]);
    } catch {
      throw new Error(
        'Der Vinted-Arbeitstab ist nicht erreichbar. Lade ihn neu und versuche es erneut.',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response?.success !== true) {
      const error = new Error(
        typeof response?.error === 'string'
          ? response.error
          : 'Vinted hat den lokalen Abruf nicht bestätigt.',
      );
      error.code = response?.code;
      error.retryAfter = response?.retryAfter;
      throw error;
    }
    return { ...response.result, tabId: reservedTabId };
  }

  const runtime = core.createRuntime({
    load,
    save,
    now,
    version: chrome.runtime.getManifest?.().version ?? '1.6.0',
    begin: () => {
      operationDeadline = now() + 50_000;
      recoveredTab = false;
    },
    remove: () => chrome.storage.local.remove(key),
    randomSecret: () =>
      [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    hash: async (secret) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    readIdentity: (tabId) => readFromTab(tabId, { type: 'VINTED_LOCAL_IDENTITY' }),
    readSnapshot: (tabId, externalAccountId) =>
      readFromTab(tabId, { type: 'VINTED_LOCAL_SNAPSHOT', externalAccountId }),
    readInbox: (tabId, externalAccountId, state) =>
      readFromTab(tabId, { type: 'VINTED_LOCAL_INBOX', externalAccountId, state }),
    sendMessage: (tabId, externalAccountId, command) =>
      readFromTab(tabId, { type: 'VINTED_LOCAL_SEND', externalAccountId, command }),
    readFavorites: (tabId, externalAccountId) =>
      readFromTab(tabId, { type: 'VINTED_LOCAL_FAVORITES', externalAccountId }),
    sendFavorite: (tabId, externalAccountId, command) =>
      readFromTab(tabId, { type: 'VINTED_LOCAL_FAVORITE_SEND', externalAccountId, command }),
    edge: async (binding, secret, body) => {
      if (!core.isApiUrl(binding.apiUrl, binding.appOrigin))
        throw new Error('Die Serveradresse ist nicht erlaubt.');
      const serializedBody = JSON.stringify(body);
      if (new TextEncoder().encode(serializedBody).length > 512 * 1024)
        throw new Error(
          'Die Daten überschreiten die maximale Größe dieses Lesepiloten. Es wurde nichts importiert.',
        );
      const timeoutMs = Math.min(6_000, operationDeadline - now());
      if (timeoutMs <= 0)
        throw new Error(
          'Der lokale Vorgang dauerte zu lange. Prüfe den gespeicherten Stand in Flipbase.',
        );
      const response = await fetch(binding.apiUrl, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: serializedBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 401 || response.status === 403)
        throw new core.LocalBindingInvalidError();
      if (!response.ok)
        throw new Error(
          'Flipbase konnte den lokalen Abgleich nicht bestätigen. Versuche es später erneut.',
        );
      return response.json();
    },
  });

  const scheduler = globalThis.FlipbaseVintedScheduler?.createScheduler({
    load,
    save,
    now,
    readiness: (binding) => runtime.run({ action: 'READINESS' }, binding.appOrigin),
    run: (action, binding) =>
      runtime.run(
        {
          action: action === 'INBOX_BACKFILL' ? 'INBOX_SYNC' : action,
          automatic: true,
          mode: action === 'INBOX_BACKFILL' ? 'backfill' : 'latest',
          payload: { workspaceId: binding.workspaceId, connectionId: binding.connectionId },
        },
        binding.appOrigin,
      ),
  });
  let readinessPending;
  function restoreReadiness() {
    if (readinessPending) return readinessPending;
    readinessPending = (async () => {
      const installation = await load();
      if (installation?.binding)
        await runtime.run({ action: 'READINESS' }, installation.binding.appOrigin);
    })()
      .catch(() => console.warn('Flipbase: Die lokale Verbindung konnte nicht geprüft werden.'))
      .finally(() => {
        readinessPending = undefined;
      });
    return readinessPending;
  }
  chrome.runtime.onStartup?.addListener(restoreReadiness);
  chrome.runtime.onInstalled?.addListener(restoreReadiness);
  if (chrome.runtime.onStartup) restoreReadiness();
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    load()
      .then((installation) => {
        if (installation?.binding && tabId === installation.tabId) return restoreReadiness();
      })
      .catch(() => console.warn('Flipbase: Der lokale Arbeitstab konnte nicht geprüft werden.'));
  });
  chrome.permissions?.onAdded?.addListener(restoreReadiness);
  chrome.permissions?.onRemoved?.addListener(restoreReadiness);
  async function ensureAlarm() {
    if (!chrome.alarms || !scheduler) return;
    if (!(await chrome.alarms.get('flipbase-vinted-sync')))
      await chrome.alarms.create('flipbase-vinted-sync', { periodInMinutes: 0.5 });
  }
  if (chrome.alarms && scheduler) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'flipbase-vinted-sync')
        scheduler
          .tick()
          .catch(() =>
            console.warn('Flipbase: Der lokale Zeitplan konnte nicht ausgeführt werden.'),
          );
    });
    chrome.runtime.onStartup?.addListener(() => {
      ensureAlarm().catch(() =>
        console.warn('Flipbase: Der lokale Zeitplan konnte nicht ausgeführt werden.'),
      );
    });
    chrome.runtime.onInstalled?.addListener(() => {
      ensureAlarm().catch(() =>
        console.warn('Flipbase: Der lokale Zeitplan konnte nicht ausgeführt werden.'),
      );
    });
    ensureAlarm().catch(() =>
      console.warn('Flipbase: Der lokale Zeitplan konnte nicht ausgeführt werden.'),
    );
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      [
        'VINTED_LOCAL_ACCOUNT_STATUS',
        'VINTED_LOCAL_ACCOUNT_READINESS',
        'VINTED_LOCAL_ACCOUNT_RECHECK',
      ].includes(message?.type)
    ) {
      if (Object.keys(message).length !== 1) return false;
      let origin;
      try {
        origin = new URL(sender.url ?? '').origin;
      } catch {
        return false;
      }
      if (
        sender.id !== chrome.runtime.id ||
        sender.frameId !== 0 ||
        !Number.isInteger(sender.tab?.id) ||
        sender.tab.incognito ||
        sender.origin !== origin ||
        (origin !== 'https://www.vinted.de' && !core.isAppOrigin(origin))
      )
        return false;
      (async () => {
        const installation = await load();
        const binding = installation?.binding;
        if (
          ['VINTED_LOCAL_ACCOUNT_READINESS', 'VINTED_LOCAL_ACCOUNT_RECHECK'].includes(message.type)
        ) {
          if (origin !== 'https://www.vinted.de') return sendResponse({ success: false });
          const result = binding
            ? await runtime.run(
                {
                  action: message.type === 'VINTED_LOCAL_ACCOUNT_RECHECK' ? 'RECHECK' : 'READINESS',
                },
                binding.appOrigin,
              )
            : runtime.readStatus(installation);
          return sendResponse({ success: true, result });
        }
        if (binding && origin !== 'https://www.vinted.de' && binding.appOrigin !== origin)
          return sendResponse({
            success: true,
            result: { localAccount: null, readiness: runtime.readStatus(null) },
          });
        const readiness = runtime.readStatus(installation);
        const expiresAt = Date.parse(binding?.expiresAt);
        const state =
          installation?.schedule?.pauseReason === 'local_binding_revoked'
            ? 'revoked'
            : installation?.schedule?.pauseReason === 'local_binding_invalid'
              ? 'unavailable'
              : !Number.isFinite(expiresAt) || expiresAt <= now()
                ? 'expired'
                : installation?.schedule?.pauseReason || installation?.schedule?.retryAfter > now()
                  ? 'paused'
                  : 'linked';
        const localAccount = binding
          ? {
              boundUsername: installation.identity?.username ?? null,
              boundConnectionId: binding.connectionId,
              expiresAt: binding.expiresAt,
              state,
            }
          : null;
        sendResponse({
          success: true,
          result:
            origin === 'https://www.vinted.de'
              ? {
                  reserved: sender.tab.id === installation?.tabId,
                  readiness,
                  binding: binding
                    ? {
                        externalAccountId: binding.externalAccountId,
                        username: localAccount.boundUsername,
                        connectionId: binding.connectionId,
                        workspaceId: binding.workspaceId,
                        appOrigin: binding.appOrigin,
                        state,
                      }
                    : null,
                }
              : { localAccount, readiness },
        });
      })().catch(() => sendResponse({ success: false }));
      return true;
    }
    if (message?.type === 'VINTED_LOCAL_OPEN_USER_TAB') {
      (async () => {
        const installation = await load();
        if (
          sender.id !== chrome.runtime.id ||
          sender.frameId !== 0 ||
          sender.tab?.id !== installation?.tabId ||
          new URL(sender.url ?? '').origin !== 'https://www.vinted.de'
        )
          return;
        await chrome.tabs.create({ url: 'https://www.vinted.de/', active: true });
        sendResponse({ success: true });
      })().catch(() => sendResponse({ success: false }));
      return true;
    }
    let origin;
    try {
      origin = new URL(sender.url ?? '').origin;
    } catch {
      return false;
    }
    if (
      sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 ||
      sender.tab?.incognito ||
      sender.origin !== origin ||
      !core.isAppOrigin(origin)
    )
      return false;
    const request = core.parseRequest(message, origin);
    if (!request) return false;
    runtime
      .run(request, origin)
      .then(async (result) => {
        const installation = await load();
        if (installation) {
          const schedule = { ...installation.schedule };
          if (
            !['READINESS', 'RECHECK'].includes(request.action) &&
            !result.reported &&
            !result.skipped
          )
            delete schedule.pauseReason;
          if (request.action === 'MESSAGES_SEND') schedule.commandsAt = now() + 90_000;
          if (request.action === 'INBOX_SYNC') {
            schedule.latestAt = now() + 300_000;
            schedule.backfillAt = result.nextPage > 1 ? now() + 60_000 : null;
          }
          await save({ ...installation, schedule });
        }
        sendResponse({ success: true, result });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Die lokale Verbindung konnte nicht bestätigt werden.',
        }),
      );
    return true;
  });
})();
