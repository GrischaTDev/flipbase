import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, AuthSession } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { LandingHintService } from './landing-hint.service';

/**
 * Verhaltenstest des AuthService mit gefaelschtem Supabase-Client.
 *
 * Anlass: Endete die Sitzung, waehrend die App offen war, loeschte der Dienst
 * zwar seine Signale, leitete aber nicht weiter. Das Dashboard blieb stehen,
 * jede weitere Abfrage lief ohne Token und schlug mit "permission denied"
 * (42501) fehl - der Nutzer sah Rechte-Fehler statt der Anmeldeseite.
 */

/** Faengt den Rueckruf ab, den der Dienst bei Supabase registriert. */
interface Umgebung {
  dienst: AuthService;
  /** Loest ein Sitzungsereignis aus, so wie Supabase es melden wuerde. */
  melde: (ereignis: AuthChangeEvent, sitzung: AuthSession | null) => void;
  /** Alle Ziele, zu denen der Dienst navigiert hat. */
  ziele: unknown[][];
}

function sitzung(): AuthSession {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 900,
    token_type: 'bearer',
    user: { id: 'nutzer-1', email: 'test@test.de' },
  } as unknown as AuthSession;
}

function baueUmgebung(): Umgebung {
  const ziele: unknown[][] = [];
  let rueckruf: ((ereignis: AuthChangeEvent, sitzung: AuthSession | null) => void) | null = null;

  const supabase = {
    client: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: (cb: (e: AuthChangeEvent, s: AuthSession | null) => void) => {
          rueckruf = cb;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
    },
  } as unknown as SupabaseService;

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: supabase },
      {
        provide: MockDataStoreService,
        useValue: { isDemoMode: signal(false), ensureShowcaseData: () => undefined },
      },
      { provide: Router, useValue: { navigate: (befehle: unknown[]) => ziele.push(befehle) } },
      {
        provide: LandingHintService,
        useValue: { anmelden: () => undefined, abmelden: () => undefined },
      },
    ],
  });

  const dienst = runInInjectionContext(injector, () => new AuthService());

  return {
    dienst,
    ziele,
    melde: (ereignis, s) => rueckruf?.(ereignis, s),
  };
}

describe('AuthService: Sitzungsende bei offener App', () => {
  let umgebung: Umgebung;

  beforeEach(() => {
    umgebung = baueUmgebung();
  });

  it('leitet auf die Anmeldeseite, wenn eine bestehende Sitzung endet', () => {
    umgebung.melde('SIGNED_IN', sitzung());
    expect(umgebung.dienst.isAuthenticated()).toBe(true);

    umgebung.melde('SIGNED_OUT', null);

    expect(umgebung.dienst.isAuthenticated()).toBe(false);
    expect(umgebung.ziele).toEqual([['/auth/login']]);
  });

  it('leitet nicht weiter, wenn beim Start ohnehin niemand angemeldet ist', () => {
    // Supabase meldet direkt nach dem Start INITIAL_SESSION mit null. Wer die
    // Anmeldeseite offen hat, darf davon nicht erneut dorthin geworfen werden.
    umgebung.melde('INITIAL_SESSION', null);

    expect(umgebung.ziele).toEqual([]);
  });

  it('leitet nicht weiter, solange die Sitzung erneuert wird', () => {
    umgebung.melde('SIGNED_IN', sitzung());
    umgebung.melde('TOKEN_REFRESHED', sitzung());

    expect(umgebung.dienst.isAuthenticated()).toBe(true);
    expect(umgebung.ziele).toEqual([]);
  });
});
