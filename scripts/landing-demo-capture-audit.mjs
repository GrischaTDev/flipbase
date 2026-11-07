// Feste Demouhr: Feed-Meldung und Artikelzeit bleiben bei jeder Aufnahme aktuell.
export const DEMO_CAPTURE_TIME = '2026-11-06T10:00:30.000Z';

export function demoCaptureViewport(page, mode) {
  return { width: mode === 'mobile' ? 390 : page === 'feed' ? 1440 : 1280, height: 1100 };
}

const unwantedNotice =
  /konnten nicht|konnte nicht|ungültige Antwort|noch nicht verfügbar|nicht sicher zugeordnet|passt nicht zu Deinen|meldet sich zurzeit nicht|Gespeicherte Artikel bleiben sichtbar|Administration muss|Automatik pausiert|nicht erreichbar|Abruf fehlgeschlagen|Vorsteuer.*noch nicht|Vorl\u00e4ufige Steuer\u00fcbersicht/iu;

export function inspectDemoCapture(page, mode, text, cards = []) {
  const notices = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => unwantedNotice.test(line));
  if (notices.length) throw new Error(`${page}: ${notices.join(' · ')}`);
  const feedCards = cards.map(({ left, top, width }) => ({
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
  }));
  if (page === 'feed' && mode === 'desktop') {
    if (
      feedCards.length !== 3 ||
      feedCards.some((card) => Math.abs(card.top - feedCards[0].top) > 1)
    )
      throw new Error('Die Desktop-Feedvorschau muss drei Karten in einer Reihe zeigen.');
  }
  return { text, notices, ...(page === 'feed' ? { feedCards } : {}) };
}
