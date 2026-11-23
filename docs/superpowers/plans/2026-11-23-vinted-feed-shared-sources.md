# Vinted-Feed: persönliche Feeds aus gemeinsamen Quellen (Plan für PR A)

Stand 23. November 2026. Grundlage sind die Prüfung des unfertigen Entwurfs
„Persönliche Vinted-Feeds“ und die Vintz-Messung vom 22. und 23.11.2026
([Vintz-Sniper-Plan](../../research/2026-11-22-vintz-sniper-implementation-plan.md)).

## Ausgangslage

- **Entwurf:** Der Entwurf liegt nicht committet im Arbeitsordner
  `K:/GitHub/Worktrees/flipbase-personal-vinted-feeds` (Zweig
  `juna/personal-vinted-feeds`, Basis `863150af`).
  - Er ersetzt die Admin-Bots durch persönliche Feeds je Nutzer und entfernt
    die Bot-Verwaltung.
  - Jeder unterschiedliche Feed wird zu einer eigenen Vinted-Abfrage.
    Geteilt wird nur bei exakt gleichem Schlüssel aus Suchtext, Kategorie,
    Marke und Preisgrenzen.
- **Gut am Entwurf und zu übernehmen:**
  - Rechte- und Mandantentrennung
  - Teilen gleicher Abrufe mit globaler Sperre beim Starten und Stoppen
  - Live-Fenster mit 100 Funden aus 10 Minuten
  - Favoriten unabhängig vom Feed
  - Linkimport mit strengem Parser
  - Schutzzähler gegen Wettläufe in der Oberfläche
  - e2e-Matrix mit Axe
- **Grundproblem:** Die Last wächst mit der Vielfalt der Nutzerfilter.
  - Es gibt keine globale Grenze, nur 12 aktive Feeds je Nutzer.
  - Für Feeds bleiben etwa 16–19 Vinted-Abrufe pro Minute.
  - Ab etwa 60 verschiedenen Abfragen wird jeder Feed nur noch alle
    paar Minuten abgerufen.
  - Ab etwa 150 Abfragen bleibt das 10-Minuten-Fenster leer. Der Feed meldet
    trotzdem „abgedeckt“, weil `sniper_feed_search` den Wert
    `coverage_status = 'limited'` nicht beachtet.
- **Weitere Befunde der Prüfung:**
  - Der Migration fehlt der Sperrvorspann. Es droht eine Verklemmung wie
    am 31.10.2026.
  - Die alten Admin-Aufträge bleiben aktiv und verbrauchen über den
    Preisvergleich unsichtbar Abrufe.
  - Die Aufbewahrung von 15 Minuten bricht KI-Suche und Preisvergleich.
- **Entscheidung vom 20.11.2026, PR 715:** „Nutzer legen nie Bots an.“
  Dieser Plan hält sich im Kern daran:
  - Nutzer legen Feeds an, aber keine Abfragen.
  - Abfragen entstehen nur als gemeinsame Quellen nach festen Regeln und
    unter einer globalen Grenze.
- **Entscheidung vom 23.11.2026:**
  - KI-Suche und Preisvergleich werden entfernt, weil sie nie gut
    funktioniert haben.
  - Durchschnittspreise werden später als verdichtete Statistik neu gebaut
    (siehe PR C).
- **Vintz zum Vergleich** (Messung 23.11.2026):
  - Engine `shared_v2` mit 40 Katalogabrufen pro Sekunde, 15 Minuten
    Aufbewahrung und 120 Karten je Feed.
  - Eine Suche ist dort nur der rohe Vinted-Querystring.
  - Vintz ist von Einzelsuchen je Nutzer mit Lease auf eine gemeinsame
    Engine umgestiegen.
  - Der Tempoabstand liegt am Abrufbudget, nicht am Datenmodell.

## Ziel von PR A

1. Persönliche Feeds wie im Entwurf: speichern, starten, stoppen,
   bearbeiten, löschen und Linkimport.
2. Die Vinted-Last hängt von der Zahl der **Quellen** ab, nicht von der
   Zahl der Nutzer oder Filter.
