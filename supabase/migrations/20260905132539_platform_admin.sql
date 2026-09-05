-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.is_platform_operator()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    select exists (
        select 1
        from public.platform_operators as operator
        where operator.user_id = (select auth.uid())
    );
$function$;

COMMENT ON FUNCTION public.is_platform_operator() IS 'Wahr, wenn der angemeldete Nutzer in platform_operators steht. security definer, damit die Funktion in Policies anderer Tabellen benutzbar ist.';

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_platform_operator() TO authenticated;

GRANT ALL ON FUNCTION public.is_platform_operator() TO service_role;

CREATE FUNCTION public.stamp_beta_application_decision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status is distinct from old.status then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.stamp_beta_application_decision() TO authenticated;

GRANT ALL ON FUNCTION public.stamp_beta_application_decision() TO service_role;

CREATE TABLE public.beta_application_attempts (
  id          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  origin_hash text                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.beta_application_attempts IS 'Zaehlwerk fuer die Drosselung der Bewerbungen. Enthaelt Streuwerte statt IP-Adressen und wird nach 24 Stunden aufgeraeumt.';

ALTER TABLE public.beta_application_attempts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.beta_application_attempts
  ADD CONSTRAINT beta_application_attempts_pkey PRIMARY KEY (id);

GRANT ALL ON public.beta_application_attempts TO service_role;

CREATE INDEX idx_beta_application_attempts_window ON public.beta_application_attempts (origin_hash, created_at DESC);

CREATE TABLE public.beta_applications (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  first_name    text                     NOT NULL,
  last_name     text                     NOT NULL,
  email         text                     NOT NULL,
  status        text                     DEFAULT 'open'::text NOT NULL,
  granted_days  integer,
  decision_note text,
  decided_by    uuid,
  decided_at    timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.beta_applications IS 'Bewerbungen um einen Beta-Zugang. Wird ausschliesslich durch die Edge Function beta-application beschrieben.';

COMMENT ON COLUMN public.beta_applications.granted_days IS 'Bewilligte Laufzeit in Tagen. Steht hier und nicht in einer Einladungstabelle, weil sie zwischen Freigabe und Registrierung ueberleben muss - Supabase verwaltet den Einladungslink, aber nichts Fachliches dazu.';

ALTER TABLE public.beta_applications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_email_check CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text);

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_first_name_check CHECK (length(btrim(first_name)) >= 1 AND length(btrim(first_name)) <= 100);

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_granted_days_check CHECK (granted_days IS NULL OR granted_days >= 1 AND granted_days <= 3650);

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_last_name_check CHECK (length(btrim(last_name)) >= 1 AND length(btrim(last_name)) <= 100);

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_pkey PRIMARY KEY (id);

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_status_check CHECK (status = ANY (ARRAY['open'::text, 'accepted'::text, 'rejected'::text]));

GRANT SELECT, UPDATE ON public.beta_applications TO authenticated;

GRANT ALL ON public.beta_applications TO service_role;

CREATE UNIQUE INDEX idx_beta_applications_email ON public.beta_applications (lower(email));

CREATE INDEX idx_beta_applications_status ON public.beta_applications (status, created_at DESC);

CREATE TRIGGER stamp_beta_application_decision
  BEFORE UPDATE ON public.beta_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_beta_application_decision();

CREATE POLICY "Betreiber entscheiden ueber Bewerbungen" ON public.beta_applications
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

CREATE POLICY "Betreiber sehen Bewerbungen" ON public.beta_applications
  FOR SELECT
  TO authenticated
  USING (public.is_platform_operator());

CREATE TABLE public.platform_operators (
  user_id    uuid                     NOT NULL,
  note       text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.platform_operators IS 'Betreiber der Plattform. Gilt arbeitsbereichsuebergreifend und wird nur von Hand oder mit Dienstschluessel gepflegt.';

ALTER TABLE public.platform_operators
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_operators
  ADD CONSTRAINT platform_operators_pkey PRIMARY KEY (user_id);

ALTER TABLE public.platform_operators
  ADD CONSTRAINT platform_operators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON public.platform_operators TO authenticated;

GRANT ALL ON public.platform_operators TO service_role;

CREATE POLICY "Eigenen Betreibereintrag lesen" ON public.platform_operators
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));