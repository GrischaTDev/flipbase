import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [, , barrierDirectory, label, participantCount] = process.argv;
await writeFile(join(barrierDirectory, `${label}.ready`), 'ready');

const deadline = Date.now() + 5000;
while ((await readdir(barrierDirectory)).length < Number(participantCount)) {
  if (Date.now() >= deadline) {
    process.stderr.write(`${label}-barrier-timeout\n`);
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}

process.stdout.write(`${label}-barrier-complete\n`);
