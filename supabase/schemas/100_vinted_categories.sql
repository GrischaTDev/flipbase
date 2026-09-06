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
create table if not exists public.vinted_category_sync (
    id integer primary key default 1 check (id = 1),
    refreshed_at timestamptz,
    requested_at timestamptz,
    last_attempt_at timestamptz,
    category_count integer not null default 0,
    last_error text
);

comment on table public.vinted_category_sync is
    'Wann der Kategoriebaum zuletzt eingelesen wurde, ob eine Auffrischung angefordert ist und was zuletzt schiefging. Genau eine Zeile.';

comment on column public.vinted_category_sync.requested_at is
    'Von der Administration gesetzt. Liegt der Wert nach refreshed_at, liest der Dienst beim naechsten Takt neu ein. Bewusst ueber die Datenbank statt ueber einen Endpunkt: Der Dienst hat keinen offenen Eingang, und ein Feld genuegt.';

insert into public.vinted_category_sync (id) values (1)
on conflict (id) do nothing;

alter table public.vinted_category_sync enable row level security;

create policy "Angemeldete lesen den Auffrischungsstand" on public.vinted_category_sync
    for select to authenticated
    using (true);

-- Anfordern darf nur die Administration. Die Spaltenrechte weiter unten
-- begrenzen zusaetzlich, welches Feld ueberhaupt geschrieben werden kann.
create policy "Administration fordert Auffrischung an" on public.vinted_category_sync
    for update to authenticated
    using (public.is_platform_operator())
    with check (public.is_platform_operator());

-- Anon bekommt hier absichtlich ein blosses select-Recht. Ohne dieses Recht
-- bricht eine Abfrage als anon schon an der Zugriffsrechte-Pruefung mit
-- "permission denied" ab, bevor RLS ueberhaupt greift - der eigentliche
-- Schutz kommt aus der fehlenden anon-Policy oben: Ohne sie liefert RLS an
-- anon in jedem Fall null Zeilen.
revoke all on table public.vinted_categories from anon, authenticated;
grant select on table public.vinted_categories to authenticated;
grant select on table public.vinted_categories to anon;

revoke all on table public.vinted_category_sync from anon, authenticated;
grant select on table public.vinted_category_sync to authenticated;
grant select on table public.vinted_category_sync to anon;

-- Nur dieses eine Feld ist von aussen schreibbar. refreshed_at, category_count
-- und last_error setzt allein der Dienst - waeren sie schreibbar, koennte die
-- Oberflaeche einen Stand behaupten, den es nie gab.
grant update (requested_at) on table public.vinted_category_sync to authenticated;
