import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`PWA-Testbau fehlgeschlagen: ${code}`)),
    );
  });
}
const root = resolve('.superpowers/pwa-test-builds');
await mkdir(root, { recursive: true });
const secondIndex = resolve(root, 'index.html');
await writeFile(
  secondIndex,
  `${await readFile('src/index.html', 'utf8')}\n<!-- Zweiter echter Produktionsbau für die Updateprüfung. -->\n`,
);
for (const name of ['a', 'b']) {
  const output = resolve(root, name);
  await run([
    'node_modules/@angular/cli/bin/ng.js',
    'build',
    '--configuration=production,pwa-testing',
    `--output-path=${output}`,
    ...(name === 'b' ? ['--index=.superpowers/pwa-test-builds/index.html'] : []),
  ]);
  await run(['scripts/write-pwa-assets.mjs', resolve(output, 'browser')]);
}
