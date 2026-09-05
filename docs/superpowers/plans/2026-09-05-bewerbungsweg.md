# Bewerbungsweg für Beta-Zugänge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Interessent bewirbt sich über die Landing Page, und der Betreiber sieht die Bewerbung in Flipbase und entscheidet darüber.

**Architecture:** Die Bewerbungstabelle ist für `anon` und `authenticated` vollständig gesperrt; geschrieben wird ausschließlich durch eine Edge Function mit Dienstschlüssel, die vorher prüft und pro Herkunft drosselt. Der Betreiber liest und entscheidet über eine eigene Rolle, die per RLS durchgesetzt wird — der Routen-Wächter im Frontend dient nur der Bedienbarkeit.

**Tech Stack:** Supabase (Postgres 17, RLS, pgTAP, Deno Edge Functions), Angular 22 mit Signals und Standalone Components, Tailwind, statische Landing Page mit eingebettetem JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-05-betreiberbereich-und-beta-zugaenge-design.md`

**Branch:** `feature/platform-admin-beta-access` (existiert bereits, Basis-Commit `d3af32d`)

## Global Constraints

- **Niemals im Namen der KI committen.** Keine `Co-Authored-By`-Zeile, keine andere Assistenten-Signatur. Autor ist ausschließlich der Nutzer.
- **Commit-Nachrichten auf Englisch**, Conventional Commits, Titel im Imperativ. Gültiger Scope hier: `auth`. Der Body erklärt das Warum und was geprüft wurde.
- **Bezeichner im Code englisch**, Kommentare und Oberflächentexte deutsch.
- **Kein `supabase/schemas/database.sql` anfassen** — daran arbeitet ein anderer Assistent.
- **Migrations werden erzeugt, nicht von Hand geschrieben:** `npx supabase stop`, dann `npx supabase db diff -f <name>`. **Die erzeugte Datei danach lesen** — der Abgleich erfasst nicht jede Änderung, insbesondere keine Tabellenrechte.
- **Rechte sind erst nach `npx supabase db reset` aussagekräftig.** Ein Zustand direkt nach `db diff` ist eine Mischform und beweist nichts.
- **Exitcode nie durch eine Pipe messen.** Richtig: `npm run verify > log 2>&1; echo $?`.
- **Datenbanktests immer über `npm run test:db`**, nie `npx supabase test db` direkt — sonst fehlt der Vorbereitungsschritt `pretest:db` und erzeugte Include-Dateien fehlen.
- **Jede neue Tabelle braucht RLS**, separate Policy je Operation und Rolle, immer `TO`, immer `(select auth.uid())`, kein `FOR ALL`.
- **SQL-Funktionen:** `set search_path = ''`, vollqualifizierte Namen, explizite Typen.
- **Der Service-Role-Key darf nie in einen Frontend-Bau geraten.**
- **Testsuiten-Konvention:** `*.spec.ts` läuft im Node-Lauf und darf **kein** `TestBed`, `document`, `window`, `localStorage` o. Ä. benutzen; `*.angular.spec.ts` ist der TestBed-Lauf; `*.dom.spec.ts` der jsdom-Lauf. `scripts/test-suite-audit.mjs` erzwingt das.
- **Eintrag in `docs/AI-CHANGELOG.md`** am Ende, Format siehe Dateikopf dort.

## File Structure

| Datei                                                                                           | Verantwortung                                                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `supabase/schemas/96_platform_admin.sql`                                                        | **Neu.** Betreiberrolle, Bewerbungstabelle, Drosselungstabelle, Rechte |
| `supabase/config.toml:67`                                                                       | **Ändern.** Neue Schemadatei in `schema_paths` aufnehmen               |
| `supabase/tests/platform_admin.sql`                                                             | **Neu.** pgTAP: Spalten, RLS, Rechte, Rekursionsfreiheit               |
| `supabase/functions/beta-application/index.ts`                                                  | **Neu.** Prüfung, Drosselung, Schreiben mit Dienstschlüssel            |
| `landing/index.html`                                                                            | **Ändern.** Beide Beta-Formulare zu echten Bewerbungsformularen        |
| `scripts/landing-page.test.mjs`                                                                 | **Ändern.** Erwartungen an die Formularfelder nachziehen               |
| `src/app/core/services/platform-operator.service.ts`                                            | **Neu.** Beantwortet „ist der angemeldete Nutzer Betreiber?"           |
| `src/app/core/guards/operator.guard.ts`                                                         | **Neu.** Routen-Wächter für `/admin`                                   |
| `src/app/features/platform-admin/platform-admin.routes.ts`                                      | **Neu.** Routen des Bereichs                                           |
| `src/app/features/platform-admin/services/beta-application.service.ts`                          | **Neu.** Laden und Entscheiden                                         |
| `src/app/features/platform-admin/models/beta-application.model.ts`                              | **Neu.** Typen des Bereichs                                            |
| `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.{ts,html}` | **Neu.** Die Bewerbungsliste                                           |
| `src/app/app.routes.ts`                                                                         | **Ändern.** `/admin` einhängen                                         |
| `src/app/layout/sidebar/sidebar.component.{ts,html}`                                            | **Ändern.** Menüpunkt nur für Betreiber                                |

**Bindende Trennung:** `features/platform-admin/` darf ausschließlich aus `core/` und `shared/` importieren, niemals aus einem anderen Feature. Nur so bleibt ein späterer Umzug in eine eigene Anwendung ein Verschieben.

---

### Task 1: Betreiberrolle, Bewerbungstabelle und Rechte

**Files:**

- Create: `supabase/schemas/96_platform_admin.sql`
- Modify: `supabase/config.toml:67`
- Test: `supabase/tests/platform_admin.sql`
- Create (erzeugt): `supabase/migrations/<zeitstempel>_platform_admin.sql`

**Interfaces:**

- Produces: Tabellen `public.platform_operators`, `public.beta_applications`, `public.beta_application_attempts`; Funktion `public.is_platform_operator() returns boolean`.
- Consumes: nichts.

- [ ] **Step 1: Schemadatei anlegen**

Erstelle `supabase/schemas/96_platform_admin.sql`:

```sql
-- Betreiberbereich: Rolle, Bewerbungen, Drosselung.
--
-- Die Ladereihenfolge ist bindend und steht in supabase/config.toml. Diese
-- Datei verweist auf auth.users und kommt deshalb nach database.sql.

-- Betreiber gelten quer ueber alle Arbeitsbereiche.
--
-- Bewusst eine eigene Tabelle statt eines Feldes am Profil: Eine Rolle mit
-- dieser Reichweite soll man an einer Stelle sehen und entziehen koennen.
-- Eingetragen wird ausschliesslich von Hand oder mit Dienstschluessel - es
-- gibt absichtlich keine Schreib-Policy.
create table if not exists public.platform_operators (
    user_id uuid primary key references auth.users (id) on delete cascade,
    note text,
    created_at timestamptz not null default now()
);

comment on table public.platform_operators is
    'Betreiber der Plattform. Gilt arbeitsbereichsuebergreifend und wird nur von Hand oder mit Dienstschluessel gepflegt.';

alter table public.platform_operators enable row level security;

