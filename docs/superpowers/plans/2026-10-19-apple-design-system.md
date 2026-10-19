# Apple-orientiertes Flipbase-Design: Umsetzungsplan

## Folgeauftrag Finanzen

Der Nutzerauftrag vom19.10.2026 umfasst nun Ausgaben, Steuer/DATEV samt Bankabgleich und Auswertung vollständig. Bestehende Anordnung und Finanzabläufe bleiben erhalten. Umsetzung, gezielte Prüfungen und verbleibende Abnahmegrenzen stehen im [Finanznachweis](../../design/apple-finance-area.md). Frühere Tabellenbegrenzungen unten sind damit aufgehoben.

## Aktueller Folgeauftrag: gemeinsame Formulargrundlagen umgesetzt

Der freigegebene [Folgeplan](2026-10-19-apple-form-foundation.md) setzt die Befunde des erneuten Audits zentral um. Es gelten die neu gefasste Flipbase-Richtlinie und das dauerhafte Messprotokoll. Gemeinsame Feldrahmen, Rollen, Standardaktionen und Schutz gegen lokale Überschreibungen sind implementiert und auf bestehenden Seiten geprüft. Ältere Formulierungen „nächste Umsetzung“ und ursprüngliche Paketstände unten bleiben Verlauf; sie ersetzen diesen aktuellen Stand nicht. Eine vollständige visuelle Abnahme aller Fachseiten bleibt getrennt.

## Aktuelle Korrektur der Reihenfolge: Formularaudit

Auf ausdrücklichen Nutzerauftrag vom19.10.2026 vor weiteren Seitenumbauten die Quellen erneut geprüft. Der [Formularaudit](../../design/2026-10-19-apple-form-audit.md) mit dokumentierten Browsermessungen hat Vorrang vor älteren pauschalen Maßannahmen. Nächste Umsetzung: gemeinsame Feld-/Schrift-/Abstands-/Aktionsrollen vervollständigen, danach vorhandenen Artikeleditor, Einstellungsformular und Bearbeitungsdialog gemeinsam vergleichen. Erst anschließend weitere Seiten migrieren. Frühere bestandene Funktionstests und Paket-Häkchen ersetzen diese gestalterische Abnahme nicht. Keine Anwendungsänderung in diesem Rechercheauftrag.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein einheitliches Apple-orientiertes Erscheinungsbild für Flipbase schaffen: kompakte Desktop-Bedienung, passende Touchdarstellung und konsistente gemeinsame Komponenten.

**Architecture:** Vorhandene Shared-Komponenten und die bestehende Shell weiterentwickeln. Semantische Gestaltungstokens zentralisieren, globale Altregeln kontrolliert ablösen und reale Einsatzstellen paketweise migrieren. Verhalten, Datenmodelle und Backend bleiben erhalten.

**Tech Stack:** Angular 22, Signals, externe HTML-Templates, Tailwind CSS, vorhandene Lucide-Icons, vorhandenes ApexCharts, Vitest, Playwright und AXE. Keine neue UI-Bibliothek und kein Frameworkwechsel.

**Spec:** [Recherche und Zielbild](../../design/2026-10-19-apple-design-research.md)

**Status:** Planungsstand vom 19.10.2026. Der Nutzer hat Recherche und Planung beauftragt. Paket 1 erzeugt erst den verbindlichen Maßvertrag und die reviewbare Musteransicht; spätere Pakete setzen deren Abnahme voraus. Der spätere Folgeauftrag für gemeinsame Controls ist unten ergänzt.

## Aktuelle Präzisierung: vorhandene Übersicht statt Artikeldemo

Der Nutzer hat die separate Demo abgelehnt und die Überarbeitung der echten bestehenden Übersicht beauftragt. Der erste Entwurf wurde deshalb entfernt. Paket 1 läuft jetzt unter /dashboard im normalen App-Einstieg auf localhost:4201. Die vom Nutzer bereitgestellte macOS-27-Figma-Datei wurde über echte Komponenten und Screenshots geprüft; kein allgemeines separates Apple-Web-UI-Kit gefunden. Konkrete K-Werte aus dem Kit und F-Webanpassungen sind in apple-ui-reference.md dokumentiert.

