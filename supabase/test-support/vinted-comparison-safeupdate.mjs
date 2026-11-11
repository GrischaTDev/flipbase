import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertComparisonSafetyResult(output) {
  assert.doesNotMatch(
    output,
    /^not ok\b/mu,
    'Vergleichstest mit Produktionsschutz fehlgeschlagen.',
  );
  const plans = [...output.matchAll(/^1\.\.([1-9][0-9]*)$/gmu)];
  assert.equal(plans.length, 1, 'Genau ein abgeschlossener pgTAP-Plan erforderlich.');
  assert.equal([...output.matchAll(/^ok\s+[0-9]+\b/gmu)].length, Number(plans[0][1]));
  assert.match(
    output,
    /^ok [0-9]+ - Der Produktionsschutz gegen unbedingte Updates bleibt eingeschaltet$/mu,
  );
}

export function runComparisonSafetyTest(container, execute = execFileSync) {
  assert.match(
    container ?? '',
    /^supabase_db_flipbase[-_a-z0-9]*$/u,
    'Eine getrennte Flipbase-Testdatenbank ausdrücklich angeben.',
  );
  const sql = readFileSync(
    new URL('../tests/vinted_comparison_market.sql', import.meta.url),
    'utf8',
  );
  // Nur der lokale Testadministrator darf das Modul laden; die Dienstfälle wechseln danach zur echten Rolle.
  const output = execute(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-XAtq',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'COMPARISON_SAFEUPDATE=1',
    ],
    {
      input: 'create extension if not exists pgtap with schema extensions;\n' + sql,
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 2_000_000,
    },
  );
  assertComparisonSafetyResult(output);
  console.log('Vinted-Vergleichsbestand mit aktivem Produktionsschutz geprüft.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runComparisonSafetyTest(process.env.COMPARISON_TEST_DB_CONTAINER);
