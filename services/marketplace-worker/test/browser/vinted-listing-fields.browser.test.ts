import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { createVintedListingFormFixture as fixture } from '../fixtures/vinted-listing-form.ts';
import {
  prepareVintedListingFields,
  selectVintedListingField,
} from '../../src/vinted-browser-listing-fields.ts';
import { VintedListingReadError } from '../../src/vinted-listing-read-error.ts';
import {
  closeVintedListingChoices,
  openVintedListingChoices,
} from '../../src/vinted-browser-listing-form.ts';
import { verifyVintedListingSavedContent } from '../../src/vinted-browser-listing-result.ts';
import { listingClaimFixture } from '../fixtures/marketplace-listing-claim.ts';
const snapshot = listingClaimFixture.snapshot;

test('centers a low modern color control before opening its anchored native grid', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 812 } });
    let requests = 0;
    page.on('request', () => requests++);
    await page.setContent(`<style>body { margin:0; } #content { padding-top:760px; min-height:2400px; } label { position:absolute; top:730px; } button { display:block; width:560px; height:44px; } #color-options { position:fixed; left:70px; z-index:1; } [role=checkbox] { width:48px; height:92px; }</style>
      <main id="content"><label for="_r_color_">Farbe</label><button type="button" id="_r_color_" data-testid="color-select-dropdown-input">Farbe auswählen</button><input name="color" value="">
      </main><div id="color-options" hidden><div role="checkbox" data-testid="filter-grid-option-1" aria-checked="false"><span data-testid="color-1">Schwarz</span></div></div>
      <script>
        const control = document.querySelector('[data-testid="color-select-dropdown-input"]');
        const popup = document.querySelector('#color-options');
        control.onclick = () => { popup.style.top = (control.getBoundingClientRect().bottom + 14) + 'px'; popup.hidden = false; };
        popup.querySelector('[role=checkbox]').onclick = event => { event.currentTarget.setAttribute('aria-checked', 'true'); control.textContent = 'Schwarz'; };
        document.onkeydown = event => { if (event.key === 'Escape') popup.hidden = true; };
      </script>`);
    const control = page.getByTestId('color-select-dropdown-input');
    assert.equal(await control.isVisible(), true);
    assert.equal((await control.boundingBox())?.y, 760);
    await selectVintedListingField(
      page,
      {
        field: 'color',
        sizeGroupId: null,
        choices: [{ id: 1, label: 'Schwarz', selected: false, disabled: false, sizeGroupId: null }],
      },
      [1],
      async () => undefined,
    );
    assert.equal(
      await page.getByTestId('filter-grid-option-1').getAttribute('aria-checked'),
      'true',
    );
    assert.equal(await page.locator('#color-options').isVisible(), false);
    assert.equal(requests, 0);
  } finally {
    await browser.close();
  }
});

test('keeps the package button name stable when recommendation and selected information move', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`${[2, 3]
      .map(
        (id) => `
      <div id="package-size-${id}" role="button" data-testid="package-size-${id}--cell">
        <div data-testid="package-size-${id}--cell-title"><div data-recommendation>Empfohlen</div><span>${id === 2 ? 'Mittel' : 'Groß'}</span></div>
        <p>Für Artikel in einem Schuhkarton.</p><a data-information>Infos zu Größen und Entschädigungen</a>
        <label><input type="radio" name="package" id="package_type_selector_${id}" aria-labelledby="package-size-${id}"${id === 3 ? ' checked' : ''}></label>
      </div>`,
      )
      .join('')}
      <script>document.querySelectorAll('[role="button"]').forEach(cell => cell.onclick = () => {
        document.querySelectorAll('[data-recommendation],[data-information]').forEach(element => element.remove());
        cell.querySelector('input').checked = true;
      });</script>`);
    const expected = await openVintedListingChoices(page, 'package');
    await selectVintedListingField(page, expected, [2], async () => undefined);
    const actual = await openVintedListingChoices(page, 'package');
    assert.equal(actual.choices.find((choice) => choice.selected)?.id, 2);
    assert.equal(actual.choices.find((choice) => choice.id === 2)?.label, 'Mittel');
  } finally {
    await browser.close();
  }
});

