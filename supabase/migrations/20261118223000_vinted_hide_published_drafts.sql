-- Zweck: Bei Vinted bestätigte Entwürfe nicht mehr in der normalen Entwurfsliste zeigen.
-- Ein veröffentlichter Entwurf ist verbraucht; eine erneute Veröffentlichung wird ohnehin gesperrt.
-- Entwurf, Fotos und Aufträge bleiben unverändert gespeichert (nur ausgeblendet, nichts gelöscht).
-- Betroffen: marketplace_list_listing_drafts (Signatur und Rechte unverändert),
-- neuer Teilindex marketplace_listing_jobs_confirmed_draft auf marketplace_listing_jobs(draft_id).
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

create index marketplace_listing_jobs_confirmed_draft on public.marketplace_listing_jobs(draft_id) where state='confirmed';

create or replace function public.marketplace_list_listing_drafts(p_workspace_id uuid,p_query text default '',p_cursor jsonb default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_last jsonb; v_cursor_id bigint; v_cursor_at timestamptz; v_more boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  if p_query is null or length(p_query)>160 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Ungültige Entwurfssuche.' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;
    if p_cursor ? 'createdAt' then
      if jsonb_typeof(p_cursor->'createdAt') is distinct from 'string'
        or coalesce(p_cursor->>'createdAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      v_cursor_at:=(p_cursor->>'createdAt')::timestamptz;
    else
      -- Bereits geöffnete ältere Clients senden nur updatedAt. Ihr Datum bestimmt niemals die Sortierung.
      -- Auch gelöschte Arbeitskopien bleiben als eindeutig zugeordnete Cursor-Anker erhalten.
      if jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      perform (p_cursor->>'updatedAt')::timestamptz;
      select created_at into v_cursor_at from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=v_cursor_id;
      if not found then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d) order by d.created_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id and deleted_at is null and relist_external_id is null
      -- Ein bei Vinted bestätigter Entwurf ist verbraucht; er bleibt für Aufträge und Verlauf gespeichert.
      and not exists (select 1 from public.marketplace_listing_jobs j where j.draft_id=marketplace_listing_drafts.id and j.state='confirmed')
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (created_at,id)<(v_cursor_at,v_cursor_id))
    order by created_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','createdAt',v_last->>'createdAt','updatedAt',v_last->>'updatedAt') else null end);
end;
$$;
