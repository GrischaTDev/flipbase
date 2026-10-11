# Vinted-Statistikseite – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine eigene Seite „Statistik“ im Vinted-Bereich zeigt echte Aufrufe und Favoriten je Zeitraum, je Konto oder für alle Konten, samt Bestenliste – und die Messwerte bleiben erhalten, wenn ein Inserat verschwindet.

**Architecture:** Messungen hängen künftig an einem dauerhaften Statistik-Datensatz je Vinted-Artikel statt am Kleiderschrank-Eintrag. Eine neue Datenbankfunktion rechnet Summen, Zeitabschnitte und Bestenliste aus; die Angular-Seite stellt das Ergebnis nur dar. Das erfundene Diagramm im Kleiderschrank wird gelöscht.

**Tech Stack:** Angular 22 (Signals, Standalone, OnPush), Tailwind, ApexCharts 7.1 über den vorhandenen `RevenueChartRenderer`, Supabase/Postgres (pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-vinted-statistics-page-design.md`

## Global Constraints

- Arbeitsordner: `K:\GitHub\Repos\flipbase\.worktrees\vinted-statistics-page`, Zweig `juna/vinted-statistics-page`. Nicht ins Haupt-Repo wechseln.
- Vor dem ersten Schritt: `npm ci` im Arbeitsordner (frischer Worktree ohne `node_modules`) und Docker Desktop starten (für `supabase start`, `supabase db diff`, `npm run test:db`).
- Bezeichner, Dateien, Tabellen englisch. Oberflächentexte, Kommentare, Testnamen deutsch, Du-Ansprache.
- Commits englisch, Conventional Commits, Scope `inventory`, **keine** `Co-Authored-By`-Zeile und keine KI-Signatur.
- Angular: Standalone ohne `standalone: true`, `ChangeDetectionStrategy.OnPush`, eigene `.html`-Datei, `inject()`, `input()`/`output()`, `@if`/`@for`, kein `ngClass`/`ngStyle`, keine Arrow-Funktionen und keine Globals im Template.
- Styling: nur Tailwind im Template, kein neues SCSS. Akzent `#fcc601`. Farben über `fb-`-Klassen.
- SQL: Kleinbuchstaben, `security invoker`, `set search_path = ''`, vollqualifizierte Namen, RLS mit getrennten Policies je Operation und Rolle.
- Migration nicht frei erfinden: `supabase stop`, dann `supabase db diff -f <name>`, erzeugte Datei prüfen und um die Datenübernahme ergänzen.
- Exitcodes nie durch eine Pipe messen (`cmd > log 2>&1; echo $?`).
- Keine Beispiel- oder Fantasiezahlen in der Oberfläche.
- Schild für verschwundene Artikel heißt immer „Nicht mehr online“. Ein Schild „Verkauft“ gibt es nicht: Vinted-Verkäufe tragen keine Artikelnummer (`services/marketplace-worker/src/vinted-account-import.ts:592-605`), eine sichere Zuordnung ist nicht möglich.

## Review Focus

1. **Inserat verschwindet und taucht mit derselben Vinted-Nummer wieder auf** → derselbe Statistik-Datensatz läuft weiter, „Nicht mehr online“ verschwindet. Test in Task 1.
2. **Kontowechsel oder Zeitraumwechsel, während eine Antwort noch unterwegs ist** → die verspätete Antwort darf die Anzeige nicht überschreiben. Test in Task 3.
3. **Antwort des Servers hat eine unerwartete Form** → Fehlerhinweis mit „Erneut versuchen“, kein Absturz und keine halben Zahlen. Tests in Task 2 und 3.
4. **Artikel ohne Bild, ohne Preis, mit sehr langem Titel** → Platzhalterbild, „Preis unbekannt“, Titel wird gekürzt, Seite läuft nicht über. Test in Task 5, Überlaufprüfung in Task 7.
5. **Nur ein Konto oder Wechsel von mehreren auf eines** → Schalter „Alle Konten“ fehlt und die Seite fällt auf „Dieses Konto“ zurück. Test in Task 3.

---

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `supabase/schemas/340_marketplace_listing_statistics.sql` (ändern) | neue Tabelle, geänderte Messungstabelle, Trigger, Lesefunktion |
| `supabase/migrations/<zeit>_vinted_statistics_history.sql` (neu, erzeugt) | Schemaänderung plus Datenübernahme |
| `supabase/tests/marketplace-listing-statistics-overview.test.sql` (neu) | Datenbanktests |
| `src/app/core/models/supabase.types.ts` (neu erzeugt) | Typen |
| `src/app/features/marketplaces/models/vinted-statistics-overview.ts` (+ `.spec.ts`) | Typen, Prüfung der Antwort, reine Hilfsfunktionen |
| `src/app/features/marketplaces/services/marketplace-api.service.ts` (ändern) | Aufruf der Lesefunktion |
| `src/app/features/marketplaces/services/vinted-statistics.store.ts` (+ `.angular.spec.ts`) | Zustand der Seite |
| `src/app/features/marketplaces/models/vinted-reach-chart.config.ts` (+ `.spec.ts`) | ApexCharts-Einstellungen |
| `src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.{ts,html}` (+ Spec) | Diagramm |
| `src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.{ts,html}` (+ Spec) | Bestenliste |
| `src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.{ts,html}` (+ Spec) | Seite |
| `src/app/features/marketplaces/marketplaces.routes.ts`, `src/app/core/config/vinted-workspace-navigation.ts` (+ Spec), `src/app/features/marketplaces/vinted-workspace.component.ts` | Route, Menü, Seitentitel |
| `components/vinted-wardrobe-statistics/*`, `models/vinted-wardrobe-statistics*.ts` (löschen) | erfundenes Diagramm |
| `e2e/vinted-workspace-ui.spec.ts` (ändern) | Menüliste, AXE- und Überlaufprüfung der Seite |

---

### Task 1: Datenbank – dauerhafte Statistik-Datensätze und Lesefunktion

**Files:**
- Modify: `supabase/schemas/340_marketplace_listing_statistics.sql`
- Create: `supabase/tests/marketplace-listing-statistics-overview.test.sql`
- Create (erzeugt): `supabase/migrations/<YYYYMMDDHHmmss>_vinted_statistics_history.sql`
- Regenerate: `src/app/core/models/supabase.types.ts`

**Interfaces:**
- Produces: RPC `public.marketplace_read_listing_statistics_overview(p_workspace_id uuid, p_period text, p_connection_id uuid default null) returns jsonb` mit der Antwortform:

```json
{
  "workspaceId": "uuid",
  "connectionId": "uuid | null",
  "period": "24h | 7d | 30d",
  "historyStartsAt": "ISO | null",
  "activeCount": 3,
  "totals": { "views": 70, "favorites": 7 },
  "previousTotals": { "views": 10, "favorites": 1 },
  "buckets": [{ "start": "ISO", "views": 0, "favorites": 0 }],
  "topItems": [{
    "id": "12", "connectionId": "uuid", "accountName": "Konto A", "entryId": "uuid | null",
    "title": "Artikel", "imageUrl": "https://… | null", "price": 12.5, "currency": "EUR | null",
    "removedAt": "ISO | null", "views": 50, "favorites": 7,
    "totalViews": 155, "totalFavorites": 18
  }]
}
```

`previousTotals` ist `null`, wenn die Historie den Vorzeitraum nicht vollständig abdeckt. `topItems` enthält alle Artikel, die nach Aufrufen **oder** nach Favoriten unter den 25 stärksten sind (höchstens 50), nur mit Zuwachs größer 0.

- [ ] **Step 1: Lokale Datenbank starten und Ausgangslage prüfen**

Run: `npx supabase start > .supabase-start.log 2>&1; echo $?` → `0`
Run: `npx supabase test db supabase/tests/marketplace-listing-statistics.test.sql > .dbtest.log 2>&1; echo $?` → `0`

(`.supabase-start.log` und `.dbtest.log` nicht committen; am Ende des Tasks löschen.)

- [ ] **Step 2: Den fehlschlagenden Datenbanktest schreiben**

Datei `supabase/tests/marketplace-listing-statistics-overview.test.sql`. Alle Zeiten sind relativ zu `now()`; innerhalb der Testtransaktion bleibt `now()` gleich.

```sql
\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public','marketplace_listing_statistic_items','Dauerhafte Statistik-Datensätze sind vorhanden');
select ok((select relrowsecurity from pg_class where oid='public.marketplace_listing_statistic_items'::regclass),'Statistik-Datensätze sind durch RLS geschützt');
select ok(not has_table_privilege('authenticated','public.marketplace_listing_statistic_items','insert'),'Browser dürfen keine Statistik-Datensätze anlegen');
select ok(not has_function_privilege('anon','public.marketplace_read_listing_statistics_overview(uuid,text,uuid)','execute'),'Anonyme Clients dürfen keine Statistik abrufen');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('34100000-0000-4000-8000-000000000001','authenticated','authenticated','overview-owner@example.test','{}','{}'),
 ('34100000-0000-4000-8000-000000000002','authenticated','authenticated','overview-member@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('34100000-0000-4000-8000-000000000001'),('34100000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('34100000-0000-4000-8000-000000000011','Statistikübersicht');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000001','owner'),
 ('34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000002','member');
insert into public.marketplace_connections(id,workspace_id,display_name,status) values
 ('34100000-0000-4000-8000-000000000021','34100000-0000-4000-8000-000000000011','Konto A','connected'),
 ('34100000-0000-4000-8000-000000000022','34100000-0000-4000-8000-000000000011','Konto B','connected');

-- Artikel A auf Konto A: erste Messung vor 20 Tagen, danach vier weitere.
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000031','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000021','publication','item-a',
  '{"title":"Jacke","imageUrl":"https://images.example.test/a.jpg","price":25,"currency":"EUR","metrics":{"views":100,"favorites":10}}',now()-interval '20 days',now()-interval '20 days'),
 ('34100000-0000-4000-8000-000000000032','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000022','publication','item-b',
  '{"title":"Schal","metrics":{"views":5,"favorites":0}}',now()-interval '20 days',now()-interval '20 days');
update public.marketplace_account_entries set observed_at=now()-interval '8 days',body=jsonb_set(body,'{metrics}','{"views":110,"favorites":11}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '2 days',body=jsonb_set(body,'{metrics}','{"views":150,"favorites":15}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '30 minutes',body=jsonb_set(body,'{metrics}','{"views":160,"favorites":null}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '10 minutes',body=jsonb_set(body,'{metrics}','{"views":155,"favorites":18}') where external_id='item-a';
update public.marketplace_account_entries set observed_at=now()-interval '1 hour',body=jsonb_set(body,'{metrics}','{"views":25,"favorites":0}') where external_id='item-b';

select is((select count(*)::int from public.marketplace_listing_statistic_items where workspace_id='34100000-0000-4000-8000-000000000011'),2,'Je Vinted-Artikel entsteht genau ein Statistik-Datensatz');
select is((select title from public.marketplace_listing_statistic_items where external_id='item-a'),'Jacke','Titel wird übernommen');
select is((select first_seen_at from public.marketplace_listing_statistic_items where external_id='item-a'),now()-interval '20 days','Erste Messung bestimmt den Beginn der Historie');

-- Artikel B verschwindet aus dem Kleiderschrank.
delete from public.marketplace_account_entries where external_id='item-b' and workspace_id='34100000-0000-4000-8000-000000000011';
select is((select count(*)::int from public.marketplace_listing_metric_observations o join public.marketplace_listing_statistic_items i on i.id=o.statistic_item_id where i.external_id='item-b'),2,'Messungen bleiben erhalten, wenn das Inserat verschwindet');
select isnt((select removed_at from public.marketplace_listing_statistic_items where external_id='item-b'),null,'Verschwundenes Inserat wird als nicht mehr online vermerkt');

create function pg_temp.overview(p_period text, p_connection_id uuid default null) returns jsonb language sql as $$
 select public.marketplace_read_listing_statistics_overview('34100000-0000-4000-8000-000000000011',p_period,p_connection_id);
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(pg_temp.overview('7d')->'totals'->>'views','70','Sieben Tage, alle Konten: 50 Aufrufe von A und 20 vom verschwundenen B');
select is(pg_temp.overview('7d')->'totals'->>'favorites','7','Unbekannte Favoriten werden übersprungen, nicht als null gewertet');
select is(pg_temp.overview('7d')->'previousTotals'->>'views','10','Vorzeitraum zählt den Zuwachs von vor acht Tagen');
select is(pg_temp.overview('7d')->'previousTotals'->>'favorites','1','Vorzeitraum zählt auch Favoriten');
select is(pg_temp.overview('7d')->>'activeCount','1','Nur noch vorhandene Inserate zählen als aktiv');
select is(jsonb_array_length(pg_temp.overview('7d')->'buckets'),7,'Sieben Tage liefern sieben Abschnitte');
select is((select sum((b->>'views')::int)::int from jsonb_array_elements(pg_temp.overview('7d')->'buckets') b),70,'Abschnitte ergeben zusammen die Summe');
select is(pg_temp.overview('7d','34100000-0000-4000-8000-000000000021')->'totals'->>'views','50','Ein einzelnes Konto zeigt nur seine Aufrufe');
select is(pg_temp.overview('7d')->'topItems'->0->>'title','Jacke','Stärkster Artikel steht vorn');
select is(pg_temp.overview('7d')->'topItems'->0->>'views','50','Bestenliste nennt den Zuwachs im Zeitraum');
select is(pg_temp.overview('7d')->'topItems'->0->>'totalViews','155','Bestenliste nennt den letzten bekannten Gesamtwert');
select is(pg_temp.overview('7d')->'topItems'->0->>'entryId','34100000-0000-4000-8000-000000000031','Vorhandenes Inserat ist verlinkbar');
select is(pg_temp.overview('7d')->'topItems'->0->>'accountName','Konto A','Bestenliste nennt das Konto');
select is(pg_temp.overview('7d')->'topItems'->1->>'title','Schal','Verschwundener Artikel bleibt in der Bestenliste');
select is(pg_temp.overview('7d')->'topItems'->1->>'entryId',null,'Verschwundener Artikel ist nicht verlinkbar');
select isnt(pg_temp.overview('7d')->'topItems'->1->>'removedAt',null,'Verschwundener Artikel trägt den Vermerk');

select is(pg_temp.overview('24h')->'totals'->>'views','30','24 Stunden: 10 von A (sinkender Zähler zählt 0) und 20 von B');
select is(pg_temp.overview('24h')->'totals'->>'favorites','3','24 Stunden: Favoriten gegen den letzten bekannten Wert');
select is(pg_temp.overview('24h')->'previousTotals'->>'views','0','Vorzeitraum ohne Messung ergibt null Zuwachs');
select is(jsonb_array_length(pg_temp.overview('24h')->'buckets'),24,'24 Stunden liefern 24 Abschnitte');

select is(pg_temp.overview('30d')->'totals'->>'views','80','30 Tage enthalten alle Zuwächse; die allererste Messung zählt nicht');
select is(pg_temp.overview('30d')->'previousTotals',jsonb 'null','Ohne vollständige Historie gibt es keinen Vorzeitraum');
select is(jsonb_array_length(pg_temp.overview('30d')->'buckets'),30,'30 Tage liefern 30 Abschnitte');

select throws_ok($$select pg_temp.overview('90d')$$,'22023',null,'Nicht angebotene Zeiträume werden abgelehnt');
select throws_ok($$select pg_temp.overview('7d','34100000-0000-4000-8000-000000000099')$$,'42501',null,'Ein unbekanntes Konto liefert keine Statistik');
select throws_ok($$select public.marketplace_read_listing_statistics_overview('34100000-0000-4000-8000-000000000012','7d')$$,'42501',null,'Ein fremder Workspace liefert keine Statistik');
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.overview('7d')$$,'42501',null,'Mitglieder ohne Verwaltungsrecht haben keinen Zugriff');
select is((select count(*)::int from public.marketplace_listing_statistic_items),0,'RLS verbirgt die Statistik-Datensätze vor Mitgliedern');

-- Review Focus 1: dasselbe Inserat taucht wieder auf.
reset role;
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,sort_at,observed_at) values
 ('34100000-0000-4000-8000-000000000033','34100000-0000-4000-8000-000000000011','34100000-0000-4000-8000-000000000022','publication','item-b',
  '{"title":"Schal","metrics":{"views":27,"favorites":0}}',now()-interval '1 minute',now()-interval '1 minute');
select is((select count(*)::int from public.marketplace_listing_statistic_items where external_id='item-b'),1,'Wiederkehrendes Inserat nutzt denselben Statistik-Datensatz');
select is((select removed_at from public.marketplace_listing_statistic_items where external_id='item-b'),null,'Wiederkehrendes Inserat gilt wieder als online');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.overview('24h','34100000-0000-4000-8000-000000000022')->'totals'->>'views','22','Zuwachs läuft über das Wiederauftauchen hinweg weiter');

reset role;
delete from public.marketplace_connections where workspace_id='34100000-0000-4000-8000-000000000011';
select is((select count(*)::int from public.marketplace_listing_statistic_items where workspace_id='34100000-0000-4000-8000-000000000011'),0,'Kontolöschung entfernt die Statistik des Kontos');
select * from finish();
rollback;
```

- [ ] **Step 3: Test ausführen und Fehlschlag bestätigen**

Run: `npx supabase test db supabase/tests/marketplace-listing-statistics-overview.test.sql > .dbtest.log 2>&1; echo $?`
Expected: Exitcode ungleich 0; im Log fehlt die Tabelle `marketplace_listing_statistic_items`.

- [ ] **Step 4: Schema-Datei ändern**

In `supabase/schemas/340_marketplace_listing_statistics.sql`:

**a)** Ganz oben, vor `create table public.marketplace_listing_metric_observations`, einfügen:

