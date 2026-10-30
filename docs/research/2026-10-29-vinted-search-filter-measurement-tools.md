# Quellnachweis der begrenzten Live-Messhilfe

Ergänzung zum [Messbericht](2026-10-29-vinted-search-filter-measurement.md).
Dokumentiert den am 29.10.2026 ausgeführten Versuch; keine Anweisung zum erneuten
Start oder zu einer dauerhaften Veröffentlichung. Keine Zugangsdaten enthalten.

Die lesbare Fassung des Steuerprogramms lädt die beigefügte JavaScript-Datei
anstelle ihrer Base64-Einbettung. Nur dieser Transport ist geändert. Die
tatsächlich verwendeten lokalen Originaldateien bleiben in der Arbeitskopie
unter `.superpowers/sdd/vinted-filter-measurement/` erhalten. Vertrauliche
Konfigurationssicherungen liegen ausschließlich im geschützten Betreiberordner
auf dem Server, nicht in dieser Dokumentation.

SHA-256 der Originaltexte nach UTF-8-Decodierung und LF-Zeilenenden:

- Browserleser: `224a3a644effeea58281e0831408cc60723671598baaee136a2fadd2e93c06dd`
- Tatsächliches Steuerprogramm einschließlich Base64-Einbettung: `e613a1d7946c59bc328cc241d8267c6114919a238e87d2245793e3e2b455df0c`

## Browserleser `browser-catalog-fetch.mjs`

Normale gleiche Herkunft und vorhandener Browserkontext. Genau ein vollständiger
Warmup, danach begrenzte parallele GETs. Keine zweite Profilinstanz. Kein Cache,
kein steuernder Service Worker, kein Challenge-Lösen und keine Weiterleitung.

