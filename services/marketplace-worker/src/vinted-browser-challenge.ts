import type { Page } from 'playwright';

/** Nur sichtbare Prüfungen zählen; normale Schutzskripte sind kein Eingabezustand. */
export function detectVisibleVintedChallenge(): boolean {
  const isVisible = (element: Element): boolean => {
    const rectangle = element.getBoundingClientRect();
    if (
      rectangle.width <= 0 ||
      rectangle.height <= 0 ||
      rectangle.bottom <= 0 ||
      rectangle.right <= 0 ||
      rectangle.top >= innerHeight ||
      rectangle.left >= innerWidth
    )
      return false;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
        return false;
    }
    return true;
  };
  for (const iframe of Array.from(document.querySelectorAll('iframe')).slice(0, 32)) {
    if (!isVisible(iframe)) continue;
    try {
      const source = new URL(iframe.src, location.href);
      const host = source.hostname;
      if (
        host === 'captcha-delivery.com' ||
        host.endsWith('.captcha-delivery.com') ||
        ((host === 'google.com' || host.endsWith('.google.com') || host === 'www.recaptcha.net') &&
          source.pathname.startsWith('/recaptcha/')) ||
        ((host === 'hcaptcha.com' || host.endsWith('.hcaptcha.com')) &&
          /captcha/i.test(source.pathname)) ||
        ((host === 'geetest.com' || host.endsWith('.geetest.com')) &&
          /captcha|challenge/i.test(source.pathname))
      )
        return true;
    } catch {
      // Eine ungültige Frame-Adresse ist kein Nachweis für eine Prüfung.
    }
  }
  const humanCheck =
    /(?:bist du|sind sie) ein mensch|(?:bestätige|bestätigen sie|überprüfe|überprüfen sie).{0,80}(?:mensch|kein roboter)|ich bin kein roboter|are you (?:a )?human|verify (?:that )?you(?:'re| are) (?:a )?human|i(?:'m| am) not a robot|slide.{0,60}(?:verify|puzzle)|(?:schiebe|ziehe).{0,80}(?:regler|schieberegler|puzzle)/i;
  const messages = document.querySelectorAll(
    'h1, h2, h3, p, label, button, [role="alert"], [role="dialog"], [role="slider"], [aria-label]',
  );
  for (const element of Array.from(messages).slice(0, 200)) {
    if (!isVisible(element)) continue;
    const text = element instanceof HTMLElement ? element.innerText : '';
    if (
      humanCheck.test(text.slice(0, 2000)) ||
      humanCheck.test(element.getAttribute('aria-label') ?? '')
    )
      return true;
  }
  return false;
}

export async function hasVisibleVintedChallenge(page: Pick<Page, 'evaluate'>): Promise<boolean> {
  return (await page.evaluate(detectVisibleVintedChallenge)) === true;
}
