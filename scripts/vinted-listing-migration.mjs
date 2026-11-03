// Ergänzt ausschließlich einen neuen CLI-Diff um deklarative Rechte und Bucket-Daten.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationStatements } from './check-local-migrations.mjs';

const marker = '-- Explizite Inseratrechte und privater Bucket aus dem deklarativen Schema.';
const tables = [
  'marketplace_listing_drafts',
  'marketplace_listing_images',
  'marketplace_listing_templates',
];
const jobsTables = ['marketplace_listing_jobs', 'marketplace_listing_permissions'];
const jobsMarker = '-- Explizite Inseratauftragsrechte aus dem deklarativen Schema.';
function lowercaseSql(sql) {
  let result = '',
    quote = null,
    lineComment = false,
    blockComment = false;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index],
      next = sql[index + 1];
    if (lineComment) {
      result += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      result += char;
      if (char === '*' && next === '/') {
        result += next;
        index++;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      result += char;
      if (char === quote) {
        if (next === quote) {
          result += next;
          index++;
        } else quote = null;
      }
      continue;
    }
    if (char === '-' && next === '-') {
      result += '--';
      index++;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      result += '/*';
      index++;
      blockComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else result += char.toLowerCase();
  }
  return result;
}
export function completeListingMigration(migration, schemas) {
  if (migration.includes(marker)) throw new Error('Inserat-Migration bereits ergänzt.');
  for (const table of tables)
    if (!new RegExp(`create table public\\.${table}\\b`, 'iu').test(migration))
      throw new Error(`Generierte Tabelle fehlt: ${table}`);
  // Ein großer Schema-Diff darf keinen vorhandenen Bereich nebenbei umbauen.
  for (const match of migration.matchAll(
    /^(?:alter table|drop table|create table)\s+(?:"?public"?\.)?"?([a-z_]+)"?/gimu,
  )) {
    if (!tables.includes(match[1])) throw new Error(`Fremde Tabellenänderung: ${match[1]}`);
  }
  const permissions = schemas.flatMap((schema) =>
    [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map((match) => match[0]),
  );
  for (const table of tables)
    if (
      !permissions.some((statement) =>
        new RegExp(`revoke all on public\\.${table} from`, 'iu').test(statement),
      )
    )
      throw new Error(`Rechte fehlen: ${table}`);
  const bucket = schemas.flatMap((schema) =>
    [...schema.matchAll(/^insert into storage\.buckets\([^;]+;/gimu)].map((match) => match[0]),
  );
  if (bucket.length !== 1 || !bucket[0].includes("'marketplace-listing-media'"))
    throw new Error('Privater Inserat-Bucket fehlt.');
  const policies = schemas.flatMap((schema) =>
    [...schema.matchAll(/^create policy "[^"]+" on storage\.objects[^;]+;/gimu)].map(
      (match) => match[0],
    ),
  );
  if (!policies.length) throw new Error('Inserat-Storage-Policies fehlen.');
  const missingPolicies = policies.filter(
    (policy) => !migration.includes(policy.match(/^create policy ("[^"]+")/iu)[1]),
  );
  return `-- Zweck: Vinted-Arbeitskopien, Originalfotos und ausgewählte Vorlagenfelder speichern.\n-- Betroffen: public.marketplace_listing_drafts, marketplace_listing_images, marketplace_listing_templates und private Storage-Policies.\n${lowercaseSql(migration.trimEnd())}\n\n${marker}\n${permissions.join('\n')}\n${bucket[0]}\n${missingPolicies.join('\n')}\n`;
}
export function completeListingJobsMigration(migration, schema, phase = 'jobs') {
  if (migration.includes(jobsMarker)) throw new Error('Inseratauftrags-Migration bereits ergänzt.');
  if (!['jobs', 'planning', 'execution', 'cloud', 'reschedule'].includes(phase))
    throw new Error('Unbekannte Inserat-Migrationsphase.');
  for (const table of phase === 'jobs' ? jobsTables : [])
    if (!new RegExp(`create table public\\.${table}\\b`, 'iu').test(migration))
      throw new Error(`Generierte Tabelle fehlt: ${table}`);
  if (
    phase === 'reschedule' &&
    !/create(?: or replace)? function public\.marketplace_reschedule_listing\b/iu.test(migration)
  )
    throw new Error('Generierte Terminänderung fehlt.');
  if (
    phase === 'planning' &&
    (!/create(?: or replace)? function public\.marketplace_replace_planned_listing\b/iu.test(
      migration,
    ) ||
      !/add(?: column)?\s+replaces_job_id\b/iu.test(migration))
  )
    throw new Error('Generierter Planungsersatz fehlt.');
  if (
    phase === 'execution' &&
    (!/create(?: or replace)? function public\.marketplace_local_listing_claim\b/iu.test(
      migration,
    ) ||
      !/add(?: column)?\s+claim_token\b/iu.test(migration))
  )
    throw new Error('Generierte lokale Inseratausführung fehlt.');
  if (
    phase === 'cloud' &&
    (!/create(?: or replace)? function public\.marketplace_cloud_listing_claim\b/iu.test(
      migration,
    ) ||
      !/add(?: column)?\s+cloud_worker_id\b/iu.test(migration))
  )
    throw new Error('Generierte Cloud-Inseratausführung fehlt.');
  for (const match of migration.matchAll(
    /^(?:alter table|drop table|create table)\s+(?:"?public"?\.)?"?([a-z_]+)"?/gimu,
  )) {
    if (!jobsTables.includes(match[1])) throw new Error(`Fremde Tabellenänderung: ${match[1]}`);
  }
  const permissions = [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map(
    (match) => match[0],
  );
  for (const table of jobsTables)
    if (
      !permissions.some((statement) =>
        new RegExp(`revoke all on public\\.${table} from`, 'iu').test(statement),
      )
    )
      throw new Error(`Rechte fehlen: ${table}`);
  const purpose = {
    jobs: 'eigene Inseratfreigaben und unveränderliche, revisionsgebundene Aufträge speichern.',
    planning: 'geplante Inserataufträge atomar durch eine neue Inhaltsrevision ersetzen.',
    execution:
      'lokale Inseratversuche übernehmen und Schreibbeginn sowie Ergebnisse dauerhaft binden.',
    cloud: 'Cloud-Inseratversuche an Worker und bestätigten physischen Browserstopp binden.',
    reschedule: 'Termine atomar ändern und vorhandene Aktion sowie Fotoeinstellung erhalten.',
  }[phase];
  return `-- Zweck: ${purpose}\n-- Betroffen: public.marketplace_listing_permissions und marketplace_listing_jobs sowie deren kontrollierte RPCs.\n${lowercaseSql(migration.trimEnd())}\n\n${jobsMarker}\n${permissions.join('\n')}\n`;
}
export function completeListingJobUpdatesMigration(migration, schema) {
  const updatesMarker = '-- Explizite Rechte für private Inseratauftragsmeldungen.';
  if (migration.includes(updatesMarker))
    throw new Error('Inseratmeldungs-Migration bereits ergänzt.');
  if (
    !/create(?: or replace)? function public\.marketplace_notify_listing_job_change\b/iu.test(
      migration,
    ) ||
    !/create trigger marketplace_notify_listing_job_change\b[^;]+on public\.marketplace_listing_jobs/iu.test(
      migration,
    )
  )
    throw new Error('Generierte Inseratmeldungen sind unvollständig.');
  if (/^(?:alter table|drop\b|create table)\s/imu.test(migration))
    throw new Error('Unerwartete Tabellen- oder Löschänderung.');
  for (const match of migration.matchAll(/create(?: or replace)? function public\.([a-z_]+)/gimu))
    if (match[1] !== 'marketplace_notify_listing_job_change')
      throw new Error('Fremde Funktionsänderung.');
  const permissions = [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map(
    (match) => match[0],
  );
  if (
    permissions.length !== 2 ||
    permissions.some(
      (statement) => !statement.includes('function public.marketplace_notify_listing_job_change()'),
    )
  )
    throw new Error('Deklarative Meldungsrechte fehlen.');
  // Der CLI-Abgleich liefert trotz ausgewähltem realtime-Schema dessen Lesepolicy nicht mit.
  const policies = [
    ...schema.matchAll(
      /^create policy "Kontoverwalter empfangen Inserataufträge" on realtime\.messages[^;]+;/gimu,
    ),
  ].map((match) => match[0]);
  if (policies.length !== 1) throw new Error('Deklarative private Lesepolicy fehlt.');
  const missingPolicy =
    /create policy "Kontoverwalter empfangen Inserataufträge" on realtime\.messages/iu.test(
      migration,
    )
      ? ''
      : policies[0] + '\n';
  return `-- Zweck: private Änderungsmeldungen für den Inseratauftragsverlauf.\n-- Betroffen: Trigger auf public.marketplace_listing_jobs und Lesepolicy auf realtime.messages.\n${lowercaseSql(migration.trimEnd())}\n\n${updatesMarker}\n${permissions.join('\n')}\n${missingPolicy}`;
}
/** Entfernt nur katalogseitig unveränderte Generator-Überschüsse aus einem neuen CLI-Diff. */
export function completeRelistingLifecycleMigration(migration, schemas, proof) {
  if (createHash('sha256').update(migration).digest('hex') !== proof?.rawSha256)
    throw new Error('CLI-Rohdiff stimmt nicht mit dem Katalogbeleg überein.');
  const key = (item) => `${item.schema}.${item.table ?? ''}.${item.name}`;
  const constraints = new Map();
  const views = new Map();
  for (const item of proof.constraints ?? []) {
    if (
      item.schema !== 'public' ||
      !item.beforeDefinition ||
      item.beforeDefinition !== item.afterDefinition ||
      constraints.has(key(item))
    )
      throw new Error('Unveränderte Prüfklausel nicht eindeutig belegt.');
    constraints.set(key(item), item);
  }
  for (const item of proof.views ?? []) {
    if (
      item.schema !== 'public' ||
      typeof item.beforeDefinition !== 'string' ||
      !item.beforeDefinition ||
      item.beforeDefinition !== item.afterDefinition ||
      ![item.beforeOptions, item.afterOptions, item.beforeAcl, item.afterAcl].every(
        (values) => Array.isArray(values) && values.every((value) => typeof value === 'string'),
      ) ||
      JSON.stringify(item.beforeOptions) !== JSON.stringify(item.afterOptions) ||
      JSON.stringify(item.beforeAcl) !== JSON.stringify(item.afterAcl) ||
      views.has(key(item))
    )
      throw new Error('Unveränderte Ansicht samt Rechten nicht eindeutig belegt.');
    views.set(key(item), item);
  }
  const functions = new Map();
  for (const item of proof.functions ?? []) {
    if (
      item.schema !== 'public' ||
      !/^[a-z_][a-z0-9_]*$/u.test(item.name) ||
      typeof item.isNew !== 'boolean' ||
      !/^[a-f0-9]{64}$/u.test(item.afterHash ?? '') ||
      (item.isNew && item.beforeHash !== null) ||
      (!item.isNew &&
        (!/^[a-f0-9]{64}$/u.test(item.beforeHash ?? '') || item.beforeHash === item.afterHash)) ||
      functions.has(item.name)
    )
      throw new Error('Geänderte Funktion nicht eindeutig belegt.');
    functions.set(item.name, item);
  }
  if (!functions.size) throw new Error('Kein belegter Aufgabenunterschied.');
  const removedConstraints = new Map();
  const removedViews = new Map();
  const seenFunctions = new Set();
  const addedConstraints = new Set();
  const validatedConstraints = new Set();
  let hasColumn = false,
    hasIndex = false;
  const kept = [];
  const functionName = /\bfunction\s+"?public"?\."?([a-z_][a-z0-9_]*)"?\s*\(/iu;
  const helperPermission = (statement) => {
    const match =
      /^(revoke\s+all|grant\s+execute)\s+on\s+function\s+"?public"?\."?([a-z_][a-z0-9_]*)"?\s*\([^();]*\)\s+(from|to)\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)\s*;?$/iu.exec(
        statement,
      );
    if (!match || !functions.get(match[2])?.isNew)
      throw new Error('Rechte müssen genau einen neuen Relisting-Helfer betreffen.');
    const roles = match[4]
      .toLowerCase()
      .split(',')
      .map((role) => role.trim());
    if (
      (/^grant/iu.test(match[1]) &&
        (match[3].toLowerCase() !== 'to' || roles.length !== 1 || roles[0] !== 'service_role')) ||
      (/^revoke/iu.test(match[1]) &&
        (match[3].toLowerCase() !== 'from' ||
          roles.some((role) => !['public', 'anon', 'authenticated'].includes(role))))
    )
      throw new Error('Unbelegte Rolle in den Rechten eines Relisting-Helfers.');
    return match[2];
  };
  const taskConstraints = new Set([
    'marketplace_listing_jobs_relist_entry_check',
    'marketplace_listing_jobs_editing_previous_state_check',
    'marketplace_listing_jobs_workspace_id_connection_id_relist_fkey',
  ]);
  for (const raw of migrationStatements(migration)) {
    const statement = raw.replace(/^(?:\s|--[^\n]*(?:\n|$))+/u, '');
    const constraint =
      /^alter table "?public"?\."?([a-z_]+)"? (drop|add|validate) constraint "?([a-z_0-9]+)"?(?:\s|$)/iu.exec(
        statement,
      );
    const constraintKey = constraint ? `public.${constraint[1]}.${constraint[3]}` : null;
    const unchanged = constraints.get(constraintKey);
    if (unchanged) {
      if (constraint[2].toLowerCase() === 'add') {
        const definition = statement
          .slice(constraint[0].length)
          .trim()
          .replace(/\s+not valid$/iu, '');
        if (definition !== unchanged.afterDefinition)
          throw new Error('Prüfklausel weicht vom Katalogbeleg ab.');
      }
      const actions = removedConstraints.get(constraintKey) ?? new Set();
      const action = constraint[2].toLowerCase();
      if (actions.has(action)) throw new Error('Doppelte Prüfklausel im Generator-Überschuss.');
      actions.add(action);
      removedConstraints.set(constraintKey, actions);
      continue;
    }
    const view =
      /^(?:drop view if exists|create or replace view) "?public"?\."?([a-z_]+)"?(?:\s|$)/iu.exec(
        statement,
      );
    const viewAcl =
      /^(?:grant|revoke)\b[^;]*\bon (?:table )?"?public"?\."?([a-z_]+)"?(?:\s|$)/iu.exec(statement);
    const viewKey = `public..${view?.[1] ?? viewAcl?.[1] ?? ''}`;
    if (views.has(viewKey)) {
      if (view) {
        const actions = removedViews.get(viewKey) ?? new Set();
        const action = /^drop /iu.test(statement) ? 'drop' : 'create';
        if (actions.has(action)) throw new Error('Doppelte Ansicht im Generator-Überschuss.');
        actions.add(action);
        removedViews.set(viewKey, actions);
      }
      continue;
    }
    const name = functionName.exec(statement)?.[1];
    if (/^create(?: or replace)? function\b/iu.test(statement)) {
      if (!functions.has(name) || seenFunctions.has(name))
        throw new Error('Fremde oder doppelte Funktionsänderung.');
      // migrationStatements erhält Dollarstrings, Zitate und Kommentare unverändert.
      // pg_get_functiondef bei leerem Suchpfad endet mit genau einem LF.
      const hash = createHash('sha256')
        .update(statement.replace(/\r\n/gu, '\n') + '\n')
        .digest('hex');
      if (hash !== functions.get(name).afterHash)
        throw new Error('Funktionsdefinition weicht vom Katalogbeleg ab.');
      seenFunctions.add(name);
    } else if (/^(?:grant|revoke)\b/iu.test(statement)) {
      helperPermission(statement);
    } else if (constraint) {
      if (
        constraint[1] !== 'marketplace_listing_jobs' ||
        !taskConstraints.has(constraint[3]) ||
        (constraint[2].toLowerCase() === 'drop' &&
          constraint[3] !== 'marketplace_listing_jobs_editing_previous_state_check')
      )
        throw new Error('Fremde Tabellenprüfung im Aufgaben-Diff.');
      if (constraint[2].toLowerCase() === 'add') addedConstraints.add(constraint[3]);
      if (constraint[2].toLowerCase() === 'validate') validatedConstraints.add(constraint[3]);
    } else if (
      /^alter table "?public"?\."?marketplace_listing_jobs"? add column "?relist_entry_id"? uuid$/iu.test(
        statement,
      )
    ) {
      if (hasColumn) throw new Error('Doppelte Artikelbindung.');
      hasColumn = true;
    } else if (
      /^create index "?marketplace_listing_jobs_relist_entry"? on "?public"?\."?marketplace_listing_jobs"?(?:\s|$)/iu.test(
        statement,
      )
    ) {
      if (hasIndex) throw new Error('Doppelter Bindungsindex.');
      hasIndex = true;
    } else if (!/^set check_function_bodies\s*=\s*off$/iu.test(statement))
      throw new Error('Unbekannte Änderung im Aufgaben-Diff.');
    kept.push(raw);
  }
  if (seenFunctions.size !== functions.size)
    throw new Error('Belegte Aufgabenfunktion fehlt im Diff.');
  if (
    !hasColumn ||
    !hasIndex ||
    [...taskConstraints].some(
      (name) => !addedConstraints.has(name) || !validatedConstraints.has(name),
    )
  )
    throw new Error('Artikelbindung oder geprüfte Integritätsregeln fehlen im Diff.');
  if (
    [...removedConstraints.values()].some((actions) => actions.size !== 3) ||
    [...removedViews.values()].some((actions) => actions.size !== 2)
  )
    throw new Error('Unvollständiger unveränderter Generator-Überschuss.');
  const permissions = [
    ...new Set(
      schemas.flatMap((schema) =>
        [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map((match) => match[0].trim()),
      ),
    ),
  ].filter((statement) => functions.get(functionName.exec(statement)?.[1])?.isNew);
  for (const statement of permissions) helperPermission(statement);
  for (const [name, item] of functions) {
    if (!item.isNew) continue;
    const own = permissions.filter((statement) => functionName.exec(statement)?.[1] === name);
    const revoked = own
      .filter((statement) => /^revoke all /iu.test(statement))
      .flatMap((statement) =>
        (statement.match(/\bfrom\s+([^;]+);$/iu)?.[1] ?? '').split(',').map((role) => role.trim()),
      );
    if (
      !['public', 'anon', 'authenticated'].every((role) => revoked.includes(role)) ||
      !own.some(
        (statement) =>
          /^grant execute /iu.test(statement) && /\bto service_role;$/iu.test(statement),
      )
    )
      throw new Error(`Explizite Rechte der neuen Funktion fehlen: ${name}`);
  }
  return `-- Zweck: Kleiderschrank-Artikel beim Relisting erhalten, schützen und atomar neu verknüpfen.\n-- Betroffen: marketplace_listing_jobs, Artikelimport, Artikelzuordnung und Inseratstatistik.\n-- Automatisch aus CLI-Diff und unveränderten S0/S1-Katalogobjekten erzeugt; Roh-SHA256: ${proof.rawSha256}.\n${lowercaseSql(kept.join(';\n\n'))};\n\n-- Explizite Rechte ausschließlich der neuen Relisting-Helfer aus dem deklarativen Schema.\n${permissions.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  if (
    !/^supabase[/\\]migrations[/\\]\d{14}_(?:vinted_listing_(?:drafts|jobs|planning|execution|cloud|reschedule|updates)|marketplace_relisting_lifecycle)\.sql$/.test(
      path ?? '',
    )
  )
    throw new Error('Pfad der frisch generierten Inserat-Migration erforderlich.');
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (tracked.error || tracked.status !== 1)
    throw new Error('Versionierte Migration oder Git-Status nicht prüfbar.');
  if (/_marketplace_relisting_lifecycle\.sql$/.test(path)) {
    if (!process.argv[3]) throw new Error('Unabhängiger S0/S1-Katalogbeleg erforderlich.');
    const files = (await readdir('supabase/schemas')).filter((name) => name.endsWith('.sql'));
    await writeFile(
      path,
      completeRelistingLifecycleMigration(
        await readFile(path, 'utf8'),
        await Promise.all(files.map((name) => readFile(`supabase/schemas/${name}`, 'utf8'))),
        JSON.parse(await readFile(process.argv[3], 'utf8')),
      ),
    );
  } else if (/_vinted_listing_updates\.sql$/.test(path)) {
    await writeFile(
      path,
      completeListingJobUpdatesMigration(
        await readFile(path, 'utf8'),
        await readFile('supabase/schemas/466_marketplace_listing_job_updates.sql', 'utf8'),
      ),
    );
  } else if (/_vinted_listing_(?:jobs|planning|execution|cloud|reschedule)\.sql$/.test(path)) {
    const phase = path.match(/_vinted_listing_(jobs|planning|execution|cloud|reschedule)\.sql$/)[1];
    const schema = (
      await Promise.all(
        (phase === 'execution' || phase === 'cloud'
          ? [
              '463_marketplace_listing_jobs',
              '464_marketplace_listing_execution',
              ...(phase === 'cloud' ? ['465_marketplace_listing_cloud_execution'] : []),
            ]
          : ['463_marketplace_listing_jobs']
        ).map((name) => readFile(`supabase/schemas/${name}.sql`, 'utf8')),
      )
    ).join('\n');
    await writeFile(
      path,
      completeListingJobsMigration(await readFile(path, 'utf8'), schema, phase),
    );
  } else {
    const schemas = await Promise.all(
      [
        '460_marketplace_listing_drafts',
        '461_marketplace_listing_images',
        '462_marketplace_listing_templates',
      ].map((name) => readFile(`supabase/schemas/${name}.sql`, 'utf8')),
    );
    await writeFile(path, completeListingMigration(await readFile(path, 'utf8'), schemas));
  }
}
