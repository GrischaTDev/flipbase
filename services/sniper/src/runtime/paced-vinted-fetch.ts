import { sleep, type FetchLike, type Sleep } from '../vinted/session.js';
import { VintedTimeoutError } from '../vinted/errors.js';

export interface VintedRequestTiming {
  minimumIntervalMs: number;
  requestTimeoutMs: number;
  now?: () => number;
  sleep?: Sleep;
}

/** Gemeinsamer Abstand fuer Katalog, Wiederholungen und Kategorieabrufe. */
export function pacedVintedFetch(fetchFn: FetchLike, timing: VintedRequestTiming): FetchLike {
  const now = timing.now ?? (() => performance.now());
  const wait = timing.sleep ?? sleep;
  let lastStarted = -Infinity;
  let previous: Promise<void> = Promise.resolve();

  return (input, init) => {
    const request = previous.then(async () => {
      init?.signal?.throwIfAborted();
      const remaining = timing.minimumIntervalMs - (now() - lastStarted);
      if (remaining > 0) await wait(remaining);
      init?.signal?.throwIfAborted();
      lastStarted = now();
      const timeout = AbortSignal.timeout(timing.requestTimeoutMs);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        return await fetchFn(input, { ...init, signal });
      } catch (error) {
        if (timeout.aborted && !init?.signal?.aborted) throw new VintedTimeoutError();
        throw error;
      }
    });
    // Ein fehlgeschlagener Aufruf darf die Warteschlange nicht stilllegen.
    previous = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };
}