3. Es gibt eine harte, im Admin-Bereich einstellbare Obergrenze. Wer an die
   Grenze stößt, bekommt eine klare Ablehnung.
4. Ein Feed meldet nur dann „abgedeckt“, wenn seine Quelle wirklich
   aktuell ist.
5. KI-Suche, Preisvergleich und Admin-Bot-Verwaltung sind entfernt. Sie
   verbrauchen keine Abrufe mehr.

**Nicht Teil von PR A:**

- Live-Fenster im Speicher des Dienstes und Karten per Broadcast (PR B)
- Preisstatistik (PR C)
- Mehr Abrufkapazität über zusätzliche IPs (eigene Entscheidung)

## Grundidee: drei Quellenarten

Vinteds Katalogliste liefert je Artikel: Titel, Preis, Markenname als Text,
Größe, Zustand, Bilder und Verkäufer. **Die Kategorie fehlt.** Eine Kategorie
kennen wir nur, wenn die Abfrage selbst mit `catalog_ids` lief. Daraus folgen
die Quellen:

| Quelle             | Vinted-Abfrage                          | Läuft, solange …                                            | Versorgt Feeds mit                           |
| ------------------ | --------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Hauptquelle Damen  | `catalog_ids=1904`, ohne weitere Filter | ein aktiver Feed mit Zielgruppe Damen oder beide existiert  | Marke, Suchtext, Größe, Zustand, Preis       |
| Hauptquelle Herren | `catalog_ids=5`, ohne weitere Filter    | ein aktiver Feed mit Zielgruppe Herren oder beide existiert | wie oben                                     |
| Kategoriequelle    | `catalog_ids=<Kategorie>`, sonst nichts | ein aktiver Feed diese Kategorie nutzt                      | Kategorie + alles andere per Datenbankfilter |

Regeln für die Zuordnung eines Feeds zu seiner Quelle:

- **Feed ohne Kategorie:** Er speist sich aus der Hauptquelle seiner
  Zielgruppe. Bei Zielgruppe „beide“ liest er aus beiden Hauptquellen.
  - Die Marke wird über den normalisierten Markennamen abgeglichen
    (Kennung → Name aus der Markentabelle).
  - Der Suchtext läuft über die bestehende Wortanfang-Suche im Titel
    (PR 717).
- **Feed mit Kategorie:** Er speist sich aus der Kategoriequelle.
  - Marke, Suchtext, Größe, Zustand und Preis filtert die Datenbank.
  - Feeds wie „Carhartt Fleecejacken“ und „Patagonia Fleecejacken“ teilen
    sich damit **eine** Abfrage.
- **Preis und Marke gehören nie in den Abrufschlüssel.** Der Schlüssel einer
  Kategoriequelle ist nur `catalog_id`.
- **Ausnahme bei zu breiter Kategorie:** Meldet eine Kategoriequelle
  dauerhaft `coverage_status = 'limited'`, kommt sie bei drei Seiten je Lauf
  nicht hinterher. Dann darf der Planer sie nach Marke aufteilen. Das zählt
  gegen dieselbe Grenze. Optional, zuerst messen.
- **Grenze bei Suchbegriffen:** Vinteds eigene Suche findet auch Treffer in
  der Beschreibung, unser Titelabgleich nicht. Das ist eine bewusste
  Einschränkung. Eigene Suchtextquellen gibt es in PR A nicht.

Die Hauptquellen sind die bisherigen Hauptsammler. Ein Kategorie-Bot vom
20.11. entspricht jetzt einer Kategoriequelle. Der Unterschied: Kategorie-
quellen entstehen bei Bedarf durch Nutzerfeeds statt durch die
Administration, und sie enden automatisch, wenn kein aktiver Feed sie mehr
braucht.

**Nebeneffekt:** Kategoriequellen tragen ihre Kategorie über
`record_sniper_listing_category` in Artikel nach. Diese Artikel kamen
ursprünglich aus der Hauptquelle. PR C nutzt das für die Preisstatistik.

## Abrufbudget und globale Grenze

**Bekannte Werte, vor dem Umbau in Produktion neu ablesen:**

