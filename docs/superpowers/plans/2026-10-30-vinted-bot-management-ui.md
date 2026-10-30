# Vinted-Bot-Verwaltung nach dem freigegebenen Mockup

> Ausführung: `superpowers:executing-plans`, direkt in dieser Sitzung. Die Gestaltung und ihre Umsetzung sind vom Nutzer freigegeben. Ein unabhängiger Abschlussreview folgt nach der Umsetzung.

**Ziel:** Die reale Filterverwaltung übernimmt die freigegebene Kachel-/Kompaktansicht, das Zahnradmenü und Seitenpanels; bestehende Botlogik und Schutzfunktionen bleiben erhalten.

**Architektur:** Feature-Komponenten unter `platform-admin` steuern nur Darstellung und bestehende Serviceaufrufe. Die bisherige innere Sidebar entfällt. Details und Botbetrieb öffnen über `app-modal-shell` als Drawer; bestehende Betriebsadressen bleiben erreichbar. Die bestehende Editorlogik samt Kategoriebaum, Markensuche, Titelverknüpfung und Validierung wird weiterverwendet.

**Technik:** Bestehendes Angular 22, Signals, Tailwind im Template, vorhandene Shared Components. Keine neuen Abhängigkeiten, Migrationen oder Backendänderungen.

**Vorlage:** Freigegebene Vorschau und Designnotiz unter `C:/Users/Grisc/.codex/visualizations/2026/10/30/vinted-bot-redesign-mockup/`; zusätzliche Nutzerkorrektur: einzelnes Zahnrad statt „… Mehr“. Maßgeblich bleiben `docs/design/admin-ui-guidelines.md` und `apple-ui-reference.md`.

## Verbindliche Grenzen

- Globale Appnavigation, Abfragen, Zeitpläne, Broadcasts, Datenbank und Rechte erhalten.
- Neue und fachlich geänderte Suchfilter bleiben entsprechend der vorhandenen Speicherlogik pausiert. Keine automatische Aktivierung aus dem wegwerfbaren Mockup übernehmen.
- Keine erfundenen Laufzeiten, Erfolge oder Vollständigkeit. Veraltete/fehlgeschlagene Betriebsstände erkennbar lassen.
- Alte Routen und die vollständige Kategorienpflege bleiben erreichbar.
- Nur eigene Arbeitskopie und eigener `juna/`-Zweig; Protokolle der Mockup-Sitzungen erhalten.
- Vor einem Push: Projekt-Preflight, Format und Lint; PR/Merge erst nach der vorgeschriebenen Nutzerfrage.

## Review-Schwerpunkte

1. Teilweise fehlschlagende Mehrfachaktionen: erfolgreiche Änderungen nachladen, Fehler und verbleibende Auswahl sichtbar halten.
2. Aktualisierungen während einer Auswahl oder eines offenen Details: aktuelle Zeile verwenden, entfernte Filter nicht weiter bearbeiten.
3. Eingebettete Aktionen öffnen keine Filterdetails; Zahnrad bleibt per Tastatur bedienbar und erhält nach Escape den Fokus zurück.
4. Ungespeicherte Änderungen und laufendes Speichern: vorhandene Verwerfbestätigung und Routenschutz erhalten.
5. Alter/fehlerhafter Botstand und begrenztes Aufholen: keinen laufenden/erfolgreichen/vollständigen Betrieb vortäuschen.

## Aufgabe 1: Darstellungsmodell und Zahnradrolle

**Dateien:** Neue `models/sniper-filter-presentation.ts` und passende `.spec.ts`; Shared `table-action-menu.component.ts/.html`; bestehende Menütests ergänzen.

**Schnittstellen:** Reine Funktionen `filterNeedsAttention(query: SniperQuery): boolean`, `filterCategoryLabel(query, paths): string`, `filterBrandLabel(query): string`, `filterPriceLabel(query): string` und `filterIntervalLabel(milliseconds: number): string`. Bestehende Abfragestatus/-daten unverändert verwenden. Das Shared-Menü bekommt einen optionalen Icon-Eingang; Standard bleibt das bestehende Symbol.

