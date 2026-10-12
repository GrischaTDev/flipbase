import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';
import { collectVintedListingPhotoState } from './vinted-listing-contracts.ts';

/**
 * Gewünschte Fotos eines bestehenden Inserats: `base` ist der Stand, auf dem die Änderung beruht,
 * `desired` eine Auswahl daraus in neuer Reihenfolge. Neue Fotos gehören nicht hierher.
 */
export interface VintedListingPhotoArrangement {
  readonly base: readonly string[];
  readonly desired: readonly string[];
}

function invalid(): Error {
  return new Error('Die Fotos des Vinted-Inserats konnten nicht sicher geändert werden.');
}

function isPhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^images[0-9]*\.vinted\.net$/.test(url.hostname);
  } catch {
    return false;
  }
}

/** Prüft eine übertragene Fotoanordnung; fremde Adressen, Doppelte und neue Fotos entfallen. */
export function parseVintedListingPhotoArrangement(input: unknown): VintedListingPhotoArrangement {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const keys = Object.keys(input);
  if (keys.length !== 2 || !('base' in input) || !('desired' in input)) throw invalid();
  const { base, desired } = input;
  if (
    !Array.isArray(base) ||
    !Array.isArray(desired) ||
    base.length < 1 ||
    base.length > 20 ||
    desired.length < 1 ||
    desired.length > base.length ||
    !base.every(isPhotoUrl) ||
    !desired.every(isPhotoUrl) ||
    new Set(base).size !== base.length ||
    new Set(desired).size !== desired.length ||
    desired.some((url) => !base.includes(url))
  )
    throw invalid();
  return { base: [...base], desired: [...desired] };
}

export function sameVintedListingPhotos(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((url, index) => url === right[index]);
}

async function gridUrls(page: Page): Promise<readonly string[] | null> {
  const state = await page.evaluate(collectVintedListingPhotoState);
  if (!state.valid || state.items.some((item) => !item.ready || item.url === null)) return null;
  return state.items.map((item) => item.url as string);
}

async function gridShows(
  page: Page,
  expected: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const urls = await gridUrls(page);
    if (urls && sameVintedListingPhotos(urls, expected)) return true;
    if (Date.now() >= deadline) return false;
    await wait(150);
  }
}

async function waitForGrid(page: Page, expected: readonly string[]): Promise<void> {
  if (!(await gridShows(page, expected, 6_000))) throw invalid();
}

/**
 * Zieht ein Foto wie von Hand: drücken, kurz halten, langsam zum Ziel bewegen, dort verweilen,
 * loslassen. Ein Ziehrahmen kann eine Haltezeit oder eine Mindestbewegung verlangen; beides ist
 * damit erfüllt.
 */
async function dragPhoto(
  page: Page,
  from: number,
  target: number,
  /** Anteil der Zielbreite, an dem abgelegt wird; knapp vor der Mitte rückt das Foto davor. */
  dropAt: number,
): Promise<void> {
  const source = await page
    .locator(`#content [data-testid="image-wrapper-${from}"]`)
    .boundingBox({ timeout: 5_000 });
  const destination = await page
    .locator(`#content [data-testid="image-wrapper-${target}"]`)
    .boundingBox({ timeout: 5_000 });
  if (!source || !destination) throw invalid();
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = {
    x: destination.x + destination.width * dropAt,
    y: destination.y + destination.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    await wait(350);
    await page.mouse.move(start.x + 6, start.y + 6, { steps: 3 });
    await wait(120);
    const steps = 24;
    for (let step = 1; step <= steps; step++) {
      await page.mouse.move(
        start.x + 6 + ((end.x - start.x - 6) * step) / steps,
        start.y + 6 + ((end.y - start.y - 6) * step) / steps,
      );
      await wait(15);
    }
    await wait(350);
  } finally {
    await page.mouse.up();
  }
}

/**
 * Entfernt und verschiebt Fotos in der geöffneten Bearbeitungsmaske, bis sie `desired`
 * entsprechen. Jeder Schritt wird am Raster geprüft; gespeichert wird hier nichts. Am 12.10.2026
 * an der echten Maske gemessen: je Foto ein Löschknopf `media-select-grid-delete-button-<n>` und
 * ein ziehbarer Rahmen um `image-wrapper-<n>`.
 */
export async function arrangeVintedListingPhotos(
  page: Page,
  current: readonly string[],
  desired: readonly string[],
  check: () => Promise<void>,
  /** Meldet den begonnenen Abschnitt, damit ein Abbruch eingeordnet werden kann. */
  onStep: (step: 'remove' | 'move') => void = () => undefined,
): Promise<void> {
  if (
    desired.length < 1 ||
    new Set(desired).size !== desired.length ||
    desired.some((url) => !current.includes(url))
  )
    throw invalid();
  let expected = [...current];
  await waitForGrid(page, expected);
  // Von hinten löschen, damit die Positionen der übrigen Fotos bis zum Klick stimmen.
  onStep('remove');
  for (let index = expected.length - 1; index >= 0; index--) {
    if (desired.includes(expected[index]!)) continue;
    await check();
    const remove = page.locator(
      `#content [data-testid="media-select-grid-delete-button-${index}"]`,
    );
    if ((await remove.count()) !== 1 || !(await remove.isEnabled())) throw invalid();
    await remove.click({ timeout: 5_000 });
    expected = expected.filter((_, position) => position !== index);
    await waitForGrid(page, expected);
  }
  onStep('move');
  for (let target = 0; target < desired.length; target++) {
    const from = expected.indexOf(desired[target]!);
    if (from === target) continue;
    if (from < target) throw invalid();
    await check();
    const moved = expected[from]!;
    const next = expected.filter((_, position) => position !== from);
    next.splice(target, 0, moved);
    // Greift das Ablegen knapp vor der Mitte nicht, folgt ein zweiter Versuch am vorderen Rand.
    let arranged = false;
    for (const dropAt of [0.35, 0.15]) {
      const before = await gridUrls(page);
      if (!before || !sameVintedListingPhotos(before, expected)) throw invalid();
      await dragPhoto(page, from, target, dropAt);
      if (await gridShows(page, next, 3_000)) {
        arranged = true;
        break;
      }
      // Ein anderes Ergebnis als „unverändert“ wird nicht weiter verschoben.
      if (!(await gridShows(page, expected, 1_500))) throw invalid();
    }
    if (!arranged) throw invalid();
    expected = next;
  }
  if (!sameVintedListingPhotos(expected, desired)) throw invalid();
  await check();
  await waitForGrid(page, desired);
}
