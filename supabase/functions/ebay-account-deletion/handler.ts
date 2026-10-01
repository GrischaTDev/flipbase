import {
  deletedUserId,
  deletionChallenge,
  notificationKeyId,
  verifyNotification,
} from '../_shared/ebay-notifications.ts';

export function createDeletionHandler(
  verificationToken: string,
  endpoint: string,
  readKey: (id: string) => Promise<string>,
  removeUser: (id: string) => Promise<void>,
) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    if (!/^[A-Za-z0-9_-]{32,80}$/.test(verificationToken) || !endpoint.startsWith('https://'))
      return respond({ error: 'not_configured' }, 503);
    if (request.method === 'GET') {
      const challenge = new URL(request.url).searchParams.get('challenge_code');
      if (!challenge || challenge.length > 1024)
        return respond({ error: 'invalid_challenge' }, 400);
      return respond({
        challengeResponse: deletionChallenge(challenge, verificationToken, endpoint),
      });
    }
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    const signature = request.headers.get('x-ebay-signature') ?? '';
    const kid = notificationKeyId(signature);
    if (!kid || signature.length > 4096) return respond({ error: 'invalid_signature' }, 412);
    try {
      const payload = await request.text();
      if (payload.length > 16_384) return respond({ error: 'invalid_payload' }, 400);
      if (!verifyNotification(payload, signature, await readKey(kid)))
        return respond({ error: 'invalid_signature' }, 412);
      const userId = deletedUserId(payload);
      if (!userId || userId.length > 256) return respond({ error: 'invalid_payload' }, 400);
      // Erst nach bestätigter Löschung quittieren; eBay kann Datenbankfehler wiederholen.
      await removeUser(userId);
      return new Response(null, { status: 204 });
    } catch {
      return respond({ error: 'temporarily_unavailable' }, 503);
    }
  };
}