```sql
-- Dauerhafter Statistik-Datensatz je Vinted-Artikel. Er überlebt das Verschwinden des Inserats,
-- damit vergangene Zeiträume nachträglich nicht kleiner werden.
create table public.marketplace_listing_statistic_items (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 256),
  title text not null,
  image_url text,
  price numeric,
  currency text,
  first_seen_at timestamptz not null check (isfinite(first_seen_at)),
  last_seen_at timestamptz not null check (isfinite(last_seen_at)),
  removed_at timestamptz,
  unique (workspace_id, connection_id, external_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_listing_statistic_items is 'Dauerhafte Stammdaten je Vinted-Artikel für die Statistik; bleibt bestehen, wenn das Inserat aus dem Kleiderschrank verschwindet.';
alter table public.marketplace_listing_statistic_items enable row level security;
revoke all on public.marketplace_listing_statistic_items from public, anon, authenticated;
grant select on public.marketplace_listing_statistic_items to authenticated;
grant all on public.marketplace_listing_statistic_items to service_role;
revoke all on sequence public.marketplace_listing_statistic_items_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_listing_statistic_items_id_seq to service_role;
create policy "Administrators read statistic items" on public.marketplace_listing_statistic_items for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads statistic items" on public.marketplace_listing_statistic_items for select to service_role using (true);
create policy "Worker inserts statistic items" on public.marketplace_listing_statistic_items for insert to service_role with check (true);
create policy "Worker updates statistic items" on public.marketplace_listing_statistic_items for update to service_role using (true) with check (true);
create policy "Worker deletes statistic items" on public.marketplace_listing_statistic_items for delete to service_role using (true);
```

**b)** In `create table public.marketplace_listing_metric_observations` drei Zeilen ersetzen:

Alt:
```sql
  entry_id uuid not null references public.marketplace_account_entries(id) on delete cascade,
```
Neu:
```sql
  entry_id uuid references public.marketplace_account_entries(id) on delete set null,
```

Alt:
```sql
  unique (entry_id, observed_at),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
```
Neu:
```sql
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade,
  statistic_item_id bigint not null references public.marketplace_listing_statistic_items(id) on delete cascade,
  unique (statistic_item_id, observed_at)
```

**c)** Die Funktion `public.marketplace_record_listing_metrics()` vollständig ersetzen (das `create trigger` darunter bleibt):

```sql
create or replace function public.marketplace_record_listing_metrics()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_item_id bigint;
  v_title text := nullif(btrim(new.body->>'title'),'');
  v_image_url text := nullif(new.body->>'imageUrl','');
  v_price numeric := case when jsonb_typeof(new.body->'price') = 'number' then (new.body->>'price')::numeric end;
  v_currency text := nullif(new.body->>'currency','');
  v_first_seen_at timestamptz := new.observed_at;
begin
  if new.kind <> 'publication' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.observed_at <= old.observed_at then return new; end if;
    v_first_seen_at := old.observed_at;
  end if;
  -- Fehlende Angaben eines Abrufs überschreiben keine bekannten Stammdaten.
  insert into public.marketplace_listing_statistic_items as i(workspace_id,connection_id,external_id,title,image_url,price,currency,first_seen_at,last_seen_at)
    values(new.workspace_id,new.connection_id,new.external_id,coalesce(v_title,'Inserat'),v_image_url,v_price,v_currency,v_first_seen_at,new.observed_at)
    on conflict (workspace_id,connection_id,external_id) do update set
      title = coalesce(v_title,i.title),
      image_url = coalesce(v_image_url,i.image_url),
      price = coalesce(v_price,i.price),
      currency = coalesce(v_currency,i.currency),
      first_seen_at = least(i.first_seen_at,excluded.first_seen_at),
      last_seen_at = greatest(i.last_seen_at,excluded.last_seen_at),
      removed_at = null
    returning i.id into v_item_id;
  if tg_op = 'UPDATE' then
    -- Beim ersten neuen Abruf bleibt auch die bereits gespeicherte Ausgangsbasis erhalten.
    insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
      values(old.workspace_id,old.connection_id,old.id,old.observed_at,public.marketplace_known_metric_count(old.body,'views'),public.marketplace_known_metric_count(old.body,'favorites'),v_item_id)
      on conflict (statistic_item_id,observed_at) do nothing;
  end if;
  -- Unveränderte Werte ebenfalls erfassen: der nächste Abruf muss null Zuwachs zeigen.
  insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
    values(new.workspace_id,new.connection_id,new.id,new.observed_at,public.marketplace_known_metric_count(new.body,'views'),public.marketplace_known_metric_count(new.body,'favorites'),v_item_id)
    on conflict (statistic_item_id,observed_at) do nothing;
  return new;
end;
$$;
```

**d)** Direkt nach dem vorhandenen `create trigger marketplace_record_listing_metrics …` einfügen:

```sql
create or replace function public.marketplace_mark_listing_statistics_removed()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if old.kind = 'publication' then
    update public.marketplace_listing_statistic_items set removed_at = now()
      where workspace_id = old.workspace_id and connection_id = old.connection_id and external_id = old.external_id and removed_at is null;
  end if;
  return old;
end;
$$;
create trigger marketplace_mark_listing_statistics_removed after delete on public.marketplace_account_entries for each row execute function public.marketplace_mark_listing_statistics_removed();
```

**e)** Vor dem abschließenden `revoke all on function public.marketplace_known_metric_count…` einfügen:

```sql
create or replace function public.marketplace_read_listing_statistics_overview(p_workspace_id uuid, p_period text, p_connection_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_unit text; v_zone text; v_step interval; v_length interval; v_bucket_count integer;
  v_last_bucket timestamp; v_first_bucket timestamp;
  v_start timestamptz; v_previous_start timestamptz;
  v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or (p_connection_id is not null and not exists(
    select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted')) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('24h','7d','30d') then
    raise exception 'Ungültiger Statistikzeitraum' using errcode = '22023';
  end if;
  -- Stundenabschnitte in UTC, Tagesabschnitte nach deutschem Kalendertag.
  if p_period = '24h' then v_unit := 'hour'; v_zone := 'UTC'; v_step := interval '1 hour'; v_length := interval '24 hours'; v_bucket_count := 24;
  elsif p_period = '7d' then v_unit := 'day'; v_zone := 'Europe/Berlin'; v_step := interval '1 day'; v_length := interval '7 days'; v_bucket_count := 7;
  else v_unit := 'day'; v_zone := 'Europe/Berlin'; v_step := interval '1 day'; v_length := interval '30 days'; v_bucket_count := 30;
  end if;
  v_last_bucket := date_trunc(v_unit, now() at time zone v_zone);
  v_first_bucket := v_last_bucket - (v_bucket_count - 1) * v_step;
  v_start := v_first_bucket at time zone v_zone;
  v_previous_start := (v_first_bucket - v_length) at time zone v_zone;

  with items as (
    select i.*, c.display_name as account_name
    from public.marketplace_listing_statistic_items i
    join public.marketplace_connections c on c.workspace_id = i.workspace_id and c.id = i.connection_id
    where i.workspace_id = p_workspace_id and c.marketplace = 'vinted' and (p_connection_id is null or i.connection_id = p_connection_id)
  ),
  series as (
    -- Nur das Zeitfenster wird eingelesen; unbekannte Werte fallen heraus.
    select o.statistic_item_id, o.observed_at, m.metric, m.value
    from public.marketplace_listing_metric_observations o
    join items i on i.id = o.statistic_item_id
    cross join lateral (values ('views', o.views), ('favorites', o.favorites)) m(metric, value)
    where o.observed_at >= v_previous_start and m.value is not null
    union all
    -- Ausgangswert: letzter bekannter Stand vor dem Vorzeitraum, je Artikel und Kennzahl,
    -- direkt über den Index (statistic_item_id, observed_at).
    select i.id, b.observed_at, m.metric, b.value
    from items i cross join (values ('views'), ('favorites')) m(metric)
    cross join lateral (
      select o.observed_at, case m.metric when 'views' then o.views else o.favorites end as value
      from public.marketplace_listing_metric_observations o
      where o.statistic_item_id = i.id and o.observed_at < v_previous_start
        and case m.metric when 'views' then o.views else o.favorites end is not null
      order by o.observed_at desc limit 1
    ) b
  ),
  gains as (
    select s.statistic_item_id, s.observed_at, s.metric,
      greatest(0, s.value - lag(s.value) over (partition by s.statistic_item_id, s.metric order by s.observed_at)) as gain
    from series s
  ),
  counted as (
    select g.* from gains g where g.gain is not null and g.observed_at >= v_previous_start
  ),
  bucket_list as (
    select g as bucket from generate_series(v_first_bucket, v_last_bucket, v_step) g
  ),
  bucket_totals as (
    select b.bucket,
      coalesce(sum(c.gain) filter (where c.metric = 'views'), 0) as views,
      coalesce(sum(c.gain) filter (where c.metric = 'favorites'), 0) as favorites
    from bucket_list b
    left join counted c on c.observed_at >= v_start and date_trunc(v_unit, c.observed_at at time zone v_zone) = b.bucket
    group by b.bucket
  ),
  item_totals as (
    select i.id, i.connection_id, i.account_name, i.external_id, i.title, i.image_url, i.price, i.currency, i.removed_at,
      coalesce(sum(c.gain) filter (where c.metric = 'views'), 0) as views,
      coalesce(sum(c.gain) filter (where c.metric = 'favorites'), 0) as favorites
    from items i join counted c on c.statistic_item_id = i.id and c.observed_at >= v_start
    group by i.id, i.connection_id, i.account_name, i.external_id, i.title, i.image_url, i.price, i.currency, i.removed_at
  ),
  ranked as (
    select t.*,
      row_number() over (order by t.views desc, t.favorites desc, t.id) as views_rank,
      row_number() over (order by t.favorites desc, t.views desc, t.id) as favorites_rank
    from item_totals t where t.views > 0 or t.favorites > 0
  )
  select jsonb_build_object(
    'workspaceId', p_workspace_id,
    'connectionId', p_connection_id,
    'period', p_period,
    'historyStartsAt', (select min(first_seen_at) from items),
    'activeCount', (select count(*) from items where removed_at is null),
    'totals', jsonb_build_object(
      'views', coalesce((select sum(gain) from counted where metric = 'views' and observed_at >= v_start), 0),
      'favorites', coalesce((select sum(gain) from counted where metric = 'favorites' and observed_at >= v_start), 0)),
    'previousTotals', case when (select min(first_seen_at) from items) <= v_previous_start then jsonb_build_object(
      'views', coalesce((select sum(gain) from counted where metric = 'views' and observed_at < v_start), 0),
      'favorites', coalesce((select sum(gain) from counted where metric = 'favorites' and observed_at < v_start), 0)) end,
    'buckets', (select jsonb_agg(jsonb_build_object('start', b.bucket at time zone v_zone, 'views', b.views, 'favorites', b.favorites) order by b.bucket) from bucket_totals b),
    'topItems', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id::text, 'connectionId', r.connection_id, 'accountName', r.account_name,
        'entryId', case when r.removed_at is null then (select e.id from public.marketplace_account_entries e
          where e.workspace_id = p_workspace_id and e.connection_id = r.connection_id and e.kind = 'publication' and e.external_id = r.external_id) end,
        'title', r.title, 'imageUrl', r.image_url, 'price', r.price, 'currency', r.currency, 'removedAt', r.removed_at,
        'views', r.views, 'favorites', r.favorites,
        'totalViews', (select o.views from public.marketplace_listing_metric_observations o where o.statistic_item_id = r.id and o.views is not null order by o.observed_at desc limit 1),
        'totalFavorites', (select o.favorites from public.marketplace_listing_metric_observations o where o.statistic_item_id = r.id and o.favorites is not null order by o.observed_at desc limit 1)
      ) order by r.views desc, r.favorites desc, r.id) from ranked r where r.views_rank <= 25 or r.favorites_rank <= 25), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
```

**f)** Die Rechtezeilen am Dateiende ergänzen. Die erste vorhandene `revoke`-Zeile um die neue Trigger-Funktion erweitern und zwei Zeilen anhängen:

