\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select plan(5);

create temp table listing_queue_probe(action text, snapshot jsonb);
create trigger check_catalog before insert on listing_queue_probe
for each row execute function public.marketplace_check_vinted_listing_catalog();
insert into public.vinted_listing_categories(id,title,full_title,path,position,is_leaf,tree_observed_at,fields_observed_at)
values (2147483646,'Hosen','Hosen','',0,true,now(),now());
insert into public.vinted_listing_category_fields(category_id,field_code,position,required,option_ids)
values (2147483646,'size',0,true,null),(2147483646,'condition',1,true,array[2]);
insert into public.vinted_listing_size_groups(id,title) values (2147483646,'Größen');
insert into public.vinted_listing_sizes(id,size_group_id,title,position) values (2147483646,2147483646,'M',0);
insert into public.vinted_listing_category_size_groups(category_id,size_group_id,position) values (2147483646,2147483646,0);

select throws_ok($$insert into listing_queue_probe values ('publish','{"content":{"categoryId":2147483647}}')$$,
  'PV001','Wähle im Entwurf eine aktuelle Vinted-Kategorie.','Unbekannte Kategorie abweisen');
select throws_ok($$insert into listing_queue_probe values ('publish','{"relistExternalId":"123","content":{"categoryId":2147483646}}')$$,
  'PV001','Wähle eine Vinted-Größe für diese Kategorie.','Relist ohne Pflichtgröße vor dem Einreihen abweisen');
select throws_ok($$insert into listing_queue_probe values ('publish','{"content":{"categoryId":2147483646,"sizeId":2147483647}}')$$,
  'PV001','Die gewählte Größe passt nicht zur Vinted-Kategorie.','Falsche Größengruppe abweisen');
select lives_ok($$insert into listing_queue_probe values ('publish','{"content":{"categoryId":2147483646,"sizeId":2147483646,"conditionId":2}}')$$,
  'Passende Größe und Zustand annehmen');
select lives_ok($$insert into listing_queue_probe values ('vinted_draft','{"content":{"categoryId":2147483647}}')$$,
  'Anbieterentwurf weiterhin getrennt behandeln');

select * from finish();
rollback;
