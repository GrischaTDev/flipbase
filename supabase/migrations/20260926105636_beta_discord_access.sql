-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.beta_applications
  ADD COLUMN operator_email_status text DEFAULT 'pending'::text NOT NULL;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_operator_email_status_check CHECK (operator_email_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE public.beta_applications
  ADD COLUMN operator_email_sent_at timestamp with time zone;

ALTER TABLE public.beta_applications
  ADD COLUMN operator_email_last_error text;

CREATE TABLE public.beta_discord_links (
  id               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  auth_user_id     uuid                     NOT NULL,
  discord_user_id  text                     NOT NULL,
  role_assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.beta_discord_links IS 'Discord-Konto und bestaetigte Beta-Tester-Rolle eines registrierten Beta-Nutzers.';

ALTER TABLE public.beta_discord_links
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.beta_discord_links
  ADD CONSTRAINT beta_discord_links_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.beta_discord_links
  ADD CONSTRAINT beta_discord_links_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE public.beta_discord_links
  ADD CONSTRAINT beta_discord_links_discord_user_id_key UNIQUE (discord_user_id);

ALTER TABLE public.beta_discord_links
  ADD CONSTRAINT beta_discord_links_pkey PRIMARY KEY (id);

GRANT SELECT ON public.beta_discord_links TO authenticated;

GRANT ALL ON public.beta_discord_links TO service_role;

CREATE POLICY "Nutzer sehen eigene Discord-Verknuepfung" ON public.beta_discord_links
  FOR SELECT
  TO authenticated
  USING ((auth_user_id = ( SELECT auth.uid() AS uid)));