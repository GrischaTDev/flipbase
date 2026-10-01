import { describe, expect, it } from 'vitest';
import {
  parseMarketplaceSyncSchedule,
  parseScheduledSyncAvailability,
} from './marketplace-sync-schedule';

const scope = {
  workspaceId: '25000000-0000-4000-8000-000000000011',
  connectionId: '25000000-0000-4000-8000-000000000021',
};
const schedule = {
  ...scope,
  enabled: false,
  intervalMinutes: 15,
  nextDueAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  pausedReason: null,
  retryAfter: null,
  authorizationVersion: 0,
};
describe('Automatische Vinted-Aktualisierung: Antwortvertrag', () => {
  it('liest den ausgeschalteten, kontogebundenen Ausgangsstand', () => {
    expect(parseMarketplaceSyncSchedule(schedule, scope)).toEqual(schedule);
  });
  it('verweigert einen fremden Kontostand und unbestätigte Felder', () => {
    for (const invalid of [
      { ...schedule, connectionId: 'foreign' },
      { ...schedule, enabled: 'true' },
      { ...schedule, intervalMinutes: 1 },
      { ...schedule, pausedReason: 'secret internal detail' },
      { ...schedule, lastSuccessAt: 'yesterday' },
      { ...schedule, authorizationVersion: -1 },
    ])
      expect(() => parseMarketplaceSyncSchedule(invalid, scope)).toThrow();
  });
  it('behauptet bei einem alten Worker keine automatische Aktualisierung', () => {
    expect(parseScheduledSyncAvailability({ ok: true, readOnly: false, apiVersion: 2 })).toEqual({
      enabled: false,
      allowedIntervals: [],
    });
  });
  it('gibt ausschließlich den ausdrücklich bestätigten Pilot frei', () => {
    expect(
      parseScheduledSyncAvailability({
        ok: true,
        readOnly: false,
        apiVersion: 2,
        scheduledSync: { enabled: true, authorizationVersion: 1, allowedIntervals: [15] },
      }),
    ).toEqual({ enabled: true, allowedIntervals: [15] });
    for (const scheduledSync of [
      { enabled: true, authorizationVersion: 3, allowedIntervals: [15] },
      { enabled: true, authorizationVersion: 1, allowedIntervals: [5, 10, 15] },
      { enabled: true, authorizationVersion: 1, allowedIntervals: [15, 15] },
    ])
      expect(
        parseScheduledSyncAvailability({ ok: true, readOnly: false, apiVersion: 2, scheduledSync })
          .enabled,
      ).toBe(false);
    expect(
      parseScheduledSyncAvailability({
        ok: true,
        readOnly: true,
        apiVersion: 2,
        scheduledSync: { enabled: true, authorizationVersion: 1, allowedIntervals: [15] },
      }).enabled,
    ).toBe(false);
  });
  it('liest einstellbare Abstände nur mit bestätigtem neuem Dienstvertrag', () => {
    const allowedIntervals = [3, 5, 10, 15, 30, 60];
    expect(
      parseScheduledSyncAvailability({
        ok: true,
        readOnly: false,
        apiVersion: 2,
        scheduledSync: { enabled: true, authorizationVersion: 2, allowedIntervals },
      }),
    ).toEqual({ enabled: true, allowedIntervals });
    expect(
      parseMarketplaceSyncSchedule({ ...schedule, intervalMinutes: 3 }, scope).intervalMinutes,
    ).toBe(3);
  });
});
