import { isVintedTransferPhotoUrl } from '../../../supabase/functions/_shared/kleinanzeigen-listing-validation.mts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import { VintedEditAccess } from './vinted-edit-access.ts';

const photoLimit = 50 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
interface PhotoSourceOptions {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
}

/** Liest ausschließlich ein gespeichertes Foto des eigenen, RLS-geprüften Inserats. */
export class VintedListingPhotoSource {
  private readonly request: typeof fetch;
  private readonly access: VintedEditAccess;
  private readonly options: PhotoSourceOptions;
  constructor(options: PhotoSourceOptions) {
    this.options = options;
    this.request = options.fetch ?? fetch;
    this.access = new VintedEditAccess(options);
  }

  async read(scope: BrowserSessionScope, entryId: string, photoUrl: string) {
    if (!isVintedTransferPhotoUrl(photoUrl))
      throw new Error('Die Bildquelle ist nicht freigegeben.');
    const authorized = await this.access.entry(scope, 'publication', entryId);
    const url = new URL('/rest/v1/marketplace_account_entries', this.options.url);
    for (const [key, value] of Object.entries({
      select: 'external_id,body',
      workspace_id: 'eq.' + scope.workspaceId,
      connection_id: 'eq.' + scope.connectionId,
      id: 'eq.' + entryId,
      external_id: 'eq.' + authorized.externalId,
      kind: 'eq.publication',
    }))
      url.searchParams.set(key, value);
    const stored = await this.request(url, {
      headers: {
        apikey: this.options.publishableKey,
        Authorization: 'Bearer ' + scope.userAccessToken,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!stored.ok) throw new Error('Die Bildzuordnung konnte nicht bestätigt werden.');
    const rows: unknown = await stored.json();
    const row = Array.isArray(rows) && rows.length === 1 && record(rows[0]) ? rows[0] : null;
    const body =
      row && row['external_id'] === authorized.externalId && record(row['body'])
        ? row['body']
        : null;
    const source = body && record(body['transferSource']) ? body['transferSource'] : null;
    const references =
      source?.['externalId'] === authorized.externalId &&
      source['externalAccountId'] === authorized.accountId &&
      Array.isArray(source['photoReferences'])
        ? source['photoReferences']
        : [];
    const images = Array.isArray(body?.['imageUrls']) ? body['imageUrls'] : [];
    if (!body || ![body['imageUrl'], ...images, ...references].includes(photoUrl))
      throw new Error('Das Foto gehört nicht zum gewählten Inserat.');
    const response = await this.request(photoUrl, {
      method: 'GET',
      headers: { Accept: 'image/jpeg, image/png, image/webp', 'Accept-Encoding': 'identity' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    const length = response.headers.get('content-length');
    if (
      response.status !== 200 ||
      response.redirected ||
      !response.body ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType ?? '') ||
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) < 1 || Number(length) > photoLimit))
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Das Originalfoto konnte nicht geladen werden.');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0,
      complete = false;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) {
          complete = true;
          break;
        }
        size += part.value.byteLength;
        if (size > photoLimit) throw new Error('Das Originalfoto überschreitet 50 MB.');
        chunks.push(part.value);
      }
    } finally {
      if (!complete) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size);
    const jpeg =
      size >= 5 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217;
    const png =
      size > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      size > 16 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP' &&
      bytes.readUInt32LE(4) === size - 8 &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
    if (
      (length !== null && Number(length) !== size) ||
      !(
        (mimeType === 'image/jpeg' && jpeg) ||
        (mimeType === 'image/png' && png) ||
        (mimeType === 'image/webp' && webp)
      )
    )
      throw new Error('Der Bildinhalt ist ungültig.');
    const current = await this.access.entry(scope, 'publication', entryId);
    if (current.accountId !== authorized.accountId || current.externalId !== authorized.externalId)
      throw new Error('Die Bildzuordnung hat sich geändert.');
    return { bytes, mimeType: mimeType! };
  }
}
