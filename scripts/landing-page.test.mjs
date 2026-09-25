import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const landingDirectory = path.join(repositoryRoot, 'landing');
const landingPath = path.join(landingDirectory, 'index.html');
const landingScriptPath = path.join(landingDirectory, 'landing.js');
const analyticsScriptPath = path.join(landingDirectory, 'analytics-consent.js');
const html = await readFile(landingPath, 'utf8');
const landingScript = await readFile(landingScriptPath, 'utf8');
const analyticsScript = await readFile(analyticsScriptPath, 'utf8');
const normalizedHtml = html.replace(/\s+/gu, ' ');
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const css = extractElement(html, 'style');

async function submitBetaApplication(responseBody, responseStatus = 200) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://flipbase.de/',
  });
  const requests = [];
  dom.window.fetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      json: async () => responseBody,
    };
  };
  dom.window.eval(landingScript);

  const form = dom.window.document.getElementById('zweit-bewerbung-form');
  form.querySelector('[name="firstName"]').value = 'Anna';
  form.querySelector('[name="lastName"]').value = 'Beispiel';
  form.querySelector('[name="email"]').value = 'anna@example.test';
  form.querySelector('[name="consent"]').checked = true;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { dom, form, requests };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function assertFileExists(filePath, reference) {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    assert.fail(`${reference} must exist as a file`);
  }
  assert.ok(fileStats.isFile(), `${reference} must exist as a file`);
}

async function assertLocalAsset(reference, baseDirectory, visitedStylesheets = new Set()) {
  if (/^(?:data:|#)/iu.test(reference)) return;
  assert.equal(isRemoteResource(reference), false, `${reference} must stay local`);

  const pathReference = reference.split(/[?#]/u, 1)[0];
  if (!pathReference) return;
  const assetPath = pathReference.startsWith('/')
    ? path.resolve(landingDirectory, pathReference.slice(1))
    : path.resolve(baseDirectory, pathReference);
  const relativePath = path.relative(landingDirectory, assetPath);
  assert.ok(
    relativePath && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath),
    `${reference} must stay inside landing/`,
  );
  await assertFileExists(assetPath, reference);

  if (path.extname(assetPath).toLowerCase() !== '.css' || visitedStylesheets.has(assetPath)) return;
  visitedStylesheets.add(assetPath);
  const stylesheet = await readFile(assetPath, 'utf8');
  for (const nestedReference of cssResourceReferences(stylesheet)) {
    await assertLocalAsset(nestedReference, path.dirname(assetPath), visitedStylesheets);
  }
}

function extractElement(source, tagName) {
  const match = source.match(
    new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, 'iu'),
  );
  assert.ok(match, `Expected one <${tagName}> element`);
  return match[1];
}

function extractStartTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, 'giu'))].map(
    ([tag]) => tag,
  );
}

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu'),
  );
  return match?.[1] ?? match?.[2];
}

function startTagsWithClass(source, className) {
  return [...source.matchAll(/<[a-z][^>]*>/giu)]
    .map(([tag]) => tag)
    .filter((tag) => attribute(tag, 'class')?.split(/\s+/u).includes(className));
}

function elementById(source, id) {
  const match = source.match(
    new RegExp(
      `<([a-z][\\w:-]*)\\b(?=[^>]*\\bid=["']${escapeRegExp(id)}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,
      'iu',
    ),
  );
  assert.ok(match, `Expected element #${id}`);
  return { startTag: match[0].slice(0, match[0].indexOf('>') + 1), content: match[2] };
}

function labelElementFor(source, id) {
  const match = source.match(
    new RegExp(
      `<label\\b(?=[^>]*\\bfor=["']${escapeRegExp(id)}["'])[^>]*>([\\s\\S]*?)<\\/label>`,
      'iu',
    ),
  );
  assert.ok(match, `Expected label for #${id}`);
  return { startTag: match[0].slice(0, match[0].indexOf('>') + 1), content: match[1] };
}

function assertLanguagePair(fragment, germanText, englishText) {
  const normalizedFragment = fragment.replace(/\s+/gu, ' ');
  assert.match(
    normalizedFragment,
    new RegExp(`<span\\s+class=["']lang-de["']>${escapeRegExp(germanText)}<\\/span>`, 'u'),
  );
  assert.match(
    normalizedFragment,
    new RegExp(
      `<span\\s+class=["']lang-en["']\\s+lang=["']en["']>${escapeRegExp(englishText)}<\\/span>`,
      'u',
    ),
  );
}

const resourceAttributesByElement = new Map([
  ['a', ['ping']],
  ['audio', ['src']],
  ['base', ['href']],
  ['body', ['background']],
  ['embed', ['src']],
  ['feimage', ['href', 'xlink:href']],
  ['iframe', ['src']],
  ['image', ['href', 'xlink:href']],
  ['img', ['src', 'srcset']],
  ['input', ['src']],
  ['link', ['href', 'imagesrcset']],
  ['object', ['codebase', 'data']],
  ['script', ['src']],
  ['source', ['src', 'srcset']],
  ['table', ['background']],
  ['td', ['background']],
  ['th', ['background']],
  ['track', ['src']],
  ['use', ['href', 'xlink:href']],
  ['video', ['poster', 'src']],
]);

const urlAttributes = new Set([
  'action',
  'background',
  'cite',
  'codebase',
  'data',
  'formaction',
  'href',
  'imagesrcset',
  'ping',
  'poster',
  'src',
  'srcset',
  'xlink:href',
]);

function parseAttributes(tag) {
  const tagNameMatch = tag.match(/^<\s*([a-z][\w:-]*)/iu);
  assert.ok(tagNameMatch, `Expected an HTML start tag, received ${tag}`);
  const attributes = new Map();
  const source = tag.slice(tagNameMatch[0].length, -1);
  for (const match of source.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu,
  )) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return { tagName: tagNameMatch[1].toLowerCase(), attributes };
}

function srcsetReferences(value) {
  return [...value.matchAll(/(?:^|,)\s*((?:data:[^\s]+|[^\s,]+))/giu)].map(
    ([, reference]) => reference,
  );
}

function cssResourceReferences(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  const references = [];
  for (const match of withoutComments.matchAll(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)]*))\s*\)/giu,
  )) {
    references.push((match[1] ?? match[2] ?? match[3]).trim());
  }
  for (const match of withoutComments.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/giu)) {
    references.push((match[1] ?? match[2]).trim());
  }
  return references;
}

