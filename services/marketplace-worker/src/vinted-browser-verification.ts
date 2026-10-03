import type { Page } from 'playwright';
import { hasVisibleVintedChallenge } from './vinted-browser-challenge.ts';

export type VintedVerificationResult =
  'submitted' | 'interaction_required' | 'form_unavailable' | 'submission_unconfirmed';

/** Sendet einen ausdrücklich eingegebenen Code nur an Vinteds feste Bestätigungsseite. */
export async function submitVintedVerificationCode(
  page: Page,
  code: string,
  authorize: () => Promise<void>,
): Promise<VintedVerificationResult> {
  const isVerificationPage = () => {
    try {
      const url = new URL(page.url());
      return url.origin === 'https://www.vinted.de' && url.pathname === '/member/login/2fa';
    } catch {
      return false;
    }
  };
  if (!/^[0-9]{4,8}$/.test(code)) return 'form_unavailable';
  let submissionStarted = false;
  try {
    await authorize();
    if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
    if (!isVerificationPage()) return 'form_unavailable';
    const codeSelector =
      'input[autocomplete="one-time-code"], input[name*="code" i], input[inputmode="numeric"]';
    const candidates = page.locator(codeSelector);
    const count = await candidates.count();
    if (count !== 1 && count !== code.length) return 'form_unavailable';
    const form = candidates.first().locator('xpath=ancestor::form[1]');
    if ((await form.count()) !== 1 || (await form.locator(codeSelector).count()) !== count)
      return 'form_unavailable';
    const submit = form.locator('button[type="submit"], input[type="submit"]');
    if ((await submit.count()) !== 1 || !(await submit.isVisible())) return 'form_unavailable';
    for (let index = 0; index < count; index++) {
      const input = candidates.nth(index);
      if (!(await input.isVisible())) return 'form_unavailable';
      await authorize();
      if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
      if (!isVerificationPage()) return 'form_unavailable';
      await input.fill(count === 1 ? code : code[index]!, { timeout: 5_000 });
    }
    if (!(await submit.isEnabled())) return 'form_unavailable';
    await authorize();
    if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
    if (!isVerificationPage()) return 'form_unavailable';
    submissionStarted = true;
    await submit.click({ timeout: 5_000 });
    if (await hasVisibleVintedChallenge(page)) return 'interaction_required';
    return 'submitted';
  } catch {
    if (await hasVisibleVintedChallenge(page).catch(() => false)) return 'interaction_required';
    // Nach einem unklaren Klick wird der Code niemals automatisch erneut gesendet.
    return submissionStarted ? 'submission_unconfirmed' : 'form_unavailable';
  }
}