Dieser Stand enthält bereits die notwendigen eng begrenzten Shared-Anpassungen: CustomSelect mit opt-in-Erscheinung und die freigegebenen Kleidungsplatzhalter. Der globale Systemumbau aus Paket 2 bis 6 gilt dadurch nicht als erledigt. Frühere Häkchen für die verworfene Formular-/Artikeldemo sind kein Nachweis der neuen Seitenabnahme.

## Folgeauftrag: gemeinsame Controls

Der Nutzer hat nach der lokalen Übersicht die Übernahme für gemeinsame Buttons, Eingabefelder und Select-Boxen freigegeben. Der Controlteil aus Paket 2 ist damit beauftragt. Seiten-/Shell-/Tabellenumbau aus Paket 3–6 ist weiterhin kein Bestandteil dieses Schritts. Gleiche Kontrollrollen gelten auch außerhalb der Übersicht; die frühere opt-in-Erscheinung des CustomSelect wird entfernt. Einträge und Quellen im aktuellen apple-ui-reference.md sowie im Änderungsprotokoll prüfen.

## Nutzerkorrektur: passende Rollen und gleiche Shell

Die zuletzt geprüfte Fassung in apple-ui-reference.md ersetzt die frühere pauschale Kapsel- und Rahmenübertragung. Der aktuelle Auftrag umfasst jetzt auch den einheitlichen Header und die Navigation auf allen Verwaltungsseiten. Normale Inhaltsbuttons/Selects6px, Felder7px mit dezenten Konturen, einzelner blauer Fokus und kompakte Tabellenfilter; keine weiteren Fachseiten- oder Tabelleninhaltsumbauten.

## Global Constraints

- Assistentenname Juna; neue Zweige `juna/`; deutsche Du-Texte, englische Codebezeichner.
- Markenfarbe `#fcc601`, bestehende Logos, freigegebene Chartfarben und Diagrammschraffur erhalten.
- Desktop-Dichte und Touch getrennt; gewöhnliche Touchziele mindestens 44×44 CSS-Pixel. Breite allein bestimmt keine Eingabemethode.
- Bestehende globale Inhaltsbreiten 1024/1280/voll erhalten.
- Hell/Dunkel, Tastatur, Fokus, Textzoom, reduzierte Bewegung und deckende Materialalternative gehören zu jedem Paket.
- Keine SF-Pro-Webdateien/SF-Symbol-Sammlung einführen. Schriftstrategie aus Paket 1 verwenden.
- Keine neue Persistenz für einen vorübergehenden Designumschalter, keine Supabase-/Extension-/Veröffentlichungsänderung durch diesen Plan.
- Finanzfolgeauftrag: Ausgaben, Steuer/DATEV samt Bankabgleich und Auswertung vollständig gestalterisch angleichen. Berechnungen, Exporte und Abschnittsfolge erhalten.
- Tests aus tatsächlichen Verbrauchern und `docs/testing/affected-test-selection.md` ableiten; nicht für jede kosmetische Änderung neue Tests schreiben.
- Aktuelle Shopify-Richtlinie erst nach Abnahme des neuen Zielsystems eindeutig ersetzen. Die Recherche selbst ändert keine verbindlichen Standardmaße.
- Keine fremden Zweige oder unversionierten Recherchedateien verändern; bisherige lokale Marktplatzarbeit erhalten.
- Jeder Implementierungs-PR benötigt betroffene Tests, Format/Lint, Typprüfung und bei Angular-/Templateänderungen einen Build. Kein Push oder Merge ohne geltende Nutzerfreigabe.

## Review Focus

- Langer Workspace-/Kontoname, große Schrift oder viele Benachrichtigungen: Header bleibt bedienbar, nichts überlappt, Kontextwechsel-Sperren wirken.
- Tablet mit Touch und Desktopbreite beziehungsweise schmales Mausfenster: Trefferflächen und Informationsdichte werden nicht verwechselt.
- Kategoriebaum, Auswahlpanel und Datepicker im Modal: korrekte Überlagerung, Tastaturführung, Escape und Fokusrückgabe ohne Datenverlust.
- Tabelle mit langen Namen, negativen/fehlenden Zahlen, Mehrfachauswahl und gespeicherter Spaltenordnung: Inhalte bleiben lesbar, Zustände und Präferenzen bleiben erhalten.
- Dunkles Design, Textzoom und reduzierte Bewegung/Transparenz: Kontrast und räumliche Zuordnung bleiben ohne Effekte verständlich.

