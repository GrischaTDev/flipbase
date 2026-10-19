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
let commands;
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
  commands = [
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      `--project=${suite}`,
      `--shard=${shard}`,
      ...(plan.full ? [] : files),
    ],
  ];
} else if (kind === 'browser') {
  if (!plan.browserFiles.length && !plan.changedBrowserFiles.length)
    throw new Error('Keine Browserfälle ausgewählt.');
  // Jeder Aufruf erhält durch globalSetup eine frische Testsitzung.
  // Eine lange Standardgruppe darf die Anmeldung der geänderten Fälle nicht verbrauchen.
  const projects = [
    ...(plan.browserFiles.length ? ['chromium'] : []),
    ...(plan.changedBrowserFiles.length ? ['changed-tests'] : []),
  ];
  const selectedProject = process.env.AFFECTED_BROWSER_PROJECT;
  if (selectedProject && !projects.includes(selectedProject))
    throw new Error('Nicht ausgewählte Browsergruppe angefordert.');
  const selectedProjects = selectedProject ? [selectedProject] : projects;
  const browserArgs = process.argv.slice(3);
  const explicitShard = browserArgs.some((arg) => arg === '--shard' || arg.startsWith('--shard='));
  commands = selectedProjects.flatMap((project) => {
    // Die volle Auswahl überschreitet auf langsameren Runnern eine 15-Minuten-
    // Sitzung. Drei getrennte Aufrufe behalten alle Fälle und erneuern nur die Anmeldung.
    const groups =
      plan.full && project === 'chromium' && !browserArgs.includes('--list') && !explicitShard
        ? 3
        : 1;
    return Array.from({ length: groups }, (_, index) => [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=playwright.affected.config.ts',
      `--project=${project}`,
      ...(groups > 1 ? [`--shard=${index + 1}/${groups}`] : []),
      ...browserArgs,
    ]);
  });
} else throw new Error('Unbekannte Testart.');
for (const args of commands) {
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.on('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
