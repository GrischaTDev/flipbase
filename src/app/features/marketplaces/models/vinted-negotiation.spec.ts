import { describe, expect, it } from 'vitest';
import {
  calculateNegotiationPrices,
  createDefaultNegotiationConfig,
  parseNegotiationSettings,
  parseNegotiationReceipt,
  validateCounterPrice,
} from './vinted-negotiation';
import { parseMarketplacePage } from './marketplace-response';
const scope = { workspaceId: 'workspace', connectionId: 'account' };
describe('Verhandlungsvertrag der Oberfläche', () => {
  it('bindet Antworten an den angeforderten Kontext und validiert Konfiguration und Status', () => {
    const response = {
      ok: true,
      enabled: false,
      active: false,
      version: 2,
      config: createDefaultNegotiationConfig(),
      events: [
        {
          id: 'job',
          action: 'accept',
          state: 'queued',
          errorCode: null,
          createdAt: '2026-10-09T12:00:00Z',
        },
      ],
    };
    expect(parseNegotiationSettings(response, scope)).toMatchObject({ ...scope, version: 2 });
    for (const invalid of [
      { ...response, ok: false },
      { ...response, version: -1 },
      { ...response, config: { ...response.config, stages: [100, 50] } },
      { ...response, events: [{ ...response.events[0], state: 'accepted' }] },
    ])
      expect(() => parseNegotiationSettings(invalid, scope)).toThrow();
    expect(parseNegotiationReceipt({ ok: true, id: 'job', state: 'queued' })).toEqual({
      id: 'job',
      state: 'queued',
    });
    expect(() => parseNegotiationReceipt({ ok: true, id: 'job', state: 'accepted' })).toThrow();
  });
  it('berechnet Anteile am Nachlass und prüft Preisbereiche', () => {
    const config = {
      ...createDefaultNegotiationConfig(),
      discountType: 'amount' as const,
      discountValue: 10,
    };
    expect(calculateNegotiationPrices(5000, config)).toEqual({
      minimumPriceCents: 4000,
      stagePriceCents: [4500, 4200, 4000],
    });
    expect(
      calculateNegotiationPrices(5000, {
        ...config,
        priceBands: [{ upToCents: 5000, discountType: 'percentage', discountValue: 20 }],
      }).stagePriceCents,
    ).toEqual([4500, 4200, 4000]);
    expect(() => calculateNegotiationPrices(1000, config)).toThrow();
  });
  it('weist falsche Gegenpreise und Bruchteile eines Cents zurück', () => {
    for (const price of [null, 0, 20, 24.99, 50.01, 35.001, NaN])
      expect(validateCounterPrice(price, 5000, 2000)).toBeNull();
    expect(validateCounterPrice(25, 5000, 2000)).toBe(2500);
    expect(validateCounterPrice(50, 5000, 2000)).toBe(5000);
  });
  it('übernimmt nur vollständige belegte Angebote und hält Angebots-ID getrennt', () => {
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
    const page = (candidate: unknown) =>
      parseMarketplacePage(
        {
          items: [
            {
              ...scope,
              id: 'message-id',
              conversationId: 'conversation',
              negotiationOffer: candidate,
            },
          ],
          total: 1,
          nextCursor: null,
        },
        scope,
        'conversation',
      );
    expect(page(offer).items[0].negotiationOffer?.offerId).toBe('123');
    expect(page(offer).items[0].id).toBe('message-id');
    for (const invalid of [
      { ...offer, offerId: undefined },
      { ...offer, status: 'accepted' },
      { ...offer, currency: 'USD' },
      { ...offer, offeredPriceCents: 1.5 },
      { ...offer, buyerId: '22' },
    ])
      expect(page(invalid).items[0].negotiationOffer).toBeNull();
  });
});