- Standard sind 24 Abrufe pro Minute und 2,5 s Mindestabstand
  (`services/sniper/src/config.ts:18-20`).
- Messung vom 20.11.2026: Damen und Herren zusammen liefern etwa 900 Artikel
  pro Minute und brauchen dafür 17–20 von 24 Abrufen pro Minute.
- Damen braucht 2–3 Seiten je Lauf.
- Der Preisvergleich belegt bisher jeden fünften Abrufplatz. Mit seiner
  Entfernung werden etwa 4–5 Abrufe pro Minute frei.

**Folge:** Bei gleichem Budget bleiben neben beiden Hauptquellen etwa 6–8
Abrufe pro Minute für Kategoriequellen. Eine Kategorie braucht meist eine
Seite je Lauf. Bei 2–3 Minuten Takt reicht das für etwa **10–15
Kategoriequellen**. Das deckt sich mit der Messung vom 20.11.

**Umsetzung:**

- **Einstellung `vinted_feed_max_category_sources`:** Standard 10, im
  Systemzustand einstellbar und nur für Plattform-Admins änderbar. Sie gilt
  für die Zahl gleichzeitig laufender Kategoriequellen. Der Nutzer will sie
  laut Entscheidung vom 23.11.2026 jederzeit erhöhen können, wenn die
  Auslastung es zulässt oder die Abrufkapazität wächst. Deshalb zeigt
  dieselbe Karte die Auslastung daneben: genutzte Abrufe pro Minute,
  Rundenzeit der Kategoriequellen und Abdeckung. Eine Senkung beendet keine
  laufenden Quellen. Sie greift erst bei neuen Starts.
- **Aufnahme beim Start eines Feeds** (`set_sniper_watchlist_active`):
  - Läuft die Quelle schon, kann der Feed sofort starten.
  - Braucht der Feed eine neue Kategoriequelle und ist die Grenze erreicht,
    wird er mit der Meldung „Diese Kategorie ist gerade ausgelastet. Starte
    einen Feed ohne Kategorie oder versuche es später.“ abgelehnt.
    Genauer Text in der Umsetzung.
  - Bearbeiten eines aktiven Feeds prüft die Grenze genauso.
- **Takt aus dem Budget ableiten statt fester 5 s:**
  - Hauptquellen haben Vorrang.
  - Kategoriequellen teilen sich den Rest reihum nach Fälligkeit.
- **Neue Quellen drängeln nicht vor:** Eine neue Quelle bekommt keinen
  Fälligkeitswert −∞, sondern reiht sich hinten ein. Das unsichtbare
  Einlesen zählt normal.
- **Die 12 aktiven Feeds je Nutzer bleiben.** Sie erzeugen keine Abfragen
  mehr, nur Datenbanklast beim Lesen.

## Abdeckung und Frische

- `sniper_feed_search` meldet `covered` nur, wenn alle Quellen des Feeds zwei
  Bedingungen erfüllen:
  - nicht `invalid` und nicht `limited`
  - letzter erfolgreicher Abruf jünger als ein Grenzwert, zum Beispiel
    3 Minuten bei Kategorie- und 1 Minute bei Hauptquellen
- **Die Oberfläche** zeigt nur bei fehlender Abdeckung einen konkreten
  Zustand an, wie bisher. Keine neuen Erklärtexte.
- **`sniper_runtime_status`** meldet zusätzlich:
  - Zahl der aktiven Quellen je Art
  - ältester fälliger Abrufstand
  - Abrufe pro Minute nach Quelle

## Datenmodell auf dem Entwurf

Der Entwurf wurde am 23.11.2026 als Patch auf
`juna/vinted-feed-shared-sources` übernommen. Er speichert je Feed eine
`collection_query_id` für eine eigene Abfrage. Neu:

