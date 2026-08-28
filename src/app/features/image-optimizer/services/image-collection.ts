import { PlatformId, PlatformProfile, Rect } from '../models/platform-profile';
import { OptimizerImage } from '../models/optimizer-image';
import { applyCropToAll, setCrop } from './crops';
import { Adjustments } from '../models/image-adjustments';
import { clampAdjustments } from './adjustments';

/**
 * Ergebnis einer Entfernung. Die Object-URLs werden bewusst nur **gemeldet**
 * und nicht hier freigegeben: `URL.revokeObjectURL` ist ein Seiteneffekt und
 * haette in einer reinen Funktion nichts zu suchen - die Komponente ruft ihn.
 */
export interface RemovalResult {
  readonly list: readonly OptimizerImage[];
  readonly revokedUrls: readonly string[];
}

export function removeImage(list: readonly OptimizerImage[], id: string): RemovalResult {
  const affected = list.find((image) => image.id === id);
  if (!affected) return { list, revokedUrls: [] };

  return {
    list: list.filter((image) => image.id !== id),
    revokedUrls: [affected.dataUrl],
  };
}

export function removeAll(list: readonly OptimizerImage[]): RemovalResult {
  return { list: [], revokedUrls: list.map((image) => image.dataUrl) };
}

/** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
export function moveImage(
  list: readonly OptimizerImage[],
  id: string,
  direction: -1 | 1,
): readonly OptimizerImage[] {
  const from = list.findIndex((image) => image.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= list.length) return list;

  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function saveCropIn(
  list: readonly OptimizerImage[],
  id: string,
  platformId: PlatformId,
  rect: Rect,
  selected: readonly PlatformProfile[],
): readonly OptimizerImage[] {
  return list.map((image) =>
    image.id === id ? { ...image, crops: setCrop(image.crops, platformId, rect, selected) } : image,
  );
}

export function applyCropToAllIn(
  list: readonly OptimizerImage[],
  id: string,
  platformId: PlatformId,
  selected: readonly PlatformProfile[],
): readonly OptimizerImage[] {
  return list.map((image) =>
    image.id === id
      ? { ...image, crops: applyCropToAll(image.crops, platformId, selected) }
      : image,
  );
}

export function markReviewed(
  list: readonly OptimizerImage[],
  id: string,
): readonly OptimizerImage[] {
  const target = list.find((image) => image.id === id);
  if (!target || target.reviewed) return list;

  return list.map((image) => (image.id === id ? { ...image, reviewed: true } : image));
}

export function toggleReviewed(
  list: readonly OptimizerImage[],
  id: string,
): readonly OptimizerImage[] {
  return list.map((image) => (image.id === id ? { ...image, reviewed: !image.reviewed } : image));
}

export function reviewedCount(list: readonly OptimizerImage[]): number {
  return list.filter((image) => image.reviewed).length;
}

export function setAdjustmentsIn(
  list: readonly OptimizerImage[],
  id: string,
  values: Adjustments,
): readonly OptimizerImage[] {
  const safe = clampAdjustments(values);
  return list.map((image) => (image.id === id ? { ...image, adjustments: safe } : image));
}

/** Uebertraegt eine Einstellung auf jedes Bild - alle Fotos eines Artikels
 *  entstehen meist im selben Licht. */
export function applyAdjustmentsToAll(
  list: readonly OptimizerImage[],
  values: Adjustments,
): readonly OptimizerImage[] {
  const safe = clampAdjustments(values);
  return list.map((image) => ({ ...image, adjustments: safe }));
}
