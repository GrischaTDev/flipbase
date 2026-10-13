import { readLimitedJson, uuidPattern } from '../push-settings/contracts.ts';
export interface PushRevokeDependencies {
  revoke(generationId: string, tokenHash: string): Promise<void>;
  origins: string[];
}
export function createPushRevokeHandler(dependencies: PushRevokeDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info',
      ...(origin && dependencies.origins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin }
        : {}),
    };
    const reply = (status = 200) =>
      new Response(JSON.stringify({ revoked: true }), { status, headers });
    if (origin && !dependencies.origins.includes(origin)) return reply(403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405);
    try {
      const input = (await readLimitedJson(request, 512)) as Record<string, unknown>;
      if (
        !input ||
        Object.keys(input).sort().join(',') !== 'action,generationId,token' ||
        input.action !== 'revoke_binding' ||
        typeof input.generationId !== 'string' ||
        !uuidPattern.test(input.generationId) ||
        typeof input.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(input.token)
      )
        return reply();
      const bytes = Uint8Array.from(input.token.match(/../g) ?? [], (hex) => parseInt(hex, 16));
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      await dependencies.revoke(input.generationId, hash);
      return reply();
    } catch {
      return reply(503);
    }
  };
}
