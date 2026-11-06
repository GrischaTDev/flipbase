import { Injectable, inject, signal } from '@angular/core';
import {
  PlatformFeatureKey,
  PlatformFeatureSwitch,
  platformFeatureArea,
} from '../models/platform-feature.model';
import { SupabaseService } from './supabase.service';

const DEFAULT_MAX_AGE_MS = 15_000;

/**
 * Betreiberschalter je Kernbereich (public.platform_feature_switches).
 *
 * Kann der Stand nicht gelesen werden, gilt ein Bereich als offen: Ein
 * Ladefehler soll niemanden aussperren. Die Server-Dienste prüfen den Schalter
 * unabhängig davon selbst.
 */
@Injectable({ providedIn: 'root' })
export class PlatformFeatureSwitchService {
  private readonly supabase = inject(SupabaseService);
  private loadedAt = 0;
  private loading: Promise<readonly PlatformFeatureSwitch[]> | null = null;

  readonly switches = signal<readonly PlatformFeatureSwitch[]>([]);

  async refresh(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<readonly PlatformFeatureSwitch[]> {
    if (Date.now() - this.loadedAt < maxAgeMs) return this.switches();
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async isEnabled(key: PlatformFeatureKey): Promise<boolean> {
    try {
      const switches = await this.refresh();
      return switches.find((entry) => entry.key === key)?.enabled !== false;
    } catch {
      return true;
    }
  }

  switchFor(key: PlatformFeatureKey): PlatformFeatureSwitch | null {
    return this.switches().find((entry) => entry.key === key) ?? null;
  }

  async set(
    key: PlatformFeatureKey,
    enabled: boolean,
    maintenanceMessage: string | null,
  ): Promise<PlatformFeatureSwitch> {
    const { data, error } = await this.supabase.client.rpc('set_platform_feature_switch', {
      p_feature_key: key,
      p_enabled: enabled,
      p_maintenance_message: maintenanceMessage ?? undefined,
    });
    if (error) throw new Error(error.message);
    const updated = toSwitch(data);
    if (!updated) throw new Error('Der Schalter wurde nicht gespeichert.');
    this.switches.update((current) => [
      ...current.filter((entry) => entry.key !== updated.key),
      updated,
    ]);
    return updated;
  }

  private async load(): Promise<readonly PlatformFeatureSwitch[]> {
    const { data, error } = await this.supabase.client
      .from('platform_feature_switches')
      .select('feature_key, enabled, maintenance_message, updated_at');
    if (error) throw new Error(error.message);
    const switches = (data ?? [])
      .map(toSwitch)
      .filter((entry): entry is PlatformFeatureSwitch => entry !== null);
    this.switches.set(switches);
    this.loadedAt = Date.now();
    return switches;
  }
}

function toSwitch(row: unknown): PlatformFeatureSwitch | null {
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const area = platformFeatureArea(
    typeof value['feature_key'] === 'string' ? value['feature_key'] : null,
  );
  if (!area || typeof value['enabled'] !== 'boolean') return null;
  return {
    key: area.key,
    enabled: value['enabled'],
    maintenanceMessage:
      typeof value['maintenance_message'] === 'string' ? value['maintenance_message'] : null,
    updatedAt: typeof value['updated_at'] === 'string' ? value['updated_at'] : '',
  };
}
