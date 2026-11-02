import { exportVintedListingPhoto } from '../../src/vinted-browser-photo-export.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { uploadVintedListingPhotos } from '../../src/vinted-browser-listing-photos.ts';
import type { MarketplaceListingSnapshot } from '../../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  'base64',
);
const originals: MarketplaceListingSnapshot['images'] = [
  {
    id: '9007199254740993',
    storagePath: 'private/first.png',
    fileName: 'first.png',
    mimeType: 'image/png',
    byteSize: imageBytes.length,
  },
  {
    id: '9007199254740994',
    storagePath: 'private/second.png',
    fileName: 'second.png',
    mimeType: 'image/png',
    byteSize: imageBytes.length,
  },
];
async function fixture(page: Page, mode: 'normal' | 'existing' | 'preview' | 'reorder' = 'normal') {
  const calls: string[] = [];
  let accountId = '789';
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v2/users/current')
      return route.fulfill({ json: { user: { id: accountId, login: 'fixture' } } });
    if (url.hostname === 'images1.vinted.net')
      return route.fulfill({ body: imageBytes, contentType: 'image/png' });
    if (url.pathname === '/fixture/photo') {
      calls.push('upload:' + url.searchParams.get('name'));
      return route.fulfill({
        json: { url: 'https://images1.vinted.net/fixture/' + url.searchParams.get('name') },
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `<div id="content"><div id="photos" data-testid="media-upload"><input type="file" name="photos" data-testid="add-photos-input" multiple accept="image/jpeg,image/gif,image/png,image/webp"><div data-testid="media-upload-grid">${mode === 'existing' ? '<div data-testid="image-wrapper-0"><img src="https://images1.vinted.net/fixture/existing.png"></div>' : ''}</div></div></div>
    <script>
      document.querySelector('input').onchange = async event => {
        const file = event.target.files[0], grid = document.querySelector('[data-testid="media-upload-grid"]');
        const index = grid.querySelectorAll('[data-testid^="image-wrapper-"]').length;
        const wrapper = document.createElement('div'); wrapper.dataset.testid = 'image-wrapper-' + index;
        const image = document.createElement('img'); image.alt='Hochgeladenes Foto ' + (index+1); image.src=URL.createObjectURL(file);
        wrapper.append(image); grid.append(wrapper);
        const result = await fetch('/fixture/photo?name=' + encodeURIComponent(file.name), {method:'POST',body:file});
        if ('${mode}' !== 'preview') image.src=(await result.json()).url;
        if ('${mode}' === 'reorder' && index > 0) grid.querySelector('img').src='https://images1.vinted.net/fixture/replaced.png';
      };
    </script>`,
    });
  });
  await page.goto('https://www.vinted.de/items/new');
  return {
    calls,
    changeAccount: () => {
      accountId = '790';
    },
    loadPhoto: async (id: string) => {
      calls.push('load:' + id);
      const image = originals.find((image) => image.id === id)!;
      return {
        id,
        fileName: image.fileName,
        mimeType: image.mimeType,
        bytes: new Uint8Array(imageBytes),
      };
    },
    authorize: async () => {
      calls.push('authorize');
    },
    beforeWrite: async () => {
      calls.push('begin');
    },
  };
}

