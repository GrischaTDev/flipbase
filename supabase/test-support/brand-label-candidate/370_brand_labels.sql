-- Nicht ausgeführter Schemakandidat für Aufgabe 1, KEINE Release-Migration.
-- Erst in einem isolierten PostgreSQL-17-/Supabase-Checkout prüfen. Dann unter
-- supabase/schemas registrieren und die Migration mit der Projekt-CLI erzeugen.
-- Ergänzende Inhalts-/RPC-Kandidaten liegen in 371_brand_label_content.sql
-- und 371_brand_label_operations.sql. Sämtliche SQL-Laufzeitnachweise fehlen.
-- Keine direkten DML-Grants und keine Produktions-Test-Seeds.
-- Abhängigkeiten: auth.users, auth.uid(), public.is_platform_operator(),
-- public.workspace_members, public.workspace_access_is_valid(uuid).

create table public.label_brands (
    id integer generated always as identity primary key,
    name text not null check (char_length(name) between 1 and 160 and name !~ '^[[:space:]]*$'),
    slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    aliases text[] not null default '{}' check (cardinality(aliases) <= 20 and array_position(aliases, null) is null),
    archived boolean not null default false,
    version integer not null default 1 check (version > 0),
    created_at timestamptz not null default now()
);
comment on table public.label_brands is 'Globale Referenzmarken; unabhängig von Workspace-Stammdaten.';

create table public.label_brand_lines (
    id integer generated always as identity primary key,
    label_brand_id integer not null references public.label_brands(id),
    name text not null check (char_length(name) between 1 and 160 and name !~ '^[[:space:]]*$'),
    archived boolean not null default false,
    version integer not null default 1 check (version > 0),
    unique (label_brand_id, name)
);
comment on table public.label_brand_lines is 'Redaktionelle Markenlinien innerhalb einer Referenzmarke.';
create index label_brand_lines_brand_idx on public.label_brand_lines(label_brand_id);

create table public.label_references (
    id integer generated always as identity primary key,
    label_brand_id integer not null references public.label_brands(id),
    slug text generated always as ('label-' || id::text) stored,
    archived boolean not null default false,
    version integer not null default 1 check (version > 0),
    published_revision_id integer,
    published_state text generated always as ('published'::text) stored,
    created_at timestamptz not null default now(),
    unique (label_brand_id, slug)
);
comment on table public.label_references is 'Stabile Labelreferenz mit getrenntem veröffentlichtem Revisionszeiger.';
create index label_references_brand_idx on public.label_references(label_brand_id);
create index label_references_publication_idx on public.label_references(published_revision_id);

create table public.label_revisions (
    id integer generated always as identity primary key,
    label_reference_id integer not null references public.label_references(id),
    state text not null default 'draft' check (state in ('draft', 'review', 'published', 'discarded')),
    version integer not null default 1 check (version > 0),
    content jsonb not null check (jsonb_typeof(content) = 'object'),
    created_by uuid, -- Historische Kennung, keine Kontolösch-Kaskade in unveränderlicher Historie.
    created_at timestamptz not null default now(),
    published_at timestamptz,
    check ((state = 'published') = (published_at is not null)),
    unique (id, label_reference_id, state)
);
comment on table public.label_revisions is 'Versionierter Inhalt. Schreibzugriff nur über separat geprüfte Inhalts-/Publikations-RPCs.';
create index label_revisions_reference_idx on public.label_revisions(label_reference_id);
create index label_revisions_creator_idx on public.label_revisions(created_by);
create unique index label_revisions_one_editable_idx on public.label_revisions(label_reference_id)
    where state in ('draft', 'review');

-- Der veröffentlichte Zeiger kann weder auf einen Entwurf noch auf eine
-- Revision einer fremden Referenz zeigen. NULL bleibt der unveröffentlichte Fall.
alter table public.label_references add constraint label_references_publication_fk
    foreign key (published_revision_id, id, published_state)
    references public.label_revisions(id, label_reference_id, state);

create table public.label_image_assets (
    id integer generated always as identity primary key,
    asset_kind text not null check (asset_kind in ('reference-image', 'rights-evidence')),
    processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed')),
    original_path text not null unique check (original_path <> ''),
    gallery_path text unique,
    detail_path text unique,
    mime_type text,
    original_bytes integer check (original_bytes between 1 and 10000000),
    width integer check (width > 0),
    height integer check (height > 0),
    created_by uuid, -- Historische Kennung, keine Kontolösch-Kaskade in unveränderlicher Historie.
    created_at timestamptz not null default now(),
    unique (id, asset_kind),
    check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    check (asset_kind = 'rights-evidence' or mime_type is distinct from 'application/pdf'),
    check (width is null or height is null or width::bigint * height::bigint <= 24000000),
    check (processing_status <> 'processed' or (mime_type is not null and original_bytes is not null)),
    check (processing_status <> 'processed' or asset_kind <> 'reference-image' or
        (width is not null and height is not null and gallery_path is not null and gallery_path <> ''
        and detail_path is not null and detail_path <> '')),
    check (asset_kind <> 'rights-evidence' or (gallery_path is null and detail_path is null))
);
comment on table public.label_image_assets is 'Private unveränderliche Dateiressourcen. Metadaten sind kein Beweis einer erfolgten Dekodierung.';
create index label_image_assets_creator_idx on public.label_image_assets(created_by);

