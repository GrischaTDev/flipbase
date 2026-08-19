import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from '../models/supabase.types';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  public readonly client: SupabaseClient<Database>;

  constructor() {
    this.client = createClient<Database>(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
}
