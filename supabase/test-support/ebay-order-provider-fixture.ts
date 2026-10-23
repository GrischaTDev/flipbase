// Ausschließlich der Anbieter wird ersetzt. Auth, private Prüfstände und
// Buchungs-RPC laufen durch den unveränderten Produktiveinstiegspunkt.
export function installEbayOrderProviderFixture(): void {
  if (
    Deno.env.get('FLIPBASE_EBAY_TEST_PROVIDER') !== 'isolated' ||
    Deno.env.get('EBAY_CLIENT_ID') !== 'flipbase-local-test'
  )
    throw new Error('Testfreigabe fehlt');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== 'api.ebay.com') return originalFetch(input, init);
    const token = (
      request.headers.get('authorization')?.replace('Bearer ', '') ??
      request.headers.get('X-EBAY-API-IAF-TOKEN') ??
      ''
    ).replace('fixture-', '');
    if (!/^[0-9a-f-]{36}$/.test(token)) return Promise.resolve(new Response('', { status: 401 }));
    const orderId = `fixture-${token}`;
    // Der Browser steuert ausschließlich seine isolierte Anbieterquelle über den vorhandenen Testcache.
    // So laufen Folgeabruf, Normalisierung, private Prüfung und Buchung unverändert durch die Anwendung.
    let source: Record<string, unknown> = {};
    if (url.pathname.startsWith('/sell/fulfillment/v1/order')) {
      const endpoint = new URL('/rest/v1/ebay_cached_orders', Deno.env.get('SUPABASE_URL'));
      endpoint.searchParams.set('select', 'source');
      endpoint.searchParams.set('external_account_id', `eq.test-${token}`);
      endpoint.searchParams.set('order_id', `eq.${orderId}`);
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const response = await originalFetch(endpoint, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!response.ok) throw new Error('Isolierte Anbieterquelle konnte nicht geladen werden');
      const rows: unknown = await response.json();
      if (Array.isArray(rows) && rows[0]?.source && typeof rows[0].source === 'object')
        source = rows[0].source;
    }
    const order = {
      orderId,
      creationDate: '2026-09-30T22:30:00Z',
      lastModifiedDate: '2026-10-01T12:00:00Z',
      orderPaymentStatus: 'PAID',
      orderFulfillmentStatus: 'NOT_STARTED',
      totalMarketplaceFee:
        source['platformFeeCents'] === null
          ? undefined
          : {
              value: (typeof source['platformFeeCents'] === 'number'
                ? source['platformFeeCents'] / 100
                : 0
              ).toFixed(2),
              currency: 'EUR',
            },
      cancelStatus: {
        cancelState:
          typeof source['cancelStatus'] === 'string' ? source['cancelStatus'] : 'NONE_REQUESTED',
      },
      paymentSummary: {
        refunds:
          Array.isArray(source['blockers']) && source['blockers'].includes('refund_or_unknown')
            ? [{ refundStatus: 'SUCCEEDED', amount: { value: '14.00', currency: 'EUR' } }]
            : [],
      },
      pricingSummary: {
        priceSubtotal: { value: '10.00', currency: 'EUR' },
        deliveryCost: { value: '4.00', currency: 'EUR' },
        total: { value: '14.00', currency: 'EUR' },
      },
      lineItems:
        Array.isArray(source['lines']) && source['lines'].length === 0
          ? []
          : [
              {
                lineItemId: 'line-1',
                legacyItemId: '123',
                title: 'eBay-Testartikel',
                image: { imageUrl: 'https://i.ebayimg.com/flipbase-test.webp' },
                quantity: 1,
                lineItemCost: { value: '10.00', currency: 'EUR' },
                refunds: [],
              },
            ],
    };
    if (request.method === 'GET' && url.pathname === '/sell/fulfillment/v1/order')
      return Promise.resolve(Response.json({ orders: [order], total: 1 }));
    if (
      request.method === 'GET' &&
      decodeURIComponent(url.pathname) === `/sell/fulfillment/v1/order/${orderId}`
    )
      return Promise.resolve(Response.json(order));
    if (
      request.method === 'POST' &&
      url.pathname === '/ws/api.dll' &&
      request.headers.get('X-EBAY-API-CALL-NAME') === 'GetMyeBaySelling'
    )
      return Promise.resolve(
        new Response(
          '<Response><Ack>Success</Ack><ActiveList><ItemArray><Item><ItemID>123</ItemID><Title>eBay-Testartikel</Title><ListingType>FixedPriceItem</ListingType><QuantityAvailable>1</QuantityAvailable><SellingStatus><CurrentPrice currencyID="EUR">10.00</CurrentPrice></SellingStatus></Item></ItemArray><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList></Response>',
        ),
      );
    throw new Error('Unerwarteter Anbieteraufruf im eBay-Test');
  };
}
