import { PlatformProfile, PlatformId, Rect } from '../models/platform-profile';
import { deriveRect } from './crop';

/** Je Plattform ein Zuschnitt. Fehlt einer, gilt beim Export das ganze Bild. */
export type Crops = Partial<Record<PlatformId, Rect>>;

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
export function setCrop(
  before: Crops,
  plattform: PlatformId,
  rechteck: Rect,
  selected: readonly PlatformProfile[],
): Crops {
  const nachher: Crops = { ...before, [plattform]: rechteck };

  for (const p of selected) {
    if (p.id === plattform) continue;
    if (nachher[p.id]) continue;
    nachher[p.id] = deriveRect(rechteck, p.exportRatio);
  }

  return nachher;
}

/**
 * Uebertraegt den Zuschnitt einer Plattform auf alle anderen gewaehlten -
 * auch auf solche, die schon einen eigenen hatten.
 */
export function applyCropToAll(
  before: Crops,
  sourceId: PlatformId,
  selected: readonly PlatformProfile[],
): Crops {
  const rechteck = before[sourceId];
  if (!rechteck) return before;

  const nachher: Crops = { ...before };
  for (const p of selected) {
    if (p.id === sourceId) continue;
    nachher[p.id] = deriveRect(rechteck, p.exportRatio);
  }

  return nachher;
}
