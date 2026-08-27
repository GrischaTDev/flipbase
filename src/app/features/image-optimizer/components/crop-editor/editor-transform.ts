import { Rect } from '../../models/platform-profile';

/** Hält den Zoom im bewusst kleinen, gut kontrollierbaren Arbeitsbereich. */
export function clampZoom(value: number): number {
  return Math.min(3, Math.max(1, value));
}

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Rechnet Originalpixel erst um, wenn der Cropper wirklich messbar ist. */
export function scaleCropToDisplay(
  crop: Rect,
  original: Dimensions,
  displayed: Dimensions,
): { x1: number; y1: number; x2: number; y2: number } | undefined {
  if (
    original.width <= 0 ||
    original.height <= 0 ||
    displayed.width <= 0 ||
    displayed.height <= 0
  ) {
    return undefined;
  }

  const width = displayed.width / original.width;
  const height = displayed.height / original.height;
  return {
    x1: crop.x * width,
    y1: crop.y * height,
    x2: (crop.x + crop.width) * width,
    y2: (crop.y + crop.height) * height,
  };
}
