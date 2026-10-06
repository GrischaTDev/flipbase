import { describe, expect, it } from 'vitest';
import {
  parseFavoriteMessageSettings,
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
