import { PlattformProfil, ProfilId, Rechteck } from '../models/plattform-profile';
import { leiteAb } from './zuschnitt';

/** Je Plattform ein Zuschnitt. Fehlt einer, gilt beim Export das ganze Bild. */
export type Zuschnitte = Partial<Record<ProfilId, Rechteck>>;

/**
 * Legt den Zuschnitt einer Plattform ab und fuellt die uebrigen **leeren**
 * gewaehlten Plattformen daraus ab.
 *
 * Das Abfuellen ist der Ersatz fuer das frueher einzige Modell "einmal
 * zuschneiden, Formate ableiten": Ein Bild ist nach einer Geste fuer alle
 * Plattformen fertig, ohne dass die Ableitung noch der einzige Weg waere.
 * Bereits angepasste Zuschnitte bleiben unangetastet - wer sie ueberschreiben
 * will, drueckt den Knopf dafuer.
 */
export function setzeZuschnitt(
  vorher: Zuschnitte,
  plattform: ProfilId,
  rechteck: Rechteck,
  gewaehlt: readonly PlattformProfil[],
): Zuschnitte {
  const nachher: Zuschnitte = { ...vorher, [plattform]: rechteck };

  for (const p of gewaehlt) {
    if (p.id === plattform) continue;
    if (nachher[p.id]) continue;
    nachher[p.id] = leiteAb(rechteck, p.exportVerhaeltnis);
  }

  return nachher;
}

/**
 * Uebertraegt den Zuschnitt einer Plattform auf alle anderen gewaehlten -
 * auch auf solche, die schon einen eigenen hatten.
 */
export function uebernimmAufAlle(
  vorher: Zuschnitte,
  quelle: ProfilId,
  gewaehlt: readonly PlattformProfil[],
): Zuschnitte {
  const rechteck = vorher[quelle];
  if (!rechteck) return vorher;

  const nachher: Zuschnitte = { ...vorher };
  for (const p of gewaehlt) {
    if (p.id === quelle) continue;
    nachher[p.id] = leiteAb(rechteck, p.exportVerhaeltnis);
  }

  return nachher;
}
