-- Vinted-Kategoriebaum und sein Auffrischungsstand.
--
-- Die Ladereihenfolge ist bindend und steht in supabase/config.toml. Diese
-- Datei nutzt public.is_platform_operator() aus 99_platform_admin.sql und wird
-- deshalb nach dieser geladen - daher die Nummer 100.
--
-- Warum gespeichert und nicht bei jeder Anzeige geholt: Vinted bietet keinen
-- Endpunkt fuer die Kategorieliste - /api/v2/catalogs und
-- /api/v2/catalog/initializers antworten mit 404. Der Baum steht nur im HTML
-- der Startseite. Haenge die Bedienoberflaeche direkt daran, faellt sie aus,
-- sobald Vinted sein Seitenformat aendert. Gespeichert bleibt sie benutzbar,
-- und die Administration sieht, dass der Stand alt ist.

create table if not exists public.vinted_categories (
    id integer primary key,
    parent_id integer references public.vinted_categories (id) on delete cascade,
    title text not null,
    slug text not null,
    path text not null,
    is_leaf boolean not null default false,
    updated_at timestamptz not null default now()
);

comment on table public.vinted_categories is
    'Der Kategoriebaum von Vinted, flach gespeichert. Die id ist die Nummer von Vinted, keine eigene - sie geht so in catalog_ids einer Abfrage.';

comment on column public.vinted_categories.path is
    'Lesbarer Pfad wie "Damen > Schuhe > Stiefel". Steht hier statt im Frontend, damit Suche und Anzeige dieselbe Zeichenkette benutzen.';

comment on column public.vinted_categories.is_leaf is
    'Ob die Kategorie keine Unterkategorien hat. Nur Blaetter sind als Sammelauftrag sinnvoll eng.';

alter table public.vinted_categories enable row level security;

-- Lesen darf jeder Angemeldete: Der Kategoriewaehler steht spaeter auch im
-- Arbeitsbereich, nicht nur in der Administration.
create policy "Angemeldete lesen Kategorien" on public.vinted_categories
    for select to authenticated
    using (true);

-- Geschrieben wird ausschliesslich mit Dienstschluessel durch den Sniper.
-- Es gibt absichtlich keine Schreib-Policy fuer authenticated.

create index if not exists idx_vinted_categories_parent
    on public.vinted_categories (parent_id);

create index if not exists idx_vinted_categories_leaf
    on public.vinted_categories (is_leaf);

-- Auffrischungsstand. Genau eine Zeile - die Pruefung auf id = 1 ist der
-- einfachste Weg, das zu erzwingen, ohne einen Trigger zu schreiben.
create table if not exists public.vinted_category_syncs (
    id integer primary key default 1 check (id = 1),
    refreshed_at timestamptz,
    requested_at timestamptz,
    last_attempt_at timestamptz,
    category_count integer not null default 0,
    last_error text
);

comment on table public.vinted_category_syncs is
    'Wann der Kategoriebaum zuletzt eingelesen wurde, ob eine Auffrischung angefordert ist und was zuletzt schiefging. Genau eine Zeile.';

comment on column public.vinted_category_syncs.requested_at is
    'Von der Administration gesetzt. Liegt der Wert nach refreshed_at, liest der Dienst beim naechsten Takt neu ein. Bewusst ueber die Datenbank statt ueber einen Endpunkt: Der Dienst hat keinen offenen Eingang, und ein Feld genuegt.';

insert into public.vinted_category_syncs (id) values (1)
on conflict (id) do nothing;

alter table public.vinted_category_syncs enable row level security;

create policy "Angemeldete lesen den Auffrischungsstand" on public.vinted_category_syncs
    for select to authenticated
    using (true);

-- Anfordern darf nur die Administration. Die Spaltenrechte weiter unten
-- begrenzen zusaetzlich, welches Feld ueberhaupt geschrieben werden kann.
create policy "Administration fordert Auffrischung an" on public.vinted_category_syncs
    for update to authenticated
    using (public.is_platform_operator())
    with check (public.is_platform_operator());

-- Anon bekommt hier bewusst weder Policy noch Tabellenrecht. RLS ist die
-- erste Schutzschicht, das Tabellenrecht die zweite - am 04.09.2026 wurde in
-- 20260904190823_revoke_anon_on_sniper_tables.sql genau diese zweite Schicht
-- fuer die Sniper-Tabellen nachtraeglich geschlossen. Hier gilt dieselbe
-- Entscheidung von Anfang an: eine Abfrage als anon bricht schon an der
-- Zugriffsrechte-Pruefung mit "permission denied" ab, bevor RLS ueberhaupt
-- greift.
revoke all on table public.vinted_categories from anon, authenticated;
grant select on table public.vinted_categories to authenticated;

revoke all on table public.vinted_category_syncs from anon, authenticated;
grant select on table public.vinted_category_syncs to authenticated;

-- Nur dieses eine Feld ist von aussen schreibbar. refreshed_at, category_count
-- und last_error setzt allein der Dienst - waeren sie schreibbar, koennte die
-- Oberflaeche einen Stand behaupten, den es nie gab.
grant update (requested_at) on table public.vinted_category_syncs to authenticated;

-- Die Anforderung wird gestempelt, nicht uebermittelt.
--
-- Dasselbe Muster wie stamp_beta_application_decision() in
-- 99_platform_admin.sql und aus demselben Grund: Der Zeitstempel kaeme sonst
-- von einer fremden Uhr. Setzt der Browser des Betreibers requested_at und
-- geht seine Uhr vor, liegt der Wert stundenlang hinter dem refreshed_at,
-- das der Dienst aus seiner eigenen Uhr schreibt - die Anforderung gilt
-- solange als offen, und der Dienst liest bei jedem Takt neu ein. now() in
-- der Datenbank ist die einzige Uhr, die beide Seiten teilen.
--
-- Gestempelt wird nur, wenn requested_at wirklich einen neuen Wert bekommt.
-- Der Dienst schreibt mit Dienstschluessel refreshed_at, last_attempt_at,
-- category_count und last_error in dieselbe Zeile; stempelte der Trigger
-- dabei mit, setzte jeder eigene Lauf eine neue Anforderung ab und der Dienst
-- liefe im Kreis. Ein ausdrueckliches null bleibt null - so laesst sich eine
-- Anforderung auch wieder zuruecknehmen.
create or replace function public.stamp_vinted_category_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.requested_at is not null and new.requested_at is distinct from old.requested_at then
    new.requested_at := now();
  end if;
  return new;
end;
$$;

create trigger stamp_vinted_category_request
    before update on public.vinted_category_syncs
    for each row
    execute function public.stamp_vinted_category_request();
