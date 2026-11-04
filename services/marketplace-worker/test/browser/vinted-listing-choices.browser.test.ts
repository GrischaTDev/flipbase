import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import {
  vintedListingFormSelector,
  collectVintedListingChoices,
  parseVintedListingChoices,
  collectVintedListingFormMetadata,
} from '../../src/vinted-listing-contracts.ts';
import {
  vintedListingFormControl,
  vintedListingControlValue,
} from '../../src/vinted-listing-form-controls.ts';
import {
  readVintedListingChoices,
  readVintedListingCategoryFields,
  openVintedListingChoices,
} from '../../src/vinted-browser-listing-form.ts';
import { VintedListingReadError } from '../../src/vinted-listing-read-error.ts';
import { createVintedListingFormFixture } from '../fixtures/vinted-listing-form.ts';

test('bound modern choice buttons expose their labels while companion inputs carry provider ids', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fields = {
      category: 'catalog-select-dropdown-input',
      brand: 'brand-select-dropdown-input',
      size: 'category-size-single-grid-input',
      condition: 'category-condition-single-list-input',
      color: 'color-select-dropdown-input',
      material: 'category-material-multi-list-input',
    } as const;
    const markup = `<main id="content"><input id="_r_title_" name="title"><textarea id="_r_description_" name="description"></textarea><input id="_r_price_" name="price">${Object.entries(
      fields,
    )
      .map(
        ([field, testId], index) =>
          `<div><label for="_r_${index}_">Feld</label><button type="button" id="_r_${index}_" data-testid="${testId}">Gewählte Auswahl</button><input name="${field}" value="12345"></div>`,
      )
      .join('')}</main>`;
    await page.setContent(markup);
    for (const field of Object.keys(fields) as (keyof typeof fields)[])
      assert.equal(await vintedListingControlValue(page, field), 'Gewählte Auswahl');
    const metadata = await page.evaluate(collectVintedListingFormMetadata);
    assert.deepEqual(metadata.presentFields, ['brand', 'size', 'condition', 'color', 'material']);
    assert.deepEqual(metadata.unknownFields, []);
    for (const mutation of ['unbound', 'multiple', 'wrong-tag', 'duplicate-id'] as const) {
      await page.setContent(markup);
      await page.evaluate((change) => {
        const button = document.querySelector('[data-testid="catalog-select-dropdown-input"]')!;
        if (change === 'unbound') document.querySelector('label')!.removeAttribute('for');
        if (change === 'multiple') button.after(button.cloneNode(true));
        if (change === 'wrong-tag')
          button.outerHTML =
            '<div id="_r_0_" data-testid="catalog-select-dropdown-input">Auswahl</div>';
        if (change === 'duplicate-id')
          button.insertAdjacentHTML('afterend', '<span id="_r_0_">Andere Bindung</span>');
      }, mutation);
      await assert.rejects(vintedListingFormControl(page, 'category'), /nicht eindeutig/);
    }
    await page.setContent(
      markup +
        '<button type="button" data-testid="unknown-select-dropdown-input">Unbekannt</button>',
    );
    // Ein unbekanntes Feld im Formular darf nicht als sicherer Standard verschwinden.
    await page.evaluate(() =>
      document
        .querySelector('#content')!
        .append(document.querySelector('[data-testid="unknown-select-dropdown-input"]')!),
    );
    assert.deepEqual((await page.evaluate(collectVintedListingFormMetadata)).unknownFields, [
      'unknown-select-dropdown-input',
    ]);
    await page.setContent(
      '<main id="content"><input name="title"><textarea name="description"></textarea><input name="color" value="3"></main>',
    );
    assert.deepEqual((await page.evaluate(collectVintedListingFormMetadata)).unknownFields, [
      'color',
    ]);
  } finally {
    await browser.close();
  }
});

