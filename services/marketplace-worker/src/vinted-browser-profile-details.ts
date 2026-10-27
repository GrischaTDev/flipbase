import type { Page } from 'playwright';
import type {
  VintedProfileChanges,
  VintedProfileDetails,
  VintedProfileOption,
  VintedProfileSaveResult,
} from '../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts';
import { openVintedProfile } from './vinted-browser-profile-edit.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';
import {
  parseVintedProfileChanges,
  parseVintedProfileDetails,
  parseVintedProfileOptions,
} from './vinted-profile-contracts.ts';

export async function readVintedProfileDetails(
  page: Page,
  accountId: string,
): Promise<VintedProfileDetails> {
  await openVintedProfile(page, accountId);
  await page.locator('#language option').first().waitFor({ state: 'attached', timeout: 15000 });
  return parseVintedProfileDetails(
    await page.evaluate(() => {
      function input(id: string): HTMLInputElement {
        const element = document.getElementById(id);
        if (!(element instanceof HTMLInputElement)) throw new Error('Profilfeld fehlt');
        return element;
      }
      const about = document.querySelector('textarea[name="about"]');
      const language = document.getElementById('language');
      if (!(about instanceof HTMLTextAreaElement) || !(language instanceof HTMLSelectElement))
        throw new Error('Profilformular fehlt');
      const photo = document.querySelector('[data-testid="profile-settings-photo--img"]');
      const upload = document.querySelector('[data-testid="profile-photo-input"]');
      return {
        about: about.value,
        city: input('city-select').value,
        country: input('country-select').value,
        showCity: input('city-visibility-toggle').checked,
        language: language.value,
        languages: Array.from(language.options).map((option) => ({
          id: option.value,
          label: option.label,
        })),
        imageUrl: photo instanceof HTMLImageElement ? photo.src : null,
        canUploadPhoto:
          upload instanceof HTMLInputElement && upload.type === 'file' && !upload.disabled,
      };
    }),
  );
}

export async function readVintedProfileCities(
  page: Page,
  accountId: string,
  query: string,
): Promise<VintedProfileOption[]> {
  if (query.trim().length < 2 || query.length > 80) throw new Error('Ungültige Stadtsuche');
  await openVintedProfile(page, accountId);
  const city = page.locator('#city-select');
  await city.fill(query.trim());
  const options = city.locator('..').locator('[role="button"]');
  const expression = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  try {
    await options
      .filter({ hasText: expression })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return [];
  }
  return parseVintedProfileOptions(
    await options.evaluateAll(
      (elements, search) =>
        elements
          .filter((element) =>
            (element.textContent ?? '')
              .toLocaleLowerCase('de')
              .includes(search.toLocaleLowerCase('de')),
          )
          .slice(0, 100)
          .map((element) => ({ id: element.id, label: element.textContent?.trim() ?? '' })),
      query.trim(),
    ),
    true,
  );
}

function sameProfile(current: VintedProfileDetails, expected: VintedProfileDetails): boolean {
  return (
    current.about === expected.about &&
    current.city === expected.city &&
    current.showCity === expected.showCity &&
    current.language === expected.language &&
    current.imageUrl === expected.imageUrl &&
    current.country === expected.country
  );
}

export async function updateVintedProfileDetails(
  page: Page,
  accountId: string,
  input: VintedProfileChanges,
  baseline: VintedProfileDetails,
  authorize: () => Promise<void>,
  confirmationTimeoutMs = 20000,
): Promise<VintedProfileSaveResult> {
  const changes = parseVintedProfileChanges(input),
    expected = parseVintedProfileDetails(baseline);
  const current = await readVintedProfileDetails(page, accountId);
  if (!sameProfile(current, expected)) return { status: 'conflict' };
  if (!current.languages.some((language) => language.id === changes.language))
    throw new Error('Sprache nicht verfügbar');
  if (changes.city !== current.city) {
    if (!changes.cityId) throw new Error('Wähle eine Stadt aus der Liste');
    await page.locator('#city-select').fill(changes.city);
    const option = page
      .locator('#city-select')
      .locator('..')
      .locator(`[role="button"][id="${changes.cityId}"]`);
    await option.waitFor({ state: 'visible', timeout: 10000 });
    if ((await option.textContent())?.trim() !== changes.city)
      throw new Error('Stadt stimmt nicht überein');
    await option.click();
    if ((await page.locator('#city-select').inputValue()) !== changes.city)
      throw new Error('Stadt nicht übernommen');
  }
  await page.locator('textarea[name="about"]').fill(changes.about);
  await page.locator('#city-visibility-toggle').setChecked(changes.showCity);
  await page.locator('#language').selectOption(changes.language);
  if (changes.photo) {
    if (!current.canUploadPhoto) throw new Error('Profilbild nicht bearbeitbar');
    await authorize();
    await page.getByTestId('profile-photo-input').setInputFiles({
      name: 'profile.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(changes.photo.base64, 'base64'),
    });
    await page.waitForFunction(
      (previous) => {
        const image = document.querySelector('[data-testid="profile-settings-photo--img"]');
        return (
          image instanceof HTMLImageElement &&
          image.src !== previous &&
          image.src.startsWith('https://images')
        );
      },
      current.imageUrl,
      { timeout: 15000 },
    );
  }
  const save = page.getByTestId('profile-settings--save-button');
  if (!(await save.isVisible()) || !(await save.isEnabled()))
    throw new Error('Profilspeichern nicht verfügbar');
  await authorize();
  try {
    await save.click({ timeout: 10000 });
  } catch {
    return { status: 'unconfirmed' };
  }
  let confirmed: VintedProfileDetails | undefined;
  const status = await confirmVintedEdit(
    () => readVintedProfileDetails(page, accountId),
    (saved) => {
      if (
        saved.about !== changes.about ||
        saved.city !== changes.city ||
        saved.showCity !== changes.showCity ||
        saved.language !== changes.language ||
        (changes.photo && (!saved.imageUrl || saved.imageUrl === current.imageUrl))
      )
        return false;
      confirmed = saved;
      return true;
    },
    confirmationTimeoutMs,
  );
  return status === 'confirmed' && confirmed
    ? { status, profile: confirmed }
    : { status: 'unconfirmed' };
}