```sql
revoke all on function public.marketplace_known_metric_count(jsonb,text), public.marketplace_record_listing_metrics(), public.marketplace_mark_listing_statistics_removed(), public.marketplace_broadcast_account_import() from public, anon, authenticated;
```
```sql
revoke all on function public.marketplace_read_listing_statistics_overview(uuid,text,uuid) from public, anon;
grant execute on function public.marketplace_read_listing_statistics_overview(uuid,text,uuid) to authenticated;
```

- [ ] **Step 5: Migration erzeugen und um die Datenübernahme ergänzen**

Run: `npx supabase stop > /dev/null 2>&1; npx supabase db diff -f vinted_statistics_history > .dbdiff.log 2>&1; echo $?` → `0`

Die erzeugte Datei öffnen. Sie legt `statistic_item_id` als Pflichtspalte an und scheitert damit an vorhandenen Zeilen. Von Hand so ordnen (Namen der Constraints aus der erzeugten Datei übernehmen):

1. Kopf im Format der vorhandenen Migrationen an den Anfang:

```sql
-- Zweck: Messhistorie bleibt erhalten, wenn ein Vinted-Inserat verschwindet; neue Lesefunktion für die Statistikseite.
-- Betroffen: neue Tabelle public.marketplace_listing_statistic_items; public.marketplace_listing_metric_observations
--   (neue Spalte statistic_item_id, entry_id wahlfrei mit on delete set null, neuer Eindeutigkeitsschlüssel);
--   Trigger auf public.marketplace_account_entries; Funktion public.marketplace_read_listing_statistics_overview.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default
```

2. Reihenfolge der Anweisungen: Tabelle `marketplace_listing_statistic_items` samt Rechten und Policies anlegen → `alter table … add column statistic_item_id bigint` **ohne** `not null` → Datenübernahme (unten) → `alter column statistic_item_id set not null` → Fremdschlüssel und neuer Eindeutigkeitsschlüssel → alten Eindeutigkeitsschlüssel `(entry_id, observed_at)` und alten Fremdschlüssel auf `entry_id` entfernen, `entry_id drop not null`, neuen Fremdschlüssel mit `on delete set null` → Funktionen und Trigger.

3. Datenübernahme zwischen „Spalte anlegen“ und „set not null“ einfügen:

```sql
-- Vorhandene Inserate bekommen ihren dauerhaften Statistik-Datensatz. Bereits gelöschte Inserate
-- haben keine Messungen mehr und lassen sich nicht wiederherstellen.
insert into public.marketplace_listing_statistic_items(workspace_id,connection_id,external_id,title,image_url,price,currency,first_seen_at,last_seen_at)
select e.workspace_id, e.connection_id, e.external_id,
  coalesce(nullif(btrim(e.body->>'title'),''),'Inserat'),
  nullif(e.body->>'imageUrl',''),
  case when jsonb_typeof(e.body->'price') = 'number' then (e.body->>'price')::numeric end,
  nullif(e.body->>'currency',''),
  least(e.observed_at, coalesce(min(o.observed_at), e.observed_at)),
  greatest(e.observed_at, coalesce(max(o.observed_at), e.observed_at))
from public.marketplace_account_entries e
left join public.marketplace_listing_metric_observations o on o.entry_id = e.id
where e.kind = 'publication'
group by e.id;

update public.marketplace_listing_metric_observations o set statistic_item_id = i.id
from public.marketplace_account_entries e
join public.marketplace_listing_statistic_items i on i.workspace_id = e.workspace_id and i.connection_id = e.connection_id and i.external_id = e.external_id
where e.id = o.entry_id;
```

4. Die Anweisungen zum Entfernen des alten Schlüssels und Fremdschlüssels mit einem Kommentar versehen, z. B.:

```sql
-- Destruktiv, aber ohne Datenverlust: die Eindeutigkeit wandert von (entry_id, observed_at) auf
-- (statistic_item_id, observed_at); der alte Fremdschlüssel löschte Messungen zusammen mit dem Inserat.
```

Die Migration enthält kein `begin`/`commit` und keine psql-Befehle.

- [ ] **Step 6: Migration gegen Schema prüfen und Tests ausführen**

Run: `npx supabase start > .supabase-start.log 2>&1; npx supabase db reset > .dbreset.log 2>&1; echo $?` → `0`
Run: `npx supabase db diff > .dbdiff.log 2>&1; echo $?` → `0`, und `.dbdiff.log` enthält keine SQL-Anweisung (kein verbleibender Unterschied zwischen Migrationen und Schema-Dateien).
Run: `npx supabase test db supabase/tests/marketplace-listing-statistics-overview.test.sql > .dbtest.log 2>&1; echo $?` → `0`
Run: `npx supabase test db supabase/tests/marketplace-listing-statistics.test.sql > .dbtest.log 2>&1; echo $?` → `0` (die „+N“-Zahlen arbeiten unverändert)
Run: `npx supabase test db supabase/tests/marketplace-import-reliability.test.sql supabase/tests/marketplace-accounts.test.sql > .dbtest.log 2>&1; echo $?` → `0` (Import löscht weiterhin fehlende Inserate)
Run: `node --test scripts/check-migration-changes.test.mjs scripts/check-schema-registration.test.mjs > .workflow.log 2>&1; echo $?` → `0`

Schlägt ein Test fehl: Ursache im SQL beheben, nicht die Erwartung ändern.

- [ ] **Step 7: Typen neu erzeugen**

Run: `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts; echo $?` → `0`
Prüfen: `grep -n "marketplace_read_listing_statistics_overview" -A8 src/app/core/models/supabase.types.ts` zeigt `p_connection_id?: string`, `p_period: string`, `p_workspace_id: string`.
Run: `npx prettier --write src/app/core/models/supabase.types.ts`

- [ ] **Step 8: Commit**

```bash
rm -f .supabase-start.log .dbtest.log .dbdiff.log .dbreset.log .workflow.log
git add supabase/schemas/340_marketplace_listing_statistics.sql supabase/migrations supabase/tests/marketplace-listing-statistics-overview.test.sql src/app/core/models/supabase.types.ts
git commit -F - <<'EOF'
feat(inventory): keep Vinted listing measurements after a listing disappears

Measurements were tied to the wardrobe entry and removed with it, so a
listing that was sold yesterday vanished from last week's numbers. They
now belong to a permanent statistics record per Vinted item, and a new
read function returns totals, time buckets and the top listings per
account or across all accounts.

Existing measurements are carried over; listings that were already
removed cannot be restored. Checked with the new pgTAP file, the
existing listing statistics, import reliability and account tests, and
an empty schema diff after db reset.
EOF
```

---

### Task 2: Modell – Antwort prüfen und Anzeigehilfen

**Files:**
- Create: `src/app/features/marketplaces/models/vinted-statistics-overview.ts`
- Test: `src/app/features/marketplaces/models/vinted-statistics-overview.spec.ts`

**Interfaces:**
- Produces:

```ts
export type VintedStatisticsRange = '24h' | '7d' | '30d';
export type VintedStatisticsMetric = 'views' | 'favorites';
export interface VintedStatisticsRequestScope { readonly workspaceId: string; readonly connectionId: string | null }
export interface VintedStatisticsTotals { readonly views: number; readonly favorites: number }
export interface VintedStatisticsBucket extends VintedStatisticsTotals { readonly start: string }
export interface VintedStatisticsTopItem extends VintedStatisticsTotals {
  readonly id: string; readonly connectionId: string; readonly accountName: string;
  readonly entryId: string | null; readonly title: string; readonly imageUrl: string | null;
  readonly price: number | null; readonly currency: string; readonly removedAt: string | null;
  readonly totalViews: number | null; readonly totalFavorites: number | null;
}
export interface VintedStatisticsOverview extends VintedStatisticsRequestScope {
  readonly range: VintedStatisticsRange; readonly historyStartsAt: string | null; readonly activeCount: number;
  readonly totals: VintedStatisticsTotals; readonly previousTotals: VintedStatisticsTotals | null;
  readonly buckets: readonly VintedStatisticsBucket[]; readonly topItems: readonly VintedStatisticsTopItem[];
}
export const VINTED_STATISTICS_RANGES: readonly { readonly value: VintedStatisticsRange; readonly label: string; readonly previousLabel: string }[];
export function parseVintedStatisticsOverview(data: unknown, scope: VintedStatisticsRequestScope, range: VintedStatisticsRange): VintedStatisticsOverview;
export function rankTopItems(items: readonly VintedStatisticsTopItem[], metric: VintedStatisticsMetric, limit?: number): readonly VintedStatisticsTopItem[];
export function formatBucketLabel(start: string, range: VintedStatisticsRange): string;
export function formatBucketDescription(start: string, range: VintedStatisticsRange): string;
export function describeChange(current: number, previous: number | null, range: VintedStatisticsRange): string;
export function formatCount(value: number | null): string;
export function formatPrice(price: number | null, currency: string): string;
```

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/app/features/marketplaces/models/vinted-statistics-overview.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MarketplaceResponseError } from './marketplace-response';
import {
  describeChange,
  formatBucketDescription,
  formatBucketLabel,
  formatCount,
  formatPrice,
  parseVintedStatisticsOverview,
  rankTopItems,
  type VintedStatisticsTopItem,
} from './vinted-statistics-overview';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const item = {
  id: '1',
  connectionId: 'account-a',
  accountName: 'Konto A',
  entryId: 'entry-a',
  title: 'Jacke',
  imageUrl: 'https://images.example.test/a.jpg',
  price: 25,
  currency: 'EUR',
  removedAt: null,
  views: 50,
  favorites: 7,
  totalViews: 155,
  totalFavorites: 18,
};
const response = (changes: Record<string, unknown> = {}) => ({
  ...scope,
  period: '7d',
  historyStartsAt: '2026-09-21T10:00:00Z',
  activeCount: 3,
  totals: { views: 70, favorites: 7 },
  previousTotals: { views: 10, favorites: 1 },
  buckets: [
    { start: '2026-10-07T22:00:00Z', views: 20, favorites: 2 },
    { start: '2026-10-08T22:00:00Z', views: 50, favorites: 5 },
  ],
  topItems: [item],
  ...changes,
});

describe('parseVintedStatisticsOverview', () => {
  it('übernimmt eine vollständige Antwort', () => {
    const overview = parseVintedStatisticsOverview(response(), scope, '7d');
    expect(overview.range).toBe('7d');
    expect(overview.totals).toEqual({ views: 70, favorites: 7 });
    expect(overview.previousTotals).toEqual({ views: 10, favorites: 1 });
    expect(overview.buckets).toHaveLength(2);
    expect(overview.topItems[0]).toEqual(item);
  });

  it('akzeptiert alle Konten, fehlenden Vorzeitraum und Artikel ohne Bild, Preis und Währung', () => {
    const overview = parseVintedStatisticsOverview(
      response({
        connectionId: null,
        previousTotals: null,
        historyStartsAt: null,
        topItems: [
          {
            ...item,
            entryId: null,
            imageUrl: null,
            price: null,
            currency: null,
            removedAt: '2026-10-09T08:00:00Z',
            totalViews: null,
            totalFavorites: null,
          },
        ],
      }),
      { workspaceId: 'workspace-a', connectionId: null },
      '7d',
    );
    expect(overview.connectionId).toBeNull();
    expect(overview.previousTotals).toBeNull();
    expect(overview.topItems[0].currency).toBe('EUR');
    expect(overview.topItems[0].removedAt).toBe('2026-10-09T08:00:00Z');
  });

  it.each([
    ['fremder Workspace', response({ workspaceId: 'workspace-b' })],
    ['anderes Konto', response({ connectionId: 'account-b' })],
    ['anderer Zeitraum', response({ period: '24h' })],
    ['negative Summe', response({ totals: { views: -1, favorites: 0 } })],
    ['Kommazahl als Zähler', response({ totals: { views: 1.5, favorites: 0 } })],
    ['Abschnitte fehlen', response({ buckets: null })],
    ['ungültiges Datum', response({ buckets: [{ start: 'gestern', views: 1, favorites: 0 }] })],
    ['Artikel ohne Titel', response({ topItems: [{ ...item, title: '' }] })],
    ['doppelter Artikel', response({ topItems: [item, item] })],
    ['kein Objekt', 'kaputt'],
    ['null', null],
  ])('lehnt ab: %s', (_name, data) => {
    expect(() => parseVintedStatisticsOverview(data, scope, '7d')).toThrow(
      MarketplaceResponseError,
    );
  });
});

describe('rankTopItems', () => {
  const items: VintedStatisticsTopItem[] = [
    { ...item, id: '1', views: 5, favorites: 9 },
    { ...item, id: '2', views: 50, favorites: 1 },
    { ...item, id: '3', views: 50, favorites: 4 },
    { ...item, id: '4', views: 0, favorites: 0 },
  ];
  it('sortiert nach Aufrufen und löst Gleichstand über Favoriten', () => {
    expect(rankTopItems(items, 'views').map((entry) => entry.id)).toEqual(['3', '2', '1']);
  });
  it('sortiert nach Favoriten', () => {
    expect(rankTopItems(items, 'favorites').map((entry) => entry.id)).toEqual(['1', '3', '2']);
  });
  it('lässt Artikel ohne Zuwachs in der gewählten Kennzahl weg und begrenzt die Länge', () => {
    expect(rankTopItems(items, 'views', 2).map((entry) => entry.id)).toEqual(['3', '2']);
    expect(rankTopItems([{ ...item, views: 0, favorites: 3 }], 'views')).toEqual([]);
  });
});

