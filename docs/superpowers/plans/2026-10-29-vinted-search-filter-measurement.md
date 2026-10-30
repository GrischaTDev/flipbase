# Vinted-Suchfilter: Mess- und Umsetzungsplan

> Durchführung anhand von `superpowers:executing-plans` in einzeln prüfbaren
> Schritten. Dieser Plan beauftragt noch keinen Produktivumbau oder zusätzlichen
> Lastverkehr. Der Nutzer hat das Einplanen des Messlaufs bestätigt.

**Ziel:** Tatsächliche Verzögerung, Abrufkapazität und mögliche Trefferlücken
bestimmen und daraus den nötigen Ausbau für zehn bis zwanzig Filter ableiten.

**Architektur:** Bestehenden zentralen Vinted-Abruf als Ausgangspunkt vermessen.
Suchfilter und echte Abrufaufträge trennen; nur ausreichend abdeckende Abrufe
gemeinsam nutzen. Nachgewiesen bessere Abrufwege bleiben ausdrücklich zulässig.

**Technik:** Vorhandener Angular-/Node-/Supabase-Aufbau, keine neue Abhängigkeit
für die Planung.

**Grundlage:** [Recherche und technische Entscheidung](../../research/2026-10-29-vinted-search-filter-research.md).

## Verbindliche Grenzen

- Neue passende Artikel sollen innerhalb weniger Sekunden erscheinen; ein
  mehrminütiger Durchlauf ist nicht das angestrebte Ergebnis.
- Bestehende Filter, Favoriten, Datenzugriffe und bestätigte Anbieterpausen
  erhalten. Kein zusätzliches Konto und keinen Anbieter buchen.
- Historische Messwerte kennzeichnen und nicht als aktuelle Produktion ausgeben.
- Keine Filter für eine Messung ungefragt in der Produktion aktivieren.
- UI-Anordnung in diesem ausdrücklich beauftragten Bereich darf verbessert
  werden. Vorhandene Shared Components und Markenfarbe `#fcc601` nutzen.
- Produktänderungen benötigen die projektspezifischen lokalen Prüfungen und vor
  Push/PR den vollständigen verbindlichen Vorabcheck. Dieser Plan ist kein
  Prüfbericht.

## Besonders zu prüfen

1. Mehrere Marken und alternative Begriffe erzeugen wesentlich mehr Abrufe als
   die sichtbare Filterzahl.
2. Ein gemeinsamer breiter Abruf kann enge Suchen aus seiner ersten Seite
   verdrängen. Weniger Anfragen allein sind deshalb kein Erfolgsnachweis.
3. Während einer laufenden Antwort pausierte, gelöschte oder geänderte Filter
   dürfen keine alte Zuordnung erhalten.
4. Lange erfolgreiche Runden dürfen nicht als Stillstand gelten; ein festhängender
   Browser muss weiterhin erkannt werden.
5. Ein schneller Fund-bis-Anzeige-Wert darf nicht als Veröffentlichung-bis-Anzeige
   ausgegeben werden, wenn der Veröffentlichungszeitpunkt unbekannt ist.

## Schritt 1: Aktuellen Betrieb und Messbarkeit feststellen

**Vorhandene Prüfstellen:**
`services/sniper/src/config.ts`, `runtime/request-metrics.ts`,
`runtime/scheduler.ts`, `runtime/collector-watchdog.ts`, `health.ts`, `index.ts`,
`store/query.store.ts` und `src/app/features/deal-monitor/deal-monitor.component.ts`.
Die relativen Laufzeitpfade liegen unter `services/sniper/src/`.

- [ ] Tatsächlich ausgerollte Version, aktive Filter, Teilabfragen, eingestellte
      Abstände und letzte erfolgreiche Abrufe ausschließlich lesend feststellen.
- [ ] Verfügbare bestehende Logs/Messwerte und deren Zeitbasis prüfen. Wenn kein
      aktueller Betreiberzugang vorhanden ist, diese konkrete Messlücke ausweisen;
      keine aktuellen Zahlen aus Standardwerten ableiten.
- [ ] Eine Zeitkette aus Quellverfügbarkeit, eigenem Fund, Speicherung und Anzeige
      definieren. Nur tatsächlich verfügbare Zeitpunkte verwenden. Fotozeitstempel
      und bereits gespeicherte Fundzeit ersetzen keine Veröffentlichung.
- [ ] Für einen ersten Ist-Vergleich 30 Minuten regulären Artikelzulauf vorsehen,
      ohne zusätzliche Vinted-Suchanfragen und ohne Filterumschaltungen. Bestehende
      Daten verwenden, sofern sie den Zeitraum zuverlässig abdecken.

**Ergebnis:** Aktueller Ausgangsbericht mit Filter-/Abrufzahl, Abständen,
Antwortdauer, Fehlern, Speicher und ausdrücklich benannten fehlenden Messwerten.
Dieser Schritt enthält noch keine Zusicherung der Ende-zu-Ende-Verzögerung.

