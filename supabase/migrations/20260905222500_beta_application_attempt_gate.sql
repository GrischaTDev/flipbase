-- Zweck: Drosselung der Beta-Bewerbungen atomar machen.
--
-- Betroffen: neue Funktion public.beta_application_attempt(text, integer, integer).
-- Keine Tabellen- oder Spaltenaenderung.
--
-- Warum von Hand und nicht ueber den Abgleich: `supabase db diff` erzeugte hier
-- eine Migration, die zusaetzlich rund ein Dutzend fremder Funktionen aus dem
-- Einkaufsbereich neu geschrieben haette (add_purchase_lines,
-- correct_purchase_costing, create_purchase und weitere). Die gehoeren einem
-- anderen Arbeitsstrang; sie hier mitzuschleifen waere ein stiller Eingriff in
-- fremde Arbeit. Diese Datei enthaelt deshalb ausschliesslich die neue Funktion.
--
-- Der Rechteentzug steht ebenfalls hier, weil der Abgleich fuer Funktionen nur
-- `revoke ... from public` erzeugt. Die Vorgaberechte dieses Projekts geben
-- jeder neuen Funktion im Schema public automatisch `execute` an authenticated;
-- ohne den Entzug koennte jeder Angemeldete das Kontingent leerlaufen lassen und
-- damit echte Bewerbungen aussperren. Es ist der vierte Fall dieser Art hier.

create or replace function public.beta_application_attempt(
    p_origin_hash text,
    p_max_per_origin integer,
    p_max_total integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '1 hour';
  v_per_origin integer;
  v_total integer;
begin
  -- Feste Kennzahl, weil der Riegel als Ganzes serialisiert wird. Sie ist frei
  -- gewaehlt und muss nur im Projekt eindeutig bleiben.
  perform pg_advisory_xact_lock(4711000001);

  -- Aufraeumen zuerst: Der Tabellenkommentar verspricht 24 Stunden, und ohne
  -- Scheduler ist dieser Aufruf die einzige Gelegenheit dazu. Nebenbei
  -- verkleinert es die Menge, ueber die gleich gezaehlt wird.
  delete from public.beta_application_attempts
  where created_at < now() - interval '24 hours';

  select count(*) into v_total
  from public.beta_application_attempts
  where created_at >= v_since;

  if v_total >= p_max_total then
    return false;
  end if;

  select count(*) into v_per_origin
  from public.beta_application_attempts
  where origin_hash = p_origin_hash
    and created_at >= v_since;

  if v_per_origin >= p_max_per_origin then
    return false;
  end if;

  insert into public.beta_application_attempts (origin_hash) values (p_origin_hash);
  return true;
end;
$$;

comment on function public.beta_application_attempt(text, integer, integer) is
    'Prueft beide Drosselungsgrenzen und traegt den Versuch ein - atomar, damit gleichzeitige Anfragen die Grenze nicht gemeinsam ueberschreiten. Nur fuer den Dienstschluessel.';

revoke all on function public.beta_application_attempt(text, integer, integer)
    from public, anon, authenticated;
