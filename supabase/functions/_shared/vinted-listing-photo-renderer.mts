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
  readonly maskBase64?: string;
  readonly maskMimeType?: string;
  readonly backgroundCalm?: number;
}

/** Gleiche Canvas-Schritte für Vorschau und Upload; JPEG erst beim Export.
 * Die Funktion benötigt keine äußeren Werte und läuft auch in page.evaluate.
 */
export async function renderVintedListingPhoto(
  input: VintedListingPhotoRenderInput,
): Promise<string> {
  const decodeBitmap = async (base64: string, mimeType: string) => {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return await createImageBitmap(new Blob([bytes], { type: mimeType }));
  };
  const drawTransformed = (
    context: CanvasRenderingContext2D,
    source: ImageBitmap,
    width: number,
    height: number,
    outputWidth: number,
    outputHeight: number,
    crop: VintedListingPhotoCrop,
    straighten: number,
    flipX: boolean,
  ) => {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (straighten === 0 && !flipX) {
      context.setTransform(
        outputWidth / width,
        0,
        0,
        outputHeight / height,
        ((source.width / 2 - source.width * crop.x) * outputWidth) / width,
        ((source.height / 2 - source.height * crop.y) * outputHeight) / height,
      );
      context.rotate((crop.rotation * Math.PI) / 180);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      context.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    const angleRad = (Math.abs(straighten) * Math.PI) / 180;
    const aspect = Math.max(outputWidth / outputHeight, outputHeight / outputWidth);
    const autoZoom = angleRad > 0 ? Math.cos(angleRad) + aspect * Math.sin(angleRad) : 1;
    const centerX = source.width * (crop.x + crop.width / 2);
    const centerY = source.height * (crop.y + crop.height / 2);
    context.translate(outputWidth / 2, outputHeight / 2);
    context.scale(
      (outputWidth / width) * autoZoom * (flipX ? -1 : 1),
      (outputHeight / height) * autoZoom,
    );
    context.rotate(((crop.rotation + straighten) * Math.PI) / 180);
    context.drawImage(source, -centerX, -centerY);
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
  const bitmap = await decodeBitmap(input.base64, input.mimeType);
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
    drawTransformed(
      context,
      bitmap,
      width,
      height,
      outputWidth,
      outputHeight,
      crop,
      straighten,
      flipX,
    );
    const calmStrength = input.backgroundCalm ?? 0;
    if (input.maskBase64 && calmStrength > 0) {
      const maskBitmap = await decodeBitmap(input.maskBase64, input.maskMimeType ?? 'image/png');
      try {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = outputWidth;
        maskCanvas.height = outputHeight;
        const maskContext = maskCanvas.getContext('2d');
        if (maskContext) {
          maskContext.clearRect(0, 0, outputWidth, outputHeight);
          drawTransformed(
            maskContext,
            maskBitmap,
            maskBitmap.width * crop.width,
            maskBitmap.height * crop.height,
            outputWidth,
            outputHeight,
            crop,
            straighten,
            flipX,
          );
          const maskData = maskContext.getImageData(0, 0, outputWidth, outputHeight).data;
          const totalPixels = outputWidth * outputHeight;
          let minAlpha = 255,
            maxAlpha = 0;
          for (let p = 0; p < totalPixels; p++) {
            const a = maskData[p * 4 + 3]!;
            if (a < minAlpha) minAlpha = a;
            if (a > maxAlpha) maxAlpha = a;
          }
          const useAlpha = minAlpha < 250 && maxAlpha > 5;
          const fg = new Float32Array(totalPixels);
          for (let p = 0; p < totalPixels; p++) {
            const off = p * 4;
            fg[p] = useAlpha
              ? maskData[off + 3]! / 255
              : (maskData[off]! + maskData[off + 1]! + maskData[off + 2]!) / 765;
          }
          const frame = context.getImageData(0, 0, outputWidth, outputHeight);
          const data = frame.data;
          const src = Uint8ClampedArray.from(data);
          const tmpR = new Float32Array(totalPixels);
          const tmpG = new Float32Array(totalPixels);
          const tmpB = new Float32Array(totalPixels);
          const blurR = new Float32Array(totalPixels);
          const blurG = new Float32Array(totalPixels);
          const blurB = new Float32Array(totalPixels);
          const weights = [1, 4, 6, 4, 1];
          const offsets = [-4, -2, 0, 2, 4];
          for (let y = 0; y < outputHeight; y++) {
            const row = y * outputWidth;
            for (let x = 0; x < outputWidth; x++) {
              const p = row + x;
              let sr = 0,
                sg = 0,
                sb = 0,
                wSum = 0;
              for (let k = 0; k < 5; k++) {
                const nx = Math.min(outputWidth - 1, Math.max(0, x + offsets[k]!));
                const np = row + nx;
                const w = weights[k]! * Math.max(0.01, 1 - fg[np]!);
                const off = np * 4;
                sr += src[off]! * w;
                sg += src[off + 1]! * w;
                sb += src[off + 2]! * w;
                wSum += w;
              }
              const off = p * 4;
              tmpR[p] = wSum > 0 ? sr / wSum : src[off]!;
              tmpG[p] = wSum > 0 ? sg / wSum : src[off + 1]!;
              tmpB[p] = wSum > 0 ? sb / wSum : src[off + 2]!;
            }
          }
          for (let y = 0; y < outputHeight; y++) {
            const row = y * outputWidth;
            for (let x = 0; x < outputWidth; x++) {
              const p = row + x;
              let sr = 0,
                sg = 0,
                sb = 0,
                wSum = 0;
              for (let k = 0; k < 5; k++) {
                const ny = Math.min(outputHeight - 1, Math.max(0, y + offsets[k]!));
                const np = ny * outputWidth + x;
                const w = weights[k]! * Math.max(0.01, 1 - fg[np]!);
                sr += tmpR[np]! * w;
                sg += tmpG[np]! * w;
                sb += tmpB[np]! * w;
                wSum += w;
              }
              const off = p * 4;
              blurR[p] = wSum > 0 ? sr / wSum : src[off]!;
              blurG[p] = wSum > 0 ? sg / wSum : src[off + 1]!;
              blurB[p] = wSum > 0 ? sb / wSum : src[off + 2]!;
            }
          }
          const t = Math.min(1, Math.max(0, calmStrength / 100));
          const smoothMix = 0.72 * t;
          const desaturate = 0.96 * t;
          const contrastSoften = 0.14 * t;
          for (let p = 0; p < totalPixels; p++) {
            const fgVal = fg[p]!;
            if (fgVal >= 0.996) continue;
            const bgMask = 1 - fgVal;
            const off = p * 4;
            const or = src[off]!,
              og = src[off + 1]!,
              ob = src[off + 2]!;
            const mr = or + (blurR[p]! - or) * smoothMix;
            const mg = og + (blurG[p]! - og) * smoothMix;
            const mb = ob + (blurB[p]! - ob) * smoothMix;
            const lum = 0.299 * mr + 0.587 * mg + 0.114 * mb;
            const calmLum = lum + (128 - lum) * contrastSoften;
            const cr = mr + (calmLum - mr) * desaturate;
            const cg = mg + (calmLum - mg) * desaturate;
            const cb = mb + (calmLum - mb) * desaturate;
            data[off] = or + (cr - or) * bgMask;
            data[off + 1] = og + (cg - og) * bgMask;
            data[off + 2] = ob + (cb - ob) * bgMask;
          }
          context.putImageData(frame, 0, 0);
        }
      } finally {
        maskBitmap.close();
      }
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
