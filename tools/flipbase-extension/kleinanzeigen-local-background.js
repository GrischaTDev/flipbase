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
  async function readAccount() {
    const start = Date.now();
    let tab;
    const previous = await load();
    const workTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey];
    const tabId = accountTabId ?? workTabs?.accountTabId ?? previous?.tabId;
    if (Number.isInteger(tabId)) {
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        /* Geschlossener eigener Arbeitstab wird neu angelegt. */
      }
    }
    if (tab?.incognito || tab?.url !== 'https://www.kleinanzeigen.de/m-einstellungen.html')
      tab = undefined;
    if (!tab)
      tab = await chrome.tabs.create({
        url: 'https://www.kleinanzeigen.de/m-einstellungen.html',
        active: false,
      });
    else await chrome.tabs.reload(tab.id);
    accountTabId = tab.id;
    const remembered = (await chrome.storage.local.get(workTabsKey))[workTabsKey] ?? {};
    await chrome.storage.local.set({ [workTabsKey]: { ...remembered, accountTabId } });
    while (Date.now() - start < 15000) {
      try {
        const current = await chrome.tabs.get(tab.id);
        if (current.status === 'complete') {
          const answer = await chrome.tabs.sendMessage(tab.id, {
            type: 'KLEINANZEIGEN_READ_ACCOUNT',
            minimumDocumentTime: start,
          });
          if (answer?.success === true && answer.result?.identity) return answer.result;
        }
      } catch {
        /* Content Script nach Navigation kurz abwarten. */
      }
      await delay(250);
    }
    throw new Error(
      'Melde Dich im Kleinanzeigen-Arbeitstab an und starte die Kontoprüfung erneut.',
    );
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
    const error = new Error(
      code === 'account_changed'
        ? 'Das Kleinanzeigen-Konto hat sich geändert.'
        : code === 'access_revoked'
          ? 'Die lokale Kleinanzeigen-Freigabe ist nicht mehr gültig.'
          : 'Der Kleinanzeigen-Abgleich wurde gestoppt. Prüfe Deine Anmeldung und starte ihn erneut.',
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
    if (tab?.incognito || tab?.url !== address) tab = undefined;
    if (!tab || Number(listingCursor?.slice(5)) > Number(cursor.slice(5))) {
      listingDocumentTime = Date.now();
      if (!tab) {
        const workTabs = (await chrome.storage.local.get(workTabsKey))[workTabsKey];
        if (Number.isInteger(workTabs?.listingTabId)) {
          try {
            const previous = await chrome.tabs.get(workTabs.listingTabId);
            if (!previous.incognito && previous.url === address) tab = previous;
          } catch {
            /* Nur einen ausdrücklich gespeicherten eigenen Tab wiederverwenden. */
          }
        }
      }
      if (tab) await chrome.tabs.reload(tab.id);
      else tab = await chrome.tabs.create({ url: address, active: false });
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
          if (current.status === 'complete') {
            if (current.url !== address) throw stopped('needs_login');
            answer = await chrome.tabs.sendMessage(listingTabId, {
              type: 'KLEINANZEIGEN_READ_PAGE',
              minimumDocumentTime: listingDocumentTime,
              expectedExternalAccountId: installation.binding.externalAccountId,
              expectedCursor: listingCursor,
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
    const account = await readAccount();
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
          tab = await chrome.tabs.create({
            url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html#flipbase-form-read',
            active: false,
          });
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
        readSchema: (path, label) => step('schema', path, label),
        seal: (schema, observedAt) =>
          syncRpc(installation, {
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
  async function publicationResult(installation, job, progress) {
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
              await savePublicationProgress(progress);
            }
            break;
          }
        } catch {
          /* Navigation oder geschlossener eigener Arbeitstab. */
        }
      }
      if (receipt || !owned) break;
      await delay(500);
    }
    if (!receipt) return { outcome: 'outcome_unknown', errorCode: 'publication_unconfirmed' };
    const pages = await readAllPublications(installation);
    if ((await readAccount()).identity.externalAccountId !== job.externalAccountId)
      throw stopped('account_changed');
    return globalThis.FlipbaseKleinanzeigenPublicationResults.confirm(
      job,
      progress.baseline,
      receipt,
      pages,
      Date.now(),
    );
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
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
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
    const operation =
      request.action === 'PREPARE_ACCOUNT'
        ? () => runtime.prepare(message, origin)
        : request.action === 'QUOTA'
          ? () => refreshQuota(request, origin)
          : request.action === 'PUBLISH_JOB'
            ? () => {
                if (!publicationRuntime)
                  throw new Error('Der Veröffentlichungsadapter ist noch nicht verfügbar.');
                return publicationRuntime.run(request, origin);
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
      .then(operation)
      .then(
        (result) =>
          respond({
            success: true,
            result,
            formSchema: !!globalThis.FlipbaseKleinanzeigenForm,
            quota: true,
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
                ? error.message
                : 'Die Kleinanzeigen-Verbindung konnte nicht geprüft werden.',
          }),
      );
    return true;
  });
})();
