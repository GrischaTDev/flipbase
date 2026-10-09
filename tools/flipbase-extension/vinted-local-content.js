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
        overlay.focus({ preventScroll: true });
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
      overlay.focus({ preventScroll: true });
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
        document.getElementById('flipbase-vinted-account')?.contains(element) ||
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
    globalThis.FlipbaseVintedAccount?.remove();
    document.title = 'Flipbase · Vinted-Arbeitstab';
    let tabIcon = document.head.querySelector('[data-flipbase-work-tab-icon]');
    if (!tabIcon) {
      tabIcon = document.createElement('link');
      tabIcon.rel = 'icon';
      tabIcon.dataset.flipbaseWorkTabIcon = '';
      tabIcon.href = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fcc601"/><path d="M10 8h14v4H14v4h8v4h-8v6h-4z" fill="#171717"/></svg>')}`;
      document.head.append(tabIcon);
    }
    if (overlay?.isConnected) return;
    overlay = document.createElement('section');
    overlay.id = 'flipbase-vinted-work-tab';
    overlay.tabIndex = -1;
    overlay.setAttribute('aria-label', 'Flipbase-Arbeitstab');
    overlay.setAttribute('role', 'region');
    const panel = document.createElement('div');
    panel.className = 'flipbase-vinted-work-panel';
    const logo = document.createElement('img');
    logo.className = 'flipbase-vinted-work-logo';
    logo.src = chrome.runtime.getURL('images/flipbase-mark.png');
    logo.alt = 'Flipbase';
    logo.width = 48;
    logo.height = 48;
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
    panel.append(logo, heading, messageLabel, openButton);
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

  globalThis.FlipbaseVintedWorkTab = { reserve: () => setBusy(false), pageState };

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
      !/^\/api\/v2\/(?:users\/current|wardrobe\/[1-9][0-9]{0,31}\/items\?page=(?:[1-9]|1[0-9]|2[0-5])&per_page=20|inbox\?page=(?:[1-9]|1[0-9]|20)&per_page=20|conversations\/[1-9][0-9]{0,31}|transactions\/[1-9][0-9]{0,31})$/.test(
        path,
      ) &&
      !/^\/web\/api\/notifications\/notifications\?page=[12]&per_page=100&mark_as_read=false$/.test(
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
      throw providerError(response);
    }
    if (response.status === 403) throw providerError(response);
    if (response.status === 429) throw providerError(response);
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
    if (sender.id === chrome.runtime.id && request?.type === 'VINTED_LOCAL_READY') {
      sendResponse({ success: true, ready: true });
      return false;
    }
    if (
      sender.id !== chrome.runtime.id ||
      ![
        'VINTED_LOCAL_IDENTITY',
        'VINTED_LOCAL_SNAPSHOT',
        'VINTED_LOCAL_INBOX',
        'VINTED_LOCAL_SEND',
        'VINTED_LOCAL_NEGOTIATION_SEND',
        'VINTED_LOCAL_FAVORITES',
        'VINTED_LOCAL_FAVORITE_SEND',
        'VINTED_LOCAL_FAVORITE_OFFER_PREPARE',
        'VINTED_LOCAL_FAVORITE_OFFER_SEND',
      ].includes(request?.type)
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
            : request.type === 'VINTED_LOCAL_NEGOTIATION_SEND'
              ? {
                  outcome: await globalThis.FlipbaseVintedNegotiation.send(
                    {
                      read: readJson,
                      write: writeProvider,
                      csrf: globalThis.FlipbaseVintedMessages.readCsrfToken(document),
                      authorize: async () => {
                        core.assertPageReady(interruptedPageState ?? pageState());
                        const result = await chrome.runtime.sendMessage({
                          type: 'VINTED_LOCAL_NEGOTIATION_CHECK',
                          jobId: request.claim.jobId,
                          claimToken: request.claim.claimToken,
                        });
                        if (result?.active !== true)
                          throw new Error('Verhandlungsfreigabe abgelaufen.');
                      },
                    },
                    request.externalAccountId,
                    request.claim,
                    globalThis.FlipbaseVintedMessages,
                  ),
                }
              : request.type === 'VINTED_LOCAL_FAVORITES'
                ? {
                    events: await globalThis.FlipbaseVintedFavorites.read(
                      readJson,
                      request.externalAccountId,
                    ),
                  }
                : [
                      'VINTED_LOCAL_FAVORITE_OFFER_PREPARE',
                      'VINTED_LOCAL_FAVORITE_OFFER_SEND',
                    ].includes(request.type)
                  ? {
                      outcome: await globalThis.FlipbaseVintedFavorites[
                        request.type === 'VINTED_LOCAL_FAVORITE_OFFER_PREPARE'
                          ? 'prepareOffer'
                          : 'sendOffer'
                      ](
                        {
                          read: readJson,
                          write: writeProvider,
                          csrf: globalThis.FlipbaseVintedMessages.readCsrfToken(document),
                        },
                        request.externalAccountId,
                        request.command,
                      ),
                    }
                  : request.type === 'VINTED_LOCAL_FAVORITE_SEND'
                    ? {
                        outcome: await globalThis.FlipbaseVintedFavorites.send(
                          {
                            read: readJson,
                            write: writeProvider,
                            csrf: globalThis.FlipbaseVintedMessages.readCsrfToken(document),
                          },
                          request.externalAccountId,
                          request.command,
                          globalThis.FlipbaseVintedMessages,
                        ),
                      }
                    : request.type === 'VINTED_LOCAL_SEND'
                      ? {
                          outcome: await globalThis.FlipbaseVintedMessages.send(
                            {
                              read: readJson,
                              write: writeProvider,
                              csrf: globalThis.FlipbaseVintedMessages.readCsrfToken(document),
                            },
                            request.externalAccountId,
                            request.command,
                          ),
                        }
                      : request.type === 'VINTED_LOCAL_INBOX'
                        ? {
                            batch: await (
                              request.state.detail ? core.readInboxDetail : core.readInbox
                            )(readJson, request.externalAccountId, request.state),
                          }
                        : {
                            snapshot: await core.readSnapshot(readJson, request.externalAccountId),
                          };
        setBusy(false);
        sendResponse({ success: true, result });
      } catch (error) {
        const hint =
          error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
            ? error.message
            : 'Der Vinted-Abgleich ist fehlgeschlagen. Prüfe Deine Verbindung und versuche es erneut.';
        setBusy(false, hint, interruptedPageState ?? pageState());
        sendResponse({
          success: false,
          error: hint,
          code: error.code ?? interruptedPageState,
          retryAfter: error.retryAfter,
        });
      }
    })();
    return true;
  });

  function providerError(response) {
    const error = new Error('Vinted konnte den Vorgang nicht bestätigen. Prüfe Deine Sitzung.');
    error.httpStatus = response.status;
    error.code =
      response.status === 429
        ? 'rate_limited'
        : response.status === 401
          ? 'login_required'
          : response.status === 403
            ? 'interaction_required'
            : 'provider_unavailable';
    if (response.status === 429) {
      const raw = response.headers.get('Retry-After');
      const requested =
        raw && /^\d{1,6}$/.test(raw.trim())
          ? Date.now() + Number(raw) * 1_000
          : Date.parse(raw ?? '');
      error.retryAfter =
        Number.isFinite(requested) &&
        requested > Date.now() &&
        requested <= Date.now() + 604_800_000
          ? requested
          : Date.now() + 300_000;
    }
    return error;
  }

  async function writeProvider(path, request) {
    const method = request.method ?? 'POST';
    const offerDecision =
      /^\/api\/v2\/transactions\/[1-9][0-9]{0,31}\/offer_requests\/[1-9][0-9]{0,31}\/(?:accept|reject)$/.test(
        path,
      );
    const post =
      /^\/api\/v2\/(?:photos|conversations|conversations\/[1-9][0-9]{0,31}\/replies|transactions\/[1-9][0-9]{0,31}\/offers)$/.test(
        path,
      );
    if (!(
      (method === 'POST' && post) ||
      (method === 'PUT' && offerDecision && request.body === undefined)
    ))
      throw new Error('Dieser Vinted-Aufruf ist nicht erlaubt.');
    core.assertPageReady(interruptedPageState ?? pageState());
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Der Vorgang dauerte zu lange.');
    const response = await fetch(path, {
      method,
      credentials: 'include',
      redirect: 'error',
      headers: {
        'X-Csrf-Token': request.csrf,
        ...(request.json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: request.body,
      signal: AbortSignal.timeout(Math.min(8_000, remaining)),
    });
    if (!response.ok) throw providerError(response);
    if (
      new URL(response.url).origin !== location.origin ||
      !response.headers.get('content-type')?.includes('json')
    )
      throw new Error('Vinted bestätigt den Versand nicht.');
    core.assertPageReady(interruptedPageState ?? pageState());
    return response.json();
  }
})();
