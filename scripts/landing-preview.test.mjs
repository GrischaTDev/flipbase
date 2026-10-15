import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const previewRoot = new URL('../landing/preview/', import.meta.url);
const html = await readFile(new URL('index.html', previewRoot), 'utf8');
const script = await readFile(new URL('preview.js', previewRoot), 'utf8');
const themeScript = await readFile(new URL('theme.js', previewRoot), 'utf8');
const stylesheets = await Promise.all(
  ['preview.css', 'dashboard-replica.css', 'app-mockups.css'].map((file) =>
    readFile(new URL(file, previewRoot), 'utf8'),
  ),
);
const applicationScript = await readFile(new URL('../beta-application.js', previewRoot), 'utf8');

function createPreview({
  reduced = false,
  mobile = false,
  dark = false,
  savedTheme = null,
  blockedStorage = false,
} = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/preview/' });
  const { window } = dom;
  const timers = new Map();
  const media = new Map();
  let nextTimer = 0;
  let observeEntries;
  let isHidden = false;
  Object.defineProperty(window.document, 'hidden', { get: () => isHidden });
  window.matchMedia = (query) => {
    const result = new window.EventTarget();
    result.matches = query.includes('reduced-motion')
      ? reduced
      : query.includes('color-scheme')
        ? dark
        : mobile;
    media.set(query, result);
    return result;
  };
  window.setInterval = (callback, delay) => {
    const timerId = ++nextTimer;
    timers.set(timerId, { callback, delay });
    return timerId;
  };
  window.clearInterval = (timerId) => timers.delete(timerId);
  window.IntersectionObserver = class {
    constructor(callback) {
      observeEntries = callback;
    }
    observe() {}
  };
  if (savedTheme) window.localStorage.setItem('flipbase_landing_theme', savedTheme);
  if (blockedStorage)
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage blocked');
      },
    });
  window.eval(themeScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.eval(script);
  window.eval(applicationScript);
  return {
    dom,
    window,
    document: window.document,
    timers,
    media,
    intersect(id, isIntersecting) {
      observeEntries([{ target: window.document.getElementById(id), isIntersecting }]);
    },
    setHidden(hidden) {
      isHidden = hidden;
      window.document.dispatchEvent(new window.Event('visibilitychange'));
    },
    tick(delay) {
      [...timers.values()]
        .filter((timer) => timer.delay === delay)
        .forEach((timer) => timer.callback());
    },
  };
}

test('preview keeps a readable static fallback and resolves its local assets', async () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.equal(document.documentElement.lang, 'de');
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
  assert.equal(document.querySelectorAll('.workflow-panel:not([hidden])').length, 3);
  assert.equal(document.getElementById('profit-scene').dataset.phase, '3');
  for (const element of document.querySelectorAll('img[src], script[src], link[href]')) {
    const reference = element.getAttribute('src') ?? element.getAttribute('href');
    assert.ok(!/^https?:/u.test(reference), 'Preview must not load remote assets');
    assert.equal((await stat(new URL(reference, previewRoot))).isFile(), true);
  }
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(link.hash.slice(1)), `Missing target ${link.hash}`);
  }
  assert.ok(document.querySelectorAll('a[href="#beta-anmeldung"]').length >= 6);
  assert.equal(document.querySelector('#beta-anmeldung form').id, 'zweit-bewerbung-form');
  assert.equal(
    document.querySelector('button[type="submit"]').disabled,
    true,
    'Without JavaScript, personal details must never submit through a GET request',
  );
  dom.window.close();
});

function readEuro(text) {
  return Number(text.replace(/[^\d,]/gu, '').replace(',', '.'));
}

function listText(root, selector) {
  return [...root.querySelectorAll(selector)].map((element) =>
    element.textContent.replace(/\s+/gu, ' ').trim(),
  );
}