```javascript
import { chromium } from 'playwright';

// Eng begrenzte Messalternative: derselbe Browser, Kontext, Origin und GET-Pfad.
// Keine neue Anmeldung, kein Proxy, keine Challenge-Behandlung und keine Parallelität.
export function createMeasuredCatalogReader(browser, config) {
  let warmed = false;
  let warming;
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== new URL(config.vintedBaseUrl).origin || url.pathname !== '/catalog') {
      return browser.fetch(input, init);
    }
    if (!warmed) {
      if (!warming) {
        warming = (async () => {
          const response = await browser.fetch(input, init);
          const body = response.ok ? await response.clone().text() : '';
          const challenge =
            response.headers.get('cf-mitigated') === 'challenge' ||
            body.includes('challenge-running') ||
            body.includes('<title>Just a moment...</title>');
          if ([403, 429].includes(response.status) || challenge)
            globalThis.measurementProviderBlocked = true;
          if (response.ok && !challenge) warmed = true;
          return response;
        })();
        return warming;
      }
      await warming;
      if (!warmed) throw new Error('Original browser warmup did not succeed');
    }
    init?.signal?.throwIfAborted();
    const connection = await chromium.connectOverCDP(`http://127.0.0.1:${config.browserCdpPort}`, {
      noDefaults: true,
      timeout: 5000,
    });
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(init.signal.reason);
    init?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      init?.signal?.throwIfAborted();
      if (globalThis.measurementProviderBlocked)
        throw new Error('Provider paused during measurement');
      const page = connection.contexts()[0]?.pages()[0];
      if (!page || new URL(page.url()).origin !== url.origin) {
        throw new Error('Existing browser page is not on the catalog origin');
      }
      const received = await Promise.race([
        page.evaluate(
          async ({ target, timeoutMs }) => {
            if (new URL(target).origin !== location.origin) throw new Error('Origin mismatch');
            if (navigator.serviceWorker?.controller)
              throw new Error('Service worker prevents direct origin measurement');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const response = await fetch(target, {
                credentials: 'same-origin',
                redirect: 'manual',
                cache: 'no-store',
                headers: { accept: 'text/html' },
                signal: controller.signal,
              });
              if (response.type === 'opaqueredirect' || response.status === 0) {
                throw new Error('Catalog redirect requires the original browser path');
              }
              const reader = response.body?.getReader();
              const chunks = [];
              let size = 0;
              if (reader) {
                for (;;) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  size += chunk.value.byteLength;
                  if (size > 8 * 1024 * 1024) {
                    controller.abort();
                    throw new Error('Catalog exceeds the existing eight MiB limit');
                  }
                  chunks.push(chunk.value);
                }
              }
              const bytes = new Uint8Array(size);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
              }
              return {
                status: response.status,
                headers: [...response.headers].filter(
                  ([name]) => !['set-cookie', 'content-encoding', 'content-length'].includes(name),
                ),
                body: new TextDecoder().decode(bytes),
              };
            } finally {
              clearTimeout(timer);
            }
          },
          { target: url.href, timeoutMs: config.requestTimeoutMs },
        ),
        aborted,
      ]);
      if (
        [403, 429].includes(received.status) ||
        received.body.includes('challenge-running') ||
        received.body.includes('<title>Just a moment...</title>') ||
        received.headers.some(([name, value]) => name === 'cf-mitigated' && value === 'challenge')
      )
        globalThis.measurementProviderBlocked = true;
      return new Response(received.body, { status: received.status, headers: received.headers });
    } finally {
      init?.signal?.removeEventListener('abort', onAbort);
      // Bei CDP-Verbindungen trennt close nur diesen Client; der vorhandene Browser bleibt.
      let timer;
      try {
        await Promise.race([
          connection.close(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('CDP disconnect timed out')), 2000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
```

## Steuerprogramm, lesbare Transportvariante

Die Originaldateien des Images werden nicht verändert. Temporäre Einbindungen
ersetzen nur die angegebenen JavaScript-Module. Die normale Datenbankübernahme
und ihre Aktiv-/Revisions-/Cursorprüfungen bleiben bestehen. Der Rückweg prüft
Image, Umgebungsstand und eigene Einbindungen vor dem Eingriff. Ein eigenständiger
Timer und `finally` sichern die Rückkehr; neue fremde Arbeit wird nicht
überschrieben.

```python
import collections
import datetime
import hashlib
import json
import os
import pathlib
import re
import shlex
import shutil
import signal
import subprocess
import time

ROOT = pathlib.Path('/root/flipbase-sniper-measurement-20261029-run3')
COMPOSE = '/opt/flipbase-sniper/docker-compose.sniper.yml'
CONTAINER = 'flipbase-sniper'
os.umask(0o077)


def run(*args, timeout=120):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + ' (exit ' + str(result.returncode) + ')')
    return result.stdout


def emit(event, **fields):
    print(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'event': event, **fields}), flush=True)


def inspect():
    return json.loads(run('docker', 'inspect', CONTAINER))[0]


def sql(query):
    text = run('docker', 'exec', 'supabase-db', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', 'begin read only; set local statement_timeout=\'5s\'; ' + query + '; rollback;')
    return json.loads(next(line for line in text.splitlines() if line.startswith('{') or line.startswith('[')))


FILTER_SQL = "select coalesce(json_agg(row_to_json(t) order by t.id), '[]'::json) from (select id,is_active,deleted_at,poll_interval_ms,filter_revision,catalog_id,brand_ids,title_keywords,keyword_mode,price_from,price_to,search_text from public.sniper_queries) t"


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def events_since(start):
    result = subprocess.run(['docker', 'logs', '--since', start, '--timestamps', CONTAINER], text=True, capture_output=True, timeout=15, check=True)
    rows = []
    for line in (result.stdout + result.stderr).splitlines():
        match = re.match(r'(\S+) (\S+) (info|warn|error) (\S+) ?(.*)', line)
        if match:
            # Keine Fehlertexte, Artikel, Cookies oder vollständigen URLs ausgeben.
            fields = dict(re.findall(r'(\w+)=([^ ]+)', match[5]))
            allowed = {'polled','new','failed','seeded','skipped','newHits','durationMs','status','path','kind','phase','httpStatus','challengeDetected','retryAfterSeconds','nextAttemptAt'}
            rows.append({'at': match[2], 'event': match[4], **{key:value for key,value in fields.items() if key in allowed}})
    return sorted(rows, key=lambda row:row['at'])


def interrupted(_signal, _frame):
    raise RuntimeError('Measurement interrupted')


if ROOT.exists():
    raise RuntimeError('Backup directory already exists; refusing to overwrite')
current = inspect()
if any(m['Destination'].startswith('/app/dist') for m in current['Mounts']):
    raise RuntimeError('Another measurement is still active')
image = current['Config']['Image']
if image != 'ghcr.io/grischatdev/flipbase-sniper@sha256:6caa2026c5dbe7d514f9d9d6f5ecc3e21e4e0e5ad1a1514255a5c9c0aa48330d':
    raise RuntimeError('Deployed image changed; refusing stale setup')
ROOT.mkdir(mode=0o700)
import base64
(ROOT / 'measurement-catalog-fetch.mjs').write_bytes(pathlib.Path(__file__).with_name('browser-catalog-fetch.mjs').read_bytes())
os.chmod(ROOT / 'measurement-catalog-fetch.mjs', 0o644)
(ROOT / 'container-inspect.json').write_text(json.dumps(current))
shutil.copy2(COMPOSE, ROOT / 'original-compose.yml')
shutil.copy2('/opt/flipbase-sniper/sniper.env', ROOT / 'original-sniper.env')
before_filters = sql(FILTER_SQL)
(ROOT / 'original-filter-configuration.json').write_text(json.dumps(before_filters))
before_hash = fingerprint(before_filters)
for name in ['index.js', 'store/query.store.js', 'runtime/scheduler.js', 'runtime/paced-vinted-fetch.js', 'config.js']:
    source = run('docker','exec',CONTAINER,'cat','/app/dist/' + name)
    (ROOT / ('original-' + name.replace('/', '-'))).write_text(source)
    if name == 'index.js':
        source = 'import { createMeasuredCatalogReader } from '+chr(39)+'./measurement-catalog-fetch.mjs'+chr(39)+';'+chr(10)+source
        source = source.replace('const counted = pacedVintedFetch(', 'const measurementRead = createMeasuredCatalogReader(browser, config);'+chr(10)+'const counted = pacedVintedFetch(')
        needle = 'return await browser.fetch(input, init);'
        replacement = """const measurementStarted = performance.now();
                try {
                    const measurementResponse = await browser.fetch(input, init);
                    log.info('measurement_request', {durationMs: Math.round(performance.now()-measurementStarted), status: measurementResponse.status, path: new URL(String(input)).pathname});
                    return measurementResponse;
                } catch (measurementError) {
                    log.info('measurement_request', {durationMs: Math.round(performance.now()-measurementStarted), status: 0, path: new URL(String(input)).pathname});
                    throw measurementError;
                }"""
    elif name == 'store/query.store.js':
        needle = '(query) => isDue(query, now)'
        replacement = '(query) => isDue({ ...query, pollIntervalMs: 1000 }, now)'
    elif name == 'runtime/scheduler.js':
        source = source.replace('for (const query of queriesToRun) {', 'const measurementFailures = new Set(); let measurementHalted = false; for (let offset = 0; offset < queriesToRun.length; offset += 2) { if (measurementHalted) break; await Promise.all(queriesToRun.slice(offset, offset + 2).map(async (query) => {')
        source = source.replace('                continue;', '                return;')
        source = source.replace('break; // Keine weiteren Abfragen in diesem Zyklus nach Origin-Cooldown / Block', 'measurementHalted = true;')
        source = source.replace("        }\n        this.deps.log.info('cycle',", "        })); }\n        this.deps.log.info('cycle',")
        source = source.replace('await this.handleFailure(query, error, report, now, isProbe)', 'await this.handleFailure(query, error, report, new Date(), isProbe)')
        source = source.replace('if (decision.originUpdate) {', 'if (decision.originUpdate) { globalThis.measurementProviderBlocked = true;')
        source = source.replace('this.pollOne(query, report, now, isProbeCycle)', 'this.pollOne(query, report, now, isProbeCycle, measurementFailures)')
        source = source.replace('async pollOne(query, report, now, isProbe)', 'async pollOne(query, report, now, isProbe, measurementFailures)')
        source = source.replace('if (report.failed === failedBefore)', 'if (!measurementFailures.has(query.id))')
        source = source.replace('const decision = await this.handleFailure(query, error, report, new Date(), isProbe)', 'measurementFailures.add(query.id); const decision = await this.handleFailure(query, error, report, new Date(), isProbe)')
        needle = 'export class QueryScheduler'
        replacement = needle
    elif name == 'runtime/paced-vinted-fetch.js':
        source = source.replace('const request = previous.then(async () => {', 'const slot = previous.then(async () => {')
        source = source.replace('            const timeout = AbortSignal.timeout', '        }); previous = slot.then(() => undefined, () => undefined); const request = slot.then(async () => {\n            const timeout = AbortSignal.timeout')
        source = source.replace('previous = request.then(() => undefined, () => undefined);', '// Der Scheduler begrenzt auf zwei; Startplätze bleiben serialisiert.')
        source = source.replace('init?.signal?.throwIfAborted();', "init?.signal?.throwIfAborted(); if (globalThis.measurementProviderBlocked) throw new Error('Provider paused during measurement');")
        needle = 'export function pacedVintedFetch'
        replacement = needle
    elif name == 'config.js':
        needle = 'SNIPER_REQUEST_MIN_INTERVAL_MS: z.coerce.number().int().min(1000)'
        replacement = 'SNIPER_REQUEST_MIN_INTERVAL_MS: z.coerce.number().int().min(250)'
    if source.count(needle) != 1:
        raise RuntimeError('Instrumentation anchor is not unique')
    (ROOT / ('measurement-' + name.replace('/', '-'))).write_text(source.replace(needle, replacement).replace('await browser.fetch(input, init)', 'await measurementRead(input, init)') if name == 'index.js' else source.replace(needle, replacement))
    os.chmod(ROOT / ('measurement-' + name.replace('/', '-')), 0o644)

restore = ROOT / 'restore.sh'
restore.write_text('#!/bin/sh\nset -eu\nexport FLIPBASE_SNIPER_IMAGE=' + shlex.quote(image) + '\ncd /opt/flipbase-sniper\ndocker compose -f ' + shlex.quote(COMPOSE) + ' up -d --no-deps --pull never sniper\n')
restore.write_text(restore.read_text().replace('set -eu\n', 'set -eu\n' + "# rollback target guard\npython3 - <<'PY_GUARD'\nimport json,pathlib,subprocess,sys\nroot=pathlib.Path(ROOT_PLACEHOLDER)\nbefore=json.loads((root/'container-inspect.json').read_text())\ncurrent=json.loads(subprocess.check_output(['docker','inspect','flipbase-sniper'],text=True))[0]\nassert current['Config']['Image']==before['Config']['Image'], 'Another deployment changed the image'\nmounts=[m for m in current['Mounts'] if m['Destination'].startswith('/app/dist')]\nif not mounts:\n assert sorted(current['Config']['Env'])==sorted(before['Config']['Env']), 'Another configuration is active'\n assert sorted((m['Source'],m['Destination']) for m in current['Mounts'])==sorted((m['Source'],m['Destination']) for m in before['Mounts']), 'Another profile mount is active'\n sys.exit(0)\nassert all(m['Source'].startswith(str(root)+'/') for m in mounts), 'Another source mount is active'\nPY_GUARD\n".replace('ROOT_PLACEHOLDER', repr(str(ROOT)))))
restore.chmod(0o700)
run('systemd-run','--unit=flipbase-sniper-measurement-parallel-rollback','--on-active=25m','/bin/sh',str(restore))
for signum in [signal.SIGTERM, signal.SIGHUP, signal.SIGINT]:
    signal.signal(signum, interrupted)
emit('secured', filterConfigurationSha256=before_hash, rollbackTimerMinutes=25, originalContainerStartedAt=current['State']['StartedAt'])
results = []
try:
    for interval, budget, duration in [(1000,120,180),(250,120,300)]:
        if inspect()['Config']['Image'] != image:
            raise RuntimeError('Another deployment changed the image')
        override = ROOT / 'measurement-override.json'
        override.write_text(json.dumps({'services':{'sniper':{'environment':{
            'SNIPER_REQUEST_MIN_INTERVAL_MS':str(interval),'SNIPER_REQUESTS_PER_MINUTE':str(budget),
            'SNIPER_TICK_INTERVAL_MS':'1000'},'volumes':[
            str(ROOT / 'measurement-index.js') + ':/app/dist/index.js:ro',
            str(ROOT / 'measurement-runtime-scheduler.js') + ':/app/dist/runtime/scheduler.js:ro',
            str(ROOT / 'measurement-runtime-paced-vinted-fetch.js') + ':/app/dist/runtime/paced-vinted-fetch.js:ro',
            str(ROOT / 'measurement-config.js') + ':/app/dist/config.js:ro',
            str(ROOT / 'measurement-catalog-fetch.mjs') + ':/app/dist/measurement-catalog-fetch.mjs:ro',
            str(ROOT / 'measurement-store-query.store.js') + ':/app/dist/store/query.store.js:ro']}}}))
        env = os.environ.copy(); env['FLIPBASE_SNIPER_IMAGE'] = image
        command = ['docker','compose','-f',COMPOSE,'-f',str(override),'up','-d','--no-deps','--pull','never','sniper']
        created = subprocess.run(command,env=env,cwd='/opt/flipbase-sniper',text=True,capture_output=True,timeout=150)
        if created.returncode:
            raise RuntimeError('Measurement container could not start')
        start = datetime.datetime.now(datetime.timezone.utc).isoformat()
        deadline = time.monotonic() + duration
        samples = []
        stop_reason = None
        high_memory = 0
        emit('stage_started', minimumIntervalMs=interval, requestsPerMinute=budget, desiredFilterIntervalMs=1000, tickIntervalMs=1000, plannedSeconds=duration)
        while time.monotonic() < deadline:
            time.sleep(15)
            c = inspect()
            stats = json.loads(run('docker','stats','--no-stream','--format','{{json .}}',CONTAINER))
            rows = events_since(start)
            requests = [row for row in rows if row['event']=='measurement_request']
            errors = [row for row in rows if row['event'] in ['query_failed','cycle_failed_unhandled','runtime_status_failed','due_queries_failed','tick_failed','watchlist_evaluation_failed','listing_retention_failed']]
            mem = float(stats['MemPerc'].strip('%'))
            high_memory = high_memory + 1 if mem >= 95 else 0
            sample = {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memory':stats['MemUsage'],'memoryPercent':mem,'cpuPercent':stats['CPUPerc'],'pids':stats['PIDs'],'restartCount':c['RestartCount'],'oomKilled':c['State']['OOMKilled'],'health':c['State'].get('Health',{}).get('Status'),'requests':len(requests),'failedQueries':len(errors)}
            samples.append(sample)
            emit('stage_sample', minimumIntervalMs=interval, **sample)
            if any(row.get('kind') in ['forbidden','rate_limited'] or row.get('challengeDetected') == 'true' for row in errors):
                stop_reason = 'provider_rejection'
            elif any(row['event'] in ['cycle_failed_unhandled','runtime_status_failed','due_queries_failed','tick_failed','watchlist_evaluation_failed','listing_retention_failed'] for row in errors):
                stop_reason = 'storage_or_cycle_error'
            elif c['State']['OOMKilled'] or c['RestartCount'] > 0 or int(stats['PIDs']) >= 245 or high_memory >= 2:
                stop_reason = 'resource_limit'
            elif len(errors) >= 3 and len(errors) / max(1, len(requests)) > .05:
                stop_reason = 'excessive_errors'
            elif c['State'].get('Health',{}).get('Status') == 'unhealthy':
                stop_reason = 'unhealthy'
            if stop_reason: break
        end = datetime.datetime.now(datetime.timezone.utc).isoformat()
        rows = events_since(start)
        stage = {'minimumIntervalMs':interval,'requestsPerMinute':budget,'tickIntervalMs':1000,'effectiveFilterIntervalMs':1000,'startedAt':start,'endedAt':end,'stopReason':stop_reason,'samples':samples,'events':rows}
        results.append(stage)
        (ROOT / 'sanitized-results.json').write_text(json.dumps(results,indent=2))
        emit('stage_completed', minimumIntervalMs=interval, stopReason=stop_reason, requests=sum(row['event']=='measurement_request' for row in rows), failedQueries=sum(row['event']=='query_failed' for row in rows))
        if stop_reason: break
finally:
    emit('restore_started')
    # Keine fremde zwischenzeitlich ausgerollte Version überschreiben.
    if inspect()['Config']['Image'] != image:
        emit('restore_blocked', reason='image_changed_by_another_deployment')
        raise RuntimeError('Manual reconciliation required; rollback timer still active')
    run('/bin/sh', str(restore), timeout=150)
    run('systemctl','stop','flipbase-sniper-measurement-parallel-rollback.timer')
    after = inspect()
    after_hash = fingerprint(sql(FILTER_SQL))
    remaining = [mount['Destination'] for mount in after['Mounts'] if mount['Destination'].startswith('/app/dist')]
    emit('restored', originalImage=after['Config']['Image']==image, filterConfigurationUnchanged=before_hash==after_hash, instrumentationMounts=remaining, originalEnvUnchanged=hashlib.sha256(pathlib.Path('/opt/flipbase-sniper/sniper.env').read_bytes()).hexdigest()==hashlib.sha256((ROOT/'original-sniper.env').read_bytes()).hexdigest())
    if remaining or before_hash != after_hash:
        raise RuntimeError('Restoration verification failed')
emit('result', stages=results)
```

## Tatsächliche Änderungen am kompilierten Planer

Die folgenden Unterschiede stammen aus der vorab geprüften lokalen Dienstkopie.
Dieselben Ersetzungen erzeugt das oben dokumentierte Steuerprogramm. Sie sind
Messcode, keine Änderung der versionierten Produktdateien.

```diff
--- original/runtime/scheduler.js
+++ measurement/runtime/scheduler.js
@@ -127,25 +127,25 @@
             .filter((query) => query.runState === 'cooldown' && query.lastErrorKind === originState.reason)
             .sort((a, b) => (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? ''))[0];
         const queriesToRun = isProbeCycle ? [previousFailure ?? dueQueries[0]] : dueQueries;
-        for (const query of queriesToRun) {
+        const measurementFailures = new Set(); let measurementHalted = false; for (let offset = 0; offset < queriesToRun.length; offset += 2) { if (measurementHalted) break; await Promise.all(queriesToRun.slice(offset, offset + 2).map(async (query) => {
             if (!this.deps.budget.hasCapacity()) {
                 report.skippedForBudget += 1;
                 if (isProbeCycle) {
                     await this.originStore.releaseProbe(origin, false);
                 }
-                continue;
+                return;
             }
             const failedBefore = report.failed;
             let cycleHalted = false;
             try {
-                const result = await this.pollOne(query, report, now, isProbeCycle);
+                const result = await this.pollOne(query, report, now, isProbeCycle, measurementFailures);
                 if (result.haltedOrigin) {
                     cycleHalted = true;
                 }
             }
             catch (error) {
                 cycleHalted = report.originPause !== undefined;
-                if (report.failed === failedBefore) {
+                if (!measurementFailures.has(query.id)) {
                     report.failed += 1;
                 }
                 if (isProbeCycle) {
@@ -157,9 +157,9 @@
                 });
             }
             if (cycleHalted) {
-                break; // Keine weiteren Abfragen in diesem Zyklus nach Origin-Cooldown / Block
-            }
-        }
+                measurementHalted = true;
+            }
+        })); }
         this.deps.log.info('cycle', {
             polled: report.polled,
             new: report.newListings,
@@ -171,7 +171,7 @@
         });
         return report;
     }
