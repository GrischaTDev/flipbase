-- Zweck: Verknuepft Beta-Bewerbungen mit Einladungen, Auth-Nutzern und zeitlich begrenzten Workspace-Zugaengen.
-- Betroffen: public.beta_applications, public.workspace_licenses sowie die zugehoerigen Betreiber- und Aktivierungsfunktionen.
-- Vom deklarativen Schemaabgleich erzeugt und auf die fachlich zugehoerigen Aenderungen begrenzt.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.accept_beta_application (
  p_application_id uuid,
  p_granted_days   integer
)
  RETURNS public.beta_applications
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.accept_beta_application(uuid, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.accept_beta_application(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.accept_beta_application(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE FUNCTION public.reject_beta_application (
  p_application_id uuid
)
  RETURNS public.beta_applications
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.reject_beta_application(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reject_beta_application(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reject_beta_application(uuid) TO service_role;

ALTER TABLE public.beta_applications
  ADD COLUMN receipt_email_status text DEFAULT 'pending'::text NOT NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_receipt_email_status_check CHECK (receipt_email_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE public.beta_applications
  ADD COLUMN receipt_email_sent_at timestamp with time zone;

ALTER TABLE public.beta_applications
  ADD COLUMN receipt_email_last_error text;

ALTER TABLE public.beta_applications
  ADD COLUMN auth_user_id uuid;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE public.beta_applications
  ADD COLUMN invitation_status text DEFAULT 'not_sent'::text NOT NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_invitation_status_check CHECK (invitation_status = ANY (ARRAY['not_sent'::text, 'sending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE public.beta_applications
  ADD COLUMN invitation_sent_at timestamp with time zone;

ALTER TABLE public.beta_applications
  ADD COLUMN invitation_last_error text;

ALTER TABLE public.beta_applications
  ADD COLUMN registered_at timestamp with time zone;

REVOKE UPDATE ON public.beta_applications FROM authenticated;

CREATE TABLE public.workspace_licenses (
  workspace_id        uuid                     NOT NULL,
  beta_application_id uuid,
  access_source       text                     DEFAULT 'beta'::text NOT NULL,
  status              text                     DEFAULT 'pending'::text NOT NULL,
  granted_days        integer                  NOT NULL,
  starts_at           timestamp with time zone,
  ends_at             timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

CREATE FUNCTION public.activate_beta_access()
  RETURNS SETOF public.workspace_licenses
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_application public.beta_applications;
  v_license public.workspace_licenses;
  v_started_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
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
$function$;

REVOKE ALL ON FUNCTION public.activate_beta_access() FROM PUBLIC;

GRANT ALL ON FUNCTION public.activate_beta_access() TO authenticated;

GRANT ALL ON FUNCTION public.activate_beta_access() TO service_role;

COMMENT ON TABLE public.workspace_licenses IS 'Aktueller Zugang eines Arbeitsbereichs. Beta-Laufzeiten bleiben von spaeteren Abonnements und Rechnungen getrennt.';

ALTER TABLE public.workspace_licenses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_access_source_check CHECK (access_source = ANY (ARRAY['beta'::text, 'subscription'::text, 'manual'::text]));

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_beta_application_id_fkey FOREIGN KEY (beta_application_id) REFERENCES public.beta_applications(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_beta_application_id_key UNIQUE (beta_application_id);

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_check CHECK (ends_at IS NULL OR starts_at IS NOT NULL);

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_check1 CHECK (access_source <> 'beta'::text OR status = 'pending'::text OR starts_at IS NOT NULL AND ends_at IS NOT NULL);

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_granted_days_check CHECK (granted_days >= 1 AND granted_days <= 3650);

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_pkey PRIMARY KEY (workspace_id);

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_status_check CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'suspended'::text]));

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

REVOKE ALL ON public.workspace_licenses FROM anon, public;

REVOKE ALL ON public.workspace_licenses FROM authenticated;

GRANT SELECT ON public.workspace_licenses TO authenticated;

GRANT ALL ON public.workspace_licenses TO service_role;

CREATE POLICY "Betreiber sehen Lizenzen" ON public.workspace_licenses
  FOR SELECT
  TO authenticated
  USING (public.is_platform_operator());

CREATE POLICY "Mitglieder sehen eigene Lizenz" ON public.workspace_licenses
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_workspace_member(workspace_licenses.workspace_id) AS is_workspace_member));
