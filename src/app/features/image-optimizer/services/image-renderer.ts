import { PlatformProfile, Rect } from '../models/platform-profile';
import { deriveRect } from './crop';
import { Look } from './adjustments';
import { applySharpening, applyWarmth } from './pixel-adjustments';

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

/**
 * Rendert einen Plan als JPEG. Diese Funktion ist die einzige Canvas-Ausgabe
 * für Vorschau und Export - eine hier angewandte Bildwirkung gilt deshalb
 * zwangsläufig in beiden, und sie können nicht auseinanderlaufen.
 */
export async function renderImage(
  image: CanvasImageSource,
  plan: RenderPlan,
  quality = 0.92,
  look: Look = { filter: '', warmth: 0, sharpness: 0 },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  // Der weiße Grund wird bewusst OHNE Filter gezeichnet. Stünde der Filter
  // schon, färbte brightness(0.6) auch ihn ein, und jedes Bild bekäme einen
  // grauen Rand statt eines weißen. Der Grund existiert nur deshalb, weil
  // durchsichtige Bereiche beim JPEG-Kodieren sonst schwarz würden.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const needsPixels = look.warmth !== 0 || look.sharpness !== 0;

  if (needsPixels) {
    // Wärme und Schärfe rechnen auf Pixeln, und zwar auf einer eigenen Fläche,
    // die nur das Bild enthält. Auf der fertigen Ausgabe gerechnet wäre der
    // weiße Grund längst mit eingebrannt - Wärme würde ihn mit einfärben, und
    // ein freigestelltes Produktfoto bekäme statt des von eBay verlangten
    // reinen Weiß einen warmen Rand.
    drawWithLook(context, image, plan, look);
  } else {
    if (look.filter) context.filter = look.filter;
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
    if (look.filter) context.filter = 'none';
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht erzeugen.'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Zeichnet das Bild auf eine eigene Fläche, rechnet dort die Pixelwirkungen
 * und legt das Ergebnis erst danach auf den weißen Grund.
 */
function drawWithLook(
  target: CanvasRenderingContext2D,
  image: CanvasImageSource,
  plan: RenderPlan,
  look: Look,
): void {
  const layer = document.createElement('canvas');
  layer.width = plan.width;
  layer.height = plan.height;

  const layerContext = layer.getContext('2d');
  if (!layerContext) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');

  layerContext.imageSmoothingEnabled = true;
  layerContext.imageSmoothingQuality = 'high';
  if (look.filter) layerContext.filter = look.filter;
  layerContext.drawImage(
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
  if (look.filter) layerContext.filter = 'none';

  const pixels = layerContext.getImageData(0, 0, plan.width, plan.height);
  applyWarmth(pixels.data, look.warmth);
  // Zuletzt geschärft, wie in jedem Bildbearbeitungsprogramm: Erst steht die
  // Farbe fest, dann werden die Kanten darauf betont. Umgekehrt würde eine
  // spätere Kontrastanhebung die Schärfungssäume mit verstärken.
  applySharpening(pixels.data, plan.width, plan.height, look.sharpness);
  layerContext.putImageData(pixels, 0, 0);

  target.drawImage(layer, 0, 0);
}

/** Nur zur Klarheit an der Aufrufstelle - die neutrale Bildwirkung. */
export const NEUTRAL_LOOK: Look = { filter: '', warmth: 0, sharpness: 0 };
