import type { Page } from 'playwright';
import { vintedListingFormSelector } from './vinted-listing-contracts.ts';

/**
 * Zusatzmerkmale einer Kategorie im Inseratinhalt (`attributes`): Auswahlfelder als `<code>` mit
 * Vinteds Kennungen (z. B. `skirt_length: "392"`), freie Felder als `text_<name>`
 * (z. B. `text_shoulder_width: "45"`). Die Zielgruppe führt das Formular als eigenes Feld.
 */
export function vintedListingExtraAttributes(attributes: Readonly<Record<string, string>>): {
  readonly choices: Record<string, number[]>;
  readonly texts: Record<string, string>;
} {
  const choices: Record<string, number[]> = {};
  const texts: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const text = /^text_([a-z][a-z0-9_]{0,39})$/.exec(key);
    if (text) texts[text[1]!] = value;
    else if (
      /^[a-z][a-z0-9_]{0,39}$/.test(key) &&
      !key.endsWith('_label') &&
      key !== 'accessory_department'
    )
      choices[key] = value.split(',').map(Number);
  }
  return { choices, texts };
}

const sameIds = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

/**
 * Setzt geänderte Zusatzmerkmale in der geöffneten Maske. Auswahlfelder sind wie „Zustand“ gebaut
 * (`input#<code>`, Optionen `<code>-<id>`, am 06.11.2026 bei „Rocklänge“ beobachtet), Maße und ISBN
 * sind Textfelder (`input#shoulder_width`, `input#height`, `input#isbn`).
 */
export async function fillVintedListingExtras(
  page: Page,
  wanted: Readonly<Record<string, string>>,
  previous: Readonly<Record<string, string>>,
  check: () => Promise<void>,
): Promise<void> {
  const target = vintedListingExtraAttributes(wanted);
  const before = vintedListingExtraAttributes(previous);
  for (const [code, ids] of Object.entries(target.choices)) {
    if (sameIds(ids, before.choices[code] ?? [])) continue;
    await check();
    const control = page.locator(`${vintedListingFormSelector} input#${code}`);
    if ((await control.count()) !== 1) throw new Error(`Das Vinted-Feld ${code} fehlt.`);
    await control.scrollIntoViewIfNeeded({ timeout: 5000 });
    await control.click({ timeout: 5000 });
    const options = page.locator(
      `[role="radio"][id^="${code}-"],[role="checkbox"][id^="${code}-"]`,
    );
    try {
      await options.filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 5000 });
      for (const option of await options.all()) {
        const match = new RegExp(`^${code}-([1-9][0-9]*)$`).exec(
          (await option.getAttribute('id')) ?? '',
        );
        if (!match) continue;
        const id = Number(match[1]);
        const checked = (await option.getAttribute('aria-checked')) === 'true';
        // Bei Einfachauswahl wechselt der Klick auf die gewünschte Option; abgewählt wird nur
        // bei Mehrfachauswahl.
        const single = (await option.getAttribute('role')) === 'radio';
        if (single ? ids.includes(id) && !checked : checked !== ids.includes(id)) {
          await check();
          await option.click({ timeout: 5000 });
        }
      }
      for (const id of ids) {
        const option = page.locator(`[id="${code}-${id}"]`);
        if ((await option.count()) !== 1 || (await option.getAttribute('aria-checked')) !== 'true')
          throw new Error(`Die Auswahl für ${code} ist bei Vinted nicht verfügbar.`);
      }
    } finally {
      // Einfachauswahlen schließen sich selbst; ein offenes Auswahlfenster wird geschlossen.
      if (await options.filter({ visible: true }).count()) await page.keyboard.press('Escape');
    }
  }
  for (const [name, value] of Object.entries(target.texts)) {
    if (before.texts[name] === value) continue;
    await check();
    const input = page.locator(`${vintedListingFormSelector} input#${name}`);
    if ((await input.count()) !== 1) throw new Error(`Das Vinted-Feld ${name} fehlt.`);
    await input.fill(value, { timeout: 5000 });
    await input.blur();
    if ((await input.inputValue()).trim() !== value.trim())
      throw new Error(`Das Vinted-Feld ${name} hat den Wert nicht übernommen.`);
  }
}
