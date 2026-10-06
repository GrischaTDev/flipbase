import { describe, expect, it } from 'vitest';
import {
  parseFavoriteMessageSettings,
  favoriteOfferPriceCents,
  validateFavoriteMessageConfig,
  type FavoriteMessageConfig,
} from './vinted-favorite-messages';
const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const config: FavoriteMessageConfig = {
  templates: ['Danke für Dein Interesse!'],
  rules: [],
  delayMinutes: 0,
  timezone: 'Europe/Berlin',
};
const settings = {
  ...scope,
  enabled: false,
  active: false,
  version: 0,
  config: null,
  lastCheckedAt: null,
  events: [],
};
describe('Vinted favorite message settings', () => {
  it('calculates exact cents and refuses silently clamped or unchanged prices', () => {
    expect(favoriteOfferPriceCents(4000, { type: 'amount', value: 5 })).toBe(3500);
    expect(favoriteOfferPriceCents(4000, { type: 'percentage', value: 10 })).toBe(3600);
    expect(favoriteOfferPriceCents(999, { type: 'percentage', value: 10 })).toBe(899);
    expect(favoriteOfferPriceCents(600, { type: 'amount', value: 5 })).toBeNull();
    expect(favoriteOfferPriceCents(1, { type: 'percentage', value: 10 })).toBeNull();
  });
  it('rejects invalid discounts while keeping legacy settings without offers valid', () => {
    for (const offer of [
      { type: 'percentage', value: 51 },
      { type: 'percentage', value: 0 },
      { type: 'amount', value: -5 },
      { type: 'amount', value: 0.001 },
      { type: 'amount', value: Number.NaN },
      { type: 'unknown', value: 10 },
    ]) {
      expect(validateFavoriteMessageConfig({ ...config, offer } as FavoriteMessageConfig)).toBe(
        false,
      );
    }
    expect(validateFavoriteMessageConfig({ ...config, offer: null })).toBe(true);
    expect(validateFavoriteMessageConfig({ ...config, offer: { type: 'amount', value: 5 } })).toBe(
      true,
    );
    expect(
      validateFavoriteMessageConfig({ ...config, offer: { type: 'percentage', value: 10 } }),
    ).toBe(true);
  });
  it('accepts a disabled unconfigured account and rejects another account response', () => {
    expect(parseFavoriteMessageSettings(settings, scope)).toEqual(settings);
    expect(() =>
      parseFavoriteMessageSettings({ ...settings, connectionId: 'other' }, scope),
    ).toThrow();
  });
  it('bounds texts and rejects invalid or missing journal data', () => {
    expect(validateFavoriteMessageConfig(config)).toBe(true);
    expect(validateFavoriteMessageConfig({ ...config, templates: ['\u0000'] })).toBe(false);
    expect(validateFavoriteMessageConfig({ ...config, delayMinutes: 10081 })).toBe(false);
    expect(() =>
      parseFavoriteMessageSettings({ ...settings, config: { ...config, rules: [null] } }, scope),
    ).toThrow();
    expect(() => parseFavoriteMessageSettings({ ...settings, events: [{}] }, scope)).toThrow();
  });
  it('accepts overnight rules and rejects partial windows and inverted prices', () => {
    const rule = {
      name: 'Nacht',
      startHour: 22,
      endHour: 8,
      days: [1],
      minPrice: 10,
      maxPrice: 20,
      templates: ['Guten Abend!'],
    };
    expect(validateFavoriteMessageConfig({ ...config, rules: [rule] })).toBe(true);
    for (const invalid of [
      { ...rule, endHour: null },
      { ...rule, days: [8] },
      { ...rule, minPrice: 21 },
    ])
      expect(validateFavoriteMessageConfig({ ...config, rules: [invalid] })).toBe(false);
  });
});
