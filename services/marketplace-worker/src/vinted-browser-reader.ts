import type { Page } from 'playwright';

export interface VintedAccountIdentity {
  id: string;
  username: string;
}

export class VintedLoginRejectedError extends Error {
  constructor() {
    super('Vinted hat die Zugangsdaten abgelehnt');
  }
}

const accountIdPattern = /^[1-9][0-9]{0,31}$/;
const usernamePattern = /^[^\p{Cc}]{1,120}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Nur bestätigte Identitätsfelder verlassen den Cloudbrowser. */
export function parseVintedAccountIdentity(value: unknown): VintedAccountIdentity | null {
  if (!isRecord(value) || !isRecord(value['user'])) return null;
  const user = value['user'];
  const id =
    typeof user['id'] === 'number' && Number.isSafeInteger(user['id'])
      ? String(user['id'])
      : user['id'];
  const username = user['login'] ?? user['username'];
  if (
    typeof id !== 'string' ||
    !accountIdPattern.test(id) ||
    typeof username !== 'string' ||
    !usernamePattern.test(username) ||
    username.trim().length === 0
  )
    return null;
  return { id, username: username.trim() };
}

export async function readVintedAccountIdentity(
  page: Pick<Page, 'url' | 'evaluate'>,
): Promise<VintedAccountIdentity | null> {
  try {
    if (new URL(page.url()).origin !== 'https://www.vinted.de') return null;
  } catch {
    return null;
  }
  let response: unknown;
  try {
    response = await page.evaluate(async () => {
      if (
        location.pathname === '/member/login/email' &&
        document.body.innerText.includes('Ungültiger Mitgliedsname oder Passwort')
      )
        return { loginRejected: true };
      const result = await fetch('/api/v2/users/current', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (
        new URL(result.url).origin !== 'https://www.vinted.de' ||
        !result.ok ||
        !result.headers.get('content-type')?.includes('application/json')
      )
        return null;
      const value: unknown = await result.json();
      if (typeof value !== 'object' || value === null || !('user' in value)) return null;
      const user = value.user;
      if (typeof user !== 'object' || user === null || !('id' in user)) return null;
      return {
        user: {
          id: user.id,
          login: 'login' in user ? user.login : null,
          username: 'username' in user ? user.username : null,
        },
      };
    });
  } catch {
    return null;
  }
  if (isRecord(response) && response['loginRejected'] === true)
    throw new VintedLoginRejectedError();
  return parseVintedAccountIdentity(response);
}
