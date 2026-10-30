import { describe, expect, it } from 'vitest';
import { QueryDraft, formatBotUptime, queryDraftError } from './sniper-query.model';

type ProposedQueryDraft = QueryDraft & { title: string };

const draft = (overrides: Partial<ProposedQueryDraft> = {}): ProposedQueryDraft =>
  ({
    id: null,
    title: 'Nike',
    brandId: 53,
    intervalSeconds: 20,
    notes: '',
    ...overrides,
  }) as ProposedQueryDraft;

describe('central Vinted brand filter validation', () => {
  it('accepts a named brand-only filter', () => {
    expect(queryDraftError(draft())).toBeNull();
  });

  it.each([
    ['', 'Filtername'],
    [' '.repeat(101), 'Filtername'],
  ])('rejects an invalid filter name', (title, message) => {
    expect(queryDraftError(draft({ title }))).toContain(message);
  });

  it.each([null, 0, -1, 1.5, 2147483648])('rejects an invalid Vinted brand id: %s', (brandId) => {
    expect(queryDraftError(draft({ brandId }))).toContain('Vinted-Marke');
  });

  it('rejects an overlong note and an invalid interval', () => {
    expect(queryDraftError(draft({ notes: 'x'.repeat(2001) }))).toContain('Notiz');
    expect(queryDraftError(draft({ intervalSeconds: 0 }))).toContain('Takt');
    expect(queryDraftError(draft({ intervalSeconds: 86401 }))).toContain('Takt');
  });

  it('accepts an explicit one-second wish without promising a measured interval', () => {
    expect(queryDraftError(draft({ intervalSeconds: 1 }))).toBeNull();
    expect(queryDraftError(draft({ intervalSeconds: 5 }))).toBeNull();
  });

  it('validates exclusions and refuses an exclusion-only unrestricted search', () => {
    expect(queryDraftError(draft({ excludedTitleKeywords: ['x'.repeat(81)] }))).toContain(
      'Ausschluss',
    );
    expect(queryDraftError(draft({ excludedTitleKeywords: ['  '] }))).toContain('Ausschluss');
    expect(
      queryDraftError(draft({ brandId: null, catalogId: null, excludedTitleKeywords: ['weste'] })),
    ).toContain('mindestens');
  });
  it('rejects impossible all-rules while allowing a usable alternative in an any-rule', () => {
    expect(
      queryDraftError(
        draft({
          titleKeywords: ['puffer', 'pufferjacke'],
          excludedTitleKeywords: ['puffer'],
          keywordMode: 'all',
        }),
      ),
    ).toContain('ausgeschlossen');
    expect(
      queryDraftError(
        draft({
          titleKeywords: ['puffer', 'pufferjacke'],
          excludedTitleKeywords: ['puffer'],
          keywordMode: 'any',
        }),
      ),
    ).toBeNull();
    expect(
      queryDraftError(
        draft({ titleKeywords: ['puffer'], excludedTitleKeywords: ['puffer'], keywordMode: 'any' }),
      ),
    ).toContain('ausgeschlossen');
  });
});

describe('formatBotUptime', () => {
  it('zeigt die ununterbrochene Laufzeit als Stunden, Minuten und Sekunden', () => {
    expect(formatBotUptime(0)).toBe('00:00:00');
    expect(formatBotUptime(65)).toBe('00:01:05');
    expect(formatBotUptime(3661)).toBe('01:01:01');
  });

  it('begrenzt negative oder nicht endliche Werte auf null', () => {
    expect(formatBotUptime(-10)).toBe('00:00:00');
    expect(formatBotUptime(Number.NaN)).toBe('00:00:00');
  });
});
