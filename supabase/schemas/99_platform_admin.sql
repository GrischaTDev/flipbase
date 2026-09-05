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
    created_at timestamptz not null default now(),
    consent_at timestamptz not null default now()
);

comment on table public.beta_applications is
    'Bewerbungen um einen Beta-Zugang. Wird ausschliesslich durch die Edge Function beta-application beschrieben.';

comment on column public.beta_applications.granted_days is
    'Bewilligte Laufzeit in Tagen. Steht hier und nicht in einer Einladungstabelle, weil sie zwischen Freigabe und Registrierung ueberleben muss - Supabase verwaltet den Einladungslink, aber nichts Fachliches dazu.';

comment on column public.beta_applications.consent_at is
    'Zeitpunkt der Einwilligung, ausdruecklich von der Edge Function beta-application gesetzt (Nachweispflicht nach Art. 7 Abs. 1 DSGVO). Der Wortlaut der Einwilligung selbst wird nicht zusaetzlich gespeichert - er steht in der Versionsgeschichte von landing/index.html.';

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

-- Entscheidet in einem Schritt, ob eine Bewerbung angenommen werden darf.
--
-- Vorher zaehlte die Edge Function erst und schrieb dann - drei getrennte
-- Aufrufe. Zwei gleichzeitige Anfragen sahen denselben Stand und kamen beide
-- durch, bevor der jeweilige Eintrag sichtbar war; die Grenze liess sich so um
-- einige Anfragen ueberschreiten.
--
-- Die Sperre gilt fuer den gesamten Riegel, nicht je Streuwert. Nur so ist auch
-- die Gesamtgrenze genau: Zwei Anfragen mit verschiedenen Streuwerten wuerden
-- sonst denselben Gesamtstand sehen. Dass damit alle Aufrufe nacheinander
-- laufen, kostet nichts - der Durchsatz ist ohnehin durch die Grenzen selbst
-- auf wenige Aufrufe je Stunde gedeckelt.
--
-- pg_advisory_xact_lock haengt an der Transaktion und loest sich von selbst,
-- auch wenn der Aufruf scheitert. Eine Sitzungssperre koennte bei einem Abbruch
-- haengen bleiben und den Endpunkt dauerhaft blockieren.
--
-- Rueckgabe ist ein Wahrheitswert und kein Grund: Der Aufrufer beantwortet jede
-- Abweisung ohnehin mit 429, und ein feinerer Wert waere eine Auskunft darueber,
-- wie nah jemand an der Grenze steht.
create or replace function public.beta_application_attempt(
    p_origin_hash text,
    p_max_per_origin integer,
    p_max_total integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seit timestamptz := now() - interval '1 hour';
  v_je_herkunft integer;
  v_gesamt integer;
begin
  -- Feste Kennzahl, weil der Riegel als Ganzes serialisiert wird. Sie ist frei
  -- gewaehlt und muss nur im Projekt eindeutig bleiben.
  perform pg_advisory_xact_lock(4711000001);

  -- Aufraeumen zuerst: Der Tabellenkommentar verspricht 24 Stunden, und ohne
  -- Scheduler ist dieser Aufruf die einzige Gelegenheit dazu. Nebenbei
  -- verkleinert es die Menge, ueber die gleich gezaehlt wird.
  delete from public.beta_application_attempts
  where created_at < now() - interval '24 hours';

  select count(*) into v_gesamt
  from public.beta_application_attempts
  where created_at >= v_seit;

  if v_gesamt >= p_max_total then
    return false;
  end if;

  select count(*) into v_je_herkunft
  from public.beta_application_attempts
  where origin_hash = p_origin_hash
    and created_at >= v_seit;

  if v_je_herkunft >= p_max_per_origin then
    return false;
  end if;

  insert into public.beta_application_attempts (origin_hash) values (p_origin_hash);
  return true;
end;
$$;

comment on function public.beta_application_attempt(text, integer, integer) is
    'Prueft beide Drosselungsgrenzen und traegt den Versuch ein - atomar, damit gleichzeitige Anfragen die Grenze nicht gemeinsam ueberschreiten. Nur fuer den Dienstschluessel.';

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

revoke all on function public.beta_application_attempt(text, integer, integer)
    from public, anon, authenticated;