function htmlResourceReferences(source) {
  const references = [];
  for (const [startTag] of source.matchAll(/<[a-z][^>]*>/giu)) {
    const { tagName, attributes } = parseAttributes(startTag);
    if (tagName === 'link' && attributes.get('rel') === 'canonical') continue;
    for (const name of resourceAttributesByElement.get(tagName) ?? []) {
      const value = attributes.get(name);
      if (value === undefined) continue;
      references.push(...(name.endsWith('srcset') ? srcsetReferences(value) : [value]));
    }
    for (const value of attributes.values()) {
      if (/url\(/iu.test(value)) references.push(...cssResourceReferences(value));
    }
  }
  for (const [, stylesheet] of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)) {
    references.push(...cssResourceReferences(stylesheet));
  }
  return references;
}

function isJavascriptUrl(value) {
  return /^[\u0000-\u0020]*javascript\s*:/iu.test(value);
}

function isRemoteResource(value) {
  const reference = value.trim();
  if (/^(?:data:|#)/iu.test(reference)) return false;
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(reference);
}

function findStaticPageThreats(source) {
  const threats = [];
  for (const [startTag] of source.matchAll(/<[a-z][^>]*>/giu)) {
    const { tagName, attributes } = parseAttributes(startTag);
    if (tagName === 'iframe' && attributes.has('srcdoc')) threats.push('iframe srcdoc');

    for (const [name, value] of attributes) {
      if (/^on/iu.test(name)) threats.push(`event handler ${name}`);
      if (urlAttributes.has(name)) {
        const references = name.endsWith('srcset') ? srcsetReferences(value) : [value];
        if (references.some(isJavascriptUrl)) threats.push(`javascript URL in ${name}`);
      }
    }
  }

  for (const reference of htmlResourceReferences(source)) {
    if (isRemoteResource(reference)) threats.push(`remote resource ${reference}`);
  }
  return threats;
}

function inputById(source, id) {
  return extractStartTags(source, 'input').find((tag) => attribute(tag, 'id') === id);
}

function labelFor(source, id) {
  const match = source.match(
    new RegExp(`<label\\b(?=[^>]*\\bfor=["']${escapeRegExp(id)}["'])[^>]*>`, 'iu'),
  );
  return match?.[0];
}

function extractBalancedBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected CSS block ${marker}`);

  const openingBrace = source.indexOf('{', markerIndex + marker.length);
  assert.notEqual(openingBrace, -1, `Expected opening brace after ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  assert.fail(`Expected closing brace for ${marker}`);
}

function declarationsFor(source, selector) {
  const match = source.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^{}]*)\\}`, 'iu'));
  assert.ok(match, `Expected CSS rule ${selector}`);
  return match[1];
}

function assertDeclaration(source, selector, property, value) {
  const declarations = declarationsFor(source, selector);
  assert.match(
    declarations,
    new RegExp(
      `(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*${escapeRegExp(value)}\\s*(?:;|$)`,
      'iu',
    ),
    `${selector} must set ${property}: ${value}`,
  );
}

function cssTokens(source) {
  return Object.fromEntries(
    [...source.matchAll(/--([\w-]+)\s*:\s*([^;]+);/gu)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function parseHexColor(value, description) {
  assert.match(value ?? '', /^#[\da-f]{6}$/iu, `${description} must be a six-digit hex color`);
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
}

function parseRgbaColor(value, description) {
  const match = value?.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/u,
  );
  assert.ok(match, `${description} must be an rgba color`);
  return {
    color: match.slice(1, 4).map(Number),
    alpha: Number(match[4]),
  };
}

function relativeLuminance(color) {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function composite(foreground, background, alpha) {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index] * (1 - alpha)),
  );
}

const darkTokens = cssTokens(extractBalancedBlock(css, ':root'));
const lightPreference = extractBalancedBlock(css, '@media (prefers-color-scheme: light)');
const lightPreferenceTokens = cssTokens(extractBalancedBlock(lightPreference, ':root'));
const lightToggleTokens = cssTokens(extractBalancedBlock(css, 'body:has(#theme-toggle:checked)'));
const manualLightMarker = css.indexOf('body:has(#theme-toggle:checked)');
const darkToggleMedia = extractBalancedBlock(
  css.slice(manualLightMarker + 'body:has(#theme-toggle:checked)'.length),
  '@media (prefers-color-scheme: light)',
);
const darkToggleTokens = cssTokens(
  extractBalancedBlock(darkToggleMedia, 'body:has(#theme-toggle:checked)'),
);

const themeTokenSets = [
  ['dark default', darkTokens],
  ['dark preference toggle', darkToggleTokens],
  ['light preference', lightPreferenceTokens],
  ['light toggle', lightToggleTokens],
];

test('runs the landing contract immediately before the production build', () => {
  assert.equal(packageJson.scripts?.['test:landing'], 'node --test scripts/landing-page.test.mjs');
  const verifySteps = packageJson.scripts?.verify?.split(' && ') ?? [];
  const landingStep = verifySteps.indexOf('npm run test:landing');

  assert.notEqual(landingStep, -1, 'verify must run the landing contract');
  assert.equal(verifySteps[landingStep + 1], 'npm run build');
});

test('leads from the revised hero to one application form at the end of the page', () => {
  assert.doesNotMatch(html, /Vom Wühltisch zum Profit/u);
  assert.match(normalizedHtml, /Dein Reselling\. Klar organisiert\./u);
  assert.doesNotMatch(html, /id=["']hero-bewerbung-form["']/u);

  const heroCallToAction = extractStartTags(html, 'a').find((link) =>
    attribute(link, 'class')?.split(/\s+/u).includes('hero-beta-cta'),
  );
  assert.ok(heroCallToAction, 'The hero must contain the beta call to action');
  assert.equal(attribute(heroCallToAction, 'href'), '#beta-anmeldung');
  assert.match(normalizedHtml, /Kostenlos für die Beta anmelden/u);
  assert.match(html, /<section\b[^>]*\bid=["']beta-anmeldung["']/u);

  const landingDocument = new JSDOM(html).window.document;
  const betaApplicationSection = landingDocument.getElementById('beta-anmeldung');
  assert.equal(
    betaApplicationSection?.querySelector('form')?.id,
    'zweit-bewerbung-form',
    'The hero call to action must target the section that contains the beta application form',
  );

  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)].map(([form]) => form);

  assert.equal(forms.length, 1);
  const form = forms[0];
  const startTag = extractStartTags(form, 'form')[0];
  assert.equal(attribute(startTag, 'id'), 'zweit-bewerbung-form');
  assert.equal(attribute(startTag, 'action'), undefined);
  assert.equal(attribute(startTag, 'method'), undefined);

  const emailInput = extractStartTags(form, 'input').find(
    (tag) => attribute(tag, 'name') === 'email',
  );
  assert.ok(emailInput, 'The application form must collect an email address');
  assert.equal(attribute(emailInput, 'type'), 'email');

  const meldung = elementById(form, 'zweit-bewerbung-meldung');
  assert.equal(attribute(meldung.startTag, 'role'), 'status');
  assert.equal(attribute(meldung.startTag, 'aria-live'), 'polite');
});

test('keeps the header focused on the Flipbase brand, preferences and one app link', () => {
  const document = new JSDOM(html).window.document;
  const header = document.querySelector('body > header');

  assert.ok(header, 'The landing page must keep its header landmark');
  assert.equal(
    header.querySelector('nav'),
    null,
    'The landing header must not repeat page navigation',
  );
  assert.equal(
    header.querySelector('.marke-badge'),
    null,
    'The Reselling OS badge must stay out of the header',
  );
  assert.equal(header.querySelector('.marke')?.textContent.trim(), 'Flipbase');
  assert.ok(header.querySelector('img[src="images/logo-mark.png"]'));
  assert.ok(header.querySelector('label[for="theme-toggle"]'));
  assert.ok(header.querySelector('label[for="lang-toggle"]'));

  const appLinks = [...header.querySelectorAll('a.kopf-cta')];
  assert.equal(appLinks.length, 1, 'The header must contain exactly one app link');
  assert.equal(appLinks[0].getAttribute('href'), 'https://app.flipbase.de');
  assert.match(appLinks[0].textContent, /Zur App/u);
  assert.match(appLinks[0].textContent, /Open App/u);
});

test('verbirgt den Sendezustand bis zum tatsächlichen Absenden', () => {
  const dom = new JSDOM(html, { url: 'https://flipbase.de/' });
  const loading = dom.window.document.querySelector('[data-beta-submit-loading]');
  const idle = dom.window.document.querySelector('[data-beta-submit-idle]');

  assert.equal(loading.hidden, true);
  assert.equal(dom.window.getComputedStyle(loading).display, 'none');
  assert.equal(idle.hidden, false);
  dom.window.close();
});

test('confirms a stored beta application in a focused dialog', async () => {
  const { dom, form, requests } = await submitBetaApplication({
    ok: true,
    receiptEmailSent: true,
  });
  const dialog = dom.window.document.getElementById('beta-success-dialog');
  const submitButton = form.querySelector('button[type="submit"]');
  const pageRegions = [
    ...dom.window.document.querySelectorAll('body > header, body > main, body > footer'),
  ];

  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.hidden, false);
  assert.match(dialog.textContent, /Vielen Dank für deine Anmeldung zur Beta/u);
  assert.match(dialog.textContent, /anna@example\.test/u);
  assert.match(dialog.textContent, /Bestätigungs-E-Mail/u);
  assert.ok(dialog.querySelector('#beta-success-description.beta-dialog-copy'));
  assert.ok(dialog.querySelector('.beta-dialog-email strong'));
  assert.match(dialog.textContent, /We have received your application/u);
  assert.match(
    dom.window.document.getElementById('beta-success-confirm').textContent,
    /Schließen/u,
  );
  assert.ok(pageRegions.every((region) => region.inert === true));
  assert.equal(dom.window.document.getElementById('beta-success-receipt-sent').hidden, false);
  assert.equal(dom.window.document.getElementById('beta-success-receipt-failed').hidden, true);
  assert.equal(submitButton.disabled, false);
  assert.equal(requests.length, 1);

  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal(dialog.hidden, true);
  assert.ok(pageRegions.every((region) => region.inert === false));
  assert.equal(dom.window.document.activeElement, submitButton);
  dom.window.close();
});

test('zieht den Hinweis zur Bestätigungs-E-Mail über die gesamte Dialogbreite', async () => {
  const { dom } = await submitBetaApplication({ ok: true, receiptEmailSent: true });
  const receipt = dom.window.document.getElementById('beta-success-receipt');
  const style = dom.window.getComputedStyle(receipt);

  assert.equal(style.width, '100%');
  assert.equal(style.maxWidth, 'none');
  assert.equal(style.textAlign, 'center');
  dom.window.close();
});

test('explains a failed receipt email without losing the application', async () => {
  const { dom } = await submitBetaApplication({ ok: true, receiptEmailSent: false });
  const dialog = dom.window.document.getElementById('beta-success-dialog');

  assert.equal(dialog.hidden, false);
  assert.match(dialog.textContent, /Deine Bewerbung ist bei uns eingegangen/u);
  assert.match(dialog.textContent, /Bestätigungs-E-Mail konnte nicht\s+versendet\s+werden/u);
  assert.equal(dom.window.document.getElementById('beta-success-receipt-sent').hidden, true);
  assert.equal(dom.window.document.getElementById('beta-success-receipt-failed').hidden, false);
  dom.window.close();
});

test('behandelt den produktiven Duplikatcode als vorhandene Bewerbung', async () => {
  const { dom } = await submitBetaApplication({ error: 'application_existing' }, 409);
  const existingContent = dom.window.document.getElementById('beta-existing-content');

  assert.equal(existingContent.hidden, false);
  assert.match(existingContent.textContent, /Bewerbung bereits vorhanden/u);
  assert.match(existingContent.textContent, /Application already received/u);
  assert.doesNotMatch(existingContent.textContent, /abgelehnt|angenommen/iu);
  dom.window.close();
});

test('meldet jede bereits vorhandene Bewerbung ohne ihren Status preiszugeben', async () => {
  const { dom, form } = await submitBetaApplication({ error: 'application_exists' }, 409);
  const dialog = dom.window.document.getElementById('beta-success-dialog');
  const warning = dom.window.document.querySelector('#beta-existing-content .beta-dialog-symbol');

  assert.equal(dialog.hidden, false);
  assert.equal(dom.window.document.getElementById('beta-success-content').hidden, true);
  assert.equal(dom.window.document.getElementById('beta-existing-content').hidden, false);
  assert.match(dialog.textContent, /Für diese E-Mail liegt bereits eine Bewerbung vor/u);
  assert.doesNotMatch(dialog.textContent, /abgelehnt|angenommen/iu);
  assert.ok(warning.classList.contains('beta-dialog-symbol-warnung'));
  assert.ok(warning.querySelector('svg'));
  assert.equal(form.querySelector('[name="email"]').value, 'anna@example.test');
  assert.equal(form.querySelector('button[type="submit"]').disabled, false);
  dom.window.close();
});

test('hält Beta-Formular und Ergebnisdialoge vollständig zweisprachig', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const betaSurface = document.querySelector('#zweit-bewerbung-form')?.parentElement;
  const dialog = document.getElementById('beta-success-dialog');
  const germanTexts = [...(betaSurface?.querySelectorAll('.lang-de') ?? [])];
  const dialogGermanTexts = [...(dialog?.querySelectorAll('.lang-de') ?? [])];

  assert.ok(germanTexts.length > 0);
  assert.ok(dialogGermanTexts.length > 0);
  for (const german of [...germanTexts, ...dialogGermanTexts]) {
    assert.ok(german.parentElement.querySelector('.lang-en[lang="en"]'));
  }
  dom.window.close();
});

test('zeigt während des Sendens einen unbestimmten Ladebalken im Button', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/' });
  let finishRequest;
  dom.window.fetch = () =>
    new Promise((resolve) => {
      finishRequest = resolve;
    });
  dom.window.eval(landingScript);
  const form = dom.window.document.getElementById('zweit-bewerbung-form');
  form.querySelector('[name="firstName"]').value = 'Anna';
  form.querySelector('[name="lastName"]').value = 'Beispiel';
  form.querySelector('[name="email"]').value = 'anna@example.test';
  form.querySelector('[name="consent"]').checked = true;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  const button = form.querySelector('button[type="submit"]');
  const idle = button.querySelector('[data-beta-submit-idle]');
  const loading = button.querySelector('[data-beta-submit-loading]');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(idle.hidden, true);
  assert.equal(loading.hidden, false);
  assert.equal(loading.getAttribute('role'), 'status');
  assert.match(loading.textContent, /Bewerbung wird gesendet …/u);
  assert.ok(loading.querySelector('[aria-hidden="true"].hero-beta-progress'));
  assert.doesNotMatch(loading.textContent, /\d+\s*%/u);

  finishRequest({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, receiptEmailSent: true }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(idle.hidden, false);
  assert.equal(loading.hidden, true);
  dom.window.close();
});

test('stellt den normalen Bewerbungsbutton nach einem Timeout wieder her', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/' });
  dom.window.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => undefined;
  dom.window.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('timeout')));
    });
  dom.window.eval(landingScript);
  const form = dom.window.document.getElementById('zweit-bewerbung-form');
  form.querySelector('[name="firstName"]').value = 'Anna';
  form.querySelector('[name="lastName"]').value = 'Beispiel';
  form.querySelector('[name="email"]').value = 'anna@example.test';
  form.querySelector('[name="consent"]').checked = true;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const button = form.querySelector('button[type="submit"]');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.querySelector('[data-beta-submit-idle]').hidden, false);
  assert.equal(button.querySelector('[data-beta-submit-loading]').hidden, true);
  dom.window.close();
});

test('loads only local deferred scripts and keeps native toggles CSS-only', () => {
  // Das Formular muss die Bewerbung als JSON senden und die Antwort lesen -
  // das kann ein natives HTML-Formular nicht. Das Skript bleibt als lokale
  // Datei getrennt vom Dokument, damit die CSP keinen fragilen Inline-Hash
  // mit jeder Inhaltsänderung synchron halten muss.
  // Die Design- und Sprachumschaltung bleiben davon unberuehrt: sie laufen
  // weiterhin rein ueber CSS und native Checkboxen.
  const scripts = extractStartTags(html, 'script');
  assert.deepEqual(
    scripts.map((script) => attribute(script, 'src')),
    ['landing.js', 'analytics-consent.js'],
  );
  for (const script of scripts) assert.match(script, /\bdefer\b/iu);

  const header = extractElement(html, 'header');
  for (const id of ['theme-toggle', 'lang-toggle']) {
    assert.equal(
      matches(html, new RegExp(`\\bid=["']${escapeRegExp(id)}["']`, 'giu')),
      1,
      `${id} must be unique`,
    );
    const input = inputById(header, id);
    assert.ok(input, `${id} must be inside the header landmark`);
    assert.equal(attribute(input, 'type'), 'checkbox');

    const label = labelFor(header, id);
    assert.ok(label, `${id} must keep its associated label`);
    assert.equal(attribute(label, 'role'), undefined);
    assert.equal(attribute(label, 'tabindex'), undefined);
  }
});

