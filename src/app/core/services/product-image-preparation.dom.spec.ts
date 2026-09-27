import imageCompression from 'browser-image-compression';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareProductImage } from './product-image-preparation';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));

describe('prepareProductImage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('begrenzt große Produktbilder und speichert das Ergebnis als WebP', async () => {
    const source = new File([new Uint8Array(2_000_000)], 'schuh.png', { type: 'image/png' });
    const compressed = new File([new Uint8Array(300_000)], 'result.webp', {
      type: 'image/webp',
    });
    vi.mocked(imageCompression).mockResolvedValueOnce(compressed);

    const result = await prepareProductImage(source);

    expect(imageCompression).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ maxWidthOrHeight: 1600, maxSizeMB: 0.8, fileType: 'image/webp' }),
    );
    expect(result.name).toBe('schuh.webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(300_000);
  });

  it('lässt kleine Bilder und animierbare GIFs unverändert', async () => {
    const small = new File(['klein'], 'schuh.jpg', { type: 'image/jpeg' });
    const gif = new File([new Uint8Array(2_000_000)], 'animation.gif', { type: 'image/gif' });
    expect(await prepareProductImage(small)).toBe(small);
    expect(await prepareProductImage(gif)).toBe(gif);
    expect(imageCompression).not.toHaveBeenCalled();
  });
});
