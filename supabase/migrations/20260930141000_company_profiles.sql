-- Zentrale rechtliche und geschäftliche Stammdaten je Workspace.
-- Rechnungen und andere Dokumente konsumieren diese Quelle erst in einem Folge-PR.

create table public.workspace_company_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  company_name text check (company_name is null or pg_catalog.char_length(company_name) <= 200),
  legal_name text check (legal_name is null or pg_catalog.char_length(legal_name) <= 200),
  legal_form text check (
    legal_form is null
    or legal_form in ('sole_proprietorship', 'gbr', 'ug', 'gmbh', 'other')
  ),
  email text check (email is null or pg_catalog.char_length(email) <= 320),
  phone text check (phone is null or pg_catalog.char_length(phone) <= 50),
  website text check (website is null or pg_catalog.char_length(website) <= 500),
  street text check (street is null or pg_catalog.char_length(street) <= 200),
  house_number text check (house_number is null or pg_catalog.char_length(house_number) <= 30),
  postal_code text check (postal_code is null or pg_catalog.char_length(postal_code) <= 20),
  city text check (city is null or pg_catalog.char_length(city) <= 120),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  mailing_address_enabled boolean not null default false,
  mailing_street text check (mailing_street is null or pg_catalog.char_length(mailing_street) <= 200),
  mailing_house_number text check (
    mailing_house_number is null or pg_catalog.char_length(mailing_house_number) <= 30
  ),
  mailing_postal_code text check (
    mailing_postal_code is null or pg_catalog.char_length(mailing_postal_code) <= 20
  ),
  mailing_city text check (mailing_city is null or pg_catalog.char_length(mailing_city) <= 120),
  mailing_country_code text check (
    mailing_country_code is null or mailing_country_code ~ '^[A-Z]{2}$'
  ),
  tax_number text check (tax_number is null or pg_catalog.char_length(tax_number) <= 50),
  vat_id text check (vat_id is null or pg_catalog.char_length(vat_id) <= 32),
  tax_office text check (tax_office is null or pg_catalog.char_length(tax_office) <= 160),
  federal_state text check (federal_state is null or pg_catalog.char_length(federal_state) <= 100),
  bank_account_holder text check (
    bank_account_holder is null or pg_catalog.char_length(bank_account_holder) <= 200
  ),
  bank_name text check (bank_name is null or pg_catalog.char_length(bank_name) <= 160),
  iban text check (iban is null or pg_catalog.char_length(iban) <= 34),
  bic text check (bic is null or pg_catalog.char_length(bic) <= 11),
  logo_path text check (logo_path is null or pg_catalog.char_length(logo_path) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspace_company_profiles is
  'Aktuelle rechtliche und geschäftliche Stammdaten eines Workspace; historische Dokumente speichern eigene Snapshots.';
comment on column public.workspace_company_profiles.company_name is
  'Geschäfts- oder Markenname, getrennt vom rechtlichen Namen.';
comment on column public.workspace_company_profiles.legal_name is
  'Rechtlicher Name bzw. Inhabername für Geschäftsdokumente.';
comment on column public.workspace_company_profiles.logo_path is
  'Aktuell ausgewählter Pfad im privaten Bucket company-assets; alte Objekte bleiben versioniert erhalten.';

alter table public.workspace_company_profiles enable row level security;
revoke all on table public.workspace_company_profiles from public, anon, authenticated, service_role;
grant select on table public.workspace_company_profiles to authenticated;

create policy "Unternehmensdaten lesen"
on public.workspace_company_profiles for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

-- Bestehende Workspaces erhalten bewusst nur eine leere Zeile.
-- Der Archivschutz wird erst danach aktiviert, damit auch bereits archivierte
-- Workspaces die notwendige schreibgeschützte Stammdatenzeile erhalten.
insert into public.workspace_company_profiles(workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.workspace_company_profiles
for each row execute function public.protect_archived_workspace_data();

-- Unternehmensdaten sind ein eigener Audit-Entitätstyp.
alter table public.business_events
  drop constraint if exists business_events_entity_type_check;
alter table public.business_events
  add constraint business_events_entity_type_check
  check (
    entity_type in (
      'purchase',
      'inventory_item',
      'catalog_product',
      'sale',
      'return',
      'expense',
      'export',
      'workspace',
      'company_profile'
    )
  );

-- Privater Logo-Bucket mit harten V1-Grenzen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create or replace function public.is_company_logo_path(
  p_path text,
  p_workspace_id uuid
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_path ~ (
    '^' || p_workspace_id::text || '/logos/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '\.(png|jpg|jpeg|webp)$'
  );
$$;

alter function public.is_company_logo_path(text, uuid) owner to postgres;
revoke all on function public.is_company_logo_path(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_company_logo_path(text, uuid)
  to authenticated, service_role;

create policy "Unternehmenslogos lesen"
on storage.objects for select to authenticated
using (
  bucket_id = 'company-assets'
  and exists (
    select 1
    from public.workspace_members as member
    where member.user_id = (select auth.uid())
      and member.workspace_id::text = (storage.foldername(name))[1]
      and public.is_company_logo_path(name, member.workspace_id)
  )
);

create or replace function public.can_manage_company_logo_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as member
    join public.workspaces as workspace on workspace.id = member.workspace_id
    where member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
      and workspace.archived_at is null
      and member.workspace_id::text = pg_catalog.split_part(p_path, '/', 1)
      and public.is_company_logo_path(p_path, member.workspace_id)
  );
$$;

alter function public.can_manage_company_logo_path(text) owner to postgres;
revoke all on function public.can_manage_company_logo_path(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_manage_company_logo_path(text) to authenticated;

create policy "Unternehmenslogos hochladen"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-assets'
  and (select public.can_manage_company_logo_path(name))
);

create policy "Unternehmenslogos loeschen"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-assets'
  and (select public.can_manage_company_logo_path(name))
);

create or replace function public.get_workspace_company_settings(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.workspace_company_profiles;
  v_tax_mode text;
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select * into v_profile
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  select tax_mode into v_tax_mode
  from public.workspaces
  where id = p_workspace_id;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'tax_mode', v_tax_mode,
    'can_edit', (select public.is_workspace_admin(p_workspace_id))
  );
end;
$$;

alter function public.get_workspace_company_settings(uuid) owner to postgres;
revoke all on function public.get_workspace_company_settings(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_workspace_company_settings(uuid) to authenticated;

create or replace function public.update_workspace_company_settings(
  p_workspace_id uuid,
  p_profile jsonb,
  p_tax_mode text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.workspace_company_profiles;
  v_after public.workspace_company_profiles;
  v_next public.workspace_company_profiles;
  v_tax_before text;
  v_archived_at timestamptz;
  v_normalized jsonb;
  v_before_json jsonb;
  v_after_json jsonb;
  v_changed_fields jsonb;
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.is_workspace_admin(p_workspace_id)) then
    raise exception using
      errcode = '42501',
      message = 'Nur Inhaber und Administratoren dürfen Unternehmensdaten ändern.';
  end if;

  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Unternehmensdaten sind ungültig.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_profile) as entry(key)
    where key <> all (array[
      'company_name',
      'legal_name',
      'legal_form',
      'email',
      'phone',
      'website',
      'street',
      'house_number',
      'postal_code',
      'city',
      'country_code',
      'mailing_address_enabled',
      'mailing_street',
      'mailing_house_number',
      'mailing_postal_code',
      'mailing_city',
      'mailing_country_code',
      'tax_number',
      'vat_id',
      'tax_office',
      'federal_state',
      'bank_account_holder',
      'bank_name',
      'iban',
      'bic'
    ])
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Unternehmensdaten enthalten unbekannte Felder.';
  end if;

  if p_tax_mode not in ('diff_25a', 'kleinunternehmer_19', 'regular_19') then
    raise exception using errcode = '22023', message = 'Der Steuermodus ist ungültig.';
  end if;

  if p_profile ? 'mailing_address_enabled'
    and pg_catalog.jsonb_typeof(p_profile -> 'mailing_address_enabled') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'Die Angabe zur Postanschrift ist ungültig.';
  end if;

  select tax_mode, archived_at
    into v_tax_before, v_archived_at
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_archived_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;

  select * into v_before
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  v_normalized := pg_catalog.jsonb_build_object(
    'company_name', nullif(pg_catalog.btrim(p_profile ->> 'company_name'), ''),
    'legal_name', nullif(pg_catalog.btrim(p_profile ->> 'legal_name'), ''),
    'legal_form', nullif(pg_catalog.btrim(p_profile ->> 'legal_form'), ''),
    'email', nullif(pg_catalog.btrim(p_profile ->> 'email'), ''),
    'phone', nullif(pg_catalog.btrim(p_profile ->> 'phone'), ''),
    'website', nullif(pg_catalog.btrim(p_profile ->> 'website'), ''),
    'street', nullif(pg_catalog.btrim(p_profile ->> 'street'), ''),
    'house_number', nullif(pg_catalog.btrim(p_profile ->> 'house_number'), ''),
    'postal_code', nullif(pg_catalog.btrim(p_profile ->> 'postal_code'), ''),
    'city', nullif(pg_catalog.btrim(p_profile ->> 'city'), ''),
    'country_code', nullif(pg_catalog.upper(pg_catalog.btrim(p_profile ->> 'country_code')), ''),
    'mailing_address_enabled',
      coalesce((p_profile ->> 'mailing_address_enabled')::boolean, false),
    'mailing_street', nullif(pg_catalog.btrim(p_profile ->> 'mailing_street'), ''),
    'mailing_house_number',
      nullif(pg_catalog.btrim(p_profile ->> 'mailing_house_number'), ''),
    'mailing_postal_code',
      nullif(pg_catalog.btrim(p_profile ->> 'mailing_postal_code'), ''),
    'mailing_city', nullif(pg_catalog.btrim(p_profile ->> 'mailing_city'), ''),
    'mailing_country_code',
      nullif(pg_catalog.upper(pg_catalog.btrim(p_profile ->> 'mailing_country_code')), ''),
    'tax_number', nullif(pg_catalog.btrim(p_profile ->> 'tax_number'), ''),
    'vat_id', nullif(pg_catalog.btrim(p_profile ->> 'vat_id'), ''),
    'tax_office', nullif(pg_catalog.btrim(p_profile ->> 'tax_office'), ''),
    'federal_state', nullif(pg_catalog.btrim(p_profile ->> 'federal_state'), ''),
    'bank_account_holder',
      nullif(pg_catalog.btrim(p_profile ->> 'bank_account_holder'), ''),
    'bank_name', nullif(pg_catalog.btrim(p_profile ->> 'bank_name'), ''),
    'iban',
      nullif(
        pg_catalog.upper(
          pg_catalog.regexp_replace(coalesce(p_profile ->> 'iban', ''), '[[:space:]]', '', 'g')
        ),
        ''
      ),
    'bic',
      nullif(
        pg_catalog.upper(
          pg_catalog.regexp_replace(coalesce(p_profile ->> 'bic', ''), '[[:space:]]', '', 'g')
        ),
        ''
      )
  );

  v_next := pg_catalog.jsonb_populate_record(v_before, v_normalized);

  if v_next.legal_form is not null
    and v_next.legal_form not in ('sole_proprietorship', 'gbr', 'ug', 'gmbh', 'other') then
    raise exception using errcode = '22023', message = 'Die Rechtsform ist ungültig.';
  end if;
  if v_next.country_code is not null and v_next.country_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Der Ländercode ist ungültig.';
  end if;
  if v_next.mailing_country_code is not null
    and v_next.mailing_country_code !~ '^[A-Z]{2}$' then
    raise exception using
      errcode = '22023',
      message = 'Der Ländercode der Postanschrift ist ungültig.';
  end if;

  v_before_json :=
    (to_jsonb(v_before) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    || pg_catalog.jsonb_build_object('tax_mode', v_tax_before);

  if (to_jsonb(v_before) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    is distinct from
    (to_jsonb(v_next) - array['workspace_id', 'created_at', 'updated_at', 'logo_path']) then
    update public.workspace_company_profiles
    set company_name = v_next.company_name,
        legal_name = v_next.legal_name,
        legal_form = v_next.legal_form,
        email = v_next.email,
        phone = v_next.phone,
        website = v_next.website,
        street = v_next.street,
        house_number = v_next.house_number,
        postal_code = v_next.postal_code,
        city = v_next.city,
        country_code = v_next.country_code,
        mailing_address_enabled = v_next.mailing_address_enabled,
        mailing_street = v_next.mailing_street,
        mailing_house_number = v_next.mailing_house_number,
        mailing_postal_code = v_next.mailing_postal_code,
        mailing_city = v_next.mailing_city,
        mailing_country_code = v_next.mailing_country_code,
        tax_number = v_next.tax_number,
        vat_id = v_next.vat_id,
        tax_office = v_next.tax_office,
        federal_state = v_next.federal_state,
        bank_account_holder = v_next.bank_account_holder,
        bank_name = v_next.bank_name,
        iban = v_next.iban,
        bic = v_next.bic,
        updated_at = statement_timestamp()
    where workspace_id = p_workspace_id;
  end if;

  if v_tax_before is distinct from p_tax_mode then
    update public.workspaces
    set tax_mode = p_tax_mode,
        updated_at = statement_timestamp()
    where id = p_workspace_id;
  end if;

  select * into strict v_after
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id;

  v_after_json :=
    (to_jsonb(v_after) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    || pg_catalog.jsonb_build_object('tax_mode', p_tax_mode);

  select coalesce(pg_catalog.jsonb_agg(changed.key order by changed.key), '[]'::jsonb)
    into v_changed_fields
  from (
    select entry.key
    from pg_catalog.jsonb_object_keys(v_after_json) as entry(key)
    where v_before_json -> entry.key is distinct from v_after_json -> entry.key
  ) as changed;

  if pg_catalog.jsonb_array_length(v_changed_fields) > 0 then
    insert into public.business_events (
      workspace_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      changes
    ) values (
      p_workspace_id,
      'company_profile',
      p_workspace_id,
      'company_profile_updated',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('fields', v_changed_fields)
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_after),
    'tax_mode', p_tax_mode,
    'can_edit', true
  );
end;
$$;

alter function public.update_workspace_company_settings(uuid, jsonb, text) owner to postgres;
revoke all on function public.update_workspace_company_settings(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_workspace_company_settings(uuid, jsonb, text)
  to authenticated;

create or replace function public.set_workspace_company_logo(
  p_workspace_id uuid,
  p_logo_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.workspace_company_profiles;
  v_tax_mode text;
  v_archived_at timestamptz;
  v_normalized_path text := nullif(pg_catalog.btrim(p_logo_path), '');
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.is_workspace_admin(p_workspace_id)) then
    raise exception using
      errcode = '42501',
      message = 'Nur Inhaber und Administratoren dürfen das Unternehmenslogo ändern.';
  end if;

  select tax_mode, archived_at
    into v_tax_mode, v_archived_at
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_archived_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;

  if v_normalized_path is not null
    and not public.is_company_logo_path(v_normalized_path, p_workspace_id) then
    raise exception using errcode = '22023', message = 'Der Logo-Pfad ist ungültig.';
  end if;

  select * into v_profile
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  if v_profile.logo_path is distinct from v_normalized_path then
    update public.workspace_company_profiles
    set logo_path = v_normalized_path,
        updated_at = statement_timestamp()
    where workspace_id = p_workspace_id
    returning * into v_profile;

    insert into public.business_events (
      workspace_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      changes
    ) values (
      p_workspace_id,
      'company_profile',
      p_workspace_id,
      'company_profile_updated',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('fields', pg_catalog.jsonb_build_array('logo_path'))
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'tax_mode', v_tax_mode,
    'can_edit', true
  );
end;
$$;

alter function public.set_workspace_company_logo(uuid, text) owner to postgres;
revoke all on function public.set_workspace_company_logo(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_workspace_company_logo(uuid, text) to authenticated;

-- Neue Workspaces erhalten unmittelbar die leere Stammdatenzeile.
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_ws_id uuid;
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into public.workspaces (name, setup_completed_at)
  values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'), now())
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, caller_id, 'owner');

  insert into public.workspace_company_profiles(workspace_id)
  values (new_ws_id);

  return new_ws_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_ws_id uuid;
  v_beta_application_id uuid;
  v_granted_days integer;
  v_application_id_text text := new.raw_user_meta_data->>'beta_application_id';
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Reseller'));

  insert into public.workspaces (name, min_roi_percent, min_profit_amount)
  values ('Mein Workspace', 30.0, 15.0)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  insert into public.workspace_company_profiles(workspace_id)
  values (new_ws_id);

  insert into public.sources (workspace_id, name, is_default)
  values
    (new_ws_id, 'Kleinanzeigen', true),
    (new_ws_id, 'eBay', false),
    (new_ws_id, 'Vinted', false),
    (new_ws_id, 'Flohmarkt', false),
    (new_ws_id, 'meinePacks', false),
    (new_ws_id, 'B-Stock / Retouren', false),
    (new_ws_id, 'Grosshaendler / Palette', false);

  if v_application_id_text is not null
     and v_application_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_beta_application_id := v_application_id_text::uuid;

    update public.beta_applications
    set auth_user_id = new.id
    where id = v_beta_application_id
      and status = 'accepted'
      and lower(email) = lower(new.email)
      and (auth_user_id is null or auth_user_id = new.id)
    returning id, granted_days
    into v_beta_application_id, v_granted_days;

    if found then
      insert into public.workspace_licenses (
        workspace_id,
        beta_application_id,
        access_source,
        status,
        granted_days
      ) values (
        new_ws_id,
        v_beta_application_id,
        'beta',
        'pending',
        v_granted_days
      )
      on conflict (workspace_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;


-- Prüfarchiv kennt ab dieser Migration auch die Unternehmensstammdaten.
-- Ein gemeinsamer MVCC-Snapshot für alle fachlichen Archivdateien.
-- SECURITY DEFINER ist nötig, weil business_events absichtlich nicht direkt
-- lesbar ist. Vor jeder Abfrage wird die privilegierte Mitgliedschaft geprüft.
create or replace function public.export_audit_snapshot(
  p_workspace_id uuid,
  p_filter jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_table text;
  v_rows jsonb;
  v_count bigint;
  v_total bigint := 0;
  v_result jsonb := jsonb_build_object(
    'captured_at', statement_timestamp(),
    'snapshot', pg_current_snapshot()::text
  );
begin
  if v_actor_id is null or not exists (
    select 1 from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für das Prüfarchiv.';
  end if;
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using errcode = '22023', message = 'Der Archivfilter muss ein JSON-Objekt sein.';
  end if;

  -- STABLE hält auch diese einzelnen SELECTs im Snapshot des RPC-Aufrufs.
  -- Die Tabellenliste ist geschlossen; keine Bezeichner aus Client-Eingaben.
  for v_table in
    select table_name
    from (values
      ('workspace_company_profiles'::text),
      ('suppliers'::text),
      ('catalog_products'::text),
      ('purchases'::text),
      ('purchase_lines'::text),
      ('purchase_costs'::text),
      ('inventory_items'::text),
      ('stock_lots'::text),
      ('stock_movements'::text),
      ('sales'::text),
      ('sale_lines'::text),
      ('sale_cost_entries'::text),
      ('sale_line_lot_allocations'::text),
      ('returns'::text),
      ('inventory_reconciliation_events'::text),
      ('invoices'::text),
      ('invoice_items'::text),
      ('item_costs'::text),
      ('purchase_documents'::text),
      ('expense_categories'::text),
      ('expense_recurring_rules'::text),
      ('expenses'::text),
      ('expense_documents'::text),
      ('business_events'::text)
    ) as audit_tables(table_name)
  loop
    if v_table = 'item_costs' then
      select count(*) into v_count from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select count(*) into v_count from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    else
      execute format('select count(*) from public.%I where workspace_id = $1', v_table)
        into v_count using p_workspace_id;
    end if;
    v_total := v_total + v_count;
    if v_total > 100000 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 100000 Datensätze. Es wurde kein Teilarchiv erstellt.';
    end if;

    if v_table = 'workspace_company_profiles' then
      select coalesce(jsonb_agg(to_jsonb(profile) order by profile.workspace_id), '[]'::jsonb)
        into v_rows from public.workspace_company_profiles as profile
        where profile.workspace_id = p_workspace_id;
    elsif v_table = 'item_costs' then
      select coalesce(jsonb_agg(to_jsonb(cost) order by cost.id), '[]'::jsonb)
        into v_rows from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
        into v_rows from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    elsif v_table = 'business_events' then
      select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at, event.id), '[]'::jsonb)
        into v_rows from public.business_events as event
        where event.workspace_id = p_workspace_id
          and (p_filter ->> 'entity_type' is null or event.entity_type = p_filter ->> 'entity_type')
          and (p_filter ->> 'entity_id' is null or event.entity_id = (p_filter ->> 'entity_id')::uuid)
          and (p_filter ->> 'event_type' is null or event.event_type = p_filter ->> 'event_type')
          and (p_filter ->> 'actor_id' is null or event.actor_id = (p_filter ->> 'actor_id')::uuid)
          and (p_filter ->> 'from' is null or event.created_at >= (p_filter ->> 'from')::timestamptz)
          and (p_filter ->> 'to' is null or event.created_at <= (p_filter ->> 'to')::timestamptz);
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), ''[]''::jsonb) from public.%I as entry where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
    end if;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
    if octet_length(v_result::text) > 52428800 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 50 MiB. Es wurde kein Teilarchiv erstellt.';
    end if;
  end loop;
  return v_result;
end;
$$;

alter function public.export_audit_snapshot(uuid, jsonb) owner to postgres;
comment on function public.export_audit_snapshot(uuid, jsonb) is
  'Vollständige Archivtabellen aus einem gemeinsamen STABLE-Snapshot für Owner/Admin/Accountant; maximal 100000 Zeilen und 50 MiB JSON, sonst expliziter Fehler.';
revoke all on function public.export_audit_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.export_audit_snapshot(uuid, jsonb) to authenticated;
