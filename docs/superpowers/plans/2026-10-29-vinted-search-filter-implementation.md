# Zentrale Vinted-Suchfilter: Umsetzungsplan

> Durchführung mit `superpowers:subagent-driven-development` für die getrennten
> Bereiche und gemeinsamer Integration. Die ausdrückliche Umsetzungsfreigabe
> ersetzt weitere Design- und Routinefreigaben. Kein Push, PR, Merge oder Rollout.

**Ziel:** Schlanker zuverlässiger Browserabruf, gemeinsame sichere Abrufplanung,
verständliche Wortvarianten und eine vollständig überarbeitete Filterverwaltung.

**Architektur:** Fachliche Filter bleiben in `sniper_queries`; ein eigener
Planer bildet daraus identische tatsächliche Abrufe. Artikel bleiben einmalig
in `sniper_listings`, passende Filter erhalten getrennte geschützte Zuordnungen.
Keine stillschweigende Aufweitung von Kategorie, Marke, Preis oder Suchtext.

**Technik:** Bestehendes Angular 22, Tailwind/Shared UI, Node 22, Supabase.
Keine neuen Abhängigkeiten oder Hauptversionen erforderlich.

**Grundlage:** [Messbericht](../../research/2026-10-29-vinted-search-filter-measurement.md)
und der direkte vollständige Umsetzungsauftrag. Sekundenleistung für zwanzig
unabhängige Suchen wird nicht versprochen. Die 250-ms-Parallelstufe bleibt verworfen.

## Verbindliche Entscheidungen

- Fortsetzung der eigenen Aufgabe auf `juna/vinted-search-filters`, vom frisch
  abgerufenen Hauptzweig aktualisiert; uncommittete Messdateien bytegleich erhalten.
- Browser zunächst mit einem laufenden Abruf, 2500 ms Mindestabstand und Budget
  24/min. Werte bleiben eigene konfigurierbare Einstellungen.
- Gleiche vollständige Abrufparameter teilen Rohantworten. Titelregeln und
  Ausschlüsse werden für jeden beteiligten Filter separat geprüft.
- Wortvarianten sind ausdrückliche bearbeitbare Titelbegriffe mit Alle-/Oder-
  Verknüpfung. Vorschläge für Pufferjacke und Zopfpullover; keine unscharfe
  automatische Bedeutung und keine erfundenen Materialdaten.
- Neues optionales Feld `excluded_title_keywords text[]` / `excludedTitleKeywords`
  für sichtbare Titelausschlüsse. Alte Bedingungen bleiben unverändert.
- Neue Zuordnungstabelle `sniper_query_matches`: eine Artikelzeile, mehrere
  passende aktive Filter. Prüfung von Revision, Aktivzustand und Cursor atomar
  je Übernahme; Erstbestand bleibt still, Favoriten und ältere Funde bleiben.
- Pro begrenztem Planungsschritt ein gemeinsamer Abrufauftrag; bei fehlender
  Überschneidung höchstens drei Seiten mit je 96 Artikeln aufholen. Keine volle
  Seite oder fehlende Überschneidung als Vollständigkeits-/Verlustbeweis ausgeben.
- Diagnosezustand `unknown | initial | caught_up | limited`, keine zugesicherte
  globale Marktabdeckung. Neu planen und Status nach begrenzten Arbeitsschritten.
- Verwaltungsoberfläche darf neu angeordnet werden; Shared Components,
  FormField, Markenfarbe #fcc601, Hell/Dunkel und Zugänglichkeit bleiben verbindlich.
- Private Broadcast-Hinweise ohne Artikelinhalt, berechtigtes Nachladen und
  bestehende Feed-Pause/Favoriten erhalten; Polling bleibt Rückfallebene.

## Schnittstellen

`SniperQuery.excludedTitleKeywords?: string[]` ergänzt das Dienstmodell.
`QueryDraft.excludedTitleKeywords?: string[]` und die optionalen Frontend-Zeilen
`excluded_title_keywords`, `coverage_status`, `coverage_checked_at`,
`last_request_duration_ms`, `shared_filter_count` erlauben alte Fixtures/Antworten.

`complete_sniper_search_filter_run` erhält optionales `p_diagnostics jsonb`
mit `coverage`, `duration_ms`, `source_pages`, `shared_filter_count`. Rückgabe
`{ accepted, created, seeded, hits }` bleibt gleich. Ein begrenztes Ergebnis kann
bis zu 288 deduplizierte Artikel enthalten. Alte Aufrufe ohne Diagnose bleiben
kompatibel; die alte SQL-Signatur darf keine mehrdeutige Überladung hinterlassen.

`save_sniper_search_filter` erhält am Ende das optionale
`p_excluded_title_keywords text[] default '{}'`. Die Datenbank prüft Titelregeln
einschließlich Ausschlüssen zusätzlich selbst. Neue Fachregeln ändern Revision
und stillen Erstbestand; reine Metadaten behalten die bisherige Bedeutung.

## Aufgabe 1: Produktionsfähiger Browserabruf

**Dateien:** `services/sniper/src/browser/`, `runtime/paced-vinted-fetch.ts`,
`config.ts`, zugehörige Browser-/Timing-/Konfigurationstests.

- [x] Rote Fälle für normalen schlanken Abruf, No-store, SW-Grenze,
      reguläre Erneuerung, unerlaubten Redirect, Challenge, Timeout und Abbruch.
- [x] Bestehenden Browser/Profil exklusiv verwenden; nur normale gemeinsame
      Herkunft und Katalogpfade. Warmup, begrenzte Bereinigung und Wiederanlauf.
