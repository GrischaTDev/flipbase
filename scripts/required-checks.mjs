function requireValue(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name}: erwartet ${expected}, erhalten ${actual || '<leer>'}`);
  }
}

function requireBoolean(name, value) {
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name}: ungültige Änderungsausgabe ${value || '<leer>'}`);
  }
  return value === 'true';
}

function requireConditional(name, changed, result) {
  requireValue(name, result, changed ? 'success' : 'skipped');
}

try {
  requireValue('Änderungserkennung', process.env.CHANGES_RESULT, 'success');
  const reused = requireBoolean('PR-Prüfungen wiederverwendet', process.env.TESTS_REUSED);
  if (reused) requireValue('Wiederverwendung nur nach Merge', process.env.EVENT_NAME, 'push');
  requireValue('Qualität', process.env.QUALITY_RESULT, reused ? 'skipped' : 'success');

  const applicationChanged = requireBoolean('Anwendung', process.env.APPLICATION_CHANGED);
  const supabaseChanged = requireBoolean('Supabase', process.env.SUPABASE_CHANGED);
  const sniperChanged = requireBoolean('Sniper', process.env.SNIPER_CHANGED);

  requireConditional('Anwendungstests', applicationChanged && !reused, process.env.UNIT_RESULT);
  requireConditional(
    'Browser-Smoke-Test',
    applicationChanged && !reused,
    process.env.BROWSER_RESULT,
  );
  requireConditional('Datenbank', supabaseChanged && !reused, process.env.DATABASE_RESULT);
  requireConditional('Sniper-Dienst', sniperChanged && !reused, process.env.SNIPER_RESULT);

  const expectedImage =
    process.env.EVENT_NAME === 'push' && (applicationChanged || sniperChanged)
      ? 'success'
      : 'skipped';
  requireValue('Produktionsabbild', process.env.IMAGE_RESULT, expectedImage);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
