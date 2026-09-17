import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { OriginStateStore } from '../../src/store/origin-state.store.js';

const NOW = new Date('2026-09-17T08:00:00.000Z');

function storeWithResponses(responses: unknown[]) {
  const requests: { method: string; params: URLSearchParams; body: unknown }[] = [];
  const client = createClient('https://unit.example.test', 'unit-service-role', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          method: init?.method ?? 'GET',
          params: url.searchParams,
          body: JSON.parse(String(init?.body ?? 'null')) as unknown,
        });
        if (responses.length === 0) throw new Error('Unexpected HTTP request');
        return new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  return { store: new OriginStateStore(client), requests };
}

describe('OriginStateStore.tryAcquireProbe', () => {
  it('acquires a free probe without touching a second condition', async () => {
    const { store, requests } = storeWithResponses([[{ origin: 'vinted' }]]);

    await expect(store.tryAcquireProbe('vinted', NOW)).resolves.toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.params.get('probe_in_flight')).toBe('eq.false');
    expect(requests[0]?.body).toEqual({ probe_in_flight: true, updated_at: NOW.toISOString() });
  });

  it('takes over a probe left in flight by a stopped process', async () => {
    // Ein Neustart waehrend des Probeabrufs (z. B. Deployment) liess
    // probe_in_flight dauerhaft true stehen; jeder Zyklus meldete danach nur
    // origin_probe_already_in_flight.
    const { store, requests } = storeWithResponses([[], [{ origin: 'vinted' }]]);

    await expect(store.tryAcquireProbe('vinted', NOW)).resolves.toBe(true);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.method).toBe('PATCH');
    expect(requests[1]?.params.get('origin')).toBe('eq.vinted');
    expect(requests[1]?.params.get('probe_in_flight')).toBe('eq.true');
    expect(requests[1]?.params.get('updated_at')).toBe('lt.2026-09-17T07:55:00.000Z');
  });

  it('keeps waiting while a recent probe is still in flight', async () => {
    const { store } = storeWithResponses([[], []]);

    await expect(store.tryAcquireProbe('vinted', NOW)).resolves.toBe(false);
  });
});
