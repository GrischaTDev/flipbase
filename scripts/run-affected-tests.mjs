import { spawn } from 'node:child_process';
import { buildBrowserMatrix } from './affected-tests.mjs';

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
  const matrix = buildBrowserMatrix(plan);
  const projects = [...new Set(matrix.map(({ project }) => project))];
  if (!projects.length) throw new Error('Keine Browserfälle ausgewählt.');
  const selectedProject = process.env.AFFECTED_BROWSER_PROJECT;
  if (selectedProject && !projects.includes(selectedProject))
    throw new Error('Nicht ausgewählte Browsergruppe angefordert.');
  const browserArgs = process.argv.slice(3);
  const explicitShard = browserArgs.some((arg) => arg === '--shard' || arg.startsWith('--shard='));
  const selectedMatrix = matrix.filter(
    ({ project }) => !selectedProject || project === selectedProject,
  );
  // Listen zeigen die gesamte Auswahl. Ein CI-Matrixjob übergibt seine eigene
  // Teilgruppe; lokale Ausführung ohne Teilgruppe verwendet dieselbe Matrix.
  const groups =
    explicitShard || browserArgs.includes('--list')
      ? [...new Set(selectedMatrix.map(({ project }) => project))].map((project) => ({
          project,
          shard: '1/1',
        }))
      : selectedMatrix;
  commands = groups.map(({ project, shard }) => [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config=playwright.affected.config.ts',
    `--project=${project}`,
    ...(!explicitShard && shard !== '1/1' ? [`--shard=${shard}`] : []),
    ...browserArgs,
  ]);
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
