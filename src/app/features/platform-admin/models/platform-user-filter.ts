import { INACTIVE_AFTER_DAYS, isPendingInvitation, seenWithin } from './platform-overview-metrics';
import type { PlatformUser } from './platform-user.model';

export type PlatformUserFilter = 'all' | 'admins' | 'active' | 'inactive' | 'ended' | 'invited';

export const PLATFORM_USER_FILTERS: readonly { value: PlatformUserFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'admins', label: 'Admins' },
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Inaktiv' },
  { value: 'ended', label: 'Beta beendet' },
  { value: 'invited', label: 'Eingeladen' },
];

/** Ein beendeter Zugang: abgelaufen, gesperrt oder vom Betreiber beendet. */
export function hasEndedAccess(
  user: Pick<PlatformUser, 'licenseStatus' | 'betaEndedAt' | 'betaEndsAt'>,
  now: number,
): boolean {
  return (
    !!user.betaEndedAt ||
    user.licenseStatus === 'expired' ||
    user.licenseStatus === 'suspended' ||
    (user.betaEndsAt !== null && Date.parse(user.betaEndsAt) <= now)
  );
}

export function matchesPlatformUserFilter(
  user: PlatformUser,
  filter: PlatformUserFilter,
  now: number,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'admins':
      return user.isPlatformOperator;
    case 'active':
      return !isPendingInvitation(user) && seenWithin(user, INACTIVE_AFTER_DAYS, now);
    case 'inactive':
      return !isPendingInvitation(user) && !seenWithin(user, INACTIVE_AFTER_DAYS, now);
    case 'ended':
      return hasEndedAccess(user, now);
    case 'invited':
      return isPendingInvitation(user);
  }
}
