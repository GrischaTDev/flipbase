import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceTestSessionApiService } from './marketplace-test-session-api.service';

const scope = {
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
};
const result = {
  ...scope,
  id: '25500000-0000-4000-8000-000000000031',
  state: 'active',
  expiresAt: '2026-09-27T10:00:00Z',
  interactionCount: 0,
};
let rpc: ReturnType<typeof vi.fn>;
let api: MarketplaceTestSessionApiService;

beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceTestSessionApiService,
      { provide: SupabaseService, useValue: { client: { rpc } } },
    ],
  });
  api = TestBed.inject(MarketplaceTestSessionApiService);
});

describe('API für künstliche Browsersitzungen', () => {
  it('startet nur mit festem Workspace und Konto', async () => {
    expect(await api.start(scope)).toEqual(result);
    expect(rpc).toHaveBeenCalledWith('marketplace_test_session_start', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
    });
  });

  it('fragt den Zustand mit demselben Kontobezug ab', async () => {
    await api.status(scope, result.id);
    expect(rpc).toHaveBeenCalledWith('marketplace_test_session_status', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_session_id: result.id,
    });
  });

  it('sendet nur eine ausdrücklich gewählte Testaktion', async () => {
    rpc.mockResolvedValue({ data: { ...result, accepted: true }, error: null });
    expect((await api.action(scope, result.id, 'ping')).accepted).toBe(true);
    expect(rpc).toHaveBeenCalledWith('marketplace_test_session_action', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_session_id: result.id,
      p_action: 'ping',
    });
  });

  it('verwirft Antworten für ein anderes Konto, statt sie anzuzeigen', async () => {
    rpc.mockResolvedValue({ data: { ...result, connectionId: 'foreign' }, error: null });
    await expect(api.start(scope)).rejects.toThrow('sicher zugeordnet');
  });

  it('verwirft eine Antwort mit fremder Sitzungs-ID', async () => {
    rpc.mockResolvedValue({
      data: { ...result, id: '25500000-0000-4000-8000-000000000032' },
      error: null,
    });
    await expect(api.status(scope, result.id)).rejects.toThrow('sicher zugeordnet');
  });

  it('meldet belegte Bedienung ohne erneuten Start', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55P03' } });
    await expect(api.start(scope)).rejects.toThrow('bereits bedient');
  });

  it('zeigt bei abgewiesenem Zugriff keine internen Serverdetails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'provider-secret' } });
    await expect(api.status(scope, result.id)).rejects.toThrow('keinen Zugriff');
  });
});
