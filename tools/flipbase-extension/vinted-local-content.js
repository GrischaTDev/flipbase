(function initVintedLocalContent() {
  const core = globalThis.FlipbaseVintedLocal;
  if (!core || window.top !== window || location.origin !== 'https://www.vinted.de') return;
  let busy = false;
  let overlay;
  let messageLabel;
  let deadline;

  for (const eventType of ['keydown', 'beforeinput', 'paste', 'drop']) {
    document.addEventListener(
      eventType,
      (event) => {
        if (busy && !overlay?.contains(event.target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  function pageState() {
    const intersectsViewport = (rectangle) =>
      rectangle.width > 0 &&
      rectangle.height > 0 &&
      rectangle.bottom > 0 &&
      rectangle.right > 0 &&
      rectangle.top < window.innerHeight &&
      rectangle.left < window.innerWidth;
    const hasVisibleStyle = (element) => {
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          (style.opacity !== '' && Number(style.opacity) === 0)
        )
          return false;
      }
      return true;
    };
    const visible = (element) =>
      element && hasVisibleStyle(element) && intersectsViewport(element.getBoundingClientRect());
    const visibleTexts = [];
    const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT);
    for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      const element = textNode.parentElement;
      const text = textNode.nodeValue?.trim();
      if (
        !element ||
        !text ||
        element.closest('script, style, noscript, template') ||
        overlay?.contains(element) ||
        !hasVisibleStyle(element)
      )
        continue;
      // innerText eines Skripts kann ungerenderte Übersetzungstexte enthalten.
      const range = document.createRange();
      range.selectNodeContents(textNode);
      if ([...range.getClientRects()].some(intersectsViewport)) visibleTexts.push(text);
    }
    return core.detectPageState({
      pathname: location.pathname,
      text: visibleTexts.join('\n'),
      hasPassword: [...document.querySelectorAll('input[type="password"]')].some(visible),
      hasChallenge: [
        ...document.querySelectorAll(
          'iframe[src*="captcha"], iframe[src*="datadome"], #captcha-container, [data-testid="captcha"]',
        ),
      ].some(visible),
    });
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return;
    overlay = document.createElement('section');
    overlay.id = 'flipbase-vinted-work-tab';
    overlay.setAttribute('aria-label', 'Flipbase-Arbeitstab');
    const panel = document.createElement('div');
    panel.className = 'flipbase-vinted-work-panel';
    const heading = document.createElement('strong');
    heading.textContent = 'Für Flipbase reservierter Tab';
    messageLabel = document.createElement('p');
    messageLabel.textContent =
      'Hier werden Deine Vinted-Daten gelesen. Verwende für eigene Aktionen einen anderen Tab.';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Vinted in einem neuen Tab öffnen';
    openButton.addEventListener('click', () =>
      chrome.runtime.sendMessage({ type: 'VINTED_LOCAL_OPEN_USER_TAB' }),
    );
    panel.append(heading, messageLabel, openButton);
    overlay.append(panel);
    document.body.append(overlay);
    overlay.dataset.busy = String(busy);
  }

  function setBusy(isBusy, hint) {
    busy = isBusy;
    ensureOverlay();
    overlay.dataset.busy = String(isBusy);
    messageLabel.textContent =
      hint ??
      (isBusy
        ? 'Deine Daten werden gelesen. Bitte klicke und tippe währenddessen nicht in diesem Tab.'
        : 'Hier werden Deine Vinted-Daten gelesen. Verwende für eigene Aktionen einen anderen Tab.');
  }

  async function readJson(path) {
    core.assertPageReady(pageState());
    if (
      !/^\/api\/v2\/(?:users\/current|wardrobe\/[1-9][0-9]{0,31}\/items\?page=(?:[1-9]|1[0-9]|2[0-5])&per_page=20)$/.test(
        path,
      )
    ) {
      throw new Error('Dieser Vinted-Abruf ist nicht erlaubt.');
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error('Der Vinted-Abgleich dauerte zu lange. Versuche es später erneut.');
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(8_000, remaining)),
    });
    if (response.status === 401)
      throw new Error('Melde Dich zuerst im reservierten Vinted-Tab an.');
    if (response.status === 403)
      throw new Error(
        'Vinted verweigert den Zugriff. Prüfe die Sitzung im reservierten Vinted-Tab.',
      );
    if (response.status === 429)
      throw new Error('Vinted begrenzt gerade die Abrufe. Versuche es später erneut.');
    if (
      !response.ok ||
      new URL(response.url).origin !== location.origin ||
      !response.headers.get('content-type')?.includes('json')
    ) {
      throw new Error(
        'Vinted lieferte keine gültige Datenantwort. Prüfe die Sitzung direkt im Vinted-Tab.',
      );
    }
    const result = await response.json();
    core.assertPageReady(pageState());
    return result;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      !['VINTED_LOCAL_IDENTITY', 'VINTED_LOCAL_SNAPSHOT'].includes(request?.type)
    )
      return false;
    if (busy) {
      sendResponse({ success: false, error: 'In diesem Vinted-Tab läuft bereits ein Abgleich.' });
      return false;
    }
    (async () => {
      try {
        core.assertPageReady(pageState());
        deadline =
          Date.now() +
          Math.min(
            35_000,
            Number.isFinite(request.timeoutMs) && request.timeoutMs > 0
              ? request.timeoutMs
              : 35_000,
          );
        setBusy(true);
        const result =
          request.type === 'VINTED_LOCAL_IDENTITY'
            ? { identity: core.parseIdentity(await readJson('/api/v2/users/current')) }
            : { snapshot: await core.readSnapshot(readJson, request.externalAccountId) };
        setBusy(false);
        sendResponse({ success: true, result });
      } catch (error) {
        const hint =
          error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
            ? error.message
            : 'Der Vinted-Abgleich ist fehlgeschlagen. Prüfe Deine Verbindung und versuche es erneut.';
        setBusy(false, hint);
        sendResponse({ success: false, error: hint });
      }
    })();
    return true;
  });
})();
