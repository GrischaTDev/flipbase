import { Injectable, computed, inject, signal } from '@angular/core';
import { Brand, brandNameKey } from '../models/product-category.models';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

const PAGE_SIZE = 1000;
export const BRAND_NAME_MAX_LENGTH = 120;

interface LoadedBrands {
  readonly key: string;
  readonly brands: readonly Brand[];
}

export interface BrandDeletionResult {
  readonly deleted: true;
  readonly reassigned: number;
}

function sortBrands(brands: readonly Brand[]): Brand[] {
  return [...brands].sort((left, right) => left.name.localeCompare(right.name, 'de-DE'));
}

/**
 * Marken des aktuellen Workspace.
 *
 * Der Kontext besteht aus dem Workspace. Bewusst ohne AuthService: Der
 * Dienst steckt in Formularen, deren Tests sonst die ganze Anmeldekette brauchten.
 * Ein anderer Nutzer bedeutet in Flipbase auch einen anderen Workspace-Stand.
 */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);

  private readonly loaded = signal<LoadedBrands | null>(null);
  private pending: { readonly key: string; readonly promise: Promise<void> } | null = null;

  readonly loading = signal(false);
  readonly loadError = signal<Error | null>(null);

  private readonly contextKey = computed(() => this.workspace.currentWorkspace()?.id ?? null);

  /** Nie Marken eines anderen Workspace oder Modus. */
  readonly brands = computed<readonly Brand[]>(() => {
    const state = this.loaded();
    return state && state.key === this.contextKey() ? state.brands : [];
  });

  ensureLoaded(): Promise<void> {
    const key = this.contextKey();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || this.loaded()?.key === key) return Promise.resolve();
    if (this.pending?.key === key) return this.pending.promise;
    const promise = this.load(key, workspaceId).finally(() => {
      if (this.pending?.key === key) this.pending = null;
    });
    this.pending = { key, promise };
    return promise;
  }

  reload(): Promise<void> {
    this.loaded.set(null);
    this.pending = null;
    return this.ensureLoaded();
  }

  search(term: string, limit = 50): readonly Brand[] {
    const key = brandNameKey(term);
    const brands = this.brands();
    if (!key) return brands.slice(0, limit);
    const startsWith = brands.filter((brand) => brandNameKey(brand.name).startsWith(key));
    const contains = brands.filter(
      (brand) =>
        !brandNameKey(brand.name).startsWith(key) && brandNameKey(brand.name).includes(key),
    );
    return [...startsWith, ...contains].slice(0, limit);
  }

  findByName(name: string): Brand | null {
    const key = brandNameKey(name);
    return key ? (this.brands().find((brand) => brandNameKey(brand.name) === key) ?? null) : null;
  }

  findById(id: string): Brand | null {
    return this.brands().find((brand) => brand.id === id) ?? null;
  }

  async create(
    name: string,
  ): Promise<{ readonly data: Brand | null; readonly error: Error | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: new Error('Bitte einen Markennamen eingeben.') };
    if (trimmed.length > BRAND_NAME_MAX_LENGTH)
      return {
        data: null,
        error: new Error(
          `Der Markenname darf höchstens ${BRAND_NAME_MAX_LENGTH} Zeichen lang sein.`,
        ),
      };
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const key = this.contextKey();
    if (!workspaceId || !key)
      return { data: null, error: new Error('Kein aktiver Workspace ausgewählt.') };

    await this.ensureLoaded();
    const existing = this.findByName(trimmed);
    if (existing) return { data: existing, error: null };

    try {
      const { data, error } = await this.supabase.client
        .from('brands')
        .insert({ workspace_id: workspaceId, name: trimmed })
        .select('id, workspace_id, name')
        .single();
      if (error?.code === '23505') {
        // Jemand hat dieselbe Marke gerade angelegt: vorhandene übernehmen.
        await this.reload();
        const concurrent = this.findByName(trimmed);
        if (concurrent) return { data: concurrent, error: null };
      }
      if (error || !data) throw new Error(error?.message ?? 'Die Marke wurde nicht zurückgegeben.');
      const brand: Brand = { id: data.id, workspaceId: data.workspace_id, name: data.name };
      this.loaded.update((state) =>
        state && state.key === key ? { key, brands: sortBrands([...state.brands, brand]) } : state,
      );
      return { data: brand, error: null };
    } catch (error: unknown) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Die Marke konnte nicht angelegt werden.'),
      };
    }
  }

  async replaceAndDelete(
    brandId: string,
    replacementBrandId: string | null,
  ): Promise<{ readonly data: BrandDeletionResult | null; readonly error: Error | null }> {
    if (!brandId) return { data: null, error: new Error('Bitte eine Marke auswählen.') };
    if (replacementBrandId === brandId)
      return { data: null, error: new Error('Die Ersatzmarke muss eine andere Marke sein.') };
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt.') };

    try {
      const { data, error } = await this.supabase.client.rpc('replace_and_delete_brand', {
        p_workspace_id: workspaceId,
        p_brand_id: brandId,
        ...(replacementBrandId ? { p_replacement_brand_id: replacementBrandId } : {}),
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Die Markenänderung wurde nicht vollständig bestätigt.');
      const response = data as Record<string, unknown>;
      if (response['deleted'] !== true || !Number.isInteger(response['reassigned']))
        throw new Error('Die Markenänderung wurde nicht vollständig bestätigt.');
      const result: BrandDeletionResult = {
        deleted: true,
        reassigned: Number(response['reassigned']),
      };
      await this.reload();
      return { data: result, error: null };
    } catch (error: unknown) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Die Marke konnte nicht gelöscht werden.'),
      };
    }
  }

  async rename(
    brandId: string,
    name: string,
  ): Promise<{ readonly data: Brand | null; readonly error: Error | null }> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > BRAND_NAME_MAX_LENGTH)
      return {
        data: null,
        error: new Error('Bitte einen Markennamen mit höchstens 120 Zeichen eingeben.'),
      };
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const key = this.contextKey();
    if (!workspaceId || !key)
      return { data: null, error: new Error('Kein aktiver Workspace ausgewählt.') };
    const duplicate = this.findByName(trimmed);
    if (duplicate && duplicate.id !== brandId)
      return {
        data: null,
        error: new Error('Diese Marke gibt es bereits. Bitte die Marken zusammenführen.'),
      };
    try {
      const { data, error } = await this.supabase.client
        .from('brands')
        .update({ name: trimmed })
        .eq('id', brandId)
        .eq('workspace_id', workspaceId)
        .select('id, workspace_id, name')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Die Marke wurde nicht gefunden.');
      const brand: Brand = { id: data.id, workspaceId: data.workspace_id, name: data.name };
      this.loaded.update((state) =>
        state && state.key === key
          ? {
              key,
              brands: sortBrands(state.brands.map((item) => (item.id === brandId ? brand : item))),
            }
          : state,
      );
      return { data: brand, error: null };
    } catch (error: unknown) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Die Marke konnte nicht umbenannt werden.'),
      };
    }
  }

  private async load(key: string, workspaceId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const brands = await this.fetchBrands(workspaceId);
      if (this.contextKey() === key) this.loaded.set({ key, brands: sortBrands(brands) });
    } catch (error: unknown) {
      if (this.contextKey() === key)
        this.loadError.set(
          error instanceof Error ? error : new Error('Marken konnten nicht geladen werden.'),
        );
    } finally {
      this.loading.set(false);
    }
  }

  /** Blättert, weil PostgREST jede Antwort ohne Fehler auf max_rows kürzt. */
  private async fetchBrands(workspaceId: string): Promise<Brand[]> {
    const brands: Brand[] = [];
    for (let offset = 0; ;) {
      const { data, error } = await this.supabase.client
        .from('brands')
        .select('id, workspace_id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      if (page.length === 0) return brands;
      for (const row of page)
        brands.push({ id: row.id, workspaceId: row.workspace_id, name: row.name });
      offset += page.length;
    }
  }
}
