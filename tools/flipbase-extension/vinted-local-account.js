(function initVintedLocalAccount() {
  const core = globalThis.FlipbaseVintedLocal;
  if (!core || window.top !== window || location.origin !== 'https://www.vinted.de') return;
  let container;
  let panel;
  let backdrop;
  let toggle;
  let content;
  let returnFocus;
  let revision = 0;
  let removed = false;
  const disabledElements = new Map();
  const states = {
    ready: ['Dieses Browserprofil ist verbunden', 'Live-Abrufe sind für dieses Konto bereit.'],
    unbound: [
      'Noch nicht mit Flipbase verknüpft',
      'Öffne Flipbase in diesem Browserprofil und bestätige dort Dein Vinted-Konto.',
    ],
    expired: [
      'Freigabe erneuern',
      'Die lokale Freigabe ist abgelaufen. Erneuere sie am bestehenden Konto in Flipbase.',
    ],
    revoked: [
      'Nicht mehr freigegeben',
      'Die lokale Freigabe wurde widerrufen. Deine gespeicherten Daten bleiben in Flipbase.',
    ],
    paused: ['Pausiert', 'Setze die lokale Verbindung bewusst in Flipbase fort.'],
    login_required: [
      'Bei Vinted anmelden',
      'Melde Dich bei Vinted an und prüfe die Verbindung danach erneut.',
    ],
    identity_mismatch: [
      'Anderes Vinted-Konto aktiv',
      'Dieses Browserprofil ist mit einem anderen Konto verknüpft. Verwende für das andere Konto ein separates Browserprofil.',
    ],
    permission_required: [
      'Websitezugriff fehlt',
      'Erlaube der Flipbase-Erweiterung in Chrome den Zugriff auf https://www.vinted.de.',
    ],
    challenge_required: [
      'Prüfung bei Vinted abschließen',
      'Schließe die Mensch-Prüfung oder SMS-Bestätigung bei Vinted bewusst ab.',
    ],
    blocked: ['Vinted-Konto gesperrt', 'Prüfe die Sperrmeldung direkt bei Vinted.'],
    unavailable: [
      'Verbindung erneut prüfen',
      'Die aktuelle Betriebsbereitschaft konnte nicht bestätigt werden.',
    ],
  };
  const uuid = (identifier) =>
    typeof identifier === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  function restorePage() {
    for (const [element, originalAttribute] of disabledElements) {
      if (originalAttribute === null) element.removeAttribute('inert');
      else element.setAttribute('inert', originalAttribute);
    }
    disabledElements.clear();
  }

  function remove() {
    removed = true;
    revision++;
    restorePage();
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('focusin', containFocus);
    container?.remove();
  }
  globalThis.FlipbaseVintedAccount = { remove };

  async function readStatus() {
    const response = await chrome.runtime.sendMessage({ type: 'VINTED_LOCAL_ACCOUNT_STATUS' });
    if (response?.success !== true)
      throw new Error('Die Erweiterung ist nicht erreichbar. Lade Vinted neu.');
    return response.result;
  }

  function addParagraph(text, className) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    if (className) paragraph.className = className;
    content.append(paragraph);
    return paragraph;
  }

  function addLink(text, origin, path, isAccountLink = false) {
    const link = document.createElement('a');
    link.textContent = text;
    link.href = `${origin}${path}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (isAccountLink) link.dataset.accountLink = '';
    content.append(link);
  }

  function validBinding(binding) {
    return (
      binding &&
      core.isAppOrigin(binding.appOrigin) &&
      uuid(binding.workspaceId) &&
      uuid(binding.connectionId) &&
      typeof binding.externalAccountId === 'string' &&
      /^[1-9][0-9]{0,31}$/.test(binding.externalAccountId)
    );
  }

  function checkedReadiness(readiness, binding) {
    return (
      readiness &&
      Object.hasOwn(states, readiness.state) &&
      typeof readiness.version === 'string' &&
      readiness.version.length > 0 &&
      typeof readiness.checkedAt === 'string' &&
      Number.isFinite(Date.parse(readiness.checkedAt)) &&
      validBinding(binding) &&
      readiness.workspaceId === binding.workspaceId &&
      readiness.connectionId === binding.connectionId &&
      readiness.externalAccountId === binding.externalAccountId
    );
  }

  function showStoredAccount(binding) {
    if (!binding) return;
    addParagraph(
      `Vinted: ${binding.username || 'Gespeichertes Konto'}`,
      'flipbase-vinted-account-identity',
    );
    addParagraph('Lokal verknüpft · gespeicherte Zuordnung', 'flipbase-vinted-account-assignment');
  }

  function showRuntime(binding, readiness) {
    content.replaceChildren();
    showStoredAccount(binding);
    const isChecked = checkedReadiness(readiness, binding);
    const state = isChecked ? readiness.state : 'unavailable';
    const [label, explanation] = states[state];
    const statusLabel = addParagraph(label, 'flipbase-vinted-account-status');
    statusLabel.dataset.state = state;
    addParagraph(explanation);
    if (
      ['login_required', 'challenge_required', 'permission_required', 'unavailable'].includes(state)
    ) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'flipbase-vinted-account-recheck';
      retry.textContent = 'Erneut prüfen';
      retry.addEventListener('click', () => showAccount(true));
      content.append(retry);
    }
    if (isChecked) {
      const paragraph = addParagraph('Zuletzt geprüft: ', 'flipbase-vinted-account-checked');
      const time = document.createElement('time');
      time.dateTime = readiness.checkedAt;
      time.textContent = new Date(readiness.checkedAt).toLocaleString('de-DE');
      paragraph.append(time);
    }
    const origin = validBinding(binding) ? binding.appOrigin : 'https://app.flipbase.de';
    if (validBinding(binding)) {
      const scope = `connectionId=${binding.connectionId}&workspaceId=${binding.workspaceId}`;
      addLink(
        'Verbindung in Flipbase prüfen',
        origin,
        `/marketplaces/vinted/accounts?${scope}`,
        true,
      );
      if (isChecked && !['identity_mismatch', 'unavailable', 'unbound'].includes(state)) {
        addLink(
          'Favoritenmeldungen & Nachrichten einstellen',
          origin,
          `/marketplaces/vinted/accounts?settings=${binding.connectionId}&workspaceId=${binding.workspaceId}`,
        );
        addLink(
          'Lokale Freigabe trennen',
          origin,
          `/marketplaces/vinted/accounts?disconnect=${binding.connectionId}&workspaceId=${binding.workspaceId}`,
        );
        addParagraph(
          'Beim Trennen bleiben Deine Flipbase-Daten und Dein Vinted-Login erhalten.',
          'flipbase-vinted-account-note',
        );
      }
    }
    addLink('Konten & Einstellungen', origin, '/marketplaces/vinted/accounts');
  }

  async function showUnboundAccount(currentRevision) {
    core.assertPageReady(globalThis.FlipbaseVintedWorkTab?.pageState() ?? 'ready');
    const response = await fetch('/api/v2/users/current', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401)
      throw new Error('Melde Dich bei Vinted an und öffne Flipbase danach erneut.');
    if (response.status === 403)
      throw new Error('Schließe die Prüfung bei Vinted ab und öffne Flipbase danach erneut.');
    if (response.status === 429)
      throw new Error('Vinted begrenzt die Abrufe. Versuche es später erneut.');
    if (
      !response.ok ||
      new URL(response.url).origin !== location.origin ||
      !response.headers.get('content-type')?.includes('json')
    )
      throw new Error('Dein aktuelles Vinted-Konto konnte nicht bestätigt werden.');
    const identity = core.parseIdentity(await response.json());
    core.assertPageReady(globalThis.FlipbaseVintedWorkTab?.pageState() ?? 'ready');
    if (removed || currentRevision !== revision) return;
    content.replaceChildren();
    addParagraph(`Vinted: ${identity.username}`, 'flipbase-vinted-account-identity');
    addParagraph(states.unbound[0], 'flipbase-vinted-account-status');
    addParagraph(states.unbound[1]);
    addLink(
      'Vinted-Konto verknüpfen',
      'https://app.flipbase.de',
      '/marketplaces/vinted/accounts?add=local',
      true,
    );
    addLink('Konten & Einstellungen', 'https://app.flipbase.de', '/marketplaces/vinted/accounts');
  }

  async function showAccount(isExplicitRecheck = false) {
    const currentRevision = ++revision;
    let binding;
    if (isExplicitRecheck) panel.querySelector('button').focus({ preventScroll: true });
    content.replaceChildren();
    addParagraph('Verbindung wird geprüft …', 'flipbase-vinted-account-status');
    try {
      const status = await readStatus();
      if (removed || currentRevision !== revision) return;
      if (status.reserved) {
        remove();
        globalThis.FlipbaseVintedWorkTab?.reserve();
        return;
      }
      binding = status.binding;
      content.replaceChildren();
      showStoredAccount(binding);
      addParagraph('Verbindung wird geprüft …', 'flipbase-vinted-account-status');
      const response = await chrome.runtime.sendMessage({
        type: isExplicitRecheck ? 'VINTED_LOCAL_ACCOUNT_RECHECK' : 'VINTED_LOCAL_ACCOUNT_READINESS',
      });
      if (removed || currentRevision !== revision) return;
      if (response?.success !== true)
        throw new Error('Die aktuelle Verbindung konnte nicht geprüft werden.');
      // Die Prüfung kann eine lokale Bindung entfernen; danach erneut lesen.
      const refreshed = await readStatus();
      if (removed || currentRevision !== revision) return;
      if (refreshed.reserved) {
        remove();
        globalThis.FlipbaseVintedWorkTab?.reserve();
        return;
      }
      binding = refreshed.binding;
      if (!binding && response.result?.state === 'unbound')
        await showUnboundAccount(currentRevision);
      else showRuntime(binding, response.result);
    } catch (error) {
      if (removed || currentRevision !== revision) return;
      if (binding) return showRuntime(binding, null);
      content.replaceChildren();
      addParagraph(
        error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
          ? error.message
          : 'Dein Vinted-Konto konnte nicht geprüft werden. Versuche es später erneut.',
      );
      addLink('Flipbase öffnen', 'https://app.flipbase.de', '/marketplaces/vinted/accounts');
    }
  }

  function close() {
    revision++;
    panel.hidden = true;
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    restorePage();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else toggle.focus({ preventScroll: true });
  }

  function containFocus(event) {
    if (!removed && panel && !panel.hidden && !panel.contains(event.target))
      panel.querySelector('button').focus({ preventScroll: true });
  }

  function handleKeydown(event) {
    if (removed || !panel || panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button:not([disabled]), a[href]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !controls.includes(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !controls.includes(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
      event.stopPropagation();
    }
  }

  function mount() {
    if (removed || document.querySelector('#flipbase-vinted-work-tab')) return;
    container = document.createElement('aside');
    container.id = 'flipbase-vinted-account';
    toggle = document.createElement('button');
    toggle.id = 'flipbase-vinted-account-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Flipbase: Vinted-Konto und Verbindung');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'flipbase-vinted-account-panel');
    toggle.setAttribute('aria-haspopup', 'dialog');
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('images/flipbase-mark.png');
    logo.alt = '';
    logo.width = 32;
    logo.height = 32;
    toggle.append(logo);
    backdrop = document.createElement('div');
    backdrop.id = 'flipbase-vinted-account-backdrop';
    backdrop.hidden = true;
    panel = document.createElement('section');
    panel.id = 'flipbase-vinted-account-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'flipbase-vinted-account-heading');
    panel.hidden = true;
    const header = document.createElement('div');
    header.className = 'flipbase-vinted-account-header';
    const heading = document.createElement('h2');
    heading.id = 'flipbase-vinted-account-heading';
    heading.textContent = 'Flipbase & Vinted';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Flipbase schließen');
    closeButton.addEventListener('click', close);
    header.append(heading, closeButton);
    content = document.createElement('div');
    content.setAttribute('aria-live', 'polite');
    panel.append(header, content);
    backdrop.append(panel);
    container.append(toggle, backdrop);
    document.body.append(container);
    toggle.addEventListener('click', () => {
      if (!panel.hidden) return close();
      returnFocus = document.activeElement === document.body ? toggle : document.activeElement;
      panel.hidden = false;
      backdrop.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      for (const element of document.body.children) {
        if (element === container) continue;
        disabledElements.set(element, element.getAttribute('inert'));
        element.setAttribute('inert', '');
      }
      closeButton.focus({ preventScroll: true });
      showAccount();
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('focusin', containFocus);
  }

  readStatus()
    .then((status) => {
      if (removed) return;
      if (status.reserved) globalThis.FlipbaseVintedWorkTab?.reserve();
      else mount();
    })
    .catch(() => mount());
})();
