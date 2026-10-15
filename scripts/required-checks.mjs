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
  const documentationOnly = requireBoolean('Nur Dokumentation', process.env.DOCUMENTATION_ONLY);
  requireValue(
    'Qualität',
    process.env.QUALITY_RESULT,
    reused || documentationOnly ? 'skipped' : 'success',
  );
  requireConditional('Dokumentation', documentationOnly, process.env.DOCUMENTATION_RESULT);

  const applicationChanged = requireBoolean('Anwendung', process.env.APPLICATION_CHANGED);
  const applicationTestsChanged = requireBoolean(
    'Anwendungstests',
    process.env.APPLICATION_TESTS_CHANGED,
  );
  const supabaseChanged = requireBoolean('Supabase', process.env.SUPABASE_CHANGED);
  const sniperChanged = requireBoolean('Sniper', process.env.SNIPER_CHANGED);
  const unitRequired = requireBoolean('Betroffene Anwendungstests', process.env.UNIT_REQUIRED);
  const browserRequired = requireBoolean('Betroffene Browserfälle', process.env.BROWSER_REQUIRED);
  const pwaRequired = requireBoolean('Betroffene PWA-Fälle', process.env.PWA_REQUIRED);
  if (!applicationTestsChanged && (unitRequired || browserRequired || pwaRequired))
    throw new Error('Gezielte Testauswahl widerspricht dem Anwendungsumfang.');

  if (
    documentationOnly &&
    (applicationChanged || applicationTestsChanged || supabaseChanged || sniperChanged)
  ) {
    throw new Error('Dokumentationsauswahl widerspricht dem technischen Prüfumfang.');
  }

  // Ohne Frontendprüfung ist ein Release hier nur für reine Dienständerungen erlaubt.
  if (
    (applicationTestsChanged && !applicationChanged) ||
    (applicationChanged && !applicationTestsChanged && (!sniperChanged || supabaseChanged))
  ) {
    throw new Error('Unzulässige Trennung von Release- und Anwendungstestumfang.');
  }
  requireConditional('Anwendungstests', unitRequired && !reused, process.env.UNIT_RESULT);
  requireConditional('Browser-Smoke-Test', browserRequired && !reused, process.env.BROWSER_RESULT);
  requireConditional('Produktions-PWA', pwaRequired && !reused, process.env.PWA_RESULT);
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
