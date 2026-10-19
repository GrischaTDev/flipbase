import { describe, expect, it } from 'vitest';
import type { KleinanzeigenAccount } from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import { kleinanzeigenAccountStatus, kleinanzeigenSyncIssue } from './kleinanzeigen-account-status';
const grant = { active: true, canPublish: true, generation: 1, expiresAt: '2026-10-20T00:00:00Z' };
describe('Kleinanzeigen-Verknüpfungsstatus', () => {
  it.each(['needs_login', 'connected'] as const)(
    'zeigt die aktive Verknüpfung unabhängig vom Abgleichstatus %s grün',
    (status) => {
      expect(kleinanzeigenAccountStatus({ status, localGrant: grant })).toEqual({
        label: 'Verbunden',
        tone: 'success',
      });
    },
  );
  it.each([null, { ...grant, active: false }])(
    'verlangt ohne aktive Freigabe deren Erneuerung',
    (localGrant) => {
      expect(kleinanzeigenAccountStatus({ status: 'needs_login', localGrant })).toEqual({
        label: 'Freigabe erneuern',
        tone: 'caution',
      });
    },
  );
  it('zeigt widerrufene Konten auch bei inkonsistenter Freigabe nicht als verbunden', () => {
    expect(kleinanzeigenAccountStatus({ status: 'disconnected', localGrant: grant })).toEqual({
      label: 'Nicht verbunden',
      tone: 'caution',
    });
  });
  it('behält einen tatsächlich gemeldeten Loginfehler neben der Verknüpfung bei', () => {
    const sync: NonNullable<KleinanzeigenAccount['sync']> = {
      runId: '1',
      state: 'failed',
      errorCode: 'needs_login',
      pageCount: 0,
      requestedAt: '2026-10-19T00:00:00Z',
      completedAt: '2026-10-19T00:00:01Z',
    };
    expect(kleinanzeigenSyncIssue({ sync })).toContain('erneut an');
    expect(kleinanzeigenSyncIssue({ sync: { ...sync, errorCode: 'account_changed' } })).toContain(
      'anderes Kleinanzeigen-Konto',
    );
    expect(kleinanzeigenSyncIssue({ sync: { ...sync, errorCode: 'interrupted' } })).toContain(
      'zuletzt vollständig bestätigten Bestand',
    );
    expect(
      kleinanzeigenSyncIssue({ sync: { ...sync, state: 'reading', errorCode: null } }),
    ).toBeNull();
    expect(kleinanzeigenSyncIssue({ sync: null })).toBeNull();
  });
});
