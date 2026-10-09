import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { createDefaultNegotiationConfig } from '../models/vinted-negotiation';
import { VintedNegotiationApiService } from './vinted-negotiation-api.service';
const scope = { workspaceId: 'workspace', connectionId: 'account' };
const config = createDefaultNegotiationConfig();
const response = { ok: true, enabled: false, active: false, version: 3, config, events: [] };
let rpc: ReturnType<typeof vi.fn>;
let api: VintedNegotiationApiService;
beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ data: response, error: null });
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
  });
  api = TestBed.inject(VintedNegotiationApiService);
});
afterEach(() => TestBed.resetTestingModule());
describe('Verhandlungs-RPC', () => {
  it('liest und speichert mit Scope, erwarteter Version und unabhängigen Schaltern', async () => {
    const settings = await api.read(scope);
    await api.save(settings, false, { ...config, purchaseEnabled: true });
    expect(rpc).toHaveBeenNthCalledWith(1, 'marketplace_read_negotiation', {
      p_workspace_id: 'workspace',
      p_connection_id: 'account',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'marketplace_save_negotiation', {
      p_workspace_id: 'workspace',
      p_connection_id: 'account',
      p_expected_version: 3,
      p_enabled: false,
      p_config: { ...config, purchaseEnabled: true },
    });
  });
  it('gibt die interne Nachrichtenkennung, Request-ID und Centpreise exakt weiter', async () => {
    rpc.mockResolvedValue({ data: { ok: true, id: 'job', state: 'queued' }, error: null });
    await api.enqueue(scope, 'conversation', 'message-id', 'request', 'accept', null);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_enqueue_negotiation', {
      p_workspace_id: 'workspace',
      p_connection_id: 'account',
      p_conversation_id: 'conversation',
      p_message_id: 'message-id',
      p_request_id: 'request',
      p_action: 'accept',
    });
    await api.enqueue(scope, 'conversation', 'message-id', 'request-2', 'counter', 3500);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_price_cents: 3500, p_action: 'counter' });
  });
  it('zeigt Versionskonflikt und Freigabefehler ohne interne Servertexte', async () => {
    for (const [code, text] of [
      ['40001', 'inzwischen geändert'],
      ['42501', 'Versandfreigabe'],
      ['22023', 'Eingaben'],
    ]) {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'secret' } });
      await expect(api.read(scope)).rejects.toThrow(text);
    }
  });
});
