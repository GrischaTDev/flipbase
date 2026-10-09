import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { readVintedListingActiveState } from '../../src/vinted-browser-listing-result.ts';
import { hasVintedActiveListingEvidence } from '../../src/vinted-listing-contracts.ts';

async function fixture(
  page: Page,
  options: {
    missing?: boolean;
    title?: string;
    stale?: boolean;
    foreign?: boolean;
    emptyInitially?: boolean;
  } = {},
) {
  let writes = 0;
  await page.route('**/*', (route) => {
    if (route.request().method() !== 'GET') writes++;
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v2/users/current')
      return route.fulfill({
        json: {
          user: {
            id: options.foreign ? '456' : '123',
            login: 'fixture',
          },
        },
      });
    if (path === '/fixture/filter') return route.fulfill({ json: { ok: true } });
    return route.fulfill({
      contentType: 'text/html',
      body: `<main id="content">
      <h1>fixture</h1><a href="/settings/profile">Profil bearbeiten</a>
      <button data-testid="closet-seller-filters-active">Aktiv</button>
      <button data-testid="closet-seller-filters-sold">Verkauft</button>
      <div id="loading" role="progressbar" hidden></div>
      <div id="items">${options.emptyInitially ? '' : '<a href="/items/98765" data-testid="product-item-id-98765--overlay-link" title="Jacke">Alter ungefilterter Stand</a>'}</div>
      <script>
        document.querySelector('[data-testid="closet-seller-filters-active"]').onclick = async event => {
          event.target.setAttribute('aria-pressed','true');
          const loading = document.querySelector('#loading'); loading.hidden = false;
          await fetch('/fixture/filter');
          await new Promise(resolve => setTimeout(resolve, 60));
          document.querySelector('#items').innerHTML = ${JSON.stringify(options.missing ? '' : `<a href="/items/98765" data-testid="product-item-id-98765--overlay-link" title="${options.title ?? 'Jacke'}">Neuer gefilterter Stand</a>`)};
          ${options.stale ? '' : 'loading.hidden = true;'}
        };
      </script></main>`,
    });
  });
  await page.goto('https://www.vinted.de/items/98765');
  return () => writes;
}

test('active state requires a fresh selected owner filter and the exact ID and title without writes', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const writes = await fixture(page);
    const proof = await readVintedListingActiveState(page, '123', '98765', 'Jacke', () =>
      Promise.resolve(),
    );
    assert.equal(proof, true);
    assert.equal(new URL(page.url()).pathname, '/member/123');
    assert.equal(
      await page.getByTestId('closet-seller-filters-active').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(writes(), 0);
  } finally {
    await browser.close();
  }
});

test('an initially empty owner profile is read without waiting for a nonexistent old row', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(300);
    await fixture(page, { emptyInitially: true, missing: true });
    assert.equal(
      await readVintedListingActiveState(page, '123', '98765', 'Jacke', () => Promise.resolve()),
      false,
    );
  } finally {
    await browser.close();
  }
});

test('the shared status reader requires visible unique controls, owner scope and the exact filtered row', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) =>
      route.fulfill({ body: '<main id="content"></main>', contentType: 'text/html' }),
    );
    await page.goto('https://www.vinted.de/member/123');
    const active =
      '<button data-testid="closet-seller-filters-active" aria-pressed="true">Aktiv</button>';
    const sold = '<button data-testid="closet-seller-filters-sold">Verkauft</button>';
    const owner = '<a href="/settings/profile">Profil bearbeiten</a>';
    const item =
      '<a data-testid="product-item-id-98765--overlay-link" href="/items/98765" title="Jacke">Artikel</a>';
    const base = active + sold + owner + item;
    for (const [html, expected] of [
      [base, true],
      [base.replace('aria-pressed="true"', 'aria-pressed="false"'), false],
      [base.replace(sold, sold.replace('>Verkauft', ' aria-pressed="true">Verkauft')), false],
      [base.replace(owner, ''), false],
      [base + item, false],
      [base + active, false],
      [base.replace('href="/items/98765"', 'href="/items/98766"'), false],
      [base.replace('title="Jacke"', 'title="Extern geändert"'), false],
      [base.replace(item, '<div hidden>' + item + '</div>'), false],
      [base + '<div role="progressbar">Lädt</div>', false],
      [base.replace(item, '') + '</main>' + item + '<main>', false],
    ] as const) {
      await page.setContent('<main id="content">' + html + '</main>');
      assert.equal(
        await page.evaluate(hasVintedActiveListingEvidence, {
          accountId: '123',
          externalId: '98765',
          title: 'Jacke',
        }),
        expected,
      );
    }
  } finally {
    await browser.close();
  }
});

test('an old matching row cannot prove success once the selected filter removes it', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const writes = await fixture(page, { missing: true });
    assert.equal(
      await readVintedListingActiveState(page, '123', '98765', 'Jacke', () => Promise.resolve()),
      false,
    );
    assert.equal(writes(), 0);
    await fixture(page, { title: 'Extern geändert' });
    assert.equal(
      await readVintedListingActiveState(page, '123', '98765', 'Jacke', () => Promise.resolve()),
      false,
    );
  } finally {
    await browser.close();
  }
});

test('a different account or revoked authority stops the state read', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await fixture(page, { foreign: true });
    await assert.rejects(
      readVintedListingActiveState(page, '123', '98765', 'Jacke', () => Promise.resolve()),
    );
    await fixture(page);
    let checks = 0;
    await assert.rejects(
      readVintedListingActiveState(page, '123', '98765', 'Jacke', async () => {
        if (++checks === 3) throw new Error('revoked');
      }),
    );
  } finally {
    await browser.close();
  }
});
