import { describe, expect, it } from 'vitest';
import type { PlatformUser } from './platform-user.model';
import {
  lastSeenAt,
  platformOverviewMetrics,
  recentPlatformActivity,
} from './platform-overview-metrics';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const user = (overrides: Partial<PlatformUser> = {}): PlatformUser => ({
  userId: overrides.userId ?? 'user',
  fullName: 'Anna Beispiel',
  email: 'anna@example.test',
  workspaceId: 'workspace',
  workspaceName: 'Anna Handel',
  applicationStatus: 'accepted',
  invitationStatus: 'sent',
  registeredAt: daysAgo(60),
  licenseStatus: 'active',
  betaStartsAt: null,
  betaEndsAt: null,
  lastSignInAt: null,
  lastActionAt: null,
  purchasesCreated30Days: 0,
  salesRecorded30Days: 0,
  isPlatformOperator: false,
  ...overrides,
});

describe('Kennzahlen der Admin-Übersicht', () => {
  it('nimmt den späteren Zeitpunkt aus Anmeldung und Aktion', () => {
    expect(lastSeenAt({ lastSignInAt: daysAgo(5), lastActionAt: daysAgo(1) })).toBe(daysAgo(1));
    expect(lastSeenAt({ lastSignInAt: daysAgo(2), lastActionAt: null })).toBe(daysAgo(2));
    expect(lastSeenAt({ lastSignInAt: null, lastActionAt: null })).toBeNull();
  });

  it('zählt Konten ohne offene Einladung und trennt aktiv von länger inaktiv', () => {
    const metrics = platformOverviewMetrics(
      [
        user({ userId: 'recent', lastActionAt: daysAgo(2) }),
        user({ userId: 'week-edge', lastSignInAt: daysAgo(7) }),
        user({ userId: 'between', lastSignInAt: daysAgo(20), licenseStatus: 'expired' }),
        user({ userId: 'old', lastSignInAt: daysAgo(31), licenseStatus: 'suspended' }),
        user({ userId: 'never', licenseStatus: 'pending' }),
        user({ userId: 'invited', registeredAt: null, lastSignInAt: daysAgo(1) }),
        user({
          userId: 'direct-account',
          registeredAt: null,
          applicationStatus: null,
          licenseStatus: null,
          lastSignInAt: daysAgo(3),
        }),
      ],
      [{ status: 'open' }, { status: 'open' }, { status: 'accepted' }, { status: 'rejected' }],
      NOW,
    );

    expect(metrics).toEqual({
      registeredUsers: 6,
      recentlyActiveUsers: 3,
      inactiveUsers: 2,
      activeAccesses: 2,
      openApplications: 2,
    });
  });

  it('listet die zuletzt aktiven Konten zuerst und nie aktive am Ende', () => {
    const activity = recentPlatformActivity(
      [
        user({ userId: 'never', fullName: 'Bea' }),
        user({ userId: 'older', lastSignInAt: daysAgo(10) }),
        user({ userId: 'newest', lastActionAt: daysAgo(1) }),
        user({ userId: 'invited', registeredAt: null, lastActionAt: daysAgo(0) }),
      ],
      3,
    );

    expect(activity.map((entry) => entry.userId)).toEqual(['newest', 'older', 'never']);
  });
});
