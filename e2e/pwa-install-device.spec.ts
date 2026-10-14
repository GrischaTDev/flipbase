import { expect, test, type Page } from '@playwright/test';
import { mockMarketplace } from './support/marketplace-account-fixture';
import axe from 'axe-core';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

test('preserves the original mark geometry on white install icons and safe masks @pwa-layout', async ({
  page,
}) => {
  await page.goto('/auth/login');
  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string }[];
    shortcuts: { icons: { src: string }[] }[];
  };
  expect(manifest.icons.map((icon) => icon.src)).toEqual([
    '/icons/install-white-48.png',
    '/icons/install-white-96.png',
    '/icons/install-white-192.png',
    '/icons/install-white-512.png',
    '/icons/install-maskable-white-192.png',
    '/icons/install-maskable-white-512.png',
  ]);
  expect(
    manifest.shortcuts
      .flatMap((shortcut) => shortcut.icons.map((icon) => icon.src))
      .every((path) => path === '/icons/install-white-192.png'),
  ).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    'icons/apple-touch-white-180.png',
  );
  const checks = await page.evaluate(async () => {
    const load = async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const source = await load('/images/logo-mark.png');
    const original = document.createElement('canvas');
    original.width = source.width;
    original.height = source.height;
    const originalContext = original.getContext('2d');
    if (!originalContext) throw new Error('Canvas unavailable');
    originalContext.drawImage(source, 0, 0);
    const originalPixels = originalContext.getImageData(0, 0, source.width, source.height).data;
    let left = source.width,
      top = source.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++)
        if (originalPixels[(y * source.width + x) * 4 + 3]) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    const files = [
      [48, 'install-white-48'],
      [96, 'install-white-96'],
      [192, 'install-white-192'],
      [512, 'install-white-512'],
      [192, 'install-maskable-white-192'],
      [512, 'install-maskable-white-512'],
      [180, 'apple-touch-white-180'],
      [96, 'push-badge-monochrome-96'],
    ] as const;
    return Promise.all(
      files.map(async ([size, name]) => {
        const image = await load(`/icons/${name}.png`);
        const expected = document.createElement('canvas');
        expected.width = expected.height = size;
        const context = expected.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const scale = Math.round(size * 0.64) / Math.max(right - left + 1, bottom - top + 1);
        const width = Math.round((right - left + 1) * scale),
          height = Math.round((bottom - top + 1) * scale);
        context.drawImage(
          source,
          left,
          top,
          right - left + 1,
          bottom - top + 1,
          Math.floor((size - width) / 2),
          Math.floor((size - height) / 2),
          width,
          height,
        );
        const alphaPixels = context.getImageData(0, 0, size, size).data;
        let minX = size,
          minY = size,
          maxX = 0,
          maxY = 0,
          safe = true;
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++)
            if (alphaPixels[(y * size + x) * 4 + 3]) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) safe = false;
            }
        context.globalCompositeOperation = name.startsWith('push-badge')
          ? 'source-in'
          : 'destination-over';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size, size);
        const expectedPixels = context.getImageData(0, 0, size, size).data;
        const actual = document.createElement('canvas');
        actual.width = actual.height = size;
        const actualContext = actual.getContext('2d');
        if (!actualContext) throw new Error('Canvas unavailable');
        actualContext.drawImage(image, 0, 0);
        const pixels = actualContext.getImageData(0, 0, size, size).data;
        return {
          name,
          dimensions: image.width === size && image.height === size,
          exact: pixels.every((channel, index) => channel === expectedPixels[index]),
          safe,
          extent: Math.max(maxX - minX + 1, maxY - minY + 1) / size,
          centerX: (minX + maxX + 1) / 2 - size / 2,
          centerY: (minY + maxY + 1) / 2 - size / 2,
          corner: Array.from(pixels.slice(0, 4)),
          size,
        };
      }),
    );
  });
  for (const icon of checks) {
    expect(icon.dimensions, icon.name).toBe(true);
    expect(icon.exact, icon.name).toBe(true);
    expect(icon.safe, icon.name).toBe(true);
    expect(Math.abs(icon.extent - 0.64), icon.name).toBeLessThanOrEqual(2 / icon.size);
    expect(Math.abs(icon.centerX), icon.name).toBeLessThanOrEqual(1);
    expect(Math.abs(icon.centerY), icon.name).toBeLessThanOrEqual(1);
    expect(icon.corner, icon.name).toEqual(
      icon.name.startsWith('push-badge') ? [0, 0, 0, 0] : [255, 255, 255, 255],
    );
  }
});

async function mockBackend(page: Page): Promise<void> {
  await mockMarketplace(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      origin: process.env['PWA_TEST_BACKEND_ORIGIN'] ?? 'http://127.0.0.1:54351',
      userId: '25000000-0000-4000-8000-000000000001',
    },
  );
}

