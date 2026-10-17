import type {
  KleinanzeigenSourceReference,
  KleinanzeigenTransferRequest,
} from '../_shared/kleinanzeigen-listing-contracts.ts';
type SaveRequest = Extract<KleinanzeigenTransferRequest, { action: 'save_transfer' }>;
export interface TransferPhoto {
  readonly storagePath: string;
  readonly fileName: string;
  readonly sortOrder: number;
}
export interface TransferDraftRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly target_connection_id: string;
  readonly source_reference: KleinanzeigenSourceReference;
  readonly revision: number;
  readonly transfer_images_complete: boolean;
  readonly status: string;
}
export interface TransferDraftStore {
  authorize(): Promise<{
    sourceReference: KleinanzeigenSourceReference;
    photoReferences: readonly string[];
  }>;
  save(input: SaveRequest): Promise<TransferDraftRow>;
  copy(draftId: string, index: number, url: string): Promise<TransferPhoto>;
  finalize(draft: TransferDraftRow, photos: readonly TransferPhoto[]): Promise<TransferDraftRow>;
  remove(paths: readonly string[]): Promise<void>;
}
function sameSource(a: KleinanzeigenSourceReference, b: KleinanzeigenSourceReference): boolean {
  return ['platform', 'workspaceId', 'connectionId', 'externalId', 'entryId', 'fingerprint'].every(
    (key) =>
      a[key as keyof KleinanzeigenSourceReference] === b[key as keyof KleinanzeigenSourceReference],
  );
}
export async function saveVintedTransferDraft(
  input: SaveRequest,
  store: TransferDraftStore,
): Promise<TransferDraftRow> {
  const confirmed = await store.authorize();
  if (!sameSource(confirmed.sourceReference, input.source))
    throw new Error('Die Vinted-Quelle wurde inzwischen geändert. Lade sie erneut.');
  const draft = await store.save(input);
  if (
    draft.workspace_id !== input.workspaceId ||
    draft.target_connection_id !== input.targetConnectionId ||
    !sameSource(draft.source_reference, input.source) ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 1
  )
    throw new Error('Die gespeicherte Fassung passt nicht zu diesem Transfer.');
  if (draft.transfer_images_complete) return draft;
  if (confirmed.photoReferences.length > 20)
    throw new Error('Bitte prüfe Deine Fotos: Für Kleinanzeigen sind höchstens 20 Bilder möglich.');
  const photos: TransferPhoto[] = [];
  let finalizing = false;
  try {
    for (const [index, url] of confirmed.photoReferences.entries()) {
      const current = await store.authorize();
      if (
        !sameSource(current.sourceReference, input.source) ||
        current.photoReferences.length !== confirmed.photoReferences.length ||
        current.photoReferences[index] !== url
      )
        throw new Error('Die Quelle hat sich während der Bildübernahme geändert.');
      const photo = await store.copy(draft.id, index, url);
      const prefix = 'listings/' + input.workspaceId + '/' + draft.id + '/';
      if (
        !photo.storagePath.startsWith(prefix) ||
        !/^[0-9a-f-]+\.(jpg|png|webp)$/iu.test(photo.storagePath.slice(prefix.length)) ||
        photo.sortOrder !== index
      )
        throw new Error('Die Bildablage passt nicht zu dieser Fassung.');
      photos.push(photo);
    }
    const current = await store.authorize();
    if (!sameSource(current.sourceReference, input.source))
      throw new Error('Die Quelle wurde vor Abschluss geändert.');
    finalizing = true;
    const completed = await store.finalize(draft, photos);
    if (
      completed.id !== draft.id ||
      completed.workspace_id !== input.workspaceId ||
      completed.target_connection_id !== input.targetConnectionId ||
      !sameSource(completed.source_reference, input.source) ||
      completed.transfer_images_complete !== true ||
      completed.revision <= draft.revision
    )
      throw new Error('Der Bildabschluss wurde nicht eindeutig bestätigt.');
    return completed;
  } catch (error) {
    if (!finalizing && photos.length)
      await store.remove(photos.map((photo) => photo.storagePath)).catch(() => {});
    throw error;
  }
}
