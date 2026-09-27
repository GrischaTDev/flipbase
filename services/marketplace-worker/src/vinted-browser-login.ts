import type { Page } from 'playwright';

export interface VintedLoginCredentials {
  username: string;
  password: string;
}

export type VintedLoginResult = 'submitted' | 'interaction_required';

/** Eine ausdrückliche Anmeldung, ohne Speicherung oder automatische Wiederholung. */
export async function submitVintedLogin(
  page: Page,
  credentials: VintedLoginCredentials,
  authorize: () => Promise<void> = async () => undefined,
): Promise<VintedLoginResult> {
  const isLoginPage = () => {
    const url = new URL(page.url());
    return url.origin === 'https://www.vinted.de' && url.pathname === '/member/login/email';
  };
  try {
    await authorize();
    await page.goto('https://www.vinted.de/member/login/email', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    if (!isLoginPage()) return 'interaction_required';
    const username = page.locator('input[name="username"]');
    const password = page.locator('input[name="password"][type="password"]');
    const submit = page.getByRole('button', { name: 'Weiter', exact: true });
    for (const control of [username, password, submit]) {
      if ((await control.count()) !== 1 || !(await control.isVisible()))
        return 'interaction_required';
    }
    await authorize();
    if (!isLoginPage()) return 'interaction_required';
    await username.fill(credentials.username, { timeout: 5_000 });
    await authorize();
    if (!isLoginPage()) return 'interaction_required';
    await password.fill(credentials.password, { timeout: 5_000 });
    await authorize();
    if (!isLoginPage()) return 'interaction_required';
    await submit.click({ timeout: 5_000 });
    return 'submitted';
  } catch {
    // Anbieterfehler können Eingaben enthalten. Keine Details weiterreichen,
    // insbesondere nach einem möglicherweise bereits gesendeten Login.
    return 'interaction_required';
  }
}
