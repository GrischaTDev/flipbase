import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shippingLabelMimeType,
  ShippingLabelUnavailableError,
  SupabaseShippingLabelStore,
} from '../src/supabase-shipping-label-store.ts';

const scope = {
  workspaceId: '46800000-0000-4000-8000-000000000011',
  connectionId: '46800000-0000-4000-8000-000000000021',
  userId: '46800000-0000-4000-8000-000000000001',
  userAccessToken: 'user-token',
};
const saleId = '46800000-0000-4000-8000-000000000031';
const labelUrl = 'https://svc-shipping-labels.s3.eu-central-1.amazonaws.com/abc?X-Amz-Signature=1';
const pdf = new TextEncoder().encode('%PDF-1.4 Versandschein');

function server(overrides: { sale?: Record<string, unknown>; file?: Uint8Array } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/rest/v1/marketplace_connections'))
      return Response.json([
        { external_account_id: '46984021', status: 'connected', execution_mode: 'cloud' },
      ]);
    if (url.includes('/rest/v1/marketplace_account_entries'))
      return Response.json([
        {
          external_id: '24052549356',
          body: {
            title: 'Carhartt WIP Teddy-Fleecejacke',
            saleState: 'sold',
            sellerId: '46984021',
            externalConversationId: '500969788562',
            ...overrides.sale,
          },
        },
      ]);
    if (url === labelUrl) return new Response(new Blob([(overrides.file ?? pdf) as BlobPart]));
    if (url.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' });
    if (url.includes('/rest/v1/marketplace_shipping_labels'))
      return Response.json([
        {
          id: 7,
          label_type: 'printable',
          carrier_name: 'DPD Shop2Shop',
          requested_by_flipbase: true,
          fetched_at: '2026-11-13T10:00:00+00:00',
        },
      ]);
    throw new Error('unerwartet ' + url);
  }) as typeof fetch;
  return {
    calls,
    store: new SupabaseShippingLabelStore({
      url: 'https://flipbase.test',
      publishableKey: 'public',
      serviceRoleKey: 'service',
      fetch: request,
    }),
  };
}

const ready = {
  outcome: 'ready' as const,
  transactionId: '24052549356',
  shipmentId: '51458635363',
  labelType: 'printable' as const,
  carrierName: 'DPD Shop2Shop',
  labelUrl,
  requested: true,
};

test('liest den Verkauf mit Nutzerrechten und legt die PDF privat mit dem Serverschlüssel ab', async () => {
  const { store, calls } = server();
  const sale = await store.sale(scope, saleId);
  assert.deepEqual(sale, {
    accountId: '46984021',
    transactionId: '24052549356',
    externalConversationId: '500969788562',
    title: 'Carhartt WIP Teddy-Fleecejacke',
  });
  for (const call of calls)
    assert.equal(new Headers(call.init?.headers).get('authorization'), 'Bearer user-token');
  calls.length = 0;
  const saved = await store.save(scope, sale, ready);
  assert.equal(saved.storagePath, `${scope.workspaceId}/${scope.connectionId}/24052549356.pdf`);
  assert.equal(saved.mimeType, 'application/pdf');
  assert.equal(saved.byteSize, pdf.byteLength);
  const upload = calls.find((call) => call.url.includes('/storage/v1/object/'));
  assert.equal(
    upload?.url,
    `https://flipbase.test/storage/v1/object/marketplace-shipping-labels/${saved.storagePath}`,
  );
  assert.equal(new Headers(upload?.init?.headers).get('authorization'), 'Bearer service');
  const row = calls.find((call) => call.url.includes('/rest/v1/marketplace_shipping_labels'));
  const body = JSON.parse(String(row?.init?.body)) as Record<string, unknown>;
  assert.equal(body['requested_by_flipbase'], true);
  assert.equal(body['external_shipment_id'], '51458635363');
});

test('überschreibt beim späteren Abholen weder Anforderungsherkunft noch bekannte Angaben', async () => {
  const { store, calls } = server();
  const sale = await store.sale(scope, saleId);
  await store.save(scope, sale, { ...ready, requested: false, labelType: null, carrierName: null });
  const row = calls.find((call) => call.url.includes('/rest/v1/marketplace_shipping_labels'));
  const body = JSON.parse(String(row?.init?.body)) as Record<string, unknown>;
  for (const key of ['requested_by_flipbase', 'label_type', 'carrier_name'])
    assert.equal(Object.hasOwn(body, key), false, key);
});

test('lehnt stornierte, fremde oder unvollständige Verkäufe ab', async () => {
  for (const sale of [
    { saleState: 'cancelled' },
    { sellerId: '999' },
    { externalConversationId: null },
  ]) {
    const { store } = server({ sale });
    await assert.rejects(store.sale(scope, saleId), ShippingLabelUnavailableError);
  }
  await assert.rejects(server().store.sale(scope, 'kein-verkauf'), ShippingLabelUnavailableError);
});

test('speichert nur echte PDF- oder Bilddateien aus Vinteds Ablage', async () => {
  const html = new TextEncoder().encode('<html>Fehler</html>');
  const { store, calls } = server({ file: html });
  const sale = await store.sale(scope, saleId);
  await assert.rejects(store.save(scope, sale, ready), /Unbekannte Versandscheindatei/);
  assert.equal(
    calls.some((call) => call.url.includes('/storage/')),
    false,
  );
  await assert.rejects(
    store.save(scope, sale, { ...ready, labelUrl: 'https://evil.test/label.pdf' }),
    /Kein abholbereiter/,
  );
  assert.equal(
    shippingLabelMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png',
  );
  assert.equal(shippingLabelMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
});
