import { describe, expect, it } from 'vitest';
import { FAILED_REFRESH_RETRY_MS, isRefreshDue } from '../../src/runtime/category-refresh.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-06T12:00:00.000Z');

describe('isRefreshDue', () => {
  it('liest ein, wenn noch nie eingelesen wurde', () => {
    expect(
      isRefreshDue({ refreshedAt: null, requestedAt: null, lastAttemptAt: null }, now, DAY_MS),
    ).toBe(true);
  });

  it('liest nicht erneut, solange der Stand jung genug ist', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: null,
      lastAttemptAt: '2026-09-06T06:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });

  it('liest ein, sobald der Stand aelter als die Frist ist', () => {
    const state = {
      refreshedAt: '2026-09-05T06:00:00.000Z',
      requestedAt: null,
      lastAttemptAt: '2026-09-05T06:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest ein, wenn jemand nach dem letzten Lauf angefordert hat', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T11:00:00.000Z',
      lastAttemptAt: '2026-09-06T06:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
  });

  it('liest nicht wegen einer Anforderung, die vor dem letzten Lauf lag', () => {
    const state = {
      refreshedAt: '2026-09-06T06:00:00.000Z',
      requestedAt: '2026-09-06T05:00:00.000Z',
      lastAttemptAt: '2026-09-06T06:00:00.000Z',
    };

    expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
  });

  // Der Rueckzug nach einem Fehlschlag.
  //
  // Ohne ihn waeren alle vier folgenden Faelle "faellig": `markFailed` setzt
  // nur `last_attempt_at`, nie `refreshed_at` - der ueberfaellige oder nie
  // eingelesene Stand bliebe bei jedem Takt faellig. Genau deshalb pruefen
  // diese Faelle jeweils `false`, wo die alte Fassung `true` lieferte.
  describe('nach einem gescheiterten Versuch', () => {
    it('wartet, statt es beim naechsten Takt sofort wieder zu versuchen', () => {
      const state = {
        // Ueberfaellig: ohne Rueckzug waere das unbestritten faellig.
        refreshedAt: '2026-09-04T06:00:00.000Z',
        requestedAt: null,
        lastAttemptAt: '2026-09-06T11:55:00.000Z',
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
    });

    it('wartet auch, wenn noch nie erfolgreich eingelesen wurde', () => {
      const state = {
        refreshedAt: null,
        requestedAt: null,
        lastAttemptAt: '2026-09-06T11:55:00.000Z',
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
    });

    it('versucht es erneut, sobald die Wartezeit um ist', () => {
      const state = {
        refreshedAt: null,
        requestedAt: null,
        lastAttemptAt: '2026-09-06T11:00:00.000Z',
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
    });

    it('wartet genau die uebergebene Wartezeit ab, keine Sekunde laenger', () => {
      const attempt = new Date(now.getTime() - FAILED_REFRESH_RETRY_MS);
      const state = {
        refreshedAt: null,
        requestedAt: null,
        lastAttemptAt: attempt.toISOString(),
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
      expect(isRefreshDue(state, new Date(now.getTime() - 1), DAY_MS)).toBe(false);
    });

    it('nimmt die Wartezeit aus dem Parameter, nicht aus einem festen Wert', () => {
      const state = {
        refreshedAt: null,
        requestedAt: null,
        lastAttemptAt: '2026-09-06T11:55:00.000Z',
      };

      // Fuenf Minuten sind vergangen. Bei einer Minute Wartezeit ist der
      // naechste Versuch faellig, bei einer Stunde nicht.
      expect(isRefreshDue(state, now, DAY_MS, 60_000)).toBe(true);
      expect(isRefreshDue(state, now, DAY_MS, 60 * 60_000)).toBe(false);
    });

    it('uebergeht den Rueckzug fuer eine Anforderung aus der Administration', () => {
      const state = {
        refreshedAt: null,
        requestedAt: '2026-09-06T11:58:00.000Z',
        lastAttemptAt: '2026-09-06T11:55:00.000Z',
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(true);
    });

    it('laesst eine Anforderung, die der Dienst schon versucht hat, nicht dauerhaft offen', () => {
      const state = {
        refreshedAt: null,
        // Angefordert um 11:50, der Versuch darauf um 11:55 ist gescheitert.
        // Die Anforderung ist abgearbeitet; sonst haemmerte sie fuer immer
        // weiter, weil `markFailed` `refreshed_at` nicht anfasst.
        requestedAt: '2026-09-06T11:50:00.000Z',
        lastAttemptAt: '2026-09-06T11:55:00.000Z',
      };

      expect(isRefreshDue(state, now, DAY_MS)).toBe(false);
    });
  });
});
