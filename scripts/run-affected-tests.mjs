import { spawn } from 'node:child_process';

const plan = JSON.parse(process.env.AFFECTED_TEST_PLAN ?? 'null');
const [kind, suite, shard] = process.argv.slice(2);
if (
  !plan ||
  typeof plan.full !== 'boolean' ||
  !plan.units ||
  !Array.isArray(plan.browserFiles) ||
  !Array.isArray(plan.changedBrowserFiles)
)
  throw new Error('Gültige betroffene Testauswahl fehlt.');
let args;
if (kind === 'unit') {
  if (!['node', 'dom', 'angular'].includes(suite) || !/^\d+\/\d+$/u.test(shard ?? ''))
    throw new Error('Ungültige Testsuite oder Gruppe.');
  const files = plan.units[suite];
  if (
    !Array.isArray(files) ||
    !files.length ||
    !files.every((file) => typeof file === 'string' && /^src\/.*\.spec\.ts$/u.test(file))
  )
    throw new Error('Angeforderte Testsuite hat keine gültige Auswahl.');
  args = [
    'node_modules/vitest/vitest.mjs',
    'run',
    `--project=${suite}`,
    `--shard=${shard}`,
    ...(plan.full ? [] : files),
  ];
} else if (kind === 'browser') {
  if (!plan.browserFiles.length && !plan.changedBrowserFiles.length)
    throw new Error('Keine Browserfälle ausgewählt.');
  args = [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config=playwright.affected.config.ts',
    ...process.argv.slice(3),
  ];
} else throw new Error('Unbekannte Testart.');
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