test('hero shows a replica of the real Flipbase dashboard instead of borrowed competitor elements', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.equal(
    document.querySelector('h1').textContent.replace(/\s+/gu, ' ').trim(),
    'Die Warenwirtschaft für dein Reselling.',
  );
  const replica = document.getElementById('dashboard-replica');
  assert.equal(replica.getAttribute('role'), 'img');
  assert.match(replica.getAttribute('aria-label'), /Beispiel/u);
  assert.deepEqual(listText(replica, '[data-nav-group]'), [
    'Warenwirtschaft',
    'Marktplätze',
    'Finanzen',
    'Tools',
  ]);
  assert.deepEqual(listText(replica, '[data-nav-active]'), ['Dashboard']);
  assert.deepEqual(listText(replica, '[data-kpi-label]'), [
    'Umsatz',
    'Gewinn',
    'Marge',
    'Kapital im Bestand',
    'Verkäufe',
  ]);
  assert.deepEqual(listText(replica, '[data-chart-legend]'), [
    'Umsatz',
    'Ausgaben gesamt',
    'Gewinn',
  ]);
  assert.match(replica.closest('figure').querySelector('figcaption').textContent, /Beispieldaten/u);
  for (const borrowed of [
    '⌘',
    'Persönlicher Arbeitsbereich',
    'Dein Geschäft im Überblick',
    'Verkaufsentwicklung',
  ]) {
    assert.ok(!document.body.textContent.includes(borrowed), `Borrowed element: ${borrowed}`);
  }
  dom.window.close();
});

test('dashboard example figures agree with the chart they summarize', () => {
  const dom = new JSDOM(html);
  const replica = dom.window.document.getElementById('dashboard-replica');
  const kpi = (key) => replica.querySelector(`[data-kpi="${key}"] [data-kpi-value]`).textContent;
  const seriesTotal = (series) =>
    [...replica.querySelectorAll(`[data-series="${series}"]`)].reduce(
      (total, bar) => total + Number(bar.style.getPropertyValue('--value')),
      0,
    );
  const revenue = readEuro(kpi('revenue'));
  const profit = readEuro(kpi('gross-profit'));
  assert.equal(seriesTotal('revenue'), revenue);
  assert.equal(seriesTotal('profit'), profit);
  assert.ok(seriesTotal('expenses') > 0);
  assert.equal(replica.querySelectorAll('[data-series]').length % 3, 0);
  assert.equal(
    kpi('margin'),
    `${((profit / revenue) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`,
  );
  dom.window.close();
});

test('sections use plain headings without decorative capital labels', () => {
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelectorAll('.eyebrow').length, 0);
  for (const stylesheet of stylesheets) {
    assert.doesNotMatch(stylesheet, /text-transform:\s*uppercase/u);
  }
  assert.match(
    stylesheets.join('\n'),
    /\[data-motion='on'\][^{]*\.replica-bar/u,
    'Chart bars may only grow while animations are allowed',
  );
  dom.window.close();
});

test('theme follows the system until an explicit choice, and restores that choice after reload', () => {
  const preview = createPreview();
  const root = preview.document.documentElement;
  const button = preview.document.getElementById('theme-toggle');
  assert.equal(root.dataset.theme, 'light');
  const preference = preview.media.get('(prefers-color-scheme: dark)');
  preference.matches = true;
  preference.dispatchEvent(new preview.window.Event('change'));
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(preview.document.querySelector('meta[name="theme-color"]').content, '#16181d');
  button.click();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Dunklen Modus aktivieren');
  preference.dispatchEvent(new preview.window.Event('change'));
  assert.equal(root.dataset.theme, 'light', 'System changes must preserve an explicit choice');
  const savedTheme = preview.window.localStorage.getItem('flipbase_landing_theme');
  const reloaded = createPreview({ dark: true, savedTheme });
  assert.equal(reloaded.document.documentElement.dataset.theme, 'light');
  preview.dom.window.close();
  reloaded.dom.window.close();
});

test('theme handles invalid preferences and blocked storage without breaking controls', () => {
  for (const options of [{ savedTheme: 'invalid' }, { blockedStorage: true }]) {
    const preview = createPreview({ ...options, dark: true });
    assert.equal(preview.document.documentElement.dataset.theme, 'dark');
    preview.document.getElementById('theme-toggle').click();
    assert.equal(preview.document.documentElement.dataset.theme, 'light');
    preview.document.querySelector('[data-crop="square"]').click();
    assert.equal(preview.document.getElementById('crop-photo').dataset.ratio, 'square');
    preview.dom.window.close();
  }
});

