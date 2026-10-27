import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedMessagingStore } from '../../services/vinted-messaging.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedNegotiationApiService } from '../../services/vinted-negotiation-api.service';
import { VintedActionOverviewStore } from '../../services/vinted-action-overview.store';
import { VintedOfferActionsComponent } from './vinted-offer-actions.component';
import { parseMarketplacePage } from '../../models/marketplace-response';
const scope = { workspaceId: 'workspace', connectionId: 'account' };
const offer = {
  offerId: '123',
  transactionId: '456',
  itemId: '789',
  buyerId: '11',
  sellerId: '22',
  originalPriceCents: 5000,
  offeredPriceCents: 2000,
  currency: 'EUR',
  status: 'pending',
};
const entry = parseMarketplacePage(
  {
    items: [
      { ...scope, id: 'message-id', conversationId: 'conversation', negotiationOffer: offer },
    ],
    total: 1,
    nextCursor: null,
  },
  scope,
  'conversation',
).items[0];
const account = signal({
  ...scope,
  externalAccountId: '22',
  executionMode: 'cloud',
  status: 'connected',
});
const permission = signal(true);
const selection = signal(0);
let api: { enqueue: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> };
beforeEach(() => {
  account.set({ ...scope, externalAccountId: '22', executionMode: 'cloud', status: 'connected' });
  permission.set(true);
  selection.set(0);
  api = {
    enqueue: vi.fn().mockResolvedValue({ id: 'job', state: 'queued' }),
    read: vi.fn().mockResolvedValue({ events: [{ id: 'job', state: 'sent' }] }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user' }) } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection: account,
          canManage: () => true,
          selectionVersion: selection,
          selectedConversationId: () => 'conversation',
        },
      },
      {
        provide: VintedMessagingStore,
        useValue: { canSend: () => true, cloudSendAllowed: permission },
      },
      { provide: VintedLocalExtensionStore, useValue: {} },
      { provide: VintedNegotiationApiService, useValue: api },
    ],
  });
  TestBed.overrideComponent(VintedOfferActionsComponent, {
    set: { template: '', templateUrl: undefined, imports: [] },
  });
});
afterEach(() => TestBed.resetTestingModule());
function create() {
  const fixture = TestBed.createComponent(VintedOfferActionsComponent);
  const component = fixture.componentInstance;
  Object.defineProperty(component, 'entry', { value: signal(entry), configurable: true });
  Object.defineProperty(component, 'available', { value: signal(true) });
  TestBed.tick();
  return { fixture, component };
}
describe('Manuelle Angebotsaktionen', () => {
  it('stellt den Angebotsbeleg nach Neuladen aus der serverseitigen Übersicht wieder her', async () => {
    const overviewActions = signal([
      {
        source: 'negotiation',
        sourceId: 'restored-job',
        kind: 'accept',
        state: 'queued',
        messageId: entry.id,
        conversationId: entry.conversationId,
        offerId: offer.offerId,
        createdAt: '2026-10-27T10:00:00Z',
      },
    ]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VintedActionOverviewStore,
          useValue: {
            actions: overviewActions,
            enabled: () => true,
            hasLoaded: () => true,
            refresh: vi.fn(),
          },
        },
      ],
    });
    const { component } = create();
    expect(component.receipt()).toEqual({ id: 'restored-job', action: 'accept', state: 'queued' });
    expect(component.receiptLabel()).toBe('Annahme beauftragt');
    await component.queue('accept');
    expect(api.enqueue).not.toHaveBeenCalled();
    overviewActions.set([{ ...overviewActions()[0], state: 'outcome_unknown' }]);
    expect(component.receiptLabel()).not.toContain('angenommen');
    overviewActions.set([{ ...overviewActions()[0], state: 'succeeded' }]);
    TestBed.tick();
    overviewActions.set([]);
    expect(component.receipt()?.state).toBe('sent');
  });
  it('ordnet einen alten Beleg nicht einem anderen Angebot derselben Nachricht zu', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VintedActionOverviewStore,
          useValue: {
            actions: () => [
              {
                source: 'negotiation',
                sourceId: 'old',
                kind: 'accept',
                state: 'succeeded',
                messageId: entry.id,
                conversationId: entry.conversationId,
                offerId: 'other',
              },
            ],
            enabled: () => true,
            hasLoaded: () => true,
          },
        },
      ],
    });
    expect(create().component.receipt()).toBeNull();
  });
  it('erhält manuelle Übernahme bei einem wartenden automatischen Angebotsauftrag', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VintedActionOverviewStore,
          useValue: {
            actions: () => [
              {
                source: 'negotiation',
                sourceId: 'automatic',
                kind: 'counter',
                state: 'queued',
                messageId: entry.id,
                conversationId: entry.conversationId,
                offerId: offer.offerId,
                isAutomated: true,
              },
            ],
            enabled: () => true,
            hasLoaded: () => true,
            refresh: vi.fn(),
          },
        },
      ],
    });
    const { component } = create();
    expect(component.receipt()).toBeNull();
    await component.queue('accept');
    expect(api.enqueue).toHaveBeenCalledOnce();
  });
  it('sperrt neue Schreibaufträge bis nach dem ersten bestätigten Statusabruf', async () => {
    const hasLoaded = signal(false);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VintedActionOverviewStore,
          useValue: { actions: () => [], enabled: () => false, hasLoaded, error: () => null },
        },
      ],
    });
    const { component } = create();
    await component.queue('accept');
    component.openCounter();
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(component.dialogOpen()).toBe(false);
    hasLoaded.set(true);
    await component.queue('accept');
    expect(api.enqueue).toHaveBeenCalledOnce();
  });
  it('verhindert Doppelklick und zeigt queued erst nach bestätigtem Verlauf als sent', async () => {
    const { component } = create();
    await Promise.all([component.queue('accept'), component.queue('accept')]);
    expect(api.enqueue).toHaveBeenCalledOnce();
    expect(component.receipt()?.state).toBe('queued');
    await component.refresh();
    expect(component.receipt()?.state).toBe('sent');
  });
  it('behält Request-ID bei unklarer Antwort auch nach erneutem Öffnen und sperrt andere Aktionen', async () => {
    api.enqueue.mockRejectedValueOnce(new Error('Unklare Antwort'));
    const first = create();
    await first.component.queue('accept');
    const request = api.enqueue.mock.calls[0][3];
    first.fixture.destroy();
    const second = create();
    await second.component.queue('decline');
    expect(api.enqueue).toHaveBeenCalledOnce();
    await second.component.queue('accept');
    expect(api.enqueue.mock.calls[1][3]).toBe(request);
  });
  it('validiert den Gegenpreisdialog und sendet nur ganze Centwerte', async () => {
    const { component } = create();
    component.openCounter();
    expect(component.dialogOpen()).toBe(true);
    component.counterPrice.setValue(20);
    expect(component.counterPreview()).toBeNull();
    await component.queue('counter');
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(component.error()).toContain('centgenauen');
    component.counterPrice.setValue(35);
    expect(component.counterPreview()).toEqual({ priceCents: 3500, discountCents: 1500 });
    expect(api.enqueue).not.toHaveBeenCalled();
    await component.queue('counter');
    expect(api.enqueue.mock.calls[0].slice(4)).toEqual(['counter', 3500]);
    expect(component.dialogOpen()).toBe(false);
  });
  it('berechnet die Vorschau aus aktuellen strukturierten Preisen und blendet ungültige Centpreise aus', () => {
    const { component } = create();
    component.counterPrice.setValue(35.001);
    expect(component.counterPreview()).toBeNull();
    component.counterPrice.setValue(35);
    expect(component.counterPreview()?.discountCents).toBe(1500);
    const changed = signal({
      ...entry,
      negotiationOffer: { ...entry.negotiationOffer, ...offer, originalPriceCents: 6000 },
    });
    Object.defineProperty(component, 'entry', { value: changed, configurable: true });
    component.counterPrice.setValue(36);
    expect(component.counterPreview()).toEqual({ priceCents: 3600, discountCents: 2400 });
    component.counterPrice.setValue(29);
    expect(component.counterPreview()).toBeNull();
    expect(api.enqueue).not.toHaveBeenCalled();
  });
  it('sperrt bei fehlender Freigabe und übernimmt keine verspätete Antwort eines anderen Kontos', async () => {
    const { component } = create();
    permission.set(false);
    await component.queue('accept');
    expect(api.enqueue).not.toHaveBeenCalled();
    permission.set(true);
    let resolve: (receipt: { id: string; state: string }) => void = () => undefined;
    api.enqueue.mockImplementation(
      () =>
        new Promise((complete) => {
          resolve = complete;
        }),
    );
    const request = component.queue('accept');
    account.update((current) => ({ ...current, connectionId: 'other' }));
    selection.set(1);
    TestBed.tick();
    resolve({ id: 'job', state: 'queued' });
    await request;
    expect(component.dialogOpen()).toBe(false);
    await component.queue('decline');
    expect(api.enqueue).toHaveBeenCalledOnce();
  });
});
