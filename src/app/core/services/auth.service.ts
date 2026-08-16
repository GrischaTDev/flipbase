import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { UserProfile } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // Signals
  readonly session = signal<AuthSession | null>(null);
  readonly currentUser = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly isLoading = signal<boolean>(true);

  // Computed signals
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly userEmail = computed(() => this.currentUser()?.email ?? '');
  readonly userName = computed(() => {
    return this.profile()?.full_name || this.currentUser()?.user_metadata?.['full_name'] || this.userEmail().split('@')[0] || 'Reseller';
  });

  constructor() {
    this.initAuth();
  }

  private async initAuth(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (!error && data.session) {
        this.session.set(data.session);
        this.currentUser.set(data.session.user);
        await this.loadProfile(data.session.user.id);
      }
    } catch (err) {
      console.error('Error initializing auth session:', err);
    } finally {
      this.isLoading.set(false);
    }

    // Subscribe to auth changes
    this.supabase.client.auth.onAuthStateChange(async (_event, session) => {
      this.session.set(session);
      this.currentUser.set(session?.user ?? null);
      if (session?.user) {
        await this.loadProfile(session.user.id);
      } else {
        this.profile.set(null);
      }
      this.isLoading.set(false);
    });
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
      console.error('Error loading profile:', err);
    }
  }

  async signIn(email: string, password: string):Promise<{ error: Error | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      this.session.set(data.session);
      this.currentUser.set(data.user);
      if (data.user) {
        await this.loadProfile(data.user.id);
      }
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
      const { data, error } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return { error };
      }

      this.session.set(data.session);
      this.currentUser.set(data.user);
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
      await this.supabase.client.auth.signOut();
      this.session.set(null);
      this.currentUser.set(null);
      this.profile.set(null);
      this.router.navigate(['/auth/login']);
    } finally {
      this.isLoading.set(false);
    }
  }
}
