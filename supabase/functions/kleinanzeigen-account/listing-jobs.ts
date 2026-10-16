import type {
  KleinanzeigenUserJobRequest,
  KleinanzeigenJobPreflight,
  KleinanzeigenJobPhoto,
  KleinanzeigenListingJob,
  KleinanzeigenJobSourcePhoto,
} from '../_shared/kleinanzeigen-job-contracts.ts';
import {
  parseKleinanzeigenJobPreflight,
  parseKleinanzeigenListingJob,
} from '../_shared/kleinanzeigen-job-contracts.ts';
import { parseKleinanzeigenDraftContent } from '../_shared/kleinanzeigen-listing-validation.mts';
import {
  validateKleinanzeigenPhoto,
  kleinanzeigenPhotoSha256,
} from '../_shared/kleinanzeigen-photo.ts';
type Enqueue = Extract<KleinanzeigenUserJobRequest, { action: 'listing_enqueue' }>;
export interface KleinanzeigenJobStore {
  uuid(): string;
  find(input: Enqueue): Promise<unknown>;
  prepare(input: Enqueue): Promise<unknown>;
  download(image: KleinanzeigenJobSourcePhoto): Promise<{ bytes: Uint8Array; mimeType: string }>;
  upload(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  enqueue(input: Enqueue, images: readonly KleinanzeigenJobPhoto[]): Promise<unknown>;
  load(
    input: Exclude<KleinanzeigenUserJobRequest, Enqueue | { action: 'listing_latest' }>,
  ): Promise<unknown>;
  remove(paths: readonly string[]): Promise<void>;
}
function snapshotKey(value: KleinanzeigenJobPreflight): string {
  return JSON.stringify({
    workspaceId: value.workspaceId,
    connectionId: value.connectionId,
    draftId: value.draftId,
    draftRevision: value.draftRevision,
    grantGeneration: value.grantGeneration,
    externalAccountId: value.externalAccountId,
    title: value.content.title,
    description: value.content.description,
    priceCents: value.content.priceCents,
    priceType: value.content.priceType,
    postalCode: value.content.postalCode,
    shippingType: value.content.shippingType,
    shippingPriceCents: value.content.shippingPriceCents,
    categoryId: value.content.categoryId,
    schemaRevision: value.content.schemaRevision,
    categoryFields: Object.entries(value.content.categoryFields).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    images: value.images.map((image) => [
      image.imageId,
      image.storagePath,
      image.fileName,
      image.mimeType,
      image.byteSize,
      image.sortOrder,
    ]),
  });
}
export async function executeKleinanzeigenListingJob(
  input: Exclude<KleinanzeigenUserJobRequest, { action: 'listing_latest' }>,
  store: KleinanzeigenJobStore,
): Promise<KleinanzeigenListingJob> {
  const readJob = (raw: unknown) => {
    const job = parseKleinanzeigenListingJob(raw, input, parseKleinanzeigenDraftContent);
    if (
      !job ||
      (input.action === 'listing_enqueue' &&
        (job.draftId !== input.draftId || job.draftRevision !== input.expectedRevision)) ||
      (input.action !== 'listing_enqueue' && job.id !== input.jobId)
    )
      throw new Error('Der Auftrag wurde nicht eindeutig bestätigt.');
    return job;
  };
  if (input.action !== 'listing_enqueue') return readJob(await store.load(input));
  const existing = await store.find(input);
  if (existing !== null) return readJob(existing);
  const prepare = async () => {
    const snapshot = parseKleinanzeigenJobPreflight(
      await store.prepare(input),
      input,
      parseKleinanzeigenDraftContent,
    );
    if (
      !snapshot ||
      snapshot.draftId !== input.draftId ||
      snapshot.draftRevision !== input.expectedRevision
    )
      throw new Error('Die aktuelle Zielfassung konnte nicht bestätigt werden.');
    return snapshot;
  };
  const snapshot = await prepare();
  const key = snapshotKey(snapshot);
  const current = async () => {
    if (snapshotKey(await prepare()) !== key)
      throw new Error('Zielfassung oder Freigabe inzwischen geändert.');
  };
  const attempt = store.uuid();
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(attempt))
    throw new Error('Ungültiger Kopierversuch.');
  const prefix =
    'kleinanzeigen-jobs/' + input.workspaceId + '/' + input.requestId + '/' + attempt + '/';
  const planned: string[] = [];
  const photos: KleinanzeigenJobPhoto[] = [];
  let finalizing = false;
  try {
    for (const image of snapshot.images) {
      await current();
      const downloaded = await store.download(image);
      const photo = validateKleinanzeigenPhoto(downloaded.bytes, downloaded.mimeType);
      if (photo.mimeType !== image.mimeType || downloaded.bytes.byteLength !== image.byteSize)
        throw new Error('Gesichertes Bild inzwischen geändert.');
      await current();
      const storagePath = prefix + image.imageId + '.' + photo.extension;
      planned.push(storagePath);
      const sha256 = await kleinanzeigenPhotoSha256(downloaded.bytes);
      await store.upload(storagePath, downloaded.bytes, photo.mimeType);
      photos.push({
        imageId: image.imageId,
        storagePath,
        fileName: image.fileName,
        mimeType: photo.mimeType,
        byteSize: downloaded.bytes.byteLength,
        sha256,
      });
    }
    await current();
    finalizing = true;
    const job = readJob(await store.enqueue(input, photos));
    const accepted = job.immutableSnapshot.images;
    if (
      accepted.length !== photos.length ||
      photos.some(
        (photo, index) =>
          photo.imageId !== accepted[index].imageId ||
          photo.sha256 !== accepted[index].sha256 ||
          photo.byteSize !== accepted[index].byteSize ||
          photo.mimeType !== accepted[index].mimeType,
      )
    )
      throw new Error('Die angenommene Fotoaufnahme passt nicht zum Auftrag.');
    const used = new Set(accepted.map((image) => image.storagePath));
    const unused = planned.filter((path) => !used.has(path));
    if (unused.length) await store.remove(unused).catch(() => {});
    return job;
  } catch (error) {
    if (!finalizing && planned.length) await store.remove(planned).catch(() => {});
    throw error;
  }
}
