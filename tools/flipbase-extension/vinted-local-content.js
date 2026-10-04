(function initVintedLocalContent() {
  const core = globalThis.FlipbaseVintedLocal;
  if (!core || window.top !== window || location.origin !== 'https://www.vinted.de') return;
  let busy = false;
  let overlay;
  let messageLabel;
  let deadline;
  let protectedTab = false;
  let sessionBlocked = false;
  let interruptedPageState;
  let requiresLoginRetry = false;
  const disabledElements = new Map();

  for (const eventType of [
    'pointerdown',
    'pointerup',
    'click',
    'dblclick',
    'touchstart',
    'keydown',
    'beforeinput',
    'paste',
    'drop',
  ]) {
    document.addEventListener(
      eventType,
      (event) => {
        if (protectedTab && !overlay?.contains(event.target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        if (protectedTab && eventType === 'keydown' && event.key === 'Tab') {
          event.preventDefault();
          overlay.querySelector('button').focus();
        }
      },
      true,
    );
  }

  document.addEventListener(
    'focusin',
    (event) => {
      if (protectedTab && !overlay?.contains(event.target)) {
        overlay.querySelector('button').focus();
      }
    },
    true,
  );

  function disablePageElements() {
    for (const element of document.body.children) {
      if (element === overlay || disabledElements.has(element)) continue;
      disabledElements.set(element, element.getAttribute('inert'));
      element.setAttribute('inert', '');
    }
  }

  function updateProtection(state) {
    if (state === 'session_blocked') sessionBlocked = true;
    const shouldProtect =
      sessionBlocked ||
      !['login_required', 'verification_required', 'interaction_required'].includes(state);
    if (shouldProtect === protectedTab) {
      if (protectedTab) disablePageElements();
      return;
    }
    protectedTab = shouldProtect;
    overlay.dataset.protected = String(protectedTab);
    overlay.setAttribute('role', protectedTab ? 'dialog' : 'region');
    if (protectedTab) {
      overlay.setAttribute('aria-modal', 'true');
      disablePageElements();
      overlay.querySelector('button').focus();
    } else {
      overlay.removeAttribute('aria-modal');
      for (const [element, originalAttribute] of disabledElements) {
        if (originalAttribute === null) element.removeAttribute('inert');
        else element.setAttribute('inert', originalAttribute);
      }
      disabledElements.clear();
    }
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
    overlay.setAttribute('role', 'region');
    const panel = document.createElement('div');
    panel.className = 'flipbase-vinted-work-panel';
    const heading = document.createElement('strong');
    heading.id = 'flipbase-vinted-work-heading';
    heading.textContent = 'Für Flipbase reservierter Tab';
    overlay.setAttribute('aria-labelledby', heading.id);
    messageLabel = document.createElement('p');
    messageLabel.textContent =
      'Dieser Tab ist für Flipbase reserviert. Schließe ihn nicht. Verwende Vinted für eigene Aktionen in einem neuen Tab.';
    messageLabel.setAttribute('aria-live', 'polite');
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
    overlay.dataset.protected = String(protectedTab);
  }

  function setBusy(isBusy, hint, state = pageState()) {
    busy = isBusy;
    ensureOverlay();
    overlay.dataset.busy = String(isBusy);
    messageLabel.textContent =
      hint ??
      (isBusy
        ? 'Deine Daten werden gelesen. Bitte klicke und tippe währenddessen nicht in diesem Tab.'
        : 'Dieser Tab ist für Flipbase reserviert. Schließe ihn nicht. Verwende Vinted für eigene Aktionen in einem neuen Tab.');
    updateProtection(state);
  }

  const pageObserver = new window.MutationObserver((mutations) => {
    if (!overlay?.isConnected || mutations.every((mutation) => overlay.contains(mutation.target)))
      return;
    const observedState = pageState();
    const state =
      requiresLoginRetry && observedState === 'ready' ? 'login_required' : observedState;
    if (state !== 'ready') {
      if (busy) interruptedPageState = state;
      try {
        core.assertPageReady(state);
      } catch (error) {
        messageLabel.textContent = error.message;
      }
    } else if (!protectedTab && !sessionBlocked) {
      messageLabel.textContent =
        'Die manuelle Prüfung ist abgeschlossen. Starte den Abgleich in Flipbase erneut.';
    }
    updateProtection(state);
  });
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'src', 'type'],
  });

  async function readJson(path) {
    core.assertPageReady(
      interruptedPageState ?? (sessionBlocked ? 'session_blocked' : pageState()),
    );
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
    if (response.status === 401) {
      interruptedPageState = 'login_required';
      requiresLoginRetry = true;
      throw new Error('Melde Dich zuerst im reservierten Vinted-Tab an.');
    }
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
    core.assertPageReady(
      interruptedPageState ?? (sessionBlocked ? 'session_blocked' : pageState()),
    );
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
        interruptedPageState = undefined;
        requiresLoginRetry = false;
        core.assertPageReady(sessionBlocked ? 'session_blocked' : pageState());
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
        setBusy(false, hint, interruptedPageState ?? pageState());
        sendResponse({ success: false, error: hint });
      }
    })();
    return true;
  });
})();
