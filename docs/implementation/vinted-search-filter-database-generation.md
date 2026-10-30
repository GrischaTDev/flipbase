# Datenbanknachweis für die Vinted-Suchfilter

Stand: 29.10.2026. Die lokale Aufgaben-Datenbank wurde mit Supabase CLI 2.114.0
unter PostgreSQL 17.6 geprüft. Es wurden keine verbundenen oder produktiven
Projekte abgefragt oder verändert.

## Vertrag

- `save_sniper_search_filter` besitzt genau eine Signatur. Der letzte Parameter
  `p_excluded_title_keywords text[] default '{}'` ist optional. Bestehende
  Aufrufe behalten ihre bisherigen Titelbedingungen und Schlüssel.
- `complete_sniper_search_filter_run` besitzt genau eine Signatur. Der fünfte
  Parameter `p_diagnostics jsonb default '{}'` ist optional; vierteilige Aufrufe
  funktionieren weiter. Die Rückgabe bleibt `{accepted, created, seeded, hits}`.
- Ein Artikel bleibt eine Zeile in `sniper_listings`. `sniper_query_matches`
  hält die zusätzlichen bestätigten Filterzuordnungen. Revision, Aktivzustand
  und Cursor werden vor der atomaren Übernahme kontrolliert. Historische
  Herkunft, Favoriten und bereits gefundene Artikel bleiben erhalten.
- Die Datenbank prüft positive Titelbegriffe und Titelausschlüsse erneut.
  Beschreibungen zählen dabei nicht. Höchstens 288 Rohartikel werden innerhalb
  eines Schritts dedupliziert und übernommen.
- Die Diagnose bezeichnet ausschließlich den begrenzten Abruf. `initial`,
  `caught_up` und `limited` sind keine Zusage über den vollständigen Marktplatz.
  Ein Wunschintervall ab einer Sekunde ist zulässig; daraus folgt keine
  zugesicherte tatsächliche Abrufgeschwindigkeit.
- `sniper_notify_feed_updates()` ist ausschließlich für `service_role`
  ausführbar. Der Dienst ruft ihn einmal nach einem erfolgreichen Arbeitsschritt
  auf. Er sendet je nicht archiviertem Workspace einen privaten Hinweis auf
  `workspace:<uuid>:sniper_feed`, Ereignis `feed_updated`, Inhalt `{refresh:true}`.
  Realtime ergänzt seine eigene Nachrichten-ID. Die Empfangspolicy prüft
  denselben Workspacezugang wie `sniper_feed_search`; Inhalte werden anschließend
  berechtigt nachgeladen. Es gibt keinen Artikel- oder Zeilentrigger.

## Automatische Migrationserzeugung

Die deklarativen Änderungen liegen in `108_sniper_search_filters.sql` und
`402_sniper_filter_feed_updates.sql`. Die spätere Datei ist notwendig, weil
`can_access_workspace` erst in `355_beta_access.sql` entsteht und die spätere
Beta-Schemadatei die frühere Markenfunktion erneut definiert.

Die Migration `20261029220058_sniper_query_matches.sql` besteht aus automatisch
erzeugten Ausgaben. Bestehende Migrationen wurden nicht verändert. Die örtlichen
Generatoren, Referenzabfragen und Rohprotokolle liegen unter
`.superpowers/sdd/vinted-search-filters/database/`.

1. Der erste offizielle deklarative Gesamtabgleich wurde geprüft und verworfen:
   Er enthielt bereits vorher bestehende fachfremde Unterschiede bei Labels und
   Marketplace-Objekten. Diese gehören nicht zur Suchfilteränderung.
2. Die beiden geänderten Deklarationen wurden ausschließlich auf die lokale
   Aufgaben-Datenbank angewandt. Dabei wurden alte gleichnamige Trigger und die
   ersetzten RPC-Signaturen zuvor kontrolliert entfernt. Dies schrieb keinen
   Eintrag in die Migrationshistorie.
3. Eine private CLI-Arbeitskopie mit unveränderter bisheriger Migrationsbasis,
   aber ohne deklarative Gesamtablage, erzeugte den Basisdiff mit der offiziellen
   CLI:

   ```text
   supabase --workdir <private-arbeitskopie> db diff --use-migra \
     --db-url postgresql://postgres:postgres@127.0.0.1:54352/postgres \
     --schema public,realtime -f sniper_query_matches
   ```

4. Ein eigener lokaler Referenzkatalog erhielt ausschließlich das Schema des
   Zielkatalogs. Die ursprünglichen Standardrechte für die neu erzeugten Objekte
   wurden aus `pg_default_acl` und `acldefault` reproduziert. Der offizielle
   PgDelta-Vergleich dieses Referenzkatalogs mit dem Zielkatalog erzeugte die
   expliziten Rechteentzüge für Dienstfunktionen und Zuordnungstabelle.
