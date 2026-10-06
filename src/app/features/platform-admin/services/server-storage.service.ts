import { Injectable, inject } from '@angular/core';
import { Database } from '../../../core/models/supabase.types';
import { SupabaseService } from '../../../core/services/supabase.service';

export type ServerStorageStatus = Database['public']['Tables']['server_storage_status']['Row'];

@Injectable({ providedIn: 'root' })
export class ServerStorageService {
  private readonly client = inject(SupabaseService).client;

  async load(): Promise<ServerStorageStatus | null> {
    const { data, error } = await this.client
      .from('server_storage_status')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
}