test('retains the value phase after successful guards when a text field cannot be filled', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const form = await fixture(page);
    page.setDefaultTimeout(300);
    let lastStep = '';
    let hasReadValues = false;
    await assert.rejects(
      prepareVintedListingFields(
        page,
        '123',
        content,
        snapshot.images,
        [5],
        async () => {
          if (hasReadValues)
            await page.locator('#title').evaluate((element) => {
              if (element instanceof HTMLInputElement) element.readOnly = true;
            });
        },
        {
          onPrepareStep: (step) => {
            lastStep = step;
            if (step === 'values') hasReadValues = true;
          },
        },
      ),
    );
    assert.equal(lastStep, 'values');
    assert.equal(form.uploads(), 0);
    assert.equal(form.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('distinguishes matching, clicking and closing for every ordinary choice', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const field of ['size', 'condition', 'color', 'material'] as const) {
      for (const phase of ['match', 'choice', 'close'] as const) {
        const page = await browser.newPage();
        const role = field === 'condition' ? 'radio' : 'checkbox';
        const id =
          field === 'size' ? 'data-testid="size-group-14-grid-option-208"' : `id="${field}-208"`;
        await page.setContent(
          `<input id="${field}"><div role="${role}" ${id} aria-checked="false"${phase === 'choice' ? ' style="pointer-events:none"' : ''}>${phase === 'match' ? 'Andere Auswahl' : 'Auswahl'}</div>`,
        );
        let checks = 0;
        await assert.rejects(
          selectVintedListingField(
            page,
            {
              field,
              sizeGroupId: field === 'size' ? 14 : null,
              choices: [
                {
                  id: 208,
                  label: 'Auswahl',
                  selected: false,
                  disabled: false,
                  sizeGroupId: field === 'size' ? 14 : null,
                },
              ],
            },
            [208],
            async () => {
              if (++checks === 2 && phase === 'close') await page.close();
            },
          ),
          (error: unknown) =>
            error instanceof VintedListingReadError && error.step === `${field}_${phase}`,
        );
        if (!page.isClosed()) await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test('distinguishes package matching and clicking failures', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const phase of ['match', 'choice'] as const) {
      await page.setContent(
        `<button id="package-size-2"${phase === 'choice' ? ' style="pointer-events:none"' : ''}>${phase === 'match' ? 'Groß' : 'Mittel'}</button><label><input id="package_type_selector_2" type="radio" aria-labelledby="package-size-2"></label>`,
      );
      await assert.rejects(
        selectVintedListingField(
          page,
          {
            field: 'package',
            sizeGroupId: null,
            choices: [
              { id: 2, label: 'Mittel', selected: false, disabled: false, sizeGroupId: null },
            ],
          },
          [2],
          async () => undefined,
        ),
        (error: unknown) =>
          error instanceof VintedListingReadError && error.step === `package_${phase}`,
      );
    }
  } finally {
    await browser.close();
  }
});

test('reports native brand matching, clicking and confirmation as fixed phases', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const phase of ['match', 'choice', 'selected'] as const) {
      await page.setContent(
        `<div id="content"><input id="brand"><div role="radio" id="brand-53" aria-checked="false"${phase === 'choice' ? ' style="pointer-events:none"' : ''}>${phase === 'match' ? 'adidas' : 'Nike'}</div></div>`,
      );
      await assert.rejects(
        selectVintedListingField(
          page,
          {
            field: 'brand',
            sizeGroupId: null,
            choices: [
              { id: 53, label: 'Nike', selected: false, disabled: false, sizeGroupId: null },
            ],
          },
          [53],
          async () => undefined,
        ),
        (error: unknown) =>
          error instanceof VintedListingReadError && error.step === `brand_${phase}`,
      );
    }
  } finally {
    await browser.close();
  }
});
const content = {
  ...snapshot.content,
  colorIds: [3],
  colorLabels: ['Grau'],
  materialIds: [149],
  materialLabels: ['Acryl'],
};

