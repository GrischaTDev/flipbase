/**
 * Filter für archivierbare Stammdaten.
 *
 * Quellen und Lieferanten werden archiviert statt gelöscht, weil Einkäufe auf
 * sie verweisen und diese Verweise nachvollziehbar bleiben müssen. Damit
 * archivierte Einträge nicht doch wieder in Auswahllisten auftauchen, gibt es
 * genau **eine** Stelle, die filtert – diese hier.
 *
 * Der häufigste Fehler bei dieser Bauweise ist ein vergessener Filter in
 * irgendeiner Abfrage. Eine gemeinsame Funktion macht das prüfbar, statt die
 * Bedingung über Dienste und Komponenten zu verstreuen.
 */

/** Ein Stammdatensatz, der archiviert werden kann. */
export interface Archivierbar {
  /**
   * Falsch bedeutet archiviert. Fehlt das Feld, gilt der Eintrag als aktiv –
   * so bleiben Datensätze nutzbar, die vor Einführung der Spalte entstanden.
   */
  is_active?: boolean;
}

/** Liefert nur die nicht archivierten Einträge. */
export function nurAktive<T extends Archivierbar>(liste: readonly T[]): T[] {
  return liste.filter((eintrag) => eintrag.is_active !== false);
}

/** Ob ein einzelner Eintrag archiviert ist. */
export function istArchiviert(eintrag: Archivierbar): boolean {
  return eintrag.is_active === false;
}
