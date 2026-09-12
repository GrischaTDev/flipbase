import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = process.argv[2];
if (!image || image.startsWith('-')) throw new Error('Ein Bot-Abbild als Argument angeben.');
const name = `flipbase-sniper-smoke-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
let created = false;
try {
  docker(
    'create',
    '--name',
    name,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--env',
    'SUPABASE_URL=http://127.0.0.1:9',
    '--env',
    'SUPABASE_SERVICE_ROLE_KEY=smoke-not-a-real-key',
    image,
  );
  created = true;
  docker('start', name);
  const probe = `
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:8080/live', {signal: AbortSignal.timeout(1000)});
        if (response.status !== 200 || !(await response.json()).live) throw new Error('Not live');
        const readiness = await fetch('http://127.0.0.1:8080/health', {signal: AbortSignal.timeout(1000)});
        if (readiness.status !== 503) throw new Error('Readiness must not claim a successful search');
        if (process.getuid() === 0) throw new Error('Container must not run as root');
        process.exit(0);
      } catch (error) {
        if (attempt === 49) throw error;
        await pause(200);
      }
    }
  `;
  docker('exec', name, 'node', '--input-type=module', '-e', probe);
  console.log(
    'Bot-Abbild startet ohne Schreibrechte und ohne Netz; Prozess aktiv, Suche noch nicht bereit.',
  );
} finally {
  if (created) docker('rm', '--force', name);
}
