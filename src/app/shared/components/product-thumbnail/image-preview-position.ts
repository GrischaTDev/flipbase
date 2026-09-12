/**
 * Legt fest, wo die vergrößerte Vorschau neben dem kleinen Bild liegt.
 * Getrennt von der Komponente, damit sich die Rechnung ohne Browser prüfen lässt.
 */
export interface PreviewAnchor {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PreviewViewport {
  readonly width: number;
  readonly height: number;
}

export interface PreviewPlacement {
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

/** Abstand zwischen kleinem Bild und Vorschau sowie zum Fensterrand. */
const GAP = 8;
const MARGIN = 16;
const PREFERRED_SIZE = 320;

/** Die Vorschau schrumpft mit, damit sie auch auf einem Handy hineinpasst. */
export function previewSize(viewport: PreviewViewport): number {
  const available = Math.min(viewport.width, viewport.height) - 2 * MARGIN;
  return Math.max(120, Math.min(PREFERRED_SIZE, available));
}

export function placePreview(anchor: PreviewAnchor, viewport: PreviewViewport): PreviewPlacement {
  const size = previewSize(viewport);
  // Bevorzugt rechts daneben; passt es dort nicht, klappt die Vorschau nach links.
  const rightSide = anchor.right + GAP;
  const leftSide = anchor.left - GAP - size;
  const left =
    rightSide + size + MARGIN <= viewport.width
      ? rightSide
      : leftSide >= MARGIN
        ? leftSide
        : clamp((anchor.left + anchor.right - size) / 2, MARGIN, viewport.width - size - MARGIN);
  // Senkrecht mittig zum Bild, aber immer vollständig im Fenster.
  const top = clamp(
    (anchor.top + anchor.bottom - size) / 2,
    MARGIN,
    viewport.height - size - MARGIN,
  );
  return { left: Math.round(left), top: Math.round(top), size };
}

function clamp(value: number, lowest: number, highest: number): number {
  if (highest < lowest) return lowest;
  return Math.min(Math.max(value, lowest), highest);
}
