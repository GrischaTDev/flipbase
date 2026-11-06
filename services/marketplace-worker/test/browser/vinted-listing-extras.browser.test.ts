import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import {
  fillVintedListingExtras,
  vintedListingExtraAttributes,
} from '../../src/vinted-browser-listing-extras.ts';

// Aufbau wie am 06.11.2026 bei „Rocklänge“ und „Maße (empfohlen)“ beobachtet.
const form = `<main id="content">
  <input id="skirt_length" data-testid="category-skirt_length-single-list-input" readonly>
  <div id="skirt_length-options" hidden>
    ${[
      [392, 'Mini'],
      [649, 'Knielänge'],
      [391, 'Midi'],
    ]
      .map(
        ([id, label]) =>
          `<div role="radio" id="skirt_length-${id}" aria-checked="${id === 649}">${label}</div>`,
      )
      .join('')}
  </div>
  <input id="shoulder_width" name="shoulder_width" data-testid="measurement-width--input" type="text">
</main>
<script>
  let clicks = 0;
  const options = document.querySelector('#skirt_length-options');
  document.querySelector('#skirt_length').onclick = () => { options.hidden = false; };
  options.querySelectorAll('[role=radio]').forEach((radio) => radio.onclick = () => {
    clicks++;
    options.querySelectorAll('[role=radio]').forEach((other) => other.setAttribute('aria-checked', String(other === radio)));
    document.querySelector('#skirt_length').value = radio.textContent;
    options.hidden = true;
  });
  window.radioClicks = () => clicks;
</script>`;

test('liest Zusatzmerkmale aus dem Inseratinhalt getrennt nach Auswahl und Text', () => {
  assert.deepEqual(
    vintedListingExtraAttributes({
      accessory_department: '576',
      accessory_department_label: 'Damen',
      skirt_length: '392',
      computer_ram: '3445,3446',
      text_shoulder_width: '45',
    }),
    {
      choices: { skirt_length: [392], computer_ram: [3445, 3446] },
      texts: { shoulder_width: '45' },
    },
  );
});

test('setzt nur geänderte Zusatzmerkmale und prüft die Übernahme', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(form);
    let checks = 0;
    const check = async () => {
      checks++;
    };
    await fillVintedListingExtras(
      page,
      { skirt_length: '392', text_shoulder_width: '45' },
      { skirt_length: '649' },
      check,
    );
    assert.equal(await page.getAttribute('#skirt_length-392', 'aria-checked'), 'true');
    assert.equal(await page.getAttribute('#skirt_length-649', 'aria-checked'), 'false');
    assert.equal(await page.inputValue('#shoulder_width'), '45');
    assert.equal(
      await page.evaluate(() => (window as unknown as { radioClicks(): number }).radioClicks()),
      1,
    );
    assert.ok(checks >= 2);
    // Unveränderte Angaben öffnen keine Auswahl.
    await fillVintedListingExtras(
      page,
      { skirt_length: '392', text_shoulder_width: '45' },
      { skirt_length: '392', text_shoulder_width: '45' },
      check,
    );
    assert.equal(
      await page.evaluate(() => (window as unknown as { radioClicks(): number }).radioClicks()),
      1,
    );
    await assert.rejects(
      fillVintedListingExtras(page, { skirt_length: '999' }, {}, check),
      /nicht verfügbar/,
    );
    await assert.rejects(
      fillVintedListingExtras(page, { video_game_platform: '1259' }, {}, check),
      /fehlt/,
    );
  } finally {
    await browser.close();
  }
});