test('a button with only the old input id is not a recognized modern control', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<main id="content"><label for="category">Kategorie</label><button type="button" id="category">Falsche Auswahl</button></main>',
    );
    await assert.rejects(vintedListingControlValue(page, 'category'), /nicht eindeutig/);
  } finally {
    await browser.close();
  }
});

test('a required modern control retains the bounded wait for an asynchronously attached field', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<main id="content"></main><script>setTimeout(() => document.querySelector("#content").innerHTML = `<label for="_r_delayed_">Kategorie</label><button type="button" id="_r_delayed_" data-testid="catalog-select-dropdown-input">Gewählte Kategorie</button>`, 150);</script>',
    );
    assert.equal(await vintedListingControlValue(page, 'category'), 'Gewählte Kategorie');
  } finally {
    await browser.close();
  }
});

test('a failed popup cleanup preserves the original closed-page opening error', async (t) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingFormFixture(page);
    const locate = page.locator.bind(page);
    t.mock.method(page, 'locator', (...args: Parameters<typeof page.locator>) => {
      const locator = locate(...args);
      if (args[0] === vintedListingFormSelector + ' input#category') {
        const click = locator.click.bind(locator);
        t.mock.method(locator, 'click', async (...clickArgs: Parameters<typeof locator.click>) => {
          await page.close();
          return click(...clickArgs);
        });
      }
      return locator;
    });
    await assert.rejects(
      readVintedListingChoices(page, '123', null, 'category', [], {
        allowRememberedCategory: true,
      }),
      (error) => error instanceof VintedListingReadError && error.step === 'category_open_closed',
    );
    assert.equal(page.isClosed(), true);
    assert.equal(form.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('popup cleanup preserves revoked authority and still rejects cleanup after a successful read', async () => {
  const browser = await chromium.launch();
  try {
    for (const originalFailure of [true, false]) {
      const page = await browser.newPage();
      const form = await createVintedListingFormFixture(page, { modernControls: true });
      const revoked = new VintedListingReadError('authorize');
      let checks = 0;
      await assert.rejects(
        readVintedListingCategoryFields(page, '123', 1223, [5], {
          readCategoryId: async () => 1223,
          authorize: async () => {
            checks++;
            if (checks === (originalFailure ? 3 : 4)) {
              await page.close();
              if (originalFailure) throw revoked;
            }
          },
        }),
        (error) =>
          originalFailure
            ? error === revoked
            : error instanceof VintedListingReadError && error.step === 'brand_close',
      );
      assert.equal(checks, originalFailure ? 3 : 4);
      assert.equal(page.isClosed(), true);
      assert.equal(form.writes(), 0);
    }
  } finally {
    await browser.close();
  }
});

test('waits for collector-visible popup options through an opacity transition', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const field of ['size', 'condition', 'color', 'material', 'category', 'brand'] as const) {
      const role = ['size', 'color', 'material'].includes(field) ? 'checkbox' : 'radio';
      const identifier =
        field === 'size'
          ? 'data-testid="size-group-14-grid-option-208"'
          : `id="${field === 'category' ? 'catalog' : field}-2"`;
      await page.setContent(`<input id="${field}">
        <div id="options" style="opacity:0"><div role="${role}" ${identifier} aria-checked="true">Auswahl</div></div>
        <script>document.querySelector('#${field}').onclick = () => setTimeout(() => document.querySelector('#options').style.opacity = '1', 200);</script>`);
      assert.equal(await page.locator(`[role="${role}"]`).isVisible(), true);
      assert.deepEqual(await page.evaluate(collectVintedListingChoices, field), []);
      const result = await openVintedListingChoices(page, field);
      assert.equal(result.choices.length, 1);
      assert.equal(result.choices[0]?.selected, true);
    }
  } finally {
    await browser.close();
  }
});