---

## Paketfolge und Zuständigkeit

| Paket | Lieferbarer Stand                                           | Voraussetzung                                    |
| ----- | ----------------------------------------------------------- | ------------------------------------------------ |
| 1     | Abgestimmte Musteransicht und Maßvertrag                    | Recherche                                        |
| 2     | Verlässliche Tokens und Grundcontrols                       | Musterstand abgenommen                           |
| 3     | Einheitlicher Header, Navigation und Menüs                  | Grundlagen                                       |
| 4     | Einheitliche Formulare, Auswahl und Dialoge                 | Grundlagen; Overlayvertrag mit Header abgestimmt |
| 5     | Einheitliche Datentabellen und konkrete Feature-Verbraucher | Grundlagen und Auswahlcontrols                   |
| 6     | Restliche Verbraucher, Altregeln und abschließende Prüfung  | Pakete 2–5                                       |

Ein Paket kann bei notwendiger Prüfabgrenzung mehrere kleine PRs enthalten. Jeder PR muss einen benutzbaren Zwischenstand liefern. Kein temporäres Nebeneinander zweier kompletter Komponentenbibliotheken.

## Paket 1: Referenz, Maße und Musteransicht

**Dateien**

- Ergänzen: `docs/design/2026-10-19-apple-design-research.md`.
- Neu: `docs/design/apple-ui-reference.md` – Referenzversion, Quellen, Screenshots und vollständige Maß-/Zustandstabelle.
- Nach Abnahme aktualisieren: `docs/design/admin-ui-guidelines.md`.
- Vorhandene Dashboardroute im normalen App-Einstieg lokal gestalten. Keine separate Demo, erfundene Fachfunktionen oder neue Komponenten-Galerie.

**Vertrag**

Jede Messzeile enthält `component, role, platform, osBuild, inputMode, theme, state, sourceClass, source, unit, value`. Quellenklassen: A dokumentierte Apple-Vorgabe, K aus offiziellem Apple-Kit gelesen, M gemessene native Referenz, F Flipbase-Webentscheidung. Webwerte zusätzlich mit CSS-Referenz und Screenshot dokumentieren.

- [ ] macOS-/iPadOS-/iOS-Referenzversion festhalten. Aktuelle HIG nutzen, WWDC25-Beispiele hinsichtlich späterer Änderungen abgleichen.
- [ ] Native Referenzbilder/-messung für Toolbar, Button, Eingabe, Auswahl, Liste/Tabelle und Sheet beschaffen. Fehlt Gerätezugriff, diese Werte ausdrücklich als F statt M kennzeichnen.
- [x] Echte Übersicht mit Header/Navigation, vorhandenen Kennzahlen, Diagramm, letzter-Verkäufe-Tabelle, geöffneten Filtern und bestehendem Inseratmodal in Hell/Dunkel sowie Maus/Touch rendern.
- [x] Semantische Schriftrollen sowie sichtbare Controlgrößen, Trefferflächen, Abstände, Radien und Zustände eintragen. Schriftvorschlag: vorhandene Apple-Systemschrift zuerst, Inter-Fallback auf Windows.
- [x] Kandidaten aus der Recherche prüfen: Desktoprollen 28/32/36px, Touch 44px; Desktop-Lesetext 13–14px; Haupttitel an der nativen 26/32-Referenz abgleichen. Alle sind zunächst F-Vorschläge.
- [ ] Maus/Touch bei gleicher Breite, Hell/Dunkel, 200% Textvergrößerung und deckende Darstellung vergleichen.
- [ ] Reviewbare Bilder und gerenderte Vorschau dem Nutzer zeigen. Erst nach dessen Gestaltungsabnahme die neue Richtlinie und endgültige Tokenwerte festschreiben.

**Abnahme:** Jede verwendete Zahl besitzt eine Herkunft; keine offenen Schätzwerte heißen „Apple-Original“. Größen und Formensprache passen zwischen Header, Formular, Tabelle und Modal zusammen. Keine Produktfunktion geändert.