create table public.label_revision_images (
    id integer generated always as identity primary key,
    label_revision_id integer not null references public.label_revisions(id),
    label_image_asset_id integer not null,
    image_kind text generated always as ('reference-image'::text) stored,
    position integer not null check (position between 0 and 23),
    caption text not null default '' check (char_length(caption) <= 4000),
    alt text not null default '' check (char_length(alt) <= 4000),
    reference_item text not null default '' check (char_length(reference_item) <= 160),
    foreign key (label_image_asset_id, image_kind) references public.label_image_assets(id, asset_kind),
    unique (label_revision_id, label_image_asset_id),
    unique (label_revision_id, position) deferrable initially immediate
);
comment on table public.label_revision_images is 'Nur revisionsbezogene Bildzuordnungen; Position 0 ist das Titelbild.';
create index label_revision_images_asset_idx on public.label_revision_images(label_image_asset_id);

create table public.label_image_permissions (
    id integer generated always as identity primary key,
    label_image_asset_id integer not null unique,
    image_kind text generated always as ('reference-image'::text) stored,
    status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
    attribution text not null default '' check (char_length(attribution) <= 4000),
    allowed_use text not null default '' check (char_length(allowed_use) <= 4000),
    evidence_asset_id integer,
    evidence_kind text generated always as ('rights-evidence'::text) stored,
    version integer not null default 1 check (version > 0),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    revoked_at timestamptz,
    foreign key (label_image_asset_id, image_kind) references public.label_image_assets(id, asset_kind),
    foreign key (evidence_asset_id, evidence_kind) references public.label_image_assets(id, asset_kind),
    check (status <> 'approved' or (reviewed_at is not null and allowed_use !~ '^[[:space:]]*$' and allowed_use <> '')),
    check ((status = 'revoked') = (revoked_at is not null))
);
comment on table public.label_image_permissions is 'Interne Bildfreigaben und Nachweiszuordnungen; niemals Leserinhalt.';
create index label_image_permissions_evidence_idx on public.label_image_permissions(evidence_asset_id);
create index label_image_permissions_reviewer_idx on public.label_image_permissions(reviewed_by);

create table public.label_change_events (
    id integer generated always as identity primary key,
    label_reference_id integer references public.label_references(id),
    label_revision_id integer references public.label_revisions(id),
    actor_id uuid not null,
    action text not null check (action <> ''),
    occurred_at timestamptz not null default now(),
    details jsonb not null default '{}' check (jsonb_typeof(details) = 'object')
);
comment on table public.label_change_events is 'Append-only Redaktionsprotokoll. actor_id bleibt als historische Kennung ohne Kontolösch-Kaskade erhalten.';
create index label_change_events_reference_idx on public.label_change_events(label_reference_id);
create index label_change_events_revision_idx on public.label_change_events(label_revision_id);
create index label_change_events_actor_idx on public.label_change_events(actor_id);

create table public.label_edit_requests (
    id integer generated always as identity primary key,
    actor_id uuid not null references auth.users(id) on delete cascade,
    request_id uuid not null,
    action text not null check (action <> ''),
    input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
    result jsonb not null,
    created_at timestamptz not null default now(),
    unique (actor_id, request_id)
);
comment on table public.label_edit_requests is 'Bestätigte Ergebnisse idempotenter Schreibaktionen; nur gemeinsam mit deren Erfolg einfügen.';

create table public.label_library_settings (
    id integer generated always as identity primary key check (id = 1),
    reader_enabled boolean not null default false,
    catalog_version bigint not null default 1 check (catalog_version > 0)
);
comment on table public.label_library_settings is 'Ein globaler Öffnungsschalter, standardmäßig geschlossen. Keine Kopie pro Workspace.';
insert into public.label_library_settings default values;

create function public.can_read_label_library()
returns boolean language sql stable security definer set search_path = '' as $$
    select (select auth.uid()) is not null and (
        public.is_platform_operator() or (
            exists (select 1 from public.label_library_settings where id = 1 and reader_enabled)
            and exists (
                select 1 from public.workspace_members as member
                where member.user_id = (select auth.uid())
                    and public.workspace_access_is_valid(member.workspace_id)
            )
        )
    );
$$;
comment on function public.can_read_label_library() is 'Aktuelle Leserberechtigung. Keine übergebene Nutzerkennung und keine user_metadata-Rolle.';
revoke all on function public.can_read_label_library() from public, anon, authenticated, service_role;
grant execute on function public.can_read_label_library() to authenticated;

create function public.get_label_library_availability()
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'visible', public.can_read_label_library(),
        'operator', (select auth.uid()) is not null and public.is_platform_operator()
    );
