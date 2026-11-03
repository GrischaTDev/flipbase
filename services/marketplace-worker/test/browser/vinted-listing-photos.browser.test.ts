import { renderVintedListingPhoto } from '../../../../supabase/functions/_shared/vinted-listing-photo-renderer.mts';
import { exportVintedListingPhoto } from '../../src/vinted-browser-photo-export.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { uploadVintedListingPhotos } from '../../src/vinted-browser-listing-photos.ts';
import type { MarketplaceListingSnapshot } from '../../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MarketplaceBrowserHttpApi } from '../../src/marketplace-browser-http-api.ts';
import { VintedListingPhotoSource } from '../../src/vinted-listing-photo-source.ts';

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

test('preview and upload share filters and frame sizes without changing the original or its aspect', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 120;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#646464';
      ctx.fillRect(0, 0, 240, 120);
      for (let x = 100; x < 140; x++) {
        ctx.fillStyle = x % 2 ? '#ffffff' : '#000000';
        ctx.fillRect(x, 0, 1, 30);
      }
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    const original = Buffer.from(base64, 'base64');
    const photo = {
      id: '1',
      fileName: 'original.png',
      mimeType: 'image/png' as const,
      bytes: new Uint8Array(original),
    };
    async function pixels(encoded: string) {
      return page.evaluate(async (encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const sample = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[0]!;
        let margin = 0;
        while (margin < canvas.height / 2 && sample(20, margin) > 245) margin++;
        return {
          width: canvas.width,
          height: canvas.height,
          center: sample(120, 60),
          contrast: Math.abs(sample(120, 15) - sample(121, 15)),
          corner: sample(0, 0),
          margin,
        };
      }, encoded);
    }
    const unchanged = await exportVintedListingPhoto(page, photo, { resize: null, crops: {} });
    const baseline = await pixels(Buffer.from(unchanged.bytes).toString('base64'));
    for (const filter of ['lighter', 'darker', 'soft'] as const) {
      const options = { resize: null, crops: {}, filter };
      const upload = await exportVintedListingPhoto(page, photo, options);
      const preview = await page.evaluate(renderVintedListingPhoto, {
        base64,
        mimeType: photo.mimeType,
        resize: null,
        crop: null,
        filter,
      });
      assert.deepEqual(
        upload.bytes,
        new Uint8Array(Buffer.from(preview, 'base64')),
        'Vorschau entspricht dem tatsächlichen Upload',
      );
      const output = await pixels(preview);
      assert.deepEqual([output.width, output.height], [240, 120]);
      if (filter === 'lighter') assert.ok(output.center > baseline.center + 4);
      if (filter === 'darker') assert.ok(output.center < baseline.center - 4);
      if (filter === 'soft')
        assert.ok(output.contrast < baseline.contrast / 2, JSON.stringify({ baseline, output }));
    }
    let previousMargin = 0;
    for (const border of ['small', 'medium', 'large'] as const) {
      const output = await exportVintedListingPhoto(page, photo, {
        resize: 1200,
        crops: {},
        filter: 'darker',
        border,
      });
      const data = await pixels(Buffer.from(output.bytes).toString('base64'));
      assert.deepEqual([data.width, data.height], [1200, 600]);
      assert.ok(data.corner > 245);
      // Der mittige obere Rand wächst mit jeder Stufe; das gesamte Foto bleibt sichtbar.
      const margin = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = 'data:image/jpeg;base64,' + encoded;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        let y = 0;
        while (y < canvas.height / 2 && ctx.getImageData(canvas.width / 2, y, 1, 1).data[0]! > 245)
          y++;
        return y;
      }, Buffer.from(output.bytes).toString('base64'));
      assert.ok(margin > previousMargin);
      previousMargin = margin;
      const repeated = await exportVintedListingPhoto(page, photo, {
        resize: 1200,
        crops: {},
        filter: 'darker',
        border,
      });
      assert.deepEqual(output.bytes, repeated.bytes);
    }
    assert.deepEqual(Buffer.from(photo.bytes), original);
  } finally {
    await browser.close();
  }
});

