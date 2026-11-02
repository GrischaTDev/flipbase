// Der Assistent erscheint ausschließlich auf gespeicherten eigenen Arbeitstabs.
(function initKleinanzeigenWorkspace(root) {
  if (window.top !== window) return;
  let bubble;
  const reasons = {
    quota_unknown: 'Das Anzeigenkontingent konnte nicht geladen werden.',
    quota_exhausted: 'Dein kostenloses Anzeigenkontingent ist aufgebraucht.',
    fees_or_quota: 'Kosten oder Anzeigenkontingent müssen geprüft werden.',
    deletion_unconfirmed: 'Die Löschung konnte nicht bestätigt werden.',
    deletion_not_confirmed: 'Die bisherige Anzeige ist noch vorhanden.',
    publication_unconfirmed: 'Die Veröffentlichung konnte nicht bestätigt werden.',
    images_incomplete: 'Die Bilder sind noch nicht vollständig übernommen.',
    account_changed: 'Das angemeldete Kleinanzeigen-Konto hat sich geändert.',
    access_revoked: 'Die Freigabe für dieses Konto fehlt.',
  };
  async function refresh() {
    try {
      const status = await chrome.runtime.sendMessage({ type: 'KLEINANZEIGEN_WORKSPACE_STATUS' });
      if (!status?.owned) {
        bubble?.remove();
        bubble = null;
        return;
      }
      if (!bubble) {
        bubble = document.createElement('aside');
        bubble.id = 'flipbase-workspace-assistant';
        bubble.setAttribute('aria-label', 'Flipbase Assistent');
        const title = document.createElement('strong');
        title.textContent = 'Flipbase Assistent';
        const text = document.createElement('p');
        text.setAttribute('role', 'status');
        bubble.append(title, text);
        document.body.append(bubble);
      }
      const text =
        status.phase === 'running'
          ? 'Dein Inserat wird verarbeitet …'
          : status.phase === 'paused'
            ? 'Angehalten: ' + (reasons[status.errorCode] ?? 'Prüfe den Hinweis in Flipbase.')
            : status.phase === 'completed'
              ? 'Vorgang abgeschlossen'
              : 'Bereit für Deine Kleinanzeigen-Aktion';
      if (bubble.lastElementChild.textContent !== text) bubble.lastElementChild.textContent = text;
    } catch {
      bubble?.remove();
      bubble = null;
    }
  }
  void refresh();
  const timer = root.setInterval(() => void refresh(), 3000);
  window.addEventListener('pagehide', () => root.clearInterval(timer), { once: true });
})(globalThis);
