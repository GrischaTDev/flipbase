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
    consent_at timestamptz not null default now(),
    receipt_email_status text not null default 'pending'
        check (receipt_email_status in ('pending', 'sent', 'failed')),
    receipt_email_sent_at timestamptz,
    receipt_email_last_error text,
    auth_user_id uuid unique references auth.users (id) on delete set null,
    invitation_status text not null default 'not_sent'
        check (invitation_status in ('not_sent', 'sending', 'sent', 'failed')),
    invitation_sent_at timestamptz,
    invitation_last_error text,
    registered_at timestamptz
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

-- Der aktuelle Zugang eines Arbeitsbereichs.
--
-- Eine Lizenz beantwortet nur, ob und wie lange der Arbeitsbereich Zugang
-- erhaelt. Ein spaeteres Abo und Rechnungen bleiben eigene Fachobjekte und
-- werden nicht in die Bewerbung geschrieben.
create table if not exists public.workspace_licenses (
    workspace_id uuid primary key references public.workspaces (id) on delete cascade,
    beta_application_id uuid unique references public.beta_applications (id) on delete set null,
    access_source text not null default 'beta'
        check (access_source in ('beta', 'subscription', 'manual')),
    status text not null default 'pending'
        check (status in ('pending', 'active', 'expired', 'suspended')),
    granted_days integer not null check (granted_days between 1 and 3650),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at is null or starts_at is not null),
    check (
        access_source <> 'beta'
        or status = 'pending'
        or (starts_at is not null and ends_at is not null)
    )
);

comment on table public.workspace_licenses is
    'Aktueller Zugang eines Arbeitsbereichs. Beta-Laufzeiten bleiben von spaeteren Abonnements und Rechnungen getrennt.';

alter table public.workspace_licenses enable row level security;

create policy "Betreiber sehen Lizenzen" on public.workspace_licenses
    for select to authenticated
    using (public.is_platform_operator());

create policy "Mitglieder sehen eigene Lizenz" on public.workspace_licenses
    for select to authenticated
    using ((select public.is_workspace_member(workspace_id)));

-- Betreiberentscheidungen laufen ueber Funktionen statt direkter
-- Tabellenupdates aus dem Browser. So lassen sich Zustand und Laufzeit nicht
-- unabhaengig voneinander schreiben.
create or replace function public.accept_beta_application(
    p_application_id uuid,
    p_granted_days integer
)
returns public.beta_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Beta-Bewerbungen annehmen'
      using errcode = '42501';
  end if;

  if p_granted_days is null or p_granted_days not between 1 and 3650 then
    raise exception 'Die Beta-Laufzeit muss zwischen 1 und 3650 Tagen liegen'
      using errcode = '22023';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Beta-Bewerbung nicht gefunden' using errcode = 'P0002';
  end if;

  if v_application.status <> 'open' then
    raise exception 'Nur offene Beta-Bewerbungen koennen angenommen werden'
      using errcode = '22023';
  end if;

  update public.beta_applications
  set status = 'accepted',
      granted_days = p_granted_days,
      decided_by = (select auth.uid()),
      decided_at = now(),
      invitation_status = 'sending',
      invitation_last_error = null
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

create or replace function public.reject_beta_application(
    p_application_id uuid
)
returns public.beta_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Beta-Bewerbungen ablehnen'
      using errcode = '42501';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Beta-Bewerbung nicht gefunden' using errcode = 'P0002';
  end if;

  if v_application.status <> 'open' then
    raise exception 'Nur offene Beta-Bewerbungen koennen abgelehnt werden'
      using errcode = '22023';
  end if;

  update public.beta_applications
  set status = 'rejected',
      granted_days = null,
      decided_by = (select auth.uid()),
      decided_at = now(),
      invitation_status = 'not_sent',
      invitation_last_error = null
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

-- Der Basistrigger legt fuer jeden Auth-Nutzer Profil, Workspace und
-- Standardquellen an. Eine vom Betreiber erzeugte Beta-Einladung traegt
-- zusaetzlich die Bewerbungs-ID in den Metadaten; nur eine angenommene
-- Bewerbung mit derselben E-Mail darf dadurch verknuepft werden.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Erst die erfolgreiche Passwortvergabe startet die Beta. Wiederholte Aufrufe
-- liefern dieselben Zeitpunkte zurueck und verschieben das Ende nicht.
create or replace function public.activate_beta_access()
returns setof public.workspace_licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
  v_license public.workspace_licenses;
  v_started_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and auth_user.raw_user_meta_data->>'beta_registration_completed' = 'true'
  ) then
    raise exception 'Die Registrierung ist noch nicht abgeschlossen'
      using errcode = '22023';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.auth_user_id = (select auth.uid())
    and application.status = 'accepted'
  for update;

  if not found then
    return;
  end if;

  select license.*
  into v_license
  from public.workspace_licenses as license
  where license.beta_application_id = v_application.id
  for update;

  if not found then
    raise exception 'Ausstehende Beta-Lizenz nicht gefunden' using errcode = 'P0002';
  end if;

  if v_license.status = 'pending' then
    update public.workspace_licenses
    set status = 'active',
        starts_at = v_started_at,
        ends_at = v_started_at + make_interval(days => granted_days),
        updated_at = v_started_at
    where workspace_id = v_license.workspace_id
    returning * into v_license;
  end if;

  update public.beta_applications
  set registered_at = coalesce(registered_at, v_license.starts_at)
  where id = v_application.id;

  return next v_license;
