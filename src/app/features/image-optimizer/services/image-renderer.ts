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
export function planOutput(ausschnitt: Rect, plattform: PlatformProfile): RenderPlan {
  const quelle = deriveRect(ausschnitt, plattform.exportRatio);
  const faktor = Math.min(
    1,
    plattform.exportWidth / quelle.width,
    plattform.exportHeight / quelle.height,
  );

  return {
    source: quelle,
    width: Math.max(1, Math.round(quelle.width * faktor)),
    height: Math.max(1, Math.round(quelle.height * faktor)),
  };
}

/** Rendert einen Plan als JPEG. Diese Funktion ist die einzige Canvas-Ausgabe für Vorschau und Export. */
export async function renderImage(
  bild: CanvasImageSource,
  plan: RenderPlan,
  quality = 0.92,
): Promise<Blob> {
  const flaeche = document.createElement('canvas');
  flaeche.width = plan.width;
  flaeche.height = plan.height;

  const stift = flaeche.getContext('2d');
  if (!stift) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  stift.fillStyle = '#ffffff';
  stift.fillRect(0, 0, flaeche.width, flaeche.height);
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  stift.drawImage(
    bild,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
    0,
    0,
    plan.width,
    plan.height,
  );

  return new Promise<Blob>((aufloesen, ablehnen) => {
    flaeche.toBlob(
      (blob) =>
        blob ? aufloesen(blob) : ablehnen(new Error('Das Bild ließ sich nicht erzeugen.')),
      'image/jpeg',
      quality,
    );
  });
}
