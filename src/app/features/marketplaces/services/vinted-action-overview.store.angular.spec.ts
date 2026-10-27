import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ActionOverviewPreferencesService } from '../../../core/services/action-overview-preferences.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedActionOverviewApiService } from './vinted-action-overview-api.service';
import { VintedActionOverviewStore } from './vinted-action-overview.store';
import type { VintedAction } from '../models/vinted-action-overview';

const scope = { workspaceId: 'workspace', connectionId: 'account' };
const action: VintedAction = {
  id: 'negotiation:job',
  source: 'negotiation',
  sourceId: 'job',
  kind: 'accept',
  state: 'running',
  conversationId: 'conversation',
  messageId: 'message',
  offerId: '123',
  isAutomated: false,
  partnerName: 'Anna',
  itemTitle: 'Jacke',
  priceCents: 6000,
  currency: 'EUR',
  textPreview: null,
  createdAt: '2026-10-27T10:00:00Z',
  updatedAt: '2026-10-27T10:00:00Z',
  errorCode: null,
};
let account = signal({ ...scope, externalAccountId: 'seller', executionMode: 'cloud' });
let user = signal<{ id: string } | null>({ id: 'user' });
let canManage = signal(true);
let enabled = signal(false);
let read: ReturnType<typeof vi.fn>;
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  TestBed.tick();
}
beforeEach(() => {
  account = signal({ ...scope, externalAccountId: 'seller', executionMode: 'cloud' });
  user = signal({ id: 'user' });
  canManage = signal(true);
  enabled = signal(false);
  read = vi.fn().mockResolvedValue({ ...scope, actions: [action] });
  TestBed.configureTestingModule({
    providers: [
      VintedActionOverviewStore,
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: MarketplaceAccountStore, useValue: { selectedConnection: account, canManage } },
      { provide: ActionOverviewPreferencesService, useValue: { enabled } },
      { provide: VintedActionOverviewApiService, useValue: { read } },
    ],
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('Serverseitige Aktionsübersicht', () => {
  it('lädt belegte Aktionen auch bei ausgeblendeter Zusatzansicht für den Chatstatus', async () => {
    const store = TestBed.inject(VintedActionOverviewStore);
    await settle();
    expect(read).toHaveBeenCalledWith(scope);
    expect(store.pendingCount()).toBe(1);
    expect(store.actions()[0].state).toBe('running');
  });
  it('blendet alte Daten sofort bei Nutzer-, Konto- oder Rechtewechsel aus', async () => {
    const store = TestBed.inject(VintedActionOverviewStore);
    await settle();
    user.set(null);
    expect(store.actions()).toEqual([]);
    user.set({ id: 'user' });
    await settle();
    account.set({ ...account(), connectionId: 'other' });
    expect(store.actions()).toEqual([]);
    canManage.set(false);
    expect(store.actions()).toEqual([]);
  });
  it('ignoriert verspätete Antworten aus einem anderen Konto', async () => {
    let resolveOld: ((result: { actions: readonly VintedAction[] }) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const store = TestBed.inject(VintedActionOverviewStore);
    await settle();
    read.mockResolvedValue({ actions: [] });
    account.set({ ...account(), connectionId: 'other' });
    await settle();
    resolveOld?.({ actions: [action] });
    await settle();
    expect(store.actions()).toEqual([]);
  });
  it('behält bei einem Lesefehler den letzten Auftragsstatus und meldet den Abruffehler getrennt', async () => {
    const store = TestBed.inject(VintedActionOverviewStore);
    await settle();
    read.mockRejectedValueOnce(new Error('offline'));
    await store.refresh();
    expect(store.actions()[0].state).toBe('running');
    expect(store.error()).toContain('nicht geladen');
    read.mockResolvedValueOnce({ actions: [{ ...action, state: 'succeeded' }] });
    await store.refresh();
    expect(store.pendingCount()).toBe(0);
    expect(store.error()).toBeNull();
  });
  it('holt eine zweite Abfrage nach, wenn während des ersten Abrufs eine Aktion beauftragt wird', async () => {
    let resolveRead: ((result: { actions: readonly VintedAction[] }) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const store = TestBed.inject(VintedActionOverviewStore);
    await settle();
    void store.refresh();
    resolveRead?.({ actions: [] });
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.pendingCount()).toBe(1);
  });
});
