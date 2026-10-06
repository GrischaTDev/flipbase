import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const binding = {
  workspaceId,
  connectionId,
  externalAccountId: '123',
  username: 'maike',
  appOrigin: 'https://app.flipbase.de',
  state: 'linked',
};
const readiness = {
  state: 'ready',
  workspaceId,
  connectionId,
  externalAccountId: '123',
  checkedAt: '2026-10-06T10:00:00.000Z',
  version: '1.6.0',
};

async function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><body><main><button>Vinted</button></main></body>', {
    url: 'https://www.vinted.de/member/999-someone-else',
    runScripts: 'outside-only',
  });
  const calls = [];
  dom.window.FlipbaseVintedLocal = core;
  dom.window.AbortSignal = AbortSignal;
  dom.window.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://extension/${path}`,
      sendMessage: async (message) => {
        calls.push(message);
        if (message.type === 'VINTED_LOCAL_ACCOUNT_READINESS') {
          if (options.waitForReadiness) await options.waitForReadiness;
          if (options.rejectReadiness) throw new Error('Background unavailable');
          return { success: true, result: options.readiness ?? readiness };
        }
        if (message.type === 'VINTED_LOCAL_ACCOUNT_RECHECK') {
          return { success: true, result: options.recheckReadiness ?? readiness };
        }
        return {
          success: true,
          result: {
            reserved: options.reserved ?? false,
            binding: options.binding === undefined ? binding : options.binding,
            readiness: options.readiness ?? readiness,
          },
        };
      },
    },
  };
  dom.window.fetch = async () => ({
    ok: true,
    status: 200,
    url: 'https://www.vinted.de/api/v2/users/current',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ user: { id: 123, login: 'maike' } }),
  });
  dom.window.eval(
    readFileSync(
      new URL('../tools/flipbase-extension/vinted-local-account.js', import.meta.url),
      'utf8',
    ),
  );
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  await flush();
  return {
    dom,
    document: dom.window.document,
    calls,
    flush,
    async open() {
      dom.window.document.querySelector('#flipbase-vinted-account-toggle').click();
      await flush();
      return dom.window.document.querySelector('#flipbase-vinted-account-panel');
    },
  };
}

test('Account modal separates a verified runtime from stored assignment and opens real scoped settings', async (context) => {
  const setup = await fixture();
  context.after(() => setup.dom.window.close());
  const panel = await setup.open();
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.match(panel.textContent, /Lokal verknüpft/);
  assert.match(panel.textContent, /Dieses Browserprofil ist verbunden/);
  assert.match(panel.textContent, /maike/);
  assert.ok(panel.querySelector('time[datetime="2026-10-06T10:00:00.000Z"]'));
  const settings = Array.from(panel.querySelectorAll('a')).find((link) =>
    /Favoriten/.test(link.textContent),
  );
  assert.equal(
    settings.href,
    `https://app.flipbase.de/marketplaces/vinted/accounts?settings=${connectionId}&workspaceId=${workspaceId}`,
  );
  const disconnect = Array.from(panel.querySelectorAll('a')).find((link) =>
    /Freigabe trennen/.test(link.textContent),
  );
  assert.equal(
    disconnect.href,
    `https://app.flipbase.de/marketplaces/vinted/accounts?disconnect=${connectionId}&workspaceId=${workspaceId}`,
  );
  assert.equal(panel.querySelector('input, [role="switch"]'), null);
  assert.ok(setup.calls.some((message) => message.type === 'VINTED_LOCAL_ACCOUNT_READINESS'));
});

test('Explicit retry checks recoverable states with a payload-free request and refreshes the scoped status', async (context) => {
  for (const state of [
    'login_required',
    'challenge_required',
    'permission_required',
    'unavailable',
  ]) {
    const setup = await fixture({ readiness: { ...readiness, state } });
    context.after(() => setup.dom.window.close());
    const panel = await setup.open();
    assert.equal(
      setup.calls.some((message) => message.type === 'VINTED_LOCAL_ACCOUNT_RECHECK'),
      false,
    );
    const retry = Array.from(panel.querySelectorAll('button')).find(
      (button) => button.textContent === 'Erneut prüfen',
    );
    assert.ok(retry, `A recoverable ${state} status needs an explicit retry`);
    retry.click();
    await setup.flush();
    assert.deepEqual(
      setup.calls
        .filter((message) => message.type === 'VINTED_LOCAL_ACCOUNT_RECHECK')
        .map((message) => JSON.parse(JSON.stringify(message))),
      [{ type: 'VINTED_LOCAL_ACCOUNT_RECHECK' }],
    );
    assert.match(panel.textContent, /Dieses Browserprofil ist verbunden/);
    assert.ok(panel.querySelector(`a[href*="settings=${connectionId}"]`));
  }
});

test('Explicit retry cannot display readiness or settings from a different account', async (context) => {
  const setup = await fixture({
    readiness: { ...readiness, state: 'login_required' },
    recheckReadiness: { ...readiness, connectionId: '33333333-3333-4333-8333-333333333333' },
  });
  context.after(() => setup.dom.window.close());
  const panel = await setup.open();
  Array.from(panel.querySelectorAll('button'))
    .find((button) => button.textContent === 'Erneut prüfen')
    ?.click();
  await setup.flush();
  assert.ok(setup.calls.some((message) => message.type === 'VINTED_LOCAL_ACCOUNT_RECHECK'));
  assert.doesNotMatch(panel.textContent, /Dieses Browserprofil ist verbunden/);
  assert.equal(panel.querySelector('a[href*="settings="]'), null);
});

