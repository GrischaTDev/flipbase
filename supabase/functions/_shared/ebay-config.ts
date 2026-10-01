import type { EbayConfig } from './ebay-api.ts';

export function readEbayDeletionConfig(
  readEnvironment: (name: string) => string | undefined,
): { verificationToken: string; endpoint: string } | null {
  const verificationToken = readEnvironment('EBAY_DELETION_VERIFICATION_TOKEN') ?? '';
  const endpoint = readEnvironment('EBAY_DELETION_ENDPOINT') ?? '';
  try {
    const url = new URL(endpoint);
    if (
      !/^[a-zA-Z0-9_-]{32,80}$/.test(verificationToken) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return { verificationToken, endpoint };
  } catch {
    return null;
  }
}

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
    if (!readEbayDeletionConfig(readEnvironment)) return null;
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
