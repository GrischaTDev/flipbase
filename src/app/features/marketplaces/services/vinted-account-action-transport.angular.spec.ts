import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  runVintedAccountAction,
  VintedAccountActionRejectedError,
} from './vinted-account-action-transport';
import type { VintedAccountAction } from '../models/vinted-account-action';
import { releaseVintedAccountActionRequest } from './vinted-account-action-transport';

function mockActionFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): void {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    input === '/marketplace-browser/healthz'
      ? Promise.resolve(Response.json({ ok: true, accountActionsEnabled: true }))
      : implementation(input, init),
  );
}

const scope = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  connectionId: '22222222-2222-4222-8222-222222222222',
};
const entryId = '33333333-3333-4333-8333-333333333333';
const path = '/marketplace-browser/listings/price/save';
const request = { ...scope, entryId, expectedPriceCents: 1000, priceCents: 1200 };
const token = `header.${btoa(JSON.stringify({ sub: 'user-a' }))}.signature`;
function action(
  requestId: string,
  state: VintedAccountAction['state'] = 'queued',
  version = 1,
): VintedAccountAction {
  return {
    ...scope,
    id: '44444444-4444-4444-8444-444444444444',
    requestId,
    kind: 'price_save',
    state,
    version,
    entryId,
    title: 'Hose',
    waitReason: state === 'queued' ? 'pool_busy' : null,
    errorCode: null,
    result: state === 'succeeded' ? { status: 'confirmed' } : null,
    blockedByActionId: null,
    historyPurged: false,
    resultExpired: false,
    createdAt: '2026-11-14T12:00:00Z',
    updatedAt: '2026-11-14T12:00:00Z',
    startedAt: null,
    finishedAt: null,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('nimmt kurz an, beobachtet gespeicherten Status und gibt erst bestätigtes Ergebnis zurück', async () => {
  let requestId = '';
  const fetchMock = vi.fn(async (_path: unknown, options: RequestInit = {}) => {
    const body: unknown = JSON.parse(String(options.body));
    if (
      _path === path &&
      body &&
      typeof body === 'object' &&
      'requestId' in body &&
      typeof body.requestId === 'string'
    ) {
      requestId = body.requestId;
      return Response.json({ action: action(requestId) }, { status: 202 });
    }
    return Response.json({ action: action(requestId, 'succeeded', 2) });
  });
  mockActionFetch(fetchMock);
  const result = runVintedAccountAction(path, request, token);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(1500);
  expect(await (await result).json()).toEqual({ status: 'confirmed' });
  expect(fetchMock.mock.calls[1][0]).toBe('/marketplace-browser/actions/status');
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
    ...scope,
    actionId: action(requestId).id,
  });
  expect(localStorage.length).toBe(0);
});

it('behält nach Antwortverlust dieselbe Anfragekennung ohne private Nutzdaten im Browserspeicher', async () => {
  const ids: string[] = [];
  mockActionFetch(
    vi.fn(async (_path: unknown, options: RequestInit = {}) => {
      const body: unknown = JSON.parse(String(options.body));
      if (
        !body ||
        typeof body !== 'object' ||
        !('requestId' in body) ||
        typeof body.requestId !== 'string'
      )
        throw new Error('Testanfrage ungültig');
      ids.push(body.requestId);
      if (ids.length === 1) throw new Error('Antwort verloren');
      return Response.json({ action: action(body.requestId, 'succeeded') }, { status: 202 });
    }),
  );
  await expect(runVintedAccountAction(path, request, token)).rejects.toThrow('Antwort verloren');
  expect(localStorage.length).toBe(1);
  expect(localStorage.key(0)).not.toContain('1200');
  expect(localStorage.getItem(localStorage.key(0)!)).toBe(ids[0]);
  await runVintedAccountAction(path, request, token);
  expect(ids[0]).toBe(ids[1]);
});

