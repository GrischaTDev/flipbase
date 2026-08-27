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
  platform: PlatformId,
  rect: Rect,
  selected: readonly PlatformProfile[],
): Crops {
  const after: Crops = { ...before, [platform]: rect };

  for (const p of selected) {
    if (p.id === platform) continue;
    if (after[p.id]) continue;
    after[p.id] = deriveRect(rect, p.exportRatio);
  }

  return after;
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
  const rect = before[sourceId];
  if (!rect) return before;

  const after: Crops = { ...before };
  for (const p of selected) {
    if (p.id === sourceId) continue;
    after[p.id] = deriveRect(rect, p.exportRatio);
  }

  return after;
}