test('uses native photo input once per original and preserves the visible order after Begin', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const result = await uploadVintedListingPhotos(
      page,
      '789',
      originals,
      f.loadPhoto,
      f.beforeWrite,
      f.authorize,
    );
    assert.deepEqual(
      result.map((photo) => photo.sourceImageId),
      originals.map((image) => image.id),
    );
    assert.deepEqual(
      f.calls.filter((call) => call.startsWith('upload:')),
      ['upload:first.png', 'upload:second.png'],
    );
    assert.equal(f.calls.filter((call) => call === 'begin').length, 1);
    assert.ok(f.calls.indexOf('begin') < f.calls.indexOf('upload:first.png'));
    assert.ok(f.calls.indexOf('load:' + originals[0]!.id) < f.calls.indexOf('begin'));
    assert.ok(result.every((photo) => photo.previewUrl.startsWith('https://images1.vinted.net/')));
  } finally {
    await browser.close();
  }
});
test('rejects existing photos, foreign accounts and absent Begin acknowledgment before upload', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { mode: 'existing', account: '789', lostBegin: false },
      { mode: 'normal', account: '790', lostBegin: false },
      { mode: 'normal', account: '789', lostBegin: true },
    ] as const) {
      const page = await browser.newPage(),
        f = await fixture(page, scenario.mode);
      await assert.rejects(
        uploadVintedListingPhotos(
          page,
          scenario.account,
          originals,
          f.loadPhoto,
          scenario.lostBegin
            ? async () => {
                throw new Error('Begin missing');
              }
            : f.beforeWrite,
          f.authorize,
        ),
      );
      assert.equal(f.calls.filter((call) => call.startsWith('upload:')).length, 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('a blob preview never confirms upload, and changed earlier photos never confirm the order', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ['preview', 'reorder'] as const) {
      const page = await browser.newPage(),
        f = await fixture(page, mode);
      await assert.rejects(
        uploadVintedListingPhotos(page, '789', originals, f.loadPhoto, f.beforeWrite, f.authorize, {
          uploadTimeoutMs: 500,
        }),
      );
      assert.equal(f.calls.filter((call) => call === 'begin').length, 1);
      assert.equal(
        f.calls.filter((call) => call.startsWith('upload:')).length,
        mode === 'preview' ? 1 : 2,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('permission or account changes after loading the first original block upload', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revoked of [false, true]) {
      const page = await browser.newPage(),
        f = await fixture(page);
      let blocked = false;
      await assert.rejects(
        uploadVintedListingPhotos(
          page,
          '789',
          originals,
          async (id) => {
            const photo = await f.loadPhoto(id);
            if (revoked) blocked = true;
            else f.changeAccount();
            return photo;
          },
          f.beforeWrite,
          async () => {
            if (blocked) throw new Error('revoked');
            await f.authorize();
          },
        ),
      );
      assert.ok(!f.calls.includes('begin'));
      assert.ok(!f.calls.some((call) => call.startsWith('upload:')));
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('photos appearing while loading the private original are rejected before Begin', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    await assert.rejects(
      uploadVintedListingPhotos(
        page,
        '789',
        originals,
        async (id) => {
          const photo = await f.loadPhoto(id);
          await page.evaluate(() => {
            const wrapper = document.createElement('div');
            wrapper.dataset.testid = 'image-wrapper-0';
            const image = document.createElement('img');
            image.src = 'https://images1.vinted.net/fixture/existing.png';
            wrapper.append(image);
            document.querySelector('[data-testid="media-upload-grid"]')!.append(wrapper);
          });
          return photo;
        },
        f.beforeWrite,
        f.authorize,
      ),
    );
    assert.ok(!f.calls.includes('begin'));
    assert.ok(!f.calls.some((call) => call.startsWith('upload:')));
  } finally {
    await browser.close();
  }
});

test('export uses an immutable original, strips metadata and applies edits only to the native upload file', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const raw = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#337799';
        ctx.fillRect(0, 0, 640, 480);
        return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]!;
      }),
      'base64',
    );
    const metadata = Buffer.from('Exif\0\0Flipbase-original-camera', 'utf8');
    const segment = Buffer.alloc(metadata.length + 4);
    segment[0] = 255;
    segment[1] = 225;
    segment.writeUInt16BE(metadata.length + 2, 2);
    metadata.copy(segment, 4);
    const original = Buffer.concat([raw.subarray(0, 2), segment, raw.subarray(2)]);
    const pristine = Buffer.from(original);
    const photo = {
      id: originals[0]!.id,
      fileName: 'camera-original.jpg',
      mimeType: 'image/jpeg' as const,
      bytes: new Uint8Array(original),
    };
    const options = {
      resize: 1200,
      crops: { [photo.id]: { x: 0.25, y: 0, width: 0.5, height: 1, rotation: 0 as const } },
    };
    const first = await exportVintedListingPhoto(page, photo, options),
      second = await exportVintedListingPhoto(page, photo, options);
    assert.equal(Buffer.from(first.bytes).includes(Buffer.from('Exif')), false);
    assert.deepEqual(
      first.bytes,
      second.bytes,
      'A repeated relist starts from the original, never from its previous output',
    );
    assert.deepEqual(Buffer.from(photo.bytes), pristine);
    const f = await fixture(page);
    await uploadVintedListingPhotos(
      page,
      '789',
      [
        {
          ...originals[0]!,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          byteSize: photo.bytes.length,
        },
      ],
      async () => photo,
      f.beforeWrite,
      f.authorize,
      { photoOptions: options },
    );
    const output = await page
      .locator('input[name="photos"]')
      .evaluate(async (input: HTMLInputElement) => {
        const file = input.files![0]!;
        const image = await createImageBitmap(file);
        const result = {
          width: image.width,
          height: image.height,
          mimeType: file.type,
          name: file.name,
        };
        image.close();
        return result;
      });
    assert.deepEqual(output, {
      width: 800,
      height: 1200,
      mimeType: 'image/jpeg',
      name: 'camera-original.jpg',
    });
    assert.deepEqual(Buffer.from(photo.bytes), pristine);
  } finally {
    await browser.close();
  }
});
