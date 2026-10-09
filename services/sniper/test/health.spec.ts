import { describe, expect, it } from 'vitest';
import { createHealthState, startHealthServer } from '../src/health.js';

const report = {
  polled: 2,
  skippedForBudget: 1,
  newListings: 3,
  seeded: 0,
  failed: 0,
  newHits: 0,
};

describe('createHealthState', () => {
  it('allows configured long tick intervals and still detects a missed following tick', () => {
    let elapsed = 0;
    const state = createHealthState(
      () => 0,
      () => elapsed,
      20 * 60_000,
    );
    elapsed = 10 * 60_000;
    expect(state.isLive()).toBe(true);
    elapsed = 20 * 60_000 + 1;
    expect(state.isLive()).toBe(false);
  });

  it('keeps long cycles live through completed individual requests', () => {
    let elapsed = 0;
    const state = createHealthState(
      () => 0,
      () => elapsed,
    );
    for (let request = 0; request < 10; request++) {
      elapsed += 60_000;
      state.recordProgress();
      expect(state.isLive()).toBe(true);
      expect(state.snapshot().lastSuccessfulCycleAt).toBeNull();
    }
  });

  it('reports a stalled collector as unhealthy even while the HTTP server still responds', async () => {
    let elapsed = 0;
    const state = createHealthState(
      () => 0,
      () => elapsed,
    );
    state.recordCycle(report, new Date('2026-10-09T00:59:07.000Z'));
    const server = startHealthServer(state, 0, (error) => {
      throw error;
    });
    const port = await new Promise<number>((resolve) => {
      server.on('listening', () => resolve((server.address() as { port: number }).port));
    });
    try {
      elapsed = 5 * 60_000 + 1;
      const live = await fetch(`http://127.0.0.1:${port}/live`);
      expect(live.status).toBe(503);
      expect(await live.json()).toEqual({ live: false });
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(503);
      expect((await health.json()).lastSuccessfulCycleAt).toBe('2026-10-09T00:59:07.000Z');
      state.recordProgress();
      expect((await fetch(`http://127.0.0.1:${port}/live`)).status).toBe(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps empty or deliberately paused cycles live without inventing a successful Vinted poll', () => {
    let elapsed = 0;
    const state = createHealthState(
      () => 0,
      () => elapsed,
    );
    for (let cycle = 0; cycle < 10; cycle++) {
      elapsed += 60_000;
      state.recordCycle(
        { ...report, polled: 0, originPause: { reason: 'interaction_required', until: null } },
        new Date(),
      );
      expect(state.isLive()).toBe(true);
      expect(state.snapshot().ready).toBe(false);
      expect(state.snapshot().lastSuccessfulCycleAt).toBeNull();
    }
  });

  it('reports a running process separately from search readiness before any queries exist', async () => {
    const state = createHealthState(() => 0);
    const server = startHealthServer(state, 0, (error) => {
      throw error;
    });
    const port = await new Promise<number>((resolve) => {
      server.on('listening', () => resolve((server.address() as { port: number }).port));
    });
    try {
      const live = await fetch(`http://127.0.0.1:${port}/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ live: true });
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(503);
      expect((await health.json()).ready).toBe(false);
      expect((await fetch(`http://127.0.0.1:${port}/unknown`)).status).toBe(404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('starts as not ready before the first cycle', () => {
    const state = createHealthState(() => 0.25);

    expect(state.snapshot()).toEqual({
      ready: false,
      lastSuccessfulCycleAt: null,
      budgetUsageRatio: 0.25,
      deactivatedQueries: 0,
    });
  });

  it('records the time of the last successful cycle', () => {
    const state = createHealthState(() => 0.5);

    state.recordCycle(report, new Date('2026-08-30T10:00:00.000Z'));

    expect(state.snapshot().ready).toBe(true);
    expect(state.snapshot().lastSuccessfulCycleAt).toBe('2026-08-30T10:00:00.000Z');
  });

  it('counts deactivated queries across cycles', () => {
    const state = createHealthState(() => 0);

    state.recordDeactivation();
    state.recordDeactivation();

    expect(state.snapshot().deactivatedQueries).toBe(2);
  });

  it('does not mark a cycle successful when every query failed', () => {
    const state = createHealthState(() => 0);

    state.recordCycle({ ...report, polled: 0, failed: 2 }, new Date());

    expect(state.snapshot().ready).toBe(false);
  });

  it('stays ready after a later cycle polls nothing at all', () => {
    const state = createHealthState(() => 0);
    state.recordCycle(report, new Date('2026-08-30T10:00:00.000Z'));

    // Keine faellige Abfrage ist kein Fehler - der Dienst laeuft, es gibt nur
    // gerade nichts zu tun. Wuerde das die Bereitschaft zuruecksetzen, meldete
    // sich ein gesunder Dienst in ruhigen Minuten als krank.
    state.recordCycle({ ...report, polled: 0, failed: 0 }, new Date());

    expect(state.snapshot().ready).toBe(true);
    expect(state.snapshot().lastSuccessfulCycleAt).toBe('2026-08-30T10:00:00.000Z');
  });

  it('reports a busy port instead of pretending to listen', async () => {
    const state = createHealthState(() => 0);

    // Port 0 laesst das Betriebssystem einen freien waehlen. Die Adresse steht
    // erst fest, wenn das Binden durch ist - deshalb auf 'listening' warten.
    const blocker = startHealthServer(state, 0, (error) => {
      // Der Blockierer selbst muss binden koennen - sonst prueft der Test
      // etwas anderes, als er behauptet.
      throw error;
    });
    const port = await new Promise<number>((resolve) => {
      blocker.on('listening', () => resolve((blocker.address() as { port: number }).port));
    });

    const reported = await new Promise<Error>((resolve) => {
      const second = startHealthServer(state, port, resolve);
      second.on('listening', () => second.close());
    });

    blocker.close();

    // Ohne den Fehlerkanal band Node still auf einem anderen Netzwerkstapel:
    // Der Dienst lief, /health antwortete nie, und die Ueberwachung hielt ihn
    // trotzdem fuer gesund.
    expect(reported.message).toMatch(/EADDRINUSE|address already in use/i);
  });
});
