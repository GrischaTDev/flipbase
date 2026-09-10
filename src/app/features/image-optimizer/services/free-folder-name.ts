/**
 * Findet einen Ordnernamen, der noch nicht vergeben ist.
 *
 * Warum das von Hand gebaut wird: Das automatische `(1)` beim Herunterladen
 * kommt vom Browser, nicht von Windows - und beim Schreiben ueber die
 * Verzeichnis-Schnittstelle ist der Browser nicht beteiligt.
 * `getFileHandle(name, { create: true })` oeffnet stillschweigend die
 * vorhandene Datei, und `createWritable()` kuerzt sie beim Oeffnen auf null
 * Byte. Ohne diese Suche waere der Export der einzige Weg, auf dem der
 * Bildoptimierer fremde Dateien zerstoeren koennte.
 *
 * Geprueft wird nur der **obere** Ordner. Ist dessen Name neu, sind alle
 * Plattform-Unterordner und alle Dateien darin zwangslaeufig auch neu.
 */

/** Der schmale Ausschnitt der Verzeichnis-Schnittstelle, den diese Suche braucht. */
export interface DirectoryLookup {
  getDirectoryHandle(name: string): Promise<unknown>;
}

/** Ab hier stimmt etwas anderes nicht, und Weiterzaehlen hilft niemandem. */
const MAX_ATTEMPTS = 999;

/** Gezaehlt wird ab zwei - der erste Ordner traegt ja auch keine Eins. */
export async function freeFolderName(parent: DirectoryLookup, wanted: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const name = attempt === 1 ? wanted : `${wanted} (${attempt})`;
    if (!(await exists(parent, name))) return name;
  }

  throw new Error(`Es ließ sich kein freier Ordnername für "${wanted}" finden.`);
}

/**
 * Bewusst **ohne** `create`: Mit `create: true` waere die Pruefung selbst der
 * Vorgang, der den Ordner anlegt, und jeder Name gaelte sofort als belegt.
 *
 * Nur `NotFoundError` heisst "frei" - das ist die einzige Antwort, die
 * tatsaechlich sagt, dass es den Eintrag nicht gibt. `TypeMismatchError`
 * heisst "belegt": Es gibt dort schon eine *Datei* mit diesem Namen, und ein
 * Ordner liesse sich darueber nicht anlegen. Jeder andere Fehler - etwa eine
 * fehlende Berechtigung - beantwortet die Frage gar nicht; ihn als "frei" zu
 * lesen waere geraten, und genau dieses Raten sollte diese Funktion
 * verhindern. Darum wird er weitergereicht, statt ihn stillschweigend als
 * "frei" zu werten.
 */
async function exists(parent: DirectoryLookup, name: string): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') return false;
    if (error instanceof Error && error.name === 'TypeMismatchError') return true;
    throw error;
  }
}
