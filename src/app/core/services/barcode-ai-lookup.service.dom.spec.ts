import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodeAiLookupService, BarcodeAiResult } from './barcode-ai-lookup.service';
import { SupabaseService } from './supabase.service';

function createService(invoke: ReturnType<typeof vi.fn>): BarcodeAiLookupService {
  const injector = Injector.create({
    providers: [{ provide: SupabaseService, useValue: { client: { functions: { invoke } } } }],
  });
  return runInInjectionContext(injector, () => new BarcodeAiLookupService());
}

afterEach(() => vi.unstubAllGlobals());

describe('BarcodeAiLookupService', () => {
  it('sendet nur die normalisierte EAN und erfasst die Kosten jeder Suche', async () => {
    const result: BarcodeAiResult = {
      candidates: [],
      usage: { inputTokens: 500, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.01015 },
    };
    const invoke = vi.fn(async () => ({ data: result, error: null }));
    const service = createService(invoke);

    await service.search(' 4099758601276 ', null);
    await service.search('4099758601276', null);

    expect(invoke).toHaveBeenCalledWith('barcode-ai-search', {
      body: { ean: '4099758601276', imageDataUrls: [] },
    });
    expect(service.sessionUsage()).toEqual({ searches: 2, estimatedCostUsd: 0.0203 });
  });

  it('weist zu grosse Fotos vor einem API-Aufruf zurueck', async () => {
    const invoke = vi.fn();
    const service = createService(invoke);
    const file = new File([new Uint8Array(5_000_001)], 'etikett.jpg', { type: 'image/jpeg' });

    await expect(service.search('4099758601276', file)).rejects.toThrow('unter je 5 MB');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['4099758601276', '4099758601276'],
    ['', ''],
  ])('sendet ein Etikettfoto mit EAN "%s" an die Serverfunktion', async (ean, expectedEan) => {
    class TestFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(): void {
        this.result = 'data:image/jpeg;base64,dGVzdA==';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);
    const invoke = vi.fn(async () => ({
      data: {
        candidates: [],
        usage: {
          inputTokens: 500,
          outputTokens: 200,
          webSearchCalls: 1,
          estimatedCostUsd: 0.01015,
        },
      },
      error: null,
    }));
    const photo = new File(['test'], 'etikett.jpg', { type: 'image/jpeg' });

    await createService(invoke).search(ean, photo);

    expect(invoke).toHaveBeenCalledWith('barcode-ai-search', {
      body: { ean: expectedEan, imageDataUrls: ['data:image/jpeg;base64,dGVzdA=='] },
    });
  });

  it('sendet Karton- und Etikettfoto gemeinsam in der gewählten Reihenfolge', async () => {
    class TestFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      readAsDataURL(file: File): void {
        this.result = `data:image/jpeg;base64,${file.name}`;
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);
    const invoke = vi.fn(async () => ({
      data: {
        candidates: [],
        usage: { inputTokens: 0, outputTokens: 0, webSearchCalls: 0, estimatedCostUsd: 0 },
      },
      error: null,
    }));
    const photos = [
      new File(['box'], 'karton.jpg', { type: 'image/jpeg' }),
      new File(['label'], 'etikett.jpg', { type: 'image/jpeg' }),
    ];
    await createService(invoke).search('', photos);
    expect(invoke).toHaveBeenCalledWith('barcode-ai-search', {
      body: {
        ean: '',
        imageDataUrls: ['data:image/jpeg;base64,karton.jpg', 'data:image/jpeg;base64,etikett.jpg'],
      },
    });
  });

  it('verlangt eine EAN oder ein Etikettfoto', async () => {
    const invoke = vi.fn();
    await expect(createService(invoke).search('', null)).rejects.toThrow('Produktfoto');
    expect(invoke).not.toHaveBeenCalled();
  });
});
