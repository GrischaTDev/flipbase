-- Konfigurierbare Vorgangsnummern: getrennt von externen Bestell- und Rechnungsnummern.
alter table public.workspaces add column numbering_timezone text not null default 'Europe/Berlin';

create table public.number_series (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('purchase', 'sale')),
  label text not null check (length(btrim(label)) between 1 and 80),
  prefix text not null check (length(prefix) <= 30 and prefix !~ '[[:cntrl:]]'),
  separator text not null default ' ' check (separator in ('', ' ', '-', '/', '.')),
  include_year boolean not null default true,
  minimum_digits integer not null default 2 check (minimum_digits between 1 and 12),
  start_value bigint not null default 1 check (start_value between 1 and 999999999999),
  reset_yearly boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, entity_type),
  check (not reset_yearly or include_year)
);
comment on table public.number_series is 'Aktuelle Nummernformate je Workspace und Vorgangsart; Änderungen gelten nur künftig.';
create index number_series_updated_by_idx on public.number_series(updated_by);
alter table public.number_series enable row level security;
revoke all on public.number_series from public, anon, authenticated;
grant select on public.number_series to authenticated;
create policy "Mitglieder lesen Nummernkreise" on public.number_series for select to authenticated using ((select public.is_workspace_member(workspace_id)));

create table public.number_series_counters (
  id bigint generated always as identity primary key,
  series_id bigint not null references public.number_series(id) on delete cascade,
  period integer not null,
  last_value bigint not null,
  unique(series_id, period)
);
comment on table public.number_series_counters is 'Nur serverseitig veränderte Zähler; Sperren verhindern parallele Doppelvergabe.';
alter table public.number_series_counters enable row level security;
revoke all on public.number_series_counters from public, anon, authenticated;

create table public.number_assignments (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('purchase','sale')),
  entity_id uuid not null,
  series_id bigint not null references public.number_series(id) on delete cascade,
  series_version integer not null,
  record_number text not null,
  assigned_at timestamptz not null,
  format_snapshot jsonb not null,
  unique(workspace_id, entity_type, entity_id),
  unique(workspace_id, entity_type, record_number)
);
comment on table public.number_assignments is 'Unveränderliche Vergabehistorie; bleibt bei Archivierung, Stornierung und Vorgangslöschung erhalten.';
create index number_assignments_series_idx on public.number_assignments(series_id);
alter table public.number_assignments enable row level security;
revoke all on public.number_assignments from public, anon, authenticated;
grant select on public.number_assignments to authenticated;
create policy "Mitglieder lesen Nummernvergaben" on public.number_assignments for select to authenticated using ((select public.is_workspace_member(workspace_id)));

create table public.number_series_changes (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  series_id bigint not null references public.number_series(id) on delete cascade,
  changed_at timestamptz not null default statement_timestamp(),
  changed_by uuid references auth.users(id) on delete set null,
  configuration jsonb not null
);
comment on table public.number_series_changes is 'Protokoll jeder Formatänderung mit Person, Zeit und vollständiger Konfiguration.';
create index number_series_changes_workspace_idx on public.number_series_changes(workspace_id);
create index number_series_changes_series_idx on public.number_series_changes(series_id);
create index number_series_changes_actor_idx on public.number_series_changes(changed_by);
alter table public.number_series_changes enable row level security;
revoke all on public.number_series_changes from public, anon, authenticated;
grant select on public.number_series_changes to authenticated;
create policy "Admins lesen Nummernänderungen" on public.number_series_changes for select to authenticated using ((select public.is_workspace_admin(workspace_id)));

alter table public.purchases add column record_number text, add column numbering_series_id bigint references public.number_series(id), add column numbered_at timestamptz, add column numbering_version integer;
alter table public.sales add column record_number text, add column numbering_series_id bigint references public.number_series(id), add column numbered_at timestamptz, add column numbering_version integer;
create unique index purchases_record_number_idx on public.purchases(workspace_id,record_number);
create unique index sales_record_number_idx on public.sales(workspace_id,record_number);
create index purchases_numbering_series_idx on public.purchases(numbering_series_id);
create index sales_numbering_series_idx on public.sales(numbering_series_id);