- **Quellen werden abgeleitet, nicht gespeichert:**
  - Die unveränderliche Funktion
    `sniper_watchlist_source_keys(catalog_id, audience)` liefert die
    Quellschlüssel eines Feeds:
    - mit Kategorie: eine Kategoriequelle
    - sonst die Hauptquelle der Zielgruppe
    - bei „beide“ ohne Kategorie: zwei Hauptquellen
  - `collection_query_id` entfällt.
  - Die View `sniper_active_feed_sources` berechnet daraus die benötigten
    Quellen aller aktiven, berechtigten Feeds. Der Dienst liest diese View
    statt `sniper_active_personal_collections`.
- **Quellen als Zeilen in `sniper_queries`:** Schlüssel
  `vinted-source|main|1904` (Damen), `vinted-source|main|5` (Herren) und
  `vinted-source|category|<id>`. Die Hauptquellen nutzen dieselben
  Wurzelkategorien wie die Zielgruppenfilter des Entwurfs.
- **Marke immer mit Namen:** Die Katalogliste liefert nur den Markennamen.
  Ein Feed mit Marken-ID braucht deshalb auch den Namen.
  - Der Linkimport übernimmt eine unbekannte Marken-ID nicht mehr als
    „Marke #88“.
  - Stattdessen erscheint am Markenfeld die Aufforderung, die Marke
    auszuwählen.
  - Ein Hilfsaufruf legt sie an oder reaktiviert sie.
  - Inaktive Kategoriequellen ohne Bedarf löscht die Bereinigung nach
    einem Tag. Damit wächst `sniper_queries` nicht mehr unbegrenzt.
- **`sniper_feed_search`** liest Treffer aus `sniper_query_matches` aller
  Quellen des Feeds. Die Filter für Marke, Suchtext, Größe, Zustand und Preis
  übernimmt sie aus der master-Fassung (`401_sniper_feed_search.sql`,
  `107_sniper_feed_brands.sql`). Die Tests aus dem Entwurf, die dabei
  verloren gingen, kommen zurück:
  - Größenabgleich: 2XL entspricht XXL, XL entspricht nicht XXL
  - Sonderzeichen erzeugen keinen Alles-Treffer
  - Zustand mit Vinted-Komma
  - Zielgruppe „beide“
  - widersprüchliche Markenkennungen
- **Live-Hinweis:** Nur Arbeitsbereiche, deren Feeds an einer Quelle mit
  neuen Treffern hängen, bekommen den Broadcast. Unsichtbare Einleseläufe
  lösen keinen Hinweis aus.

## Rückbau in PR A

| Bereich         | Entfernen                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preisvergleich  | `560_vinted_comparison_market.sql` (Tabellen `vinted_comparison_scopes/items/matches`, Funktionen `claim/complete/fail_vinted_comparison_task`, `capture_vinted_comparison_feed`, `vinted_comparison_market`); im Dienst `runtime/comparison-collection.ts`, `store/comparison.store.ts`, `vinted/comparison-*-page.ts` samt Tests; Aufruf und Anzeige in `deal-feed-search` und `deal-card` |
| KI-Suche        | `540_vinted_ai_search.sql`, `supabase/functions/vinted-ai-search`, `vinted-ai-search.service.ts`, `vinted-ai-search-modal`, Modell und Tests                                                                                                                                                                                                                                                 |
| Admin-Bots      | wie im Entwurf; zusätzlich alle bisherigen zentralen Aufträge ausdrücklich `is_active = false`, außer den zwei Hauptquellen, die zu Systemquellen werden                                                                                                                                                                                                                                     |
| Alte Funktionen | `upsert_sniper_query`, `save_sniper_search_filter`, `sniper_feed_bots`, `sniper_feed_categories`, `sniper_supported_brands` und weitere löschen statt nur sperren, wenn kein Aufrufer mehr existiert                                                                                                                                                                                         |
| Aufbewahrung    | volle Karten nach 15 Minuten, Kennungen 3 Tage, wie im Entwurf; jetzt zulässig, weil KI-Suche und Preisvergleich wegfallen                                                                                                                                                                                                                                                                   |

`barcode-ai-search` und der Katalog hängen nicht am Vinted-Preisvergleich und
bleiben unberührt (geprüft per `git grep`, 23.11.2026).

