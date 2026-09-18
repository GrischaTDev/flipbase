export const PRIVATE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const PRIVATE_DOCUMENT_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/xml': ['xml'],
  'text/xml': ['xml'],
};

export interface PrivateDocumentFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export function privateDocumentExtension(file: PrivateDocumentFile): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return PRIVATE_DOCUMENT_EXTENSIONS[file.type]?.includes(extension) ? extension : null;
}

export function validatePrivateDocumentFile(file: PrivateDocumentFile): Error | null {
  if (!privateDocumentExtension(file)) {
    return new Error(`${file.name}: Bitte eine PDF-, JPG-, PNG- oder XML-Datei auswählen.`);
  }
  if (file.size <= 0) return new Error(`${file.name}: Die Datei ist leer.`);
  if (file.size > PRIVATE_DOCUMENT_MAX_BYTES) {
    return new Error(`${file.name}: Die Datei ist größer als 20 MiB.`);
  }
  return null;
}
