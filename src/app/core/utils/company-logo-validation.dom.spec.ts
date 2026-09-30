import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import {
  COMPANY_LOGO_MAX_BYTES,
  COMPANY_LOGO_MAX_DIMENSION,
  validateCompanyLogo,
} from './company-logo-validation';

function logoFile(type: string, name = 'logo.webp', size = 1024): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('Unternehmenslogo-Validierung', () => {
  it.each([
    ['image/png', 'logo.png', 'png'],
    ['image/jpeg', 'logo.jpeg', 'jpg'],
    ['image/webp', 'logo.webp', 'webp'],
  ] as const)('akzeptiert %s innerhalb der Grenzen', async (type, name, extension) => {
    const dimensions = vi.fn(async () => ({ width: 1200, height: 600 }));

    await expect(validateCompanyLogo(logoFile(type, name), dimensions)).resolves.toEqual({
      extension,
    });
    expect(dimensions).toHaveBeenCalledOnce();
  });

  it('weist SVG und unbekannte Dateitypen vor dem Bildlesen zurück', async () => {
    const dimensions = vi.fn(async () => ({ width: 100, height: 100 }));

    await expect(
      validateCompanyLogo(logoFile('image/svg+xml', 'logo.svg'), dimensions),
    ).rejects.toThrow('PNG, JPEG oder WebP');
    await expect(
      validateCompanyLogo(logoFile('application/octet-stream', 'logo.bin'), dimensions),
    ).rejects.toThrow('PNG, JPEG oder WebP');
    expect(dimensions).not.toHaveBeenCalled();
  });

  it('weist Dateien über 5 MiB vor dem Bildlesen zurück', async () => {
    const dimensions = vi.fn(async () => ({ width: 100, height: 100 }));

    await expect(
      validateCompanyLogo(
        logoFile('image/png', 'logo.png', COMPANY_LOGO_MAX_BYTES + 1),
        dimensions,
      ),
    ).rejects.toThrow('5 MiB');
    expect(dimensions).not.toHaveBeenCalled();
  });

  it('weist Bilder über 4096 Pixel Kantenlänge zurück', async () => {
    await expect(
      validateCompanyLogo(logoFile('image/webp'), async () => ({
        width: COMPANY_LOGO_MAX_DIMENSION + 1,
        height: 100,
      })),
    ).rejects.toThrow('4096');

    await expect(
      validateCompanyLogo(logoFile('image/webp'), async () => ({
        width: 100,
        height: COMPANY_LOGO_MAX_DIMENSION + 1,
      })),
    ).rejects.toThrow('4096');
  });

  it('leitet die Endung aus dem MIME-Typ statt aus einem unsicheren Dateinamen ab', async () => {
    await expect(
      validateCompanyLogo(logoFile('image/jpeg', '../../firma<script>.png'), async () => ({
        width: 100,
        height: 100,
      })),
    ).resolves.toEqual({ extension: 'jpg' });
  });
});
