import { describe, expect, it } from 'vitest';
import { isRefreshDue } from '../../src/runtime/category-refresh.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-06T12:00:00.000Z');

describe('isRefreshDue', () => {
  it('liest ein, wenn noch nie eingelesen wurde', () => {
    expect(isRefreshDue({ refreshedAt: null, requestedAt: null }, now, DAY_MS)).toBe(true);
  });

  it('liest nicht erneut, solange der Stand jung genug ist', () => {
    const state = { refreshedAt: '2026-09-06T06:00:00.000Z', requestedAt: null };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });

  it('liest ein, sobald der Stand aelter als die Frist ist', () => {
    const state = { refreshedAt: '2026-09-05T06:00:00.000Z', requestedAt: null };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest ein, wenn jemand nach dem letzten Lauf angefordert hat', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T11:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest nicht wegen einer Anforderung, die vor dem letzten Lauf lag', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T05:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });
});
