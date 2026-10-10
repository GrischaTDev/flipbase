import { describe, expect, it } from 'vitest';
import {
  parseVintedListingJob,
  parseVintedListingPermission,
  vintedListingJobLabel,
} from './vinted-listing-job';

const job = {
  id: '9007199254740999',
  workspaceId: 'workspace-a',
  connectionId: '46300000-0000-4000-8000-000000000021',
  draftId: '9007199254740998',
  draftRevision: 3,
  executionMode: 'local',
  externalAccountId: '46301',
  action: 'publish',
  state: 'queued',
  version: 1,
  scheduledAt: '2026-10-10T12:00:00.123456+00:00',
  timeZone: 'Europe/Berlin',
  latePolicy: 'pause_after_30_minutes',
  errorCode: null,
  externalId: null,
  providerState: null,
  verifiedAt: null,
  replacesJobId: null,
  createdAt: '2026-10-09T12:00:00+00:00',
  updatedAt: '2026-10-09T12:00:00+00:00',
};

describe('Vinted-Inserataufträge', () => {
  it('erhält große Kennungen und bezeichnet Annahme nicht als Veröffentlichung', () => {
    const result = parseVintedListingJob(job, 'workspace-a', job.draftId, job.id);
    expect(result.id).toBe('9007199254740999');
    expect(result.scheduledAt).toBe(job.scheduledAt);
    expect(vintedListingJobLabel(result)).toBe('Veröffentlichung beauftragt');
  });
  it('verwirft fremde Kontexte, gerundete Kennungen und unbekannte Auftragsarten', () => {
    expect(() => parseVintedListingJob(job, 'workspace-b')).toThrow();
    expect(() => parseVintedListingJob(job, 'workspace-a', '42')).toThrow();
    expect(() => parseVintedListingJob(job, 'workspace-a', job.draftId, '42')).toThrow();
    for (const change of [
      { id: Number('9007199254740999') },
      { draftId: '01' },
      { externalAccountId: 46301 },
      { state: 'sent' },
      { action: 'delete' },
      { version: 0 },
    ]) {
      expect(() => parseVintedListingJob({ ...job, ...change }, 'workspace-a')).toThrow();
    }
  });
  it('verwirft falsche Terminpaare und nicht existente Kalendertage', () => {
    for (const change of [
      { timeZone: null },
      { timeZone: 'Not/AZone' },
      { scheduledAt: null },
      { scheduledAt: '2026-02-30T12:00:00Z' },
    ]) {
      expect(() => parseVintedListingJob({ ...job, ...change }, 'workspace-a')).toThrow();
    }
  });
  it('verlangt für Anbietererfolg Kennung, passenden Zustand und Bestätigungszeit', () => {
    const confirmed = {
      ...job,
      state: 'confirmed',
      externalId: '46302',
      providerState: 'active',
      verifiedAt: '2026-10-09T12:01:00Z',
    };
    expect(vintedListingJobLabel(parseVintedListingJob(confirmed, 'workspace-a'))).toBe(
      'Veröffentlicht',
    );
    expect(
      vintedListingJobLabel(
        parseVintedListingJob({ ...confirmed, providerState: 'processing' }, 'workspace-a'),
      ),
    ).toBe('Vinted prüft Dein Inserat');
    expect(
      vintedListingJobLabel(
        parseVintedListingJob(
          { ...confirmed, action: 'vinted_draft', providerState: 'draft' },
          'workspace-a',
        ),
      ),
    ).toBe('Vinted-Entwurf angelegt');
    for (const change of [
      { externalId: null },
      { externalId: 46302 },
      { providerState: 'draft' },
      { verifiedAt: null },
      { errorCode: 'authorization_revoked' },
    ]) {
      expect(() => parseVintedListingJob({ ...confirmed, ...change }, 'workspace-a')).toThrow();
    }
  });
  it('erhält unklare Ergebnisse und den Verweis auf die ersetzte Planung', () => {
    const result = parseVintedListingJob(
      {
        ...job,
        state: 'outcome_unknown',
        errorCode: 'authorization_revoked',
        replacesJobId: '9007199254740997',
      },
      'workspace-a',
    );
    expect(result.replacesJobId).toBe('9007199254740997');
    expect(vintedListingJobLabel(result)).toBe('Ergebnis unklar');
  });
  it('verwechselt eine fehlende Freigabe nicht mit einer gültigen Freigabe', () => {
    expect(
      parseVintedListingPermission({
        allowed: false,
        authorizationVersion: 0,
        executionMode: 'local',
      }),
    ).toEqual({ allowed: false, authorizationVersion: 0, executionMode: 'local' });
    for (const permission of [
      { allowed: true, authorizationVersion: 0, executionMode: 'local' },
      { allowed: 'true', authorizationVersion: 1, executionMode: 'local' },
      { allowed: true, authorizationVersion: 1, executionMode: 'automatic' },
    ]) {
      expect(() => parseVintedListingPermission(permission)).toThrow();
    }
  });
});
