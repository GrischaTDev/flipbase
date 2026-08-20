import { describe, it, expect, vi } from 'vitest';
import { schreibeImHintergrund } from './supabase-schreiben';
import { SyncStatusService } from './sync-status.service';

/**
 * Der Abfrage-Erbauer von supabase-js schickt seine Anfrage erst ab, wenn
 * jemand auf das Ergebnis wartet. Ein Schreibbefehl ohne `await` sendet
 * deshalb gar nichts - lautlos. So sind Benachrichtigungen, offline erfasste
 * Flohmarkt-Eintraege und Versandauftraege verloren gegangen: Auf dem
 * Bildschirm stand alles richtig, in der Datenbank kam nie etwas an.
 */
describe('Schreibbefehle im Hintergrund', () => {
  /** Verhaelt sich wie der Erbauer: fuehrt erst aus, wenn `then` gerufen wird. */
  function faulerBefehl(ergebnis: { error: unknown }) {
    const zustand = { ausgefuehrt: false };
    // Die Form muss zu PromiseLike passen, sonst prueft TypeScript sie nicht
    // gegen dieselbe Schnittstelle wie den echten Erbauer.
    const befehl = {
      then<T1 = { error: unknown }, T2 = never>(
        beiErfolg?: ((wert: { error: unknown }) => T1 | PromiseLike<T1>) | null,
        beiFehler?: ((grund: unknown) => T2 | PromiseLike<T2>) | null,
      ): PromiseLike<T1 | T2> {
        zustand.ausgefuehrt = true;
        return Promise.resolve(ergebnis).then(beiErfolg, beiFehler);
      },
    };
    return { befehl, zustand };
  }

  /**
   * Eine Runde warten. `Promise.resolve(...)` uebernimmt einen fremden
   * "Thenable" erst in der naechsten Mikrorunde - der Befehl laeuft also los,
   * nur nicht in derselben Zeile.
   */
  const naechsteRunde = () => new Promise((fertig) => setTimeout(fertig, 0));

  it('fuehrt den Befehl tatsaechlich aus', async () => {
    const { befehl, zustand } = faulerBefehl({ error: null });

    schreibeImHintergrund(befehl, 'Test');
    await naechsteRunde();

    expect(zustand.ausgefuehrt).toBe(true);
  });

  it('bleibt beim blossen Erzeugen wirkungslos - die Falle selbst', () => {
    // Gegenprobe: Genau so sah der fehlerhafte Code aus. Ohne dass jemand auf
    // das Ergebnis wartet, passiert nichts.
    const { zustand } = faulerBefehl({ error: null });

    expect(zustand.ausgefuehrt).toBe(false);
  });

  it('meldet einen Fehler, statt ihn zu verschlucken', async () => {
    const melde = vi.fn();
    const { befehl } = faulerBefehl({ error: { message: 'kaputt' } });

    schreibeImHintergrund(befehl, 'Speichern der Meldung', {
      melde,
    } as unknown as SyncStatusService);
    await naechsteRunde();

    expect(melde).toHaveBeenCalledWith('Speichern der Meldung', { message: 'kaputt' });
  });

  it('meldet nichts, wenn alles gut ging', async () => {
    const melde = vi.fn();
    const { befehl } = faulerBefehl({ error: null });

    schreibeImHintergrund(befehl, 'Speichern der Meldung', {
      melde,
    } as unknown as SyncStatusService);
    await naechsteRunde();

    expect(melde).not.toHaveBeenCalled();
  });

  it('faengt auch einen abgelehnten Befehl ab', async () => {
    const melde = vi.fn();
    const abgelehnt = { then: (_ok: unknown, fehler: (e: unknown) => void) => fehler('Netz weg') };

    schreibeImHintergrund(abgelehnt as never, 'Speichern der Meldung', {
      melde,
    } as unknown as SyncStatusService);
    await naechsteRunde();

    expect(melde).toHaveBeenCalledWith('Speichern der Meldung', 'Netz weg');
  });
});
