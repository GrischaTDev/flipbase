-- Verknuepfte Discord-Konten fuer freigeschaltete Beta-Nutzer.
-- Nur der serverseitige OAuth-Ablauf darf Konten verbinden und Rollen bestaetigen.
create table if not exists public.beta_discord_links (
    id bigint generated always as identity primary key,
    auth_user_id uuid not null unique references auth.users (id) on delete cascade,
    discord_user_id text not null unique,
    role_assigned_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

comment on table public.beta_discord_links is
    'Discord-Konto und bestaetigte Beta-Tester-Rolle eines registrierten Beta-Nutzers.';

alter table public.beta_discord_links enable row level security;

create policy "Nutzer sehen eigene Discord-Verknuepfung"
    on public.beta_discord_links for select to authenticated
    using (auth_user_id = (select auth.uid()));

revoke all on table public.beta_discord_links from public, anon, authenticated;
grant select on table public.beta_discord_links to authenticated;
