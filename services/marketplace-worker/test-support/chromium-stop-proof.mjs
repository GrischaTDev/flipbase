import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const execute = promisify(execFile);
const image = process.env.SESSION_IMAGE;
assert.ok(image);
const volume = `flipbase-stop-proof-${randomUUID()}`;
const containers = [];
const docker = async (args) =>
  (await execute('docker', args, { timeout: 90_000, maxBuffer: 1024 * 1024 })).stdout.trim();
async function input(args, text) {
  await new Promise((resolve, reject) => {
    const child = execFile('docker', args, { timeout: 20_000 }, (error) =>
      error ? reject(error) : resolve(),
    );
    child.stdin.end(text);
  });
}
const seccomp = resolve('deploy/chromium-seccomp.json');
await docker(['volume', 'create', volume]);
try {
  await docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    '0:0',
    '--mount',
    `type=volume,src=${volume},dst=/profiles`,
    '--entrypoint',
    'sh',
    image,
    '-c',
    'mkdir /profiles/account-a && chown -R 1000:1000 /profiles && chmod 700 /profiles /profiles/account-a',
  ]);
  for (const phase of ['write', 'frozen', 'read']) {
    const id = await docker([
      'create',
      '--network',
      'none',
      '--init',
      '--user=1000:1000',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      `--security-opt=seccomp=${seccomp}`,
      '--memory=2g',
      '--memory-swap=2g',
      '--pids-limit=512',
      '--shm-size=256m',
      '--tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700',
      '--tmpfs=/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700',
      '--mount',
      `type=volume,src=${volume},dst=/profile,volume-subpath=account-a`,
      image,
    ]);
    containers.push(id);
    await docker(['start', id]);
    await input(
      [
        'exec',
        '-i',
        id,
        'node',
        '--input-type=module',
        '-e',
        `import{writeFile,rename}from'node:fs/promises';let value='';for await(const chunk of process.stdin)value+=chunk;await writeFile('/tmp/startup.pending',value,{mode:0o600,flag:'wx'});await rename('/tmp/startup.pending','/tmp/startup.json');`,
      ],
      JSON.stringify({ headless: false, locale: 'de-DE', viewport: { width: 1280, height: 900 } }),
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await docker([
          'exec',
          id,
          'node',
          '--input-type=module',
          '-e',
          `import{access}from'node:fs/promises';await access('/tmp/flipbase-session.sock');const r=await fetch('http://127.0.0.1:9223/json/version');if(!r.ok)process.exit(1);`,
        ]);
        void response;
        ready = true;
        break;
      } catch {
        await wait(100);
      }
    }
    assert.equal(ready, true);
    await docker([
      'exec',
      id,
      'node',
      '--input-type=module',
      '-e',
      `import assert from'node:assert/strict';const{chromium}=await import('playwright');const browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});const context=browser.contexts()[0];${phase === 'write' ? `await context.addCookies([{name:'stop_fixture',value:'persisted',domain:'fixture.invalid',path:'/',expires:Date.now()/1000+3600}]);` : `assert.equal((await context.cookies()).find(cookie=>cookie.name==='stop_fixture')?.value,'persisted');`}await browser.close();`,
    ]);
    if (phase === 'frozen')
      await docker([
        'exec',
        id,
        'node',
        '--input-type=module',
        '-e',
        String.raw`import assert from'node:assert/strict';import{readdir,readFile}from'node:fs/promises';const found=[];for(const entry of await readdir('/proc')){if(!/^\d+$/.test(entry))continue;try{const args=(await readFile('/proc/'+entry+'/cmdline','utf8')).split('\0');if(args.includes('--user-data-dir=/profile')&&!args.some(value=>value.startsWith('--type=')))found.push(Number(entry));}catch{}}assert.equal(found.length,1);process.kill(found[0],'SIGSTOP');`,
      ]);
    const before = performance.now();
    await docker(['stop', '--time', '60', id]);
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id]));
    assert.equal(state.Status, 'exited');
    assert.equal(state.Running, false);
    assert.equal(state.Pid, 0);
    assert.equal(state.OOMKilled, false);
    assert.equal(state.ExitCode, phase === 'frozen' ? 75 : 0);
    await docker(['rm', id]);
    containers.splice(containers.indexOf(id), 1);
    // Nur dieses bereits nachweislich beendete Testprofil vorbereiten; Inhalte bleiben erhalten.
    await docker([
      'run',
      '--rm',
      '--network',
      'none',
      '--user=1000:1000',
      '--mount',
      `type=volume,src=${volume},dst=/profiles`,
      '--entrypoint',
      'node',
      image,
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `import{ChromiumProfileStore}from'/app/src/chromium-profile-store.ts';await new ChromiumProfileStore({root:'/profiles',inspectProfileProcesses:async()=>[]}).prepareStopped('account-a');`,
    ]);
    process.stdout.write(
      `${JSON.stringify({ phase, exitCode: state.ExitCode, elapsedMs: Math.round(performance.now() - before) })}\n`,
    );
  }
} finally {
  for (const id of containers) await docker(['rm', '--force', id]).catch(() => {});
  await docker(['volume', 'rm', volume]);
}
