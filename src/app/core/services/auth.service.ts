import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { UserProfile } from '../models/flipbase.models';
import { environment } from '../../../environments/environment';
import { SyncStatusService } from './sync-status.service';
import { LandingHintService } from './landing-hint.service';
import { SessionChannelService } from './session-channel.service';

/** Speicherschlüssel für den bewusst gewählten Demo-Modus. */
const DEMO_MODE_KEY = 'flipbase_demo_mode';

export interface ProfileUpdateResult {
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

/**
 * Ob eine Antwort des Auth-Dienstes bedeutet: "Diese Sitzung gibt es nicht
 * mehr."
 *
 * Nur 401 und 403 zählen. Alles andere – vor allem ein nicht erreichbarer
 * Server, der ohne Statuscode zurückkommt – darf **nicht** zum Abmelden
 * führen: Sonst wirft ein kurzer Netzausfall den Nutzer aus einer gültigen
 * Sitzung.
 */
export function istSitzungWiderrufen(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== 'object') return false;
  const status = (fehler as { status?: unknown }).status;
  return status === 401 || status === 403;
}

/**
 * Anmeldung und Sitzungsverwaltung.
 *
 * Wichtige Unterscheidung:
 * - `isAuthenticated` bedeutet: es gibt eine **echte** Supabase-Sitzung.
 * - `isDemoMode` bedeutet: der Nutzer hat den Demo-Modus **bewusst gewählt**.
 *   Es werden ausschliesslich lokale Daten dieses Browsers angezeigt, es
 *   besteht kein Zugriff auf Serverdaten.
 * - `canAccessApp` ist das, worauf der Router-Guard prüft.
 *
 * Diese drei Begriffe waren zuvor in einer einzigen Variable vermischt, die
 * standardmässig auf "angemeldet" stand. Damit war jede Zugriffsprüfung
 * wirkungslos.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService);
  private readonly router = inject(Router);
  private readonly landingHint = inject(LandingHintService);
  private readonly sessionChannel = inject(SessionChannelService);

  readonly session = signal<AuthSession | null>(null);
  readonly currentUser = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly isLoading = signal<boolean>(false);

  /**
   * Demo-Modus. Standard ist **aus** – er muss auf der Anmeldeseite aktiv
   * gewählt werden.
   */
  readonly isDemoMode = signal<boolean>(this.readStoredDemoMode());

  /** Ob der Demo-Modus überhaupt angeboten wird (im Web-Betrieb abschaltbar). */
  readonly isDemoModeAllowed = environment.allowDemoMode;

  /** Echte Anmeldung – ausschliesslich eine gültige Supabase-Sitzung. */
  readonly isAuthenticated = computed<boolean>(() => !!this.currentUser());

  /** Zugriffsrecht auf die Anwendung: echte Anmeldung oder gewählter Demo-Modus. */
  readonly canAccessApp = computed<boolean>(
    () => this.isAuthenticated() || (this.isDemoModeAllowed && this.isDemoMode()),
  );

  readonly userEmail = computed<string>(() => {
    if (this.isAuthenticated()) return this.currentUser()?.email ?? '';
    return this.isDemoMode() ? 'demo@flipbase.app' : '';
  });

  readonly userName = computed<string>(() => {
    if (!this.isAuthenticated()) return this.isDemoMode() ? 'Demo Reseller' : '';
    return (
      this.profile()?.full_name ||
      this.currentUser()?.user_metadata?.['full_name'] ||
      this.userEmail().split('@')[0] ||
      'Reseller'
    );
  });

  /**
   * Wird aufgelöst, sobald die gespeicherte Sitzung geprüft wurde.
   * Der Router-Guard wartet darauf, statt eine feste Zeitspanne zu raten.
   */
  readonly sessionReady: Promise<void>;

  constructor() {
    this.mockStore.isDemoMode.set(this.isDemoMode());
    if (this.isDemoMode()) {
      this.mockStore.ensureShowcaseData();
    }
    this.sessionReady = this.initAuth();
    this.watchAuthState();

    // Scheitern Datenabfragen mit Rechte-Fehlern, kann die Anmeldung tot sein,
    // ohne dass supabase-js es merkt: Es erfaehrt davon erst bei der naechsten
    // Token-Erneuerung. Bis dahin bliebe die App stehen und sammelte Fehler.
    this.syncStatus?.beiSitzungsverdacht(() => void this.pruefeSitzungNach());
  }

  /**
   * Fragt beim Server nach, ob die Anmeldung noch gilt.
   *
   * Wird nur nach einem verdaechtigen Fehlercode aufgerufen. Ein `42501` kann
   * genauso ein echter Rechte-Fehler sein – deshalb entscheidet nicht der
   * Fehlercode ueber das Abmelden, sondern die Antwort des Auth-Dienstes.
   */
  private async pruefeSitzungNach(): Promise<void> {
    if (!this.isAuthenticated()) return;

    try {
      const { error } = await this.supabase.client.auth.getUser();
      if (istSitzungWiderrufen(error)) {
        this.verwerfeSitzung();
      }
    } catch {
      // Nicht erreichbar heisst nicht abgemeldet.
    }
  }

  /**
   * Loescht alles, was zu einer Anmeldung gehoert – ohne zu navigieren.
   *
   * Steht an einer Stelle, weil jede vergessene Zeile hier bedeutet, dass ein
   * abgemeldeter Nutzer noch Reste seiner Sitzung sieht.
   */
  private leereSitzungsdaten(): void {
    this.session.set(null);
    this.currentUser.set(null);
    this.profile.set(null);
    this.landingHint.abmelden();
    this.sessionChannel.trenne();
  }

  /** Raeumt die Anmeldung lokal ab und fuehrt zur Anmeldeseite. */
  private verwerfeSitzung(): void {
    this.leereSitzungsdaten();
    this.router.navigate(['/auth/login']);
  }

  /**
   * Stellt eine bestehende Sitzung wieder her. Schlägt der Aufruf fehl, gilt
   * der Nutzer als nicht angemeldet – es wird **nicht** ersatzweise Zugriff
   * gewährt.
   *
   * `getSession()` liest nur den Browser-Speicher und fragt niemanden. Wurde
   * die Sitzung inzwischen beendet – etwa über "Von allen Geräten abmelden" –
   * merkt der Browser davon nichts, solange sein Token noch nicht abgelaufen
   * ist. Deshalb einmal beim Start beim Server nachfragen.
   */
  private async initAuth(): Promise<void> {
    this.isLoading.set(true);
    try {
      const { data } = await this.supabase.client.auth.getSession();
      if (data?.session) {
        const { error } = await this.supabase.client.auth.getUser();
        if (istSitzungWiderrufen(error)) {
          // Supabase räumt die Sitzung dabei selbst weg; hier bleibt nur, den
          // Hinweis auf der Landingpage zu entfernen und abgemeldet zu bleiben.
          this.landingHint.abmelden();
          return;
        }

        this.applySession(data.session);
        await this.loadProfile(data.session.user.id);
      }
    } catch {
      // Backend nicht erreichbar: Nutzer bleibt abgemeldet.
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Hält die Sitzung aktuell – etwa bei Token-Erneuerung oder einer Abmeldung
   * in einem anderen Browser-Tab.
   */
  private watchAuthState(): void {
    try {
      this.supabase.client.auth.onAuthStateChange((_event, session) => {
        if (session) {
          this.applySession(session);
        } else {
          // Deckt den serverseitigen Ablauf und das Abmelden in einem anderen
          // Tab ab.
          //
          // Weitergeleitet wird nur, wenn zuvor wirklich jemand angemeldet war:
          // Ohne Weiterleitung bliebe die Seite stehen, auf der man gerade ist –
          // der Guard prüft nur beim Navigieren, nicht dauernd. Beim Start
          // meldet Supabase aber INITIAL_SESSION mit null, und das darf
          // niemanden von der Anmeldeseite wegschicken.
          if (this.currentUser()) {
            this.verwerfeSitzung();
          } else {
            this.leereSitzungsdaten();
          }
        }
      });
    } catch {
      // Ohne erreichbares Backend gibt es keine Sitzungsereignisse.
    }
  }

  private applySession(session: AuthSession): void {
    this.session.set(session);
    this.currentUser.set(session.user);
    // Eine echte Anmeldung beendet den Demo-Modus.
    this.setDemoMode(false);
    // Der Landingpage mitteilen, dass hier jemand angemeldet ist.
    this.landingHint.anmelden();

    // Auf dem eigenen Sitzungskanal mithoeren: Wird die Anmeldung anderswo
    // beendet, koennte dieses Fenster es sonst nicht bemerken - sein Token
    // bliebe gueltig und die Datenbank antwortete ihm normal weiter.
    this.sessionChannel.verbinde(session.user.id, session.access_token, () =>
      // Ein Signal allein meldet niemanden ab, erst die Nachfrage entscheidet.
      this.pruefeSitzungNach(),
    );
  }

  async loadProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Die Anmeldung bleibt gueltig, aber Name und Rolle fehlen dann
        // ueberall - das soll man sehen und nicht raten muessen.
        this.syncStatus?.melde('Laden des Profils', error);
      } else if (data) {
        this.profile.set(data as UserProfile);
      }
    } catch {
      // Profil ist optional – die Anmeldung bleibt davon unberührt.
    }
  }

  /** Uebersetzt die englischen Meldungen von Supabase in verstaendliches Deutsch. */
  private mapAuthErrorToGerman(error: unknown): Error {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    if (msg.includes('Invalid login credentials')) {
      return new Error(
        'E-Mail-Adresse oder Passwort ist nicht korrekt oder das Konto existiert noch nicht. Bitte registriere dich zuerst neu.',
      );
    }
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('NetworkError')
    ) {
      return new Error(
        'Verbindung zum Server fehlgeschlagen. Bitte prüfe deine Internetverbindung oder starte den Datenbank-Dienst.',
      );
    }
    if (msg.includes('User already registered') || msg.includes('already registered')) {
      return new Error(
        'Ein Konto mit dieser E-Mail-Adresse existiert bereits. Bitte melde dich an.',
      );
    }
    if (msg.includes('Password should be at least')) {
      return new Error('Das Passwort ist zu kurz. Bitte verwende mindestens 10 Zeichen.');
    }
    if (msg.includes('Email not confirmed')) {
      return new Error('Die E-Mail-Adresse wurde noch nicht bestätigt.');
    }
    if (msg.includes('rate limit')) {
      return new Error('Zu viele Versuche in kurzer Zeit. Bitte warte einen kurzen Moment.');
    }
    return new Error(msg || 'Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.');
  }

  /**
   * Meldet mit E-Mail und Passwort an.
   */
  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: this.mapAuthErrorToGerman(error) };
      }
      if (!data.session || !data.user) {
        return { error: new Error('Anmeldung fehlgeschlagen. Bitte erneut versuchen.') };
      }

      this.applySession(data.session);
      await this.loadProfile(data.user.id);
      return { error: null };
    } catch (err: unknown) {
      return {
        error: this.mapAuthErrorToGerman(err),
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) {
        return { error: this.mapAuthErrorToGerman(error) };
      }

      // Ist die E-Mail-Bestätigung aktiv, liefert Supabase noch keine Sitzung.
      if (data.session) {
        this.applySession(data.session);
      }
      return { error: null };
    } catch (err: unknown) {
      return {
        error: this.mapAuthErrorToGerman(err),
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Aendert den angezeigten Namen des eigenen Profils.
   *
   * Bis hierhin liess sich das Profil nirgends bearbeiten - der Name kam aus
   * der Registrierung und blieb, was er war. Die E-Mail-Adresse bleibt
   * bewusst aussen vor: Sie gehoert zur Anmeldung und braucht eine
   * Bestaetigung ueber den Posteingang, nicht ein Formularfeld.
   */
  async aktualisiereProfil(vollerName: string): Promise<ProfileUpdateResult> {
    const nutzer = this.currentUser();
    if (!nutzer) {
      return { error: new Error('Nicht angemeldet'), reportedBySyncStatus: false };
    }

    const name = vollerName.trim();
    if (!name) {
      return { error: new Error('Der Name darf nicht leer sein'), reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq('id', nutzer.id)
        .select()
        .single();

      if (error || !data) {
        const reportedError = this.syncStatus?.melde(
          'Speichern des Profils',
          error ?? new Error('Die Datenbank hat kein Profil zurückgegeben.'),
        );
        return {
          error:
            reportedError ??
            (error
              ? new Error(error.message)
              : new Error('Das Profil konnte nicht gespeichert werden.')),
          reportedBySyncStatus: reportedError !== undefined,
        };
      }

      this.profile.set(data as UserProfile);
    } catch (e: unknown) {
      const reportedError = this.syncStatus?.melde('Speichern des Profils', e);
      return {
        error: reportedError ?? new Error(String(e)),
        reportedBySyncStatus: reportedError !== undefined,
      };
    }

    return { error: null, reportedBySyncStatus: false };
  }

  /**
   * Meldet in **diesem** Browser ab.
   *
   * Der Bereich muss ausdruecklich angegeben werden: Supabase meldet ohne
   * Angabe auf allen Geraeten ab. Wer sich am Handy abmeldet, flog damit auch
   * am Rechner raus - das erwartet niemand.
   */
  async signOut(): Promise<void> {
    await this.beendeSitzung('local');
  }

  /**
   * Beendet die Sitzung auf **allen** Geraeten.
   *
   * Die anderen Fenster werden zuerst benachrichtigt, denn danach ist die
   * eigene Sitzung fort und der Kanal nicht mehr beschickbar. Ohne dieses
   * Signal wuerden sie schlicht weiterlaufen, bis ihr Token ablaeuft: Ein
   * beendetes Konto merkt man einem gueltigen Token nicht an.
   */
  async abmeldenUeberall(): Promise<void> {
    const nutzerId = this.currentUser()?.id;
    if (nutzerId) {
      await this.sessionChannel.sendeAbmeldung(nutzerId);
    }

    await this.beendeSitzung('global');
  }

  private async beendeSitzung(bereich: 'local' | 'global'): Promise<void> {
    this.isLoading.set(true);
    try {
      try {
        await this.supabase.client.auth.signOut({ scope: bereich });
      } catch {
        // Auch ohne erreichbares Backend lokal abmelden.
      }
      this.leereSitzungsdaten();
      this.setDemoMode(false);
      this.router.navigate(['/auth/login']);
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Startet den Demo-Modus als bewusste Entscheidung des Nutzers. */
  enterDemoMode(): void {
    if (!this.isDemoModeAllowed) return;
    this.setDemoMode(true);
    // Nur ergaenzen, nicht ueberschreiben: Zuvor wurde hier der komplette
    // lokale Bestand ersetzt - wer als echter Nutzer versehentlich auf
    // "Demo-Modus starten" klickte, verlor seine lokalen Daten.
    this.mockStore.ensureShowcaseData();
    this.router.navigate(['/dashboard']);
  }

  private setDemoMode(active: boolean): void {
    this.isDemoMode.set(active);
    this.mockStore.isDemoMode.set(active);
    try {
      if (active) {
        localStorage.setItem(DEMO_MODE_KEY, 'true');
      } else {
        localStorage.removeItem(DEMO_MODE_KEY);
      }
    } catch {
      // Ohne Speicher gilt der Modus nur für diese Sitzung.
    }
  }

  private readStoredDemoMode(): boolean {
    if (!environment.allowDemoMode) return false;
    try {
      return localStorage.getItem(DEMO_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