**Lokaler Stand 19.10.2026:** Echte Übersicht unter localhost:4201/dashboard bereit; separate Artikeldemo entfernt; Maß-/Zustandsvertrag in [apple-ui-reference.md](../../design/apple-ui-reference.md). Referenzgerät-Messung, tatsächliche Textvergrößerung und Nutzerabnahme bleiben offen. Der nachfolgend freigegebene Controlteil aus Paket 2 ist umgesetzt; restliche Migration separat prüfen.

## Paket 2: Tokens, Kaskade und Grundcontrols

**Dateien**

- `src/styles/flipbase-theme.css`
- `src/styles.css`
- `src/app/shared/components/button/button.component.ts`, `.html` und vorhandener Angular-Test.
- `src/app/shared/components/card/card.component.ts` und vorhandener Angular-Test.
- `src/app/shared/components/page-header/page-header.component.ts`, `.html` und vorhandener Angular-Test.
- `scripts/check-admin-shared-ui.mjs` und `.test.mjs` nur bei tatsächlich erforderlicher Anpassung der Regelprüfung.

**Schnittstellen**

Bestehende APIs bewahren: Button `variant/size/density/shape/loading/disabled/iconOnly/link/href/aria*` und `clicked`; Card-Varianten und PageHeader-`appearance`. Keine globale Apple-Variante an jedem Aufruf neu übergeben. Nach Abnahme gelten die neuen Grundlagen als Standard; echte Rollenunterschiede bleiben ausdrücklich benannt.

Tokens erhalten konkrete Namen mit `--fb-`: Textrollen, Controlhöhe, Touchziel, Oberfläche, Trennlinie, Radius, Schatten, Fokus und Bewegung. Werte ausschließlich aus Paket 1. Tailwind-Anbindung und Templates verwenden diese Werte; keine zweite Sammlung gleicher Zahlen in Feature-SCSS.

- [x] Vorhandene Verbraucher/Overrides mit `rg` erfassen und betroffene Testauswahl ausgeben.
- [ ] Das belegte Kaskadenproblem `linear-surface` versus Komponentenradius sowie Header-/Button-Touchabweichungen gezielt absichern; bestehende passende Tests erweitern.
- [ ] Farbrollen und neue Geometrierollen zentral zuordnen; Altaliase nur dort weiterführen, wo unmigrierte Verbraucher sie benötigen.
- [ ] Globale `.fb-admin`-Selektoren, die Komponentenmaße überschreiben, gezielt ablösen. Nicht alle `linear-*`-Klassen blind löschen.
- [ ] Button/Card/PageHeader auf den Maßvertrag umstellen. Form-/Link-/disabled-/loading-Semantik erhalten.
- [x] Bestehende Komponentenfälle und betroffene Verbraucher ausführen, gerenderte Werte in Hell/Dunkel und Maus/Touch vergleichen.
- [ ] Format/Lint, Typprüfung, Shared-UI-Audit und Build prüfen; Änderungen und verbleibende Altverbraucher protokollieren.

**Abnahme:** Computed Styles stimmen mit dem Vertrag überein. Standard und Dashboardvarianten sind bewusst zugeordnet; keine globale CSS-Regel setzt unbemerkt einen anderen Radius oder eine andere Höhe.

## Paket 3: Header, Sidebar und Menüs

**Dateien**

- `src/app/layout/header/header.component.ts` und `.html`.
- `src/app/layout/sidebar/sidebar.component.ts` und `.html`.
- `src/app/layout/shell/shell.component.html`.
- `src/app/layout/bottom-nav/bottom-nav.component.html`.
- Bestehende Tests in diesen Verzeichnissen.
- `e2e/sidebar-navigation.spec.ts`, betroffene bestehende Header-/Workspacefälle.
- Optionaler neuer Shared-Baustein nur bei nachgewiesenem Bedarf mehrerer Menüs; Name und API in einem kleinen Folgeplan festlegen, bevor er gebaut wird.

**Schnittstellen**

