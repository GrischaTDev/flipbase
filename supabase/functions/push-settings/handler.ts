import { readLimitedJson, validatePushInput } from './contracts.ts';
export class PushSettingsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export interface PushSettingsDependencies {
  authenticate(bearer: string): Promise<{ userId: string; sessionId: string } | null>;
  execute(userId: string, sessionId: string, input: Record<string, unknown>): Promise<unknown>;
  publicKey: string;
  keyId: string;
  enabled: boolean;
  allowAll?: boolean;
  pilotUsers?: string[];
  pilotDevices?: string[];
  ownsDevice?(userId: string, sessionId: string, deviceId: string): Promise<boolean>;
  origins: string[];
}
export function createPushSettingsHandler(dependencies: PushSettingsDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      ...(origin && dependencies.origins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin }
        : {}),
    };
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !dependencies.origins.includes(origin)) return reply({ error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method' }, 405);
    const bearer = request.headers.get('authorization');
    if (!bearer?.startsWith('Bearer ')) return reply({ error: 'unauthorized' }, 401);
    try {
      const identity = await dependencies.authenticate(bearer);
      if (!identity) return reply({ error: 'unauthorized' }, 401);
      let input;
      try {
        input = validatePushInput(await readLimitedJson(request));
      } catch {
        return reply({ error: 'validation' }, 400);
      }
      const userAdmitted =
        dependencies.allowAll === true || (dependencies.pilotUsers ?? []).includes(identity.userId);
      const configured =
        dependencies.enabled &&
        /^[A-Za-z0-9_-]{87}$/.test(dependencies.publicKey) &&
        /^[A-Za-z0-9_-]{1,64}$/.test(dependencies.keyId);
      const deviceAdmitted = async (deviceId: unknown) =>
        typeof deviceId === 'string' &&
        (dependencies.pilotDevices ?? []).includes(deviceId) &&
        (await dependencies.ownsDevice?.(identity.userId, identity.sessionId, deviceId)) === true;
      const admitted =
        userAdmitted ||
        ((input.action === 'register' || input.action === 'test') &&
          (await deviceAdmitted(
            input.action === 'register' ? input.generationId : input.deviceId,
          )));
      if (input.action === 'test' && (!configured || !admitted))
        return reply({ error: 'configuration' }, 409);
      if (
        input.action === 'register' &&
        (!configured || !admitted || input.keyId !== dependencies.keyId)
      )
        return reply({ error: 'configuration' }, 409);
      const result = await dependencies.execute(identity.userId, identity.sessionId, input);
      return reply(
        input.action === 'settings'
          ? {
              ...(result as Record<string, unknown>),
              publicKey: dependencies.publicKey,
              keyId: dependencies.keyId,
              enabled:
                configured &&
                (userAdmitted ||
                  (await deviceAdmitted(
                    (result as { binding?: { deviceId?: string } }).binding?.deviceId,
                  ))),
            }
          : result,
      );
    } catch (error) {
      return error instanceof PushSettingsError
        ? reply({ error: error.code }, error.status)
        : reply({ error: 'unavailable' }, 503);
    }
  };
}
