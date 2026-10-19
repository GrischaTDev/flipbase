import type { KleinanzeigenAccount } from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import type { MarketplaceOverviewAccount } from './marketplace-overview.models';

/** Kontoverknüpfung und bestätigter Inseratabgleich sind getrennte Zustände. */
export function kleinanzeigenAccountStatus(
  account: Pick<KleinanzeigenAccount, 'status' | 'localGrant'>,
): NonNullable<MarketplaceOverviewAccount['connectionStatus']> {
  if (account.status === 'disconnected') return { label: 'Nicht verbunden', tone: 'caution' };
  if (!account.localGrant?.active) return { label: 'Freigabe erneuern', tone: 'caution' };
  return { label: 'Verbunden', tone: 'success' };
}

export function kleinanzeigenSyncIssue(account: Pick<KleinanzeigenAccount, 'sync'>): string | null {
  if (account.sync?.state !== 'failed') return null;
  if (account.sync.errorCode === 'needs_login')
    return 'Melde Dich bei Kleinanzeigen erneut an und gleiche die Inserate ab. Der gespeicherte Bestand bleibt erhalten.';
  if (account.sync.errorCode === 'account_changed')
    return 'Im Browser ist ein anderes Kleinanzeigen-Konto angemeldet. Wähle das passende Konto und gleiche die Inserate ab.';
  return 'Der letzte Abruf wurde abgebrochen. Du siehst den zuletzt vollständig bestätigten Bestand.';
}
