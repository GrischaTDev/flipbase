import { describe, expect, it } from 'vitest';
import { createHealthState, startHealthServer } from '../src/health.js';

const report = {
  polled: 2,
  skippedForBudget: 1,
  newListings: 3,
  seeded: 0,
  failed: 0,
};

describe('createHealthState', () => {
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
    const blocker = startHealthServer(state, 0, () => {});
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
