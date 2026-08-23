import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { istSitzungWiderrufen } from './auth.service';

/**
 * Beim Start fragt die App einmal beim Auth-Dienst nach, ob die gespeicherte
 * Sitzung ueberhaupt noch gilt. Die Antwort darauf entscheidet, ob jemand
 * angemeldet bleibt - deshalb muss die Unterscheidung genau sitzen:
 *
 * - Widerrufen (401/403): abmelden.
 * - Server nicht erreichbar: **nicht** abmelden. Ein kurzer Netzausfall darf
 *   niemanden aus einer gueltigen Sitzung werfen.
 */
describe('Erkennen einer widerrufenen Sitzung', () => {
  it('403 heisst widerrufen - so antwortet der Dienst nach "von allen Geraeten abmelden"', () => {
    expect(
      istSitzungWiderrufen(new AuthApiError('Session not found', 403, 'session_not_found')),
    ).toBe(true);
  });

  it('401 heisst ebenfalls widerrufen', () => {
    expect(istSitzungWiderrufen(new AuthApiError('Unauthorized', 401, undefined))).toBe(true);
  });

  it('ein nicht erreichbarer Server laesst die Sitzung bestehen', () => {
    expect(istSitzungWiderrufen(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(false);
  });

  it('ein Serverfehler laesst die Sitzung bestehen', () => {
    expect(istSitzungWiderrufen(new AuthApiError('Internal Server Error', 500, undefined))).toBe(
      false,
    );
  });

  it('ohne Fehler ist nichts widerrufen', () => {
    expect(istSitzungWiderrufen(null)).toBe(false);
    expect(istSitzungWiderrufen(undefined)).toBe(false);
  });

  it('ein Fehler ohne Statuscode laesst die Sitzung bestehen', () => {
    expect(istSitzungWiderrufen(new Error('irgendetwas'))).toBe(false);
  });
});