test.describe('Android install dialog', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  test('keeps manual help on the current page, handles late native offers and confirmed installation @pwa-layout', async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto('/settings/notifications');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    const install = page
      .locator('app-sidebar')
      .getByRole('button', { name: 'App installieren', exact: true });
    await install.click();
    const dialog = page.getByRole('dialog', { name: 'Flipbase installieren' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/notifications$/);
    const geometry = await dialog.evaluate((element) => {
      const card = element.firstElementChild;
      if (!card) throw new Error('Dialog card missing');
      return {
        position: getComputedStyle(element).position,
        width: card.getBoundingClientRect().width,
        radius: getComputedStyle(card).borderTopLeftRadius,
        viewport: innerWidth,
      };
    });
    expect(geometry.position).toBe('fixed');
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport - 24);
    expect(parseFloat(geometry.radius)).toBeGreaterThanOrEqual(8);
    await page.screenshot({
      path: '.superpowers/task2-install-android-light.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({
      path: '.superpowers/task2-install-android-dark.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.evaluate(axe.source);
    const violations = await page.evaluate(
      async () =>
        (await (window as unknown as { axe: typeof axe }).axe.run('app-pwa-install-dialog'))
          .violations,
    );
    expect(violations).toEqual([]);
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(dialog.getByRole('button', { name: 'Jetzt installieren' })).toHaveCount(0);
    await page.evaluate(() => {
      const state = window as unknown as { installPrompts: number };
      state.installPrompts = 0;
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          state.installPrompts++;
        },
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(event);
    });
    expect(
      await page.evaluate(() => (window as unknown as { installPrompts: number }).installPrompts),
    ).toBe(0);
    await dialog.getByRole('button', { name: 'Jetzt installieren' }).click();
    await expect(dialog).toContainText('nicht bestätigt');
    expect(
      await page.evaluate(() => (window as unknown as { installPrompts: number }).installPrompts),
    ).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(install).toBeFocused();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(install).toHaveCount(0);
    await page.reload();
    await expect(page.locator('app-notification-settings')).toBeVisible();
    await expect(install).toHaveCount(0);
  });
});

test('places device settings before webhooks and exposes the bell settings link on Windows @pwa-layout', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockBackend(page);
  await page.addInitScript(() => {
    const state = window as unknown as { pushPermissions: number };
    state.pushPermissions = 0;
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: async () => {
          state.pushPermissions++;
          return 'granted';
        },
      },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    const subscription = {
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { auth: 'auth', p256dh: 'key' },
      }),
      unsubscribe: async () => true,
    };
    const registration = {
      active: {},
      pushManager: { getSubscription: async () => null, subscribe: async () => subscription },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        controller: null,
        register: async () => registration,
        getRegistration: async () => registration,
      }),
    });
  });
  let savedCategories: string[] | null = null;
  await page.route('**/functions/v1/push-settings', async (route) => {
    const request = route.request().postDataJSON() as {
      action: string;
      apiVersion: number;
      generationId: string;
      deviceId: string;
      workspaceId: string;
      categories: string[];
    };
    expect(request.apiVersion).toBe(2);
    if (request.action === 'register')
      return route.fulfill({ json: { deviceId: request.generationId, active: true } });
    if (request.action === 'preferences') {
      savedCategories = request.categories;
      return route.fulfill({
        json: {
          deviceId: request.deviceId,
          workspaceId: request.workspaceId,
          categories: request.categories,
        },
      });
    }
    return route.fulfill({
      json: {
        enabled: true,
        publicKey: Buffer.alloc(65, 4).toString('base64url'),
        keyId: 'key1',
        binding: null,
        preferences: [],
        allowedCategories: ['message', 'order', 'favorite', 'connection'],
      },
    });
  });
  await page.goto('/settings/notifications');
  const settings = page.locator('app-notification-settings');
  await expect(settings.getByRole('heading').first()).toHaveText('Push-Benachrichtigungen');
  const help = settings.getByRole('button', { name: 'Infos zu Push-Benachrichtigungen' });
  await expect(settings.locator('#push-help')).toHaveCount(0);
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(settings.locator('#push-help')).toContainText('auch bei geschlossener App');
  await help.click();
  await expect(settings.locator('#push-help')).toHaveCount(0);
  await expect(
    page.locator('app-sidebar').getByRole('button', { name: 'App installieren' }),
  ).toHaveCount(0);
  const activation = settings.getByRole('button', {
    name: 'Push aktivieren',
    exact: true,
  });
  await expect(activation).toBeEnabled();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const fontSize of ['13px', '26px']) {
      await activation.evaluate((button, fontSize) => {
        button.style.fontSize = fontSize;
      }, fontSize);
      const geometry = await activation.evaluate((button) => ({
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        fits: button.getBoundingClientRect().right <= innerWidth,
        labelWraps: button.querySelector('span')
          ? getComputedStyle(button.querySelector('span') as HTMLSpanElement).whiteSpace
          : '',
        height: button.getBoundingClientRect().height,
        textFitsLine:
          parseFloat(getComputedStyle(button).lineHeight) >=
          parseFloat(getComputedStyle(button).fontSize),
      }));
      expect(geometry.pageFits).toBe(true);
      expect(geometry.fits).toBe(true);
      expect(geometry.labelWraps).toBe('normal');
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.textFitsLine).toBe(true);
    }
  }
  await page.screenshot({
    path: testInfo.outputPath('push-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await activation.evaluate((button) => {
    button.style.fontSize = '';
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(() => (window as unknown as { pushPermissions: number }).pushPermissions),
  ).toBe(0);
  const favorites = settings.getByRole('checkbox', {
    name: 'Neue Favoriten für deine Vinted-Inserate',
    exact: true,
  });
  expect(
    await favorites.evaluate((button) => button.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(64);
  await favorites.click();
  await expect(favorites).toHaveAttribute('aria-checked', 'false');
  await activation.click();
  await expect(settings.getByRole('status')).toHaveText('Dieses Gerät ist für Push aktiviert.');
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  expect(savedCategories).toEqual(['message', 'order', 'connection']);
  await page.evaluate(axe.source);
  for (const [theme, width] of [
    ['light', 1280],
    ['dark', 390],
    ['light', 1024],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
      theme,
    );
    await settings.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            'app-notification-settings app-card',
          )
        ).violations,
    );
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`push-${theme}-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(() => (window as unknown as { pushPermissions: number }).pushPermissions),
  ).toBe(1);
  await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Benachrichtigungen einstellen' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('push-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(pageErrors).toEqual([]);
});
