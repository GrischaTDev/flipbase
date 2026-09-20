import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, AuthSession } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { LandingHintService } from './landing-hint.service';
import { SyncStatusService } from './sync-status.service';
import { SessionChannelService } from './session-channel.service';

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
  /** Protokoll der Aufrufe am Sitzungskanal. */
  kanal: string[];
  /** Loest das Signal aus, das ein anderes Fenster gesendet haette. */
  signalAbmeldung: () => void;
  /** Welcher Bereich beim Abmelden an Supabase uebergeben wurde. */
  bereiche: string[];
  betaAktivierungen: string[];
}

function sitzung(betaRegistrationCompleted = false): AuthSession {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 900,
    token_type: 'bearer',
    user: {
      id: 'nutzer-1',
      email: 'test@test.de',
      user_metadata: { beta_registration_completed: betaRegistrationCompleted },
    },
  } as unknown as AuthSession;
}

function baueUmgebung(
  getUserFehler: unknown = null,
  betaAktivierungsfehler: readonly unknown[] = [],
): Umgebung {
  const ziele: unknown[][] = [];
  const cookie: string[] = [];
  const bereiche: string[] = [];
  const betaAktivierungen: string[] = [];
  const verbleibendeBetaAktivierungsfehler = [...betaAktivierungsfehler];
  let rueckruf: ((ereignis: AuthChangeEvent, sitzung: AuthSession | null) => void) | null = null;

  const supabase = {
    client: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null }, error: getUserFehler }),
        signOut: async (optionen?: { scope?: string }) => {
          bereiche.push(optionen?.scope ?? '(ohne Angabe)');
          return { error: null };
        },
        onAuthStateChange: (cb: (e: AuthChangeEvent, s: AuthSession | null) => void) => {
          rueckruf = cb;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
      rpc: async (name: string) => {
        betaAktivierungen.push(name);
        return { data: [], error: verbleibendeBetaAktivierungsfehler.shift() ?? null };
      },
    },
  } as unknown as SupabaseService;

  const kanal: string[] = [];
  let beiAbmeldung: (() => void) | null = null;
  const sessionChannel = {
    verbinde: (nutzerId: string, _token: string, handler: () => void) => {
      kanal.push(`verbinde:${nutzerId}`);
      beiAbmeldung = handler;
    },
    sendeAbmeldung: async (nutzerId: string) => {
      kanal.push(`sende:${nutzerId}`);
    },
    trenne: () => kanal.push('trenne'),
  } as unknown as SessionChannelService;

  const syncStatus = new SyncStatusService();

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: supabase },
      { provide: SyncStatusService, useValue: syncStatus },
      { provide: SessionChannelService, useValue: sessionChannel },
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
    kanal,
    bereiche,
    betaAktivierungen,
    syncStatus,
    melde: (ereignis, s) => rueckruf?.(ereignis, s),
    signalAbmeldung: () => beiAbmeldung?.(),
  };
}

describe('AuthService: Beta-Aktivierung', () => {
  it('startet einen ausstehenden Beta-Zugang ueber die Datenbankfunktion', async () => {
    const umgebung = baueUmgebung();

    await umgebung.dienst.activatePendingBetaAccess();

    expect(umgebung.betaAktivierungen).toEqual(['activate_beta_access']);
  });

  it('versucht die Aktivierung nach abgeschlossener Registrierung je App-Start nur einmal', async () => {
    const umgebung = baueUmgebung();
    const registrierteSitzung = sitzung(true);

    umgebung.melde('SIGNED_IN', registrierteSitzung);
    umgebung.melde('TOKEN_REFRESHED', registrierteSitzung);
    await Promise.resolve();

    expect(umgebung.betaAktivierungen).toEqual(['activate_beta_access']);
  });

  it('versucht eine fehlgeschlagene Aktivierung bei einem spaeteren Sitzungsereignis erneut', async () => {
    const umgebung = baueUmgebung(null, [{ message: 'Netzwerkfehler' }]);
    const registrierteSitzung = sitzung(true);

    umgebung.melde('SIGNED_IN', registrierteSitzung);
    await Promise.resolve();
    await Promise.resolve();
    umgebung.melde('TOKEN_REFRESHED', registrierteSitzung);
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.betaAktivierungen).toEqual(['activate_beta_access', 'activate_beta_access']);
  });

  it('startet die Beta nicht allein durch das Oeffnen des Einladungslinks', async () => {
    const umgebung = baueUmgebung();

    umgebung.melde('SIGNED_IN', sitzung(false));
    await Promise.resolve();

    expect(umgebung.betaAktivierungen).toEqual([]);
  });
});

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

/**
 * Wird eine Sitzung anderswo beendet, kann ein offenes Fenster das von sich
 * aus nicht bemerken: Sein Token ist gueltig, die Datenbank antwortet ihm
 * normal. Deshalb sagt die abmeldende Instanz es ueber einen privaten Kanal -
 * dasselbe Prinzip wie ein Server-Push.
 */
describe('AuthService: Sitzungskanal', () => {
  it('hoert nach dem Anmelden auf dem eigenen Kanal mit', () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());

    expect(umgebung.kanal).toContain('verbinde:nutzer-1');
  });

  it('schliesst den Kanal, wenn die Sitzung endet', () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());
    umgebung.melde('SIGNED_OUT', null);

    expect(umgebung.kanal).toContain('trenne');
  });

  it('sagt beim Abmelden auf allen Geraeten Bescheid, bevor es die Sitzung beendet', async () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());
    umgebung.kanal.length = 0;

    await umgebung.dienst.abmeldenUeberall();

    // Erst senden, dann trennen - danach duerfte nicht mehr gesendet werden.
    expect(umgebung.kanal[0]).toBe('sende:nutzer-1');
    expect(umgebung.kanal).toContain('trenne');
  });

  it('meldet sich ab, wenn das Signal kommt und die Nachfrage es bestaetigt', async () => {
    const umgebung = baueUmgebung({ status: 403, message: 'Session not found' });
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.signalAbmeldung();
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.ziele).toEqual([['/auth/login']]);
  });

  it('bleibt angemeldet, wenn das Signal kommt, die Sitzung aber noch gilt', async () => {
    const umgebung = baueUmgebung(null);
    umgebung.melde('SIGNED_IN', sitzung());

    umgebung.signalAbmeldung();
    await Promise.resolve();
    await Promise.resolve();

    expect(umgebung.dienst.isAuthenticated()).toBe(true);
    expect(umgebung.ziele).toEqual([]);
  });
});

/**
 * `supabase.auth.signOut()` verwendet ohne Angabe den Bereich "global" - ein
 * Aufruf ohne Parameter beendet also jede Sitzung auf jedem Geraet. Genau das
 * tat der Knopf "Abmelden" im Kopfbereich, ohne es anzukuendigen.
 */
describe('AuthService: Reichweite des Abmeldens', () => {
  it('das normale Abmelden betrifft nur diesen Browser', async () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());

    await umgebung.dienst.signOut();

    expect(umgebung.bereiche).toEqual(['local']);
  });

  it('fuer alle Geraete gibt es einen eigenen, benannten Weg', async () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());

    await umgebung.dienst.abmeldenUeberall();

    expect(umgebung.bereiche).toEqual(['global']);
  });

  it('meldet in beiden Faellen lokal ab und fuehrt zur Anmeldeseite', async () => {
    const umgebung = baueUmgebung();
    umgebung.melde('SIGNED_IN', sitzung());

    await umgebung.dienst.signOut();

    expect(umgebung.dienst.isAuthenticated()).toBe(false);
    expect(umgebung.ziele).toContainEqual(['/auth/login']);
  });
});
