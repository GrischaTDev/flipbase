-- zweck: den aktuellen ununterbrochenen abschnitt erfolgreicher vinted-abfragen speichern.
-- betroffen: sniper_runtime_status (vinted_connected_since, vinted_last_success_at).
-- die betriebsstatus-zeile bleibt ein einzelner, durch die bestehende rls-policy geschuetzter snapshot.

alter table public.sniper_runtime_status
    add column vinted_connected_since timestamptz,
    add column vinted_last_success_at timestamptz;

comment on table public.sniper_runtime_status is 'Letzte Betriebsmeldung des einzigen Sammlers mit dem aktuellen Abschnitt erfolgreicher Vinted-Abfragen; fehlende oder alte Meldung ist kein gesunder Betrieb.';