Vorhandene Workspace-/Auth-/Notification-/PWA-Dienste und Shell-Outputs bleiben bestehen. Reine visuelle Shared-Bausteine laden keine Daten. Workspace-Wechsel bleibt während gesperrter Erfassungen gesperrt. Glocke, Theme, Profil bleiben in dieser Reihenfolge.

- [ ] Bestehende Tests für Rollen, Timer, Benachrichtigungsaktionen, Workspace-Sperren und Navigation als relevanten Prüfumfang bestimmen.
- [ ] Langen Workspace-/Benutzernamen, viele ungelesene Meldungen und Touch bei Desktopbreite als gezielte Risikofälle sichern.
- [ ] Header gemäß Muster gruppieren: Kontext links, globale Funktionen rechts, gemeinsame optische Achse; unnötige Einzelrahmen entfernen.
- [ ] Alle Trigger auf denselben Control-/Trefferflächenvertrag bringen. Native button-Tags dürfen semantisch richtig bleiben; bloßes Ersetzen durch app-button ist kein Ziel.
- [ ] Workspace-, Benachrichtigungs- und Profilpanel hinsichtlich Verankerung, Randkollision, Fokus und Escape abstimmen. Echte Menüs und Benachrichtigungsinhalte nicht mit identischen ARIA-Rollen versehen.
- [ ] Sidebar, aktive Zeile, Gruppenlabels und mobile Navigation angleichen. Keine macOS-Fensterampeln und keine übernommene Electron-Titelleiste.
- [ ] Kontextwechsel, Notifications, Theme, Profil, schmale Ansicht, Fokus und Touch mit den betroffenen bestehenden Fällen prüfen; PWA-Prüfungen bei berührten PWA-Abhängigkeiten gemäß Auswahl ausführen.

**Abnahme:** Navigation wirkt zusammengehörig, lange Inhalte verdrängen keine Aktion und Maus-/Touchgrößen sind konsistent. Alle fachlichen Sperren bleiben wirksam.

## Paket 4: Formulare, Auswahl und Dialoge

**Dateien**

- `src/app/shared/components/text-field/`, `number-input/`, `custom-search-input/`, `custom-checkbox/`, `date-picker/`.
- `src/app/shared/components/custom-select/`, `search-multi-select/`, `category-picker/`, `attribute-picker/`, `brand-picker/`, `article-picker/`.
- `src/app/shared/components/modal-shell/`, `confirm-dialog/`, `workspace-modal/`.
- `src/app/shared/directives/modal-dialog.directive.ts` nur soweit für geprüfte Interaktionskorrekturen nötig.
- Vorhandene Angular-Tests dieser Bausteine.
- `e2e/date-picker-layer.spec.ts`, `e2e/marketplace-overview.spec.ts`, `e2e/marketplace-accounts.spec.ts`, `e2e/vinted-kleinanzeigen-transfer.spec.ts` sowie weitere tatsächliche Verbraucher laut Auswahl.

**Schnittstellen**

ControlValueAccessor und bestehende Signal-/Outputverträge erhalten; Select `options/searchable/value/variant/size/disabled/ariaLabel`; TextField `label/type/multiline/error/helpText`; ModalShell `title/subtitle/size/presentation/hasFooter/closeOnBackdrop/closed`. Keine Anbieter- oder Kategorie-IDs ändern.

- [ ] Eingabe, Fehler, Required-/Disabled-Zustände, Labels und Touchgrößen an gemeinsame Rollen binden.
- [ ] Flache Auswahl, durchsuchbare Auswahl, Mehrfachauswahl und Kategoriebaum visuell verwandt gestalten, ihre Bedienung aber passend zur Aufgabe erhalten.
- [ ] Kategoriepfade und fehlende/veraltete Kategoriezuordnungen erhalten; Filter aus dem vorherigen Auftrag nicht verändern.
- [ ] Panelplatzierung und Scrollen innerhalb von Modalen prüfen: Select/Datepicker über der richtigen Ebene, kein abgeschnittener Inhalt.
- [ ] Modal-Titel, Inhaltsabstände und Aktionszeile gemäß Muster vereinheitlichen. Keine neue Card-in-Card-Struktur; kein doppelter Schließen-Button ohne Aufgabenbedarf.
- [ ] Bestehende Marktplatz-Kontoköpfe einpassen: Logo links, Name/Typ daneben zentriert, Status rechts; Hinzufügen-Auswahl und Verbindungsabläufe erhalten.
- [ ] Ungespeicherte Änderungen, Escape, Fokusrückgabe und verschachtelte bestehende Dialoge anhand konkreter Aufgaben prüfen; keine Aufgaben durch automatisches Schließen verlieren.
- [ ] Komponenten- und ausgewählte Browserfälle ausführen, AXE und Tastatur ergänzend prüfen. Reale Konten-/Veröffentlichungsaktionen in visuellen Tests ausschließlich simulieren.

