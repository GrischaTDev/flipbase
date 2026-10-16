(async function showKleinanzeigenPairing() {
  const nonce = location.hash.slice(1);
  const approve = document.getElementById('approve');
  const status = document.getElementById('status');
  async function decide(approved) {
    approve.disabled = true;
    await chrome.runtime.sendMessage({ type: 'KLEINANZEIGEN_PAIRING_CONFIRM', nonce, approved });
    window.close();
  }
  document.getElementById('cancel').addEventListener('click', () => void decide(false));
  try {
    const answer = await chrome.runtime.sendMessage({ type: 'KLEINANZEIGEN_PAIRING_READ', nonce });
    const pairing = answer?.success === true ? answer.result : null;
    if (!pairing?.identity || typeof pairing.canPublish !== 'boolean') throw new Error('expired');
    const details = document.getElementById('details');
    for (const [label, value] of [
      [
        'Kleinanzeigen-Konto',
        pairing.identity.displayName + ' (' + pairing.identity.externalAccountId + ')',
      ],
      ['Anfragende Website', pairing.appOrigin],
      ['Arbeitsbereich', pairing.workspaceId],
      [
        'Freigabe',
        pairing.canPublish
          ? 'Eigene Inserate lesen und Deine ausdrücklich beauftragten Anzeigen ohne Gebühren veröffentlichen.'
          : 'Eigene Inserate und Kontingent lesen. Keine Veröffentlichung.',
      ],
    ]) {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      details.append(term, description);
    }
    status.textContent = 'Prüfe Konto, Arbeitsbereich und die angeforderte Freigabe.';
    approve.disabled = false;
    approve.addEventListener('click', () => void decide(true));
  } catch {
    status.textContent = 'Die Anfrage ist abgelaufen. Starte die Verbindung erneut in Flipbase.';
  }
})();
