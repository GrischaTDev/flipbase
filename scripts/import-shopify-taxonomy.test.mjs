import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  main,
  migrationFileName,
  parseTaxonomy,
  renderMigration,
} from './import-shopify-taxonomy.mjs';

const fixture = `# Shopify Product Taxonomy - Categories: 2026-08
# Format: {GID} : {Ancestor name} > ... > {Category name}

gid://shopify/TaxonomyCategory/el                : Elektronik
gid://shopify/TaxonomyCategory/el-6              : Elektronik > Computer
gid://shopify/TaxonomyCategory/el-6-2            : Elektronik > Computer > Computerserver
gid://shopify/TaxonomyCategory/el-6-6            : Elektronik > Computer > Laptops
gid://shopify/TaxonomyCategory/el-6-10           : Elektronik > Computer > Multitouch-Tischcomputer
gid://shopify/TaxonomyCategory/gc                : Geschenkgutscheine
gid://shopify/TaxonomyCategory/gc-1              : Geschenkgutscheine > Digital
gid://shopify/TaxonomyCategory/tg                : Spielzeuge & Spiele
gid://shopify/TaxonomyCategory/tg-1              : Spielzeuge & Spiele > Kinder's Puzzles
`;

const license = 'Copyright (c) Shopify\n\nPermission is hereby granted, free of charge';

test('liest Ebenen, Oberkategorien und Blätter und lässt ausgeblendete Bereiche weg', () => {
  const { version, categories } = parseTaxonomy(fixture, '2026-08');
  assert.equal(version, '2026-08');
  assert.deepEqual(
    categories.map((category) => category.id),
    ['el', 'tg', 'el-6', 'tg-1', 'el-6-2', 'el-6-6', 'el-6-10'],
  );
  assert.deepEqual(
    categories.find((category) => category.id === 'el-6-6'),
    {
      id: 'el-6-6',
      parentId: 'el-6',
      name: 'Laptops',
      fullName: 'Elektronik > Computer > Laptops',
      level: 3,
      isLeaf: true,
    },
  );
  assert.equal(categories.find((category) => category.id === 'el-6').isLeaf, false);
  assert.equal(
    categories.some((category) => category.id.startsWith('gc')),
    false,
  );
});

test('bricht bei doppelter Kennung ab', () => {
  const text = `${fixture}gid://shopify/TaxonomyCategory/el-6-6 : Elektronik > Computer > Laptops\n`;
  assert.throws(() => parseTaxonomy(text, '2026-08'), /doppelt/u);
});

test('bricht bei fehlender Oberkategorie ab', () => {
  const text = fixture.replace(/^gid:\/\/shopify\/TaxonomyCategory\/el-6 .*\n/mu, '');
  assert.throws(() => parseTaxonomy(text, '2026-08'), /Oberkategorie el-6 von el-6-2 fehlt/u);
});

test('bricht ab, wenn der Pfad nicht zur Oberkategorie passt', () => {
  const text = fixture.replace('Elektronik > Computer > Laptops', 'Elektronik > Kameras > Laptops');
  assert.throws(() => parseTaxonomy(text, '2026-08'), /passt nicht/u);
});

test('bricht bei falscher Version und unbekanntem Format ab', () => {
  assert.throws(() => parseTaxonomy(fixture, '2026-05'), /Version/u);
  assert.throws(() => parseTaxonomy(`${fixture}kaputte Zeile\n`, '2026-08'), /Format/u);
});

test('rendert eine transaktionsneutrale Migration mit Lizenz und Maskierung', () => {
  const { categories } = parseTaxonomy(fixture, '2026-08');
  const sql = renderMigration({ version: '2026-08', categories, license });
  assert.match(sql, /^-- Zweck: Kategorien der Shopify Standard Product Taxonomy v2026-08/u);
  assert.match(sql, /-- Copyright \(c\) Shopify/u);
  assert.match(sql, /'Kinder''s Puzzles'/u);
  assert.match(sql, /\('el', null, 'Elektronik', 'Elektronik', 1, false, '2026-08', false\)/u);
  assert.match(sql, /on conflict \(id\) do update/u);
  assert.match(sql, /where taxonomy_version <> '2026-08'/u);
  assert.doesNotMatch(sql, /^\s*(begin|commit|rollback)\b/imu);
  assert.ok(sql.indexOf("('el-6'") < sql.indexOf("('el-6-6'"), 'Eltern stehen vor Kindern');
});

test('erzeugt einen gültigen Migrationsnamen', () => {
  const name = migrationFileName('2026-08', new Date('2026-09-14T10:20:30.456Z'));
  assert.equal(name, '20260914102030_import_shopify_taxonomy_v2026_08.sql');
  assert.match(name, /^[0-9]{14}_[a-z0-9_]+\.sql$/u);
});

test('main lädt Datei und Lizenz der festen Version und schreibt die Migration', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'taxonomy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'supabase/migrations'), { recursive: true });
  const urls = [];
  const result = await main(['v2026-08'], {
    root,
    now: new Date('2026-09-14T10:20:30Z'),
    fetchText: async (url) => {
      urls.push(url);
      return url.endsWith('/LICENSE') ? license : fixture;
    },
  });
  assert.equal(result.count, 7);
  assert.deepEqual(urls.sort(), [
    'https://raw.githubusercontent.com/Shopify/product-taxonomy/v2026-08/LICENSE',
    'https://raw.githubusercontent.com/Shopify/product-taxonomy/v2026-08/dist/de/categories.txt',
  ]);
  assert.match(await readFile(result.path, 'utf8'), /7 Kategorien/u);
  await assert.rejects(() => main(['unstable'], { root }), /Aufruf/u);
});
