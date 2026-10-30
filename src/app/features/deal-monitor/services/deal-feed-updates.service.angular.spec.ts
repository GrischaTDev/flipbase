import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DealFeedUpdatesService } from './deal-feed-updates.service';

const workspaceA = '10000000-0000-4000-8000-000000000001';
const workspaceB = '10000000-0000-4000-8000-000000000002';

function createChannel() {
  let receive: (message: unknown) => void = () => undefined;
  let status: (value: REALTIME_SUBSCRIBE_STATES) => void = () => undefined;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: typeof receive) => {
      receive = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: typeof status) => {
      status = callback;
      return channel;
    }),
  };
  return {
    channel,
    receive: (payload: unknown = { refresh: true }) =>
      receive({ type: 'broadcast', event: 'feed_updated', payload }),
    status: (value: REALTIME_SUBSCRIBE_STATES) => status(value),
  };
}

describe('Private Hinweise für den Deal-Feed', () => {
  let channels: ReturnType<typeof createChannel>[];
  let client: { channel: ReturnType<typeof vi.fn>; removeChannel: ReturnType<typeof vi.fn> };
  let updates: DealFeedUpdatesService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    channels = [];
    client = {
      channel: vi.fn(() => {
        const channel = createChannel();
        channels.push(channel);
        return channel.channel as unknown as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    };
    TestBed.configureTestingModule({
      providers: [DealFeedUpdatesService, { provide: SupabaseService, useValue: { client } }],
    });
    updates = TestBed.inject(DealFeedUpdatesService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('abonniert nur den privaten Feed-Kanal des aktuellen Arbeitsbereichs', () => {
    updates.watch(workspaceA, () => undefined);
    expect(client.channel).toHaveBeenCalledWith(`workspace:${workspaceA}:sniper_feed`, {
      config: { private: true },
    });
    expect(channels[0].channel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'feed_updated' },
      expect.any(Function),
    );
  });

  it('bündelt viele Hinweise und begrenzt laufenden Zulauf auf einen Abgleich pro Sekunde', async () => {
    const refresh = vi.fn();
    updates.watch(workspaceA, refresh);
    for (let i = 0; i < 20; i++) channels[0]?.receive();
    await vi.advanceTimersByTimeAsync(250);
    expect(refresh).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      channels[0].receive();
      await vi.advanceTimersByTimeAsync(90);
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('gleicht nach jeder erfolgreichen Verbindung ab und verwirft ungültige Nutzlasten', async () => {
    const refresh = vi.fn();
    updates.watch(workspaceA, refresh);
    channels[0]?.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    await vi.advanceTimersByTimeAsync(250);
    expect(refresh).toHaveBeenCalledTimes(1);
    channels[0].status(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    channels[0].receive(null);
    channels[0].receive({ refresh: false });
    channels[0].receive({ items: [{ id: 'foreign' }] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    channels[0].status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    await vi.advanceTimersByTimeAsync(250);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('verwirft alte Hinweise und Timer bei einem Arbeitsbereichwechsel', async () => {
    const oldRefresh = vi.fn();
    const newRefresh = vi.fn();
    const oldCleanup = updates.watch(workspaceA, oldRefresh);
    channels[0]?.receive();
    updates.watch(workspaceB, newRefresh);
    oldCleanup();
    channels[0]?.receive();
    channels[0]?.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    channels[1]?.receive();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(oldRefresh).not.toHaveBeenCalled();
    expect(newRefresh).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledWith(channels[0].channel);
    expect(client.removeChannel).not.toHaveBeenCalledWith(channels[1].channel);
  });

  it('räumt Kanal und Timer beim Verlassen auf und ignoriert späte Rückmeldungen', async () => {
    const refresh = vi.fn();
    updates.watch(workspaceA, refresh);
    channels[0]?.receive();
    TestBed.resetTestingModule();
    channels[0]?.receive();
    channels[0]?.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledWith(channels[0].channel);
  });

  it('beendet ein Abonnement ausdrücklich und verträgt einen fehlgeschlagenen Kanalabbau', async () => {
    client.removeChannel.mockRejectedValueOnce(new Error('offline'));
    const refresh = vi.fn();
    const stop = updates.watch(workspaceA, refresh);
    channels[0].receive();
    stop();
    stop();
    channels[0].receive();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('lässt einen synchronen Verbindungsfehler nicht in den Feed durchschlagen und kann später abonnieren', async () => {
    client.channel.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    const refresh = vi.fn();
    expect(() => updates.watch(workspaceA, refresh)).not.toThrow();
    updates.watch(workspaceA, refresh);
    channels[0].status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    await vi.advanceTimersByTimeAsync(250);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