test('declares English passages and gives localized controls static screen-reader names', () => {
  assert.match(html, /<html\s+lang="de">/iu);

  const unswitchedDocumentText = [];
  if (extractElement(html, 'title').trim() !== 'Flipbase') {
    unswitchedDocumentText.push('document title');
  }
  for (const logo of extractStartTags(html, 'img').filter(
    (image) => attribute(image, 'src') === 'images/logo-mark.png',
  )) {
    if (attribute(logo, 'alt') !== '') unswitchedDocumentText.push('repeated logo alternative');
  }
  assert.deepEqual(
    unswitchedDocumentText,
    [],
    'Unswitched browser and assistive text must remain language-neutral',
  );

  const englishPassages = startTagsWithClass(html, 'lang-en');
  assert.ok(englishPassages.length > 0, 'Expected English language variants');
  for (const passage of englishPassages) {
    assert.equal(attribute(passage, 'lang'), 'en', `${passage} must declare lang="en"`);
  }

  for (const control of [
    {
      id: 'theme-toggle',
      germanText: 'Design umschalten',
      englishText: 'Toggle theme',
    },
    {
      id: 'lang-toggle',
      germanText: 'Sprache umschalten',
      englishText: 'Switch language',
    },
  ]) {
    const input = inputById(html, control.id);
    const labelId = attribute(input, 'aria-labelledby');
    assert.ok(labelId, `#${control.id} must use a switchable accessible name`);
    assertLanguagePair(elementById(html, labelId).content, control.germanText, control.englishText);
    assert.equal(attribute(input, 'aria-label'), undefined);
    assert.equal(attribute(labelFor(html, control.id), 'title'), undefined);
  }

  const emailInputs = extractStartTags(html, 'input').filter(
    (input) => attribute(input, 'type') === 'email',
  );
  assert.equal(emailInputs.length, 1);
  for (const input of emailInputs) {
    const id = attribute(input, 'id');
    assert.ok(id, 'Every email field must have an id for its accessible label');
    assert.equal(attribute(input, 'aria-label'), undefined);
    assertLanguagePair(
      labelElementFor(html, id).content,
      'E-Mail-Adresse für die Beta-Bewerbung',
      'Email address for the beta application',
    );
  }

  // Vor- und Nachname bleiben im einen Bewerbungsformular getrennt, damit der
  // Betreiber eine Bewerbung einer Person zuordnen kann.
  for (const feld of [
    {
      teil: 'vorname',
      germanText: 'Vorname',
      englishText: 'First name',
    },
    {
      teil: 'nachname',
      germanText: 'Nachname',
      englishText: 'Last name',
    },
  ]) {
    const felder = extractStartTags(html, 'input').filter((input) =>
      (attribute(input, 'id') ?? '').includes(feld.teil),
    );
    assert.equal(felder.length, 1, `Expected one ${feld.teil} field`);
    for (const input of felder) {
      const id = attribute(input, 'id');
      assert.equal(attribute(input, 'required'), '');
      assertLanguagePair(labelElementFor(html, id).content, feld.germanText, feld.englishText);
    }
  }

  // Ohne Einwilligung darf keine Bewerbung abgeschickt werden.
  const einwilligungen = extractStartTags(html, 'input').filter(
    (input) =>
      attribute(input, 'type') === 'checkbox' &&
      (attribute(input, 'id') ?? '').includes('einwilligung'),
  );
  assert.equal(einwilligungen.length, 1);
  for (const input of einwilligungen) {
    assert.equal(attribute(input, 'required'), '');
  }

  for (const expectedPair of [
    ['✕ Der alte Weg', '✕ The old way'],
    ['✓ Die Flipbase-Lösung', '✓ The Flipbase solution'],
    ['✕ Das Sicherheitsrisiko', '✕ The security risk'],
    ['✓ Der Flipbase-Schutz', '✓ Flipbase protection'],
    ['In Entwicklung', 'In development'],
    ['Geplant', 'Planned'],
    ['© 2026 Flipbase. Alle Rechte vorbehalten.', '© 2026 Flipbase. All rights reserved.'],
  ]) {
    assertLanguagePair(html, expectedPair[0], expectedPair[1]);
  }

  assert.equal(
    matches(html, /<span\b[^>]*class="status-tag [^"]+"[^>]*>/giu),
    matches(
      normalizedHtml,
      /<span\b[^>]*class="status-tag [^"]+"[^>]*> <span class="lang-de">[^<]+<\/span> <span class="lang-en" lang="en">[^<]+<\/span> <\/span>/giu,
    ),
    'Every roadmap status must switch languages, including repeated values',
  );

  for (const className of ['marke-badge', 'feature-badge']) {
    for (const badge of startTagsWithClass(html, className)) {
      if (attribute(badge, 'class')?.split(/\s+/u).includes('localized-badge')) continue;
      assert.equal(
        attribute(badge, 'lang'),
        'en',
        `${className} English copy must declare lang="en"`,
      );
    }
  }
});

