#!/usr/bin/env bash
# Imageprüfungen benötigen einen wegwerfbaren gehosteten CI-Runner.
set -euo pipefail
node "$(dirname "${BASH_SOURCE[0]}")/marketplace-image-checks.mjs"
case "${1:-}" in
  worker-separation)
docker run --rm --entrypoint sh "$WORKER_IMAGE" -c '! command -v docker && test ! -e /var/run/docker.sock'
docker run --rm --entrypoint docker "$BROKER_IMAGE" --version
docker run --rm --entrypoint node "$WORKER_IMAGE" --input-type=module -e "await import('./dist/chromium-broker-client.js'); await import('./dist/chromium-profile-provisioner.js'); await import('./dist/migrate-chromium-profiles.js'); await import('./dist/vinted-transfer-source.js')"
    ;;
  gologin-budgets)
set -euo pipefail
MARKETPLACE_DOCKER_GROUP_ID="$(stat -c %g /var/run/docker.sock)"
MARKETPLACE_ENV_FILE="$(mktemp)"
export MARKETPLACE_DOCKER_GROUP_ID MARKETPLACE_ENV_FILE
trap 'rm -f "$MARKETPLACE_ENV_FILE"' EXIT
for flag in 1 0; do
  printf 'MARKETPLACE_SCHEDULED_SYNC_ENABLED=%s\n' "$flag" > "$MARKETPLACE_ENV_FILE"
  docker compose -f deploy/docker-compose.marketplace-worker.yml config --format json | python3 -c '
import json,sys
config=json.load(sys.stdin)
worker=config["services"]["marketplace-worker"]
assert config["name"]=="flipbase-marketplace"
assert worker["environment"]["MARKETPLACE_BROWSER_PROVIDER"]=="gologin"
assert worker["environment"]["MARKETPLACE_SCHEDULED_SYNC_ENABLED"]==sys.argv[1]
assert "flipbase-browser" not in worker["networks"]
assert int(worker["mem_limit"])==512*1024*1024
assert int(config["services"]["chromium-host-broker"]["mem_limit"])==512*1024*1024
' "$flag"
done
    ;;
  broker-sandbox)
set -euo pipefail
fixture=flipbase-controller-seccomp-fixture
trap 'docker rm -f "$fixture" >/dev/null 2>&1 || true' EXIT
chmod 0644 deploy/chromium-seccomp.json
docker_group=$(stat -c %g /var/run/docker.sock)
docker run --rm --user=1000:1000 --group-add="$docker_group" --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --mount=type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock --mount="type=bind,src=$PWD/deploy/chromium-seccomp.json,dst=/opt/flipbase-marketplace/chromium-seccomp.json,readonly" --entrypoint docker "$BROKER_IMAGE" create --name "$fixture" --network=none --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --security-opt=seccomp=/opt/flipbase-marketplace/chromium-seccomp.json --entrypoint node "$WORKER_IMAGE" -e 'process.exit(0)'
docker start --attach "$fixture"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$fixture")" == 0 ]]
docker rm "$fixture" >/dev/null
    ;;
  broker-isolation)
