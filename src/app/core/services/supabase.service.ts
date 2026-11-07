import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from '../models/supabase.types';
import { createWakeUpFetch } from './supabase-wake-up-fetch';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  public readonly client: SupabaseClient<Database>;
  /** Bleibt bei einer nur vorübergehend gescheiterten Token-Erneuerung bestehen. */
  private signedIn = false;

  constructor() {
    this.client = createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: createWakeUpFetch({
          supabaseUrl: environment.supabaseUrl,
          anonKey: environment.supabaseAnonKey,
          hasSignedInUser: () => this.signedIn,
          freshAccessToken: () => this.freshAccessToken(),
        }),
      },
    });
    this.client.auth.onAuthStateChange((event, session) => {
      this.signedIn = event !== 'SIGNED_OUT' && session !== null;
    });
  }

  private async freshAccessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    const session = data.session;
    if (session && (session.expires_at ?? 0) * 1000 > Date.now() + 10_000)
      return session.access_token;
    const refreshed = await this.client.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  }
}
