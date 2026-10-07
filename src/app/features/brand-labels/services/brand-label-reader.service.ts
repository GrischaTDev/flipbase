import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { LabelAvailability, LabelPage, LabelReadFilter } from '../models/brand-label.models';
import {
  readLabelAvailability,
  readLabelDetail,
  readLabelPage,
  type LabelDetail,
} from '../models/brand-label-reader';

type ReaderRpcName =
  'get_label_library_availability' | 'list_label_references' | 'get_label_reference';
/** Eng begrenzter SQL-Kandidatenvertrag, bis die Migration API-Typen erzeugt. */
interface ReaderRpcClient {
  rpc(
    name: ReaderRpcName,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export class LabelReadError extends Error {
  constructor(readonly reason: 'unavailable' | 'network' | 'invalid-response') {
    super(
      reason === 'unavailable'
        ? 'Die Labelbibliothek ist für diesen Zugang noch nicht verfügbar.'
        : 'Die Labeldaten konnten nicht geladen werden. Bitte versuche es erneut.',
    );
    this.name = 'LabelReadError';
  }
}

@Injectable({ providedIn: 'root' })
export class BrandLabelReaderService {
  // Kein zweiter Client und keine eigene Anmeldung. Antworten werden vollständig validiert.
  private readonly client = inject(SupabaseService).client as unknown as ReaderRpcClient;

  availability(): Promise<LabelAvailability> {
    return this.read('get_label_library_availability', {}, readLabelAvailability);
  }
  list(filter: LabelReadFilter, offset: number): Promise<LabelPage> {
    return this.read(
      'list_label_references',
      { p_filter: filter, p_offset: offset },
      readLabelPage,
    );
  }
  detail(brandSlug: string, labelSlug: string): Promise<LabelDetail | null> {
    return this.read(
      'get_label_reference',
      { p_brand_slug: brandSlug, p_label_slug: labelSlug },
      readLabelDetail,
    );
  }

  private async read<T>(
    name: ReaderRpcName,
    args: Record<string, unknown>,
    decode: (value: unknown) => T,
  ): Promise<T> {
    let response: { data: unknown; error: unknown };
    try {
      response = await this.client.rpc(name, args);
    } catch {
      throw new LabelReadError('network');
    }
    if (response.error) {
      const code =
        typeof response.error === 'object' && 'code' in response.error ? response.error.code : null;
      throw new LabelReadError(
        ['42501', 'PGRST202', 'PGRST301', 'PGRST302'].includes(String(code))
          ? 'unavailable'
          : 'network',
      );
    }
    try {
      return decode(response.data);
    } catch {
      throw new LabelReadError('invalid-response');
    }
  }
}
