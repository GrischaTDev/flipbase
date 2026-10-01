import type { EbayTokens } from './ebay-api.ts';
import { readRecord, readNonEmptyString } from './ebay-api.ts';

const encoder = new TextEncoder();
export async function hashState(state: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(state));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function loadEncryptionKey(encodedValue: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(encodedValue), (char) => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
export async function encryptTokens(
  tokens: EbayTokens,
  secret: string,
  connectionId: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(connectionId) },
    await loadEncryptionKey(secret),
    encoder.encode(JSON.stringify(tokens)),
  );
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`;
}
export async function decryptTokens(
  encodedValue: string,
  secret: string,
  connectionId: string,
): Promise<EbayTokens> {
  const [version, iv, encrypted] = encodedValue.split('.');
  if (version !== 'v1' || !iv || !encrypted) throw new Error('Invalid ciphertext');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Uint8Array.from(atob(iv), (char) => char.charCodeAt(0)),
      additionalData: encoder.encode(connectionId),
    },
    await loadEncryptionKey(secret),
    Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0)),
  );
  const body = readRecord(JSON.parse(new TextDecoder().decode(plaintext)));
  const accessToken = readNonEmptyString(body.accessToken);
  const refreshToken = readNonEmptyString(body.refreshToken);
  if (
    !accessToken ||
    !refreshToken ||
    typeof body.expiresAt !== 'number' ||
    typeof body.refreshExpiresAt !== 'number' ||
    !Number.isFinite(body.expiresAt) ||
    !Number.isFinite(body.refreshExpiresAt)
  )
    throw new Error('Invalid tokens');
  return {
    accessToken,
    refreshToken,
    expiresAt: body.expiresAt,
    refreshExpiresAt: body.refreshExpiresAt,
  };
}
