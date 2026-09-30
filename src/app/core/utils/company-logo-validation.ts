export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const COMPANY_LOGO_MAX_DIMENSION = 4096;

export type CompanyLogoExtension = 'png' | 'jpg' | 'webp';

const EXTENSION_BY_MIME: Readonly<Record<string, CompanyLogoExtension>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

async function readCompanyLogoDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  if (typeof Image === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('Die Bildabmessungen konnten nicht geprüft werden.');
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Unternehmenslogo konnte nicht gelesen werden.'));
    };
    image.src = url;
  });
}

export async function validateCompanyLogo(
  file: File,
  readDimensions: (
    file: File,
  ) => Promise<{ width: number; height: number }> = readCompanyLogoDimensions,
): Promise<{ extension: CompanyLogoExtension }> {
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    throw new Error('Bitte verwende für das Unternehmenslogo PNG, JPEG oder WebP.');
  }
  if (file.size <= 0) {
    throw new Error('Die Logodatei ist leer.');
  }
  if (file.size > COMPANY_LOGO_MAX_BYTES) {
    throw new Error('Das Unternehmenslogo darf höchstens 5 MiB groß sein.');
  }

  const { width, height } = await readDimensions(file);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Die Bildabmessungen des Unternehmenslogos sind ungültig.');
  }
  if (width > COMPANY_LOGO_MAX_DIMENSION || height > COMPANY_LOGO_MAX_DIMENSION) {
    throw new Error('Das Unternehmenslogo darf höchstens 4096 × 4096 Pixel groß sein.');
  }

  return { extension };
}