test('rejects active content and remote resource-loading variants', () => {
  const hostileVariants = [
    ['inline CSS @import', '<style>@import "https://tracker.example/style.css";</style>'],
    ['inline CSS url()', '<style>.hero { background: url(//tracker.example/pixel.png); }</style>'],
    ['style attribute url()', '<div style="background:url(https://tracker.example/pixel)"></div>'],
    ['video resources', '<video src="https://tracker.example/movie.mp4"></video>'],
    ['video posters', '<video poster="https://tracker.example/poster.jpg"></video>'],
    ['audio resources', '<audio src="https://tracker.example/audio.mp3"></audio>'],
    ['responsive sources', '<source srcset="https://tracker.example/image.webp 1x" />'],
    ['embedded frames', '<iframe src="https://tracker.example/frame"></iframe>'],
    ['embedded objects', '<object data="https://tracker.example/file.pdf"></object>'],
    ['embedded media', '<embed src="https://tracker.example/file.pdf" />'],
    ['media tracks', '<track src="https://tracker.example/subtitles.vtt" />'],
    ['image inputs', '<input type="image" src="https://tracker.example/button.png" />'],
    ['SVG image references', '<svg><image href="https://tracker.example/vector.svg" /></svg>'],
    ['javascript URLs', '<a href=" javascript:alert(1)">Open</a>'],
    ['event handlers', '<button onclick="alert(1)">Open</button>'],
  ];

  const undetected = hostileVariants
    .filter(([, fixture]) => findStaticPageThreats(fixture).length === 0)
    .map(([name]) => name);
  assert.deepEqual(undetected, []);

  assert.deepEqual(
    findStaticPageThreats(
      '{{if .Cookie "flipbase_angemeldet"}}<a href="https://app.flipbase.de">App</a>{{ end }}' +
        '<style>.icon { background: url(data:image/svg+xml,%3Csvg%3E); }</style>',
    ),
    [],
    'Caddy templates, navigation URLs and embedded data resources must remain allowed',
  );
});

