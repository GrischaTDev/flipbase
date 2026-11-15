-- Zweck: Das vom Nutzer gewählte Vinted-Abrufintervall wieder unverändert anwenden.
-- Die adaptive Drosselung aus 20261115170500 (ruhende Konten tagsüber mindestens 30,
-- nachts mindestens 60 Minuten) widersprach der Intervallwahl in der Oberfläche.
-- Betroffen: marketplace_next_sync_due_at (Signatur und Aufrufer unverändert).
create or replace function public.marketplace_next_sync_due_at(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_base_interval_minutes integer,
  p_now timestamptz default clock_timestamp()
)
returns timestamptz language sql immutable security invoker set search_path = '' as $$
  -- Das vom Nutzer gewählte Abrufintervall gilt immer; keine Drosselung ruhender Konten.
  -- Konto- und Arbeitsbereich bleiben in der Signatur, damit alle Aufrufer unverändert bleiben.
  select p_now + make_interval(mins => p_base_interval_minutes);
$$;

revoke all on function public.marketplace_next_sync_due_at(uuid,uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.marketplace_next_sync_due_at(uuid,uuid,integer,timestamptz) to service_role;

-- Bereits gedrosselt geplante Abrufe sofort auf das gewählte Intervall zurückholen.
-- Nur aktive, nicht pausierte Zeitpläne ohne Anbieter-Wartezeit; nie später als bisher geplant.
-- Gleiche globale Sperre wie die Zeitplan-RPCs, damit der laufende Worker nicht dazwischenschreibt.
select pg_advisory_xact_lock(91731, 1);
update public.marketplace_sync_schedules
  set next_due_at = greatest(
      clock_timestamp(),
      coalesce(last_attempt_at, clock_timestamp()) + make_interval(mins => interval_minutes)
    )
  where enabled
    and paused_reason is null
    and retry_after is null
    and next_due_at is not null
    and next_due_at > greatest(
      clock_timestamp(),
      coalesce(last_attempt_at, clock_timestamp()) + make_interval(mins => interval_minutes)
    );
