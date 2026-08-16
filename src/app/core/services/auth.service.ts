import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { UserProfile } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly router = inject(Router);

  // Signals
  readonly session = signal<AuthSession | null>(null);
  readonly currentUser = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isDemoUser = signal<boolean>(false);

  // Computed signals
  readonly isAuthenticated = computed(() => !!this.currentUser() || this.isDemoUser());
  readonly userEmail = computed(() => this.isDemoUser() ? 'demo@reflip.app' : (this.currentUser()?.email ?? ''));
  readonly userName = computed(() => {
    if (this.isDemoUser()) return 'Demo Reseller';
    return this.profile()?.full_name || this.currentUser()?.user_metadata?.['full_name'] || this.userEmail().split('@')[0] || 'Reseller';
  });

  constructor() {
    this.initAuth();
  }

  private async initAuth(): Promise<void> {
    this.isLoading.set(true);

    // Check localStorage for saved demo session
    const savedDemo = localStorage.getItem('reflip_demo_mode');
    if (savedDemo === 'true') {
      this.isDemoUser.set(true);
      this.mockStore.isDemoMode.set(true);
      this.isLoading.set(false);
      return;
    }

    try {
      // Race Supabase getSession with 600ms timeout so app never hangs
      const sessionPromise = this.supabase.client.auth.getSession();
      const result: any = await this.mockStore.withTimeout(sessionPromise, { data: { session: null }, error: null }, 600);

      if (result && result.data && result.data.session) {
        this.session.set(result.data.session);
        this.currentUser.set(result.data.session.user);
        await this.loadProfile(result.data.session.user.id);
      }
    } catch (err) {
      console.warn('Supabase local backend not reachable, ready for offline/demo mode.');
    } finally {
      this.isLoading.set(false);
    }

    // Subscribe to auth changes safely
    try {
      this.supabase.client.auth.onAuthStateChange(async (_event, session) => {
        if (!this.isDemoUser()) {
          this.session.set(session);
          this.currentUser.set(session?.user ?? null);
          if (session?.user) {
            await this.loadProfile(session.user.id);
          } else {
            this.profile.set(null);
          }
        }
      });
    } catch (err) {
      // Silently ignore if offline
    }
  }

  loginAsDemo(): void {
    this.isDemoUser.set(true);
    this.mockStore.isDemoMode.set(true);
    localStorage.setItem('reflip_demo_mode', 'true');
    this.router.navigate(['/dashboard']);
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
    } catch (err) {
      console.warn('Profile load skipped/offline');
    }
  }

  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const signInPromise = this.supabase.client.auth.signInWithPassword({ email, password });
      const res: any = await this.mockStore.withTimeout(signInPromise, null, 1200);

      if (!res || res.error) {
        // Fallback: If local backend not running, allow demo login
        if (email.toLowerCase().includes('demo') || !res) {
          this.loginAsDemo();
          return { error: null };
        }
        return { error: res?.error || new Error('Backend nicht erreichbar. Nutze bitte den Demo-Modus!') };
      }

      this.session.set(res.data.session);
      this.currentUser.set(res.data.user);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const signUpPromise = this.supabase.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      const res: any = await this.mockStore.withTimeout(signUpPromise, null, 1200);

      if (!res || res.error) {
        return { error: res?.error || new Error('Backend nicht erreichbar. Starte bitte Supabase oder nutze den Demo-Modus.') };
      }

      this.session.set(res.data.session);
      this.currentUser.set(res.data.user);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isLoading.set(true);
    try {
      this.isDemoUser.set(false);
      this.mockStore.isDemoMode.set(false);
      localStorage.removeItem('reflip_demo_mode');
      await this.supabase.client.auth.signOut().catch(() => {});
      this.session.set(null);
      this.currentUser.set(null);
      this.profile.set(null);
      this.router.navigate(['/auth/login']);
    } finally {
      this.isLoading.set(false);
    }
  }
}
