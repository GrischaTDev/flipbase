import type { EbayConfig } from './ebay-api.ts';

export function readEbayConfig(
  readEnvironment: (name: string) => string | undefined,
): EbayConfig | null {
  const clientId = readEnvironment('EBAY_CLIENT_ID')?.trim();
  const clientSecret = readEnvironment('EBAY_CLIENT_SECRET')?.trim();
  const ruName = readEnvironment('EBAY_REDIRECT_URI_NAME')?.trim();
  const encryptionKey = readEnvironment('EBAY_TOKEN_ENCRYPTION_KEY')?.trim();
  const appUrl = readEnvironment('EBAY_APP_URL')?.trim();
  const environment = readEnvironment('EBAY_ENVIRONMENT') ?? 'production';
  if (
    !clientId ||
    !clientSecret ||
    !ruName ||
    !encryptionKey ||
    !appUrl ||
    !['production', 'sandbox'].includes(environment)
  )
    return null;
  try {
    if (atob(encryptionKey).length !== 32) return null;
    const url = new URL(appUrl);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', 'flipbase.localhost'].includes(url.hostname)
        ))
    )
      return null;
    const token = readEnvironment('EBAY_DELETION_VERIFICATION_TOKEN') ?? '';
    const endpoint = new URL(readEnvironment('EBAY_DELETION_ENDPOINT') ?? '');
    if (
      !/^[a-zA-Z0-9_-]{32,80}$/.test(token) ||
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      return null;
    return {
      clientId,
      clientSecret,
      ruName,
      encryptionKey,
      appUrl: url.origin,
      environment: environment === 'sandbox' ? 'sandbox' : 'production',
      allowedOrigins: (readEnvironment('EBAY_ALLOWED_ORIGINS') ?? url.origin)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}
