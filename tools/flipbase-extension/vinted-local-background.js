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

  // Das Installationsgeheimnis ist für Content Scripts nicht lesbar.

  async function ensureTab(preferredTabId) {
    let tab;
    if (Number.isInteger(preferredTabId)) {
      try {
        tab = await chrome.tabs.get(preferredTabId);
      } catch {
        /* Geschlossenen Arbeitstab neu anlegen. */
      }
    }
    if (tab && (tab.incognito || !tab.url?.startsWith('https://www.vinted.de/'))) tab = undefined;
    if (!tab) {
      tab = await chrome.tabs.create({ url: 'https://www.vinted.de/', active: true });
      const installation = await load();
      await save({ ...installation, tabId: tab.id });
    }
    const startedAt = now();
    while (tab.status !== 'complete' && now() - startedAt < 12_000 && now() < operationDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      tab = await chrome.tabs.get(tab.id);
    }
    if (tab.status !== 'complete' || !tab.url?.startsWith('https://www.vinted.de/'))
      throw new Error(
        'Der reservierte Vinted-Tab ist noch nicht bereit. Melde Dich dort an und versuche es erneut.',
      );
    return tab.id;
  }

  async function readFromTab(tabId, request) {
    const reservedTabId = await ensureTab(tabId);
    const timeoutMs = Math.min(
      35_000,
      operationDeadline - now() - (request.type === 'VINTED_LOCAL_SNAPSHOT' ? 13_000 : 1_000),
    );
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
      await chrome.tabs.update(reservedTabId, { active: true });
      throw new Error(
        typeof response?.error === 'string'
          ? response.error
          : 'Vinted hat den lokalen Abruf nicht bestätigt.',
      );
    }
    return { ...response.result, tabId: reservedTabId };
  }

  const runtime = core.createRuntime({
    load,
    save,
    now,
    begin: () => {
      operationDeadline = now() + 50_000;
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
    edge: async (binding, secret, body) => {
      if (!core.isApiUrl(binding.apiUrl, binding.appOrigin))
        throw new Error('Die Serveradresse ist nicht erlaubt.');
      const serializedBody = JSON.stringify(body);
      if (new TextEncoder().encode(serializedBody).length > 512 * 1024)
        throw new Error(
          'Die Anzeigendaten überschreiten die maximale Größe dieses Lesepiloten. Es wurde nichts importiert.',
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    runtime.run(request, origin).then(
      (result) => sendResponse({ success: true, result }),
      (error) =>
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