describe('Anzeigehilfen', () => {
  it('beschriftet Abschnitte in deutscher Zeit', () => {
    expect(formatBucketLabel('2026-10-08T12:00:00Z', '24h')).toBe('14 Uhr');
    expect(formatBucketLabel('2026-10-07T22:00:00Z', '7d')).toBe('08.10.');
    expect(formatBucketDescription('2026-10-08T12:00:00Z', '24h')).toBe('08.10., 14 Uhr');
    expect(formatBucketDescription('2026-10-07T22:00:00Z', '30d')).toBe('Donnerstag, 08.10.');
  });
  it('beschreibt die Veränderung zum Zeitraum davor', () => {
    expect(describeChange(56, 50, '7d')).toBe('+12 % gegenüber den 7 Tagen davor');
    expect(describeChange(46, 50, '24h')).toBe('−8 % gegenüber den 24 Stunden davor');
    expect(describeChange(50, 50, '30d')).toBe('Unverändert gegenüber den 30 Tagen davor');
    expect(describeChange(12, 0, '7d')).toBe('+12 gegenüber den 7 Tagen davor');
    expect(describeChange(0, 0, '7d')).toBe('Unverändert gegenüber den 7 Tagen davor');
    expect(describeChange(12, null, '7d')).toBe('Noch kein Vergleich');
  });
  it('formatiert Zahlen und Preise deutsch', () => {
    expect(formatCount(12345)).toBe('12.345');
    expect(formatCount(null)).toBe('—');
    expect(formatPrice(12.5, 'EUR')).toBe('12,50 €');
    expect(formatPrice(null, 'EUR')).toBe('Preis unbekannt');
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npx vitest run --project=node src/app/features/marketplaces/models/vinted-statistics-overview.spec.ts > .test.log 2>&1; echo $?`
Expected: ungleich 0, Modul nicht gefunden.

- [ ] **Step 3: Modell schreiben**

`src/app/features/marketplaces/models/vinted-statistics-overview.ts`:

```ts
import { MarketplaceResponseError } from './marketplace-response';

export type VintedStatisticsRange = '24h' | '7d' | '30d';
export type VintedStatisticsMetric = 'views' | 'favorites';

export interface VintedStatisticsRequestScope {
  readonly workspaceId: string;
  /** `null` steht für alle Vinted-Konten des Workspace. */
  readonly connectionId: string | null;
}
export interface VintedStatisticsTotals {
  readonly views: number;
  readonly favorites: number;
}
export interface VintedStatisticsBucket extends VintedStatisticsTotals {
  readonly start: string;
}
export interface VintedStatisticsTopItem extends VintedStatisticsTotals {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly entryId: string | null;
  readonly title: string;
  readonly imageUrl: string | null;
  readonly price: number | null;
  readonly currency: string;
  readonly removedAt: string | null;
  readonly totalViews: number | null;
  readonly totalFavorites: number | null;
}
export interface VintedStatisticsOverview extends VintedStatisticsRequestScope {
  readonly range: VintedStatisticsRange;
  readonly historyStartsAt: string | null;
  readonly activeCount: number;
  readonly totals: VintedStatisticsTotals;
  readonly previousTotals: VintedStatisticsTotals | null;
  readonly buckets: readonly VintedStatisticsBucket[];
  readonly topItems: readonly VintedStatisticsTopItem[];
}

export const VINTED_STATISTICS_RANGES: readonly {
  readonly value: VintedStatisticsRange;
  readonly label: string;
  readonly previousLabel: string;
}[] = [
  { value: '24h', label: '24 Stunden', previousLabel: 'den 24 Stunden davor' },
  { value: '7d', label: '7 Tage', previousLabel: 'den 7 Tagen davor' },
  { value: '30d', label: '30 Tage', previousLabel: 'den 30 Tagen davor' },
];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MarketplaceResponseError();
  return value as Record<string, unknown>;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new MarketplaceResponseError();
  return value;
}
function counter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MarketplaceResponseError();
  return value;
}
function optionalCounter(value: unknown): number | null {
  return value === null || value === undefined ? null : counter(value);
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new MarketplaceResponseError();
  return value;
}
function optionalDate(value: unknown): string | null {
  return value === null || value === undefined ? null : date(value);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new MarketplaceResponseError();
  return value;
}
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function totals(value: unknown): VintedStatisticsTotals {
  const source = record(value);
  return { views: counter(source['views']), favorites: counter(source['favorites']) };
}

export function parseVintedStatisticsOverview(
  data: unknown,
  scope: VintedStatisticsRequestScope,
  range: VintedStatisticsRange,
): VintedStatisticsOverview {
  const response = record(data);
  if (
    response['workspaceId'] !== scope.workspaceId ||
    (response['connectionId'] ?? null) !== scope.connectionId ||
    response['period'] !== range
  )
    throw new MarketplaceResponseError();
  const ids = new Set<string>();
  const topItems = list(response['topItems']).map((value) => {
    const source = record(value);
    const id = text(source['id']);
    if (ids.has(id)) throw new MarketplaceResponseError();
    ids.add(id);
    const price = source['price'];
    if (price !== null && price !== undefined && (typeof price !== 'number' || price < 0))
      throw new MarketplaceResponseError();
    return {
      id,
      connectionId: text(source['connectionId']),
      accountName: text(source['accountName']),
      entryId: optionalText(source['entryId']),
      title: text(source['title']),
      imageUrl: optionalText(source['imageUrl']),
      price: typeof price === 'number' ? price : null,
      currency: optionalText(source['currency']) ?? 'EUR',
      removedAt: optionalDate(source['removedAt']),
      views: counter(source['views']),
      favorites: counter(source['favorites']),
      totalViews: optionalCounter(source['totalViews']),
      totalFavorites: optionalCounter(source['totalFavorites']),
    };
  });
  return {
    ...scope,
    range,
    historyStartsAt: optionalDate(response['historyStartsAt']),
    activeCount: counter(response['activeCount']),
    totals: totals(response['totals']),
    previousTotals:
      response['previousTotals'] === null || response['previousTotals'] === undefined
        ? null
        : totals(response['previousTotals']),
    buckets: list(response['buckets']).map((value) => {
      const source = record(value);
      return { start: date(source['start']), ...totals(source) };
    }),
    topItems,
  };
}

/** Stärkste Artikel der gewählten Kennzahl; Gleichstand entscheidet die andere Kennzahl. */
export function rankTopItems(
  items: readonly VintedStatisticsTopItem[],
  metric: VintedStatisticsMetric,
  limit = 25,
): readonly VintedStatisticsTopItem[] {
  const other: VintedStatisticsMetric = metric === 'views' ? 'favorites' : 'views';
  return items
    .filter((item) => item[metric] > 0)
    .sort(
      (left, right) =>
        right[metric] - left[metric] ||
        right[other] - left[other] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

const zone = 'Europe/Berlin';
const hourFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: zone,
  hour: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: zone,
  day: '2-digit',
  month: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: zone, weekday: 'long' });
const countFormat = new Intl.NumberFormat('de-DE');

function hourOf(start: string): string {
  const hour = hourFormat.formatToParts(new Date(start)).find((part) => part.type === 'hour');
  return `${hour?.value ?? '00'} Uhr`;
}

export function formatBucketLabel(start: string, range: VintedStatisticsRange): string {
  return range === '24h' ? hourOf(start) : dayFormat.format(new Date(start));
}

export function formatBucketDescription(start: string, range: VintedStatisticsRange): string {
  const day = dayFormat.format(new Date(start));
  return range === '24h'
    ? `${day}, ${hourOf(start)}`
    : `${weekdayFormat.format(new Date(start))}, ${day}`;
}

export function describeChange(
  current: number,
  previous: number | null,
  range: VintedStatisticsRange,
): string {
  if (previous === null) return 'Noch kein Vergleich';
  const period = VINTED_STATISTICS_RANGES.find((option) => option.value === range)!.previousLabel;
  if (current === previous) return `Unverändert gegenüber ${period}`;
  if (previous === 0) return `+${countFormat.format(current)} gegenüber ${period}`;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return `Unverändert gegenüber ${period}`;
  return `${percent > 0 ? '+' : '−'}${countFormat.format(Math.abs(percent))} % gegenüber ${period}`;
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : countFormat.format(value);
}

export function formatPrice(price: number | null, currency: string): string {
  if (price === null) return 'Preis unbekannt';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(price);
  } catch {
    return `${countFormat.format(price)} ${currency}`;
  }
}
```

Hinweis: `Intl` trennt Betrag und „€“ sowie Zahl und „%“ mit einem geschützten Leerzeichen. Schlägt deshalb der Vergleich `'12,50 €'` fehl, im Test `formatPrice(12.5, 'EUR').replace(/\u00a0/g, ' ')` verwenden – die Funktion selbst nicht ändern. Das „%“ in `describeChange` wird mit normalem Leerzeichen selbst angefügt.

- [ ] **Step 4: Tests bestehen lassen**

Run: `npx vitest run --project=node src/app/features/marketplaces/models/vinted-statistics-overview.spec.ts > .test.log 2>&1; echo $?` → `0`

- [ ] **Step 5: Commit**

```bash
rm -f .test.log
git add src/app/features/marketplaces/models/vinted-statistics-overview.ts src/app/features/marketplaces/models/vinted-statistics-overview.spec.ts
git commit -F - <<'EOF'
feat(inventory): add the Vinted statistics overview model

The statistics page must never show half-valid numbers, so the server
answer is checked field by field and rejected as a whole when it does
not match the requested workspace, account and period. Ranking, labels
and the comparison text live here as pure functions so the components
stay free of logic. Checked with the model unit tests.
EOF
```

---

### Task 3: API-Aufruf und Zustand der Seite

**Files:**
- Modify: `src/app/features/marketplaces/services/marketplace-api.service.ts` (nach `readListingStatistics`, Zeile ~114)
- Create: `src/app/features/marketplaces/services/vinted-statistics.store.ts`
- Test: `src/app/features/marketplaces/services/vinted-statistics.store.angular.spec.ts`

**Interfaces:**
- Consumes: `parseVintedStatisticsOverview`, `VintedStatisticsRange`, `VintedStatisticsRequestScope`, `VintedStatisticsOverview` aus Task 2; `MarketplaceAccountStore` (`connections()`, `selectedConnection()`, `canManage()`, `snapshot()`, `selectionVersion()`).
- Produces:

```ts
// MarketplaceApiService
readStatisticsOverview(scope: VintedStatisticsRequestScope, range: VintedStatisticsRange): Promise<VintedStatisticsOverview>

// vinted-statistics.store.ts
export type VintedStatisticsAccountScope = 'account' | 'all';
@Injectable() export class VintedStatisticsStore {
  readonly accountScope: Signal<VintedStatisticsAccountScope>;
  readonly canCombineAccounts: Signal<boolean>;
  readonly range: Signal<VintedStatisticsRange>;
  readonly overview: Signal<VintedStatisticsOverview | null>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
  selectAccountScope(scope: VintedStatisticsAccountScope): void;
  selectRange(range: VintedStatisticsRange): void;
  reload(): void;
}
```

- [ ] **Step 1: Fehlschlagenden Store-Test schreiben**

`src/app/features/marketplaces/services/vinted-statistics.store.angular.spec.ts`:

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  VintedStatisticsOverview,
  VintedStatisticsRange,
  VintedStatisticsRequestScope,
} from '../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { VintedStatisticsStore } from './vinted-statistics.store';

const accountA = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const accountB = { workspaceId: 'workspace-a', connectionId: 'account-b' };
const account = {
  canManage: signal(true),
  connections: signal([accountA, accountB]),
  selectedConnection: signal<typeof accountA | null>(accountA),
  snapshot: signal<unknown>(null),
  selectionVersion: signal(0),
};
const overview = (
  scope: VintedStatisticsRequestScope,
  range: VintedStatisticsRange,
  views = 1,
): VintedStatisticsOverview => ({
  ...scope,
  range,
  historyStartsAt: null,
  activeCount: 0,
  totals: { views, favorites: 0 },
  previousTotals: null,
  buckets: [],
  topItems: [],
});
let read: ReturnType<typeof vi.fn>;
let store: VintedStatisticsStore;
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
beforeEach(() => {
  account.canManage.set(true);
  account.connections.set([accountA, accountB]);
  account.selectedConnection.set(accountA);
  account.selectionVersion.set(0);
  read = vi.fn((scope: VintedStatisticsRequestScope, range: VintedStatisticsRange) =>
    Promise.resolve(overview(scope, range)),
  );
  TestBed.configureTestingModule({
    providers: [
      VintedStatisticsStore,
      { provide: MarketplaceAccountStore, useValue: account },
      { provide: MarketplaceApiService, useValue: { readStatisticsOverview: read } },
    ],
  });
  store = TestBed.inject(VintedStatisticsStore);
});
afterEach(() => TestBed.resetTestingModule());

it('lädt beim Öffnen sieben Tage für das gewählte Konto', async () => {
  await settle();
  expect(read).toHaveBeenCalledWith(accountA, '7d');
  expect(store.overview()?.connectionId).toBe('account-a');
  expect(store.loading()).toBe(false);
});

it('lädt alle Konten ohne Kontokennung und wechselt den Zeitraum', async () => {
  await settle();
  store.selectAccountScope('all');
  await settle();
  expect(read).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', connectionId: null }, '7d');
  expect(store.overview()?.connectionId).toBeNull();
  store.selectRange('30d');
  await settle();
  expect(read).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', connectionId: null }, '30d');
  expect(store.overview()?.range).toBe('30d');
});

it('verwirft eine verspätete Antwort nach einem Kontowechsel', async () => {
  await settle();
  let finishA!: (value: VintedStatisticsOverview) => void;
  read.mockImplementationOnce(
    () => new Promise<VintedStatisticsOverview>((resolve) => (finishA = resolve)),
  );
  store.selectRange('24h');
  await settle();
  account.selectedConnection.set(accountB);
  account.selectionVersion.set(1);
  await settle();
  finishA(overview(accountA, '24h', 999));
  await settle();
  expect(store.overview()?.connectionId).toBe('account-b');
  expect(store.overview()?.totals.views).toBe(1);
});

it('zeigt die alte Antwort nicht mehr, sobald das Konto wechselt', async () => {
  await settle();
  read.mockImplementationOnce(() => new Promise<VintedStatisticsOverview>(() => undefined));
  account.selectedConnection.set(accountB);
  account.selectionVersion.set(1);
  await settle();
  expect(store.overview()).toBeNull();
  expect(store.loading()).toBe(true);
});

it('meldet einen Fehler und lädt auf Wunsch erneut', async () => {
  read.mockRejectedValueOnce(new Error('kaputt'));
  await settle();
  expect(store.overview()).toBeNull();
  expect(store.error()).toBe('Die Statistik konnte nicht geladen werden.');
  store.reload();
  await settle();
  expect(store.error()).toBeNull();
  expect(store.overview()?.connectionId).toBe('account-a');
});

it('fällt bei nur einem Konto auf dieses Konto zurück', async () => {
  store.selectAccountScope('all');
  await settle();
  account.connections.set([accountA]);
  await settle();
  expect(store.canCombineAccounts()).toBe(false);
  expect(store.accountScope()).toBe('account');
  expect(read).toHaveBeenLastCalledWith(accountA, '7d');
});

it('lädt nichts ohne Verwaltungsrecht', async () => {
  account.canManage.set(false);
  await settle();
  read.mockClear();
  store.reload();
  await settle();
  expect(read).not.toHaveBeenCalled();
  expect(store.overview()).toBeNull();
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npx vitest run --project=angular src/app/features/marketplaces/services/vinted-statistics.store.angular.spec.ts > .test.log 2>&1; echo $?` → ungleich 0 (Modul fehlt).

- [ ] **Step 3: API-Methode ergänzen**

In `marketplace-api.service.ts` die Typen importieren:

```ts
import {
  parseVintedStatisticsOverview,
  type VintedStatisticsOverview,
  type VintedStatisticsRange,
  type VintedStatisticsRequestScope,
} from '../models/vinted-statistics-overview';
```

Direkt nach der Methode `readListingStatistics` einfügen:

```ts
  async readStatisticsOverview(
    scope: VintedStatisticsRequestScope,
    range: VintedStatisticsRange,
  ): Promise<VintedStatisticsOverview> {
    return parseVintedStatisticsOverview(
      dataOf(
        await this.client.rpc('marketplace_read_listing_statistics_overview', {
          p_workspace_id: scope.workspaceId,
          p_period: range,
          // Ohne Kontokennung fasst die Datenbank alle Vinted-Konten zusammen.
          ...(scope.connectionId ? { p_connection_id: scope.connectionId } : {}),
        }),
      ),
      scope,
      range,
    );
  }
```

- [ ] **Step 4: Store schreiben**

`src/app/features/marketplaces/services/vinted-statistics.store.ts`:

```ts
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type {
  VintedStatisticsOverview,
  VintedStatisticsRange,
  VintedStatisticsRequestScope,
} from '../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';

export type VintedStatisticsAccountScope = 'account' | 'all';

interface StatisticsRequest {
  readonly scope: VintedStatisticsRequestScope;
  readonly range: VintedStatisticsRange;
  /** Wessen Zahlen gezeigt werden: Workspace, Konto, Zeitraum und Auswahlversion. */
  readonly selection: string;
  /** Zusätzlich Neuladen und Messzeitpunkte: bestimmt, wann erneut geladen wird. */
  readonly key: string;
}

/** Zustand der Statistikseite; verspätete Antworten dürfen weder Konto noch Zeitraum ersetzen. */
@Injectable()
export class VintedStatisticsStore {
  private readonly account = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceApiService);
  private readonly requestedAccountScope = signal<VintedStatisticsAccountScope>('account');
  private readonly selectedRange = signal<VintedStatisticsRange>('7d');
  private readonly reloads = signal(0);
  private readonly result = signal<{
    selection: string;
    key: string;
    overview: VintedStatisticsOverview;
  } | null>(null);
  private readonly failedKey = signal<string | null>(null);
  private revision = 0;

  readonly range = this.selectedRange.asReadonly();
  readonly canCombineAccounts = computed(() => this.account.connections().length > 1);
  readonly accountScope = computed<VintedStatisticsAccountScope>(() =>
    this.canCombineAccounts() ? this.requestedAccountScope() : 'account',
  );
  private readonly request = computed<StatisticsRequest | null>(() => {
    const connection = this.account.selectedConnection();
    if (!connection || !this.account.canManage()) return null;
    const scope: VintedStatisticsRequestScope = {
      workspaceId: connection.workspaceId,
      connectionId: this.accountScope() === 'all' ? null : connection.connectionId,
    };
    const range = this.range();
    // Ein neuer Abruf des Kontos ändert die Messzeitpunkte und lädt die Statistik neu.
    const observed = this.account
      .snapshot()
      ?.publications.items.map((entry) => entry.metrics.observedAt)
      .join(',');
    const selection = JSON.stringify([
      scope.workspaceId,
      scope.connectionId,
      range,
      this.account.selectionVersion(),
    ]);
    return {
      scope,
      range,
      selection,
      key: JSON.stringify([selection, this.reloads(), observed ?? null]),
    };
  });
  // Neuladen und neue Messzeitpunkte behalten die sichtbaren Zahlen, bis die Antwort da ist.
  readonly overview = computed(() => {
    const result = this.result();
    return result && result.selection === this.request()?.selection ? result.overview : null;
  });
  readonly error = computed(() =>
    this.request() && this.failedKey() === this.request()!.key
      ? 'Die Statistik konnte nicht geladen werden.'
      : null,
  );
  readonly loading = computed(() => {
    const request = this.request();
    return !!request && this.result()?.key !== request.key && this.failedKey() !== request.key;
  });

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => {
        const revision = ++this.revision;
        if (!request) {
          this.result.set(null);
          this.failedKey.set(null);
          return;
        }
        void this.api
          .readStatisticsOverview(request.scope, request.range)
          .then((overview) => {
            if (revision !== this.revision) return;
            this.failedKey.set(null);
            this.result.set({ selection: request.selection, key: request.key, overview });
          })
          .catch(() => {
            if (revision !== this.revision) return;
            this.result.set(null);
            this.failedKey.set(request.key);
          });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
    });
  }

  selectAccountScope(scope: VintedStatisticsAccountScope): void {
    this.requestedAccountScope.set(scope);
  }
  selectRange(range: VintedStatisticsRange): void {
    this.selectedRange.set(range);
  }
  reload(): void {
    this.reloads.update((count) => count + 1);
  }
}
```

- [ ] **Step 5: Tests bestehen lassen**

Run: `npx vitest run --project=angular src/app/features/marketplaces/services/vinted-statistics.store.angular.spec.ts > .test.log 2>&1; echo $?` → `0`
Run: `npm run typecheck > .types.log 2>&1; echo $?` → `0`

- [ ] **Step 6: Commit**

```bash
rm -f .test.log .types.log
git add src/app/features/marketplaces/services/marketplace-api.service.ts src/app/features/marketplaces/services/vinted-statistics.store.ts src/app/features/marketplaces/services/vinted-statistics.store.angular.spec.ts
git commit -F - <<'EOF'
feat(inventory): load the Vinted statistics overview per account or for all

The page needs one place that knows which account scope and period are
shown and that never lets a late answer replace the current selection.
With a single account the combined view is not offered and the store
falls back to that account. Checked with the store tests and typecheck.
EOF
```

---

### Task 4: Diagramm

**Files:**
- Create: `src/app/features/marketplaces/models/vinted-reach-chart.config.ts`
- Test: `src/app/features/marketplaces/models/vinted-reach-chart.config.spec.ts`
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.ts`
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.html`
- Test: `src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.angular.spec.ts`

**Interfaces:**
- Consumes: `RevenueChartRenderer`, `RevenueChartStatus` aus `src/app/shared/components/revenue-chart/revenue-chart.renderer`; `REVENUE_CHART_LOADER` aus `…/revenue-chart.component`; `ThemeService`, `LoggerService`; `ButtonComponent`.
- Produces:

```ts
// vinted-reach-chart.config.ts
export interface VintedReachChartPoint { readonly key: string; readonly label: string; readonly description: string; readonly value: number }
export const VINTED_REACH_CHART_HEIGHT = 320;
export function createVintedReachChartConfiguration(points: readonly VintedReachChartPoint[], seriesName: string, theme: AppTheme, reducedMotion: boolean): ApexOptions;

// Komponente <app-vinted-reach-chart [points]="…" [seriesName]="'Aufrufe'" />
```

- [ ] **Step 1: Fehlschlagenden Test für die Einstellungen schreiben**

`src/app/features/marketplaces/models/vinted-reach-chart.config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  VINTED_REACH_CHART_HEIGHT,
  createVintedReachChartConfiguration,
} from './vinted-reach-chart.config';

const points = [
  { key: 'a', label: '07.10.', description: 'Mittwoch, 07.10.', value: 20 },
  { key: 'b', label: '08.10.', description: 'Donnerstag, 08.10.', value: 50 },
];

describe('createVintedReachChartConfiguration', () => {
  it('zeigt Säulen in Markengelb mit einer Reihe und 320 px Höhe', () => {
    const configuration = createVintedReachChartConfiguration(points, 'Aufrufe', 'light', false);
    expect(configuration.chart?.type).toBe('bar');
    expect(configuration.chart?.height).toBe(VINTED_REACH_CHART_HEIGHT);
    expect(VINTED_REACH_CHART_HEIGHT).toBe(320);
    expect(configuration.colors).toEqual(['#fcc601']);
    expect(configuration.series).toEqual([{ name: 'Aufrufe', data: [20, 50] }]);
    expect(configuration.xaxis?.categories).toEqual(['07.10.', '08.10.']);
  });
  it('zeigt nur ganze Zahlen auf der Achse und beginnt bei null', () => {
    const { yaxis } = createVintedReachChartConfiguration(points, 'Aufrufe', 'dark', false);
    const axis = Array.isArray(yaxis) ? yaxis[0] : yaxis;
    expect(axis?.min).toBe(0);
    expect(axis?.forceNiceScale).toBe(true);
    expect(axis?.labels?.formatter?.(1234)).toBe('1.234');
  });
  it('schaltet Bewegung bei reduzierter Bewegung ab', () => {
    const configuration = createVintedReachChartConfiguration(points, 'Aufrufe', 'light', true);
    expect(configuration.chart?.animations?.enabled).toBe(false);
  });
  it('bleibt ohne Datenpunkte gültig', () => {
    const configuration = createVintedReachChartConfiguration([], 'Favoriten', 'light', false);
    expect(configuration.series).toEqual([{ name: 'Favoriten', data: [] }]);
  });
});
```

Run: `npx vitest run --project=node src/app/features/marketplaces/models/vinted-reach-chart.config.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

- [ ] **Step 2: Einstellungen schreiben**

`src/app/features/marketplaces/models/vinted-reach-chart.config.ts`:

```ts
import type { ApexOptions } from 'apexcharts';
import type { AppTheme } from '../../../core/services/theme.service';

export interface VintedReachChartPoint {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly value: number;
}

export const VINTED_REACH_CHART_HEIGHT = 320;

// Achsen- und Gitterfarben wie im Ergebnisdiagramm des Dashboards.
const palettes = {
  light: { bar: '#fcc601', ticks: '#596273', grid: '#e2e6ec' },
  dark: { bar: '#fcc601', ticks: '#a8a8a8', grid: '#373737' },
};
const countFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export function createVintedReachChartConfiguration(
  points: readonly VintedReachChartPoint[],
  seriesName: string,
  theme: AppTheme,
  reducedMotion: boolean,
): ApexOptions {
  const palette = palettes[theme];
  return {
    chart: {
      type: 'bar',
      height: VINTED_REACH_CHART_HEIGHT,
      width: '100%',
      fontFamily: 'Inter, system-ui, sans-serif',
      foreColor: palette.ticks,
      background: 'transparent',
      parentHeightOffset: 0,
      animations: {
        enabled: !reducedMotion,
        speed: 250,
        animateGradually: { enabled: false },
        dynamicAnimation: { enabled: !reducedMotion, speed: 250 },
      },
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    series: [{ name: seriesName, data: points.map((point) => point.value) }],
    colors: [palette.bar],
    stroke: { width: 0 },
    plotOptions: {
      bar: { horizontal: false, columnWidth: '64%', borderRadius: 4, borderRadiusApplication: 'end' },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { enabled: false },
    xaxis: {
      type: 'category',
      categories: points.map((point) => point.label),
      tickPlacement: 'on',
      tickAmount: points.length > 1 ? Math.min(points.length - 1, 7) : undefined,
      labels: {
        rotate: 0,
        hideOverlappingLabels: true,
        style: { fontSize: '12px', colors: palette.ticks },
      },
      axisBorder: { color: palette.grid },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        formatter: (value) => countFormat.format(value),
        style: { fontSize: '12px', colors: [palette.ticks] },
      },
    },
    grid: {
      borderColor: palette.grid,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 8, right: 12, top: 16, bottom: 0 },
    },
    theme: { mode: theme },
    responsive: [
      {
        breakpoint: 640,
        options: {
          xaxis: { tickAmount: points.length > 1 ? Math.min(points.length - 1, 3) : undefined },
        },
      },
    ],
  };
}
```

Run: `npx vitest run --project=node src/app/features/marketplaces/models/vinted-reach-chart.config.spec.ts > .test.log 2>&1; echo $?` → `0`

- [ ] **Step 3: Fehlschlagenden Komponententest schreiben**

`src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.angular.spec.ts`:

```ts
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ThemeService } from '../../../../core/services/theme.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { REVENUE_CHART_LOADER } from '../../../../shared/components/revenue-chart/revenue-chart.component';
import type { RevenueChartLoader } from '../../../../shared/components/revenue-chart/revenue-chart.renderer';
import { VintedReachChartComponent } from './vinted-reach-chart.component';