Destruktiv ist das Löschen der Tabelle `vinted_ai_searches`, die
Nutzungszähler enthält. Der Nutzer hat am 23.11.2026 entschieden: Diese
Zähler und alle bisher gesammelten Artikel- und Vergleichsdaten werden ohne
Sicherung gelöscht.

## Korrekturen aus der Prüfung

**Datenbank und Migration**

1. **Sperrvorspann:** Ganz am Anfang wie in
   `20261114150000_sniper_remove_deal_detection.sql:16-32`, mit
   Wiederholschleife und Abbruch nach etwa 120 s:
   - `sniper_queries`, `sniper_listings`, `sniper_query_matches`,
     `sniper_watchlists` in `access exclusive mode nowait`
   - danach `workspace_members` und `workspaces` in
     `share row exclusive mode nowait`
2. **Zeitstempel:** Die Migration mit `supabase db diff` neu erzeugen, nach
   dem letzten Stand von `origin/master`. Im Kopf die betroffenen Tabellen
   und Spalten nennen. `drop policy` und `revoke select` auf
   `sniper_listings` als destruktiv kommentieren. SQL in Kleinbuchstaben.
3. **Alte gespeicherte Suchfilter:** Der Nutzer hat am 23.11.2026
   entschieden: keine Übernahme. Alle bisherigen `sniper_watchlists` werden in
   der Migration gelöscht, mit Kommentar als destruktiv. Danach starten alle
   Nutzer mit leerem Feed.
4. **Ungültige geteilte Quelle:** Ein Neustart setzt `run_state = 'invalid'`
   auch bei aktiver Quelle zurück, sonst bleibt der Feed tot.
5. **Bereinigung:** `sniper_purge_expired_listings` hält die Feed-Sperre
   (`pg_try_advisory_xact_lock(403,1)`) nicht während des ganzen Löschens.
   Den Abgleich abgelaufener Zugänge als eigenen kurzen Aufruf ausführen.
6. **Unnötige Indizes auf `sniper_listings` prüfen:** GIN-Titelindex,
   `idx_sniper_listings_catalog` und doppelter Zeitindex. Sie bleiben nur,
   wenn die neue Feed-Abfrage sie per Abfrageplan nutzt.

**Sniper-Dienst**

7. **Wartezeit nach 403/429:** Den Fehlerzähler in `sniper_origin_state`
   führen, nicht je Auftrag. So setzt ein Neustart oder Nutzerwechsel die
   Wartezeit nicht zurück.
8. **Toter Code:** Alte Pfade ohne RPC (`saveNew`, `markSeeded`,
   `markPolled`, `deactivate`, Titelbegriffe, Mehrmarken-Wechsel) entfernen.
   Die Test-Aufträge auf Format 1 umstellen.
9. **Zugriffsprüfung ohne aktiven Feed:** `browser-session.ts:131` darf
   keinen aktiven Auftrag mehr verlangen. Texte „Suchauftrag“ und
   „Botsitzung“ anpassen.
10. **README:** Quellenarten, globale Grenze, 12er-Grenze und Aufbewahrung
    beschreiben. Veraltete Abschnitte entfernen (233, 282, 291, 320, 325).

**Oberfläche und Edge Function**

11. **`vinted-brand-search`:**
    - Schalter `vinted_feed` prüfen.
    - Begrenzung je Nutzer, zum Beispiel 30 Aufrufe pro Minute über eine
      Zähltabelle.
    - Kurzer Cache je Suchwort.
    - `sniper_can_access_workspace` per RPC nutzen statt nachzubauen.
12. **Systemzustand:**
    - Karte „Vinted-Quellen“ mit aktiven Quellen (Art, Kategorie, letzter
      Abruf, Abdeckung) und der einstellbaren Grenze.
    - Sync-Stand der Kategorien mit dem Knopf „Neu einlesen“ (übernommen aus
      der entfernten Kategorienpflege).
13. **Fehlermeldungen:** Beim Starten und Speichern die Servermeldung bei
    `22023` und `54000` durchreichen statt eine allgemeine Meldung zu
    zeigen.
