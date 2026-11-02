import type {
  VintedListingPhotoCrop,
  VintedListingPhotoFilter,
  VintedListingPhotoBorder,
} from './marketplace-listing-contracts.d.ts';

export interface VintedListingPhotoRenderInput {
  readonly base64: string;
  readonly mimeType: string;
  readonly resize: number | null;
  readonly crop: VintedListingPhotoCrop | null;
  readonly filter?: VintedListingPhotoFilter;
  readonly border?: VintedListingPhotoBorder;
}

/** Gleiche Canvas-Schritte für Vorschau und Upload; JPEG erst beim Export.
 * Die Funktion benötigt keine äußeren Werte und läuft auch in page.evaluate.
 */
export async function renderVintedListingPhoto(
  input: VintedListingPhotoRenderInput,
): Promise<string> {
  const raw = atob(input.base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: input.mimeType }));
  try {
    const crop = input.crop ?? { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    const width = bitmap.width * crop.width,
      height = bitmap.height * crop.height;
    const scale = input.resize === null ? 1 : input.resize / Math.max(width, height);
    const outputWidth = Math.max(1, Math.round(width * scale)),
      outputHeight = Math.max(1, Math.round(height * scale));
    if (bitmap.width * bitmap.height > 40_000_000 || outputWidth * outputHeight > 40_000_000)
      throw new Error('Das Foto ist zu groß.');
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Bildausgabe nicht verfügbar.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.setTransform(
      outputWidth / width,
      0,
      0,
      outputHeight / height,
      ((bitmap.width / 2 - bitmap.width * crop.x) * outputWidth) / width,
      ((bitmap.height / 2 - bitmap.height * crop.y) * outputHeight) / height,
    );
    context.rotate((crop.rotation * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const output = document.createElement('canvas');
    output.width = outputWidth;
    output.height = outputHeight;
    const target = output.getContext('2d');
    if (!target) throw new Error('Bildausgabe nicht verfügbar.');
    target.fillStyle = '#ffffff';
    target.fillRect(0, 0, outputWidth, outputHeight);
    const border = { none: 0, small: 0.02, medium: 0.04, large: 0.06 }[input.border ?? 'none'];
    // Weißer Rahmen; das vollständige Foto und das Ausgabeformat bleiben erhalten.
    const inset = Math.round(Math.min(outputWidth, outputHeight) * border);
    const innerScale = Math.min(
      (outputWidth - 2 * inset) / outputWidth,
      (outputHeight - 2 * inset) / outputHeight,
    );
    const innerWidth = outputWidth * innerScale,
      innerHeight = outputHeight * innerScale;
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.save();
    target.beginPath();
    target.rect(
      (outputWidth - innerWidth) / 2,
      (outputHeight - innerHeight) / 2,
      innerWidth,
      innerHeight,
    );
    target.clip();
    target.filter =
      input.filter === 'lighter'
        ? 'brightness(1.08)'
        : input.filter === 'darker'
          ? 'brightness(0.92)'
          : input.filter === 'soft'
            ? 'blur(1px)'
            : 'none';
    target.drawImage(
      canvas,
      (outputWidth - innerWidth) / 2,
      (outputHeight - innerHeight) / 2,
      innerWidth,
      innerHeight,
    );
    target.restore();
    const blob = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Bildausgabe fehlgeschlagen.'))),
        'image/jpeg',
        0.95,
      ),
    );
    if (blob.size > 50 * 1024 * 1024) throw new Error('Die Bildausgabe ist zu groß.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
          : reject(new Error('Bildausgabe ungültig.'));
      reader.onerror = () => reject(new Error('Bildausgabe fehlgeschlagen.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}
