import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseMarketplaceSyncSchedule,
  parseScheduledSyncAvailability,
  type MarketplaceSyncInterval,
  type MarketplaceSyncSchedule,
  type ScheduledSyncAvailability,
} from '../models/marketplace-sync-schedule';

export class MarketplaceSyncScheduleError extends Error {
  constructor(readonly code: 'forbidden' | 'unavailable' | 'conflict' | 'request_failed') {
    super(
      code === 'forbidden'
        ? 'Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.'
        : code === 'unavailable'
          ? 'Die automatische Aktualisierung ist auf diesem Server noch nicht verfügbar.'
          : code === 'conflict'
            ? 'Die automatische Aktualisierung wurde inzwischen geändert. Lade den Stand erneut, bevor Du speicherst.'
            : 'Die Änderung konnte nicht bestätigt werden. Lade den Stand erneut, bevor Du sie wiederholst.',
    );
  }
}
function responseData(result: { data: unknown; error: { code?: string } | null }): unknown {
  if (result.error) {
    const code = result.error.code;
    throw new MarketplaceSyncScheduleError(
      code === '42501' || code === 'PGRST301'
        ? 'forbidden'
        : code === 'PGRST202' || code === '42883'
          ? 'unavailable'
          : code === '40001'
            ? 'conflict'
            : 'request_failed',
    );
  }
  return result.data;
}

/** Nutzeraktionen bearbeiten ausschließlich die dauerhaft gespeicherte Lesefreigabe. */
@Injectable({ providedIn: 'root' })
export class MarketplaceSyncScheduleApiService {
  private readonly client = inject(SupabaseService).client;

  async read(scope: AccountScope): Promise<MarketplaceSyncSchedule> {
    return parseMarketplaceSyncSchedule(
      responseData(
        await this.client.rpc('marketplace_read_sync_schedule', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
      scope,
    );
  }
  async set(
    scope: AccountScope,
    enabled: boolean,
    intervalMinutes: MarketplaceSyncInterval,
    authorizationVersion: number,
  ): Promise<MarketplaceSyncSchedule> {
    return parseMarketplaceSyncSchedule(
      responseData(
        await this.client.rpc('marketplace_set_sync_schedule', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_enabled: enabled,
          p_interval_minutes: intervalMinutes,
          p_authorization_version: authorizationVersion,
        }),
      ),
      scope,
    );
  }
  async availability(): Promise<ScheduledSyncAvailability> {
    const unavailable: ScheduledSyncAvailability = { enabled: false, allowedIntervals: [] };
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = (async (): Promise<ScheduledSyncAvailability> => {
        const response = await fetch('/marketplace-browser/healthz', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          return unavailable;
        return parseScheduledSyncAvailability(await response.json());
      })();
      const deadline = new Promise<ScheduledSyncAvailability>((resolve) => {
        timeout = setTimeout(() => {
          resolve(unavailable);
          controller.abort();
        }, 5_000);
      });
      return await Promise.race([request, deadline]);
    } catch {
      return unavailable;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}