test('keeps local landing assets intact', async () => {
  assert.doesNotMatch(html, /<meta\s+name="robots"\s+content="[^"]*noindex/iu);
  assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/flipbase\.de\/"\s*\/?>/iu);
  const robots = await readFile(path.join(landingDirectory, 'robots.txt'), 'utf8');
  const sitemap = await readFile(path.join(landingDirectory, 'sitemap.xml'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/flipbase\.de\/sitemap\.xml/u);
  assert.match(sitemap, /<loc>https:\/\/flipbase\.de\/<\/loc>/u);
  assert.ok(
    matches(html, /<img\b[^>]*\bsrc="images\/logo-mark\.png"[^>]*>/giu) >= 2,
    'The header and footer must keep the Flipbase logo',
  );
  const fontStylesheet = extractStartTags(html, 'link').find(
    (link) =>
      attribute(link, 'rel') === 'stylesheet' && attribute(link, 'href') === 'fonts/fonts.css',
  );
  assert.ok(fontStylesheet, 'The landing page must load fonts/fonts.css locally');

  const faqItems = [
    ...html.matchAll(/<details\b[^>]*class="faq-item"[^>]*>[\s\S]*?<\/details>/giu),
  ];
  assert.ok(faqItems.length >= 10, 'The complete FAQ accordion must remain available');
  for (const [faqItem] of faqItems) {
    assert.match(faqItem, /<summary\b[^>]*class="faq-summary"[^>]*>/iu);
    assert.match(faqItem, /<div\b[^>]*class="faq-body"[^>]*>/iu);
  }

  assert.deepEqual(findStaticPageThreats(html), [], 'The landing document must stay passive');

  const assetReferences = new Set(htmlResourceReferences(html));
  assert.ok(assetReferences.size > 0, 'Expected landing assets to be referenced');

  for (const reference of assetReferences) {
    await assertLocalAsset(reference, landingDirectory);
  }
});

