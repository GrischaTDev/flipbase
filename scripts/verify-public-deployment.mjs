const commitPattern = /^[0-9a-f]{40}$/;

function argument(name, fallback) {
  const position = process.argv.indexOf(name);
  if (position === -1) return fallback;
  return process.argv[position + 1];
}

const baseUrlValue = argument('--base-url');
const expectedCommit = argument('--expected-commit');
const attempts = Number.parseInt(argument('--attempts', '5'), 10);
const delayMs = Number.parseInt(argument('--delay-ms', '3000'), 10);

if (!baseUrlValue) throw new Error('--base-url fehlt.');
if (!commitPattern.test(expectedCommit ?? '')) {
  throw new Error('--expected-commit muss eine vollständige 40-stellige Git-SHA sein.');
}
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
  throw new Error('--attempts muss zwischen 1 und 10 liegen.');
}
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000) {
  throw new Error('--delay-ms muss zwischen 0 und 30000 liegen.');
}

const baseUrl = new URL(baseUrlValue);
if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error('--base-url muss eine öffentliche HTTP(S)-Adresse ohne Zugangsdaten sein.');
}

async function requireOkResponse(url, label) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) {
    throw new Error(`${label} antwortet mit HTTP ${response.status} statt 200.`);
  }
  return response;
}

async function verify() {
  const rootUrl = new URL('/', baseUrl);
  const healthUrl = new URL('/healthz', baseUrl);
  const metadataUrl = new URL('/deployment.json', baseUrl);

  await requireOkResponse(rootUrl, 'Startseite');
  const healthResponse = await requireOkResponse(healthUrl, 'Healthcheck');
  const healthStatus = (await healthResponse.text()).trim();
  if (healthStatus !== 'ok') {
    throw new Error(`Healthcheck liefert "${healthStatus}" statt "ok".`);
  }
  const metadataResponse = await requireOkResponse(metadataUrl, 'Deployment-Metadaten');

  let metadata;
  try {
    metadata = await metadataResponse.json();
  } catch {
    throw new Error('Deployment-Metadaten sind kein gültiges JSON.');
  }

  const deliveredCommit = metadata?.commit;
  if (!commitPattern.test(deliveredCommit ?? '')) {
    throw new Error('Deployment-Metadaten enthalten keine vollständige 40-stellige Git-SHA.');
  }
  if (deliveredCommit !== expectedCommit) {
    throw new Error(`Erwartet ${expectedCommit}, ausgeliefert ${deliveredCommit}.`);
  }
}

let lastError;
let verified = false;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log(`Commit ${expectedCommit} ist öffentlich ausgeliefert.`);
    verified = true;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < attempts) {
      console.error(`Öffentliche Prüfung ${attempt}/${attempts} fehlgeschlagen: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

if (!verified) throw lastError;