## Schritt 2: Fünf, zehn und zwanzig Filter kontrolliert nachstellen

**Prüfstellen:** Vorhandene Tests unter `services/sniper/test/runtime/`,
`services/sniper/test/domain/` und `services/sniper/test/vinted/`; vorhandene
Katalog-Testantworten als Ausgangspunkt. Keine Produktionsdaten kopieren.

- [ ] Eine lokale Lastmatrix aus fünf, zehn und zwanzig Filtern sowie zusätzlichen
      Marken-/Begriffskombinationen festlegen; enge und breite Bereiche mischen.
- [ ] Gespeicherte oder künstliche Katalogantworten mit wenig und viel Zulauf,
      langsamen Antworten, leeren Ergebnissen und wiederholten Artikeln verwenden.
- [ ] Die tatsächliche bestehende Planung ausführen und Wartezeit je Filter,
      vollständige Durchläufe, Rückstau und Fortschrittsmeldungen erfassen.
- [ ] Anbieterpause, Browserausfall sowie Filteränderung während einer Antwort
      nachstellen. Bestehende Absicherungen gegen veraltete Antworten nachweisen.
- [ ] Ist-Planung mit gemeinsamen identischen Abrufen und passenden breiteren
      Gruppen vergleichen. Für jede Gruppe auch verdrängte enge Treffer zählen.

**Ergebnis:** Vergleich von Kapazität, Abdeckung und Robustheit. Lokale Antworten
belegen keine heute erreichbare Geschwindigkeit der externen Quelle.

## Schritt 3: Abruf gezielt verbessern und live vergleichen

- [ ] Aus den Ergebnissen den konkreten Eingriff auswählen: gemeinsame Planung,
      begrenzte Aufholung, Fehlerbehandlung oder begründet besserer Abrufweg. Keine
      unbewiesene Anbieterarchitektur nachbauen.
- [ ] Nur den ausgewählten Eingriff umsetzen und passend zur Änderung prüfen.
      Vergleichbare Daten und Rahmenbedingungen für vorher/nachher verwenden.
- [ ] Nach regulärer Freigabe und Veröffentlichung einen zweistündigen
      Betriebsvergleich vorsehen. Das ist ein erster Belastungsnachweis und keine
      Zusicherung dauerhafter Verfügbarkeit.
- [ ] Median und langsame Fälle der messbaren Verzögerung, erfolgreiche Abrufe,
      Ablehnungen, Trefferlücken, Speicherentwicklung und Wiederanlauf vergleichen.
- [ ] Nur dann Sekundenaktualität melden, wenn der gemessene Zeitabschnitt diese
      Aussage trägt. Sonst den verbleibenden Engpass und die nächste technische
      Konsequenz nennen.

**Ergebnis:** Begründete Auswahl des Abrufaufbaus mit vorher/nachher und klaren
Grenzen des Nachweises.

## Unabhängig vorbereiten: Filteranlage und Admin-Ansicht

**Bestehende Dateien:**
`src/app/features/platform-admin/components/sniper-query-editor/`,
`pages/sniper-queries/`, `models/sniper-query.model.ts`,
`services/sniper-admin.service.ts` und `services/sniper-admin-state.ts`.
Relative Pfade liegen unter `src/app/features/platform-admin/`.

- [ ] Die neue Anlage um klare Kategoriepfade, Marken, Eigenschaften,
      Wortvarianten, Ausschlüsse und eine verständliche Zusammenfassung planen.
      Fehlende Quelldaten nicht als sichere Eigenschaften darstellen.
- [ ] Die Verwaltung um lesbare Bedingungen, tatsächlichen Abrufstand und klare
      Statusursachen ordnen. Aktivieren/Pausieren, Bearbeiten und Löschen erhalten.
- [ ] Anbindung an die bestehende API festlegen; neue gemeinsame Abrufsteuerung
      intern ergänzen, ohne die Oberfläche von ungeprüften Geschwindigkeitsannahmen
      abhängig zu machen.
- [ ] Bestehende passende Fälle in `e2e/sniper-administration.spec.ts` und den
      zugehörigen Angular-/Modelltests auswählen. Hell/Dunkel, Maus/Touch, schmale
      Ansichten, Tastatur und AXE berücksichtigen; Angular-Bau ausführen.

**Ergebnis:** Umsetzbare Oberfläche unabhängig von der Entscheidung über den
genauen Abruftransport. Zusätzliche Agenten sind damit nicht beauftragt.

## Stand dieser Sitzung

Recherche und Planung erstellt, vorhandene Konkurrenzuntersuchungen erneut
gelesen. Noch kein Messlauf gestartet, keine Messdaten erhoben und keine
Produktfunktion geändert. Alle Prüfschritte bleiben offen, bis sie tatsächlich
ausgeführt und nachgewiesen wurden.
