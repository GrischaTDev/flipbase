\set ON_ERROR_STOP on

begin;

select plan(5);

select ok(
  public.platform_feature_enabled('vinted') and public.platform_feature_enabled('kleinanzeigen'),
  'Eingeschaltete Bereiche gelten als offen'
);

select ok(
  public.platform_feature_enabled('unbekannt'),
  'Ein Bereich ohne Schalter gilt als offen'
);

update public.platform_feature_switches set enabled = false where feature_key = 'vinted';

select ok(
  not public.platform_feature_enabled('vinted') and public.platform_feature_enabled('ebay'),
  'Nur der abgeschaltete Bereich gilt als geschlossen'
);

-- Jede Abholfunktion der Erweiterung prueft ihren Bereich, bevor sie einen neuen Auftrag vergibt.
select is(
  (
    select array_agg(procedure.proname::text order by procedure.proname::text)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'marketplace_local_message_claim',
        'marketplace_local_favorite_claim',
        'marketplace_local_negotiation_claim',
        'marketplace_local_listing_claim'
      )
      and procedure.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and procedure.prosrc like '%platform_feature_enabled(''vinted'')%'
  ),
  array[
    'marketplace_local_favorite_claim',
    'marketplace_local_listing_claim',
    'marketplace_local_message_claim',
    'marketplace_local_negotiation_claim'
  ]::text[],
  'Alle Vinted-Abholfunktionen der Erweiterung pruefen den Schalter'
);

select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('kleinanzeigen_claim_sync', 'kleinanzeigen_claim_listing')
      and procedure.prosrc like '%platform_feature_enabled(''kleinanzeigen'')%'
  ),
  2,
  'Beide Kleinanzeigen-Abholfunktionen pruefen den Schalter'
);

select * from finish();
rollback;
