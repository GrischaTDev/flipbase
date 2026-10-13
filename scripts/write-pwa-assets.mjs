import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';

const output = resolve(process.argv[2] ?? 'dist/flipbase/browser');
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const rootFiles =
  /^(?:index\.html|manifest\.webmanifest|favicon\.ico|app-startup\.js|[\w-]+\.(?:js|css))$/;
const staticDirectories = /^(?:images|icons|fonts|i18n)\//;
const staticExtensions = /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|ico|webp|avif|json)$/;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.isFile()) {
      const name = relative(output, path).split(sep).join('/');
      if (name === 'sw.js' || name === 'pwa-assets.json' || name === 'deployment.json') continue;
      if (rootFiles.test(name) || (staticDirectories.test(name) && staticExtensions.test(name))) {
        files.push({ url: `/${name}`, sha256: sha256(await readFile(path)) });
      }
    }
  }
  return files;
}

const workerPath = join(output, 'sw.js');
const template = await readFile(workerPath, 'utf8');
if (!template.includes('__PWA_BUILD_ID__') || !template.includes('__PWA_INVENTORY_SHA256__')) {
  throw new Error(
    'PWA-Bau erwartet die unveränderte Worker-Vorlage. Erzeuge zuerst einen frischen Angular-Bau.',
  );
}
const assets = (await collect(output)).sort((left, right) =>
  left.url.localeCompare(right.url, 'en'),
);
if (!assets.some((asset) => asset.url === '/index.html'))
  throw new Error('index.html fehlt im PWA-Bau.');
const buildId = sha256(JSON.stringify({ assets, template }));
// Die Identität folgt den unveränderten Eingabedateien. Erst danach trägt die
// HTML-Hülle sie für noch laufende Clients ein; der Inventarhash prüft die Ausgabe.
const indexPath = join(output, 'index.html');
await writeFile(
  indexPath,
  (await readFile(indexPath, 'utf8')).replace('<html', `<html data-flipbase-build="${buildId}"`),
);
const indexAsset = assets.find((asset) => asset.url === '/index.html');
indexAsset.sha256 = sha256(await readFile(indexPath));
const inventory = JSON.stringify({ version: 1, buildId, assets });
await writeFile(join(output, 'pwa-assets.json'), inventory);
await writeFile(
  workerPath,
  template
    .replaceAll('__PWA_BUILD_ID__', buildId)
    .replaceAll('__PWA_INVENTORY_SHA256__', sha256(inventory)),
);
console.log(`PWA-Bau ${buildId.slice(0, 12)}: ${assets.length} geprüfte App-Dateien.`);
