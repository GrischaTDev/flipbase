import {
  parseKleinanzeigenJobPhotoDescriptor,
  type KleinanzeigenInstallJobRequest,
  type KleinanzeigenJobPhoto,
} from '../_shared/kleinanzeigen-job-contracts.ts';
import {
  validateKleinanzeigenPhoto,
  kleinanzeigenPhotoSha256,
} from '../_shared/kleinanzeigen-photo.ts';
type PhotoRequest = Extract<KleinanzeigenInstallJobRequest, { action: 'job_photo' }>;
export interface KleinanzeigenListingPhotoStore {
  authorize(): Promise<unknown>;
  download(image: KleinanzeigenJobPhoto): Promise<{ bytes: Uint8Array; mimeType: string }>;
}
export async function loadKleinanzeigenListingPhoto(
  input: PhotoRequest,
  store: KleinanzeigenListingPhotoStore,
): Promise<{
  readonly bytes: Uint8Array;
  readonly imageId: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
  readonly sha256: string;
}> {
  const before = parseKleinanzeigenJobPhotoDescriptor(await store.authorize(), input);
  if (!before) throw new Error('Auftragsbild nicht eindeutig zugeordnet.');
  const downloaded = await store.download(before.image);
  const valid = validateKleinanzeigenPhoto(downloaded.bytes, downloaded.mimeType);
  const sha256 = await kleinanzeigenPhotoSha256(downloaded.bytes);
  if (
    valid.mimeType !== before.image.mimeType ||
    downloaded.bytes.byteLength !== before.image.byteSize ||
    sha256 !== before.image.sha256
  )
    throw new Error('Auftragsbild stimmt nicht mit der unveränderlichen Aufnahme überein.');
  const after = parseKleinanzeigenJobPhotoDescriptor(await store.authorize(), input);
  if (
    !after ||
    after.image.storagePath !== before.image.storagePath ||
    after.image.sha256 !== sha256 ||
    after.image.byteSize !== before.image.byteSize ||
    after.image.mimeType !== before.image.mimeType
  )
    throw new Error('Bildfreigabe inzwischen geändert.');
  return {
    bytes: downloaded.bytes,
    imageId: before.image.imageId,
    fileName: before.image.fileName,
    mimeType: valid.mimeType,
    byteSize: downloaded.bytes.byteLength,
    sha256,
  };
}