test('reads and edits a CDN photo without CORS through the authenticated same-origin endpoint', async () => {
  const browser = await chromium.launch({ headless: true });
  const servers: Server[] = [];
  const listen = async (server: Server) => {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  };
  try {
    const page = await browser.newPage();
    const original = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 120;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#719fef';
        ctx.fillRect(0, 0, 80, 120);
        return canvas.toDataURL('image/jpeg').split(',')[1]!;
      }),
      'base64',
    );
    // Der Bildserver erlaubt bewusst weder Fetch-CORS noch Canvas-Zugriff.
    const imageOrigin = await listen(
      createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'image/jpeg' });
        response.end(original);
      }),
    );
    const scope = {
      workspaceId: '25600000-0000-4000-8000-000000000011',
      connectionId: '25600000-0000-4000-8000-000000000021',
      entryId: '25600000-0000-4000-8000-000000000041',
    };
    const photoUrl = 'https://images1.vinted.net/camera-original.jpg';
    let providerDownloads = 0;
    let browserActions = 0;
    const photos = new VintedListingPhotoSource({
      url: 'https://database.example',
      publishableKey: 'public-key',
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.href === photoUrl) {
          providerDownloads++;
          assert.equal(new Headers(init?.headers).get('authorization'), null);
          // Nur die Anbieter-Transportadresse wird zur echten lokalen HTTP-Fixture umgebogen.
          return fetch(imageOrigin + '/original.jpg', init);
        }
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-token');
        assert.equal(url.searchParams.get('workspace_id'), 'eq.' + scope.workspaceId);
        if (url.pathname.endsWith('/marketplace_connections'))
          return Response.json([
            { external_account_id: '789', status: 'connected', execution_mode: 'cloud' },
          ]);
        assert.equal(url.searchParams.get('connection_id'), 'eq.' + scope.connectionId);
        assert.equal(url.searchParams.get('id'), 'eq.' + scope.entryId);
        return Response.json([
          {
            external_id: '12345',
            ...(url.searchParams.get('select')?.includes('body')
              ? { body: { imageUrls: [photoUrl] } }
              : {}),
          },
        ]);
      },
    });
    const api = new MarketplaceBrowserHttpApi({
      broker: {
        open: async () => {
          browserActions++;
          throw new Error('Keine Browsersitzung erlaubt');
        },
        run: async () => {
          browserActions++;
          throw new Error('Keine Browseraktion erlaubt');
        },
        close: async () => {
          browserActions++;
        },
      },
      users: {
        userId: async (token) => {
          if (token !== 'fixture-token') throw new Error('invalid');
          return '25600000-0000-4000-8000-000000000001';
        },
      },
      listingPhotos: photos,
    });
    const appOrigin = await listen(api.createServer());
    await page.goto(appOrigin + '/marketplace-browser/healthz');
    const blocked = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      let canvasBlocked = false,
        fetchBlocked = false;
      try {
        canvas.toDataURL();
      } catch (error) {
        canvasBlocked = error instanceof DOMException && error.name === 'SecurityError';
      }
      try {
        await fetch(url);
      } catch {
        fetchBlocked = true;
      }
      return { canvasBlocked, fetchBlocked, width: image.naturalWidth };
    }, imageOrigin + '/original.jpg');
    assert.deepEqual(blocked, { canvasBlocked: true, fetchBlocked: true, width: 80 });
    const read = await page.evaluate(
      async (body) => {
        const response = await fetch('/marketplace-browser/listings/photo/read', {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const blob = await response.blob();
        const encoded = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]!);
          reader.readAsDataURL(blob);
        });
        return { status: response.status, mimeType: blob.type, encoded };
      },
      { ...scope, photoUrl },
    );
    assert.equal(read.status, 200);
    assert.equal(read.mimeType, 'image/jpeg');
    assert.deepEqual(Buffer.from(read.encoded, 'base64'), original);
    for (const options of [
      { resize: 1200, filter: 'none' },
      { resize: null, filter: 'lighter' },
    ] as const) {
      const output: string = await page.evaluate(renderVintedListingPhoto, {
        base64: read.encoded,
        mimeType: read.mimeType,
        crop: null,
        ...options,
      });
      const dimensions: { width: number; height: number } = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = 'data:image/jpeg;base64,' + encoded;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, output);
      assert.deepEqual(
        dimensions,
        options.resize ? { width: 800, height: 1200 } : { width: 80, height: 120 },
      );
    }
    const unauthorized = await fetch(appOrigin + '/marketplace-browser/listings/photo/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scope, photoUrl }),
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(providerDownloads, 1);
    assert.equal(browserActions, 0);
    assert.deepEqual(Buffer.from(read.encoded, 'base64'), original);
  } finally {
    await browser.close();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});
