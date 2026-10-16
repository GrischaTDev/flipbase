import type { KleinanzeigenTransferRequest } from '../_shared/kleinanzeigen-listing-contracts.ts';
import { parseTransferSourceRead, publicTransferDraft } from './transfer-response.ts';
import {
  saveVintedTransferDraft,
  type TransferDraftRow,
  type TransferPhoto,
} from './transfer-draft.ts';
import { downloadVintedTransferPhoto } from './transfer-source.ts';
export interface TransferApiPorts {
  read(): Promise<unknown>;
  save(input: Extract<KleinanzeigenTransferRequest, { action: 'save_transfer' }>): Promise<unknown>;
  upload(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  finalize(draft: TransferDraftRow, photos: readonly TransferPhoto[]): Promise<unknown>;
  remove(paths: readonly string[]): Promise<void>;
  fetch?: typeof fetch;
}
function draftRow(value: unknown): TransferDraftRow {
  const publicDraft = publicTransferDraft(value);
  if (!publicDraft) throw new Error('Ungültige Entwurfsantwort.');
  return value as TransferDraftRow;
}
export async function executeKleinanzeigenTransfer(
  input: KleinanzeigenTransferRequest,
  ports: TransferApiPorts,
): Promise<unknown> {
  const read = async () => {
    const result = parseTransferSourceRead(await ports.read(), input, false);
    if (!result) throw new Error('Ungültige vollständige Quelle.');
    return result;
  };
  if (input.action === 'prepare_transfer') return await read();
  const result = await saveVintedTransferDraft(input, {
    authorize: async () => {
      const current = await read();
      if (current.state !== 'ready' || !current.source || !current.fingerprint)
        throw new Error('Lade zuerst die vollständige Vinted-Quelle.');
      return {
        sourceReference: {
          platform: 'vinted',
          workspaceId: input.workspaceId,
          connectionId: input.source.connectionId,
          entryId: current.entryId,
          externalId: input.source.externalId,
          fingerprint: current.fingerprint,
        },
        photoReferences: current.source.photoReferences,
      };
    },
    save: async (request) => draftRow(await ports.save(request)),
    copy: async (draftId, index, url) => {
      const photo = await downloadVintedTransferPhoto(url, ports.fetch);
      const fileName = 'Vinted-' + (index + 1) + '.' + photo.extension;
      const storagePath =
        'listings/' +
        input.workspaceId +
        '/' +
        draftId +
        '/' +
        crypto.randomUUID() +
        '.' +
        photo.extension;
      try {
        await ports.upload(storagePath, photo.bytes, photo.mimeType);
      } catch (error) {
        await ports.remove([storagePath]).catch(() => {});
        throw error;
      }
      return { storagePath, fileName, sortOrder: index };
    },
    finalize: async (draft, photos) => draftRow(await ports.finalize(draft, photos)),
    remove: (paths) => ports.remove(paths),
  });
  return publicTransferDraft(result);
}
