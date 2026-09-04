-- Bestehende Sitzungskanal-Rechte aus Migration 20260823160000 deklarativ erhalten.
create policy "Eigenen Sitzungskanal hoeren"
on realtime.messages for select to authenticated
using (realtime.topic() = 'user:' || (select auth.uid())::text || ':sessions');

create policy "Auf dem eigenen Sitzungskanal senden"
on realtime.messages for insert to authenticated
with check (realtime.topic() = 'user:' || (select auth.uid())::text || ':sessions');