create function public.format_record_number(p_prefix text,p_separator text,p_year integer,p_minimum_digits integer,p_sequence bigint)
returns text language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.concat_ws(p_separator,nullif(p_prefix,''),p_year::text,
    pg_catalog.lpad(p_sequence::text,greatest(p_minimum_digits,length(p_sequence::text)),'0'));
$$;
revoke all on function public.format_record_number(text,text,integer,integer,bigint) from public,anon,authenticated;

-- Definer erforderlich: Zähler und Vergabehistorie haben absichtlich keine Client-Schreibrechte.
-- Ausschließlich als Trigger auf durch RLS/RPC geschützten Vorgängen erreichbar.
create function public.assign_record_number() returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_type text := case tg_table_name when 'purchases' then 'purchase' else 'sale' end;
  v_series public.number_series;
  v_assignment public.number_assignments;
  v_time timestamptz := statement_timestamp();
  v_timezone text;
  v_year integer;
  v_period integer;
  v_sequence bigint;
  v_number text;
begin
  if tg_op = 'UPDATE' then
    if (new.workspace_id,new.id,new.record_number,new.numbering_series_id,new.numbered_at,new.numbering_version)
      is distinct from (old.workspace_id,old.id,old.record_number,old.numbering_series_id,old.numbered_at,old.numbering_version) then
      raise exception using errcode='22023',message='Vergebene Vorgangsnummern sind unveränderlich.';
    end if;
    return new;
  end if;
  -- Gleiche Sperrreihenfolge wie in der Administration; Zeitzone bleibt während der Vergabe stabil.
  select numbering_timezone into strict v_timezone from public.workspaces where id=new.workspace_id for share;
  insert into public.number_series(workspace_id,entity_type,label,prefix)
    values(new.workspace_id,v_type,case v_type when 'purchase' then 'Einkäufe' else 'Verkäufe' end,case v_type when 'purchase' then 'B' else 'V' end)
    on conflict(workspace_id,entity_type) do nothing;
  select * into strict v_series from public.number_series where workspace_id=new.workspace_id and entity_type=v_type for update;
  select * into v_assignment from public.number_assignments where workspace_id=new.workspace_id and entity_type=v_type and entity_id=new.id;
  if found then
    new.record_number := v_assignment.record_number;
    new.numbering_series_id := v_assignment.series_id;
    new.numbered_at := v_assignment.assigned_at;
    new.numbering_version := v_assignment.series_version;
    return new;
  end if;

  v_year := extract(year from v_time at time zone v_timezone)::integer;
  v_period := case when v_series.reset_yearly then v_year else 0 end;
  insert into public.number_series_counters(series_id,period,last_value) values(v_series.id,v_period,v_series.start_value)
    on conflict(series_id,period) do update set last_value=greatest(public.number_series_counters.last_value+1,v_series.start_value)
    returning last_value into v_sequence;
  v_number := public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,v_sequence);
  insert into public.number_assignments(workspace_id,entity_type,entity_id,series_id,series_version,record_number,assigned_at,format_snapshot)
    values(new.workspace_id,v_type,new.id,v_series.id,v_series.version,v_number,v_time,to_jsonb(v_series)||jsonb_build_object('timezone',v_timezone));
  new.record_number := v_number;
  new.numbering_series_id := v_series.id;
  new.numbered_at := v_time;
  new.numbering_version := v_series.version;
  return new;
end;
$$;
revoke all on function public.assign_record_number() from public,anon,authenticated;
create trigger assign_purchase_number before insert or update on public.purchases for each row execute function public.assign_record_number();
create trigger assign_sale_number before insert or update on public.sales for each row execute function public.assign_record_number();

-- Atomare Administration samt Kollisionsprüfung und Änderungsprotokoll.
create function public.save_number_series(p_workspace_id uuid,p_entity_type text,p_configuration jsonb,p_expected_version integer default 0)
returns public.number_series language plpgsql volatile security definer set search_path = '' as $$
declare
  v_series public.number_series;
  v_timezone text := p_configuration->>'timezone';
  v_year integer;
  v_period integer;
  v_next bigint;
  v_leading text;
  v_number text;
