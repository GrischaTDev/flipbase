import type {
  VintedListingPhotoAdjustment,
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
  readonly adjustments?: VintedListingPhotoAdjustment;
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
    const adj = input.adjustments;
    const straighten = adj?.straighten ?? 0;
    const flipX = adj?.flipX === true;
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
    if (straighten === 0 && !flipX) {
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
    } else {
      const angleRad = (Math.abs(straighten) * Math.PI) / 180;
      const aspect = Math.max(outputWidth / outputHeight, outputHeight / outputWidth);
      const autoZoom = angleRad > 0 ? Math.cos(angleRad) + aspect * Math.sin(angleRad) : 1;
      const centerX = bitmap.width * (crop.x + crop.width / 2);
      const centerY = bitmap.height * (crop.y + crop.height / 2);
      context.translate(outputWidth / 2, outputHeight / 2);
      context.scale(
        (outputWidth / width) * autoZoom * (flipX ? -1 : 1),
        (outputHeight / height) * autoZoom,
      );
      context.rotate(((crop.rotation + straighten) * Math.PI) / 180);
      context.drawImage(bitmap, -centerX, -centerY);
    }
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
    const innerX = (outputWidth - innerWidth) / 2,
      innerY = (outputHeight - innerHeight) / 2;
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.save();
    target.beginPath();
    target.rect(innerX, innerY, innerWidth, innerHeight);
    target.clip();
    const filterParts: string[] = [];
    if (input.filter === 'lighter') filterParts.push('brightness(1.08)');
    else if (input.filter === 'darker') filterParts.push('brightness(0.92)');
    else if (input.filter === 'soft') filterParts.push('blur(1px)');
    else if (input.filter === 'natural')
      filterParts.push('brightness(1.03) contrast(1.05) saturate(1.06)');
    else if (input.filter === 'contrast') filterParts.push('contrast(1.14) saturate(1.04)');
    if (adj) {
      if (adj.exposure !== 0)
        filterParts.push(`brightness(${(1 + adj.exposure * 0.006).toFixed(4)})`);
      if (adj.contrast !== 0)
        filterParts.push(`contrast(${(1 + adj.contrast * 0.008).toFixed(4)})`);
      if (adj.saturation !== 0)
        filterParts.push(`saturate(${(1 + adj.saturation * 0.01).toFixed(4)})`);
    }
    target.filter = filterParts.length ? filterParts.join(' ') : 'none';
    target.drawImage(canvas, innerX, innerY, innerWidth, innerHeight);
    target.restore();
    const warmth = adj?.warmth ?? 0;
    const denoise = adj?.denoise ?? 0;
    const sharpness = adj?.sharpness ?? 0;
    if (warmth !== 0 || denoise > 0 || sharpness > 0) {
      const ix = Math.max(0, Math.round(innerX));
      const iy = Math.max(0, Math.round(innerY));
      const iw = Math.max(1, Math.min(outputWidth - ix, Math.round(innerWidth)));
      const ih = Math.max(1, Math.min(outputHeight - iy, Math.round(innerHeight)));
      const imageData = target.getImageData(ix, iy, iw, ih);
      const data = imageData.data;
      if (warmth !== 0) {
        const w = warmth / 50;
        const red = 1 + 0.25 * w;
        const blue = 1 - 0.25 * w;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i]! * red;
          data[i + 2] = data[i + 2]! * blue;
        }
      }
      if (denoise > 0) {
        const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
        const strength = 0.65 * (denoise / 100);
        const source = Uint8ClampedArray.from(data);
        for (let y = 0; y < ih; y++) {
          for (let x = 0; x < iw; x++) {
            const center = (y * iw + x) * 4;
            for (let c = 0; c < 3; c++) {
              const centerVal = source[center + c]!;
              let sum = 0;
              let weight = 0;
              let k = 0;
              for (let dy = -1; dy <= 1; dy++) {
                const ny = Math.min(ih - 1, Math.max(0, y + dy));
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = Math.min(iw - 1, Math.max(0, x + dx));
                  const nVal = source[(ny * iw + nx) * 4 + c]!;
                  if (Math.abs(nVal - centerVal) <= 32) {
                    const w = kernel[k]!;
                    sum += nVal * w;
                    weight += w;
                  }
                  k++;
                }
              }
              if (weight > 0) {
                const smoothed = sum / weight;
                data[center + c] = centerVal + (smoothed - centerVal) * strength;
              }
            }
          }
        }
      }
      if (sharpness > 0) {
        const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
        const strength = 1.5 * (sharpness / 100);
        const source = Uint8ClampedArray.from(data);
        for (let y = 0; y < ih; y++) {
          for (let x = 0; x < iw; x++) {
            const center = (y * iw + x) * 4;
            for (let c = 0; c < 3; c++) {
              const centerVal = source[center + c]!;
              let sum = 0;
              let k = 0;
              for (let dy = -1; dy <= 1; dy++) {
                const ny = Math.min(ih - 1, Math.max(0, y + dy));
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = Math.min(iw - 1, Math.max(0, x + dx));
                  sum += source[(ny * iw + nx) * 4 + c]! * kernel[k]!;
                  k++;
                }
              }
              const blurred = sum / 16;
              data[center + c] = centerVal + (centerVal - blurred) * strength;
            }
          }
        }
      }
      target.putImageData(imageData, ix, iy);
    }
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
