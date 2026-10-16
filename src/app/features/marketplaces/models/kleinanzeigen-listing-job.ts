import {
  parseKleinanzeigenListingJob,
  type KleinanzeigenListingJob,
  type KleinanzeigenJobScope,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-job-contracts';
import { validTransferDraftContent } from './kleinanzeigen-transfer-response';
export type {
  KleinanzeigenListingJob,
  KleinanzeigenJobScope,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-job-contracts';
export function parseKleinanzeigenJob(
  value: unknown,
  scope: KleinanzeigenJobScope,
): KleinanzeigenListingJob | null {
  return parseKleinanzeigenListingJob(value, scope, (value) =>
    validTransferDraftContent(value) ? value : null,
  );
}
export function kleinanzeigenJobStatus(
  job: Pick<KleinanzeigenListingJob, 'state' | 'providerState'>,
): string {
  if (job.state === 'writing' && job.providerState === 'processing')
    return 'Wird von Kleinanzeigen geprüft';
  return {
    queued: 'Auftrag angenommen',
    claimed: 'Formular und Bilder werden geprüft',
    writing: 'Veröffentlichung wird bestätigt',
    confirmed: 'Bei Kleinanzeigen veröffentlicht',
    failed: 'Vorbereitung fehlgeschlagen',
    outcome_unknown: 'Ergebnis noch unklar',
    cancelled: 'Auftrag beendet',
    needs_user_action: 'Deine Prüfung ist erforderlich',
  }[job.state];
}
export function kleinanzeigenJobPollingDelay(
  job: Pick<KleinanzeigenListingJob, 'state' | 'providerState'>,
  startedAt: number,
  now: number,
): number | null {
  if (
    !['queued', 'claimed', 'writing'].includes(job.state) &&
    !(job.state === 'outcome_unknown' && job.providerState === 'processing')
  )
    return null;
  return now - startedAt >= 120000 ? 10000 : 2000;
}
export function kleinanzeigenJobIssue(code: string | null): string | null {
  if (code === null) return null;
  const messages: Readonly<Record<string, string>> = {
    fees_due: 'Kleinanzeigen zeigt Gebühren. Die Veröffentlichung wurde gestoppt.',
    fee_unknown:
      'Die Kosten konnten nicht eindeutig geprüft werden. Es wird nicht weiter inseriert.',
    quota_exhausted: 'Das kostenlose Kontingent ist ausgeschöpft oder bereits vorgemerkt.',
    quota_unknown: 'Das offizielle Kontingent konnte nicht aktuell bestätigt werden.',
    publication_unconfirmed:
      'Der Ausgang ist noch unklar. Prüfe den Status, bevor Du erneut inserierst.',
    images_incomplete: 'Die Bilder sind bei Kleinanzeigen noch nicht vollständig angekommen.',
    schema_changed: 'Prüfe die aktuellen Kategorie- und Formularangaben erneut.',
    grant_changed: 'Die lokale Veröffentlichungsfreigabe ist nicht mehr aktuell.',
    draft_changed: 'Die Zielfassung wurde inzwischen geändert. Prüfe sie erneut.',
    preparation_expired: 'Die Vorbereitung ist abgelaufen. Prüfe die Zielfassung erneut.',
    account_changed: 'Im Browser ist ein anderes Kleinanzeigen-Konto angemeldet.',
  };
  return (
    messages[code] ??
    'Der Auftrag wurde angehalten. Prüfe die Zielfassung und den aktuellen Status.'
  );
}