14. **Fehler im Editor:**
    - `(valueChange)` auf `app-text-field` greift nie. Stattdessen
      `feedLink.valueChanges` abonnieren.
    - Der Fehler der Preisspanne kommt über den `error`-Eingang an
      `app-number-input`.
    - `aria-label` passend für „Neuer Feed“ und „Feed bearbeiten“.
15. **Alte Adressen:** `/admin/vinted-bot/*` und `/admin/queries` leiten auf
    `/admin/system` um.
16. **Struktur:** `VintedCategoryService`, `vinted-category-source/-tree` und
    `VintedBrandSearchService` aus `features/platform-admin/` in einen
    gemeinsamen Vinted-Bereich verschieben. Ziel nach Projektregeln wählen,
    zum Beispiel `core/vinted/`.
17. **Benennung neuer Bezeichner:** `personal-feed-editor` statt
    `watchlist-editor`, `feedSizeLabels` usw. DB-Namen bleiben.

## Tests

- **SQL:**
  - Ableitung der Quellen: Feed ohne Kategorie → Hauptquelle; Zielgruppe
    „beide“ → zwei Quellen; mit Kategorie → Kategoriequelle.
  - Teilen einer Kategoriequelle über Marken hinweg.
  - Grenze erreicht → Ablehnung; Bearbeiten über die Grenze.
  - Quelle endet, wenn der letzte Feed stoppt.
  - Grenze von 12 aktiven Feeds; entferntes Mitglied; Archivierung;
    abgelaufener Zugang.
  - Löschen eines aktiven, geteilten Feeds; Bearbeiten, während ein anderer
    Nutzer dieselbe Quelle aktiv nutzt.
  - `covered` bei `limited` und bei veraltetem Abruf.
  - Migration löscht alle alten Suchfilter; wiederhergestellte Filtertests.
- **Dienst:**
  - Planer gibt Hauptquellen Vorrang, neue Quellen reihen sich hinten ein,
    Takt richtet sich nach dem Budget.
  - Wartezeit nach 403 je Herkunft.
  - Bereinigung ohne Halten der Feed-Sperre.
- **Angular:**
  - eigene Spec für den Feed-Editor (Validierung, Preisspanne, Linkimport
    mit Größen wie „M / 38 / 10“)
  - Bearbeiten eines aktiven Feeds; Wechsel zwischen zwei aktiven Feeds
  - Meldung bei erreichter Grenze
- **e2e:** bestehende Feed-Matrix plus Browserfall für die Systemseite:
  Vinted-Zugriff prüfen, Ablehnung, Status bleibt. Der Fall stammt aus dem
  gelöschten `sniper-administration.spec.ts`.
- **Testregistrierung:** `scripts/affected-tests.mjs` und die Suite-Prüfungen
  lokal ausführen.
- **Preflight:** voller Lauf nach AGENTS.md, weil Rechtegrenzen und
  Datenbankschema betroffen sind.

## Auslieferung

- **Sniper-Container vor dem Deploy anhalten:** `docker stop flipbase-sniper`.
  Den Sperrvorspann trotzdem einbauen.
- **Erste Stunde danach:**
  - Abrufe pro Minute nach Quellenart
  - Häufung von `new=0` sowie 403 und 429
  - Abbau des 3-Tage-Bestands. Bei 1.000 Zeilen je Durchlauf dauert er
    Minuten bis etwa eine Stunde.
  - Datenbankzeit der Feed-Abfrage
- **Rückweg:**
  - Ein reiner Code-Rollback genügt nicht, weil Leserechte entzogen und
    Tabellen gelöscht sind.
  - Eine Gegenmigration vorbereiten, die Leserechte und Admin-Aufträge
    wiederherstellt.
  - Gelöschte Artikel und die Vergleichsdaten sind nicht
    wiederherstellbar. Das ist bewusst.

## Vorgehen und Zuständigkeit

1. **Mit dem Arbeitsordner des Entwurfs abstimmen.** Er gehört einer anderen
   Sitzung (Chat „Analysiere Vintz AI Sniper“).
   - Entweder führt diese Sitzung den Plan dort fort.
   - Oder der Entwurf wird als Patch auf `juna/vinted-feed-shared-sources`
     übernommen (`git diff` aus dem Entwurf, `git apply` hier). Danach wird
     der Entwurfsordner nach Rücksprache aufgeräumt.
   - Nicht parallel in beiden Ordnern arbeiten.
