import { setTimeout } from 'node:timers/promises';
import type { Page } from 'playwright';
import type { MarketplaceListingSnapshot } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';

export interface VintedUploadedListingPhoto {
  readonly sourceImageId: string;
  /** Bestätigte Fotokachel, kein Beleg für ein gespeichertes Inserat. */
  readonly previewUrl: string;
}
interface PhotoState {
  valid: boolean;
  items: { index: number; url: string | null; ready: boolean }[];
}
function invalid(): Error {
  return new Error('Die Vinted-Fotoübertragung konnte nicht bestätigt werden.');
}
function assertNewForm(page: Page): void {
  const url = new URL(page.url());
  if (url.origin !== 'https://www.vinted.de' || url.pathname !== '/items/new') throw invalid();
}
// Serialisierbar und auf den tatsächlich beobachteten Fotobereich begrenzt.
function collectPhotoState(): PhotoState {
  const grids = document.querySelectorAll('[data-testid="media-upload-grid"]');
  if (grids.length !== 1) return { valid: false, items: [] };
  const wrappers = Array.from(grids[0]!.querySelectorAll('[data-testid^="image-wrapper-"]'));
  const items = wrappers.map((node) => {
    const identifier = /^image-wrapper-(0|[1-9][0-9]*)$/.exec(
      node.getAttribute('data-testid') ?? '',
    );
    const images = node.querySelectorAll('img'),
      image = images[0];
    let url: string | null = null;
    try {
      const source = new URL(image?.getAttribute('src') ?? '');
      if (
        source.protocol === 'https:' &&
        /^images[1-9][0-9]*\.vinted\.net$/.test(source.hostname) &&
        !source.username &&
        !source.password
      )
        url = source.origin + source.pathname;
    } catch {
      /* Blob- und Datenvorschauen sind kein bestätigter Anbieterupload. */
    }
    return {
      index: identifier ? Number(identifier[1]) : -1,
      url,
      ready:
        images.length === 1 &&
        image instanceof HTMLImageElement &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0 &&
        node.getClientRects().length > 0 &&
        getComputedStyle(node).display !== 'none' &&
        getComputedStyle(node).visibility !== 'hidden',
    };
  });
  return { valid: items.length <= 20 && items.every((item, index) => item.index === index), items };
}
function matchesPrefix(
  state: PhotoState,
  accepted: readonly VintedUploadedListingPhoto[],
): boolean {
  return (
    state.valid &&
    state.items.length >= accepted.length &&
    accepted.every(
      (photo, index) => state.items[index]?.url === photo.previewUrl && state.items[index]?.ready,
    )
  );
}

/** Lädt Fotos einer leeren Neuanlagemaske; speichert oder veröffentlicht kein Inserat. */
export async function uploadVintedListingPhotos(
  page: Page,
  accountId: string,
  originals: MarketplaceListingSnapshot['images'],
  loadPhoto: (id: string) => Promise<MarketplaceListingPhoto>,
  beforeWrite: () => Promise<void>,
  authorize: () => Promise<void>,
  options: { uploadTimeoutMs?: number } = {},
): Promise<readonly VintedUploadedListingPhoto[]> {
  const timeout = options.uploadTimeoutMs ?? 20_000;
  if (
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    originals.length < 1 ||
    originals.length > 20 ||
    new Set(originals.map((image) => image.id)).size !== originals.length ||
    !Number.isSafeInteger(timeout) ||
    timeout < 200 ||
    timeout > 20_000 ||
    originals.some(
      (image) =>
        !Number.isSafeInteger(image.byteSize) ||
        image.byteSize < 1 ||
        image.byteSize > 50 * 1024 * 1024 ||
        !/^[1-9][0-9]{0,18}$/.test(image.id) ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) ||
        !image.fileName ||
        image.fileName.length > 255 ||
        /[/\\\p{Cc}]/u.test(image.fileName),
    )
  )
    throw invalid();
  const check = async () => {
    assertNewForm(page);
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId) throw invalid();
    assertNewForm(page);
  };
  await check();
  const input = page.locator(
    '#content input[name="photos"][type="file"][data-testid="add-photos-input"]',
  );
  if ((await input.count()) !== 1 || !(await input.isEnabled())) throw invalid();
  const acceptedMimeTypes =
    (await input.getAttribute('accept'))?.split(',').map((type) => type.trim().toLowerCase()) ?? [];
  if (originals.some((image) => !acceptedMimeTypes.includes(image.mimeType))) throw invalid();
  const initial = await page.evaluate(collectPhotoState);
  if (!initial.valid || initial.items.length !== 0) throw invalid();
  const accepted: VintedUploadedListingPhoto[] = [];
  for (const original of originals) {
    await check();
    const state = await page.evaluate(collectPhotoState);
    if (!matchesPrefix(state, accepted) || state.items.length !== accepted.length) throw invalid();
    const photo = await loadPhoto(original.id);
    if (
      photo.id !== original.id ||
      photo.fileName !== original.fileName ||
      photo.mimeType !== original.mimeType ||
      !(photo.bytes instanceof Uint8Array) ||
      photo.bytes.byteLength !== original.byteSize
    )
      throw invalid();
    await check();
    const prepared = await page.evaluate(collectPhotoState);
    if (!matchesPrefix(prepared, accepted) || prepared.items.length !== accepted.length)
      throw invalid();
    // Das Auswählen der ersten Datei kann bereits zu Vinted hochladen.
    if (accepted.length === 0) await beforeWrite();
    await check();
    const before = await page.evaluate(collectPhotoState);
    if (!matchesPrefix(before, accepted) || before.items.length !== accepted.length)
      throw invalid();
    await input.setInputFiles(
      {
        name: photo.fileName,
        mimeType: photo.mimeType,
        buffer: Buffer.from(photo.bytes.buffer, photo.bytes.byteOffset, photo.bytes.byteLength),
      },
      { timeout: 10_000 },
    );
    const deadline = Date.now() + timeout;
    let uploaded: VintedUploadedListingPhoto | undefined;
    while (Date.now() < deadline) {
      assertNewForm(page);
      const current = await page.evaluate(collectPhotoState);
      if (!matchesPrefix(current, accepted) || current.items.length > accepted.length + 1)
        throw invalid();
      const last = current.items[accepted.length];
      if (current.items.length === accepted.length + 1 && last?.ready && last.url) {
        uploaded = { sourceImageId: original.id, previewUrl: last.url };
        break;
      }
      await setTimeout(150);
    }
    if (!uploaded) throw invalid();
    await check();
    const confirmed = await page.evaluate(collectPhotoState);
    if (
      !matchesPrefix(confirmed, [...accepted, uploaded]) ||
      confirmed.items.length !== accepted.length + 1
    )
      throw invalid();
    accepted.push(Object.freeze(uploaded));
  }
  return Object.freeze(accepted);
}