begin
  if (select auth.uid()) is null or not (select public.is_workspace_admin(p_workspace_id)) then
    raise exception using errcode='42501',message='Nur Workspace-Administratoren dürfen Nummernkreise ändern.';
  end if;
  perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for update;
  if not found then raise exception using errcode='42501',message='Der Workspace ist archiviert.'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023',message='Die Zeitzone ist ungültig.';
  end if;
  insert into public.number_series(workspace_id,entity_type,label,prefix) values(p_workspace_id,p_entity_type,case p_entity_type when 'purchase' then 'Einkäufe' else 'Verkäufe' end,case p_entity_type when 'purchase' then 'B' else 'V' end) on conflict(workspace_id,entity_type) do nothing;
  select * into strict v_series from public.number_series where workspace_id=p_workspace_id and entity_type=p_entity_type for update;
  if p_expected_version <> v_series.version and not(p_expected_version=0 and v_series.version=1) then
    raise exception using errcode='40001',message='Der Nummernkreis wurde inzwischen geändert. Bitte neu laden.';
  end if;
  update public.number_series set label=p_configuration->>'label',prefix=p_configuration->>'prefix',separator=p_configuration->>'separator',include_year=(p_configuration->>'include_year')::boolean,minimum_digits=(p_configuration->>'minimum_digits')::integer,start_value=(p_configuration->>'start_value')::bigint,reset_yearly=(p_configuration->>'reset_yearly')::boolean,version=version+1,updated_at=statement_timestamp(),updated_by=(select auth.uid()) where id=v_series.id returning * into v_series;
  v_year := extract(year from statement_timestamp() at time zone v_timezone)::integer;
  v_period := case when v_series.reset_yearly then v_year else 0 end;
  select greatest(coalesce(last_value+1,v_series.start_value),v_series.start_value) into v_next from public.number_series_counters where series_id=v_series.id and period=v_period;
  v_next := coalesce(v_next,v_series.start_value);
  v_number := public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,v_next);
  v_leading := pg_catalog.concat_ws(v_series.separator,nullif(v_series.prefix,''),case when v_series.include_year then v_year::text end);
  if v_leading <> '' then v_leading := v_leading || v_series.separator; end if;
  -- Auch spätere Kollisionen prüfen, nicht nur die unmittelbar nächste Nummer.
  if exists(
    select 1 from public.number_assignments a
    cross join lateral (select substring(a.record_number from length(v_leading)+1) as suffix) parts
    where a.workspace_id=p_workspace_id and a.entity_type=p_entity_type
      and left(a.record_number,length(v_leading))=v_leading
      and case when parts.suffix ~ '^[0-9]{1,18}$' then
        parts.suffix::bigint >= v_next and a.record_number=public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,parts.suffix::bigint)
      else false end
  ) then
    raise exception using errcode='22023',message='Dieses Format würde eine bereits vergebene Nummer erneut erzeugen.';
  end if;
  update public.workspaces set numbering_timezone=v_timezone where id=p_workspace_id;
  insert into public.number_series_changes(workspace_id,series_id,changed_by,configuration) values(p_workspace_id,v_series.id,(select auth.uid()),to_jsonb(v_series)||jsonb_build_object('timezone',v_timezone));
  return v_series;
end;
$$;
revoke all on function public.save_number_series(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_number_series(uuid,text,jsonb,integer) to authenticated;

create function public.get_number_settings(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  return jsonb_build_object('can_edit',(select public.is_workspace_admin(p_workspace_id)),
    'timezone',(select numbering_timezone from public.workspaces where id=p_workspace_id),
    'series',coalesce((select jsonb_agg(to_jsonb(s) order by s.entity_type) from public.number_series s where s.workspace_id=p_workspace_id),'[]'::jsonb));
end;
$$;
revoke all on function public.get_number_settings(uuid) from public,anon,authenticated;
grant execute on function public.get_number_settings(uuid) to authenticated;



