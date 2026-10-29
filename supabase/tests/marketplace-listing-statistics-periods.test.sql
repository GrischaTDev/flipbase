\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
-- Die fachliche Zeitzone muss unabhängig von der Datenbanksitzung gelten.
set local timezone = 'Pacific/Auckland';
select plan(11);

-- Feste Kalendergrenzen: Ein absoluter Stundenabstand verschiebt diese Enden
-- bei der Zeitumstellung und kann sogar in den aktuellen Zeitraum hineinragen.
select is(
  public.marketplace_listing_statistics_previous_end(reference_at, zone, period_length),
  expected_end,
  description
)
from (values
  (timestamptz '2026-10-28 22:30:00+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2026-10-21 21:30:00+00', 'Sieben Tage nach der Herbstumstellung enden im Vorzeitraum zur selben Berliner Uhrzeit'),
  (timestamptz '2026-10-28 22:59:59.999999+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2026-10-21 21:59:59.999999+00', 'Die letzte Mikrosekunde vor Mitternacht bleibt eine exklusive Vorzeitraumgrenze'),
  (timestamptz '2026-10-28 22:30:00+00', 'Europe/Berlin', interval '30 days',
    timestamptz '2026-09-28 21:30:00+00', 'Dreißig Tage nach der Herbstumstellung überschneiden sich nicht mit dem Vorzeitraum'),
  (timestamptz '2026-11-04 22:30:00+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2026-10-28 22:30:00+00', 'Eine Herbstumstellung im Vorzeitraum verkürzt dessen Vergleich nicht'),
  (timestamptz '2027-03-31 21:30:00+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2027-03-24 22:30:00+00', 'Sieben Tage nach der Frühjahrsumstellung enden im Vorzeitraum zur selben Berliner Uhrzeit'),
  (timestamptz '2027-03-31 21:30:00+00', 'Europe/Berlin', interval '30 days',
    timestamptz '2027-03-01 22:30:00+00', 'Dreißig Tage nach der Frühjahrsumstellung behalten die entsprechende Kalenderuhrzeit'),
  (timestamptz '2027-04-07 21:30:00+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2027-03-31 21:30:00+00', 'Eine Frühjahrsumstellung im Vorzeitraum verlängert dessen Vergleich nicht'),
  (timestamptz '2026-10-25 02:30:00+00', 'UTC', interval '24 hours',
    timestamptz '2026-10-24 02:30:00+00', 'Der Stundenvergleich bleibt auch über die Herbstumstellung bei genau 24 UTC-Stunden'),
  (timestamptz '2026-10-20 20:30:00+00', 'Europe/Berlin', interval '7 days',
    timestamptz '2026-10-13 20:30:00+00', 'Ohne Zeitumstellung bleibt die bisherige Kalendergrenze erhalten')
) as cases(reference_at, zone, period_length, expected_end, description);

set local role anon;
select throws_ok(
  $$select public.marketplace_listing_statistics_previous_end(timestamptz '2026-10-28 22:30:00+00', 'Europe/Berlin', interval '7 days')$$,
  '42501', null, 'Anonyme Clients dürfen die interne Kalenderberechnung nicht direkt aufrufen'
);
reset role;
set local role authenticated;
select throws_ok(
  $$select public.marketplace_listing_statistics_previous_end(timestamptz '2026-10-28 22:30:00+00', 'Europe/Berlin', interval '7 days')$$,
  '42501', null, 'Angemeldete Clients dürfen die interne Kalenderberechnung nicht direkt aufrufen'
);
reset role;

select * from finish();
rollback;