it('zeigt eine nicht angenommene 51. Aktion ausdrücklich an und startet keinen Statusabruf', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ code: 'account_action_queue_full' }, { status: 409 }));
  mockActionFetch(fetchMock);
  await expect(runVintedAccountAction(path, request, token)).rejects.toBeInstanceOf(
    VintedAccountActionRejectedError,
  );
  await expect(runVintedAccountAction(path, request, token)).rejects.toThrow(
    'Diese Aktion wurde nicht angenommen',
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('wiederholt eine unklare Wirkung nicht und behält ihren Anfragebeleg', async () => {
  let id = '';
  mockActionFetch(
    vi.fn(async (_path: unknown, options: RequestInit = {}) => {
      const body = JSON.parse(String(options.body)) as { requestId: string };
      id = body.requestId;
      return Response.json({ action: action(id, 'outcome_unknown') }, { status: 202 });
    }),
  );
  expect((await runVintedAccountAction(path, request, token)).status).toBe(502);
  expect(localStorage.length).toBe(1);
});
it('bindet eine erneute Cloud-Anmeldung an die vorher angelegte Dialogkennung', async () => {
  const dialogId = '77777777-7777-4777-8777-777777777777';
  const request = vi.fn().mockResolvedValue(
    Response.json(
      {
        action: {
          ...action(dialogId, 'succeeded'),
          kind: 'cloud_session_open',
          entryId: null,
          title: null,
          result: { id: '88888888-8888-4888-8888-888888888888' },
        },
      },
      { status: 202 },
    ),
  );
  mockActionFetch(request);
  const result = await runVintedAccountAction(
    '/marketplace-browser/sessions',
    { ...scope, dialogId },
    token,
  );
  expect(JSON.parse(String(request.mock.calls[0][1].body))).toEqual({
    ...scope,
    dialogId,
    requestId: dialogId,
  });
  expect(await result.json()).toEqual({ id: '88888888-8888-4888-8888-888888888888' });
  expect(localStorage.length).toBe(0);
});

it('sendet an einen alten Browserdienst keinen Auftrag mit möglichen Anbieterwirkungen', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, apiVersion: 2 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(runVintedAccountAction(path, request, token)).rejects.toThrow('noch nicht');
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toBe('/marketplace-browser/healthz');
});
it('erhält die fachliche Versandschein-Ablehnung für den bestehenden Ergebnisparser', async () => {
  mockActionFetch(async (_input, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    if (
      !body ||
      typeof body !== 'object' ||
      !('requestId' in body) ||
      typeof body.requestId !== 'string'
    )
      throw new Error('Testanfrage ungültig');
    return Response.json(
      {
        action: {
          ...action(body.requestId, 'failed'),
          kind: 'shipping_label_request',
          result: { outcome: 'failed', requested: false, errorCode: 'phone_required' },
        },
      },
      { status: 202 },
    );
  });
  const response = await runVintedAccountAction(
    '/marketplace-browser/shipping-labels/request',
    { ...scope, saleId: entryId },
    token,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    outcome: 'failed',
    requested: false,
    errorCode: 'phone_required',
  });
});
it('behandelt eine unerwartete Sofortantwort nicht als gespeicherten Auftrag', async () => {
  mockActionFetch(vi.fn().mockResolvedValue(Response.json({ status: 'confirmed' })));
  await expect(runVintedAccountAction(path, request, token)).rejects.toThrow(
    'keinen gespeicherten Auftrag',
  );
});
it('behält den unklaren Beleg bis eine serverseitige Nachprüfung eine eindeutige Auflösung zeigt', async () => {
  let receipt: VintedAccountAction | null = null;
  mockActionFetch(
    vi.fn(async (_input, init) => {
      const body: unknown = JSON.parse(String(init?.body));
      if (
        !body ||
        typeof body !== 'object' ||
        !('requestId' in body) ||
        typeof body.requestId !== 'string'
      )
        throw new Error('Testanfrage ungültig');
      receipt = action(body.requestId, 'outcome_unknown');
      return Response.json({ action: receipt }, { status: 202 });
    }),
  );
  await runVintedAccountAction(path, request, token);
  const saved = receipt as VintedAccountAction | null;
  if (!saved) throw new Error('Testbeleg fehlt.');
  releaseVintedAccountActionRequest(saved, 'user-a');
  expect(localStorage.length).toBe(1);
  releaseVintedAccountActionRequest({ ...saved, state: 'failed', version: 2 }, 'user-a');
  expect(localStorage.length).toBe(0);
});
