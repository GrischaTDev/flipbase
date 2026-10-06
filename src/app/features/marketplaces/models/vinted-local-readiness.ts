import type { BadgeTone } from '../../../shared/components/badge/badge.component';
import type { MarketplaceConnection } from './marketplace.models';

export const VINTED_LOCAL_READINESS_STATES = [
  'ready',
  'unbound',
  'expired',
  'revoked',
  'paused',
  'login_required',
  'identity_mismatch',
  'permission_required',
  'challenge_required',
  'blocked',
  'unavailable',
] as const;
export type VintedLocalReadinessState = (typeof VINTED_LOCAL_READINESS_STATES)[number];
export interface VintedLocalReadiness {
  readonly state: VintedLocalReadinessState;
  readonly workspaceId: string | null;
  readonly connectionId: string | null;
  readonly externalAccountId: string | null;
  readonly checkedAt: string;
  readonly version: string;
}

export function parseVintedLocalReadiness(candidate: unknown): VintedLocalReadiness | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const fields = candidate as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    Object.keys(fields).length !== 6 ||
    !VINTED_LOCAL_READINESS_STATES.some((state) => state === fields['state']) ||
    (fields['workspaceId'] !== null &&
      (typeof fields['workspaceId'] !== 'string' || !uuid.test(fields['workspaceId']))) ||
    (fields['connectionId'] !== null &&
      (typeof fields['connectionId'] !== 'string' || !uuid.test(fields['connectionId']))) ||
    (fields['externalAccountId'] !== null &&
      (typeof fields['externalAccountId'] !== 'string' ||
        !/^[1-9][0-9]{0,31}$/.test(fields['externalAccountId']))) ||
    typeof fields['checkedAt'] !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(fields['checkedAt']) ||
    !Number.isFinite(Date.parse(fields['checkedAt'])) ||
    typeof fields['version'] !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(fields['version']) ||
    (fields['state'] !== 'unbound' &&
      (!fields['workspaceId'] || !fields['connectionId'] || !fields['externalAccountId']))
  )
    return null;
  return Object.freeze(candidate as VintedLocalReadiness);
}

export function presentVintedLocalReadiness(
  account: Pick<
    MarketplaceConnection,
    'workspaceId' | 'connectionId' | 'externalAccountId' | 'status'
  >,
  readiness: VintedLocalReadiness | null,
  checking: boolean,
  installed: boolean,
): {
  label: string;
  tone: BadgeTone;
  action: 'check' | 'renew' | 'login' | 'settings' | 'profile';
} {
  if (account.status === 'paused')
    return { label: 'Automatik pausiert', tone: 'caution', action: 'settings' };
  if (account.status === 'blocked')
    return { label: 'Kontoprüfung erforderlich', tone: 'critical', action: 'settings' };
  if (account.status === 'disconnected')
    return { label: 'Lokale Verbindung unterbrochen', tone: 'caution', action: 'renew' };
  if (checking) return { label: 'Verbindung wird geprüft', tone: 'caution', action: 'check' };
  if (!installed)
    return { label: 'Erweiterung nicht erreichbar', tone: 'neutral', action: 'check' };
  if (!readiness)
    return { label: 'Verbindung noch nicht bestätigt', tone: 'neutral', action: 'check' };
  if (
    readiness.state !== 'unbound' &&
    (readiness.workspaceId !== account.workspaceId ||
      readiness.connectionId !== account.connectionId ||
      (account.externalAccountId && account.externalAccountId !== readiness.externalAccountId))
  )
    return { label: 'In anderem Browserprofil verknüpft', tone: 'neutral', action: 'profile' };
  switch (readiness.state) {
    case 'ready':
      return { label: 'Erweiterung verbunden', tone: 'success', action: 'check' };
    case 'unbound':
      return {
        label: 'Dieses Browserprofil ist nicht verknüpft',
        tone: 'neutral',
        action: 'renew',
      };
    case 'expired':
      return { label: 'Freigabe abgelaufen', tone: 'caution', action: 'renew' };
    case 'revoked':
      return { label: 'Freigabe widerrufen', tone: 'caution', action: 'renew' };
    case 'paused':
      return { label: 'Automatik pausiert', tone: 'caution', action: 'settings' };
    case 'login_required':
      return { label: 'Bei Vinted anmelden', tone: 'caution', action: 'login' };
    case 'identity_mismatch':
      return { label: 'Anderes Vinted-Konto angemeldet', tone: 'caution', action: 'profile' };
    case 'permission_required':
      return { label: 'Websiteberechtigung fehlt', tone: 'caution', action: 'check' };
    case 'challenge_required':
      return { label: 'Vinted-Prüfung erforderlich', tone: 'caution', action: 'login' };
    case 'blocked':
      return { label: 'Vinted-Zugriff gesperrt', tone: 'critical', action: 'settings' };
    case 'unavailable':
      return { label: 'Verbindung nicht bestätigt', tone: 'caution', action: 'check' };
  }
}
