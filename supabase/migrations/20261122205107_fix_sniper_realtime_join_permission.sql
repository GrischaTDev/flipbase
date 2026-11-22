-- Erlaubt die interne Beitrittsprüfung für den privaten Sniper-Feed.
alter policy "Berechtigte empfangen Sniper Feed Hinweise" on realtime.messages
    using (
        extension = 'broadcast' and topic = (select realtime.topic())
        -- Realtime legt für die Beitrittsprüfung eine leere Zeile ohne Private-Kennzeichnung an.
        and (private is true or (event is null and payload is null))
        and public.sniper_can_access_feed_topic(topic));