test('still refuses popup options that remain transparent for the existing options budget', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<input id="size"><div style="opacity:0"><div role="checkbox" data-testid="size-group-14-grid-option-208" aria-checked="true">M</div></div>',
    );
    assert.equal(await page.getByRole('checkbox').isVisible(), true);
    await assert.rejects(
      openVintedListingChoices(page, 'size'),
      (error) => error instanceof VintedListingReadError && error.step === 'size_parse',
    );
  } finally {
    await browser.close();
  }
});

test('does not wait for an invalid nonempty popup response to become valid', async (t) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<input id="size"><div role="checkbox" data-testid="size-group-14-grid-option-208">M</div>',
    );
    const collected = await page.evaluate(collectVintedListingChoices, 'size' as const);
    assert.ok(Array.isArray(collected));
    assert.equal(collected.length, 1);
    assert.equal(collected[0]?.selected, null);
    let waits = 0;
    t.mock.method(page, 'waitForTimeout', async () => {
      waits++;
    });
    await assert.rejects(
      openVintedListingChoices(page, 'size'),
      (error) => error instanceof VintedListingReadError && error.step === 'size_parse',
    );
    assert.equal(waits, 0);
  } finally {
    await browser.close();
  }
});

test('keeps an empty brand search start and waits for the requested result to become collector-visible', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<input id="brand"><input id="brand-search-input" data-testid="brand-search--input">
      <script>document.querySelector('#brand-search-input').oninput = () => {
        const option = document.createElement('div'); option.id = 'brand-53'; option.setAttribute('role', 'radio'); option.setAttribute('aria-checked', 'true'); option.textContent = 'Nike'; option.style.opacity = '0'; document.body.append(option);
        setTimeout(() => option.style.opacity = '1', 200);
      };</script>`);
    const result = await openVintedListingChoices(page, 'brand', [], {
      brand: { brandId: 53, brandLabel: 'Nike' },
    });
    assert.equal(result.choices[0]?.id, 53);
    assert.equal(result.choices[0]?.selected, true);
  } finally {
    await browser.close();
  }
});

test('identifies opening, missing options and invalid values for every ordinary choice', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const field of ['size', 'condition', 'color', 'material'] as const) {
      for (const phase of ['open', 'options', 'parse'] as const) {
        const role = field === 'condition' ? 'radio' : 'checkbox';
        const id =
          field === 'size' ? 'data-testid="size-group-14-grid-option-208"' : `id="${field}-2"`;
        await page.setContent(
          `<input id="${field}"${phase === 'open' ? ' disabled' : ''}>${phase === 'parse' ? `<div role="${role}" ${id}>Auswahl</div>` : ''}`,
        );
        await assert.rejects(
          openVintedListingChoices(page, field),
          (error: unknown) =>
            error instanceof VintedListingReadError &&
            error.step === `${field}_${phase === 'open' ? 'open_disabled' : phase}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
});

test('classifies failed field opening without leaking page contents or retrying the click', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [reason, markup] of [
      ['missing', '<div>private@example.invalid</div>'],
      ['multiple', '<input id="size"><input id="size">'],
      ['hidden', '<input id="size" hidden>'],
      [
        'covered',
        '<input id="size"><div style="position:fixed;inset:0;z-index:99">private@example.invalid</div>',
      ],
    ] as const) {
      const page = await browser.newPage();
      await page.setContent(markup);
      await assert.rejects(openVintedListingChoices(page, 'size'), (error: unknown) => {
        assert.ok(error instanceof VintedListingReadError);
        assert.equal(error.step, `size_open_${reason}`);
        assert.equal(error.message, 'Das Vinted-Inserat konnte nicht gelesen werden.');
        assert.equal(error.cause, undefined);
        assert.equal(JSON.stringify(error).includes('private'), false);
        return true;
      });
      await page.close();
    }
    const closed = await browser.newPage();
    await closed.close();
    await assert.rejects(
      openVintedListingChoices(closed, 'size'),
      (error: unknown) =>
        error instanceof VintedListingReadError && error.step === 'size_open_closed',
    );
  } finally {
    await browser.close();
  }
});

