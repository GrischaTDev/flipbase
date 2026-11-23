import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedBrandSearchService } from '../../../core/services/vinted-brand-search.service';
import { VintedCategoryService } from '../../../core/services/vinted-category.service';
import { PersonalFeedDraft } from '../models/deal-monitor.model';
import { DealMonitorService } from './deal-monitor.service';

const draft: PersonalFeedDraft = {
  id: null,
  title: 'Jacken',
  catalog_id: 1206,
  brand: null,
  brand_id: null,
  search_text: null,
  price_from: null,
  price_to: null,
  condition: null,
  audience: null,
  sizes: [],
};

function createService(rpc: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: VintedBrandSearchService, useValue: {} },
      { provide: VintedCategoryService, useValue: {} },
    ],
  });
  return TestBed.inject(DealMonitorService);
}

describe('Fehlermeldungen persönlicher Feeds', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    [
      '54000',
      'Diese Kategorie ist gerade ausgelastet. Starte einen Feed ohne Kategorie oder versuche es später.',
    ],
    ['54000', 'Du kannst höchstens zwölf Vinted-Feeds gleichzeitig starten.'],
    ['22023', 'Bitte wähle die Marke aus.'],
  ])('zeigt beim Starten die Servermeldung zu %s', async (code, message) => {
    const service = createService(vi.fn().mockResolvedValue({ error: { code, message } }));
    await expect(service.setActive('workspace-1', 'feed-1', true)).rejects.toThrow(message);
  });

  it('bleibt bei anderen Fehlern beim Starten und Stoppen bei der allgemeinen Meldung', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const service = createService(rpc);
    await expect(service.setActive('workspace-1', 'feed-1', true)).rejects.toThrow(
      'Feed konnte nicht gestartet werden.',
    );
    await expect(service.setActive('workspace-1', 'feed-1', false)).rejects.toThrow(
      'Feed konnte nicht gestoppt werden.',
    );
  });

  it('zeigt beim Speichern die Servermeldung zu 22023 und sonst die allgemeine Meldung', async () => {
    const message =
      'Bitte wähle eine Marke, eine Kategorie oder einen Suchbegriff mit mindestens drei Zeichen.';
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message } })
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'intern' } });
    const service = createService(rpc);
    await expect(service.save('workspace-1', draft)).rejects.toThrow(message);
    await expect(service.save('workspace-1', draft)).rejects.toThrow(
      'Feed konnte nicht gespeichert werden. Bitte prüfe deine Angaben.',
    );
  });
});
