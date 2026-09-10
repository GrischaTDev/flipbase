import { PlatformProfile, PlatformId, Rect, Size } from '../models/platform-profile';
import { deriveRect } from './crop';

/** Je Plattform ein Zuschnitt. Fehlt einer, gilt beim Export das ganze Bild. */
export type Crops = Partial<Record<PlatformId, Rect>>;

/**
 * Die Vorbelegung eines frisch geladenen Bildes: jede gewaehlte Plattform
 * bekommt ihr eigenes Maximum aus dem Vollbild.
 *
 * Damit ist ein Bild sofort fuer alle Plattformen brauchbar, ohne dass eine
 * Plattform die andere einschraenkt. Der Grundsatz bleibt gewahrt: Solange
 * der Nutzer nichts eingeschraenkt hat, ist das ganze Foto der ehrliche
 * Ausgangspunkt.
 */
export function seedCrops(size: Size, selected: readonly PlatformProfile[]): Crops {
  const crops: Crops = {};

  for (const platform of selected) {
    crops[platform.id] = maximumCrop(size, platform.exportRatio);
  }

  return crops;
}

/**
 * Legt den Zuschnitt einer Plattform ab und fuellt die uebrigen **leeren**
 * gewaehlten Plattformen.
 *
 * Woraus gefuellt wird, haengt daran, ob der Nutzer den aktiven Rahmen selbst
 * gezogen hat:
 *
 * - **unberuehrt** (noch das Maximum) - die leeren Plattformen bekommen
 *   ebenfalls ihr Maximum aus dem Vollbild. Ohne diesen Fall erbte etwa
 *   Vinted (2:3) vom eBay-Quadrat und bekaeme bei einem Handyfoto nur 66,7 %
 *   der Breite statt 88,9 %.
 * - **gezogen** - es wird wie bisher aus dem aktiven Rahmen abgeleitet. So
 *   landet in keinem Export Inhalt, den der Nutzer nicht gesehen hat.
 *
 * Ohne bekannte Bildgroesse (`size` ist null) bleibt es beim Ableiten:
 * Es gibt dann kein Vollbild, auf das sich ein Maximum beziehen koennte.
 *
 * Bereits angepasste Zuschnitte bleiben in beiden Faellen unangetastet - wer
 * sie ueberschreiben will, drueckt den Knopf dafuer.
 */
export function setCrop(
  before: Crops,
  platform: PlatformId,
  rect: Rect,
  selected: readonly PlatformProfile[],
  size: Size | null,
): Crops {
  const after: Crops = { ...before, [platform]: rect };

  const active = selected.find((p) => p.id === platform);
  const seedFromFull =
    size !== null && active !== undefined && isMaximum(rect, size, active.exportRatio);

  for (const p of selected) {
    if (p.id === platform) continue;
    if (after[p.id]) continue;
    after[p.id] = seedFromFull ? maximumCrop(size, p.exportRatio) : deriveRect(rect, p.exportRatio);
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

/**
 * Der groesste Ausschnitt im gewuenschten Verhaeltnis, mittig im **ganzen**
 * Bild.
 *
 * Der Unterschied zu `deriveRect` ist der Bezugspunkt, und genau der war der
 * Fehler: `deriveRect` schneidet aus einem vorhandenen Rahmen, diese Funktion
 * aus dem Vollbild. Bei einem 3:4-Handyfoto bekommt Vinted damit 88,9 % der
 * Breite statt der 66,7 %, die aus dem eBay-Quadrat uebrig blieben.
 */
export function maximumCrop(size: Size, ratio: number): Rect {
  return deriveRect({ x: 0, y: 0, width: size.width, height: size.height }, ratio);
}

/**
 * Ab hier gilt ein Rahmen als vom Nutzer angefasst.
 *
 * Der Cropper rechnet ueber die Anzeigegroesse und rundet dabei; ohne
 * Toleranz gaelte ein nie beruehrter Rahmen bereits als gezogen, und das
 * Vorbelegen aus dem Vollbild fiele fuer jede spaeter zugewaehlte Plattform
 * aus.
 */
const TOLERANCE_PX = 1;

/** Ob dieser Ausschnitt (noch) dem Maximum aus dem Vollbild entspricht. */
export function isMaximum(rect: Rect, size: Size, ratio: number): boolean {
  const max = maximumCrop(size, ratio);

  return (
    Math.abs(rect.x - max.x) <= TOLERANCE_PX &&
    Math.abs(rect.y - max.y) <= TOLERANCE_PX &&
    Math.abs(rect.width - max.width) <= TOLERANCE_PX &&
    Math.abs(rect.height - max.height) <= TOLERANCE_PX
  );
}