**Abnahme:** Eingabe und Auswahl fühlen sich zusammengehörig an, behalten aber ihren fachlichen Zweck. Inseratvorbelegung, Gebührenstopp und Kontoverknüpfung funktionieren unverändert.

## Paket 5: Tabellen und erste vollständige Feature-Migration

**Dateien**

- `src/app/shared/components/data-table/data-table.component.ts` und `.html`.
- `src/app/shared/components/table-action-button/`, `table-sort-header/`, `table-column-menu/`, `table-column-picker/`.
- `src/app/shared/components/badge/`, `notice-banner/`, `loading-indicator/`.
- `src/app/features/inventory/`, `purchases/`, `sales/` und konkrete Marktplatz-Verbraucher: tatsächliche Tabellen-Templates vor jedem Teil-PR mit `rg` bestimmen.
- Vorhandene DataTable-/Sortier-/Spaltenmenütests und `e2e/table-sorting.spec.ts`; weitere bestehende Fachfälle laut Auswahl.

**Schnittstellen**

DataTable-Eingänge, Suche, Sortier-/Spaltenereignisse und Projektion behalten. Gespeicherte Tabellenpräferenzen werden weder gelöscht noch auf neue Standards zurückgesetzt. Dashboard-Vorschautabelle bleibt eine eigenständige Rolle und erhält nicht unpassende Verwaltungsfunktionen.

- [ ] Eine echte Artikeltabelle als ersten vollständigen Verbraucher wählen und alle zugehörigen Filter-, Zeilen- und Mobiltemplates erfassen.
- [ ] Toolbar, Filter, Spaltenkopf, Zeilen, Zahlen, Badges, Aktionsstellen und Pagination gemäß Maßvertrag umstellen.
- [ ] Lange Artikeltexte, fehlende/negative Werte, viele Spalten und Mehrfachauswahl anhand bestehender Fälle prüfen; nur konkrete Lücken ergänzen.
- [ ] Desktop-Dichte und Touchtrefferflächen gemeinsam prüfen; mobile Karten nicht unlesbar in Desktopzeilen zwängen.
- [ ] Nach erster Abnahme weitere Tabellenfamilien getrennt migrieren; Steuer/DATEV dabei nur im vereinbarten Tabellenumfang.
- [ ] Laden, Fehler, leerer Bestand und leere Suchtreffer gleichwertig gestalten.
- [ ] Sortierung, Auswahl, Präferenzen nach Neuladen und Datenaktionen mit ausgewählten bestehenden Tests absichern.

**Abnahme:** Der gemeinsame Rahmen und die projizierten Tabellen stimmen überein; kein „Apple-Rahmen“ um unverändert abweichende Featuretabellen. Datenlesbarkeit und bestehende Präferenzen bleiben erhalten.

## Paket 6: Restliche Verbraucher, Bereinigung und Abschluss

**Dateien**

- Noch nicht migrierte Shared-Medien-/Picker-/Historien-/Chart-/Dialogbausteine und ihre tatsächlichen Feature-Verbraucher.
- `src/styles.css`, `src/styles/flipbase-theme.css`.
- `docs/design/admin-ui-guidelines.md`, `docs/design/apple-ui-reference.md`, `docs/AI-CHANGELOG.md`.
- Bei neuen/verschobenen Tests: `scripts/affected-tests.mjs`, zugehörige Tests und verbindliche Registrierungslisten.