test('does not ask for consent or load Google without a GA4 measurement ID', () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/' });
  const unconfiguredScript = analyticsScript.replace(
    "var measurementId = 'G-8ZMSVBRJPK';",
    "var measurementId = '';",
  );
  assert.notEqual(unconfiguredScript, analyticsScript);
  dom.window.eval(unconfiguredScript);
  assert.equal(dom.window.document.getElementById('analytics-consent').hidden, true);
  assert.equal(dom.window.document.getElementById('analytics-settings').hidden, true);
  assert.equal(dom.window.document.getElementById('google-analytics-script'), null);
  dom.window.close();
});

test('loads Google Analytics only after an explicit choice and supports withdrawal', () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://flipbase.de/?email=test@example.com',
  });
  const { document, localStorage } = dom.window;
  dom.window.eval(analyticsScript);

  const banner = document.getElementById('analytics-consent');
  assert.equal(banner.hidden, false);
  assert.equal(document.getElementById('google-analytics-script'), null);
  assert.equal(dom.window.dataLayer, undefined);

  document.getElementById('analytics-reject').click();
  assert.equal(banner.hidden, true);
  assert.equal(document.getElementById('google-analytics-script'), null);
  assert.equal(JSON.parse(localStorage.getItem('flipbase_analytics_consent')).value, 'rejected');

  document.getElementById('analytics-settings').click();
  assert.equal(banner.hidden, false);
  document.getElementById('analytics-accept').click();
  assert.equal(banner.hidden, true);
  assert.equal(
    document.getElementById('google-analytics-script').src,
    'https://www.googletagmanager.com/gtag/js?id=G-8ZMSVBRJPK',
  );
  assert.equal(JSON.parse(localStorage.getItem('flipbase_analytics_consent')).value, 'accepted');
  const commands = Array.from(dom.window.dataLayer, (command) => Array.from(command));
  assert.deepEqual(
    commands.map(([command]) => command),
    ['consent', 'consent', 'js', 'config'],
  );
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[1][2].analytics_storage, 'granted');
  assert.equal(commands[3][2].allow_google_signals, false);
  assert.equal(commands[3][2].page_location, 'https://flipbase.de/');
  assert.equal(commands[3][2].page_referrer, '');

  document.cookie = '_ga=test; Path=/';
  document.getElementById('analytics-settings').click();
  document.getElementById('analytics-reject').click();
  assert.equal(dom.window['ga-disable-G-8ZMSVBRJPK'], true);
  assert.equal(document.cookie.includes('_ga='), false);
  assert.equal(JSON.parse(localStorage.getItem('flipbase_analytics_consent')).value, 'rejected');
  dom.window.close();
});

test('restores a valid analytics choice and expires it after 180 days', () => {
  for (const [choice, expectedTag] of [
    ['accepted', true],
    ['rejected', false],
  ]) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/' });
    dom.window.localStorage.setItem(
      'flipbase_analytics_consent',
      JSON.stringify({ value: choice, expires: Date.now() + 1000 }),
    );
    dom.window.eval(analyticsScript);
    assert.equal(
      Boolean(dom.window.document.getElementById('google-analytics-script')),
      expectedTag,
    );
    assert.equal(dom.window.document.getElementById('analytics-consent').hidden, true);
    dom.window.close();
  }

  const expired = new JSDOM(html, { runScripts: 'outside-only', url: 'https://flipbase.de/' });
  expired.window.localStorage.setItem(
    'flipbase_analytics_consent',
    JSON.stringify({ value: 'accepted', expires: Date.now() - 1000 }),
  );
  expired.window.eval(analyticsScript);
  assert.equal(expired.window.document.getElementById('google-analytics-script'), null);
  assert.equal(expired.window.document.getElementById('analytics-consent').hidden, false);
  assert.equal(expired.window.localStorage.getItem('flipbase_analytics_consent'), null);
  expired.window.close();
});

test('uses a valid heading hierarchy and the mobile header wrap contract', () => {
  assert.doesNotMatch(html, /<h4\b/iu);
  assertDeclaration(css, '.tech-box h3', 'display', 'flex');
  assertDeclaration(css, '.fuss-spalte h2', 'text-transform', 'uppercase');

  assertDeclaration(css, 'header', 'flex-wrap', 'wrap');
  assertDeclaration(css, '.kopf-aktionen', 'min-width', '0');

  const mobileCss = extractBalancedBlock(css, '@media (max-width: 560px)');
  assertDeclaration(mobileCss, 'header', 'align-items', 'center');
  assertDeclaration(mobileCss, '.kopf-aktionen', 'width', '100%');
  assertDeclaration(mobileCss, '.kopf-aktionen', 'justify-content', 'space-between');
  assertDeclaration(mobileCss, '.kopf-cta', 'min-width', '0');
  assertDeclaration(mobileCss, '.kopf-cta', 'text-align', 'center');
});

