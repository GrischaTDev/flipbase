// Eigene Anbieterinformationen lesen und ausschließlich die geprüfte Seitennavigation bedienen.
(function initKleinanzeigenLocalContent() {
  const reader = globalThis.FlipbaseKleinanzeigenReader;
  if (!reader || window.top !== window) return;
  let accountRead;
  async function readAccount(requireQuota) {
    const address = 'https://www.kleinanzeigen.de/m-einstellungen.html';
    const response = await fetch(address, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (
      !response.ok ||
      response.url !== address ||
      !response.headers.get('content-type')?.includes('text/html')
    )
      throw new Error('needs_login');
    const html = await response.text();
    if (html.length > 2000000) throw new Error('schema_changed');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const identity = reader.pageIdentity(doc, '/m-einstellungen.html', address);
    if (!identity) throw new Error('needs_login');
    const quota = reader.readQuota(doc, new Date().toISOString(), address);
    if (!requireQuota || quota) return { identity, quota };
    // Manche Anbieterfassungen laden den Zähler erst im Browser nach. Kein eigener Tab,
    // keine Formularaktion: denselben Ursprung kurz eingebettet laden und danach entfernen.
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Kleinanzeigen-Kontingent prüfen';
    frame.src = address;
    document.body.append(frame);
    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const current = frame.contentDocument;
        const freshIdentity = current && reader.pageIdentity(current, '/m-einstellungen.html');
        if (freshIdentity && freshIdentity.externalAccountId !== identity.externalAccountId)
          throw new Error('account_changed');
        const freshQuota = current && reader.readQuota(current, new Date().toISOString());
        if (freshIdentity && freshQuota) return { identity: freshIdentity, quota: freshQuota };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { identity, quota: null };
    } finally {
      frame.remove();
    }
  }
  async function enrichPublicationDays(page) {
    // Nur beim ausdruecklichen Abgleich: begrenzte parallele GETs, kein Formular und kein Upload.
    const signal = AbortSignal.timeout(8000);
    let nextIndex = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, page.items.length) }, async () => {
        while (nextIndex < page.items.length && !signal.aborted) {
          const item = page.items[nextIndex++];
          try {
            const url = new URL(item.url);
            if (url.origin !== new URL(document.URL).origin) continue;
            const response = await fetch(url.href, {
              method: 'GET',
              credentials: 'same-origin',
              redirect: 'error',
              signal,
            });
            if (
              !response.ok ||
              response.url !== url.href ||
              !response.headers.get('content-type')?.includes('text/html')
            )
              continue;
            const html = await response.text();
            if (html.length > 2000000) continue;
            const detail = reader.readPublicationDetails(
              new DOMParser().parseFromString(html, 'text/html'),
              item,
              response.url,
            );
            if (detail) item.publishedOn = detail.publishedOn;
          } catch {
            /* Fehlende Detailangaben entwerten keine vollstaendige eigene Anzeigenliste. */
          }
        }
      }),
    );
    return page;
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      ![
        'KLEINANZEIGEN_READ_ACCOUNT',
        'KLEINANZEIGEN_READ_PAGE',
        'KLEINANZEIGEN_ADVANCE_PAGE',
      ].includes(message?.type)
    )
      return false;
    const minimum = message.minimumDocumentTime;
    const now = Date.now();
    const maxAge = message.type === 'KLEINANZEIGEN_READ_ACCOUNT' ? 60000 : 900000;
    const stop = (errorCode) => {
      respond({ success: false, errorCode });
      return false;
    };
    if (
      typeof minimum !== 'number' ||
      !Number.isFinite(minimum) ||
      minimum > now + 1000 ||
      minimum < now - maxAge ||
      (performance.timeOrigin < minimum &&
        !(
          message.type === 'KLEINANZEIGEN_READ_ACCOUNT' &&
          new URL(document.URL).pathname === '/m-meine-anzeigen.html'
        ))
    )
      return stop('not_ready');
    if (message.type === 'KLEINANZEIGEN_READ_ACCOUNT') {
      if (new URL(document.URL).pathname === '/m-meine-anzeigen.html') {
        if (!accountRead)
          accountRead = readAccount(message.requireQuota === true).finally(() => {
            accountRead = undefined;
          });
        accountRead
          .then((result) => respond({ success: true, result }))
          .catch((error) =>
            respond({
              success: false,
              errorCode: ['account_changed', 'needs_login'].includes(error.message)
                ? error.message
                : 'schema_changed',
            }),
          );
        return true;
      }
      const identity = reader.pageIdentity(document, '/m-einstellungen.html');
      if (!identity) return stop('needs_login');
      respond({
        success: true,
        result: { identity, quota: reader.readQuota(document, new Date(now).toISOString()) },
      });
      return false;
    }
    if (
      typeof message.expectedExternalAccountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/u.test(message.expectedExternalAccountId) ||
      typeof message.expectedCursor !== 'string' ||
      !/^page:[1-9][0-9]{0,3}$/u.test(message.expectedCursor)
    )
      return stop('unsupported');
    const identity = reader.pageIdentity(document, '/m-meine-anzeigen.html');
    if (!identity) return stop('needs_login');
    if (identity.externalAccountId !== message.expectedExternalAccountId)
      return stop('account_changed');
    const page = reader.readPublicationPage(document);
    if (!page || page.pageCursor !== message.expectedCursor) return stop('not_ready');
    if (message.type === 'KLEINANZEIGEN_READ_PAGE') {
      if (message.includeDetails === true) {
        enrichPublicationDays(page)
          .then((result) => {
            if (
              reader.pageIdentity(document, '/m-meine-anzeigen.html')?.externalAccountId !==
              message.expectedExternalAccountId
            )
              respond({ success: false, errorCode: 'account_changed' });
            else respond({ success: true, result });
          })
          .catch(() => respond({ success: false, errorCode: 'schema_changed' }));
        return true;
      }
      respond({ success: true, result: page });
      return false;
    }
    if (page.complete || page.nextCursor !== message.nextCursor) return stop('unsupported');
    const navigation = Array.from(document.querySelectorAll('nav')).filter(
      (node) =>
        node.getAttribute('aria-label') === 'Seiten-Navigation' ||
        document.getElementById(node.getAttribute('aria-labelledby'))?.textContent.trim() ===
          'Seiten-Navigation',
    );
    if (navigation.length !== 1) return stop('unsupported');
    const next = Array.from(navigation[0].querySelectorAll('button')).filter(
      (node) =>
        node.getAttribute('aria-label') === 'Nächste' || node.textContent.trim() === 'Nächste',
    );
    if (next.length !== 1 || next[0].disabled || next[0].getAttribute('aria-disabled') === 'true')
      return stop('unsupported');
    next[0].click();
    respond({ success: true, result: { moving: true } });
    return false;
  });
})();
