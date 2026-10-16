import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
function fixture(sync = false) {
  const sent = [];
  const replies = [];
  const listeners = {};
  const win = {
    location: { origin: 'https://app.flipbase.de' },
    postMessage: (value) => replies.push(value),
    dispatchEvent: () => {},
    addEventListener: (type, fn) => (listeners[type] = fn),
  };
  win.top = win;
  const context = vm.createContext({
    URL,
    window: win,
    document: { documentElement: { dataset: {} }, readyState: 'complete' },
    setInterval: () => 0,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => {
          sent.push(message);
          callback({
            success: true,
            capabilities: { accounts: true, sync, publish: false },
            result:
              message.type === 'FLIPBASE_KLEINANZEIGEN_STATUS' ? null : { localAccount: null },
          });
        },
      },
    },
  });
  for (const file of ['vinted-local-core.js', 'kleinanzeigen-local-core.js', 'flipbase-bridge.js'])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + file, 'utf8'), context);
  return { win, sent, replies, message: listeners.message };
}
test('advertises accounts only after the Kleinanzeigen background responds, without claiming publishing', () => {
  const f = fixture();
  assert.ok(
    f.replies.some(
      (r) =>
        r.type === 'FLIPBASE_EXTENSION_STATUS' &&
        r.kleinanzeigenCapabilities?.accounts === true &&
        r.kleinanzeigenCapabilities.publish === false,
    ),
  );
});
test('forwards scoped Kleinanzeigen messages and correlates their separate response', () => {
  const f = fixture();
  f.message({
    source: f.win,
    origin: 'https://app.flipbase.de',
    data: { type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'ka-status' },
  });
  assert.ok(
    f.sent.some((r) => r.type === 'FLIPBASE_KLEINANZEIGEN_STATUS' && r.requestId === 'ka-status'),
  );
  assert.ok(
    f.replies.some(
      (r) =>
        r.type === 'FLIPBASE_KLEINANZEIGEN_RESULT' &&
        r.requestId === 'ka-status' &&
        r.success === true,
    ),
  );
});
test('never forwards a message from another window or origin', () => {
  const f = fixture();
  const before = f.sent.length;
  f.message({
    source: {},
    origin: 'https://app.flipbase.de',
    data: { type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'ka-status' },
  });
  f.message({
    source: f.win,
    origin: 'https://evil.example',
    data: { type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'ka-status' },
  });
  assert.equal(f.sent.length, before);
});

test('only announces sync when the actual background adapter supports it', () => {
  const inactive = fixture(false);
  assert.equal(inactive.replies.at(-1).kleinanzeigenCapabilities.sync, false);
  const active = fixture(true);
  assert.equal(active.replies.at(-1).kleinanzeigenCapabilities.sync, true);
  assert.equal(active.replies.at(-1).kleinanzeigenCapabilities.publish, false);
});
