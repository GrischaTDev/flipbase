import { describe, expect, it } from 'vitest';
import type { OfflinePurchaseReview } from '../models/offline-purchase-draft.models';
import { restorePurchaseFiles, serializePurchaseReview } from './purchase-buffer-files';

describe('purchase file storage boundary', () => {
  const original = new File([new Uint8Array([37, 80, 68, 70, 0, 255])], 'quittung.pdf', {
    type: 'application/pdf',
    lastModified: 1700000000000,
  });
  const review: OfflinePurchaseReview = {
    content: { draftName: '', purchaseDate: '2026-10-13', sellerNote: '', notes: '', lines: [] },
    form: { notes: 'unfinished' },
    lines: [],
    costs: [],
    documents: [
      { id: 'doc-a', file: original, documentType: 'invoice', status: 'pending', error: null },
    ],
  };

  it('stores bytes without Blob/File instances and restores original bytes and metadata', async () => {
    const serialized = await serializePurchaseReview(review);
    const storedFile = serialized?.documents?.[0].file as unknown as Record<string, unknown>;
    expect(storedFile).toMatchObject({
      purchaseFileVersion: 1,
      name: 'quittung.pdf',
      type: 'application/pdf',
      lastModified: original.lastModified,
      size: original.size,
    });
    expect(storedFile['bytes']).toBeInstanceOf(ArrayBuffer);
    expect(storedFile).not.toBeInstanceOf(Blob);
    const clonedReview = structuredClone(serialized);
    const clonedFile = clonedReview?.documents?.[0].file as unknown as Record<string, unknown>;
    // jsdom nutzt den Node-Kloner; seine ArrayBuffer stammen aus einem anderen VM-Kontext.
    clonedFile['bytes'] = new Uint8Array(clonedFile['bytes'] as ArrayBuffer).slice().buffer;
    const restored = restorePurchaseFiles(clonedReview);
    expect(restored?.documents?.[0].file).toBeInstanceOf(File);
    expect(
      new Uint8Array((await restored?.documents?.[0].file.arrayBuffer()) ?? new ArrayBuffer(0)),
    ).toEqual(new Uint8Array(await original.arrayBuffer()));
    expect(restored?.documents?.[0].file.name).toBe(original.name);
    expect(restored?.documents?.[0].file.lastModified).toBe(original.lastModified);
    expect(restored?.form).toEqual(review.form);
    expect(review.documents?.[0].file).toBe(original);
  });

  it('reads legacy native files without changing them', () => {
    const restored = restorePurchaseFiles(review);
    expect(restored.documents?.[0].file).toBe(original);
  });

  it('rejects missing or truncated bytes rather than losing an original silently', async () => {
    const serialized = await serializePurchaseReview(review);
    const storedFile = serialized?.documents?.[0].file as unknown as Record<string, unknown>;
    storedFile['bytes'] = new ArrayBuffer(1);
    expect(() => restorePurchaseFiles(serialized)).toThrow('beschädigt');
  });
});
