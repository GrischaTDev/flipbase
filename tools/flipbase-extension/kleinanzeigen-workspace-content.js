// Der Assistent erscheint ausschließlich auf gespeicherten eigenen Arbeitstabs.
(function initKleinanzeigenWorkspace(root) {
  if (window.top !== window) return;
  let bubble;
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
      const text = status.busy
        ? 'Dein Inserat wird verarbeitet …'
        : 'Reservierter Kleinanzeigen-Arbeitstab';
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
