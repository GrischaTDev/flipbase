import { describe, expect, it } from 'vitest';
import {
  canDiscardFailedRelisting,
  parseVintedListingJob,
  parseVintedListingPermission,
  vintedListingJobLabel,
  vintedRelistingJobLabel,
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

it('übernimmt die servergebundene Relist-Entry-ID und liest ältere Aufträge ohne Bindung weiter', () => {
  const relistEntryId = '46300000-0000-4000-8000-000000000099';
  expect(parseVintedListingJob({ ...job, relistEntryId }, job.workspaceId).relistEntryId).toBe(
    relistEntryId,
  );
  expect(parseVintedListingJob(job, job.workspaceId).relistEntryId).toBeNull();
  for (const invalid of ['', 'relisting-30', 12])
    expect(() =>
      parseVintedListingJob({ ...job, relistEntryId: invalid }, job.workspaceId),
    ).toThrow();
});

it('bezeichnet Relist-Vorbereitung, bestätigte Wartezeit und tatsächliches Inserieren eindeutig', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const relist = {
    ...parseVintedListingJob(job, job.workspaceId),
    relistExternalId: '123',
    relistDeletedAt: null,
    relistDelaySeconds: 300,
    scheduledAt: '2026-11-03T12:05:00Z',
  };
  for (const state of ['queued', 'claimed', 'writing'] as const)
    expect(vintedRelistingJobLabel({ ...relist, state }, now)).toBe('Wird vorbereitet');
  expect(vintedRelistingJobLabel({ ...relist, relistDeletedAt: '2026-11-03T11:59:00Z' }, now)).toBe(
    'Wird in 5 Minuten relistet',
  );
  expect(
    vintedRelistingJobLabel(
      { ...relist, relistDeletedAt: '2026-11-03T11:59:00Z', state: 'writing' },
      now,
    ),
  ).toBe('Wird inseriert');
  expect(vintedRelistingJobLabel({ ...relist, state: 'failed' }, now)).toBe('Fehlgeschlagen');
});

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

it('names known category and provider preparation failures', () => {
  expect(
    vintedRelistingJobLabel(
      {
        ...parseVintedListingJob(job, job.workspaceId),
        state: 'failed',
        errorCode: 'category_unavailable',
      },
      0,
    ),
  ).toBe('Vinted-Kategorie konnte nicht geladen werden');
  expect(
    vintedRelistingJobLabel(
      {
        ...parseVintedListingJob(job, job.workspaceId),
        state: 'failed',
        errorCode: 'provider_unavailable',
      },
      0,
    ),
  ).toBe('Vorbereitung bei Vinted fehlgeschlagen');
});

it('zeigt bei bekannter neuer Kennung die laufende Nachprüfung zeitlich begrenzt neutral an', () => {
  const now = Date.parse('2026-11-05T08:29:00Z');
  const pending = {
    ...parseVintedListingJob(job, job.workspaceId),
    executionMode: 'cloud' as const,
    state: 'outcome_unknown' as const,
    externalId: '46302',
    relistExternalId: '46303',
    errorCode: 'provider_unconfirmed_saved_form',
    updatedAt: new Date(now - 15_000).toISOString(),
  };
  expect(vintedRelistingJobLabel(pending, now)).toBe('Veröffentlichung wird geprüft …');
  for (const changed of [
    { externalId: null },
    { externalId: '46303' },
    { state: 'failed' as const },
    { errorCode: 'provider_unconfirmed_saved_form_match' },
    { errorCode: 'provider_unconfirmed_saved_photos_match' },
    { errorCode: 'authorization_revoked' },
    { updatedAt: new Date(now - 120_000).toISOString() },
    { updatedAt: new Date(now + 60_001).toISOString() },
  ])
    expect(vintedRelistingJobLabel({ ...pending, ...changed }, now)).not.toBe(
      'Veröffentlichung wird geprüft …',
    );
});

it('lässt nur sicher vor der Löschung gescheiterte Cloud-Relists verwerfen', () => {
  const failed = {
    ...parseVintedListingJob(job, job.workspaceId),
    state: 'failed' as const,
    action: 'publish' as const,
    executionMode: 'cloud' as const,
    relistExternalId: '46303',
    relistDeletedAt: null,
  };
  expect(canDiscardFailedRelisting(failed)).toBe(true);
  for (const change of [
    { state: 'queued' as const },
    { state: 'writing' as const },
    { state: 'outcome_unknown' as const },
    { relistDeletedAt: '2026-11-10T20:00:00Z' },
    { externalId: '46304' },
    { relistExternalId: null },
    { action: 'vinted_draft' as const },
    { executionMode: 'local' as const },
  ]) {
    expect(canDiscardFailedRelisting({ ...failed, ...change })).toBe(false);
  }
});
