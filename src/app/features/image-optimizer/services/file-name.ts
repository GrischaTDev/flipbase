/** Laenge, ab der ein Grundname abgeschnitten wird. */
const MAX_LENGTH = 60;

/**
 * Macht aus einer freien Eingabe einen Namensteil, der in jedem Dateisystem
 * funktioniert.
 *
 * Der Grund fuer die Strenge: `\ / : * ? " < > |` sind in Windows-Dateinamen
 * verboten. Ein Archiv mit solchen Eintraegen laesst sich nicht entpacken -
 * der Nutzer haette den Export umsonst gemacht.
 *
 * Bleibt nichts Brauchbares uebrig (etwa bei reiner Emoji-Eingabe), wird eine
 * leere Zeichenkette geliefert. Sie gilt als "nicht gesetzt", sodass die
 * bisherige Nummerierung greift statt eines Namens aus lauter Bindestrichen.
 */
export function sanitizeBaseName(input: string): string {
  return [
    ...input
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD'),
    // Zerlegt "é" in "e" + Akzent und entfernt dann den Akzent. Die Umlaute
    // oben laufen absichtlich vorher: "ä" soll "ae" werden, nicht "a".
    // `[...]` statt `.split('')`, damit Surrogatpaare nicht auseinandergerissen werden.
  ]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
}

/** Zweistellig, mit fuehrender Null. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Der Grundname, oder Datum und Uhrzeit, wenn keiner eingetippt wurde.
 *
 * Ein namenloser Export hiess frueher `flipbase-bilder` mit Dateien `01.jpg`,
 * `02.jpg`. Sobald eine solche Datei aus ihrem Ordner gezogen wurde, war
 * nicht mehr erkennbar, wozu sie gehoert - und ein zweiter Export ueberschrieb
 * den ersten. Der Zeitstempel loest beides.
 *
 * Jahr zuerst, damit der Explorer chronologisch sortiert. Kein Doppelpunkt
 * zwischen Stunde und Minute: In Windows-Dateinamen ist er verboten.
 *
 * `now` ist ein Parameter und kein `new Date()` in der Funktion. Der Aufrufer
 * nimmt die Zeit **einmal** je Export; zoege jede Datei ihre eigene, koennte
 * ein Export ueber einen Minutenwechsel hinweg in zwei Namen zerfallen.
 */
export function effectiveBaseName(baseName: string, now: Date): string {
  if (baseName) return baseName;

  return [
    now.getFullYear(),
    '-',
    pad(now.getMonth() + 1),
    '-',
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('');
}

/**
 * Name einer Exportdatei. Durchgehend nummeriert, ohne Sonderfall fuer das
 * erste Bild.
 *
 * Frueher trug Bild 1 ein angehaengtes `-main`. Das unterbrach die Zahlenkette
 * am Ende des Namens; beim Durchblaettern eines geoeffneten Ordners fiel die
 * Datei aus der Reihe. Dass Bild 1 das Hauptbild ist, sagt das Abzeichen in
 * der Oberflaeche.
 *
 * `baseName` ist hier nie leer - der Aufrufer schickt `effectiveBaseName()`
 * hindurch.
 */
export function exportFileName(index: number, baseName: string): string {
  return `${baseName}-${pad(index + 1)}.jpg`;
}

/** Name des ZIP-Archivs, in dem der Export ausgeliefert wird. Erwartet den wirksamen Namen. */
export function archiveName(baseName: string): string {
  return `${baseName}.zip`;
}
