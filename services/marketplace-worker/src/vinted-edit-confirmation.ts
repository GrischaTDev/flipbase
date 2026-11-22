import { setTimeout } from 'node:timers/promises';
import type { VintedEditResult } from './vinted-browser-listing-edit.ts';
import type { VintedListingSaveResponse } from './vinted-listing-save-response.ts';

/** Nach einem Speicherklick wird so lange nachgelesen; Vinted speichert gelegentlich träge. */
export const vintedSaveConfirmationMs = 90_000;

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

/** Womit ein Speicherklick bestätigt wurde oder warum er offen geblieben ist. */
export type VintedSaveEvidence = 'response' | 'read' | 'rejected' | 'none';

/**
 * Bestätigt einen Speicherklick zuerst über Vinteds eigene Antwort und liest parallel nach.
 * Eine abgelehnte Antwort beendet das Warten sofort, bleibt aber `unconfirmed`: Ob nichts
 * gespeichert wurde, entscheidet erst die lesende Nachprüfung. `readSaved` erhält, ob die
 * Speicherantwort schon da ist, und darf die Seite vorher nicht neu laden.
 */
export async function confirmVintedSave<T>(options: {
  response: Promise<VintedListingSaveResponse | null>;
  responseMatches: (item: unknown) => boolean;
  readSaved: (responseSeen: boolean) => Promise<T | null>;
  matches: (saved: T) => boolean;
  timeoutMs?: number;
  pollMs?: number;
  /**
   * Ist der Speichervorgang erkennbar abgeschlossen (Antwort da oder Seite verlassen), endet das
   * Nachlesen nach so vielen weiteren erfolglosen Versuchen, damit ein Rückfallweg übernimmt.
   */
  settledReads?: { settled: () => boolean; reads: number };
}): Promise<{ status: VintedEditResult; evidence: VintedSaveEvidence }> {
  const timeoutMs = options.timeoutMs ?? vintedSaveConfirmationMs;
  const pollMs = options.pollMs ?? 700;
  let response: VintedListingSaveResponse | null | undefined;
  const settled = options.response.then(
    (value) => {
      response = value;
    },
    () => {
      response = null;
    },
  );
  const deadline = Date.now() + timeoutMs;
  let readsAfterSettled = 0;
  for (;;) {
    if (response?.outcome === 'saved' && options.responseMatches(response.item))
      return { status: 'confirmed', evidence: 'response' };
    if (response?.outcome === 'rejected') return { status: 'unconfirmed', evidence: 'rejected' };
    try {
      const saved = await options.readSaved(response !== undefined);
      if (saved !== null && options.matches(saved))
        return { status: 'confirmed', evidence: 'read' };
    } catch {
      // Nach einem möglichen Speicherklick ist ein Lesefehler kein Beleg für Ablehnung.
    }
    if (
      options.settledReads &&
      (response !== undefined || options.settledReads.settled()) &&
      ++readsAfterSettled >= options.settledReads.reads
    )
      return { status: 'unconfirmed', evidence: 'none' };
    const left = deadline - Date.now();
    if (left <= 0) return { status: 'unconfirmed', evidence: 'none' };
    const pause = setTimeout(Math.min(pollMs, left));
    // Solange die Antwort aussteht, beendet ihr Eintreffen die Pause vorzeitig.
    await (response === undefined ? Promise.race([pause, settled]) : pause);
  }
}
