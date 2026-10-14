import { describe, expect, it } from 'vitest';
import { parsePushPayload } from './web-push.models';
const payload = {
  version: 1,
  eventId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  category: 'order',
  title: 'Flipbase',
  body: 'Eine neue Bestellung ist eingegangen.',
  target: { kind: 'store_orders' },
};
describe('Push payload boundary', () => {
  it('accepts favorites only with a valid Vinted connection and matching category', () => {
    const favorite = {
      ...payload,
      category: 'favorite',
      target: { kind: 'vinted_favorites', connectionId: payload.workspaceId },
    };
    expect(parsePushPayload(favorite)).toEqual(favorite);
    expect(parsePushPayload({ ...favorite, category: 'message' })).toBeNull();
    expect(
      parsePushPayload({ ...favorite, target: { ...favorite.target, connectionId: 'invalid' } }),
    ).toBeNull();
  });
  it('accepts only category-compatible structured targets', () => {
    expect(parsePushPayload(payload)).toEqual(payload);
    expect(
      parsePushPayload({ ...payload, target: { kind: 'store_orders', url: 'https://evil.test' } }),
    ).toBeNull();
    expect(parsePushPayload({ ...payload, category: 'message' })).toBeNull();
    expect(parsePushPayload({ ...payload, version: 2 })).toBeNull();
    expect(parsePushPayload({ ...payload, eventId: 'not-an-id' })).toBeNull();
  });
});
