// Ergebnis nur aus konkretem Ziel im eigenen Veröffentlichungstab und dem vollständig gelesenen eigenen Konto.
(function definePublicationResults(root) {
  const unknown = () => ({ outcome: 'outcome_unknown', errorCode: 'publication_unconfirmed' });
  function target(address) {
    try {
      const url = new URL(address);
      const match = /^\/s-anzeige\/[^/]+\/([1-9][0-9]{0,31})-[0-9]+-[0-9]+$/u.exec(url.pathname);
      return url.origin === 'https://www.kleinanzeigen.de' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        match
        ? { externalId: match[1], url: url.href }
        : null;
    } catch {
      return null;
    }
  }
  function receiptUrl(address) {
    try {
      const url = new URL(address);
      return (
        url.origin === 'https://www.kleinanzeigen.de' &&
        !url.username &&
        !url.password &&
        !url.hash &&
        (!!target(address) ||
          (/^\/p-anzeige-aufgeben[-a-z0-9.]*$/u.test(url.pathname) &&
            url.pathname !== '/p-anzeige-aufgeben-schritt2.html'))
      );
    } catch {
      return false;
    }
  }
  function confirm(job, baseline, receipt, pages, now) {
    if (
      !Array.isArray(baseline) ||
      !receipt ||
      !receiptUrl(receipt.url) ||
      !Array.isArray(receipt.candidates) ||
      receipt.candidates.length > 200 ||
      !Array.isArray(pages) ||
      !pages.length ||
      pages.at(-1).complete !== true ||
      pages.some(
        (page) =>
          page.identity?.externalAccountId !== job.externalAccountId ||
          page.identity.accountType !== 'private' ||
          !Array.isArray(page.items),
      )
    )
      return unknown();
    const before = new Set(baseline);
    const targets = receipt.candidates.map(target).filter(Boolean);
    const matches = pages
      .flatMap((page) => page.items)
      .filter(
        (item) =>
          !before.has(item.externalId) &&
          item.title === job.content.title.trim() &&
          item.state === 'active' &&
          targets.some((value) => value.externalId === item.externalId && value.url === item.url),
      );
    if (matches.length !== 1) return unknown();
    const item = matches[0];
    return {
      outcome: 'confirmed',
      externalAccountId: job.externalAccountId,
      externalId: item.externalId,
      providerState: 'active',
      verifiedAt: new Date(now).toISOString(),
      url: item.url,
    };
  }
  function readReceipt(doc) {
    if (!receiptUrl(doc.URL) || doc.getElementById('ad-title')) return null;
    const links = Array.from(doc.querySelectorAll('a[href]'))
      .map((link) => target(link.href))
      .filter(Boolean);
    const direct = target(doc.URL);
    if (direct) links.push(direct);
    const candidates = [...new Set(links.map((value) => value.url))];
    return candidates.length && candidates.length <= 200 ? { url: doc.URL, candidates } : null;
  }
  root.FlipbaseKleinanzeigenPublicationResults = Object.freeze({ confirm, readReceipt });
  if (typeof window === 'undefined' || !root.chrome?.runtime?.onMessage || window.top !== window)
    return;
  // Die Erfolgsmeldung auch bei manueller Veröffentlichung sichern, bevor der Nutzer weiternavigiert.
  document.addEventListener(
    'click',
    (event) => {
      const button = root.FlipbaseKleinanzeigenPublicationReader?.postingButton(document);
      if (!button || !button.contains(event.target)) return;
      try {
        const marker = JSON.parse(
          sessionStorage.getItem('flipbase_kleinanzeigen_attempt') ?? 'null',
        );
        if (marker?.attemptId && marker.jobId)
          sessionStorage.setItem(
            'flipbase_kleinanzeigen_attempt',
            JSON.stringify({
              ...marker,
              submittedAt: new Date().toISOString(),
            }),
          );
      } catch {
        /* Ohne lokale Markierung wird kein Datum erfunden. */
      }
    },
    true,
  );
  function rememberReceipt() {
    try {
      const marker = JSON.parse(sessionStorage.getItem('flipbase_kleinanzeigen_attempt') ?? 'null');
      const receipt = readReceipt(document);
      if (marker?.attemptId && marker.jobId && receipt)
        sessionStorage.setItem(
          'flipbase_kleinanzeigen_receipt',
          JSON.stringify({
            ...marker,
            receipt: {
              ...receipt,
              ...(marker.submittedAt ? { submittedAt: marker.submittedAt } : {}),
            },
          }),
        );
    } catch {
      /* Eine fehlende lokale Bestätigung bleibt ein unklarer Ausgang. */
    }
  }
  rememberReceipt();
  if (root.MutationObserver) {
    const observer = new MutationObserver(rememberReceipt);
    observer.observe(document.body, { childList: true, subtree: true });
    root.setTimeout(() => observer.disconnect(), 120000);
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      message?.type !== 'KLEINANZEIGEN_READ_RECEIPT' ||
      !Number.isFinite(message.minimumDocumentTime) ||
      performance.timeOrigin < message.minimumDocumentTime ||
      message.minimumDocumentTime > Date.now() + 1000
    )
      return false;
    let marker;
    try {
      marker = JSON.parse(sessionStorage.getItem('flipbase_kleinanzeigen_attempt') ?? 'null');
    } catch {
      return false;
    }
    if (
      marker?.jobId !== message.jobId ||
      marker.attemptId !== message.attemptId ||
      marker.minimumDocumentTime !== message.minimumDocumentTime
    )
      return false;
    rememberReceipt();
    let receipt = readReceipt(document);
    if (!receipt) {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem('flipbase_kleinanzeigen_receipt') ?? 'null',
        );
        if (
          saved?.attemptId === marker.attemptId &&
          saved.jobId === marker.jobId &&
          saved.minimumDocumentTime === marker.minimumDocumentTime
        )
          receipt = saved.receipt;
      } catch {
        /* Nur exakt zum Versuch passende Belege verwenden. */
      }
    }
    if (receipt && !receipt.submittedAt && typeof marker.submittedAt === 'string')
      receipt = { ...receipt, submittedAt: marker.submittedAt };
    respond({ success: true, result: { owned: true, receipt } });
    return true;
  });
})(globalThis);