test('shows keyboard focus on both visible toggle labels', () => {
  const focusRule = css.match(
    /#theme-toggle:focus-visible\s*~\s*\.kopf-aktionen\s+label\[for=['"]theme-toggle['"]\]\s*,\s*#lang-toggle:focus-visible\s*~\s*\.kopf-aktionen\s+label\[for=['"]lang-toggle['"]\]\s*\{([^{}]*)\}/iu,
  );
  assert.ok(focusRule, 'Expected one visible focus rule for both toggle labels');
  assert.match(focusRule[1], /outline\s*:\s*2px\s+solid\s+var\(--amber\)\s*;/iu);
  assert.match(focusRule[1], /outline-offset\s*:\s*3px\s*;/iu);
});

test('keeps muted text readable in every CSS-controlled theme', () => {
  for (const [theme, tokens] of themeTokenSets) {
    const muted = parseHexColor(tokens['ink-muted'], `${theme} --ink-muted`);
    const dim = parseHexColor(tokens['ink-dim'], `${theme} --ink-dim`);
    for (const backgroundName of ['canvas', 'surface', 'surface-alt']) {
      const background = parseHexColor(tokens[backgroundName], `${theme} --${backgroundName}`);
      assert.ok(
        contrastRatio(muted, background) >= 4.5,
        `${theme} muted text must reach 4.5:1 on --${backgroundName}`,
      );
      assert.ok(
        contrastRatio(dim, background) >= 4.5,
        `${theme} dim text must reach 4.5:1 on --${backgroundName}`,
      );
    }
  }
});

test('keeps accent text and button text readable in every CSS-controlled theme', () => {
  for (const [theme, tokens] of themeTokenSets) {
    const amber = parseHexColor(tokens.amber, `${theme} --amber`);
    const amberHover = parseHexColor(tokens['amber-hover'], `${theme} --amber-hover`);
    const onAmber = parseHexColor(tokens['on-amber'], `${theme} --on-amber`);
    const amberBackground = parseRgbaColor(tokens['amber-bg'], `${theme} --amber-bg`);

    assert.ok(contrastRatio(onAmber, amber) >= 4.5, `${theme} amber button must reach 4.5:1`);
    assert.ok(
      contrastRatio(onAmber, amberHover) >= 4.5,
      `${theme} hovered amber button must reach 4.5:1`,
    );

    for (const backgroundName of ['canvas', 'surface', 'surface-alt']) {
      const background = parseHexColor(tokens[backgroundName], `${theme} --${backgroundName}`);
      const tintedBackground = composite(amberBackground.color, background, amberBackground.alpha);
      assert.ok(
        contrastRatio(amber, tintedBackground) >= 4.5,
        `${theme} amber text must reach 4.5:1 on tinted --${backgroundName}`,
      );
    }
  }
});