-    async pollOne(query, report, now, isProbe) {
+    async pollOne(query, report, now, isProbe, measurementFailures) {
         if (query.filterFormatVersion === 1 && !this.deps.listings.completeRun) {
             throw new Error('Updated search filter ingestion is unavailable');
         }
@@ -180,7 +180,7 @@
             listings = await this.deps.collector.collect(query);
         }
         catch (error) {
-            const decision = await this.handleFailure(query, error, report, now, isProbe);
+            measurementFailures.add(query.id); const decision = await this.handleFailure(query, error, report, new Date(), isProbe);
             return { haltedOrigin: decision.originUpdate !== undefined };
         }
         if (query.filterFormatVersion === 1) {
@@ -261,7 +261,7 @@
                 }
                 : {}),
         });
-        if (decision.originUpdate) {
+        if (decision.originUpdate) { globalThis.measurementProviderBlocked = true;
             report.originPause = {
                 reason: decision.originUpdate.reason,
                 until: decision.originUpdate.blockedUntil?.toISOString() ?? null,
```

```diff
--- original/runtime/paced-vinted-fetch.js
+++ measurement/runtime/paced-vinted-fetch.js
@@ -7,13 +7,14 @@
     let lastStarted = -Infinity;
     let previous = Promise.resolve();
     const fetch = (input, init) => {
-        const request = previous.then(async () => {
-            init?.signal?.throwIfAborted();
+        const slot = previous.then(async () => {
+            init?.signal?.throwIfAborted(); if (globalThis.measurementProviderBlocked) throw new Error('Provider paused during measurement');
             const remaining = timing.minimumIntervalMs - (now() - lastStarted);
             if (remaining > 0)
                 await wait(remaining);
-            init?.signal?.throwIfAborted();
+            init?.signal?.throwIfAborted(); if (globalThis.measurementProviderBlocked) throw new Error('Provider paused during measurement');
             lastStarted = now();
+        }); previous = slot.then(() => undefined, () => undefined); const request = slot.then(async () => {
             const timeout = AbortSignal.timeout(timing.requestTimeoutMs);
             const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
             try {
@@ -26,7 +27,7 @@
             }
         });
         // Ein fehlgeschlagener Aufruf darf die Warteschlange nicht stilllegen.
-        previous = request.then(() => undefined, () => undefined);
+        // Nur Startplätze serialisieren.
         return request;
     };
     return Object.assign(fetch, {
```

## Verhaltensnachweis vor dem echten Versuch

Die beiden lokalen Prüfprogramme wurden vom Autor und unabhängig erneut
ausgeführt, ohne externe Anfragen. Alle sieben Prüfungen bestehen:

1. Zwanzig Aufträge, höchstens zwei gleichzeitig, jede Anfrage gezählt.
2. Nach Anbieterablehnung keine weiteren Pakete; eine Probe erst nach der Frist
   ab tatsächlichem Fehlerzeitpunkt.
3. Hängende parallele Anfragen brechen ab; danach funktioniert die Warteschlange.
4. Eine schnelle 429-Antwort verhindert den noch wartenden zweiten Startslot.
5. Gleichzeitiger Collector- und Speicherfehler werden getrennt gezählt.
6. Abbruch während der CDP-Verbindung verhindert die Auswertung und trennt den Client.
7. Zwei Leser teilen genau einen vollständig geprüften Warmup.

Die zuvor fehlgeschlagenen Fälle und Prüfprogramme bleiben im lokalen
Messverzeichnis erhalten. Diese engen Kontrollen belegen die genannten Grenzen,
keine allgemeine Produktionsreife der Alternative.
