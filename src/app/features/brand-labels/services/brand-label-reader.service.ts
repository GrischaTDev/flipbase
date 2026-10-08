import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { LabelAvailability, LabelPage, LabelReadFilter } from '../models/brand-label.models';
import {
  readLabelAvailability,
  readLabelDetail,
  readLabelPage,
  type LabelDetail,
} from '../models/brand-label-reader';
import { readLabelArray, readLabelObject, readLabelText } from '../models/brand-label-validation';
export interface LabelReaderBrand {
  readonly slug: string;
  readonly name: string;
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
  private readonly client = inject(SupabaseService).client;
  availability(): Promise<LabelAvailability> {
    return this.read(this.client.rpc('get_label_library_availability'), readLabelAvailability);
  }
  brands(): Promise<readonly LabelReaderBrand[]> {
    return this.read(this.client.rpc('list_label_reader_brands'), (value) => {
      const slugs = new Set<string>();
      return readLabelArray(value, 10000, 'brands').map((value) => {
        const row = readLabelObject(value, ['slug', 'name'], 'brand');
        const slug = readLabelText(row['slug'], 80, 'slug');
        const name = readLabelText(row['name'], 160, 'name');
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !name.trim() || slugs.has(slug))
          throw new Error('Invalid brand');
        slugs.add(slug);
        return { slug, name };
      });
    });
  }
  list(filter: LabelReadFilter, offset: number): Promise<LabelPage> {
    return this.read(
      this.client.rpc('list_label_references', { p_filter: { ...filter }, p_offset: offset }),
      readLabelPage,
    );
  }
  detail(brandSlug: string, labelSlug: string): Promise<LabelDetail | null> {
    return this.read(
      this.client.rpc('get_label_reference', { p_brand_slug: brandSlug, p_label_slug: labelSlug }),
      readLabelDetail,
    );
  }
  private async read<T>(
    request: PromiseLike<{ data: unknown; error: unknown }>,
    decode: (value: unknown) => T,
  ): Promise<T> {
    let response;
    try {
      response = await request;
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
