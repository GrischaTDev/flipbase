import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { createVintedListingFormFixture } from '../fixtures/vinted-listing-form.ts';
import { listingClaimFixture } from '../fixtures/marketplace-listing-claim.ts';
import { prepareVintedListingFields } from '../../src/vinted-browser-listing-fields.ts';
import {
  validateVintedListingSubmission,
  vintedListingFormMatches,
} from '../../src/vinted-listing-contracts.ts';

async function accessoryForm(page: Page) {
  const fixture = await createVintedListingFormFixture(page);
  await page.evaluate(() => {
    const form = document.querySelector('#content');
    if (!form) throw new Error('Missing fixture form');
    document.querySelector('#size')?.remove();
    const category = document.querySelector('#catalog-1223');
    if (!category) throw new Error('Missing fixture category');
    category.id = 'catalog-search-5555-result';
    category.innerHTML = '<div class="web_ui__Cell__title">Tücher &amp; Schals</div>';
    document
      .querySelector('#category-options')
      ?.insertAdjacentHTML(
        'afterbegin',
        '<input id="catalog-search-input" placeholder="Finde eine Kategorie">',
      );
    document.querySelector('#catalog-search-input')?.addEventListener('input', () => {
      const leaves = document.querySelector<HTMLElement>('#category-leaves');
      if (leaves) leaves.hidden = false;
    });
    form.insertAdjacentHTML(
      'beforeend',
      `<input readonly id="accessory_department" name="accessory_department" data-testid="category-accessory_department-single-list-input">
      <div id="accessory-options" hidden>${[
        [576, 'Damen'],
        [575, 'Herren'],
        [573, 'Mädchen'],
        [572, 'Jungs'],
      ]
        .map(
          ([id, label]) =>
            `<div role="radio" id="accessory_department-${id}" aria-checked="false"><div class="web_ui__Cell__title">${label}</div></div>`,
        )
        .join('')}</div>`,
    );
    const input = document.querySelector<HTMLInputElement>('#accessory_department');
    const popup = document.querySelector<HTMLElement>('#accessory-options');
    if (!input || !popup) throw new Error('Missing accessory field');
    input.onclick = () => {
      popup.hidden = false;
    };
    popup.querySelectorAll<HTMLElement>('[role=radio]').forEach((choice) => {
      choice.onclick = () => {
        popup
          .querySelectorAll('[role=radio]')
          .forEach((other) => other.setAttribute('aria-checked', String(other === choice)));
        input.value = choice.textContent ?? '';
        popup.hidden = true;
      };
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') popup.hidden = true;
    });
  });
  return fixture;
}

const content = {
  ...listingClaimFixture.snapshot.content,
  categoryId: 5555,
  categoryLabel: 'Tücher & Schals',
  sizeId: null,
  sizeLabel: '',
  brandId: null,
  brandLabel: 'Keine Marke',
  conditionId: 2,
  conditionLabel: 'Sehr gut',
  colorIds: [3],
  colorLabels: ['Grau'],
  materialIds: [149],
  materialLabels: ['Acryl'],
  packageSizeId: 2,
  attributes: { accessory_department: '575', accessory_department_label: 'Herren' },
};

test('prepares a selling-only scarf category with its original department without upload or publication', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fixture = await accessoryForm(page);
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      listingClaimFixture.snapshot.images,
      [],
      fixture.authorize,
    );
    assert.deepEqual(
      validateVintedListingSubmission(content, listingClaimFixture.snapshot.images, schema),
      [],
    );
    assert.equal(
      schema.fields
        .find((field) => field.field === 'accessory_department')
        ?.choices.find((choice) => choice.selected)?.id,
      575,
    );
    assert.equal(await page.locator('#category').inputValue(), 'Tücher & Schals');
    const savedSchema = { ...schema, aiPhoto: false, bump: false };
    const values = {
      title: content.title,
      description: content.description,
      price: String(Number(content.priceCents) / 100),
      ai_photo: false,
      bump: false,
    };
    assert.equal(
      vintedListingFormMatches(
        content,
        listingClaimFixture.snapshot.images,
        savedSchema,
        values,
        false,
      ),
      true,
    );
    assert.equal(
      vintedListingFormMatches(
        content,
        listingClaimFixture.snapshot.images,
        {
          ...savedSchema,
          fields: savedSchema.fields.map((field) =>
            field.field === 'accessory_department'
              ? {
                  ...field,
                  choices: field.choices.map((choice) => ({
                    ...choice,
                    selected: choice.id === 576,
                  })),
                }
              : field,
          ),
        },
        values,
        false,
      ),
      false,
    );
    assert.equal(fixture.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('rejects missing or conflicting department values before upload or publication', async () => {
  const browser = await chromium.launch();
  try {
    for (const attributes of [
      {},
      { accessory_department: '575', accessory_department_label: 'Damen' },
    ] as Readonly<Record<string, string>>[]) {
      const page = await browser.newPage();
      const fixture = await accessoryForm(page);
      await assert.rejects(
        prepareVintedListingFields(
          page,
          '123',
          { ...content, attributes },
          listingClaimFixture.snapshot.images,
          [],
          fixture.authorize,
        ),
      );
      assert.equal(fixture.writes(), 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('rejects a category search result with the same label but another identifier', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fixture = await accessoryForm(page);
    await page.locator('#catalog-search-5555-result').evaluate((element) => {
      element.id = 'catalog-search-5556-result';
    });
    await assert.rejects(
      prepareVintedListingFields(
        page,
        '123',
        content,
        listingClaimFixture.snapshot.images,
        [],
        fixture.authorize,
      ),
    );
    assert.equal(fixture.writes(), 0);
  } finally {
    await browser.close();
  }
});
