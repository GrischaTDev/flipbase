export interface DiscordState {
  userId: string;
  expiresAt: number;
  nonce: string;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createDiscordState(userId: string, secret: string): Promise<string> {
  const state: DiscordState = {
    userId,
    expiresAt: Date.now() + 10 * 60_000,
    nonce: crypto.randomUUID(),
  };
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyDiscordState(
  value: string,
  userId: string,
  secret: string,
): Promise<boolean> {
  try {
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra) return false;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      decodeBase64Url(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const state: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (!state || typeof state !== 'object') return false;
    const candidate = state as Partial<DiscordState>;
    return (
      candidate.userId === userId &&
      typeof candidate.expiresAt === 'number' &&
      candidate.expiresAt > Date.now() &&
      candidate.expiresAt <= Date.now() + 10 * 60_000 &&
      typeof candidate.nonce === 'string' &&
      candidate.nonce.length > 0
    );
  } catch {
    return false;
  }
}
