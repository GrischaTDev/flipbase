(function initVintedLocalAccount() {
  const core = globalThis.FlipbaseVintedLocal;
  if (!core || window.top !== window || location.origin !== 'https://www.vinted.de') return;
  let container;
  let panel;
  let toggle;
  let content;
  let revision = 0;
  let removed = false;

  function remove() {
    removed = true;
    revision++;
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

  async function showAccount() {
    const currentRevision = ++revision;
    content.replaceChildren();
    addParagraph('Dein Konto wird geprüft …');
    try {
      const status = await readStatus();
      if (removed || currentRevision !== revision) return;
      if (status.reserved) {
        remove();
        globalThis.FlipbaseVintedWorkTab?.reserve();
        return;
      }
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
      const binding = status.binding;
      const origin =
        binding && core.isAppOrigin(binding.appOrigin)
          ? binding.appOrigin
          : 'https://app.flipbase.de';
      if (binding && binding.externalAccountId !== identity.id) {
        addParagraph('Anderes Vinted-Konto aktiv', 'flipbase-vinted-account-status');
        addParagraph(
          `Dieses Browserprofil ist mit ${binding.username ?? 'einem anderen Vinted-Konto'} verknüpft. Verwende für dieses Konto ein separates Browserprofil mit Flipbase-Erweiterung.`,
        );
      } else {
        const labels = {
          linked: 'Lokal verknüpft',
          expired: 'Freigabe abgelaufen',
          paused: 'Abgleich pausiert',
          revoked: 'Freigabe nicht mehr gültig',
        };
        addParagraph(
          binding
            ? (labels[binding.state] ?? 'Verbindung prüfen')
            : 'Noch nicht mit Flipbase verknüpft',
          'flipbase-vinted-account-status',
        );
        addParagraph(
          binding
            ? 'Dies ist die gespeicherte lokale Zuordnung. Den aktuellen Freigabestatus prüfst Du in Flipbase.'
            : 'Öffne Flipbase in diesem Browserprofil und bestätige dort Dein Vinted-Konto. Pro Browserprofil kannst Du ein lokales Konto verknüpfen.',
        );
        addLink(
          binding ? 'Verbindung in Flipbase prüfen' : 'Vinted-Konto verknüpfen',
          origin,
          binding
            ? `/marketplaces/vinted/local-connect/${binding.connectionId}`
            : '/marketplaces/vinted/accounts?add=local',
          true,
        );
      }
      addLink('Konten & Einstellungen', origin, '/marketplaces/vinted/accounts');
    } catch (error) {
      if (removed || currentRevision !== revision) return;
      content.replaceChildren();
      addParagraph(
        error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
          ? error.message
          : 'Dein Vinted-Konto konnte nicht geprüft werden. Lade die Seite neu oder versuche es später erneut.',
      );
      addLink('Flipbase öffnen', 'https://app.flipbase.de', '/marketplaces/vinted/accounts');
    }
  }

  function close(restoreFocus = true) {
    revision++;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
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
    panel = document.createElement('section');
    panel.id = 'flipbase-vinted-account-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'flipbase-vinted-account-heading');
    panel.hidden = true;
    const header = document.createElement('div');
    header.className = 'flipbase-vinted-account-header';
    const heading = document.createElement('strong');
    heading.id = 'flipbase-vinted-account-heading';
    heading.textContent = 'Flipbase & Vinted';
    heading.tabIndex = -1;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Flipbase schließen');
    closeButton.addEventListener('click', () => close());
    header.append(heading, closeButton);
    content = document.createElement('div');
    content.setAttribute('aria-live', 'polite');
    panel.append(header, content);
    container.append(panel, toggle);
    document.body.append(container);
    toggle.addEventListener('click', () => {
      if (!panel.hidden) return close();
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      heading.focus({ preventScroll: true });
      showAccount();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden && !removed) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!panel.hidden && !container.contains(event.target)) close(false);
    });
  }

  readStatus()
    .then((status) => {
      if (removed) return;
      if (status.reserved) globalThis.FlipbaseVintedWorkTab?.reserve();
      else mount();
    })
    .catch(() => mount());
})();
