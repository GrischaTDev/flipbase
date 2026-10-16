// Eigene Anbieterinformationen lesen und ausschließlich die geprüfte Seitennavigation bedienen.
(function initKleinanzeigenLocalContent() {
  const reader = globalThis.FlipbaseKleinanzeigenReader;
  if (!reader || window.top !== window) return;
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
      performance.timeOrigin < minimum
    )
      return stop('not_ready');
    if (message.type === 'KLEINANZEIGEN_READ_ACCOUNT') {
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
