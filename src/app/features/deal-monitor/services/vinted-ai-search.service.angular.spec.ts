import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedAiSearchService } from './vinted-ai-search.service';

describe('VintedAiSearchService', () => {
  const invoke = vi.fn();
  let service: VintedAiSearchService;
  beforeEach(() => {
    invoke.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { functions: { invoke } } } }],
    });
    service = TestBed.inject(VintedAiSearchService);
  });
  it('überträgt nur IDs und Modell; Artikelinhalt kommt vom Server', async () => {
    invoke.mockResolvedValue({ data: { model: 'gpt-6-luna' }, error: null });
    await service.search('workspace', 'listing', 'gpt-6-luna');
    expect(invoke).toHaveBeenCalledWith('vinted-ai-search', {
      body: { workspaceId: 'workspace', listingId: 'listing', model: 'gpt-6-luna' },
    });
  });
  it('lädt den dauerhaften Verbrauch ohne neue Analyse', async () => {
    invoke.mockResolvedValue({ data: { stats: [{ requests: 3 }] }, error: null });
    expect(await service.usage('workspace')).toEqual([{ requests: 3 }]);
    expect(invoke).toHaveBeenCalledWith('vinted-ai-search', {
      body: { workspaceId: 'workspace', action: 'usage' },
    });
  });
  it('zeigt fehlenden Zugriff, Limits und Erfassungsfehler konkret an', async () => {
    for (const [code, message] of [
      ['forbidden', 'nur für Admins'],
      ['search_limit', 'Admin-Limit'],
      ['tracking_unavailable', 'Verbrauchserfassung'],
      ['analysis_incomplete', 'trotzdem erfasst'],
    ]) {
      invoke.mockResolvedValue({
        data: null,
        error: { context: Response.json({ error: code }, { status: 503 }) },
      });
      await expect(service.search('w', 'l', 'gpt-6-luna')).rejects.toThrow(message);
    }
  });
});