end;
$$;

-- Eine bewusst schmale Betreiberansicht verbindet Konten, Arbeitsbereiche,
-- Bewerbungen und den aktuellen Zugang. Zahlungsdaten gehoeren spaeter in
-- eigene Tabellen und werden hier nicht vorweggenommen.
create or replace function public.list_platform_users()
returns table (
  user_id uuid,
  full_name text,
  email text,
  workspace_id uuid,
  workspace_name text,
  application_status text,
  invitation_status text,
  registered_at timestamptz,
  license_status text,
  beta_starts_at timestamptz,
  beta_ends_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Plattformnutzer auflisten'
      using errcode = '42501';
  end if;

  return query
  select
    auth_user.id as user_id,
    coalesce(
      nullif(btrim(concat_ws(' ', application.first_name, application.last_name)), ''),
      nullif(btrim(profile.full_name), ''),
      split_part(auth_user.email, '@', 1)
    ) as full_name,
    coalesce(auth_user.email, profile.email, application.email)::text as email,
    membership.workspace_id,
    workspace.name as workspace_name,
    application.status as application_status,
    application.invitation_status,
    application.registered_at,
    license.status as license_status,
    license.starts_at as beta_starts_at,
    license.ends_at as beta_ends_at
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  left join public.beta_applications as application on application.auth_user_id = auth_user.id
  left join lateral (
    select member.workspace_id
    from public.workspace_members as member
    where member.user_id = auth_user.id
    order by member.created_at, member.id
    limit 1
  ) as membership on true
  left join public.workspaces as workspace on workspace.id = membership.workspace_id
  left join public.workspace_licenses as license on license.workspace_id = membership.workspace_id
  order by coalesce(application.registered_at, auth_user.created_at) desc, auth_user.id;
end;
$$;

comment on function public.list_platform_users() is
    'Liefert Betreibern eine verknuepfte Nutzer-, Bewerbungs- und Zugangsuebersicht ohne Zahlungsdaten.';

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
  v_since timestamptz := now() - interval '1 hour';
  v_per_origin integer;
  v_total integer;
begin
  -- Feste Kennzahl, weil der Riegel als Ganzes serialisiert wird. Sie ist frei
  -- gewaehlt und muss nur im Projekt eindeutig bleiben.
  perform pg_advisory_xact_lock(4711000001);

  -- Aufraeumen zuerst: Der Tabellenkommentar verspricht 24 Stunden, und ohne
  -- Scheduler ist dieser Aufruf die einzige Gelegenheit dazu. Nebenbei
  -- verkleinert es die Menge, ueber die gleich gezaehlt wird.
  delete from public.beta_application_attempts
  where created_at < now() - interval '24 hours';

  select count(*) into v_total
  from public.beta_application_attempts
  where created_at >= v_since;

  if v_total >= p_max_total then
    return false;
  end if;

  select count(*) into v_per_origin
  from public.beta_application_attempts
  where origin_hash = p_origin_hash
    and created_at >= v_since;

  if v_per_origin >= p_max_per_origin then
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
revoke all on table public.workspace_licenses from anon, public;
revoke all on table public.workspace_licenses from authenticated;

grant select on table public.platform_operators to authenticated;
grant select on table public.beta_applications to authenticated;
grant select on table public.workspace_licenses to authenticated;

revoke all on function public.is_platform_operator() from public, anon;
grant execute on function public.is_platform_operator() to authenticated;

revoke all on function public.beta_application_attempt(text, integer, integer)
    from public, anon, authenticated;

revoke all on function public.accept_beta_application(uuid, integer)
    from public, anon;
grant execute on function public.accept_beta_application(uuid, integer)
    to authenticated;

revoke all on function public.reject_beta_application(uuid)
    from public, anon;
grant execute on function public.reject_beta_application(uuid)
    to authenticated;

revoke all on function public.activate_beta_access()
    from public, anon;
grant execute on function public.activate_beta_access()
    to authenticated;

revoke all on function public.list_platform_users()
    from public, anon;
grant execute on function public.list_platform_users()
    to authenticated;