test('distinguishes missing package choices, empty labels and invalid options', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [phase, markup] of [
      ['options', '<label hidden><input id="package_type_selector_2" type="radio"></label>'],
      ['label', '<label><input id="package_type_selector_2" type="radio"></label>'],
      [
        'parse',
        '<label>Mittel<input id="package_type_selector_2" type="radio" checked></label><label>Groß<input id="package_type_selector_3" type="radio" checked></label>',
      ],
    ] as const) {
      await page.setContent(markup);
      await assert.rejects(
        openVintedListingChoices(page, 'package'),
        (error: unknown) =>
          error instanceof VintedListingReadError && error.step === `package_${phase}`,
      );
    }
  } finally {
    await browser.close();
  }
});

test('identifies the exact failing brand phase without exposing native errors', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [phase, duplicateSearch] of [
      ['open', false],
      ['options', false],
      ['parse', false],
      ['search', false],
      ['search', true],
    ] as const) {
      await page.setContent(`<div id="content"><input id="brand" ${phase === 'open' ? 'disabled' : ''}>
        ${phase === 'options' || phase === 'parse' ? '<input id="brand-search-input" data-testid="brand-search--input">' : ''}
        ${duplicateSearch ? '<input id="brand-search-input" data-testid="brand-search--input"><input id="brand-search-input" data-testid="brand-search--input">' : ''}
        ${phase === 'parse' ? '<div role="radio" id="brand-14">adidas</div>' : phase === 'search' ? '<div role="radio" id="brand-14" aria-checked="false">adidas</div>' : ''}</div>`);
      await assert.rejects(
        openVintedListingChoices(
          page,
          'brand',
          [],
          phase === 'options' ? {} : { brand: { brandId: 53, brandLabel: 'Nike' } },
        ),
        (error: unknown) =>
          error instanceof VintedListingReadError &&
          error.step === `brand_${phase === 'open' ? 'open_disabled' : phase}`,
      );
      for (const searchInput of await page.locator('#brand-search-input').all())
        assert.equal(await searchInput.inputValue(), '');
    }
  } finally {
    await browser.close();
  }
});

