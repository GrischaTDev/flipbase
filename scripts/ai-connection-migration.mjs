import { migrationStatements } from './check-local-migrations.mjs';
import { normalizeGeneratedSqlKeywords } from './marketplace-migration-permissions.mjs';

/** Begrenzt einen neuen CLI-Diff auf diese Erweiterung; historischer Schema-Drift bleibt unverändert. */
export function completeAiConnectionMigration(generated, schema) {
  const statements = migrationStatements(generated).filter(
    (statement) =>
      /\bai_connection(?:s|_[a-z_]+)?\b|\bai_sale_draft_valid\b|\bmarketplace_listing_job_valid\b|\bmarketplace_account_action_authorized\b/.test(
        statement,
      ) ||
      /validate constraint \"marketplace_(?:listing_jobs|account_actions)_ai_connection_id_fkey\"/.test(
        statement,
      ),
  );
  for (const name of ['ai_connections', 'ai_connection_accounts', 'ai_connection_requests']) {
    if (
      !statements.some((s) =>
        new RegExp(`create table "?public"?\\."?${name}"?\\b`, 'i').test(s.replaceAll('"', '')),
      )
    )
      throw new Error(`Generierte Tabelle fehlt: ${name}`);
  }
  if (statements.some((s) => /^\s*(drop|truncate)\b/i.test(s)))
    throw new Error('Unerwartete destruktive KI-Migration.');
  const declarations = migrationStatements(schema)
    .filter((statement) => /^(?:revoke|grant|comment on table)\s/i.test(statement))
    .map((statement) => statement + ';');
  if (
    !declarations.some(
      (s) => s.includes('ai_connection_access_token_hook') && s.endsWith('to supabase_auth_admin;'),
    )
  )
    throw new Error('Der Auth-Hook-Vertrag fehlt.');
  return `-- Zweck: Persönliche OAuth-Freigaben und begrenzte MCP-Fachaktionen für Anwendung und Vinted.
-- Betroffen: ai_connections, ai_connection_accounts, ai_connection_requests sowie marketplace_listing_jobs.ai_connection_id und marketplace_account_actions.ai_connection_id.
${normalizeGeneratedSqlKeywords(statements.join(';\n\n'))};

-- Explizite Rechte und Tabellenkommentare aus dem deklarativen Schema.
${declarations.join('\n')}
`;
}
