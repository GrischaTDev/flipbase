-- Zweck: Den Sniper-Funktionen die Ausfuehrungsrechte fuer anon und
-- authenticated entziehen, die die Vorgaberechte automatisch vergeben.
--
-- Betroffen:
--   public.sniper_evaluate_hits(uuid, boolean)
--   public.sniper_reference_price(uuid, text)
--   public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric)
--
-- Warum von Hand und nicht ueber den Abgleich: In diesem Projekt vergeben die
-- Vorgaberechte (`pg_default_acl`) auf jede neu angelegte Funktion im Schema
-- public automatisch `execute` an authenticated. `supabase db diff` erzeugt
-- dazu nur `revoke all ... from public` - das trifft ein rollenbezogenes Recht
-- nicht. Nach dem Wiedereinspielen der Migrationen stand deshalb
-- `authenticated=X` in der Rechteliste, obwohl die Schemadatei das Recht
-- ausdruecklich entzieht.
--
-- Bei sniper_evaluate_hits ist das nicht kosmetisch: Die Funktion laeuft mit
-- `security definer` und schreibt in sniper_hits. Mit dem Recht koennte jeder
-- angemeldete Nutzer die Trefferbildung fremder Arbeitsbereiche ausloesen.
--
-- Die beiden anderen sind heute nicht ausnutzbar - sniper_reference_price
-- laeuft mit `security invoker` und scheitert fuer anon am fehlenden Leserecht,
-- create_sniper_subscription an `is_workspace_member`. Sie stehen trotzdem
-- hier, weil die Schemadatei den Entzug fuer anon vorschreibt und die
-- erzeugten Migrationen ihn nicht mitgenommen haben. Die Rechte sollen in
-- jeder Umgebung gleich aussehen, nicht nur dort, wo ein zweiter Riegel haelt.
--
-- Dieselbe Abweichung gab es am 04.09.2026 schon einmal auf den Tabellen
-- (20260904190823_revoke_anon_on_sniper_tables.sql), und dort war sie auf der
-- Produktionsdatenbank tatsaechlich vorhanden. Erzeugte Rechte-Anweisungen
-- bilden immer die Maschine ab, auf der sie entstanden sind.

revoke execute on function public.sniper_evaluate_hits(uuid, boolean)
    from anon, authenticated;

revoke execute on function public.sniper_reference_price(uuid, text)
    from anon;

revoke execute on function public.create_sniper_subscription(
    uuid, text, integer, numeric, numeric, numeric
) from anon;