-- Jeder sieht hoechstens den eigenen Eintrag.
--
-- Bewusst nicht ueber is_platform_operator(): Eine Policy auf dieser Tabelle,
-- die eine Funktion aufruft, welche dieselbe Tabelle liest, waere eine
-- Endlosschleife, sobald die Funktion nicht mit security definer laeuft. Der
-- direkte Vergleich ist einfacher und beantwortet die einzige Frage, die das
-- Frontend hier stellt: Bin ich Betreiber?
create policy "Eigenen Betreibereintrag lesen" on public.platform_operators
    for select to authenticated
    using (user_id = (select auth.uid()));

-- Ist der angemeldete Nutzer Betreiber?
--
-- security definer, weil die Funktion in Policies anderer Tabellen benutzt
-- wird und dort an der eigenen RLS von platform_operators haengen bliebe.
create or replace function public.is_platform_operator()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1
        from public.platform_operators as operator
        where operator.user_id = (select auth.uid())
    );
$$;

comment on function public.is_platform_operator() is
    'Wahr, wenn der angemeldete Nutzer in platform_operators steht. security definer, damit die Funktion in Policies anderer Tabellen benutzbar ist.';

-- Bewerbungen fuer die Beta.
--
-- Eine Bewerbung ist kein Konto: Sie kommt von jemandem, den es im System noch
-- nicht gibt. Als "inaktives Konto" angelegt haetten wir Karteileichen in der
-- Anmeldung und muessten ueberall pruefen, ob ein Konto echt ist.
create table if not exists public.beta_applications (
    id uuid primary key default gen_random_uuid(),
    first_name text not null check (length(btrim(first_name)) between 1 and 100),
    last_name text not null check (length(btrim(last_name)) between 1 and 100),
    email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
    granted_days integer check (granted_days is null or granted_days between 1 and 3650),
    decision_note text,
    decided_by uuid references auth.users (id) on delete set null,
    decided_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.beta_applications is
    'Bewerbungen um einen Beta-Zugang. Wird ausschliesslich durch die Edge Function beta-application beschrieben.';

comment on column public.beta_applications.granted_days is
    'Bewilligte Laufzeit in Tagen. Steht hier und nicht in einer Einladungstabelle, weil sie zwischen Freigabe und Registrierung ueberleben muss - Supabase verwaltet den Einladungslink, aber nichts Fachliches dazu.';

-- Dieselbe Adresse bewirbt sich nur einmal. Ohne diesen Riegel fuellt ein
-- Doppelklick die Liste mit Dubletten, und eine abgelehnte Bewerbung taucht
-- nach jedem neuen Versuch wieder als offen auf.
create unique index if not exists idx_beta_applications_email
    on public.beta_applications (lower(email));

create index if not exists idx_beta_applications_status
    on public.beta_applications (status, created_at desc);

alter table public.beta_applications enable row level security;

create policy "Betreiber sehen Bewerbungen" on public.beta_applications
    for select to authenticated
    using (public.is_platform_operator());

create policy "Betreiber entscheiden ueber Bewerbungen" on public.beta_applications
    for update to authenticated
    using (public.is_platform_operator())
    with check (public.is_platform_operator());

-- Wer entschieden hat und wann, wird gestempelt statt uebermittelt.
--
-- Das Frontend darf beides nicht setzen: Sonst traegt der Browser ein, wer
-- angeblich entschieden hat, und der Zeitstempel kaeme von einer fremden Uhr.
create or replace function public.stamp_beta_application_decision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$$;

create trigger stamp_beta_application_decision
    before update on public.beta_applications
    for each row
    execute function public.stamp_beta_application_decision();

-- Drosselung der Bewerbungen je Herkunft.
--
-- Gespeichert wird ein Streuwert der IP-Adresse, nicht die Adresse selbst: Zum
-- Zaehlen genuegt die Wiedererkennung, und eine Tabelle voller IP-Adressen von
-- Interessenten waere Personenbezug ohne Zweck.
create table if not exists public.beta_application_attempts (
    id bigint generated always as identity primary key,
    origin_hash text not null,
    created_at timestamptz not null default now()
);

comment on table public.beta_application_attempts is
    'Zaehlwerk fuer die Drosselung der Bewerbungen. Enthaelt Streuwerte statt IP-Adressen und wird nach 24 Stunden aufgeraeumt.';

create index if not exists idx_beta_application_attempts_window
    on public.beta_application_attempts (origin_hash, created_at desc);

alter table public.beta_application_attempts enable row level security;

-- Absichtlich keine Policy: Nur der Dienstschluessel schreibt und liest hier.

revoke all on table public.platform_operators from anon, public;
revoke all on table public.platform_operators from authenticated;
revoke all on table public.beta_applications from anon, public;
revoke all on table public.beta_applications from authenticated;
revoke all on table public.beta_application_attempts from anon, public;
revoke all on table public.beta_application_attempts from authenticated;

grant select on table public.platform_operators to authenticated;
grant select, update on table public.beta_applications to authenticated;

revoke all on function public.is_platform_operator() from public, anon;
grant execute on function public.is_platform_operator() to authenticated;
```

- [ ] **Step 2: Schemadatei in die Ladereihenfolge aufnehmen**

In `supabase/config.toml`, Zeile 67, `"./schemas/96_platform_admin.sql"` an das Ende der Liste anfügen:

```toml
schema_paths = ["./schemas/database.sql", "./schemas/50_sniper.sql", "./schemas/60_audit_snapshot.sql", "./schemas/70_realtime_sessions.sql", "./schemas/80_workspace_retention.sql", "./schemas/90_release_permissions.sql", "./schemas/95_purchase_cost_repair.sql", "./schemas/96_platform_admin.sql"]
```

- [ ] **Step 3: Den fehlschlagenden Test schreiben**

Erstelle `supabase/tests/platform_admin.sql`:

```sql
\set ON_ERROR_STOP on

begin;

select plan(7);

-- Spalten von beta_applications
do $$
declare
  required_columns text[] := array[
    'id', 'first_name', 'last_name', 'email', 'status', 'granted_days',
    'decision_note', 'decided_by', 'decided_at', 'created_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'beta_applications'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'beta_applications fehlen Spalten: %', missing_columns;
  end if;
end;
$$;

select pass('beta_applications besitzt alle benoetigten Spalten');

-- RLS ist auf allen drei Tabellen aktiv.
do $$
declare
  ungeschuetzt text[];
begin
  select array_agg(relname order by relname)
  into ungeschuetzt
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname in ('platform_operators', 'beta_applications', 'beta_application_attempts')
    and relrowsecurity = false;

  if ungeschuetzt is not null then
    raise exception 'row level security ist aus auf: %', ungeschuetzt;
  end if;
end;
$$;

select pass('RLS ist auf allen drei Tabellen aktiv');

-- anon haelt auf keiner der drei Tabellen ein Recht.
--
-- Erzeugte Rechte-Anweisungen bilden immer die Maschine ab, auf der sie
-- entstanden sind. Am 04.09.2026 wich die Produktionsdatenbank bei den
-- Sniper-Tabellen genau hier von der lokalen ab.
do $$
declare
  offene text[];
begin
  select array_agg(table_name || '.' || privilege_type order by table_name, privilege_type)
  into offene
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('platform_operators', 'beta_applications', 'beta_application_attempts')
    and grantee = 'anon';

  if offene is not null then
    raise exception 'anon haelt noch Rechte: %', offene;
  end if;
end;
$$;

select pass('anon hat auf keiner Tabelle des Betreiberbereichs ein Recht');

-- authenticated darf genau das Noetige - nicht mehr.
do $$
declare
  rechte text[];
begin
  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'beta_applications'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT', 'UPDATE'] then
    raise exception 'authenticated soll auf beta_applications genau SELECT+UPDATE haben, hat: %', rechte;
  end if;

  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'beta_application_attempts'
    and grantee = 'authenticated';

  if rechte is not null then
    raise exception 'authenticated darf die Drosselungstabelle nicht sehen, hat: %', rechte;
  end if;
end;
$$;

select pass('authenticated darf lesen und entscheiden, aber nicht drosseln');

-- Die Betreiberfunktion laeuft mit security definer.
--
-- Ohne das haengt sie in Policies anderer Tabellen an der eigenen RLS von
-- platform_operators und liefert dort immer falsch.
do $$
begin
  if not exists (
    select 1 from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'is_platform_operator'
      and pg_proc.prosecdef
  ) then
    raise exception 'is_platform_operator muss security definer sein';
  end if;

  if has_function_privilege('anon', 'public.is_platform_operator()', 'execute') then
    raise exception 'anon darf is_platform_operator nicht ausfuehren';
  end if;

  if not has_function_privilege('authenticated', 'public.is_platform_operator()', 'execute') then
    raise exception 'authenticated muss is_platform_operator ausfuehren duerfen';
  end if;
end;
$$;

select pass('Die Betreiberfunktion ist definer und nur fuer Angemeldete');

-- Dieselbe Adresse bewirbt sich nur einmal.
do $$
begin
  insert into public.beta_applications (first_name, last_name, email)
  values ('Anna', 'Beispiel', 'Anna@Example.test');

  begin
    insert into public.beta_applications (first_name, last_name, email)
    values ('Anna', 'Zweitversuch', 'anna@example.test');
    raise exception 'Die zweite Bewerbung derselben Adresse haette scheitern muessen';
  exception
    when unique_violation then null;
  end;
end;
$$;

select pass('Dieselbe Adresse bewirbt sich nur einmal');

-- Die Entscheidung wird gestempelt, nicht uebermittelt.
do $$
declare
  bewerbung_id uuid;
  gestempelt timestamptz;
begin
  insert into public.beta_applications (first_name, last_name, email)
  values ('Bernd', 'Stempel', 'bernd@example.test')
  returning id into bewerbung_id;

  update public.beta_applications
  set status = 'accepted', granted_days = 180, decided_at = null
  where id = bewerbung_id;

  select decided_at into gestempelt
  from public.beta_applications where id = bewerbung_id;

  if gestempelt is null then
    raise exception 'Der Trigger haette decided_at setzen muessen';
  end if;
end;
$$;

select pass('Entscheidungszeitpunkt wird gestempelt, auch wenn null uebergeben wird');

select * from finish();

rollback;
```

- [ ] **Step 4: Test laufen lassen und Fehlschlag sehen**

```bash
npm run test:db > /tmp/db1.log 2>&1; echo $?
```

Erwartung: Exitcode 1, im Protokoll `relation "public.beta_applications" does not exist`.

- [ ] **Step 5: Migration erzeugen**

```bash
npx supabase stop --no-backup
npx supabase db diff -f platform_admin
```

- [ ] **Step 6: Die erzeugte Migration lesen**

```bash
cat supabase/migrations/*_platform_admin.sql
```

Prüfen und im Kopf abhaken:

- Alle drei Tabellen, beide Indexe, die Funktion und die Policies sind enthalten
- Es steht **kein** `begin`, `commit`, `rollback` und kein `\`-Befehl darin (Bedingung des Release-Wegs)
- Kein `create index concurrently`
- Rechte: `db diff` überträgt Tabellenrechte **nicht** zuverlässig. Fehlen `revoke`/`grant`-Zeilen, ist das erwartbar — Schritt 8 deckt es auf.

- [ ] **Step 7: Frisch einspielen und Tests laufen lassen**

```bash
npx supabase start
npx supabase db reset > /tmp/reset.log 2>&1; echo $?
npm run test:db > /tmp/db2.log 2>&1; echo $?
```

Erwartung: beide Exitcodes 0, im Testprotokoll `All tests successful.`

- [ ] **Step 8: Rechte aus der eingespielten Datenbank zurücklesen**

```bash
docker exec -i supabase_db_flipbase-supabase psql -U postgres -d postgres -tAc "
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('platform_operators','beta_applications','beta_application_attempts')
  and grantee in ('anon','authenticated')
group by table_name, grantee order by table_name, grantee;"
```

Erwartung genau:

```
beta_applications|authenticated|SELECT,UPDATE
platform_operators|authenticated|SELECT
```

Steht dort eine Zeile mit `anon`, oder fehlt eine der beiden, schreibe eine **handgeschriebene** Migration `supabase/migrations/<zeitstempel+1>_platform_admin_grants.sql`, die die Rechte namentlich setzt — mit Kopfkommentar, warum der Abgleich sie nicht mitgenommen hat — und wiederhole Schritt 7.

- [ ] **Step 9: Typen neu erzeugen**

```bash
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
grep -c "beta_applications\|platform_operators" src/app/core/models/supabase.types.ts
```

Erwartung: Zahl größer 0.

- [ ] **Step 10: Commit**

```bash
git add supabase/schemas/96_platform_admin.sql supabase/config.toml supabase/tests/platform_admin.sql supabase/migrations src/app/core/models/supabase.types.ts
git commit -m "feat(auth): add operator role and beta application table"
```

Der Body erklärt, warum die Bewerbungstabelle für beide Rollen gesperrt ist, warum die Betreiberfunktion `security definer` ist, und nennt die zurückgelesenen Rechte.

---

### Task 2: Edge Function mit Prüfung und Drosselung

**Files:**

- Create: `supabase/functions/beta-application/index.ts`

**Interfaces:**

- Consumes: `public.beta_applications`, `public.beta_application_attempts` aus Task 1.
- Produces: HTTP-Endpunkt `POST /functions/v1/beta-application` mit Rumpf `{ firstName, lastName, email, consent }`, Antwort `{ ok: true }` bei Annahme, `{ error: string }` sonst.

- [ ] **Step 1: Die Funktion schreiben**

Erstelle `supabase/functions/beta-application/index.ts`:

```ts
// Supabase Edge Function: beta-application
//
// Nimmt Bewerbungen von der Landing Page entgegen. Die Tabelle ist fuer anon
// und authenticated vollstaendig gesperrt; geschrieben wird ausschliesslich
// hier, mit Dienstschluessel und erst nach Pruefung. Ein offen beschreibbarer
// Endpunkt im Netz wird sonst zuverlaessig vollgemuellt.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

/** Herkuenfte, die diese Funktion aufrufen duerfen. */
const ERLAUBTE_HERKUENFTE = new Set(
  (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'https://flipbase.de,https://www.flipbase.de,http://localhost:4200'
  )
    .split(',')
    .map((herkunft) => herkunft.trim())
    .filter(Boolean),
);

/** Hoechstzahl Bewerbungen je Herkunft und Stunde. */
const HOECHSTZAHL_JE_STUNDE = 5;

function corsKopf(herkunft: string | null): Record<string, string> {
  const kopf: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (herkunft && ERLAUBTE_HERKUENFTE.has(herkunft)) {
    kopf['Access-Control-Allow-Origin'] = herkunft;
  }
  return kopf;
}

function antwort(daten: unknown, status: number, herkunft: string | null): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { ...corsKopf(herkunft), 'Content-Type': 'application/json' },
  });
}