test('color grids require agreeing color evidence and ignore unrelated or hidden grids', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="checkbox" data-testid="filter-grid-option-3" aria-label="Grau" aria-checked="true" aria-disabled="true"><div data-testid="color-3">Grau</div></div>
      <div role="checkbox" id="color-7" aria-label="Rot" aria-checked="false">Rot</div>
      <div role="checkbox" data-testid="filter-grid-option-99" aria-label="Keine Farbe" aria-checked="true">Andere Auswahl</div>
      <div hidden><div role="checkbox" data-testid="filter-grid-option-12" aria-checked="true"><div data-testid="color-20">Veraltet</div></div></div>`);
    assert.deepEqual(
      parseVintedListingChoices(
        'color',
        await page.evaluate(collectVintedListingChoices, 'color' as const),
      ).choices,
      [
        { id: 3, label: 'Grau', selected: true, disabled: true, sizeGroupId: null },
        { id: 7, label: 'Rot', selected: false, disabled: false, sizeGroupId: null },
      ],
    );
    for (const evidence of [
      '<div data-testid="color-7">Rot</div>',
      '<div data-testid="color-3">Grau</div><div data-testid="color-7">Rot</div>',
    ]) {
      await page.setContent(
        `<div role="checkbox" data-testid="filter-grid-option-3" aria-label="Grau" aria-checked="false">${evidence}</div>`,
      );
      await assert.rejects(
        page.evaluate(collectVintedListingChoices, 'color' as const),
        /Farbauswahl nicht eindeutig/,
      );
    }
    await page.setContent(
      '<div role="checkbox" id="color-7" data-testid="filter-grid-option-3" aria-label="Grau" aria-checked="false"><div data-testid="color-3">Grau</div></div>',
    );
    await assert.rejects(
      page.evaluate(collectVintedListingChoices, 'color' as const),
      /Farbauswahl nicht eindeutig/,
    );
  } finally {
    await browser.close();
  }
});

test('reads actual popup choices and retains the category binding without saving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let writes = 0;
    await page.route('**/*', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') writes++;
      if (new URL(request.url()).pathname === '/api/v2/users/current')
        return route.fulfill({ json: { user: { id: 789, login: 'fixture' } } });
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="content"><input name="photos" type="file" multiple accept="image/jpeg,image/gif,image/png,image/webp"><input name="title"><textarea name="description"></textarea>
        <input readonly id="category"><input readonly id="size"><input readonly id="condition"><input id="isbn"><div style="opacity:0"><input id="book_series"></div>
        <div id="category-options" hidden>
          <button id="catalog-5">Herren</button>
          <div id="category-leaves" hidden><div role="radio" id="catalog-1223" aria-checked="true"><div class="web_ui__Cell__title">Bomberjacken</div><label><input id="1223-catalog-radio" aria-hidden="true" type="radio" checked></label></div></div>
        </div>
        <div id="size-options" hidden>
          <div role="checkbox" data-testid="size-group-14-grid-option-208" aria-label="M" aria-checked="true">M</div>
          <div role="checkbox" data-testid="size-group-14-grid-option-209" aria-label="L" aria-checked="false">L</div>
        </div>
        <div hidden><div role="checkbox" data-testid="size-group-31-grid-option-607" aria-label="38">38</div></div>
        <div id="condition-options" hidden><div role="radio" id="condition-2" aria-checked="true"><div data-testid="condition-2--title">Sehr gut</div></div></div></div>
        <script>
          document.querySelector('#category').onclick = () => { document.querySelector('#category-options').hidden = false; document.querySelector('#category-leaves').hidden = true; document.querySelector('#catalog-5').hidden = false; };
          document.querySelector('#catalog-5').onclick = () => { document.querySelector('#category-leaves').hidden = false; document.querySelector('#catalog-5').hidden = true; };
          document.querySelector('#size').onclick = () => document.querySelector('#size-options').hidden = false;
          document.querySelector('#condition').onclick = () => document.querySelector('#condition-options').hidden = false;
          document.onkeydown = event => { if(event.key==='Escape') { document.querySelector('#size-options').hidden = true; document.querySelector('#category-options').hidden = true; document.querySelector('#condition-options').hidden = true; }};
        </script>`,
      });
    });
    await page.goto('https://www.vinted.de/items/new');
    const result = await readVintedListingChoices(page, '789', 1223, 'size', [5]);
    assert.equal(result.sizeGroupId, 14);
    assert.deepEqual(
      result.choices.map((choice) => choice.id),
      [208, 209],
    );
    assert.equal(await page.locator('#size-options').isVisible(), false);
    assert.equal(writes, 0);
    await assert.rejects(readVintedListingChoices(page, '789', 2738, 'size', [5]), /Kategorie/);
    await assert.rejects(readVintedListingChoices(page, '790', 1223, 'size'), /Konto/);
    const fields = await readVintedListingCategoryFields(page, '789', 1223, [5]);
    assert.deepEqual(fields.unknownFields, ['isbn']);
    assert.deepEqual(
      fields.fields.map((field) => field.field),
      ['size', 'condition'],
    );
    assert.deepEqual(fields.acceptedPhotoMimeTypes, [
      'image/jpeg',
      'image/gif',
      'image/png',
      'image/webp',
    ]);
    assert.equal(fields.titleMaxLength, null);
    assert.equal(fields.aiPhoto, null);
    assert.equal(fields.bump, null);
    assert.equal(writes, 0);
  } finally {
    await browser.close();
  }
});

