-- Zweck: Der Trefferbildung das Ausfuehrungsrecht fuer anon und authenticated
-- entziehen.
--
-- Betroffen: Funktion public.sniper_evaluate_hits(uuid, boolean).
--
-- Warum von Hand und nicht ueber den Abgleich: In diesem Projekt vergeben die
-- Vorgaberechte (`pg_default_acl`) auf jede neu angelegte Funktion im Schema
-- public automatisch `execute` an authenticated. `supabase db diff` erzeugt
-- dazu nur `revoke all ... from public` - das trifft das rollenbezogene Recht
-- nicht. Nach dem Wiedereinspielen der Migrationen stand deshalb
-- `authenticated=X` in der Rechteliste, obwohl die Schemadatei das Recht
-- ausdruecklich entzieht.
--
-- Das ist keine Kleinigkeit: Die Funktion laeuft mit `security definer` und
-- schreibt in sniper_hits. Mit dem Recht koennte jeder angemeldete Nutzer die
-- Trefferbildung fremder Arbeitsbereiche ausloesen.
--
-- Dieselbe Abweichung gab es am 04.09.2026 schon einmal auf den Tabellen
-- (20260904190823_revoke_anon_on_sniper_tables.sql). Die Pruefung in
-- supabase/tests/deal_monitor_evaluate_hits.sql faellt jetzt darauf, sobald
-- eine Umgebung wieder abweicht.

revoke execute on function public.sniper_evaluate_hits(uuid, boolean)
    from anon, authenticated;