const points = [
  { key: 'a', label: '07.10.', description: 'Mittwoch, 07.10.', value: 20 },
  { key: 'b', label: '08.10.', description: 'Donnerstag, 08.10.', value: 50 },
];

describe('VintedReachChartComponent', () => {
  let fixture: ComponentFixture<VintedReachChartComponent>;
  let resetBindings: (() => void) | undefined;
  const render = vi.fn().mockResolvedValue(undefined);
  const updateOptions = vi.fn().mockResolvedValue(undefined);
  const loader: RevenueChartLoader = async () => () => ({ render, updateOptions, destroy: vi.fn() });
  const host = () => fixture.nativeElement as HTMLElement;

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedReachChartComponent,
        path: 'src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.ts',
      },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    render.mockClear();
    await TestBed.configureTestingModule({
      imports: [VintedReachChartComponent],
      providers: [
        { provide: REVENUE_CHART_LOADER, useValue: loader },
        { provide: ThemeService, useValue: { currentTheme: signal('light') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedReachChartComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('seriesName', 'Aufrufe');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('beschreibt das Diagramm für Bildschirmleser und liefert alle Werte als Tabelle', () => {
    const chart = host().querySelector('[role="img"]');
    expect(chart?.getAttribute('aria-label')).toBe('Aufrufe je Zeitabschnitt');
    const rows = [...host().querySelectorAll('tbody tr')].map((row) => row.textContent?.trim());
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Donnerstag, 08.10.');
    expect(rows[1]).toContain('50');
  });

  it('blendet die Tabelle auf Wunsch sichtbar ein', () => {
    const table = host().querySelector('[data-reach-chart-table]')!;
    expect(table.classList.contains('sr-only')).toBe(true);
    const toggle = host().querySelector<HTMLButtonElement>('[data-reach-chart-toggle] button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(table.classList.contains('sr-only')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('nennt den Abschnitt unter dem Zeiger und sonst den stärksten Abschnitt', () => {
    const detail = () => host().querySelector('[data-reach-chart-detail]')?.textContent?.trim();
    expect(detail()).toBe('Stärkster Abschnitt: Donnerstag, 08.10. mit 50 Aufrufe');
    fixture.componentInstance.showPoint(0);
    fixture.detectChanges();
    expect(detail()).toBe('Mittwoch, 07.10.: 20 Aufrufe');
    fixture.componentInstance.clearPoint();
    fixture.detectChanges();
    expect(detail()).toBe('Stärkster Abschnitt: Donnerstag, 08.10. mit 50 Aufrufe');
  });

  it('zeigt bei lauter Nullwerten einen ruhigen Hinweis statt eines stärksten Abschnitts', () => {
    fixture.componentRef.setInput(
      'points',
      points.map((point) => ({ ...point, value: 0 })),
    );
    fixture.detectChanges();
    expect(host().querySelector('[data-reach-chart-detail]')?.textContent?.trim()).toBe(
      'Im gewählten Zeitraum gab es keine neuen Aufrufe.',
    );
  });
});
```

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.angular.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

- [ ] **Step 4: Komponente schreiben**

`vinted-reach-chart.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LoggerService } from '../../../../core/services/logger.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { REVENUE_CHART_LOADER } from '../../../../shared/components/revenue-chart/revenue-chart.component';
import {
  RevenueChartRenderer,
  type RevenueChartStatus,
} from '../../../../shared/components/revenue-chart/revenue-chart.renderer';
import {
  createVintedReachChartConfiguration,
  type VintedReachChartPoint,
} from '../../models/vinted-reach-chart.config';
import { formatCount } from '../../models/vinted-statistics-overview';

/** Säulendiagramm für Aufrufe oder Favoriten mit vollständiger Tabelle als Alternative. */
@Component({
  selector: 'app-vinted-reach-chart',
  imports: [ButtonComponent],
  templateUrl: './vinted-reach-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedReachChartComponent {
  readonly points = input.required<readonly VintedReachChartPoint[]>();
  readonly seriesName = input.required<string>();
  readonly chartElement = viewChild<ElementRef<HTMLDivElement>>('chart');
  readonly chartStatus = signal<RevenueChartStatus>('loading');
  readonly tableVisible = signal(false);
  private readonly activeIndex = signal<number | null>(null);
  private readonly prefersReducedMotion = signal(false);
  private readonly themeService = inject(ThemeService);
  private readonly logger = inject(LoggerService);
  private readonly load = inject(REVENUE_CHART_LOADER);
  private readonly destroyRef = inject(DestroyRef);
  private renderer?: RevenueChartRenderer;

  readonly configuration = computed(() =>
    createVintedReachChartConfiguration(
      this.points(),
      this.seriesName(),
      this.themeService.currentTheme(),
      this.prefersReducedMotion(),
    ),
  );
  readonly rows = computed(() =>
    this.points().map((point) => ({ ...point, formatted: formatCount(point.value) })),
  );
  readonly detail = computed(() => {
    const points = this.points();
    const index = this.activeIndex();
    const active = index === null ? null : points[index];
    if (active) return `${active.description}: ${formatCount(active.value)} ${this.seriesName()}`;
    const peak = points.reduce<VintedReachChartPoint | null>(
      (best, point) => (point.value > (best?.value ?? 0) ? point : best),
      null,
    );
    return peak
      ? `Stärkster Abschnitt: ${peak.description} mit ${formatCount(peak.value)} ${this.seriesName()}`
      : `Im gewählten Zeitraum gab es keine neuen ${this.seriesName()}.`;
  });

  constructor() {
    effect(() => {
      const configuration = this.configuration();
      this.activeIndex.set(null);
      void this.renderer?.update(configuration);
    });
    afterNextRender(() => {
      if (typeof window.matchMedia === 'function')
        this.prefersReducedMotion.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const element = this.chartElement()?.nativeElement;
      if (!element) return;
      this.renderer = new RevenueChartRenderer(element, this.load, (status, error) => {
        this.chartStatus.set(status);
        if (error) this.logger.error('Diagramm konnte nicht geladen werden!', error);
      });
      void this.renderer.update(this.configuration());
    });
    this.destroyRef.onDestroy(() => {
      this.renderer?.destroy();
      this.renderer = undefined;
    });
  }

  toggleTable(): void {
    this.tableVisible.update((visible) => !visible);
  }
  showPoint(index: number): void {
    this.activeIndex.set(index >= 0 && index < this.points().length ? index : null);
  }
  clearPoint(): void {
    this.activeIndex.set(null);
  }
  handlePointer(event: PointerEvent): void {
    const chart = this.chartElement()?.nativeElement;
    const count = this.points().length;
    if (!chart || !count) return;
    const bounds = (chart.querySelector('.apexcharts-grid') ?? chart).getBoundingClientRect();
    const position = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    this.showPoint(Math.min(count - 1, Math.max(0, Math.floor(position * count))));
  }
  retryChart(): void {
    // Browser behalten fehlgeschlagene ES-Modul-Imports im Modulcache.
    if (this.renderer?.reloadRequired) {
      window.location.reload();
      return;
    }
    void this.renderer?.update(this.configuration());
  }
}
```

Die Testdatei stellt `LoggerService` nicht bereit; ist er `providedIn: 'root'` (prüfen: `grep -n "providedIn" src/app/core/services/logger.service.ts`), ist nichts zu tun. Andernfalls im Test `{ provide: LoggerService, useValue: { error: vi.fn() } }` ergänzen.

`vinted-reach-chart.component.html`:

```html
<div class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p data-reach-chart-detail class="min-w-0 text-[13px] text-fb-text-secondary">{{ detail() }}</p>
    <app-button
      data-reach-chart-toggle
      variant="plain"
      size="slim"
      [ariaExpanded]="tableVisible()"
      ariaControls="vinted-reach-chart-table"
      (clicked)="toggleTable()"
      >{{ tableVisible() ? 'Tabelle ausblenden' : 'Werte als Tabelle anzeigen' }}</app-button
    >
  </div>

  <div class="relative min-h-[320px] w-full min-w-0">
    <div
      #chart
      class="h-[320px] w-full"
      role="img"
      [attr.aria-label]="seriesName() + ' je Zeitabschnitt'"
      aria-describedby="vinted-reach-chart-table"
      [attr.aria-busy]="chartStatus() === 'loading'"
      (pointermove)="handlePointer($event)"
      (pointerdown)="handlePointer($event)"
      (pointerleave)="clearPoint()"
    ></div>
    @if (chartStatus() === 'error') {
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-fb-surface px-4 text-center"
      >
        <p role="alert" class="text-[13px] text-fb-text-secondary">
          Das Diagramm konnte nicht geladen werden. Die Werte stehen weiterhin in der Tabelle.
        </p>
        <app-button (clicked)="retryChart()">Erneut laden</app-button>
      </div>
    }
  </div>

  <div
    id="vinted-reach-chart-table"
    data-reach-chart-table
    class="text-[13px] tabular-nums"
    [class.sr-only]="!tableVisible() && chartStatus() !== 'error'"
    [class.overflow-x-auto]="tableVisible() || chartStatus() === 'error'"
  >
    <table class="w-full text-left">
      <caption class="sr-only">
        {{
          seriesName()
        }}
        je Zeitabschnitt
      </caption>
      <thead class="text-fb-text-secondary">
        <tr>
          <th scope="col" class="py-2 pr-4 font-medium">Zeitabschnitt</th>
          <th scope="col" class="py-2 text-right font-medium">{{ seriesName() }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-fb-line">
        @for (row of rows(); track row.key) {
          <tr>
            <th scope="row" class="py-2 pr-4 font-normal text-fb-text-primary">
              {{ row.description }}
            </th>
            <td class="py-2 text-right text-fb-text-primary">{{ row.formatted }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 5: Tests bestehen lassen**

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.angular.spec.ts > .test.log 2>&1; echo $?` → `0`

- [ ] **Step 6: Commit**

```bash
rm -f .test.log
git add src/app/features/marketplaces/models/vinted-reach-chart.config.ts src/app/features/marketplaces/models/vinted-reach-chart.config.spec.ts src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.ts src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.html src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.angular.spec.ts
git commit -F - <<'EOF'
feat(inventory): add a reach chart for Vinted views and favorites

The hand-drawn wardrobe curve suggested values between measurements
that were never recorded. The new chart shows one bar per time bucket
with ApexCharts, as the design guidelines require for dashboards, and
offers every value as a table that can also be shown visibly. Checked
with the configuration and component tests.
EOF
```

---

### Task 5: Bestenliste

**Files:**
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.ts`
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.html`
- Test: `src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.angular.spec.ts`

**Interfaces:**
- Consumes: `VintedStatisticsTopItem`, `VintedStatisticsMetric`, `rankTopItems`, `formatCount`, `formatPrice` (Task 2); `DataTableComponent`, `ButtonComponent`, `BadgeComponent`, `ProductThumbnailComponent`.
- Produces: `<app-vinted-top-listings [items]="…" [showAccount]="true|false" />`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`vinted-top-listings.component.angular.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import type { VintedStatisticsTopItem } from '../../models/vinted-statistics-overview';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const base: VintedStatisticsTopItem = {
  id: '1',
  connectionId: 'account-a',
  accountName: 'Konto A',
  entryId: 'entry-a',
  title: 'Jacke',
  imageUrl: 'https://images.example.test/a.jpg',
  price: 25,
  currency: 'EUR',
  removedAt: null,
  views: 50,
  favorites: 2,
  totalViews: 155,
  totalFavorites: 18,
};
const items: VintedStatisticsTopItem[] = [
  base,
  {
    ...base,
    id: '2',
    accountName: 'Konto B',
    connectionId: 'account-b',
    entryId: null,
    title: 'Sehr langer Titel '.repeat(20).trim(),
    imageUrl: null,
    price: null,
    removedAt: '2026-10-09T08:00:00Z',
    views: 20,
    favorites: 9,
    totalViews: null,
    totalFavorites: null,
  },
];

describe('VintedTopListingsComponent', () => {
  let fixture: ComponentFixture<VintedTopListingsComponent>;
  let resetBindings: (() => void) | undefined;
  const host = () => fixture.nativeElement as HTMLElement;
  const rows = () => [...host().querySelectorAll('tbody tr')];
  const shared = 'src/app/shared/components';

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedTopListingsComponent,
        path: 'src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.ts',
      },
      { type: DataTableComponent, path: `${shared}/data-table/data-table.component.ts` },
      { type: ButtonComponent, path: `${shared}/button/button.component.ts` },
      { type: BadgeComponent, path: `${shared}/badge/badge.component.ts` },
      {
        type: ProductThumbnailComponent,
        path: `${shared}/product-thumbnail/product-thumbnail.component.ts`,
      },
      {
        type: CustomSearchInputComponent,
        path: `${shared}/custom-search-input/custom-search-input.component.ts`,
      },
      {
        type: TableColumnMenuComponent,
        path: `${shared}/table-column-menu/table-column-menu.component.ts`,
      },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VintedTopListingsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedTopListingsComponent);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  });

  it('sortiert zuerst nach Aufrufen und auf Wunsch nach Favoriten', () => {
    expect(rows()[0].textContent).toContain('Jacke');
    const favorites = host().querySelector<HTMLButtonElement>('[data-sort="favorites"] button')!;
    expect(favorites.getAttribute('aria-pressed')).toBe('false');
    favorites.click();
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('Sehr langer Titel');
    expect(favorites.getAttribute('aria-pressed')).toBe('true');
  });

  it('verlinkt vorhandene Inserate und kennzeichnet verschwundene', () => {
    const link = rows()[0].querySelector('a');
    expect(link?.getAttribute('href')).toBe('/marketplaces/vinted/listings/account-a/entry-a');
    expect(rows()[1].querySelector('a')).toBeNull();
    expect(rows()[1].textContent).toContain('Nicht mehr online');
    expect(rows()[0].textContent).not.toContain('Nicht mehr online');
  });

  it('zeigt fehlenden Preis und fehlende Gesamtwerte lesbar an und kürzt lange Titel', () => {
    expect(rows()[1].textContent).toContain('Preis unbekannt');
    expect(rows()[1].textContent).toContain('—');
    expect(rows()[1].querySelector('[data-top-listing-title]')?.classList.contains('truncate')).toBe(
      true,
    );
  });

  it('zeigt die Kontospalte nur bei allen Konten', () => {
    expect(host().textContent).not.toContain('Konto B');
    fixture.componentRef.setInput('showAccount', true);
    fixture.detectChanges();
    expect([...host().querySelectorAll('thead th')].map((cell) => cell.textContent?.trim())).toContain(
      'Konto',
    );
    expect(rows()[1].textContent).toContain('Konto B');
  });

  it('erklärt eine leere Liste', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();
    expect(host().textContent).toContain('Noch keine Bestenliste');
    expect(host().querySelector('table')).toBeNull();
  });
});
```

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.angular.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

Meldet `prepareMarketplaceRendering` „Nicht zugeordnete Testressource“, fehlt eine Kindkomponente in der Liste; die genannte Datei auf dieselbe Weise ergänzen. Meldet es eine fehlende `.scss`-Datei für eine Komponente ohne Styles, ist das unkritisch – die Datei wird nur gelesen, wenn die Komponente sie referenziert.

- [ ] **Step 2: Komponente schreiben**

`vinted-top-listings.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import {
  formatCount,
  formatPrice,
  rankTopItems,
  type VintedStatisticsMetric,
  type VintedStatisticsTopItem,
} from '../../models/vinted-statistics-overview';

/** Beliebteste Artikel im gewählten Zeitraum, auch wenn sie nicht mehr online sind. */
@Component({
  selector: 'app-vinted-top-listings',
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    DataTableComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-top-listings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedTopListingsComponent {
  readonly items = input.required<readonly VintedStatisticsTopItem[]>();
  readonly showAccount = input(false);
  readonly sortMetric = signal<VintedStatisticsMetric>('views');
  readonly sortOptions: readonly { readonly value: VintedStatisticsMetric; readonly label: string }[] =
    [
      { value: 'views', label: 'Aufrufe' },
      { value: 'favorites', label: 'Favoriten' },
    ];
  readonly rows = computed(() =>
    rankTopItems(this.items(), this.sortMetric()).map((item, index) => ({
      id: item.id,
      rank: index + 1,
      title: item.title,
      imageUrl: item.imageUrl,
      accountName: item.accountName,
      removed: item.removedAt !== null,
      link: item.entryId ? ['/marketplaces/vinted/listings', item.connectionId, item.entryId] : null,
      price: formatPrice(item.price, item.currency),
      views: formatCount(item.views),
      favorites: formatCount(item.favorites),
      totalViews: formatCount(item.totalViews),
      totalFavorites: formatCount(item.totalFavorites),
    })),
  );
  readonly emptyText = computed(() =>
    this.items().length
      ? 'Im gewählten Zeitraum gab es dafür keinen Zuwachs. Wähle die andere Sortierung oder einen längeren Zeitraum.'
      : 'Sobald Deine Inserate im gewählten Zeitraum neue Aufrufe oder Favoriten bekommen, erscheinen sie hier.',
  );

  selectSort(metric: VintedStatisticsMetric): void {
    this.sortMetric.set(metric);
  }
}
```

`vinted-top-listings.component.html`:

```html
<app-data-table
  ariaLabel="Beliebteste Artikel im gewählten Zeitraum"
  [searchEnabled]="false"
  [hasRows]="rows().length > 0"
  emptyTitle="Noch keine Bestenliste"
  [emptyText]="emptyText()"
>
  <div table-filters class="flex flex-wrap items-center gap-1" role="group" aria-label="Sortierung">
    <span class="px-2 text-xs text-fb-text-secondary">Sortieren nach</span>
    @for (option of sortOptions; track option.value) {
      <app-button
        [attr.data-sort]="option.value"
        size="slim"
        [variant]="sortMetric() === option.value ? 'secondary' : 'ghost'"
        [ariaPressed]="sortMetric() === option.value"
        (clicked)="selectSort(option.value)"
        >{{ option.label }}</app-button
      >
    }
  </div>
  <div table-content class="overflow-x-auto">
    <table class="w-full text-left text-[13px]">
      <thead class="bg-fb-well text-fb-text-secondary">
        <tr>
          <th scope="col" class="w-10 px-4 py-3 text-right">Platz</th>
          <th scope="col" class="px-4 py-3">Artikel</th>
          @if (showAccount()) {
            <th scope="col" class="px-4 py-3">Konto</th>
          }
          <th scope="col" class="px-4 py-3 text-right">Preis</th>
          <th scope="col" class="px-4 py-3 text-right">Aufrufe</th>
          <th scope="col" class="px-4 py-3 text-right">Favoriten</th>
          <th scope="col" class="px-4 py-3 text-right">Aufrufe gesamt</th>
          <th scope="col" class="px-4 py-3 text-right">Favoriten gesamt</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-fb-line">
        @for (row of rows(); track row.id) {
          <tr>
            <td class="px-4 py-3 text-right tabular-nums text-fb-text-secondary">{{ row.rank }}</td>
            <td class="max-w-0 px-4 py-3 sm:min-w-64">
              <div class="flex min-w-48 items-center gap-3">
                <app-product-thumbnail class="shrink-0" [src]="row.imageUrl" alt="" size="sm" />
                <div class="min-w-0">
                  @if (row.link; as link) {
                    <a
                      data-top-listing-title
                      [routerLink]="link"
                      class="block truncate rounded-sm font-medium text-fb-text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-primary"
                      >{{ row.title }}</a
                    >
                  } @else {
                    <p data-top-listing-title class="truncate font-medium text-fb-text-primary">
                      {{ row.title }}
                    </p>
                  }
                  @if (row.removed) {
                    <app-badge class="mt-1" tone="neutral">Nicht mehr online</app-badge>
                  }
                </div>
              </div>
            </td>
            @if (showAccount()) {
              <td class="whitespace-nowrap px-4 py-3 text-fb-text-secondary">
                {{ row.accountName }}
              </td>
            }
            <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fb-text-secondary">
              {{ row.price }}
            </td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums text-fb-text-primary">
              {{ row.views }}
            </td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums text-fb-text-primary">
              {{ row.favorites }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-fb-text-secondary">
              {{ row.totalViews }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-fb-text-secondary">
              {{ row.totalFavorites }}
            </td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</app-data-table>
```

Die Titelzelle nutzt `max-w-0` zusammen mit `min-w-48` im inneren Block: So darf der Titel schrumpfen und wird gekürzt, statt die Tabelle zu verbreitern.

- [ ] **Step 3: Tests bestehen lassen**

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.angular.spec.ts > .test.log 2>&1; echo $?` → `0`

- [ ] **Step 4: Commit**

```bash
rm -f .test.log
git add src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.ts src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.html src/app/features/marketplaces/components/vinted-statistics/vinted-top-listings.component.angular.spec.ts
git commit -F - <<'EOF'
feat(inventory): add the top listings table for Vinted statistics

Shows which items gained the most views or favorites in the selected
period. Items that are no longer online stay in the list with a label
and without a link, because their numbers still belong to that period.
Checked with the component tests, including missing image, missing
price and very long titles.
EOF
```

---

### Task 6: Statistikseite, Route, Menü und Seitentitel

**Files:**
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.ts`
- Create: `src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.html`
- Test: `src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.angular.spec.ts`
- Modify: `src/app/features/marketplaces/marketplaces.routes.ts` (vor dem `feedback`-Redirect, Zeile ~109)
- Modify: `src/app/core/config/vinted-workspace-navigation.ts:28` und `vinted-workspace-navigation.spec.ts`
- Modify: `src/app/features/marketplaces/vinted-workspace.component.ts:74-81`

**Interfaces:**
- Consumes: `VintedStatisticsStore` (Task 3), `VintedReachChartComponent` (Task 4), `VintedTopListingsComponent` (Task 5), Hilfsfunktionen aus Task 2.
- Produces: Route `/marketplaces/vinted/statistics`, Selektor `app-vinted-statistics`.

- [ ] **Step 1: Menütest anpassen (schlägt fehl)**

In `src/app/core/config/vinted-workspace-navigation.spec.ts` in der erwarteten Liste nach `'Kleiderschrank',` die Zeile `'Statistik',` einfügen und am Ende des ersten `describe` ergänzen:

```ts
  it('markiert die Statistik nicht als Kleiderschrank', () => {
    const url = '/marketplaces/vinted/statistics';
    expect(isVintedNavigationActive('/marketplaces/vinted/statistics', url)).toBe(true);
    expect(isVintedNavigationActive('/marketplaces/vinted/listings', url)).toBe(false);
  });
```

Run: `npx vitest run --project=node src/app/core/config/vinted-workspace-navigation.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

- [ ] **Step 2: Menü, Route und Seitentitel ergänzen**

`vinted-workspace-navigation.ts`, nach der Zeile mit `label: 'Kleiderschrank'`:

```ts
      { path: '/marketplaces/vinted/statistics', label: 'Statistik', icon: 'barChart' },
```

`marketplaces.routes.ts`, direkt vor `{ path: 'feedback', redirectTo: …`:

```ts
      {
        path: 'statistics',
        loadComponent: () =>
          import('./components/vinted-statistics/vinted-statistics.component').then(
            (m) => m.VintedStatisticsComponent,
          ),
      },
```

`vinted-workspace.component.ts`, nach `showingListings` einfügen und `pageTitle` erweitern:

```ts
  readonly showingStatistics = computed(
    () => this.currentUrl().split(/[?#]/)[0] === '/marketplaces/vinted/statistics',
  );
  readonly pageTitle = computed(() => {
    if (this.showingMessages()) return 'Nachrichten';
    if (this.showingListings()) return 'Kleiderschrank';
    if (this.showingStatistics()) return 'Statistik';
    return 'Vinted';
  });
```

Run: `npx vitest run --project=node src/app/core/config/vinted-workspace-navigation.spec.ts > .test.log 2>&1; echo $?` → `0`

- [ ] **Step 3: Fehlschlagenden Seitentest schreiben**

`vinted-statistics.component.angular.spec.ts`:

```ts
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ThemeService } from '../../../../core/services/theme.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { REVENUE_CHART_LOADER } from '../../../../shared/components/revenue-chart/revenue-chart.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import type { VintedStatisticsOverview } from '../../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedStatisticsStore } from '../../services/vinted-statistics.store';
import { VintedReachChartComponent } from './vinted-reach-chart.component';
import { VintedStatisticsComponent } from './vinted-statistics.component';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const overview: VintedStatisticsOverview = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  range: '7d',
  historyStartsAt: '2026-09-01T10:00:00Z',
  activeCount: 12,
  totals: { views: 1234, favorites: 56 },
  previousTotals: { views: 1000, favorites: 56 },
  buckets: [
    { start: '2026-10-06T22:00:00Z', views: 200, favorites: 6 },
    { start: '2026-10-07T22:00:00Z', views: 1034, favorites: 50 },
  ],
  topItems: [
    {
      id: '1',
      connectionId: 'account-a',
      accountName: 'Konto A',
      entryId: 'entry-a',
      title: 'Jacke',
      imageUrl: null,
      price: 25,
      currency: 'EUR',
      removedAt: null,
      views: 500,
      favorites: 20,
      totalViews: 900,
      totalFavorites: 40,
    },
  ],
};

describe('VintedStatisticsComponent', () => {
  let fixture: ComponentFixture<VintedStatisticsComponent>;
  let resetBindings: (() => void) | undefined;
  const statistics = {
    accountScope: signal<'account' | 'all'>('account'),
    canCombineAccounts: signal(true),
    range: signal<'24h' | '7d' | '30d'>('7d'),
    overview: signal<VintedStatisticsOverview | null>(overview),
    loading: signal(false),
    error: signal<string | null>(null),
    selectAccountScope: vi.fn(),
    selectRange: vi.fn(),
    reload: vi.fn(),
  };
  const account = { canManage: signal(true) };
  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => host().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...host().querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === name,
    )!;
  const shared = 'src/app/shared/components';
  const feature = 'src/app/features/marketplaces/components/vinted-statistics';

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: VintedStatisticsComponent, path: `${feature}/vinted-statistics.component.ts` },
      { type: VintedReachChartComponent, path: `${feature}/vinted-reach-chart.component.ts` },
      { type: VintedTopListingsComponent, path: `${feature}/vinted-top-listings.component.ts` },
      { type: ButtonComponent, path: `${shared}/button/button.component.ts` },
      { type: CardComponent, path: `${shared}/card/card.component.ts` },
      { type: BadgeComponent, path: `${shared}/badge/badge.component.ts` },
      { type: NoticeBannerComponent, path: `${shared}/notice-banner/notice-banner.component.ts` },
      { type: DataTableComponent, path: `${shared}/data-table/data-table.component.ts` },
      {
        type: ProductThumbnailComponent,
        path: `${shared}/product-thumbnail/product-thumbnail.component.ts`,
      },
      {
        type: CustomSearchInputComponent,
        path: `${shared}/custom-search-input/custom-search-input.component.ts`,
      },
      {
        type: TableColumnMenuComponent,
        path: `${shared}/table-column-menu/table-column-menu.component.ts`,
      },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    statistics.accountScope.set('account');
    statistics.canCombineAccounts.set(true);
    statistics.range.set('7d');
    statistics.overview.set(overview);
    statistics.loading.set(false);
    statistics.error.set(null);
    account.canManage.set(true);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [VintedStatisticsComponent],
      providers: [
        provideRouter([]),
        { provide: MarketplaceAccountStore, useValue: account },
        { provide: ThemeService, useValue: { currentTheme: signal('light') } },
        {
          provide: REVENUE_CHART_LOADER,
          useValue: async () => () => ({
            render: vi.fn().mockResolvedValue(undefined),
            updateOptions: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn(),
          }),
        },
      ],
    });
    TestBed.overrideComponent(VintedStatisticsComponent, {
      set: { providers: [{ provide: VintedStatisticsStore, useValue: statistics }] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VintedStatisticsComponent);
    fixture.detectChanges();
  });

  it('zeigt Summen, Vergleich und aktive Inserate', () => {
    expect(text()).toContain('1.234');
    expect(text()).toContain('+23 % gegenüber den 7 Tagen davor');
    expect(text()).toContain('Unverändert gegenüber den 7 Tagen davor');
    expect(text()).toContain('12');
    expect(text()).toContain('Aktive Inserate');
  });

  it('wechselt Konto-Umfang und Zeitraum über gedrückte Tasten', () => {
    expect(button('Dieses Konto').getAttribute('aria-pressed')).toBe('true');
    button('Alle Konten').click();
    expect(statistics.selectAccountScope).toHaveBeenCalledWith('all');
    expect(button('7 Tage').getAttribute('aria-pressed')).toBe('true');
    button('30 Tage').click();
    expect(statistics.selectRange).toHaveBeenCalledWith('30d');
  });

  it('blendet den Konto-Schalter bei nur einem Konto aus', () => {
    statistics.canCombineAccounts.set(false);
    fixture.detectChanges();
    expect(button('Alle Konten')).toBeUndefined();
    expect(button('7 Tage')).toBeDefined();
  });

  it('wechselt das Diagramm zwischen Aufrufen und Favoriten', () => {
    const chart = () => host().querySelector('app-vinted-reach-chart [role="img"]');
    expect(chart()?.getAttribute('aria-label')).toBe('Aufrufe je Zeitabschnitt');
    host().querySelector<HTMLButtonElement>('[data-chart-metric="favorites"] button')!.click();
    fixture.detectChanges();
    expect(chart()?.getAttribute('aria-label')).toBe('Favoriten je Zeitabschnitt');
  });

  it('zeigt die Kontospalte der Bestenliste nur bei allen Konten', () => {
    expect(text()).not.toContain('Konto A');
    statistics.accountScope.set('all');
    fixture.detectChanges();
    expect(text()).toContain('Konto A');
  });

  it('nennt den Beginn der Historie, wenn der Vergleich fehlt', () => {
    statistics.overview.set({
      ...overview,
      previousTotals: null,
      historyStartsAt: '2026-10-05T10:00:00Z',
    });
    fixture.detectChanges();
    expect(text()).toContain('Noch kein Vergleich');
    expect(text()).toContain('Die Messhistorie beginnt am 05.10.2026');
  });

  it('erklärt ein Konto ganz ohne Messungen ohne Beispielzahlen', () => {
    statistics.overview.set({
      ...overview,
      historyStartsAt: null,
      activeCount: 0,
      totals: { views: 0, favorites: 0 },
      previousTotals: null,
      topItems: [],
    });
    fixture.detectChanges();
    expect(text()).toContain('Noch keine Messwerte');
    expect(text()).not.toContain('342');
  });

  it('zeigt Laden und Fehler mit erneutem Versuch', () => {
    statistics.overview.set(null);
    statistics.loading.set(true);
    fixture.detectChanges();
    expect(host().querySelector('[role="status"]')?.textContent).toContain(
      'Statistik wird geladen',
    );
    statistics.loading.set(false);
    statistics.error.set('Die Statistik konnte nicht geladen werden.');
    fixture.detectChanges();
    expect(text()).toContain('Die Statistik konnte nicht geladen werden.');
    button('Erneut versuchen').click();
    expect(statistics.reload).toHaveBeenCalled();
  });

  it('zeigt ohne Verwaltungsrecht nur den Hinweis', () => {
    account.canManage.set(false);
    fixture.detectChanges();
    expect(text()).toContain('Für die Statistik brauchst Du Verwaltungsrechte');
    expect(host().querySelector('app-vinted-reach-chart')).toBeNull();
  });
});
```

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.angular.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

- [ ] **Step 4: Seite schreiben**

`vinted-statistics.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { VintedReachChartPoint } from '../../models/vinted-reach-chart.config';
import {
  VINTED_STATISTICS_RANGES,
  describeChange,
  formatBucketDescription,
  formatBucketLabel,
  formatCount,
  type VintedStatisticsMetric,
} from '../../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedStatisticsStore,
  type VintedStatisticsAccountScope,
} from '../../services/vinted-statistics.store';
import { VintedReachChartComponent } from './vinted-reach-chart.component';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const historyDateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Aufrufe und Favoriten der Vinted-Inserate je Zeitraum, je Konto oder für alle Konten. */
@Component({
  selector: 'app-vinted-statistics',
  imports: [
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    VintedReachChartComponent,
    VintedTopListingsComponent,
  ],
  templateUrl: './vinted-statistics.component.html',
  providers: [VintedStatisticsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 w-full max-w-full space-y-4' },
})
export class VintedStatisticsComponent {
  readonly statistics = inject(VintedStatisticsStore);
  readonly account = inject(MarketplaceAccountStore);
  readonly ranges = VINTED_STATISTICS_RANGES;
  readonly accountScopes: readonly {
    readonly value: VintedStatisticsAccountScope;
    readonly label: string;
  }[] = [
    { value: 'account', label: 'Dieses Konto' },
    { value: 'all', label: 'Alle Konten' },
  ];
  readonly metrics: readonly { readonly value: VintedStatisticsMetric; readonly label: string }[] = [
    { value: 'views', label: 'Aufrufe' },
    { value: 'favorites', label: 'Favoriten' },
  ];
  readonly chartMetric = signal<VintedStatisticsMetric>('views');
  readonly chartMetricLabel = computed(
    () => this.metrics.find((metric) => metric.value === this.chartMetric())!.label,
  );
  readonly tiles = computed(() => {
    const overview = this.statistics.overview();
    if (!overview) return [];
    const range = overview.range;
    const previous = overview.previousTotals;
    return [
      {
        id: 'views',
        label: 'Aufrufe',
        value: formatCount(overview.totals.views),
        note: describeChange(overview.totals.views, previous?.views ?? null, range),
      },
      {
        id: 'favorites',
        label: 'Favoriten',
        value: formatCount(overview.totals.favorites),
        note: describeChange(overview.totals.favorites, previous?.favorites ?? null, range),
      },
      {
        id: 'active',
        label: 'Aktive Inserate',
        value: formatCount(overview.activeCount),
        note: 'Aktuell im Kleiderschrank',
      },
    ];
  });
  readonly chartPoints = computed<readonly VintedReachChartPoint[]>(() => {
    const overview = this.statistics.overview();
    const metric = this.chartMetric();
    return (overview?.buckets ?? []).map((bucket) => ({
      key: bucket.start,
      label: formatBucketLabel(bucket.start, overview!.range),
      description: formatBucketDescription(bucket.start, overview!.range),
      value: bucket[metric],
    }));
  });
  readonly historyNotice = computed(() => {
    const overview = this.statistics.overview();
    if (!overview) return null;
    if (!overview.historyStartsAt)
      return 'Noch keine Messwerte. Die Statistik füllt sich, sobald Dein Konto das nächste Mal aktualisiert wird.';
    return overview.previousTotals
      ? null
      : `Die Messhistorie beginnt am ${historyDateFormat.format(new Date(overview.historyStartsAt))}. Ältere Werte kennt Flipbase nicht; ein Vergleich erscheint, sobald genug Messungen vorliegen.`;
  });

  selectChartMetric(metric: VintedStatisticsMetric): void {
    this.chartMetric.set(metric);
  }
}
```

`vinted-statistics.component.html`:

```html
@if (!account.canManage()) {
  <app-notice-banner
    >Für die Statistik brauchst Du Verwaltungsrechte für dieses Vinted-Konto.</app-notice-banner
  >
} @else {
  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
    @if (statistics.canCombineAccounts()) {
      <div
        class="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-fb-line bg-fb-surface p-1"
        role="group"
        aria-label="Konten für die Statistik"
      >
        @for (option of accountScopes; track option.value) {
          <app-button
            size="slim"
            [variant]="statistics.accountScope() === option.value ? 'secondary' : 'ghost'"
            [ariaPressed]="statistics.accountScope() === option.value"
            (clicked)="statistics.selectAccountScope(option.value)"
            >{{ option.label }}</app-button
          >
        }
      </div>
    }
    <div
      class="ml-auto inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-fb-line bg-fb-surface p-1"
      role="group"
      aria-label="Zeitraum der Statistik"
    >
      @for (option of ranges; track option.value) {
        <app-button
          size="slim"
          [variant]="statistics.range() === option.value ? 'secondary' : 'ghost'"
          [ariaPressed]="statistics.range() === option.value"
          (clicked)="statistics.selectRange(option.value)"
          >{{ option.label }}</app-button
        >
      }
    </div>
  </div>

  @if (statistics.error(); as error) {
    <app-notice-banner announcement="alert"
      ><p>{{ error }}</p>
      <app-button class="mt-2" (clicked)="statistics.reload()">Erneut versuchen</app-button>
    </app-notice-banner>
  } @else if (statistics.overview(); as overview) {
    @if (historyNotice(); as notice) {
      <app-notice-banner>{{ notice }}</app-notice-banner>
    }

    <dl class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
      @for (tile of tiles(); track tile.id) {
        <app-card class="min-w-0">
          <dt class="text-xs font-medium text-fb-text-secondary">{{ tile.label }}</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums text-fb-text-primary">
            {{ tile.value }}
          </dd>
          <dd class="mt-1 text-xs text-fb-text-secondary">{{ tile.note }}</dd>
        </app-card>
      }
    </dl>

    <app-card class="min-w-0">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-fb-text-primary">Verlauf</h2>
        <div class="inline-flex gap-1" role="group" aria-label="Kennzahl im Diagramm">
          @for (metric of metrics; track metric.value) {
            <app-button
              [attr.data-chart-metric]="metric.value"
              size="slim"
              [variant]="chartMetric() === metric.value ? 'secondary' : 'ghost'"
              [ariaPressed]="chartMetric() === metric.value"
              (clicked)="selectChartMetric(metric.value)"
              >{{ metric.label }}</app-button
            >
          }
        </div>
      </div>
      <app-vinted-reach-chart [points]="chartPoints()" [seriesName]="chartMetricLabel()" />
    </app-card>

    <section class="min-w-0 space-y-2" aria-labelledby="vinted-top-listings-heading">
      <h2 id="vinted-top-listings-heading" class="text-sm font-semibold text-fb-text-primary">
        Beliebteste Artikel
      </h2>
      <app-vinted-top-listings
        [items]="overview.topItems"
        [showAccount]="statistics.accountScope() === 'all'"
      />
    </section>
  } @else if (statistics.loading()) {
    <p role="status" class="text-[13px] text-fb-text-secondary">Statistik wird geladen …</p>
  }
}
```

Prüfen, dass `app-card` beliebigen Inhalt projiziert (`grep -n "ng-content" src/app/shared/components/card/card.component.html`). Umschließt die Karte den Inhalt mit einem Element, das `dt`/`dd` als direkte Kinder von `dl` verhindert, statt `dl`/`dt`/`dd` einfache `div`/`p` verwenden und der Zeile `role="group"` mit `aria-label="Kennzahlen"` geben – die AXE-Prüfung in Task 7 deckt das auf.

- [ ] **Step 5: Tests und Bau**

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-statistics > .test.log 2>&1; echo $?` → `0`
Run: `npm run typecheck > .types.log 2>&1; echo $?` → `0`
Run: `npm run build > .build.log 2>&1; echo $?` → `0` (prüft die Vorlagen; `tsc` allein tut das nicht)

- [ ] **Step 6: Commit**

```bash
rm -f .test.log .types.log .build.log
git add src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.ts src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.html src/app/features/marketplaces/components/vinted-statistics/vinted-statistics.component.angular.spec.ts src/app/features/marketplaces/marketplaces.routes.ts src/app/core/config/vinted-workspace-navigation.ts src/app/core/config/vinted-workspace-navigation.spec.ts src/app/features/marketplaces/vinted-workspace.component.ts
git commit -F - <<'EOF'
feat(inventory): add a dedicated Vinted statistics page

Statistics above the wardrobe pushed the listings down and had no room
for a ranking. They get their own menu entry and page with switches for
account scope and period, three tiles, the reach chart and the top
listings. Missing history is stated plainly instead of showing sample
numbers. Checked with component tests, typecheck and a production build.
EOF
```

---

### Task 7: Erfundenes Diagramm aus dem Kleiderschrank entfernen, E2E anpassen

**Files:**
- Delete: `src/app/features/marketplaces/components/vinted-wardrobe-statistics/` (vier Dateien)
- Delete: `src/app/features/marketplaces/models/vinted-wardrobe-statistics.ts`, `…/vinted-wardrobe-statistics.spec.ts`
- Modify: `src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.html:5`
- Modify: `src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.ts:22,35`
- Modify: `src/app/features/marketplaces/vinted-workspace.component.angular.spec.ts:31,201-204`
- Modify: `e2e/vinted-workspace-ui.spec.ts`

- [ ] **Step 1: Test, der das Fehlen im Kleiderschrank festhält (schlägt fehl)**

In `src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.angular.spec.ts` am Dateiende ergänzen:

```ts
it('bindet keine Statistik mehr in den Kleiderschrank ein', async () => {
  const { readFile } = await import('node:fs/promises');
  const template = await readFile(
    'src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.html',
    'utf8',
  );
  expect(template).not.toContain('app-vinted-wardrobe-statistics');
});
```

Run: `npx vitest run --project=angular src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.angular.spec.ts > .test.log 2>&1; echo $?` → ungleich 0.

- [ ] **Step 2: Einbindung und Dateien entfernen**

`vinted-listings.component.html`: die Zeile

```html
  <app-vinted-wardrobe-statistics [items]="publications.items" [totalCount]="publications.total" />
```

löschen.

`vinted-listings.component.ts`: die Import-Zeile `import { VintedWardrobeStatisticsComponent } from '../vinted-wardrobe-statistics/vinted-wardrobe-statistics.component';` und den Eintrag `VintedWardrobeStatisticsComponent,` in `imports` löschen.

`vinted-workspace.component.angular.spec.ts`: die Import-Zeile (Zeile 31) und den Block

```ts
    {
      type: VintedWardrobeStatisticsComponent,
      path: 'src/app/features/marketplaces/components/vinted-wardrobe-statistics/vinted-wardrobe-statistics.component.ts',
    },
```

löschen.

```bash
git rm -r src/app/features/marketplaces/components/vinted-wardrobe-statistics
git rm src/app/features/marketplaces/models/vinted-wardrobe-statistics.ts src/app/features/marketplaces/models/vinted-wardrobe-statistics.spec.ts
```

Run: `grep -rn "wardrobe-statistics\|WardrobeStatistics" src e2e scripts; echo $?` → `1` (keine Treffer)

- [ ] **Step 3: E2E – Menüliste und Statistikseite**

In `e2e/vinted-workspace-ui.spec.ts`:

**a)** In der erwarteten Menüliste (`toHaveText([...])`, um Zeile 337) nach `'Kleiderschrank',` die Zeile `'Statistik',` einfügen.

**b)** Direkt nach dem vorhandenen `page.route('**/rest/v1/rpc/marketplace_read_listing_metric_changes', …)`-Block einfügen:

```ts
      await page.route(
        '**/rest/v1/rpc/marketplace_read_listing_statistics_overview',
        (route) => {
          const body = route.request().postDataJSON();
          expect(body['p_workspace_id']).toBe(workspaceId);
          const days = body['p_period'] === '24h' ? 24 : body['p_period'] === '7d' ? 7 : 30;
          const step = body['p_period'] === '24h' ? 3_600_000 : 86_400_000;
          const end = Date.parse('2026-10-01T22:00:00Z');
          return route.fulfill({
            json: {
              workspaceId,
              connectionId: body['p_connection_id'] ?? null,
              period: body['p_period'],
              historyStartsAt: '2026-08-01T10:00:00Z',
              activeCount: 2,
              totals: { views: 1234, favorites: 56 },
              previousTotals: { views: 1000, favorites: 50 },
              buckets: Array.from({ length: days }, (_, index) => ({
                start: new Date(end - (days - 1 - index) * step).toISOString(),
                views: index * 3,
                favorites: index % 4,
              })),
              topItems: [
                {
                  id: '1',
                  connectionId: body['p_connection_id'] ?? 'removed-account',
                  accountName: 'Testkonto A',
                  entryId: null,
                  title: 'Sehr langer Titel eines nicht mehr vorhandenen Testartikels '.repeat(4),
                  imageUrl: null,
                  price: null,
                  currency: null,
                  removedAt: '2026-09-30T08:00:00Z',
                  views: 500,
                  favorites: 20,
                  totalViews: 900,
                  totalFavorites: null,
                },
              ],
            },
          });
        },
      );
```

**c)** Direkt vor der Zeile `await openVintedSection(page, 'Kleiderschrank', width);` (um Zeile 394) einfügen:

```ts
      await openVintedSection(page, 'Statistik', width);
      const statisticsPage = page.locator('app-vinted-statistics');
      await expect(statisticsPage).toContainText('1.234');
      await expect(statisticsPage).toContainText('+23 % gegenüber den 7 Tagen davor');
      await expect(statisticsPage).toContainText('Nicht mehr online');
      await expect(statisticsPage.locator('.apexcharts-canvas')).toBeVisible();
      await statisticsPage.getByRole('button', { name: '30 Tage', exact: true }).click();
      await expect(
        statisticsPage.getByRole('button', { name: '30 Tage', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await checkSurface(page, 'app-vinted-statistics');
      await screenshot(page, `vinted-statistics-${width}-${theme}`);
```

`checkSurface` führt AXE auf der Seite aus und schlägt fehl, wenn etwas waagerecht über den Bildschirm hinausragt (Review Focus 4).

Run: `npx playwright test e2e/vinted-workspace-ui.spec.ts > .e2e.log 2>&1; echo $?` → `0`

Meldet AXE einen Verstoß, die Ursache in der Vorlage beheben (nicht die Prüfung lockern). Typische Kandidaten: `dl` mit fremden Kindern (siehe Hinweis in Task 6), fehlender Kontrast bei `text-fb-text-secondary` auf `bg-fb-well`.

- [ ] **Step 4: Betroffene Tests, Format, Lint, Bau**

Run: `npx vitest run --project=angular src/app/features/marketplaces > .test.log 2>&1; echo $?` → `0`
Run: `npx vitest run --project=node src/app/features/marketplaces src/app/core/config > .test-node.log 2>&1; echo $?` → `0`
Run: `npx prettier --check src/app/features/marketplaces src/app/core/config e2e/vinted-workspace-ui.spec.ts supabase docs > .format.log 2>&1; echo $?` → `0` (sonst `npx prettier --write` auf die gemeldeten Dateien)
Run: `npx eslint src/app/features/marketplaces src/app/core/config e2e/vinted-workspace-ui.spec.ts > .lint.log 2>&1; echo $?` → `0`
Run: `npm run typecheck > .types.log 2>&1; echo $?` → `0`
Run: `npm run test:audit > .audit.log 2>&1; echo $?` → `0`
Run: `npm run build > .build.log 2>&1; echo $?` → `0`

- [ ] **Step 5: Im Browser ansehen**

Dev-Server über die Vorschau starten (`preview_start` mit dem Eintrag aus `.claude/launch.json`; fehlt er, anlegen mit `npm`/`["start"]`), `/marketplaces/vinted/statistics` öffnen und prüfen: Menüpunkt „Statistik“ unter „Kleiderschrank“, Schalter reagieren, Diagramm zeichnet Säulen in Gelb, Bestenliste lesbar, Kleiderschrank zeigt keine Kacheln und kein Diagramm mehr, Konsole ohne Fehler. Helles und dunkles Design sowie 390 px Breite ansehen und je einen Screenshot festhalten.

- [ ] **Step 6: Änderungsprotokoll und Commit**

In `docs/AI-CHANGELOG.md` den Eintrag „Entwurf für eine eigene Vinted-Statistikseite“ durch den vollständigen Sitzungseintrag ersetzen (Überschrift `## 2026-10-11 – Juna – Eigene Vinted-Statistikseite mit echten Messwerten`, Abschnitte **Auftrag**, **Befund**, **Änderung**, **Prüfung** mit den tatsächlich ausgeführten Befehlen und Ergebnissen).

```bash
rm -f .test.log .test-node.log .format.log .lint.log .types.log .audit.log .build.log .e2e.log
git add -A src/app/features/marketplaces e2e/vinted-workspace-ui.spec.ts docs/AI-CHANGELOG.md
git commit -F - <<'EOF'
refactor(inventory): remove the simulated statistics from the wardrobe

The wardrobe chart spread the current totals over fixed weekday weights,
fell back to sample numbers and printed a hard-coded best time, so it
looked like a measurement without being one. The statistics page now
covers this with real data, and the wardrobe keeps only the per-listing
change counters. The browser test opens the new page, checks it with
axe and for horizontal overflow at desktop and phone width.
EOF
```

- [ ] **Step 7: Abschlussfrage**

Im Chat genau fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“ – und auf die Antwort warten.
