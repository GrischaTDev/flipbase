/** Ein Beta-Geheimnis gehört nur in die Mail und nicht in Serverzugriffsprotokolle. */
export function createBetaRegistrationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function hashBetaRegistrationToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildBetaRegistrationUrl(siteUrl: string, token: string): string {
  const url = new URL('/auth/set-password', siteUrl);
  url.hash = new URLSearchParams({ beta_token: token }).toString();
  return url.toString();
}
