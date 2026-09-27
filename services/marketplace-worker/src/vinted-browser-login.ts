import type { Page } from 'playwright';

export interface VintedLoginCredentials {
  username: string;
  password: string;
}

export type VintedLoginResult = 'submitted' | 'form_unavailable' | 'submission_unconfirmed';

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
  const cookieButton = page.locator('#onetrust-reject-all-handler');
  let handlerAdded = false;
  let submissionStarted = false;
  const authorizeLoginPage = async () => {
    await authorize();
    if (!isLoginPage()) throw new Error('Unerwartete Anmeldeseite');
  };
  const dismissCookies = async () => {
    await authorizeLoginPage();
    // Öffentlich am 28.09.2026 geprüft: „Notwendige auswählen“.
    await cookieButton.click({ timeout: 5_000 });
    await cookieButton.waitFor({ state: 'hidden', timeout: 5_000 });
  };
  try {
    await authorize();
    await page.goto('https://www.vinted.de/member/login/email', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await authorizeLoginPage();
    if (await cookieButton.isVisible()) await dismissCookies();
    await page.addLocatorHandler(cookieButton, dismissCookies);
    handlerAdded = true;
    const username = page.locator('input[name="username"]');
    const password = page.locator('input[name="password"][type="password"]');
    const submit = page.getByRole('button', { name: 'Weiter', exact: true });
    for (const control of [username, password, submit]) {
      await control.waitFor({ state: 'visible', timeout: 10_000 });
    }
    await authorizeLoginPage();
    await username.fill(credentials.username, { timeout: 5_000 });
    await authorizeLoginPage();
    await password.fill(credentials.password, { timeout: 5_000 });
    await authorizeLoginPage();
    submissionStarted = true;
    await submit.click({ timeout: 5_000 });
    return 'submitted';
  } catch {
    // Anbieterfehler können Eingaben enthalten. Keine Details weiterreichen,
    // insbesondere nach einem möglicherweise bereits gesendeten Login.
    return submissionStarted ? 'submission_unconfirmed' : 'form_unavailable';
  } finally {
    if (handlerAdded) await page.removeLocatorHandler(cookieButton).catch(() => undefined);
  }
}
