import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checkerPath = fileURLToPath(new URL('./required-checks.mjs', import.meta.url));

function runChecker(overrides = {}) {
  return spawnSync(process.execPath, [checkerPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: 'push',
      TESTS_REUSED: 'false',
      CHANGES_RESULT: 'success',
      APPLICATION_CHANGED: 'true',
      SUPABASE_CHANGED: 'true',
      SNIPER_CHANGED: 'true',
      QUALITY_RESULT: 'success',
      UNIT_RESULT: 'success',
      DATABASE_RESULT: 'success',
      SNIPER_RESULT: 'success',
      BROWSER_RESULT: 'success',
      IMAGE_RESULT: 'success',
      ...overrides,
    },
  });
}

test('akzeptiert einen vollständigen erfolgreichen Push', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
});

test('akzeptiert wiederverwendete PR-Prüfungen nur beim Push mit erfolgreichem Image', () => {
  const reused = {
    TESTS_REUSED: 'true',
    QUALITY_RESULT: 'skipped',
    UNIT_RESULT: 'skipped',
    DATABASE_RESULT: 'skipped',
    SNIPER_RESULT: 'skipped',
    BROWSER_RESULT: 'skipped',
  };
  assert.equal(runChecker(reused).status, 0);
  for (const overrides of [
    { EVENT_NAME: 'pull_request' },
    { CHANGES_RESULT: 'failure' },
    { IMAGE_RESULT: 'failure' },
    { TESTS_REUSED: '' },
    { QUALITY_RESULT: 'cancelled' },
  ]) {
    assert.notEqual(runChecker({ ...reused, ...overrides }).status, 0);
  }
});

test('akzeptiert dokumentationsreine Änderungen nur mit übersprungenen Anwendungsjobs', () => {
  const result = runChecker({
    APPLICATION_CHANGED: 'false',
    SUPABASE_CHANGED: 'false',
    SNIPER_CHANGED: 'false',
    UNIT_RESULT: 'skipped',
    DATABASE_RESULT: 'skipped',
    SNIPER_RESULT: 'skipped',
    BROWSER_RESULT: 'skipped',
    IMAGE_RESULT: 'skipped',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('akzeptiert im Pull Request ein übersprungenes Image', () => {
  const result = runChecker({ EVENT_NAME: 'pull_request', IMAGE_RESULT: 'skipped' });
  assert.equal(result.status, 0, result.stderr);
});

test('verlangt bei einer reinen Sniper-Änderung ein Produktionsabbild', () => {
  const sniperOnly = {
    APPLICATION_CHANGED: 'false',
    SUPABASE_CHANGED: 'false',
    UNIT_RESULT: 'skipped',
    DATABASE_RESULT: 'skipped',
    BROWSER_RESULT: 'skipped',
  };
  const result = runChecker(sniperOnly);
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(runChecker({ ...sniperOnly, IMAGE_RESULT: 'skipped' }).status, 0);
});

test('lehnt Fehler, Abbrüche und unbekannte Änderungsausgaben fail-closed ab', () => {
  const cases = [
    { QUALITY_RESULT: 'failure' },
    { UNIT_RESULT: 'cancelled' },
    { CHANGES_RESULT: 'failure' },
    { APPLICATION_CHANGED: '' },
    { SUPABASE_CHANGED: 'maybe' },
    { SNIPER_CHANGED: 'unknown' },
  ];

  for (const overrides of cases) {
    const result = runChecker(overrides);
    assert.notEqual(result.status, 0, JSON.stringify(overrides));
  }
});

test('lehnt einen unpassenden Erfolgs- oder Skip-Zustand ab', () => {
  const cases = [
    { APPLICATION_CHANGED: 'false', UNIT_RESULT: 'success' },
    { SUPABASE_CHANGED: 'false', DATABASE_RESULT: 'success' },
    { SNIPER_CHANGED: 'false', SNIPER_RESULT: 'success' },
    { EVENT_NAME: 'push', IMAGE_RESULT: 'skipped' },
    { EVENT_NAME: 'pull_request', IMAGE_RESULT: 'success' },
  ];

  for (const overrides of cases) {
    const result = runChecker(overrides);
    assert.notEqual(result.status, 0, JSON.stringify(overrides));
  }
});
