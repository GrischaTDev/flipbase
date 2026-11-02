(function initKleinanzeigenLocalBackground() {
  const core = globalThis.FlipbaseKleinanzeigenLocal;
  if (!core) return;
  const key = core.storageKey;
  const ready = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  let accountTabId;
  let pendingConsent;
  let listingTabId;
  let listingDocumentTime;
  let listingCursor;
  let listingReadRunId;
  const syncProgressKey = 'kleinanzeigen_sync_progress';
  const workTabsKey = 'kleinanzeigen_work_tabs';
  const publicationDaysKey = 'kleinanzeigen_publication_days';
  const publicationDayScope = (installation, externalId) =>
    JSON.stringify([
      installation.appOrigin,
      installation.binding.workspaceId,
      installation.binding.connectionId,
      installation.binding.externalAccountId,
      externalId,
    ]);
  const load = async () => {
    await ready;
    return (await chrome.storage.local.get(key))[key] ?? null;
  };
  const save = async (value) => {
    await ready;
    await chrome.storage.local.set({
      [key]: value
        ? { ...value, ...(Number.isInteger(accountTabId) ? { tabId: accountTabId } : {}) }
        : null,
    });
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Nur ausdrücklich gespeicherte eigene Arbeitstabs werden angefasst.
  async function organizeWorkTab(tab) {
    if (!chrome.tabGroups || !chrome.tabs.group) return tab;
    if (tab.pinned) tab = await chrome.tabs.update(tab.id, { pinned: false });
    const remembered = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
    const ownedIds = new Set([
      tab.id,
      ...Object.entries(remembered)
        .filter(([key]) => key.endsWith('TabId'))
        .map(([, value]) => value),
      ...(remembered.publicationTabIds ?? []),
    ]);
    let groupId;
    if (Number.isInteger(remembered.groupId)) {
      try {
        const group = await chrome.tabGroups.get(remembered.groupId);
        const members = await chrome.tabs.query({ groupId: group.id });
        if (
          group.windowId === tab.windowId &&
          group.title === 'Flipbase · Kleinanzeigen' &&
          members.every((member) => ownedIds.has(member.id))
        )
          groupId = group.id;
      } catch {
        /* Die Gruppe wurde inzwischen geschlossen. */
      }
    }
    groupId = await chrome.tabs.group({
      tabIds: [tab.id],
      ...(groupId === undefined ? {} : { groupId }),
    });
    await chrome.tabGroups.update(groupId, { title: 'Flipbase · Kleinanzeigen', color: 'yellow' });
    const pinned = await chrome.tabs.query({ windowId: tab.windowId, pinned: true });
    await chrome.tabGroups.move(groupId, { index: pinned.length });
    await chrome.tabs.update(tab.id, { autoDiscardable: false });
    await chrome.storage.local.set({ [workTabsKey]: { ...remembered, groupId } });
    return tab;
  }
  async function readAccount({ requireQuota = false, externalAccountId } = {}) {
    const start = Date.now();
    let refreshed = false;
    let waitingForQuota = false;
    let tab;
    const previous = await load();
    const workTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey];
    const address = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
    const tabId = listingTabId ?? workTabs?.listingTabId ?? accountTabId ?? previous?.tabId;
    if (Number.isInteger(tabId)) {
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        /* Geschlossener eigener Tab. */
      }
    }
    if (tab?.incognito || !isListingAddress(tab?.url)) tab = undefined;
    if (!tab) tab = await chrome.tabs.create({ url: address, active: false, index: 0 });
    await organizeWorkTab(tab);
    accountTabId = tab.id;
    listingTabId = tab.id;
    const remembered = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
    await chrome.storage.local.set({ [workTabsKey]: { ...remembered, listingTabId: tab.id } });
    const refreshReader = async () => {
      if (refreshed) return;
      const current = await chrome.tabs.get(tab.id);
      if (current.incognito || !isListingAddress(current.url)) throw stopped('account_unreadable');
      refreshed = true;
      await chrome.tabs.reload(tab.id);
      listingDocumentTime = undefined;
      listingCursor = undefined;
    };
    while (Date.now() - start < 15000) {
      try {
        const current = await chrome.tabs.get(tab.id);
        if (current.incognito) throw stopped('account_unreadable');
        if (current.status === 'complete') {
          if (!isListingAddress(current.url)) {
            if (isListingAddress(current.pendingUrl)) {
              await delay(250);
              continue;
            }
            throw stopped('account_unreadable');
          }
          const answer = await chrome.tabs.sendMessage(tab.id, {
            type: 'KLEINANZEIGEN_READ_ACCOUNT',
            minimumDocumentTime: start,
            requireQuota,
          });
          if (answer && answer.readerRevision !== 2) {
            if (refreshed) throw stopped('extension_unreachable');
            await refreshReader();
          } else if (answer?.success === true && answer.result?.identity) {
            if (
              !requireQuota ||
              answer.result.quota ||
              (externalAccountId && answer.result.identity.externalAccountId !== externalAccountId)
            )
              return answer.result;
            waitingForQuota = true;
          } else if (answer?.errorCode && answer.errorCode !== 'not_ready') {
            throw stopped(answer.errorCode);
          } else if (Date.now() - start >= 500) {
            await refreshReader();
          }
        }
      } catch (error) {
        if (error?.code) throw error;
        // Alte Seitenskripte werden beim Erweiterungsupdate ungültig. Nur den
        // gespeicherten eigenen Anzeigen-Tab einmal ohne Fokuswechsel neu laden.
        if (Date.now() - start >= 500) await refreshReader();
      }
      await delay(250);
    }
    throw stopped(waitingForQuota ? 'quota_unknown' : 'extension_unreachable');
  }
  async function confirm(details) {
    const nonce = crypto.randomUUID();
    const url = chrome.runtime.getURL('kleinanzeigen-pairing.html#' + nonce);
    return await new Promise((resolve) => {
      const finish = (approved) => {
        if (pendingConsent?.nonce !== nonce) return;
        const current = pendingConsent;
        pendingConsent = undefined;
        clearTimeout(current.timeout);
        if (Number.isInteger(current.windowId))
          chrome.windows.remove(current.windowId).catch(() => {});
        resolve(approved === true);
      };
      pendingConsent = {
        nonce,
        url,
        details,
        finish,
        timeout: setTimeout(() => finish(false), 90000),
      };
      chrome.windows
        .create({ url, type: 'popup', width: 540, height: 620, focused: true })
        .then((window) => {
          if (pendingConsent?.nonce === nonce) pendingConsent.windowId = window.id;
          else if (Number.isInteger(window.id)) chrome.windows.remove(window.id).catch(() => {});
        })
        .catch(() => finish(false));
    });
  }
  chrome.windows?.onRemoved?.addListener((windowId) => {
    if (pendingConsent?.windowId === windowId) pendingConsent.finish(false);
  });
  function stopped(code) {
    const accountMessages = {
      needs_login:
        'Deine Kleinanzeigen-Sitzung ist abgelaufen. Melde Dich bei Kleinanzeigen erneut an.',
      account_unreadable:
        'Die Kleinanzeigen-Kontodaten konnten nicht gelesen werden. Starte den Abgleich erneut.',
      provider_unavailable:
        'Kleinanzeigen hat die Kontoprüfung nicht beantwortet. Versuche den Abgleich erneut.',
      extension_unreachable:
        'Die Erweiterung konnte die Kleinanzeigen-Seite nicht lesen. Lade die Erweiterung und Flipbase neu.',
      quota_unknown:
        'Dein Anzeigenkontingent konnte nicht gelesen werden. Versuche den Abgleich erneut.',
    };
    if (accountMessages[code]) {
      const error = new Error(accountMessages[code]);
      error.code = code;
      return error;
    }
    const error = new Error(
      code === 'account_changed'
        ? 'Das Kleinanzeigen-Konto hat sich geändert.'
        : code === 'access_revoked'
          ? 'Die lokale Kleinanzeigen-Freigabe ist nicht mehr gültig.'
          : code === 'source_changed'
            ? 'Die Anzeige ist nicht mehr vorhanden oder wurde geändert. Aktualisiere die Inserateliste.'
            : code === 'deletion_unconfirmed'
              ? 'Die Löschung wurde nicht eindeutig bestätigt. Prüfe Deine Inserate bei Kleinanzeigen, bevor Du erneut löschst.'
              : 'Der Kleinanzeigen-Abgleich wurde gestoppt. Starte ihn erneut.',
    );
    error.code = code;
    return error;
  }
  async function sendSession(installation, body) {
    if (!core.apiUrl(installation.apiUrl, installation.appOrigin)) throw stopped('access_revoked');
    let response;
    try {
      response = await fetch(installation.apiUrl, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + installation.secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        'Die Verbindung zu Flipbase wurde unterbrochen. Der Abgleich kann fortgesetzt werden.',
      );
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw stopped('access_revoked');
      if (response.status === 409) throw stopped('interrupted');
      if (response.status === 400) throw stopped('schema_changed');
      throw new Error('Flipbase konnte den Abgleich noch nicht bestätigen.');
    }
    return await response.json();
  }
  async function syncRpc(installation, body) {
    const current = await load();
    if (
      current?.phase !== 'connected' ||
      current.secret !== installation.secret ||
      current.appOrigin !== installation.appOrigin ||
      current.binding?.workspaceId !== installation.binding.workspaceId ||
      current.binding.connectionId !== installation.binding.connectionId ||
      current.binding.generation !== installation.binding.generation
    )
      throw stopped('access_revoked');
    return await sendSession(installation, body);
  }
  function isListingAddress(address) {
    try {
      const url = new URL(address);
      return (
        url.origin === 'https://www.kleinanzeigen.de' && url.pathname === '/m-meine-anzeigen.html'
      );
    } catch {
      return false;
    }
  }
  async function readListingPage(installation, cursor, runId) {
    if (runId !== undefined && listingReadRunId !== runId) {
      listingReadRunId = runId;
      listingDocumentTime = undefined;
      listingCursor = undefined;
    }
    const address = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
    let tab;
    if (listingDocumentTime) {
      try {
        tab = await chrome.tabs.get(listingTabId);
      } catch {
        /* Eigener Arbeitstab wurde geschlossen. */
      }
    }
    if (tab?.incognito || (tab && !isListingAddress(tab.url))) tab = undefined;
    if (!tab || Number(listingCursor?.slice(5)) > Number(cursor.slice(5))) {
      listingDocumentTime = Date.now();
      if (!tab) {
        const workTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey];
        if (Number.isInteger(workTabs?.listingTabId)) {
          try {
            const previous = await chrome.tabs.get(workTabs.listingTabId);
            if (!previous.incognito && isListingAddress(previous.url)) tab = previous;
          } catch {
            /* Nur einen ausdrücklich gespeicherten eigenen Tab wiederverwenden. */
          }
        }
      }
      if (tab) {
        if (tab.url === address) await chrome.tabs.reload(tab.id);
        else await chrome.tabs.update(tab.id, { url: address });
      } else tab = await chrome.tabs.create({ url: address, active: false, index: 0 });
      await organizeWorkTab(tab);
      listingTabId = tab.id;
      listingCursor = 'page:1';
      const remembered = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
      await chrome.storage.local.set({ [workTabsKey]: { ...remembered, listingTabId } });
    }
    const read = async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        let answer;
        try {
          const current = await chrome.tabs.get(listingTabId);
          if (current.status === 'complete' && !current.pendingUrl) {
            // Nach einer Löschung kann die alte vollständige Seite noch sichtbar
            // sein, während Chrome bereits die nächste Navigation vorgemerkt hat.
            // Die Bestätigung enthält außerdem regulär eine actMsg-Abfrage.
            if (current.incognito || !isListingAddress(current.url))
              throw stopped('account_unreadable');
            answer = await chrome.tabs.sendMessage(listingTabId, {
              type: 'KLEINANZEIGEN_READ_PAGE',
              minimumDocumentTime: listingDocumentTime,
              expectedExternalAccountId: installation.binding.externalAccountId,
              expectedCursor: listingCursor,
              includeDetails: runId !== undefined && listingCursor === cursor,
            });
          }
        } catch (error) {
          if (error?.code) throw error;
        }
        if (answer?.success === true) {
          if (answer.result?.identity?.externalAccountId !== installation.binding.externalAccountId)
            throw stopped('account_changed');
          if (answer.result.pageCursor === listingCursor) return answer.result;
        }
        if (['account_changed', 'unsupported'].includes(answer?.errorCode))
          throw stopped(answer.errorCode);
        await delay(200);
      }
      throw stopped('schema_changed');
    };
    let page = await read();
    while (listingCursor !== cursor) {
      if (
        !page.nextCursor ||
        page.complete ||
        page.nextCursor !== 'page:' + (Number(listingCursor.slice(5)) + 1)
      )
        throw stopped('schema_changed');
      const binding = installation.binding;
      const session = await syncRpc(installation, {
        action: 'heartbeat',
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        generation: binding.generation,
      });
      if (
        session?.externalAccountId !== binding.externalAccountId ||
        session.generation !== binding.generation
      )
        throw stopped('access_revoked');
      const next = await chrome.tabs.sendMessage(listingTabId, {
        type: 'KLEINANZEIGEN_ADVANCE_PAGE',
        minimumDocumentTime: listingDocumentTime,
        expectedExternalAccountId: binding.externalAccountId,
        expectedCursor: listingCursor,
        nextCursor: page.nextCursor,
      });
      if (next?.success !== true)
        throw stopped(next?.errorCode === 'account_changed' ? 'account_changed' : 'schema_changed');
      listingCursor = page.nextCursor;
      page = await read();
    }
    if (runId !== undefined) {
      const days = (await chrome.storage.local.get(publicationDaysKey))[publicationDaysKey] ?? {};
      for (const item of page.items) {
        const known = days[publicationDayScope(installation, item.externalId)];
        if (!item.publishedOn && /^\d{4}-\d{2}-\d{2}$/u.test(known ?? '')) item.publishedOn = known;
      }
    }
    return page;
  }
  async function synchronize(request, origin) {
    const installation = await load();
    const binding = installation?.binding;
    if (
      !globalThis.FlipbaseKleinanzeigenSync ||
      installation?.phase !== 'connected' ||
      installation.appOrigin !== origin ||
      binding?.workspaceId !== request.workspaceId ||
      binding.connectionId !== request.connectionId ||
      binding.generation !== request.generation
    )
      throw stopped('access_revoked');
    return await globalThis.FlipbaseKleinanzeigenSync.run(installation, request.runId, {
      now: () => Date.now(),
      readAccount,
      readPage: (cursor) => readListingPage(installation, cursor, request.runId),
      rpc: (body) => syncRpc(installation, body),
      loadProgress: async () => {
        await ready;
        return (await chrome.storage.local.get(syncProgressKey))[syncProgressKey] ?? null;
      },
      saveProgress: async (value) => {
        await ready;
        await chrome.storage.local.set({ [syncProgressKey]: value });
      },
    });
  }
  async function refreshQuota(request, origin, jobId = null) {
    const installation = await load();
    const binding = installation?.binding;
    if (
      installation?.phase !== 'connected' ||
      installation.appOrigin !== origin ||
      binding?.workspaceId !== request.workspaceId ||
      binding.connectionId !== request.connectionId ||
      binding.generation !== request.generation ||
      binding.accountType !== 'private' ||
      Date.parse(binding.expiresAt) <= Date.now()
    )
      throw stopped('access_revoked');
    const account = await readAccount({
      requireQuota: true,
      externalAccountId: binding.externalAccountId,
    });
    const q = account.quota;
    if (
      account.identity?.externalAccountId !== binding.externalAccountId ||
      account.identity.accountType !== 'private'
    )
      throw stopped('account_changed');
    if (
      !q ||
      q.externalAccountId !== binding.externalAccountId ||
      q.accountType !== 'private' ||
      q.source !== 'account_settings' ||
      !Number.isSafeInteger(q.used) ||
      q.used < 0 ||
      !Number.isFinite(Date.parse(q.observedAt)) ||
      Date.parse(q.observedAt) < Date.now() - 60000 ||
      Date.parse(q.observedAt) > Date.now() + 5000
    )
      throw stopped('quota_unknown');
    const result = await syncRpc(installation, {
      action: 'quota_observation',
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      generation: binding.generation,
      jobId,
      quota: {
        externalAccountId: q.externalAccountId,
        accountType: q.accountType,
        used: q.used,
        observedAt: q.observedAt,
        source: 'account_settings',
      },
    });
    if (
      !result ||
      Object.keys(result).sort().join(',') !==
        'canPublish,connectionId,expiresAt,externalAccountId,generation,quota,workspaceId' ||
      result.workspaceId !== binding.workspaceId ||
      result.connectionId !== binding.connectionId ||
      result.externalAccountId !== binding.externalAccountId ||
      result.generation !== binding.generation ||
      result.expiresAt !== binding.expiresAt ||
      result.canPublish !== binding.canPublish ||
      !result.quota ||
      Object.keys(result.quota).sort().join(',') !== 'allowed,observedAt,reason,reserved,used' ||
      result.quota.used !== q.used ||
      Date.parse(result.quota.observedAt) !== Date.parse(q.observedAt) ||
      !Number.isSafeInteger(result.quota.reserved) ||
      result.quota.reserved < 0 ||
      typeof result.quota.allowed !== 'boolean' ||
      ![null, 'quota_exhausted', 'quota_unknown'].includes(result.quota.reason) ||
      (result.quota.allowed &&
        (result.quota.reason !== null || q.used + result.quota.reserved >= 100))
    )
      throw stopped('schema_changed');
    return result;
  }
  let formBusy = false;
  async function loadFormSchema(request, origin, owner) {
    if (formBusy) throw new Error('Die Kleinanzeigen-Felder werden bereits gelesen.');
    formBusy = true;
    let tab;
    let started;
    try {
      const installation = await load();
      const binding = installation?.binding;
      if (!globalThis.FlipbaseKleinanzeigenForm || !binding) throw stopped('access_revoked');
      const body = {
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        generation: binding.generation,
      };
      const check = () => syncRpc(installation, { action: 'heartbeat', ...body });
      const step = async (action, categoryPath, categoryLabel) => {
        const current = await chrome.tabs.get(tab.id);
        if (current.incognito || !current.url?.startsWith('https://www.kleinanzeigen.de/'))
          throw stopped('needs_login');
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'KLEINANZEIGEN_FORM_STEP',
          minimumDocumentTime: started,
          expectedExternalAccountId: binding.externalAccountId,
          action,
          categoryPath,
          ...(categoryLabel ? { categoryLabel } : {}),
        });
        if (response?.success !== true)
          throw stopped(
            response?.errorCode === 'account_changed' ? 'account_changed' : 'schema_changed',
          );
        return response.result;
      };
      const readyPage = async (pathname) => {
        const end = Date.now() + 15000;
        while (Date.now() < end) {
          const current = await chrome.tabs.get(tab.id);
          if (current.status === 'complete' && new URL(current.url).pathname === pathname) return;
          await delay(100);
        }
        throw stopped('needs_login');
      };
      const result = await globalThis.FlipbaseKleinanzeigenForm.run(installation, request, origin, {
        now: () => Date.now(),
        check,
        readIdentity: async () => (await readAccount()).identity,
        open: async () => {
          started = Date.now();
          const url =
            'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html#flipbase-form-read';
          const savedTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
          if (
            Number.isInteger(owner?.reuseTabId) &&
            savedTabs.publicationTabIds?.includes(owner.reuseTabId)
          ) {
            try {
              const saved = await chrome.tabs.get(owner.reuseTabId);
              if (
                !saved.incognito &&
                new URL(saved.url).origin === 'https://www.kleinanzeigen.de' &&
                new URL(saved.url).pathname === '/p-anzeige-aufgeben-schritt2.html'
              ) {
                // Ein reiner Hashwechsel erzeugt kein frisches Dokument.
                await chrome.tabs.reload(saved.id);
                tab = saved;
              }
            } catch {
              /* Ein geschlossener eigener Entwurf wird neu angelegt. */
            }
          }
          if (!tab) tab = await chrome.tabs.create({ url, active: false, index: 0 });
          await organizeWorkTab(tab);
          const remembered = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
          await chrome.storage.local.set({
            [workTabsKey]: {
              ...remembered,
              formTabId: tab.id,
              ...(owner
                ? {
                    publicationTabIds: [
                      ...new Set([...(remembered.publicationTabIds ?? []), tab.id]),
                    ],
                  }
                : {}),
            },
          });
          await readyPage('/p-anzeige-aufgeben-schritt2.html');
          try {
            await step('enter_categories', '');
          } catch (error) {
            if (error?.code) throw error;
          }
          await readyPage('/p-kategorie-aendern.html');
          return await step('categories', '');
        },
        choose: (path) => step('choose_category', path),
        continue: async (path) => {
          try {
            await step('continue_category', path);
          } catch (error) {
            if (error?.code) throw error;
          }
          await readyPage('/p-anzeige-aufgeben-schritt2.html');
        },
        readSchema: (path, label) =>
          owner?.assisted
            ? Promise.resolve({ categoryPath: path, categoryLabel: label })
            : step('schema', path, label),
        seal: (schema, observedAt) =>
          owner?.assisted
            ? Promise.resolve({ schema, observedAt })
            : syncRpc(installation, {
                action: 'form_schema',
                ...body,
                externalAccountId: binding.externalAccountId,
                schema,
                observedAt,
              }),
      });
      if (owner) {
        owner.tabId = tab.id;
        owner.minimumDocumentTime = started;
        owner.result = result;
      }
      return result;
    } finally {
      formBusy = false;
      if (tab?.id && !owner?.tabId) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
  let handoffBusy = false;
  const handoffContentKey = (payload) =>
    JSON.stringify({
      ...payload,
      images: payload.images.map((image) => ({
        name: image.name,
        key: image.key ?? new URL(image.url).origin + new URL(image.url).pathname,
      })),
    });
  async function openListing(request, origin) {
    if (handoffBusy) throw new Error('Ein Kleinanzeigen-Formular wird bereits vorbereitet.');
    handoffBusy = true;
    let tab;
    try {
      const installation = await load();
      const binding = installation?.binding;
      if (
        installation?.phase !== 'connected' ||
        installation.appOrigin !== origin ||
        !binding?.canPublish ||
        binding.accountType !== 'private' ||
        ['workspaceId', 'connectionId', 'generation'].some(
          (key) => binding[key] !== request[key],
        ) ||
        Date.parse(binding.expiresAt) <= Date.now()
      )
        throw stopped('access_revoked');
      const check = async () => {
        const current = await syncRpc(installation, {
          action: 'heartbeat',
          workspaceId: binding.workspaceId,
          connectionId: binding.connectionId,
          generation: binding.generation,
        });
        if (
          !current?.canPublish ||
          current.externalAccountId !== binding.externalAccountId ||
          current.generation !== binding.generation ||
          (await readAccount()).identity.externalAccountId !== binding.externalAccountId
        )
          throw stopped('account_changed');
      };
      await check();
      const key = 'kleinanzeigen_assisted_listings';
      const previous = (await chrome.storage.local.get(key))[key] ?? {};
      for (const value of Object.values(previous)) {
        if (
          value.handoffId !== request.handoffId ||
          value.appOrigin !== origin ||
          value.externalAccountId !== binding.externalAccountId ||
          value.expiresAt <= Date.now() ||
          value.contentKey !== handoffContentKey(request.payload)
        )
          continue;
        try {
          const existing = await chrome.tabs.get(value.tabId);
          if (existing.incognito || !existing.url?.startsWith('https://www.kleinanzeigen.de/'))
            continue;
          await chrome.tabs.update(existing.id, { active: true });
          return { opened: true, handoffId: request.handoffId };
        } catch {
          /* Geschlossenes Formular darf neu geöffnet werden. */
        }
      }
      let categoryReady = false;
      if (request.payload.categoryPath) {
        const owner = { assisted: true };
        try {
          await loadFormSchema(
            { ...request, categoryPath: request.payload.categoryPath },
            origin,
            owner,
          );
          tab = await chrome.tabs.get(owner.tabId);
          if (
            !owner.result?.schema ||
            new URL(tab.url).pathname !== '/p-anzeige-aufgeben-schritt2.html'
          ) {
            await chrome.tabs.remove(tab.id).catch(() => {});
            tab = undefined;
            throw new Error('category_missing');
          }
          categoryReady = true;
        } catch {
          /* Der Formularassistent erklärt die fehlende Kategorie im geöffneten Formular. */
        }
      }
      await check();
      if (!tab) {
        tab = await chrome.tabs.create({
          url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html#flipbase-assisted',
          active: false,
          index: 0,
        });
      }
      const values = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({
        [key]: {
          ...Object.fromEntries(
            Object.entries(values).filter(([, value]) => value.expiresAt > Date.now()),
          ),
          [tab.id]: {
            tabId: tab.id,
            appOrigin: origin,
            handoffId: request.handoffId,
            externalAccountId: binding.externalAccountId,
            expiresAt: Date.now() + 900000,
            contentKey: handoffContentKey(request.payload),
            payload: {
              ...request.payload,
              expectedExternalAccountId: binding.externalAccountId,
              categoryReady,
            },
          },
        },
      });
      const end = Date.now() + 20000;
      let acknowledged = false;
      while (!acknowledged && Date.now() < end) {
        try {
          const answer = await chrome.tabs.sendMessage(tab.id, {
            type: 'KLEINANZEIGEN_ASSISTED_FILL',
          });
          acknowledged = answer?.started === true;
        } catch {
          /* Auf die geladene Formularseite warten. */
        }
        if (!acknowledged) await delay(200);
      }
      if (!acknowledged)
        throw new Error(
          'Das Formular ist noch nicht bereit. Deine Fassung ist in Flipbase gesichert.',
        );
      await chrome.tabs.update(tab.id, { active: true });
      return { opened: true, handoffId: request.handoffId };
    } finally {
      handoffBusy = false;
    }
  }
  const publicationProgressKey = 'kleinanzeigen_publication_attempts';
  const publicationKey = (request) =>
    request.workspaceId + ':' + request.connectionId + ':' + request.jobId;
  async function savePublicationProgress(value) {
    await ready;
    const values =
      (await chrome.storage.local.get(publicationProgressKey))[publicationProgressKey] ?? {};
    await chrome.storage.local.set({
      [publicationProgressKey]: { ...values, [publicationKey(value)]: value },
    });
  }
  async function readAllPublications(installation) {
    listingDocumentTime = undefined;
    listingCursor = undefined;
    const pages = [];
    const seen = new Set();
    let cursor = 'page:1';
    while (cursor) {
      const page = await readListingPage(installation, cursor);
      if (
        page.identity?.externalAccountId !== installation.binding.externalAccountId ||
        page.identity.accountType !== 'private' ||
        page.pageCursor !== cursor ||
        page.items.some((item) => seen.has(item.externalId))
      )
        throw stopped('schema_changed');
      for (const item of page.items) seen.add(item.externalId);
      if (seen.size > 20000) throw stopped('schema_changed');
      pages.push(page);
      if (page.complete) {
        if (page.nextCursor !== null) throw stopped('schema_changed');
        break;
      }
      if (page.nextCursor !== 'page:' + (Number(cursor.slice(5)) + 1))
        throw stopped('schema_changed');
      cursor = page.nextCursor;
    }
    return pages;
  }
  async function publicationStep(progress, action, fields = {}) {
    const tab = await chrome.tabs.get(progress.tabId);
    if (
      tab.incognito ||
      !tab.url?.startsWith('https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html')
    )
      throw stopped('needs_login');
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'KLEINANZEIGEN_JOB_STEP',
      minimumDocumentTime: progress.minimumDocumentTime,
      expectedExternalAccountId: progress.installation.binding.externalAccountId,
      attemptId: progress.attemptId,
      jobId: progress.jobId,
      action,
      ...fields,
    });
    if (response?.success !== true)
      throw stopped(
        response?.errorCode === 'account_changed'
          ? 'account_changed'
          : (response?.errorCode ?? 'schema_changed'),
      );
    return response.result;
  }
  async function publicationPhoto(installation, body, image) {
    if (!core.apiUrl(installation.apiUrl, installation.appOrigin)) throw stopped('access_revoked');
    const response = await fetch(installation.apiUrl, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + installation.secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0] !== image.mimeType ||
      response.headers.get('x-flipbase-workspace-id') !== body.workspaceId ||
      response.headers.get('x-flipbase-connection-id') !== body.connectionId ||
      response.headers.get('x-flipbase-job-id') !== body.jobId ||
      response.headers.get('x-flipbase-image-id') !== image.imageId ||
      response.headers.get('x-flipbase-image-sha256') !== image.sha256 ||
      Number(response.headers.get('content-length')) !== image.byteSize ||
      image.byteSize < 1 ||
      image.byteSize > 12582912
    )
      throw stopped('images_incomplete');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join('');
    if (bytes.length !== image.byteSize || digest !== image.sha256)
      throw stopped('images_incomplete');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  }
  async function publicationResult(
    installation,
    job,
    progress,
    saveProgress = savePublicationProgress,
  ) {
    if ((await readAccount()).identity.externalAccountId !== job.externalAccountId)
      throw stopped('account_changed');
    let receipt = progress.receipt ?? null;
    const end = Date.now() + 20000;
    while (!receipt && Date.now() < end) {
      const tabs = [];
      if (Number.isInteger(progress.tabId)) {
        try {
          tabs.push(await chrome.tabs.get(progress.tabId));
        } catch {
          /* Nach Browserneustart anhand der lokalen Versuchsmarkierung wiederfinden. */
        }
      }
      if (chrome.tabs.query) {
        const existing = new Set(tabs.map((tab) => tab.id));
        tabs.push(
          ...(await chrome.tabs.query({ url: ['https://www.kleinanzeigen.de/*'] })).filter(
            (tab) => !existing.has(tab.id),
          ),
        );
      }
      let owned = false;
      for (const tab of tabs) {
        if (tab.incognito || !tab.url?.startsWith('https://www.kleinanzeigen.de/')) continue;
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'KLEINANZEIGEN_READ_RECEIPT',
            minimumDocumentTime: progress.minimumDocumentTime,
            jobId: job.id,
            attemptId: progress.attemptId,
          });
          if (response?.success && response.result?.owned === true) {
            owned = true;
            progress.tabId = tab.id;
            receipt = response.result.receipt;
            if (receipt) {
              progress.receipt = receipt;
              await saveProgress(progress);
            }
            break;
          }
        } catch {
          /* Navigation oder geschlossener eigener Arbeitstab. */
        }
      }
      // Beim Seitenwechsel ist das neue Content Script kurz noch nicht erreichbar.
      // Den eigenen Tab abwarten, ohne einen weiteren Veröffentlichungsklick auszulösen.
      if (receipt || (!owned && !tabs.some((tab) => tab.id === progress.tabId))) break;
      await delay(500);
    }
    if (!receipt) return { outcome: 'outcome_unknown', errorCode: 'publication_unconfirmed' };
    const pages = await readAllPublications(installation);
    if ((await readAccount()).identity.externalAccountId !== job.externalAccountId)
      throw stopped('account_changed');
    const result = globalThis.FlipbaseKleinanzeigenPublicationResults.confirm(
      job,
      progress.baseline,
      receipt,
      pages,
      Date.now(),
    );
    const submitted = Date.parse(receipt.submittedAt ?? '');
    if (
      result.outcome === 'confirmed' &&
      Number.isFinite(submitted) &&
      submitted >= progress.minimumDocumentTime &&
      submitted <= Date.now()
    ) {
      const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(submitted);
      const days = (await chrome.storage.local.get(publicationDaysKey))[publicationDaysKey] ?? {};
      await chrome.storage.local.set({
        [publicationDaysKey]: {
          ...days,
          [publicationDayScope(installation, result.externalId)]: day,
        },
      });
    }
    return result;
  }
  const publicationRuntime = globalThis.FlipbaseKleinanzeigenPublicationJobs?.create({
    now: () => Date.now(),
    secret: () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join(''),
    uuid: () => crypto.randomUUID(),
    loadInstallation: load,
    loadProgress: async (request) => {
      await ready;
      return (
        (await chrome.storage.local.get(publicationProgressKey))[publicationProgressKey]?.[
          publicationKey(request)
        ] ?? null
      );
    },
    saveProgress: savePublicationProgress,
    rpc: sendSession,
    quota: (installation, request, jobId) => refreshQuota(request, installation.appOrigin, jobId),
    readIdentity: async () => (await readAccount()).identity,
    readBaseline: async (installation) =>
      (await readAllPublications(installation)).flatMap((page) =>
        page.items.map((item) => item.externalId),
      ),
    openForm: async (installation, job) => {
      const owner = {};
      await loadFormSchema(
        {
          workspaceId: job.workspaceId,
          connectionId: job.connectionId,
          generation: job.grantGeneration,
          categoryPath: job.content.categoryId,
        },
        installation.appOrigin,
        owner,
      );
      if (!owner.result?.schema || !owner.result.schemaRevision) throw stopped('schema_changed');
      return {
        tabId: owner.tabId,
        minimumDocumentTime: owner.minimumDocumentTime,
        schema: owner.result.schema,
        schemaRevision: owner.result.schemaRevision,
      };
    },
    step: publicationStep,
    photo: publicationPhoto,
    readResult: publicationResult,
  });
  const runtime = core.createAccountRuntime({
    load,
    save,
    readIdentity: async () => (await readAccount()).identity,
    confirm,
    secret: () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    uuid: () => crypto.randomUUID(),
    now: () => Date.now(),
    hash: async (value) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
        (b) => b.toString(16).padStart(2, '0'),
      ).join(''),
    session: sendSession,
  });
  async function relistingSource(installation, externalId, previousTabId) {
    const url = 'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + externalId;
    let tab;
    if (!previousTabId)
      previousTabId = ((await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {})
        .sourceTabId;
    if (previousTabId) {
      try {
        tab = await chrome.tabs.get(previousTabId);
      } catch {
        /* Eigener Arbeitstab wurde geschlossen. */
      }
    }
    const minimumDocumentTime = Date.now();
    if (tab?.url === url && !tab.incognito) await chrome.tabs.reload(tab.id);
    else tab = await chrome.tabs.create({ url, active: false, index: 0 });
    await organizeWorkTab(tab);
    const sourceTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
    await chrome.storage.local.set({ [workTabsKey]: { ...sourceTabs, sourceTabId: tab.id } });
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      try {
        const current = await chrome.tabs.get(tab.id);
        if (current.status === 'complete' && current.url === url) {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'KLEINANZEIGEN_RELISTING_STEP',
            action: 'read',
            externalId,
            expectedExternalAccountId: installation.binding.externalAccountId,
            minimumDocumentTime,
          });
          if (response?.success)
            return { tabId: tab.id, minimumDocumentTime, snapshot: response.result };
          if (response?.errorCode) throw new Error(response.errorCode);
        }
      } catch (error) {
        if (error?.message === 'source_changed') throw error;
      }
      await delay(200);
    }
    throw new Error('Die alte Anzeige konnte nicht vollständig gesichert werden.');
  }
  const relistingRuntime = globalThis.FlipbaseKleinanzeigenRelistingJobs?.create({
    installation: load,
    check: (installation) =>
      syncRpc(installation, {
        action: 'heartbeat',
        workspaceId: installation.binding.workspaceId,
        connectionId: installation.binding.connectionId,
        generation: installation.binding.generation,
      }),
    identity: async () => (await readAccount()).identity,
    source: relistingSource,
    photo: async (url, index) => {
      const result = await globalThis.FlipbaseAutofill.fetchImageAsDataUrl(
        (address) =>
          fetch(address, {
            credentials: 'omit',
            redirect: 'error',
            signal: AbortSignal.timeout(30000),
          }),
        globalThis.FlipbaseKleinanzeigenRelistingImages.sourceUrl(url),
      );
      if (!result.ok) throw new Error('images_incomplete');
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/u.exec(result.dataUrl);
      if (!match) throw new Error('images_incomplete');
      const bytes = Uint8Array.from(atob(match[2]), (value) => value.charCodeAt(0));
      if (!bytes.length || bytes.length > 12582912) throw new Error('images_incomplete');
      await globalThis.FlipbaseKleinanzeigenRelistingImages.verify(bytes, match[1]);
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (value) => value.toString(16).padStart(2, '0'),
      ).join('');
      return {
        imageId: crypto.randomUUID(),
        fileName: `bild-${index + 1}.${match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'}`,
        mimeType: match[1],
        byteSize: bytes.length,
        sha256,
        encoded: match[2],
      };
    },
    verifyPhotos: async (images) => {
      for (const image of images) {
        const bytes = Uint8Array.from(atob(image.encoded), (value) => value.charCodeAt(0));
        await globalThis.FlipbaseKleinanzeigenRelistingImages.verify(bytes, image.mimeType);
      }
    },
    baseline: async (installation) =>
      (await readAllPublications(installation)).flatMap((page) =>
        page.items.map((item) => item.externalId),
      ),
    target: async (installation, request, categoryPath, record) => {
      const owner = { reuseTabId: record?.tabId };
      await loadFormSchema({ ...request, categoryPath }, installation.appOrigin, owner);
      return owner;
    },
    step: publicationStep,
    quota: (installation, request) => refreshQuota(request, installation.appOrigin),
    remove: async (installation, externalId, title) => {
      const pages = await readAllPublications(installation);
      const page = pages.find((page) =>
        page.items.some((item) => item.externalId === externalId && item.state === 'active'),
      );
      if (!page) throw new Error('source_changed');
      await readListingPage(installation, page.pageCursor);
      return await removeAndVerify(installation, externalId, title);
    },
    result: publicationResult,
    confirmed: async (record, installation) => {
      const status = (await chrome.storage.local.get(workspaceStatusKey))[workspaceStatusKey];
      if (
        status?.externalId === record.externalId &&
        status.workspaceId === installation.binding.workspaceId &&
        status.connectionId === installation.binding.connectionId &&
        status.appOrigin === installation.appOrigin
      )
        await chrome.storage.local.set({
          [workspaceStatusKey]: { ...status, phase: 'completed', errorCode: null },
        });
    },
    completed: async (record) => {
      const owned = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
      for (const tabId of [record.sourceTabId, record.tabId]) {
        if (![owned.sourceTabId, ...(owned.publicationTabIds ?? [])].includes(tabId)) continue;
        try {
          const tab = await chrome.tabs.get(tabId);
          const address = new URL(tab.url);
          if (
            !tab.incognito &&
            address.origin === 'https://www.kleinanzeigen.de' &&
            ((address.pathname === '/p-anzeige-bearbeiten.html' &&
              address.searchParams.get('adId') === record.externalId) ||
              address.pathname === '/p-anzeige-aufgeben-schritt3.html')
          )
            await chrome.tabs.remove(tabId);
        } catch {
          /* Bereits geschlossene eigene Tabs benötigen keine Bereinigung. */
        }
      }
    },
  });
  async function removeAndVerify(installation, externalId, title) {
    let response;
    try {
      response = await chrome.tabs.sendMessage(listingTabId, {
        type: 'KLEINANZEIGEN_RELISTING_STEP',
        action: 'remove',
        externalId,
        title,
        expectedExternalAccountId: installation.binding.externalAccountId,
        minimumDocumentTime: listingDocumentTime,
      });
    } catch (error) {
      // Eine Navigation kann den Antwortkanal schließen. Niemals den Löschklick wiederholen.
      if (
        !/message (?:channel|port) closed|asynchronous response|receiving end does not exist|could not establish connection|No tab with id|disconnected port/iu.test(
          error?.message ?? '',
        )
      )
        throw error;
    }
    if (response && !response.success) throw stopped(response.errorCode ?? 'deletion_unconfirmed');
    // Auch eine verlorene Antwort ist nur nach frischem, vollständigem Bestandsnachweis bestätigt.
    for (let attempt = 0; attempt < 3; attempt++) {
      const binding = installation.binding;
      const session = await syncRpc(installation, {
        action: 'heartbeat',
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        generation: binding.generation,
      });
      if (
        !session.canPublish ||
        session.externalAccountId !== binding.externalAccountId ||
        session.generation !== binding.generation
      )
        throw stopped('access_revoked');
      const pages = await readAllPublications(installation);
      if (!pages.some((page) => page.items.some((item) => item.externalId === externalId)))
        return { confirmed: true };
      if (attempt < 2) await delay(500);
    }
    throw stopped('deletion_unconfirmed');
  }
  async function deleteListing(request, origin) {
    const installation = await load();
    const binding = installation?.binding;
    if (
      installation?.phase !== 'connected' ||
      installation.appOrigin !== origin ||
      !binding?.canPublish ||
      binding.accountType !== 'private' ||
      Date.parse(binding.expiresAt) <= Date.now() ||
      ['workspaceId', 'connectionId', 'generation'].some((key) => request[key] !== binding[key])
    )
      throw stopped('access_revoked');
    const check = async () => {
      const session = await syncRpc(installation, {
        action: 'heartbeat',
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        generation: binding.generation,
      });
      if (
        !session.canPublish ||
        session.generation !== binding.generation ||
        session.externalAccountId !== binding.externalAccountId ||
        (await readAccount()).identity.externalAccountId !== binding.externalAccountId
      )
        throw stopped('account_changed');
    };
    await check();
    const pages = await readAllPublications(installation);
    const page = pages.find((page) =>
      page.items.some(
        (item) =>
          item.externalId === request.externalId &&
          item.title === request.title &&
          item.state === 'active',
      ),
    );
    if (!page) throw stopped('source_changed');
    await readListingPage(installation, page.pageCursor);
    await check();
    await removeAndVerify(installation, request.externalId, request.title);
    return { externalId: request.externalId, confirmed: true };
  }
  let listingWriteBusy = false;
  let reconciliationPromise;
  let activeRequests = 0;
  let maintenancePromise;
  const maintenanceAlarm = 'flipbase-kleinanzeigen-maintenance';

  async function maintainConnection() {
    if (activeRequests || listingWriteBusy || handoffBusy || formBusy) return;
    const installation = await load();
    const binding = installation?.binding;
    if (installation?.phase !== 'connected' || !binding) return;
    const account = await readAccount();
    if (account.identity?.externalAccountId !== binding.externalAccountId)
      throw stopped('account_changed');
    const result = await syncRpc(installation, {
      action: 'maintain',
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      generation: binding.generation,
      externalAccountId: binding.externalAccountId,
    });
    const session = result?.session;
    if (
      !session ||
      session.workspaceId !== binding.workspaceId ||
      session.connectionId !== binding.connectionId ||
      session.generation !== binding.generation ||
      session.externalAccountId !== binding.externalAccountId ||
      session.canPublish !== binding.canPublish ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now()
    )
      throw stopped('access_revoked');
    const current = await load();
    if (
      current?.secret !== installation.secret ||
      current.binding?.generation !== binding.generation ||
      current.binding.connectionId !== binding.connectionId ||
      current.binding.workspaceId !== binding.workspaceId
    )
      throw stopped('access_revoked');
    await save({ ...current, binding: { ...current.binding, expiresAt: session.expiresAt } });
    const run = result.run;
    if (run !== null) {
      if (
        !run ||
        run.workspaceId !== binding.workspaceId ||
        run.connectionId !== binding.connectionId ||
        run.generation !== binding.generation ||
        !/^[1-9][0-9]{0,18}$/u.test(run.runId ?? '') ||
        !['queued', 'reading'].includes(run.state)
      )
        throw stopped('schema_changed');
      await synchronize(run, installation.appOrigin);
    }
  }

  function runMaintenance() {
    if (maintenancePromise) return maintenancePromise;
    maintenancePromise = maintainConnection()
      .catch(async (error) => {
        // Keine Seiten öffnen oder Freigaben neu anfordern. Beim nächsten Termin erneut prüfen.
        await chrome.storage.local.set({
          kleinanzeigen_maintenance_status: {
            errorCode: error?.code ?? 'interrupted',
            observedAt: new Date().toISOString(),
          },
        });
      })
      .finally(() => {
        maintenancePromise = undefined;
      });
    return maintenancePromise;
  }

  async function scheduleMaintenance() {
    if (!chrome.alarms?.get || !chrome.alarms?.create) return;
    if (!(await chrome.alarms.get(maintenanceAlarm)))
      await chrome.alarms.create(maintenanceAlarm, { delayInMinutes: 1, periodInMinutes: 15 });
  }
  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === maintenanceAlarm) void runMaintenance();
  });
  chrome.runtime.onStartup?.addListener(() => {
    void scheduleMaintenance();
  });
  chrome.runtime.onInstalled?.addListener(() => {
    void scheduleMaintenance();
  });
  void scheduleMaintenance();

  const workspaceStatusKey = 'kleinanzeigen_workspace_status';
  let visibleWriteBusy = false;
  async function listingWrite(operation, visible = true, context = null) {
    if (reconciliationPromise) await reconciliationPromise;
    if (listingWriteBusy) throw new Error('Ein Kleinanzeigen-Auftrag wird bereits ausgeführt.');
    listingWriteBusy = true;
    if (visible) visibleWriteBusy = true;
    const scope = context
      ? {
          externalId: context.externalId,
          workspaceId: context.workspaceId,
          connectionId: context.connectionId,
          appOrigin: context.appOrigin,
        }
      : {};
    try {
      if (visible)
        await chrome.storage.local.set({ [workspaceStatusKey]: { ...scope, phase: 'running' } });
      const result = await operation();
      if (visible)
        await chrome.storage.local.set({
          [workspaceStatusKey]: {
            ...scope,
            phase: result?.outcome && result.outcome !== 'confirmed' ? 'paused' : 'completed',
            errorCode: result?.errorCode ?? null,
          },
        });
      return result;
    } catch (error) {
      if (visible)
        await chrome.storage.local.set({
          [workspaceStatusKey]: {
            ...scope,
            phase: 'paused',
            errorCode: error?.code ?? error?.message ?? 'preparation_failed',
          },
        });
      throw error;
    } finally {
      listingWriteBusy = false;
      if (visible) visibleWriteBusy = false;
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.type === 'KLEINANZEIGEN_WORKSPACE_STATUS') {
      if (
        sender.frameId !== 0 ||
        !sender.tab ||
        sender.tab.incognito ||
        !sender.url?.startsWith('https://www.kleinanzeigen.de/')
      )
        return false;
      Promise.all([
        chrome.storage.local.get(workTabsKey),
        chrome.storage.local.get(workspaceStatusKey),
      ]).then(([values, statuses]) => {
        const tabs = values[workTabsKey] ?? {};
        const owned =
          Object.entries(tabs).some(
            ([key, value]) => key.endsWith('TabId') && value === sender.tab.id,
          ) || tabs.publicationTabIds?.includes(sender.tab.id);
        const status = statuses[workspaceStatusKey];
        respond({
          owned: !!owned,
          phase:
            status?.phase === 'running' && !visibleWriteBusy ? 'paused' : (status?.phase ?? 'idle'),
          errorCode: status?.errorCode ?? null,
        });
      });
      return true;
    }
    if (['KLEINANZEIGEN_PAIRING_READ', 'KLEINANZEIGEN_PAIRING_CONFIRM'].includes(message?.type)) {
      if (
        !pendingConsent ||
        sender.url !== pendingConsent.url ||
        (sender.frameId !== undefined && sender.frameId !== 0) ||
        message.nonce !== pendingConsent.nonce
      )
        return false;
      if (message.type === 'KLEINANZEIGEN_PAIRING_READ') {
        respond({ success: true, result: pendingConsent.details });
        return true;
      }
      if (typeof message.approved !== 'boolean') return false;
      pendingConsent.finish(message.approved);
      respond({ success: true });
      return true;
    }
    if (sender.frameId !== 0) return false;
    let origin;
    try {
      origin = new URL(sender.url).origin;
    } catch {
      return false;
    }
    const request = core.parseRequest(message, origin);
    if (!request) return false;
    if (request.action === 'VERSION') {
      respond({ success: true, result: { version: chrome.runtime.getManifest().version } });
      return true;
    }
    if (request.action === 'OPEN_SETTINGS') {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }).then(
        () => respond({ success: true, result: { opened: true } }),
        () => respond({ success: false, error: 'Öffne chrome://extensions im Browser.' }),
      );
      return true;
    }
    activeRequests++;
    const operation =
      request.action === 'PREPARE_ACCOUNT'
        ? () => runtime.prepare(message, origin)
        : request.action === 'DELETE_LISTING'
          ? () => listingWrite(() => deleteListing(request, origin))
          : request.action === 'RELIST_ATTEMPTS'
            ? () => {
                if (!relistingRuntime)
                  throw new Error('Aktualisiere die Erweiterung für erneutes Inserieren.');
                if (listingWriteBusy) return [];
                reconciliationPromise = listingWrite(
                  () => relistingRuntime.list(request, origin),
                  false,
                ).finally(() => {
                  reconciliationPromise = undefined;
                });
                return reconciliationPromise;
              }
            : request.action === 'RELIST_LISTING'
              ? () =>
                  listingWrite(
                    () => {
                      if (!relistingRuntime)
                        throw new Error('Aktualisiere die Erweiterung für erneutes Inserieren.');
                      return relistingRuntime.run(request, origin);
                    },
                    true,
                    { ...request, appOrigin: origin },
                  )
              : request.action === 'OPEN_LISTING'
                ? () => openListing(request, origin)
                : request.action === 'QUOTA'
                  ? () => refreshQuota(request, origin)
                  : request.action === 'PUBLISH_JOB'
                    ? () => {
                        if (!publicationRuntime)
                          throw new Error('Der Veröffentlichungsadapter ist noch nicht verfügbar.');
                        return listingWrite(() => publicationRuntime.run(request, origin));
                      }
                    : request.action === 'FORM_SCHEMA'
                      ? () => loadFormSchema(request, origin)
                      : request.action === 'SYNC'
                        ? () => synchronize(request, origin)
                        : request.action === 'CONNECT'
                          ? () => runtime.connect(request, origin)
                          : request.action === 'DISCONNECT'
                            ? () => runtime.disconnect(request)
                            : () => runtime.status();
    Promise.resolve()
      .then(async () => {
        if (maintenancePromise) await maintenancePromise;
        return await operation();
      })
      .then(
        (result) =>
          respond({
            success: true,
            result,
            formSchema: !!globalThis.FlipbaseKleinanzeigenForm,
            quota: true,
            assistedListings: true,
            relisting: !!relistingRuntime,
            deletion: true,
            capabilities: {
              accounts: true,
              sync: !!globalThis.FlipbaseKleinanzeigenSync,
              publish:
                !!publicationRuntime &&
                !!globalThis.FlipbaseKleinanzeigenForm &&
                !!globalThis.FlipbaseKleinanzeigenPublicationResults,
            },
          }),
        (error) =>
          respond({
            success: false,
            error:
              error instanceof Error
                ? error.message === 'image_quality_insufficient'
                  ? 'Die Bildquelle ist zu klein oder beschädigt. Verwende die Originalbilder, bevor Du erneut inserierst.'
                  : /message (?:channel|port) closed|asynchronous response|receiving end does not exist|extension context invalidated|could not establish connection|disconnected port/iu.test(
                        error.message,
                      )
                    ? 'Die Verbindung zur Erweiterung wurde unterbrochen. Prüfe den Status Deiner Anzeige, bevor Du die Aktion erneut startest.'
                    : error.message
                : 'Die Kleinanzeigen-Verbindung konnte nicht geprüft werden.',
          }),
      )
      .finally(() => {
        activeRequests--;
      });
    return true;
  });
})();
