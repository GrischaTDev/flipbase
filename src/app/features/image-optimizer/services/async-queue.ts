import { signal } from '@angular/core';

/** Serialisiert asynchrone Aufgaben je Schluessel, ohne andere Schluessel auszubremsen. */
export class KeyedQueue<TKey> {
  private readonly lastTask = new Map<TKey, Promise<void>>();
  readonly pendingCount = signal(0);

  enqueue<T>(key: TKey, task: () => Promise<T>): Promise<T> {
    this.pendingCount.update((count) => count + 1);

    const previous = this.lastTask.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const withUpdatedCount = result.then(
      (value) => {
        this.pendingCount.update((count) => count - 1);
        return value;
      },
      (error: unknown) => {
        this.pendingCount.update((count) => count - 1);
        throw error;
      },
    );
    const settled = withUpdatedCount.then(
      () => undefined,
      () => undefined,
    );

    this.lastTask.set(key, settled);
    void settled.then(() => {
      if (this.lastTask.get(key) === settled) {
        this.lastTask.delete(key);
      }
    });

    return withUpdatedCount;
  }
}