/**
 * Streuwert der Herkunft.
 *
 * Zum Zaehlen genuegt die Wiedererkennung. Eine Tabelle voller IP-Adressen von
 * Interessenten waere Personenbezug ohne Zweck, deshalb wird gestreut - mit
 * einem Serverschluessel, damit der Wert nicht durch Ausprobieren aller
 * IP-Adressen zurueckgerechnet werden kann.
 */
async function herkunftsStreuwert(adresse: string): Promise<string> {
  const pfeffer = Deno.env.get('BETA_APPLICATION_PEPPER') ?? '';
  const rohdaten = new TextEncoder().encode(`${pfeffer}:${adresse}`);
  const streuwert = await crypto.subtle.digest('SHA-256', rohdaten);
  return Array.from(new Uint8Array(streuwert))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function istText(wert: unknown, hoechstlaenge: number): wert is string {
  return typeof wert === 'string' && wert.trim().length > 0 && wert.trim().length <= hoechstlaenge;
}

const EMAIL_MUSTER = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

Deno.serve(async (anfrage: Request) => {
  const herkunft = anfrage.headers.get('origin');

  if (anfrage.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsKopf(herkunft) });
  }

  if (anfrage.method !== 'POST') {
    return antwort({ error: 'method_not_allowed' }, 405, herkunft);
  }

  if (!herkunft || !ERLAUBTE_HERKUENFTE.has(herkunft)) {
    return antwort({ error: 'origin_not_allowed' }, 403, herkunft);
  }

  let rumpf: Record<string, unknown>;
  try {
    rumpf = (await anfrage.json()) as Record<string, unknown>;
  } catch {
    return antwort({ error: 'invalid_body' }, 400, herkunft);
  }

  const { firstName, lastName, email, consent } = rumpf;

  if (consent !== true) {
    return antwort({ error: 'consent_required' }, 400, herkunft);
  }
  if (!istText(firstName, 100) || !istText(lastName, 100)) {
    return antwort({ error: 'name_invalid' }, 400, herkunft);
  }
  if (!istText(email, 320) || !EMAIL_MUSTER.test(email.trim())) {
    return antwort({ error: 'email_invalid' }, 400, herkunft);
  }

  const dienst = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const adresse = anfrage.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unbekannt';
  const streuwert = await herkunftsStreuwert(adresse);
  const seit = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: zaehlfehler } = await dienst
    .from('beta_application_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('origin_hash', streuwert)
    .gte('created_at', seit);

  if (zaehlfehler) {
    return antwort({ error: 'internal' }, 500, herkunft);
  }
  if ((count ?? 0) >= HOECHSTZAHL_JE_STUNDE) {
    return antwort({ error: 'too_many_requests' }, 429, herkunft);
  }

  await dienst.from('beta_application_attempts').insert({ origin_hash: streuwert });

  const { error: schreibfehler } = await dienst.from('beta_applications').insert({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
  });

  // Eine bereits vorhandene Adresse wird wie ein Erfolg beantwortet. Sonst
  // liesse sich ueber das Formular herausfinden, wer sich beworben hat.
  if (schreibfehler && schreibfehler.code !== '23505') {
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  return antwort({ ok: true }, 200, herkunft);
});
```

- [ ] **Step 2: Funktion lokal starten**

In einem zweiten Terminal. Der Port stammt aus `supabase/config.toml`
(`api.port`), nicht aus der Supabase-Voreinstellung 54321. Die CLI ab 2.114
nimmt bei `functions serve` keinen Funktionsnamen mehr entgegen und bedient
alle Funktionen unter ihrem eigenen Pfad:

```bash
npx supabase functions serve --no-verify-jwt
```

- [ ] **Step 3: Gültige Bewerbung prüfen**

```bash
curl -s -o /tmp/ok.json -w "%{http_code}\n" -X POST \
  http://127.0.0.1:54351/functions/v1/beta-application \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:4200' \
  -d '{"firstName":"Anna","lastName":"Beispiel","email":"anna@example.test","consent":true}'
