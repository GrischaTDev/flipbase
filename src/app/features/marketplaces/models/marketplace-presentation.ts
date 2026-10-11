import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { ConnectionStatus } from './marketplace.models';
import type { MarketplaceSyncSchedule } from './marketplace-sync-schedule';

export const MARKETPLACE_CONNECTION_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  needs_login: 'Anmeldung ausstehend',
  connected: 'Verbunden',
  paused: 'Pausiert',
  blocked: 'Prüfung erforderlich',
  disconnected: 'Getrennt',
};
export const MARKETPLACE_CONNECTION_TONES: Readonly<Record<ConnectionStatus, BadgeTone>> = {
  needs_login: 'info',
  connected: 'success',
  paused: 'caution',
  blocked: 'critical',
  disconnected: 'neutral',
};

/**
 * Schild eines Cloud-Kontos. „Verbunden“ beschreibt nur die einmal bestätigte Anmeldung; ein
 * gestörter Abruf steht am Zeitplan. Gezeigt wird der schlechtere der beiden Zustände, damit
 * Kontenübersicht und Postfach dasselbe sagen. Eine bewusst pausierte Automatik ist keine Störung.
 */
export function presentVintedCloudStatus(
  status: ConnectionStatus,
  schedule: Pick<MarketplaceSyncSchedule, 'enabled' | 'pausedReason'> | null,
): { label: string; tone: BadgeTone } {
  const reason = status === 'connected' ? schedule?.pausedReason : null;
  if (!reason)
    return {
      label: MARKETPLACE_CONNECTION_LABELS[status],
      tone: MARKETPLACE_CONNECTION_TONES[status],
    };
  switch (reason) {
    case 'needs_login':
      return schedule?.enabled
        ? { label: 'Abruf wartet', tone: 'caution' }
        : { label: 'Anmeldung erforderlich', tone: 'critical' };
    case 'challenge':
      return { label: 'Prüfung erforderlich', tone: 'critical' };
    case 'forbidden':
      return { label: 'Abruf abgelehnt', tone: 'critical' };
    case 'retry_limit':
    case 'access_revoked':
      return { label: 'Abruf angehalten', tone: 'caution' };
    default:
      return { label: 'Abruf wartet', tone: 'caution' };
  }
}
