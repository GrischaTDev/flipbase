import { describe, expect, it } from 'vitest';
import { KeyedQueue } from './async-queue';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Schluesselbasierte Async-Warteschlange', () => {
  it('zaehlt eingereihte Aufgaben sofort als ausstehend', () => {
    const queue = new KeyedQueue<string>();
    const release = deferred<void>();

    void queue.enqueue('bild-1', () => release.promise);
    void queue.enqueue('bild-1', () => release.promise);

    expect(queue.pendingCount()).toBe(2);
  });

  it('zaehlt eine erfolgreiche Aufgabe nach ihrem Abschluss herunter', async () => {
    const queue = new KeyedQueue<string>();

    await queue.enqueue('bild-1', async () => 'fertig');

    expect(queue.pendingCount()).toBe(0);
  });

  it('zaehlt auch eine fehlgeschlagene Aufgabe nach ihrem Abschluss herunter', async () => {
    const queue = new KeyedQueue<string>();

    await expect(
      queue.enqueue('bild-1', async () => {
        throw new Error('kaputt');
      }),
    ).rejects.toThrow('kaputt');

    expect(queue.pendingCount()).toBe(0);
  });

  it('startet Aufgaben derselben ID nacheinander', async () => {
    const queue = new KeyedQueue<string>();
    const firstRelease = deferred<void>();
    const started: string[] = [];

    const first = queue.enqueue('bild-1', async () => {
      started.push('erste');
      await firstRelease.promise;
      return 1;
    });
    const second = queue.enqueue('bild-1', async () => {
      started.push('zweite');
      return 2;
    });

    await Promise.resolve();
    expect(started).toEqual(['erste']);

    firstRelease.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(started).toEqual(['erste', 'zweite']);
  });

  it('laesst Aufgaben verschiedener IDs parallel starten', async () => {
    const queue = new KeyedQueue<string>();
    const release = deferred<void>();
    const started: string[] = [];

    const first = queue.enqueue('bild-1', async () => {
      started.push('bild-1');
      await release.promise;
    });
    const second = queue.enqueue('bild-2', async () => {
      started.push('bild-2');
    });

    await Promise.resolve();
    expect(started).toEqual(['bild-1', 'bild-2']);

    release.resolve();
    await Promise.all([first, second]);
  });

  it('fuehrt die naechste Aufgabe auch nach einem Fehler aus', async () => {
    const queue = new KeyedQueue<string>();
    const order: string[] = [];

    const failed = queue.enqueue('bild-1', async () => {
      order.push('fehler');
      throw new Error('kaputt');
    });
    const after = queue.enqueue('bild-1', async () => {
      order.push('danach');
      return 'fertig';
    });

    await expect(failed).rejects.toThrow('kaputt');
    await expect(after).resolves.toBe('fertig');
    expect(order).toEqual(['fehler', 'danach']);
  });
});
