import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import {
  readVintedProfileDetails,
  readVintedProfileCities,
  updateVintedProfileDetails,
} from '../../src/vinted-browser-profile-details.ts';

async function profileFixture(
  page: Page,
  options: { foreign?: boolean; ignoreSave?: boolean } = {},
) {
  let state = {
    about: 'Mein Shop',
    city: 'Berlin',
    showCity: true,
    language: 'de-DE',
    imageUrl: 'https://images1.vinted.net/t/original/50x50/photo.jpeg',
  };
  let saves = 0;
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v2/users/current')
      return route.fulfill({
        json: { user: { id: options.foreign ? '456' : '123', login: 'fixture' } },
      });
    if (path === '/fixture-save') {
      saves++;
      if (!options.ignoreSave) state = route.request().postDataJSON();
      return route.fulfill({ json: {} });
    }
    if (path !== '/settings/profile' && path !== '/') return route.fulfill({ status: 404 });
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="de"><body>
      <textarea name="about" id="about"></textarea><input id="country-select" value="Deutschland" readonly>
      <div><input id="city-select"><div role="button" id="796">Hamburg</div></div>
      <input type="checkbox" id="city-visibility-toggle" role="switch">
      <select id="language"><option value="de-DE">Deutsch (German)</option><option value="en-DE">English (English)</option></select>
      <img data-testid="profile-settings-photo--img"><input type="file" data-testid="profile-photo-input">
      <button data-testid="profile-settings--save-button">Profil aktualisieren</button><script>
      const initial = ${JSON.stringify(state)};
      const byId = id => document.getElementById(id);
      byId('about').value = initial.about; byId('city-select').value = initial.city;
      byId('city-visibility-toggle').checked = initial.showCity; byId('language').value = initial.language;
      const image = document.querySelector('img'); image.src = initial.imageUrl;
      byId('796').onclick = () => { byId('city-select').value = 'Hamburg'; };
      document.querySelector('input[type=file]').onchange = () => { image.src = 'https://images1.vinted.net/t/new/f800/photo.jpeg'; };
      document.querySelector('button').onclick = async () => { await fetch('/fixture-save', {method:'POST', body: JSON.stringify({
        about:byId('about').value, city:byId('city-select').value, showCity:byId('city-visibility-toggle').checked,
        language:byId('language').value, imageUrl:image.src
      })}); };
      </script></body></html>`,
    });
  });
  await page.goto('https://www.vinted.de/');
  return { saves: () => saves, state: () => state };
}

test('liest echte Formularrollen und speichert Profilfelder mit bestätigtem Bild genau einmal', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fixture = await profileFixture(page);
    const original = await readVintedProfileDetails(page, '123');
    assert.equal(original.country, 'Deutschland');
    assert.deepEqual(await readVintedProfileCities(page, '123', 'Hamburg'), [
      { id: '796', label: 'Hamburg' },
    ]);
    let authorizations = 0;
    const result = await updateVintedProfileDetails(
      page,
      '123',
      {
        about: 'Neuer Text',
        city: 'Hamburg',
        cityId: '796',
        showCity: false,
        language: 'de-DE',
        photo: {
          mimeType: 'image/jpeg',
          base64: Buffer.from([255, 216, 255, 217]).toString('base64'),
        },
      },
      original,
      async () => {
        authorizations++;
      },
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(fixture.saves(), 1);
    assert.ok(authorizations >= 1);
    assert.equal(fixture.state().city, 'Hamburg');
    assert.equal(fixture.state().showCity, false);
    assert.equal(fixture.state().imageUrl, 'https://images1.vinted.net/t/new/f800/photo.jpeg');
  } finally {
    await browser.close();
  }
});

test('verhindert Überschreiben nach Fremdänderung sowie Schreiben in ein fremdes Konto', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fixture = await profileFixture(page);
    const original = await readVintedProfileDetails(page, '123');
    const changes = {
      about: original.about,
      city: original.city,
      showCity: original.showCity,
      language: original.language,
    };
    assert.deepEqual(
      await updateVintedProfileDetails(
        page,
        '123',
        changes,
        { ...original, city: 'München' },
        async () => {
          throw new Error('Nicht autorisieren');
        },
      ),
      { status: 'conflict' },
    );
    assert.equal(fixture.saves(), 0);
    await assert.rejects(readVintedProfileDetails(page, '456'));
    assert.equal(fixture.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('bestätigt ignoriertes Speichern nicht und klickt kein zweites Mal', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fixture = await profileFixture(page, { ignoreSave: true });
    const original = await readVintedProfileDetails(page, '123');
    const result = await updateVintedProfileDetails(
      page,
      '123',
      {
        about: 'Neu',
        city: original.city,
        showCity: original.showCity,
        language: original.language,
      },
      original,
      async () => undefined,
      100,
    );
    assert.equal(result.status, 'unconfirmed');
    assert.equal(fixture.saves(), 1);
  } finally {
    await browser.close();
  }
});
