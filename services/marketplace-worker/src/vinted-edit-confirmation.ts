import { setTimeout } from 'node:timers/promises';
import type { VintedEditResult } from './vinted-browser-listing-edit.ts';

/** Liest nach dem Klick neu vom Anbieter, bis die gespeicherten Werte bestätigt sind. */
export async function confirmVintedEdit<T>(
  readSaved: () => Promise<T>,
  matches: (saved: T) => boolean,
  timeoutMs = 20_000,
): Promise<VintedEditResult> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      if (matches(await readSaved())) return 'confirmed';
    } catch {
      // Nach einem möglichen Speicherklick ist ein Lesefehler kein Beleg für Ablehnung.
    }
    if (Date.now() >= deadline) break;
    await setTimeout(Math.min(500, deadline - Date.now()));
  } while (Date.now() < deadline);
  return 'unconfirmed';
}