set -euo pipefail
sudo bash deploy/bootstrap-marketplace-chromium-pilot.sh setup
docker network create --internal chromium-control
metadata="$RUNNER_TEMP/chromium-worker"
mkdir -p "$metadata"
sudo chown 1000:1000 "$metadata"
token_file="$RUNNER_TEMP/chromium-broker-token"
openssl rand -hex 32 > "$token_file"
sudo chown 1000:1000 "$token_file"
sudo chmod 0400 "$token_file"
cleanup() {
  docker rm -f chromium-worker-fixture chromium-isolation-proof chromium-host-broker >/dev/null 2>&1 || true
  docker ps -aq --filter label=de.flipbase.chromium.role=session | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker network rm chromium-control >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker create --name chromium-host-broker --network flipbase-browser --ip 172.30.88.3 --user=1000:1000 --group-add="$(stat -c %g /var/run/docker.sock)" --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --tmpfs=/tmp:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --mount=type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock --mount=type=bind,src=/opt/flipbase-marketplace/chromium,dst=/var/lib/flipbase-chromium --mount="type=bind,src=$token_file,dst=/run/secrets/chromium-broker-token,readonly" --mount=type=bind,src=/run/flipbase,dst=/run/flipbase,readonly --mount=type=bind,src=/opt/flipbase-marketplace/chromium-seccomp.json,dst=/opt/flipbase-marketplace/chromium-seccomp.json,readonly -e MARKETPLACE_CHROMIUM_IMAGE="$SESSION_IMAGE" -e MARKETPLACE_CHROMIUM_HOST_ID=pilot-01 "$BROKER_IMAGE"
docker network connect --alias chromium-host-control chromium-control chromium-host-broker
docker start chromium-host-broker
docker create --name chromium-worker-fixture --network chromium-control --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --tmpfs=/tmp:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --mount="type=bind,src=$metadata,dst=/var/lib/flipbase-marketplace" --mount="type=bind,src=$token_file,dst=/run/secrets/chromium-broker-token,readonly" --mount="type=bind,src=$PWD/services/marketplace-worker/test-support,dst=/app/test-support,readonly" --entrypoint node "$WORKER_IMAGE" test-support/chromium-broker-smoke.mjs
docker start --attach chromium-worker-fixture
[[ "$(docker inspect --format '{{.State.ExitCode}}' chromium-worker-fixture)" == 0 ]]
sudo test -f /opt/flipbase-marketplace/chromium/archive/chromium_41000000-0000-4000-8000-000000000001/Default/Preferences
[[ "$(docker ps -aq --filter label=de.flipbase.chromium.role=session)" == '' ]]
# Der privilegierte Testtreiber simuliert Codeausführung im Sitzungscontainer.
# Der oben geprüfte Produktionscontroller bleibt ohne Docker-Zugang.
docker run --rm --name chromium-isolation-proof --network chromium-control --user=1000:1000 --group-add="$(stat -c %g /var/run/docker.sock)" --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --memory=512m --tmpfs=/tmp:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --mount=type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock --mount="type=bind,src=$token_file,dst=/run/secrets/chromium-broker-token,readonly" --mount="type=bind,src=$PWD/services/marketplace-worker/test-support,dst=/app/test-support,readonly" --entrypoint node "$BROKER_IMAGE" test-support/isolated-browser-proof.mjs
[[ "$(docker ps -aq --filter label=de.flipbase.chromium.role=session)" == '' ]]
    ;;
  session-imports)
set -euo pipefail
docker run --rm --network none --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --entrypoint node "$SESSION_IMAGE" --experimental-strip-types --input-type=module -e '
  import assert from "node:assert/strict";
  const vinted = await import("/app/src/vinted-browser-actions.ts");
  const isolated = await import("/app/src/isolated-browser-actions.ts");
  assert.equal(typeof vinted.vintedBrowserActions, "function");
  assert.equal(typeof isolated.executeBrowserAction, "function");
'
    ;;
  session-shutdown)
set -euo pipefail
docker run --rm --network none --init --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --security-opt="seccomp=$PWD/deploy/chromium-seccomp.json" --memory=2g --memory-swap=2g --pids-limit=512 --shm-size=256m --tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700 --tmpfs=/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --mount="type=bind,src=$PWD/services/marketplace-worker/test,dst=/app/test,readonly" --env REQUIRE_CHROME_STOP_TESTS=1 --entrypoint node "$SESSION_IMAGE" --experimental-strip-types --test /app/test/browser/chrome-session-stop.browser.test.ts
    ;;
  session-recovery)
node services/marketplace-worker/test-support/chromium-stop-proof.mjs
    ;;
  session-sandbox)
