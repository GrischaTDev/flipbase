import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { readerDetail, readerPage } from '../test-support/label-reader.fixtures';
import { BrandLabelReaderService } from './brand-label-reader.service';

const filter = { brandSlug: 'nike', query: "x%_' OR 1=1", decade: 1990, kind: null } as const;
describe('BrandLabelReaderService', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(data: unknown, error: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data, error });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    return { service: TestBed.inject(BrandLabelReaderService), rpc };
  }
  it('liest normalisierte Seiten ausschließlich über den bestehenden RPC-Zugang', async () => {
    const { service, rpc } = setup(readerPage());
    expect(await service.list(filter, 24)).toEqual(readerPage());
    expect(rpc).toHaveBeenCalledWith('list_label_references', { p_filter: filter, p_offset: 24 });
  });
  it('holt Details getrennt vom Entwurf und behält Nichtverfügbarkeit als null', async () => {
    const { service, rpc } = setup(readerDetail());
    expect(await service.detail('testmarke', 'testetikett-1')).toEqual(readerDetail());
    expect(rpc).toHaveBeenCalledWith('get_label_reference', {
      p_brand_slug: 'testmarke',
      p_label_slug: 'testetikett-1',
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await service.detail('testmarke', 'fehlend')).toBeNull();
  });
  it('verlangt echte boolesche Verfügbarkeit statt einer beliebigen erfolgreichen Antwort', async () => {
    const { service, rpc } = setup({ visible: false, operator: true });
    expect(await service.availability()).toEqual({ visible: false, operator: true });
    rpc.mockResolvedValueOnce({ data: { visible: 'true', operator: true }, error: null });
    await expect(service.availability()).rejects.toMatchObject({ reason: 'invalid-response' });
  });
  it('übernimmt keine SQL- oder Tokenmeldungen in Fehlertexte', async () => {
    const { service } = setup(null, { code: '42501', message: 'private/path secret_token' });
    await expect(service.list(filter, 0)).rejects.toMatchObject({ reason: 'unavailable' });
    await expect(service.list(filter, 0)).rejects.not.toThrow(/private|secret/);
  });
  it('behandelt fehlende Releasefunktionen und Netzwerkfehler ausdrücklich, ohne Demoantwort', async () => {
    const { service, rpc } = setup(null, { code: 'PGRST202' });
    await expect(service.availability()).rejects.toMatchObject({ reason: 'unavailable' });
    rpc.mockRejectedValueOnce(new Error('internal-host-name'));
    await expect(service.availability()).rejects.toMatchObject({ reason: 'network' });
  });
});
