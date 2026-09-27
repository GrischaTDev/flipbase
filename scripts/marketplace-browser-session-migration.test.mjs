import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeBrowserSessionMigration } from './marketplace-browser-session-migration.mjs';

const schema = `
revoke all on public.marketplace_browser_test_sessions from public, anon, authenticated;
grant select on public.marketplace_browser_test_sessions to authenticated;
grant all on public.marketplace_browser_test_sessions to service_role;
revoke all on function public.marketplace_test_session_start(uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_start(uuid, uuid) to authenticated;
revoke all on function public.marketplace_test_session_status(uuid, uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_status(uuid, uuid, uuid) to authenticated;
revoke all on function public.marketplace_test_session_action(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.marketplace_test_session_action(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.marketplace_revoke_browser_tests_on_pause() from public, anon, authenticated;
`;

test('ergänzt die erzeugte Migration um Zweck und ausdrückliche Schema-Rechte', () => {
  const result = finalizeBrowserSessionMigration('-- Migration unit 1: schema_changes\n', schema);
  assert.match(result, /^-- Zweck: Künstliche, kontogebundene Browser-Testsitzungen/m);
  assert.match(
    result,
    /revoke all on public\.marketplace_browser_test_sessions from public, anon, authenticated;/,
  );
  assert.match(
    result,
    /revoke all on function public\.marketplace_revoke_browser_tests_on_pause\(\) from public, anon, authenticated;/,
  );
});

test('wiederholter Lauf verändert die Migration nicht', () => {
  const first = finalizeBrowserSessionMigration(
    'create table public.marketplace_browser_test_sessions ();\n',
    schema,
  );
  assert.equal(finalizeBrowserSessionMigration(first, schema), first);
});

test('unvollständige Rechte im Schema werden abgewiesen', () => {
  assert.throws(() =>
    finalizeBrowserSessionMigration(
      'create table x ();',
      schema.replace(
        'grant select on public.marketplace_browser_test_sessions to authenticated;',
        '',
      ),
    ),
  );
});
