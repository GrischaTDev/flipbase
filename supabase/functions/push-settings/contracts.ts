export type PushInput = {
  action: 'settings' | 'register' | 'preferences' | 'revoke' | 'test';
  [field: string]: unknown;
};
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validatePushInput(input: unknown): PushInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('validation');
  const payload = input as Record<string, unknown>;
  const fields: Record<string, string[]> = {
    settings: ['installationId', 'workspaceId'],
    register: ['generationId', 'installationId', 'tokenHash', 'keyId', 'subscription'],
    preferences: ['deviceId', 'workspaceId', 'categories'],
    revoke: ['deviceId'],
    test: ['deviceId', 'workspaceId'],
  };
  const action = String(payload.action);
  if (
    !fields[action] ||
    Object.keys(payload).some((field) => field !== 'action' && !fields[action].includes(field))
  )
    throw new Error('validation');
  for (const field of fields[action]) {
    if (action === 'settings' && field === 'workspaceId' && payload[field] === undefined) continue;
    if (
      field.endsWith('Id') &&
      field !== 'keyId' &&
      (typeof payload[field] !== 'string' || !uuidPattern.test(payload[field] as string))
    )
      throw new Error('validation');
  }
  if (action === 'register') {
    if (
      typeof payload.tokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.tokenHash) ||
      typeof payload.keyId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(payload.keyId)
    )
      throw new Error('validation');
    const subscription = payload.subscription as Record<string, unknown>;
    if (
      !subscription ||
      Object.keys(subscription).sort().join(',') !== 'auth,endpoint,p256dh' ||
      typeof subscription.endpoint !== 'string' ||
      subscription.endpoint.length > 2048 ||
      typeof subscription.p256dh !== 'string' ||
      !/^[A-Za-z0-9_-]{87}$/.test(subscription.p256dh) ||
      typeof subscription.auth !== 'string' ||
      !/^[A-Za-z0-9_-]{22}$/.test(subscription.auth)
    )
      throw new Error('validation');
    const endpoint = new URL(subscription.endpoint);
    const provider =
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
        endpoint.hostname,
      ) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(endpoint.hostname);
    if (
      !provider ||
      endpoint.protocol !== 'https:' ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      throw new Error('validation');
  }
  if (
    action === 'preferences' &&
    (!Array.isArray(payload.categories) ||
      payload.categories.length > 3 ||
      new Set(payload.categories).size !== payload.categories.length ||
      payload.categories.some((category) => !['message', 'order', 'connection'].includes(category)))
  )
    throw new Error('validation');
  return payload as PushInput;
}
export async function readLimitedJson(request: Request, limit = 4096): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('validation');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) throw new Error('validation');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(await new Blob(chunks.map((chunk) => new Uint8Array(chunk))).text());
}
