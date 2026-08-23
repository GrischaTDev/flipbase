import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, AuthSession } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { LandingHintService } from './landing-hint.service';
import { SyncStatusService } from './sync-status.service';

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
  /** Der Fehlerkanal, ueber den die Feature-Dienste ihre Fehlschlaege melden. */
  syncStatus: SyncStatusService;
  /** Protokoll der Aufrufe am Merk-Cookie der Landingpage. */
  cookie: string[];
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

function baueUmgebung(getUserFehler: unknown = null): Umgebung {
  const ziele: unknown[][] = [];
  const cookie: string[] = [];
  let rueckruf: ((ereignis: AuthChangeEvent, sitzung: AuthSession | null) => void) | null = null;

  const supabase = {
    client: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null }, error: getUserFehler }),
        onAuthStateChange: (cb: (e: AuthChangeEvent, s: AuthSession | null) => void) => {
          rueckruf = cb;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
    },
  } as unknown as SupabaseService;

  const syncStatus = new SyncStatusService();

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: supabase },
      { provide: SyncStatusService, useValue: syncStatus },
      {
        provide: MockDataStoreService,
        useValue: { isDemoMode: signal(false), ensureShowcaseData: () => undefined },
      },
      { provide: Router, useValue: { navigate: (befehle: unknown[]) => ziele.push(befehle) } },
      {
        provide: LandingHintService,
        useValue: {
          anmelden: () => cookie.push('anmelden'),
          abmelden: () => cookie.push('abmelden'),
        },
      },
    ],
  });

  const dienst = runInInjectionContext(injector, () => new AuthService());

  return {
    dienst,
    ziele,
    cookie,
    syncStatus,
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

  it('setzt und entfernt dabei das Merk-Cookie der Landingpage', () => {
    umgebung.melde('SIGNED_IN', sitzung());
    expect(umgebung.cookie).toEqual(['anmelden']);

    umgebung.melde('SIGNED_OUT', null);
    expect(umgebung.cookie).toEqual(['anmelden', 'abmelden']);
  });

  it('zeigt nach dem Sitzungsende kein Band einer wiederhergestellten Sitzung', () => {
    umgebung.melde('SIGNED_IN', sitzung());
    umgebung.dienst.sitzungWiederhergestellt.set(true);

    umgebung.melde('SIGNED_OUT', null);

    expect(umgebung.dienst.sitzungWiederhergestellt()).toBe(false);
  });
});

/**
 * Scheitern Datenabfragen mit 42501, weil gar kein Token mehr mitgeht, merkt
 * supabase-js davon nichts - es erfaehrt erst bei der naechsten Token-
 * Erneuerung, dass die Sitzung weg ist. Bis dahin blieb die App stehen und
 * sammelte Rechte-Fehler. Deshalb fragt sie bei solchen Codes nach.
 *
 * 42501 kann aber auch ein echter Rechte-Fehler sein. Abgemeldet wird darum
 * nur, wenn die Nachfrage die Sitzung tatsaechlich als widerrufen meldet.
 */
describe('AuthService: Rechte-Fehler als Hinweis auf eine tote Sitzung', () => {
  it('meldet ab, wenn die Nachfrage die Sitzung als widerrufen meldet', async () => {
    const umgebung = baueUmgebung({ status: 403, message: 'Session not found' });
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.syncStatus.melde('Laden des Profils', { code: '42501' });
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.ziele).toEqual([['/auth/login']]);
  });

  it('laesst die Anmeldung in Ruhe, wenn es ein echter Rechte-Fehler war', async () => {
    const umgebung = baueUmgebung(null);
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.syncStatus.melde('Laden eines fremden Workspace', { code: '42501' });
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.dienst.isAuthenticated()).toBe(true);
    expect(umgebung.ziele).toEqual([]);
  });

  it('fragt bei einem abgelaufenen Token ebenfalls nach', async () => {
    const umgebung = baueUmgebung({ status: 403, message: 'Session not found' });
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.syncStatus.melde('Laden der Workspaces', { code: 'PGRST303' });
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.ziele).toEqual([['/auth/login']]);
  });

  it('fragt bei harmlosen Fehlern gar nicht erst nach', async () => {
    const umgebung = baueUmgebung({ status: 403, message: 'Session not found' });
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.syncStatus.melde('Einkauf speichern', { code: '23505' });
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.ziele).toEqual([]);
  });
});
