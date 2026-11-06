import type { BetaApplication } from './beta-application.model';
import type { PlatformUser } from './platform-user.model';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENTLY_ACTIVE_DAYS = 7;
export const INACTIVE_AFTER_DAYS = 30;

export interface PlatformOverviewMetrics {
  readonly registeredUsers: number;
  readonly recentlyActiveUsers: number;
  readonly inactiveUsers: number;
  readonly activeAccesses: number;
  readonly openApplications: number;
}

export interface PlatformUserActivity {
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly lastSeenAt: string | null;
}

/**
 * Angenommene Bewerbung, deren Einladung noch nicht eingelöst wurde. Das Konto
 * existiert dann schon technisch, die Person hat sich aber nie angemeldet.
 * Direkt angelegte Konten ohne Bewerbung (etwa Betreiber) zählen als Nutzer.
 */
export function isPendingInvitation(
  user: Pick<PlatformUser, 'registeredAt' | 'applicationStatus'>,
): boolean {
  return !user.registeredAt && user.applicationStatus === 'accepted';
}

/** Letzter bekannter Kontakt: Anmeldung oder dokumentierte Aktion, je nachdem was später war. */
export function lastSeenAt(
  user: Pick<PlatformUser, 'lastSignInAt' | 'lastActionAt'>,
): string | null {
  const times = [user.lastSignInAt, user.lastActionAt]
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

export function seenWithin(
  user: Pick<PlatformUser, 'lastSignInAt' | 'lastActionAt'>,
  days: number,
  now: number,
): boolean {
  const seen = lastSeenAt(user);
  return seen !== null && now - Date.parse(seen) <= days * DAY_MS;
}

export function platformOverviewMetrics(
  users: readonly PlatformUser[],
  applications: readonly Pick<BetaApplication, 'status'>[],
  now: number,
): PlatformOverviewMetrics {
  const registered = users.filter((user) => !isPendingInvitation(user));
  return {
    registeredUsers: registered.length,
    recentlyActiveUsers: registered.filter((user) => seenWithin(user, RECENTLY_ACTIVE_DAYS, now))
      .length,
    inactiveUsers: registered.filter((user) => !seenWithin(user, INACTIVE_AFTER_DAYS, now)).length,
    activeAccesses: registered.filter((user) => user.licenseStatus === 'active').length,
    openApplications: applications.filter((application) => application.status === 'open').length,
  };
}

/** Die zuletzt gesehenen Konten, neueste zuerst; nie gesehene Konten stehen am Ende. */
export function recentPlatformActivity(
  users: readonly PlatformUser[],
  limit: number,
): readonly PlatformUserActivity[] {
  return users
    .filter((user) => !isPendingInvitation(user))
    .map((user) => ({
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      lastSeenAt: lastSeenAt(user),
    }))
    .sort((left, right) => {
      if (left.lastSeenAt === right.lastSeenAt) return left.fullName.localeCompare(right.fullName);
      if (!left.lastSeenAt) return 1;
      if (!right.lastSeenAt) return -1;
      return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
    })
    .slice(0, limit);
}