cat /tmp/ok.json
```

Erwartung: `200` und `{"ok":true}`.

- [ ] **Step 4: Die Ablehnungen prüfen**

```bash
# Fremde Herkunft
curl -s -o /dev/null -w "fremd: %{http_code}\n" -X POST \
  http://127.0.0.1:54351/functions/v1/beta-application \
  -H 'Content-Type: application/json' -H 'Origin: https://boese.example' \
  -d '{"firstName":"A","lastName":"B","email":"a@b.test","consent":true}'

# Ohne Einwilligung
curl -s -o /dev/null -w "ohne Einwilligung: %{http_code}\n" -X POST \
  http://127.0.0.1:54351/functions/v1/beta-application \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:4200' \
  -d '{"firstName":"A","lastName":"B","email":"a@b.test","consent":false}'

# Kaputte Adresse
curl -s -o /dev/null -w "Adresse kaputt: %{http_code}\n" -X POST \
  http://127.0.0.1:54351/functions/v1/beta-application \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:4200' \
  -d '{"firstName":"A","lastName":"B","email":"keine-adresse","consent":true}'
```

Erwartung: `fremd: 403`, `ohne Einwilligung: 400`, `Adresse kaputt: 400`.

- [ ] **Step 5: Drosselung prüfen**

```bash
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST \
    http://127.0.0.1:54351/functions/v1/beta-application \
    -H 'Content-Type: application/json' -H 'Origin: http://localhost:4200' \
    -d "{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"drossel$i@example.test\",\"consent\":true}"
done
```

Erwartung: die ersten Versuche `200`, ab dem sechsten `429`.

- [ ] **Step 6: Die Tabelle gegenlesen**

```bash
docker exec -i supabase_db_flipbase-supabase psql -U postgres -d postgres -tAc \
  "select first_name, last_name, email, status from public.beta_applications order by created_at;"
