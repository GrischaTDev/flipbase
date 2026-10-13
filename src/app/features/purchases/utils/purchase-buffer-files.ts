import type { OfflinePurchaseReview } from '../models/offline-purchase-draft.models';
import type { PendingPurchaseDocument } from '../../../core/models/purchase-document.models';

interface StoredPurchaseFile {
  purchaseFileVersion: 1;
  name: string;
  type: string;
  lastModified: number;
  size: number;
  bytes: ArrayBuffer;
}

export async function serializePurchaseDocuments(
  documents: readonly PendingPurchaseDocument[],
): Promise<readonly PendingPurchaseDocument[]> {
  return Promise.all(
    documents.map(async (document) => {
      const stored: StoredPurchaseFile = {
        purchaseFileVersion: 1,
        name: document.file.name,
        type: document.file.type,
        lastModified: document.file.lastModified,
        size: document.file.size,
        bytes: await document.file.arrayBuffer(),
      };
      // Nur an der IndexedDB-Grenze liegen Bytes statt File-Objekten vor; die öffentliche API rekonstruiert Files.
      return { ...document, file: stored as unknown as File };
    }),
  );
}

export async function serializePurchaseReview(
  review: OfflinePurchaseReview | null,
): Promise<OfflinePurchaseReview | null> {
  return review
    ? { ...review, documents: await serializePurchaseDocuments(review.documents ?? []) }
    : null;
}

export function restorePurchaseFiles<Result>(record: Result): Result {
  if (
    !record ||
    typeof record !== 'object' ||
    record instanceof File ||
    record instanceof Blob ||
    record instanceof ArrayBuffer
  )
    return record;
  if (Array.isArray(record))
    return record.map((entry: unknown) => restorePurchaseFiles(entry)) as Result;
  const stored = record as Record<string, unknown>;
  if (stored['purchaseFileVersion'] === 1) {
    if (
      !(stored['bytes'] instanceof ArrayBuffer) ||
      typeof stored['name'] !== 'string' ||
      typeof stored['type'] !== 'string' ||
      typeof stored['size'] !== 'number' ||
      stored['bytes'].byteLength !== stored['size'] ||
      typeof stored['lastModified'] !== 'number'
    )
      throw new Error(
        'Der gespeicherte Beleg ist beschädigt. Deine anderen Eingaben bleiben erhalten.',
      );
    return new File([stored['bytes']], stored['name'], {
      type: stored['type'],
      lastModified: stored['lastModified'],
    }) as Result;
  }
  return Object.fromEntries(
    Object.entries(stored).map(([name, entry]) => [name, restorePurchaseFiles(entry)]),
  ) as Result;
}