set -euo pipefail
sudo bash -x deploy/bootstrap-marketplace-chromium-pilot.sh setup
sudo systemctl is-active --quiet flipbase-chromium-firewall.timer
profile_root="$RUNNER_TEMP/chromium-profiles"
mkdir -p "$profile_root/fixture-a" "$profile_root/fixture-b"
sudo chown -R 1000:1000 "$profile_root"
sudo chmod 700 "$profile_root" "$profile_root/fixture-a" "$profile_root/fixture-b"
trap 'docker rm -f chromium-fixture >/dev/null 2>&1 || true' EXIT
for phase in write blocked read native-read isolated; do
  profile=fixture-a
  if [[ "$phase" == isolated ]]; then profile=fixture-b; fi
  if [[ "$phase" == blocked ]]; then
    docker run --rm --network none --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --mount="type=bind,src=$profile_root/$profile,dst=/profile" --entrypoint node "$SESSION_IMAGE" --input-type=module -e '
      import { symlink } from "node:fs/promises";
      await symlink("previous-container-fixture-37", "/profile/SingletonLock");
      await symlink("/tmp/org.chromium.Chromium.fixture/SingletonSocket", "/profile/SingletonSocket");
      await symlink("fixture-nonce", "/profile/SingletonCookie");
    '
  fi
  container_id=$(docker create --name chromium-fixture --network flipbase-browser --init --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --security-opt="seccomp=$PWD/deploy/chromium-seccomp.json" --memory=2g --memory-swap=2g --pids-limit=512 --shm-size=256m --tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700 --tmpfs=/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --mount="type=bind,src=$profile_root/$profile,dst=/profile" --log-driver=none "$SESSION_IMAGE")
  docker start "$container_id" >/dev/null
  printf '%s' '{"headless":false,"locale":"de-DE","viewport":{"width":1280,"height":900}}' | docker exec -i "$container_id" node --input-type=module -e "import{writeFile,rename}from'node:fs/promises';let text='';for await(const chunk of process.stdin)text+=chunk;await writeFile('/tmp/startup.pending',text,{mode:0o600,flag:'wx'});await rename('/tmp/startup.pending','/tmp/startup.json');"
  if [[ "$phase" == blocked ]]; then
    for ((attempt = 0; attempt < 60; attempt++)); do
      if [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == false ]]; then break; fi
      sleep 1
    done
    [[ "$(docker inspect --format '{{.State.Status}} {{.State.Pid}} {{.State.OOMKilled}} {{.State.ExitCode}}' "$container_id")" == 'exited 0 false 78' ]]
    docker rm "$container_id" >/dev/null
    [[ -z "$(docker ps --all --quiet --filter name=^/chromium-fixture$)" ]]
    docker run --rm --network none --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --mount="type=bind,src=$PWD/services/marketplace-worker/src,dst=/app/fixture-src,readonly" --mount="type=bind,src=$profile_root,dst=/profiles" --entrypoint node "$SESSION_IMAGE" --experimental-strip-types --input-type=module -e '
      import { ChromiumProfileStore } from "/app/fixture-src/chromium-profile-store.ts";
      const profiles = new ChromiumProfileStore({root:"/profiles",inspectProfileProcesses:async()=>[]});
      const lease = await profiles.acquire("fixture-a");
      await lease.confirmStopped();
    '
    continue
  fi
  container_ip=$(docker inspect --format '{{(index .NetworkSettings.Networks "flipbase-browser").IPAddress}}' "$container_id")
  docker exec "$container_id" node --input-type=module -e '
    import assert from "node:assert/strict";
    import { chromium } from "playwright";
    let browser;
    let lastFailure;
    for(let attempt=0;attempt<60&&!browser;attempt++) {
      try { browser=await chromium.connectOverCDP(`http://127.0.0.1:9223`,{timeout:1000,noDefaults:true}); }
      catch (failure) { lastFailure=failure; await new Promise(resolve=>setTimeout(resolve,500)); }
    }
    assert.ok(browser,`Sandboxed Chromium must start: ${lastFailure}`);
    const context=browser.contexts()[0];
    const cookies=await context.cookies();
    const marker=cookies.find(cookie=>cookie.name==="fixture_marker");
    if(["read","native-read"].includes(process.argv[2])) assert.equal(marker?.value,"persistent");
    if(process.argv[2]==="isolated") assert.equal(marker,undefined);
    if(process.argv[2]==="write") await context.addCookies([{name:"fixture_marker",value:"persistent",domain:"fixture.invalid",path:"/",expires:Date.now()/1000+3600}]);
    const page=context.pages()[0];
    assert.equal(await page.evaluate(()=>navigator.webdriver),false);
    await page.setContent("<html><body style=\"margin:0\"><textarea aria-label=\"Fixture\" style=\"width:100vw;height:100vh;box-sizing:border-box\"></textarea></body></html>");
    process.exit(0);
  ' "$container_ip" "$phase"
  docker exec "$container_id" node --experimental-strip-types --input-type=module -e '
    import { execFile } from "node:child_process";
    import { ChromiumDesktopControls } from "/app/src/chromium-desktop-controls.ts";
    const desktop=new ChromiumDesktopControls({width:1280,height:900,authorize:async()=>{},execute:(args,input)=>new Promise((resolve,reject)=>{
      const child=execFile(args[0],args.slice(1),{encoding:"buffer",timeout:15000,maxBuffer:8*1024*1024},(error,stdout)=>error?reject(error):resolve(stdout));
      child.stdin.end(input??"");
    })});
    await desktop.capture();
    await desktop.click(0.5,0.75);
    await desktop.type("native-desktop-fixture-x");
    await desktop.press("Backspace");
    await desktop.drag([{x:0.2,y:0.5,elapsedMs:0},{x:0.7,y:0.5,elapsedMs:150}]);
  '
  docker exec "$container_id" node --input-type=module -e '
    import assert from "node:assert/strict";
    import { chromium } from "playwright";
    const browser=await chromium.connectOverCDP(`http://127.0.0.1:9223`,{noDefaults:true});
    assert.equal(await browser.contexts()[0].pages()[0].locator("textarea").inputValue(),"native-desktop-fixture-");
    if(process.argv[2]==="read") process.exit(0);
    await (await browser.newBrowserCDPSession()).send("Browser.close").catch(()=>{});
  ' "$container_ip" "$phase"
  if [[ "$phase" == read ]]; then docker stop --time 30 "$container_id" >/dev/null; fi
  for ((attempt = 0; attempt < 60; attempt++)); do
    if [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == false ]]; then break; fi
    sleep 1
  done
  [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == false ]]
  [[ "$(docker inspect --format '{{.State.ExitCode}}' "$container_id")" == 0 ]]
  docker rm "$container_id" >/dev/null
done
sudo bash deploy/bootstrap-marketplace-chromium-pilot.sh verify
    ;;
  session-diagnostics)
set -euo pipefail
sudo dmesg | tail -n 60 || true
docker run --rm --network flipbase-browser --init --user=1000:1000 --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --security-opt="seccomp=$PWD/deploy/chromium-seccomp.json" --memory=2g --pids-limit=512 --shm-size=256m --tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700 --tmpfs=/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 --tmpfs=/profile:rw,nosuid,nodev,size=128m,uid=1000,gid=1000,mode=700 --entrypoint node "$SESSION_IMAGE" --input-type=module -e '
  import { chromium } from "playwright";
  const context = await chromium.launchPersistentContext("/profile", { executablePath: "/usr/bin/google-chrome-stable", headless: true, chromiumSandbox: true, acceptDownloads: false, env: {PATH: process.env.PATH, HOME: "/home/node"} });
  await context.close();
'
    ;;
  *) echo "Unbekannte Marketplace-Imageprüfung: ${1:-<leer>}" >&2; exit 1 ;;
esac