```

Erwartung: die angenommenen Bewerbungen mit Status `open`, keine mit fremder Herkunft.

- [ ] **Step 7: Testdaten wieder entfernen**

```bash
docker exec -i supabase_db_flipbase-supabase psql -U postgres -d postgres -c \
  "delete from public.beta_applications where email like '%@example.test'; delete from public.beta_application_attempts;"
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/beta-application/index.ts
git commit -m "feat(auth): accept beta applications through a throttled edge function"
```

Der Body nennt die gemessenen Statuscodes aus den Schritten 3 bis 5 und begründet den Streuwert statt der IP-Adresse.

---

### Task 3: Bewerbungsformular auf der Landing Page

**Files:**

- Modify: `landing/index.html` (beide `hero-beta-form`-Formulare, Zeilen ~1445 und ~2593)
- Modify: `scripts/landing-page.test.mjs` (Erwartungen an die Formularfelder)

**Interfaces:**

- Consumes: den Endpunkt aus Task 2.
- Produces: nichts für spätere Tasks.

**Wichtig:** Die Landing Page ist zweisprachig. Jeder sichtbare Text braucht ein Paar aus `<span class="lang-de">` und `<span class="lang-en" lang="en">`. `scripts/landing-page.test.mjs` prüft das und verlangt heute **genau zwei** Felder mit `type="email"`.

- [ ] **Step 1: Den fehlschlagenden Test anpassen**

In `scripts/landing-page.test.mjs` den Block ab `const emailInputs = extractStartTags(html, 'input')` ersetzen durch:

```js
const emailInputs = extractStartTags(html, 'input').filter(
  (input) => attribute(input, 'type') === 'email',
);
assert.equal(emailInputs.length, 2);
for (const input of emailInputs) {
  const id = attribute(input, 'id');
  assert.ok(id, 'Every email field must have an id for its accessible label');
  assert.equal(attribute(input, 'aria-label'), undefined);
  assertLanguagePair(
    labelElementFor(html, id).content,
    'E-Mail-Adresse für die Beta-Bewerbung',
    'Email address for the beta application',
  );
}

// Vor- und Nachname: je zwei Felder, damit der Betreiber eine Bewerbung
// einer Person zuordnen kann.
for (const feld of [
  {
    teil: 'vorname',
    germanText: 'Vorname',
    englishText: 'First name',
  },
  {
    teil: 'nachname',
    germanText: 'Nachname',
    englishText: 'Last name',
  },
]) {
  const felder = extractStartTags(html, 'input').filter((input) =>
    (attribute(input, 'id') ?? '').includes(feld.teil),
  );
  assert.equal(felder.length, 2, `Expected two ${feld.teil} fields`);
  for (const input of felder) {
    const id = attribute(input, 'id');
    assert.equal(attribute(input, 'required'), '');
    assertLanguagePair(labelElementFor(html, id).content, feld.germanText, feld.englishText);
  }
}

