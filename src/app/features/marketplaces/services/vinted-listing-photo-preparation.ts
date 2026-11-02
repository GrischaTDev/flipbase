import { vintedListingPhotoDimensions } from '../models/vinted-listing-source';

/** Neurendern entfernt EXIF/GPS und weitere Originalmetadaten ohne Beschnitt. */
export async function prepareVintedListingPhoto(
  blob: Blob,
  name: string,
  longestEdge: number | null,
): Promise<File> {
  if (
    blob.size < 1 ||
    blob.size > 52428800 ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(blob.type)
  )
    throw new Error('Das Foto muss ein JPG-, PNG- oder WebP-Bild bis 50 MB sein.');
  const bitmap = await createImageBitmap(blob);
  try {
    const dimensions = vintedListingPhotoDimensions(bitmap.width, bitmap.height, longestEdge);
    if (dimensions.width * dimensions.height > 40_000_000)
      throw new Error('Das Foto ist zu groß. Wähle eine kleinere Auflösung.');
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Die Bildbearbeitung ist nicht verfügbar.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('Das Foto konnte nicht vorbereitet werden.')),
        'image/jpeg',
        0.95,
      ),
    );
    return new File([output], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
