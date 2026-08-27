import { PlatformProfile, Rect } from '../models/platform-profile';
import { deriveRect } from './crop';

/** Vollständiger, von Vorschau und Export gemeinsam verwendeter Renderplan. */
export interface RenderPlan {
  readonly source: Rect;
  readonly width: number;
  readonly height: number;
}

/**
 * Plant die Plattformausgabe, ohne jemals zusätzliche Pixel zu erfinden.
 * Große Quellen werden auf die Plattformgrenze verkleinert, kleine behalten
 * ihre natürliche Auflösung.
 */
export function planOutput(crop: Rect, platform: PlatformProfile): RenderPlan {
  const source = deriveRect(crop, platform.exportRatio);
  const factor = Math.min(
    1,
    platform.exportWidth / source.width,
    platform.exportHeight / source.height,
  );

  return {
    source,
    width: Math.max(1, Math.round(source.width * factor)),
    height: Math.max(1, Math.round(source.height * factor)),
  };
}

/** Rendert einen Plan als JPEG. Diese Funktion ist die einzige Canvas-Ausgabe für Vorschau und Export. */
export async function renderImage(
  image: CanvasImageSource,
  plan: RenderPlan,
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
    0,
    0,
    plan.width,
    plan.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht erzeugen.'))),
      'image/jpeg',
      quality,
    );
  });
}
