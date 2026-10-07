(async function showPairing() {
  const nonce = location.hash.slice(1);
  const approve = document.getElementById('approve');
  const status = document.getElementById('status');
  const decide = async (approved) => {
    approve.disabled = true;
    await chrome.runtime.sendMessage({ type: 'VINTED_PAIRING_CONFIRM', nonce, approved });
    window.close();
  };
  document.getElementById('cancel').addEventListener('click', () => void decide(false));
  try {
    const pairing = await chrome.runtime.sendMessage({ type: 'VINTED_PAIRING_READ', nonce });
    if (!pairing) throw new Error('expired');
    const details = document.getElementById('details');
    for (const [label, value] of [
      ['Vinted-Konto', `${pairing.username} (${pairing.externalAccountId})`],
      ['Anfragende Website', pairing.appOrigin],
      ['Flipbase-Workspace-ID', pairing.workspaceId],
      ['Verbindungs-ID', pairing.connectionId],
    ]) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      details.append(term, description);
    }
    status.textContent =
      'Vergleiche Workspace und Verbindung mit Deiner geöffneten Flipbase-Seite.';
    approve.disabled = false;
    approve.addEventListener('click', () => void decide(true));
  } catch {
    status.textContent = 'Die Anfrage ist abgelaufen. Starte die Verbindung erneut in Flipbase.';
  }
})();
