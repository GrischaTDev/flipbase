import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { QueryDraft, SniperQuery } from '../models/sniper-query.model';

@Injectable({ providedIn: 'root' })
export class SniperAdminService {
  private readonly client = inject(SupabaseService).client;

  async list(): Promise<SniperQuery[]> {
    const rows: SniperQuery[] = [];
    for (;;) {
      const { data, error } = await this.client
        .from('sniper_queries')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(rows.length, rows.length + 999);
      if (error) throw new Error(error.message);
      if (!data?.length) return rows;
      rows.push(...data);
    }
  }

  async runtime() {
    const { data, error } = await this.client
      .from('sniper_runtime_status')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async counts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    let offset = 0;
    for (;;) {
      const { data, error } = await this.client
        .rpc('sniper_query_listing_counts')
        .order('query_id')
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      if (!data?.length) return counts;
      for (const row of data) counts[row.query_id] = row.listing_count;
      offset += data.length;
    }
  }

  async save(draft: QueryDraft): Promise<void> {
    // Der Generator bildet nullable SQL-Parameter als Pflichtwerte ab. Die
    // Zusicherungen aendern keine Laufzeitwerte: SQL erhaelt ausdruecklich null.
    const { error } = await this.client.rpc('upsert_sniper_query', {
      p_id: draft.id!,
      p_search_text: draft.searchText,
      p_catalog_id: draft.catalogId!,
      p_brand_id: draft.brandId!,
      p_price_from: draft.priceFrom!,
      p_price_to: draft.priceTo!,
      p_poll_interval_ms: draft.intervalSeconds * 1000,
      p_notes: draft.notes,
    });
    if (error) throw new Error(error.message);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.client.rpc('set_sniper_query_active', {
      p_id: id,
      p_active: active,
    });
    if (error) throw new Error(error.message);
  }
}
