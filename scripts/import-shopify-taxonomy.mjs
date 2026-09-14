// Erzeugt aus der deutschen Shopify Standard Product Taxonomy eine Migration für
// public.product_categories. Aufruf mit fester Version:
//   node scripts/import-shopify-taxonomy.mjs v2026-08
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hauptbereiche ohne Bezug zu gebrauchter Ware. */
export const EXCLUDED_ROOTS = new Map([
  ['bu', 'Bundles'],
  ['gc', 'Geschenkgutscheine'],
  ['na', 'Nicht kategorisiert'],
  ['pa', 'Produkt-Add-Ons'],
  ['se', 'Dienstleistungen'],
]);

const PATH_SEPARATOR = ' > ';
const HEADER_PATTERN = /^# Shopify Product Taxonomy - Categories: (\d{4}-\d{2})\s*$/u;
const LINE_PATTERN = /^gid:\/\/shopify\/TaxonomyCategory\/([a-z]{2}(?:-\d+)*)\s+:\s+(\S.*)$/u;
const INSERT_CHUNK_SIZE = 500;

function compareIds(left, right) {
  const a = left.split('-');
  const b = right.split('-');
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    const x = Number(a[index]);
    const y = Number(b[index]);
    if (Number.isInteger(x) && Number.isInteger(y)) return x - y;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function parseTaxonomy(text, expectedVersion) {
  const lines = text.split(/\r?\n/u);
  const header = lines.find((line) => line.startsWith('# Shopify Product Taxonomy'));
  const version = header?.match(HEADER_PATTERN)?.[1];
  if (!version) throw new Error('Kopfzeile mit der Taxonomie-Version fehlt.');
  if (version !== expectedVersion)
    throw new Error(`Die Datei hat Version ${version}, erwartet war ${expectedVersion}.`);

  const byId = new Map();
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(LINE_PATTERN);
    if (!match) throw new Error(`Zeile ${index + 1} hat ein unbekanntes Format: ${line}`);
    const [, id, path] = match;
    const segments = id.split('-');
    const parts = path.split(PATH_SEPARATOR).map((part) => part.trim());
    if (parts.some((part) => !part))
      throw new Error(`Zeile ${index + 1}: leerer Pfadteil bei ${id}.`);
    if (parts.length !== segments.length)
      throw new Error(
        `Zeile ${index + 1}: Kennung ${id} passt nicht zur Pfadtiefe ${parts.length}.`,
      );
    if (EXCLUDED_ROOTS.has(segments[0])) continue;
    if (byId.has(id)) throw new Error(`Die Kennung ${id} kommt doppelt vor.`);
    byId.set(id, {
      id,
      parentId: segments.length === 1 ? null : segments.slice(0, -1).join('-'),
      name: parts.at(-1),
      fullName: parts.join(PATH_SEPARATOR),
      level: parts.length,
      isLeaf: true,
    });
  }

  for (const category of byId.values()) {
    if (category.parentId === null) continue;
    const parent = byId.get(category.parentId);
    if (!parent) throw new Error(`Oberkategorie ${category.parentId} von ${category.id} fehlt.`);
    const expected = category.fullName.split(PATH_SEPARATOR).slice(0, -1).join(PATH_SEPARATOR);
    if (parent.fullName !== expected)
      throw new Error(`Der Pfad von ${category.id} passt nicht zur Oberkategorie ${parent.id}.`);
    parent.isLeaf = false;
  }

  const categories = [...byId.values()].sort(
    (left, right) => left.level - right.level || compareIds(left.id, right.id),
  );
  if (!categories.length) throw new Error('Die Datei enthält keine Kategorien.');
  return { version, categories };
}

function sqlText(value) {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

export function renderMigration({ version, categories, license }) {
  const tag = `v${version}`;
  const header = [
    `-- Zweck: Kategorien der Shopify Standard Product Taxonomy ${tag} (deutsch) einlesen.`,
    '-- Betroffene Tabelle: public.product_categories (id, parent_id, name, full_name,',
    '--   level, is_leaf, taxonomy_version, is_deprecated).',
    `-- Quelle: https://github.com/Shopify/product-taxonomy/blob/${tag}/dist/de/categories.txt`,
    `-- Anzahl: ${categories.length} Kategorien. Nicht übernommen: ${[...EXCLUDED_ROOTS.values()].join(', ')}.`,
    `-- Erzeugt mit: node scripts/import-shopify-taxonomy.mjs ${tag} – nicht von Hand ändern.`,
    '--',
    '-- Kategorien früherer Versionen, die hier fehlen, werden nicht gelöscht, sondern als',
    '-- veraltet markiert: Artikel und Katalogprodukte dürfen weiter auf sie verweisen.',
    '--',
    '-- Lizenz der Kategoriedaten:',
    ...license
      .trim()
      .split(/\r?\n/u)
      .map((line) => (line ? `-- ${line}` : '--')),
    '',
  ];

  const statements = [];
  for (let offset = 0; offset < categories.length; offset += INSERT_CHUNK_SIZE) {
    const rows = categories
      .slice(offset, offset + INSERT_CHUNK_SIZE)
      .map(
        (category) =>
          `  (${sqlText(category.id)}, ${sqlText(category.parentId)}, ${sqlText(category.name)}, ` +
          `${sqlText(category.fullName)}, ${category.level}, ${category.isLeaf}, ${sqlText(version)}, false)`,
      );
    statements.push(
      [
        'insert into public.product_categories',
        '  (id, parent_id, name, full_name, level, is_leaf, taxonomy_version, is_deprecated)',
        'values',
        rows.join(',\n'),
        'on conflict (id) do update',
        'set parent_id = excluded.parent_id,',
        '    name = excluded.name,',
        '    full_name = excluded.full_name,',
        '    level = excluded.level,',
        '    is_leaf = excluded.is_leaf,',
        '    taxonomy_version = excluded.taxonomy_version,',
        '    is_deprecated = false;',
        '',
      ].join('\n'),
    );
  }
  statements.push(
    [
      '-- Von Shopify entfernte Kategorien bleiben für bestehende Verweise erhalten.',
      'update public.product_categories',
      'set is_deprecated = true',
      `where taxonomy_version <> ${sqlText(version)}`,
      '  and is_deprecated = false;',
      '',
    ].join('\n'),
  );
  return `${header.join('\n')}\n${statements.join('\n')}`;
}

export function migrationFileName(version, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/gu, '').slice(0, 14);
  return `${stamp}_import_shopify_taxonomy_v${version.replace('-', '_')}.sql`;
}

async function fetchTextFromWeb(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} antwortete mit HTTP ${response.status}.`);
  return response.text();
}

export async function main(argv, { root, fetchText = fetchTextFromWeb, now = new Date() } = {}) {
  const tag = argv[0];
  if (!/^v\d{4}-\d{2}$/u.test(tag ?? ''))
    throw new Error('Aufruf: node scripts/import-shopify-taxonomy.mjs v2026-08');
  const version = tag.slice(1);
  const base = `https://raw.githubusercontent.com/Shopify/product-taxonomy/${tag}`;
  const [text, license] = await Promise.all([
    fetchText(`${base}/dist/de/categories.txt`),
    fetchText(`${base}/LICENSE`),
  ]);
  const { categories } = parseTaxonomy(text, version);
  const path = resolve(root, 'supabase/migrations', migrationFileName(version, now));
  await writeFile(path, renderMigration({ version, categories, license }), { flag: 'wx' });
  return { path, count: categories.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const result = await main(process.argv.slice(2), { root });
    console.log(`${result.count} Kategorien geschrieben: ${result.path}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
