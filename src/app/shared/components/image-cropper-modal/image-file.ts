export const IMAGE_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

const extensions: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
};

/** Entspricht den Formaten des Medienuploads und dem Storage-Limit. */
export function imageFileError(file: File): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (!extensions[file.type]?.includes(extension)) {
    return 'Bitte JPG, PNG, WebP, GIF oder AVIF auswählen.';
  }
  if (file.size === 0) return 'Die Bilddatei ist leer.';
  if (file.size > 50 * 1024 * 1024) return 'Ein Bild darf höchstens 50 MB groß sein.';
  return null;
}