test('collects visible ARIA options and package labels without reading hidden native controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div role="radio" id="brand-53" aria-label="Nike" aria-checked="true" aria-disabled="false"><input id="brand-radio-53" aria-hidden="true" type="radio"></div>
      <div role="radio" id="brand-14" aria-label="adidas" aria-checked="false" aria-disabled="true"></div>
      <div style="opacity:0"><div role="radio" id="brand-99" aria-label="Hidden"></div></div>
      <div role="radio" id="condition-2" aria-checked="true"><div data-testid="condition-2--title">Sehr gut</div><p>Beschreibung</p></div>
      <div role="checkbox" id="color-3" aria-checked="true"><div data-testid="color-3--title">Grau</div><input id="color-checkbox-3" aria-hidden="true"></div>
      <div role="checkbox" id="material-149" aria-checked="true"><div data-testid="material-149--title">Acryl</div></div>
      <button id="package-size-2">Mittel Für Artikel in einem Schuhkarton</button><label><input id="package_type_selector_2" type="radio" checked aria-labelledby="package-size-2"></label>`);
    const { collectVintedListingChoices, parseVintedListingChoices } =
      await import('../../src/vinted-listing-contracts.ts');
    for (const [field, id, label] of [
      ['brand', 53, 'Nike'],
      ['condition', 2, 'Sehr gut'],
      ['color', 3, 'Grau'],
      ['material', 149, 'Acryl'],
      ['package', 2, 'Mittel Für Artikel in einem Schuhkarton'],
    ] as const) {
      const choices = parseVintedListingChoices(
        field,
        await page.evaluate(collectVintedListingChoices, field),
      ).choices;
      assert.equal(choices[0]?.id, id);
      assert.equal(choices[0]?.label, label);
      assert.equal(choices[0]?.selected, true);
      if (field === 'brand') {
        assert.equal(choices.length, 2);
        assert.equal(choices[1]?.disabled, true);
      }
    }
  } finally {
    await browser.close();
  }
});

test('reads a native package cell only when its identity agrees with the radio', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const mode of ['matching', 'foreign', 'hidden'] as const) {
      await page.setContent(
        `<div id="${mode === 'foreign' ? 3 : 2}-package-size" data-testid="2-package-size--cell"${mode === 'hidden' ? ' hidden' : ''}><div>Mittel</div><p>Für Artikel in einem Schuhkarton.</p><label for="package_type_selector_2"><input id="package_type_selector_2" type="radio" checked aria-labelledby="package-size-2"><span></span></label></div>`,
      );
      const collected = await page.evaluate(collectVintedListingChoices, 'package' as const);
      if (mode === 'matching') {
        assert.deepEqual(parseVintedListingChoices('package', collected).choices, [
          {
            id: 2,
            label: 'MittelFür Artikel in einem Schuhkarton.',
            selected: true,
            disabled: false,
            sizeGroupId: null,
          },
        ]);
      } else {
        assert.throws(() => parseVintedListingChoices('package', collected));
      }
    }
  } finally {
    await browser.close();
  }
});

test('reads the measured package title with different cell ID and test ID order', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const extras of [true, false]) {
      await page.setContent(
        `<div id="package-size-2" role="presentation" data-testid="2-package-size--cell"><div data-testid="2-package-size--cell--title">${extras ? '<div data-testid="package-size-suggestion-badge-id-2">Empfohlen</div>' : ''}<div></div><span>Mittel</span></div><p>Für Artikel in einem Schuhkarton.</p>${extras ? '<a>Infos zu Größen und Entschädigungen</a>' : ''}<label for="package_type_selector_2"><input type="radio" id="package_type_selector_2" aria-labelledby="package-size-2" checked></label></div>`,
      );
      const collected = await page.evaluate(collectVintedListingChoices, 'package' as const);
      assert.deepEqual(parseVintedListingChoices('package', collected).choices, [
        { id: 2, label: 'Mittel', selected: true, disabled: false, sizeGroupId: null },
      ]);
    }
  } finally {
    await browser.close();
  }
});

test('rejects another package ID in the measured cell or title metadata', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const field of ['cell', 'title']) {
      await page.setContent(
        `<div id="package-size-2" role="presentation" data-testid="${field === 'cell' ? 3 : 2}-package-size--cell"><div data-testid="${field === 'title' ? 3 : 2}-package-size--cell--title"><span>Mittel</span></div><label for="package_type_selector_2"><input type="radio" id="package_type_selector_2" aria-labelledby="package-size-2" checked></label></div>`,
      );
      await assert.rejects(
        page.evaluate(collectVintedListingChoices, 'package' as const),
        /Vinted-Paketname nicht eindeutig\./,
      );
    }
  } finally {
    await browser.close();
  }
});

test('reads the native package name without recommendation, description or information text', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [cellId, extras] of [
      ['2-package-size', true],
      ['2-package-size', false],
      ['package-size-2', true],
      ['package-size-2', false],
    ] as const) {
      await page.setContent(
        `<div id="${cellId}" data-testid="${cellId}--cell"><div data-testid="${cellId}--cell-title" class="web_ui__Cell__title">${extras ? '<div>Empfohlen</div>' : ''}<span>Mittel</span></div><p>Für Artikel in einem Schuhkarton.</p>${extras ? '<a>Infos zu Größen und Entschädigungen</a>' : ''}<label for="package_type_selector_2"><input id="package_type_selector_2" type="radio" checked aria-labelledby="package-size-2"><span></span></label></div>`,
      );
      const collected = await page.evaluate(collectVintedListingChoices, 'package' as const);
      assert.deepEqual(parseVintedListingChoices('package', collected).choices, [
        { id: 2, label: 'Mittel', selected: true, disabled: false, sizeGroupId: null },
      ]);
    }
  } finally {
    await browser.close();
  }
});

test('rejects missing, hidden or ambiguous names inside an identified native package title', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [cellId, cellTestId, titleTestId] of [
      ['2-package-size', '2-package-size--cell', '2-package-size--cell-title'],
      ['package-size-2', 'package-size-2--cell', 'package-size-2--cell-title'],
      ['package-size-2', '2-package-size--cell', '2-package-size--cell--title'],
    ] as const) {
      for (const title of [
        '<div data-testid="2-package-size--cell-title"><span></span></div>',
        '<div data-testid="2-package-size--cell-title"><span>Mittel</span><span>Groß</span></div>',
        '<div data-testid="2-package-size--cell-title" hidden><span>Mittel</span></div>',
        '<div data-testid="2-package-size--cell-title" style="opacity:0"><span>Mittel</span></div>',
        '<div data-testid="2-package-size--cell-title"><span>Mittel</span></div><div data-testid="2-package-size--cell-title"><span>Groß</span></div>',
      ]) {
        await page.setContent(
          `<div id="${cellId}" data-testid="${cellTestId}">${title.replaceAll('2-package-size--cell-title', titleTestId)}<p>Für Artikel in einem Schuhkarton.</p><label for="package_type_selector_2"><input id="package_type_selector_2" type="radio" checked aria-labelledby="package-size-2"><span></span></label></div>`,
        );
        await assert.rejects(
          page.evaluate(collectVintedListingChoices, 'package' as const),
          /Vinted-Paketname nicht eindeutig\./,
        );
      }
    }
  } finally {
    await browser.close();
  }
});

test('refuses a different domain or route before interacting with a form', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.fulfill({ body: '<input id="size">' }));
    for (const url of [
      'https://www.vinted.de.attacker.test/items/new',
      'https://www.vinted.de/items/123',
    ]) {
      await page.goto(url);
      await assert.rejects(readVintedListingChoices(page, '789', 1223, 'size'), /Formular/);
    }
  } finally {
    await browser.close();
  }
});
