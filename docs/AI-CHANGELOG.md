# 🤖 KI-Änderungsprotokoll

## 2026-10-01 – Juna – Bot-Verwaltung für PR und Merge freigegeben

**Auftrag:** Nach ausdrücklichem „ja“ den geprüften Bot-Verwaltungszweig pushen,
einen PR erstellen, alle Pflichtprüfungen abwarten und per Merge-Commit integrieren.
Anschließend veröffentlichte Version und Oberfläche prüfen und den eigenen
Remote-/lokalen Zweig samt Worktree aufräumen.

**Vorbereitung:** Geprüfter Implementierungsstand `6c694104`; inzwischen
veröffentlichten Hauptstand `3c02a477` in den eigenen Zweig integriert. Beide
Changelog-Einträge erhalten; Datenbanktypen enthalten beide Erweiterungen.
Die Migration bleibt transaktional und nicht destruktiv. Der freigegebene
Releaseweg führt Backup, Migration, Anwendung und öffentlichen Versionscheck aus.
Keine zusätzlichen Nachrichten an Dritte oder Änderungen produktiver Markenfilter.

## 2026-10-01 – Juna – Vinted-Markenfilter und Botbetrieb verständlicher bedienen

**Auftrag:** Zwei Hauptbereiche umsetzen: Markenfilter zum Anlegen, Bearbeiten,
Pausieren und Löschen; Botbetrieb mit verständlichem Status und untergeordneter
Kategorienpflege. Suchfeld, Schließen der Markenauswahl und fehlende Löschaktion
anhand der angemeldeten Oberfläche prüfen.

**Befund:** Die Markenauswahl war bereits ein Shared-Baustein, verwendete aber
ein eigenes natives Suchfeld. Die Startliste sind Vorschläge; eine Suche nach
Patagonia lieferte in der vorhandenen Oberfläche weitere Marken. Escape konnte
den übergeordneten Dialog schließen. Die feste Listenhöhe überdeckte trotz eines
einzelnen Treffers das Notizfeld und verhinderte einen Klick auf dieses Feld.
Die Kategorien versorgen persönliche Suchfilter; zentrale Markenfilter sammeln
kategorieübergreifend. Eine Kategorienzahl ist daher keine Auftragsverwaltung.

**Änderung:** Die Auswahl verwendet das gemeinsame Suchfeld mit eigenem X,
passt ihre Höhe den Treffern an und schließt bei Klick außerhalb, Escape oder
über eine ausdrückliche Schaltfläche. Escape bleibt innerhalb der Auswahl;
Pfeiltasten und Enter lösen keine erneute Suche aus. Navigation auf zwei Bereiche
reduziert, alte Kategorienadresse weitergeleitet. Im Botbetrieb stehen Zugriff,
aktive Marken und aktuelle Fehler zuerst; technische Details und Kategorienpflege
sind aufklappbar. Die Kategorienpflege erklärt ihren Zweck und verhindert doppelte
Anforderungen während eines ausstehenden Einlesens.

**Löschen:** Bestätigte zentrale Filter werden über eine geschützte Funktion
entfernt und pausiert. Ihre technische Herkunft bleibt für bestehende Funde,
Favoriten und bereits laufende Abfragen erhalten. Die Administration blendet
entfernte Filter aus; erneutes Hinzufügen derselben Marke verwendet den vorhandenen
Datensatz und startet pausiert. Tabellenregel verhindert das Aktivieren entfernter
Filter. Deklaratives Schema angepasst, Migration per CLI aus einer isolierten
Datenbank erzeugt und Typen neu generiert. Zwei vorher abweichende Meldungen im
Schema an das bestehende geprüfte Verhalten angeglichen.

**Arbeitsstand:** Eigener Zweig `juna/vinted-filter-usability` von `origin/master`
(`fd4dc95f`). Keine neuen Abhängigkeiten, keine produktiven Filteränderungen.
Veröffentlichung und anschließende Pflichtprüfungen stehen noch aus.

**Prüfung:** 43 gezielte Angular-Prüfungen erfolgreich, einschließlich Suche,
veralteter Antworten, Escape innerhalb der Auswahl, Enter ohne Suchneustart,
Navigation, Kategorienstatus und eingeschränkter Verwaltungsfunktionen.
Migration auf einer getrennten lokalen Datenbank vollständig erneut eingespielt;
118 Datenbankprüfungen einschließlich Berechtigungen, Filterentfernung, vorhandener
Funde, laufender Abrufe und erneutem Hinzufügen erfolgreich. Typprüfung, Bau,
Format/Lint und Shared-UI-Prüfung (122 Dateien, keine Befunde) grün. Der Bau meldet
weiterhin die bekannte CommonJS-Warnung von `pdf-lib`/`pako`.

Zwei vollständige Chromium-Abläufe mit lokalen API- und Sitzungs-Fixtures bei
1440 × 1000 (hell) und 390 × 1000 (dunkel): Mehrfachauswahl, Klick außerhalb,
Escape, Tab, Pfeiltasten/Enter, Speicherausfall mit erhaltener Auswahl, Bearbeiten,
Aktivieren/Pausieren, Löschen/Abbrechen mit Fokus-Rückgabe, Kategorienanforderung,
alte Kategorienadresse und veraltete Betriebsmeldung geprüft. AXE in Formular,
Liste, Löschdialog und Botbetrieb ohne Befunde; keine unerwarteten Browserfehler.
Bildschirmfotos außerhalb des Repositories visuell geprüft. Browser-Plugin mit
`browser`-Skill nicht verfügbar; vorhandenes Browserwerkzeug für den Ausgangsbefund
und reguläres Playwright für die lokale Fixture-Prüfung verwendet. Andere Browser
und die veröffentlichte Oberfläche sind noch nicht geprüft. Die allein für diese
Sitzung gestartete Datenbank wieder beendet und die Projektkonfiguration restauriert.

## 2026-10-01 – Juna – Vinted-Umbau für PR und Merge freigegeben

**Auftrag:** Nach ausdrücklichem „los“ den geprüften Vinted-Zweig veröffentlichen,
alle Pflichtprüfungen abwarten, per Merge-Commit integrieren und anschließend
den eigenen Zweig samt Worktree aufräumen.

**Vorbereitung:** Sauberer Stand `3e1465ef`, aktueller Hauptstand `fd4dc95f`
bereits integriert. Produktionsbau, Typprüfung, betroffene Tests, 23 künstliche
Browserfälle und lokale Migrationsprüfung erfolgreich; finale Templatefixes
zusätzlich unabhängig freigegeben. PR-Freigabe umfasst die geprüfte transaktionale
Migration; der Releaseweg bleibt Backup → Migrationen → Anwendung → öffentlicher
Versionscheck. Keine externen Nachrichten oder zusätzliche Workerveröffentlichung.

**CI-Korrektur:** Die Qualitätsprüfung meldete die zehn neuen Browserfälle als
unerwartet, weil die gepflegte Erwartung noch zwanzig Kernfälle enthielt. Die
Auswahlerwartung nimmt alle zehn Vinted-Fälle ausdrücklich auf; kein Test wird
entfernt oder von der Pflichtprüfung ausgeschlossen. Die Prüfung gegen echte
Playwright-Testauswahl bleibt erhalten.

## 2026-10-01 – Juna – Vinted-Ansicht umgebaut und Favoritenmeldungen umgesetzt

**Auftrag:** Den freigegebenen Entwurf nach „los“ umsetzen: kompakter Kontokopf,
Einstellungen im Dialog, Navigation mit Aktivitäten und Profilbewertungen,
nützliche Übersicht, kleinere Inseratdetails, lesbare Nachrichten und sichtbare
Kennzahlenanstiege. Mehrere Agents übernehmen getrennte Pakete und Reviews.

**Änderung:** Gemeinsame UI-Bausteine und Themefarben bündeln Kontowahl,
Aktualisierungsicon und Einstellungen. Die bestehende Automatik bleibt außerhalb
des Dialogs aktiv. Übersicht zeigt gespeicherte Gespräche, Verkäufe und tatsächliche
Gesamtzahlen. Aktivitäten zeigt gespeicherte Einträge, ohne künstliche Ereignisse
zu erfinden. Alte Bewertungslinks führen mit Fokus zum Profilabschnitt.
Detailfotos sind begrenzt; vorhandene Beschreibungen erscheinen direkt. Fehlende
Texte werden einmal kontogebunden geladen und im Sitzungscache gehalten, ohne eine
erfolgreiche Antwort als bestätigte Datenbankspeicherung auszugeben. Bestätigte
Bearbeitungen werden gegen ältere Cacheantworten geschützt. Eine spätere
Kennzahlenzeit gilt nicht als neuerer Beschreibungstext; noch nicht
datenbankbestätigter Sitzungstext bleibt deshalb konservativ erhalten.
Nachrichten bleiben
bei Nachladefehlern sichtbar; Wiederholen funktioniert auch nach neuen Snapshots.

**Kennzahlen und Meldungen:** Bekannte neuere Stände zeigen Aufruf-/Favoritenanstiege
als `+N` mit begrenzter Hervorhebung; Reduced Motion bleibt statisch. Erstwerte,
unbekannte Zahlen, Rückgänge und Wiederholungen erzeugen keinen falschen Anstieg.
Akzeptierte Datenbankimporte erzeugen atomare, deduplizierte Favoritenmeldungen,
kontoweise zusammengefasst und standardmäßig ohne Ton. Aktivieren setzt zuerst
eine neue Basis, auch bei Teilimporten. Der eigene berechtigte Meldungsstrom
erscheint in der globalen Glocke; Kontoparameter in Sammellinks bleiben erhalten.
Private Broadcasts invalidieren nur den Feed, ein begrenzter Datenbankabruf fängt
ausgefallene Verbindungen auf. Rechte-/Kontextwechsel verwerfen alte Antworten.

**Prüfung:** Gezielte Regressionen zunächst mit Fehler, danach erfolgreich;
unabhängige Reviews und deren Dialog-, Verlauf-, Cache-, Link- und Rechterennen-
Korrekturen. Der breite Lauf mit 3.448 Anwendungstests war erfolgreich; spätere
Korrekturen wurden anschließend gezielt geprüft, zuletzt 296 betroffene
Angular-Tests erfolgreich. Abschließende Typprüfung und
Produktionsbau erfolgreich; nur der bestehende pako-CommonJS-Hinweis bleibt.
Alle acht Marktplatz-Datenbanktests (344 Prüfungen) bestehen auch nach Anwendung
der erzeugten Migration auf dem unveränderten lokalen Ausgangsstand; echte
parallele Importe/Einstellungswechsel zusätzlich geprüft. Schema registriert,
Typen neu erzeugt. Der CLI-Abgleich wurde um automatisch aus Diff/Katalog/Dump
erzeugte Rollenrechte und die übersprungene Realtime-Policy ergänzt; alle elf
Funktionsrümpfe sind mit den deklarativen Quellen abgeglichen. Alle 19 kombinierten
Chromium-Browserfälle mit künstlichen Serverantworten bestehen: 1440/390/320 px,
hell/dunkel, 200 % Vergrößerung, AXE, Tastatur/Fokus, Reduced Motion,
Hintergrundübernahme bei geschlossenem Dialog und gespeicherte Meldungen in zwei
Tabs. Keine Konsolenfehler oder Angular-Warnungen in den sechs neuen UI-Fällen.
Zusätzlich vier Inseratfälle für Bildformate/-fehler, lange Titel und leere/
fehlende Beschreibung erfolgreich. Die sechs UI-Fälle mit allen Nachrichtentypen,
langer URL und gemessenem Mindestkontrast 5,78:1 nochmals erfolgreich.
Der dabei belegte AXE-Tastaturfehler im langen Verlauf ist mit fokussierbarem,
sichtbar markiertem Gesprächsbereich behoben und durch Tab/Home/End abgesichert.

**Grenzen:** Favoritenmeldungen zeigen beobachtete Nettoanstiege beim Abruf;
einzelne Personen oder Echtzeitereignisse werden nicht behauptet. Keine externen
Nachrichten, Browser-Pushs oder zusätzlichen Vinted-Abfragen. Getrennte schnelle
Nachrichten-/Angebots-/Verkaufsbenachrichtigungen gehören nicht zu diesem Umbau.
Die unveränderte Worker-Importschnittstelle führt die neuen Datenbankhooks aus;
dieser Umbau benötigt Schema-/Anwendungsrelease, kein zusätzliches Workerimage.
Eigener Zweig/Worktree; bisher keine Veröffentlichung oder Produktionsänderung.

## 2026-10-01 – Juna – sichtbare Vinted-Kennzahlenänderungen ergänzt

**Auftrag:** Steigende Aufruf- und Favoritenzahlen am Inserat erkennbar machen;
bei neuen Favoriten einen Hinweis beziehungsweise eine Benachrichtigung vorsehen.

**Prüfung:** Vorhandenen Kennzahlenimport und Glockenfeed mit einem Agent
lesend geprüft. Aufrufe, Favoriten und Abrufzeit liegen bereits im Snapshot;
es gibt noch keine dauerhaften Favoritenereignisse. Die allgemeine Glocke ist
workspaceweit lesbar, während Vinted engere Betreiber-/Adminrechte verlangt.

**Entwurf:** Bestehenden UI-Entwurf und Umsetzungsplan erweitert: `+N` am
Inserat mit kurzer Hervorhebung und statischer Reduced-Motion-Variante,
erste bekannte Werte als Basis, keine positiven Meldungen für unbekannte
oder sinkende Zahlen. Zusätzliches fünftes Paket für atomare, deduplizierte
Favoritenereignisse und einen berechtigten Meldungsstrom in der Glocke;
kontoweise Zusammenfassung und abschaltbare In-App-Meldungen ohne neuen Ton.
Wiederholungen, verspätete Importe, Rechteverlust und geschlossene Vinted-Ansicht
sind ausdrückliche Abnahmefälle. Keine zusätzlichen Anbieterabfragen.
Agentenreview präzisiert außerdem den Beschreibungsvertrag: eine erfolgreiche
Leseantwort ohne Speicherwarnung bestätigt noch keine dauerhafte Speicherung.

**Grenzen:** Planungsänderung, noch keine Produktimplementierung oder Migration.
Sichtbar ist der beobachtete Nettoanstieg beim Abruf, keine einzelne Person
oder Echtzeitaktivität. Externe Nachrichten und Hintergrund-Push sind nicht
beauftragt. Dokumente formatiert und Diff auf Fehler geprüft.

## 2026-10-01 – Juna – kompakte Vinted-Ansicht mit Agents durchgeplant

**Auftrag:** Kontokopf und Automatik verkleinern, Einstellungen bündeln,
Navigation und Übersicht verbessern, Inserate samt Detailbildern kompakter
darstellen und Nachrichten im dunklen Theme lesbar machen. Nutzer bestätigt
die Navigation Übersicht, Nachrichten, Inserate, Verkäufe, Aktivitäten und
Profil; Bewertungen gehören ins Profil.

**Prüfung:** Aktuellen `origin/master` bei `f1c9e623`, Designrichtlinien und
vorhandene Shared-Bausteine gelesen. Drei Agents prüfen unabhängig Kopf/
Navigation, Inserate/Ladeverhalten und Nachrichten. Produktive Ansicht lesend
betrachtet; feste helle Nachrichtenflächen mit nahezu weißem Theme-Text
bestätigt. Das übergroße Detailbild verwendet den unbegrenzten Rastermodus.
Ein Beschreibungs-Cache besteht bereits; erneutes Laden, verworfene
Speicherhinweise, fehlende Kontextprüfung und Beschreibungsfrische werden
getrennt behandelt. Aktivitäten existiert als Route, fehlt aber in der Navigation.

**Entwurf:** Eigener Worktree auf `juna/vinted-ui-plan`, vier prüfbare Pakete
mit abgesprochener Agentenaufteilung. Kompakter Kopf und Einstellungsmodal,
gemeinsame gelbe Bereichsnavigation, vorhandene Daten als nützliche Übersicht,
begrenzt große Detailgalerie und unmittelbare gespeicherte Beschreibungen,
kompakter Nachrichtenbereich mit Themefarben. Betreiberrechte, ungelesene
Verläufe, bestehende Pausen und Hintergrundübernahme bleiben erhalten.
Design und Umsetzungsplan unter `docs/superpowers/specs/2026-10-01-vinted-workspace-design.md`
und `docs/superpowers/plans/2026-10-01-vinted-workspace-refactor.md` festgehalten.

**Grenzen:** Nur Navigation verbindlich bestätigt; übrige Gestaltung ist ein
prüfbarer Entwurf. Keine Produktimplementierung, Migration, Kontoeinstellung,
Nachricht oder Serveränderung. Neue Sendefunktionen und Ereignismeldungen
gehören nicht zum UI-Umbau. Umfangreiche Beschreibungserneuerung braucht
einen späteren geprüften Server-/SQL-Vertrag. Dokumente formatiert und auf
Umfang, Schnittstellen, Rechte und Abnahmefälle abgeglichen.

> > > > > > > origin/master

## 2026-10-01 – Juna – begrenzte Wiederprüfungen nach Cloudflare-Prüfseiten umgesetzt

**Auftrag:** Nach „los“ die aus dem Serververgleich abgeleitete Wiederaufnahme
umsetzen: Der unveränderte Sammler lieferte bereits wieder Artikel, während eine
gespeicherte 40-Minuten-Pause den produktiven Zulauf weiter anhielt.

**Änderung:** Nur bei einem ausdrücklich erkannten Prüfseitenhinweis erlaubt die
Fehlerpolitik nach fünf Minuten wieder eine einzelne zentrale Probe. Gemeinsame
Pause, Auswahl derselben aktiven Abfrage, gespeicherte Fehlerzähler, Probesperre
und Minutenbudget bleiben erhalten. Eine längere Anbieterwartezeit hat Vorrang;
unbestätigte 403 und 429 behalten ihre bisherige Behandlung. Bestehende gespeicherte
Pausen werden nicht nachträglich verkürzt. Betriebsbeschreibung angepasst und den
eigenen Serververgleich als Nachweis aufgenommen. Keine Schema- oder
Abhängigkeitsänderung; kein Browserumbau.

**Prüfung:** Drei neue Erwartungen zuerst passend fehlgeschlagen: 40 statt fünf
Minuten, 40 statt der Anbieterwartezeit von 30 Minuten und steigende Pausen statt
einzelner Fünf-Minuten-Proben über Dienstneustarts hinweg. Danach 204 Bot-Tests,
Typprüfung, Dienstbau, gezieltes ESLint/Prettier sowie Docker-Bau und isolierter
Image-Starttest erfolgreich. Wiederaufnahme aller drei Marken nach erfolgreicher
Probe geprüft; Kategoriepause und vorhandene Probesperren in der Suite grün.
Die tatsächliche Langzeitstabilität und der ursprüngliche Prüfseitenauslöser sind
damit nicht nachgewiesen. Eigener Zweig `juna/vinted-recovery-probes` von aktuellem
`origin/master`; Veröffentlichung steht noch aus, Produktion unverändert.

## 2026-10-01 – Juna – Artikelbot-Korrektur für PR und Merge freigegeben

**Auftrag:** Nach ausdrücklichem „ja“ den lokal geprüften Artikelbot-Zweig
veröffentlichen, alle erfolgreichen Pflichtprüfungen abwarten, per Merge-Commit
integrieren und den eigenen Zweig samt Worktree aufräumen.

**Vorbereitung:** Sauberer Implementierungsstand `08434869`, unveränderter
aktueller `origin/master` (`f1c9e623`). Lokal 200 Bot-Tests, Typprüfung, Build,
Format/Lint und isolierter Docker-Starttest erfolgreich. Der produktive Bot
läuft noch auf `ce391ce` und erhielt um 21:42 Uhr erneut HTTP 403. Der geplante
Releaseweg aktualisiert dieses separate Botimage automatisch; tatsächlichen
Rollout und Anbieterzustand anschließend getrennt prüfen.

## 2026-10-01 – Juna – wiederkehrende Artikelbot-Abbrüche geprüft und Wiederaufnahme korrigiert

**Auftrag:** Den erneuten Stillstand seit 21:06 Uhr und „Zugriff abgewiesen“
prüfen und den zentralen Vinted-Artikelbot konsistenter machen.

**Befund:** Produktive Logs und lesende Datenbankabfragen bestätigen den letzten
Erstfund um 21:06:38 Uhr und die erste erneute Vinted-403 um 21:06:47 Uhr.
Der Prozess läuft ohne Neustarts; gemeinsame Pausen verhindern weitere Abrufe.
Die anschließenden Proben wechseln Marken und verteilen die Fehlerzähler,
wodurch sich die Pause zu langsam verlängert. Der konkrete Vinted-Auslöser ist
nicht nachgewiesen. Persönlicher Kontodienst und fremde Zweige unverändert.

**Änderung:** Eigener Zweig von `origin/master` (`f1c9e623`). Die einzelne Probe
bevorzugt die zuletzt abgewiesene aktive Abfrage und erhält die Verlängerung
über Neustarts. Alle Vinted-Anfragen teilen sich zehn Sekunden Mindestabstand
und ein 20-Sekunden-Zeitlimit. Kategorien respektieren gemeinsame Pausen;
eigene 403/429 pausieren ebenfalls. Anbieterwartezeit auch bei 403 beachten,
feste Diagnosemetadaten ergänzen und Zugriffspause im Betriebsstatus erhalten.
Keine neuen Abhängigkeiten oder Datenbankänderungen.

**Prüfung:** Ausgangsstand 187 Tests erfolgreich. Neue Fehlerfälle zunächst
nachweislich rot, danach 200 Bot-Tests, Typprüfung und Bot-Build erfolgreich.
Formatierung, gezieltes Linting, Docker-Build und isolierter Image-Starttest
erfolgreich. Die produktive Probe um 21:42 Uhr wurde weiterhin mit 403 abgewiesen.
Betriebsnachweis und Grenzen in `docs/audit/2026-10-01-vinted-bot-interruptions.md`.
Noch kein Push, Merge oder Rollout; dauerhaft stabiler Vinted-Zugang nicht belegt.

## 2026-10-01 – Juna – Vinted-Korrektur für PR und Merge freigegeben

**Auftrag:** Nach ausdrücklichem „los“ den geprüften Zweig veröffentlichen,
alle erfolgreichen Pflichtprüfungen abwarten, mit Merge-Commit integrieren
und anschließend den eigenen Remote-/lokalen Zweig samt Worktree aufräumen.

**Vorbereitung:** Arbeitsstand `8d4f0b55` sauber und auf dem aktuellen
`origin/master` (`ce391ce9`). Die serverseitige Workerumstellung und die
vollständigen getrennten Ereignisbenachrichtigungen bleiben separat offen.

## 2026-10-01 – Juna – Vinted-Anmeldung wieder prüfen und Automatik vereinfachen

**Auftrag:** Die bestehende Vinted-Anmeldung vor einer unnötigen
Neuanmeldeaufforderung erneut prüfen. Automatische Aktualisierung standardmäßig
mit 15 Minuten und einstellbarem Abstand anbieten. Für getrennte schnelle
Meldungen sind Nachrichten, Angebote und Verkäufe ausdrücklich gewünscht.

**Änderung:** Eine initiale Profil-401 lädt die feste Startseite einmal neu
und prüft die Identität begrenzt erneut, mit aktueller Freigabe vor jedem
Schritt. Login/2FA, 403/429 und Verbindungsfehler beenden die Wiederprüfung.
Bestätigte neue Konten erhalten einen Standardzeitplan; Bestandskonten ohne
Zeitplan starten beim Öffnen nach Dienstbestätigung. Bewusste Pausen bleiben
erhalten. Der GoLogin-Dispatcher ist standardmäßig an; ein explizites `0`
bleibt wirksam. Healthversion 2 und die Datenbank unterstützen 3, 5, 10, 15,
30 und 60 Minuten für den gesamten vorhandenen Kontoabruf. Ein gemeinsamer
Einstellungsdialog ersetzt „Stand neu laden“; der Status aktualisiert sich
selbst. Nach neuem erfolgreichem Hintergrundimport lädt die offene Ansicht
die gespeicherten Kontodaten und Nachrichten nach, ohne Konto oder Gespräch
abzuwählen. Fremde oder verspätete Antworten werden verworfen; ein bereits
übernommener Datenstand wird nicht doppelt geladen. Ältere Dienste erlauben
weiterhin nur 15 Minuten.

**Datenbank:** Deklarative Funktionen und Intervallprüfung angepasst. Migration
mit dem offiziellen CLI-Vergleich zweier eigener lokaler Datenbanken erzeugt,
inhaltlich geprüft und auf den bisherigen Migrationsstand angewendet. Der
anschließende Schemaabgleich ist leer. Supabase-Typen neu erzeugt, ohne Änderung
des öffentlichen Typvertrags. Keine eigenen Transaktionen, Löschung von
Kontodaten oder Änderungen vorhandener Migrationen im neuen SQL-Paket.

**Prüfung:** 195 Worker-Unit- und 12 Worker-Chromiumtests, 69 betroffene
Angular- und fünf Modelltests, alle sieben Marktplatz-Datenbankdateien mit
269 Prüffällen sowie Angular-/Worker-Bau und Typen bestanden. Formatierung,
gezieltes Lint, Prüfung gemeinsamer UI-Komponenten und Test-Suite-Audit
bestanden. Vier einschlägige Workflowtests bestanden; der zusätzliche
Release-Integrationstest wurde ohne sein eigenes Integrationssetup übersprungen.
Der alte Datenbankstand lehnt den neuen Drei-Minuten-Test ab; der
migrierte Stand plant ihn bei Aktivierung, Start und Abschluss korrekt.
Alle 13 Browserfälle der Vinted-Kontoverwaltung bestanden mit künstlichen
HTTP-Antworten und denselben 15 Sekunden Erwartungszeit wie im PR-Aufbau.
Die kürzere anfängliche Hilfskonfiguration wartete bei fünf bestehenden
Loginfällen nicht lange genug auf zwei Drei-Sekunden-Prüfungen; mit dem
verbindlichen PR-Zeitlimit bestanden diese ohne Anwendungskorrektur.
Browserprüfung bei 1440 und 390 Pixeln:
Standardaktivierung, Einstellung auf drei Minuten, sichtbare neue Kontodaten
nach simuliertem Hintergrundabschluss, bewusste Pause,
Kontoisolierung, alter Dienst, Tastaturbedienung, AXE einschließlich
Farbkontrast und kein Seitenüberlauf. Keine echten Vinted-Abrufe gestartet.

**Grenzen und Betrieb:** Der produktive 401-Auslöser ist noch nicht bewiesen;
der neue Wiederaufnahmeweg ist lokal mit verzögerter Anmeldung geprüft.
Produktiver Worker und Konten bleiben unverändert bis zur Veröffentlichung
und getrennten Workerumstellung. Ein kürzerer Gesamtintervall liefert noch
keine vollständigen neuen Ereignisse: ungelesene Gesprächsdetails werden
nicht geöffnet und Verkäufe bisher teilweise erst nach Versand gelesen.
Quellenprüfung und getrennte Meldungen für alle drei Ereignisarten sind im
Umsetzungsstand `docs/superpowers/plans/2026-10-01-vinted-session-automation.md`
konkret beschrieben; der Rollout steht in
`docs/implementation/vinted-worker-rollout.md`.

**Abgleich:** Den eigenen Zweig vor Abschluss auf den inzwischen aktuellen
`origin/master` (`ce391ce9`, PR #273) gesetzt. Ausschließlich im gemeinsamen
AI-Changelog entstand ein Konflikt; beide Sitzungseinträge sind erhalten.
Vinted-Anwendung, Worker, SQL und Tests wurden dabei nicht verändert.

## 2026-10-01 – Juna – wiederkehrende Vinted-Anmeldefehler untersucht

**Auftrag:** Wiederkehrende Verbindungs-/Anmeldefehler trotz bereits
angemeldetem manuell geöffnetem Serverbrowser prüfen und GoLogin recherchieren.

**Befund:** Produktive Diagnosemetadaten bestätigen eine 401 am 01.10. um
13:50 Uhr, anschließend eine rund 39 Sekunden offene manuelle Sitzung und
um 13:52 Uhr einen erfolgreichen Abruf desselben Kontos. Alle 43 gespeicherten
Sitzungen sind geschlossen, ohne Überschneidungen. Der produktive Worker
läuft auf `e753200e`; der Import beendet die erste Profil-401 ohne Wiederprüfung.
Eine lokale Chromium-Probe bildet eine verzögerte Sitzungsaktualisierung ohne
Zugangsdaten nach; der genaue Vinted-Auslöser bleibt offen.

**Recherche und Prüfung:** Offizielle GoLogin-Quellen zu Cloud-Inaktivität,
Profilspeicherung, Cookies und Cloud-CDP geprüft. Browserbeendigung ist keine
belegte Vinted-Abmeldung. 27 vorhandene Worker-Tests bestanden; SQL ausschließlich
lesend und ohne private Kontoinhalte ausgegeben. Keine produktiven Konten,
Abrufe oder Dienste verändert. Befunde, Quellen und Grenzen stehen in
`docs/audit/2026-10-01-vinted-session-recovery.md`.

## 2026-10-01 – Juna – eBay-Korrektur für Veröffentlichung und Einrichtung freigegeben

**Auftrag:** Nach ausdrücklichem „ja“ den lokal geprüften Zweig `juna/ebay-production-setup` veröffentlichen, erfolgreiche Pflichtprüfungen abwarten, per Merge-Commit integrieren und den eigenen Zweig samt Worktree aufräumen. Anschließend den separat freigegebenen Funktionsrollout und die echte eBay-Einrichtung fortsetzen.

**Vorbereitung:** Arbeitsstand auf `b2522e9e` sauber, `origin/master` unverändert auf `a987e304`. Die bereits abgeschlossenen 19 Deno-Tests, drei Funktions-Typprüfungen, 31 CI-Verträge, Format-/Lint-/Workflow-Prüfungen und der isolierte Nachweis mit der produktiven Laufzeit bleiben gültig. Die vollständige Pflichtprüfung läuft im PR. Produktive Zugangsdaten, Kontoverbindung und Portal-Freischaltung sind noch offen.

## 2026-10-01 – Juna – eBay-Freischaltung vorbereitet und Löschendpoint korrigiert

**Auftrag:** Die echte eBay-Verbindung nach den veröffentlichten PRs #271 und #272 einrichten, ausrollen und prüfen. Eigener Worktree und Zweig `juna/ebay-production-setup` auf `origin/master` (`a987e304`); bestehende fremde Zweige bleiben unverändert.

**Befund:** Auf dem Produktionsserver fehlen eBay-Funktionen und eBay-Konfigurationswerte. Die Datenbank bestätigt Migration `20261001130617`. Nach Nutzeranmeldung im Entwicklerportal ist das Production-Keyset noch wegen fehlender Löschendpoint-Bestätigung gesperrt. Die bisherige Funktion verlangte zur Bestätigung bereits die vollständige Kontokonfiguration. Zusätzlich wies Deno korrekt signierte Meldungen wegen doppelt eingefügter PEM-Zeilenumbrüche ab; die bisherigen Node-Prüfungen hatten diesen Laufzeitunterschied nicht erkannt.

**Änderung:** Verifikationstoken und HTTPS-Endpoint werden unabhängig geprüft, sodass die Bestätigung vor Freischaltung des Keysets funktioniert. Signierte Meldungen bleiben ohne vollständige Konfiguration mit HTTP 503 wiederholbar, unsignierte Meldungen bleiben abgewiesen. Öffentliche Signaturschlüssel erhalten eine einheitliche PEM-Darstellung. Die PR-Qualitätsprüfung testet und prüft die eBay-Funktionen jetzt zusätzlich in Deno. Rollout, Nutzeraktionen, Prüfungen und Rückweg stehen in `docs/implementation/ebay-production-rollout.md`.

**Prüfung:** Bestätigungslücke und Signaturfehler zuerst fehlschlagend nachgestellt. Anschließend 19 gezielte Tests und drei Funktions-Typprüfungen in der aktuellen stabilen Deno-Version 2.9.7 sowie 31 CI-Vertragsprüfungen erfolgreich. Getrennte temporäre Instanz des installierten Edge-Runtime-Images mit Deno 2.1.4 bestätigt Signaturen, manipulierte Daten, Bestätigung ohne Konto-Zugangsdaten und Wiederholbarkeit; die fünf vorgesehenen anonymen HTTP-Fälle bestehen. Testcontainer anschließend gestoppt. Keine produktiven Funktionsordner, Zugangswerte oder Kontodaten verändert; kein echtes Konto verbunden. Die neue Korrektur benötigt den geprüften PR/Merge vor dem produktiven Rollout.

## 2026-10-01 – Juna – Stand des eBay-Merges und nächste Schritte geprüft

**Auftrag:** Den letzten eBay-Merge, seine Veröffentlichung und die sinnvolle nächste Etappe einordnen.

**Befund:** GitHub und den frisch abgerufenen `origin/master` (`a987e304`) geprüft. PR #271 ergänzt persönliche eBay-Kontoverbindungen und die lesende Anzeige eigener Angebote und Bestellungen. PR #272 behebt den anschließend gescheiterten Produktionsbau. Beide PRs haben erfolgreiche Pflichtprüfungen. Release-Lauf `36876381049` bestätigt Image-Bau, Image-Smoke, Migration `20261001130617`, Veröffentlichung und öffentliche Prüfungen; Version `v0.276.1` wurde erstellt. Die serverseitige eBay-Konfiguration, der separate Funktionsrollout und ein echter Kontotest sind dadurch noch nicht nachgewiesen.

**Nächster Schritt:** Production-Zugang und Rechte, OAuth-Rückweg und Löschendpoint einrichten, die eBay-Funktionen separat ausrollen und Kontoverbindung/Abruf/Trennen mit zwei normalen Nutzern prüfen. Anschließend sichere Artikelzuordnung und bewusste Bestellübernahme planen; automatische Bestandsänderungen, Gebührenimport und Inseratsveröffentlichung gehören zu späteren Paketen.

**Prüfung:** Nur Repository-Dokumentation, Git-Stand, PR-Prüfungen und Release-Protokoll gelesen. Keine Zugangsdaten abgerufen, keine produktive Konfiguration oder Konten verändert. Ausschließlich diesen lokalen Sitzungseintrag ergänzt; keine Anwendungstests erforderlich.

## 2026-10-01 - Juna - eBay-Typvertrag im Produktionsbau ergänzt

**Auftrag:** Die freigegebene eBay-Anbindung nach grünen Pflichtprüfungen
veröffentlichen. PR #271 wurde mit Merge-Commit integriert. Der anschließende
Produktionslauf stoppte vor Veröffentlichung und Migration, weil der neue
eBay-Typvertrag durch `.dockerignore` aus dem Bau ausgeschlossen war.

**Änderung:** Den reinen eBay-Typvertrag neben dem bestehenden Marktplatzvertrag
im Docker-Kontext freigegeben. Serverimplementierung und Zugangsdaten bleiben
ausgeschlossen. Die Korrektur wird über einen eigenen geprüften PR integriert.

**Vorgabe:** Auf diesem PC keinen lokalen Docker-Bau ausführen. Die
Image-Prüfung erfolgt ausschließlich im vorhandenen GitHub-Release-Ablauf.

## 2026-10-01 - Juna - persönliche eBay-Verbindung und eigene Kontodaten umgesetzt

**Veröffentlichungsfreigabe:** Der Nutzer hat nach Abschluss der lokalen
Prüfungen Branch-Push, PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen
und anschließendes Aufräumen des Feature-Zweigs mit „los“ freigegeben.
Production-Zugangsdaten und die separate Funktionskonfiguration bleiben offen.

**CI-Nachprüfung:** Der erste PR-Lauf bestand Qualitäts-, Datenbank-, Browser-,
Node- und DOM-Prüfungen. Die zweite Angular-Gruppe zeigte veraltete Erwartungen
in zwei bestehenden Testdateien: Die Navigation fehlte um den eBay-Bereich,
die Einstellungen testeten noch das frühere App-ID-Formular und kannten die
zusätzlich importierten Komponentenressourcen nicht. Beide Tests an die neue
Oberfläche angepasst; alle 74 zugehörigen Angular-Prüfungen bestehen lokal.

**Auftrag:** Nach der Dokumentationsanalyse die eBay-Anbindung einbauen. Der
Nutzer hat die nötigen Supabase-Funktionen und Datenbankmigrationen ausdrücklich
freigegeben; die globale Frontend-Grenze ist für diese Anbindung aufgehoben.

**Änderung:** Normale Workspace-Mitglieder verbinden ihr eigenes eBay-Konto
über die zentrale Production-App. Einstellungen und der neue Bereich
`/marketplaces/ebay` zeigen bestätigten Status, Trennen, aktive Auktionen und
Festpreisangebote sowie eigene Bestellungen mit getrennten Zahlungs-, Versand-
und Stornierungszuständen. Die Darstellung ändert weder Flipbase-Verkäufe noch
Bestand. Nutzer- und Workspacewechsel verwerfen laufende Antworten. Die alte
App-ID-Eingabe und sämtliche Finding-Aufrufe sind entfernt. Serverfunktionen
prüfen echte Nutzeridentität, Mitgliedschaft und Herkunft. Neue Tabellen mit
RLS, gehashte einmalige OAuth-Zustände, AES-GCM-verschlüsselte Tokens,
versionierte Verbindungen und eine zeitlich begrenzte Abrufsperre schützen
Kontozugriff und Token-Erneuerung. eBays Lösch-Challenge und signierte
Kontolöschmeldungen sind implementiert. Die bestehende Vinted-Berechtigung
bleibt bestehen. Eine Compose-Zusatzdatei und leere Umgebungsvorlage bereiten
die ausschließlich serverseitige Konfiguration vor.

**Prüfung:** Production-Bau und beide TypeScript-Prüfungen erfolgreich;
Den eigenen Zweig auf den inzwischen veröffentlichten `origin/master`
(`c60f059e`) gesetzt und den zusätzlichen Changelog-Eintrag erhalten.
Production-Bau, Typen, Lint, Angular-Tests und Browsercheck danach wiederholt.
geänderte Frontend-Dateien formatiert und ohne Lintbefunde. 21 Node-Tests,
20 Angular-Tests, 15 eBay-Servertests und 23 passende Workflow-Vertragstests
bestanden. Drei Edge-Einstiegspunkte mit Deno geprüft. Die mit Supabase
erzeugte Migration in einer isolierten Kopie des vollständigen Ausgangsschemas
transaktional eingespielt; alle 39 pgTAP-Prüfungen auch unter `service_role`
bestanden. Datenbanktypen tatsächlich neu erzeugt; der Unterschied enthält
ausschließlich die neuen eBay-Tabellen und Funktionen. Wegen eines lokalen
CLI-Starts mit nicht transaktional ausgeführten Alt-Migrationen wurden diese
nur im temporären Testaufbau mit Transaktionen abgespielt; bestehende
Repository-Migrationen bleiben unverändert. Playwright gegen den lokalen
Production-Bau mit künstlichen HTTP-Antworten bei 1440 und 390 Pixeln:
Angebote → Bestellungen → Trennen, keine Konsolenfehler, kein Seitenüberlauf,
AXE einschließlich Farbkontrast ohne Befunde. Ein dabei gefundener fehlender
Tastaturzugang zur schmalen Bestelltabelle ist korrigiert. Compose-Zusatzdatei
mit einer temporären Basis geprüft; Git-Diff ohne Whitespace-Befunde.

**Offen für Betrieb:** Production-Keyset/RuName/Rechte und Löschendpoint
konfigurieren, Migration und Edge Functions nach Freigabe veröffentlichen,
öffentliche Callback-Erreichbarkeit des selbst gehosteten Dispatchers prüfen
und einen echten OAuth-/Kontolesetest durchführen. Keine echten Zugangsdaten
verwendet, kein Konto verbunden, kein Push, Merge oder Deployment ausgeführt.
Einrichtung und Grenzen stehen in `docs/implementation/ebay-api-integration-analysis.md`.

## 2026-10-01 - Juna - eBay-Dokumentation und Einbindung in Flipbase erfasst

**Auftrag:** Die offizielle eBay-Dokumentation analysieren, mögliche Funktionen
und ihre Einbindung in Flipbase festhalten. Der Betreiber bestätigt ein
vorhandenes Production-Keyset; normale Nutzer sollen ihr eBay-Konto verbinden.

**Änderung:** Eine dauerhafte Analyse unter
`docs/implementation/ebay-api-integration-analysis.md` erfasst Funktionsumfang,
Zugangsgrenzen, OAuth, API-Rechte, Kontoisolierung, bestehende Flipbase-Routen,
Angebotsverwaltung, Import-/Buchungsregeln und Umsetzungspakete. Die vorhandenen
Vinted-RPCs und Antwortparser sind noch plattformspezifisch; Betreiberrechte
reichen nicht als Vertrag für normale Nutzer. Inventory-Neuanlage unterstützt
laut aktuellem Vertrag auch Auktionen, die Migration dagegen nur geeignete
Festpreisangebote. Finanzzugriff für EU/UK benötigt digitale Signaturen; die
neue `order_earnings`-Ressource ist nicht als Einstieg für deutsche Verkäufer
geeignet. Backend-Issue 01 um die nachgewiesenen Vertragslücken ergänzt.

**Prüfung:** Frisch abgerufenen `origin/master` (`08c94058`), bestehende Routen,
Kontoverträge, RPCs, Antwortparser, Inserats- und Verkaufsabläufe gelesen.
Offizielle eBay-Guides, Zugangsbeschränkungen, Release-/Abschaltungsstand und
elf direkt abgerufene öffentliche OpenAPI-JSON-Verträge ausgewertet. Keine
Zugangsdaten eingesehen, keine Live-Kontofreigabe, API-Schreibaktion oder
Frontend-/Backend-Implementierung ausgeführt. Beide Dokumente mit der vorhandenen
Prettier-Version `3.8.1` formatiert; alle 40 Quellenreferenzen und verlinkten
lokalen Dateien sind aufgelöst. Git-Diff auf Whitespace geprüft. Keine
Anwendungstests oder Builds benötigt, da ausschließlich Dokumentation geändert ist.

## 2026-10-01 - Juna - eBay-Anbindung und persönliche Kontofreigabe geprüft

**Auftrag:** Vorhandene eBay-Einstellungen prüfen und erklären, wie Nutzer ihre
eigenen eBay-Konten verbinden können.

**Analyse:** Auf dem frisch abgerufenen `origin/master` (`08c94058`) gibt es
unter Einstellungen → App & Geräte nur App-ID und Marktplatz. Die Konfiguration
liegt ungebunden im Browser-LocalStorage; ein persönlicher OAuth-Ablauf fehlt.
Frontend und `marketplace-search` verwenden noch die abgeschaltete Finding API.
Die Serverfunktion verwendet einen zentralen `EBAY_APP_ID`, nicht die gespeicherte
Nutzerkonfiguration. Vorgeschlagen ist eine zentrale Flipbase-eBay-App mit
persönlicher Kontofreigabe und geschützter serverseitiger Tokenverwaltung.
Öffentliche Angebotssuche, eigene Kontodaten und marktweite Verkaufspreise
brauchen unterschiedliche Zugriffe. Marketplace Insights ist laut eBay für
neue Nutzer derzeit geschlossen; OAuth allein gibt diesen Datenzugang nicht frei.

**Prüfung:** Aktuellen Remote-Stand, Einstellungsroute, Speicherung, Suchservice
und Edge Function gelesen; offizielle eBay-Dokumentation zu OAuth, Browse,
Produktionszugang, API-Abschaltung und Marketplace Insights geprüft. Fehlende
Backend-Unterstützung unter `C:\Users\gt\Desktop\Backend Issues\ebay-api-analysis\`
dokumentiert. Kein Anwendungscode geändert, keine Live-eBay-Verbindung geprüft.
Eigenen Worktree für dieses Analyseprotokoll verwendet.

## 2026-10-01 - Juna - automatischen Vinted-Abruf für PR und Merge freigegeben

## 2026-10-01 – Juna – gemeinsame Artikelwahl und Verkaufstabelle angebunden

**Auftrag:** Den freigegebenen Entwurf in PR #270 vollständig in Einkauf und Verkauf einbinden. Der Nike-Nullbestand war durch einen bereits erfassten Verkauf korrekt; keine Bestandskorrektur, Datenbankänderung oder Serveraktion gehört zu diesem Auftrag. Der PR bleibt bis zur Abnahme ein Entwurf, ohne Merge oder Deployment.

**Änderung:** Das gemeinsame Auswahlmodal wird jetzt von der Einkaufsauswahl und dem Verkaufsformular verwendet. Größen, Farben, Zustand und verfügbare Mengen stehen bei der konkreten Variante beziehungsweise dem Einzelstück. Suche und Marken-/Kategoriefilter bleiben gemeinsam, die Anlage neuer Produkte/Varianten bleibt auf den Einkauf begrenzt. Die Verkaufszuordnung liest alle geladenen Einkaufspositionen und prüft Workspace und Herkunft. Ladefehler, zwischenzeitlich nicht mehr verfügbare Ziele und Mengenüberschreitungen über mehrere Zeilen werden vor dem Abschicken abgefangen. Historische Verkaufsziele bleiben unverändert. Der gespeicherte Verkaufstext enthält die gewählte Größe und Farbe.

**Tabelle:** Verkaufsnummer und Datum stehen als eigene erste Spalten, auf dem Handy gemeinsam über den Artikeln. Umsatz, Einkaufskosten, Gebühren & Versand und Gewinn werden zentral in Tabelle, Menüs, Kennzahlen und Erfassung verwendet. Erläuterungen erhalten den Umfang der Kosten und die Abgrenzung zu Betriebsausgaben und Steuern. Prozentwerte verwenden das deutsche Dezimalkomma. Alte Standardreihenfolgen werden gezielt migriert; persönliche Reihenfolgen, ausgeblendete optionale Spalten und Sortierung bleiben erhalten. Bestehende Berechnungen und Buchungen bleiben unverändert.

**Prüfung:** Den vollständigen Quellstand samt installierten Abhängigkeiten aus dem eigenen PR geprüft; der lokale Ausgangs-Dateibaum stimmt mit dem GitHub-Baum überein. Neue Integrationsfälle wurden zuerst mit fünf fehlschlagenden Assertions nachgestellt. Zusätzlich die fehlende Variantengröße im Verkaufstext zuerst rot nachgewiesen und behoben. Anschließend 31 echte Angular-Prüfungen für Erfassung/Integration sowie 1.628 Node-Prüfungen erfolgreich. Anwendungs- und Testtypen, Angular-AOT-Vorlagenprüfung, gezieltes ESLint/Prettier, Shared-UI-Prüfung und Suite-Audit bestanden. Vorhandene Test-Fixtures wurden an den gemeinsamen Signal-/Model-Vertrag angepasst, ohne Bestands-/Kosten-Assertions zu entfernen. Ein neuer verpflichtender Browserfall prüft Varianten, ausverkaufte Optionen, Mengenobergrenze, gespeicherte Variantenkennungen, Nummer/Datum, Mobile und Tastatur-/AXE-Zustände sowie die Einkaufsauswahl.

**Grenzen:** Der vollständige lokale Bündelbau überschreitet das 4-GB-Speicherlimit; die getrennte AOT-Prüfung ist erfolgreich, ersetzt jedoch nicht den Build. Der erste parallele Gesamttest hatte einen lokalen npm-Pfadfehler und einen Zeitablauf in `product-image-preparation.dom.spec.ts`; nach Korrektur der lokalen Laufzeitinstallation bestanden die Node-Suite und der einzelne Bildtest. Die vollständigen PR-Prüfungen einschließlich Build und Browser sind vor Abnahme maßgeblich. Temporäre Übertragungsdateien und der nur lesende Quellarchiv-Workflow werden aus dem fertigen Dateibaum entfernt; keine Zugangsdaten oder Git-Credentials wurden übertragen.

## 2026-10-01 – Juna – automatischen Vinted-Abruf für PR und Merge freigegeben

**Auftrag:** Den lokal abgenommenen Zweig nach ausdrücklicher Nutzerfreigabe veröffentlichen, die erfolgreichen Pflichtprüfungen abwarten, per Merge-Commit integrieren und den eigenen Zweig samt Worktree aufräumen.

**Vorbereitung:** Der geprüfte Implementierungsstand ist `c4cd6016`; `origin/master` bleibt unverändert auf `69cd0c83`. Arbeitsstand sauber, unabhängige Datenbank-/Worker-/Oberflächenreviews abgeschlossen. Die verbindliche Gesamtprüfung läuft im PR. Die gesonderte Workerumstellung und echte Kontofreigaben sind damit noch nicht ausgeführt.

## 2026-10-01 – Juna – automatische Vinted-Abrufe lokal abgenommen

**Auftrag:** Das zweite Paket des geprüften Vinted-Plans umsetzen: bewusst freigegebene automatische Aktualisierungen je Konto auch bei geschlossener App.

**Vorbereitung:** Aktuellen `origin/master` geprüft und eigenen verwalteten Worktree auf `juna/vinted-scheduled-sync` erstellt. Zwei Agenten haben Datenbank-/Workerrechte und den Oberflächenvertrag gegen den bestehenden Code geprüft. Ein gemeinsamer Dispatcher übernimmt neue einmalig freigegebene manuelle und geplante Leseaufträge; eine persistente Runtime, Auftragssperrversion und globale Browserkapazität schützen vor Doppelstart und fremder Recovery. Der Pilot bleibt zunächst bei 15 Minuten; 5/10 Minuten brauchen den bereits im Gesamtplan festgelegten Kapazitätsnachweis.

**Änderung:** Kontozeitpläne lassen sich bewusst aktivieren und pausieren; die Oberfläche zeigt nächste Fälligkeit, letzten Versuch/Erfolg und verständliche Pausengründe. Die Freigabe bleibt beim verbundenen Konto und wird mit ihrer aktuellen Version gespeichert. Fehlende Workerfähigkeiten verhindern Aktivierung, während Pausieren über die Datenbank möglich bleibt. Ein gemeinsamer Dispatcher priorisiert manuelle Abrufe und fasst verpasste Zyklen zusammen. Er erneuert kurze Sperren innerhalb der bestehenden Zehn-Minuten-Grenze und verwendet ausschließlich gespeicherte Leseautorisierungen, keine Nutzer-Zugangstokens. Anbieterablehnungen stoppen weitere Datenanfragen; Wartezeiten, begrenzte Wiederholungen und bestätigte Teilimporte bleiben auch nach Abstürzen erhalten.

**Review:** Datenbank, Oberfläche und Worker wurden getrennt umgesetzt und unabhängig geprüft. Ein Wiederanlauf ohne Anbieterpause sowie unklare Reservierungen und unbegrenzte Datenbankanfragen wurden mit gezielten Fehlerfällen behoben und erneut geprüft. Zeitplanänderungen beenden alte wartende Automatikaufträge; eine neue manuelle Nutzeraktion kann einen wartenden Automatikauftrag ausdrücklich als einmaligen Abruf freigeben. Die CLI-Migration enthält ausschließlich geplante Objekte samt expliziten Rechten; alle 18 Funktionskörper wurden mit den deklarativen Quellen abgeglichen. Datenbanktypen sind auf dem frisch migrierten Stand erzeugt.

**Prüfung:** 192 Worker-Tests, 44 gezielte Angular- und vier Parser-Tests erfolgreich. Unabhängig 255 Datenbankprüfungen in sieben Marketplace-Suiten und ein echter Paralleltest zweier künstlicher Konten mit genau einem globalen Browserplatz bestanden. Worker-/Anwendungstypprüfung, beide Produktionsbauten, gezieltes ESLint und Formatprüfung, Schema-/Migrationsverträge, Shared-UI-Prüfung und Suite-Audit erfolgreich. Ein Browserfall prüft Aktivieren/Pausieren per Tastatur, Neuladen, Kontoisolierung, alten Worker und AXE bei 1440/390 Pixeln; der Vertrag enthält jetzt 19 verpflichtende PR-Browserfälle.

**Stand:** Umsetzung auf `juna/vinted-scheduled-sync`, Plan unter `docs/superpowers/plans/2026-10-01-vinted-scheduled-sync.md`; Veröffentlichung steht noch aus. Der Serverflag bleibt in der Vorlage aus, alle Kontofreigaben beginnen ausgeschaltet. Keine produktive Kontofreigabe, Vinted-Aktion oder Workerumstellung ausgelöst. Reale Laufzeiten, weitere Konten und 5/10-Minuten-Intervalle bleiben separate Nachweise. Neue Benachrichtigungen und lokale plattformspezifische Inseratentwürfe folgen in den weiteren geplanten Paketen.

## 2026-09-30 – Juna – verlässliche Vinted-Abrufe produktiv aktiviert

**Auftrag:** Nach dem integrierten PR #267 den separat freigegebenen Vinted-Worker auf den bereits veröffentlichten und geprüften Merge-Commit umstellen.

**Änderung:** Das Image aus `e753200e8a5aac72945e0af150fd8e4b80dff544` über den vorhandenen GitHub-Workflow gebaut und ausschließlich die bestehende einzelne Worker-Instanz aktualisiert. Die Compose-Datei stimmt per SHA-256 mit dem Repository überein. Compose und Image-Zuordnung sind mit Modus 0600 gesichert; das vorige Image bleibt für einen Rückweg erhalten. Rollout und Rückweg sind in `docs/implementation/vinted-worker-rollout.md` festgehalten.

**Prüfung:** Image-Workflow erfolgreich mit exakt dem vorgesehenen Commit. Vor und unmittelbar vor dem Wechsel sowie danach keine aktiven oder ungeklärten Browsersitzungen und keine wartenden oder laufenden Aufträge. Die neue Migration ist installiert; die atomare Importfunktion erlaubt ausschließlich dem Serverdienst die Ausführung. Der neue Container ist gesund, der öffentliche Healthcheck erfolgreich und ein anonymer Abrufstart mit HTTP 401 abgewiesen. Die öffentliche Web-App liefert denselben Merge-Commit. Kein echter Vinted-Datenabruf oder Inserat-Upload wurde ausgelöst; die weiteren geplanten Pakete sind noch offen.

## 2026-09-30 – Juna – Vinted-Paket für PR und Merge vorbereitet

**Auftrag:** Den geprüften Vinted-Zweig veröffentlichen, erfolgreiche Pflichtprüfungen abwarten, mit Merge-Commit integrieren und den Feature-Zweig samt Worktree aufräumen.

**Abgleich:** Den eigenen, noch unveröffentlichten Zweig auf den aktuellen `origin/master` mit dem bereits integrierten Unternehmens-/Versandumbau gesetzt. Die beiden Konflikte im AI-Changelog und in der Schemaregistrierung unter Erhalt beider Änderungen aufgelöst; die automatisch zusammengeführten Datenbanktypen werden erneut geprüft. Die vollständige verbindliche Abnahme erfolgt im PR vor dem Merge.

**Prüfung:** Nach dem Abgleich erneut 140 Worker-Tests, Anwendungstypprüfung, Produktionsbau und Schemaregistrierung erfolgreich. Den bereits lokal abgenommenen Vinted-Browserfall gezielt in die PR-Pflichtauswahl aufgenommen; deren Vertrag wurde zuerst fehlschlagend nachgestellt und besteht anschließend mit 18 Kernfällen.

## 2026-09-30 – Juna – Vinted-Abrufe gegen Teilfehler abgesichert

**Auftrag:** Die erste freigegebene Etappe des agentengeprüften Vinted-Ausbaus umsetzen: verlässliche Quellenstände und sichere Datenübernahme vor Zeitsteuerung, Benachrichtigungen und Inseratentwürfen.

**Änderung:** Profil, Inserate, Gespräche, Nachrichten, Verkäufe und Bewertungen tragen getrennte Ergebnisse. Erfolgreiche Seiten und Gespräche bleiben bei unabhängigen Abruffehlern erhalten; unvollständige Listen berechtigen nicht zum Löschen. Anmeldeverlust und entzogener Zugriff brechen weiter ab. Fehlende Sterne, Autoren und Herkunft einer Bewertung bleiben unbekannt. Der Fortschrittsdialog nennt Teilfehler und bleibt dafür offen; erfolgreiche Kontodaten werden neu geladen.

**Datenbank:** Neue deklarative Quelle `300_marketplace_import_reliability.sql` mit getrennten Abrufständen und atomarer Importfunktion. Die Funktion ist ausschließlich für den Serverdienst erreichbar und prüft den Sitzungsbesitzer, seine aktuellen Rechte, Kontozuordnung und Ablauf erneut innerhalb der Schreibtransaktion. Neuere bestätigte Cacheänderungen bleiben gegenüber verspäteten Abrufen erhalten. Die CLI-Migration wurde in einer eigenen Prüfdatenbank erzeugt, automatisch auf die geplanten Objekte begrenzt und transaktional auf dem historischen Migrationsstand angewendet. Rechte, Sequenzrechte und Kommentare wurden aus den deklarativen Schemas übernommen; die Typen sind neu erzeugt. Bestehende Migrationen bleiben unverändert.

**Review:** Zwei Agenten haben Anzeige und Datenbank umgesetzt; ein weiterer hat das gesamte Paket unabhängig geprüft. Der dabei gefundene Datenverlustrandfall bei Inseraten ohne bestätigte Kontozuordnung wurde zuerst mit einer fehlschlagenden Regression nachgestellt und behoben. Keine weiteren funktionalen Befunde verblieben.

**Prüfung:** 140 Worker-Tests, 66 gezielte Angular-Tests, 15 Parser-Tests und 174 Datenbankprüfungen in sechs Marketplace-Suiten erfolgreich. Worker- und Anwendungstypprüfung, beide Bauten, gezieltes ESLint und Formatprüfung sowie Schema-/Migrationsverträge und Suite-Audit bestanden. Ein lokaler Browserfall prüft unbekannte Bewertungen, erhaltene Teilwarnungen und automatische AXE-Prüfungen beider betroffener Ansichten. Die Tests verwenden eigene Datenbanken und künstliche Browserantworten; es wurde kein Vinted-Konto verändert.

**Stand:** Eigener verwalteter Worktree auf `juna/vinted-data-reliability`. Die weitere Zeitsteuerung, neue Benachrichtigungen und lokale Inseratentwürfe folgen in den nächsten geplanten Paketen. Die Anwendung ist noch nicht veröffentlicht.

## 2026-09-30 – Juna – Vinted-Ausbau durch Agenten und Quellenprüfung überarbeitet

**Auftrag:** Den gesamten Vorschlag für automatische Vinted-Abrufe, Benachrichtigungen, Mehrkonten und gemeinsame Inserate durch unabhängige Agenten prüfen und zusätzliche Recherche einarbeiten.

**Review:** Zwei Agentenreviews für Hintergrundbetrieb und Benachrichtigungen vollständig erhalten. Ein drittes Inserate-/Mehrkonten-Review wurde nach konkreten Befunden durch ein Nutzungslimit beendet; Artikelbindung, Eindeutigkeit und Bildlöschung wurden anschließend selbst am Code nachgeprüft. Zusätzliche Herstellerquellen zu Supabase, GoLogin, Dotb und eBay sowie CI-/Rolloutverträge geprüft. SellerAiders Fünf-Minuten-Angabe betrifft Favoriten-/Like-Benachrichtigungen mit anschließendem Senden und ist kein Standard für eingehende Nachrichten.

**Änderung am Plan:** Sechs überprüfbare Etappen statt eines großen Abruf-/Meldungspakets. Quellen, Ereignisse, Meldungen und Fortschritt werden gemeinsam je erfolgreichem Bereich übernommen. Offline-Freigaben erhalten die heutige Betreiber-/Workspaceadmin-Grenze; Dispatcher, Sperrversionen, Lebenszeichen, Cloudkapazität und Recovery werden vor automatischem Betrieb vereinheitlicht. Die Team-Glocke bleibt gemeinsam mit eingeschränkter Sichtbarkeit, richtigem Zähler und inhaltsfreiem Broadcast. Entwürfe, Anbieterstand und Übertragungsauftrag bleiben getrennt; externe Bestandsinserate brauchen keinen künstlichen Lagerartikel. Einzelstücke erhalten je Plattform ein aktives Zielkonto. Veröffentlichungsaufträge schützen eigene Fotokopien und blockieren Wiederholung bei unklarem Ausgang. eBay bleibt als eigenes Folgepaket im Gesamtplan. Messungen und gezielte Live-Nachweise sind ausdrücklich von lokalen Abnahmen getrennt.

**Prüfung:** Ausschließlich öffentliche Primärdokumentation und Projektcode gelesen; Plan und AI-Changelog angepasst. Zwei abschließende Agentengegenprüfungen bestätigen die integrierte Richtung; deren sechs Ergänzungen zu laufendem Rechteentzug, Teilerfolg, Doppelclaim/Bereinigung, Nachrichtenrichtung, gelöschten Meldungen und Anzeigeeinstellungen wurden in Vertrag und Abnahme aufgenommen. Dokumentformatierung und Git-Diff geprüft. Keine Produktänderungen, Anwendungstests, Vinted-Sitzungen, Kontoanlage, Veröffentlichung oder Auslieferung. Offene Quellen-/Kapazitätsnachweise und die gezielte Aufnahme neuer Browsertests in die PR-Pflichtauswahl sind im überarbeiteten Bericht festgehalten.

## 2026-09-30 – Juna – Vinted-Aktualisierung, Meldungen und Inseratablauf untersucht

**Auftrag:** Automatische Vinted-Abrufe alle 5, 10 oder 15 Minuten, Meldungen für Nachrichten/Angebote/Käufe/Bewertungen, weitere Konten und plattformspezifische Inserate mit getrenntem Speichern und Übertragen vorbereiten.

**Befund:** Bearbeiten lädt derzeit das Anbieterformular; Speichern schreibt unmittelbar zu Vinted. Der gemeinsame Inseratbereich erlaubt ausschließlich Kleinanzeigen und verlangt einen internen Artikelbezug. Der manuelle Sync benötigt ein aktuelles Nutzer-Zugangstoken. Ungelesene Gesprächsdetails werden übersprungen; Verkäufe werden nur mit Bestellkennung und Status „Versendet“ erfasst. Bewertungsfehler erscheinen als leere Liste. Der bestehende Benachrichtigungsfeed braucht persistente Ereigniserkennung, Duplikatvermeidung und eine Sichtbarkeit passend zu den eingeschränkten Marktplatzrechten.

**Vorschlag:** 15 Minuten als Vorgabe, je Konto 5/10/15 Minuten wählbar; serverseitige Abrufe und neue Meldungen, danach gemeinsame Inseratentwürfe mit sofortigem Bearbeiten, zuletzt neue Vinted-Veröffentlichungen und echte Zwei-Konten-Abnahme. Herstellerangaben, Grenzen und konkrete Abnahmekriterien stehen in `docs/audit/2026-09-30-vinted-sync-listing-flow.md`. Die öffentlich angezeigte deutsche AGB-Fassung gilt erst ab 5. Oktober 2026; sie wurde nicht als bereits geltende Fassung ausgegeben.

**Prüfung:** Aktuellen Hauptstand nach `git fetch` mit `origin/master` abgeglichen und einen eigenen Zweig `juna/vinted-sync-listing-flow` angelegt. Relevanten Frontend-/Worker-/Schema-Code und öffentliche Primärquellen gelesen. Nur Dokumentation geändert; keine Anwendungstests, Anbietersitzung, Kontoanlage, Schreibaktion, Veröffentlichung oder Auslieferung. Der Ablaufvorschlag muss vor Produktänderungen abgestimmt werden.

## 2026-09-30 – Juna – Shop und Versand an Unternehmensdaten angebunden

**Auftrag:** PR 4 des freigegebenen Unternehmensumbaus umsetzen: Shop-Bankkonto und Impressum zentral lesen, Versand-Vererbung mit erhaltenen individuellen Absendern einführen und doppelte Steuerpflege entfernen.

**Änderung:** Bankkonto und Impressum werden aus dem aktiven Unternehmensprofil gelesen. Shop-Zahlungseinstellungen enthalten nur Methoden und Anbieterangaben; die IBAN wird maskiert angezeigt und zur zentralen Pflege verlinkt. Echte alte Bankdaten sind bei leerem Unternehmenskonto nur ein Formularvorschlag, der ausdrücklich gespeichert werden muss. Neue Versandkonfigurationen verwenden die Unternehmensanschrift; vollständige alte Absender bleiben individuell und beim Umschalten erhalten. Die doppelte Steuer-Auswahl auf der Workspace-Seite ist entfernt. Ein bestehender Checkout-Fehler beim Wechsel der Zahlungsart wurde mit Regressionstest behoben. Umsetzung auf `juna/company-shop-shipping`, Basis `8dec8967`; Plan unter `docs/superpowers/plans/2026-09-30-company-shop-shipping.md`.

**Datenbank:** Deklarative Versand-Auswahl, gezielt erzeugte Migration und neu generierte Typen. Alte Adress- und Legacy-Shopfelder bleiben gespeichert. Migration in eigener lokaler Datenbank angewendet; alle 2.303 Prüfungen in 69 Dateien bestehen. Zwei bestehende Advisor-Hinweise betreffen andere Policies.

**Prüfung:** Neue Verhaltensprüfungen zuerst fehlschlagend ausgeführt, anschließend 27 und 31 gezielte Service-Prüfungen sowie 94 betroffene Oberflächen-/Bestelltests bestanden. Echter Chromium-Browserfall bestätigt Unternehmensbank und Impressum, Erhalt der Legacy-Daten, beide Versandmodi und Vorschlagsübernahme ohne Speichern. WCAG AA und 390px ohne Überlauf erfolgreich, keine Laufzeitfehler im Ablauf. Typprüfung, Produktionsbuild, Shared-UI-Prüfung, Suite-Audit und Schema-/Migrations-/Browserauswahl-Verträge erfolgreich. Vollständige Anwendungssuite folgt einmal in der PR-CI. Unabhängiges Abschlussreview abgeschlossen: ungültige IBANs werden im Shop, im Vorschlag und im Unternehmensformular abgewiesen; Versand liefert bei Carrier-Ladefehlern keinen angenommenen Absender. Der Shop zeigt Unternehmens-Laden und Ladefehler getrennt von fehlenden Bankdaten, mit Wiederholungsaktion. Alle drei Fälle zuerst fehlschlagend nachgestellt; anschließend 152 relevante Tests in 13 Dateien und erneute Browserabnahme erfolgreich. Abschließende Typ-/Build-/Format-/Lint-Prüfungen, Shared-UI und Suite-Audit grün. Keine vertagten Review-Befunde; Umfang und Übergangsentscheidungen stehen im Plan.

## 2026-09-30 – Juna – Unternehmensdaten in neue Geschäftsdokumente übernommen

**Auftrag:** PR 3 des freigegebenen Unternehmensumbaus umsetzen: Unternehmensdaten für neue Rechnungen, Gutschriften und Eigenbelege verwenden und historische Dokumente unverändert erhalten.

**Änderung:** Rechnungen speichern den verbindlichen Absender direkt beim Datenbankschreiben; unvollständige Unternehmensdaten liefern einen strukturierten Fehler und einen Weg zu den Unternehmenseinstellungen. Wiederholte Rechnungsanfragen liefern den unveränderten Originalbeleg auch nach Profiländerungen. Retouren speichern Absender, Käufer, Steuerhinweis und echte Rechnungsnummer der Originalrechnung; ohne Originalrechnung werden vollständige aktuelle Unternehmensdaten erfasst. Fehlen diese, bleibt die Erstattung möglich, die Gutschriftansicht meldet den fehlenden Belegnachweis. Eigenbelege übernehmen eine frisch gelesene Kopie der Geschäftsanschrift und Steuerdaten ins PDF sowie in die Metadaten; der Server prüft deren Übereinstimmung. Historische Logos werden ausschließlich über ihren gespeicherten privaten Dateipfad dargestellt; fehlende Dateien lösen keinen Wechsel zum heutigen Logo aus. Demo-Absender und erfundene Banknamen aus der Belegansicht entfernt. Workspace-Wechsel werden während der Belegerstellung und beim Upload geprüft.

**Datenbank:** Neue deklarative Datei `290_company_document_snapshots.sql`, registrierte und erzeugte Migration mit zwei ergänzten JSON-Spalten und Schutzfunktionen. Der erste CLI-Abgleich enthielt ältere sachfremde Unterschiede und wurde verworfen. Der gezielte Abgleich erfolgte in einer eigenen Prüfdatenbank aus den vorhandenen Migrationen und dem neuen Schema. Von migra nicht ausgegebene Rechteentzüge und Spaltenkommentare wurden automatisch aus der deklarativen Datei übernommen; Typen wurden mit der lokalen Supabase-CLI neu erzeugt. Bestehende Migrationen und Dokumentdaten wurden nicht geändert.

**Review:** Zwei Befunde nachgestellt und behoben: Gutschriften ohne Originalrechnung verwenden das beim Verkauf gespeicherte Steuerverfahren; fehlen eindeutige historische Steuerdaten, bleibt nur die Erstattung möglich. Neue Shoprechnungen verwenden das aktuelle Unternehmens-Steuerverfahren auch unmittelbar nach dem Speichern ohne Seitenneuladen; die Datenbank setzt es verbindlich. Regressionstests sichern beide Fälle ab.

**PR-Prüfung:** Die vollständige CI erkannte zwei neue native Node-Blob-Fixtures im PDF-Test als Browserzugriff. Für genau diesen PNG-Test wurde die vorhandene begründete Fixture-Ausnahmeliste ergänzt; er nutzt ausschließlich Nodes Blob und keine Browser-APIs. Der gesamte Suite-Audit und alle drei betroffenen PDF-Tests bestehen nach der Korrektur, ebenso Formatierung und ESLint.

**Prüfung:** Produktionsbau und Typprüfung erfolgreich. 46 gezielte Node-, 38 DOM- und 21 Angular-Tests bestanden. Nach Anwendung der erzeugten Migration bestehen alle 2.293 Datenbankprüfungen in 68 Dateien. Der neue verbindliche Browserfall bestätigt die Sperre bei fehlenden Unternehmensdaten und das unveränderte erneute Öffnen einer Rechnung nach Profiländerungen; die automatische WCAG-AA-Prüfung besteht ebenfalls. Der Belegbereich ist per Tastatur scrollbar, schwache Textkontraste wurden korrigiert. Gezieltes ESLint, Schema-/Migrations-/Browserauswahl-Verträge und die Test-Suite-Prüfung erfolgreich. Das unabhängige Review ist abgeschlossen; die vollständige PR-CI folgt vor dem Merge.

**Weiterarbeit:** PR 4 zentralisiert Shop-, Bank-, Impressums- und Versanddaten unter Erhalt bestehender Versand-Overrides.

## 2026-09-30 – Juna – Unternehmenszweig geprüft und Altzweige aufgeräumt

**Auftrag:** Den im Web begonnenen Unternehmensdaten-Umbau weiterführen, aktuelle Fehler beheben und abgeschlossene Zweige sicher aufräumen.

**Änderung:** PR 2 gegen die vierteilige Spezifikation geprüft. Unternehmenstests setzen ihre Testumgebung zurück und registrieren die Signal-Eingänge wie die vorhandenen Kontotests. Navigationstests lesen Titel und Beschreibung getrennt. Der technische Logo-Dateiupload nutzt die dokumentierte Shared-UI-Ausnahme und eine zugängliche Beschriftung. Eine abweichende Postanschrift reagiert über ein Signal. Ein erzwungener Workspace-Wechsel übernimmt ausschließlich das neue Unternehmensprofil und gibt die alte Bearbeitungssperre frei; Logoänderungen im selben Workspace bewahren laufende Eingaben. Die vier Unternehmens-Browsertests sind jetzt Teil der verbindlichen PR-Auswahl; ihr Auswahlvertrag ist angepasst.

**Aufräumen:** 54 entfernte und 14 lokale abgeschlossene Branches entfernt. Neun alte Arbeitskopien entfernt; eine weitere wurde nach einem Windows-Pfadlängenfehler aus der Arbeitskopienliste entfernt und ihr Restordner vollständig archiviert. Der überholte Konto-PR #263 ist geschlossen; seine Funktion ist über #262 integriert, sein Zweig bleibt zur Nachvollziehbarkeit erhalten. Drei Arbeitskopien mit ungesicherten Änderungen bleiben erhalten. Commit-Historie, Patches und unversionierte Dateien liegen zusätzlich unter `.git/audit-backups/20260930/`; das Git-Bundle wurde geprüft. Die Hauptarbeitskopie wurde ausschließlich auf `origin/master` vorgezogen.

**Prüfung:** Fehler zuerst lokal nachgestellt. Danach 19 Angular-, 17 DOM- und 35 Node-Tests bestanden; 17 UI-/Browserauswahl-Vertragstests bestanden. Typprüfung, gezieltes ESLint, Shared-UI-Prüfung und Produktionsbau erfolgreich. Die vier Browserfälle sind in der PR-Auswahl nachgewiesen. Datenbank und echte Browser wurden lokal nicht ausgeführt, da Docker nicht läuft; der unveränderte SQL-Stand hatte in PR #264 bereits einen erfolgreichen Datenbanklauf. Der korrigierte Gesamtstand muss vor dem Merge erneut durch die verbindliche PR-CI. Der vorhandene pako-Bauhinweis bleibt bestehen.

**Weiterarbeit:** Nach PR 2 folgt PR 3: Unternehmensdaten in neue Rechnungs-, Gutschrift- und Eigenbeleg-Snapshots übernehmen, bestehende Dokumente unverändert lesen und Demo-Absender entfernen. PR 4 zentralisiert Shop/Bank/Impressum und Versand mit Erhalt bestehender Absender-Overrides.

## 2026-09-30 – Juna – Projektstand und Branch-Bestand aufgenommen

**Auftrag:** Die letzten Tage zusammenfassen, offene Arbeiten und überflüssige Branches prüfen und die nächsten Schritte vorschlagen.

**Befund:** GitHub-Hauptstand, offene PRs #263/#264, Prüfungen und Arbeitskopien abgeglichen. 49 entfernte Branches sind vollständig im Hauptstand enthalten; weitere Zweige benötigen Einzelvergleich. Drei alte Arbeitskopien enthalten ungesicherte Änderungen. Bericht unter `docs/audit/2026-09-30-project-status.md` festgehalten. Keine Branches gelöscht, keine fremden Arbeitskopien geändert.

**Prüfung:** Git fetch, Git-Abstammungsprüfung, Status aller Arbeitskopien und GitHub-PR-/CI-Abfrage. Erfolgreiche Auslieferung des aktuellen Hauptstands anhand seiner GitHub-Prüfungen bestätigt; keine eigenen Anwendungstests oder Live-Abnahme durchgeführt.

## 2026-09-30 – Juna – Unternehmensdaten als zentrale Workspace-Stammdaten aufgebaut

**Auftrag:** PR 2 des Konto-/Unternehmensumbaus umsetzen: Einen eigenen Bereich „Unternehmen“ für workspacebezogene Geschäfts-, Adress-, Steuer-, Bank- und Logodaten schaffen, ohne Rechnungen, Shop oder Versand in diesem Schritt bereits umzustellen.

**Änderung:** Neue Tabelle `workspace_company_profiles` mit leerem Profil pro bestehendem und neuem Workspace, RLS-Lesezugriff für Mitglieder und Schreibzugriff ausschließlich über Owner/Admin-RPCs. Unternehmensprofil und `workspaces.tax_mode` werden atomar gespeichert; Änderungen erzeugen ein redigiertes `company_profile_updated`-Ereignis mit Feldnamen statt sensibler Alt-/Neudaten. Der private Bucket `company-assets` speichert versionierte PNG/JPEG/WebP-Logos workspacegebunden. `CompanyProfileService` schützt vor verspäteten Workspace-Antworten, bildet die Rechnungsdaten-Bereitschaft ab und räumt einen neuen Logo-Upload bei fehlgeschlagener Aktivierung wieder auf. Unter Einstellungen gibt es jetzt „Unternehmen“ direkt nach „Konto“ mit den vier Bereichen Unternehmensprofil, Geschäftsanschrift, Steuerdaten und Bankverbindung; Nicht-Admins sehen die Daten schreibgeschützt. Ungespeicherte Änderungen sperren den Workspace-Wechsel bis Speichern oder Verwerfen. Das Prüfarchiv enthält zusätzlich `company-profile.csv` und verwendet Schema-/Exportversion 1.4.0.

**Abgrenzung:** Rechnungen, Gutschriften, Eigenbelege, Shop-/Bankdaten und Versand greifen in diesem PR noch nicht auf die neuen Stammdaten zu; diese Integration folgt in PR 3 und PR 4.

**Prüfung:** Datenbank-, Service-, Angular- und Browser-Regressionstests decken RLS/RPCs, Workspace-Isolation, atomare Speicherung, Logo-Rollback, Rollen, Dirty-State, responsive Darstellung und Accessibility ab. Die vollständige PR-CI bleibt der Merge-Gate für den finalen Branchstand.

## 2026-09-30 – Juna – Kontoeinstellungen mit Profil, Sicherheit und Sitzungen modernisiert

**Auftrag:** PR 1 des Konto-/Unternehmensumbaus umsetzen: Die bisherige Ein-Karten-Kontoseite in ein echtes persönliches Nutzerprofil mit Sicherheits- und Sitzungsbereich überführen, ohne Unternehmensdaten vorwegzunehmen.

**Änderung:** `/settings/account` besteht jetzt aus den drei Bereichen „Profil“, „Sicherheit“ und „Sitzungen“. Das Profil zeigt Initialen, Anzeigename und die schreibgeschützte Anmelde-E-Mail; Serveraktualisierungen überschreiben keine laufende Namenseingabe. Passwortänderungen verlangen das aktuelle Passwort, mindestens zehn Zeichen und eine identische Wiederholung; vor dem Setzen des neuen Passworts bestätigt Supabase die bestehende Anmeldung erneut. Fehler bleiben im geöffneten Dialog sichtbar. Zwei-Faktor-Authentifizierung wird nur als neutraler, noch nicht eingerichteter Status dargestellt. Die aktuelle Sitzung heißt bewusst nur „Dieser Browser“; die bestehende bestätigungspflichtige globale Abmeldung bleibt erhalten. Die Oberfläche verwendet die vorhandenen Shared Cards, Buttons, Felder, Badges und den Modal-Rahmen.

**Prüfung:** PR-CI #1007 erfolgreich: Formatierung, ESLint, Typprüfung, Workflow-/UI-Architekturprüfungen, Produktionsbuild, Node- und DOM-Tests, beide Angular-Shards sowie Browser-Smoke einschließlich der neuen Konto-Tests für Desktop/Mobil, Hell/Dunkel und WCAG-AA liefen erfolgreich.

## 2026-09-30 – Juna – Konto- und Unternehmensdatenarchitektur geplant

**Auftrag:** Die bisher sehr eingeschränkte Konto-Seite zu einem echten Nutzerprofil ausbauen und parallel einen zentralen Unternehmensbereich für Rechnungs-, Steuer-, Bank-, Logo- und Adressdaten planen.

**Befund und Entwurf:** Konto, Workspace, Rechnungen, Shop/Zahlungen und Versand wurden gemeinsam geprüft. Rechnungen und Shop enthalten aktuell noch feste Demo-Unternehmensdaten; Bankdaten und Versandadresse liegen zusätzlich an getrennten Stellen. Die neue Spezifikation trennt persönliche Kontodaten, rechtliche Unternehmensdaten und interne Workspace-Vorgaben. Unternehmensdaten werden workspacebezogen in einer eigenen Tabelle gepflegt, auf Dokumenten als unveränderlicher Snapshot gespeichert und nur durch Owner/Admin geändert. Bestehende Versandadressen bleiben als Override erhalten; Shop-Bank- und Impressumsdaten werden erst nach sicherem Übergang zentralisiert.

**Nächster Schritt:** Nach Nutzerfreigabe der Spezifikation wird ein detaillierter Implementierungsplan erstellt. Produktcode wurde in diesem Schritt noch nicht geändert.

## 2026-09-30 – Juna – Technische Diagnose-Details für Marktplatz-Synchronisation ergänzt

**Auftrag:** Im Synchronisations- und Fortschritts-Modal der Vinted-Kontenverwaltung eine detaillierte, aufklappbare Diagnoseanzeige einbauen, um Fehlerursachen (wie HTTP 401 Session-Drops, Proxy-Wechsel, Cloud-Browser-Timeouts) und den genauen Abbruchschritt transparent einsehen und den Server-Logbefehl direkt kopieren zu können.

**Änderung:** `MarketplaceSyncProgressComponent` um ein aufklappbares Diagnose-Panel erweitert. Bei Fehlern (z. B. `identity`, `browser`, `profile`, `publications`, `sales`, `access`) werden der exakte Fehlercode, der abgebrochene Teilschritt, eine verständliche deutsche Ursachenerklärung, die Auftrags-ID und der Server-Logbefehl (`docker logs --tail 100 flipbase-marketplace-worker`) mit Ein-Klick-Kopierfunktion dargestellt. Bei Fehlern außerhalb von `identity` steht zusätzlich ein direkter Aktionsbutton bereit, um die Browser-Ansicht zur manuellen Prüfung und Lösung von Sicherheitsabfragen zu öffnen. Komponente um dedizierte SCSS-Datei und vollständige Angular- und Barrierefreiheits-Tests (`axe-core`) ergänzt.

**Prüfung:** 147 Marktplatz-Tests in 13 Testdateien erfolgreich ausgeführt. Typprüfung (`npm run typecheck`), ESLint, Prettier-Formatierung und Angular-Produktionsbau (`ng build`) ohne Fehler bestanden.

## 2026-09-30 – Juna – Vinted-Bewertungstab mit Zählern und automatischer Trennung ergänzt

**Auftrag:** Unter Vinted die Bereichs-Tabs um „Bewertung“ erweitern und die aktuellen Vinted-Bewertungen detailliert auflisten (originalgetreu wie bei Vinted), mit getrennten Zählern oben für Bewertungen von Mitgliedern und automatisch generierte Bewertungen sowie einer gemeinsamen Liste mit Filterfunktion.

**Änderung:** In `marketplace-presentation.ts` und `marketplaces.routes.ts` wurde die neue Sektion `Bewertung` (`/marketplaces/vinted/feedback`) hinzugefügt. Die neue Standalone-Komponente `VintedFeedbackListComponent` stellt oben drei KPI-Karten bereit: Gesamtbewertung mit Sternen, Anzahl der von Mitgliedern verfassten Bewertungen und Anzahl der automatischen Bewertungen. Darunter befindet sich eine Filterleiste (Alle, Von Mitgliedern, Automatisch) sowie eine barrierefreie Liste der einzelnen Bewertungen im Flipbase-Design mit Avataren, Mitglieds- bzw. System-Badges, Sternen (1–5), Datumsangaben, verfassten Texten und verlinkten Artikeln. Im Frontend-Modell (`marketplace-read.models.ts` und `marketplace-response.ts`) werden Feedbacks strukturiert und typisiert im Profil erfasst. Im Worker (`vinted-account-import.ts`) ruft der Abgleich `/api/v2/feedbacks?user_id=...` fehlertolerant ab und parst Feedbacks mit Unterscheidung von manuellen und automatischen Bewertungen.

**Prüfung:** 122 Tests in 10 Angular-Testdateien der Marktplätze (einschließlich 5 neuer Unit-Tests für `VintedFeedbackListComponent`) und 130 Worker-Tests fehlerfrei ausgeführt. TypeScript-Typprüfung (`npm run typecheck`), ESLint, Prettier-Formatierung und der Angular-Produktionsbau (`ng build`) ohne Fehler bestanden.

## 2026-09-30 – Juna – Vinted-Live-Vorschau und Schließen des Sync-Modals bei Reconnect umgesetzt

**Auftrag:** Beim Klick auf „Vinted-Anmeldung erneuern“ im Abgleichsdialog soll sich das bisherige Status-Modal schließen, damit das neue Anmeldefenster bedienbar ist. Falls Vinted bei der Anmeldung eine zusätzliche Prüfung verlangt (z. B. Captcha oder Cookie-Banner) und die automatische Passworteingabe stoppt, soll der Nutzer die genaue Browser-Vorschau sehen und die Prüfung direkt im Bild bedienen können.

**Änderung:** Im Sync-Progress-Dialog schließt der Klick auf „Vinted-Anmeldung erneuern“ sofort das Fortschritts-Modal, und der Workspace schließt das Modal zusätzlich bei jeder Routenänderung auf `/connect/`. Bei nicht bedienbaren Anmeldeseiten oder Bot-Challenges (`form_unavailable` / `interaction_required`) lädt der Store sofort das aktuelle Bildschirmfoto der Browsersitzung und meldet verständlich, dass eine manuelle Prüfung vorliegt. In der Vinted-Anmeldemaske wird die interaktive Browser-Vorschau angezeigt: Der Nutzer kann direkt per Klick im Bild (z. B. für Schiebe-Puzzles oder Cookie-Buttons) agieren, Text und Tasten (Enter/Tab/Esc) senden, das Bild aktualisieren und die Anmeldung nach erfolgreichem Login direkt prüfen und verbinden. Zusätzlich steht ein Button zum manuellen Öffnen der Browser-Ansicht bereit. Im Worker wurde die Cookie-Behandlung vor den Anmeldefeldern robuster gestaltet und bei erkannter Bot-Challenge wird `interaction_required` gemeldet.

**Prüfung:** 117 Marktplatz-Komponententests in 9 Testdateien und 129 Worker-Tests erfolgreich ausgeführt. Typprüfung, ESLint, Prettier und der Angular-Produktionsbau (`ng build`) ohne Fehler bestanden.

## 2026-09-29 – Juna – Verkaufsfilter ohne Zähler vereinheitlicht

**Auftrag:** Den zusammengefassten Filter auf der Verkaufsseite an die übrigen Tabellenansichten angleichen. „Alle Verkäufe“ und die dynamischen Zahlen bei „Alle“ und „Retouren“ sollen entfallen.

**Änderung:** Das vorhandene gemeinsame Dropdown bleibt bestehen, zeigt aber nur noch die kurzen Optionen „Alle“, „Retouren“, „Kleinanzeigen“, „eBay“, „Vinted“ und „Shop“. Die Filterlogik, Suche, Plattformdarstellung in den Verkaufszeilen und Verkaufsdaten bleiben unverändert.

**Prüfung:** Ein Angular-Regressionstest legt die vollständige Optionsliste ohne Zähler fest. Die regulären PR-Prüfungen übernehmen anschließend Typprüfung, Build und die vollständigen Anwendungstests.

## 2026-09-29 – Juna – Vinted-Anmeldung als zentriertes Modal und Diagnostik erweitert

**Auftrag:** Die Vinted-Anmeldung in der Kontenverwaltung und auf der Vinted-Seite als zentriertes Modal statt als Drawer oder am Seitenende anzeigen. Die Ursache für fehlschlagende Anmeldungen („Vinted-Anmeldeformular konnte nicht automatisch bedient werden“) sowie die Proxy- und Sitzungsverwaltung bei GoLogin analysieren und absichern.

**Änderung:** Die Vinted-Anmeldung unter `/marketplaces/vinted/connect/:connectionId` rendert nicht mehr am Seitenende im Router-Outlet, sondern öffnet ein zentriertes Modal (`app-modal-shell` mit `presentation="center"`). In den Marktplatz-Einstellungen (`/settings/marketplaces`) öffnen Anmelde- und Bestätigungsdialoge ebenfalls als zentriertes Modal statt als Seiten-Drawer. Im Marketplace-Worker fängt `submitVintedLogin` Weiterleitungen auf 2FA-Seiten (`/member/login/2fa`) ab und meldet diese als `verification_required` anstelle eines Formularfehlers. Bei Fehlern wird ein strukturiertes, anmeldedatensicheres Diagnose-Event auf stderr ausgegeben, um genaue Schritte und Bot-Challenges (z. B. DataDome) nachvollziehen zu können.

**Prüfung:** Angular-Komponententests der Marktplätze (117 Tests in 9 Testdateien) und Worker-Tests (129 Tests) erfolgreich ausgeführt. Typprüfung (`npm run typecheck`), ESLint und Prettier auf allen geänderten Dateien fehlerfrei bestanden.

## 2026-09-29 – Juna – Zentrale Stammdatenverwaltung ergänzt

**Auftrag:** Einen zentralen Stammdatenbereich für Marken, Einkaufsquellen, Verkaufsplattformen und Verkäufer schaffen, damit angelegte Werte wieder auffindbar und verwaltbar sind.

**Änderung:** Die Sidebar erhält oberhalb der Einstellungen den Bereich „Stammdaten“. Marken, Einkaufsquellen, Verkaufsplattformen und Verkäufer sind dort über eine gemeinsame Bereichsnavigation erreichbar. Marken lassen sich anlegen, umbenennen und kontrolliert zusammenführen. Einkaufsquellen lassen sich anlegen, umbenennen, archivieren und wiederherstellen; bestehende Einkaufszuordnungen bleiben erhalten. Die Verkäuferverwaltung ist in den Stammdaten eingebettet und verwendet Suche, Sortierung und Spaltenauswahl. Verkaufsplattformen zeigen zunächst die bestehenden Systemvorgaben; Kontoverbindungen bleiben davon getrennt in den Einstellungen. Die bisherigen Routen für Marken und Verkäufer leiten auf die neue Verwaltung weiter.

**Prüfung:** Der erste PR-Lauf #932 fand Formatabweichungen sowie veraltete Navigationserwartungen und eine unvollständige Supabase-Testattrappe. Diese Punkte wurden korrigiert; der folgende Pflichtlauf muss Format, Lint, Typprüfung, Unit-Suites, Browser-Smoke und Build vollständig grün bestätigen, bevor gemerged wird.

## 2026-09-29 – Juna – Plattformfilter der Verkaufsübersicht vereinheitlicht

**Auftrag:** Die Plattformfilter auf der Verkaufsseite wie bei Artikel und Einkäufe in einem einzigen Dropdown bündeln. Plattformlogos sollen nur an den Verkaufszeilen erscheinen und dieselben Namen und Logos wie im Dashboard verwenden.

**Änderung:** Die einzelnen Filterbuttons für Alle, Retouren, Kleinanzeigen, eBay, Vinted und Shop wurden durch das vorhandene Shared-Auswahlfeld ersetzt. Desktop- und Mobilzeilen zeigen die Plattform mit dem gemeinsamen Plattformbaustein; Vinted, Kleinanzeigen und eBay verwenden die bereits vorhandenen lokalen Logos, unbekannte Plattformen ein neutrales Shop-Symbol. Plattformnamen und -darstellung liegen zentral im Shared-Bereich; das Dashboard greift weiterhin über seine bestehenden Schnittstellen darauf zu.

**Prüfung:** Zwei neue Komponenten-Regressionstests wurden zuerst gegen den alten Stand rot ausgeführt und anschließend mit der neuen Filter- und Plattformdarstellung grün. Die vollständige Vor-PR-Prüfung und der Produktionsbau folgen vor dem Pull Request.

## 2026-09-29 – Juna – Dashboard-Mergekonflikt im Änderungsprotokoll aufgelöst

**Auftrag:** Den erneut gemeldeten Konflikt in PR #248 beheben, ohne das freigegebene Dashboard-Design zu verändern.

**Änderung:** Den aktuellen master-Stand übernommen und die parallel ergänzten Dashboard- und Landingpage-Einträge vollständig erhalten. Der Konflikt betrifft ausschließlich das gemeinsame Änderungsprotokoll; die Landingpage und ihr Vertragstest entsprechen unverändert master. Dashboard, Theme, Plattformassets und Navigation bleiben unverändert gegenüber der freigegebenen Vorschau.

**Prüfung:** Der Zusammenführungsversuch reproduziert ausschließlich den Konflikt im Änderungsprotokoll. Ein vollständiger Dateiabgleich und der Vergleich aller bisherigen Protokollabschnitte sichern den Erhalt beider Seiten. Gezielte Tests sowie die reguläre PR-CI prüfen den integrierten Stand vor einem Merge.

## 2026-09-29 – Juna – Innere Beta-Formular-Card entfernt

**Auftrag:** Die verschachtelte Card-im-Card-Darstellung im Beta-Bewerbungsbereich entfernen.

**Änderung:** Das Formular ist jetzt direkt die rechte Spalte des äußeren Beta-Blocks. Die zusätzliche Formular-Card samt eigenem Hintergrund, Rahmen, Radius, Schatten und Innenabstand wurde entfernt. Die kompakte Input-Darstellung bleibt erhalten; Formularlogik und Felder ändern sich nicht.

**Prüfung:** Der Landingpage-Test verlangt jetzt ausdrücklich, dass keine `.beta-application-form-panel` mehr vorhanden ist und das Formular direkt im Zweispaltenlayout liegt.

## 2026-09-29 – Juna – Dashboard-Spalten, Kartenköpfe und Schnellaktionen vereinheitlicht

**Auftrag:** Die rechte Spalte exakt am Bestandsüberblick ausrichten, Schnellaktionen mit sauber getrennten Icons gestalten, die drei unteren Kartenköpfe vereinheitlichen und den blauen Dashboard-Akzent durch das vorhandene Button-Gelb ersetzen.

**Änderung:** Diagramm-/Aufgabenzeile und untere Kartenreihe verwenden dieselben Spalten und Abstände. Alle drei unteren Kartenköpfe entstehen aus einer gemeinsamen Template-Vorlage mit Icon-Fläche, Titel, Untertitel und optionaler Shared-Aktion. Schnellaktionen behalten ihre Shared Buttons und erhalten klar getrennte gelbe Icon-Flächen; die Anordnung reagiert auf die tatsächlich verfügbare Kartenbreite. „Langsam drehend“ heißt jetzt „61–90 Tage im Bestand“. Markenakzente verwenden das vorhandene Flipbase-Gelb mit dunklen Icons/Texten auf gelben Flächen; Plattformfarben und Warn-/Fehlerfarben bleiben unverändert. Auf schmalen Ansichten bleibt „Alle anzeigen“ als zugänglich benannte Pfeil-Aktion erreichbar. Der aktuelle master-Stand wurde ohne Änderungen an seinen Fachfunktionen übernommen; beide Änderungsprotokolle bleiben erhalten.

**Prüfung:** Drei neue Regressionstests zuerst fehlgeschlagen, danach 22 Dashboard-Komponententests und 53 fachliche Tests erfolgreich. Formatierung, gezieltes ESLint, App-/Test-Typprüfung und Shared-UI-Prüfung erfolgreich. Der integrierte Produktionsbau besteht; nur der bestehende CommonJS-Hinweis zu pako bleibt. Die echte Angular-Vorschau wurde mit Playwright/Chromium in Hell und Dunkel bei elf Breiten von 320 bis 1664 px geprüft: identische rechte Kartenbreiten und -kanten, gleiche Kopfzeilenhöhen, keine Überlappungen, kein Seitenüberlauf und keine AXE- oder Konsolenfehler. Zeitraum, Plattform, Diagrammlegende, Theme, vier Schnellaktionen per Tastatur und „Alle anzeigen“ wurden geprüft; keine externen Vorschauanfragen. Zwei zusätzliche datenbankgestützte Browser-Regressionstests sind hinterlegt, hier jedoch nicht ausgeführt. Die reguläre PR-CI bleibt vor dem Merge erforderlich. Die separate HTML-Vorschau arbeitet ausschließlich mit Beispieldaten; kein Sidebar-/Workspace-Header-Umbau und keine Buchungen.

## 2026-09-29 – Juna – Beta-Bewerbung kompakter gestaltet

**Auftrag:** Das Beta-Anmeldeformular auf der Landingpage visuell überarbeiten, ohne den bestehenden Bewerbungsablauf oder die erfassten Daten zu verändern.

**Änderung:** Der Beta-Bereich ist jetzt zweispaltig aufgebaut: links stehen Beta-Hinweis, Überschrift und Erklärung, rechts sitzt das kompakte Formular in einer eigenen Fläche. Vor- und Nachname stehen am Desktop nebeneinander, die E-Mail darunter über die volle Breite. Labels, Datenschutzhinweis und Statusmeldung sind linksbündig; der Submit-Button nutzt die volle Formularbreite. Auf kleineren Ansichten stapeln sich beide Bereiche und die Namensfelder untereinander.

**Prüfung:** Ein Landingpage-Vertrag prüft die neue Zweispaltenstruktur, das Namensraster, das separate E-Mail-Feld, den vollbreiten Button und die linksbündige Ausrichtung. Die vorhandenen Feldnamen, Pflichtfelder und zweisprachigen Labels bleiben erhalten.

## 2026-09-29 – Juna – Plattformfarben und Bestandsicons im Dashboard korrigiert

**Auftrag:** Die drei unteren Dashboard-Kacheln an die freigegebene Detailvorschau angleichen: passende Plattformfarben, Plattformlogos in den Verkäufen und vollständige Bestandsicons ohne braune Warnwerte.

**Änderung:** Donut und Legende verwenden feste zentrale Farben je Plattform statt Farben nach Umsatzrang. Vinted bleibt türkis, Kleinanzeigen grün, eBay blau und sonstige Plattformen grau. Die Verkaufszeilen zeigen lokal eingebundene SVG-Zeichen neben ausgeschriebenen Namen; unbekannte Plattformen erhalten ein neutrales Shop-Symbol. Alle fünf Bestandszeilen und die Kartentitel besitzen passende Icons. Langsam drehende Ware wird orange, mehr als 90 Tage alte Ware rot dargestellt. Der Verweis auf alle Verkäufe bleibt ein Shared-Link und ist blau mit Rechtspfeil. Buchungslogik, übrige Dashboard-Kacheln und Navigation bleiben unverändert.

**Prüfung:** Drei neue Regressionstests zunächst rot, anschließend alle 19 Dashboard-Komponententests und 53 fachliche Tests erfolgreich. Typprüfung, gezieltes ESLint, Formatierung, Shared-UI-Prüfung und Angular-Produktionsbau erfolgreich. Wegen der lokalen Speichergrenze liefen Builds mit einem Worker, ohne parallele TypeScript-Kompilierung und mit `NG_BUILD_OPTIMIZE_CHUNKS=false`; die normale CI-Konfiguration bleibt unverändert. Keine Komponenten-CSS-Budgetwarnung; vorhandener CommonJS-Hinweis zu `pako` bleibt. Die tatsächlich gerenderten drei Kacheln wurden per Playwright/Chromium in Hell/Dunkel bei 320, 390, 768, 1200 und 1664 px geprüft: kein Seitenüberlauf, keine AXE-Befunde, alle Logos geladen, keine Konsolenfehler. Zeitraum, Plattformfilter und konstante eBay-Farbe wurden betätigt. Die separate HTML-Vorschau enthält nur Beispieldaten und bucht nichts. Die reguläre CI bleibt vor dem Merge erforderlich.

## 2026-09-29 – Juna – Dashboard nach freigegebener Vorschau aufgebaut

**Auftrag:** Die zuletzt freigegebene Dashboard-Variante tatsächlich implementieren: fünf Kennzahlenkacheln, Diagramm, Aufgaben, Schnellaktionen, letzte Verkäufe, Umsatzverteilung und Bestandsüberblick. Ohne Insights; Sidebar und Workspace-Header bleiben unverändert.

**Änderung:** Die Dashboard-Kacheln sind neu aufgebaut und verwenden die vorhandenen Shared Cards, Buttons, Badges und Selects sowie die zentralen Flipbase-Farben. Kleine Verlaufsgrafiken stammen aus den Berichtsperioden. Der Donut verteilt Umsatz statt Verkaufsanzahl und fasst zusätzliche Plattformen ohne Datenverlust zusammen. Der Bestandsüberblick zeigt Stückzahl, bekannte Anschaffungskosten, durchschnittliche bekannte Stückkosten sowie getrennte Lagergruppen von 61–90 und mehr als 90 Tagen. Ladefehler und Workspace-Wechsel zeigen keine scheinbar vollständigen Nullwerte. Die bestehende Buchungs- und Gewinnberechnung bleibt unverändert.

**Abgrenzung:** Aktuelles Bestandskapital erhält weder eine erfundene historische Kurve noch einen erfundenen Vergleich. Fehlende Kosten bleiben unbekannt. Nicht konfigurierte Mindestbestände erzeugen keine Warnung. Die separate HTML-Vorschau rendert die tatsächliche Angular-Komponente mit ausdrücklich gekennzeichneten Beispieldaten; Vorschauaktionen buchen nichts.

**Prüfung:** 16 Dashboard-Komponententests und 53 fokussierte Tests für Bericht, Kennzahlenänderungen, Diagrammkonfiguration und Anzeigeprojektionen erfolgreich. Lint, App-/Test-Typprüfung, Shared-UI-Prüfung und Produktionsbau erfolgreich. Die gerenderte Vorschau wurde in beiden Themes bei 320, 375, 390, 768, 1200 und 1664 px auf Überlauf und mit AXE geprüft: keine Befunde. Zeitraum, Plattform, Diagrammlegende, Tastatur-Tooltip und Vorschauaktionen wurden betätigt. Die regulären PR-Prüfungen bleiben vor einem Merge erforderlich.

## 2026-09-29 – Juna – Sticky-Navigation auf der Landingpage ergänzt

**Auftrag:** Die Landingpage nach dem Vorbild einer kompakten SaaS-Navigation um eine beim Scrollen sichtbare Menüleiste ergänzen und „Zur App“ in „Anmelden“ umbenennen.

**Änderung:** Der Kopfbereich ist jetzt als kompakter Sticky-Header aufgebaut. Neben dem Flipbase-Logo führt die Navigation zu Funktionen, Beta, Paketen & Preisen und FAQ. Theme- und Sprachumschalter bleiben am Desktop rechts erhalten; auf kleineren Ansichten stehen sie im aufklappbaren Mobilmenü. Der App-Link heißt „Anmelden“. Das Mobilmenü schließt nach einer Navigation sowie per Escape und hält seinen `aria-expanded`-Zustand synchron.

**Prüfung:** Der Landingpage-Vertrag beschreibt Sticky-Position, Navigationsziele, Anmelde-CTA und das zugängliche Mobilmenü. Ein statischer Red/Green-Abgleich bestätigt den neuen Markup- und Skriptzustand; die vollständigen Pflichtprüfungen folgen im PR.

## 2026-09-29 – Juna – Tabellenvergleich auf der Landingpage entfernt

**Auftrag:** Den vollständigen Landingpage-Abschnitt „Ein klarer Ablauf statt vieler Tabellen.“ entfernen.

**Änderung:** Der Vergleichsblock zwischen Aufmacher und Funktionsübersicht wurde vollständig entfernt. Das ausschließlich dafür verwendete Vergleichs-CSS entfällt ebenfalls; die übrigen Landingpage-Bereiche bleiben unverändert.

**Prüfung:** Ein Landingpage-Test stellt sicher, dass der Vergleichsblock und seine deutsche sowie englische Überschrift nicht wieder erscheinen. Die vollständigen Pflichtprüfungen laufen vor einem Merge im PR.

## 2026-09-29 – Juna – Beta-Pakete auf der Landingpage ergänzt

**Auftrag:** Die geplanten Flipbase-Pakete auf der Landingpage sichtbar machen und während der Beta klar als kostenlos darstellen.

**Änderung:** Die Landingpage zeigt Standard, Plus und Pro mit den vorläufigen späteren Preisen 15 €, 29 € und 49 € sowie 0 € während der Beta. Standard enthält einen Workspace und keine Vinted-Kontoverwaltung. Plus und Pro führen drei beziehungsweise fünf Workspaces sowie die geplante Multi-Account-Verwaltung für bis zu drei beziehungsweise fünf Vinted-Konten auf. Plus ist als empfohlene Stufe hervorgehoben. Der Beta-Hinweis führt zur bestehenden Bewerbung und lädt dazu ein, verfügbare Funktionen kostenlos zu testen und Feedback zur Weiterentwicklung zu geben.

**Prüfung:** Ein Landingpage-Test deckt Paketanzahl, Preise, Workspace-Grenzen, Vinted-Multi-Account-Grenzen, Beta-CTA und die freigegebenen Texte ab. Die vollständigen PR-Prüfungen laufen vor dem Merge.

## 2026-09-28 – Juna – Abgelaufene Vinted-Anmeldung beim Datenabruf erkannt

**Auftrag:** Den nach dem Worker-Wechsel fehlgeschlagenen Profilschritt
untersuchen und die erneute Anmeldung für ein bereits verbundenes Konto
ermöglichen.

**Befund und Änderung:** Der gespeicherte Auftrag scheiterte im Profilschritt.
Ein einzelner vom Nutzer freigegebener, lesender Aufruf im zugeordneten
Browserprofil erhielt von Vinted HTTP 401; der Browserstopp wurde bestätigt.
Der Worker ordnet diese Antwort nun der fehlenden Anmeldung zu und protokolliert
nur eine feste Fehlerkategorie. Der Dialog führt direkt zur erneuten Anmeldung
im selben Konto. Die bestehende Kontoprüfung verhindert die Bestätigung eines
anderen Vinted-Kontos.
Die erneute Bestätigung bewahrt nun importierte Profildaten und ändert den
Zeitpunkt des letzten vollständigen Datenabrufs nicht.

**Prüfung und Grenze:** 129 Worker-Tests, 22 gezielte Angular-Tests, Worker-
Typprüfung, beide Builds und 19 gezielte Datenbanktests bestanden. Die neue
Migration wurde auf einer frisch aufgebauten lokalen Datenbank angewendet.
Der Live-Aufruf las keine Antwortinhalte
und änderte keine Vinted-Daten. Eine erneute Anmeldung und ein erfolgreicher
Datenimport müssen vom Kontoinhaber noch bestätigt werden.

## 2026-09-28 – Juna – Vinted-Worker-Versionsfehler beim Datenabruf eingegrenzt

**Auftrag:** Den beim produktiven Aktualisierungsversuch angezeigten
Browserdienstfehler untersuchen und den irreführenden Dialog korrigieren.

**Befund und Änderung:** Die Web-App läuft auf dem Merge-Commit `cdbe3f5f`,
der separat veröffentlichte Worker noch auf `1c7b6575`. Der alte Dienst
kennt den neuen Auftragsendpunkt nicht. Im Dialog erscheint ein Auftrag erst
nach bestätigter Annahme; bei einem Startfehler entfallen Spinner und Hinweis
auf einen angeblich weiterlaufenden Hintergrundauftrag.

**Prüfung und Grenze:** Öffentlicher Healthcheck, Worker-Image und geschlossene
Browsersitzungen lesend geprüft. Das Image für `cdbe3f5f` wurde mit dem
manuellen Workflow gebaut und nach gesonderter Nutzerfreigabe auf die einzelne
produktive Worker-Instanz umgestellt. Healthcheck und Zugangsschutz bestätigt;
19 gezielte Angular-Tests und der Produktionsbau bestanden. Eine Live-Anmeldung
oder Vinted-Datenänderung erfolgte nicht.

## 2026-09-28 – Juna – Vinted-Abruf und Bearbeitung zuverlässiger gemacht

**Auftrag:** Den besprochenen Umbau für schnellere Kontodaten, korrekte
Verkaufszuordnung, verständlichen Fortschritt und bestätigte Änderungen
im bestehenden Vinted-Bereich umsetzen.

**Änderung:** Manuelle Aktualisierung läuft als gespeicherter kontogebundener
Auftrag mit Schritten im Modal. Gelesene Inserat- und Profiltexte bleiben
gespeichert; unveränderte Chats werden begrenzt aus dem Cache übernommen.
Verkäufe erfordern eine belegte Bestellung und einen bekannten Verkaufszustand.
Profil- und Inseratänderungen warten auf zurückgelesene Werte; die Profilroute
trennt Lesen und Schreiben und erkennt veralteten Ausgangstext vor dem Klick.
Die Oberfläche verwendet weiterhin die vorhandene Kontoverwaltung.

**Prüfung und Grenze:** 127 Worker-Tests, 9 Browser-Tests mit Testseiten,
113 Angular-Marktplatztests, 81 einschlägige lokale Datenbanktests und
die vollständige Projektprüfung `npm run verify` bestanden.
Kein echter Vinted-Abruf oder Schreibversuch, kein Push, Merge oder Deployment.
Vollständige Verkäufe, Teilerfolge je Datenbereich, automatische Aktualisierung,
Browserwiederverwendung und neue Schreibfunktionen bleiben offen.

## 2026-09-28 – Juna – Vinted-Plan durch drei unabhängige Reviews geschärft

**Auftrag:** Ideen und Architektur mit Agenten überprüfen, Alternativen im Web
recherchieren und den vorhandenen Plan verbessern.

**Ergebnis:** Drei Reviews zu Architektur, Daten/Schreiben und Anbietern.
Am Code bestätigt: Profil-Leseroute kann über ein Inhaltsfeld den Schreibweg
wählen; einfache Serialisierung des verschachtelten Brokers würde blockieren;
Recovery ist nur für einen Worker geeignet. Verkaufsumfang, feldweiser Cache,
atomare Rechte-/Versionsprüfung sowie getrennte Schreib-/Cache-/Stoppergebnisse
im Plan präzisiert. Schreibbestätigung vor Browserwiederverwendung priorisiert.
Dotb-OpenAPI und VinDrop-Cloud als zusätzliche Quellen geprüft; Grenzen der
Herstellerangaben und der Revendor-Synchronisationsaussagen korrigiert.

**Prüfung und Grenze:** Code- und Primärquellenreview, keine neuen Tests,
Browserstarts oder Live-Schreibaktionen. Nur vorhandene Planungsdokumente
aktualisiert; kein PR, kein Merge und kein Deployment.

## 2026-09-28 – Juna – Zuverlässigkeit der Vinted-Verwaltung untersucht

**Auftrag:** Vor weiteren Funktionen langsame Abrufe, falsche Verkäufe und
unbestätigte Profiländerungen untersuchen, Anbieter und Vergleichsprodukte
recherchieren und das weitere Vorgehen planen.

**Ergebnis:** Browserstart je Einzelaktion, doppelte Profil-/Seitenabrufe,
vollständiger serieller Chatimport, zu schwache Verkaufsprüfung, fehlender
Beschreibungsspeicher und zeitbasierte Speicherbestätigung im Code belegt.
Der lokale Parser erzeugt mit künstlichem `order: {}` einen Verkauf trotz
aktivem Inserat und übernimmt eine vorhandene Beschreibung nicht. GoLogin,
Dotb, Revendor, Vinted Scraper, Playwright und Vinted Pro anhand öffentlicher
Primärquellen verglichen. Der neue Plan priorisiert Diagnose, korrekte Daten,
persistente Aufträge, echten Fortschritt und bestätigtes Speichern.

**Prüfung und Grenze:** Produktiven Container ausschließlich lesend geprüft:
Image `1c7b6575`, gesund, keine Neustarts, keine Logzeilen in sechs Stunden.
Erster Abruffehler und konkreter Profil-Schreibausgang bleiben mangels
Ablaufdaten ungeklärt. Kein Browserstart, keine Vinted-Änderung, keine Änderung
am Anwendungscode, kein PR und kein Deployment. Plan unter
`docs/superpowers/plans/2026-09-28-vinted-reliability.md`.

## 2026-09-28 – Juna – Sitemap-Abruffehler in der Search Console geprüft

**Auftrag:** Den gemeldeten Abruffehler für `https://flipbase.de/sitemap.xml` beheben.

**Befund und Änderung:** Der Live-Test der Search Console konnte die gültige XML-Datei vollständig abrufen; Crawling und Seitenabruf waren erfolgreich. Die Startseite ist bereits bei Google indexiert. Sitemap und `robots.txt` antworteten öffentlich mit HTTP 200; ein IPv6-Abruf vom Webserver selbst war ebenfalls erfolgreich. Die fehlerhaft angezeigte Sitemap-Einreichung wurde entfernt und neu eingereicht. Der Bericht zeigte danach weiterhin „Konnte nicht abgerufen werden“. Die Diagnose wurde in `docs/analytics-tracking.md` ergänzt; es gibt keinen belegten Fehler im Website-Code.

**Prüfung und Grenze:** Google-Live-Test, Search-Console-Bericht und öffentliche HTTP-Antworten geprüft. Die erneute Verarbeitung durch Google steht aus. Kein Code, Push oder Deployment geändert.

## 2026-09-28 – Juna – Vinted-Inseratdetails und Bearbeitung vorbereiten

**Auftrag:** Klickbare Inseratdetails, Bearbeitung vorhandener Anzeigen und
einfacher Profildaten auf dem bestehenden Vinted-Kontoweg ergänzen.

**Änderung:** Eine kontogebundene Detailseite öffnet eigene Inserate. Titel,
Beschreibung und Preis sowie der Profiltext „Über mich“ erhalten begrenzte
Editoren über das bestehende GoLogin-Profil. Der Worker prüft Workspace,
Konto, Eintrag und Vinted-Identität und bestätigt Speichern erst nach einem
frischen Lesen des Formulars. Die übrigen Vinted-Felder bleiben erhalten.

**Prüfung und Grenze:** Anbieterformulare wurden nur lesend geprüft und alle
Browser gestoppt. Angular-Bau, Worker-Typprüfung und gezielte Worker-Tests
bestanden. Ein echter Schreibversuch, neue Inserate, Nachrichten und
automatische Abrufe sind noch offen. Kein Push, Merge oder Deployment.

## 2026-09-28 – Juna – Vinted-Abruffehler eingrenzen und Ansichten verdichten

**Auftrag:** Den ersten HTTP-502-Fehler beim manuellen Abruf untersuchen, Verkäufe dichter darstellen, den Verkaufshinweis entfernen und das Profil kompakter gestalten. Den nächsten Schritt für automatische Aktualisierung und Bearbeitungsaktionen festhalten.

**Änderung:** Der Browserdienst kennzeichnet fehlgeschlagene Leseschritte mit einer festen, datensparsamen Stufe; Flipbase zeigt sie verständlich an. Das Verkaufsraster nutzt bis zu fünf Spalten, die Profilkarte eine begrenzte Breite mit gegliederten Angaben. Die Sortierung der Gespräche bleibt nach dem letzten Ereignis. Der Plan nennt einen begrenzten Pilotabruf und die Voraussetzungen für automatische Abrufe und spätere Schreibaktionen.

**Prüfung und Grenze:** Der Worker blieb beim gemeldeten Fehler gesund; die beobachteten Sitzungen endeten sauber. 32 gezielte Worker- und 17 Angular-Tests, zwei lokale Browserabläufe mit künstlichen Daten und AXE-Prüfung bei 1440 und 390 Pixeln, beide Builds, Typprüfung, Lint der betroffenen Dateien und die Shared-UI-Prüfung bestanden. Die Ursache des ersten 502 ist noch offen und kann erst anhand der neuen Stufe bei einem weiteren Nutzerabruf eingegrenzt werden. Kein neuer Liveabruf, Nachrichtenversand, Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Landingpage-Funktionen nach Priorität geordnet

**Auftrag:** Einkauf und Bestand sowie Verkauf und Finanzen vor dem Vinted Bot zeigen, danach Bilder und Inserate; Multi-Account als noch nicht verfügbare Funktion anteasern.

**Änderung:** Der obere Funktionsüberblick, die Feature-Karten und die Beta-Liste beginnen jetzt mit Einkauf/Bestand und Verkauf/Finanzen. Der Vinted Bot folgt danach, anschließend Bilder und Inserate. Die neue achte Feature-Karte beschreibt Multi-Account ausdrücklich als „Geplant“ und „noch nicht in der Beta verfügbar“. Deutsche und englische Texte sowie die Seitenbeschreibungen folgen der neuen Gewichtung.

**Prüfung und Grenze:** Die 37 Landing-Tests einschließlich Reihenfolge und geplanter Kennzeichnung bestanden. Die Karte beschreibt eine Absicht, keine bereits nutzbare Funktion. Kein Push oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Analytics-Herkunft und Wege auf der Startseite verbessert

**Auftrag:** Die ersten Analytics-Daten besser erklärbar machen, bestehende Google-Konten prüfen, passende Dienste verbinden und die Bewegung auf der öffentlichen Website nachvollziehen.

**Änderung:** Die bereits bestätigte Search-Console-Domain `flipbase.de` wurde mit dem bestehenden GA4-Webstream „Flipbase“ verbunden; ein eigenes Google-Cloud-Projekt ist für diese Verknüpfung nicht erforderlich und wurde nicht angelegt. In GA4 ist `generate_lead` jetzt als Schlüsselereignis markiert. Die vorhandene Sitemap wurde in der Search Console eingereicht. Das Landing-Skript übergibt nach Einwilligung nur ausgewählte Kampagnenangaben und die Domain der verweisenden Website. Es erfasst außerdem das Erreichen der Abschnitte Funktionen, Roadmap, FAQ und Beta-Bewerbung sowie den Klick auf den Beta-Link. Lokale Vorschauen senden keine Analytics-Daten mehr. Die Datenschutzerklärung beschreibt den geänderten Umfang; `docs/analytics-tracking.md` dokumentiert Ereignisse und Kampagnenlinks.

**Prüfung und Grenze:** Der bestehende Webstream, die Search-Console-Inhaberschaft und die Verknüpfung wurden in den Google-Oberflächen geprüft. Impressum und Datenschutz liefern live `noindex, follow`; die Search Console meldet beide URLs ausdrücklich als wegen `noindex` nicht indexiert. Die öffentliche Sitemap und `robots.txt` antworten mit HTTP 200; die Search Console meldete unmittelbar nach der Einreichung dennoch „Konnte nicht abgerufen werden“. Alle 37 Landing-Tests, gezieltes Lint, Formatprüfung und Produktionsbau bestanden. Die neue Erfassung wirkt erst nach Veröffentlichung und Einwilligung; historische Zugriffe werden nicht nachträglich zugeordnet.

## 2026-09-28 – Juna – Google-Analytics-Erfassung geprüft

**Auftrag:** Die ersten Analytics-Zahlen, die zwei Seitentitel und die als direkt ausgewiesenen Zugriffe prüfen.

**Befund:** Für die letzten sieben Tage zeigt GA4 neun aktive und neun neue Nutzer sowie 38 Seitenaufrufe. Die 35 Aufrufe mit dem Titel „Flipbase“ und drei mit dem längeren Titel betreffen denselben Pfad `/`; einer der drei langen Titel kam vom lokalen Host `127.0.0.1`. Die Live-Seite und `origin/master` tragen inzwischen den längeren Titel. Im Sitzungsbericht stehen 18 Sitzungen unter `(direct) / (none)` und zwei unter `(not set)` beziehungsweise „Unassigned“. Das Landing-Skript sendet nach Einwilligung die Seitenadresse ohne Abfrageparameter und setzt den Referrer ausdrücklich leer. Der Web-Datenstream ist aktiv, optimierte Analysen einschließlich Seitenaufrufen sind eingeschaltet, und eine Search-Console-Verknüpfung ist noch nicht eingerichtet.

**Prüfung und Grenze:** Analytics-Berichte und Property-Einstellungen nur gelesen; Live-Titel und aktuellen `origin/master` abgeglichen. Die genaue Herkunft einzelner Besuche lässt sich aus den vorhandenen Daten nicht nachträglich ermitteln. Keine Tracking- oder Kontoeinstellungen geändert.

## 2026-09-28 – Juna – Vinted-Datenansichten nach erstem Liveabruf korrigiert

**Auftrag:** Die vom Nutzer beobachteten Lücken bei Profilbild, Bewertung, Inseraten und Nachrichten nach dem ersten erfolgreichen manuellen Abruf beheben.

**Änderung:** Der Import schließt als `is_closed` markierte Artikel aus der aktiven Inseratliste aus und übernimmt Textnachrichten mit interner ID sowie Systemereignisse ohne ID. Die Gesprächsvorschau nutzt die zuletzt gelesene Nachricht. Profil- und Chatbilder werden passend zugeschnitten, die normierte Bewertung als Fünf-Sterne-Wert gezeigt und die Inserate dichter mit bis zu fünf Spalten und Push-Banner dargestellt. Für den Aktualisierungsklick gibt es eine sichtbare Fortschrittsmeldung.

**Prüfung und Grenze:** Ein lesender Strukturabgleich in einem bereits gelesenen Verlauf bestätigte fünf statt zuvor einer erkannten Nachricht; alle dazu gestarteten Anbieterbrowser wurden bestätigt gestoppt. Gezielte Import- und Angular-Tests, beide Builds, Lint, die Shared-UI-Prüfung und zwei lokale Desktop-/Mobilabläufe bestanden. Die Korrektur liegt auf `juna/vinted-data-presentation-fix`; gespeicherte Daten ändern sich erst nach erneutem manuellem Abruf. Kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Vinted-Import-Worker nach Freigabe aktiviert

**Auftrag:** Den gemergten manuellen Vinted-Datenimport nach gesonderter Freigabe auf dem Browserdienst aktivieren.

**Änderung:** PR #237 wurde nach allen grünen Pflichtprüfungen als `47a15291` gemergt; der reguläre Web-Deploy einschließlich öffentlichem Versionscheck war erfolgreich. Der getrennte Workflow veröffentlichte den Worker aus derselben vollständigen SHA. Nach Prüfung der Browser-Sitzungen wurde ausschließlich die bestehende Worker-Instanz auf dieses Image umgestellt. Das vorige Image und eine geschützte Kopie der Compose-Zuordnung bleiben für den Rückweg erhalten.

**Prüfung und Grenze:** Vor und nach dem Wechsel gab es fünf geschlossene und keine offenen oder ungeklärten Sitzungen. Container und öffentlicher Healthcheck sind gesund; ein anonymer Sitzungsstart wird mit HTTP 401 abgewiesen. Der Rollout hat keinen Vinted-Abruf gestartet. Ein erfolgreicher erster Import und die zuletzt beobachtete HTTP-403-Antwort müssen mit einem ausdrücklichen Nutzertest geprüft werden.

## 2026-09-28 – Juna – Manuellen Import für Vinted-Kontodaten vorbereitet

**Auftrag:** Profil, Inserate, Nachrichten und nachweisbare Verkäufe des verbundenen eigenen Vinted-Kontos per Knopfdruck abrufen und in den bestehenden Ansichten zeigen.

**Änderung:** Ein kontogebundener Leseimport im bestehenden GoLogin-Profil übernimmt ausgewählte Felder aus den zuvor beobachteten Vinted-Antworten. Workspace, Konto, Sitzung und Vinted-Identität werden vor dem Schreiben geprüft. Die vorhandenen Ansichten zeigen Profil und Bewertungskennzahlen, Inseratkarten mit Kennzahlen, Gespräche, gelesene Verläufe und durch Bestellungen belegte Verkäufe. Ungelesene Einzelverläufe werden wegen des ungeklärten Lesestatus nicht geöffnet. Keine automatische Abfrage und kein Nachrichtenversand.

**Prüfung und Grenze:** Gezielte Worker- und Angular-Tests, Typprüfung, Bau, statische Prüfungen und zwei lokale Desktop-/Mobilabläufe bestanden. Ein einzelner weiterer lesender Liveversuch erhielt nach bestätigter Identität HTTP 403 für die Profildaten; der Browser wurde bestätigt gestoppt. Ein erfolgreicher echter Import, eine vollständige Verkaufsliste und die Anbieterverträglichkeit bleiben offen. Kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Datenumfang des verbundenen Vinted-Kontos geprüft

**Auftrag:** Prüfen, welche Profil-, Inserat-, Gesprächs- und Verkaufsdaten das verbundene eigene Privatkonto tatsächlich liefert, und den Weg für Abgleich, Benachrichtigungen und Antworten konkretisieren.

**Befund:** Eine einmalige lesende Strukturprobe im zugeordneten GoLogin-Profil fand Bewertungskennzahlen, eine paginierte Inseratliste, eine paginierte Gesprächsliste, Nachrichtenstruktur in einem bereits gelesenen Verlauf und eine verknüpfte Transaktion. Die genauen Feldgruppen, Grenzen und eine Kapazitätsrechnung für fünfminütige Abrufe stehen in `docs/implementation/vinted-data-discovery.md`. Plan, Arbeitsstand und UI-Prüfprotokoll wurden entsprechend aktualisiert.

**Prüfung und Grenze:** Die bestehende Vinted-Identität wurde vor jedem Blick mit der verbundenen Flipbase-Kontokennung verglichen. Alle sechs Anbieterbrowser wurden bestätigt gestoppt. Weder private Werte noch Zugangsdaten wurden ausgegeben oder gespeichert; kein Import, kein Versand, kein Deployment. Vollständige Verkäufe, neue Ereignisse, Push, Kosten und Plattformberechtigung für automatischen Dauerzugriff sind offen. Die Dokumentänderungen wurden lokal formatiert und geprüft.

## 2026-09-28 – Juna – Bestehende Vinted-Sitzung veröffentlicht und Browserdienst aktiviert

**Auftrag:** Die bereits geprüfte Übernahme einer angemeldeten Vinted-Sitzung nach PR-Freigabe veröffentlichen und den Browserdienst nach gesonderter Freigabe aktualisieren.

**Änderung:** PR #235 bestand alle Pflichtprüfungen und wurde als Merge-Commit `db63bf19` übernommen. Die Web-App liefert genau diesen Commit aus. Der getrennte Workflow veröffentlichte das Worker-Image mit derselben vollständigen SHA. Nach Prüfung auf offene Sitzungen wurde nur die einzelne Browserdienst-Instanz auf dieses Image umgestellt. Die vorige Image-Zuordnung und Compose-Datei liegen mit Modus 0600 auf dem Server für einen Rückweg bereit.

**Prüfung und Grenze:** Die lokale Gesamtprüfung, 91 Worker-Tests und neun abgefangene Browser-Tests bestanden. Der Merge-Deploy und der öffentliche Versionscheck waren erfolgreich. Vor und nach dem Worker-Wechsel gab es null aktive oder ungeklärte Browsersitzungen. Der Container ist gesund; der öffentliche Endpunkt meldet `ok: true`, `apiVersion: 2` und `readOnly: false`; ein Sitzungsstart ohne Anmeldung antwortet mit HTTP 401. Danach startete der Nutzer das eigene ausstehende Konto erneut und meldete „Das Konto ist verbunden“. Eine lesende Datenbankprüfung bestätigte genau eine Verbindung mit Status `connected` und fünf geschlossene statt zuvor vier Browsersitzungen; keine Sitzung blieb offen. Der Rollout selbst löste keinen Vinted-Login und keinen SMS-Code aus. Die ursprüngliche Codebestätigung und weitere Marktplatzfunktionen bleiben gesondert zu prüfen.

**Nächster Datenzugriff:** Eine weitere lesende Bestandsprüfung fand nur den Profileintrag aus der Identitätsbestätigung, aber keine gespeicherten Inserate, Gespräche, Nachrichten oder Verkäufe. GoLogin stellt das dauerhafte Browserprofil bereit, keine Vinted-Daten-API. Die öffentlich dokumentierte Vinted-Pro-Integrations-API ist auf freigeschaltete Pro-Konten begrenzt; das verbundene Privatkonto benötigt für weitere Daten einen gesondert geprüften Leseweg und geklärte Plattformberechtigung. Der Plan enthält dafür einen begrenzten, zunächst lesenden Schritt.

## 2026-09-28 – Juna – Lade-Kreis im Vinted-Anmeldedialog bereinigt

**Auftrag:** Das kurz aufblinkende zeigerartige Element innerhalb der Ladeanzeige beim Anmelden entfernen.

**Änderung:** Der Dialog zeigt beim Anmelden nur seinen großen Kreis. Der zusätzliche Icon-Loader des Anmeldebuttons entfällt; der Mauszeiger wird über dem Kreis während des Ladens verborgen. Die bestehende Sperre gegen mehrfaches Absenden bleibt erhalten.

**Prüfung und Grenze:** Angular-Produktionsbau sowie zwei lokale Anmeldeabläufe bei 390 und 1440 Pixeln mit künstlichen Konten bestanden. Ein Screenshot bei 390 Pixeln zeigt den Kreis ohne Innensymbol. Das kurzzeitige Verhalten auf dem Gerät des Nutzers kann erst nach Veröffentlichung erneut geprüft werden. Kein Push, Merge oder produktiver Rollout in dieser Sitzung.

## 2026-09-28 – Juna – Bereits angemeldetes Vinted-Profil sicher verbinden

**Auftrag:** Die erneut angezeigte Fehlermeldung beim Verbinden untersuchen und die Verbindung des eigenen Vinted-Kontos zuverlässig fortsetzen.

**Befund und Änderung:** Ein vom Nutzer gestarteter Versuch öffnete den Browser, scheiterte aber am angeblich fehlenden Loginformular. Nach bestätigtem Sitzungsende zeigte eine lesende Prüfung: Vinted leitete den Loginpfad auf die Startseite um; die private Identitätsroute antwortete mit HTTP 200 und einer vollständigen Nutzerstruktur. Der Worker prüft nun vor einem erneuten Login die bereits angemeldete Identität und bestätigt sie ausschließlich für die gebundene Sitzung, den Workspace und das ausgewählte Konto. Bei vorhandener Identität sendet er keine Zugangsdaten an Vinted. Eine noch offene Codeanforderung führt nicht zu einem neuen Passwortversuch. Die Oberfläche beendet den Browser nach Bestätigung und lädt die Kontoliste neu. Ein unklarer Browserstopp wird wahrheitsgemäß angezeigt.

**Prüfung und Grenze:** 91 Worker-Tests, neun Tests mit abgefangenen eigenen Chromium-Seiten und 107 Angular-Marktplatztests bestanden. Worker- und Angular-Typprüfung sowie beide Builds bestanden. Die Liveprüfung gab nur Pfad, HTTP-Status und Vorhandensein der Identitätsfelder aus; der vorhandene Worker-Identitätsleser meldete `recognized: true`. Keine Zugangsdaten, Codes oder Identitätswerte wurden ausgegeben, protokolliert oder gespeichert. Der Anbieterbrowser wurde mit HTTP 204 gestoppt. Die Änderung liegt auf `juna/vinted-existing-session`; Push, Merge, produktiver Rollout und der anschließende Nachweis des Flipbase-Status `connected` stehen noch aus.

## 2026-09-28 – Juna – Vinted-Codekorrektur veröffentlicht und Browserdienst aktiviert

**Auftrag:** Den geprüften Fix für die Vinted-Codebestätigung nach Freigabe über PR #233 mergen und den passenden Browserdienst nach gesonderter Freigabe aktivieren.

**Änderung:** Alle Pflichtprüfungen des PRs bestanden. Der Merge-Commit `ece0676d` wurde als Web-App öffentlich ausgeliefert. Der manuelle Workflow veröffentlichte das Worker-Image mit demselben Commit. Auf dem Flipbase-Server wurde nach Prüfung der Sitzungen nur die einzelne Worker-Instanz auf dieses Image umgestellt. Die vorherige Image-Zuordnung und das vorherige Image bleiben für einen Rückweg erhalten.

**Prüfung und Grenze:** Die öffentliche Web-App liefert exakt `ece0676d`; der Worker-Container ist gesund und meldet `apiVersion: 2`, `readOnly: false`. Ein Sitzungsstart ohne Anmeldung antwortet mit HTTP 401. Vor und nach dem Wechsel waren keine aktiven oder ungeklärten Browsersitzungen vorhanden. Zugangsdaten, Codes, Konten und GoLogin-Profile wurden nicht verändert. Ein erfolgreicher echter Codeversand und die bestätigte Vinted-Identität bleiben bis zu einem neuen, vom Nutzer gestarteten Versuch offen.

## 2026-09-28 – Juna – Vinted-Codeformular und Anmeldedialog nach Liveversuch korrigiert

**Auftrag:** Den gemeldeten Wartezustand, die fehlgeschlagene SMS-Codeeingabe und die falsche Passwortvorbelegung im Vinted-Dialog untersuchen.

**Befund und Änderung:** Eine auf Strukturmerkmale begrenzte, lesende Prüfung der vom Nutzer geöffneten Vinted-Seite zeigte genau ein Codefeld in einem von drei Formularen. Der Bestätigungsbutton lag im richtigen Formular, trug aber einen anderen Namen als vom Worker vorausgesetzt. Der Worker wählt jetzt den eindeutigen Submit-Button im Formular des Codefelds und verweigert mehrdeutige Formulare. Der Dialog zeigt das Passwort-Auge, startet mit leeren Vinted-Feldern und vermindert die automatische Zuordnung eines vorhandenen Flipbase-Passworts über die standardisierten Autocomplete-Attribute. Der Wartezustand erklärt nun, dass Vinted noch das Anmeldeformular zeigt. Unbestätigte Konten bleiben als ausdrücklich löschbare oder fortsetzbare Einträge erhalten.

**Prüfung und Grenze:** Nur Formularstruktur wurde live gelesen; weder Zugangsdaten noch SMS-Code oder Feldwerte wurden ausgelesen, erneut eingegeben oder geloggt. 87 Worker-Tests, neun Tests im abgefangenen Chromium, 41 gezielte Angular-Tests und elf Desktop-/Mobilabläufe bestanden; beide Typprüfungen und Builds, gezieltes ESLint sowie die Shared-UI-Prüfung ebenfalls. Ein erfolgreicher echter Codeversand und eine bestätigte Kontoverbindung stehen noch aus. Kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Vinted-Browserdienst nach PR #231 aktiviert

**Auftrag:** Den nach grünen Pflichtprüfungen gemergten Vinted-Kontofix auf dem produktiven Browserdienst aktivieren und den Betrieb prüfen.

**Änderung:** PR #231 wurde als Merge-Commit `e912b17b` übernommen und die Web-App automatisch durch CI veröffentlicht. Das separat veröffentlichte Worker-Image desselben Commits wurde nach ausdrücklicher Nutzerfreigabe als einzige Browserdienst-Instanz gestartet. Die vorherige Image-Zuordnung liegt für einen Rückweg serverseitig bereit; bestehende Konten und Anbieterprofile blieben unverändert.

**Prüfung und Grenze:** Der Container ist gesund; der öffentliche Endpunkt liefert HTTP 200 mit `apiVersion: 2` und `readOnly: false`. Ein Sitzungsstart ohne Anmeldung liefert HTTP 401. Die Datenbank zeigte sechs geschlossene und keine offenen Browsersitzungen. GoLogin war erreichbar und meldete weiterhin zehn Profile. Kontolöschung, SMS-Bestätigung und ein erfolgreicher Vinted-Login wurden produktiv noch nicht mit einem ausgewählten eigenen Konto geprüft.

## 2026-09-28 – Juna – Vinted-Livefehler bei Kontostart und Löschung untersucht

**Auftrag:** Die gemeldete fehlgeschlagene Kontolöschung, den zu frühen Tabelleneintrag und den unmittelbaren Sitzungsfehler prüfen und beheben.

**Befund und Änderung:** Die Web-App läuft auf PR #230, der produktive Worker noch auf einem älteren Image ohne Lösch- und Codepfad. GoLogin verweigert ein neues Browserprofil bei zehn vorhandenen Profilen mit HTTP 403 wegen erreichter Profilzahl; der betroffene Eintrag erhielt daher weder Profil noch Sitzung. Die Kontoanlage wird lokal erst durch den Anmeldeklick ausgelöst; ausstehende Einträge stehen getrennt von bestätigten Konten. Ein fester Fehlercode erklärt die GoLogin-Profilgrenze, ohne Anbietertext oder Geheimnisse weiterzugeben. Ein neuer Versionscheck sperrt Anmeldung und Löschung bei einem älteren Worker mit eindeutiger Meldung.

**Prüfung und Grenze:** 86 Worker-Tests, 102 Angular-Tests, elf Desktop-/Mobilabläufe sowie beide Typprüfungen und Builds, gezieltes ESLint und Shared-UI-Prüfung bestanden. Anbieterprofile, Konten und produktiver Worker wurden nicht verändert. Für einen erneuten Liveversuch werden der geprüfte Worker-Rollout und ein verfügbarer GoLogin-Profilplatz benötigt; ein erfolgreicher Vinted-Login bleibt unbestätigt.

## 2026-09-28 – Juna – Vinted-Codeeingabe und Kontodialog für PR freigegeben

**Auftrag:** Nach ausdrücklicher Freigabe den geprüften Branch für die Vinted-SMS-Bestätigung, den gestuften Kontodialog und das sichere Löschen über einen PR veröffentlichen und nach erfolgreichen Pflichtprüfungen mergen.

**Stand vor Veröffentlichung:** Der Branch basiert auf dem aktuellen `origin/master`; die fachlichen Änderungen wurden bereits gezielt geprüft. Der echte Vinted-Codeablauf bleibt bis zu einem vom Nutzer gestarteten Versuch unbestätigt. Diese Sitzung sendet weder Zugangsdaten noch einen SMS-Code erneut.

## 2026-09-28 – Juna – Vinted-SMS-Code und Kontodialog ergänzt

**Auftrag:** Den beim eigenen Login angeforderten SMS-Code innerhalb von Flipbase eingeben können, die Kontoanlage als gestuften Drawer darstellen und Konten samt Browserprofil sicher löschen.

**Befund und Änderung:** Der beendete Browserversuch stand auf Vinteds `/member/login/2fa`. Der Worker erkennt diese Stufe ohne Sitzungsabbruch und nimmt einen ausdrücklich eingegebenen Code nur für die gebundene Vinted-Sitzung an. Ein unklarer Absendeausgang wird nicht wiederholt. Die Kontoverwaltung führt Plattform/Name und Anmeldung im selben Seitenfenster zusammen, zeigt einen gelben Ladezustand und bietet einen bestätigten Löschweg mit Anbieterbereinigung. Kein Passwort oder SMS-Code wurde ausgelesen, gespeichert oder erneut gesendet.

**Prüfung und Grenze:** 84 Worker-Tests, sieben Tests mit abgefangener eigener Seite im echten Chromium, 104 Angular-Tests und acht Desktop-/Mobilabläufe bestanden; beide Builds, gezieltes ESLint und AXE ebenfalls. Das echte Vinted-Codeformular und die private Identitätsantwort bleiben bis zum nächsten ausdrücklich vom Nutzer gestarteten Liveversuch unbestätigt. Kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Vinted-Sitzungsdiagnose für PR freigegeben

**Auftrag:** Nach ausdrücklicher Freigabe den geprüften Vinted-Sitzungsbranch über PR #229 veröffentlichen, die Pflichtprüfungen abwarten und bei Erfolg mergen.

**Integration:** Der inzwischen aktuelle `origin/master` enthielt PR #228 für die Vinted-Feed-Filter. Beim Zusammenführen wurden beide unabhängigen Einträge dieses Protokolls erhalten. Die Anmeldediagnose wurde dadurch nicht fachlich verändert. Der Merge und die Veröffentlichung bleiben von den PR-Prüfungen abhängig.

## 2026-09-28 – Juna – Bezahlten GoLogin-Zugang und ersten Liveversuch geprüft

**Auftrag:** Nach Aktivierung eines Standard-Abos die GoLogin-Anbindung und den begonnenen Vinted-Anmeldeversuch prüfen, ohne Zugangsdaten zu lesen oder erneut zu senden.

**Befund:** Die produktive GoLogin-API liefert für die Proxy-Kontingentabfrage nun HTTP 200 mit rund 2 GB Restvolumen. Ein leeres Testprofil wurde mit HTTP 201 angelegt und mit HTTP 204 wieder gelöscht. Auf der Flipbase-Anmeldeseite lief gleichzeitig bereits ein vom Nutzer ausgelöster Versuch; ein weiterer Klick traf nur einen veralteten Seitenknoten und löste keine zweite Anmeldung aus. Die produktive Datenbank bestätigte ein dauerhaftes Profil und eine aktive Browsersitzung für die betroffene Verbindung. Der Nutzer erhielt nach einer Minute den Zeitlimithinweis und verließ erst danach die Seite; dadurch wurde die Sitzung geschlossen. Der Verbindungsstatus blieb `needs_login`.

**Diagnose und Änderung:** Das gespeicherte GoLogin-Profil wurde anschließend zweimal ohne erneute Passworteingabe lesend geöffnet und jeweils bestätigt gestoppt (HTTP 204). Der Browser stand auf `/member/login/email`; die Felder waren leer, es war kein sichtbarer Fehler- oder Bestätigungshinweis vorhanden. Die bisher vermutete private Identitätsroute antwortete dort mit HTTP 403 und `access_denied`. Das beweist weder falsche Zugangsdaten noch einen erfolgreichen Login. Die Prüfung meldet künftig ein noch sichtbares Anmeldeformular als eigenen Zustand und erklärt dies beim Zeitlimit konkret. Eine unabhängige Review fand und der Test mit echtem Sitzungsdienst bestätigte, dass der neue Zustand zunächst fälschlich die Browsersitzung beendet hätte; die Übergabe erfolgt jetzt ohne Sitzungsabbruch. Tests für Worker, echten Testbrowser und Angular wurden ergänzt. Es wurden keine Zugangsdaten angezeigt, gespeichert oder erneut gesendet.

## 2026-09-28 – Juna – GoLogin-Sitzungsstart nach echtem Fehlversuch untersucht

**Auftrag:** Die bei einer Vinted-Anmeldung angezeigte Meldung „Die Browsersitzung konnte nicht bestätigt werden“ untersuchen und beheben, ohne Zugangsdaten auszulesen oder erneut zu senden.

**Befund und Änderung:** Für die betroffene neue Verbindung existieren weder ein gespeichertes GoLogin-Profil noch eine Browser-Sitzung. Der produktive GoLogin-Zugang antwortete bei lesenden API-Proben mit HTTP 403 und dem Anbietertext „You have reached your free API requests limit. Please subscribe to continue.“ Der Fehler trat vor der Übergabe der Vinted-Daten auf. Der Worker erkennt nur diese konkrete Anbieterantwort und liefert einen festen Fehlercode. Die Oberfläche nennt die Ablehnung des hinterlegten Schlüssels, ohne einen Kauf als sichere Lösung auszugeben. Andere Anbieterantworten bleiben verborgen. Die Trennung nach Konto und Workspace sowie der Schutz von Zugangsdaten bleiben erhalten.

**Weitere Prüfung:** Die angemeldete GoLogin-Webseite zeigt „Versuch“ und „Noch 7 Tage“. Im selben Konto steht unter „API & MCP“, dass die volle API-Version nur in der bezahlten Version verfügbar ist. Die offizielle Hilfe bezeichnet den siebentägigen Test zugleich als Zugang mit vollem Funktionsumfang. Ein lokaler Vergleich anonymisierter Fingerabdrücke bestätigte, dass das angezeigte API-Token und das vom produktiven Worker verwendete Token identisch sind; die Tokenwerte wurden nicht ausgegeben oder gespeichert. Die konkrete kostenlose API-Anfragezahl und ihr Rücksetzzeitpunkt sind in den geprüften Quellen nicht angegeben. Der HTTP-403-Befund ist damit mit einem weiter laufenden Testzeitraum vereinbar. Kein Kauf wird allein aus dem Fehler empfohlen.

**Prüfung und Grenze:** 70 Worker- und 33 gezielte Angular-Tests bestanden; Worker-Typprüfung/-Bau, Angular-Produktionsbau und gezieltes ESLint bestanden. Ein echter Login kann erst nach geklärtem API-Zugang erneut durch den Nutzer angestoßen werden; eine erfolgreiche Vinted-Verbindung ist nicht bestätigt. Kein erneuter Versand von Zugangsdaten, kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-28 – Juna – Vinted-Feed-Filter in gemeinsamer Karte gebündelt

**Auftrag:** Die Filter im Vinted-Feed wie bei den Admin-Tabellen in einer
kompakten Karte anordnen und rechts ein Zurücksetzen-Symbol einblenden, sobald
ein Filter aktiv ist.

**Änderung:** Suchfilter, Marke, Größe sowie Mindest- und Höchstpreis stehen in
einer gemeinsamen Filterkarte. Die Auswahllisten verwenden die vorhandene
Toolbar-Darstellung. Der gemeinsame Symbol-Button setzt alle fünf Filter
einschließlich einer ungültigen Preisspanne zurück. Die Karte lässt geöffnete
Auswahllisten auch ohne Popover-Unterstützung sichtbar.

**Prüfung:** Gezielte Angular-Tests einschließlich Barrierefreiheitsprüfung,
Angular-Produktionsbau, ESLint, Prettier und Shared-UI-Prüfung bestanden.

## 2026-09-28 – Juna – Hintergrundanmeldung zur Veröffentlichung freigegeben

**Auftrag:** Der Nutzer hat PR-Erstellung und Merge nach erfolgreichen
Pflichtprüfungen für die geprüfte Vinted-Hintergrundanmeldung freigegeben.
Nach dem Merge werden die ausgelieferte Version und der Browserdienst geprüft.
Ein echter Kontologin und Liveimport bleiben gesonderte Nachweise; Zugangsdaten
werden für die Veröffentlichung nicht erneut gesendet.

## 2026-09-28 – Juna – Vinted-Anmeldung im Hintergrund korrigieren

**Auftrag:** Anbieterabläufe recherchieren, Cookiehinweise automatisch behandeln
und die manuelle Browserbedienung aus der normalen Anmeldung entfernen.
Fortsetzung auf `juna/vinted-background-login`, Basis `537ce883` (PR #225).
Der fremde Hauptcheckout und die dortigen Arbeiten bleiben unberührt.

**Befund und Änderung:** Sofortige Formularabfragen übersahen verspätete Felder;
fehlende Browserbilder blockierten den Login. Die eigene Regression bestätigte
beides. Der öffentlich beobachtete OneTrust-Button wird auf notwendige Cookies
beschränkt; ein Handler behandelt später eingeblendete Banner. Rechte werden
vor Eingaben und Cookieaktionen erneut geprüft. Ein weiterer Test fand einen
Doppelaufruf beim anfänglich sichtbaren Banner; die Reihenfolge wurde korrigiert.
Login, Fortschritt, Abbruch und Ergebnisprüfung laufen ohne Browserbilder und
ohne manuelle Browserfelder. Unklare Versuche werden nicht automatisch erneut
abgesendet. Nach Transportfehler/Timeout ist zuerst bestätigtes Beenden nötig.

**Prüfung:** 67 Worker-, 5 echte Chromium-Tests auf eigenen HTML-Seiten,
88 Angular-Tests und 7 Desktop-/Mobilabläufe bestanden. Angular-Produktionsbau,
Worker-Bau/Typprüfung, ESLint, Prettier und Shared-UI-Prüfung bestanden.
AXE und Überlaufprüfungen sind in den UI-Abläufen enthalten.

**Grenze:** Keine echten Zugangsdaten ausgelesen oder erneut gesendet. Eine
erfolgreiche echte Vinted-Anmeldung, die private Identitätsroute und Liveimport
bleiben unbestätigt. Wettbewerberdokumentation belegt weiterhin mögliche
persönliche Verifizierung. Kein Push, Merge oder Deployment in dieser Sitzung.

## 2026-09-27 – Juna – Login-Korrektur zur Veröffentlichung freigegeben

**Auftrag:** Nutzerfreigabe für PR und Merge nach erfolgreichen Pflichtprüfungen.
Die geprüfte Korrektur a85e60c3 wird veröffentlicht; danach wird der GoLogin-Worker
auf das Abbild des Merge-Commits aktualisiert und der öffentliche Stand geprüft.
Keine echten Zugangsdaten erneut senden. Lokale Prüfungen und die Grenze des
beobachteten Vinted-Fehlers stehen im zugehörigen Prüfprotokoll.

## 2026-09-27 – Juna – Abgelehnte Vinted-Anmeldung korrigieren

**Auftrag:** Direkten Login und unverständliche manuelle Browserbedienung prüfen.

**Befund:** Die laufende Nutzeransicht zeigt Vinteds Ablehnung der Zugangsdaten,
während Flipbase weiter einen Prüfstatus anzeigt. Der Browserstart ist in dieser
Sitzung erfolgt. Ein früherer Startfehler ist damit nicht erklärt.

**Änderung:** Fester Fehlercode für die sichtbare Ablehnung, Ende der automatischen
Prüfung und leeres Formular für einen ausdrücklichen neuen Versuch im selben
Browserprofil. Manueller Start ist nachgeordnet; verbundene Konten zeigen kein
neues Passwortformular. Vorhandene Konfliktmarker im Changelog entfernt, beide
historischen Einträge bleiben erhalten.

**Prüfung:** Regression auf eigener HTML-Testseite zuerst fehlgeschlagen, nach
Korrektur bestanden. 83 Angular-Tests und 67 Worker-Tests bestanden; darunter
Kontotrennung, Ablauf und Erhalt der Sitzung nach abgelehnten Zugangsdaten.
Weitere Build-/Browserergebnisse stehen im Vinted-Prüfprotokoll. Kein echter
Login ausgeführt, keine Zugangsdaten ausgelesen oder erneut gesendet.

## 2026-09-27 – Juna – Freigegebene Account-Verwaltung veröffentlichen

**Auftrag:** Nutzerfreigabe für PR, Merge nach erfolgreichen Prüfungen und
produktive Aktivierung des GoLogin-Browserdienstes.

**Stand:** PR #224 erstellt. Aktuellen master integriert und beide Einträge im
Changelog-Konflikt erhalten. Die 84 betroffenen Angular-Tests und der
Produktionsbau bestanden erneut. Die Serverumgebung für den Worker wurde mit
nur für root lesbaren Zugangsdaten eingerichtet; der GoLogin-Token wurde über
SSH übertragen und weder ausgegeben noch versioniert. Start erfolgt erst mit
dem Abbild des nach grünen PR-Prüfungen gemergten Commits. Öffentliche
Gesundheits-/Zugriffsprüfung und tatsächlicher erster Nutzerlogin folgen danach.

## 2026-09-27 – Juna – Direkte Vinted-Anmeldung mit GoLogin-Profil und Proxy

**Auftrag:** Account hinzufügen, Zugangsdaten eingeben und eine eigenständige,
kontogebundene GoLogin-Verbindung in Flipbase herstellen. Admin-Pilot beibehalten.

**Änderung:** „Account-Verwaltung“ in Navigation und Einstellungen. Der Kontodialog
führt direkt zur Anmeldung. Der Worker übergibt Zugangsdaten einmalig an das feste
Vinted-Webformular und prüft die Sitzungsberechtigung erneut vor den Eingaben und
dem Absenden. Die Oberfläche leert die Felder; zusätzliche Prüfungen bleiben
interaktiv. Eine bestätigte Identität beendet die Bedienung und lädt das verbundene
Konto neu. Neue Profile erhalten einen deutschen Residential-Proxy aus vorhandenem
GoLogin-Kontingent. Bestehende Proxyzuordnungen bleiben erhalten; ohne bestätigte
Konfiguration startet kein Profil. Keine Käufe oder eigene IP-Rotation.

**Prüfung:** 65 Worker-Tests, eine echte Browserprüfung gegen ausschließlich eigene,
abgefangene HTML-Testseiten, 84 Angular-Tests und 14 Navigationstests bestanden.
Die GoLogin-API-Probe bestätigte Proxyzuordnung und erneute Konfigurationsprüfung
mit dem tatsächlichen Adapter; temporäre Profile wurden gelöscht. Zugangsdaten
wurden nicht ausgegeben oder versioniert. Fünf Playwright-Abläufe, beide Builds,
Typprüfung, ESLint, Prettier und Shared-UI-Prüfung bestanden. Die unabhängige
Codeprüfung fand einen blockierten Browserstopp während Anmeldung; HTTP- und
Angular-Regressionstests reproduzierten ihn und bestanden nach der Korrektur.
Die gezielte unabhängige Nachprüfung bestätigte die Behebung.

**Betrieb:** Fortsetzung vom bereits gemergten PR #220 auf
`juna/vinted-account-connection`. Der fremde Hauptcheckout blieb unverändert.
Serverzugriff und vorhandene Caddy-Weiterleitung wurden lesend geprüft; der
Browserdienst ist noch nicht installiert. Kein Vinted-Konto angemeldet, kein
Import, kein Merge und kein Produktivdeployment in diesem Schritt.

## 2026-09-27 – Juna – Preisfilter und ältere Vinted-Funde zugänglich gemacht

**Auftrag:** Im Vinted-Feed Mindest- und Höchstpreis anbieten und ältere Funde
auch bei ausgewählter Größe erreichbar machen.

**Befund:** Angebote werden bereits 30 Tage aufbewahrt. Der Größenfilter prüfte
aber nur die zuletzt geladenen 60 Artikel; außerdem endete das manuelle
Nachladen nach 300 Artikeln. So konnten ältere XXL-Funde unsichtbar bleiben.

**Änderung:** Größe und Artikelpreis werden jetzt in der Datenbank vor der
Seitenteilung gefiltert. Zwei gemeinsame Zahlenfelder setzen die Preisgrenzen
im Feed. Ältere Seiten lassen sich ohne die bisherige 300er-Grenze nachladen;
der Feed nennt die Aufbewahrung der letzten 30 Tage. Eine neue Migration und
generierte Datenbanktypen halten die Abfrage fest. Die Migration enthält nur
die neuen Feed-Funktionen; fremde Unterschiede aus dem automatisch erzeugten
Entwurf wurden entfernt.

**Prüfung:** 76 betroffene Datenbanktests in getrennter lokaler Datenbank,
9 Feed-State-Tests, 6 Angular-Tests mit Barrierefreiheitsprüfung, Typprüfung
und Produktionsbau bestanden.
Der Supabase-Sicherheitsberater meldete keinen Befund.

## 2026-09-27 – Juna – Vinted-Markenauswahl und Feed-Karten vereinheitlicht

**Auftrag:** Die Markenauswahl im Admin-Dialog wie die Produktsuche aufbauen und
die Vinted-Karten bei Abständen, Angaben und Aktionen überarbeiten.

**Änderung:** Ein gemeinsamer Suchbaustein öffnet die Markensuche erst nach Klick
auf das Auswahlfeld. Er unterstützt Tastaturbedienung und Mehrfachauswahl; die
Suche nach seltenen Marken bleibt an Vinted angebunden. Der Admin-Dialog nutzt
für die ausgewählten Marken gemeinsame Buttons. In den Feed-Karten stehen Marke,
Größe und Zustand nun untereinander mit Textbezeichnung und eigenem Badge. Der
Vinted-Link ist zunächst neutral und wird beim Hover gelb; das Favoritenherz
ist rot. Unnötiger Abstand zwischen Titel, Angaben und Preis wurde entfernt.

**Prüfung:** 22 gezielte Angular-Tests einschließlich Barrierefreiheitsprüfung,
ESLint der betroffenen TypeScript-Dateien, Shared-UI-Prüfung, Typprüfung und
Angular-Produktionsbau bestanden.

## 2026-09-27 – Juna – Vinted-Karten kompakter und klarer gestaltet

**Auftrag:** Marken-, Größen- und Zustandsangaben in den Vinted-Karten nebeneinander
ausrichten, farblich unterscheiden und die Aktionsknöpfe an die übrige Oberfläche
angleichen.

**Änderung:** Der gemeinsame Badge-Baustein richtet Symbole und Text direkt in
einer Zeile aus. Die Karte verwendet kleinere Badges mit getrennten Farben für
Marke, Größe und Zustand. Favorit, Teilen und Vinted-Link nutzen die vorhandene
kompakte Größe des gemeinsamen Button-Bausteins.

**Prüfung:** 18 gezielte Angular-Tests, ESLint für die betroffenen TypeScript-Dateien,
die Shared-UI-Prüfung und der Angular-Produktionsbau bestanden.

## 2026-09-27 – Juna – Richtlinie für Discord-Beta-Updates auf Anfrage verfasst

**Auftrag:** Festlegen, wann Juna auf Wunsch eine Discord-Update-Nachricht
verfasst, welche Änderungen seit der letzten Nachricht zählen und wie der Text
für Beta-Nutzer aussehen soll.

**Änderung:** Unter `docs/public-beta-updates.md` eine Richtlinie für Updates
auf ausdrückliche Chat-Anfrage ergänzt und in `AGENTS.md` verlinkt. Eine
kopierfertige Vorlage und ein Protokoll tatsächlich versendeter Nachrichten
legen Format und Vergleichszeitraum fest. Interne Änderungen bleiben aus den
Discord-Texten heraus. Der zuvor vorbereitete automatische Versand beim
Release wurde aus dem ungemergten Zweig wieder entfernt.

**Prüfung:** Dokumentationsdiff und Formatierung geprüft. Kein Discord-Versand
und kein Produktionsrelease ausgelöst.

> > > > > > > origin/master

## 2026-09-27 – Juna – Vinted-Anmeldung an echte Kontokennung gebunden

**Auftrag:** Für ein normales Vinted-Konto den Schritt vom vorbereiteten
Flipbase-Eintrag zur echten, kontogebundenen Anmeldung umsetzen.

**Änderung:** Der Worker liest nach der interaktiven Anmeldung ausschließlich
die Kontokennung und den Nutzernamen von der festen Vinted-Domain. Eine
serverseitige Datenbankfunktion bestätigt die Identität nur bei gültiger
Sitzung, passendem Workspace, Konto und Bediener mit Betreiberrecht. Erst dann
setzt Flipbase den Status auf „verbunden“ und speichert eine Profilkopie. Die
Anmeldeseite hat dafür eine eigene Bestätigungsaktion. Das genutzte
Vinted-Identitätsziel ist eine private, nicht vertraglich zugesicherte
Schnittstelle und bleibt bis zum Test mit einem freigegebenen eigenen Konto
unbestätigt. Inserate, Nachrichten und Verkäufe werden noch nicht importiert.

**Prüfung:** 54 Worker-Tests, 16 gezielte Angular-Tests und 113
Marktplatz-Datenbankprüfungen bestanden. Der Datenbanktest fand zunächst eine
fehlende Rechteentziehung in der generierten Migration; diese wurde ergänzt
und erneut geprüft. Worker-Typprüfung, Angular-Typprüfung und Bau bestanden.
Kein echtes Konto, kein Produktions-Worker und kein Deployment wurden verwendet.

**PR-Nachtrag:** Der zweite Angular-Teiltest von PR #220 fand einen alten
Sidebar-Test, dessen Vorlagenauflösung nach dem neuen Admin-Badge den Pfad der
geteilten Badge-Komponente nicht kannte. Der Test liest diese Vorlage nun wie
der bereits angepasste Sidebar-Test aus ihrem tatsächlichen Ordner. Beide
Sidebar-Testdateien bestanden danach lokal.

## 2026-09-27 – Juna – Vinted-Admin-Einstieg verständlich gemacht

**Auftrag:** Admin-Badge am Vinted-Menü ergänzen und den irreführenden
Kontodialog so korrigieren, dass der Weg zu einer echten Anmeldung erkennbar
ist.

**Änderung:** Der Admin-Link ist gekennzeichnet. Die Kontoverwaltung benennt
den internen Vorbereitungsschritt ehrlich und zeigt pro Verbindung einen
direkten Anmeldelink. Die Route bindet den Browser an die angeforderte
Verbindung und sperrt unbekannte IDs. Ein nicht erreichbarer Worker wird
sichtbar erklärt. Plan und Prüfprotokoll halten ausstehende Anmeldung,
Identitätsprüfung und Liveimport fest.

**Prüfung:** Angular-Bau, gezielte Komponententests und der Playwright-Ablauf
mit künstlichen Konten auf Desktop und Mobilgerätegröße bestanden. Der
öffentliche Browser-Endpunkt antwortete mit HTTP 502; keine echten
Vinted-Konten oder Zugangsdaten wurden verwendet.

## 2026-09-27 – Juna – Beta-Auswertung aus Datenschutzhinweisen entfernt

**Auftrag:** Den nachträglich ergänzten Abschnitt zur namentlichen Beta-Nutzungsübersicht vorerst aus der Datenschutzerklärung entfernen.

**Änderung:** Der Abschnitt auf der öffentlichen Datenschutzseite und der zugehörige Link im Datenschutzdialog der App wurden zurückgenommen. Andere Datenschutzhinweise, Cookie-Einstellungen und die Betreiberübersicht unter Administration → Nutzer bleiben unverändert.

**Prüfung:** Gezielte Landingpage-Tests, Format- und Lintprüfung sowie Angular-Produktionsbau.

## 2026-09-27 – Juna – Nutzungsübersicht für Beta-Tester ergänzt

**Auftrag:** Nach der Prüfung der vorhandenen Analyse und Nutzerverwaltung eine erste, namentliche Nutzungsübersicht für Beta-Tester umsetzen.

**Änderung:** Unter Administration → Nutzer erscheinen letzter Login und letzte dokumentierte Aktion. Eine eigene Nutzungsseite zeigt außerdem die in den letzten 30 Tagen angelegten Einkaufsentwürfe und erfassten Verkäufe sowie die letzten zehn Kernaktionen. Die Betreiberabfragen verwenden nur vorhandene Supabase-Auth-Daten und das fachliche Ereignisprotokoll; Rechteprüfung und Index liegen in einer neuen Schema-Datei und generierten Migration. Seitenaufrufe, Lesedauer und zusätzliche Nutzerereignisse werden nicht erfasst. Die Einordnung als nachweisbare Aktion verhindert, dass fehlende Ereignisse fälschlich als fehlende Nutzung ausgegeben werden. Der öffentliche Datenschutzhinweis beschreibt die Auswertung; im Datenschutzdialog der App ist der Abschnitt verlinkt.

**Prüfung:** Sechs neue Datenbankprüfungen zu Rechten, Zeitraum und Zuordnung bestanden; die 20 vorhandenen Betreiberprüfungen ebenfalls. Gezielte Angular-Tests einschließlich AXE-Prüfung, Typprüfung, ESLint, Shared-UI-Prüfung und Angular-Produktionsbau bestanden. Die Migration wurde ohne fachfremde Schemaänderungen erzeugt und lokal angewendet.

**Datenschutz:** Die Betreiberübersicht wird auf Art. 6 Abs. 1 lit. f DSGVO gestützt: Betreuung und Verbesserung der Beta-App bei beschränktem Betreiberzugriff und ohne zusätzliche Verhaltensaufzeichnung. Die rechtliche Interessenabwägung und die Information bereits aktiver Tester bleiben in der Verantwortung des Betreibers.

## 2026-09-27 – Juna – Herkunft der Vinted-Artikelfotos geprüft

**Auftrag:** Prüfen, weshalb der Feed früher drei Fotos je Anzeige zeigen konnte
und heute oft nur eines zeigt.

**Befund:** Die alte JSON-Katalogantwort enthielt mehrere Fotos pro Artikel;
die gespeicherte Testantwort enthält Beispiele mit vier und fünf Fotos. Seit
dem 14.09.2026 nutzt der Sammler wegen des abgeschalteten JSON-Katalogs die
öffentliche Katalogseite. Deren Datenmodell und der Parser erlauben weiterhin
mehrere Fotos, doch eine aktuelle Live-Stichprobe lieferte bei allen 96
Artikeln nur je eines. Die Detailseite eines Artikels enthielt drei Fotos.
Damit fehlen die weiteren Fotos bereits in der aktuellen Katalogantwort;
die Karten kürzen keine vorhandenen Bilder weg. Auf zusätzliche Detailabrufe
wurde für diese Prüfung verzichtet.

**Prüfung:** Git-Historie der Bildverarbeitung und der Katalogumstellung,
gespeicherte alte Katalogantwort sowie ein aktueller Abruf von Katalog und
Artikeldetail wurden verglichen. Keine Codeänderung am Bot.

## 2026-09-27 – Juna – Vinted Feed und Angebotskarten überarbeitet

**Auftrag:** Den Vinted-Feed an die übrigen Seiten angleichen, die getrennte
Deal-Ansicht entfernen, nach unterstützten Marken filtern und die
Angebotskarten nach dem Referenzentwurf neu anordnen.

**Änderung:** Der Menüpunkt heißt „Vinted Feed“. Die Seite zeigt ein Icon und
eine kurze Beschreibung. Artikel und Deals werden nicht mehr getrennt
angezeigt. Ein suchbarer Markenfilter verwendet nur Marken aus jüngsten
Anzeigen aktiver Vinted-Sammelaufträge; die Filterung geschieht vor der
Seitenteilung. Die Karten zeigen bei vorhandenen Bilddaten bis zu drei Fotos,
Titel, Marken-, Größen- und Zustandsplaketten, Preis und Entdeckungszeit. Die
Angaben zu unbekannter Kategorie, Käuferschutz und Versand wurden entfernt.
Favoriten, Teilen und der Vinted-Link nutzen die gemeinsamen Schaltflächen.
Auch die Vinted-Markensuche im Admin-Formular nutzt jetzt das gemeinsame
Eingabefeld.
Die normale Vinted-Katalogantwort enthält bei aktuellen Live-Stichproben nur
ein Foto je Anzeige; für weitere Fotos wäre ein zusätzlicher Detailabruf nötig.

**Prüfung:** Zwei gezielte Datenbanktests mit 49 Prüfungen, Sicherheitsprüfung
der lokalen Datenbank und `npm run verify` bestanden. Die Änderung ist noch
nicht veröffentlicht.

## 2026-09-27 – Juna – Vinted-Marken direkt beim Anlegen suchen

**Auftrag:** Zentrale Markenfilter ohne Kenntnis einer Vinted-Markenkennung
anlegen. Mehrere Marken sollen gleichzeitig auswählbar sein, auch seltene
Marken, mit einem eigenen Filter pro Marke.

**Änderung:** Eine neue, auf Plattformbetreiber begrenzte Edge Function sucht
Marken live bei Vinted und liefert Namen sowie Kennungen. Die Admin-Oberfläche
bietet eine Suche mit auswählbaren Treffern, zeigt vorhandene Filter nicht
erneut an und legt jede gewählte Marke als eigenen pausierten Filter an. Bei
einem Teilfehler bleiben nur die fehlgeschlagenen Marken zur Wiederholung
ausgewählt. Die Kennung muss nicht mehr eingegeben werden und wird in der
Übersicht nicht mehr angezeigt. Die Funktion muss zusammen mit den anderen
Edge Functions manuell ausgerollt werden.

**Prüfung:** Die echte Vinted-Suche lieferte für „Ralph Lauren“ mehrere
Markenvarianten. Edge- und Angular-Tests, Barrierefreiheitsprüfung, Typprüfung,
Lint und Angular-Bau wurden ausgeführt.

## 2026-09-27 – Juna – Vinted-Sammler nach festgefahrener Sitzung wiederhergestellt

**Auftrag:** Prüfen, warum der Vinted-Bot erneut keine Artikel sammelt, und den
Ausfall beheben.

**Befund:** Der Produktionscontainer war gesund, doch alle drei Markenfilter
meldeten bei HTTP 200 wiederholt `parser_error` und fanden keine Artikel. Ein
frischer Sammler im selben Container konnte denselben Katalog lesen. Der seit
dem 22.09. laufende Prozess behielt seine Cookies nach einem Parserfehler und
verwendete sie bei jedem weiteren Versuch erneut. Ein automatischer Rollout
startete den Dienst während der Analyse neu; danach kamen wieder Artikel an.
Um 18:56 UTC standen Nike, adidas und Ralph Lauren wieder auf `ready` und
hatten jeweils einen aktuellen erfolgreichen Abruf.

**Änderung:** Wenn eine Katalogantwort nicht gelesen werden kann, verwirft der
Sammler die gespeicherten Cookies. Der nächste reguläre Versuch beginnt mit
einer frischen Sitzung. Ein Regressionstest bildet die Folge aus erfolgreichem
Abruf, unbrauchbarer Katalogseite und erneutem Abruf nach.

**Prüfung:** Der neue Test schlug vor der Korrektur fehl und bestand danach.
Alle 187 Sniper-Unit-Tests, Typprüfung, Dienstbau, gezieltes ESLint und
Prettier bestanden. Die Korrektur selbst ist noch nicht veröffentlicht.

## 2026-09-27 – Juna – Admin-Pilot für Vinted-Browser vorbereitet

**Auftrag:** Den bestehenden Vinted-Bereich für den eigenen Admin-Zugang in
Flipbase bereitstellen, damit ein eigenes Konto später interaktiv angemeldet
und live geprüft werden kann.

**Änderung:** Marktplatzzugriff auf Plattformbetreiber mit Workspace-Adminrecht
begrenzt. Der bestehende Kontodialog bleibt erhalten. Der Worker erstellt
beim ersten Start ein kontogebundenes GoLogin-Profil, öffnet eine feste
Vinted-Startseite und hält Anbieterzugänge auf dem Server. Die Eingabe wird
nach dem Senden aus dem UI-Feld entfernt. Container-, Proxy- und
Veröffentlichungsvorlagen für die spätere Servereinrichtung ergänzt. Die
Migration wurde aus dem Supabase-Diff auf die zwei betroffenen Funktionen
begrenzt; Typen wurden neu generiert und blieben unverändert. Die Navigation
verliert Betreiberrechte beim Abmelden und Kontowechsel unmittelbar.

**Prüfung:** 48 Worker-Tests, 41 gezielte Angular-Tests und 99
Marktplatz-Datenbankprüfungen bestanden. Angular-Bau, Worker-Containerbau,
Typprüfung und gezieltes Lint bestanden. Produktionsanbindung und
Vinted-Anmeldung stehen aus. `npm run verify` bestand vollständig; acht
gezielte Betreiber-Dienst-Tests bestanden nach der letzten UI-Korrektur.

**PR-Nachtrag:** Im ersten Lauf von PR #217 bestanden alle 2163 SQL-Prüfungen,
doch der getrennte Test für parallele Browserstarts scheiterte: Sein
künstlicher Nutzer hatte nach der Admin-Sperre keinen Betreibereintrag.
Die Testdaten wurden ergänzt. Der Konkurrenztest bestand danach gegen eine
isolierte lokale Datenbank: genau eine Reservierung, zweite Anfrage gesperrt.

## 2026-09-27 – Juna – GoLogin-Cloudprofile mit Testseite geprüft

**Auftrag:** Den bereitgestellten GoLogin-Zugang sicher prüfen und entscheiden,
ob getrennte Cloudprofile für den nächsten Flipbase-Test geeignet sind.

**Änderung:** Zwei eigene, kurzlebige Linux-Testprofile wurden ausschließlich
mit `example.com` geprüft und anschließend beim Anbieter gelöscht. Der neue
API-Token liegt verschlüsselt außerhalb des Repositorys; keine Kennung wurde
im Code oder in der Projektdokumentation gespeichert. Plan, Arbeitsstand und
Prüfprotokoll enthalten die bestätigten Ergebnisse und offenen Grenzen.

**Prüfung:** GoLogin-API und Cloud-CDP erreichbar; Playwright und der vorhandene
Flipbase-Adapter lieferten Browserbilder und bestätigten den Provider-Stopp
mit HTTP 204. Zwei gleichzeitig geöffnete Profile hielten unterschiedliche
künstliche Browserdaten getrennt und behielten sie nach einem Neustart.
Beide Testprofile wurden mit HTTP 204 gelöscht; Profilzahl danach wieder fünf.
Keine Vinted-Anmeldung und keine Prüfung über die Flipbase-Oberfläche.

## 2026-09-27 – Juna – Lokalen Browserbedarf für mehrere Konten gemessen

**Auftrag:** Prüfen, wie viel Kapazität getrennte Browser lokal benötigen,
und ob vor einem kostenpflichtigen GoLogin-Zugang ein Test sinnvoll ist.

**Änderung:** Der Plan, Arbeitsstand und das Prüfprotokoll enthalten den
lokalen Belastungsversuch und grenzen ihn von einem echten Anbieter- oder
Vinted-Test ab. Ein kostenloser Anbieterzugang ist für den nächsten
GoLogin-Smoke-Test vorgesehen; es wurde kein Tarif gekauft.

**Prüfung:** 1, 2, 4, 8 und 16 getrennte Chromium-Browser mit künstlichem
Produktkatalog geöffnet, Bilder aufgenommen und alle Prozesse geschlossen.
Bei 16 Browsern rund 4,6 GB Working Set und 1,36 GB private Speicherseiten;
nach dem Stopp null Testprozesse. Kein Vinted-Kontozugriff.

## 2026-09-27 – Juna – Browserprofile und Geräteidentität eingeordnet

**Auftrag:** Öffentliche GoLogin-Quellen, Vergleichsprodukte und offenen Code
zur technischen Trennung mehrerer Browserkonten untersuchen.

**Änderung:** Plan, Arbeitsstand und Prüfprotokoll unterscheiden jetzt die
bereits geprüfte Konto- und Sitzungstrennung von einer für die Plattform
getrennten Geräteidentität. GoLogin, AdsPower, Kameleo und Camoufox wurden
als mögliche technische Ansätze eingeordnet. Für einen späteren G1-Piloten
ist ein verwalteter Profilanbieter vorläufig empfohlen; die veröffentlichten
Grenzen für parallele Cloud-Sitzungen bei 200–300 Profilen sind vermerkt.
Eine Erfolgsquote wird nicht behauptet.

**Prüfung:** Offizielle Anbieter- und Playwright-Unterlagen sowie öffentliche
GitHub-Repositories gelesen. Kein Code, keine Vinted-Anmeldung und kein
Anbieterprofil ausgeführt.

## 2026-09-27 – Juna – Lokale Browser-Testseite Ende zu Ende geprüft

**Auftrag:** Den bestehenden lesenden Vinted-Browser-Test über die echte
Flipbase-Testseite, eine eigene lokale Testverbindung und den Worker fortsetzen.

**Änderung:** Eine getrennte Supabase-Vorschau mit künstlichem Nutzer und zwei
Konten diente für Desktop-, iPad-, Ablauf- und Kontowechselprüfungen. Ein dabei
gefundener Anzeigefehler wurde behoben: Nach fehlgeschlagener Bildaktualisierung
bleibt kein altes Browserbild sichtbar. Ein bestätigter Ablauf gibt die
Oberfläche für einen neuen Start frei; ein unklarer Stopp hält sie gesperrt.

**Prüfung:** Vier erfolgreiche lokale UI-Durchläufe plus ein erneuter
Ablauf-Durchlauf mit echter Auth-/REST-Anbindung, 40 Worker- und 13 gezielte
Angular-Tests. Fremde Konto- und Workspacezugriffe sowie Eingaben wurden
abgewiesen; Ablauf, Kontowechsel und Stopp schlossen den Browser. Keine
Vinted-Anmeldung, kein Nachrichtenversand.

## 2026-09-27 – Juna – Lokalen lesenden Browser-Test ergänzt

**Auftrag:** Die Vinted-Testseite ohne kostenpflichtigen GoLogin-Zugang mit
einem eigenen Browser für einen öffentlichen, lesenden Seitenaufruf fortsetzen.

**Änderung:** Lokaler, flüchtiger Chromium-Provider mit fester öffentlicher
Zieladresse; Eingaben in Worker und Oberfläche gesperrt. Die bestehende
Sitzungsbindung und Datenbanksperre bleiben erhalten. GoLogin ist optional.

**Prüfung:** 39 Worker- und 9 Angular-Tests, Typprüfungen, Builds und gezieltes
ESLint bestanden. Ein synthetischer Browserlauf und zwei lesende
Aufrufe der freigegebenen öffentlichen Vinted-Seite lieferten JPEG-Bilder und
beendeten den Browser. Keine Anmeldung und keine Profilaktion. Der vollständige
Flipbase-Test mit echter Supabase-Testverbindung steht aus.

## 2026-09-27 – Juna – Browser-Testbereich an sicheren Worker angeschlossen

**Auftrag:** Die kontogebundene Vinted-Sitzungstechnik auf dem bestehenden
Worker-Branch fortsetzen und auf der eigenen Testseite prüfbar machen.

**Änderung:** Authentisierte Worker-API mit begrenzten Bildern und einzelnen
Eingaben, Start- und Stoppablauf sowie ein getrennter Browserbereich auf der
vorhandenen Testseite. Die lokale Entwicklung leitet den API-Pfad nur an einen
bewusst gestarteten Worker weiter. Der Bereich bleibt ohne ihn gesperrt.

**Prüfung:** 37 Worker-Tests und 10 gezielte Angular-Tests mit künstlichen
Antworten, Typprüfungen, Builds und gezieltes ESLint erfolgreich. Kein echtes
GoLogin- oder Vinted-Profil verwendet. Produktive Anbindung und Anbieter-Test
bleiben bis zur konkreten G0-Freigabe offen.

## 2026-09-27 – Juna – Dauerhafte Sperre für Marktplatz-Browsersitzungen

**Auftrag:** Die vorhandene Vinted-Arbeit auf dem Worker-Branch um eine sichere,
kontogebundene Sitzung mit serverseitiger Profilzuordnung fortsetzen.

**Änderung:** Neue Tabellen und geschützte Funktionen halten Live-Sitzungen bis
zum bestätigten Anbieter-Stopp exklusiv. Der Worker kann die gespeicherte
Profil-ID lesen, unterbrochene Sitzungen nach einem Neustart bereinigen und
neue Starts bis dahin sperren. Die vorhandene Testseite bleibt eine Simulation;
eine authentisierte Browserweiterleitung fehlt noch.

**Prüfung:** Migration in getrennter Supabase-Instanz frisch aufgespielt,
32 gezielte und 2159 gesamte Datenbanktests, ein Test mit zwei gleichzeitigen
Reservierungen, ein lokaler REST-Versuch mit künstlichem Nutzer,
Datenbank-Lint sowie 27 Worker-Tests, Typprüfung und Paketbau grün.
Kein reales Anbieter- oder Vinted-Konto verwendet.

## 2026-09-27 – Juna – Serverkern für kontogebundene GoLogin-Sitzungen vorbereitet

**Auftrag:** Die Vinted-Sitzungstechnik nach dem veröffentlichten Foundation-
Stand fortsetzen und die Anbieter-Schnittstellen vor der Umsetzung erneut prüfen.

**Änderung:** Ein eigener Node-Dienstkern verbindet GoLogin über Playwright-CDP,
stoppt Profile ausdrücklich und prüft Workspace, Verbindung, Bediener und
Sperrstatus vor internen Aktionen. Die zusätzliche Liveansicht wird nicht
angefordert. Der Plan nennt die noch fehlende dauerhafte Sperre, Profilzuordnung
und sichere Weiterleitung zur Testseite ausdrücklich.

**Prüfung:** 20 gezielte Tests mit künstlichen Anbieterantworten, Typprüfung
und Build des neuen Pakets erfolgreich. Gezieltes ESLint, vollständige
Anwendungstestsuite, App-Typprüfung und Angular-Produktionsbau erfolgreich.
Kein echtes Anbieter- oder Vinted-Profil geöffnet; noch keine produktive
Anbindung.

## 2026-09-27 – Juna – Kleine Artikelvorschaubilder statt vollständiger Fotos geladen

**Auftrag:** Prüfen, ob die bestehenden Artikelbilder wirklich komprimiert wurden, und die sichtbare Verzögerung beim Laden der Artikelliste beheben.

**Änderung:** Die 24 aktiven JPEG-Artikelbilder sind bereits komprimiert; das weitere aktive WebP war schon klein. Die Artikelliste und die Artikelauswahl beim Einkauf fordern nun aus dem privaten Speicher signierte 96-Pixel-Vorschaubilder an. Die ersten sichtbaren Artikelbilder werden ohne zusätzliche Lazy-Loading-Pause geladen. Die Detailansicht verwendet weiterhin die gespeicherten Originale. Der Vorschaulink wird innerhalb der Sitzung wiederverwendet und bei Workspace- oder Sitzungswechsel verworfen; bei einem Vorschaufehler fällt die Anzeige auf das Original zurück. Alle 25 aktiven Produktionsbilder ließen sich als Vorschau laden: zusammen 52.414 Bytes statt 8.811.304 Bytes für die gespeicherten Originale.

**Prüfung:** Gezielte Medien- und Artikelservice-Tests, Typprüfung, ESLint, Formatprüfung und Angular-Produktionsbau.

## 2026-09-27 – Juna – Suchbegriffe anhand von Google Trends bewertet

**Auftrag:** Die Keywords der Startseite über die eigene Search Console hinaus allgemein recherchieren und ihre Suchabsicht beurteilen.

**Änderung:** Google-Trends-Vergleiche für Deutschland zu Reselling, Vinted, Vintage, Software, Bot und Steuerfragen ausgewertet und in `docs/landing/keyword-research.md` mit Quellen und Grenzen dokumentiert. Der Seitentitel bleibt bei der zutreffenden allgemeinen Reselling-Ausrichtung; Vintage Reselling bleibt ein ergänzendes Beispiel.

**Prüfung:** Die Google-Trends-Werte direkt im Browser verglichen, Suchergebnisse auf die erwartete Produktabsicht geprüft und den Zugang zu Search Console und Keyword Planner geprüft. Für absolute Suchvolumen steht im vorhandenen Google-Ads-Verwaltungskonto kein aktives Werbekonto zur Verfügung.

## 2026-09-27 – Juna – Vintage Reselling als ergänzenden Suchbegriff aufgenommen

**Auftrag:** Vintage Reselling als passenden ergänzenden Suchbegriff berücksichtigen, ohne Vinted als Plattform oder die allgemeine Reselling-Ausrichtung zu verwechseln.

**Änderung:** Die Antwort auf „Für wen ist Flipbase?“ nennt Vintage Reselling einmal als Beispiel neben anderen Produkten. Seitentitel und Hauptüberschrift bleiben auf Reselling allgemein ausgerichtet. Die englische FAQ-Antwort und der Landingpage-Test wurden angepasst.

**Prüfung:** Gezielte Landingpage-Tests, ESLint, Prettier und Angular-Produktionsbau nach dem Abgleich mit `origin/master` erneut geprüft.

## 2026-09-27 – Juna – Bild- und Inseratschritt plattformneutral formuliert

**Auftrag:** Den dritten Schritt des Reselling-Ablaufs nicht allein auf Kleinanzeigen beziehen und die Suchmaschinen-Ausrichtung der Landingpage prüfen.

**Änderung:** Schritt 3 beschreibt nun in beiden Sprachen das Optimieren von Bildern und Vorbereiten von Inseraten. Die ausführliche Funktionsbeschreibung nennt weiterhin die tatsächlich verfügbare Übergabe an Kleinanzeigen. Ein gezielter Test schützt die neue Formulierung.

**Prüfung:** Seitentitel, Beschreibung, Überschriften, interne Suchbegriffe, Canonical, Robots und Sitemap sowie die Search-Console-Leistungsdaten geprüft. 33 Landingpage-Tests, ESLint, Prettier und der Angular-Produktionsbau bestanden.

## 2026-09-27 – Juna – Landingpage auf Vinted statt Vintage ausgerichtet

**Auftrag:** Die missverstandene Ausrichtung auf Vintage-Kleidung korrigieren. Flipbase richtet sich an Reseller allgemein; Vinted ist die vorrangige Plattform, eBay und Kleinanzeigen sind ebenfalls wichtig.

**Änderung:** Der Aufmacher heißt wieder „Dein Reselling.“ Titel, Suchbeschreibung, Vorschautexte, Vergleich, Funktionskacheln und FAQ sprechen nicht mehr von Vintage-Reselling oder Vintage-Einkäufen. Vinted steht als Plattform und Bot vorn; eBay und Kleinanzeigen folgen. Die englische Fassung und die beim Sprachwechsel gesetzten Metadaten wurden entsprechend korrigiert.

**Prüfung:** Landingpage-Tests, ESLint, Prettier, Angular-Produktionsbau und die gerenderte Desktop-/Mobilansicht geprüft. AXE meldete keine Verstöße.

## 2026-09-27 – Juna – Landingpage auf Vintage-Reselling ausgerichtet

**Auftrag:** Die Startseite von veralteten Einkaufstypen lösen und Flipbase als Arbeitsanwendung für Vintage-Reseller mit Vinted, Kleinanzeigen, eBay, Buchhaltung und Workspaces verständlich vorstellen.

**Änderung:** Der Einstieg zeigt jetzt den Ablauf vom Vinted-Fund bis zu Verkauf und Finanzen. Vergleich, Funktionskacheln, Beta-Stand und FAQ beschreiben Einkäufe, Bestand, Bildoptimierung, Kleinanzeigen-Inserate, Verkäufe, Betriebsausgaben, Fixkosten und Steuerdaten. Der Vinted Bot wird nicht mehr als bloß geplant dargestellt; die Kleinanzeigen-Übergabe nennt den notwendigen letzten Veröffentlichungsschritt. Seitentitel, Beschreibung und Vorschautexte betonen Vintage-Reselling und passende Suchbegriffe. Die englische Sprachumschaltung aktualisiert auch Titel und Beschreibung. Karten und Abstände wurden an die ruhige Flipbase-Oberfläche mit dem Marken-Gelb `#fcc601` angepasst.

**Prüfung:** 33 Landingpage-Tests, gezieltes ESLint und Prettier bestanden. Browserprüfung auf Desktop und Mobilgerät in hellem und dunklem Design: kein horizontaler Überlauf; AXE meldete keine WCAG-A/AA-Verstöße. Der Angular-Produktionsbau wurde ebenfalls geprüft.

## 2026-09-27 – Juna – Artikelbilder nachträglich vollständig geprüft und verkleinert

**Auftrag:** Die erste Nachbearbeitung erfasste nur drei Shop-Angebotsbilder. Prüfen, warum die rund 25 Bilder unter „Artikel“ ausblieben, und auch diese Bilder sinnvoll komprimieren. Außerdem die Meldung zu nicht entfernbaren lokalen Arbeitskopien erklären.

**Änderung:** Das Wartungsskript kann nun eine Bildquelle und eine Mindestgröße wählen. Für die Artikelfotos wurden alle 24 aktiven JPEG-Dateien auf dem Produktionsserver gesichert und mit mindestens zehn Prozent Ersparnis am selben Pfad ersetzt. Ihre Abmessungen waren bereits höchstens 1600 Pixel; die Neucodierung senkte die Gesamtgröße von 11.610.479 auf 8.768.994 Bytes. Ein bereits kleines WebP-Bild blieb unverändert. Zehn Bilder aus archivierten Arbeitsbereichen blieben durch die Archivierungssperre unangetastet. Die Originale liegen zugriffsbeschränkt unter `/opt/flipbase/catalog-image-backfill-20260927/`.

**Prüfung:** Jedes ersetzte Bild wurde nach dem Speichern bytegenau zurückgelesen. Eine große JPEG-Datei wurde vor und nach der Komprimierung visuell verglichen. Alle 25 aktiven Artikelbilder haben passende Größenangaben in Datenbank und Speicher; es fehlen keine Bildverweise. Eine fehlerhafte Auswertung der Datenbankantwort wurde nach dem ersten Bild behoben, der unterbrochene Lauf erfolgreich fortgesetzt. Die automatische Ausführungsprüfung blockierte weiterhin das Löschen der lokalen Kopien des ersten Laufs unter `C:\Users\Grisc\AppData\Local\Temp\flipbase-image-backfill-20260927`; sie bleiben dort und enthalten keine neuen Kopien dieses zweiten Laufs.

## 2026-09-27 – Juna – Gewinnhinweis zählt alle Verkäufe im Zeitraum

**Auftrag:** Im Hinweis unter „Gewinn“ nur die Verkäufe im gewählten Zeitraum nennen, ohne den Zusatz zu bekannten Kosten.

**Änderung:** Der Hinweis zählt alle angezeigten Verkäufe im Zeitraum und auf der gewählten Plattform. Die Gewinnberechnung bleibt auf Verkäufe mit belegbaren Kosten begrenzt. Die dafür nicht mehr benötigte gesonderte Zählung entfällt.

**Prüfung:** Gezielte Dashboard- und Berichtstests, Lint, Formatprüfung und Angular-Produktionsbau.

## 2026-09-27 – Juna – Entwürfe aus Dashboard-Ausgaben entfernt und Gewinnkachel eingeordnet

**Auftrag:** Entwurfseinkäufe aus den Gesamtausgaben ausnehmen, die Zahl der im Gewinn berücksichtigten Verkäufe anzeigen und Gewinn direkt hinter Umsatz platzieren.

**Änderung:** Nur abgeschlossene Einkäufe gehen in Einkaufssumme, Gesamtausgaben, Diagramm und Vorzeitraum ein. Die Einkaufskachel zählt nur diese Einkäufe. Die Gewinnkachel nennt die Verkäufe mit bekannten Kosten, deren Ergebnis in der Summe steckt, und folgt unmittelbar auf Umsatz. Die Entscheidung ist im Dashboard-Konzept ergänzt.

**Prüfung:** Gezielte Berichts- und Dashboard-Tests sowie Typprüfung, ESLint, Formatprüfung und Angular-Produktionsbau.

## 2026-09-27 – Juna – Bestehende große Produktbilder einmalig verkleinert

**Auftrag:** Bereits gespeicherte Bilder nachträglich komprimieren und erklären, wie der einmalige Lauf abläuft.

**Änderung:** Ein wiederaufnehmbares Wartungsskript sichert Originale, verkleinert JPEG-/PNG-Dateien über 0,8 MB auf höchstens 1600 Pixel Kantenlänge und ersetzt nur tatsächlich kleinere Fassungen am selben Speicherpfad. Es prüft vor jeder Änderung den aktuellen Dateistand und überspringt archivierte Arbeitsbereiche. Auf dem Produktionsserver wurden drei aktive Shop-Bilder von zusammen 7.061.706 auf 731.729 Bytes verkleinert. Ein großes Produktbild und ein Einzelstückfoto liegen in archivierten Arbeitsbereichen und blieben gemäß Archivierungssperre unverändert. Die Originale liegen für eine mögliche Wiederherstellung zugriffsbeschränkt unter `/opt/flipbase/image-backfill-20260927/`.

**Prüfung:** Nach dem Upload stimmen die gelesenen Bilddateien bytegenau mit den optimierten Fassungen überein. Die Datenbank meldet drei Shop-Bilder mit zusammen 731.729 Bytes und keine fehlenden Bildverweise. Die 25 Produktbilder aktiver Arbeitsbereiche liegen bereits alle unter 0,8 MB. Das Skript wurde mit Python kompiliert und der Lauf nach einem vorübergehenden API-Fehler erfolgreich fortgesetzt.

## 2026-09-27 – Juna – Dashboard-Einkäufe im gewählten Zeitraum erklärt

**Auftrag:** Die Anzeige von 160,07 € bei 13 erfassten Einkäufen im Workspace Wiehen Store prüfen.

**Änderung:** Die vier Einkäufe mit Kaufdatum im September ergeben zusammen genau 160,07 €. Die übrigen neun Einkäufe liegen im August; zwölf der 13 Einkäufe sind abgeschlossen. Die Dashboard-Kachel zeigt zusätzlich die Anzahl der Einkäufe mit bekanntem Preis, die in ihrer Summe und im gewählten Zeitraum enthalten sind. Die bestehende Berechnung und die Zeitraumauswahl bleiben erhalten.

**Prüfung:** Die Summe mit der geöffneten Einkaufsliste abgeglichen. Gezielte Service- und Dashboard-Tests, Typprüfung und ESLint bestanden; der Angular-Produktionsbau wurde ebenfalls geprüft.

## 2026-09-27 – Juna – Vinted-Typvertrag im Produktionsbau bereitstellen

**Auftrag:** Den nach PR #207 fehlgeschlagenen Produktionsbau untersuchen und
die Veröffentlichung des geprüften Vinted-Foundation-Stands abschließen.

**Änderung:** `.dockerignore` nimmt den reinen Marktplatz-Typvertrag gezielt in
den Docker-Baukontext auf. Andere Edge-Function-Dateien bleiben ausgeschlossen.
Der lokale Angular-Bau hatte die Datei auf dem Rechner gefunden; im Container
fehlte sie und der Produktionsbau brach deshalb ab.

**Prüfung:** Ein Docker-Kontexttest und der vollständige Build der Docker-
Baustufe bestanden. Im erzeugten Abbild liegt unter `supabase/functions/` nur
der ausdrücklich freigegebene Typvertrag. Der erneute Produktionslauf steht aus.

## 2026-09-27 – Juna – Zwei Beta-Testregistrierungen entfernt

**Auftrag:** Zwei Testregistrierungen samt zugehörigen Nutzerkonten aus der produktiven Datenbank entfernen.

**Änderung:** Die beiden eindeutig zugeordneten Beta-Bewerbungen, Nutzerkonten und ausschließlich von ihnen genutzten Test-Workspaces in einer Transaktion gelöscht. Mit den Workspaces wurden nur automatisch angelegte Grundeinträge entfernt. Am zweiten Konto stand in der Datenbank „Karl Jackson“ statt der im Auftrag genannten Schreibweise „Carl Jackson“.

**Prüfung:** Vorher die Verknüpfungen, weitere Mitglieder, Geschäftsdaten und gespeicherte Dateien geprüft. Danach für beide Datensätze das Fehlen von Beta-Bewerbung, Auth-Konto, Profil, Workspace, Mitgliedschaft, Lizenz und Discord-Verknüpfung direkt in der Produktionsdatenbank bestätigt. Kein Anwendungscode oder Datenbankschema geändert.

## 2026-09-27 – Juna – Vinted-Foundation für Pull Request abgeglichen

**Auftrag:** Den geprüften Vinted-Foundation-Branch als Pull Request vorbereiten
und nach erfolgreichen Pflichtprüfungen integrieren.

**Änderung:** Den aktuellen Stand von `origin/master` in den bestehenden Branch
übernommen. Die Schema-Registrierungen für Discord und Marktplatz sowie alle
Änderungsprotokolleinträge bleiben erhalten. Drei ältere Marktplatz-Vertragsdateien
wurden für die verbindliche Formatprüfung angepasst.

**Prüfung:** `npm run verify`, frischer Datenbankaufbau mit beiden neuen
Migrationen, 2127 Datenbanktests und drei Marktplatz-Browserabläufe bestanden.
Die PR-Pflichtprüfungen stehen noch aus.

## 2026-09-27 – Juna – Kontogebundene Vinted-Testsitzung vorbereitet

**Auftrag:** Den bestehenden Marktplatz-Branch mit sicherer Sitzungstechnik
und einer eigenen Testseite fortsetzen, ohne echte Vinted-Konten zu verwenden.

**Änderung:** Anbieter-Schnittstellen geprüft, künstliche Sitzungssperre je
Workspace und Konto mit Ablauf und Widerruf ergänzt und eine Testseite an die
vorhandene Vinted-Oberfläche angeschlossen. Anbieterzugänge werden weder
gespeichert noch an den Browser ausgegeben. Plan und Prüfprotokoll wurden
aktualisiert; echte GoLogin-/Playwright-Anmeldung bleibt gesondert freizugeben.

**Prüfung:** Neuaufbau der lokalen Datenbank und 2127 Datenbanktests bestanden.
Gezielte Angular-/Modelltests, TypeScript, ESLint, Produktionsbau sowie drei
Browserabläufe mit künstlichen Antworten bestanden. Kein Merge und kein
produktives Deployment. Die vollständige Anwendungstestsuite bestand nach
Aktualisierung zweier veralteter Einstellungs-Routenerwartungen ebenfalls.
Das SQL-Lint für `public` bestand ohne neue Warnungen.

## 2026-09-27 – Juna – Eigene Variantenbilder und kleinere neue Artikelfotos

**Auftrag:** Beim Anlegen neuer Farbvarianten eigene Bilder hinzufügen und die Ladezeit von Produktbildern in Artikel-, Einkaufs- und Shopansichten verbessern; zudem SSR und Bild-Caching prüfen.

**Änderung:** Der Variantendialog nimmt eigene Bilder an. Auf der Variantenseite wird die eigene Galerie bearbeitet; ohne eigene Bilder verwendet die Darstellung weiterhin die Bilder des Hauptartikels. Katalog und Shop bevorzugen vorhandene Variantenbilder. Neue große Produkt- und Einzelstückfotos werden vor dem Upload auf maximal 1600 Pixel Kantenlänge und ungefähr 0,8 MB als WebP vorbereitet. Kleine Bilder, AVIF und animierbare GIFs bleiben unverändert. Shopkarten laden Bilder bei Bedarf. Bereits gespeicherte Dateien werden dadurch nicht rückwirkend verkleinert. Das Projekt verwendet derzeit clientseitiges Angular-Rendering ohne SSR; für die angemeldeten Listen ist die Bildmenge der direktere Ansatzpunkt.

**Prüfung:** Gezielte Tests für Variantenbilder, Galerie-Fallback, Upload-Wiederholung und Bildverarbeitung sowie TypeScript, ESLint und Angular-Bau bestanden.

## 2026-09-26 – Juna – Vinted-Kontobereich sichtbar umgesetzt

**Auftrag:** Auf dem bestehenden Marktplatz-Branch die integrierte Oberfläche
bauen und die vorhandenen Kontofunktionen anschließen.

**Änderung:** Eigener Menüpunkt Marktplätze → Vinted mit Kontowechsler,
Übersicht, Inseraten, Gesprächsverlauf, Verkäufen, Profil und Kontoverlauf.
Einstellungen bieten Anlegen, Umbenennen und Pausieren von Verbindungen über
die vorhandenen autorisierten RPCs. Kontodaten werden zur Laufzeit geprüft;
verspätete Antworten, Workspacewechsel und Abmeldung geben keine fremden
Ansichtsdaten frei. Kein Demo-Konto in der normalen Ansicht, keine erfundene
Browseranmeldung, keine Änderung am Bestand durch gelesene Plattformmeldungen.

**Prüfung:** Testgetriebene Antwort-, API-, Guard-, Zustands- und Komponententests
sowie Navigation und Übersetzungen. Desktop-/Mobil-Browserprüfung mit vollständig
lokalen HTTP-Fixtures vorbereitet. Der genaue ausgeführte Prüfumfang steht in
`docs/implementation/vinted-marketplace-progress.md`. Keine echte Vinted-Sitzung,
kein Merge und kein produktives Deployment.

## 2026-09-26 – Juna – Integrierte Marktplatzkonten begonnen

**Auftrag:** Auf dem bestehenden Vinted-Branch die native Kontoverwaltung fortsetzen.

**Änderung:** Kontobezogene Datenverträge und Servervalidierung, persistente
Verbindungsmetadaten und geschützte Lesekopien. Inhaber/Admins verwalten die
Verbindungen; einfache Mitglieder erhalten keine privaten Kontodaten. Der
Datenbankabgleich läuft ausschließlich auf einem wegwerfbaren CI-Runner.

**Prüfung:** Neue Datenbanktests einschließlich Fremdkonto, Pausenstatus und
61 Aktivitäten bestanden vor Vorbereitung dieses Commits. Weitere Prüfungen
und Frontend-Arbeitsstand stehen im featurebezogenen Prüfprotokoll. Kein
Vinted-Konto verwendet, kein Merge und kein produktives Deployment.

## 2026-09-26 – Juna – Beta-Registrierung visuell und beim Zurückgehen verbessert

**Auftrag:** Die drei Registrierungsschritte einheitlich gestalten, gelbe
Markenfokusse verwenden, die Fortschrittslinien animieren und nach Passwort-
oder Workspace-Vergabe zum vorherigen Schritt zurückgehen können.

**Änderung:** Die drei Karten sind gleich breit. Passwortfelder, Checkbox,
Rechtstextlinks und Aktionen folgen der Markenfarbe; die Weiter-Aktionen sind
klein und rechtsbündig. Der Fortschritt hat Verbindungsstrecken mit einer
reduzierten Animation. Im Discord-Schritt entfällt die große Farbfläche.
Zurück-Navigation zeigt das bereits gesetzte Passwort als erledigt und den
gespeicherten Workspace-Namen zur möglichen Änderung an. Die technische
Sitzung bleibt für die geschützte Workspace-Einrichtung bestehen.

**Prüfung:** 34 gezielte Angular-Tests, Typen, Lint, Shared-UI-Prüfung,
Formatierung und Angular-Produktionsbau. Der vollständige Browser-Test konnte
lokal nicht starten, da der Docker-Port der Supabase-Testdatenbank auf diesem
Rechner gesperrt ist.

## 2026-09-26 – Juna – Sidebar vereinheitlicht und Nebennavigation nach unten gesetzt

**Auftrag:** Die obere Trennlinie und den OS-Zusatz entfernen, das Flipbase-Logo
vergrößern und Ideen, Einstellungen sowie Administration am unteren Rand der
Sidebar neu anordnen. Die Versionsnummer soll dezent auf der Einstellungsseite
stehen.

**Änderung:** Der Logobereich geht ohne Trennlinie in die Arbeitsnavigation über.
Ideen stehen oberhalb der unteren Trennlinie; Einstellungen und die nur für
Plattform-Admins sichtbare Administration stehen darunter. Die Versionsnummer
erscheint rechts unten auf der Einstellungsseite, mit Stand und Commit im Tooltip.

**Prüfung:** Gezielte Angular-Tests für Sidebar und Einstellungen, Formatierung,
ESLint und Angular-Produktionsbau.

## 2026-09-26 – Juna – Beta-Registrierung in drei Schritten gestaltet

**Auftrag:** Passwortvergabe, Workspace-Name und Discord-Verbindung als
zusammenhängende Registrierung mit sichtbaren Schritten darstellen. Nach der
Discord-Freigabe soll auf Flipbase eine Willkommensbestätigung erscheinen.

**Änderung:** Alle drei Seiten zeigen denselben Fortschritt. Der Workspace führt
nach dem Speichern zum Discord-Schritt, der das offizielle Discord-Logo und eine
Verbindungsaktion in Discord-Farben zeigt. Nach der Zustimmung bestätigt
Flipbase die Rolle „Beta-Tester“ und bietet einen Link zum Server. Der Schritt
kann übersprungen werden; das Dashboard erinnert dann weiterhin an Discord.

**Prüfung:** Gezielte Angular-Tests für Registrierung und Discord-Ansicht,
TypeScript-Prüfung und Produktionsbau bestanden. Ein echter Discord-Beitritt
wird nach Veröffentlichung und Einrichtung der Serverwerte geprüft.

## 2026-09-26 – Juna – Beta-Bewerbungen melden und Discord-Zugang verbinden

**Auftrag:** Neue Beta-Bewerbungen per E-Mail an `beta@flipbase.de` melden und
angenommenen Beta-Nutzern nach der Registrierung den Eintritt in den
Flipbase-Discord mit der Rolle „Beta-Tester“ ermöglichen.

**Änderung:** Die Bewerbungsfunktion sendet nach einer neuen Speicherung eine
Betreiber-Mail und hält den Versandstatus fest. Ein Versandfehler wird in der
Bewerbungsübersicht sichtbar und kann dort erneut gesendet werden. Die
Einladung weist auf Discord hin. Workspace-Einrichtung und Dashboard zeigen
einen Verbindungsbanner.
Discord fragt den Nutzer nach Zustimmung; eine geschützte Edge Function prüft
seinen aktiven Beta-Zugang, fügt sein Discord-Konto dem Server hinzu und vergibt
die Rolle. Die Verknüpfung wird serverseitig gespeichert. Die Zugangsdaten
bleiben auf dem Server; die Einrichtung der vorhandenen Discord-App mit Bot,
Server- und Rollenkennung ist in der Deployment-Anleitung beschrieben.

**Prüfung:** Gezielte Deno-, Angular-, Schema- und Registrierungsgrenztests,
TypeScript-Prüfung, ESLint und Angular-Produktionsbau bestanden. Die Migration
wurde aus dem deklarativen Schema erzeugt und auf einer getrennten lokalen
Datenbank angewendet. Ein echter Discord-Beitritt und der E-Mail-Empfang werden
nach Einrichtung der Serverwerte in Produktion geprüft.

## 2026-09-26 – Juna – Doppelte Scrollleiste in der Einkaufsvorschau entfernt

**Auftrag:** Bei vielen Artikeln soll die Vorschau nur innerhalb der Artikelliste
scrollen. Der zusätzliche Scrollbalken am äußeren Rand des Pop-ups stört.

**Änderung:** Der äußere Rahmen begrenzt nun die Höhe ohne eigenen Scrollbereich.
Ein flexibles Layout lässt nur die Artikelliste schrumpfen und scrollen; Kopf
und Link zum Einkauf bleiben sichtbar. Die Liste bleibt auf höchstens fünf
normale Positionen begrenzt.

**Prüfung:** 23 Angular-Tests bestanden; ESLint und Prettier für die geänderten
Dateien sowie der Angular-Produktionsbau waren erfolgreich. Eine Messung im
Browser mit dem gebauten Stylesheet bestätigte bei 452 und 280 px Pop-up-Höhe:
Der Rahmen scrollt nicht, die Artikelliste scrollt und der Link bleibt sichtbar.

## 2026-09-26 – Juna – Artikelvorschau auf fünf Positionen begrenzt

**Auftrag:** Die Vorschau in „Erhalten“ soll bei vielen Artikeln kompakt bleiben,
innerhalb der Artikelliste scrollen und beim Öffnen nach oben nicht hinter dem
Seitenkopf verschwinden.

**Änderung:** Die Liste zeigt höchstens fünf normal hohe Positionen auf einmal;
weitere bleiben innerhalb der Liste scrollbar. Titel und Link zum Einkauf
bleiben außerhalb dieser Scrollfläche. Bei nach oben geöffneten Vorschauen
begrenzt die sichtbare Unterkante des Seitenkopfs den verfügbaren Platz.

**Prüfung:** 23 Angular-Tests bestanden, darunter neue Fälle für den Abstand zum
Seitenkopf und zehn scrollbar dargestellte Positionen. Vollständiges ESLint,
TypeScript-Prüfung, Prettier, Shared-UI-Prüfung und Angular-Produktionsbau waren
erfolgreich.

## 2026-09-26 – Juna – Einkaufs-Vorschauen einzeln und passend zum Bildschirm öffnen

**Auftrag:** Beim Wechsel zwischen „Erhalten“-Zellen darf nur eine
Artikelvorschau offen bleiben. In der unteren Bildschirmhälfte soll sie nach
oben statt in den knappen Platz nach unten öffnen.

**Änderung:** Alle Vorschauen der Einkaufstabelle teilen sich einen
seitenbezogenen offenen Zustand. Das Öffnen einer Zeile schließt die bisherige
Vorschau sofort; ein erneuter Klick schließt sie wieder. Die Öffnungsrichtung
richtet sich nach dem größeren freien Bereich ober- oder unterhalb der Zelle.

**Prüfung:** 22 Angular-Tests bestanden, darunter der Wechsel zwischen zwei
Zeilen und eine Zelle in der unteren Bildschirmhälfte. Vollständiges ESLint,
TypeScript-Prüfung, Prettier, Shared-UI-Prüfung und Angular-Produktionsbau waren
erfolgreich.

## 2026-09-26 – Juna – Artikelvorschau beim Wareneingang vergrößert

**Auftrag:** Die schmale Vorschau in der Spalte „Erhalten“ lesbarer machen,
Artikelbilder zeigen und die doppelte Gesamtmenge im Vorschaufenster vermeiden.

**Änderung:** Die Vorschau bietet mehr Breite und zeigt pro Position ein Bild oder
einen Platzhalter, den vollständigen Artikelnamen, bei Bedarf die EAN und die
erhaltene Menge. Der Kopf nennt die Anzahl der Positionen statt die bereits in
der Tabelle sichtbare Gesamtmenge zu wiederholen. Artikelbilder werden erst
beim Öffnen geladen. Das Fenster richtet sich am verfügbaren Platz ober- oder
unterhalb der Tabellenzeile aus; Klicks in die Liste öffnen den Einkauf nicht
versehentlich.

**Prüfung:** 39 Fachtests und 20 Angular-Tests einschließlich strukturellem
AXE-Check der geöffneten Vorschau bestanden. TypeScript-Prüfung, vollständiges
ESLint, die Shared-UI-Prüfung und der Angular-Produktionsbau waren erfolgreich.

## 2026-09-26 – Juna – Variantenzeile im Einkauf exakt ausgerichtet

**Auftrag:** Größe und Farbe in der Liste der Einkaufspositionen tatsächlich
bündig unter dem sichtbaren Artikeltitel platzieren.

**Änderung:** Die Größenklasse des gemeinsamen einfachen Buttons fügte trotz
`p-0` seitlichen Innenabstand hinzu. Einfache Buttons erhalten nun ausdrücklich
keinen horizontalen Innenabstand; andere Button-Varianten behalten ihre
bisherigen Abstände. Die Variantenzeile beginnt dadurch an derselben Stelle wie
der Artikeltitel.

**Prüfung:** 41 gezielte Angular-Tests für Button und Einkaufsposition, ESLint,
TypeScript-Typprüfung, Formatierung und Angular-Produktionsbau bestanden. Eine
Browser-Messung mit dem gebauten Stylesheet ergab denselben linken Startpunkt
für Titeltext und Variantenzeile.

## 2026-09-26 – Juna – Variantendetails im Einkauf sichtbar gemacht

**Auftrag:** Größe und Farbe einer Einkaufsposition direkt unter dem Artikelnamen
und im Detaildialog anzeigen.

**Änderung:** Die Einkaufstabelle zeigt den Artikelnamen und die Variantenangabe
in getrennten, bündig ausgerichteten Zeilen. Der Detaildialog nennt Größe und
Farbe ausdrücklich neben Marke, Modell und Kategorie. Der gespeicherte
Bezeichnungsschnappschuss behält die Variantenangabe weiterhin bei.

**Prüfung:** Der gezielte Angular-Test für die Einkaufspositionen, TypeScript-
Prüfung, ESLint, Formatierung und Angular-Produktionsbau bestanden.

## 2026-09-26 – Juna – Bildgalerie, Farben und Kategorien der Artikelerfassung verfeinert

**Auftrag:** Produktbilder platzsparend wie Kacheln anordnen und durch Ziehen sortieren.
Bildname, Alternativtext, Zuschnitt und Löschen sollen über die Bilddetails erreichbar
sein. Die Farbauswahl soll mehr gängige Farben samt Farbpunkten zeigen; Kategorien
sollen in einer geraden Linie stehen und über eine zurückhaltende Elternzeile
auswählbar sein.

**Änderung:** Das Hauptbild erscheint als große Kachel neben kleineren Bildern und
einer Plus-Kachel. Bilder lassen sich per Maus oder Berührung ziehen; über den
Bilddialog können auch Tastaturnutzer die Position ändern. Bildname und
Alternativtext werden mit dem Artikel gespeichert, der Alternativtext wird im Shop
verwendet. Die Farbpalette enthält nun auch neutrale, klassische und Neonfarben
mit Farbvorschau. Im Kategorie-Picker haben alle Zeilen denselben Texteinzug;
die aktuelle Oberkategorie steht als dezente auswählbare Zeile unter „Zurück“.

**Prüfung:** Gezielte Angular- und Medienservice-Tests, ESLint, Typprüfung,
Workflow-Tests, Angular-Bau und Browserabläufe bei 1440 und 390 Pixeln samt
AXE-Prüfung bestanden. Die Migration wurde beim lokalen Neuaufbau angewendet;
alle 2.062 Datenbanktests sowie der ergänzte Medientest bestanden.

## 2026-09-26 – Juna – Auswahlfelder und Bilderablage der Artikelerfassung verbessert

**Auftrag:** Kategorie und Farbe auf „Artikel erstellen“ besser lesbar und bedienbar
machen. Beim Ziehen von Bildern eine klare Ablagefläche zeigen und nach dem ersten
Bild die große Upload-Box durch eine Plus-Kachel ersetzen.

**Änderung:** Das Kategorie- und Suchfeld heben sich jetzt sichtbar von der Karte
ab und verwenden die Textfarbe des aktiven Designs. Die Farbauswahl lässt den
gewählten Wert beim Öffnen und nach einer neuen Auswahl im Eingabefeld stehen,
während alle Vorschläge erreichbar bleiben. Der Bilderbereich zeigt während eines
Dateizugs eine überlagerte Ablagefläche. Nach dem ersten Bild stehen die Bilder
in einem Raster mit einer Kachel zum Hinzufügen weiterer Bilder; Dateien lassen
sich weiterhin über dem gesamten Bereich ablegen. Nach dem Entfernen des letzten
Bilds kehrt die anfängliche Upload-Fläche zurück.

**Prüfung:** 30 gezielte Angular-Tests für Kategorie, Farbe und Bilder bestanden.
TypeScript-Typprüfung, ESLint für die geänderten TypeScript-Dateien und
Angular-Produktionsbau erfolgreich. Die geänderten Dateien wurden formatiert.

## 2026-09-26 – Juna – Varianten beim Einkauf gezielt auswählen und anlegen

**Auftrag:** Beim Erfassen eines Einkaufs soll nach der Artikelsuche klar sein,
welche Größe und Farbe gekauft wurde. Fehlende Varianten sollen ohne Umweg über
die Artikelseite angelegt werden können.

**Änderung:** Die Einkaufssuche fasst Varianten unter ihrem Artikel zusammen und
zeigt anschließend die konkreten Größen und Farben zur Auswahl. Neue Varianten
können direkt in dieser Auswahl und im Detaildialog einer bereits hinzugefügten
Einkaufsposition angelegt werden. Dort kann auch auf eine vorhandene Variante
gewechselt werden. Die Einkaufsposition speichert weiterhin die konkrete
Artikel-ID; ihr Bezeichnungsschnappschuss enthält nun Größe und Farbe, damit die
Variante auch nach dem Speichern und beim Wareneingang erkennbar bleibt. Das
Variantenformular wird von Artikelseite und Einkauf gemeinsam genutzt.

**Prüfung:** Gezielte Angular-Tests für Auswahl, Variantenwechsel und
Artikelseite, TypeScript-Prüfung, ESLint, Prettier und Angular-Produktionsbau
bestanden. Der Bau meldete nur die bestehende `pako`-Warnung.

## 2026-09-25 – Juna – Auswahlfelder der Artikelerfassung korrigiert

**Auftrag:** Kategorieauswahl, Farbe, Material und den Hinweis auf ungespeicherte
Änderungen auf „Artikel erstellen“ nach dem Umbau bedienbar und einheitlich machen.

**Änderung:** Die Kategorie-Suche liegt beim Öffnen über dem bisherigen Feld. Die
Kategorienliste hat eine feste Höhe, einen sichtbaren Scrollbereich und hält ihre
Karte beim Scrollen und Ebenenwechsel offen. Blattkategorien zeigen beim Hover
und Tastaturfokus einen Haken. Bereits gewählte Farben filtern die Liste beim
erneuten Öffnen nicht mehr. Material-Tags stehen im Eingabefeld und lassen sich
einzeln entfernen. Die Scrollgrenzen der gemeinsamen Auswahlfelder verhindern,
dass das Mausrad stattdessen die Seite bewegt. Der Hinweis auf ungespeicherte
Änderungen steht links vor den Kopfaktionen.

**Prüfung:** 83 gezielte Angular-Tests, zwei Browser-Tests auf Desktop und Mobil,
ESLint, Formatierung und Angular-Produktionsbau bestanden. Der Browser-Test prüft
Scrollen, Ebenenwechsel, Haken, erneute Farbauswahl, Material-Tags und die
Position des Änderungshinweises.

## 2026-09-25 – Juna – Gelbe Hinweisbanner in Einkauf und Bestand

**Auftrag:** Den braunen Hinweis zu offenen Einkaufspreisen durch einen gelben
Info-Banner mit Icon und Trennlinie ersetzen und vergleichbare Hinweise angleichen.

**Änderung:** Ein gemeinsamer Hinweis-Baustein verwendet die vorhandenen gelben
Markenfarben und zeigt links ein Info-Icon mit Trennlinie. Der Hinweis auf offene
Einkaufspreise und die Meldung nach einer erfolglosen Bestandssuche nutzen diesen
Baustein. Die Ansage als Warnung beziehungsweise Status bleibt erhalten.

**Prüfung:** 29 gezielte Angular-Tests, Angular-Vorlagenprüfung, ESLint,
Prettier, die Shared-UI-Prüfung und der Angular-Produktionsbau bestanden. Für
den Bau wurde ein isolierter Prüf-Worktree auf demselben Laufwerk wie die
verknüpften Abhängigkeiten verwendet, damit `intl-tel-input`-Bildpfade korrekt
aufgelöst werden.

## 2026-09-25 – Juna – Bildzuschnitt und Artikelübersicht angepasst

**Auftrag:** Produktbilder ohne freie Ränder passend zuschneiden, die
Speichermeldung neben der Aktion zeigen und die Artikelübersicht bei Ansichten,
Spalten und aktiven Einstellungen verbessern.

**Änderung:** Der Zuschnitt in der Artikelerfassung hält jetzt ein quadratisches
Seitenverhältnis. Die Shop-Bildflächen verwenden ebenfalls quadratische
Ausschnitte ohne Innenabstand. „Artikel gespeichert“ erscheint im Seitenkopf
direkt vor „Speichern“. Die Artikelansicht hat eine Auswahlbox mit „Alle“ als
Grundansicht. Marke steht standardmäßig sichtbar hinter Artikel; weitere
optionale Artikelangaben folgen vor „Auf Lager“. Bisherige unveränderte
Standardansichten werden einmalig umgeordnet, persönliche Spaltenauswahlen
bleiben erhalten. Der gemeinsame Spalten- und Sortierknopf zeigt mit gelbem
Hintergrund an, wenn Ansicht, Suche, Sortierung oder Spalten geändert wurden.

**Prüfung:** Die gezielten Komponenten- und Einstellungs-Tests, TypeScript,
ESLint und Angular-Bau bestanden.

## 2026-09-25 – Juna – Artikelerfassung und Varianten überarbeitet

**Auftrag:** Die Seite „Artikel erstellen“ anhand der Shopify-Admin-Referenz neu
ordnen und Kategorie, Farben, Materialien, Marken, Kennungen sowie den
Suchmaschineneintrag fachlich prüfen. Während der Planung kam die Anforderung
hinzu, weitere Schuhgrößen und Farben als Varianten eines Artikels anzulegen.

**Änderung:** Den Entwurf unter
`docs/superpowers/specs/2026-09-25-article-create-admin-design.md` festgehalten
und die Artikelseite mit Grunddaten, Bildern, Varianten, Suchmaschineneintrag,
Eigenschaften und Kennungen neu geordnet. Größe und Farbe können als Varianten
mit eigener Artikel-ID, Kennungen, Preis und Bestand angelegt werden; gemeinsame
Angaben und Bilder werden über die Artikelgruppe genutzt. Historische Artikel
erhalten ihre Gruppe erst bei der ersten zusätzlichen Variante und behalten ihre
ID. Die Suche findet „High Heels“ und verwandte Begriffe in der vorhandenen
Schuhkategorie. Farbe und Material haben suchbare Auswahlfelder; Material erlaubt
mehrere Werte. Eine Marken-Unterseite bietet Anlegen, Umbenennen und die
bisherige Ersetzen-/Löschen-Funktion. Der Shop zeigt Artikelgruppen nur einmal
und bietet Größen und Farben auf der Produktseite an; die Einkaufs-Auswahl zeigt
die unterscheidenden Variantenmerkmale.

**Prüfung:** Die Variantenmigrationen wurden aus dem deklarativen Schema erzeugt
und auf einer isolierten frischen Datenbank angewendet. Der gezielte Datenbanktest
bestand mit 15 Prüfungen einschließlich Altartikel, Archivierung, Eindeutigkeit,
gemeinsamer Angaben und Workspace-Schutz. Gezielte Angular-, Service- und
Medientests, ein AXE-Test des Auswahlfelds, TypeScript-Prüfung, Lint,
Formatierung, Schema-Registrierung und Angular-Bau bestanden. Nach der PR-Prüfung
wurde der Gruppen-Fremdschlüssel am Transaktionsende geprüft, damit die
bestehende Workspace-Schutzprüfung für Store-Bestellungen ihre genaue
Fehlermeldung behält. Der dazugehörige Bestandstest und die Variantentests
bestanden zusammen; anschließend bestanden alle 2.062 Datenbankprüfungen.
Der Browser-Smoke-Test wählt Bestandszellen über ihre Spaltenüberschrift und
nutzt die neue Artikelansicht-Auswahlbox.

## 2026-09-25 – Juna – Design und Sprache der Landingpage bleiben nach Neuladen erhalten

**Auftrag:** Die Auswahl von hellem oder dunklem Design und Deutsch oder Englisch
auf der Landingpage soll nach einem Neuladen bestehen bleiben.

**Änderung:** Die Landingpage speichert beide Entscheidungen im Browser und stellt
sie beim Laden wieder her. Das gewählte Design bleibt auch erhalten, wenn sich die
Systemeinstellung für hell und dunkel ändert. Ohne eigene Auswahl folgt die Seite
weiter der Systemeinstellung. Die Dokumentsprache und Browserfarbe entsprechen der
sichtbaren Auswahl.

**Prüfung:** Alle 33 Landingpage-Tests bestanden, darunter neue Tests für Neuladen,
Systemwechsel und Rückwechsel der Sprache. Prettier, ESLint und `git diff --check`
waren ohne Befund.

## 2026-09-25 – Juna – Footer verdichtet und Scrollsprung nach Cookie-Auswahl behoben

**Auftrag:** Den Sprung ans Seitenende nach „Alle akzeptieren“ beheben und den
Footer deutlich kompakter gestalten.

**Änderung:** Nach der ersten Cookie-Entscheidung erhält die Hauptüberschrift
den Fokus, ohne die Scrollposition zu ändern. Bei später geöffneten Einstellungen
kehrt der Fokus zum auslösenden Button zurück. Der Footer enthält nur noch Logo,
Impressum, Datenschutz, Cookie-Einstellungen und Copyright; Beschreibung,
Beta-Badge und wiederholte Produktnavigation wurden entfernt. Die bearbeiteten
Footer-Klassen heißen nun entsprechend der Projektregel `footer-*`.

**Prüfung:** 32 Landingpage-Tests und Angular-Produktionsbau bestanden.
Im Browser blieb die Scrollposition nach Zustimmung oben und nach späterem
Schließen der Einstellungen unverändert. Der Footer misst bei 1280 px Breite
81 px statt zuvor 494 px, bei 390 px Breite 111 px statt zuvor 836 px.
Bei 320 px Breite bleiben die Links sichtbar. AXE meldete in den geprüften
Dialog- und Footer-Ansichten keine WCAG-Verstöße. Der Bau meldete die bekannte
CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Fotovorschau und Artikelformular korrigiert

**Auftrag:** Tablet-Fotos in der KI-Produktsuche vollständig anzeigen, den großen
roten Löschknopf verkleinern, „EAN online suchen“ aus der Artikelerstellung
entfernen und die Beschriftung „Zustand“ wieder sichtbar machen.

**Änderung:** Die Fotovorschau liegt mit unverändertem Seitenverhältnis in einer
eigenen Kachel; die Dateigröße steht darunter. Ein kleiner, deckender
schwarz-weißer X-Kreis entfernt das Foto. Die manuelle EAN-Onlinesuche wurde aus
beiden Erstellen-Ansichten entfernt; der Scan-Ablauf bleibt verfügbar. Das
Zustandsfeld hat wieder eine sichtbare, zugeordnete Beschriftung.

**Prüfung:** 35 gezielte Angular-Tests, TypeScript-Typprüfung, ESLint, Prettier,
Angular-Produktionsbau und ein Tablet-Browsertest bestanden. Der Browsertest
prüfte ein hochkant aufgenommenes Foto, dessen vollständige Vorschau, die
Größe und Deckkraft des Löschknopfs, das Entfernen des Fotos, das Formular und
die Barrierefreiheit der geöffneten Suche mit Axe.

## 2026-09-25 – Juna – Einwilligungstext als klare Wahl formuliert

**Auftrag:** Den Einstieg des Cookie-Dialogs im Stil des vorgeschlagenen Beispiels
verständlicher formulieren.

**Änderung:** Der Dialog beginnt mit „Du hast die Wahl“ und beschreibt die
optionale Analyse in allgemein verständlicher Sprache. Zweck, Google Analytics
mit Anbieter, mögliche Verarbeitung in den USA und Widerruf bleiben genannt.
Impressum und Datenschutzerklärung sind direkt verlinkt; die Einstellung heißt
im Footer und im Datenschutzhinweis einheitlich „Cookie-Einstellungen“.
Der Tastaturtest berücksichtigt jetzt beide Links im Dialog.

**Prüfung:** 30 Landingpage-Tests, Prettier, Diff-Prüfung und Angular-Produktionsbau
bestanden. Die mobile Ansicht wurde bei 320 px Breite und 568 bzw. 700 px Höhe
im Browser geprüft. Der Bau meldete die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Einwilligungstext nach Recherche vereinfacht

**Auftrag:** Einen üblichen, kurzen Bannertext recherchieren und die direkte
Formulierung zur Datenübermittlung an Google im Einstieg ersetzen.

**Änderung:** Der Einstieg beschreibt jetzt Analyse-Cookies, den Zweck, Google
Analytics mit Anbieter und die mögliche Verarbeitung in den USA in ruhigerer
Sprache. Einzelne gemessene Ereignisse bleiben aus dem Einstieg heraus; die
ausführlichen Angaben stehen weiter unter „Details“ und in der
Datenschutzerklärung. Die Orientierungshilfe der Datenschutzkonferenz für
digitale Dienste (Version 1.2) und die Handreichung der Hamburger
Datenschutzaufsicht waren Grundlage für die Abstufung der Informationen.

**Prüfung:** 30 Landingpage-Tests, Prettier und Angular-Produktionsbau bestanden.
Der Text passt auch bei 320 px Breite, beide Entscheidungen bleiben sichtbar.
AXE meldete in den geprüften hellen und dunklen Ansichten keine WCAG-Verstöße.
Der Bau meldete die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Einwilligungsdialog klarer und sichtbarer gestaltet

**Auftrag:** Die Entscheidungen unten so breit wie die Reiter anzeigen, die
Texte ohne einzelne Beta-Anwendungsfälle formulieren und den Dialog mit
passenderen Ecken deutlich von unten einblenden.

**Änderung:** Die beiden Entscheidungen teilen sich die Dialogbreite gleichmäßig.
Der Einstieg nennt allgemein den Analysezweck, Google Ireland Limited, Cookies,
die Datenübermittlung und den Weg zur späteren Änderung. Die Details beschreiben
Seitenaufrufe und Interaktionen statt einzelner Ereignisse. Der Dialog verwendet
den 20-Pixel-Radius der übrigen Karten und gleitet sichtbar von unten hinein;
bei reduzierter Bewegung bleibt die Animation ausgeschaltet. Die allgemeine
Fokusregel verkleinert den Radius des automatisch fokussierten Dialogs nicht mehr.

**Prüfung:** 30 Landingpage-Tests, Prettier und Angular-Produktionsbau bestanden.
Desktop und Mobilansichten bis 320 px sowie helles und dunkles Farbschema im
Browser geprüft. Beide Reiter, die Aktionsbreiten, der 20-Pixel-Radius und die
Einblendung wurden betrachtet. AXE meldete in Zustimmung und Details keine
WCAG-Verstöße; reduzierte Bewegung schaltet die Animation aus. Der Bau meldete
die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Einwilligungsdialog kompakter und ruhiger gestaltet

**Auftrag:** Den Dialog beim ersten Besuch unten zentriert und animiert zeigen,
den Sprachwechsel über Flaggen anbieten, die vorgewählt wirkende Umrandung
entfernen und die Detailauswahl als Schalter mit kleineren Aktionen darstellen.
Die Entscheidungen sollen als grauer und gelber Button erscheinen; die Reiter
„Zustimmung“ und „Details“ sollen sich die ganze Breite teilen.

**Änderung:** Der weiterhin abgedunkelte Dialog erscheint am unteren Fensterrand.
Hintergrund und Dialog bewegen sich getrennt, damit Text auch während der
Animation lesbar bleibt; reduzierte Bewegung schaltet die Animation aus. Zwei
lokale Flaggenbilder ersetzen die Sprachtexte am Dialogkopf. Der Fokus liegt
beim Öffnen auf dem Dialog statt auf „Nur Notwendige“. In den Details ist die
notwendige Speicherung sichtbar fest aktiv und Analyse per Schalter wählbar.
Die Aktionsbuttons sind kompakter. „Nur Notwendige“ ist neutral grau,
„Alle akzeptieren“ markengelb; beide bleiben gleich groß und sofort sichtbar.
Die Reiter heißen „Zustimmung“ und „Details“ und teilen die Breite gleichmäßig.

**Prüfung:** 30 Landingpage-Tests, gezieltes ESLint, Prettier und Angular-
Produktionsbau bestanden. Desktop und Mobilansicht bis 320 px, Tastaturbedienung
und reduzierte Bewegung geprüft. AXE meldete im hellen und dunklen Farbschema
vor und nach der Animation sowie in den Details keine WCAG-Verstöße. Der Bau
meldete die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Farbige Hover-Zustände für Tabellenaktionen ergänzt

**Auftrag:** Die bisher grauen Hover-Zustände der Aktionsicons farblich angleichen, insbesondere bei Verkaufen und Bearbeiten. Über die Aktionen der Inserate wird später entschieden.

**Änderung:** Gewöhnliche Tabellenaktionen verwenden beim Hover und Tastaturfokus eine gelbe Markenfläche. Verkaufen erhält wie andere positive Aktionen eine grüne Fläche; die vorhandenen Warn- und Kritisch-Farben bleiben. Das Aktionsbutton-Mockup und die Admin-Designrichtlinie bilden die neue Farbzuordnung ab. Die fachlichen Aktionen der Inserate wurden nicht geändert.

**Prüfung:** 45 gezielte Angular-Tests, Typprüfung, ESLint, Prettier und Produktionsbau bestanden. Mit der gebauten CSS-Datei im Browser geprüft: Bearbeiten zeigt beim Hover eine gelbe, Verkaufen eine grüne Fläche.

## 2026-09-25 – Juna – Landingpage-Farben an Flipbase angeglichen

**Auftrag:** Die Landingpage und den Einwilligungsdialog vom bisherigen braunen
Akzent auf die Farben der App umstellen.

**Änderung:** Buttons, Hero-Hervorhebung, Funktionskarten, Kennzeichen und
Interaktionselemente verwenden nun das Logo-Gelb `#fcc601` mit dunkler Schrift.
Die Karten behalten neutrale Flächen und setzen Gelb gezielt für Icons,
Kennzeichen und Rahmen ein. Der Einwilligungsdialog verwendet Gelb für beide
gleichwertigen Entscheidungen und zeigt den aktiven Reiter als gelbe Fläche.
Die Links der rechtlichen Seiten wurden farblich angeglichen und ihr Fußtext
lesbar gemacht. Rot und Grün in der Beispielrechnung kennzeichnen weiterhin
Verlust und Gewinn.

**Prüfung:** 30 Landingpage-Tests, gezieltes ESLint, Prettier und Angular-
Produktionsbau bestanden. Desktop und Mobilansicht wurden betrachtet; AXE
meldete im hellen und dunklen Farbschema mit und ohne Dialog sowie auf beiden
Rechtsseiten keine WCAG-Verstöße. Der Bau meldete die bekannte CommonJS-Warnung
zu `pako`.

## 2026-09-25 – Juna – Einwilligungsdialog der Landingpage überarbeitet

**Auftrag:** Den Cookie-Dialog als abgedunkeltes Modal mit verständlicher Sprache,
einer Detailansicht und einer Auswahl einzelner Zwecke gestalten.

**Änderung:** Der Dialog zeigt eine Übersicht und einen Details-Reiter mit
notwendiger Speicherung der Auswahl und separat schaltbarer Analyse. Die Analyse
ist zunächst aus. „Nur Notwendige“ und „Alle akzeptieren“ stehen gleichwertig auf
der ersten Ebene; beide Entscheidungen tragen das Flipbase-Gelb.
Die Seite ist während der Entscheidung abgedunkelt und für die Tastatur gesperrt.
Sprache, Fokus und Widerruf über den Footer funktionieren im Dialog. Die
Beschriftung erklärt den Einsatz von Google Analytics ohne die bisherige Frage.

**Prüfung:** 30 Landingpage-Tests, gezieltes ESLint, Prettier und Angular-
Produktionsbau bestanden. Die Gestaltung wurde auf Desktop und Mobilgerät geprüft;
AXE meldete im hellen und dunklen Farbschema keine WCAG-Verstöße. Der Bau meldete
die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – Landingpage-Conversions in GA4 messbar gemacht

**Auftrag:** Nach der GA4-Einrichtung erkennen, ob Besucher die App öffnen oder sich
erfolgreich um einen Beta-Zugang bewerben.

**Änderung:** Nach einer Analytics-Einwilligung senden die Links zur App das Ereignis
`app_link_click`. Eine neu gespeicherte Beta-Bewerbung sendet `generate_lead` erst
nach erfolgreicher Serverantwort. Duplikate und fehlgeschlagene Anfragen zählen
nicht. Beide Ereignisse enthalten weder Formulardaten noch URL-Parameter oder
Referrer. Die Datenschutzerklärung nennt diese Messungen ausdrücklich. Die
angemeldete App selbst wird damit weiterhin nicht erfasst.

**Prüfung:** 28 Landingpage-Tests, gezieltes ESLint, Prettier und Angular-
Produktionsbau bestanden. Der Bau meldete die bekannte CommonJS-Warnung zu `pako`.
Die Ereignisse sind noch nicht veröffentlicht; ihr Empfang in GA4 ist daher noch
nicht live geprüft.

## 2026-09-25 – Juna – Aktionsbuttons in Admin-Tabellen vereinheitlicht

**Auftrag:** Die unterschiedlichen Aktionsbuttons in Admin-Tabellen erfassen,
vorab als Mockup vergleichen und die vom Nutzer gewählte Variante A einheitlich
umsetzen.

**Änderung:** Auf dem eigenen Branch `juna/action-buttons` die Aktionsspalten
anhand der Templates verglichen und ein HTML-Mockup mit Bildvorschau erstellt.
Die gewählte Variante A als `TableActionButtonComponent` auf dem gemeinsamen
Button umgesetzt: 28 × 28 px auf Desktop, mittiges 16-px-Icon, 8-px-Ecken,
44-px-Touchziel und Hover-/Fokusfarben nach Bedeutung. Verkäufe,
Artikelübersicht, Inserate, Ausgaben, Bestand, Verkäufer, Buchhaltung,
Mandantenübersicht, Plattform-Admin-Tabellen und die bearbeitbare
Einkaufstabelle verwenden die gemeinsame Kachel. Der doppelte Rahmen am
Inserat-Beenden-Symbol entfällt; die
Aktionsspalte hat dort eine sichtbare Überschrift. Die Designentscheidung ist
in den Admin-Richtlinien dokumentiert.

**Prüfung:** 150 gezielte Angular-Tests, TypeScript-Typprüfung, ESLint für die
geänderten TypeScript-Dateien, Prettier, gemeinsame Admin-Architekturprüfung,
`git diff --check` und Angular-Produktionsbau bestanden. Mockup mit Axe ohne
WCAG-AA-Verstoß geprüft; die gebaute CSS-Datei im Browser auf 28-px-Geometrie,
Hover- und Fokusfarben kontrolliert. Der Bau meldete nur die bekannte
CommonJS-Warnung zu `pako`.

## 2026-09-25 – Juna – GA4-Datenstream für die Landingpage aktiviert

**Auftrag:** Die vorhandene zustimmungsgebundene Analytics-Einbindung mit der
neuen GA4-Mess-ID des Web-Datenstreams vervollständigen.

**Änderung:** Die Mess-ID `G-8ZMSVBRJPK` ist in der vorhandenen Einbindung
hinterlegt. Der Banner erscheint nun bei Besuchern ohne gespeicherte Entscheidung.
Die Tests prüfen Ablehnung ohne Google-Tag, Laden nach Zustimmung, Widerruf mit
Cookie-Löschung sowie gespeicherte und abgelaufene Entscheidungen. Die
angemeldete App wird weiterhin nicht gemessen.

**Prüfung:** 26 Landingpage-Tests, ESLint für die geänderten Skripte, Prettier,
`git diff --check` und der Angular-Produktionsbau bestanden. Der Bau meldete die
bekannte CommonJS-Warnung zu `pako`. Eine echte Übertragung an GA4 ist erst nach
Deployment und einer Einwilligung auf der öffentlichen Seite prüfbar.
Nach der Integration in den aktuellen Master-Stand wurde der ältere Node-Test
für die nun zwei lokalen Skripte angepasst und gezielt mit neun Tests geprüft.

## 2026-09-25 – Juna – Landingpage für Google-Suche und Einwilligung vorbereitet

**Auftrag:** Flipbase in der Google Search Console erfassen, die öffentliche
Landingpage indexierbar machen und Google Analytics nur nach Einwilligung nutzen.

**Änderung:** Die Startseite hat keine Indexsperre mehr und nennt ihre Canonical-URL.
`robots.txt` und Sitemap führen Suchmaschinen zur öffentlichen Startseite. Für
Analytics gibt es einen zweisprachigen Einwilligungsdialog mit gleichwertigem
Ablehnen und Zustimmen, widerrufbarer Entscheidung und gesperrtem Google-Tag bis
zur Zustimmung. Die Mess-ID fehlt noch; bis sie eingetragen ist, erscheint kein
Banner und es wird nichts an Google gesendet. Die Datenschutzerklärung beschreibt
die geplante Messung. Im Impressum und in der Datenschutzerklärung stehen nun die
vom Betreiber genannten Angaben statt der unzutreffenden „GbR i.G.“. Der Link zur
eingestellten EU-Streitbeilegungsplattform wurde entfernt. Die angemeldete App
bleibt aus der Suchmaschinenindexierung und wird nicht mit Analytics erfasst.

**Prüfung:** 25 Landingpage-Tests und neun Deployment-Metadaten-Tests bestanden.
ESLint für die geänderten Skripte, Prettier für die geänderten unterstützten
Dateien, `git diff --check` und der Angular-Produktionsbau bestanden. Der Bau
meldete die bekannte CommonJS-Warnung zu `pako`. Eine echte GA4-Messung kann
erst mit einer Mess-ID und nach Deployment geprüft werden.

## 2026-09-25 – Juna – Inserateingabe an gemeinsame Aktionen und Artikeldaten angepasst

**Auftrag:** Entfernen-Aktionen, Artikelfelder, Bildanordnung und Hauptaktion der
Inserateingabe an die übrige Verwaltungsoberfläche angleichen und als Richtlinie
für künftige Seiten festhalten.

**Änderung:** Kompakte Entfernungsaktionen verwenden Icon-Buttons mit zugänglicher
Beschriftung; eine Shared-UI-Regel verhindert neue reine Textbuttons dafür. Der
Seitenkopf enthält die Hauptaktion „Inserat vorbereiten“. Marke, Kategorie,
Modell, Größe, Farbe, Material und Zustand werden aus dem gewählten Artikel
übernommen, können je Inserat angepasst und gespeichert werden. Bestehende
Inserate ohne diese Angaben übernehmen weiterhin die Produktwerte. Inseratbilder
stehen in einem Raster und lassen sich auch per Halten und Ziehen auf Touch-Geräten
sortieren. Der Preisvorschlag stammt nur aus einem hinterlegten Verkaufspreis;
ohne diesen bleibt das Feld leer. Die Quelle wird angezeigt. Die UI-Richtlinie
hält diese Entscheidungen fest.

**Prüfung:** Gezielte Angular-Tests, ESLint, Typprüfung, Formatprüfung,
Shared-UI-Prüfung, Workflow-Tests, Suite-Audit und Produktionsbau erfolgreich.
Die neu erzeugte Migration wurde in einem isolierten lokalen Supabase-Projekt
angewendet; 56 Datenbank-Testdateien mit 2033 Tests bestanden.

## 2026-09-25 – Juna – Eigenbeleg, Entwurfslöschung und Artikelauswahl korrigiert

**Auftrag:** Den zeitweise gesperrten Speichern-Button beim Eigenbeleg, die
Artikelauswahl auf Tablets und die zeitweise blockierte Navigation sowie
Löschung eines neuen Einkaufsentwurfs korrigieren.

**Änderung:** Nach der Rückkehr aus der Artikelerstellung stellt das Formular
die Verkäuferpflicht passend zum gespeicherten Belegmodus wieder her. Die
Artikelliste im Auswahlfenster scrollt innerhalb einer begrenzten Höhe. Ein
neuer Datenbankaufruf löscht ausschließlich unverarbeitete Entwürfe mit ihren
Positionen und Nebenkosten in einer Transaktion und protokolliert den Vorgang.
Erfasster Bestand, Belege und Kommentare bleiben geschützt. Nach erfolgreichem
Speichern darf der Nutzer während des Nachladens navigieren; eine Textauswahl
außerhalb der Einkaufstabelle blockiert deren Zeilen nicht mehr. Die direkte
Tabellenlöschung ist für angemeldete Nutzer gesperrt.

**Prüfung:** Der Eigenbeleg-Regressionstest scheiterte vor der Korrektur und
bestand danach. 110 gezielte Datenbanktests zu Löschung, Eigenbeleg und
Paketbestand bestanden nach lokalem Neuaufbau. Der Rechte-Test deckte eine
zu weit gefasste Service-Rollenfreigabe der generierten Migration auf; sie
wurde eingeschränkt und erneut geprüft. Gezielte Frontendtests, ESLint,
TypeScript-Prüfungen und Angular-Produktionsbau bestanden. Die neue Höhenklasse
ist im generierten CSS enthalten. Die zeitweise blockierte Navigation wurde
nicht mit einer echten Nutzersitzung reproduziert.

## 2026-09-25 – Juna – Fotodialog, Suchergebnisse und Bildauswahl verbessert

**Auftrag:** Die KI-Produktsuche auf dem Tablet platzsparender und klarer darstellen: kleinere Fotos mit X zum Entfernen, weniger Hinweise, nur Kosten der aktuellen Suche, Quelle rechts am Treffer und kein Verschieben des Dialogs beim Scrollen. Auch große iPad-Fotos sollen beim Hinzufügen verkleinert und mit ihrer tatsächlichen Dateigröße angezeigt werden.

**Änderung:** Eigenen Branch `juna/ai-product-search-dialog` vom aktuellen `origin/master` angelegt. Die Fotoauswahl verwendet kompakte Kacheln ohne sichtbare Dateinamen und mit roter Entfernen-Aktion direkt auf dem Bild. Ausgewählte Fotos werden vor der Größenprüfung lokal verkleinert; die Dateigröße der verwendeten Fassung erscheint auf der Kachel. Die Grenzen von 5 MB je Foto und 15 MB insgesamt bleiben bestehen. Während der Verarbeitung ist die Suche gesperrt. Doppelte Modellangaben, generische Begründungen, Sitzungskosten und der EAN-Hinweis entfallen aus dem Dialog. Pro Ergebnis stehen die geschätzten Kosten dieser Suche; der Quellenlink zeigt rechts den Domainnamen. Die gemeinsame Dialoghülle begrenzt ihre Höhe auf den sichtbaren Bildschirm und lässt nur den Inhalt scrollen.

**Prüfung:** Gezielte Angular- und Bildverarbeitungstests, ESLint, Shared-UI-Prüfung und Angular-Bau erfolgreich. Ein Browsercheck bei 820 × 680 Pixeln bestätigte, dass die Dialogkarte beim Scrollen der inneren Ergebnisliste an derselben Position bleibt. Ein echtes WebKit-Browserbild wurde von 10,9 MB auf 1,6 MB verkleinert. Der Branch ist noch nicht veröffentlicht.

## 2026-09-25 – Juna – Artikelauswahl in Inseraten als durchsuchbare Kombobox

**Auftrag:** Die zusätzliche Suche oberhalb der Artikelauswahl entfernen und die Auswahl selbst
direkt durchsuchbar machen. Den Vorlagen-Button verständlich benennen.

**Änderung:** Die gemeinsame Auswahlkomponente unterstützt eine Texteingabe im Dropdown. In der
Inseraterstellung filtert sie Artikel und Produkte nach Titel, Marke und Kategorie. Beim Ändern
einer bestehenden Auswahl wird diese bis zur nächsten bewussten Auswahl aufgehoben. Die separate
Suchbox entfällt. Der Button heißt „Vorlage aus Artikeldaten übernehmen“; die bestehende
Erläuterung stellt klar, dass feste Formulierungen ohne KI verwendet werden.

**Prüfung:** 49 gezielte Angular-Tests für Auswahl und Editor sowie alle 74 Inserate-Tests
bestanden. ESLint, Formatprüfung, Shared-UI-Prüfung und Produktionsbau erfolgreich.

## 2026-09-25 – Juna – Inserate und Erweiterungsverbindung überarbeitet

**Auftrag:** Inserateliste an den Admin-Stil angleichen und den Ablauf für Artikelsuche,
Erweiterungsverbindung, Bilder und Kategorieauswahl verbessern.

**Änderung:** Die Liste hat nun den gemeinsamen Seitenkopf mit Symbol, ein Ansichtsmenü,
einen einheitlich großen Erstellen-Button und klar beschriftete Zeilenaktionen. Im Editor
lassen sich Artikel frei suchen. Die Kategorie erscheint mit ihrem letzten Pfadteil;
die Auswahl auf Kleinanzeigen wird ausdrücklich als manueller Schritt angezeigt.
Inserate speichern eine eigene Bildauswahl mit Titelbild und Reihenfolge. Bilder können
hinzugefügt, abgelegt, gezogen oder per Button sortiert werden. Die Erweiterungsprüfung
setzt ein vorbereitetes Inserat nach erfolgreicher Verbindung fort und wartet beim
Öffnen auf eine Rückmeldung der Erweiterung. Ein fehlgeschlagener Versuch wird gemeldet.

**Prüfung:** `npm run verify` vollständig bestanden, einschließlich Format, Lint,
Typen, Workflow-, Edge-, Node-, DOM- und Angular-Tests sowie Produktionsbau.
Die Migration wurde lokal transaktional angewendet; acht Datenbankprüfungen für
Bildauswahl, Rechte und Speicherung bestanden.
Die Produktivoberfläche und die echte Kleinanzeigen-Seite wurden nicht manuell
durchgeklickt; dieser Schritt bleibt vor Veröffentlichung erforderlich.

## 2026-09-25 – Juna – Mehrfoto-Produktsuche liefert auch visuelle Vorschläge

**Auftrag:** Untersuchen, warum drei Schuhfotos in der Artikelerstellung keinen Treffer liefern, obwohl dieselben Fotos im Chat erkannt werden.

**Änderung:** Eigenen Branch `juna/ai-product-search-results` vom aktuellen `origin/master` angelegt. Die bisherige Suche verwendet Luna mit knappem Ausgabe- und Zeitlimit; sie verwirft zudem Webkandidaten, deren Produktseite nicht in der engen Quellenliste steht, und bietet ohne lesbares Etikett keinen getrennten Bildvorschlag an. Für Fotofälle nutzt die Funktion nun Sol `low`, sucht zusätzlich nach Bildern, berücksichtigt belegte Bildtreffer und Quellenzitate und erlaubt mehr Suchschritte. Eine erkennbare Marke oder ein Modell kann auch ohne belegte Produktseite als deutlich gekennzeichneter Fotovorschlag übernommen werden. EAN-Suchen bleiben bei Luna; unbelegte Web-URLs und nicht belegte US-/UK-Schuhgrößen werden weiterhin verworfen. Die Oberfläche zeigt die Art des Vorschlags getrennt an. Anonyme Zähler in den Serverlogs machen künftig sichtbar, ob die KI Kandidaten lieferte, die Quellenprüfung sie aber ausschloss.

**Prüfung:** Deno-Tests für Bildquellen, Zitate, Kostenschätzung, Fotovorschlag und EU-Größe; gezielte Angular-Tests für Artikelseite und alten Dialog, ESLint und Angular-Bau erfolgreich. Ein begrenzter Aufruf mit einem künstlichen Testbild bestätigte am echten API-Zugang Sol mit Bild-Websuche und Quellenfeldern (HTTP 200, vollständig). Ein Livevergleich mit genau den drei Nutzerfotos ist noch offen, da sie hier nicht vorliegen. Die Änderung ist noch nicht ausgerollt.

## 2026-09-25 – Juna – Mehrfoto-Suche mit älterer Serverfunktion abgeglichen

**Auftrag:** Den Fehler „Die KI-Suche ist gerade nicht verfügbar“ nach einer Suche mit drei Fotos untersuchen und beheben.

**Änderung:** Einen eigenen Branch vom aktuellen `origin/master` angelegt. Der Web-Release verteilt laut Deployment-Dokumentation keine Edge Functions; die vorherige Serverfassung liest nur `imageDataUrl`, während die neue Oberfläche `imageDataUrls` sendet. Der Client überträgt das erste Foto im bisherigen Feld und weitere Fotos ohne doppelte Bilddaten im neuen Feld `additionalImageDataUrls`. Er kennzeichnet ein Ergebnis, das nur auf dem ersten Foto beruht. Die aktuelle Serverfunktion meldet die tatsächlich verarbeitete Fotoanzahl. Die Betriebsanleitung nennt den erforderlichen separaten Funktions-Rollout. Serverantworten zu abgelehnten Eingaben und zu großen Anfragen erhalten verständlichere Meldungen.

**Prüfung:** Den alten und neuen Anfragevertrag im Repository verglichen; der öffentlich erreichbare Funktionsendpunkt beantwortet die Voranfrage. Gezielte Client-, Dialog- und Edge-Tests sowie Angular-Bau, Formatierung und gezieltes Lint waren erfolgreich. Ein erfolgreicher Test mit drei echten Fotos ist erst nach dem separaten Rollout der Serverfunktion möglich.

## 2026-09-25 – Juna – KI-Artikelerstellung mit aktueller Artikelansicht abgeglichen

**Auftrag:** Den freigegebenen Branch als Pull Request veröffentlichen und nach erfolgreichen Pflichtprüfungen zusammenführen.

**Änderung:** Den Branch auf den aktuellen `origin/master` mit der neuen gemeinsamen Artikelansicht gesetzt. Die alte Inventar-Neuanlage behält deren Weiterleitung zur Katalogseite; der Foto-Dialog verwendet für das Entfernen eines Bildes den gemeinsamen Button-Baustein. Die Einkauf-Rückkehr und die Mehrfoto-Suche bleiben erhalten.

**Prüfung:** Betroffene Angular-, DOM- und Deno-Tests, Angular-Bau, Lint, Formatierung und Shared-UI-Prüfung nach dem Abgleich erneut ausgeführt. Der erste PR-Lauf zeigte einen veralteten Browser-Testhelfer, der noch den entfernten Produktdialog erwartete. Die betroffenen Browser-Tests wurden auf die vollständige Artikelseite mit Rückkehr zum Einkauf angepasst. Lokal ist der Browserlauf zurzeit durch nicht veröffentlichte Ports der geteilten Supabase-Container blockiert; der erneute PR-Lauf prüft den tatsächlichen Browserablauf.

## 2026-09-24 – Juna – Artikelerstellung und KI-Fotosuche aus dem Einkauf verbunden

**Auftrag:** Die verstreute Artikelerstellung vereinheitlichen, einen laufenden Einkauf beim Wechsel zur Artikelseite erhalten und die KI-Suche auf mehrere Produktfotos und verlässliche Feldwerte ausrichten.

**Änderung:** Die Artikelerstellung aus dem Einkauf öffnet jetzt die vollständige Katalogseite. Ein gesicherter Rückkehrkontext stellt Formular, Positionen und Kosten wieder her; nach dem Speichern wird der neue Artikel genau einmal als Einkaufsposition eingefügt. Auch der Einstieg aus dem Inventar führt zur Katalogseite. Die alte Produktanlage im Einkaufsdialog und ihre EAN-/KI-Schaltflächen entfallen aus diesem Ablauf. Die KI-Suche öffnet einen großen Dialog für bis zu fünf Fotos von Karton, Etikett und Artikel. Frontend und Server prüfen Dateianzahl und Größe. Die Serverantwort normalisiert durchgehende Großschreibung und Schuhgrößen auf eindeutige EU-Angaben; Kategorie-Vorschläge werden nur bei eindeutigem Treffer einer vorhandenen Kategorie zugeordnet. Die recherchierte Modellwahl und ein Messplan stehen unter `docs/superpowers/plans/2026-09-24-ai-product-entry.md`.

**Prüfung:** Gezielte Angular- und DOM-Tests, Deno-Tests der Suchfunktion, ESLint, Prettier, Angular-Bau und `git diff --check` erfolgreich. Ein Vergleich mit echten Produktfotos steht noch aus; die Produktionskonfiguration bleibt bis dahin bei Luna `low`.

## 2026-09-24 – Juna – Plan für einheitliche Artikelerstellung und KI-Fotosuche

**Auftrag:** Die Produktanlage aus dem Einkauf auf die vollständige Artikelseite führen, den laufenden Einkauf beim Zurückkehren erhalten und die KI-Suche mit mehreren Fotos, Kategorien, lesbaren Texten und EU-Größen neu planen.

**Änderung:** Eigenen Branch `juna/ai-product-flow` vom aktuellen `origin/master` in einem separaten Worktree angelegt. Bestehende Katalog-, Einkaufs- und KI-Abläufe untersucht und einen umsetzbaren Plan mit Rückkehrkontext, Fotodialog, Feldprüfung, Modellvergleich und Abnahme in `docs/superpowers/plans/2026-09-24-ai-product-entry.md` festgehalten. Auf Nachfrage den Modellvergleich um Luna-Denkstufen, unabhängige Bildtests und eine konkrete Empfehlung für Sol `low` als Foto-Suchkandidaten ergänzt. Noch kein Anwendungscode geändert.

**Prüfung:** Codepfade, vorhandene Angular-/Supabase-Tests, Admin-Designrichtlinie, aktuelle OpenAI-Dokumentation zu Bildeingaben, Websuche, strukturierten Ausgaben, Denkstufen und Preisen sowie Roboflows veröffentlichte Bildtests gelesen. Prettier-Prüfung der beiden Dokumente und `git diff --check` bestanden; Anwendungstests waren mangels Codeänderung nicht nötig.

## 2026-09-24 – Juna – Artikel und Bestand in einer Ansicht verwaltet

**Auftrag:** Die beiden Artikel-Unterpunkte zu einer Tabelle zusammenführen und
Bearbeiten, Archivieren sowie sicheres Löschen ergänzen. Löschen ist nur für
unbenutzte Artikel vorgesehen; beim Archivieren bleiben Bestand, Wert und
Belege erhalten.

**Ergebnis:** Die Sidebar führt jetzt zu „Artikel“. Filter zeigen aktive,
archivierte und bestandsbezogene Artikel in derselben Tabelle. Sie enthält
physische, verfügbare und reservierte Mengen sowie einen getrennten
Bestandswert. Bestehende Katalogartikel und ältere Einzelstücke behalten ihre
Identität und ihre jeweiligen Editoren. Archivierung und Wiederherstellung
laufen über geschützte Datenbankfunktionen; offene Reservierungen, Inserate und
Shopaufträge sperren die Archivierung. Archivierte Artikel werden aus neuen
Verkäufen, Einkäufen, Inseraten und dem Shopangebot ausgeschlossen. Löschen
prüft serverseitig alle bekannten Einkaufs-, Bestands-, Verkaufs- und
Inseratsbezüge. Private Bilder werden erst nach erfolgreichem Löschen über
eine wiederholbare Warteschlange bereinigt. Alte Bestandslinks führen zum
Bestandsfilter, während Einzelstück-Detailseiten erreichbar bleiben.
Verknüpfte Einzelstücke beachten den Archivstatus ihres Stammartikels; ein
fehlgeschlagener Einzelstück-Upload räumt die bereits hochgeladene Datei auf.
Der direkte Verkauf bleibt in der gemeinsamen Artikeltabelle erreichbar und
führt nach Abschluss zur Bestandsansicht zurück.

**Prüfung:** Lokale Datenbank aus den beiden neuen Migrationen frisch
aufgebaut; 198 gezielte SQL-Tests, 6 Edge-Tests, die betroffenen Angular- und
Node-Tests, Typprüfung, Angular-Bau, gezieltes ESLint und die Shared-UI-Prüfung
waren erfolgreich. Die vollständigen PR-Pflichtprüfungen stehen noch aus.

## 2026-09-24 – Juna – Alten PR geschlossen und Artikelansicht eingeordnet

**Auftrag:** Den überholten PR `#58` schließen und prüfen, ob „Alle Artikel“ und
„Bestand“ zu einer gemeinsamen Artikelseite werden sollten. Vergleich mit
Shopify und WooCommerce sowie Einordnung der deutschen Aufzeichnungspflichten.

**Ergebnis:** PR `#58` wurde ohne Änderung seines Zweigs geschlossen. Der
Artikelstamm zeigt bereits eine abgeleitete verfügbare Menge und auch
eigenständige ältere Inventarartikel. Die Bestandsseite ergänzt physische,
verfügbare und reservierte Mengen sowie Herkunft, Kosten und Aktionen. Eine
gemeinsame Tabelle unter „Artikel“ erscheint sinnvoll; Bestandsansichten
können als Filter und Spalten weiterbestehen. Ein Produkt ohne Wareneingang
bleibt ohne Bestand. Alte Einzelstücke werden nicht allein wegen gleichem
Titel oder Barcode zusammengelegt. Buchungen, Belege, Kosten und
Bestandsbewegungen bleiben getrennt nachvollziehbar. Die frühere
Zwei-Unterpunkte-Regel in der Gestaltungsgrundlage wird bei der Umsetzung an
die bestätigte Ein-Seiten-Lösung angepasst. Es wurde noch keine UI- oder
Datenmodelländerung vorgenommen.

**Folgegespräch:** Der Nutzer bestätigte eine Zeile je Artikel, auch ohne
Bestand, und getrennte Artikel für individuell unterschiedliche gebrauchte
Stücke. In der gemeinsamen Ansicht sollen Bearbeiten, Archivieren und Löschen
erkennbar werden. Löschen wurde auf noch unbenutzte Artikel ohne Einkaufs-,
Bestands-, Verkaufs- oder Inseratsbezug begrenzt. Der vorhandene Katalogeditor
speichert bereits Änderungen, besitzt aber keinen deutlichen Bearbeiten-Einstieg
in der Liste. Katalogartikel haben derzeit keinen Archivstatus; die bisherige
Archivaktion für alte Einzelstücke gilt nur für eindeutig verkaufte Artikel.
Die Archivierung bei vorhandenem Bestand wurde bestätigt; Menge und Wert
bleiben dabei erhalten. Der Nutzer bestätigte den Entwurf für eine gemeinsame
Artikeltabelle mit gesperrter Archivierung bei offenen Reservierungen und
Inseraten sowie ohne neue Verkäufe oder Inserate aus dem Archiv.

**Entwurf:** Die abgestimmte Lösung wurde in
`docs/superpowers/specs/2026-09-24-unified-articles-management-design.md`
festgehalten. Sie beschreibt Navigation, Tabellenfelder und Filter, sichtbare
Bearbeitung, reversible Archivierung mit erhaltenem Bestand und Wert,
serverseitig gesichertes Löschen ausschließlich unbenutzter Artikel sowie die
Bereinigung privater Bilddateien. Vor der Umsetzung wird die schriftliche
Spezifikation nochmals zur Durchsicht vorgelegt. Nach Freigabe dieser
Spezifikation entstand der schrittweise Umsetzungsplan unter
`docs/superpowers/plans/2026-09-24-unified-articles-management.md`.

**Prüfung:** PR-Status nach dem Schließen bestätigt, Katalog-, Bestands- und
Navigationscode sowie frühere Produktplanung gelesen. Aktuelle offizielle
Shopify- und WooCommerce-Dokumentation sowie §§ 238, 240, 257 HGB und § 146 AO
geprüft. Spezifikation und Umsetzungsplan auf Platzhalter, Widersprüche,
Geltungsbereich und Testabdeckung sowie die Git-Unterschiede auf
Leerraumfehler geprüft. Keine Anwendungstests, da nur Analyse, PR-Schließung
und Dokumentation erfolgten.

## 2026-09-24 – Juna – Projektstand und offene Punkte gesichtet

**Auftrag:** Nach den heutigen Änderungen den aktuellen Projektstand abrufen und
die Grundlage für ein Gespräch über offene Punkte schaffen.

**Ergebnis:** `master` war beim Abruf mit `origin/master` identisch. Der letzte
Merge (`#172`) steht auf `99137dfb` und ist als `v0.204.1` veröffentlicht. Die
Produktionsbereitstellung und der öffentliche Check im zugehörigen CI-Lauf
waren erfolgreich. Die heutigen Änderungen an Barcode- und KI-Fotosuche,
Artikelerstellung, Einkauf und Statusfarben wurden anhand der Git-Historie und
dieses Protokolls eingeordnet. Als mögliche Gesprächsthemen bleiben die
Live-Prüfung des Authelia-E-Mail-Versands, die praktische Prüfung der neuen
Suchwege und die Einordnung des älteren offenen PR `#58`. Die nähere Prüfung
von `#58` zeigte: Der heutige Artikelwähler hat bereits klickbare Zeilen und
eine sichtbare Auswahlmarkierung. Die vergrößerte Vorschau im gemeinsamen
Artikelbild-Baustein fehlt weiterhin. Der PR ist mit `master` in Konflikt;
sein eigener Vorschau-Button würde in der heutigen Button-Zeile ein
verschachteltes Bedienelement erzeugen. Eine Übernahme braucht daher ein neues
UI-Konzept und aktuelle Prüfungen.

**Prüfung:** `git fetch`, `git pull --ff-only`, `git status`, Git-Historie,
GitHub-Release und CI-Lauf geprüft. PR-Inhalt, heutigen UI-Code und einen
virtuellen Git-Merge verglichen. Keine Anwendungstests ausgeführt, da kein
Anwendungscode geändert wurde.

## 2026-09-24 – Juna – KI-Fotosuche bei Artikelerstellung ergänzt

**Auftrag:** Auf „Artikelübersicht → Artikel erstellen“ war nach dem Release nur
„EAN scannen“ sichtbar; die neue KI-Fotosuche war dort nicht erreichbar.

**Änderung:** Die Artikelübersicht öffnet `/catalog/new` mit einer eigenen
Artikelseite. Dort ist für Plattformbetreiber nun „KI-Produktsuche mit Foto“
direkt neben „EAN scannen“ verfügbar. Ein Etikettfoto kann ohne EAN gesucht
werden. Belegte Webtreffer oder getrennt gekennzeichnete Etikettangaben können
in das bearbeitbare Artikelformular übernommen werden. Eine unsicher gelesene
Herstellerartikelnummer wird nicht als SKU gespeichert.

**Prüfung:** 26 gezielte Angular-Tests, beide TypeScript-Prüfungen und der
Angular-Produktionsbau bestanden. Die Tests decken Foto ohne EAN, die
Übernahme eines belegten Treffers bis zur Artikelspeicherung und den getrennten
Etikettvorschlag ab. ESLint, Prettier, Testsuite-Audit und die Prüfung der
gemeinsamen Admin-Bausteine bestanden ebenfalls.

## 2026-09-24 – Juna – Foto- und Direktsuche der Barcode-KI verbessert

**Auftrag:** Eine KI-Suche mit Etikettfoto zeigte trotz lesbarem JAKO-Aufkleber
keinen Produktvorschlag. Im Web fehlte außerdem ein direkter Einstieg zur
Fotosuche ohne EAN.

**Änderung:** Nach der Fotoauswahl ersetzt ein Hinweis die veraltete Meldung
des vorherigen Suchlaufs. Die KI sucht mit Modell und Herstellerartikelnummer
vom Etikett. Wenn keine Produktseite sicher belegt werden kann, bietet die
Maske die aus dem Foto gelesenen Angaben getrennt als prüfbaren Vorschlag an.
Die Herstellerartikelnummer wird angezeigt, aber nicht als eigene SKU
übernommen. Unvollständige OpenAI-Antworten werden als Fehler gemeldet statt
als scheinbar erfolglose Produktsuche. Ein sichtbarer Betreiber-Button öffnet
die KI-Produktsuche direkt bei der Artikelerstellung. Fotoauswahl und Suche
funktionieren auch ohne EAN; die Serverfunktion weist Aufrufe ohne EAN und Foto
ab.

**Prüfung:** Echte, begrenzte OpenAI-Tests mit dem JAKO-Foto lieferten mit und
ohne EAN belegte Webtreffer und gesonderte Etikettangaben. 16 gezielte
DOM-Tests, vier Angular-Tests und sieben Edge-Tests bestanden. Die aktuelle
Auswertungslogik übernahm den Fototreffer ohne EAN. Beide TypeScript-Prüfungen,
Testsuite-Audit, ESLint, Prettier und Angular-Produktionsbau bestanden; der Bau
meldete die bekannte CommonJS-Warnung zu `pako`.

## 2026-09-24 – Juna – Artikelauswahl im Einkauf korrigiert

**Auftrag:** Die irreführende Hover-Beschriftung im Artikeldialog entfernen,
„Produkt erstellen“ als erkennbaren Button darstellen und Kategorien kompakt
benennen.

**Änderung:** Der Dialogtitel wird als Komponenten-Eingang gebunden, sodass er
kein Browser-Tooltip auf dem Dialogelement mehr ist. Die Erstellen-Aktion steht
als sekundärer Button mit Plus-Symbol im Footer. Im Kategoriefilter erscheint
der letzte Teil des Kategoriepfads; gefiltert wird weiterhin nach dem ganzen
Pfad.

**Prüfung:** Die drei gezielten Angular-Tests, Prettier und ESLint für die
geänderten Dateien, beide TypeScript-Prüfungen, `git diff --check` und der
Angular-Produktionsbau bestanden. Der Bau meldete die bekannte
CommonJS-Warnung zu `pako`.

## 2026-09-24 – Juna – Barcode-KI für den Server vorbereitet

**Auftrag:** Die vorbereitete Barcode-KI-Suche veröffentlichen und den
Supabase-Studio-Projektnamen auf Flipbase setzen.

**Änderung:** Der Barcode-KI-Zweig wurde auf den aktuellen Masterstand
übernommen. Eine eigene Docker-Compose-Ergänzung reicht `OPENAI_API_KEY` nur an
Edge Functions weiter; der Schlüssel bleibt außerhalb des Repositorys und des
Browser-Baus. Der Anzeigename des produktiven Supabase Studios wurde in der
Serverumgebung auf Flipbase gesetzt.

**Prüfung:** 14 gezielte Frontend-Tests, vier Edge-Handler-Tests, das
Testsuite-Audit, ESLint, beide TypeScript-Prüfungen, Prettier und
Angular-Produktionsbau bestanden. Der Studio-Container ist nach
der Umbenennung gesund; der gültige Projektschlüssel wurde per Modellabfrage
geprüft. Zwei begrenzte Websuchen mit der JAKO-EAN kosteten geschätzt jeweils
etwa 0,011 US-Dollar: ohne Foto kein belegter Vorschlag, mit Etikettfoto ein
als wahrscheinlich markierter Treffer. Die Funktionsbereitstellung folgt nach
dem PR-Merge.

## 2026-09-24 – Juna – Authelia-Bestätigungscodes per E-Mail vorbereitet

**Auftrag:** Die Registrierung einer Authenticator-App für das Supabase Studio
so ändern, dass der Bestätigungscode tatsächlich per E-Mail ankommt.

**Änderung:** Authelia verwendet statt der Serverdatei den vorhandenen
Mailbox.org-SMTP-Zugang. Docker Compose liest die bestehenden Mailwerte aus der
Serverumgebung und stellt das Passwort Authelia als Secret-Datei bereit. Die
Serveranleitung beschreibt das Ausrollen und den Test des E-Mail-Versands.

**Prüfung:** Docker Compose 2.40.3 löste die Zusatzdatei mit synthetischen
SMTP-Werten fehlerfrei auf; Prettier prüfte die geänderten YAML- und
Markdown-Dateien. Ein echter E-Mail-Versand und der Serverneustart stehen noch
aus, weil die Serverkonfiguration nicht automatisch ausgerollt wird.

## 2026-09-24 – Juna – Artikelauswahl im Einkauf filtern und Erstellen platzieren

**Auftrag:** Den Button zum Erstellen eines Artikels im Einkaufsdialog dauerhaft
sichtbar machen und kompakte Filter für vorhandene Kategorien und Marken ergänzen.

**Änderung:** „Produkt erstellen“ steht links im Dialog-Footer. Neben der Suche
filtern Dropdowns nach den Kategorien und Marken, die im geladenen Artikelstamm
vorkommen. Die Filter lassen sich gemeinsam zurücksetzen.

**Prüfung:** Drei fokussierte Angular-Tests sowie ESLint, Prettier,
`git diff --check` und der Angular-Produktionsbau mit Node 24.19 bestanden.
Die vollständige Vitest-Suite lief nicht. Der Bau zeigt weiterhin die bekannte
CommonJS-Warnung zu `pako`.

## 2026-09-24 – Juna – Statusbadges in ruhiger Farbpalette

**Auftrag:** Die freigegebene Badge-Vorschau übernehmen: gedämpfte Statusflächen
mit kontrastreicher Schrift, Entwurf in kühlem Info-Blau, Bestellt in Orange und
Angekommen in Gelb.

**Änderung:** Die zentralen Badge-Farbpaare sind für helles und dunkles Design
abgestimmt. Die Einkaufsstatus verwenden die neue Zuordnung. Admin-Rot,
Marken-Gelb und die vollflächig gelbe aktive Navigation bleiben eigenständig.
Der Browser-Smoke-Test prüft die Statusfarben über ihre Badge-Klassen statt
veralteter RGB-Werte.

**Prüfung:** Die geänderten Badge- und Einkaufsstatus-Tests scheiterten vor der
Umsetzung und bestanden danach. Die vollständige Suite bestand nach Integration
des aktuellen Master-Stands mit 299 Dateien und 2.789 Anwendungstests.
Prettier für die geänderten Dateien, gezieltes ESLint, beide TypeScript-Prüfungen
und der Angular-Produktionsbau bestanden.
Für den Bau wurde wegen der laufwerksübergreifenden Abhängigkeitspfade eine
temporäre Kopie des isolierten Worktrees auf `D:` genutzt. Das erzeugte CSS
lieferte in beiden Themes die erwarteten Badge-Farben; alle Badge-Farbpaare
erreichten mindestens 5,82:1 Textkontrast. Der Bau meldete nur die bekannte
`pako`-CommonJS-Warnung. Lokale Browser-End-to-End-Tests gegen die Anwendung
wurden nicht ausgeführt. Die angepasste Browser-Testdatei bestand Prettier und
ESLint; Playwright erkannte alle elf PR-Smoke-Tests.

## 2026-09-24 – Juna – KI-Produktsuche für Barcode-Fälle ohne Treffer vorbereitet

**Auftrag:** Unbekannte EANs optional mit einem Etikettfoto im Web suchen,
Produktvarianten zur geprüften Übernahme anbieten und die Kosten für einen
Betreiber-Testlauf sichtbar machen.

**Änderung:** Die Produkterstellung bietet Betreibern nach erfolgloser EAN-Suche
eine KI-Websuche mit optionalem Etikettfoto. Vorschläge zeigen Variante und
anklickbare Quelle; die EAN bleibt beim Übernehmen erhalten. Eine neue Supabase
Edge Function prüft die Betreiberrolle serverseitig, hält den OpenAI-Schlüssel
aus dem Browser heraus und begrenzt die Websuche auf zwei Aufrufe. Angezeigter
Tokenverbrauch, geschätzte Kosten und Sitzungsdurchschnitt helfen bei der
Pilotkalkulation. Ohne konfigurierten Schlüssel bleibt die Funktion gesperrt.

**Prüfung:** Gezielte Angular- und Servicetests (14) sowie vier gebündelt unter
Node ausgeführte Edge-Handler-Tests bestanden. ESLint, TypeScript-Prüfung,
Prettier und Angular-Produktionsbau bestanden. Ein nativer Deno-Lauf und ein
echter kostenpflichtiger OpenAI-Aufruf waren lokal nicht möglich: Deno ist
nicht installiert, die Supabase-CLI stürzt bereits bei `--help` ab und ein
API-Schlüssel wurde nicht hinterlegt.

## 2026-09-24 – Juna – Aktive Einkaufsfilter kenntlich gemacht

**Auftrag:** Den redundanten, wegklickbaren Verkäuferchip unter der
Einkaufsleiste durch einen allgemeinen Hinweis auf aktive Filter ersetzen.

**Änderung:** Ein mittig über der Tabelle platzierter, nicht klickbarer
orangefarbener Badge „Filter aktiv“ erscheint bei Such-, Status- oder
Verkäuferfilterung. Änderungen an Sortierung und Spalten allein lösen ihn
nicht aus. Die vorhandene Rücksetzung bleibt unverändert.

**Prüfung:** Die angepassten und ergänzten Komponententests scheiterten vor
der Umsetzung und bestanden danach. Die vollständige Vitest-Suite bestand
mit 297 Dateien und 2.779 Tests; Prettier, ESLint, beide TypeScript-Prüfungen
und der Angular-Produktionsbau bestanden. Für den Bau wurde wegen des
laufwerksübergreifenden Abhängigkeitspfads ein temporärer Worktree auf `D:`
verwendet und anschließend entfernt. Es blieb nur die bekannte
`pako`-CommonJS-Warnung. Lokale Browser-End-to-End-Tests wurden in dieser
Sitzung nicht ausgeführt. Beim ersten PR-Browserlauf fiel ein veralteter
Wareneingangs-Ablauf in zwei Browserfällen auf; sie wurden an die vorhandene
Oberfläche mit „Wareneingang erfassen“ und „Eingang bestätigen“ angepasst.

## 2026-09-24 – Juna – Suchfeld und Verkäuferfilter bei Einkäufen bereinigt

**Auftrag:** Das zusätzliche blaue Browser-X im Suchfeld entfernen, den
Verkäuferfilter verständlicher benennen und technische Verkäufer-IDs aus der
Auswahl sowie dem aktiven Filter entfernen.

**Änderung:** Das gemeinsame Suchfeld behält seine eigene Zurücksetzen-Aktion
und Suchfeld-Semantik, ohne den nativen Browser-Löschknopf zu erzeugen. Der
Einkaufsfilter heißt „Nach Verkäufer filtern“ und zeigt nur Verkäufernamen;
die ID bleibt für die eindeutige interne Filterung erhalten.

**Prüfung:** Beide neuen Einkaufslisten-Tests scheiterten vor der Änderung und
bestanden danach. Die vollständige Vitest-Suite bestand mit 297 Dateien und
2.778 Tests. Prettier, ESLint, beide TypeScript-Prüfungen und der
Angular-Produktionsbau bestanden. Für den Bau war wegen laufwerksübergreifender
Pfade der wiederverwendeten Abhängigkeiten ein temporärer Worktree auf demselben
Laufwerk nötig; er wurde danach entfernt. Es blieb nur die bekannte
`pako`-CommonJS-Warnung. Browser-End-to-End-Tests liefen lokal nicht, da die
Supabase-Testinstanz nicht verfügbar ist.

## 2026-09-24 – Juna – Barcode-Erfassung mit Artikelabgleich und Produktvorschlägen

**Auftrag:** Barcode-Scans beim Einkauf und beim Erstellen eines Artikels mit
einem nutzbaren Such- und Übernahmeablauf verbinden; den Scanrahmen auf das
gesamte Kamerabild ausdehnen.

**Änderung:** Der Scan gleicht EAN/GTIN zuerst mit vorhandenen Artikeln ab. Beim
Einkauf werden eindeutige Treffer unmittelbar als Position übernommen. Fehlt
der Stammartikel, können Daten eines vorhandenen Inventarstücks für dessen
Anlage übernommen werden. Fehlt auch ein Inventartreffer, fragt Flipbase über
die universelle Open-Facts-API Produktdaten ab und zeigt sie mit Quelle zur
Prüfung an. Ein Treffer kann in
die bearbeitbare Artikelerstellung übernommen werden; ohne Online-Treffer bleibt
die manuelle Anlage möglich. Die direkte Artikelerstellung besitzt Scan und
EAN-Suche. Manuelle Eingaben funktionieren auch bei fehlendem Kamerazugriff;
der grüne Scanrahmen umfasst das gesamte Kamerabild. Die CSP erlaubt die
Weiterleitung zu den vier Open-Facts-Datenbanken.

**Prüfung:** Gezielte Barcode-, Einkaufs-, Artikel- und Scanner-Tests bestanden.
ESLint der geänderten TypeScript-Dateien, Typprüfung, Angular-Produktionsbau
und `git diff --check` bestanden. Echte Kamera und Online-Datenquelle wurden
in dieser Sitzung nicht live geprüft.

## 2026-09-24 – Juna – Dashboard-, Einkaufs- und Statusfarben vereinheitlicht

**Auftrag:** Die dunkle Kontur der gelben Dashboard-Säule entfernen,
Gesamtausgaben oben rot darstellen, Einkaufsdetails auch nach Abschluss rechts
belassen und Statusbadges sowie aktive Navigation mit klaren Farben zeigen.

**Änderung:** Alle Diagrammsäulen haben keine Kontur mehr. Bekannte positive
Gesamtausgaben nutzen die kontrastgerechte rote Finanztextfarbe; unbekannte und
Nullwerte bleiben neutral. In der schreibgeschützten Einkaufsansicht stehen
Kaufdatum, Referenznummer und Beschreibung rechts, Verkäufer und Bezugsquelle
links; doppelte Angaben entfallen. Statusbadges verwenden zentral volle
Gelb-, Grün-, Orange-, Rot- und Grautöne mit WCAG-AA-kontrastreicher Schrift.
Aktive Navigation ist in beiden Themes vollflächig gelb mit dunkler Schrift.

**Prüfung:** Die gezielten Komponenten-Tests scheiterten vor den Änderungen und
bestanden danach; die vollständige Vitest-Suite bestand auf dem letzten
Code-Stand (297 Dateien, 2.776 Tests). ESLint, Typprüfung, Produktionsbau,
Workflow-Tests und die Auswahl der elf PR-Browserfälle bestanden. Das gebaute
CSS lieferte in beiden Themes gelbe Navigation mit dunkler Schrift und den
kräftigen grünen Status-Badge. Der Bau meldete nur die bestehende
`pako`-CommonJS-Warnung. Der lokale Browserlauf blieb vor dem Test an der nicht
laufenden Supabase-Testinstanz hängen; die zugehörigen Browserfälle sind deshalb
als Pflichtprüfungen für den PR eingetragen.

## 2026-09-23 – Juna – Gewinn-Kachel farblich ans Verkaufsjournal angeglichen

**Auftrag:** Den grünen Gewinnwert oben im Dashboard an die Gewinne im
Diagramm und in der Tabelle angleichen.

**Änderung:** Die Dashboard-Gewinnkachel verwendete bisher die weiche allgemeine
Erfolgsfarbe. Positive und negative Werte nutzen jetzt dieselben
kontrastgerechten Finanztextfarben wie das Verkaufsjournal; die Diagrammsäule
behält ihre kräftige, für Flächen geeignete Grünfarbe. Vergleichshinweise in
der Kachel bleiben bei ihren bisherigen Statusfarben.

**Prüfung:** Zwei gezielte Erwartungen scheiterten vor der Änderung an den
alten Farben und bestanden danach. Der unveränderte Analytics-Test bestand
isoliert (11/11). `npm test` erreichte bei hoher Parallelität in dessen
`beforeAll` einen 10-Sekunden-Timeout; die übrigen 119 Angular-Dateien
bestanden. Die vollständige Vitest-Suite bestand anschließend mit vier Workern
(297 Dateien, 2.772 Tests). Prettier, ESLint, Typprüfung und Angular-Produktionsbau
bestanden; der Bau meldete nur die bestehende `pako`-CommonJS-Warnung.

## 2026-09-23 – Juna – Auslieferungsstatus der Dashboard-Säulen geprüft

**Auftrag:** Unveränderte Säulenfarben in der angezeigten Dashboard-Ansicht einordnen.

**Ergebnis:** Die neue Gelb-Rot-Grün-Palette ist im lokalen Commit `713dbb84`
auf `juna/dashboard-chart-colors` enthalten. `master` steht noch auf
`64233f0b`; für den Farbzweig existiert auf GitHub kein PR. Eine Änderung auf
der veröffentlichten Seite ist damit noch nicht zu erwarten. Ob die gemeldete
Ansicht die öffentliche Seite oder eine lokale Vorschau ist, bleibt offen.

**Prüfung:** Lokalen Branch, Chart-Konfiguration, Commit-Abstand zu `master`
und GitHub-PR-Liste lesend geprüft; keine Anwendungsdateien geändert.

## 2026-09-23 – Juna – Dashboard-Diagramm mit Marken- und Finanzfarben

**Auftrag:** Die Betragszahlen an den Säulen entfernen, Umsatz in Flipbase-Gelb,
Ausgaben in kräftigem Rot und Gewinn in kräftigem Grün darstellen. Admin-Badge
und hervorgehobene Finanzwerte in Tabellen an diese Farben angleichen.

**Änderung:** Die drei Säulenreihen verwenden Gelb `#fcc601`, Rot `#dc2626` und
Grün `#16a34a` in beiden Themes. Apex-Datenbeschriftungen sind deaktiviert;
Detailwerte bleiben über die vorhandene Tastatur-/Touchansicht und Datentabelle
zugänglich. Im hellen Theme macht eine schmale dunkle Kontur die gelbe Säule auf
weißem Hintergrund besser erkennbar. Das Admin-Badge nutzt dasselbe Rot wie die
Ausgaben-Säule. Finanzwerte in Dashboard-, Verkaufs-, Buchhaltungs- und
Analysetabellen nutzen kontrastgerechte Rot- und Grüntöne; Nullwerte, unbekannte
Ergebnisse und normale Kosten bleiben neutral.

**Prüfung:** Chart- und Tabellen-Erwartungen schlugen vor den jeweiligen
Änderungen gezielt fehl. Gezielte Tests für Farben, Vorzeichen und neutrale
Werte bestanden anschließend (56/56). Die Gesamtsuite bestand mit 297 Dateien
und 2.771 Tests. Prettier, ESLint, Typprüfung und Angular-Produktionsbau mit
Node 24 bestanden. Der Bau meldete nur die bestehende `pako`-CommonJS-Warnung.

## 2026-09-23 – Juna – Dashboard ohne Cashflow und mit Gewinn im Diagramm

**Auftrag:** Cashflow aus dem Dashboard entfernen, Gewinn in das Diagramm aufnehmen,
die Kennzahlen kompakter anordnen und die Darstellung von Filtern und Säulen prüfen.

**Änderung:** Cashflow entfällt aus Kacheln, Diagrammlegende, Diagrammtext,
zugänglicher Datentabelle und dem ungenutzten Feld im Berichtsmodell. Der
verkaufsbezogene Gewinn nutzt stattdessen die
dritte Säulenreihe. Sechs Kacheln ordnen sich bei ausreichender Breite in einer
Zeile an; die überflüssige „Übersicht“-Zeile ist entfernt und Zeitraumwahl und
Plattformauswahl haben dieselbe Desktophöhe. Die Diagrammfarben sind ruhiger;
Nicht-Null-Werte erscheinen direkt an den Säulen, während echte Nullen und
unbekannte Werte fachlich unverändert bleiben. Die gemeldeten Nullwerte konnten
ohne befüllte Browseransicht nicht vollständig nachgestellt werden.

**Prüfung:** Drei Node- und sechs Angular-Erwartungen schlugen vor der Änderung
gezielt fehl. Danach bestanden 34 fokussierte Node- und 20 fokussierte
Angular-Tests. Lint, Typprüfung und der Produktionsbau mit Node 24 bestanden.
Die Gesamtsuite bestand mit 1.458 Node- und 245 DOM-Tests; vier fachfremde
Angular-AXE-Tests liefen unter unbeschränkter Parallelität in das
5-Sekunden-Timeout. Dieselben vier Tests bestanden gezielt (34/34), danach die
gesamte Angular-Suite mit vier Workern (1.053/1.053). Browser-Tests konnten
ohne lokale Supabase nicht laufen; ihre CLI stürzte bereits bei `status` ab.

## 2026-09-23 – Juna – Dashboard-Ausgaben und Diagrammbegriffe getrennt

**Auftrag:** Einkäufe als alle im Zeitraum gekauften Waren zeigen, Betriebsausgaben
für Fix- und Materialkosten getrennt halten und zusätzlich die Gesamtausgaben
einschließlich Gebühren und Versand sichtbar machen. Die Diagrammbegriffe und
den störenden Cashflow-Hinweis korrigieren.

**Änderung:** Sieben Kennzahlen zeigen Umsatz, Einkäufe, Betriebsausgaben,
Ausgaben gesamt, verkaufsbezogenen Gewinn, Marge und Cashflow. Das
Säulendiagramm nutzt dieselben Werte für Umsatz, Ausgaben gesamt und Cashflow;
seine Tages- und Monatswerte berücksichtigen Einkäufe nach Kaufdatum,
Verkaufsgebühren und Versand sowie bezahlte Betriebsausgaben nach Zahlungsdatum.
Bei Plattformfiltern bleiben nicht zurechenbare Ausgaben und Cashflow unbekannt.
Die lange Erläuterung unter der Cashflow-Kachel entfällt.

**Prüfung:** Die neuen Berichts-, Karten- und Diagrammtests schlugen vor der
Umsetzung gezielt fehl. Danach bestanden 34 fokussierte Node- und 20 fokussierte
Angular-Tests sowie die vollständige Anwendungssuite mit 1.458 Node-, 245 DOM-
und 1.053 Angular-Tests. ESLint, Typprüfung und Produktionsbau bestanden; der
Bau meldete nur den bekannten `pako`-Hinweis aus `pdf-lib`. Die Browsertests
erfordern eine lokale Supabase und wurden hier nicht ausgeführt.

## 2026-09-23 – Juna – Dashboard-Kennzahlen und Säulendiagramm vereinfacht

**Auftrag:** Das bisherige Liniendiagramm durch ein ruhiges Apex-Säulendiagramm
ersetzen und die Ausgaben im Dashboard klarer darstellen. Die separate
Ausgabenkarte soll entfallen, weil Gebühren, Versand und bezahlte
Betriebsausgaben bereits in den Cashflow einfließen; Einkäufe sollen stattdessen
als eigene Kennzahl erscheinen.

**Änderung:** Der gemeinsame Verkaufsbericht zeigt die vier unveränderten
Kennzahlen nun als gruppierte, gerundete Säulen mit quadratischen
Legendenmarkern. Die bestehende Tastatursteuerung, Fehlerdarstellung,
Datentabelle und Reihenfilterung bleiben erhalten. Im Kennzahlenbereich ersetzt
die neue Kachel „Einkäufe“ die bisherige Ausgabenkarte; der Cashflow erklärt
knapp, dass Einkäufe, Gebühren, Versand und bezahlte Betriebsausgaben enthalten
sind. Bei einem einzelnen Plattformfilter bleiben Cashflow und Einkäufe wie
bisher unbekannt, weil diese Ausgaben nicht verlässlich einer Plattform
zugeordnet sind.

**Prüfung:** Die neuen Erwartungen schlugen vor der Umsetzung gezielt für das
Linienchart und die fehlende fünfte Kachel fehl. Danach bestanden 35 fokussierte
Chart- und Dashboardtests sowie die vollständige Anwendungssuite mit 1.458
Node-, 245 DOM- und 1.053 Angular-Tests. ESLint, Typprüfung und Produktionsbau
bestanden; der Bau meldete nur den bekannten `pako`-Hinweis aus `pdf-lib`. Die
zwei Dashboard-Browsertests konnten nicht starten, weil die dafür erforderliche
lokale Supabase unter `127.0.0.1:54351` nicht lief.

## 2026-09-23 – Juna – Wieder geöffnete Einkäufe und Chronik bereinigt

**Auftrag:** Nach gebuchtem Wareneingang den redundanten Hinweis unter der
gesperrten Menge entfernen und die Uhrzeiten aller Systemereignisse in der
Einkaufschronik an derselben rechten Kante ausrichten. Außerdem die unerwartet
erscheinende Eigenbeleg-PDF nach dem Abschluss untersuchen. Beim erneuten Öffnen
einer Erfassung sollen der Warenwert und die vorhandenen Positionen vollständig
erhalten bleiben; nicht nutzbare Artikel- und Wareneingangsaktionen sollen
verschwinden.

**Änderung:** Bereits eingegangene Mengen bleiben als deaktivierte Felder
geschützt, werden aber nicht mehr durch den Text „Menge nur über eine Korrektur
ändern“ ergänzt. Aufklappbare und einfache Chronikereignisse verwenden nun
dieselbe vollbreite Zweispaltenanordnung; ihre Uhrzeiten stehen dadurch gemeinsam
am rechten Rand. Nach dem Wiederöffnen wechselt die Detailseite direkt in die
Erfassungsmaske und bildet den Warenwert wieder aus sämtlichen gespeicherten
Positionssummen, einschließlich bereits erfasster und daher gesperrter Artikel.
Vollständig erfasste Positionen bieten keinen leeren Wareneingang mehr an; der
zusätzliche Link „Artikel bearbeiten“ wurde aus der reinen Ansicht entfernt. Die
Eigenbeleg-Erzeugung wurde nicht geändert: Sie läuft nur für Einkäufe, die
ausdrücklich mit dem Modus `self` gespeichert wurden, und nicht allein durch den
Abschluss oder einen vorhandenen Upload.

**Prüfung:** Sechs neue Regressionstests schlugen vor den Änderungen an den
gemeldeten Stellen fehl. Danach bestanden 110 fokussierte Tests der betroffenen
Einkaufs- und Chronikkomponenten. Formatprüfung, ESLint, Typprüfung und 84
Workflow-Tests bestanden. Der Produktionsbau bestand mit Node 22.22.3 und
meldete nur den bekannten Hinweis zu `pako` aus `pdf-lib`.

## 2026-09-23 – Juna – Einkaufs-Kostenübersicht vereinfacht

**Auftrag:** Zusatzausgaben ohne Trennlinien und ohne „Noch prüfen“ in der
Kostenübersicht anzeigen. Die Auswahlliste im Kostendialog um die
Käuferschutzgebühr ergänzen und seltene oder doppelte Einträge entfernen.

**Änderung:** Die Kostenübersicht und der Kostendialog zeigen die Zeilen direkt
untereinander; nur die Gesamtsumme bleibt optisch abgesetzt. Die Auswahlliste
enthält nun Versandkosten, Käuferschutzgebühr, Zollgebühren, Versicherung,
Rabatt und Sonstiges in dieser Reihenfolge. Ältere Kosten mit entfernten
Bezeichnungen bleiben beim Bearbeiten erhalten. Der Fallback für Zollkosten
lautet einheitlich „Zollgebühren“.

**Prüfung:** Fokussierte Angular- und Logiktests, Typprüfung, ESLint,
Formatprüfung und Produktionsbau bestanden. Auf dem aktuellen `origin/master`
bestanden 143 fokussierte Anwendungstests, 84 Workflow-Tests, Typprüfung,
ESLint und Produktionsbau. Vier passende Datenbanktestdateien mit 60
Einzelprüfungen bestanden. Der Bau meldet den bekannten Hinweis zu `pako` aus
`pdf-lib`.

## 2026-09-23 – Juna – Eigenbelege für Einkäufe eingeführt

**Auftrag:** Einkäufe ohne eindeutig identifizierbaren Verkäufer einfach erfassen,
auch außerhalb von Vinted. Den überflüssigen Untertitel in der Belegkarte entfernen.

**Änderung:** Das Einkaufsformular bietet einen einfachen Wechsel zwischen
Verkäuferauswahl und Eigenbeleg. Im Eigenbelegmodus ist ein Verkäuferstammsatz
entbehrlich; eine bekannte Verkäuferangabe kann als Freitext erfasst werden.
Kaufdatum, Positionen, Preis, Bezugsquelle, Referenznummer und hochgeladene
Nachweise bleiben im bestehenden Ablauf. Beim Abschluss wird ein PDF-Eigenbeleg
erstellt und im privaten Belegspeicher abgelegt. Ein fehlgeschlagener Upload kann
auf der Einkaufsdetailseite erneut angestoßen werden. Erzeugte Eigenbelege sind
vor dem Löschen geschützt. Der Untertitel „Originaldateien zu diesem Einkauf“
wurde aus der Belegkarte entfernt.

**Datenbank:** Deklaratives Schema, erzeugte Migrationen und Supabase-Typen
erweitern Einkäufe und Belege um den Eigenbelegmodus und die eindeutige
Zuordnung zum jeweiligen Abschluss. Zugriffsregeln schützen den erzeugten Beleg.

**Prüfung:** Beigefügten Text, bisherigen Ablauf und amtliche GoBD-Quellen
geprüft. `npm run verify` bestand mit Formatprüfung, ESLint, Typprüfung,
81 Workflow-Tests, 16 Edge-Tests, Suite-Audit, 2.744 Anwendungstests,
23 Landingpage-Tests und Produktionsbau. Danach ergänzte Regressionstests für
Abschlussfehler, erneuten Belegversuch und Verkäuferanzeige bestanden gezielt.
Alle 54 Datenbanktestdateien mit 1.967 Einzelprüfungen bestanden. Die erzeugte Migration wurde am lokalen
Migrationsstand geprüft; der öffentliche Schemaabgleich war anschließend leer.

## 2026-09-22 – Juna – Inserate: Unterstützung von Bestandsprodukten und Mengenartikeln im Listing Studio

**Auftrag:** Im Inserate-Modul (`/listings/new`) neben Einzelstücken (`inventory_items`) auch Bestandsprodukte und Mengenartikel (`catalog_products` mit verfügbarem Bestand in `stock_lots`) zur Auswahl und zum Inserieren bereitstellen.

**Änderung:**

- In `supabase/schemas/230_listings.sql` und der Migration `20260922201500_listings_catalog_products.sql`:
  - `inventory_item_id` in `public.listings` als optional definiert und `catalog_product_id` hinzugefügt (`REFERENCES public.catalog_products(workspace_id, id) ON DELETE CASCADE`).
  - Constraint `listings_target_check` hinzugefügt: genau eines von `inventory_item_id` oder `catalog_product_id` muss gesetzt sein.
  - Eindeutige Indizes `listings_one_open_per_item` und `listings_one_open_per_product` sowie `listings_catalog_product_id_idx` definiert.
  - RPCs `prepare_listing`, `set_listing_online` und `end_listing` aktualisiert, um sowohl Einzelstücke als auch Katalogprodukte (mit Advisory Lock und Bestandsprüfung) zu unterstützen.
- In `src/app/features/listings/models/listing.models.ts`:
  - Typ `ListingTargetKind = 'inventory_item' | 'catalog_product'` definiert.
  - `Listing`: `inventoryItemId?: string | null` und `catalogProductId?: string | null`.
  - `ListingEditorItem`: `targetKind?: ListingTargetKind`, `availableQuantity?: number`, `condition: InventoryItem['condition'] | null`.
- In `src/app/features/listings/models/listing.rules.ts`:
  - `canPrepareListing` erweitert, um für Katalogprodukte anhand von `availableQuantity > 0` die Inserierbarkeit zu prüfen.
- In `src/app/features/listings/services/listing.service.ts`:
  - `load(workspaceId)` lädt neben Inseraten und Einzelstücken auch `catalog_products` (inklusive Medien) sowie `stock_lots` (zur Bestandsberechnung).
  - Beide Zieltypen werden in `items` und `rows` gemappt.
  - `prepare` übergibt je nach Zieltyp `p_inventory_item_id` oder `p_catalog_product_id` an die RPC.
- In `src/app/features/listings/pages/listing-editor/listing-editor.component.ts` & `.html`:
  - Dropdown zeigt Mengenprodukte mit `${title} · Mengenbestand: ${availableQuantity}` und Einzelstücke mit `${title} · Einzelstück` an (analog zum Verkaufsdialog).
  - Produkte ohne verfügbaren Bestand werden ausgefiltert.
  - Zustand bei leerem Bestand, Ladezustand (`Lade Bestände…`) und Fehleranzeige integriert.
  - Beim Auswählen eines Produkts werden Preis und Artikeldetails passend vorbelegt und angezeigt.
- In `src/app/features/listings/pages/listing-overview/listing-overview.component.ts` & `.html`:
  - Verlinkung von Artikeln dynamisch: `/catalog/:id` für Katalogprodukte und `/inventory/:id` für Einzelstücke.
- Tests in `listing.rules.spec.ts`, `listing.service.angular.spec.ts`, `listing-editor.component.angular.spec.ts` und `listing-overview.component.angular.spec.ts` ergänzt und aktualisiert.

**Prüfung:** `npm run test:workflow` (84/84 bestanden, 0 Findings), `npm run lint` (0 Fehler), `npm run typecheck` (0 Fehler), `npm run test:angular -- src/app/features/listings` (35/35 bestanden), `npm run test:node -- src/app/features/listings` (16/16 bestanden), `npm run test:dom -- src/app/features/listings` (18/18 bestanden).

## 2026-09-22 – Juna – Steuer- & DATEV-Designangleichung: Umstellung auf PageHeader, CardComponent und Polaris-Geometrie

**Auftrag:** Die Buchhaltungsansicht (`src/app/features/accounting/`) an die einheitliche Shopify-Admin-Geometrie und Shared-UI-Komponenten angleichen. Veraltete `.card`- und `.kpi-card`-Container durch `CardComponent` ersetzen, den Kopfbereich auf `PageHeaderComponent` und segmentierte `ButtonComponent`-Tabs umstellen, Aktionsschaltflächen auf `ButtonComponent` migrieren und unzulässige Versalschrift entfernen.

**Änderung:**

- In `accounting.component.ts` wurden `PageHeaderComponent` und `CardComponent` importiert und in die Komponenten-Imports aufgenommen.
- In `accounting.component.html` wurde der handgestylte Kopfbereich durch `PageHeaderComponent` mit segmentierter Button-Gruppe für die Ansichtsumschaltung (§ 25a Steuer & DATEV / Bankabgleich) ersetzt.
- Der Datei-Upload-Auslöser und der Zurücksetzen-Button im Bankabgleich nutzen nun standardisierte `ButtonComponent`-Instanzen (`variant="primary"` bzw. `variant="ghost"`).
- Die vier Kennzahlenkarten im Bankabgleich und die vier Kennzahlenkarten im Steuerjournal wurden durch `CardComponent` mit `rounded="xl"` und `padding="sm"` ersetzt; `.kpi-value` sowie semantische Erfolgs- und Verlustfarben bleiben zur Gewährleistung bestehender Testverträge erhalten.
- Der Aktionsbereich und die Steuerhinweisbox im Steuerjournal wurden in `CardComponent` eingebettet; die Export-Buttons (`DATEV EXTF CSV`, `§ 25a Journal`, `Berichtspaket vorbereiten`) wurden auf `ButtonComponent` umgestellt.
- Die statische Steuerjournal-Tabelle wurde in `<app-card padding="none" rounded="xl">` mit strukturierter `[card-header]`-Projektion (Titel, Untertitel und `BadgeComponent` für die Eintragszahl) gekapselt; die Rechnungsanzeige-Schaltfläche wurde auf `ButtonComponent` umgestellt.
- Die Formularbeschriftung für den Kontenrahmen im Steuerberater-Modal wurde von dekorativer Versalschrift (`uppercase tracking-wider`) auf standardisiertes Label-Styling umgestellt.
- In `accounting-tax-review.angular.spec.ts` wurden `PageHeaderComponent` und `CardComponent` registriert sowie `iconOnly` und `title` für `ButtonComponent` in den Test-Metadaten hinterlegt.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (84/84 bestanden, 0 Findings in `check-admin-shared-ui`), `node --test scripts/check-admin-shared-ui.test.mjs` (14/14 bestanden) sowie alle 20 Vitest-Tests in `src/app/features/accounting/` erfolgreich ausgeführt.

## 2026-09-22 – Juna – Repository-Hygiene: Dependabot-Upgrades und Bereinigung veralteter Tracking-Branches

**Auftrag:** Veraltete Remote-Tracking-Branches aufräumen und freigegebene CI-Abhängigkeitsupdates von Dependabot mergen.

**Änderung:**

- Die beiden erfolgreich getesteten Dependabot-Pull-Requests [#142](https://github.com/GrischaTDev/flipbase/pull/142) (`docker/build-push-action` 7.3.0 → 7.4.0) und [#143](https://github.com/GrischaTDev/flipbase/pull/143) (`docker/setup-buildx-action` 4.3.0 → 4.4.1) per Merge-Commit in `master` übernommen.
- Veraltete Remote-Tracking-Referenzen (`origin/juna/shared-ui-cleanup-core`, `origin/juna/shared-ui-cleanup-forms`) über `git remote prune origin` entfernt.

**Prüfung:** PR-Checks auf GitHub Actions erfolgreich; Master-Zweig synchronisiert und auf aktuellem Stand.

## 2026-09-22 – Juna – Bereinigung von Compiler-Warnungen: Ungenutzte LucideDynamicIcon-Importe und stabile @for-Identität im Steuerjournal

**Auftrag:** Die bekannten Angular-Compiler-Warnungen NG8113 (ungenutzte `LucideDynamicIcon`-Importe) in `DashboardComponent` und `SellersComponent` entfernen sowie die NG0956-Laufzeitwarnung für die identitätsbasierte `@for`-Schleife im Steuerjournal der Buchhaltungsansicht (`accounting.component.html`) durch stabiles Tracking nach Verkaufs-ID und Index beheben.

**Änderung:**

- In `src/app/features/dashboard/dashboard.component.ts` und `src/app/features/sellers/sellers.component.ts` wurde der ungenutzte Import `LucideDynamicIcon` aus `@lucide/angular` und aus den `imports`-Arrays der Komponenten entfernt (behebt NG8113).
- In `src/app/features/accounting/accounting.component.html` wurde `@for (row of filteredTaxResults(); track row)` auf `@for (row of filteredTaxResults(); track row.sale_id + ':' + $index)` umgestellt, um instabiles Objekt-Identitäts-Tracking zu vermeiden (behebt NG0956).

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, lokaler Angular-Produktionsbau ohne Warnungen (`Application bundle generation complete`), `npm run test:workflow` (84/84 bestanden, 0 Findings in check-admin-shared-ui) sowie alle 88 Vitest-Tests in Dashboard, Sellers und Accounting erfolgreich ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Vollständige Migration aller verbleibenden Vorlagen und Leerung der Ausnahmelisten

**Auftrag:** Alle verbleibenden Legacy-Formularfelder und modalen Dialoge in den verbleibenden 15 Vorlagen (Accounting, Audit-Timeline, Auth-Login, Privacy/Terms-Modals, Deal-Calculator, Fulfillment, Image-Optimizer, Listing-Editor, Onboarding-Workspace-Setup, Research, Sales, Sale-Create-Modal) auf die standardisierten Shared Components (`TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `ModalShellComponent`, `ButtonComponent`) umstellen. Die Ausnahmelisten `legacyNativeFormControlPaths` und `legacyCustomModalPaths` in `scripts/check-admin-shared-ui.mjs` vollständig auf leere Sets leeren und alle Tests sowie den Produktionsbau grünstellen.

**Änderung:**

- In `TextFieldComponent` wurde das `value`-Property auf `model<string>('')` erweitert, um Zwei-Wege-Bindung `[(value)]` und `(valueChange)` zu unterstützen; zusätzliche ARIA-Inputs (`ariaRequired`, `ariaDescribedby`, `ariaInvalid`) wurden ergänzt.
- In `NumberInputComponent` wurde das Input `ariaInvalid` ergänzt und an `[attr.aria-invalid]` angebunden.
- In `scripts/check-admin-shared-ui.mjs` wurden `legacyNativeFormControlPaths` und `legacyCustomModalPaths` vollständig geleert (`new Set()`).
- Alle 15 betroffenen Feature-Templates wurden vollständig auf die Shared Controls migriert: native `<input>`- und `<textarea>`-Felder durch `app-text-field` und `app-number-input`, native `<input type="checkbox">` durch `app-custom-checkbox`, native Custom-Dialoge durch `app-modal-shell` und Aktionsschaltflächen durch `app-button`. Für Zahlenfelder (`app-number-input`) in Sales und Deal-Calculator wurden explizite Labels und ARIA-Labels für Barrierefreiheit und End-to-End-Selektoren beibehalten.
- In Vitest-Komponententests (`workspace-setup.component.angular.spec.ts`, `listing-editor.component.angular.spec.ts`, `sale-create-modal.component.angular.spec.ts`, `record-timeline.component.angular.spec.ts`, `record-history.container.angular.spec.ts`) wurden die Signal-Input- und Binding-Metadaten für die Shared Components registriert und Template-Ressourcen aufgelöst.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `node --test scripts/check-admin-shared-ui.test.mjs` (14/14 bestanden), `node scripts/check-admin-shared-ui.mjs` (0 Findings bei 96 Dateien), `npm run test:workflow` (84/84 bestanden), gesamte Vitest-Suite (`npx vitest run`: 294 Test-Dateien, 2729 Tests alle bestanden), E2E-Smoke-Lokalisierung sowie Angular-Produktionsbau (`ng build`) fehlerfrei ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Alle neun Einstellungsseiten auf Shared Controls migriert

**Auftrag:** Alle 9 Seiten unter `src/app/features/settings/` (`account-settings`, `app-settings`, `data-and-audit`, `notification-settings`, `numbering-settings`, `shipping-settings`, `store-settings`, `team-settings`, `workspace-settings`) auf Shared Components (`TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `DatePickerComponent`, `ModalShellComponent`, `ButtonComponent`) umstellen, alle 9 Pfade aus `legacyNativeFormControlPaths` und `team-settings.component.html` aus `legacyCustomModalPaths` entfernen sowie strikte 0-Native-Controls-Prüfung für `settings` in `scripts/check-admin-shared-ui.mjs` aktivieren.

**Änderung:** In `TextFieldComponent` wurde das `maxLength`-Input ergänzt und an `[attr.maxlength]` angebunden. In `NumberInputComponent` wurde `ariaDescribedby` ergänzt. Alle 9 Einstellungsseiten wurden von nativen `<input>`- und Formularfeldern sowie dem individuellen Einladungsdialog auf die zentralen Shared Components umgestellt. In `expense-documents.component.html` wurde der native Datei-Upload mit dem Attribut `data-shared-ui-exception="native-file-picker"` markiert. `scripts/check-admin-shared-ui.mjs` erzwingt nun strikt 0 native Form-Controls im Settings- und Expenses-Bereich. Sämtliche Test-Dateien und -Metadatenbridges in `settings-behavior.angular.spec.ts` und `numbering-settings.component.angular.spec.ts` wurden aktualisiert.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `node --test scripts/check-admin-shared-ui.test.mjs` (14/14), `npm run test:workflow` (84/84 bestanden, 0 Findings in check-admin-shared-ui), alle 68 Angular- und 30 Node-Tests unter `src/app/features/settings` sowie der Angular-Produktionsbau (`ng build`) erfolgreich mit Exitcode 0 ausgeführt.

## 2026-09-22 – Juna – Richtlinie für Pull Requests auf Deutsch aktualisiert

**Auftrag:** Die verbindlichen Projektrichtlinien in `AGENTS.md` anpassen, sodass Pull-Request-Titel und -Beschreibungen ab sofort immer auf Deutsch verfasst werden.

**Änderung:** In `AGENTS.md` wurden die Abschnitte „Sprache“ und „Pull Requests“ aktualisiert. Pull Requests sind nun ausdrücklich auf Deutsch gefordert; Commit-Nachrichten verbleiben im Conventional-Commit-Format auf Englisch.

**Prüfung:** `npm run format:check` erfolgreich ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Inventar-Formulare und Dialoge migriert

**Auftrag:** Legacy-Formulare, native Eingabefelder und eigene Dialograhmen im Bereich Inventar auf die zentralen Shared Components (`ModalShellComponent`, `TextFieldComponent`, `NumberInputComponent`, `CustomCheckboxComponent`, `ButtonComponent`) umstellen und die Pfade aus den Ausnahmelisten in `scripts/check-admin-shared-ui.mjs` entfernen.

**Änderung:** In `item-create-modal` wurde der eigene Modalrahmen durch `ModalShellComponent` ersetzt, die sechs nativen Form-Inputs auf `TextFieldComponent` und `NumberInputComponent` umgestellt und Aktions- sowie Footer-Buttons auf `ButtonComponent` migriert. In `item-detail` wurde das Erfassen von Zusatzkosten auf `NumberInputComponent`, `TextFieldComponent` und `ButtonComponent` umgestellt sowie der Vollbild-Vorschau-Dialog auf `ModalShellComponent` migriert. In `stock-position-list` wurde die Checkbox der Zeilenauswahl auf `CustomCheckboxComponent` umgestellt. `NumberInputComponent` unterdrückt nun `[attr.id]` auf dem Host-Element zur Vermeidung doppelter Element-IDs. In `scripts/check-admin-shared-ui.mjs` wurden die beiden Inventar-Vorlagen aus `legacyNativeFormControlPaths` und `legacyCustomModalPaths` entfernt.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (83 bestanden, 0 Findings in check-admin-shared-ui), alle 13 Test-Dateien mit 176 Tests unter `src/app/features/inventory/` sowie der Angular-Produktionsbau (`ng build`) erfolgreich mit Exitcode 0 ausgeführt.

## 2026-09-22 – Juna – Shared-UI-Bereinigung: Test-Ressourcen und Form-Control-Anbindung in PR #149 gefixt

**Auftrag:** CI-Fehler in PR #149 (refactor(ui): migrate forms to shared controls) analysieren und beheben.

**Änderung:** In `expense-category-dialog.component.angular.spec.ts` wurde der Zugriff auf das neu eingeführte `newNameControl` anstelle des früheren Signals aktualisiert. In `purchase-correction-dialog.component.angular.spec.ts` wurde das Laden von Template-Ressourcen auf dynamisches `glob` für die neu verwendeten Shared Components (`ButtonComponent`, `ModalShellComponent`, `TextFieldComponent`) umgestellt, Binding-Bridges für Shared Controls ergänzt und der asynchrone Abschluss von `submit()` im Test mit Change Detection synchronisiert. Zudem wurden die Vorlagen `recurring-expense-dialog.component.html` und `purchase-correction-dialog.component.html` sowie die Spec Prettier-konform formatiert.

**Prüfung:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (83 bestanden, 0 Findings in check-admin-shared-ui), `npm run test:audit` sowie alle betroffenen Vitest-Specs in `expenses` und `purchases` lokal erfolgreich ausgeführt (Exitcode 0).

## 2026-09-22 – Juna – Beta-, Einkaufs- und Artikelflüsse nachgeschärft

**Auftrag:** Die bei der manuellen Abnahme gefundenen Rückmeldungen zur
Beta-Bewerbung, zu Einkäufen, Verkäufen, Marken und zur Artikelerfassung beheben.
Abgeschlossene Einkäufe dürfen nach dem Wiederöffnen keine bereits eingegangenen
Mengen still verändern; Status und Kosten sollen ohne Seitenneuladen aktuell sein.

**Änderung:** Der Beta-Erfolgsdialog nutzt die volle Breite und die Einladungs-
Betreffzeile ist ohne Schrägstriche konfiguriert. Vorhandene Bewerbungen behalten
ihren eigenen Konfliktpfad. Einkaufsentwürfe öffnen nach dem Speichern ihre
Detailseite. Statusfarben unterscheiden angekommen und abgeschlossen. Der
Wareneingang wird über einen gemeinsamen Dialog gebucht und setzt den
Ankunftsstatus automatisch. Bereits eingegangene Mengen sind bei einer späteren
Bearbeitung strukturell gesperrt. Bestätigte Status- und Kostendaten werden sofort
in die zentralen Einkaufs- und Verkaufssignale übernommen. Die Artikelerfassung
unterstützt zusätzliche Stammdaten, mehrere Bilder sowie eine lokale
Markenverwaltung mit sicherer Neuzuordnung vor dem Löschen. Die Artikeldetailseite
stellt dieselben Stammdaten zur späteren Bearbeitung bereit.

**Datenbank:** Die deklarativen Schemadateien ergänzen Artikelfelder, eine
workspace-gebundene Marken-Ersetzungsfunktion und den automatisch abgeleiteten
Wareneingangsstatus. Die zugehörige Migration wurde lokal erzeugt, auf den
tatsächlich beabsichtigten Umfang geprüft und erfolgreich angewendet. Die lokalen
Supabase-Typen wurden anschließend neu erzeugt.

**Prüfung:** 239 fokussierte Angular-Tests, 24 Landingpage- und Beta-Vertragstests
sowie alle 53 Datenbanktestdateien mit 1.959 Einzelprüfungen bestanden. Der
vollständige Aufruf `npm run verify` bestand anschließend mit Exitcode 0:
Formatprüfung, ESLint, strikte Typprüfung, Workflowtests (81 bestanden, fünf
Umgebungs-Skips), Edge-Tests (16), Suite-Audit, 2.729 Anwendungstests,
23 Landingpage-Tests und der Produktionsbau. Der Bau enthält weiterhin nur die
zwei bekannten NG8113-Hinweise im Dashboard und in der Verkäuferliste.

## 2026-09-21 – Juna – PR-Browserprüfung an vereinfachte Zusatzausgaben angepasst

**Auftrag:** Den bestätigten UI-Regression-PR nach erfolgreichen Pflichtprüfungen
mergen und einen dabei gefundenen Browserfehler vor dem Merge beheben.

**Änderung:** Die Browserfälle verwenden jetzt die sichtbaren Begriffe
„Zusatzausgaben verwalten“ und „Zusatzausgabe“. Der bisherige Pflichtfall zur
entfernten Kostenherkunft prüft stattdessen den aktuellen Nutzerablauf: zusätzliche
Versandkosten erfassen, nach erneutem Öffnen ändern und nach einem Reload
wiederfinden. Die PR-Auswahl und ihre Dokumentation wurden entsprechend
aktualisiert. Das gemeinsame Textfeld entfernt eine explizite Feld-ID vom
Komponenten-Host, damit Label und Fehlermeldung eindeutig mit dem inneren
Eingabefeld verknüpft sind. Dadurch ist auch das Namensfeld beim Erstellen eines
Verkäufers wieder zugänglich benannt.

**Prüfung:** Der ursprüngliche Pflichtfall wurde in CI und lokal rot reproduziert.
Der neue ID-Regressionsfall scheiterte zunächst erwartungsgemäß an zwei Elementen
mit `seller-name`. Danach bestanden 23 fokussierte Angular-Tests, der gezielte
Verkäufer-Browserfall, elf weitere Einkaufs-Browserfälle und der vollständige
PR-Browserlauf mit 9/9 Fällen. Außerdem bestanden Formatprüfung, ESLint, strikte
Typprüfung, die zwei Verträge der Playwright-Auswahl und der Produktionsbau.

**Prüfhinweise:** Der Bau enthält weiterhin die zwei bekannten NG8113-Hinweise
im Dashboard und in der Verkäuferliste. Keine Datenbank-, Migrations- oder
Abhängigkeitsänderung.

## 2026-09-21 – Juna – Vier abschließende UI-Fehlerpfade korrigiert

**Auftrag:** Die vier wichtigen Funde der Gesamtprüfung in einer begrenzten
Fix-Runde beheben und die bestehenden Karten-, Button- und Formularverträge
bewahren.

**Änderung:** Ein Ladefehler beendet jetzt den Ladezustand der Einkaufsliste und
bietet einen zugänglichen erneuten Versuch für den aktiven Workspace an.
Verwaiste direkte Zusatzausgaben werden mit sichtbarem Statushinweis auf die
Standardverteilung des Einkaufs umgestellt. Steuerherkunft, Ursprungsdaten,
Kostenart und Betrag bleiben unverändert; gültige direkte Zuordnungen bleiben
auch bei Mystery-Einkäufen erhalten. Der Bezugsquellendialog blockiert alle
Schließwege während des Speicherns. Der gemeinsame Button unterstützt eine
optionale native Formularzuordnung; Verkäufer und Bezugsquelle speichern damit
über genau einen Submit-Weg. Die standardmäßige Buttonzentrierung bleibt erhalten.

**Prüfung:** Jeder Fund wurde vor der Korrektur mit roten Regressionstests
reproduziert: zwei Listenfehler, drei Kostenfehler, drei ungeschützte Schließwege
und vier fehlende Submit-Verknüpfungen. Danach bestanden gemeinsam 110 fokussierte
Angular-Tests einschließlich Einkaufserfassung und vorhandener AXE-Prüfungen
sowie acht Kostenlogiktests. Gezieltes ESLint, Prettier und die strikte Typprüfung
bestanden. Der einmalige Gesamtaufruf `npm run verify` bestand mit direkt
gesichertem **Exitcode 0**: Format, Lint, Typen, Workflow (81 bestanden, fünf
Umgebungs-Skips), Edge (16), Suite-Audit, Anwendung (2.715 Tests in 293 Dateien),
Landingpage (22) und Produktionsbau. Die darin enthaltenen Orchestratorprüfungen
bestanden mit acht Tests und drei Windows-Skips.

**Prüfhinweise:** Vitest meldete bei neun unveränderten Node-Testdateien ein
verzögertes Beenden der Worker, obwohl alle Tests bestanden. jsdom meldete eine
fehlende Canvas-Funktion und neun nicht lesbare CSS-Stylesheets. Der Bau enthält
weiterhin die zwei bekannten NG8113-Hinweise in Dashboard und Verkäuferliste.
Diese Hinweise wurden dokumentiert; die vier Fehlerpfade und der Gesamtaufruf
sind grün.

**Abgrenzung:** Keine Datenbank-, Migrations-, Snapshot-, Abhängigkeits-, Browser-
oder Dockeränderung. Die zuvor dokumentierte visuelle Abnahme bleibt offen.

## 2026-09-21 – Juna – UI-Regressionen integriert und Prüfgrenzen dokumentiert

**Auftrag:** Die elf UI-Aufgaben gemeinsam prüfen, neue Integrationsfehler
beheben und die manuelle Abnahme in der bereits laufenden Umgebung dokumentieren.

**Änderung:** Die strikte Typprüfung der neuen DOM-Tests und des
Bezugsquellen-Mocks korrigiert; historische Stornostatuswerte werden ausdrücklich
als Altbestand geprüft. Einen ungenutzten Icon-Import in der Einkaufsliste
entfernt. Die gemeinsame Architekturprüfung fand außerdem den neu eingeführten
nativen Entfernen-Button im Kosteneditor. Er verwendet jetzt den vorhandenen
roten Shared-Button; ein zunächst roter DOM-Test prüft Gestaltung und Entfernen
der richtigen Zeile. Keine Datenbank-, Migrations- oder Snapshotänderung.

**Prüfung:** Die Formatierung gemäß Task 12 sowie `npm run lint`,
`npm run typecheck` und `npm run build` bestanden. Die Typprüfung war vor der
Korrektur mit 13 Diagnosen rot. Fokussiert bestanden 92 Angular-Tests, 48
Präsentationstests und nach der zweiten Korrektur elf Kosteneditor-/Dialogtests.
`node scripts/check-admin-shared-ui.mjs` bestand anschließend mit 95 geprüften
Dateien ohne Befund. Erfolgreich waren außerdem `npm run test:workflow` (81 Tests,
fünf Windows-/Umgebungs-Skips), `npm run test:edge` (16 Tests), `npm run test:audit`,
`npm test` (2.704 Anwendungstests in 293 Dateien) und `npm run test:landing`
(22 Tests).

**Gesamtaufruf:** Der erste `npm run verify` endete mit Exitcode 1 am nativen
Kosteneditor-Button. Nach dessen Reparatur bestanden zunächst alle Prüfstufen
einzeln. Der ausdrücklich angeforderte erneute Gesamtaufruf auf dem reparierten
Endstand `5dff9b79` bestand anschließend vollständig mit **Exitcode 0**:
Formatierung, Lint, Typen, Workflow, Edge, Suite-Audit, sämtliche Anwendungstests,
Landingpage und Produktionsbau. Der Exitcode wurde unmittelbar aus
`$LASTEXITCODE` gesichert, ohne Pipe.
Der Produktionsbau enthält weiterhin zwei bekannte NG8113-Hinweise im
unveränderten Dashboard und in der unveränderten Verkäuferliste.

**Browserabnahme offen:** `browser-use` zeigte auf `http://localhost/`,
`http://localhost/landing/` und `http://flipbase.localhost/` den älteren
„ReFlip“-Build mit Loginseite. Das ausgelieferte Skript stimmt nicht mit dem
aktuellen Branch-Bau überein. Deshalb sind sämtliche zehn visuellen Abnahmefälle
einschließlich DE/EN, Themes und Druckvorschau noch ungeprüft. Keine Daten
angelegt, keine Server oder Docker-Container gestartet oder gestoppt. Eine
Veröffentlichung erfolgte nicht.

## 2026-09-21 – Juna – Druck-CSS-Vertrag regelblockweise gekoppelt

**Auftrag:** Der verbleibende Review-Fund sollte verhindern, dass ungebundene
Druckdeklarationen und leere route-bezogene Selektoren den CSS-Test gemeinsam
grün machen.

**Änderung:** Der Test extrahiert jetzt den konkreten Regelblock für den
Shell-Rahmen, Inhalts- und Hauptbereich, Empfang sowie Umbruchschutz. Jede
geforderte Eigenschaft wird in ihrem eigenen, mit
`body:has(app-purchase-print)` beginnenden Block erwartet. Die benannte
`@page`-Regel bleibt ebenfalls separat und eng geprüft.

**Prüfung:** Die fokussierten Druck- und Shelltests bestanden mit sieben Tests;
Prettier und fokussiertes ESLint ebenfalls. Es wurden keine Produktdateien
geändert.

## 2026-09-21 – Juna – Drucktests auf gerenderte Shell und enge CSS-Verträge nachgeschärft

**Auftrag:** Drei Review-Funde am Einkaufsdruck beheben: Die Shell-Haken über
einen echten Angular-TestBed-Render prüfen, den CSS-Vertrag vollständig
absichern und den Browserhinweis auf die sichtbare Aktionsleiste begrenzen.

**Änderung:** Der Shelltest verwendet gezielte Kindkomponenten-Stubs und die
echte Shell-Vorlage als TestBed-Template; alle fünf Haken werden dadurch im
tatsächlich von Angular erzeugten DOM geprüft. Der CSS-Test liest nur die
beiden relevanten Regeln aus und prüft Rahmen-Ausblendung, Inhalts-Resets,
benannte Seite, Umbruchschutz und A4-Ränder. Der Hinweis wird direkt unterhalb
der gefundenen `print:hidden`-Leiste geprüft.

**Prüfung:** Fokussierte Shell- und Drucktests bestanden mit sieben Tests;
Prettier und fokussiertes ESLint ebenfalls. Keine Produktlogik, Datenbank- oder
Docker-Dateien geändert.

## 2026-09-21 – Juna – Einkaufsdruck vom Admin-Rahmen getrennt

**Auftrag:** Der Einkaufsdruck sollte innerhalb der Shell bleiben, beim
Drucken aber weder Navigation noch Kopfzeile, Sprunglink oder Dialoghülle
zeigen. Andere Druckansichten und normale Verwaltungsseiten durften sich nicht
verändern.

**Änderung:** Die Shell markiert Sidebar, Inhaltsbereich, Kopfzeile,
Hauptinhalt und mobile Navigation mit eindeutigen Datenattributen. Der
Einkaufsdruck zeigt einen Hinweis zu Browser-Kopf- und Fußzeilen. Neue
Druckregeln greifen ausschließlich bei `app-purchase-print`, entfernen dort
den Admin-Rahmen, verwenden eine benannte A4-Seite mit 12 mm Rand und vermeiden
Umbrüche in zusammengehörenden Empfangsabschnitten.

**Prüfung:** Die neuen Shell- und Drucktests waren zuerst rot und sind danach
mit sieben fokussierten Angular-Tests grün. Prettier, fokussiertes ESLint und
der Produktionsbau bestanden. Der Bau meldet weiterhin drei bekannte
NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Imports außerhalb dieses
Scopes.

## 2026-09-21 – Juna – Chronikzeit unabhängig vom Detailschalter ausgerichtet

**Auftrag:** Zeitangaben in der Einkaufschronik sollten unabhängig davon an
derselben rechten Stelle stehen, ob ein Ereignis Details anbietet.

**Änderung:** Jede Ereigniszeile verwendet jetzt ein festes zweispaltiges Grid.
Vorgang, Akteur, Grund und Detailschalter bleiben in der Inhaltsseite; die
Zeitangabe liegt als eigene `time`-Zelle mit `data-record-history-time` in der
zweiten Spalte.

**Prüfung:** Der neue DOM-Test war vor der Umsetzung rot (keine markierten
Chronikzeilen) und ist danach zusammen mit den bestehenden Chroniktests grün.
Prettier, fokussiertes ESLint und der Produktionsbau bestanden; die vollständige
Test-Suite blieb ebenfalls grün.

## 2026-09-21 – Juna – Einkaufsstatus nach fachlichem Fortschritt priorisiert

**Auftrag:** Die zentrale Einkaufsstatus-Präsentation sollte den fachlichen
Fortschritt vor technischen Lieferzuständen abbilden und für jeden Status den
vorgegebenen Ton verwenden.

**Änderung:** Archivierte und stornierte Einkäufe überschreiben alle anderen
Zustände. Danach überschreibt „Abgeschlossen“ bei finalisierten Einkäufen die
Lieferzustände; Teillieferung, Ankunft, Bestellung und Entwurf folgen in der
fachlich festgelegten Reihenfolge. Die Einkaufsliste selbst blieb unverändert.

**Prüfung:** Die vollständige Statusmatrix war zunächst mit den erwarteten
Fehlern rot und bestand nach der zentralen Korrektur mit 47 fokussierten
Node-Tests. Prettier, ESLint und der Produktionsbau wurden anschließend
ausgeführt.

## 2026-09-21 – Juna – Einkaufsliste zeigt Laden und Leerstand korrekt

**Auftrag:** Die Einkaufsliste zwischen bestätigtem Laden, echtem Leerstand und
Filtertreffern unterscheiden sowie lange Beschreibungen in der Tabelle lesbar
begrenzen.

**Änderung:** Die Tabelle erhält ihren Ladezustand aus dem bestehenden
Einkaufs- und Workspace-Vertrag. Solange der aktive Workspace nicht bestätigt
geladen ist, zeigt sie ausschließlich „Einkäufe werden geladen …“ statt eines
Leerzustands oder Daten des vorherigen Workspace. Der echte Leerzustand heißt
nun „Keine Einkäufe vorhanden“; Filtertreffer behalten „Keine passenden
Einkäufe“. Beschreibungen sind auf eine Tabellenzeile begrenzt, bleiben aber
vollständig im DOM und über den Titelhinweis verfügbar.

**Prüfung:** Die beiden neuen Regressionen waren zuerst rot (fehlender
Ladezustand und fehlender Beschreibungscontainer) und bestanden anschließend
mit 13 fokussierten Angular-Tests einschließlich AXE. Prettier und ESLint für
die betroffenen Dateien sowie der Produktionsbau bestanden. Der Bau meldet
weiterhin drei bekannte NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-
Importen in Dashboard, Einkaufsliste und Verkäuferliste.

## 2026-09-21 – Juna – Kosteneditor auf Zusatzausgaben reduziert

**Auftrag:** Im Kosteneditor nur noch Zusatzausgabe und Betrag zeigen, ohne
technische Steuer- und Zuordnungswerte bereits vorhandener Kosten beim Speichern
zu verlieren.

**Änderung:** Der Editor zeigt nur noch Auswahl, Betrag und eine zugängliche
Papierkorb-Aktion. Steuerherkunft, Verteilung und Zielposition bleiben in den
internen Formularwerten erhalten, werden jedoch nicht mehr dargestellt. Neue
normale Zeilen behalten `taxTreatment: null` und die Verteilung nach Warenwert;
Mystery-Pakete verwenden weiter die Verteilung nach Menge. Der Dialog heißt nun
„Zusatzausgaben verwalten“; sein lokaler Speichern- und Abbrechen-Vertrag bleibt
unverändert.

**Prüfung:** Die neuen Editor- und Dialogtests waren zuerst rot (3 erwartete
Fehler wegen der alten sichtbaren Begriffe und Dialogüberschrift) und bestanden
nach der Umsetzung. Die Kostenlogik (8 Tests) sowie die drei Angular-
Komponententests (18 Tests) sind grün; Prettier und der fokussierte ESLint-Lauf
ebenfalls. Der Produktionsbau besteht mit drei bereits vorhandenen NG8113-
Warnungen außerhalb des Scopes. Die globale Typprüfung ist aktuell wegen zehn
fachfremder Testtypfehler in Beleg-, Einkaufsquellen- und Verkäuferdialogtests
nicht grün.

## 2026-09-21 – Juna – Artikelnamen in Einkaufspositionen linksbündig ausgerichtet

**Auftrag:** Der Artikelnamen-Button in Einkaufspositionen sollte seinen Text
auch in der tatsächlich gerenderten Buttonfläche links statt zentriert zeigen,
ohne die Zentrierung anderer Shared-Buttons zu verändern.

**Änderung:** `ButtonComponent` besitzt nun den Signal-Input `contentAlign` mit
dem Standardwert `center`. Nur der Artikelnamen-Button setzt `contentAlign="start"`
und erhält damit `justify-start text-left`; alle übrigen Aufrufer behalten die
bisherige Zentrierung. Die Shared- und Featuretests prüfen den inneren nativen
Button sowie die Angular-Test-Metadaten für den neuen Input.

**Prüfung:** Die beiden fokussierten Angular-Tests waren vor der Umsetzung rot
(2 Fehler) und bestanden danach mit 33 Tests. Prettier und ESLint für die
betroffenen Dateien sowie der Produktionsbau wurden anschließend ausgeführt.

## 2026-09-21 – Juna – Bezugsquellen-Parent-Integration gerendert geprüft

**Auftrag:** Den Bezugsquellenfluss nicht nur über Quelltext und einen direkten
Methodenaufruf absichern, sondern als gerenderte Parent-Interaktion testen.

**Änderung:** Ein schmaler Test rendert die tatsächliche Einkaufserfassungs-
Vorlage mit gezielten Form- und Dialog-Stubs. Er klickt „Bezugsquelle erstellen“
prüft den gerenderten Dialog und löst dessen `created`-Ereignis aus. Dadurch ist
belegt, dass die Template-Bindung die Quelle auswählt, das Formular als geändert
markiert und den Dialog wieder schließt. Die für diesen Ablauf verwendeten
Quelltext-Assertions und der direkte Übergabetest entfallen.

**Prüfung:** Der neue DOM-Test war während des Stubaufbaus zunächst rot. Nach
der vollständigen Input-/Output-Abbildung bestanden 48 fokussierte
Angular-Tests sowie ESLint und Prettier. Der Fixabschnitt ist im Task-Bericht
ergänzt.

## 2026-09-21 – Juna – Bezugsquelle im eigenen Dialog angelegt

**Auftrag:** Die eingebettete Schnellerfassung einer Bezugsquelle aus dem
Einkaufsformular in einen eigenen, zugänglichen Dialog überführen.

**Änderung:** Der neue Dialog verwendet die gemeinsame Dialoghülle, ein
Pflichtfeld für den Namen sowie die zentralen Buttons. Er behält Eingabe und
Fehlermeldung bei einem Speicherfehler und gibt eine erfolgreich gespeicherte
Bezugsquelle an das Einkaufsformular zurück. Dieses wählt sie unmittelbar aus,
markiert den Einkauf als geändert und schließt den Dialog. Ungespeicherte
Dialogeingaben werden beim Verlassen berücksichtigt.

**Prüfung:** Die neuen Dialog- und Parent-Vertragstests waren zuerst rot, weil
die Komponente und der neue Parent-Vertrag fehlten. Danach bestanden 48
fokussierte Angular-Tests einschließlich AXE, Prettier, ESLint und
Produktionsbau. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-5-report.md`.

## 2026-09-21 – Juna – Telefonfehlerreferenz bedingt gesetzt

**Auftrag:** Die ARIA-Referenz des Telefonfelds nur dann setzen, wenn das
passende Fehlerziel tatsächlich gerendert wird.

**Änderung:** Das Telefon-Control erzeugt seine Eingabeattribute bei jeder
Änderungsprüfung neu. Leer und gültig bleiben ohne `aria-describedby`; nur ein
berührter ungültiger Wert verweist auf `seller-phone-error` und zeigt die
zugehörige Fehlermeldung.

**Prüfung:** Der neue Normalzustandstest war zunächst rot, weil die Referenz
immer vorhanden war. Nach der Korrektur bestanden die 15 fokussierten Tests
einschließlich AXE, ESLint und Produktionsbau. Der Fixbericht ergänzt
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Verkäuferdialog gegen Prüfhinweise abgesichert

**Auftrag:** Zwei wichtige Review-Funde am Verkäuferdialog beheben: eine
fehlende Telefonnummer-Fehlermeldung und das Schließen während des Speicherns.

**Änderung:** Ein berührtes ungültiges Telefonfeld zeigt wieder die passende
Meldung mit der ID `seller-phone-error`, auf die das Eingabefeld verweist. Das
Schließen über Escape oder die Dialog-Kopfaktion wird während eines laufenden
Speicherns lokal abgefangen; die gemeinsame Dialogkomponente bleibt unverändert.

**Prüfung:** Beide neuen DOM- und Verhaltenstests waren zuerst rot und
bestanden nach der Korrektur mit insgesamt 15 fokussierten Tests einschließlich
AXE. ESLint für die betroffenen TS-Dateien und der Produktionsbau waren
erfolgreich. Der Fixbericht ergänzt den bestehenden Taskbericht unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Verkäuferdialog vereinheitlicht

**Auftrag:** Den Verkäuferdialog über die gemeinsame breite Dialoghülle
abbilden und die Verfügbarkeit von „Speichern“ eindeutig an die Formularwerte
koppeln.

**Änderung:** Der Dialog verwendet nun `ModalShellComponent` in Größe `xl`
sowie die gemeinsamen Textfelder und Aktionen. Straße und Adresszusatz nehmen
über die komplette Dialogbreite ein; die Länderauswahl heißt sichtbar und für
Hilfstechnologien „Land/Region“. Ein Name nur aus Leerzeichen ist ungültig.
„Speichern“ bleibt bis zu einem gültigen Formular, einem getrimmten Namen und
einem nicht laufenden Speichervorgang deaktiviert. Die bisherigen redundanten
Hinweise entfallen; der konkrete E-Mail-Fehler erscheint weiterhin nur für
berührte, ungültige Eingaben.

**Prüfung:** Der neue DOM- und Zustandsvertrag war zunächst rot (fehlende
gemeinsame Dialoghülle und Speicheraktion). Der fokussierte Angular-Test mit
AXE bestand anschließend mit 13 Tests; ESLint für die betroffenen TS-Dateien
und der Produktionsbau waren erfolgreich. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-4-report.md`.

## 2026-09-21 – Juna – Belegkarte auf Auswahlfläche reduziert

**Auftrag:** Die Belegkarte auf eine vollbreite Ablagefläche und zugängliche
Icon-Aktionen reduzieren, ohne Upload, Vorschau oder Entfernen zu verändern.

**Änderung:** Belegart, verstecktes Dateifeld und Ablagefläche liegen jetzt
untereinander im Karteninhalt. Die Ablagefläche öffnet weiterhin den nativen
Dateidialog und akzeptiert Dateien per Drag-and-drop. Gespeicherte und
vorgemerkte Belege verwenden klare Vorschau- beziehungsweise Papierkorb-Icons
mit zugänglichen Namen; der Wiederholungsversuch bei Uploadfehlern bleibt als
Textaktion bestehen. Das technische Dateifeld hat einen zugänglichen Namen und
ist nicht mehr mit der Tastatur erreichbar, weil die sichtbare Ablagefläche
seinen vollständigen Bedienweg übernimmt.

**Prüfung:** Der gerenderte DOM-Vertrag schlug zunächst wegen des alten
Zusatzknopfs rot aus. Die AXE-Prüfung fand anschließend das unbeschriftete
Dateifeld und bestand nach der Korrektur. Der fokussierte Angular-Test bestand
mit 16 Tests, die betroffenen Dateien wurden gelintet und der Produktionsbau
war erfolgreich. Der Prüfbericht liegt unter
`.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-3-report.md`.

## 2026-09-21 – Juna – Kartenrahmen beim ersten Rendern stabilisiert

**Auftrag:** Den synchronen Klassenvertrag der gemeinsamen Card-Komponente beim
ersten Rendern vollständig machen.

**Änderung:** Die Varianten `surface` und `kpi` setzen ihren transparenten
Rahmen jetzt synchron; `subtle` setzt den dezenten Rahmen synchron. Die lokale
`transition-colors`-Klasse der Card wurde entfernt, damit der Rahmen nicht
zwischen Browserfarbe und Themefarbe überblendet.

**Prüfung:** Der neue Kartentest schlug zunächst rot aus und bestand nach der
Korrektur. Karten- und Einkaufserfassungstests bestanden mit 49 Tests. Der
Prüfbericht liegt unter `.superpowers/sdd/2026-09-21-ui-regression-cleanup/task-2-report.md`.

## 2026-09-21 – Juna – Beta-Formular und Ergebnisdialoge korrigiert

**Auftrag:** Den Beta-Antrag an den produktiven Duplikatcode anpassen, den
Sendezustand zuverlässig verstecken und die Ergebnisdialoge vollständig
zweisprachig sowie lesbar halten.

**Änderung:** Der Ladebereich respektiert den nativen `hidden`-Zustand. Der
Erfolgs- und Duplikatdialog trennt Fließtext und E-Mail-Adresse sichtbar. Die
Landingpage erkennt sowohl `application_existing` als auch den bisherigen
Kompatibilitätswert `application_exists` und zeigt dafür denselben neutralen
Dialog ohne internen Bewerbungsstatus.

**Prüfung:** Neue Landing-Regressionen wurden zunächst rot ausgeführt und
bestanden nach der Korrektur vollständig (22 Tests). Formatierung und
Diff-Prüfung waren ebenfalls erfolgreich.

## 2026-09-21 – Juna – Folgekorrekturen nach manueller UI-Abnahme geplant

**Auftrag:** Die nach dem Einkaufsumbau gefundenen Darstellungs- und
Bedienprobleme sammeln, Artikel und Bestand fachlich neu einordnen und die
Umsetzung in kontrollierbare Folge-Pull-Requests teilen.

**Änderung:** Die neuen Punkte wurden in drei eigenständig prüfbare Pakete
geteilt. Der erste Entwurf umfasst akute Regressionen im Beta-Antrag, bei
Einkaufsbelegen und Zusatzkosten, im Verkäufer- und Bezugsquellenablauf, in
Einkaufsliste und Chronik sowie beim Drucken. Die spätere Zusammenführung von
Artikel und Bestand samt neuer Navigation bleibt ein zweiter Pull-Request.
Adresssuche und frei gestaltbare Dokumentvorlagen bleiben wegen externer
Dienste, Datenschutz und eigenständiger Datenmodelle ein dritter Pull-Request.

Die Spezifikation hält außerdem fest, dass ein bereits vorhandener Beta-Antrag
öffentlich neutral beantwortet wird, dass „Angekommen“ und „Abgeschlossen“
verschiedene fachliche Zustände bleiben und dass browserseitige Druck-Kopf- und
Fußzeilen nicht durch die Anwendung erzwungen deaktiviert werden können.
Nach der Freigabe wurde daraus ein testgetriebener Implementierungsplan mit
einzeln prüf- und committierbaren Arbeitspaketen erstellt.

**Prüfung:** Bestehende Komponenten, Tests, Navigations- und
Gestaltungsverträge wurden gelesen. Produktcode wurde in diesem Planungsschritt
nicht verändert.

## 2026-09-21 – Juna – Einkaufsablauf und zugehörige Oberflächen vereinheitlicht

**Auftrag:** Die Einkaufserfassung wieder auf Verkäufer, Quelle, Artikel und
nachvollziehbare Kosten reduzieren und die 25 abgestimmten Detailkorrekturen in
Einkäufen, Artikelstamm, Verkäuferverwaltung, Beta-Einstieg und globalem
Kopfbereich umsetzen.

**Änderung:** Die Einkaufserfassung beginnt wieder mit dem gespeicherten
Verkäufer und bietet dort direkt die Neuanlage an. Plattform-Benutzername,
Verkäuferart, Anschrift, Angebotslink, Plattform-Bestellnummer, doppelte
Bezeichnung und sichtbare „optional“-Hinweise wurden entfernt. Kaufdatum und
Belege liegen in der rechten Detailspalte. Artikel lassen sich über die gesamte
Auswahlzeile wählen; leere Preise und die Kostenübersicht reagieren unmittelbar
und zeigen Nullwerte verständlich an. Sonstige Kosten erscheinen nur, wenn sie
vorhanden sind.

Die Einkaufsübersicht unterscheidet leere Bestände von erfolglosen Filtern,
zeigt die vereinbarte Spaltenfolge und aktualisiert Status sowie Gesamtbetrag
ohne Neuladen. Entwürfe bieten noch keine Druckaktion; der technische
Prüfbeleg wurde aus dem Einkauf entfernt. Die Artikeltabelle bleibt nach dem
Abschluss fachlich gleich, Belege können in jeder Phase ergänzt und fehlerhafte
Dateien wieder entfernt werden. Die Chronik beschreibt ausschließlich konkrete,
lesbare Einzeländerungen ohne interne Datenobjekte oder Kennungen.

Artikelübersicht und Verkäuferliste wurden auf die gewünschten Spalten und
vollständig anklickbare Zeilen umgestellt. Globale Checkboxen verwenden den
gelben Markenakzent; Logo, Kopfzeilenhöhen und Kopfleisten-Aktionen sind
vereinheitlicht. Der Beta-Einstieg zeigt bei einer vorhandenen Bewerbung keine
internen Statusdetails mehr, verwendet einen sichtbaren Ladebalken und
korrigierte Einladungstexte sowie Passwortübersetzungen.

Der abschließende Code-Review ergänzte belastbare Fehlerpfade: Ein bestätigter
Abschluss bleibt auch bei einem danach scheiternden Neuladen sichtbar, und die
letzte bestätigte Einkaufsliste wird dabei nicht geleert. Belegdateien werden
wiederholbar und ohne verwaiste Storage-Dateien entfernt. Der Artikelauswähler
verwendet pro Zeile genau ein zugängliches Steuerelement. Abgeschlossene
Einkäufe zeigen keine Verkaufswerte mehr in ihrer Artikeltabelle; Beschreibung,
Quelle und Verkäufer erscheinen in der Chronik jeweils einmal und mit
verständlichen Namen. Eine reine Archivansicht führt nicht mehr in einen leeren
Filterzustand.

Die Discord-Verknüpfung bleibt bewusst ein eigener Folge-Pull-Request. Sie
benötigt eine Discord-App mit OAuth-Freigabe, serverseitig geschützte
Zugangsdaten, die Zuordnung des Discord-Kontos zum angenommenen Beta-Nutzer und
eine zuverlässige Vergabe beziehungsweise Wiederholung der Rolle
„Beta-Tester“. Ohne diese Infrastruktur wäre ein einfacher Einladungslink weder
personalisiert noch ausreichend geschützt.

**Prüfung:** Die gezielten Node-, DOM-, Angular-, Landing-, Edge-Function- und
Datenbanktests sowie Lint, Typprüfung und Produktionsbau wurden ausgeführt. Eine
lokale Browserprüfung bestätigte den Einkaufsablauf vom Entwurf bis zum Abschluss,
die unmittelbare Kostenaktualisierung, die Artikelzeilenauswahl, Tabellen und
Verkäuferaktionen sowie Hell- und Dunkelmodus an Desktop- und Mobilbreite. Der
abschließende Gesamtcheck ist im zugehörigen Zweig dokumentiert.

## 2026-09-21 – Juna – Updateplan für Einkaufsablauf und Admin-Oberfläche abgestimmt

**Auftrag:** Fünfundzwanzig Rückmeldungen zu Einkaufserfassung,
Einkaufsübersicht, Einkaufsdetail, Artikelstamm, Verkäuferverwaltung,
Beta-Einstieg und globalem Header vollständig aufnehmen und vor der Umsetzung
fachlich klären.

**Änderung:** Die bestehenden Oberflächen und Zustandswege wurden mit den
Rückmeldungen abgeglichen. Die freigegebene Designspezifikation legt unter
anderem die einheitliche artikelbasierte Einkaufserfassung, sofortige
Kostenaktualisierung, stabile Einkaufstabellen, verständliche Chronik,
korrigierbare Belege, datenschutzfreundliche Beta-Duplikatantwort und den
vereinheitlichten Kopfbereich fest. Der technische Prüfbeleg verschwindet aus
dem Einkauf, bleibt aber zentral unter „Daten & Protokolle“ erhalten.

Als letzter Punkt ist eine geschützte Discord-Verknüpfung für freigeschaltete
Beta-Nutzer vorgesehen. Nach einer ausdrücklichen Discord-Autorisierung soll ein
Bot den Nutzer zum Server hinzufügen und automatisch die Rolle „Beta-Tester“
vergeben. Erst nach Abschluss der übrigen Arbeiten wird entschieden, ob diese
größere Integration noch in denselben Pull Request passt oder einen eigenen
Folge-Pull-Request erhält.

Der ausführbare Implementierungsplan teilt die Umsetzung in neun prüfbare
Arbeitspakete. Jedes Paket beginnt mit einem gezielt fehlschlagenden Test und
endet mit einer eigenen Prüfung und einem Conventional Commit. Die
Discord-Anbindung bleibt bis zur abschließenden Umfangsbewertung ausdrücklich
außerhalb der Produktivänderungen.

**Prüfung:** Reine Planungsrunde ohne Produktivcode. Alle sechs fachlichen
Abschnitte wurden einzeln bestätigt und die Spezifikation ordnet jeden der 25
gemeldeten Punkte ausdrücklich einer Lösung zu. Der Branch basiert auf dem
aktuellen `origin/master` einschließlich des zuletzt ergänzten
Beta-Ablehnungsablaufs.

## 2026-09-20 – Juna – Ablehnungen und erneute Beta-Bewerbungen vervollständigt

**Auftrag:** Abgelehnte Beta-Bewerbungen per E-Mail mitteilen, eine erneute
Bewerbung mit derselben E-Mail-Adresse eindeutig abweisen und dem Betreiber das
kontrollierte Löschen abgelehnter Einträge ermöglichen.

**Änderung:** Beim Ablehnen wird jetzt eine freundliche E-Mail in durchgängiger
Du-Ansprache versendet. Ein fehlgeschlagener Versand bleibt im Admin sichtbar
und kann dort erneut angestoßen werden. Die Bewerberliste bietet für abgelehnte,
noch nicht mit einem Nutzer verknüpfte Einträge eine geschützte Löschaktion mit
Bestätigungsdialog; erst danach ist die E-Mail-Adresse wieder für eine neue
Bewerbung frei.

Die Landingpage unterscheidet eine bereits abgelehnte E-Mail-Adresse von einer
erfolgreichen Bewerbung und zeigt dafür ein eigenes Dialogfenster, ohne die
Formulardaten zu verwerfen. Die Du-Ansprache für deutschsprachige Kunden-E-Mails
und Oberflächentexte ist zusätzlich als Projektregel dokumentiert. Die
Statusbadges kennzeichnen offene Bewerbungen orange, angenommene grün und
abgelehnte rot.

**Prüfung:** Der Datenbanktest deckt Berechtigungen, den Schutz offener und
verknüpfter Bewerbungen sowie Löschen und erneutes Bewerben ab. Edge-, Landing-
und Angular-Tests prüfen Ablehnung, Versandfehler, Wiederholungsversand, Löschung
und das eigene Hinweisfenster. Eine lokale Browserprüfung bestätigte Dialog,
Fokus, Inhalt und den Erhalt der Formulardaten. Der abschließende Gesamtcheck ist
im zugehörigen Zweig dokumentiert.

## 2026-09-20 – Juna – Landing-Kopfzeile reduziert und Beta-Mailversand aktiviert

**Auftrag:** Die Kopfzeile der Landingpage auf Logo, Design- und Sprachumschalter
sowie den App-Link reduzieren und den fehlgeschlagenen Versand der
Beta-Eingangsbestätigung in Produktion reparieren.

**Änderung:** Die Landingpage zeigt oben keine Bereichsnavigation und keinen
„Reselling OS“-Badge mehr. Der App-Link ist unabhängig von einem Merk-Cookie
immer sichtbar; die dadurch überflüssige Caddy-Vorlagenverarbeitung und
Cookie-Cachevariation wurden entfernt.

Auf dem Produktionsserver wurden die bereits vorhandenen SMTP-Werte an die
Beta-Funktionen durchgereicht und der aktuelle Stand von `beta-application`,
`beta-invite` sowie den gemeinsamen Mailbausteinen eingespielt. Die betroffene
Bewerbung wurde vom veralteten Status „ausstehend“ auf „fehlgeschlagen“ gesetzt,
damit der vorgesehene Wiederholungsversand im Betreiberbereich verfügbar ist.
Die Ausrollanleitung schützt künftig die Supabase-Systemordner `main` und `hello`,
wenn Repository-Funktionen synchronisiert werden.

**Prüfung:** Der Funktionsdienst ist nach der Korrektur gesund, enthält alle neun
benötigten `BETA_*`-Variablen und beantwortet eine ungültige Testanfrage wie
erwartet mit HTTP 400, ohne einen Datensatz anzulegen. Die gezielten Landingtests
prüfen die reduzierte Kopfzeile und die weiterhin sichere Skriptauslieferung.

## 2026-09-20 – Juna – Beta-Einstieg und CSP-Auslieferung repariert

**Auftrag:** Den wirkungslosen Beta-Button auf der Landingpage reparieren, den
Hero-Text allgemeiner formulieren, das Formular ans Seitenende verschieben und
alle KI-Beiträge künftig einheitlich unter dem Namen Juna führen.

**Änderung:** Der Hero verwendet den Einstieg „Dein Reselling. Klar organisiert.“
und führt mit „Kostenlos für die Beta anmelden“ per normalem Seitensprung zum
einzigen Bewerbungsformular am Seitenende. Die Formularlogik liegt nicht mehr als
eingebettetes Skript mit änderungsabhängigem CSP-Hash vor, sondern in der lokalen
Datei `landing/landing.js`; die CSP erlaubt weiterhin weder fremde Skripte noch
`unsafe-inline`.

Das Release-Abbild enthält nun auch das passende Caddyfile. Das Deployskript
prüft und aktiviert diese Konfiguration vor der Landingpage und stellt bei einem
Fehler den vorherigen Stand wieder her. Ein öffentlicher Nachtest prüft nach jedem
Produktionsdeployment Seite, Skript und CSP gemeinsam. `AGENTS.md` legt für neue
Branches, Changelog-Einträge und sonstige KI-Namensnennungen ausschließlich Juna
fest; die Git-Autorschaft bleibt beim Nutzer.

**Prüfung:** Die gezielten Landing-, CSP-, Deployment- und Workflow-Prüfungen
wurden im Rot-Grün-Verfahren ergänzt. `npm run verify` war vollständig grün:
2.653 Anwendungs- und DOM-Tests, 81 erfolgreiche Workflow-Tests (5 plattformbedingt
übersprungen), 10 Edge-Function-Tests und 15 Landingpage-Tests sowie Lint,
Typprüfung und Produktionsbau. Die manuelle Browserprüfung bestätigte den
Seitensprung bis zum Formular ohne Konsolenfehler oder -warnungen.

## 2026-09-20 – Codex (OpenAI) – Einkaufserfassung auf Verkäufer und Artikel reduziert

**Auftrag:** Die überladene Einkaufserfassung vereinfachen, die Kostenübersicht
an den bekannten Bestellaufbau angleichen und das Logo wieder mit dem Dashboard
verknüpfen.

**Änderung:** Verkäufer, Quelle und Kaufdatum stehen wieder am Anfang. Der
Verkäufer ist verpflichtend, wird aus den Stammdaten gewählt oder dort neu
angelegt und liefert den unveränderlichen Einkaufssnapshot im Hintergrund. Eine
Quelle kann direkt aus der Auswahl heraus erstellt werden. Beschreibung und
Referenznummer bleiben als schlanke Einkaufsdetails; Bezeichnung,
Plattform-Benutzername, Angebotslink, Plattform-Bestellnummer und die doppelte
Verkäuferanschrift sind entfernt. Die Datenbankmigration löscht die drei nicht
mehr verwendeten Einkaufsspalten, ohne die Bestellnummer von Verkäufen zu
berühren.

Die Kostenübersicht zeigt immer bestellte Artikel, Artikelanzahl, Anpassungen und
Gesamtbetrag – auch jeweils mit null Euro. Zusatzkosten stehen dazwischen. Die
Paketpreisverteilung und das Anlegen besonderer Paketpositionen sind aus der
Erfassung entfernt; normale selbst angelegte Platzhalterartikel bleiben möglich.
Sichtbare „optional“-Zusätze wurden anwendungsweit entfernt, Pflichtfelder tragen
den gelben Stern. Das Flipbase-Logo führt wieder zum Dashboard.

**Prüfung:** Nach dem Abgleich mit dem aktuellen `origin/master` waren der
Datenbank-Reset und alle 1.945 Datenbanktests erfolgreich. Der vollständige
Verifikationslauf bestand Formatierung, Lint, Typprüfung, 82 Workflow-Prüfungen
(davon fünf plattformbedingt übersprungen), 10 Edge-Tests, das Suite-Audit mit
2.357 Testdefinitionen, 2.638 Anwendungs-, 15 Landing-Tests und den
Produktionsbau. Zusätzlich waren alle neun verpflichtenden Chromium-Abläufe
erfolgreich. Dabei gefundene veraltete Erwartungen an offene Preise und ein
fälschlich als geändert markierter geladener Einkauf wurden korrigiert und erneut
geprüft.

## 2026-09-20 – Codex (OpenAI) – Beta-Produktionsgrenzen und Gesamtweg abgesichert

**Auftrag:** Die fertige Beta-Anmeldung vor dem Pull Request unabhängig prüfen,
Produktionsblocker beheben und den vollständigen Weg bis zum gestarteten Zugang
nachweisen.

**Änderung:** Die selbstgehostete Auth-Konfiguration sperrt öffentliche Signups
jetzt auch im Produktions-Override und erlaubt den genauen Rücksprung zur
Passwortvergabe. `beta-application`, `beta-invite` und `_shared` werden laut
Ausrollanleitung gemeinsam veröffentlicht; die App-Zieladresse ist eine eigene
Funktionsvariable. Lokale Browserkonten entstehen über die lokale Admin-Grenze,
damit Tests die geschlossene Registrierung nicht umgehen.

Ein fehlgeschlagener Einladungsversand bleibt im Annahmedialog sichtbar und lässt
sich dort direkt wiederholen. Bewerbung und Nutzerübersicht unterscheiden aktive,
abgelaufene und noch ausstehende Beta-Zugänge; bei aktiven Zugängen stehen die
verbleibenden Tage dabei. Eine fehlgeschlagene automatische Aktivierung kann bei
einem späteren Sitzungsereignis erneut laufen. Der Dankesdialog sperrt während der
Anzeige den Seitenhintergrund tatsächlich und verwendet die eindeutige Aktion
„Schließen“.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung, 82
Workflow-Prüfungen, 10 eingebundenen Deno-Tests, Suite-Audit, 1.441 Node-, 239
DOM-, 973 Angular- und 15 Landing-Tests sowie Produktionsbau. Der isolierte
Datenbank-Neuaufbau und alle 19 Betreiber-Datenbanktests bestanden. Zwei echte
Chromium-Abläufe bestätigten, dass freie Registrierung scheitert, Betreiber weiter
einladen können und Freigabe, Mail-Link, Passwortvergabe, Verknüpfung sowie der
Start einer exakt 60 Tage langen Beta gemeinsam funktionieren. Weiterhin nur die
drei bekannten NG8113-Bauhinweise in Dashboard, Einkäufen und Verkäufern.

## 2026-09-20 – Codex (OpenAI) – Inseratserstellung in den Übersichtsablauf eingeordnet

**Auftrag:** Die Inseratserstellung wie beim Einkauf nur aus der Übersicht öffnen
und die missverständliche Bezeichnung der festen Textvarianten klären.

**Änderung:** „Inserate“ ist ein einzelner Navigationspunkt ohne eigenes Untermenü
für Übersicht und Erstellen. Die technische Editorroute bleibt für die Aktion
„Inserat erstellen“ erhalten. Der Editor bietet einen beschrifteten Rückweg zur
Inseratsübersicht. Die bisherige Auswahl „Textstil“ heißt jetzt „Textvorlage“, die
neutrale Variante ist verständlich benannt und ein Hinweis erklärt, dass feste
Formulierungen mit Artikeldaten ohne KI verwendet werden.

**Prüfung:** Die gezielten Navigations- und Angular-Komponententests wurden zunächst
mit den alten Abweichungen rot und nach der Korrektur mit 14 beziehungsweise 12
Tests grün ausgeführt. Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Alten Inseratsentwurfsspeicher entfernt

**Auftrag:** Den zweiten Schritt des Listing Studio umsetzen: den ungenutzten alten
Entwurfsspeicher und den überholten Mehrplattform-Generator nach einer
Produktionsprüfung sicher entfernen.

**Änderung:** Die Produktion enthielt keine Zeile in `public.listing_drafts`; auch
alle zusammengefassten Prüfungen auf ungültige oder verwaiste Daten und Konflikte
mit aktuellen Inseraten ergaben null. Es wurden keine Inhalte einzelner Datensätze
gelesen. Die neue Release-Migration sperrt die Tabelle während der erneuten
Leerprüfung exklusiv und bricht vor jeder Änderung mit SQLSTATE `55000` ab, falls
nach dieser Prüfung doch wieder ein alter Entwurf entstanden ist. Das deklarative
Schema, die Archivierungsregistrierung und die generierten Typen enthalten die alte
Tabelle nicht mehr. Im Frontend bleibt nur der tatsächlich verwendete
Kleinanzeigen-Textgenerator als kleiner Dienst im Inserate-Feature;
unbenutzte eBay-, Vinted-, Webshop-, HTML-, SEO- und Direktveröffentlichungswege
sind entfernt.

**Prüfung:** Der Migrationsschutz wurde in einer Wegwerf-Datenbank in drei Fällen
geprüft: Ein vorhandener und ein parallel geschriebener Datensatz stoppten die
Migration und blieben erhalten; eine leere Tabelle wurde entfernt. Der
Datenbank-Reset, 62 gezielte Inserate-, 100 Archivierungs- und alle 1.937
Datenbankprüfungen bestanden. `npm run verify` war mit 1.428 Node-, 239 DOM-, 946
Angular- und 13 Landing-Tests sowie Format, ESLint, Typprüfung,
Workflow-Prüfungen, Suite-Audit und Produktionsbau grün. Alle sieben
PR-Chromium-Abläufe bestanden. Der Bau meldet weiterhin die drei bekannten
NG8113-Hinweise außerhalb des Inserate-Bereichs; der unveränderte
Steuerjournal-Ablauf meldet weiterhin den bestehenden NG0956-Laufzeithinweis.
Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Verpflichtende Workspace-Ersteinrichtung ergänzt

**Auftrag:** Nach der eingeladenen Beta-Registrierung beim ersten App-Aufruf nur
die tatsächlich benötigte Initialangabe abfragen: den Namen des bereits
angelegten Workspace. Keine Steuerart, Zielwerte, Firmen-, Rechnungs- oder
Zahlungsdaten vorwegnehmen.

**Änderung:** Workspaces besitzen nun einen ausdrücklichen Abschlusszeitpunkt
für die Ersteinrichtung. Die Migration markiert alle bereits vorhandenen
Workspaces als abgeschlossen; ein durch die Registrierung erzeugter
Beta-Workspace bleibt offen. Manuell zusätzlich erstellte Workspaces sind
sofort abgeschlossen. Die bestehende Beta-Laufzeit startet weiterhin bei der
erfolgreichen Passwortvergabe und wird von der neuen Seite nicht verschoben.

Ein unvollständiger Workspace wird vor Dashboard und Shop auf eine
eigenständige, zugängliche Ein-Feld-Seite geleitet. Dort wird ausschließlich
ein getrimmter Name mit 2 bis 100 Zeichen gespeichert. Der vorhandene
Workspace wird serverbestätigt aktualisiert und nicht doppelt angelegt.
Lade- und Speicherfehler bleiben sichtbar und wiederholbar; Abmelden verwendet
die bestehende Sitzungsfunktion. Vorhandene Flipbase-Farben, Logo und
Button-Komponenten wurden wiederverwendet. Nach erfolgreichem Abschluss führt
der Ablauf ins Dashboard und lässt sich nicht erneut öffnen.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung,
Workflow- und Suite-Audit, 1.448 Node-, 240 DOM-, 960 Angular- und 15
Landing-Tests sowie Produktionsbau. Die fokussierten 24 Workspace-Service-,
6 Guard- und 7 Seiten-/AXE-Tests bestanden. Der isolierte Datenbanktest bestand
mit 19 Prüfungen nach einem sauberen Neuaufbau; der gemeinsame Admin-UI-Check
meldete bei 95 Dateien keine Abweichung. Weiterhin nur die drei bekannten
NG8113-Hinweise in Dashboard, Einkäufen und Verkäufern. Kein Push, kein PR und
kein Merge.

## 2026-09-20 – Codex (OpenAI) – Beta-Anmeldeweg und Betreiberfreigabe umgesetzt

**Auftrag:** Die Beta-Anmeldung auf der Landingpage verlässlich abschließen, die
Bewerbung im Betreiberbereich mit einer 60-Tage-Vorgabe annehmen und den
eingeladenen Nutzer bis zur Registrierung und gestarteten Beta nachvollziehbar
mit der Bewerbung verbinden. Vorhandene Dialoge, Tabellen und Status-Badges
weiterverwenden und die spätere Abrechnung vorbereiten, aber noch nicht bauen.

**Änderung:** Beide Beta-Formulare zeigen nach erfolgreicher Speicherung einen
zugänglichen Dankesdialog. Der Bewerber erhält sofort eine gestaltete
Eingangsbestätigung ohne Registrierungslink; ein Versandfehler wird im Dialog
sichtbar, ohne die gespeicherte Bewerbung zu verlieren. Im Betreiberbereich
öffnet „Annehmen“ nun einen vorhandenen Dialogbaustein mit Name, E-Mail und
änderbaren, auf 60 Tage voreingestellten Laufzeit. Einladungs- und
Bestätigungsmails lassen sich nach Fehlern erneut senden, und die Liste zeigt
offen, abgelehnt, Einladung fehlgeschlagen, wartet auf Registrierung oder Beta
gestartet mit den vorhandenen Badges.

Die Einladung trägt die Bewerbungs-ID in das Auth-Konto. Der bestehende
Registrierungstrigger verbindet dadurch Bewerbung, Nutzer, Profil, Workspace
und eine getrennte Workspace-Lizenz. Deren Laufzeit startet idempotent erst
nach erfolgreicher Passwortvergabe, nicht beim Öffnen des Einladungslinks. Eine
neue Betreiberseite „Nutzer“ zeigt Registrierung, Workspace und Beta-Zeitraum.
Öffentliche Registrierungen sind für die Beta geschlossen; die bisherige
Registrierungsadresse führt zum Login. Das Zugangsmodell trennt die Beta schon
von einem späteren Abonnement, ohne Stripe-, Rechnungs- oder Zahlungslogik
vorwegzunehmen.

**Prüfung:** `npm run verify` erfolgreich mit Format, ESLint, Typprüfung,
Workflow- und Suite-Audit, 1.441 Node-, 240 DOM-, 947 Angular- und 15
Landing-Tests sowie Produktionsbau. Die 10 Deno-Tests für E-Mail und Einladung,
der saubere lokale Datenbank-Neuaufbau und alle 19 fokussierten
Betreiber-Datenbanktests bestanden. Der gemeinsame Admin-UI-Check meldete bei
94 Dateien keine Abweichung. Weiterhin nur die drei bekannten NG8113-Hinweise
in Dashboard, Einkäufen und Verkäufern. Kein Push, kein PR und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Kontrollreview-Funde im Listing Studio behoben

**Auftrag:** Die bestätigten Blocker aus dem Kontrollreview selbst beheben und den
Branch erneut vollständig prüfen.

**Änderung:** Der Editor verhindert doppelte offene Inserate, erklärt unzulässige
Artikelzustände und verlinkt das bestehende Inserat. Manuelle Texte werden nur nach
Bestätigung ersetzt; Textvorlagenoptionen, Kopieren, vollständige Validierung,
Beschriftungen und Bildwarnungen sind ergänzt. Die mobile Übersicht blendet die
Desktop-Tabelle aus und bietet alle Statusaktionen auf den Karten. Die
Erweiterungsprüfung endet bei ausbleibender Antwort. Generator und Editor verwenden
jetzt eine typisierte Artikelzuordnung und begrenzen Kleinanzeigen-Titel zentral.

Die Datenbankfunktionen sperren Einkauf, Advisory Lock, Artikel und Inserat in einer
einheitlichen Reihenfolge. Die praktisch reproduzierten Deadlocks zwischen
Verkaufstrigger und manuellem Beenden sowie zwischen Einkaufsfinalisierung und
Online-Setzen treten damit nicht mehr auf. Übersicht, Editor, Erweiterung und der
vollständige mobile Inserats-Lebenszyklus sind durch neue Tests abgesichert; die
verbindliche PR-Browsersuite enthält nun sieben Kernfälle. Der Abschlussbericht
liegt unter `docs/audit/2026-09-20-listing-studio-control-fixes.md`.

**Prüfung:** `npm run verify` erfolgreich mit 1.437 Node-, 240 DOM-, 936 Angular-
und 13 Landing-Tests sowie Format, ESLint, Typprüfung und Produktionsbau. Alle 1.939
Datenbankprüfungen und sieben PR-Chromium-Abläufe bestanden; die beiden fokussierten
Listing-Studio-Browserabläufe waren ebenfalls grün. Die kontrollierten
Paralleltests reproduzierten vor der Korrektur beide PostgreSQL-Deadlocks und liefen
danach ohne Sperrkreis. Weiterhin nur die drei bekannten NG8113-Bauhinweise
außerhalb des Inserate-Bereichs. Kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Kontrollreview des gespeicherten Listing Studio

**Auftrag:** Den mit Terra umgesetzten Branch vor einem Pull Request unabhängig
gegen Spezifikation, Umsetzungsplan und Projektregeln prüfen.

**Befund:** Datenmodell, RLS, Workspace-Zuordnung, Migrationen und die grundlegende
Statuskopplung sind tragfähig. Der Branch ist trotzdem noch nicht bereit für einen
Pull Request. Im Erstellen-Dialog können Artikel mit bereits offenem Inserat erneut
ausgewählt werden; dadurch lässt sich der bestätigungspflichtige Ablauf zum erneuten
Einstellen umgehen. Der Editor überschreibt manuell bearbeitete Texte ohne Nachfrage,
zeigt mehrere vorhandene Vorlagenoptionen nicht an, warnt bei fehlenden Bildern nicht
und behandelt ein unverändertes neues Formular bereits als ungespeichert. Titel und
Beschreibung haben keine programmatisch zugeordneten Beschriftungen. Die mobile
Übersicht zeigt zusätzlich zur Kartenansicht weiterhin die Desktop-Tabelle; die Karten
selbst enthalten keine Aktionen. Eine fehlende Browser-Erweiterung lässt den
Prüfknopf dauerhaft im Ladezustand. Die unterschiedliche Sperrreihenfolge zwischen
Inseratsaktionen und Verkaufstrigger kann bei parallelen Aktionen außerdem einen
Datenbank-Deadlock erzeugen.

Die im Plan vorgesehenen Übersichts-, Editor-, AXE- und Browser-Abnahmen wurden nur
zu einem kleinen Teil umgesetzt: Es gibt keinen Übersichts-Komponententest, zwei
Editorfälle statt der geplanten Ablaufsmatrix, keinen `e2e/listing-studio.spec.ts`
und keinen Abschlussbericht unter `docs/audit/`. Der bestehende Abschlussvermerk war
damit zu weitgehend.

**Prüfung:** Vollständiger Branch-Diff gegen den unveränderten Stand von
`origin/master` (`a845cf4d`), Spezifikation, Umsetzungsplan, SQL-Sperrreihenfolge,
Frontendzustände und vorhandene Tests geprüft. Die bestehende PR-Browsersuite bestand
mit 6/6 Tests; sie enthält keinen Inserate-Fall. Die fokussierte Datenbanksuite bestand
mit 61/61 Tests; sie enthält keinen konkurrierenden Verkauf-vs.-Beenden-Fall. Keine
Produktkorrektur, kein Push und kein Merge.

## 2026-09-20 – Codex (OpenAI) – Gespeicherte Kleinanzeigen-Inserate umgesetzt

**Auftrag:** Den bestätigten ersten Schritt des Listing Studio umsetzen: gespeicherte
Kleinanzeigen-Inserate mit Übersicht, Editor, Statusablauf und Browser-Erweiterung.

**Änderung:** Inserate werden je Workspace mit vorbereiteten, online gestellten und
beendeten Zuständen gespeichert. Datenbankfunktionen schützen Mitgliedschaft,
archivierte Workspaces, nicht verkaufsfähigen Bestand, wieder geöffnete
Paketeinkäufe und parallele Vorbereitungen. Die neue Übersicht und der gemeinsame
Editor verwenden diese Funktionen, erzeugen Kleinanzeigen-Texte aus dem Bestand
und übergeben nur frisch signierte Bilder an die Erweiterung. Die Navigation führt
jetzt zu „Inserate“ mit Übersicht und Erstellen; der frühere Generator-Bildschirm
wurde entfernt.

**Prüfung:** Lokaler Datenbank-Reset, 61 fokussierte Inseratstests, 1.939
Datenbanktests, zwei parallele psql-Aufrufe, gezielte Angular- und DOM-Tests,
Typprüfung, Produktionsbau sowie die Shared-UI-Prüfung liefen erfolgreich. Die
abschließende vollständige Prüfung bestand mit 1.436 Node-, 238 DOM-, 922
Angular- und 13 Landing-Tests, Formatierung, ESLint, Typprüfung und
Produktionsbau. Der Bau meldet weiterhin die drei bekannten NG8113-Hinweise zu
ungenutzten LucideDynamicIcon-Importen außerhalb dieses Bereichs. Kein
Push/Merge.

## 2026-09-20 – Codex (OpenAI) – Listing-Studio-Entwurf auf aktuellen Stand gebracht

**Auftrag:** Nach Abschluss der Einkaufsarbeiten klären, ob die Inserate-Seite
bereits fertig ist, und die Weiterarbeit am gespeicherten Listing Studio
vorbereiten.

**Änderung:** Der alte Entwurf vom 17.09.2026 wurde gegen `master` bei
`a845cf4d` geprüft. Die bestehende Kleinanzeigen-Übertragung bleibt Grundlage;
gespeicherte Inserate, Übersicht und Statusablauf fehlen weiterhin. Eine neue
Spezifikation übernimmt die bestätigten Fachentscheidungen, verwendet die
aktuelle Schemareihenfolge mit `230_listings.sql` und entfernt alle inzwischen
veralteten Demo-Annahmen. Die alte Tabelle `listing_drafts` bleibt in Schritt 1
als Sicherheitsnetz bestehen und wird erst nach belegter Datenprüfung in einem
zweiten PR migriert oder entfernt.

Darauf aufbauend beschreibt ein neuer Umsetzungsplan PR 1 in neun
testgetriebenen Aufgaben: Fachmodelle, Datenbank und Rechte, transaktionale
Statusfunktionen, workspace-sicherer Service, Erweiterungsbrücke, Übersicht,
Editor, Routen/Navigation sowie Browser- und Abschlussprüfung. Der Plan nennt
für jede Aufgabe konkrete Dateien, Schnittstellen, RED-/GREEN-Befehle und
Commits.

**Prüfung:** Aktuelle Routen, Navigation, Listing-Service, deklaratives Schema,
Schema-Registrierung, Demo-Entfernung und der reine Dokumentationszweig
`feat/listing-studio-listings` wurden gelesen. Die Spezifikation wurde auf
Platzhalter, widersprüchliche Statusregeln und den abgegrenzten Zwei-PR-Umfang
geprüft. Noch keine Produktänderung und keine Anwendungstests.
Der Umsetzungsplan wurde zusätzlich gegen jede Spezifikationsrubrik, die
Typnamen zwischen den Aufgaben, verbotene Platzhalter und fünf besonders
riskante Fehlerklassen geprüft. Dabei wurde die Sperre für Paketartikel aus
wieder geöffneten Einkäufen ausdrücklich in die neue Security-Definer-Funktion
aufgenommen, weil der ältere Trigger den Datenbankbesitzer bewusst ausnimmt.

## 2026-09-20 – Codex (OpenAI) – Einkaufsübersicht und offene Preise abgesichert

**Auftrag:** Die vereinbarten Schutzregeln für Einkaufslisten und die
fachliche Erweiterung für offene Positionspreise umsetzen.

**Änderung:** Die Einkaufsübersicht verwendet die gemeinsamen
Tabellen-Grenzen, zeigt Verkäuferdaten vor dem optionalen Titel und macht einen
Vinted-Einkauf ohne gespeicherten Verkäufer nach dem erneuten Öffnen über
Plattform-Benutzernamen und Bestellnummer eindeutig. Normale Einkaufspositionen
können nun einen offenen Preis im Entwurf behalten und erneut gespeichert
werden. Ein expliziter Preis von 0,00 € bleibt ein bezahlter Preis. Offene
Preise werden verständlich angezeigt und sperren Abschluss, Ankunft,
Wareneingang sowie jede Übernahme in Bestand und Bestandslose. Der allgemeine
Status `open` ergänzt den erhaltenen Altwert `unpriced_mystery`; Schema,
generierte Migration, Datenbankfunktionen und Supabase-Typen wurden zusammen
aktualisiert.

**Prüfung:** Gezielte Service-, Komponenten-, pgTAP- und Chromium-Regressionen
für offenen Preis, 0,00 €, Speichern, erneutes Öffnen sowie die Sperren liefen
grün. `npm run verify` bestand mit Formatierung, Lint, Typprüfung,
Architektur- und Suite-Audit sowie 1.421 Node-, 235 DOM-, 927 Angular- und 13
Landing-Tests. `npm run test:db` bestand mit 52 Dateien und 1.878 Tests,
`npm run test:e2e:pr` mit sechs Chromium-Tests und die vollständige
Einkaufs-Regression mit zwei Chromium-Tests. Der Produktionsbau meldet weiter
die drei bekannten NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Restarbeiten der Demo-Entfernung behoben

**Auftrag:** Die drei bestätigten Lücken aus der kritischen Nachprüfung beheben.

**Änderung:** Retouren, Preisradar und Versand übernehmen keine Geschäftsdaten
mehr aus globalen Browser-Caches. Retouren und Preisradar leeren ihren Zustand
bei Abmeldung oder Workspace-Wechsel und verwerfen verspätete Antworten des
vorherigen Workspaces. Neue Preisbeobachtungen enthalten ohne angebundene
Marktdatenquelle keine erfundenen Vergleichspreise, Wettbewerber, Verläufe oder
Alarme; gespeicherte Altwerte werden in diesem Zustand weder angezeigt noch für
Preisanpassungen verwendet.

Die Beispielkonten und die fest eingebaute Absenderadresse im Versand sind
entfernt. Absenderdaten werden nun je Workspace in `carrier_configs` gespeichert
und in den Versand-Einstellungen gepflegt. Ohne vollständige Adresse bleibt der
Etikettendruck mit einem verständlichen Hinweis gesperrt. Beim manuellen Versand
wird außerdem keine Ersatz-Sendungsnummer mehr erfunden. Deklaratives Schema,
Migration und generierte Supabase-Typen wurden gemeinsam aktualisiert.

Der unabhängige Abschlussreview fand weitere Wechsel- und Fehlerpfade. Laufende
Schreibantworten dürfen nun keine Daten in einen inzwischen ausgewählten anderen
Workspace übernehmen; offene Versanddialoge und ausgewählte Aufträge werden beim
Wechsel geleert. Alte Marktwerte bleiben über einen dauerhaften Vertrauensstatus
auch nach einer späteren Quellenanbindung gesperrt. Absender-Pflichtfelder weisen
Leerzeichen sowie ungültige E-Mail-Adressen verständlich aus. Ladefehler der
Versandkonfiguration enden in einem sichtbaren Fehlerzustand mit erneutem Versuch.
Der Kontrollreview ergänzte die Absicherung laufender Versandaktionen beim Wechsel
und die tatsächliche, idempotente Löschung der vier früheren Browser-Cache-Schlüssel.
Ein abschließender Release-Review zeigte, dass diese Bereinigung noch vom Öffnen
eines betroffenen Bereichs abhing. Sie läuft deshalb nun direkt nach der alten
Speichermigration und vor dem Angular-Start; dadurch können migrierte Altwerte
nicht erneut als globale Geschäftsdaten liegen bleiben.

**Prüfung:** Die Regressionstests wurden vor der Umsetzung rot und danach grün
ausgeführt. Die Gesamtprüfung bestand mit 1.419 Node-, 235 DOM-, 920 Angular- und
13 Landing-Tests sowie Formatprüfung, ESLint, Typprüfung und Produktionsbau.
Schema-/Migrationsprüfungen, lokaler Datenbank-Reset und 1.857 Datenbanktests
bestanden ebenfalls. Der Bau meldet weiterhin drei bekannte NG8113-Hinweise zu
ungenutzten `LucideDynamicIcon`-Importen. Drei unabhängige Branch-Reviews lieferten
zusammen acht wichtige Befunde; sie wurden behoben. Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Kritische Nachprüfung der Demo-Entfernung

**Auftrag:** Prüfen, ob der zuletzt integrierte Stand vollständig und sauber ist.

**Ergebnis:** Drei verbliebene Lücken bestätigt: fehlende Workspace-Isolation in
Retouren und Preisradar, weiterhin erfundene Marktwerte beim Anlegen von
Preisbeobachtungen und fest eingebaute Absenderdaten in der Versandansicht.
Die frühere Aussage „Demo-Code vollständig entfernt“ war zu weitgehend.
Die Stellen bestanden bereits vor PR #131. Befunde, Umfang und Abnahmekriterien
stehen in [der Nachprüfung](audit/2026-09-19-demo-removal-follow-up.md).

**Prüfung:** 28 vorhandene Node-Tests bestanden. Fünf temporäre DOM-Reproduktionen
bestätigten das Fehlverhalten; die Testdatei wurde danach entfernt. Kein erneuter
Gesamt-Testlauf oder Bau. Nur Dokumentation geändert, keine Fehlerbehebung,
kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code vollständig entfernt

**Auftrag:** Den letzten Abschnitt des Demo-Code-Umbaus abschließen: Anmeldung,
Shell, Umgebungen, Übersetzungen, Ausgaben und Fixkosten bereinigen und den
Ersatz-Datenspeicher löschen.

**Änderung:** Der Zugang zum Demo-Modus, die Demo-Anmeldung, Hinweise in der
Shell und die Umgebungseinstellung sind entfernt. Ausgaben, Kategorien,
wiederkehrende Ausgaben und Belege verwenden nur noch Supabase. Der rund 2.550
Zeilen große Ersatz-Datenspeicher sowie ausschließlich davon abhängige
Kategorien und Kommentarmodelle sind gelöscht. Lokale Client-IDs tragen keinen
Demo-Begriff mehr.

Eine erweiterte Inhaltssuche fand zusätzlich fest eingebaute Versand-, Radar-
und Retourendaten sowie eine erfundene Workspace-ID im Aktivitätsprotokoll.
Diese Rückfälle sind entfernt. Leere Datenbankantworten räumen nun veraltete
lokale Retouren und Radarartikel auf. Tests setzen ihre Beispieldaten selbst,
statt dafür öffentliche Demo-Ladefunktionen in den App-Diensten zu benötigen.

**Prüfung:** Die betroffenen Tests wurden vor den Änderungen gezielt rot und
danach grün ausgeführt. `npm run verify` bestand vollständig: Formatierung,
ESLint, Typprüfung, Workflow- und Suite-Audit, 1.401 Node-, 232 DOM-, 918
Angular- und 13 Landing-Tests sowie Produktionsbau. Der Bau meldet weiterhin
drei bekannte NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen. Kein
Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Workspace, Einstellungen und Vinted Bot

**Auftrag:** Den vierten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Workspace, Einstellungen, Dashboard-Einstellungen und dem
Vinted-Bot entfernen.

**Änderung:** Workspaces, Mitglieder, Webhooks sowie Tabellen- und
Dashboard-Einstellungen verwenden nur noch den angemeldeten Nutzer und den
aktuellen Workspace. Der Vinted-Bot lädt Kategorien, Filter und Favoriten ohne
Demo-Sonderfall; zugehörige Hinweise und Tests sind entfernt.

**Prüfung:** 44 fokussierte Node-Tests und 45 Angular-Tests bestanden. Zusätzlich
bestanden Typprüfung, ESLint, projektweite Prettier-Prüfung und Produktionsbau.
Der Bau meldet weiterhin drei bekannte, paketfremde NG8113-Hinweise zu
ungenutzten `LucideDynamicIcon`-Importen. Kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Verkauf, Finanzen und Prüfung

**Auftrag:** Den dritten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Verkauf, Finanzen, Prüfprotokoll und zugehörigen Oberflächen
entfernen.

**Änderung:** Verkauf, Retouren, Rechnungen, Bankabgleich, Fulfillment,
Preisrecherche, Geschäftsereignisse und Prüfexporte verwenden ausschließlich
Supabase. Die Buchhaltung bietet keine erfundenen Kontoauszüge mehr. Daten und
Prüfung richtet den Zugriff nur noch nach der geladenen Workspace-Rolle aus;
Demo-Hinweise und lokale Prüfkommentare sind entfernt.

**Prüfung:** 85 fokussierte Node-Tests, 14 fokussierte DOM-Tests, 15 fokussierte
Angular-Tests und zusätzlich 33 Tests für Buchhaltungsaktionen und Daten &
Prüfung bestanden. Typprüfung, ESLint, projektweite Prettier-Prüfung und
Produktionsbau bestanden ebenfalls. Der Bau meldet weiterhin drei bekannte,
paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen. Kein
Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Bestand, Katalog und Medien

**Auftrag:** Den zweiten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Bestand, Katalog, Medien, Lagerzugängen, Kategorien, Marken und
den Inventaransichten entfernen.

**Änderung:** Alle genannten Dienste laden und verändern Daten ausschließlich
über Supabase. Die Ansichtseinstellungen sind nur noch nach angemeldetem Nutzer
und Workspace getrennt. Ein Test für ausschließlich lokal erzeugte Demo-IDs
entfällt; die übrigen Tests prüfen bestätigte Datenbankantworten.

**Prüfung:** 139 fokussierte Node-Tests, 31 fokussierte DOM-Tests und 6
Angular-Tests bestanden. Zusätzlich bestanden Typprüfung, ESLint,
projektweite Prettier-Prüfung und Produktionsbau. Der Bau meldet weiterhin drei
bekannte, paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex GPT-5.6 Terra (OpenAI) – Demo-Code: Einkaufsbereich

**Auftrag:** Den ersten Abschnitt des vereinbarten Umbaus umsetzen: den
Demo-Modus aus Einkauf, Stammdaten für Quellen und Lieferanten,
Einkaufsbelegen, Kostenverteilung und der Paket-Erfassung entfernen.

**Änderung:** Die genannten Dienste verwenden nur noch bestätigte
Supabase-Antworten. Die Einkaufsdetailseite, Belegkarte und Paket-Erfassung
enthalten keine Demo-Sperren mehr. Sechs Tests, die ausschließlich den
Browser-Demo-Speicher abdeckten, sind entfernt. Neue DOM-Tests belegen, dass
Quellen und Lieferanten ohne Demo-Speicher direkt über die Datenbank angelegt
werden.

**Prüfung:** 146 fokussierte Node-Tests, 37 fokussierte DOM-Tests und 9
Angular-Tests bestanden. Zusätzlich bestanden Typprüfung, ESLint,
projektweite Prettier-Prüfung und Produktionsbau. Der Bau meldet weiterhin drei
bekannte, paketfremde NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.
Kein Push/Merge.

## 2026-09-19 – Codex (OpenAI) – Prüfung und Nachbesserung der vier Terra-Pakete

**Auftrag:** Die mit Terra umgesetzten Pakete 1–4 (PRs #126–#129) auf Qualität,
verbliebene Fehler und Eignung für die weitere Arbeit prüfen und die bestätigten
Fehler anschließend beheben.

**Ergebnis:** Vier Befunde wurden reproduziert und behoben: Nach schnellem
A→B→A startet wieder eine frische Ausgabenabfrage; die Seitennavigation sortiert
zusätzlich eindeutig nach ID; Belegstatus-Abfragen werden in kurze Pakete geteilt
und vollständig paginiert; die Komponentensuite verwendet eine feste Testzeit.
Die IN-Abfrage für Belege war eine ältere Schwäche, die bei der zugesagten
Unterstützung großer Listen unberücksichtigt blieb. Kein vollständiger Neuaufbau
war nötig; Terra bleibt für begrenzte Aufgaben brauchbar, sensible Änderungen
brauchen unabhängige Prüfung.

**Prüfung:** Vor der Korrektur schlugen die neuen Regressionen für A→B→A,
eindeutige Sortierung, 1.001 Ausgaben-IDs und mehr als 1.000 Belegzeilen gezielt
fehl. Vier vorhandene Seitentests wurden mit Oktober-Uhrzeit rot ausgeführt.
Zusätzlich wurden eine doppelte ID über SQL-Seitengrenzen und HTTP 414 lokal
nachgewiesen. Nach der Korrektur bestanden 32 fokussierte Service-DOM-, 44 Node-,
26 Angular- und 157 Datenbanktests. `npm run verify` bestand vollständig mit
1.449 Node-, 305 DOM- und 926 Angular-Anwendungstests sowie Produktionsbau; es
blieben nur drei bekannte NG8113-Hinweise. Kein Push/Merge.

**Dokumentation:** `docs/audit/2026-09-19-terra-implementation-review.md`.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Ausgabenzeitraum und nächste Fälligkeit

**Auftrag:** Den vierten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Ausgaben nach einem eindeutig benannten Monat anzeigen, Summen und Tabelle auf
denselben Filter beziehen sowie die nächste Fälligkeit von der 30-Tage-Vorschau
entkoppeln.

**Änderung:** Die Ausgabenseite startet nun im aktuellen Monat. Vor- und
Zurückschalten sowie „Alle“ stehen in der gemeinsamen Tabellenleiste zur
Verfügung; „Ansicht zurücksetzen“ stellt wieder den aktuellen Monat her.
Tabelle und drei Summenkarten verwenden dieselbe Menge aus Zeitraum, Suche,
Kategorie und Status. Der sichtbare Hinweis benennt dafür ausdrücklich das
Rechnungs- beziehungsweise Ausgabedatum. Gelöschte Ausgaben bleiben auch bei
einem unerwarteten Client-Datensatz ausgeschlossen.

Die wiederkehrende Tabelle berechnet ihre nächste Fälligkeit direkt aus der
Regel. Dadurch zeigt eine Jahresregel im Dezember auch im September einen
Folgetermin, obwohl sie nicht zur 30-Tage-Vorschau gehört. Der Gesamtbetrag
bleibt unabhängig von der Menge unverändert. Ein Dashboard-Regressionstest
belegt zusätzlich: Eine August-Rechnung zählt erst nach der September-Zahlung
zum Cashflow; offene und gelöschte Ausgaben verändern ihn nicht und die
Verkaufsmarge bleibt getrennt.

**Prüfung:** Die neuen Tests wurden zuerst gegen den alten Stand ausgeführt und
schlugen erwartungsgemäß für Monatsfilter und Jahresfälligkeit fehl. Danach
bestanden die fokussierten Angular-Tests (16) und die zugehörigen Node-Tests
(36) sowie Prettier und ESLint. `npm run verify` bestand anschließend mit
2.676 Anwendungstests, Typprüfung, Workflow- und Test-Audit sowie
Produktionsbau. Der Bau meldet weiterhin drei bekannte, paketfremde
NG8113-Hinweise zu ungenutzten `LucideDynamicIcon`-Importen.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Archivierung und vollständiger Ausgabenexport

**Auftrag:** Den dritten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Archivierte Workspaces vollständig gegen Änderungen schützen, eine verständliche
Löschentscheidung für reine Ausgaben-Workspaces liefern und das Prüfarchiv um
Ausgaben, Belege und die tatsächlichen Originaldateien ergänzen.

**Änderung:** Archivierte Workspaces sperren nun auch Ausgabenkategorien,
Wiederholungsregeln, Ausgaben, Einkaufsbelege und Ausgabenbelege. Das gilt für
Metadaten und für die drei zugehörigen Storage-Buckets. Ein Workspace mit
Ausgaben, Wiederholungsregeln oder Belegen meldet beim Löschen gezielt den
bekannten Aufbewahrungsfehler; leere Standard- oder eigene Kategorien allein
verhindern die Löschung nicht.

Das vollständige Archiv enthält zusätzlich Kategorien, Wiederholungsregeln,
Ausgaben sowie beide Belegmetadaten. Verfügbare Originalbelege liegen mit ihrem
stabilen Storage-Pfad unter `documents/` im ZIP. `document-downloads.json`
protokolliert jede einbezogene oder fehlende Datei. Bei fehlenden Originaldateien
zeigt die Oberfläche eine Warnung mit der tatsächlichen Anzahl, statt den Export
uneingeschränkt als Erfolg auszugeben.

Ausgaben, Statuswechsel, Betrag-/Datumsänderungen, Entfernen/Wiederherstellen,
Wiederholungsregeln und Ausgabenbelege erzeugen jetzt nachvollziehbare
Prüfprotokollereignisse. Der Filter und die Bezeichnungen auf „Daten &
Protokolle“ kennen den Bereich „Ausgaben“.

**Qualität:** Der Node-Test-Auditor prüft Browser-Globals jetzt als echte
TypeScript-Bezeichner. Namen in Testdaten wie `document-downloads.json` werden
dadurch nicht mehr fälschlich als Browserzugriff gewertet; reale globale
Browserzugriffe bleiben gesperrt.

**Datenbank:** Die Migrationen
`20260919145632_expense_archive_retention.sql` und
`20260919151500_audit_snapshot_lint.sql` wurden aus dem lokalen Diff erzeugt
und anschließend geprüft. Der Generator zeigte daneben ältere,
paketfremde Abweichungen bei Sniper-Funktionen, Katalogrechten und
Einkaufspaket-Rechten. Diese Änderungen gehören nicht zu diesem Reparaturpaket
und wurden bewusst nicht in die Migrationen aufgenommen; ihr deklarativer
Schema-Abgleich bleibt ein eigener Aufräumpunkt.

**Prüfung:** `supabase db reset --local`, die vollständige Datenbanktestsuite
(1.857 Tests in 51 Dateien), `supabase db lint --fail-on error`, die
Typengenerierung mit identischem Ergebnis, die Workflow-Suite (72 erfolgreich,
5 bestehende Skips) und `npm run verify` mit 2.668 Anwendungstests sowie
Produktionsbau wurden lokal erfolgreich ausgeführt. Der Datenbank-Advisor hat
keine Fehler mehr; seine drei verbleibenden Hinweise betreffen die bestehenden
Funktionen `is_valid_gtin` und `save_number_series` außerhalb dieses Pakets.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Ausgaben pro Workspace sicher laden

**Auftrag:** Den zweiten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
Ausgaben, Kategorien, Wiederholungsregeln und Belegstatus nach Workspace-Wechseln
sicher halten, die täglichen Wiederholungen zuverlässig prüfen und große
Ausgabenlisten vollständig laden.

**Änderung:** Alle vier Ausgaben-Dienste verwerfen Antworten, die nach einem
Workspace-Wechsel eintreffen, und leeren ihren sichtbaren Zustand sofort beim
Wechsel oder Abmelden. Neue Ladeversuche bleiben nach einem Fehler möglich;
gleichzeitige Ausgaben-Ladevorgänge werden nur für denselben Workspace und
Kalendertag geteilt. Wiederholungsausgaben werden deshalb beim ersten Aufruf
eines neuen Tages erneut abgeglichen. Die Ausgabenabfrage lädt Seiten mit je
1.000 Datensätzen, sodass mehr als 1.000 Einträge vollständig in der Tabelle
ankommen. Belegabfragen und Löschungen sind zusätzlich an den aktiven Workspace
gebunden.

Die Ausgabenseite lädt nach jedem Workspace-Wechsel Kategorien, Ausgaben und
Belegstatus erneut. Erfassungs-, Wiederholungs-, Kategorien- und Belegdialoge
sperren den Workspace für ihre Lebensdauer; laufende Speicheraktionen können
dadurch nicht in einen anderen Workspace umgelenkt werden.

**Prüfung:** Regressionstests decken verspätete Workspace-Antworten,
Tageswechsel, Retry nach Fehlern, parallele Ladevorgänge, 1.001 Ausgaben,
Belegstatus und Dialogsperren ab. Die fokussierten DOM- und Angular-Tests sowie
die strikte Typprüfung, die vollständige Testsuite, Workflow-Prüfung, Prettier,
ESLint und der Produktionsbau wurden lokal erfolgreich ausgeführt.

## 2026-09-19 – ChatGPT GPT-5.6 Terra (OpenAI) – Wiederholungsausgaben zuverlässig anlegen

**Auftrag:** Den ersten Reparaturabschnitt aus der Bestandsaufnahme umsetzen:
die fehlende Schema-Registrierung für Ausgaben beheben, Wiederholungsausgaben
über PostgREST sicher erneut ausführen können und doppelte Regeln nach einem
Teilfehler im Dialog verhindern.

**Änderung:** Die deklarative Ausgabendatei ist jetzt registriert. Die
Schema-Reihenfolge lädt außerdem die Betreiberfunktion vor ihren abhängigen
Bot-Policies; ein neuer Workflow-Test schützt beide Regeln. Der
Eindeutigkeitsindex für erzeugte Wiederholungsausgaben ist nicht mehr partiell,
sodass der von PostgREST verwendete Konfliktschlüssel gültig ist. Mehrere
manuelle Ausgaben ohne Wiederholungsbezug bleiben weiterhin möglich.

Nach einem Fehler beim Erzeugen fälliger Ausgaben behält der Dialog die bereits
gespeicherte Regel. Ein erneuter Klick aktualisiert diese Regel, statt eine
zweite anzulegen. Der Hinweis erklärt dabei ausdrücklich, dass nur das
nachgelagerte Erzeugen der Fälligkeiten fehlgeschlagen ist.

**Datenbank:** Migration
`20260919131400_repair_expense_recurrence_conflict.sql` ersetzt den partiellen
Index `expenses_recurring_occurrence_uidx` durch einen vollständigen
Eindeutigkeitsindex. Die aus der lokalen Datenbank generierten Supabase-Typen
sind aktualisiert.

**Prüfung:** `supabase db reset`, die vollständige Datenbanktestsuite (1.835
Tests), der neue PostgREST-Browsertest, der Angular-Komponententest, Lint,
Prettier, der Schema-Registrierungstest, die Workflow-Prüfung, der
Produktionsbau und die vollständige Anwendungstestsuite (2.657 Tests) wurden
lokal ausgeführt.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Ausgaben-Erfassung vereinfacht

**Auftrag:** Die Ausgabenseite soll ohne Tabellenflackern laden, dieselben
Icon-Aktionen wie die übrigen Tabellen verwenden und Betriebsausgaben mit
Händler, Menge und Beleg einfacher erfassen. Die Mehrwertsteuer soll den
normalen Eingabefluss nicht dominieren.

**Änderung:** Ausgaben und wiederkehrende Ausgaben speichern jetzt optional
Händler/Anbieter sowie eine positive Stückzahl mit Standardwert 1. Der
Gesamtbetrag bleibt der tatsächlich bezahlte Gesamtbetrag; ein Stückpreis wird
nur abgeleitet. Neue manuelle und wiederkehrende Ausgaben starten in der UI mit
19 % enthaltener MwSt.; 7 %, 0 % und „nicht ausgewiesen / unbekannt“ bleiben
änderbar hinter eingeklappten Steuerdetails. Bestehende Datensätze mit
unbekannter MwSt. werden beim Bearbeiten nicht auf 19 % umgestellt.

Belege können bereits beim Erfassen per Datei oder Drag-and-Drop vorgemerkt und
nach erfolgreicher Speicherung hochgeladen werden. Ein fehlgeschlagener
optionaler Upload verwirft die gespeicherte Ausgabe nicht. Die Tabelle kennt
den Belegstatus über eine schlanke Metadatenabfrage und zeigt abhängig davon
„Beleg hinzufügen“ oder „Beleg ansehen“ als Icon-Aktion. Die Belegansicht bietet
Ansehen, Drucken und Download.

Die Ausgabentabelle zeigt standardmäßig Datum, Bezeichnung, Anbieter, Kategorie,
Menge, Gesamtbetrag, Status, Beleg und Aktionen. Steuer, Fälligkeit/Zahlungsdatum
und Wiederholung bleiben über den Spaltenwechsler verfügbar. Bearbeiten,
Löschen und „als bezahlt markieren“ verwenden die gemeinsame Icon-Button-
Komponente; Löschen nutzt den gemeinsamen Bestätigungsdialog.

Das kurze Tabellenflackern wurde auf zwei konkurrierende Initial-Ladepfade
zurückgeführt. Die Seite initialisiert nun Kategorien und den bereits
deduplizierenden `ExpenseService.ensureCurrentWorkspaceLoaded()`-Pfad einmal,
lädt danach die Belegübersicht und hält die Tabelle bis dahin im Ladezustand.

**Datenbank:** `expenses` und `expense_recurring_rules` wurden additiv um
`vendor_name` und `quantity` ergänzt. Die Migration
`20260919080000_expense_vendor_quantity.sql` setzt Menge 1 für bestehende
Datensätze und erzwingt positive Ganzzahlen.

**Prüfung:** Regressionstests wurden vor den jeweiligen Implementierungsschritten
für Datenvertrag, Stückpreis/Steuerberechnung, Formulare, Belegstatus,
Tabellenspalten, Anbieter-Suche, Bestätigungsdialog und Initialisierung ergänzt.
Eine lokale Testausführung ist in dieser Sitzung nicht möglich; die
ausführbaren Format-, Lint-, Typ-, Angular-, Datenbank- und Browserprüfungen
müssen im PR-CI-Lauf erfolgen.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Prüfprotokoll wartet auf Workspace-Rolle

**Auftrag:** Beheben, dass „Daten & Protokolle“ trotz Inhaberrolle kurzzeitig
oder dauerhaft die Meldung zeigt, für das globale Prüfprotokoll fehle eine
Inhaber-, Admin- oder Buchhaltungsrolle.

**Ursache:** Die Seite prüfte den Zugriff bereits, während
`WorkspaceMemberService` die Mitgliederliste für den aktuellen Workspace noch
lud. Die vorübergehend leere Liste ergab `currentUserRole() === null`; zugleich
markierte die Seite den Workspace bereits als verarbeitet und startete nach dem
Eintreffen der echten `owner`-Rolle keinen neuen Ladevorgang.

**Änderung:** Der Mitglieder-Service unterscheidet jetzt explizit, ob der
Mitgliederkontext des aktuellen Workspace vollständig aufgelöst wurde. Die
Prüfprotokollseite behandelt den Zugriff als `loading`, `authorized` oder
`forbidden`, invalidiert veraltete Ladeanfragen und lädt automatisch nach,
sobald die echte Rolle feststeht. Während der Rollenauflösung erscheint ein
neutraler Ladehinweis statt einer falschen Rechtewarnung. Das rote Admin-Badge
im Header bleibt unverändert ein Plattform-Operator-Badge.

**Prüfung:** Regressionstests wurden vor der Implementierung für den
Workspace-Mitglieder-Ladezustand und die Audit-Zugriffsentscheidung ergänzt.
Eine lokale Ausführung ist in dieser Sitzung mangels lokalem Repository-/npm-
Runner nicht möglich; die ausführbare Verifikation erfolgt im PR-CI-Lauf.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Workspace-Löschung und Datenexport vereinfacht

**Auftrag:** Frisch angelegte Test-Workspaces sollen sich direkt löschen lassen,
ohne zuerst auf „Daten & Protokolle“ zu landen. Gleichzeitig soll diese Seite
übersichtlicher werden und klar zwischen Prüfprotokoll und Export unterscheiden.

**Änderung:** Der Papierkorb bestätigt die Löschung jetzt direkt in der
Workspace-Verwaltung. Leere Workspaces werden ohne Seitenwechsel gelöscht. Wenn
die Datenbank wegen aufbewahrungsrelevanter Geschäftsdaten oder Prüfprotokolle
blockiert, erscheint statt eines technischen Sync-Fehlers eine verständliche
Archivierungsentscheidung; der Datenexport bleibt ausdrücklich optional.
Archivierte Workspaces lassen sich direkt in der Workspace-Liste
wiederherstellen.

„Daten & Protokolle“ enthält nur noch Prüfprotokoll und Datenexport. Die frühere
Sektion „Aufbewahrung & Löschung“ samt eigener Retention-Komponente wurde
entfernt. Das vollständige Datenarchiv ist die sichtbare Hauptaktion; PDF- und
CSV-Ausgaben liegen hinter „Weitere Exporte“. Die erweiterten
Prüfprotokoll-Filter starten eingeklappt. Das vollständige Archiv wird nicht mehr
durch die aktuell gesetzten Prüfprotokoll-Filter eingeschränkt.

**Prüfung:** Regressionstests für direkte Löschung, blockierte Löschung mit
Archivierungsalternative, Wiederherstellung und die vereinfachte Daten-Seite
wurden vor der Implementierung ergänzt. Die lokale Ausführung ist in dieser
Sitzung nicht möglich, weil der bereitgestellte Container keinen Netzwerkzugriff
zum Repository beziehungsweise zu npm besitzt. Die vollständige Prüfung erfolgt
im PR-Lauf.

## 2026-09-19 – ChatGPT GPT-5.6 Sol (OpenAI) – Einheitliches Data-Table-System umgesetzt

**Auftrag:** Alle administrativen verwaltbaren Tabellen und Listen auf ein
einheitliches Shared-System umstellen. Suche, fachliche Filter,
Spalten-/Sortiersteuerung und Zustände sollen überall an denselben Positionen
liegen; neue Features dürfen keine eigene Tabellenvariante mehr einführen.

**Änderung:** Neuer `DataTableComponent` als gemeinsamer Rahmen für
Tabellenfläche, Toolbar, Shared-Suche, Filterprojektionen,
Spalten-/Sortiermenü sowie Lade-, Fehler- und Leerzustände. Die Toolbar-Felder
besitzen jetzt bereits im Ruhezustand eine dezente neutrale Fläche und einen
leichten Rahmen. Ausgaben wurden mit einer eigenen Tabellenkonfiguration in
`TablePreferencesService` aufgenommen. Die verwaltbaren Listen für Einkäufe,
Verkäufe, Artikelübersicht, Bestand, Ausgaben, Verkäufer, Bankabgleich,
Beta-Bewerbungen, zentrale Vinted-Markenfilter und Prüfprotokoll verwenden den
gemeinsamen Rahmen. Statische Vorschau-, Detail-, Druck- und Berichtstabellen
sind ausdrücklich klassifiziert und erhalten keine künstliche Toolbar.

Die zusätzliche Artikelnavigation im Seiteninhalt wurde entfernt.
„Artikelübersicht“ besitzt in der Sidebar nun die Unterpunkte „Alle Artikel“
und „Bestand“. Der alte `TableToolbarComponent` wurde nach der Migration
entfernt. `scripts/check-admin-shared-ui.mjs` beanstandet künftig direkte
Spaltenmenüs, die alte Tabellen-Toolbar, native Suchfelder an verwaltbaren
Tabellen und nicht klassifizierte Tabellen außerhalb des gemeinsamen Rahmens.
Die verbindliche Regel steht zusätzlich in
`docs/design/admin-ui-guidelines.md`.

**Prüfung:** Branch-Diff gegen `master` und die betroffenen Shared-/Feature-
Templates wurden manuell auf den gemeinsamen Komponentenvertrag geprüft. Der
erste PR-Lauf hat den zuvor abgeschnittenen Verkaufstabellen-Block gefunden;
dieser wurde vollständig aus `master` wiederhergestellt. DOM- und Node-Suite
waren danach grün. Die 22 von Prettier gemeldeten Dateien wurden im
GitHub-Runner mit der Projektversion formatiert. Die abschließende vollständige
PR-CI läuft auf dem formatierten Stand erneut.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Entwurf: einheitliches Data-Table-System

**Auftrag:** Alle administrativen Tabellen und verwaltbaren Listen sollen dasselbe
Shared-System für Tabellenfläche, Suche, Filterpositionen, Spalten-/Sortiermenü und
Zustände verwenden. Neue Listen dürfen keine eigene Tabellenvariante mehr einführen.
Zusätzlich soll die doppelte Artikelnavigation entfallen und Artikelübersicht in der
Sidebar die Unterpunkte „Alle Artikel“ und „Bestand“ erhalten.

**Befund:** Einkäufe verwenden bereits die gemeinsame TableToolbar-Struktur, während
Verkäufe, Inventar, Artikelstamm, Buchhaltung und Beta-Bewerbungen jeweils eigene
Varianten derselben Leiste besitzen. Ausgaben und Verkäufer bauen Filter und
Tabellenhülle lokal nach. Toolbar-Suche und Toolbar-Selects sind im Ruhezustand teils
transparent und dadurch schlecht als Interaktionen erkennbar.

**Ergebnis:** Entwurf
`docs/superpowers/specs/2026-09-18-unified-data-table-system-design.md`. Vorgesehen ist
ein verbindlicher `DataTableComponent`, der Toolbar-Anordnung, Suche,
Filter-Projektionen, optionales Spalten-/Sortiermenü sowie Lade-, Fehler- und
Leerzustände zentral besitzt. Feature-Seiten liefern nur Fachfilter, Daten, Spalten,
Zeilen und Aktionen. `scripts/check-admin-shared-ui.mjs` soll neue lokale
Tabellenvarianten künftig automatisiert verhindern.

**Prüfung:** Repository-Struktur, aktuelle Tabellenbausteine, Designrichtlinie,
Tabellenpräferenzen und mehrere bestehende Listen wurden analysiert. Noch kein
Anwendungscode geändert.

Neue Sitzungen werden hier oben ergänzt: Datum, Assistent, Thema sowie Auftrag,
Änderung und tatsächlich ausgeführte Prüfungen. Die Vorgaben aus `AGENTS.md` gelten
unverändert.

Die vollständige bisherige Historie ist im
[Archiv bis zum Stand vom 16. September 2026](AI-CHANGELOG-archive-2026-09-16.md)
bytegleich erhalten. Das Archiv liegt im selben Ordner, damit seine relativen
Dateiverweise weiterhin denselben Ausgangspunkt haben.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Demo-Modus entfernen, PR 1: Browser-Tests auf lokale Supabase

**Auftrag:** Umsetzung von PR 1 aus dem Entwurf unten. Die Browser-Tests sollen gegen
die lokale Supabase laufen statt gegen Demo-Daten, damit der Demo-Code danach in PR 2
gefahrlos entfernt werden kann. Sechs Aufgaben aus
`docs/superpowers/plans/2026-09-18-remove-demo-mode-pr-1.md`.

**Änderung:** Ein globales Setup registriert je Testlauf genau ein Konto einmal; alle
Worker teilen sich die Sitzung als `storageState`. Eine automatische Fixture in
`e2e/support/fixtures.ts` legt für jeden Test einen frischen Workspace an und
wechselt per `addInitScript` dorthin. Testdaten entstehen über die echten
Datenbankfunktionen in `e2e/support/sample-data.ts`, nicht über Mocks. Die sechs
Pflichttests des Chromium-Laufs sind auf dieses Muster umgestellt; der Steuertest
verkürzt sich auf die Journalprüfung, weil die Exportsperre bereits der
Angular-Test `accounting-tax-review.angular.spec.ts` abdeckt. Der Browser-Job in der
CI startet jetzt die lokale Supabase, ein neuer Workflow-Test sichert die Trennung
der Testkonten ab (Seed-Isolation). `supabase/seed.sql` legt lokal das Konto
`test@flipbase.local` / `flipbase-test` mit Beispieldaten an. Von den übrigen
Browser-Tests wurden alle fest an Demo-Daten hängenden Fälle gelöscht statt
umgestellt: 29 Einträge in 17 Dateien (rund 34 einzelne Testfälle, Theme-/Breiten-/
Pfad-Varianten mitgezählt), davon sechs Dateien vollständig entfernt
(`badge-text.spec.ts`, `demo-login.spec.ts`, `purchase-item-navigation.spec.ts`,
`purchase-package-contents.spec.ts`, `record-timeline.spec.ts`,
`e2e/support/demo.ts`). Die vollständige Liste steht im Commit `ebee08c`.

**Nachbesserung (Abschlussprüfung):** Der optionale Nightly-Workflow
(`quality-nightly.yml`, Job `browser`) startete und stoppte die lokale Supabase
nicht, obwohl `test:e2e:nightly` dasselbe globale Setup wie der PR-Job nutzt – jetzt
mit denselben Schritten wie `browser-smoke` in `ci.yml` ergänzt, Timeout 15 auf 20
Minuten angehoben. Die geteilte Testsitzung (`jwt_expiry = 900`) lief bei langen
Läufen nach rund 13,5 Minuten in die Token-Rotation und schlug dann unklar fehl;
`e2e/support/test-account.ts` liest jetzt `expires_at` mit, die `workspace`-Fixture
bricht unter 120 Sekunden Restlaufzeit mit einer klaren deutschen Meldung ab, und
eine fehlende `e2e/.auth/session.json` meldet sich jetzt auch verständlich statt mit
rohem ENOENT. Der Steuerjournal-Test in `purchase-tax-costs.spec.ts` bestand nur,
weil die Buchhaltungsseite fest auf 2026/08 startet; er wählt Jahr und Zeitraum jetzt
selbst über die Oberfläche. Nach diesen Korrekturen liefen `npm run test:e2e:pr` (6 von
6 bestanden), `npm run test:workflow`, `scripts/seed-isolation.test.mjs`, Prettier und
ESLint jeweils mit Exitcode 0.

**Befunde:** `deal-monitor.spec.ts` schlägt schon auf dem Ausgangsstand des Zweigs
fehl (zwei Fälle, Workspacewechsel in der Erfassungsmaske gesperrt) - kein neuer
Fehler durch diese Arbeit. Das Kalender-Popover bei 390px öffnet sich manchmal nicht
beim ersten Tastendruck; der Test wiederholt das über `toPass`, ein App-Fehler zum
Nachverfolgen. Die Buchhaltungsseite startet fest auf 2026/08
(`accounting.component.ts:172-173`) statt auf dem aktuellen Monat.

**Prüfung:** `npm run test:db` (1812 Tests in 50 Dateien) mit Exitcode 0. `npm run
verify` (Format, Lint, Typen, Workflow-Tests, Suite-Audit, alle Anwendungstests, Bau)
mit Exitcode 0. `npx playwright test --project=chromium`: 74 von 76 Fällen bestanden;
die zwei Fehlschläge sind die oben genannten vorbestehenden Fälle in
`deal-monitor.spec.ts`. `grep -rn "startDemoMode|support/demo" e2e` ohne Treffer.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Entwurf: Demo-Modus entfernen

**Auftrag:** Der Nutzer will den Demo-Modus komplett entfernen, weil jede Funktion
doppelt gepflegt werden muss. Später soll es einen 14-Tage-Testzugang mit echtem Konto
geben.

**Befund:** Der Demo-Modus ist im Live-Betrieb aus (`allowDemoMode: false`). Die
Ersatz-Datenbank `MockDataStoreService` hat rund 2.550 Zeilen. Dazu kommen rund 185
Weichen in 46 Dateien. 28 von 30 Browser-Tests laufen im Demo-Modus, darunter alle
Pflichttests. Die lokale Anmeldung begrenzt Registrierungen und Anmeldungen auf 30 je
5 Minuten. Der erste Ansatz „ein Konto je Test“ hätte den vollen Testlauf deshalb
blockiert.

**Ergebnis:** Entwurf `docs/superpowers/specs/2026-09-18-remove-demo-mode-design.md`.
PR 1 stellt die Browser-Tests auf die lokale Supabase um: ein Konto je Lauf, ein
Workspace je Test, dazu ein lokales Testkonto mit Beispieldaten und Sicherungen gegen
Datenlecks. PR 2 entfernt den Demo-Code.

**Plan:** `docs/superpowers/plans/2026-09-18-remove-demo-mode-pr-1.md` mit sechs
Aufgaben für PR 1. Beim Planen zeigte sich, dass die Browser-Tests rund 95 Fälle in
28 Dateien umfassen und rund zwölf Dateien fest an Demo-Daten hängen. Nutzerentscheid:
Pflichttests und Tests ohne Datenbedarf umstellen, demo-gebundene Tests löschen. Der
Steuer-Pflichttest verliert den Teil zur Exportsperre, weil ihn kein Mitglied
herstellen kann; er ist im Angular-Test `accounting-tax-review` abgedeckt.

**Prüfung:** Nur Analyse und Entwurf, kein Anwendungscode geändert.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Navigation und Upload-Button vereinheitlicht

**Auftrag:** Die nach dem Theme-Umbau ergänzte gelbe Seitenmarkierung an aktiven
Sidebar-Einträgen entfernen, weil sie nicht zur bestehenden Admin-Navigation passt.
Außerdem prüfen, ob „Bilder hinzufügen“ im Bildoptimierer wirklich die gemeinsame
Button-Komponente verwendet.

**Änderung:** Die zusätzliche `box-shadow`-Seitenmarkierung der aktiven Sidebar
sowie die entsprechende Unterkante der mobilen Navigation wurden entfernt; der aktive
Zustand verwendet wieder ausschließlich die gemeinsame abgerundete Brand-Fläche.
„Bilder hinzufügen“ war tatsächlich als lokal gestyltes `label` umgesetzt. Der
sichtbare Auslöser verwendet jetzt `ButtonComponent` mit `variant="primary"` und
`size="lg"`; nur das technisch notwendige versteckte Datei-Input bleibt nativ.
Die Designrichtlinie hält beide Entscheidungen verbindlich fest.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Styles und der
Bildoptimierer-Header.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Theme-Konsistenz im hellen Design und Bildoptimierer

**Auftrag:** Das helle Theme soll das echte Flipbase-Gelb sichtbarer verwenden statt
gold-brauner Ersatzfarben. Der Admin-Badge soll als auffällige rote Rollenkennzeichnung
erhalten bleiben. Bildoptimierer und Fotoguide sollen dieselbe Flipbase-Designsprache
wie der restliche Admin verwenden.

**Änderung:** Brand-Flächen im hellen Theme sind heller und tragen dunklen Text für
ausreichenden Kontrast; aktive Navigation erhält zusätzlich eine echte gelbe
Markenmarkierung. Brand-Badges verwenden im hellen Theme das Logo-Gelb. Für den
Plattform-Admin gibt es einen eigenen roten Badge-Ton statt Brand oder Critical.
Der gemeinsame `ModalShellComponent` verwendet die zentralen Theme-Farben und bietet
einen Brand-Ton. Der Fotoguide wurde vom eigenen nativen Dialog auf den Shared
`ModalShellComponent` umgestellt. Bildoptimierer-Komponenten verwenden für Auswahl,
Fokus, Warnung, Erfolg, Fehler und Editor-Akzente die zentralen Flipbase-Variablen;
alte Indigo-, Sky-, Amber- und Emerald-Akzente wurden in diesem Feature entfernt.
Die Designrichtlinie dokumentiert diese Nutzerentscheidungen.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Theme, Shared Badge/Modal und
der Bildoptimierer. Geplant sind Formatierung, Lint, Typprüfung, Build,
Accessibility-Browser-Smoke sowie die relevanten Angular-Tests.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Flipbase Theme und lesbare AI-Regeln

**Auftrag:** Die uneinheitlichen Farben von Toasts, Badges, Header, Navigation und
Statusdarstellungen auf eine gemeinsame Flipbase-Designsprache ausrichten. Danach die
AI-Regeln so ergänzen, dass englische Code-Namen zugleich konkret, lesbar und am
Projektzweck orientiert bleiben; PR-Titel und PR-Beschreibungen ausdrücklich auf
Englisch festlegen.

**Änderung:** Zentrale Theme-Datei `src/styles/flipbase-theme.css` mit verständlichen
Farbrollen für Brand, Erfolg, Warnung, kritisch und neutral in Light/Dark. Shared
Badges, Toasts und Buttons sowie Header, Workspace-Status und Dashboard-KPIs greifen
auf diese Rollen zurück. Toasts erhalten eine neutrale Oberfläche und sauber
ausgerichtete Icon-/Text-/Close-Spalten. `AGENTS.md` verlangt jetzt zusätzlich
intention-revealing English names, bevorzugt konkrete Projekt-/Fachnamen vor
abstraktem Jargon, und definiert PR-Titel sowie PR-Beschreibungen ausdrücklich als
englisch.

**Prüfung:** PR-CI nach den UI-Änderungen: Formatierung, ESLint, Typprüfung, Build,
Browser-Smoke inklusive AXE, Node-, DOM- und beide Angular-Test-Shards erfolgreich.
Die anschließende reine Dokumentationsänderung an `AGENTS.md` wurde im selben PR
ergänzt.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkauf drucken

**Auftrag:** Teil 3 des Einkaufsumbaus. Nutzerentscheidungen: eigene Druckseite wie
beim Prüfbeleg, Druckknopf nur auf der Detailseite.

**Änderung:** Neue Seite `/purchases/:id/print` mit Kopf (Einkaufsnummer,
Bezeichnung, Datum), Verkäufer-Snapshot samt Quelle, Bestellnummer und Angebotslink,
Positionstabelle, Kostenaufstellung mit Rabatt und Zusatzkosten, Gesamtkosten nach
derselben Regel wie die Detailseite sowie der Liste hinterlegter Belege. Die
Bedienleiste verschwindet beim Drucken; gedruckt wird über den Browserdialog, auch als
PDF. Die Aufbereitung liegt als reine Funktion in `utils/purchase-print.ts`; die
Kostenart-Bezeichnungen wurden dafür aus der Kostenübersicht in
`utils/purchase-cost-labels.ts` ausgelagert. Der Prüfbeleg mit der Historie bleibt
unverändert und separat. Keine Datenbankänderung.

**Prüfung:** Vitest für den Einkaufsbereich (30 Dateien, 279 Tests), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Der Angular-Bau
läuft wegen der lokalen Node-Version nur in der CI.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkaufsbelege als private Dateien

**Auftrag:** Teil 2 von 3 des Einkaufsumbaus, nach dem veröffentlichten Teil 1 (PR #103).
Nutzerentscheidungen: Löschen nur vor dem Abschluss, im Demo-Modus kein Upload, Anzeige
als Vorschau im Dialog. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-18-purchase-documents-design.md` und
`docs/superpowers/plans/2026-09-18-purchase-documents.md`.

**Änderung:** Neuer privater Bucket `purchase-documents` (20 MiB, PDF/JPG/PNG/XML) mit
kanonischem Pfad je Workspace, Einkauf und Beleg. Neue Tabelle `purchase_documents` mit
RLS je Operation: lesen und anlegen für Mitglieder, löschen nur bei nicht abgeschlossenem
Einkauf, kein Ändern. Dieselben Bedingungen gelten für die Datei in `storage.objects`.
Trigger schreiben `purchase_document_added` und `purchase_document_removed` in die
vorhandene Historie. Der neue Dienst prüft Typ, Endung und Größe vor dem Upload, legt
erst die Datei und dann die Metadaten an und nimmt die Datei zurück, wenn die Metadaten
scheitern; das Entfernen löscht erst den Eintrag, damit die Datenbankregeln entscheiden.
Neue Belegkarte auf der Einkaufs-Detailseite mit Liste, Belegart-Auswahl, Vorschau
(Bild oder PDF aus dem privaten Bucket) und Download. Belege lassen sich auch nach dem
Abschluss ergänzen; ein Hinweis erklärt, dass sie dann nicht mehr entfernt werden können.
Im Demo-Modus ist der Upload gesperrt.

**Prüfung:** Datenbanktests und vollständige PR-CI auf `feat/purchase-documents` grün
(Migration, Policies, Bau, Browser-Smoke). Lokal: Vitest node (1423), angular (877) und
dom (250), Typprüfung, ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0.
Die Supabase-Typen kommen aus einem GitHub-Lauf, nicht von Hand.

**Offen:** Sichtprüfung im Browser (lokales Node unter dem Minimum der Angular CLI);
Teil 3 (Einkauf drucken) folgt. Ein Wiederherstellungstest der gesicherten
Storage-Dateien ist weiterhin eine Betriebsaufgabe und nicht Teil dieses PRs.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Einkauf: Quelle, Verkäufer-Snapshot und Nachtrag

**Auftrag:** Übernahme des Einkaufsumbaus von ChatGPT. Nutzerentscheidungen: drei PRs
nacheinander (dieser ist Teil 1), Migration und Typen über einen GitHub-Runner statt
lokalem Docker, Weiterarbeit auf `feat/purchase-workflow-20260916`, Bezeichnungsfeld
aus PR #59 mit aufnehmen, Grund beim Nachtrag optional. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-17-purchase-seller-details-design.md` und
`docs/superpowers/plans/2026-09-17-purchase-seller-details.md`.

**Vorgefunden:** Der Zweig enthielt nur Transferreste (Base64-Teile und einen
Einmal-Workflow) und lag 18 Commits zurück. Das entpackbare Paket war ein
unvollständiger Diff gegen `08d1707` mit 25 Frontenddateien, ohne Datenbankteil. Es
diente als Nachschlagewerk; übernommen wurde daraus kein Code. Transferdateien
entfernt, `master` gemergt.

**Änderung:** `purchases` erhält Verkäufer-Snapshot (Art, Name, Plattform-Benutzername,
Anschrift, Ländercode), `external_order_id` und `seller_details_version`. Anlegen und
Entwurfsspeichern übernehmen die Felder und zählen die Version bei geänderten
Herkunftsangaben hoch. Die neue Funktion `update_purchase_seller_details` trägt
Herkunftsangaben auch bei abgeschlossenen Einkäufen nach, prüft Mitgliedschaft,
erlaubte Felder, Workspace-Zugehörigkeit und erwartete Version und schreibt ein
Fachereignis `purchase_seller_details_updated` mit Grund. Kosten, Positionen, Bestand
und Abschlussstatus bleiben unberührt. Formular zeigt Bezeichnung, Quelle,
Benutzername, Verkäuferart, Name, Anschrift, Angebotslink und Bestellnummer;
die Auswahl eines gespeicherten Verkäufers kopiert dessen Angaben bewusst. Detailseite
zeigt den Snapshot und öffnet bei abgeschlossenen Einkäufen einen Nachtragsdialog mit
Konfliktmeldung. Liste und Suche berücksichtigen einmalige Verkäufer.

**Prüfung:** Vollständige Vitest-Projekte node (1409) und angular (866), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Migration und
Supabase-Typen wurden im GitHub-Runner erzeugt; die Typdatei enthielt zusätzlich
bisher nicht übernommene Sniper-Tabellen. Von den neuen Datenbanktests waren im
dritten Lauf neun Prüfungen grün, darunter Nachtrag nach Abschluss, unveränderte
Kosten und Bestände sowie das Ereignis mit Grund.

**Nachtrag 18.09.2026:** Nach der Umstellung des Repositories auf öffentlich laufen die
GitHub-Prüfungen wieder. Migration, erzeugte Typen und Datenbanktests sind bestätigt:
49 Testdateien mit 1803 Prüfungen bestanden, darunter die neue Datei
`purchase_seller_details.test.sql`. Die committeten Typen sind byteweise identisch mit
den im Lauf erzeugten. Der vorläufige Workflow `purchase-seller-schema-preview.yml`
wurde vor dem Review entfernt.

**Offen:** `supabase db diff` scheitert am vorhandenen Schema (50_sniper.sql nutzt
`is_platform_operator` vor 99_platform_admin.sql); die Migration wurde deshalb aus den
Schemadateien zusammengestellt. Teil 2 (Belege) und Teil 3 (Einkauf drucken) folgen als
eigene PRs. Eine Sichtprüfung im Browser steht aus, weil das lokale Node unter dem
Minimum der Angular CLI liegt.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Dashboard mit Gewinn, Ausgaben, Vorzeitraum und offenen Kosten

**Auftrag:** Die Dashboard-Empfehlung vom 13.09. auf aktuellem `master` umsetzen.
Zweig `feat/dashboard-kpis` von `origin/master` (`a971725`). Entscheidungen des
Nutzers: Gewinn als Verkaufsgewinn; Vergleich mit dem gleich langen Zeitraum davor;
offene Kosten wie Shopify (nur Verkäufe mit Kosten im Gewinn, Umsatz ohne Kosten
getrennt) plus Einkaufsliste; Node lokal nicht aktualisieren. Konzept in
`docs/superpowers/specs/2026-09-17-dashboard-kpis-design.md`.

**Änderung:** Oben Gewinn, Umsatz und Ausgaben (Einkäufe nach Kaufdatum plus
Verkaufskosten), darunter Bestandswert, verkaufte Artikel und Marge. Jede
Zeitraumkennzahl mit Veränderung gegenüber dem Vorzeitraum (Prozent, bei der
Marge Prozentpunkte). Gewinn, Marge und Bestandswert bleiben bei einzelnen
offenen Kosten sichtbar und weisen den fehlenden Teil aus. Neuer Bereich
„Offene Kosten“ mit Einkauf, Grund und Link. Diagramm und Verkaufsjournal
unverändert; keine Schemaänderung.

**Prüfung:** Service-, Modell- und Komponententests einschließlich AXE; komplette
Vitest-Projekte node (1389) und angular (859), `npm run typecheck`, ESLint,
Prettier, `npm run test:audit` und Shared-UI-Prüfung mit Exitcode 0. Angular-Bau
und Sichtprüfung im Browser lokal nicht möglich (Node 22.16.0 unter dem Minimum der
Angular CLI); der Bau läuft im PR.

**Nachtrag zu PR #101:** Nach dem Deployment von `sha-a971725` lesend geprüft:
Nike, adidas und Ralph Lauren stehen auf `ready`/`ok`, Vinted-Zugang `ready`,
907 neue Funde in den ersten zehn Minuten, `failed=0`.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Gesperrten Vinted-Filter nachträglich freigegeben

**Auftrag:** Nachprüfung von PR #99 im Betrieb. Zweig
`fix/sniper-legacy-blocked-queries` von `origin/master` (`ea9ba63`).

**Befund (lesend auf dem Hetzner-Server):** Nach dem Deployment von `sha-ea9ba63`
steht `sniper_origin_state` wieder auf `ready`; in den ersten Minuten kamen 212 neue
Funde, Nike und adidas melden `ok`. Der am 16.09. gesperrte Filter „Ralph Lauren“
bleibt aber auf `blocked`: `dueQueries` schloss `blocked` schon in der
Datenbankabfrage aus, sodass der in #99 ergänzte Backoff in `isDue` die Zeile nie
erreichte. Der Test in #99 prüfte nur `isDue`, nicht den Abfragefilter.

**Änderung:** Die Abfrage schließt nur noch `invalid` aus. Alte `blocked`-Zeilen
laufen über den vorhandenen `forbidden`-Backoff und werden beim nächsten
erfolgreichen Abruf auf `ready` gesetzt.

**Prüfung:** Neuer Test auf die tatsächlichen Abfrageparameter schlug vorher fehl
und besteht danach; alle 186 Sniper-Unit-Tests grün, ESLint und Prettier sauber.
Wirkung im Betrieb steht bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Deutsche Dateinamen auf Englisch umgestellt

**Auftrag:** Die noch deutsch benannten Dateien umbenennen. Zweig
`refactor/english-filenames` von `origin/master` (`ca5a993`).

**Änderung:** Rein mechanischer Commit ohne Logikänderung. Zwölf Dateien unter
`src/` (u. a. `speicher-migration.ts` → `storage-migration.ts`,
`stammdaten-filter.ts` → `master-data-filter.ts`, `supabase-schreiben.ts` →
`supabase-write.ts`, `formular-bindungen.spec.ts` → `form-bindings.spec.ts`) und
`scripts/version-generieren.mjs` → `scripts/generate-version.mjs`; Importe,
npm-Lebenszyklusskripte und Pfadkommentare angepasst. Das npm-Skript
`version:generieren` heißt jetzt `version:generate`.

**Bewusst unverändert:** `deploy/erstinstallation.sh` und
`deploy/cron-aufraeumen-n8n-server`, weil der Server sie unter diesem Namen
verwendet; `landing/datenschutz` als öffentliche Adresse; „kleinanzeigen“ als
Markenname. Deutsche Funktions- und Variablennamen innerhalb der Dateien (z. B.
`uebernehmeAltenBrowserSpeicher`, `nurAktive`, `schreibeImHintergrund`,
`VERSION.nummer`) bleiben offen für einen eigenen Schritt.

**Prüfung:** `npm run typecheck` Exitcode 0, die zehn umbenannten Testdateien
bestehen (125 Tests), `npm run test:audit` Exitcode 0, ESLint und Prettier sauber,
Versionsskript unter neuem Namen ausgeführt. Kein Verweis auf die alten Namen
außerhalb der Dokumentationshistorie. Der Angular-Bau lief lokal nicht, weil das
installierte Node 22.16.0 unter dem Minimum der Angular CLI liegt; er wird im PR
geprüft.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Vinted-Bot nach einzelner 403 dauerhaft gesperrt

**Auftrag:** Der Vinted-Bot sammelt wieder keine Daten. Ursache finden und beheben.
Zweig `fix/sniper-forbidden-recovery` von `origin/master` (`ca5a993`).

**Befund (lesend auf dem Hetzner-Server, vom Nutzer freigegeben):** Container
`flipbase-sniper` läuft gesund, protokolliert aber alle fünf Sekunden nur
`origin_blocked reason=forbidden`. `sniper_origin_state` steht seit 16.09.2026
00:48:35 UTC auf `blocked` ohne Ablaufzeit. Auslöser war eine einzelne 403 beim
Filter „Ralph Lauren“ (`consecutive_failures = 1`); Nike und adidas waren
Sekunden zuvor erfolgreich. Letzter gespeicherter Fund 00:48:05 UTC. Um 15:17 UTC
lud der Bot die Vinted-Startseite erfolgreich (`vinted_last_success_at`), die
Sperre blieb trotzdem bestehen. Seit AP1 vom 15.09. setzt eine 403 Origin und
Filter dauerhaft auf `blocked`; weder Bot noch Admin-Bereich heben das auf, auch
nicht das Reaktivieren eines Filters oder ein Container-Neustart.

**Änderung:** Eine 403 startet eine ablaufende Abkühlphase (5, 10, 20, 40, dann
60 Minuten); danach prüft der vorhandene Einzelprobeabruf den Zugang. Bereits
gespeicherte Dauersperren gelten als abgelaufene Abkühlphase bzw. laufen über
den vorhandenen Backoff für `forbidden`, sodass sich der Produktionszustand nach
dem Deployment ohne Datenmigration löst. Zweiter Commit: Eine Probe-Reservierung,
die ein beendeter Prozess nicht freigeben konnte (z. B. Neustart beim
Deployment), wird nach fünf Minuten übernommen statt dauerhaft zu blockieren.
Keine Schema-, Migrations- oder Frontend-Änderung.

**Prüfung:** Neue Regressionstests für Retry-Politik, Scheduler, `isDue` und
`OriginStateStore` schlugen vor der Änderung fehl und bestehen danach; alle
185 Sniper-Unit-Tests grün, ESLint und Prettier sauber. Lokale Typprüfung meldet
nur das fehlende lokale `dotenv`-Paket, das ebenso auf `master` auftritt. Keine
Produktionsdaten geändert. Die Gegenprüfung gegen eine echte PostgREST-API und
die Wirkung im Betrieb stehen bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Übersicht offener Punkte

**Auftrag:** Offene Punkte im Projekt zusammenstellen. Reine Analyse, keine
Code-, Schema- oder Zweigänderung.

**Befund:** Offene PRs #58 und #59 (je 128 Commits hinter `master`); auf `master`
fehlt weiterhin ein Eingabefeld für die Einkaufsbezeichnung, das #59 ergänzt.
Unvollständiger Übertragungszweig `feat/purchase-workflow-20260916` mit
Base64-Teilen und Einmal-Workflow. Die drei Fix-Zweige vom 05.09. sind laut
`git cherry` inhaltsgleich in `master` und nur noch aufzuräumen. Produktübergang laut
`2026-09-08-product-transition-checklist.md` noch nicht abgeschlossen
(`tracking_mode`/`line_kind` und Legacy-RPCs vorhanden). Neun deutsch benannte
Dateien in `src/app/core/services/`. Dashboard-Kennzahlen-Empfehlung vom 13.09.
nicht umgesetzt. Viele gemergte Zweige lokal und remote nicht aufgeräumt.

**Prüfung:** `git fetch --prune`, Vorsprung/Rückstand aller Zweige gegen
`origin/master`, `git cherry`, `gh pr list`/`gh issue list` (keine offenen Issues),
Suche nach Offen-Markierungen in Protokoll, Archiv, Plänen und Audits sowie
Stichproben im Code.

## 2026-09-16 – Claude Opus 5 (Anthropic) – Unbenutzte Einkaufskategorie entfernt

**Auftrag:** Offene Reste aus dem Plan
`docs/superpowers/plans/2026-09-14-product-categories-brands.md` erledigen, nachdem
Codex den Zweig `feat/product-categories-brands` am 14.09.2026 zu Ende geführt und
gemergt hat.

**Befund:** `purchase.service.ts` gab noch `single_item_category` und
`addItemToPurchase(…).category` als freien Kategorietext an den Artikel-Service
weiter. Kein Formular und kein Test übergibt diese Werte, und die Datenbank setzt
den Kategorietext seit dem Trigger `sync_category_brand_text()` ausschließlich aus
`category_id`. Die Felder waren damit wirkungslos und irreführend.

**Änderung:** Die vier Zeilen entfernt (Feld im Payload-Typ, Weitergabe beim
Einzelartikel, Parameter und Weitergabe in `addItemToPurchase`). Keine
Verhaltensänderung.

**Prüfung:** Prettier und ESLint auf `purchase.service.ts`, `npm run typecheck`
(Exitcode 0), `purchase.service.spec.ts`, `purchase-create-persistence.spec.ts`
und `purchase-detail.component.angular.spec.ts` (3 Dateien, 88 Tests bestanden).

## 2026-09-16 – ChatGPT – Abschluss der CI-Dokumentation

**Auftrag:** Die nach PR #96 offenen Aufräumpunkte angehen. Keine weitere
Testreduzierung oder Angular-Optimierung beauftragt.

**Änderung:** Den Abschluss der CI-Vereinfachung in das zentrale Protokoll
übernommen. Die vorherige vollständige Protokolldatei wird mit demselben Git-Blob
`17c987d1989d4a9db61bce71e897cf855d4c41d2` archiviert, nicht gekürzt oder
rekonstruiert. Der ursprüngliche
[Arbeitsstand des CI-Nachtrags](development/2026-09-16-lean-ci-log.md) bleibt als
historischer Zwischenstand erhalten; seine offene zentrale Übernahme ist durch
diesen Eintrag erledigt. Anwendung, Tests und Workflows bleiben unverändert.

**Prüfung:** PR #96 und dessen Merge-Stand erneut gelesen. Der Produktionsjob
bestätigt erfolgreiches Deployment und erfolgreiche öffentliche Versionsprüfung.
Die identische Blob-ID sichert den unveränderten Inhalt der bisherigen Historie.
Die Formatprüfung dieser Dokumentationsänderung erfolgt im regulären PR.

**Offen:** Der gemergte Remote-Branch `ci/lean-validation-20260916` konnte über die
verfügbare GitHub-Schnittstelle nicht gelöscht werden. Es wurde keine Löschung
behauptet und kein zusätzlicher Workflow für eine Löschung eingerichtet.

## 2026-09-16 – ChatGPT – CI auf Kernabläufe reduziert und ausgeliefert

**Auftrag:** Die automatische Prüfung einer kleinen SaaS-Lösung vereinfachen und
unnötige Pflicht- und Zusatzläufe entfernen.

**Änderung:** Sechs allgemeine Browser-Kernfälle statt 17. Die vier bestehenden
Daten- und Geldfälle bleiben inhaltlich unverändert. Zwei kurze Fälle prüfen
Appstart/Navigation sowie das Speichern und Wiederöffnen eines Artikels mit Bild.
Die 13 übrigen bisherigen Pflichtfälle bleiben gezielt manuell ausführbar. Der
erweiterte markierte Bestand umfasst einschließlich der zwei neuen Fälle 19
Tests.

Tägliche und wöchentliche Zusatzläufe sowie das separate Benchmark-System wurden
entfernt. Traces im Pflichtlauf sind nur zur gezielten Diagnose einschaltbar;
Fehler-Screenshots bleiben aktiv. Die Prüfung der Browser-Testauswahl wurde auf
zwei tatsächliche Listenaufrufe vereinfacht.

Der Schalter `application_tests` verhindert fachfremde Frontend-Testjobs bei reinen
Änderungen am Bot-Paket `services/sniper/`. V2-Nachweise binden die Wiederverwendung
an den geprüften Dateistand und Umfang. Bei Frontendänderungen bleiben alle
vorhandenen Node-, DOM- und Angular-Fälle aktiv. Die bestehenden Datenbank-, Bot-,
Image-, Migrations- und Deployment-Jobblöcke bleiben unverändert.

**Abwägung:** Zusätzliche Feature- und UI-Browsertests sind außerhalb des
Kernbestands nicht automatisch als Merge-Voraussetzung erzwungen. Bei relevanten
Änderungen sind sie gezielt vor dem Merge auszuführen und im PR zu dokumentieren.
Die Browserfälle verwenden Demo-Daten oder Mocks und ersetzen keine echten
Backend-Auth- oder RLS-Prüfungen. Details stehen in den
[aktuellen Testregeln](testing/lean-ci.md).

**Verifiziertes Ergebnis:**
[PR #96](https://github.com/GrischaTDev/flipbase/pull/96) wurde nach erfolgreicher
CI mit Merge-Commit `b3b41c63182403900aa3e853f04defed249a3500` integriert. Der
[PR-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/35097477856)
bestand im ersten Versuch: Formatierung, ESLint, Typen, actionlint,
Workflowprüfungen, Node/DOM, beide Angular-Gruppen, Datenbankprüfungen,
Migrations-Transaktionstest, Bot-Prüfungen, Build und Required checks.

Der vollständige Browserjob benötigte 1:58 statt zuvor 8:56 Minuten; der
Testschritt einschließlich Appstart 1:22 statt 8:18 Minuten. Die beobachtete
Differenz des Browserjobs beträgt 6:58 Minuten, rund 78 Prozent. Das ist ein
Vergleich regulärer Läufe mit bewusst unterschiedlichem Prüfumfang, keine
Beschleunigung derselben 17 Tests und keine Hochrechnung auf die gesamte
GitHub-Rechnung. Die erste Angular-Gruppe benötigte weiterhin 7:24 Minuten.

Der anschließende
[Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/35098360646)
hat das Image veröffentlicht, das Deployment ausgeführt und die öffentlich
ausgelieferte Version erfolgreich geprüft.
