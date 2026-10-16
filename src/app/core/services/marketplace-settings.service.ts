import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type MarketplaceId = 'vinted' | 'ebay' | 'kleinanzeigen';
export interface MarketplaceSettings {
  readonly vinted: boolean;
  readonly ebay: boolean;
  readonly kleinanzeigen: boolean;
}
export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettings = {
  vinted: true,
  ebay: true,
  kleinanzeigen: true,
};
const LEGACY_STORAGE_KEY = 'flipbase_marketplace_settings';

function parseSettings(value: unknown): MarketplaceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_settings');
  const row = value as Record<string, unknown>;
  if (
    typeof row['vinted'] !== 'boolean' ||
    typeof row['ebay'] !== 'boolean' ||
    typeof row['kleinanzeigen'] !== 'boolean'
  )
    throw new Error('invalid_settings');
  return { vinted: row['vinted'], ebay: row['ebay'], kleinanzeigen: row['kleinanzeigen'] };
}

@Injectable({ providedIn: 'root' })
export class MarketplaceSettingsService {
  private readonly client = inject(SupabaseService).client;
  private generation = 0;
  private context: { userId: string; workspaceId: string } | null = null;
  private pendingLoad: Promise<void> | null = null;
  readonly settings = signal<MarketplaceSettings>(DEFAULT_MARKETPLACE_SETTINGS);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isVintedEnabled = computed(() => this.settings().vinted);
  readonly isEbayEnabled = computed(() => this.settings().ebay);
  readonly isKleinanzeigenEnabled = computed(() => this.settings().kleinanzeigen);
  readonly activeCount = computed(() => Object.values(this.settings()).filter(Boolean).length);

  isMarketplaceEnabled(id: MarketplaceId): boolean {
    return this.settings()[id];
  }

  reset(): void {
    this.generation++;
    this.context = null;
    this.pendingLoad = null;
    this.settings.set(DEFAULT_MARKETPLACE_SETTINGS);
    this.ready.set(false);
    this.loading.set(false);
    this.saving.set(false);
    this.error.set(null);
  }

  load(userId: string, workspaceId: string): Promise<void> {
    if (!userId || !workspaceId) {
      this.reset();
      return Promise.resolve();
    }
    if (this.context?.userId === userId && this.context.workspaceId === workspaceId) {
      if (this.pendingLoad) return this.pendingLoad;
      if (this.ready()) return Promise.resolve();
    }
    this.reset();
    this.context = { userId, workspaceId };
    const generation = this.generation;
    this.loading.set(true);
    this.pendingLoad = this.read(userId, workspaceId, generation);
    return this.pendingLoad;
  }

  retryLoad(): Promise<void> {
    const context = this.context;
    return context ? this.load(context.userId, context.workspaceId) : Promise.resolve();
  }

  private async read(userId: string, workspaceId: string, generation: number): Promise<void> {
    try {
      const result = await this.client
        .from('marketplace_user_settings')
        .select('vinted,ebay,kleinanzeigen')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (generation !== this.generation) return;
      if (result.error) throw result.error;
      const value =
        result.data === null
          ? await this.persist(this.claimLegacy(userId, workspaceId), workspaceId, true)
          : parseSettings(result.data);
      if (generation !== this.generation) return;
      this.settings.set(value);
      this.ready.set(true);
      this.clearLegacy(userId, workspaceId);
    } catch {
      if (generation === this.generation)
        this.error.set('Deine Marktplatzauswahl konnte nicht geladen werden. Versuche es erneut.');
    } finally {
      if (generation === this.generation) {
        this.loading.set(false);
        this.pendingLoad = null;
      }
    }
  }

  async setMarketplaceEnabled(id: MarketplaceId, enabled: boolean): Promise<void> {
    if (!this.context || !this.ready() || this.saving()) return;
    const context = this.context;
    const generation = this.generation;
    const previous = this.settings();
    const updated = { ...previous, [id]: enabled };
    this.settings.set(updated);
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await this.persist(updated, context.workspaceId, false);
      if (generation === this.generation) this.settings.set(saved);
    } catch {
      if (generation === this.generation) {
        this.settings.set(previous);
        this.error.set(
          'Deine Marktplatzauswahl konnte nicht gespeichert werden. Versuche es erneut.',
        );
      }
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }

  async toggleMarketplace(id: MarketplaceId): Promise<void> {
    await this.setMarketplaceEnabled(id, !this.settings()[id]);
  }

  private async persist(
    value: MarketplaceSettings,
    workspaceId: string,
    onlyIfAbsent: boolean,
  ): Promise<MarketplaceSettings> {
    const result = await this.client.rpc('marketplace_save_settings', {
      p_workspace_id: workspaceId,
      p_vinted: value.vinted,
      p_ebay: value.ebay,
      p_kleinanzeigen: value.kleinanzeigen,
      p_only_if_absent: onlyIfAbsent,
    });
    if (result.error) throw result.error;
    return parseSettings(result.data);
  }

  private legacyKey(userId: string, workspaceId: string): string {
    return 'flipbase_marketplace_legacy:' + userId + ':' + workspaceId;
  }

  private claimLegacy(userId: string, workspaceId: string): MarketplaceSettings {
    try {
      const key = this.legacyKey(userId, workspaceId);
      const own = localStorage.getItem(key);
      if (own) return parseSettings(JSON.parse(own));
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return DEFAULT_MARKETPLACE_SETTINGS;
      // Vor dem ersten Schreibversuch persönlich zuordnen, auch bei einem Netzausfall.
      localStorage.setItem(key, raw);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return DEFAULT_MARKETPLACE_SETTINGS;
      const legacy = value as Record<string, unknown>;
      return {
        vinted: typeof legacy['vinted'] === 'boolean' ? legacy['vinted'] : true,
        ebay: typeof legacy['ebay'] === 'boolean' ? legacy['ebay'] : true,
        kleinanzeigen:
          typeof legacy['kleinanzeigen'] === 'boolean' ? legacy['kleinanzeigen'] : true,
      };
    } catch {
      return DEFAULT_MARKETPLACE_SETTINGS;
    }
  }

  private clearLegacy(userId: string, workspaceId: string): void {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(this.legacyKey(userId, workspaceId));
    } catch {
      /* Eingeschränkter Browserspeicher verhindert keine Serverauswahl. */
    }
  }
}
