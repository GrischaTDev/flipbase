import type { Page } from 'playwright';
import { hasVisibleVintedChallenge } from './vinted-browser-challenge.ts';
import { VintedInteractionRequiredError } from './vinted-browser-reader.ts';

export interface VintedLoginCredentials {
  username: string;
  password: string;
}

export type VintedLoginResult =
  | 'submitted'
  | 'interaction_required'
  | 'form_unavailable'
  | 'submission_unconfirmed'
  | 'verification_required';

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
  const is2FaPage = () => {
    try {
      const url = new URL(page.url());
      return url.origin === 'https://www.vinted.de' && url.pathname === '/member/login/2fa';
    } catch {
      return false;
    }
  };
  const cookieButton = page.locator('#onetrust-reject-all-handler');
  let handlerAdded = false;
  let submissionStarted = false;
  let currentStep = 'init';
  const authorizeLoginPage = async () => {
    await authorize();
    if (await hasVisibleVintedChallenge(page)) throw new VintedInteractionRequiredError();
    if (is2FaPage()) return;
    if (!isLoginPage()) throw new Error('Unerwartete Anmeldeseite');
  };
  const dismissCookies = async () => {
    await authorizeLoginPage();
    // Öffentlich am 28.09.2026 geprüft: „Notwendige auswählen“.
    await cookieButton.click({ timeout: 5_000 });
    await cookieButton.waitFor({ state: 'hidden', timeout: 5_000 });
  };
  try {
    currentStep = 'authorize_init';
    await authorize();
    currentStep = 'goto_login';
    await page.goto('https://www.vinted.de/member/login/email', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await authorize();
    if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
    if (is2FaPage()) return 'verification_required';
    currentStep = 'authorize_page';
    await authorizeLoginPage();
    currentStep = 'dismiss_cookies';
    try {
      if (await cookieButton.isVisible()) {
        await dismissCookies();
      } else {
        await cookieButton.waitFor({ state: 'visible', timeout: 2_000 });
        await dismissCookies();
      }
    } catch {
      // Kein Cookie-Banner erschienen
    }
    await page.addLocatorHandler(cookieButton, dismissCookies);
    handlerAdded = true;
    currentStep = 'wait_controls';
    const username = page.locator('input[name="username"]');
    const password = page.locator('input[name="password"][type="password"]');
    const submit = page.getByRole('button', { name: 'Weiter', exact: true });
    await Promise.all(
      [username, password, submit].map((control) =>
        control.waitFor({ state: 'visible', timeout: 10_000 }),
      ),
    );
    currentStep = 'fill_username';
    await authorizeLoginPage();
    await username.fill(credentials.username, { timeout: 5_000 });
    currentStep = 'fill_password';
    await authorizeLoginPage();
    await password.fill(credentials.password, { timeout: 5_000 });
    currentStep = 'submit_click';
    await authorizeLoginPage();
    submissionStarted = true;
    await submit.click({ timeout: 5_000 });
    if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
    return 'submitted';
  } catch (error) {
    let challengeDetected = error instanceof VintedInteractionRequiredError;
    try {
      challengeDetected ||= await hasVisibleVintedChallenge(page);
      if (!challengeDetected && is2FaPage()) return 'verification_required';
    } catch {
      // Fehler bei der Diagnoseabfrage nicht weiterwerfen
    }
    try {
      process.stderr.write(
        `${JSON.stringify({
          event: 'marketplace_login_diagnostic',
          step: currentStep,
          challengeDetected,
          submissionStarted,
        })}\n`,
      );
    } catch {
      // Eine defekte Logausgabe verändert keinen Anmeldestatus.
    }
    if (challengeDetected) return 'interaction_required';
    return submissionStarted ? 'submission_unconfirmed' : 'form_unavailable';
  } finally {
    if (handlerAdded) await page.removeLocatorHandler(cookieButton).catch(() => undefined);
  }
}
