import imageCompression from 'browser-image-compression';

/** Begrenzt neue Produktbilder auf eine für Detailansichten geeignete Größe. */
export async function prepareProductImage(file: File): Promise<File> {
  // Animationen bleiben erhalten; AVIF ist bereits für kleine Dateien optimiert.
  if (file.size <= 800_000 || file.type === 'image/gif' || file.type === 'image/avif') return file;

  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.85,
  });
  if (compressed.size >= file.size) return file;
  return new File([compressed], file.name.replace(/\.[^.]+$/u, '.webp'), {
    type: 'image/webp',
    lastModified: file.lastModified,
  });
}
