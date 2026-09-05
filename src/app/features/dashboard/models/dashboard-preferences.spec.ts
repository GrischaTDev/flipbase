import { describe, expect, it } from 'vitest';
import { parseDashboardPreferences } from './dashboard-preferences';

describe('parseDashboardPreferences', () => {
  it('uses defaults when preferences are missing', () => {
    expect(parseDashboardPreferences(undefined)).toEqual({ range: 'year', platform: 'all' });
  });

  it('defaults invalid fields independently', () => {
    expect(parseDashboardPreferences({ range: 'invalid', platform: 12 })).toEqual({
      range: 'year',
      platform: 'all',
    });
  });

  it('accepts supported ranges and non-empty platforms', () => {
    expect(parseDashboardPreferences({ range: 'last_7_days', platform: 'ebay' })).toEqual({
      range: 'last_7_days',
      platform: 'ebay',
    });
  });

  it('rejects empty and overlong platform names', () => {
    expect(parseDashboardPreferences({ range: 'today', platform: '' })).toEqual({
      range: 'today',
      platform: 'all',
    });
    expect(parseDashboardPreferences({ range: 'month', platform: 'x'.repeat(101) })).toEqual({
      range: 'month',
      platform: 'all',
    });
  });
});