async function installBrandCloseFixture(page: Page, mode: 'ignored' | 'delayed' | 'blocked') {
  await page.evaluate((closeMode) => {
    const popup = document.querySelector<HTMLElement>('#brand-options');
    const size = document.querySelector<HTMLElement>(
      '[data-testid="category-size-single-grid-input"],input#size',
    );
    const brand = document.querySelector<HTMLElement>(
      '[data-testid="brand-select-dropdown-input"],input#brand',
    );
    const title = document.querySelector<HTMLInputElement>('input[name="title"]');
    if (!popup || !size || !brand || !title) throw new Error('Missing transition fixture');
    popup.dataset.outsideCloseClicks = '0';
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || popup.hidden) return;
        event.stopImmediatePropagation();
        if (closeMode === 'delayed') setTimeout(() => (popup.hidden = true), 120);
      },
      true,
    );
    document.addEventListener('pointerdown', (event) => {
      if (event.target !== title || popup.hidden) return;
      popup.dataset.outsideCloseClicks = String(Number(popup.dataset.outsideCloseClicks) + 1);
      if (closeMode !== 'blocked') popup.hidden = true;
    });
    brand.addEventListener('click', () => {
      const rectangle = size.getBoundingClientRect();
      Object.assign(popup.style, {
        position: 'fixed',
        left: rectangle.left + 'px',
        top: rectangle.top + 'px',
        width: Math.max(200, rectangle.width) + 'px',
        minHeight: '100px',
        background: 'white',
        zIndex: '10',
      });
    });
  }, mode);
}

for (const modernControls of [false, true]) {
  test(`closes an Escape-resistant brand list before selecting size with ${modernControls ? 'modern' : 'native'} controls`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const form = await fixture(page, { modernControls, brandSearch: 'matching' });
      await installBrandCloseFixture(page, 'ignored');
      const result = await prepareVintedListingFields(
        page,
        '123',
        { ...content, brandId: 254956, brandLabel: 'Jako' },
        snapshot.images,
        [5],
        form.authorize,
      );
      assert.equal(
        result.fields
          .find((field) => field.field === 'size')
          ?.choices.find((choice) => choice.selected)?.id,
        content.sizeId,
      );
      assert.equal(await page.locator('#brand-options').isVisible(), false);
      assert.ok(
        Number(await page.locator('#brand-options').getAttribute('data-outside-close-clicks')) > 0,
      );
      assert.equal(await page.locator('input[name="title"]').inputValue(), content.title);
      assert.equal(form.writes(), 0);
      assert.equal(form.uploads(), 0);
      assert.equal(form.saves(), 0);
    } finally {
      await browser.close();
    }
  });
}

test('waits for the brand list to disappear after Escape without an unnecessary outside click', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await fixture(page, { brandSearch: 'matching' });
    await installBrandCloseFixture(page, 'delayed');
    await page.locator('#brand').click();
    await closeVintedListingChoices(page, 'brand');
    assert.equal(await page.locator('#brand-options').isVisible(), false);
    assert.equal(
      await page.locator('#brand-options').getAttribute('data-outside-close-clicks'),
      '0',
    );
  } finally {
    await browser.close();
  }
});

