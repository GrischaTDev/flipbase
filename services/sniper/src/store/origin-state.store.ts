import type { SupabaseClient } from '@supabase/supabase-js';

export interface OriginState {
  origin: string;
  state: 'ready' | 'cooldown' | 'blocked';
  blockedUntil: string | null;
  reason: string | null;
  probeInFlight: boolean;
  updatedAt: string;
}

const STALE_PROBE_MS = 5 * 60_000;

export class OriginStateStore {
  constructor(private readonly client: SupabaseClient) {}

  async getState(origin: string): Promise<OriginState> {
    const { data, error } = await this.client
      .from('sniper_origin_state')
      .select('origin, state, blocked_until, reason, probe_in_flight, updated_at')
      .eq('origin', origin)
      .maybeSingle();

    if (error) {
      throw new Error(`reading origin_state for ${origin} failed: ${error.message}`);
    }

    if (!data) {
      return {
        origin,
        state: 'ready',
        blockedUntil: null,
        reason: null,
        probeInFlight: false,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      origin: data.origin,
      state: data.state,
      blockedUntil: data.blocked_until,
      reason: data.reason,
      probeInFlight: data.probe_in_flight,
      updatedAt: data.updated_at,
    };
  }

  async setCooldown(origin: string, blockedUntil: Date, reason: string): Promise<void> {
    const { error } = await this.client.from('sniper_origin_state').upsert({
      origin,
      state: 'cooldown',
      blocked_until: blockedUntil.toISOString(),
      reason,
      probe_in_flight: false,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`setting cooldown for origin ${origin} failed: ${error.message}`);
    }
  }

  async setBlocked(origin: string, reason: string): Promise<void> {
    const { error } = await this.client.from('sniper_origin_state').upsert({
      origin,
      state: 'blocked',
      blocked_until: null,
      reason,
      probe_in_flight: false,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`setting blocked for origin ${origin} failed: ${error.message}`);
    }
  }

  /**
   * Versucht, genau einen Probeabruf fuer die abgekuehlte Origin zu reservieren.
   * Wenn probe_in_flight bereits true ist, muss der Aufrufer warten - ausser die
   * Reservierung ist aelter als STALE_PROBE_MS. Dann wurde der Prozess waehrend
   * des Probeabrufs beendet (z. B. Deployment) und haette sie nie freigegeben.
   */
  async tryAcquireProbe(origin: string, now: Date = new Date()): Promise<boolean> {
    const acquired = { probe_in_flight: true, updated_at: now.toISOString() };

    const free = await this.client
      .from('sniper_origin_state')
      .update(acquired)
      .eq('origin', origin)
      .eq('probe_in_flight', false)
      .select('origin');

    if (free.error) {
      throw new Error(`acquiring probe for ${origin} failed: ${free.error.message}`);
    }
    if ((free.data?.length ?? 0) > 0) {
      return true;
    }

    const staleBefore = new Date(now.getTime() - STALE_PROBE_MS).toISOString();
    const stale = await this.client
      .from('sniper_origin_state')
      .update(acquired)
      .eq('origin', origin)
      .eq('probe_in_flight', true)
      .lt('updated_at', staleBefore)
      .select('origin');

    if (stale.error) {
      throw new Error(`taking over stale probe for ${origin} failed: ${stale.error.message}`);
    }

    return (stale.data?.length ?? 0) > 0;
  }

  async releaseProbe(origin: string, success: boolean): Promise<void> {
    const update = success
      ? {
          state: 'ready',
          blocked_until: null,
          reason: null,
          probe_in_flight: false,
          updated_at: new Date().toISOString(),
        }
      : { probe_in_flight: false, updated_at: new Date().toISOString() };

    const { error } = await this.client
      .from('sniper_origin_state')
      .update(update)
      .eq('origin', origin);

    if (error) {
      throw new Error(`releasing probe for ${origin} failed: ${error.message}`);
    }
  }

  async reset(origin: string): Promise<void> {
    const { error } = await this.client.from('sniper_origin_state').upsert({
      origin,
      state: 'ready',
      blocked_until: null,
      reason: null,
      probe_in_flight: false,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`resetting origin ${origin} failed: ${error.message}`);
    }
  }
}
