-- Server-Speicher: ein Messwert, Betreiber-Leserechte und begrenzte Meldefunktion.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.report_server_storage (
  p_total_bytes     bigint,
  p_used_bytes      bigint,
  p_available_bytes bigint
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    insert into public.server_storage_status (id, total_bytes, used_bytes, available_bytes, reported_at)
    values (1, p_total_bytes, p_used_bytes, p_available_bytes, statement_timestamp())
    on conflict (id) do update set
        total_bytes = excluded.total_bytes,
        used_bytes = excluded.used_bytes,
        available_bytes = excluded.available_bytes,
        reported_at = excluded.reported_at;
$function$;

COMMENT ON FUNCTION public.report_server_storage(bigint,bigint,bigint) IS 'Ersetzt ausschließlich den einen Partitionsmesswert. EXECUTE nur für den lokal eingerichteten Meldezugang.';

REVOKE ALL ON FUNCTION public.report_server_storage(bigint, bigint, bigint) FROM PUBLIC;

CREATE TABLE public.server_storage_status (
  id              smallint                 DEFAULT 1 NOT NULL,
  total_bytes     bigint                   NOT NULL,
  used_bytes      bigint                   NOT NULL,
  available_bytes bigint                   NOT NULL,
  reported_at     timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.server_storage_status IS 'Aktuelle Belegung der Server-Rootpartition. Keine Pfade, Kontodaten oder Prozessinformationen.';

ALTER TABLE public.server_storage_status
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_capacity CHECK ((used_bytes + available_bytes) <= total_bytes);

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_status_available_bytes_check CHECK (available_bytes >= 0);

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_status_id_check CHECK (id = 1);

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_status_pkey PRIMARY KEY (id);

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_status_total_bytes_check CHECK (total_bytes > 0);

ALTER TABLE public.server_storage_status
  ADD CONSTRAINT server_storage_status_used_bytes_check CHECK (used_bytes >= 0);

GRANT SELECT ON public.server_storage_status TO authenticated;

CREATE POLICY "Betreiber lesen den Server-Speicherstand" ON public.server_storage_status
  FOR SELECT
  TO authenticated
  USING (( SELECT public.is_platform_operator() AS is_platform_operator));

-- Explizite Speicherrechte aus 410_server_storage.sql.
revoke all on public.server_storage_status from public, anon, authenticated, service_role;

grant select on public.server_storage_status to authenticated;

revoke all on function public.report_server_storage(bigint, bigint, bigint)
    from public, anon, authenticated, service_role;
