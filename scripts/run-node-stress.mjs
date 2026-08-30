import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const RUN_COUNT = 20;
const MAX_SEED = 2_147_483_646;
const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

function parseSeed(value, label) {
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > MAX_SEED) {
    throw new Error(`${label} muss eine ganze Zahl zwischen 1 und ${MAX_SEED} sein.`);
  }
  return seed;
}

function hashRun(runId, runAttempt) {
  let hash = 2_166_136_261;
  for (const character of `${runId}:${runAttempt}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % MAX_SEED || 1;
}

export function deriveStressSeeds({ baseSeed, runId, runAttempt } = {}) {
  const base =
    baseSeed !== undefined
      ? parseSeed(baseSeed, 'Basis-Seed')
      : runId
        ? hashRun(runId, runAttempt || '1')
        : 20_260_830;
  return Array.from({ length: RUN_COUNT }, (_, index) => ((base - 1 + index) % MAX_SEED) + 1);
}

export function runNodeStress({
  seeds,
  spawnSyncImpl = spawnSync,
  log = console.log,
  logError = console.error,
} = {}) {
  if (!Array.isArray(seeds) || seeds.length !== RUN_COUNT) {
    throw new Error(`Der Stresslauf benötigt exakt ${RUN_COUNT} Seeds.`);
  }

  for (const [index, seed] of seeds.entries()) {
    log(`[${index + 1}/${RUN_COUNT}] seed=${seed}`);
    const result = spawnSyncImpl(
      process.execPath,
      [vitestCli, 'run', '--project=node', '--sequence.shuffle', `--sequence.seed=${seed}`],
      { stdio: 'inherit', shell: false, env: process.env },
    );
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    if (exitCode !== 0) {
      logError(`Node-Stresslauf fehlgeschlagen: seed=${seed}, exit=${exitCode}`);
      return exitCode;
    }
  }
  return 0;
}

function cliBaseSeed(args) {
  const unknown = args.filter((argument) => !argument.startsWith('--base-seed='));
  if (unknown.length > 0) throw new Error(`Unbekanntes Argument: ${unknown[0]}`);
  const option = args.find((argument) => argument.startsWith('--base-seed='));
  return option?.slice('--base-seed='.length) || process.env['STRESS_BASE_SEED'];
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const seeds = deriveStressSeeds({
      baseSeed: cliBaseSeed(process.argv.slice(2)),
      runId: process.env['GITHUB_RUN_ID'],
      runAttempt: process.env['GITHUB_RUN_ATTEMPT'],
    });
    process.exitCode = runNodeStress({ seeds });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
