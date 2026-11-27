import { sleep, type FetchLike, type Sleep } from '../vinted/session.js';
import { VintedTimeoutError } from '../vinted/errors.js';

export interface VintedRequestTiming {
  minimumIntervalMs: number;
  requestTimeoutMs: number;
  /** Höchstzahl gleichzeitiger ausgehender Abrufe (Standard 1 = streng seriell). */
  maxConcurrency?: number;
  now?: () => number;
  sleep?: Sleep;
  assertCanStart?: () => void;
  recordStart?: () => void;
}
export interface VintedNavigationTiming {
  remainingDelay(): number;
  recordManualNavigation(): void;
}

/** Gemeinsamer Abstand fuer Katalog, Wiederholungen und Kategorieabrufe. */
export function pacedVintedFetch(
  fetchFn: FetchLike,
  timing: VintedRequestTiming,
): FetchLike & VintedNavigationTiming {
  const now = timing.now ?? (() => performance.now());
  const wait = timing.sleep ?? sleep;
  const maxConcurrency = Math.max(1, timing.maxConcurrency ?? 1);
  let lastStarted = -Infinity;
  let startGate: Promise<void> = Promise.resolve();
  let inFlight = 0;
  const slotWaiters: (() => void)[] = [];

  const acquireSlot = (signal?: AbortSignal): Promise<void> => {
    if (inFlight < maxConcurrency) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onSlot = () => {
        signal?.removeEventListener('abort', onAbort);
        inFlight += 1;
        resolve();
      };
      const onAbort = () => {
        const index = slotWaiters.indexOf(onSlot);
        if (index >= 0) slotWaiters.splice(index, 1);
        reject(signal?.reason);
      };
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      slotWaiters.push(onSlot);
    });
  };

  const releaseSlot = () => {
    inFlight = Math.max(0, inFlight - 1);
    const next = slotWaiters.shift();
    if (next) next();
  };

  const fetch: FetchLike = (input, init) => {
    if (maxConcurrency === 1) {
      const request = startGate.then(async () => {
        init?.signal?.throwIfAborted();
        timing.assertCanStart?.();
        const remaining = timing.minimumIntervalMs - (now() - lastStarted);
        if (remaining > 0) await wait(remaining);
        init?.signal?.throwIfAborted();
        timing.assertCanStart?.();
        timing.recordStart?.();
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
      startGate = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    }

    return (async () => {
      const callerSignal = init?.signal ?? undefined;
      callerSignal?.throwIfAborted();
      await acquireSlot(callerSignal);
      let enteredFetch = false;
      try {
        const gateTicket = startGate.then(async () => {
          init?.signal?.throwIfAborted();
          timing.assertCanStart?.();
          const remaining = timing.minimumIntervalMs - (now() - lastStarted);
          if (remaining > 0) await wait(remaining);
          init?.signal?.throwIfAborted();
          timing.assertCanStart?.();
          timing.recordStart?.();
          lastStarted = now();
        });
        // Nur das Start-Spacing bleibt serialisiert; danach laufen die Abrufe parallel.
        startGate = gateTicket.then(
          () => undefined,
          () => undefined,
        );
        await gateTicket;
        enteredFetch = true;
        const timeout = AbortSignal.timeout(timing.requestTimeoutMs);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        try {
          return await fetchFn(input, { ...init, signal });
        } catch (error) {
          if (timeout.aborted && !init?.signal?.aborted) throw new VintedTimeoutError();
          throw error;
        }
      } finally {
        if (enteredFetch || inFlight > 0) releaseSlot();
      }
    })();
  };
  return Object.assign(fetch, {
    remainingDelay: () => Math.max(0, timing.minimumIntervalMs - (now() - lastStarted)),
    recordManualNavigation: () => {
      lastStarted = now();
    },
  });
}
