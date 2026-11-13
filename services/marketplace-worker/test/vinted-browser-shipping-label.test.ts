import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeVintedShippingLabel,
  isVintedShippingLabelUrl,
  VintedShippingLabelError,
  type VintedShippingLabelAdapter,
} from '../src/vinted-browser-shipping-label.ts';

const labelUrl =
  'https://svc-shipping-labels.s3.eu-central-1.amazonaws.com/9f7jte2ih25oazq13x9bc9130fai?X-Amz-Expires=604800&X-Amz-Signature=abc';

// Gemessene Antwortformen der Carhartt-Jacke vom 08.11.2026, persönliche Angaben ersetzt.
function vinted(
  overrides: {
    actions?: readonly string[];
    options?: unknown;
    addresses?: readonly unknown[];
    labelUrls?: readonly unknown[];
    relation?: Record<string, unknown>;
  } = {},
) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const labelUrls = [...(overrides.labelUrls ?? [labelUrl])];
  let authorized = 0;
  const adapter: VintedShippingLabelAdapter = {
    async read(path) {
      calls.push({ path, method: 'GET' });
      if (path === '/api/v2/conversations/500969788562')
        return {
          conversation: {
            id: 500969788562,
            transaction: {
              id: 24052549356,
              current_user_side: 'seller',
              available_actions: overrides.actions ?? ['order_shipping_label', 'use_payments'],
              shipment_id: 51458635363,
              ...overrides.relation,
            },
          },
        };
      if (path === '/api/v2/shipments/51458635363/label_options')
        return {
          label_options: overrides.options ?? {
            carrier: { name: 'DPD Shop2Shop' },
            sender: { phone_number: '+49000000000', phone_number_requirement: 'mandatory' },
            drop_offs: [
              {
                type: 'point',
                options: [{ type: 'parcel_shop', label_types: ['digital', 'printable'] }],
              },
            ],
          },
        };
      if (path === '/api/v2/user_addresses')
        return { user_addresses: overrides.addresses ?? [{ id: 777, entry_type: 2 }] };
      if (path === '/api/v2/shipments/51458635363/label_url')
        return { label_url: labelUrls.length > 1 ? labelUrls.shift() : labelUrls[0] };
      throw new Error('unerwarteter Abruf ' + path);
    },
    async write(path, method, body) {
      calls.push({ path, method, body });
      return { shipment: { id: 51458635363 } };
    },
    async authorize() {
      authorized += 1;
    },
    wait: () => Promise.resolve(),
  };
  return { adapter, calls, authorized: () => authorized };
}

test('fordert den druckfertigen Versandschein an und liefert den Vinted-Dateilink', async () => {
  const { adapter, calls, authorized } = vinted();
  const result = await executeVintedShippingLabel(
    adapter,
    '46984021',
    '500969788562',
    '24052549356',
  );
  assert.deepEqual(result, {
    outcome: 'ready',
    transactionId: '24052549356',
    shipmentId: '51458635363',
    labelType: 'printable',
    carrierName: 'DPD Shop2Shop',
    labelUrl,
    requested: true,
  });
  assert.deepEqual(
    calls.find((call) => call.method === 'PUT'),
    {
      path: '/api/v2/transactions/24052549356/shipment/order',
      method: 'PUT',
      body: { seller_address_id: 777, drop_off_type: null, label_type: 'printable' },
    },
  );
  assert.equal(authorized(), 1);
});

test('nimmt den digitalen Schein nur, wenn Vinted keinen druckfertigen anbietet', async () => {
  const { adapter, calls } = vinted({
    options: {
      carrier: { name: 'DHL' },
      sender: { phone_number_requirement: 'optional' },
      drop_offs: [{ options: [{ label_types: ['digital'] }] }],
    },
  });
  const result = await executeVintedShippingLabel(
    adapter,
    '46984021',
    '500969788562',
    '24052549356',
  );
  assert.equal(result.labelType, 'digital');
  assert.equal(
    (calls.find((call) => call.method === 'PUT')?.body as Record<string, unknown>)['label_type'],
    'digital',
  );
});

test('holt einen bereits angeforderten Schein ohne erneute Anforderung', async () => {
  const { adapter, calls, authorized } = vinted({
    actions: ['send_shipping_label', 'track_shipment'],
  });
  const result = await executeVintedShippingLabel(
    adapter,
    '46984021',
    '500969788562',
    '24052549356',
  );
  assert.equal(result.outcome, 'ready');
  assert.equal(result.requested, false);
  assert.equal(
    calls.some((call) => call.method === 'PUT'),
    false,
  );
  assert.equal(authorized(), 0);
});

test('wartet auf die Erstellung und meldet einen noch nicht fertigen Schein als ausstehend', async () => {
  const waiting = vinted({ labelUrls: [null, null, labelUrl] });
  assert.equal(
    (await executeVintedShippingLabel(waiting.adapter, '1', '500969788562', '24052549356')).outcome,
    'ready',
  );
  const never = vinted({ labelUrls: [null] });
  const pending = await executeVintedShippingLabel(
    never.adapter,
    '1',
    '500969788562',
    '24052549356',
  );
  assert.equal(pending.outcome, 'pending');
  assert.equal(pending.requested, true);
});

test('fordert nichts an, wenn Auswahl, Adresse oder Telefonnummer unklar sind', async () => {
  for (const [overrides, errorCode] of [
    [
      {
        options: {
          drop_offs: [
            { options: [{ label_types: ['printable'] }, { label_types: ['printable'] }] },
          ],
        },
      },
      'label_choice_required',
    ],
    [
      {
        addresses: [
          { id: 1, entry_type: 1 },
          { id: 2, entry_type: 1 },
        ],
      },
      'address_choice_required',
    ],
    [
      {
        options: {
          sender: { phone_number_requirement: 'mandatory' },
          drop_offs: [{ options: [{ label_types: ['printable'] }] }],
        },
      },
      'phone_required',
    ],
    [{ actions: ['use_payments'] }, 'not_available'],
    [{ relation: { current_user_side: 'buyer' } }, 'not_seller'],
    [{ relation: { id: 1 } }, 'not_seller'],
  ] as const) {
    const { adapter, calls } = vinted(overrides);
    const result = await executeVintedShippingLabel(adapter, '1', '500969788562', '24052549356');
    assert.equal(result.outcome, 'failed');
    assert.equal(result.errorCode, errorCode);
    assert.equal(
      calls.some((call) => call.method === 'PUT'),
      false,
    );
  }
});

test('übernimmt Anmelde- und Sperrfehler von Vinted als Fehlercode', async () => {
  const { adapter } = vinted();
  adapter.read = async () => {
    throw new VintedShippingLabelError('challenge_required');
  };
  assert.equal(
    (await executeVintedShippingLabel(adapter, '1', '500969788562', '24052549356')).errorCode,
    'challenge_required',
  );
});

test('lädt ausschließlich Dateien aus Vinteds Versandschein-Ablage', () => {
  assert.equal(isVintedShippingLabelUrl(labelUrl), true);
  for (const url of [
    'http://svc-shipping-labels.s3.eu-central-1.amazonaws.com/x',
    'https://svc-shipping-labels.s3.eu-central-1.amazonaws.com.evil.test/x',
    'https://evil.test/svc-shipping-labels.s3.eu-central-1.amazonaws.com/x',
    'https://svc-shipping-labels.s3.eu-central-1.amazonaws.com/x#frag',
    null,
  ])
    assert.equal(isVintedShippingLabelUrl(url), false, String(url));
});
