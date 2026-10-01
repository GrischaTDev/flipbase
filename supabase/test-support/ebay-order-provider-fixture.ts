// Ausschließlich der Anbieter wird ersetzt. Auth, private Prüfstände und
// Buchungs-RPC laufen durch den unveränderten Produktiveinstiegspunkt.
export function installEbayOrderProviderFixture(): void {
  if (
    Deno.env.get('FLIPBASE_EBAY_TEST_PROVIDER') !== 'isolated' ||
    Deno.env.get('EBAY_CLIENT_ID') !== 'flipbase-local-test'
  )
    throw new Error('Testfreigabe fehlt');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
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
    const order = {
      orderId,
      creationDate: '2026-09-30T22:30:00Z',
      lastModifiedDate: '2026-10-01T12:00:00Z',
      orderPaymentStatus: 'PAID',
      orderFulfillmentStatus: 'NOT_STARTED',
      cancelStatus: { cancelState: 'NONE_REQUESTED' },
      pricingSummary: {
        priceSubtotal: { value: '10.00', currency: 'EUR' },
        deliveryCost: { value: '4.00', currency: 'EUR' },
        total: { value: '14.00', currency: 'EUR' },
      },
      lineItems: [
        {
          lineItemId: 'line-1',
          legacyItemId: '123',
          title: 'eBay-Testartikel',
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