test('reports brand_close when the list cannot be dismissed and preserves the title', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await fixture(page, { brandSearch: 'matching' });
    await installBrandCloseFixture(page, 'blocked');
    await page.locator('input[name="title"]').fill('Eigene Arbeit');
    await page.locator('#brand').click();
    await assert.rejects(
      closeVintedListingChoices(page, 'brand'),
      (error: unknown) => error instanceof VintedListingReadError && error.step === 'brand_close',
    );
    assert.equal(await page.locator('input[name="title"]').inputValue(), 'Eigene Arbeit');
    assert.equal(await page.locator('#size-options').isVisible(), false);
    assert.equal(form.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('changes asynchronous multiple colors within one open list and still checks the selected IDs', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let requests = 0;
    page.on('request', () => requests++);
    await page.setContent(`<main id="content"><input id="color" readonly></main>
      <div id="colors" hidden><div role="checkbox" id="color-1" aria-checked="false">Schwarz</div><div role="checkbox" id="color-2" aria-checked="true">Braun</div><div role="checkbox" id="color-3" aria-checked="false">Grau</div></div>
      <script>
        const popup = document.querySelector('#colors');
        const control = document.querySelector('#color');
        control.dataset.opens = '0';
        control.onclick = () => { control.dataset.opens = String(Number(control.dataset.opens) + 1); popup.hidden = false; };
        popup.querySelectorAll('[role=checkbox]').forEach(choice => choice.onclick = () => setTimeout(() => choice.setAttribute('aria-checked', String(choice.getAttribute('aria-checked') !== 'true')), 2000));
        document.onkeydown = event => { if(event.key === 'Escape') popup.hidden = true; };
      </script>`);
    await selectVintedListingField(
      page,
      {
        field: 'color',
        sizeGroupId: null,
        choices: [
          { id: 1, label: 'Schwarz', selected: false, disabled: false, sizeGroupId: null },
          { id: 2, label: 'Braun', selected: true, disabled: false, sizeGroupId: null },
          { id: 3, label: 'Grau', selected: false, disabled: false, sizeGroupId: null },
        ],
      },
      [1, 3],
      async () => undefined,
    );
    assert.equal(await page.locator('#color').getAttribute('data-opens'), '1');
    assert.deepEqual(
      await page
        .locator('[aria-checked=true]')
        .evaluateAll((choices) => choices.map((choice) => choice.id)),
      ['color-1', 'color-3'],
    );
    assert.equal(await page.locator('#colors').isVisible(), false);
    assert.equal(requests, 0);
  } finally {
    await browser.close();
  }
});

