import assert from 'node:assert/strict';
import { searchVintedBrands } from './brand-source.ts';

Deno.test(
  'searches Vinted with anonymous cookies and returns only brand names and IDs',
  async () => {
    const requests: { url: string; cookie: string | null }[] = [];
    const fetchFn = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, cookie: headers.get('cookie') });
      if (url === 'https://www.vinted.de/') {
        const response = new Response('', { status: 200 });
        response.headers.append('set-cookie', 'access_token_web=old; Max-Age=-1; Path=/');
        response.headers.append('set-cookie', 'access_token_web=fresh; Max-Age=604800; Path=/');
        response.headers.append('set-cookie', 'datadome=old; Max-Age=-1; Path=/');
        return response;
      }
      return Response.json({
        brands: [
          { id: 88, title: 'Ralph Lauren', item_count: 123 },
          { id: 4273, title: 'Polo Ralph Lauren', item_count: 45 },
          { id: 0, title: 'Invalid' },
        ],
      });
    };

    const brands = await searchVintedBrands('Ralph Lauren', fetchFn);

    assert.deepEqual(brands, [
      { id: 88, name: 'Ralph Lauren' },
      { id: 4273, name: 'Polo Ralph Lauren' },
    ]);
    assert.equal(requests[0]?.cookie, null);
    assert.equal(requests[1]?.url, 'https://www.vinted.de/api/v2/brands?keyword=Ralph+Lauren');
    assert.equal(requests[1]?.cookie, 'access_token_web=fresh');
  },
);

Deno.test('rejects an invalid Vinted brand response', async () => {
  const fetchFn = async (input: string | URL): Promise<Response> =>
    String(input).endsWith('/') ? new Response('') : Response.json({ unexpected: true });
  await assert.rejects(searchVintedBrands('Nike', fetchFn), /brand/i);
});
