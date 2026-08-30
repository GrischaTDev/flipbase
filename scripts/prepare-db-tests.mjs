import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultSourcePath = resolve(
  projectRoot,
  'supabase/test-support/fixtures/inventory_integrity_legacy.sql',
);
const defaultTargetPath = resolve(
  projectRoot,
  'supabase/tests/.generated/inventory_integrity_legacy.sql.inc',
);

export async function prepareFixture({
  sourcePath = defaultSourcePath,
  targetPath = defaultTargetPath,
} = {}) {
  if (!targetPath.endsWith('.inc')) {
    throw new Error(
      `Das vorbereitete Fixture muss eine nicht automatisch entdeckbare .inc-Datei sein: ${targetPath}`,
    );
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await prepareFixture();