test('image format buttons select one crop and update its visible ratio', () => {
  const preview = createPreview();
  const square = preview.document.querySelector('[data-crop="square"]');
  const portrait = preview.document.querySelector('[data-crop="portrait"]');
  square.click();
  assert.equal(square.getAttribute('aria-pressed'), 'true');
  assert.equal(portrait.getAttribute('aria-pressed'), 'false');
  assert.equal(preview.document.getElementById('crop-dimensions').textContent, '1 : 1');
  portrait.click();
  assert.equal(preview.document.getElementById('crop-photo').dataset.ratio, 'portrait');
  assert.equal(preview.document.getElementById('crop-dimensions').textContent, '4 : 5');
  preview.dom.window.close();
});

test('mobile navigation closes on selection, Escape, outside click, focus exit and desktop resize', () => {
  const preview = createPreview({ mobile: true });
  const button = preview.document.getElementById('nav-menu-button');
  const header = preview.document.querySelector('.site-header');
  for (const close of [
    () => preview.document.querySelector('#landing-navigation a').click(),
    () =>
      preview.document.dispatchEvent(
        new preview.window.KeyboardEvent('keydown', { key: 'Escape' }),
      ),
    () => preview.document.querySelector('main').click(),
    () =>
      header.dispatchEvent(
        new preview.window.FocusEvent('focusout', {
          relatedTarget: preview.document.querySelector('main'),
        }),
      ),
    () => preview.media.get('(max-width: 760px)').dispatchEvent(new preview.window.Event('change')),
  ]) {
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    close();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(header.classList.contains('nav-open'), false);
  }
  button.click();
  preview.document.dispatchEvent(new preview.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(preview.document.activeElement, button);
  preview.dom.window.close();
});

test('new product scenes animate only in view and show complete examples when paused or reduced', () => {
  for (const reduced of [false, true]) {
    const preview = createPreview({ reduced });
    for (const id of ['feed-scene', 'listing-scene', 'expenses-scene']) {
      const scene = preview.document.getElementById(id);
      preview.intersect(id, true);
      preview.tick(2000);
      assert.equal(scene.dataset.frame, reduced ? '3' : '0');
      preview.intersect(id, false);
      assert.equal(preview.timers.size, 0);
    }
    if (!reduced) preview.document.getElementById('motion-toggle').click();
    for (const scene of preview.document.querySelectorAll('[data-animated-scene]')) {
      assert.equal(scene.dataset.frame, '3');
    }
    preview.dom.window.close();
  }
});

test('preview application validates consent, prevents duplicates and confirms via the shared dialog', async () => {
  const preview = createPreview();
  const form = preview.document.getElementById('zweit-bewerbung-form');
  const button = form.querySelector('button[type="submit"]');
  const requests = [];
  let resolveRequest;
  preview.window.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };
  function submit() {
    form.dispatchEvent(new preview.window.Event('submit', { cancelable: true }));
  }
  form.querySelector('[name="firstName"]').value = 'Anna';
  form.querySelector('[name="lastName"]').value = 'Beispiel';
  form.querySelector('[name="email"]').value = 'anna@example.test';
  submit();
  assert.equal(requests.length, 0, 'Consent is required');
  form.querySelector('[name="consent"]').checked = true;
  submit();
  submit();
  assert.equal(requests.length, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(requests[0].url, 'https://api.flipbase.de/functions/v1/beta-application');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    firstName: 'Anna',
    lastName: 'Beispiel',
    email: 'anna@example.test',
    consent: true,
  });
  resolveRequest({ ok: true, json: async () => ({ receiptEmailSent: true }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.disabled, false);
  assert.equal(preview.document.getElementById('beta-success-dialog').hidden, false);
  assert.equal(
    preview.document.getElementById('beta-success-email').textContent,
    'anna@example.test',
  );
  assert.equal(preview.document.activeElement.id, 'beta-success-close');
  assert.equal(preview.document.querySelector('main').inert, true);
  preview.document.getElementById('beta-success-confirm').click();
  assert.equal(preview.document.querySelector('main').inert, false);
  assert.equal(preview.document.activeElement, button);
  preview.dom.window.close();
});

test('failed applications keep entered details and let the visitor retry', async () => {
  const preview = createPreview();
  const form = preview.document.getElementById('zweit-bewerbung-form');
  form.querySelector('[name="firstName"]').value = 'Anna';
  form.querySelector('[name="lastName"]').value = 'Beispiel';
  form.querySelector('[name="email"]').value = 'anna@example.test';
  form.querySelector('[name="consent"]').checked = true;
  preview.window.fetch = async () => ({ ok: false, status: 429 });
  form.dispatchEvent(new preview.window.Event('submit', { cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(form.querySelector('button').disabled, false);
  assert.equal(form.querySelector('[name="email"]').value, 'anna@example.test');
  assert.match(
    preview.document.getElementById('zweit-bewerbung-meldung').textContent,
    /Zu viele Versuche/u,
  );
  assert.equal(preview.document.getElementById('beta-success-dialog').hidden, true);
  preview.dom.window.close();
});

test('animation timers run only for visible scenes and stop when the page is hidden or paused', () => {
  const preview = createPreview();
  assert.equal(preview.timers.size, 0);
  preview.intersect('profit-scene', true);
  assert.equal(preview.timers.size, 1);
  preview.tick(1800);
  assert.equal(preview.document.getElementById('profit-scene').dataset.phase, '0');
  preview.intersect('workflow-scene', true);
  assert.equal(preview.timers.size, 2);
  preview.setHidden(true);
  assert.equal(preview.timers.size, 0);
  preview.setHidden(false);
  assert.equal(preview.timers.size, 2);
  const button = preview.document.getElementById('motion-toggle');
  button.click();
  assert.equal(preview.timers.size, 0);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(preview.document.documentElement.dataset.motion, 'off');
  assert.equal(preview.document.getElementById('profit-scene').dataset.phase, '3');
  preview.setHidden(true);
  preview.setHidden(false);
  assert.equal(preview.timers.size, 0, 'Explicit pause survives visibility changes');
  button.click();
  preview.intersect('profit-scene', false);
  assert.equal(preview.timers.size, 1);
  preview.dom.window.close();
});

test('manual steps expose one corresponding panel and stop automatic selection until replay', () => {
  const preview = createPreview();
  preview.intersect('workflow-scene', true);
  preview.tick(6500);
  assert.equal(preview.document.getElementById('panel-inventory').hidden, false);
  const saleButton = preview.document.getElementById('step-sale');
  saleButton.click();
  assert.equal(preview.document.querySelectorAll('.workflow-panel:not([hidden])').length, 1);
  assert.equal(preview.document.getElementById('panel-sale').hidden, false);
  assert.equal(saleButton.getAttribute('aria-selected'), 'true');
  assert.equal(saleButton.tabIndex, 0);
  assert.equal(preview.timers.size, 0);
  preview.document.getElementById('workflow-replay').click();
  assert.equal(preview.document.getElementById('panel-purchase').hidden, false);
  assert.equal(preview.timers.size, 1);
  preview.dom.window.close();
});

test('keyboard navigation follows orientation and never moves a focused panel automatically', () => {
  for (const mobile of [false, true]) {
    const preview = createPreview({ mobile });
    preview.intersect('workflow-scene', true);
    const firstButton = preview.document.getElementById('step-purchase');
    firstButton.focus();
    assert.equal(preview.timers.size, 0);
    firstButton.dispatchEvent(
      new preview.window.KeyboardEvent('keydown', {
        key: mobile ? 'ArrowRight' : 'ArrowDown',
        bubbles: true,
      }),
    );
    assert.equal(preview.document.activeElement.id, 'step-inventory');
    assert.equal(preview.document.getElementById('panel-inventory').hidden, false);
    preview.document.activeElement.dispatchEvent(
      new preview.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    assert.equal(preview.document.activeElement.id, 'step-sale');
    preview.dom.window.close();
  }
});

test('reduced motion shows the complete calculation and still allows manual workflow navigation', () => {
  const preview = createPreview({ reduced: true });
  preview.intersect('profit-scene', true);
  preview.intersect('workflow-scene', true);
  assert.equal(preview.timers.size, 0);
  assert.equal(preview.document.getElementById('profit-scene').dataset.phase, '3');
  assert.equal(preview.document.getElementById('motion-toggle').disabled, true);
  preview.document.getElementById('step-sale').click();
  assert.equal(preview.document.getElementById('panel-sale').hidden, false);
  const preference = preview.media.get('(prefers-reduced-motion: reduce)');
  preference.matches = false;
  preference.dispatchEvent(new preview.window.Event('change'));
  assert.equal(preview.document.getElementById('motion-toggle').disabled, false);
  assert.equal(preview.timers.size, 1, 'Only the unselected profit scene resumes');
  preference.matches = true;
  preference.dispatchEvent(new preview.window.Event('change'));
  assert.equal(preview.timers.size, 0);
  preview.dom.window.close();
});
