import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function browserTestTimings(report) {
  if (!Array.isArray(report?.suites)) throw new Error('Ungültiger Browser-Laufzeitbericht.');
  const timings = [];
  const visit = (suites, parents = []) => {
    for (const suite of suites) {
      const titles = [...parents, suite.title ?? ''];
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          const results = test.results ?? [];
          if (!results.length || results.every(({ status }) => status === 'skipped')) continue;
          if (results.some(({ duration }) => !Number.isFinite(duration) || duration < 0))
            throw new Error('Ungültige Einzelfalldauer im Browser-Laufzeitbericht.');
          timings.push({
            title: [...titles, spec.title].filter(Boolean).join(' › '),
            file: spec.file,
            project: test.projectName,
            duration: results.reduce((sum, result) => sum + result.duration, 0),
            attempts: results.length,
          });
        }
      visit(suite.suites ?? [], titles);
    }
  };
  visit(report.suites);
  return timings.sort((left, right) => right.duration - left.duration);
}

const markdown = (value) =>
  String(value ?? '')
    .replace(/[\r\n]/gu, ' ')
    .replaceAll('|', '\\|')
    .replaceAll('`', "'");

export function browserTimingSummary(report, group = '') {
  const timings = browserTestTimings(report);
  return [
    `### Browserlaufzeiten${group ? ` – ${markdown(group)}` : ''}`,
    '',
    `${timings.length} ausgeführte Fälle. Dauern enthalten gegebenenfalls Wiederholungen.`,
    '',
    '| Langsamste Fälle | Dauer | Versuche |',
    '| --- | ---: | ---: |',
    ...timings
      .slice(0, 5)
      .map(
        ({ title, duration, attempts }) =>
          `| ${markdown(title)} | ${(duration / 1000).toFixed(1)} s | ${attempts} |`,
      ),
    '',
  ].join('\n');
}

export async function writeBrowserTimingSummary(path, environment = process.env) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (
      error.code === 'ENOENT' &&
      ['failure', 'cancelled'].includes(environment.BROWSER_TEST_OUTCOME)
    ) {
      console.log('Kein Laufzeitbericht: Der Browserlauf wurde vor der Berichtsausgabe beendet.');
      return;
    }
    throw error;
  }
  const summary = browserTimingSummary(JSON.parse(contents), environment.BROWSER_TEST_GROUP);
  console.log(summary);
  if (environment.GITHUB_STEP_SUMMARY) await appendFile(environment.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  writeBrowserTimingSummary(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
