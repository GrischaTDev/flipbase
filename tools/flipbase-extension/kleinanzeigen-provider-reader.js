// Lesender Anbieteradapter. Herkunft und Grenzen: docs/research/2026-10-16-kleinanzeigen-provider-contract.md.
(function defineKleinanzeigenReader(root) {
  const ID = /^[1-9][0-9]{0,31}$/;
  const HOSTS = new Set(['www.kleinanzeigen.de', 'kleinanzeigen.de']);
  function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function accountId(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
    return (typeof value === 'string' || typeof value === 'number') && ID.test(String(value))
      ? String(value)
      : null;
  }
  function parseIdentity(input) {
    if (!record(input) || !record(input.user) || !record(input.userProfile)) return null;
    const id = accountId(input.user.userId);
    if (!id || id !== accountId(input.userProfile.userId)) return null;
    const profile = input.userProfile;
    const accountType =
      input.user.accountType === 'PRIVATE' && profile.commercialUser === false
        ? 'private'
        : input.user.accountType !== 'PRIVATE' &&
            typeof input.user.accountType === 'string' &&
            profile.commercialUser === true
          ? 'commercial'
          : null;
    if (
      !accountType ||
      typeof profile.contactName !== 'string' ||
      !profile.contactName.trim() ||
      profile.contactName.length > 120
    )
      return null;
    return { externalAccountId: id, displayName: profile.contactName.trim(), accountType };
  }
  function pageIdentity(doc, path) {
    try {
      const url = new URL(doc.URL);
      if (
        url.protocol !== 'https:' ||
        !HOSTS.has(url.hostname) ||
        url.port ||
        url.pathname !== path
      )
        return null;
      const astro = doc.querySelector('#astroSharedData[type="application/json"]');
      const identity = astro ? parseIdentity(JSON.parse(astro.textContent)) : null;
      const renders = Array.from(doc.querySelectorAll('script:not([src])')).flatMap((e) =>
        Array.from(
          (e.textContent ?? '').matchAll(/window\.myAdsFrontend\.render\(\{([\s\S]*?)\}\);/gu),
        ),
      );
      if (renders.length > 1) return null;
      const legacyId =
        renders.length === 1
          ? accountId(renders[0][1].match(/\buserId:\s*([1-9][0-9]*)\s*(?:,|$)/u)?.[1])
          : null;
      if (astro)
        return identity && (!renders.length || legacyId === identity.externalAccountId)
          ? identity
          : null;
      if (path !== '/m-meine-anzeigen.html' || !legacyId) return null;
      const heading = Array.from(doc.querySelectorAll('h2')).find((e) =>
        /^Profil von\s*/u.test(e.textContent.trim()),
      );
      const privateProfile = Array.from(
        doc.querySelectorAll('main li, main p, #my-ads-frontend li'),
      ).some((e) => e.textContent.trim() === 'Privater Nutzer');
      const displayName = heading?.textContent.trim().replace(/^Profil von\s*/u, '');
      return displayName && privateProfile
        ? { externalAccountId: legacyId, displayName, accountType: 'private' }
        : null;
    } catch {
      return null;
    }
  }
  function readQuota(doc, observedAt) {
    const identity = pageIdentity(doc, '/m-einstellungen.html');
    if (!identity || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt)))
      return null;
    const matches = Array.from(
      (doc.querySelector('main')?.textContent ?? '').matchAll(
        /Du hast in den letzten 30 Tagen\s+(\d+)\s+Anzeigen aufgegeben\./gu,
      ),
    );
    if (matches.length !== 1) return null;
    const used = Number(matches[0][1]);
    if (!Number.isSafeInteger(used) || used < 0) return null;
    return {
      externalAccountId: identity.externalAccountId,
      accountType: identity.accountType,
      used,
      observedAt,
      source: 'account_settings',
    };
  }
  function readPublicationPage(doc) {
    const identity = pageIdentity(doc, '/m-meine-anzeigen.html');
    const list = doc.querySelector('#my-manageitems-adlist');
    const nav = Array.from(doc.querySelectorAll('nav')).find(
      (e) =>
        e.getAttribute('aria-label') === 'Seiten-Navigation' ||
        doc.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim() ===
          'Seiten-Navigation',
    );
    if (
      !identity ||
      !list ||
      !nav ||
      !/Mein Profil und meine Anzeigen/u.test(doc.querySelector('main')?.textContent ?? '')
    )
      return null;
    const next = Array.from(nav.querySelectorAll('button')).filter(
      (e) => e.textContent.trim() === 'Nächste' || e.getAttribute('aria-label') === 'Nächste',
    );
    if (next.length !== 1) return null;
    const current = Array.from(nav.querySelectorAll('[aria-current="page"]'));
    const pageText =
      current.length === 1
        ? current[0].textContent.trim().match(/^Seite\s+([1-9][0-9]{0,3})$/u)
        : null;
    if (!pageText) return null;
    const pageNumber = Number(pageText[1]);
    const items = [];
    const ids = new Set();
    for (const card of list.children) {
      const externalId = accountId(card.getAttribute('data-adid'));
      const link = card.querySelector('h3 a');
      if (
        card.getAttribute('data-testid') !== 'ad-card' ||
        !externalId ||
        ids.has(externalId) ||
        !link
      )
        return null;
      let url;
      try {
        url = new URL(link.getAttribute('href'), doc.URL);
      } catch {
        return null;
      }
      if (
        url.protocol !== 'https:' ||
        !HOSTS.has(url.hostname) ||
        !url.pathname.startsWith('/s-anzeige/') ||
        !url.pathname
          .split('/')
          .at(-1)
          ?.startsWith(externalId + '-')
      )
        return null;
      ids.add(externalId);
      const actions = Array.from(card.querySelectorAll('button')).map((e) => e.textContent.trim());
      const title = link.textContent.trim().replace(/^Anzeige\s+/u, '');
      if (!title) return null;
      // Ein Ablaufdatum ist keine Veröffentlichungszeit. Reservierte/inaktive Zustände nicht erraten.
      items.push({
        externalId,
        title,
        url: url.href,
        publishedAt: null,
        state: actions.includes('Reservieren') ? 'active' : 'unknown',
      });
    }
    const complete = next[0].disabled || next[0].getAttribute('aria-disabled') === 'true';
    if (!complete && (!items.length || pageNumber >= 9999)) return null;
    return {
      identity,
      items,
      pageCursor: 'page:' + pageNumber,
      nextCursor: complete ? null : 'page:' + (pageNumber + 1),
      complete,
    };
  }
  root.FlipbaseKleinanzeigenReader = Object.freeze({
    parseIdentity,
    pageIdentity,
    readQuota,
    readPublicationPage,
  });
})(globalThis);