// Ohne Einwilligung darf keine Bewerbung abgeschickt werden.
const einwilligungen = extractStartTags(html, 'input').filter(
  (input) =>
    attribute(input, 'type') === 'checkbox' &&
    (attribute(input, 'id') ?? '').includes('einwilligung'),
);
assert.equal(einwilligungen.length, 2);
for (const input of einwilligungen) {
  assert.equal(attribute(input, 'required'), '');
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

```bash
npm run test:landing > /tmp/landing1.log 2>&1; echo $?
```

Erwartung: Exitcode 1, Meldung über fehlende Vorname-Felder.

- [ ] **Step 3: Beide Formulare umbauen**

Ersetze **beide** Vorkommen von `<form class="hero-beta-form" action="…" method="GET" target="_blank">…</form>`. Für das erste Formular (Hero, ~Zeile 1445) lautet die Fassung:

```html
<form class="hero-beta-form" id="hero-bewerbung-form" novalidate>
  <div class="hero-beta-feld">
    <label for="hero-bewerbung-vorname">
      <span class="lang-de">Vorname</span>
      <span class="lang-en" lang="en">First name</span>
    </label>
    <input
      id="hero-bewerbung-vorname"
      type="text"
      name="firstName"
      class="hero-beta-input"
      maxlength="100"
      required
      autocomplete="given-name"
    />
  </div>
  <div class="hero-beta-feld">
    <label for="hero-bewerbung-nachname">
      <span class="lang-de">Nachname</span>
      <span class="lang-en" lang="en">Last name</span>
    </label>
    <input
      id="hero-bewerbung-nachname"
      type="text"
      name="lastName"
      class="hero-beta-input"
      maxlength="100"
      required
      autocomplete="family-name"
    />
  </div>
  <div class="hero-beta-feld">
    <label for="hero-bewerbung-email">
      <span class="lang-de">E-Mail-Adresse für die Beta-Bewerbung</span>
      <span class="lang-en" lang="en">Email address for the beta application</span>
    </label>
    <input
      id="hero-bewerbung-email"
      type="email"
      name="email"
      class="hero-beta-input"
      placeholder="name@example.com"
      required
      autocomplete="email"
    />
  </div>
  <div class="hero-beta-einwilligung">
    <input id="hero-bewerbung-einwilligung" type="checkbox" name="consent" required />
    <label for="hero-bewerbung-einwilligung">
      <span class="lang-de"
        >Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Bewerbung gespeichert
        werden.</span
      >
      <span class="lang-en" lang="en"
        >I agree that my details may be stored to process this application.</span
      >
    </label>
  </div>
  <button type="submit" class="btn-primary hero-beta-btn">
    <span class="lang-de">Für die Beta bewerben →</span>
    <span class="lang-en" lang="en">Apply for the beta →</span>
  </button>
  <p class="hero-beta-meldung" id="hero-bewerbung-meldung" role="status" aria-live="polite"></p>
</form>
```

Für das zweite Formular dieselbe Struktur mit dem Präfix `zweit-` statt `hero-` in allen vier `id`-Werten und den zugehörigen `for`-Attributen.

- [ ] **Step 4: Das Absenden anbinden**

Vor `</body>` ein `<script>` einfügen:

```html
<script>
  (function () {
    var ENDPUNKT = 'https://api.flipbase.de/functions/v1/beta-application';
    var TEXTE = {
      ok: { de: 'Danke! Wir melden uns.', en: 'Thank you! We will be in touch.' },
      fehler: {
        de: 'Das hat nicht geklappt. Bitte später erneut versuchen.',
        en: 'That did not work. Please try again later.',
      },
      drossel: {
        de: 'Zu viele Versuche. Bitte in einer Stunde erneut versuchen.',
        en: 'Too many attempts. Please try again in an hour.',
      },
    };

    function melde(feld, art) {
      var sprache = document.documentElement.lang === 'en' ? 'en' : 'de';
      feld.textContent = TEXTE[art][sprache];
    }

    ['hero', 'zweit'].forEach(function (praefix) {
      var formular = document.getElementById(praefix + '-bewerbung-form');
      if (!formular) return;
      var meldung = document.getElementById(praefix + '-bewerbung-meldung');

      formular.addEventListener('submit', function (ereignis) {
        ereignis.preventDefault();
        if (!formular.checkValidity()) {
          formular.reportValidity();
          return;
        }
        var knopf = formular.querySelector('button[type="submit"]');
        knopf.disabled = true;

        fetch(ENDPUNKT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: document.getElementById(praefix + '-bewerbung-vorname').value,
            lastName: document.getElementById(praefix + '-bewerbung-nachname').value,
            email: document.getElementById(praefix + '-bewerbung-email').value,
            consent: document.getElementById(praefix + '-bewerbung-einwilligung').checked,
          }),
        })
          .then(function (antwort) {
            if (antwort.ok) {
              melde(meldung, 'ok');
              formular.reset();
            } else {
              melde(meldung, antwort.status === 429 ? 'drossel' : 'fehler');
            }
          })
          .catch(function () {
            melde(meldung, 'fehler');
          })
          .finally(function () {
            knopf.disabled = false;
          });
      });
    });
  })();
</script>
```

- [ ] **Step 5: Test laufen lassen**

```bash
npm run test:landing > /tmp/landing2.log 2>&1; echo $?
```

Erwartung: Exitcode 0.

- [ ] **Step 6: Formatierung und Gesamtlauf**

```bash
npx prettier --write landing/index.html scripts/landing-page.test.mjs
npm run verify > /tmp/verify3.log 2>&1; echo $?
```

Erwartung: Exitcode 0.

- [ ] **Step 7: Commit**

```bash
git add landing/index.html scripts/landing-page.test.mjs
git commit -m "feat(auth): turn the landing beta fields into a real application form"
```

Der Body erklärt, dass die Felder bisher nur in die offene Registrierung weitergeleitet haben und nichts gespeichert wurde.

---

### Task 4: Betreiberbereich mit Bewerbungsliste

**Files:**

- Create: `src/app/core/services/platform-operator.service.ts`
- Test: `src/app/core/services/platform-operator.service.angular.spec.ts`
- Create: `src/app/core/guards/operator.guard.ts`
- Create: `src/app/features/platform-admin/models/beta-application.model.ts`
- Create: `src/app/features/platform-admin/services/beta-application.service.ts`
- Test: `src/app/features/platform-admin/services/beta-application.service.angular.spec.ts`
- Create: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.ts`
- Create: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.html`
- Test: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.angular.spec.ts`
- Create: `src/app/features/platform-admin/platform-admin.routes.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.ts` und `.html`

**Interfaces:**

- Consumes: Tabellen und Funktion aus Task 1.
- Produces: `PlatformOperatorService.isOperator(): Promise<boolean>`; `BetaApplicationService.list(): Promise<BetaApplication[]>` und `.decide(id: string, status: 'accepted' | 'rejected', grantedDays: number | null, note: string | null): Promise<void>`; Typ `BetaApplication`.

- [ ] **Step 1: Den fehlschlagenden Test für die Betreiberprüfung schreiben**

Erstelle `src/app/core/services/platform-operator.service.angular.spec.ts`.

**Warum ein TestBed-Test und kein einfacher:** Der Dienst benutzt `inject()`,
wie die Projektregeln es verlangen. Von Hand instanziiert wirft das
„inject() must be called from an injection context". Damit gehoert die Datei in
den Angular-Lauf und traegt die Endung `.angular.spec.ts` — `scripts/test-suite-audit.mjs`
verbietet TestBed in einer schlichten `.spec.ts`.

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PlatformOperatorService } from './platform-operator.service';
import { SupabaseService } from './supabase.service';

function serviceMit(antwort: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(antwort);
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
  });
  return { service: TestBed.inject(PlatformOperatorService), rpc };
}

describe('PlatformOperatorService', () => {
  it('meldet Betreiber, wenn die Datenbank wahr liefert', async () => {
    const { service, rpc } = serviceMit({ data: true, error: null });

    await expect(service.isOperator()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_platform_operator');
  });

  it('meldet im Fehlerfall keinen Betreiber', async () => {
    // Eine gescheiterte Abfrage darf niemanden zum Betreiber machen. Der
    // Fehlerfall ist die Sperre, nicht die Freigabe.
    const { service } = serviceMit({ data: null, error: { message: 'weg' } });

    await expect(service.isOperator()).resolves.toBe(false);
  });

  it('fragt die Datenbank nur einmal', async () => {
    // Der Wächter und die Seitenleiste fragen beide. Ohne Zwischenspeicher
    // liefe je Navigation eine Abfrage mehr.
    const { service, rpc } = serviceMit({ data: true, error: null });

    await service.isOperator();
    await service.isOperator();

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag sehen**

```bash
npx vitest run --project=angular src/app/core/services/platform-operator.service.angular.spec.ts 2>&1 | tail -5
```

Erwartung: Fehler, dass `./platform-operator.service` nicht gefunden wird.

- [ ] **Step 3: Den Dienst schreiben**

Erstelle `src/app/core/services/platform-operator.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Beantwortet, ob der angemeldete Nutzer Betreiber ist.
 *
 * Die Antwort kommt aus der Datenbank, nicht aus einem Anspruch im Token: Die
 * Befugnis wird ohnehin dort durchgesetzt, und zwei Wahrheiten waeren eine zu
 * viel.
 */
@Injectable({ providedIn: 'root' })
export class PlatformOperatorService {
  private readonly supabase = inject(SupabaseService);
  private pruefung: Promise<boolean> | null = null;

  readonly operator = signal(false);

  isOperator(): Promise<boolean> {
    this.pruefung ??= this.frage();
    return this.pruefung;
  }

  /** Nach einem Rollenwechsel oder einer Abmeldung neu fragen. */
  reset(): void {
    this.pruefung = null;
    this.operator.set(false);
  }

  private async frage(): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('is_platform_operator');
    const istBetreiber = !error && data === true;
    this.operator.set(istBetreiber);
    return istBetreiber;
  }
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
npx vitest run --project=angular src/app/core/services/platform-operator.service.angular.spec.ts 2>&1 | tail -5
```

Erwartung: 3 Tests bestanden. `TestBed.configureTestingModule` muss je Test
neu laufen, damit der Zwischenspeicher-Test wirklich einen frischen Dienst
bekommt.

- [ ] **Step 5: Den Wächter schreiben**

Erstelle `src/app/core/guards/operator.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformOperatorService } from '../services/platform-operator.service';

/**
 * Haelt Nichtbetreiber von /admin fern.
 *
 * Das ist Bedienbarkeit, keine Sicherheit: Die Befugnis liegt in den
 * RLS-Regeln. Ohne sie saehe ein Nichtbetreiber hier nur leere Listen.
 */
export const operatorGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (
    (await inject(PlatformOperatorService).isOperator()) || router.createUrlTree(['/dashboard'])
  );
};
```

- [ ] **Step 6: Das Modell anlegen**

Erstelle `src/app/features/platform-admin/models/beta-application.model.ts`:

```ts
export type BetaApplicationStatus = 'open' | 'accepted' | 'rejected';

export interface BetaApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: BetaApplicationStatus;
  grantedDays: number | null;
  decisionNote: string | null;
  createdAt: string;
}