- [x] Zuerst Fälle für begrenzte Abdeckung, pausierte historische Fehler, fehlende Marke/Kategorie, offene Preisgrenzen und Sekunden/Minuten schreiben und rot ausführen.
- [x] Reine Darstellungsfunktionen implementieren; gezielte Modelltests grün ausführen.
- [x] Zahnrad über den gemeinsamen Menübaustein unterstützen und dessen bestehende Verbraucher prüfen.

## Aufgabe 2: Filterfläche und sichere Bedienung

**Dateien:** `pages/sniper-queries/sniper-queries.component.ts/.html`, neue Feature-Komponente `components/sniper-filter-card/`, neues Detailtemplate/-komponente, bestehende Komponenten- und Browserfälle.

**Schnittstellen:** Filterkarte erhält `query`, `category`, `finds`, `selected`, `compact`, `disabled`, `pending`, `manualRequired`, `currentTime`; Ausgaben `opened`, `selectionChanged`, `toggled`, `edited`, `duplicated`, `deleted`. Elternkomponente behält `save`, `toggle`, `delete`, ergänzt `setSelected`, `setSelectedActive`, Detail-/Betriebszustand und Sortierung. Mutationen ausschließlich über vorhandene `SniperAdminService`-Methoden.

- [x] Reale Verhaltensfälle für Ansichts-/Statuswechsel, Auswahl, unterbrochene Mehrfachaktionen und unveränderte Aktivierungsdiagnose ergänzen und rot prüfen.
- [x] Kopf, Betriebszusammenfassung, Werkzeugzeile, Kacheln/Kompakt, Leer-/Lade-/Fehlerzustände mit Shared Components umsetzen.
- [x] Details mit allen bisherigen Bedingungen und exakten Abrufdiagnosen; Zahnradmenü und Rückfokus erhalten.
- [x] Mehrfachänderungen seriell ausführen, vorhandene Statusmutation nutzen und einmal nachladen; keine erfolgreiche Gesamtaktion bei Teilfehlern melden.
- [x] Gezielte Komponenten- und Browserfälle grün prüfen.

## Aufgabe 3: Editor und Botbetrieb zusammenführen

**Dateien:** `vinted-bot-shell.component.ts/.html`, `platform-admin.routes.ts`, `sniper-operation.component.ts/.html`, `sniper-query-editor.component.ts/.html` und zugehörige bestehende Tests.

**Schnittstellen:** Hülle enthält einen RouterOutlet mit gemeinsamem `SniperAdminState`; bestehende Routen unverändert. Operation kann eingebettet ohne zweiten Seitenkopf erscheinen. Editor erhält `duplicate: boolean`, erzeugt dabei einen neuen pausierten Filter mit `id/revision = null`. Bestehendes `QueryDraft` bleibt unverändert.

- [x] Routen-/Hüllenfälle auf durchgehende Fläche und weiterhin erreichbaren Betrieb umstellen; Duplizierung und Schutz ungespeicherter Änderungen absichern.
- [x] Innere Sidebar ersetzen; Botbetrieb im Drawer und per bisheriger Route bereitstellen, Kategorienpflege/Browserprüfung erhalten.
- [x] Editor in verständliche Gruppen gliedern; Kategoriebaum, Marken-/Titelregeln, Suchtext, Preis, Tempo und Notizen vollständig erhalten. Speichern weiter über vorhandenen Ablauf.
- [x] Betroffene Tests inklusive tatsächlicher Speicherdaten grün prüfen.

## Aufgabe 4: Prüfung und Abschluss

- [x] Eigene Dateien gezielt mit installierter Prettier-Version formatieren und Diff kontrollieren.
- [x] `npm run preflight:plan`, dann `npm run preflight` unter Node 22 mit gesperrten Abhängigkeiten ausführen; fehlende Format-/Lintprüfungen ergänzen.
- [x] Bestehende betroffene Browserfälle an neue Rollen anpassen; erforderliche Breiten, Hell/Dunkel und Touch gegen ruhende Vorschau prüfen. Keine echten Backendzugriffe.
- [x] Screenshots außerhalb des Worktrees sichern und selbst visuell mit der freigegebenen Vorschau vergleichen.
- [x] Unabhängigen Abschlussreview ausführen; konkrete Befunde beheben und passende Prüfungen erneuern.
- [x] Sitzungseintrag mit tatsächlichen Befehlen/Ergebnissen ergänzen. Erst anschließend die vorgeschriebene Frage nach PR und Merge stellen.
