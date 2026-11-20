import { assertEquals } from 'jsr:@std/assert@1';
import { createMaskHandler, type MaskDependencies } from './index.ts';
import { encodeBase64, resolvePhotoMaskProvider } from './provider.ts';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MASK_ID = '33333333-3333-4333-8333-333333333333';
const SAMPLE_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
]);
const SAMPLE_JPEG_DATA_URI = `data:image/jpeg;base64,${encodeBase64(
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]),
)}`;

function createDeps(overrides: Partial<MaskDependencies> = {}): MaskDependencies {
  return {
    authenticate: async (token) => (token === 'valid-jwt' ? USER_ID : null),
    authorize: async (_token, workspaceId) => workspaceId === WORKSPACE_ID,
    provider: () =>
      resolvePhotoMaskProvider({ get: (k) => (k === 'FAL_KEY' ? 'fal-test' : undefined) }),
    reserve: async () => ({
      id: MASK_ID,
      storagePath: `${WORKSPACE_ID}/${MASK_ID}.png`,
      cached: false,
    }),
    save: async () => undefined,
    uploadMask: async () => undefined,
    downloadStoredMask: async () => SAMPLE_PNG,
    generateMask: async () => SAMPLE_PNG,
    ...overrides,
  };
}

function makeRequest(body: unknown, token = 'valid-jwt', origin = 'https://app.flipbase.de') {
  return new Request('https://api.flipbase.de/functions/v1/vinted-photo-background-mask', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test('weist fremden Origin, fehlende Auth und unberechtigte Workspaces ab', async () => {
  const handler = createMaskHandler(createDeps());
  const badOrigin = await handler(
    makeRequest(
      { workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI },
      'valid-jwt',
      'https://evil.test',
    ),
  );
  assertEquals(badOrigin.status, 403);

  const unauth = await handler(
    makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI }, ''),
  );
  assertEquals(unauth.status, 401);

  const forbiddenWs = await handler(
    makeRequest({
      workspaceId: '99999999-9999-4999-8999-999999999999',
      imageDataUrl: SAMPLE_JPEG_DATA_URI,
    }),
  );
  assertEquals(forbiddenWs.status, 403);
});

Deno.test('meldet not_configured ohne Key und mask_busy/mask_limit korrekt', async () => {
  const unconfigured = createMaskHandler(createDeps({ provider: () => null }));
  assertEquals(
    (
      await unconfigured(
        makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI }),
      )
    ).status,
    503,
  );

  const busy = createMaskHandler(
    createDeps({
      reserve: async () => ({ id: '', storagePath: '', cached: false, error: 'mask_busy' }),
    }),
  );
  assertEquals(
    (await busy(makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI })))
      .status,
    409,
  );

  const limited = createMaskHandler(
    createDeps({
      reserve: async () => ({ id: '', storagePath: '', cached: false, error: 'mask_limit' }),
    }),
  );
  assertEquals(
    (await limited(makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI })))
      .status,
    429,
  );
});

Deno.test(
  'nutzt gespeicherte Cache-Maske ohne Provider-Aufruf und speichert neue Masken privat',
  async () => {
    let generateCalls = 0;
    let uploadedPath = '';
    let savedValues: Record<string, unknown> | null = null;

    const cachedHandler = createMaskHandler(
      createDeps({
        reserve: async () => ({
          id: MASK_ID,
          storagePath: `${WORKSPACE_ID}/${MASK_ID}.png`,
          cached: true,
        }),
        generateMask: async () => {
          generateCalls++;
          return SAMPLE_PNG;
        },
      }),
    );
    const cachedRes = await cachedHandler(
      makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI }),
    );
    assertEquals(cachedRes.status, 200);
    const cachedJson = await cachedRes.json();
    assertEquals(cachedJson.cached, true);
    assertEquals(cachedJson.maskId, MASK_ID);
    assertEquals(generateCalls, 0);

    const freshHandler = createMaskHandler(
      createDeps({
        uploadMask: async (path) => {
          uploadedPath = path;
        },
        save: async (_id, values) => {
          savedValues = values;
        },
        generateMask: async () => {
          generateCalls++;
          return SAMPLE_PNG;
        },
      }),
    );
    const freshRes = await freshHandler(
      makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI }),
    );
    assertEquals(freshRes.status, 200);
    const freshJson = await freshRes.json();
    assertEquals(freshJson.cached, false);
    assertEquals(freshJson.maskMimeType, 'image/png');
    assertEquals(freshJson.maskBase64, encodeBase64(SAMPLE_PNG));
    assertEquals(uploadedPath, `${WORKSPACE_ID}/${MASK_ID}.png`);
    assertEquals(savedValues?.['status'], 'completed');
    assertEquals(generateCalls, 1);
  },
);

Deno.test(
  'markiert fehlgeschlagene Provider-Antwort als failed statt haengendes pending zu lassen',
  async () => {
    let savedStatus = '';
    const failing = createMaskHandler(
      createDeps({
        generateMask: async () => {
          throw new Error('upstream boom');
        },
        save: async (_id, values) => {
          savedStatus = String(values['status'] ?? '');
        },
      }),
    );
    const res = await failing(
      makeRequest({ workspaceId: WORKSPACE_ID, imageDataUrl: SAMPLE_JPEG_DATA_URI }),
    );
    assertEquals(res.status, 502);
    assertEquals(savedStatus, 'failed');
  },
);
