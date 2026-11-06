import { describe, expect, it } from 'vitest';
import type { PlatformUser } from './platform-user.model';
import {
  PLATFORM_USER_FILTERS,
  hasEndedAccess,
  matchesPlatformUserFilter,
} from './platform-user-filter';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const user = (userId: string, overrides: Partial<PlatformUser> = {}): PlatformUser => ({
  userId,
  fullName: userId,
  email: `${userId}@example.test`,
  workspaceId: null,
  workspaceName: null,
  applicationStatus: 'accepted',
  invitationStatus: 'sent',
  registeredAt: daysAgo(90),
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

const users = [
  user('admin', { isPlatformOperator: true, lastSignInAt: daysAgo(1) }),
  user('active', { lastActionAt: daysAgo(29) }),
  user('inactive', { lastSignInAt: daysAgo(31) }),
  user('expired', { licenseStatus: 'expired', lastSignInAt: daysAgo(3) }),
  user('ran-out', { betaEndsAt: daysAgo(1) }),
  user('suspended', { licenseStatus: 'suspended' }),
  user('ended', { betaEndedAt: daysAgo(2) }),
  user('invited', { registeredAt: null, licenseStatus: null }),
  user('direct', { registeredAt: null, applicationStatus: null, lastSignInAt: daysAgo(2) }),
];

const matching = (filter: (typeof PLATFORM_USER_FILTERS)[number]['value']) =>
  users.filter((entry) => matchesPlatformUserFilter(entry, filter, NOW)).map((e) => e.userId);

describe('Filter der Nutzerverwaltung', () => {
  it('bietet die Filter in fester Reihenfolge an', () => {
    expect(PLATFORM_USER_FILTERS.map((filter) => filter.label)).toEqual([
      'Alle',
      'Admins',
      'Aktiv',
      'Inaktiv',
      'Beta beendet',
      'Eingeladen',
    ]);
  });

  it('ordnet jedes Konto dem passenden Filter zu', () => {
    expect(matching('all')).toHaveLength(users.length);
    expect(matching('admins')).toEqual(['admin']);
    expect(matching('active')).toEqual(['admin', 'active', 'expired', 'direct']);
    expect(matching('inactive')).toEqual(['inactive', 'ran-out', 'suspended', 'ended']);
    expect(matching('ended')).toEqual(['expired', 'ran-out', 'suspended', 'ended']);
    expect(matching('invited')).toEqual(['invited']);
  });

  it('wertet ein Laufzeitende genau zum Zeitpunkt als beendet', () => {
    expect(hasEndedAccess(user('edge', { betaEndsAt: new Date(NOW).toISOString() }), NOW)).toBe(
      true,
    );
    expect(hasEndedAccess(user('edge', { betaEndsAt: new Date(NOW + 1).toISOString() }), NOW)).toBe(
      false,
    );
  });
});
