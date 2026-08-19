import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { UserProfile } from '../models/reflip.models';
import { environment } from '../../../environments/environment';

/** Speicherschlüssel für den bewusst gewählten Demo-Modus. */
const DEMO_MODE_KEY = 'reflip_demo_mode';

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
  private readonly mockStore = inject(MockDataStoreService);
  private readonly router = inject(Router);

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
    () => this.isAuthenticated() || (this.isDemoModeAllowed && this.isDemoMode())
  );

  readonly userEmail = computed<string>(() => {
    if (this.isAuthenticated()) return this.currentUser()?.email ?? '';
    return this.isDemoMode() ? 'demo@reflip.app' : '';
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
    this.sessionReady = this.initAuth();
    this.watchAuthState();
  }

  /**
   * Stellt eine bestehende Sitzung wieder her. Schlägt der Aufruf fehl, gilt
   * der Nutzer als nicht angemeldet – es wird **nicht** ersatzweise Zugriff
   * gewährt.
   */
  private async initAuth(): Promise<void> {
    this.isLoading.set(true);
    try {
      const { data } = await this.supabase.client.auth.getSession();
      if (data?.session) {
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
          this.session.set(null);
          this.currentUser.set(null);
          this.profile.set(null);
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
  }

  async loadProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        this.profile.set(data as UserProfile);
      }
    } catch {
      // Profil ist optional – die Anmeldung bleibt davon unberührt.
    }
  }

  /**
   * Meldet mit E-Mail und Passwort an.
   *
   * Es gibt **keinen** Ersatzweg: Ist das Backend nicht erreichbar oder sind
   * die Zugangsdaten falsch, schlägt die Anmeldung fehl. Zuvor führte ein
   * Zeitüberschreitungs-Fallback dazu, dass jede beliebige Kombination aus
   * E-Mail und Passwort akzeptiert wurde, sobald Supabase langsam antwortete.
   */
  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }
      if (!data.session || !data.user) {
        return { error: new Error('Anmeldung fehlgeschlagen. Bitte erneut versuchen.') };
      }

      this.applySession(data.session);
      await this.loadProfile(data.user.id);
      return { error: null };
    } catch {
      return {
        error: new Error(
          'Backend nicht erreichbar. Starte den lokalen Supabase-Stack mit "npm run supabase:start".'
        ),
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) {
        return { error };
      }

      // Ist die E-Mail-Bestätigung aktiv, liefert Supabase noch keine Sitzung.
      if (data.session) {
        this.applySession(data.session);
      }
      return { error: null };
    } catch {
      return {
        error: new Error(
          'Backend nicht erreichbar. Starte den lokalen Supabase-Stack mit "npm run supabase:start".'
        ),
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isLoading.set(true);
    try {
      try {
        await this.supabase.client.auth.signOut();
      } catch {
        // Auch ohne erreichbares Backend lokal abmelden.
      }
      this.session.set(null);
      this.currentUser.set(null);
      this.profile.set(null);
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