test('Manual pause, blocked account and changed identity do not offer an explicit retry', async (context) => {
  for (const state of ['paused', 'blocked', 'identity_mismatch']) {
    const setup = await fixture({ readiness: { ...readiness, state } });
    context.after(() => setup.dom.window.close());
    const panel = await setup.open();
    assert.equal(
      Array.from(panel.querySelectorAll('button')).some(
        (button) => button.textContent === 'Erneut prüfen',
      ),
      false,
    );
  }
});

test('Account modal traps focus, closes on Escape and restores focus without leaving the page inert', async (context) => {
  const setup = await fixture();
  context.after(() => setup.dom.window.close());
  const toggle = setup.document.querySelector('#flipbase-vinted-account-toggle');
  toggle.focus();
  const panel = await setup.open();
  assert.equal(setup.document.querySelector('main').hasAttribute('inert'), true);
  const controls = Array.from(panel.querySelectorAll('button, a[href]'));
  controls.at(-1).focus();
  controls.at(-1).dispatchEvent(
    new setup.dom.window.KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(setup.document.activeElement, controls[0]);
  controls[0].dispatchEvent(
    new setup.dom.window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(setup.document.activeElement, controls.at(-1));
  panel.dispatchEvent(
    new setup.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal(panel.hidden, true);
  assert.equal(setup.document.activeElement, toggle);
  assert.equal(setup.document.querySelector('main').hasAttribute('inert'), false);
});

test('Stored binding never turns unavailable or another account status into readiness', async (context) => {
  for (const status of [
    { ...readiness, state: 'unavailable' },
    { ...readiness, state: 'unavailable', checkedAt: null },
    { ...readiness, connectionId: '33333333-3333-4333-8333-333333333333' },
    { ...readiness, workspaceId: '33333333-3333-4333-8333-333333333333' },
    { ...readiness, externalAccountId: '456' },
    { ...readiness, checkedAt: null },
  ]) {
    const setup = await fixture({ readiness: status });
    context.after(() => setup.dom.window.close());
    const panel = await setup.open();
    assert.doesNotMatch(panel.textContent, /Dieses Browserprofil ist verbunden/);
    assert.match(panel.textContent, /maike/);
    assert.equal(panel.querySelector('a[href*="settings="]'), null);
  }
});

test('Unsafe stored origin or connection identifiers cannot create scoped account links', async (context) => {
  for (const invalidBinding of [
    { ...binding, appOrigin: 'https://evil.example' },
    { ...binding, connectionId: '../other-account' },
    { ...binding, workspaceId: 'invalid' },
    { ...binding, externalAccountId: '../123' },
  ]) {
    const setup = await fixture({ binding: invalidBinding });
    context.after(() => setup.dom.window.close());
    const panel = await setup.open();
    for (const link of panel.querySelectorAll('a')) {
      assert.equal(new URL(link.href).origin, 'https://app.flipbase.de');
      assert.equal(new URL(link.href).searchParams.has('settings'), false);
      assert.equal(new URL(link.href).searchParams.has('disconnect'), false);
    }
  }
});

test('Failed readiness preserves stored account without claiming a current connection', async (context) => {
  const setup = await fixture({ rejectReadiness: true });
  context.after(() => setup.dom.window.close());
  const panel = await setup.open();
  assert.match(panel.textContent, /maike/);
  assert.match(panel.textContent, /gespeicherte Zuordnung/);
  assert.doesNotMatch(panel.textContent, /Dieses Browserprofil ist verbunden/);
  assert.equal(panel.querySelector('a[href*="settings="]'), null);
});

test('Modal closes via its backdrop and restores pre-existing inert attributes', async (context) => {
  const setup = await fixture();
  context.after(() => setup.dom.window.close());
  const main = setup.document.querySelector('main');
  main.setAttribute('inert', '');
  const panel = await setup.open();
  setup.document.querySelector('#flipbase-vinted-account-backdrop').click();
  assert.equal(panel.hidden, true);
  assert.equal(main.getAttribute('inert'), '');
});

test('Delayed readiness does not reopen or populate a closed modal', async (context) => {
  let finish;
  const waitForReadiness = new Promise((resolve) => {
    finish = resolve;
  });
  const setup = await fixture({ waitForReadiness });
  context.after(() => setup.dom.window.close());
  const panel = await setup.open();
  panel.dispatchEvent(
    new setup.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  finish();
  await setup.flush();
  assert.equal(panel.hidden, true);
  assert.doesNotMatch(panel.textContent, /Dieses Browserprofil ist verbunden/);
});

test('Account modal reports pause, login, permission and challenge without exposing settings switches', async (context) => {
  for (const [state, label] of [
    ['paused', /Pausiert/],
    ['login_required', /Bei Vinted anmelden/],
    ['permission_required', /Websitezugriff/],
    ['challenge_required', /Prüfung bei Vinted/],
    ['revoked', /Nicht mehr freigegeben/],
    ['expired', /Freigabe erneuern/],
    ['identity_mismatch', /Anderes Vinted-Konto/],
  ]) {
    const setup = await fixture({ readiness: { ...readiness, state } });
    context.after(() => setup.dom.window.close());
    const panel = await setup.open();
    assert.match(panel.textContent, label);
    assert.doesNotMatch(panel.textContent, /Dieses Browserprofil ist verbunden/);
    assert.equal(panel.querySelector('[role="switch"]'), null);
  }
});

test('Account modal has labelled controls and no accessibility findings', async (context) => {
  const setup = await fixture();
  context.after(() => setup.dom.window.close());
  const panel = await setup.open();
  setup.dom.window.eval(require('axe-core').source);
  const result = await setup.dom.window.axe.run(panel, {
    rules: { 'color-contrast': { enabled: false } },
  });
  assert.equal(
    result.violations.length,
    0,
    JSON.stringify(result.violations.map((violation) => violation.id)),
  );
});