$$;
revoke all on function public.get_label_library_availability() from public, anon, authenticated, service_role;
grant execute on function public.get_label_library_availability() to authenticated;

create function public.protect_label_revision_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    if old.state in ('published', 'discarded') then
        raise exception 'Labelrevision ist unveränderlich' using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function public.protect_label_revision_history() from public, anon, authenticated, service_role;
create trigger protect_label_revision_history before update or delete on public.label_revisions
    for each row execute function public.protect_label_revision_history();

create function public.protect_label_image_assignment_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
    revision_id integer;
    revision_state text;
begin
    -- Quelle und Ziel in derselben aufsteigenden Reihenfolge sperren; auch das
    -- Umhängen aus/einer veröffentlichten Revision ist verboten.
    for revision_id in
        select distinct id from unnest(array[
            case when tg_op <> 'INSERT' then old.label_revision_id end,
            case when tg_op <> 'DELETE' then new.label_revision_id end
        ]) as revision_ids(id) where id is not null order by id
    loop
        select state into revision_state from public.label_revisions where id = revision_id for update;
        if revision_state in ('published', 'discarded') then
            raise exception 'Labelbilder einer abgeschlossenen Revision sind unveränderlich' using errcode = '55000';
        end if;
    end loop;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function public.protect_label_image_assignment_history() from public, anon, authenticated, service_role;
create trigger protect_label_image_assignment_history before insert or update or delete on public.label_revision_images
    for each row execute function public.protect_label_image_assignment_history();

create function public.protect_label_processed_asset()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    if old.processing_status = 'processed' then
        raise exception 'Verarbeitete Labeldatei ist unveränderlich' using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function public.protect_label_processed_asset() from public, anon, authenticated, service_role;
create trigger protect_label_processed_asset before update or delete on public.label_image_assets
    for each row execute function public.protect_label_processed_asset();

create function public.protect_label_change_events()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    raise exception 'Labelprotokoll ist unveränderlich' using errcode = '55000';
end;
$$;
revoke all on function public.protect_label_change_events() from public, anon, authenticated, service_role;
create trigger protect_label_change_events before update or delete on public.label_change_events
    for each row execute function public.protect_label_change_events();

-- Explizite Lese-Policies ausschließlich für Plattformbetreiber.
-- Auch Betreiber schreiben später über geprüfte RPCs, niemals direkt.
alter table public.label_brands enable row level security;
revoke all on table public.label_brands from public, anon, authenticated, service_role;
grant select on table public.label_brands to authenticated;
revoke all on sequence public.label_brands_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_brands" on public.label_brands
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_brand_lines enable row level security;
revoke all on table public.label_brand_lines from public, anon, authenticated, service_role;
grant select on table public.label_brand_lines to authenticated;
revoke all on sequence public.label_brand_lines_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_brand_lines" on public.label_brand_lines
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_references enable row level security;
revoke all on table public.label_references from public, anon, authenticated, service_role;
grant select on table public.label_references to authenticated;
revoke all on sequence public.label_references_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_references" on public.label_references
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_revisions enable row level security;
revoke all on table public.label_revisions from public, anon, authenticated, service_role;
grant select on table public.label_revisions to authenticated;
revoke all on sequence public.label_revisions_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_revisions" on public.label_revisions
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_image_assets enable row level security;
revoke all on table public.label_image_assets from public, anon, authenticated, service_role;
grant select on table public.label_image_assets to authenticated;
revoke all on sequence public.label_image_assets_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_image_assets" on public.label_image_assets
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_revision_images enable row level security;
revoke all on table public.label_revision_images from public, anon, authenticated, service_role;
grant select on table public.label_revision_images to authenticated;
revoke all on sequence public.label_revision_images_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_revision_images" on public.label_revision_images
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_image_permissions enable row level security;
revoke all on table public.label_image_permissions from public, anon, authenticated, service_role;
grant select on table public.label_image_permissions to authenticated;
revoke all on sequence public.label_image_permissions_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_image_permissions" on public.label_image_permissions
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_change_events enable row level security;
revoke all on table public.label_change_events from public, anon, authenticated, service_role;
grant select on table public.label_change_events to authenticated;
revoke all on sequence public.label_change_events_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_change_events" on public.label_change_events
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_edit_requests enable row level security;
revoke all on table public.label_edit_requests from public, anon, authenticated, service_role;
grant select on table public.label_edit_requests to authenticated;
revoke all on sequence public.label_edit_requests_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_edit_requests" on public.label_edit_requests
    for select to authenticated using ((select public.is_platform_operator()));

alter table public.label_library_settings enable row level security;
revoke all on table public.label_library_settings from public, anon, authenticated, service_role;
grant select on table public.label_library_settings to authenticated;
revoke all on sequence public.label_library_settings_id_seq from public, anon, authenticated, service_role;
create policy "Betreiber lesen label_library_settings" on public.label_library_settings
    for select to authenticated using ((select public.is_platform_operator()));
