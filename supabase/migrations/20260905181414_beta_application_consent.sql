-- Nachweis der Einwilligung bei Beta-Bewerbungen.
--
-- Betroffen: public.beta_applications (neue Spalte consent_at).
--
-- Die Funktion lehnt Bewerbungen ohne consent === true zwar ab, hielt aber
-- bisher nirgends fest, dass und wann eingewilligt wurde. Widerspricht ein
-- Bewerber spaeter, ist nur eine Zeile belegbar - die DSGVO legt die
-- Nachweispflicht aber beim Verantwortlichen (Art. 7 Abs. 1). Die Edge
-- Function supabase/functions/beta-application/index.ts setzt die Spalte
-- ausdruecklich beim Einfuegen.

alter table public.beta_applications
  add column consent_at timestamptz not null default now();

comment on column public.beta_applications.consent_at is
    'Zeitpunkt der Einwilligung, ausdruecklich von der Edge Function beta-application gesetzt (Nachweispflicht nach Art. 7 Abs. 1 DSGVO). Der Wortlaut der Einwilligung selbst wird nicht zusaetzlich gespeichert - er steht in der Versionsgeschichte von landing/index.html.';