- [ ] Verbraucher- und Override-Liste aus Paket 2 erneut prüfen; ungelöste Abweichungen benennen.
- [ ] Medien-/Scanner-/Rechnungs-/Historienansichten nach denselben Grundlagen angleichen, ohne Fachfunktionen umzubauen.
- [ ] Nicht mehr benötigte Aliase und Varianten erst bei nachgewiesener Nichtverwendung entfernen; keine neuen SCSS-Sonderregeln für vermeidbare Abweichungen.
- [ ] Repräsentative Browsermatrix ausführen: bestehende CI-Browser/Breiten/Themes plus Touch; echte Safari-/Apple-Geräteprüfung für Systemschrift und Materialwirkung gesondert dokumentieren. Playwright-WebKit nicht als identischen echten Safari ausgeben.
- [ ] Tastatur, AXE, 200% Textzoom, schmale Reflowansicht, reduzierte Bewegung und deckende Materialalternative prüfen. Automatische AXE-Freiheit nicht als vollständigen WCAG-Nachweis ausgeben.
- [ ] Bei globalen Styles die breite betroffene Testauswahl akzeptieren; CI-Registrierung prüfen. Keine neue vollständige Suite pro kleiner Nachkorrektur, wenn zielgerichtete Prüfungen genügen.
- [ ] Referenzbilder, Messwerte, Prüflücken und Migrationsabschluss dokumentieren.
- [ ] Vor jedem Abschluss geltende PR-Freigabe einholen beziehungsweise bereits erteilte eindeutige Freigabe beachten; Pflichtprüfungen und Merge-Regeln vollständig einhalten.

**Abnahme:** Ein gemeinsames System ohne parallele Altgestaltung in den vereinbarten Bereichen. Offene native Geräteprüfungen oder Ausnahmen sind ausdrücklich dokumentiert.

## Nicht Teil des Umbaus

Keine neuen Marktplatzprozesse, Datenmigrationen, Veröffentlichungsfreigaben, Gebührenregeln, Kontenmodelle oder automatische Reparaturen von Bestandsdaten. Der visuelle Umbau muss die bereits abgestimmten Funktionen erhalten. Ebenso keine öffentliche Ankündigung allein aufgrund des Design-PRs.

## Nächster konkreter Schritt

Nach Zustimmung zum Vorgehen Paket 1 umsetzen: eine **gerenderte**, klickbare Musteransicht aus echten Flipbase-Bausteinen und ein nachvollziehbarer Maßvertrag. Erst diese Ansicht entscheidet über die globalen CSS-Werte; ein weiteres generiertes Bild allein wäre dafür kein belastbarer Nachweis.

## Folgeauftrag: Tabellen und Modale, direkt auf bestehenden Seiten

Der Nutzer hat den Tabellen-/Modalteil aus Paket4/5 nun ausdrücklich beauftragt. Geteilte Tabellenregeln, Sortierkopf, ModalShell und ConfirmDialog sowie vorhandene eigene Shared-Fensterrahmen sind umgesetzt. Bestehende Einkaufsseite und Verkäuferformular dienen dem echten Vorher-/Nachhervergleich (Hell/Dunkel;1440pxMaus/834pxTouch). Dashboard-Spezialtabelle und weiße Papieransichten bleiben eigenständig.

Zusätzliche belegte Fokus-/Schließfehler behoben; Details/Quellen und Webmaße im apple-ui-reference.md. Der aktuelle AI-Changelog enthält Prüfungen und Grenzen. Dies erledigt den visuellen Tabellen-/Modalrahmen dieses Folgeauftrags; die vollständige Verbraucher-/CI-/PWA-Freigabe aus Paket6 sowie reale Apple-Geräteabnahme bleiben gesondert offen. Keine ungeprüften alten Planhäkchen als Gesamtabnahme lesen.

## Korrekturauftrag Finanzen vom 19.10.2026

Der erste kosmetische Angleich wurde abgelehnt. Die aktuelle ausdrückliche Freigabe umfasst die grundlegende Anordnung aller drei Finanzbereiche und ihres Bankabgleichs. Sieben auswählbare Analytics-Bereiche, zentrale Warnfarben ohne Braun, einheitlicher Monatsselect, gebündelte Summen und klare Kopfaktionen. Artikel und übrige Seiten behalten ihre Layoutgrenze. Details und aktuelle Prüfgrenzen: [Finanzbereich](../../design/apple-finance-area.md).
