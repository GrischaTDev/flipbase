import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = process.argv[2];
if (!output) {
  throw new Error('Ausgabepfad für deployment.json fehlt.');
}

const configuredCommit = (process.env.FLIPBASE_COMMIT ?? '').trim();
const commit = configuredCommit || 'unbekannt';
if (commit !== 'unbekannt' && !/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error('FLIPBASE_COMMIT muss eine vollständige 40-stellige Git-SHA sein.');
}

const target = resolve(output);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify({ commit })}\n`, 'utf8');