5. Beide Generatoren übergingen die Rechte der zugehörigen Identity-Sequenz.
   Deren fehlende Entzüge wurden deshalb ebenfalls automatisch aus der Differenz
   zwischen den ursprünglichen Standardrechten und `aclexplode(relacl)` des
   Zielkatalogs erzeugt. Es wurde kein Rechtefragment von Hand erfunden.
6. Der Wortgrenzentest benutzt automatisch aus Node 22 / Unicode 17.0 erzeugte
   Bereiche für Buchstaben, Zahlen und kombinierende Zeichen. So gelten auch
   arabische/indische Zeichen und Unicode-Zahlzeichen wie im vorhandenen
   Dienstmatcher. Der offizielle Katalogdiff enthält dafür ausschließlich den
   betroffenen Funktionskörper.
7. Ein weiterer offizieller Funktionsdiff sichert historische numerische
   Markenmerkzettel bei gemeinsamem Mehrmarkenabruf: Die passende ausgewählte
   Marken-ID muss auch zum tatsächlichen Artikelnamen passen. Der bestehende
   Einmarkenpfad bleibt unverändert.
8. Der gemeinsame Seed-/Nicht-Seed-Fall wird unabhängig von der Empfängerreihenfolge
   bewertet: Nur eine frisch angelegte Nicht-Seed-Zuordnung darf einen bisher
   ausschließlich durch Seed stillen Artikel wieder öffnen, wenn er nach dem
   vorherigen Erfolg dieses Empfängers erstmals gespeichert wurde. Historischer
   Seed-Bestand und bereits echte Bewertungen bleiben erhalten. Der offizielle
   Funktionsdiff ergänzt ausschließlich diesen RPC-Körper.
9. Basisdiff, offizieller Rechte-Diff, ermittelter Sequenz-Diff und die Funktions-Diffs wurden zu
   genau einer Migration zusammengesetzt. Ihr einziger neuer Erläuterungstext
   ist der deutsche Header beziehungsweise die Trennung der erzeugten Teile.
   Die Migration enthält keine eigene Transaktionssteuerung und keine externen
   Seiteneffekte. Es gibt keine veröffentlichte Zwischenmigration mit offenen
   Dienstrechten.

Die offiziellen Hinweise zu
[Diff-Engines](https://supabase.com/docs/guides/local-development/diff-engines)
und [privaten Broadcasts](https://supabase.com/docs/guides/realtime/broadcast)
wurden mit den tatsächlich verfügbaren CLI-Befehlen und dem lokalen
`realtime.send`-Funktionskörper abgeglichen. Das Neu-Erzeugen und Prüfen der
Migration ist erforderlich; eine Planansicht oder ein bloßer Start des Stacks
belegt ihren angewandten Inhalt nicht.

## Tatsächlich ausgeführte Prüfungen

- Roter SQL-Lauf vor Umsetzung: erwartete Fehler wegen bisherigem
  Zehn-Sekunden-Minimum, fehlender Ausschlussspalte und fehlendem RPC-Parameter.
- `supabase db reset --local`: erfolgreich, einschließlich der neuen Migration
  und vorhandenen Seeds. Damit wurde der endgültige SQL-Stand frisch angewandt.
- Vier gezielte SQL-Dateien nach diesem Reset: **199 Assertions erfolgreich**.
- `npm run test:db` nach diesem Reset: **134 Dateien, 5074 Assertions erfolgreich**.
- `supabase db advisors --local --type security --level warn --fail-on error`:
  erfolgreich, keine gemeldeten Probleme.
- Schemaregistrierung und Prüfung neuer/unveränderter Migrationsdateien:
  erfolgreich.
- `supabase gen types typescript --local`: erfolgreich aus der frisch migrierten
  Datenbank; keine von Hand ergänzten Typfragmente.

Die SQL-Fälle sichern unter anderem Mehrfachzuordnung, Ausschlüsse, stille
Erstbestände, erhaltene offene Bewertungen, alte Antworten und Cursor,
pausierte/geänderte/gelöschte Filter, 288 Artikel, doppelte Artikel,
Rollenrechte, interne Sequenzrechte sowie eigene und fremde Broadcastkanäle ab.

Der zusätzliche bestehende Workflowtest
`check-migration-transactions.test.mjs` schlug unter Windows beim Entfernen
seines temporären Verzeichnisses mit `EPERM` fehl. Dieses Ergebnis wird nicht als
bestandene Prüfung ausgegeben. Der erfolgreiche frische Datenbank-Reset und die
SQL-Nachweise sind davon unabhängig.