- [x] Native Transportfehler korrekt klassifizieren und wartende Starts nach
      erkannter Anbieterpause verhindern. Keine parallele Navigation.
- [x] Bestehende Lebenszyklus-/Sitzungsfälle plus neue Fälle und Dienstbau prüfen.

## Aufgabe 2: Geschützte Filterzuordnung und Datenbankvertrag

**Dateien:** `supabase/schemas/108_sniper_search_filters.sql`, gegebenenfalls
neue thematische Schemadatei samt `config.toml`, `supabase/tests/`, generierte
Migration und `src/app/core/models/supabase.types.ts`.

- [x] Rote SQL-Fälle für Mehrfachzuordnung, Ausschlüsse, pausierte/geänderte/
      gelöschte Filter, alte Cursor, stilles Einlesen und Rechte.
- [x] Zuordnungstabelle mit RLS, Einzelpolicies, Indexes, Grants und Kommentaren.
- [x] Bestehende Feed-/Merkzettel-/Zählerpfade auf passende Zuordnungen beziehen,
      historischen Erstentdecker und Favoriten erhalten.
- [x] Private, berechtigte Broadcast-Benachrichtigung als eigener kleiner
      serverseitiger Hinweisweg; keine öffentlichen Artikelpakete.
- [x] Migration mit offizieller CLI aus deklarativem Schema erzeugen,
      transaktional prüfen, lokale Typen generieren und SQL-Fälle ausführen.

## Aufgabe 3: Filterverwaltung und Wortvarianten

**Dateien:** `src/app/features/platform-admin/components/sniper-query-editor/`,
`pages/sniper-queries/`, passende Modelle/Services/Tests,
`e2e/sniper-administration.spec.ts`.

- [x] Klare Gruppen für Warenbereich, Marken, Titelregeln/Varianten,
      Ausschlüsse, Preis und gewünschtes Tempo; verständliche Zusammenfassung.
- [x] Kategoriepfade und echte vorhandene Eigenschaften benutzen. Vorschläge
      bearbeiten/löschen; Pufferweste nicht durch unscharfe Worterkennung einschließen.
- [x] Übersicht mit Suche/Statusfilter, gut lesbaren Bedingungen, laufendem
      Abrufstand, Fehlergrund, Abdeckung, Bearbeiten/Löschen und nötigen Sammelaktionen.
- [x] Modell-/Komponententests, vorhandene Browserfälle einschließlich Hell/Dunkel,
      Touch, Fokus/Tastatur und AXE sowie Angular-Bau ausführen.

## Aufgabe 4: Gemeinsame Planung, begrenztes Aufholen und Feed

**Dateien:** `services/sniper/src/domain/`, `runtime/scheduler.ts`, neuer
`runtime/search-request-planner.ts`, `vinted/collector.ts`, `store/`, `index.ts`,
zugehörige Diensttests; `src/app/features/deal-monitor/`.

- [x] Rote Fälle für fünf/zehn/zwanzig Filter, gleiche Rohabrufe mit
      unterschiedlichen Titelregeln, faire Fälligkeit und unveränderte Grenzen.
- [x] Rohantworten gemeinsam nutzen; erst je Empfänger Titelregeln prüfen.
      Frische Zustände vor Übernahme kontrollieren; alte Antworten niemals zuordnen.
- [x] Fehlerpausen ab tatsächlicher Ablehnung berechnen. Budget, Wiederholungen,
      wartende Starts und globaler Herkunftsstatus bleiben gemeinsam.
- [x] Begrenztes Nachladen mit Diagnose; keine unkontrollierte Warteschlange,
      keine pauschale globale Katalogsuche.
- [x] Private Feed-Hinweise bündeln, nach Wiederverbindung berechtigt abgleichen,
      Cleanup und vorhandene Pause beim Betrachten älterer Artikel erhalten.

## Abschlussprüfung

- [x] Gemeinsame Schnittstellen und ursprüngliche Messfälle aktualisiert prüfen;
      historische Messdaten bleiben unverändert als damaliger Nachweis erhalten.
- [x] Eigene Dateien gezielt formatieren; frisch abrufen, `preflight:plan`,
      `preflight`, Format, Lint und betroffene Prüfungen tatsächlich ausführen.
- [x] Linux-/Browser-/Datenbank- und Image-Grenzen soweit lokal möglich herstellen.
      Produktionsserver wird nicht als CI-Testhost verwendet.
- [x] Unabhängiger Review des gesamten Stands, Fehler gezielt beheben,
      Abschlussprotokoll mit tatsächlichen Ergebnissen und verbleibenden Lücken.
- [x] Nach der vorgeschriebenen Abschlussfrage die Freigabe für PR und Merge abwarten.

Freigabe am 30.10.2026 erteilt: PR erstellen, erfolgreiche Pflichtprüfungen abwarten,
per Merge-Commit integrieren und den eigenen Branch sowie Worktree bereinigen.

## Besondere Review-Fälle

1. Späte Ablehnung einer langen Runde verkürzt keine Anbieterpause.
2. Gleicher Rohabruf mit anderen Titel-/Ausschlussregeln verliert keinen Treffer.
3. Pausieren oder Bearbeiten während Antwort/Nachladen sperrt alte Zuordnung.
4. Volle Seiten und fehlende Überschneidung erzeugen keine falsche Vollständigkeitsanzeige.
5. Broadcasts verraten keine Artikel-/Workspaceinhalte und lösen bei älterer
   Feedseite keinen ungewollten Sprung aus.
