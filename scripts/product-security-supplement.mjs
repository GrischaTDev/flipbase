import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const targets = [
  'table public.catalog_product_media',
  'table public.purchase_receipt_requests',
  'function public.is_catalog_product_media_path(text,uuid,uuid)',
  'function public.protect_catalog_product_media_identity()',
  'function public.receive_purchase_lines_idempotent(uuid,uuid,uuid,jsonb)',
  'function public.protect_workspace_media_object()',
];
const policyNames = new Set(
  ['Artikelmedien', 'Produktmedien'].flatMap((prefix) =>
    ['lesen', 'hochladen', 'aendern', 'loeschen'].map((action) => `"${prefix} ${action}"`),
  ),
);

function statementAt(source, start) {
  let quote = null;
  let lineComment = false;
  let blockDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockDepth) {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      if (char === '\\') throw new Error('Unsupported escaped SQL string');
      continue;
    }
    if (char === '-' && next === '-') {
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      blockDepth = 1;
      index += 1;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '$') throw new Error('Unsupported dollar-quoted security statement');
    else if (char === ';') return source.slice(start, index + 1);
  }
  throw new Error('Unterminated security statement');
}

// Bewusst eng begrenzter Ausgleich für die nachgewiesenen pg-delta-Auslassungen.
// SQL-Ausdrücke werden ausschließlich aus dem deklarativen Schema übernommen.
export function generateSecuritySupplement(sources) {
  const policies = new Map();
  const permissions = [];
  const resets = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(
      /^create policy ("(?:[^"]|"")+"|[a-z_]+)\s+on storage\.objects\b/gim,
    )) {
      const name = match[1];
      if (!policyNames.has(name)) throw new Error(`Unexpected policy: ${name}`);
      if (policies.has(name)) throw new Error(`Duplicate policy: ${name}`);
      policies.set(name, statementAt(source, match.index));
    }
    for (const match of source.matchAll(/^(revoke|grant)\s+[^;]+;/gim)) {
      const statement = match[0];
      const normalized = statement
        .toLowerCase()
        .replace(/\s*,\s*/g, ',')
        .replace(/\s+/g, ' ');
      const target = targets.find((value) => normalized.includes(` on ${value} `));
      if (!target) continue;
      permissions.push(statement);
      if (normalized.startsWith('revoke all on ')) resets.add(target);
    }
  }
  if (policies.size !== 8)
    throw new Error(`Expected eight storage policies, found ${policies.size}`);
  if (resets.size !== targets.length) throw new Error('Incomplete explicit ACL resets');
  return [
    '-- Generated security supplement from declarative schema; do not edit.',
    ...Array.from(
      policies,
      ([name, sql]) => `drop policy if exists ${name} on storage.objects;\n${sql}`,
    ),
    ...permissions,
    '',
  ].join('\n\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  const candidates = readdirSync(migrations).filter((name) =>
    name.endsWith('_product_contract_preview.sql'),
  );
  if (candidates.length !== 1)
    throw new Error('Expected exactly one freshly generated preview migration');
  const sources = [
    'database.sql',
    '60_catalog_product_media.sql',
    '65_purchase_receipts.sql',
    '80_workspace_retention.sql',
  ].map((name) => readFileSync(new URL(`../supabase/schemas/${name}`, import.meta.url), 'utf8'));
  const migration = new URL(candidates[0], migrations);
  const existing = readFileSync(migration, 'utf8');
  if (existing.includes('-- Generated security supplement'))
    throw new Error('Migration already supplemented');
  writeFileSync(migration, `${existing}\n${generateSecuritySupplement(sources)}`, 'utf8');
}
