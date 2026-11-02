import type { Page } from 'playwright';
import type {
  VintedListingPhotoOptions,
  VintedListingPhotoCrop,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';
/** Ausschließlich eine kurzlebige Uploaddatei. Das Original wird nie zurückgeschrieben. */
export async function exportVintedListingPhoto(
  page: Page,
  photo: MarketplaceListingPhoto,
  options: VintedListingPhotoOptions,
): Promise<MarketplaceListingPhoto> {
  const encoded = await page.evaluate(
    async (input: {
      base64: string;
      mimeType: string;
      resize: number | null;
      crop: VintedListingPhotoCrop | null;
    }) => {
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
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
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
    },
    {
      base64: Buffer.from(photo.bytes).toString('base64'),
      mimeType: photo.mimeType,
      resize: options.resize,
      crop: options.crops[photo.id] ?? null,
    },
  );
  return {
    id: photo.id,
    fileName: photo.fileName.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    bytes: new Uint8Array(Buffer.from(encoded, 'base64')),
  };
}
