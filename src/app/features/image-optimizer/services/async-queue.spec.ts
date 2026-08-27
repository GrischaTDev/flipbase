import { describe, expect, it } from 'vitest';
import { KeyedQueue } from './async-queue';

function aufschiebbar<T>(): {
  promise: Promise<T>;
  aufloesen: (wert: T) => void;
  ablehnen: (grund: unknown) => void;
} {
  let aufloesen!: (wert: T) => void;
  let ablehnen!: (grund: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    aufloesen = resolve;
    ablehnen = reject;
  });
  return { promise, aufloesen, ablehnen };
}

describe('Schluesselbasierte Async-Warteschlange', () => {
  it('zaehlt eingereihte Aufgaben sofort als ausstehend', () => {
    const warteschlange = new KeyedQueue<string>();
    const freigabe = aufschiebbar<void>();

    void warteschlange.enqueue('bild-1', () => freigabe.promise);
    void warteschlange.enqueue('bild-1', () => freigabe.promise);

    expect(warteschlange.pendingCount()).toBe(2);
  });

  it('zaehlt eine erfolgreiche Aufgabe nach ihrem Abschluss herunter', async () => {
    const warteschlange = new KeyedQueue<string>();

    await warteschlange.enqueue('bild-1', async () => 'fertig');

    expect(warteschlange.pendingCount()).toBe(0);
  });

  it('zaehlt auch eine fehlgeschlagene Aufgabe nach ihrem Abschluss herunter', async () => {
    const warteschlange = new KeyedQueue<string>();

    await expect(
      warteschlange.enqueue('bild-1', async () => {
        throw new Error('kaputt');
      }),
    ).rejects.toThrow('kaputt');

    expect(warteschlange.pendingCount()).toBe(0);
  });

  it('startet Aufgaben derselben ID nacheinander', async () => {
    const warteschlange = new KeyedQueue<string>();
    const ersteFreigabe = aufschiebbar<void>();
    const gestartet: string[] = [];

    const erste = warteschlange.enqueue('bild-1', async () => {
      gestartet.push('erste');
      await ersteFreigabe.promise;
      return 1;
    });
    const zweite = warteschlange.enqueue('bild-1', async () => {
      gestartet.push('zweite');
      return 2;
    });

    await Promise.resolve();
    expect(gestartet).toEqual(['erste']);

    ersteFreigabe.aufloesen();
    await expect(Promise.all([erste, zweite])).resolves.toEqual([1, 2]);
    expect(gestartet).toEqual(['erste', 'zweite']);
  });

  it('laesst Aufgaben verschiedener IDs parallel starten', async () => {
    const warteschlange = new KeyedQueue<string>();
    const freigabe = aufschiebbar<void>();
    const gestartet: string[] = [];

    const erste = warteschlange.enqueue('bild-1', async () => {
      gestartet.push('bild-1');
      await freigabe.promise;
    });
    const zweite = warteschlange.enqueue('bild-2', async () => {
      gestartet.push('bild-2');
    });

    await Promise.resolve();
    expect(gestartet).toEqual(['bild-1', 'bild-2']);

    freigabe.aufloesen();
    await Promise.all([erste, zweite]);
  });

  it('fuehrt die naechste Aufgabe auch nach einem Fehler aus', async () => {
    const warteschlange = new KeyedQueue<string>();
    const reihenfolge: string[] = [];

    const fehlgeschlagen = warteschlange.enqueue('bild-1', async () => {
      reihenfolge.push('fehler');
      throw new Error('kaputt');
    });
    const danach = warteschlange.enqueue('bild-1', async () => {
      reihenfolge.push('danach');
      return 'fertig';
    });

    await expect(fehlgeschlagen).rejects.toThrow('kaputt');
    await expect(danach).resolves.toBe('fertig');
    expect(reihenfolge).toEqual(['fehler', 'danach']);
  });
});
