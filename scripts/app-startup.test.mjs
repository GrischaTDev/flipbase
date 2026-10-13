import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const index = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const helperPath = new URL('../public/app-startup.js', import.meta.url);

function start({ storedTheme = 'dark', storageBlocked = false } = {}) {
  const dom = new JSDOM(index, { url: 'https://app.flipbase.de/', runScripts: 'outside-only' });
  const timers = new Map();
  let timerId = 0;
  dom.window.matchMedia = () => ({ matches: false });
  dom.window.setTimeout = (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  };
  dom.window.clearTimeout = (id) => timers.delete(id);
  if (storageBlocked) {
    Object.defineProperty(dom.window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  } else {
    dom.window.localStorage.setItem('flipbase_theme', storedTheme);
  }
  if (existsSync(helperPath)) dom.window.eval(readFileSync(helperPath, 'utf8'));
  return {
    window: dom.window,
    timers,
    tick(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= delay) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

test('startup is visible outside Angular and loads a CSP-compatible external helper', () => {
  const { window } = start();
  assert.ok(window.document.querySelector('#app-startup'));
  assert.equal(window.document.querySelector('app-root #app-startup'), null);
  assert.ok(window.document.querySelector('script[src="app-startup.js"]'));
  assert.equal(window.document.querySelector('script:not([src])'), null);
});

test('startup respects stored theme and warns then offers retry without delaying success', () => {
  const { window, tick, timers } = start();
  assert.equal(window.document.documentElement.classList.contains('dark'), true);
  tick(10_000);
  assert.match(window.document.querySelector('#app-startup-status')?.textContent ?? '', /länger/);
  tick(30_000);
  assert.equal(window.document.querySelector('#app-startup-retry')?.hidden, false);
  window.dispatchEvent(new window.Event('flipbase:startup-ready'));
  assert.equal(window.document.querySelector('#app-startup'), null);
  assert.equal(timers.size, 0);
  window.dispatchEvent(new window.Event('flipbase:startup-failed'));
  assert.equal(window.document.querySelector('#app-startup'), null);
});

test('storage failure does not prevent startup; bootstrap failure is visible immediately', () => {
  const { window } = start({ storageBlocked: true });
  window.dispatchEvent(new window.Event('flipbase:startup-failed'));
  assert.equal(window.document.querySelector('#app-startup-retry')?.hidden, false);
  assert.match(
    window.document.querySelector('#app-startup-status')?.textContent ?? '',
    /gestartet/,
  );
});
