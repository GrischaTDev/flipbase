import { beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import { ProductSearchPhotoService } from './product-search-photo.service';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));

describe('ProductSearchPhotoService', () => {
  const service = new ProductSearchPhotoService();

  beforeEach(() => vi.clearAllMocks());

  it('verkleinert ein iPad-Foto vor der 5-MB-Prüfung und benennt die JPEG-Datei passend', async () => {
    const original = new File([new Uint8Array(7_000_000)], 'karton.png', {
      type: 'image/png',
    });
    const compressed = new File([new Uint8Array(1_400_000)], 'karton.png', {
      type: 'image/jpeg',
    });
    vi.mocked(imageCompression).mockResolvedValueOnce(compressed);

    const result = await service.prepare(original);

    expect(imageCompression).toHaveBeenCalledWith(
      original,
      expect.objectContaining({
        maxSizeMB: 2,
        maxWidthOrHeight: 2400,
        fileType: 'image/jpeg',
      }),
    );
    expect(result.name).toBe('karton.jpg');
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBe(1_400_000);
  });

  it('behält die 5-MB-Grenze auch nach erfolgloser Verkleinerung bei', async () => {
    const original = new File([new Uint8Array(7_000_000)], 'schuh.jpg', {
      type: 'image/jpeg',
    });
    const compressed = new File([new Uint8Array(5_500_000)], 'schuh.jpg', {
      type: 'image/jpeg',
    });
    vi.mocked(imageCompression).mockResolvedValueOnce(compressed);

    await expect(service.prepare(original)).rejects.toThrow('größer als 5 MB');
  });

  it('meldet einen Dekodierfehler verständlich', async () => {
    const original = new File(['defekt'], 'etikett.jpg', { type: 'image/jpeg' });
    vi.mocked(imageCompression).mockRejectedValueOnce(new Error('decode failed'));

    await expect(service.prepare(original)).rejects.toThrow('konnte nicht verkleinert werden');
  });
});
