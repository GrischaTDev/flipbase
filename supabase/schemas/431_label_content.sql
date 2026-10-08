-- Globales Marken- und Labellexikon: Rechte, Historie und Referenzverwaltung.
-- Änderungen werden über erzeugte Migrationen integriert.


create function public.label_assert(p_ok boolean, p_code text, p_path text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_ok is distinct from true then
    raise exception 'Ungültige Labelangaben' using errcode='22023',
      detail=jsonb_build_object('code',p_code,'path',p_path)::text;
  end if;
end;
$$;

create function public.label_assert_object(p_value jsonb, p_keys text[], p_path text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  perform public.label_assert(jsonb_typeof(p_value)='object','invalid-object',p_path);
  perform public.label_assert(p_value ?& p_keys,'missing-field',p_path);
  perform public.label_assert((select count(*)=cardinality(p_keys) from jsonb_object_keys(p_value)), 'unknown-field',p_path);
end;
$$;

create function public.label_assert_array(p_value jsonb, p_max integer, p_path text, p_unique boolean default false)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  perform public.label_assert(jsonb_typeof(p_value)='array','invalid-array',p_path);
  perform public.label_assert(jsonb_array_length(p_value)<=p_max,'too-many-items',p_path);
  if p_unique then
    perform public.label_assert((select count(*)=count(distinct value) from jsonb_array_elements(p_value)),'duplicate-value',p_path);
  end if;
end;
$$;

create function public.label_assert_text(p_value jsonb, p_max integer, p_path text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  perform public.label_assert(jsonb_typeof(p_value)='string','invalid-text',p_path);
  perform public.label_assert(char_length(p_value#>>'{}')<=p_max,'text-too-long',p_path);
end;
$$;

create function public.label_assert_integer(p_value jsonb, p_min integer, p_max integer, p_path text, p_nullable boolean default false)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare n numeric;
begin
  if p_nullable and p_value='null'::jsonb then return; end if;
  perform public.label_assert(jsonb_typeof(p_value)='number','invalid-value',p_path);
  n:=(p_value#>>'{}')::numeric;
  perform public.label_assert(n=trunc(n) and n between p_min and p_max,'invalid-value',p_path);
end;
$$;

create function public.label_assert_date(p_value jsonb, p_path text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare v text; d date;
begin
  if p_value='null'::jsonb then return; end if;
  perform public.label_assert(jsonb_typeof(p_value)='string','invalid-date',p_path);
  v:=p_value#>>'{}';
  perform public.label_assert(v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$','invalid-date',p_path);
  begin
    d:=make_date(substring(v,1,4)::integer,substring(v,6,2)::integer,substring(v,9,2)::integer);
    perform public.label_assert(substring(v,1,4)::integer>=1,'invalid-date',p_path);
  exception when datetime_field_overflow or invalid_datetime_format then
    perform public.label_assert(false,'invalid-date',p_path);
  end;
end;
$$;

-- Derselbe Leerraum wie JavaScript String.trim(), unabhängig von der DB-Kollation.
create function public.label_strip_whitespace(p_text text)
returns text language sql immutable security invoker set search_path = '' as $$
 select translate(p_text,' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
  chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279),'');
$$;
create function public.label_has_text(p_text text)
returns boolean language sql immutable security invoker set search_path = '' as $$
 select coalesce(public.label_strip_whitespace(p_text)<>'',false);
$$;

create function public.label_assert_source_url(p_value jsonb, p_path text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare v text; authority text; host text; port text; code integer;
begin
  perform public.label_assert_text(p_value,2048,p_path);
  v:=p_value#>>'{}';
  if v='' then return; end if; -- Unvollständiger Entwurf, kein veröffentlichbarer Beleg.
  perform public.label_assert(v ~* '^https://' and v !~ '[[:cntrl:]]' and public.label_strip_whitespace(v)=v and position(chr(92) in v)=0,'invalid-url',p_path);
  for code in 127..159 loop
    perform public.label_assert(position(chr(code) in v)=0,'invalid-url',p_path);
  end loop;
  authority:=substring(v from '^.{8}([^/?#]+)');
  perform public.label_assert(authority is not null and authority<>'' and position('@' in authority)=0,'invalid-url',p_path);
  -- IPv6 ist nur in Klammern zulässig; Inet-Cast prüft das tatsächliche Adressformat.
  if left(authority,1)='[' then
    host:=substring(authority from '^\[([^]]+)\]');
    perform public.label_assert(host is not null and authority ~ '^\[[^]]+\](:[0-9]+)?$','invalid-url',p_path);
    begin
      perform public.label_assert(family(host::inet)=6,'invalid-url',p_path);
    exception when invalid_text_representation then
      perform public.label_assert(false,'invalid-url',p_path);
    end;
    port:=substring(authority from '\]:([0-9]+)$');
  else
    perform public.label_assert(authority !~ '[\[\]]' and authority ~ '^[^:]+(:[0-9]+)?$','invalid-url',p_path);
    host:=split_part(authority,':',1);
    perform public.label_assert(host<>'' and host !~ '[%<>"{}|^`]' ,'invalid-url',p_path);
    port:=substring(authority from ':([0-9]+)$');
  end if;
  if port is not null then
    perform public.label_assert(char_length(port)<=5,'invalid-url',p_path);
    perform public.label_assert(port::integer between 0 and 65535,'invalid-url',p_path);
  end if;
end;
$$;

create function public.label_json_byte_size(p_value jsonb)
returns bigint language plpgsql immutable security invoker set search_path = '' as $$
declare total bigint; item record; kind text:=jsonb_typeof(p_value);
begin
  -- jsonb::text enthält zusätzliche Leerzeichen. Nicht als JSON.stringify-Größe ausgeben.
  if kind='object' then
    total:=2;
    for item in select key,value from jsonb_each(p_value) loop
      total:=total+octet_length(to_jsonb(item.key)::text)+1+public.label_json_byte_size(item.value)+1;
    end loop;
    if p_value<>'{}'::jsonb then total:=total-1; end if;
    return total;
  elsif kind='array' then
    select coalesce(sum(public.label_json_byte_size(value)),0)+2+greatest(count(*)-1,0)
      into total from jsonb_array_elements(p_value);
    return total;
  elsif kind='number' then
    return octet_length(trim_scale((p_value#>>'{}')::numeric)::text);
  end if;
  return octet_length(p_value::text);
end;
$$;

create function public.label_validate_content(p_content jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare k text; item record; sub record; v jsonb; ids jsonb:='[]'; path text; start_year numeric; end_year numeric;
begin
  perform public.label_assert_object(p_content,array['title','aliases','brandLineId','brandName','brandLineName','kinds',
    'timeSummary','evidenceLevel','intervals','features','checkHints','limitations','relatedReferenceIds','sources','reviewedAt'],'content');
  perform public.label_assert_text(p_content->'title',160,'content.title');
  perform public.label_assert_text(p_content->'brandName',160,'content.brandName');
  if p_content->'brandLineName'<>'null'::jsonb then perform public.label_assert_text(p_content->'brandLineName',160,'content.brandLineName'); end if;
  perform public.label_assert_integer(p_content->'brandLineId',1,2147483647,'content.brandLineId',true);
  perform public.label_assert_text(p_content->'timeSummary',4000,'content.timeSummary');
  perform public.label_assert(p_content->>'evidenceLevel' in ('well-supported','partially-supported','undated'),'invalid-value','content.evidenceLevel');
  perform public.label_assert_date(p_content->'reviewedAt','content.reviewedAt');
  foreach k in array array['aliases','features','limitations'] loop
    perform public.label_assert_array(p_content->k,case when k='aliases' then 20 else 50 end,'content.'||k);
    for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->k) with ordinality loop
      perform public.label_assert_text(item.value,case when k='aliases' then 80 else 4000 end,'content.'||k||'['||item.i||']');
    end loop;
  end loop;
  perform public.label_assert_array(p_content->'kinds',2,'content.kinds',true);
  for item in select value from jsonb_array_elements(p_content->'kinds') loop
    perform public.label_assert(item.value in ('"neck-label"'::jsonb,'"care-size-label"'::jsonb),'invalid-value','content.kinds');
  end loop;
  perform public.label_assert_array(p_content->'relatedReferenceIds',50,'content.relatedReferenceIds',true);
  for item in select value from jsonb_array_elements(p_content->'relatedReferenceIds') loop
    perform public.label_assert_integer(item.value,1,2147483647,'content.relatedReferenceIds');
  end loop;
  perform public.label_assert_array(p_content->'sources',100,'content.sources');
  for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->'sources') with ordinality loop
    path:='content.sources['||item.i||']'; v:=item.value;
    perform public.label_assert_object(v,array['id','title','publisher','url','accessedAt','locator'],path);
    perform public.label_assert_text(v->'id',80,path||'.id');
    perform public.label_assert(public.label_has_text(v->>'id'),'invalid-source-id',path||'.id');
    perform public.label_assert(not (ids @> jsonb_build_array(v->'id')),'duplicate-source',path||'.id');
    ids:=ids||jsonb_build_array(v->'id');
    perform public.label_assert_text(v->'title',160,path||'.title');
    perform public.label_assert_text(v->'publisher',160,path||'.publisher');
    perform public.label_assert_source_url(v->'url',path||'.url');
    perform public.label_assert_text(v->'locator',4000,path||'.locator');
    perform public.label_assert_date(v->'accessedAt',path||'.accessedAt');
  end loop;
  foreach k in array array['intervals','checkHints'] loop
    perform public.label_assert_array(p_content->k,case when k='intervals' then 30 else 50 end,'content.'||k);
    for item in select value,ordinality-1 as i from jsonb_array_elements(p_content->k) with ordinality loop
      path:='content.'||k||'['||item.i||']'; v:=item.value;
      if k='intervals' then
        perform public.label_assert_object(v,array['startYear','endYear','sourceIds'],path);
        perform public.label_assert_integer(v->'startYear',1,9999,path||'.startYear',true);
        perform public.label_assert_integer(v->'endYear',1,9999,path||'.endYear',true);
        start_year:=(v->>'startYear')::numeric; end_year:=(v->>'endYear')::numeric;
        perform public.label_assert(start_year is null or end_year is null or start_year<=end_year,'invalid-interval',path);
      else
        perform public.label_assert_object(v,array['text','sourceIds'],path);
        perform public.label_assert_text(v->'text',4000,path||'.text');
      end if;
      perform public.label_assert_array(v->'sourceIds',100,path||'.sourceIds',true);
      for sub in select value from jsonb_array_elements(v->'sourceIds') loop
        perform public.label_assert_text(sub.value,80,path||'.sourceIds');
        perform public.label_assert(ids @> jsonb_build_array(sub.value),'unknown-source',path||'.sourceIds');
      end loop;
    end loop;
  end loop;
  perform public.label_assert(public.label_json_byte_size(p_content)<=262144,'payload-too-large','content');
  return p_content;
end;
$$;

create function public.label_validate_draft(p_input jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare item record; seen jsonb:='[]'; path text;
begin
  perform public.label_assert_object(p_input,array['content','images'],'draft');
  perform public.label_validate_content(p_input->'content');
  perform public.label_assert_array(p_input->'images',24,'images');
  for item in select value,ordinality-1 as i from jsonb_array_elements(p_input->'images') with ordinality loop
    path:='images['||item.i||']';
    perform public.label_assert_object(item.value,array['assetId','position','caption','alt','referenceItem'],path);
    perform public.label_assert_integer(item.value->'assetId',1,2147483647,path||'.assetId');
    perform public.label_assert_integer(item.value->'position',0,23,path||'.position');
    perform public.label_assert((item.value->>'position')::numeric=item.i,'invalid-image-order',path||'.position');
    perform public.label_assert(not(seen @> jsonb_build_array(item.value->'assetId')),'duplicate-image',path);
    seen:=seen||jsonb_build_array(item.value->'assetId');
    perform public.label_assert_text(item.value->'caption',4000,path||'.caption');
    perform public.label_assert_text(item.value->'alt',4000,path||'.alt');
    perform public.label_assert_text(item.value->'referenceItem',160,path||'.referenceItem');
  end loop;
  perform public.label_assert(public.label_json_byte_size(p_input)<=262144,'payload-too-large','draft');
  return p_input;
end;
$$;

-- Hilfsfunktionen sind kein Browser-API; Aufruf nur durch geprüfte RPCs des Owners.
revoke all on function public.label_assert(boolean,text,text),
 public.label_assert_object(jsonb,text[],text), public.label_assert_array(jsonb,integer,text,boolean),
 public.label_assert_text(jsonb,integer,text), public.label_assert_integer(jsonb,integer,integer,text,boolean),
 public.label_assert_date(jsonb,text), public.label_strip_whitespace(text), public.label_has_text(text), public.label_assert_source_url(jsonb,text),
 public.label_json_byte_size(jsonb), public.label_validate_content(jsonb), public.label_validate_draft(jsonb)
 from public,anon,authenticated,service_role;
