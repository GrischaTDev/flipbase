function argument(name, fallback) {
  const position = process.argv.indexOf(name);
  if (position === -1) return fallback;
  return process.argv[position + 1];
}

const baseUrlValue = argument('--base-url');
const attempts = Number.parseInt(argument('--attempts', '5'), 10);
const delayMs = Number.parseInt(argument('--delay-ms', '3000'), 10);

if (!baseUrlValue) throw new Error('--base-url fehlt.');
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

function scriptSources(policy) {
  const directive = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === 'script-src' || part.startsWith('script-src '));
  if (!directive) throw new Error('Content-Security-Policy enthält kein script-src.');
  return directive.split(/\s+/u).slice(1);
}

async function verify() {
  const pageResponse = await requireOkResponse(new URL('/', baseUrl), 'Landingpage');
  const policy = pageResponse.headers.get('content-security-policy');
  if (!policy) throw new Error('Landingpage liefert keine Content-Security-Policy.');

  const sources = scriptSources(policy);
  if (!sources.includes("'self'")) {
    throw new Error("script-src muss lokale Skripte mit 'self' erlauben.");
  }
  if (sources.includes("'unsafe-inline'")) {
    throw new Error("script-src darf 'unsafe-inline' nicht erlauben.");
  }

  const html = await pageResponse.text();
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/giu)];
  if (scriptTags.length !== 1) {
    throw new Error(`Landingpage enthält ${scriptTags.length} statt genau einem Skript.`);
  }
  const attributes = scriptTags[0][1];
  const sourceMatch = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/iu);
  if (!sourceMatch) throw new Error('Formularskript hat keine lokale src-Adresse.');
  if (!/\bdefer\b/iu.test(attributes)) {
    throw new Error('Formularskript muss mit defer geladen werden.');
  }

  const scriptUrl = new URL(sourceMatch[1], baseUrl);
  if (scriptUrl.origin !== baseUrl.origin) {
    throw new Error('Formularskript muss von derselben Herkunft geladen werden.');
  }
  const scriptResponse = await requireOkResponse(scriptUrl, 'Formularskript');
  const script = await scriptResponse.text();
  if (
    !/ENDPOINT\s*=\s*['"]https:\/\/api\.flipbase\.de\/functions\/v1\/beta-application['"]/u.test(
      script,
    )
  ) {
    throw new Error('Formularskript enthält nicht den erwarteten Beta-Endpunkt.');
  }
}

let lastError;
let verified = false;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log('Landingpage und Formularskript sind öffentlich nutzbar.');
    verified = true;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < attempts) {
      console.error(`Landing-Prüfung ${attempt}/${attempts} fehlgeschlagen: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

if (!verified) throw lastError;
