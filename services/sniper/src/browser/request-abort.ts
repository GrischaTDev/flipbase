/** Beendet das Warten sofort; verspätet entstandene Browserobjekte werden freigegeben. */
export async function abortableBrowserOperation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  disposeLate?: (value: T) => Promise<void>,
): Promise<T> {
  let aborted = signal.aborted;
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    aborted = true;
    rejectAbort(signal.reason);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  void operation
    .then(
      async (value) => {
        if (aborted) await disposeLate?.(value);
      },
      () => undefined,
    )
    .catch(() => undefined);
  try {
    signal.throwIfAborted();
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
