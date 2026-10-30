import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const responseModule = new URL('./kleinanzeigen-rest-precision-response.mjs', import.meta.url).href;

function runIsolatedRequest(fetchSource, timeoutMs = 1000) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { readKleinanzeigenPrecisionResponse } from ${JSON.stringify(responseModule)};
      globalThis.fetch = ${fetchSource};
      try {
        console.log(JSON.stringify(await readKleinanzeigenPrecisionResponse('http://127.0.0.1:1/test', ${timeoutMs})));
      } catch (error) {
        console.error(error.name);
        process.exitCode = 17;
      }`,
    ],
    { encoding: 'utf8', timeout: 3000 },
  );
}

test('eine wartende REST-Antwort hält den isolierten Prüfprozess bis zum Ergebnis offen', () => {
  const result = runIsolatedRequest(`() => new Promise(resolve => {
    setTimeout(() => resolve(new Response('[{"target_connection_id":"9007199254740993"}]')), 25).unref();
  })`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    status: 200,
    body: '[{"target_connection_id":"9007199254740993"}]',
  });
});

test('auch das vollständige Lesen des Antworttexts bleibt innerhalb derselben lebenden Zeitgrenze', () => {
  const result =
    runIsolatedRequest(`async () => ({ ok: true, status: 200, text: () => new Promise(resolve => {
    setTimeout(() => resolve('vollständig'), 25).unref();
  }) })`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).body, 'vollständig');
});

test('ein hängender REST-Aufruf scheitert ausdrücklich an seiner Zeitgrenze statt mit Exitcode 13', () => {
  const result = runIsolatedRequest(
    `(_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })`,
    30,
  );
  assert.equal(result.status, 17, result.stderr);
  assert.match(result.stderr, /TimeoutError/u);
});

test('auch ein hängender Antworttext scheitert an der begrenzten REST-Zeitgrenze', () => {
  const result = runIsolatedRequest(
    `async (_url, { signal }) => ({ ok: true, status: 200, text: () => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) })`,
    30,
  );
  assert.equal(result.status, 17, result.stderr);
  assert.match(result.stderr, /TimeoutError/u);
});
