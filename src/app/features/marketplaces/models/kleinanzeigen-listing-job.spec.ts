import { describe, it, expect } from 'vitest';
import { kleinanzeigenJobFixture } from '../../../../../supabase/test-support/kleinanzeigen-job-fixture';
import {
  parseKleinanzeigenJob,
  kleinanzeigenJobStatus,
  kleinanzeigenJobPollingDelay,
} from './kleinanzeigen-listing-job';
describe('Öffentlicher Veröffentlichungsauftrag', () => {
  it('übernimmt nur vollständige kontogebundene Aufträge ohne Versuchsecrets', () => {
    const job = kleinanzeigenJobFixture();
    expect(parseKleinanzeigenJob(job, job)?.id).toBe('12');
    expect(parseKleinanzeigenJob({ ...job, claimTokenHash: 'private' }, job)).toBeNull();
    expect(parseKleinanzeigenJob({ ...job, connectionId: '10' }, job)).toBeNull();
  });
  it('unterscheidet lokale Annahme, Verarbeitung und bestätigte Veröffentlichung', () => {
    const job = kleinanzeigenJobFixture();
    expect(kleinanzeigenJobStatus(job)).toContain('angenommen');
    expect(
      kleinanzeigenJobStatus({ ...job, state: 'writing', providerState: 'processing' }),
    ).toContain('geprüft');
    expect(kleinanzeigenJobStatus({ ...job, state: 'outcome_unknown' })).toContain('unklar');
  });
  it('pollt nur aktive Aufträge und reduziert die Häufigkeit nach zwei Minuten', () => {
    const job = kleinanzeigenJobFixture();
    const start = 100000;
    expect(kleinanzeigenJobPollingDelay(job, start, start + 1000)).toBe(2000);
    expect(
      kleinanzeigenJobPollingDelay(
        { ...job, state: 'writing', providerState: 'processing' },
        start,
        start + 120001,
      ),
    ).toBe(10000);
    expect(
      kleinanzeigenJobPollingDelay({ ...job, state: 'outcome_unknown' }, start, start + 1000),
    ).toBeNull();
    expect(
      kleinanzeigenJobPollingDelay({ ...job, state: 'confirmed' }, start, start + 1000),
    ).toBeNull();
  });
});