/** Vorgabe laut Entwurf: sechs Monate. */
export const DEFAULT_GRANTED_DAYS = 180;
```

- [ ] **Step 7: Den fehlschlagenden Test für den Bewerbungsdienst schreiben**

Erstelle `src/app/features/platform-admin/services/beta-application.service.angular.spec.ts`.
Gleiche Begruendung wie in Schritt 1: `inject()` verlangt einen
Einspritzzusammenhang, also TestBed und damit der Angular-Lauf.

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BetaApplicationService } from './beta-application.service';
import { SupabaseService } from '../../../core/services/supabase.service';

function serviceMit(client: unknown): BetaApplicationService {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client } }],
  });
  return TestBed.inject(BetaApplicationService);
}

const zeile = {
  id: 'a1',
  first_name: 'Anna',
  last_name: 'Beispiel',
  email: 'anna@example.test',
  status: 'open',
  granted_days: null,
  decision_note: null,
  created_at: '2026-09-05T08:00:00.000Z',
};

function serviceMitListe(antwort: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(antwort);
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return { service: serviceMit({ from }), from, order };
}

describe('BetaApplicationService', () => {
  it('wandelt die Datenbankzeilen in das Modell um', async () => {
    const { service, from } = serviceMitListe({ data: [zeile], error: null });

    const bewerbungen = await service.list();

    expect(from).toHaveBeenCalledWith('beta_applications');
    expect(bewerbungen).toEqual([
      {
        id: 'a1',
        firstName: 'Anna',
        lastName: 'Beispiel',
        email: 'anna@example.test',
        status: 'open',
        grantedDays: null,
        decisionNote: null,
        createdAt: '2026-09-05T08:00:00.000Z',
      },
    ]);
  });

  it('meldet einen Fehler statt einer leeren Liste', async () => {
    // Eine leere Liste sieht aus wie "keine Bewerbungen" und wuerde eine
    // gestoerte Verbindung als Ruhe ausgeben.
    const { service } = serviceMitListe({ data: null, error: { message: 'weg' } });

    await expect(service.list()).rejects.toThrow('weg');
  });

  it('schreibt die Entscheidung mit Laufzeit und Notiz', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const service = serviceMit({ from });

    await service.decide('a1', 'accepted', 180, 'passt');

    expect(update).toHaveBeenCalledWith({
      status: 'accepted',
      granted_days: 180,
      decision_note: 'passt',
    });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
  });
});
```

- [ ] **Step 8: Test laufen lassen und Fehlschlag sehen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/services/beta-application.service.angular.spec.ts 2>&1 | tail -5
```

Erwartung: Modul nicht gefunden.

- [ ] **Step 9: Den Bewerbungsdienst schreiben**

Erstelle `src/app/features/platform-admin/services/beta-application.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { BetaApplication, BetaApplicationStatus } from '../models/beta-application.model';

/**
 * Laedt Bewerbungen und schreibt Entscheidungen.
 *
 * Angelegt wird hier nichts: Bewerbungen entstehen ausschliesslich in der Edge
 * Function, und die Tabelle hat fuer angemeldete Nutzer keine Insert-Regel.
 */
@Injectable({ providedIn: 'root' })
export class BetaApplicationService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<BetaApplication[]> {
    const { data, error } = await this.supabase.client
      .from('beta_applications')
      .select('id, first_name, last_name, email, status, granted_days, decision_note, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((zeile) => ({
      id: zeile.id as string,
      firstName: zeile.first_name as string,
      lastName: zeile.last_name as string,
      email: zeile.email as string,
      status: zeile.status as BetaApplicationStatus,
      grantedDays: (zeile.granted_days as number | null) ?? null,
      decisionNote: (zeile.decision_note as string | null) ?? null,
      createdAt: zeile.created_at as string,
    }));
  }

  async decide(
    id: string,
    status: Exclude<BetaApplicationStatus, 'open'>,
    grantedDays: number | null,
    note: string | null,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('beta_applications')
      // decided_by und decided_at setzt ein Trigger in der Datenbank. Vom
      // Browser gesetzt waeren beide fälschbar.
      .update({ status, granted_days: grantedDays, decision_note: note })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}
```

- [ ] **Step 10: Test laufen lassen**

```bash
npx vitest run --project=angular src/app/features/platform-admin/services/beta-application.service.angular.spec.ts 2>&1 | tail -5
```

Erwartung: 3 Tests bestanden.

- [ ] **Step 11: Die Seite schreiben**

Erstelle `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.ts`:

```ts
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { BetaApplicationService } from '../../services/beta-application.service';
import { BetaApplication, DEFAULT_GRANTED_DAYS } from '../../models/beta-application.model';

@Component({
  selector: 'app-beta-applications',
  imports: [DatePipe],
  templateUrl: './beta-applications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApplicationsComponent implements OnInit {
  private readonly service = inject(BetaApplicationService);

  readonly applications = signal<readonly BetaApplication[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly grantedDays = signal(DEFAULT_GRANTED_DAYS);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.applications.set(await this.service.list());
    } catch (fehler) {
      this.error.set(fehler instanceof Error ? fehler.message : String(fehler));
    } finally {
      this.loading.set(false);
    }
  }

  async accept(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'accepted', note);
  }

  async reject(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'rejected', note);
  }

  private async decide(
    application: BetaApplication,
    status: 'accepted' | 'rejected',
    note: string,
  ): Promise<void> {
    this.error.set(null);
    try {
      await this.service.decide(
        application.id,
        status,
        status === 'accepted' ? this.grantedDays() : null,
        note.trim() || null,
      );
      await this.load();
    } catch (fehler) {
      this.error.set(fehler instanceof Error ? fehler.message : String(fehler));
    }
  }
}
```

Erstelle `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.html`:

```html
<section class="p-6">
  <h1 class="text-2xl font-semibold mb-1">Bewerbungen</h1>
  <p class="text-sm opacity-70 mb-6">
    Bewerbungen um einen Beta-Zugang. Angenommene Bewerbungen bekommen ihre Einladung im nächsten
    Schritt.
  </p>

  @if (error(); as meldung) {
  <p class="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">{{ meldung }}</p>
  }

  <label class="mb-6 flex items-center gap-2 text-sm">
    <span>Laufzeit bei Annahme (Tage)</span>
    <input
      type="number"
      min="1"
      max="3650"
      class="w-24 rounded-lg border border-white/10 bg-transparent px-2 py-1"
      [value]="grantedDays()"
      (change)="grantedDays.set(+$any($event.target).value)"
    />
  </label>

  @if (loading()) {
  <p class="text-sm opacity-70">Wird geladen …</p>
  } @else if (applications().length === 0) {
  <p class="text-sm opacity-70">Es liegt noch keine Bewerbung vor.</p>
  } @else {
  <table class="w-full text-left text-sm">
    <thead class="opacity-70">
      <tr>
        <th class="py-2">Name</th>
        <th class="py-2">E-Mail</th>
        <th class="py-2">Eingang</th>
        <th class="py-2">Status</th>
        <th class="py-2"></th>
      </tr>
    </thead>
    <tbody>
      @for (application of applications(); track application.id) {
      <tr class="border-t border-white/10">
        <td class="py-2">{{ application.firstName }} {{ application.lastName }}</td>
        <td class="py-2">{{ application.email }}</td>
        <td class="py-2">{{ application.createdAt | date: 'dd.MM.yyyy' }}</td>
        <td class="py-2">{{ application.status }}</td>
        <td class="py-2 text-right">
          @if (application.status === 'open') {
          <!-- Die Notiz wird ueber einen Vorlagenverweis gelesen, statt je
                     Zeile ein Signal zu halten: Sie wird genau einmal gebraucht,
                     im Moment des Klicks. -->
          <input
            #note
            type="text"
            maxlength="500"
            placeholder="Notiz (optional)"
            aria-label="Notiz zur Entscheidung"
            class="mr-2 w-48 rounded-lg border border-white/10 bg-transparent px-2 py-1"
          />
          <button type="button" class="mr-2 underline" (click)="accept(application, note.value)">
            Annehmen
          </button>
          <button type="button" class="underline" (click)="reject(application, note.value)">
            Ablehnen
          </button>
          } @else if (application.decisionNote) {
          <span class="opacity-70">{{ application.decisionNote }}</span>
          }
        </td>
      </tr>
      }
    </tbody>
  </table>
  }
