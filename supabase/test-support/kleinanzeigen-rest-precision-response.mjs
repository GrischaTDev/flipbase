/** Liest die Antwort der kurzlebigen lokalen PostgREST-Prüfung vollständig. */
export async function readKleinanzeigenPrecisionResponse(url, timeoutMs = 2000) {
  const controller = new AbortController();
  // AbortSignal.timeout hält den Prüfprozess allein nicht am Leben. Der aktive
  // Timer schützt deshalb auch das vollständige Lesen des Antworttexts.
  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException('REST-Prüfantwort hat zu lange gedauert.', 'TimeoutError')),
    timeoutMs,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}
