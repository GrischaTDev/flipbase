-- Zweck: Jeder angemeldete Nutzer darf genau einen privaten Realtime-Kanal
--        lesen und beschicken: seinen eigenen Sitzungskanal.
--
-- Betroffen: realtime.messages, zwei neue Policies.
--
-- Warum: Meldet sich jemand ueber "Von allen Geraeten abmelden" ab, erfaehrt
-- ein anderer offener Browser davon nichts. Sein Zugriffstoken ist weiterhin
-- gueltig, die Datenbank antwortet ihm ganz normal - nachgemessen: nach dem
-- Loeschen der Sitzung liefert /auth/v1/user zwar 403, /rest/v1/<tabelle>
-- aber weiterhin 200 mit Daten. Aus Sicht dieses Browsers ist nichts falsch,
-- er kann es also gar nicht bemerken. Bis das Token ablaeuft, arbeitet er
-- weiter.
--
-- Deshalb sagt die abmeldende Instanz es den anderen aktiv: eine Nachricht
-- ueber einen privaten Kanal, woraufhin jede andere Instanz beim Auth-Dienst
-- nachfragt und sich abmeldet. Dasselbe Muster wie ein Server-Push, nur ueber
-- den Realtime-Dienst, der ohnehin schon laeuft.
--
-- Der Kanalname lautet 'user:<uid>:sessions'. Die Policies binden ihn fest an
-- die eigene Kennung, damit niemand fremde Kanaele mithoeren oder auf ihnen
-- senden kann. Ein Signal allein meldet ausserdem niemanden ab - die App
-- prueft danach beim Auth-Dienst nach.

-- Lesen: nur den eigenen Sitzungskanal.
create policy "Eigenen Sitzungskanal hoeren"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'user:' || (select auth.uid())::text || ':sessions'
);

-- Senden: ebenfalls nur auf den eigenen Sitzungskanal.
create policy "Auf dem eigenen Sitzungskanal senden"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() = 'user:' || (select auth.uid())::text || ':sessions'
);