test('stops an open multiple selection when authority is revoked and closes its popup', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<main id="content"><input id="color" readonly></main>
      <div id="colors" hidden><div role="checkbox" id="color-1" aria-checked="false">Schwarz</div><div role="checkbox" id="color-3" aria-checked="false">Grau</div></div>
      <script>
        const popup = document.querySelector('#colors');
        document.querySelector('#color').onclick = () => popup.hidden = false;
        popup.querySelectorAll('[role=checkbox]').forEach(choice => choice.onclick = () => choice.setAttribute('aria-checked','true'));
        document.onkeydown = event => { if(event.key === 'Escape') popup.hidden = true; };
      </script>`);
    await assert.rejects(
      selectVintedListingField(
        page,
        {
          field: 'color',
          sizeGroupId: null,
          choices: [
            { id: 1, label: 'Schwarz', selected: false, disabled: false, sizeGroupId: null },
            { id: 3, label: 'Grau', selected: false, disabled: false, sizeGroupId: null },
          ],
        },
        [1, 3],
        async () => {
          if ((await page.locator('#color-1').getAttribute('aria-checked')) === 'true')
            throw new Error('Freigabe entzogen');
        },
      ),
      /Freigabe entzogen/,
    );
    assert.equal(await page.locator('#colors').isVisible(), false);
    assert.equal(await page.locator('#color-3').getAttribute('aria-checked'), 'false');
  } finally {
    await browser.close();
  }
});

test('bricht eine nicht zuordenbare eigene Größe vor jedem Upload und Speichern ab', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page);
    await assert.rejects(
      prepareVintedListingFields(
        page,
        '123',
        {
          ...snapshot.content,
          sizeId: 5,
          sizeLabel: 'Unbekannt',
          attributes: { flipbaseListingForm: '1' },
        },
        snapshot.images,
        [5],
        f.authorize,
      ),
      /Größe/,
    );
    assert.equal(f.uploads(), 0);
    assert.equal(f.saves(), 0);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('prepares and rereads the observed native color and package controls without uploading or saving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page, {
      colorGrid: true,
      nativePackage: true,
      brandChoicesDelayMs: 6000,
    });
    const result = await prepareVintedListingFields(
      page,
      '123',
      { ...content, sizeId: 5, conditionId: 3, attributes: { flipbaseListingForm: '1' } },
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.equal(await page.locator('#color').inputValue(), 'Grau');
    assert.deepEqual(result.fields.find((field) => field.field === 'color')?.choices, [
      { id: 3, label: 'Grau', selected: true, disabled: false, sizeGroupId: null },
    ]);
    assert.equal(f.writes(), 0);
    assert.equal(f.uploads(), 0);
    assert.equal(f.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('prepares and verifies modern bound controls while companion values stay provider ids', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await fixture(page, {
      modernControls: true,
      colorGrid: true,
      nativePackage: true,
      brandSearch: 'matching',
      brandSearchStartsEmpty: true,
    });
    const result = await prepareVintedListingFields(
      page,
      '123',
      {
        ...content,
        brandId: 254956,
        brandLabel: 'Jako',
        sizeId: 5,
        conditionId: 3,
        attributes: { flipbaseListingForm: '1' },
      },
      snapshot.images,
      [5],
      form.authorize,
    );
    assert.deepEqual(result.unknownFields, []);
    assert.equal(
      await page.getByTestId('catalog-select-dropdown-input').innerText(),
      'Bomberjacken',
    );
    assert.equal(await page.getByTestId('brand-select-dropdown-input').innerText(), 'Jako');
    assert.equal(await page.locator('input[name="brand"]').inputValue(), '254956');
    assert.equal(await page.locator('input[name="title"]').inputValue(), content.title);
    assert.equal(form.writes(), 0);
    assert.equal(form.uploads(), 0);
    assert.equal(form.saves(), 0);
  } finally {
    await browser.close();
  }
});

for (const mutation of [
  'foreign-id',
  'wrapped-label',
  'aria-label',
  'aria-labelledby',
  'wrong-native-tag',
  'wrong-choice-tag',
  'duplicate-companion',
] as const) {
  test(`preserves an independent ${mutation} field as unknown before preparing a publication`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const form = await fixture(page, { modernControls: true });
      await page.evaluate((change) => {
        const root = document.querySelector('#content')!;
        const input = root.querySelector('input[name="brand"]')!;
        if (change === 'foreign-id') {
          input.id = 'foreign-personal-field';
          input.insertAdjacentHTML(
            'beforebegin',
            '<label for="foreign-personal-field">Zusätzliche Angabe</label>',
          );
        }
        if (change === 'wrapped-label') {
          const label = document.createElement('label');
          label.textContent = 'Zusätzliche Angabe';
          input.before(label);
          label.append(input);
        }
        if (change === 'aria-label') input.setAttribute('aria-label', 'Zusätzliche Angabe');
        if (change === 'aria-labelledby') {
          input.insertAdjacentHTML(
            'beforebegin',
            '<span id="extra-label">Zusätzliche Angabe</span>',
          );
          input.setAttribute('aria-labelledby', 'extra-label');
        }
        if (change === 'wrong-native-tag')
          root.insertAdjacentHTML(
            'beforeend',
            '<select name="price"><option value="extra">Zusätzliche Angabe</option></select>',
          );
        if (change === 'wrong-choice-tag')
          root.insertAdjacentHTML(
            'beforeend',
            '<select name="brand" aria-label="Zusätzliche Angabe"><option value="extra">Andere Auswahl</option></select>',
          );
        if (change === 'duplicate-companion')
          root.insertAdjacentHTML('beforeend', '<input name="brand" value="extra">');
      }, mutation);
      await assert.rejects(
        prepareVintedListingFields(page, '123', content, snapshot.images, [5], form.authorize),
      );
      assert.equal(form.writes(), 0);
      assert.equal(form.uploads(), 0);
      assert.equal(form.saves(), 0);
    } finally {
      await browser.close();
    }
  });
}
test('finds an exact native brand outside popular choices and waits for asynchronous selection', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, {
        brandSearch: 'matching',
        brandLoadingDelayMs: 400,
        brandSearchStartsEmpty: true,
        brandSearchPortal: true,
      });
    const result = await prepareVintedListingFields(
      page,
      '123',
      { ...content, brandId: 254956, brandLabel: 'Jako' },
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.deepEqual(
      result.fields
        .find((field) => field.field === 'brand')
        ?.choices.filter((choice) => choice.selected)
        .map((choice) => ({ id: choice.id, label: choice.label })),
      [{ id: 254956, label: 'Jako' }],
    );
    assert.equal(await page.locator('#brand').inputValue(), 'Jako');
    assert.deepEqual(f.brandQueries(), ['Jako', 'Jako']);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
test('does not replace an unknown native brand ID with a similar or free brand label', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const brandSearch of ['wrong_label', 'custom_only'] as const) {
      const page = await browser.newPage(),
        f = await fixture(page, {
          brandSearch,
          brandSearchStartsEmpty: true,
          brandSearchPortal: true,
        });
      await assert.rejects(
        prepareVintedListingFields(
          page,
          '123',
          { ...content, brandId: 254956, brandLabel: 'Jako' },
          snapshot.images,
          [5],
          f.authorize,
        ),
      );
      assert.equal(await page.locator('#title').inputValue(), '');
      assert.equal(await page.locator('#brand').inputValue(), '');
      assert.equal(f.writes(), 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('lost authority during brand search prevents private content from being filled', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, { brandSearch: 'matching' });
    const authorize = () =>
      f.brandQueries().length ? Promise.reject(new Error('revoked')) : Promise.resolve();
    await assert.rejects(
      prepareVintedListingFields(
        page,
        '123',
        { ...content, brandId: 254956, brandLabel: 'Jako' },
        snapshot.images,
        [5],
        authorize,
      ),
      /revoked/,
    );
    assert.equal(await page.locator('#title').inputValue(), '');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
test('prepares actual category-dependent choices and decimal price without saving or uploading', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.equal(schema.categoryId, 1223);
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
    assert.equal(await page.locator('#description').inputValue(), 'Gebraucht');
    assert.equal(await page.locator('#price').inputValue(), '12,00');
    for (const field of schema.fields)
      assert.equal(field.choices.filter((choice) => choice.selected).length, 1);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
test('refuses label/ID contradictions, unknown fields and disabled choices before filling personal content', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { options: {}, content: { ...content, sizeLabel: 'XL' } },
      { options: { unknown: true }, content },
      { options: { disabledSize: true }, content },
    ]) {
      const page = await browser.newPage(),
        f = await fixture(page, scenario.options);
      await assert.rejects(
        prepareVintedListingFields(
          page,
          '123',
          scenario.content,
          snapshot.images,
          [5],
          f.authorize,
        ),
        /Inseratangaben/,
      );
      assert.equal(await page.locator('#title').inputValue(), '');
      assert.equal(f.writes(), 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('preserves cached user work and rejects foreign accounts before choosing a category', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, { cached: true });
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], f.authorize),
    );
    assert.equal(await page.locator('#title').inputValue(), 'Eigene Arbeit');
    assert.equal(await page.locator('#category').inputValue(), '');
    const other = await browser.newPage(),
      g = await fixture(other);
    await assert.rejects(
      prepareVintedListingFields(other, '124', content, snapshot.images, [5], g.authorize),
    );
    assert.equal(await other.locator('#category').inputValue(), '');
  } finally {
    await browser.close();
  }
});

test('uses the visible package label when its native radio control is hidden', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, { hiddenPackage: true });
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.equal(
      schema.fields
        .find((field) => field.field === 'package')
        ?.choices.find((choice) => choice.selected)?.id,
      2,
    );
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('stops filling personal content when the authorization disappears during preparation', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const authorize = async () => {
      if (await page.locator('#title').inputValue()) throw new Error('Freigabe entzogen');
    };
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], authorize),
      /Freigabe entzogen/,
    );
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.equal(await page.locator('#price').inputValue(), '');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('stops filling when the category changes between authorization and the next field', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const authorize = async () => {
      if (await page.locator('#title').inputValue()) {
        await page.locator('#category').evaluate((element: HTMLInputElement) => {
          element.value = 'Andere Kategorie';
        });
      }
    };
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], authorize),
      /Inseratangaben/,
    );
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.equal(await page.locator('#price').inputValue(), '');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('rereads saved content and ordered native photos without any provider write', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    await prepareVintedListingFields(page, '123', content, snapshot.images, [5], f.authorize);
    const photoUrl =
      'https://images1.vinted.net/tc/06_00efb_aT3zEV4gS3asXadrwvWbPVtr/f800/1788288106.webp';
    await page.locator('#content').evaluate((element, url) => {
      const grid = document.createElement('div');
      grid.dataset.testid = 'media-upload-grid';
      const wrapper = document.createElement('div');
      wrapper.dataset.testid = 'image-wrapper-0';
      const image = document.createElement('img');
      image.src = url;
      wrapper.append(image);
      grid.append(wrapper);
      element.append(grid);
      for (const name of ['ai_photo', 'bump']) {
        const flag = document.createElement('input');
        flag.type = 'checkbox';
        flag.id = name;
        element.append(flag);
      }
    }, photoUrl);
    const body = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      document.querySelectorAll('input,textarea').forEach((source, index) => {
        const target = clone.querySelectorAll('input,textarea')[index]!;
        if (source instanceof HTMLInputElement) {
          target.setAttribute('value', source.value);
          if (source.checked) target.setAttribute('checked', '');
          else target.removeAttribute('checked');
        } else target.textContent = (source as HTMLTextAreaElement).value;
      });
      return clone.outerHTML;
    });
    f.setSavedBody(body);
    const expected = { ...snapshot, content },
      uploaded = [
        { sourceImageId: snapshot.images[0]!.id, previewUrl: photoUrl.replace('/tc/', '/t/') },
      ];
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        uploaded,
        [5],
        f.authorize,
      ),
      true,
    );
    for (const bad of [
      { ...expected, content: { ...content, title: 'Andere Jacke' } },
      { ...expected, content: { ...content, description: 'Andere Beschreibung' } },
      { ...expected, content: { ...content, priceCents: 1201 } },
      { ...expected, content: { ...content, sizeId: 209, sizeLabel: 'L' } },
      { ...expected, aiPhoto: true },
    ])
      assert.equal(
        await verifyVintedListingSavedContent(page, '123', '456', bad, uploaded, [5], f.authorize),
        false,
      );
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        [{ ...uploaded[0]!, previewUrl: photoUrl.replace('1788288106', '1788288107') }],
        [5],
        f.authorize,
      ),
      false,
    );
    f.setSavedBody(body.replace('id="bump"', 'id="bump" checked'));
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        uploaded,
        [5],
        f.authorize,
      ),
      false,
    );
    f.setSavedBody(
      body.replace('data-testid="image-wrapper-0"', 'hidden data-testid="image-wrapper-0"'),
    );
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        uploaded,
        [5],
        f.authorize,
      ),
      false,
    );
    f.setSavedBody(body.replace('id="price"', 'id="price" style="opacity:0"'));
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        uploaded,
        [5],
        f.authorize,
      ),
      false,
    );
    f.setSavedBody(
      body.replace(
        '<div data-testid="media-upload-grid">',
        '<input type="checkbox" id="bump" checked><div data-testid="media-upload-grid">',
      ),
    );
    assert.equal(
      await verifyVintedListingSavedContent(
        page,
        '123',
        '456',
        expected,
        uploaded,
        [5],
        f.authorize,
      ),
      false,
    );
    f.setSavedBody(body);
    await assert.rejects(
      verifyVintedListingSavedContent(page, '123', '456', expected, uploaded, [5], () =>
        Promise.reject(new Error('Freigabe entzogen')),
      ),
      /Freigabe entzogen/,
    );
    f.setSavedBody(body);
    f.changeAccount();
    await assert.rejects(
      verifyVintedListingSavedContent(page, '123', '456', expected, uploaded, [5], f.authorize),
    );
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('an explicitly reserved empty new form accepts remembered choices without accepting existing content', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    await page.locator('#category').evaluate((element: HTMLInputElement) => {
      element.value = 'Bomberjacken';
    });
    await page.locator('#catalog-1223').evaluate((element) => {
      element.setAttribute('aria-checked', 'true');
    });
    await page.locator('#brand').evaluate((element: HTMLInputElement) => {
      element.value = 'Keine Marke';
    });
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], f.authorize),
    );
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      snapshot.images,
      [5],
      f.authorize,
      { allowRememberedChoices: true },
    );
    assert.equal(schema.categoryId, 1223);
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
    assert.equal(f.writes(), 0);
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], f.authorize, {
        allowRememberedChoices: true,
      }),
    );
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
  } finally {
    await browser.close();
  }
});