2. **Reihenfolge:**
   1. Rückbau von Preisvergleich und KI-Suche
   2. Quellenmodell und View
   3. Dienst lesen lassen
   4. Grenze und Abdeckung
   5. Korrekturliste
   6. Migration neu erzeugen
   7. Tests und Preflight
3. **Ein PR.** Rückbau und Quellenmodell gehören zusammen. Erst ohne
   Preisvergleich ist die kurze Aufbewahrung zulässig, und erst mit Grenze
   ist die Entfernung der Admin-Bots tragbar.

## Offene Entscheidungen

- Ob Feeds mit Suchbegriff später eigene Quellen bekommen, wegen der Treffer
  in der Beschreibung.
- **Vor dem Festlegen der Grenze:** Die auf dem Server tatsächlich
  eingestellten Abrufwerte aus `/opt/flipbase-sniper/sniper.env` ablesen.
  Das ist eine technische Aufgabe der Umsetzung, keine Nutzerentscheidung.

## Ausblick

- **PR B – Live wie bei Vintz, ohne neues Backend:**
  - Der Sniper-Dienst gleicht jeden Fund im Speicher gegen alle aktiven
    Feeds ab und hält das 15-Minuten-Fenster im Speicher.
  - Neue Karten gehen als Delta mit fortlaufender Nummer per
    Supabase-Realtime-Broadcast an einen privaten Kanal je Feed.
  - Der Browser holt nur bei einer Lücke oder einem Neustart einen
    Snapshot.
  - Postgres hält dann nur noch Feeds, Favoriten, Kennungen und Statistik.
- **PR C – Preisstatistik:**
  - Beim Einlesen zählt jeder Fund in eine Tagesstatistik je Preisgruppe:
    Marke-ID × Endkategorie × Zustand, optional Größe.
  - Gespeichert werden Anzahl und Preis-Histogramm. Daraus ergeben sich
    Median und Spanne für 7 und 30 Tage.
  - Optional eine Modelltabelle mit Marke, Kategorie und Pflichtwörtern im
    Titel für gefragte Artikel.
  - Es sind Angebotspreise, keine Verkaufspreise.
- **Kapazität:** Mehr Tempo über zusätzliche IPs ist eine Kosten- und
  Bot-Schutz-Entscheidung, unabhängig von PR A bis C.
  - **Stand 23.11.2026, am Server abgelesen:**
    - `SNIPER_REQUESTS_PER_MINUTE=30`, aber der Mindestabstand bleibt beim
      Standardwert von 2,5 s. Tatsächlich laufen etwa 20 Seitenabrufe pro
      Minute.
    - In 24 Stunden gab es keine 403/429.
    - Der Sniper hat keine Proxy-Unterstützung. Alle Abrufe laufen über die
      Serveradresse.
  - **Erster Schritt:** Stufentest auf der einen Adresse mit Abstand 2,0 →
    1,5 → 1,0 s, je 30–60 min beobachten. Nur mit Freigabe, weil das die
    Produktion betrifft.
  - **Danach ein eigener Proxy-Pool für den Feed, der Flipbase gehört:**
    - Der Dienst verteilt Abrufe reihum auf die Adressen.
    - Jede Adresse hat ein eigenes Budget und eine eigene Wartezeit nach
      403/429.
    - Mit gemeinsamen Quellen erhöht jede Adresse die Kapazität für alle
      Nutzer gleich.
  - **Keine Proxys von Nutzer-Cloud-Konten:** Anonymes Massenabrufen über die
    Adresse eines angemeldeten Verkäuferkontos gefährdet genau dieses Konto.
    Außerdem hinge die Feed-Geschwindigkeit sonst von der Zahl der Konten ab.
    Vintz betreibt den Sniper ebenfalls getrennt von verbundenen Konten. Er
    läuft dort auch ohne verbundenes Konto.