test('describes the beta application review flow without open-registration or fixed-version wording', () => {
  assert.equal(matches(normalizedHtml, />Kostenlos für die Beta anmelden →</gu), 1);
  assert.equal(matches(normalizedHtml, />Apply for the beta for free →</gu), 1);
  assert.equal(matches(normalizedHtml, />Für die Beta bewerben →</gu), 1);
  assert.equal(matches(normalizedHtml, />Apply for the beta →</gu), 1);
  assert.match(
    normalizedHtml,
    /Schick uns deine Bewerbung\. Wir sehen uns jede Bewerbung an und wer dabei ist, bekommt eine Einladung per E-Mail\./u,
  );
  assert.match(
    normalizedHtml,
    /Send us your application\. We look at every application, and if you're in, you'll get an invitation by email\./u,
  );
  assert.match(
    normalizedHtml,
    /Du kannst dich direkt über das Formular auf dieser Seite bewerben; wer angenommen wird, bekommt eine Einladung per E-Mail\./u,
  );
  assert.match(
    normalizedHtml,
    /You can apply directly using the form on this page; if you're accepted, you'll get an invitation by email\./u,
  );
  assert.match(
    normalizedHtml,
    /Die Verfügbarkeit und der Funktionsumfang können sich während der Beta ändern\./u,
  );
  assert.match(normalizedHtml, /Availability and feature scope may change during the beta\./u);

  for (const phrase of [
    'Beta-Registrierung öffnen',
    'Open beta registration',
    'Trage deine E-Mail ein und fahre mit der Registrierung',
    'continue registration in the Flipbase app',
    'Registrierung direkt öffnen',
    'open registration directly',
    'Beta-Zugang anfragen',
    'Request Beta access',
    'Beta-Phase 0.1',
    'Beta Phase 0.1',
    'Beta 0.1',
    'Version 0.1',
    'regelmäßigen Wellen',
    'rolling batches',
    'invited users',
    '48 Stunden',
    '48 hours',
    'innerhalb von',
    'within 24 hours',
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});

test('marks Deal Sniper behavior as planned in German and English', () => {
  const expectedPlannedCopy = [
    ['Vinted Bot (geplant)', 1],
    ['Vinted Bot (planned)', 1],
    ['Vinted Deal-Sniper (geplant)', 1],
    ['Vinted Deal Sniper (planned)', 1],
    ['Geplanter Vinted Deal-Sniper für gespeicherte Suchfilter', 1],
    ['Planned Vinted Deal Sniper for saved searches', 1],
    ['Was ist für den Vinted Deal-Sniper geplant?', 1],
    ['What is planned for the Vinted Deal Sniper?', 1],
  ];
  for (const [phrase, count] of expectedPlannedCopy) {
    assert.equal(matches(normalizedHtml, new RegExp(escapeRegExp(phrase), 'gu')), count, phrase);
  }

  const descriptionTag = extractStartTags(html, 'meta').find(
    (tag) => attribute(tag, 'name') === 'description',
  );
  assert.ok(descriptionTag, 'Expected a meta description');
  assert.doesNotMatch(
    attribute(descriptionTag, 'content'),
    /(?:Vinted Bot|Deal[- ]Sniper|deal sniping)/iu,
    'The static German meta description must omit the unreleased feature',
  );

  const localizedPassages = [
    ...html.matchAll(/<span\b[^>]*class="lang-(?:de|en)"[^>]*>([\s\S]*?)<\/span>/giu),
  ].map(([, content]) =>
    content
      .replace(/<[^>]+>/gu, '')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
  for (const passage of localizedPassages.filter((text) =>
    /(?:Vinted (?:Bot|Deal[- ]Sniper|sniper)|Deal-(?:Suche|Recherche)|deal discovery)/iu.test(text),
  )) {
    assert.match(
      passage,
      /(?:geplant\p{L}*|planned|in Entwicklung|in development)/iu,
      `Unreleased Deal Sniper mention must carry its status: ${passage}`,
    );
  }

  assert.match(
    normalizedHtml,
    /Von der geplanten Deal-Suche über die Bestandsverwaltung bis zu DATEV-kompatiblen Buchungsdaten\./u,
  );
  assert.match(
    normalizedHtml,
    /From planned deal discovery to inventory management and DATEV-compatible accounting exports\./u,
  );
  assert.equal(
    matches(
      normalizedHtml,
      /Geplant ist, gespeicherte Suchfilter im Hintergrund zu prüfen und passende Treffer für den späteren Import anzuzeigen\./gu,
    ),
    2,
  );
  assert.equal(
    matches(
      normalizedHtml,
      /The planned flow checks saved searches in the background and surfaces matching listings for later import\./gu,
    ),
    2,
  );
  assert.match(normalizedHtml, />In Entwicklung</u);
  assert.match(normalizedHtml, />In development</u);

  for (const phrase of [
    'automatisierte Schnäppchenjagd',
    'automated deal hunting',
    'automatisierte Deal-Recherche',
    'automated deal sniping',
    'Echtzeit-Scans',
    'Real-time scans',
    'Sofortige Benachrichtigung',
    'Instant alerts',
    '1-Klick-Übernahme',
    '1-click transfer',
    'erhältst du sofort eine Benachrichtigung',
    'receive instant alerts',
    'import them with one click',
    'Flipbase führt Vinted Bot,',
    '>Vinted Bot<',
    'Artikel 1 (Vinted Sniped)',
    '>Vinted Bot &amp; Deal-Sniper<',
    '>Vinted Bot &amp; Deal Sniper<',
    'Vinted Deal-Sniper Dienst zur automatisierten Schnäppchen-Erkennung',
    'Vinted Deal Sniper service for automated underpriced deal alerts',
    'Wie funktioniert der Vinted Deal-Sniper?',
    'How does the Vinted Deal Sniper work?',
    'Bestand, Vinted Bot und Differenzbesteuerung',
    'inventory, Vinted sniper, and margin tax',
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});

test('limits privacy, infrastructure and accounting copy to technically bounded claims', () => {
  assert.match(normalizedHtml, /Workspace-getrennter Datenzugriff/u);
  assert.match(normalizedHtml, /Workspace-scoped data access/u);
  assert.equal(
    matches(
      normalizedHtml,
      /Die Anwendung schützt Workspace-Daten mit serverseitigen Zugriffsregeln\. Die konkrete Betriebs- und Datenschutzkonfiguration wird vor dem öffentlichen Start gesondert geprüft\./gu,
    ),
    2,
  );
  assert.equal(
    matches(
      normalizedHtml,
      /The application protects workspace data with server-side access rules\. The production privacy and hosting configuration is reviewed separately before public launch\./gu,
    ),
    2,
  );

  for (const phrase of [
    'Steuerliche Einordnung und Vollständigkeit sind vor der Nutzung zu prüfen.',
    'Tax treatment and completeness must be reviewed before use.',
    'rechnerische Unterstützung bei der Differenzbesteuerung (§ 25a)',
    'calculation support for margin taxation (§ 25a)',
    'Beispielrechnung aus erfassten Werten: Einkaufspreis, Nebenkosten, Gebühren und eine rechnerische 19/119-Aufteilung der Beispielmarge werden nachvollziehbar dargestellt.',
    'Example calculation from recorded values: purchase price, ancillary costs, fees, and a calculated 19/119 split of the example margin are shown transparently.',
    'Rechnerische 19/119-Aufteilung erfasster Margen',
    'Calculated 19/119 split of recorded margins',
    'Verknüpfung von Belegen und Buchungsvorgängen',
    'Links between receipts and booking records',
    'Welche Einstellung im Einzelfall passt, muss fachlich geprüft werden.',
    'The appropriate setting for each case must be reviewed by a qualified adviser.',
    'Ob § 25a anwendbar ist und welche Rechnungsangaben erforderlich sind, muss im Einzelfall geprüft werden.',
    'Whether § 25a applies and which invoice details are required must be reviewed for each case.',
    'Die Daten können zur Prüfung und weiteren Verarbeitung an die Steuerberatung übergeben werden.',
    'The data can be passed to a tax adviser for review and further processing.',
  ]) {
    assert.match(normalizedHtml, new RegExp(escapeRegExp(phrase), 'u'));
  }

  for (const phrase of [
    'DSGVO-konform',
    'GDPR Compliant',
    'ohne US-Datentransfer',
    'without US cloud routing',
    'Hetzner',
    'Nürnberg',
    'Nuremberg',
    'Falkenstein',
    'automatisierte Backups',
    'automated backups',
    'cryptographically isolated',
    'strictly isolated',
    'ausschließlich du',
    'ausschließlich die Daten seines eigenen Workspaces',
    'strict database isolation',
    'sovereign German server hosting',
    'Serverstandort Deutschland',
    'Hosted in Germany',
    'compliant audit logs',
    'Compliant 19/119 margin calculation',
    'Betriebsprüfungssichere',
    'Audit-proof',
    'Ja, uneingeschränkt',
    'Yes, completely',
    'passt sich die Plattform nahtlos an',
    'the platform adapts seamlessly',
    'als gesetzlich vorgeschrieben',
    'as legally mandated',
    'Gesetzliches Wareneingangs- und Ausgangsbuch',
    'ready-to-import DATEV files',
    'import everything without tedious manual entry',
    'Tax Ready',
    'Centgenaue Abrechnung',
    'Penny-accurate calculation',
    'geht lückenlos auf',
    'splits perfectly',
    'centgenaue Differenzbesteuerung',
    'penny-accurate margin taxation',
    'export-ready DATEV tax files',
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});
