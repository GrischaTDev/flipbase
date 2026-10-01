import { createHash, createVerify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { getEbayHosts, readRecord, requestToken, readNonEmptyString } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';

export function deletionChallenge(
  challenge: string,
  verificationToken: string,
  endpoint: string,
): string {
  return createHash('sha256')
    .update(challenge)
    .update(verificationToken)
    .update(endpoint)
    .digest('hex');
}
/** Die Signatur entspricht dem offiziellen eBay-Notification-SDK (ECC/SHA-1). */
export function verifyNotification(payload: string, signature: string, publicKey: string): boolean {
  try {
    const message = readRecord(JSON.parse(Buffer.from(signature, 'base64').toString('utf8')));
    const signed = readNonEmptyString(message.signature);
    if (!signed) return false;
    const verifier = createVerify('sha1');
    verifier.update(JSON.stringify(JSON.parse(payload)));
    return verifier.verify(
      publicKey
        .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
        .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----'),
      signed,
      'base64',
    );
  } catch {
    return false;
  }
}
export function notificationKeyId(signature: string): string | null {
  try {
    const kid = readNonEmptyString(
      readRecord(JSON.parse(Buffer.from(signature, 'base64').toString('utf8'))).kid,
    );
    return kid && /^[A-Za-z0-9_-]{1,200}$/.test(kid) ? kid : null;
  } catch {
    return null;
  }
}
export function deletedUserId(payload: string): string | null {
  const body = readRecord(JSON.parse(payload));
  if (readRecord(body.metadata).topic !== 'MARKETPLACE_ACCOUNT_DELETION') return null;
  return readNonEmptyString(readRecord(readRecord(body.notification).data).userId);
}
export function createNotificationKeyReader(config: EbayConfig, fetcher = fetch) {
  const keys = new Map<string, { key: string; expires: number }>();
  let applicationToken: { value: string; expires: number } | null = null;
  return async (id: string): Promise<string> => {
    const cached = keys.get(id);
    if (cached && cached.expires > Date.now()) return cached.key;
    if (!applicationToken || applicationToken.expires <= Date.now() + 60_000) {
      const token = await requestToken(
        config,
        new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'https://api.ebay.com/oauth/api_scope',
        }),
        fetcher,
      );
      const value = readNonEmptyString(token.access_token);
      if (!value || typeof token.expires_in !== 'number') throw new Error('Invalid token');
      applicationToken = { value, expires: Date.now() + token.expires_in * 1000 };
    }
    const response = await fetcher(
      `${getEbayHosts(config.environment).api}/commerce/notification/v1/public_key/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${applicationToken.value}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('Public key unavailable');
    const value = readNonEmptyString(readRecord(await response.json()).key);
    if (!value) throw new Error('Invalid public key');
    if (keys.size >= 100) keys.clear();
    keys.set(id, { key: value, expires: Date.now() + 3_600_000 });
    return value;
  };
}
