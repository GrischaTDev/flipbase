import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const landingDirectory = path.join(repositoryRoot, 'landing');
const landingPath = path.join(landingDirectory, 'index.html');
const html = await readFile(landingPath, 'utf8');
const normalizedHtml = html.replace(/\s+/gu, ' ');
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const css = extractElement(html, 'style');

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

test('keeps both email forms on the direct GET registration flow', () => {
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)].map(([form]) => form);

  assert.equal(forms.length, 2);
  for (const form of forms) {
    const startTag = extractStartTags(form, 'form')[0];
    assert.equal(attribute(startTag, 'action'), 'https://app.flipbase.de/auth/register');
    assert.equal(attribute(startTag, 'method')?.toLowerCase(), 'get');

    const emailInput = extractStartTags(form, 'input').find(
      (tag) => attribute(tag, 'name') === 'email',
    );
    assert.ok(emailInput, 'Each registration form must prefill the email query parameter');
    assert.equal(attribute(emailInput, 'type'), 'email');
  }
});

test('remains script-free and keeps native toggles inside the header landmark', () => {
  assert.doesNotMatch(html, /<script\b/iu);

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

test('keeps local landing assets and the Caddy login template intact', async () => {
  assert.match(html, /<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/?>/iu);
  assert.match(
    html,
    /\{\{if \.Cookie "flipbase_angemeldet"\}\}[\s\S]*\{\{else\}\}[\s\S]*\{\{ end \}\}/u,
  );
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

  const assetReferences = new Set(
    [...html.matchAll(/<(?:img|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/giu)].map(
      ([, reference]) => reference,
    ),
  );
  assert.ok(assetReferences.size > 0, 'Expected landing assets to be referenced');

  for (const reference of assetReferences) {
    assert.doesNotMatch(reference, /^(?:[a-z]+:|\/\/)/iu, `${reference} must stay local`);
    const assetPath = path.resolve(landingDirectory, reference);
    assert.ok(
      assetPath.startsWith(`${landingDirectory}${path.sep}`),
      `${reference} must stay inside landing/`,
    );
    await assertFileExists(assetPath, reference);

    if (path.extname(assetPath) === '.css') {
      const stylesheet = await readFile(assetPath, 'utf8');
      for (const [, nestedReference] of stylesheet.matchAll(/url\(["']?([^"')]+)["']?\)/giu)) {
        assert.doesNotMatch(
          nestedReference,
          /^(?:[a-z]+:|\/\/)/iu,
          `${nestedReference} must stay local`,
        );
        const nestedAssetPath = nestedReference.startsWith('/')
          ? path.resolve(landingDirectory, nestedReference.slice(1))
          : path.resolve(path.dirname(assetPath), nestedReference);
        assert.ok(
          nestedAssetPath.startsWith(`${landingDirectory}${path.sep}`),
          `${nestedReference} must stay inside landing/`,
        );
        await assertFileExists(nestedAssetPath, nestedReference);
      }
    }
  }
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

test('describes direct beta registration without invitation or fixed-version wording', () => {
  assert.equal(matches(normalizedHtml, />Beta-Registrierung öffnen →</gu), 2);
  assert.equal(matches(normalizedHtml, />Open beta registration →</gu), 2);
  assert.match(
    normalizedHtml,
    /Trage deine E-Mail ein und fahre mit der Registrierung in der Flipbase-App fort\./u,
  );
  assert.match(normalizedHtml, /Enter your email and continue registration in the Flipbase app\./u);
  assert.match(
    normalizedHtml,
    /Die Verfügbarkeit und der Funktionsumfang können sich während der Beta ändern\./u,
  );
  assert.match(normalizedHtml, /Availability and feature scope may change during the beta\./u);

  for (const phrase of [
    'Beta-Zugang anfragen',
    'Request Beta access',
    'Beta-Phase 0.1',
    'Beta Phase 0.1',
    'Beta 0.1',
    'Version 0.1',
    'regelmäßigen Wellen',
    'rolling batches',
    'invited users',
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});

test('marks Deal Sniper behavior as planned in German and English', () => {
  assert.match(
    normalizedHtml,
    /Von der geplanten Deal-Suche über die Bestandsverwaltung bis zum DATEV-Export für die Steuerberatung\./u,
  );
  assert.match(
    normalizedHtml,
    /From planned deal discovery to inventory management and export-ready DATEV tax files\./u,
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
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});

test('limits privacy and infrastructure copy to implemented access rules', () => {
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
  ]) {
    assert.doesNotMatch(normalizedHtml, new RegExp(escapeRegExp(phrase), 'iu'));
  }
});
