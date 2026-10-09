import { afterEach, expect, it, vi } from 'vitest';
import {
  MarketplaceCloudSetupApiService,
  CLOUD_CHECK_MESSAGE,
} from './marketplace-cloud-setup-api.service';
const api = new MarketplaceCloudSetupApiService();
const request = {
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
  requestId: '25500000-0000-4000-8000-000000000031',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('wartet auf die bestellte IP mit derselben Anfrage statt einen neuen Kauf auszulösen', async () => {
  vi.useFakeTimers();
  const setup = {
    workspaceId: request.workspaceId,
    connectionId: request.connectionId,
    setupId: request.requestId,
    state: 'login',
    sessionId: null,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: 'purchase_pending' }))
    .mockResolvedValueOnce(Response.json({ status: 'ready', setup }));
  vi.stubGlobal('fetch', fetchMock);
  const operation = api.begin(request, 'test-token');
  await vi.runAllTimersAsync();
  expect(await operation).toEqual({ status: 'ready', setup });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
});
it('sendet die Bestellung authentifiziert und trennt Kapazität von technischen Fehlern', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: 'no_capacity' }))
    .mockResolvedValueOnce(Response.json({ error: 'internal secret' }, { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await api.begin(request, 'test-token')).toEqual({ status: 'no_capacity' });
  expect(fetchMock).toHaveBeenCalledWith(
    '/marketplace-browser/cloud-setups/begin',
    expect.objectContaining({
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
  await expect(api.begin(request, 'test-token')).rejects.toThrow(CLOUD_CHECK_MESSAGE);
});
it('verwirft eine fremde Einrichtungsantwort', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        ...request,
        setupId: request.requestId,
        state: 'reserved',
        sessionId: null,
      }),
    ),
  );
  await expect(
    api.action({ ...request, setupId: request.requestId }, 'read', 'test-token'),
  ).rejects.toThrow();
});
