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

/**
 * Name einer Exportdatei. Index 0 ist das Hauptbild - bei eBay das Bild im
 * Suchergebnis, bei Vinted das im Raster.
 */
export function exportFileName(index: number, baseName: string): string {
  const number = String(index + 1).padStart(2, '0');
  const suffix = index === 0 ? `${number}-main` : number;
  return baseName ? `${baseName}-${suffix}.jpg` : `${suffix}.jpg`;
}

/** Name des Archivs. Ohne Grundnamen bleibt es beim bisherigen Namen. */
export function archiveName(baseName: string): string {
  return baseName ? `${baseName}.zip` : 'flipbase-bilder.zip';
}
