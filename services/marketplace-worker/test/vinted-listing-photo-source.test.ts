import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VintedListingPhotoSource } from '../src/vinted-listing-photo-source.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const scope: BrowserSessionScope = {
  workspaceId: '25600000-0000-4000-8000-000000000011',
  connectionId: '25600000-0000-4000-8000-000000000021',
  userId: '25600000-0000-4000-8000-000000000001',
  userAccessToken: 'fixture-token',
};
const entryId = '25600000-0000-4000-8000-000000000041';
const photoUrl = 'https://images1.vinted.net/original.jpg';
const bytes = new Uint8Array([255, 216, 255, 1, 255, 217]);
function fixture(
  options: {
    body?: Record<string, unknown>;
    accounts?: unknown[];
    after?: unknown[];
    response?: () => Response;
    kind?: 'publication' | 'sale';
    bodyAfter?: Record<string, unknown>;
  } = {},
) {
  let downloads = 0;
  const reads: string[] = [];
  const source = new VintedListingPhotoSource({
    url: 'https://database.example',
    publishableKey: 'public-key',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'images1.vinted.net') {
        downloads++;
        assert.equal(init?.redirect, 'error');
        assert.equal(init?.credentials, 'omit');
        assert.equal(new Headers(init?.headers).get('authorization'), null);
        assert.equal(new Headers(init?.headers).get('apikey'), null);
        return (
          options.response?.() ?? new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } })
        );
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-token');
      assert.equal(new Headers(init?.headers).get('apikey'), 'public-key');
      assert.equal(url.searchParams.get('workspace_id'), 'eq.' + scope.workspaceId);
      reads.push(url.pathname);
      if (url.pathname.endsWith('/marketplace_connections'))
        return Response.json(
          downloads && options.after
            ? options.after
            : (options.accounts ?? [
                { external_account_id: '789', status: 'connected', execution_mode: 'cloud' },
              ]),
        );
      assert.equal(url.searchParams.get('connection_id'), 'eq.' + scope.connectionId);
      assert.equal(url.searchParams.get('id'), 'eq.' + entryId);
      assert.equal(url.searchParams.get('kind'), 'eq.' + (options.kind ?? 'publication'));
      return Response.json([
        {
          external_id: '12345',
          ...(url.searchParams.get('select')?.includes('body')
            ? {
                body:
                  downloads && options.bodyAfter
                    ? options.bodyAfter
                    : (options.body ?? { imageUrls: [photoUrl] }),
              }
            : {}),
        },
      ]);
    },
  });
  return { source, reads, downloads: () => downloads };
}

test('liefert nur ein eigenes gespeichertes Original und sendet keine Zugangsdaten an das CDN', async () => {
  const f = fixture();
  const result = await f.source.read(scope, entryId, photoUrl);
  assert.deepEqual(result.bytes, Buffer.from(bytes));
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(f.reads.length, 5);
  assert.equal(f.downloads(), 1);
});

test('liest nur das bestätigte Einzelverkaufsfoto und prüft die Artikelzuordnung nach dem Download erneut', async () => {
  const body = { itemIds: ['777'], itemCount: 1, sellerId: '789', imageUrl: photoUrl };
  const f = fixture({ kind: 'sale', body });
  assert.equal((await f.source.read(scope, entryId, photoUrl, '777')).mimeType, 'image/jpeg');
  assert.equal(f.downloads(), 1);
  assert.equal(f.reads.length, 6);
  for (const invalid of [
    { ...body, itemIds: ['778'] },
    { ...body, itemIds: ['777', '778'], itemCount: 2 },
    { ...body, isBundle: true },
    { ...body, sellerId: '790' },
  ]) {
    const denied = fixture({ kind: 'sale', body: invalid });
    await assert.rejects(denied.source.read(scope, entryId, photoUrl, '777'));
    assert.equal(denied.downloads(), 0);
  }
  const changed = fixture({ kind: 'sale', body, bodyAfter: { ...body, itemIds: ['778'] } });
  await assert.rejects(changed.source.read(scope, entryId, photoUrl, '777'));
  assert.equal(changed.downloads(), 1);
});

test('liest vollständige Fotos einer bestätigten Quelle, aber keine fremden Quelleinträge', async () => {
  const source = { externalId: '12345', externalAccountId: '789', photoReferences: [photoUrl] };
  const own = fixture({ body: { transferSource: source } });
  await own.source.read(scope, entryId, photoUrl);
  const foreign = fixture({ body: { transferSource: { ...source, externalAccountId: '790' } } });
  await assert.rejects(foreign.source.read(scope, entryId, photoUrl));
  assert.equal(foreign.downloads(), 0);
});

test('verweigert fremde Konten, nicht gespeicherte Fotos und freie Proxyziele vor einem Download', async () => {
  const foreign = fixture({ accounts: [] });
  await assert.rejects(foreign.source.read(scope, entryId, photoUrl));
  assert.equal(foreign.downloads(), 0);
  const missing = fixture({ body: { imageUrls: ['https://images1.vinted.net/other.jpg'] } });
  await assert.rejects(missing.source.read(scope, entryId, photoUrl));
  assert.equal(missing.downloads(), 0);
  for (const url of [
    'http://images1.vinted.net/a.jpg',
    'https://localhost/a.jpg',
    'https://images1.vinted.net.evil.test/a.jpg',
    'https://images1.vinted.net:444/a.jpg',
  ]) {
    const f = fixture({ body: { imageUrls: [url] } });
    await assert.rejects(f.source.read(scope, entryId, url));
    assert.equal(f.downloads(), 0);
    assert.equal(f.reads.length, 0);
  }
});

test('gibt weder Weiterleitungen noch HTML, übergroße oder abgeschnittene Bildantworten zurück', async () => {
  for (const response of [
    () => new Response(null, { status: 302, headers: { Location: 'http://localhost/private' } }),
    () => new Response('<html>private</html>', { headers: { 'Content-Type': 'image/jpeg' } }),
    () => new Response(bytes, { headers: { 'Content-Type': 'text/html' } }),
    () =>
      new Response(bytes, {
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '52428801' },
      }),
    () => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '7' } }),
  ]) {
    const f = fixture({ response });
    await assert.rejects(f.source.read(scope, entryId, photoUrl));
  }
});

test('behält das Foto bei einem während des Downloads widerrufenen Konto zurück', async () => {
  const f = fixture({ after: [] });
  await assert.rejects(f.source.read(scope, entryId, photoUrl));
  assert.equal(f.downloads(), 1);
});