</section>
```

Der Entwurf verlangt, dass eine Entscheidung eine Notiz tragen kann — vor allem
bei einer Ablehnung, damit später nachvollziehbar bleibt, warum jemand nicht
eingeladen wurde.

- [ ] **Step 12: Den Komponententest schreiben**

Erstelle `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.angular.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationsComponent } from './beta-applications.component';
import { BetaApplicationService } from '../../services/beta-application.service';

const bewerbung = {
  id: 'a1',
  firstName: 'Anna',
  lastName: 'Beispiel',
  email: 'anna@example.test',
  status: 'open' as const,
  grantedDays: null,
  decisionNote: null,
  createdAt: '2026-09-05T08:00:00.000Z',
};

describe('BetaApplicationsComponent', () => {
  let list: ReturnType<typeof vi.fn>;
  let decide: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    list = vi.fn().mockResolvedValue([bewerbung]);
    decide = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [BetaApplicationsComponent],
      providers: [{ provide: BetaApplicationService, useValue: { list, decide } }],
    }).compileComponents();
  });

  it('zeigt die geladenen Bewerbungen', async () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Anna Beispiel');
    expect(fixture.nativeElement.textContent).toContain('anna@example.test');
  });

  it('nimmt eine Bewerbung mit der eingestellten Laufzeit an', async () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.accept(bewerbung, '  passt  ');

    // Die Notiz wird beschnitten; eine leere Notiz wird zu null, damit in der
    // Datenbank nicht zwischen "nichts gesagt" und "Leerzeichen" unterschieden
    // werden muss.
    expect(decide).toHaveBeenCalledWith('a1', 'accepted', 180, 'passt');
  });

  it('zeigt einen Ladefehler an, statt eine leere Liste vorzutäuschen', async () => {
    list.mockRejectedValueOnce(new Error('keine Verbindung'));
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('keine Verbindung');
  });
});
```

- [ ] **Step 13: Test laufen lassen**

```bash
npx vitest run --project=angular src/app/features/platform-admin 2>&1 | tail -8
```

Erwartung: 6 Tests bestanden — die drei aus Schritt 7 und die drei dieser Datei.

- [ ] **Step 14: Routen anlegen und einhängen**

Erstelle `src/app/features/platform-admin/platform-admin.routes.ts`:

```ts
import { Routes } from '@angular/router';

export const platformAdminRoutes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  {
    path: 'applications',
    loadComponent: () =>
      import('./pages/beta-applications/beta-applications.component').then(
        (m) => m.BetaApplicationsComponent,
      ),
  },
];
```

In `src/app/app.routes.ts` vor der Auffangroute einfügen:

```ts
  {
    path: 'admin',
    canActivate: [authGuard, operatorGuard],
    loadChildren: () =>
      import('./features/platform-admin/platform-admin.routes').then((m) => m.platformAdminRoutes),
  },
```

und `operatorGuard` aus `./core/guards/operator.guard` importieren.

- [ ] **Step 15: Menüpunkt ergänzen**

In `src/app/layout/sidebar/sidebar.component.ts` ergänzen:

```ts
import { ShieldCheck } from 'lucide-angular';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
```

und in der Klasse:

```ts
  private readonly operatorService = inject(PlatformOperatorService);

  /** Der Menuepunkt erscheint nur fuer Betreiber. */
  readonly isOperator = this.operatorService.operator;

  readonly operatorItem = {
    path: '/admin',
    labelKey: 'NAV.PLATFORM_ADMIN',
    label: 'Betreiber',
    icon: ShieldCheck,
  };

  constructor() {
    // Die Antwort kommt aus der Datenbank und setzt das Signal. Bis dahin
    // bleibt der Punkt verborgen - der Fehlerfall ist "nicht anzeigen".
    void this.operatorService.isOperator();
  }
```

Hat die Klasse bereits einen Konstruktor, den Aufruf dort ans Ende setzen statt
einen zweiten anzulegen.

In `sidebar.component.html` nach dem letzten bestehenden Menüpunkt-Block:

```html
@if (isOperator()) {
<a
  [routerLink]="operatorItem.path"
  routerLinkActive="bg-indigo-500/15 text-fb-text-primary font-semibold border-indigo-500/40"
  class="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2"
>
  <i-lucide [img]="operatorItem.icon" class="h-4 w-4"></i-lucide>
  <span>{{ operatorItem.label }}</span>
</a>
}
```

**Vor dem Übernehmen:** Die Klassen und die Icon-Einbindung an einem
vorhandenen Menüpunkt in derselben Datei abgleichen (Zeilen um 61, 88, 115 und 142) und die dortige Schreibweise übernehmen — sie ist maßgeblich, nicht die
hier gezeigte.

- [ ] **Step 16: Gesamtlauf**

```bash
npm run verify > /tmp/verify4.log 2>&1; echo $?
```

Erwartung: Exitcode 0. `npm run verify` enthält den Bau, der als Einziger Angular-Vorlagen prüft.

- [ ] **Step 17: Von Hand gegenprüfen**

```bash
docker exec -i supabase_db_flipbase-supabase psql -U postgres -d postgres -c \
  "insert into public.platform_operators (user_id) select id from auth.users limit 1;"
```

Dann `npm start`, anmelden, `/admin/applications` aufrufen: Die Bewerbung aus Task 2 muss sichtbar sein und sich annehmen lassen. Danach den Betreibereintrag wieder entfernen und prüfen, dass der Menüpunkt verschwindet und `/admin` auf das Dashboard zurückleitet.

- [ ] **Step 18: Changelog und Commit**

Eintrag in `docs/AI-CHANGELOG.md` nach dem Format im Dateikopf, dann:

```bash
git add src docs/AI-CHANGELOG.md
git commit -m "feat(auth): add the operator area with the beta application list"
```

Der Body erklärt, warum der Wächter nur der Bedienbarkeit dient und die Befugnis in den RLS-Regeln liegt.

---

## Nach dem letzten Task

Vollständige Zweigprüfung vor dem Pull Request:

```bash
npx supabase db reset > /tmp/final-reset.log 2>&1; echo $?
npm run test:db > /tmp/final-db.log 2>&1; echo $?
npm run verify > /tmp/final-verify.log 2>&1; echo $?
```

Alle drei müssen 0 melden. Danach die Rechte ein letztes Mal aus der frisch eingespielten Datenbank zurücklesen (Befehl aus Task 1, Schritt 8) — **nur dann sind sie aussagekräftig**.
