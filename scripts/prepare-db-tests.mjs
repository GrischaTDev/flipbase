import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultFixtures = [
  ['inventory_integrity_legacy.sql', 'inventory_integrity_legacy.sql.inc'],
  ['purchase_costing_legacy.sql', 'purchase_costing_legacy.sql.inc'],
];

const defaultSourcePath = resolve(
  projectRoot,
  'supabase/test-support/fixtures',
  defaultFixtures[0][0],
);
const defaultTargetPath = resolve(projectRoot, 'supabase/tests/.generated', defaultFixtures[0][1]);

async function replaceAtomically(temporaryPath, targetPath) {
  const retryableCodes = new Set(['EACCES', 'EPERM']);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporaryPath, targetPath);
      return;
    } catch (error) {
      if (!retryableCodes.has(error?.code) || attempt >= 9) throw error;
      await delay((attempt + 1) * 5);
    }
  }
}

export async function prepareFixture({
  sourcePath = defaultSourcePath,
  targetPath = defaultTargetPath,
} = {}) {
  if (!targetPath.endsWith('.inc')) {
    throw new Error(
      `Das vorbereitete Fixture muss eine nicht automatisch entdeckbare .inc-Datei sein: ${targetPath}`,
    );
  }

  const targetDirectory = dirname(targetPath);
  const temporaryPath = join(
    targetDirectory,
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(targetDirectory, { recursive: true });
  try {
    await copyFile(sourcePath, temporaryPath);
    await replaceAtomically(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function prepareDbTests() {
  await Promise.all(
    defaultFixtures.map(([sourceName, targetName]) =>
      prepareFixture({
        sourcePath: resolve(projectRoot, 'supabase/test-support/fixtures', sourceName),
        targetPath: resolve(projectRoot, 'supabase/tests/.generated', targetName),
      }),
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await prepareDbTests();
