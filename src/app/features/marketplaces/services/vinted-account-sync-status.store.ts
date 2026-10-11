import { Injectable, inject, signal } from '@angular/core';
import type { MarketplaceConnection } from '../models/marketplace.models';
import type { MarketplaceSyncSchedule } from '../models/marketplace-sync-schedule';
import { MarketplaceSyncScheduleApiService } from './marketplace-sync-schedule-api.service';

/**
 * Abrufzustand der verbundenen Cloud-Konten für die Kontenübersicht. Ohne Verwaltungsrecht oder
 * bei einem Lesefehler fehlt der Eintrag; die Übersicht zeigt dann nur den Verbindungsstatus.
 */
@Injectable({ providedIn: 'root' })
export class VintedAccountSyncStatusStore {
  private readonly api = inject(MarketplaceSyncScheduleApiService);
  private readonly schedules = signal<ReadonlyMap<string, MarketplaceSyncSchedule>>(new Map());
  private generation = 0;

  schedule(connectionId: string): MarketplaceSyncSchedule | null {
    return this.schedules().get(connectionId) ?? null;
  }

  async refresh(accounts: readonly MarketplaceConnection[]): Promise<void> {
    const generation = ++this.generation;
    const results = await Promise.all(
      accounts
        .filter((account) => account.executionMode === 'cloud' && account.status === 'connected')
        .map(async ({ workspaceId, connectionId }) => {
          try {
            return await this.api.read({ workspaceId, connectionId });
          } catch {
            return null;
          }
        }),
    );
    // Ein älterer Abruf darf den Stand eines neueren nicht überschreiben.
    if (generation !== this.generation) return;
    this.schedules.set(
      new Map(
        results
          .filter((schedule): schedule is MarketplaceSyncSchedule => schedule !== null)
          .map((schedule) => [schedule.connectionId, schedule]),
      ),
    );
  }
}
