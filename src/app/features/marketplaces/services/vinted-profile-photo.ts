import imageCompression from 'browser-image-compression';
import type { VintedProfilePhoto } from '../models/vinted-profile-edit.models';

export async function prepareVintedProfilePhoto(
  file: File,
): Promise<{ photo: VintedProfilePhoto; preview: string }> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error('Wähle ein JPG-, PNG- oder WebP-Bild mit höchstens 5 MB.');
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.25,
    maxWidthOrHeight: 800,
    useWebWorker: false,
    fileType: 'image/jpeg',
    initialQuality: 0.9,
  });
  if (compressed.size > 256 * 1024)
    throw new Error('Das Profilbild konnte nicht ausreichend verkleinert werden.');
  const preview = await imageCompression.getDataUrlFromFile(compressed);
  const prefix = 'data:image/jpeg;base64,';
  if (!preview.startsWith(prefix))
    throw new Error('Das Profilbild konnte nicht verarbeitet werden.');
  return { photo: { mimeType: 'image/jpeg', base64: preview.slice(prefix.length) }, preview };
}
