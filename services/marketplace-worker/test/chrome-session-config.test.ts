import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChromeSessionConfiguration } from '../runtime/chrome-session-config.ts';

const configuration = { headless: false, locale: 'de-DE', viewport: { width: 1280, height: 900 } };

test('starts ordinary Chrome with its persistent directory and without automation arguments', () => {
  const result = parseChromeSessionConfiguration(configuration);
  assert.deepEqual({ width: result.width, height: result.height }, configuration.viewport);
  assert.ok(result.argumentsList.includes('--user-data-dir=/profile'));
  assert.ok(result.argumentsList.includes('--remote-debugging-port=9223'));
  assert.equal(result.argumentsList.at(-1), 'about:blank');
  assert.equal(
    result.argumentsList.some((argument) =>
      /enable-automation|no-sandbox|user-agent/.test(argument),
    ),
    false,
  );
});

test('keeps authenticated upstream credentials out of browser arguments', () => {
  const result = parseChromeSessionConfiguration({
    ...configuration,
    proxy: {
      server: 'http://196.44.122.35:12323',
      username: 'fixture-user',
      password: 'fixture-password',
    },
  });
  assert.ok(result.argumentsList.includes('--proxy-server=http://127.0.0.1:3128'));
  assert.ok(result.argumentsList.includes('--proxy-bypass-list=<-loopback>'));
  assert.equal(
    result.argumentsList.some((argument) => /fixture-user|fixture-password/.test(argument)),
    false,
  );
  assert.equal(result.proxy?.password, 'fixture-password');
});

test('rejects unknown settings, invalid dimensions, headless mode and unsafe proxy addresses', () => {
  for (const invalid of [
    { ...configuration, args: ['--no-sandbox'] },
    { ...configuration, headless: true },
    { ...configuration, locale: '--no-sandbox' },
    { ...configuration, viewport: { width: -1, height: 900 } },
    { ...configuration, viewport: { width: 1280, height: 900, extra: true } },
    { ...configuration, proxy: { server: 'http://127.0.0.1:8000' } },
    { ...configuration, proxy: { server: 'http://user:password@196.44.122.35:12323' } },
    { ...configuration, proxy: { server: 'socks5://196.44.122.35:12323' } },
    { ...configuration, proxy: { server: 'http://196.44.122.35:12323', password: 123 } },
  ])
    assert.throws(() => parseChromeSessionConfiguration(invalid));
});
