import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ServerStorageService } from './server-storage.service';

describe('ServerStorageService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('fragt nur den einen Messdatensatz über den vorhandenen Supabase-Zugang ab', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
    const service = TestBed.inject(ServerStorageService);
    expect(await service.load()).toBeNull();
    expect(from).toHaveBeenCalledWith('server_storage_status');
    expect(eq).toHaveBeenCalledWith('id', 1);
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'Kein Zugriff' } });
    await expect(service.load()).rejects.toThrow('Kein Zugriff');
  });
});
