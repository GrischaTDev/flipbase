# 🤖 KI-Änderungsprotokoll

## 2026-10-30 - Juna - PR und geprüften Merge der Vinted-Bot-Verwaltung vorbereiten

**Freigabe:** Der Nutzer hat Branch-Push, PR-Erstellung und den Merge nach erfolgreichen Pflichtprüfungen ausdrücklich beauftragt. Fortsetzung auf `juna/vinted-bot-management-ui`; erneuter Abruf bestätigt weiterhin `origin/master` bei `e0221349`. Die Konfiguration der fremden Arbeitskopien und deren Zweige bleibt erhalten.

**Ablauf und Nachweis:** Die bereits geprüften 24 Code-/Testdateien bleiben unverändert. Eigene Dateien werden gezielt formatiert, der Prüfplan und Vorabcheck unter Node 22 erneut ausgeführt und die bekannte Windows-Grenze im PR ausgewiesen. Für die tatsächliche Freigabe werden sämtliche ausgewählten CI-Pflichtprüfungen des PR-Stands abgewartet. Anschließend erfolgen Merge-Commit, Übernahmeprüfung gegen den frisch abgerufenen Hauptzweig und Bereinigung ausschließlich des eigenen Aufgabenstands. Prüfungen, PR-Verweis und Bereinigungsnachweis werden zusätzlich außerhalb der Arbeitskopie gesichert.

## 2026-10-30 - Juna - Freigegebenes Vinted-Mockup in die reale Verwaltung übernehmen

**Auftrag:** Der Nutzer hat die neue Gestaltung einschließlich Zahnradmenü freigegeben und ihre Umsetzung in Flipbase bei unveränderter Botlogik beauftragt. Nach Statusprüfung und erneutem GitHub-Abgleich eigener Zweig `juna/vinted-bot-management-ui` vom aktuellen `origin/master` (`e0221349`). Die eigenen Mockup-Protokolle und eine zusätzliche Sicherung außerhalb des Worktrees bleiben erhalten. Andere Arbeitskopien und der belegte lokale Hauptzweig bleiben unangetastet.

**Umsetzung:** Durchgehende Filterfläche ohne zweite Sidebar, Kacheln/Kompakt, Suche/Status/Sortierung, Mehrfachauswahl, Zahnradmenü und Detail-/Bearbeitungs-/Betriebspanels über vorhandene Shared Components. Bestehende Betriebsadressen, Kategorienpflege, manuelle Vinted-Prüfung, vollständige Suchbedingungen und Speicher-/Verwerfregeln bleiben erhalten. Duplizieren übernimmt die Bedingungen als Vorlage; mindestens eine Suchbedingung muss sich ändern, weil das bestehende Backend identische Suchen ablehnt. Die neue Suche startet über den bisherigen Speicherweg pausiert; der Aktivierungsschalter des wegwerfbaren Mockups wird bewusst nicht übernommen. Mehrfachaktionen verwenden seriell die vorhandene Statusmutation, behalten fehlgeschlagene Auswahlen und laden angenommene Änderungen nach. Der vorhandene Seitenzustand wird in der kurzlebigen Bot-Hülle geteilt, damit Detail- und Betriebspanel keine zusätzlichen Datenabrufschleifen anlegen. Keine Änderung an Backenddiensten, SQL, Zeitplänen, Rechten oder tatsächlichen Botabrufen.

**Prüfungen:** Neue Darstellungs-, Auswahl-, Duplizier- und Reviewfälle vor der Korrektur rot nachgewiesen. Fünf Modell- und 31 gezielte Komponentenfälle bestanden. Der unabhängige Abschlussreview fand zwei behobene wichtige Punkte: Die bestehende Eindeutigkeitsregel wird nun auch im Browsermock abgebildet und im Kopierdialog erklärt; Aktions- und Nachladefehler erscheinen innerhalb des Detailpanels. Kategorie-/Mehrmarken-/Titelbedingungen, Verwerfbestätigung, Aktivierung, alte Betriebsadressen und Kategorienpflege bleiben geprüft. Mobile Werkzeugleiste nach gemessenem Überlauf angepasst; gemeinsame Checkbox-Touchflächen mindestens 44px. Tastaturöffnung, Zahnrad/Escape/Rückfokus und automatisierte Barrierefreiheit geprüft. Kein echter Vinted-Zugriff.

**Breite Pflichtauswahl:** Node 22.23.4, Actionlint 1.7.12 und CI-Deno 2.9.7 mit gesperrten Abhängigkeiten; keine Versionsänderung im Projekt. Migrationsstruktur/-paket, lokaler Basismigrationsstand, Actionlint, Format, Lint, Typen, Suite-Audit, Shared-UI-Vertrag, Landing und Testorchestrierung erfolgreich. Insgesamt 6.061 Node-/DOM-/Angular-Fälle bestanden; zwei zunächst rote Hüllenfälle zur Testvorbereitung korrigiert und die vollständige Angular-Gruppe mit 55 Dateien/586 Fällen erneut grün ausgeführt. Die echte externe Vorlage wird nach TestBed-Reset zuverlässig geladen. Produktionsbau einschließlich Angular-Vorlagen erfolgreich. Ausgewählte Browsermatrix: 569 Fälle bestanden, davon Core 2, Layout 26, reguläre Browserfälle 530 und die geänderte Verwaltungsdatei 11. Windows prüft Core/Layout und reguläre Gruppen 1–3; die übrigen Gruppen und zusätzlich alle elf Verwaltungsfälle laufen getrennt unter Linux mit Node 22.23.4/Playwright 1.62.1. Eigene vollständige Quellkopien einschließlich versteckter Baukonfigurationen, ein Worker, vier CPUs und 8 GiB je Browsercontainer; bestehende lokale Edge-/E-Mail-Fixture über lokale Proxys angebunden. Der vorzeitig beendete Windows-Teil der vierten Gruppe und erste Linux-Starts ohne Fixture-Anbindung zählen nicht als Erfolg. PWA-Skriptverträge 46/46; drei echte PWA-Builds und 42 Browserfälle unter Linux bestanden, ein nur für Touch vorgesehener Desktopfall planmäßig ausgelassen. Marketplace-Bereich mit CI-Deno erfolgreich; Worker unter Linux 734 bestanden, ein gesonderter Datenbankfall planmäßig ausgelassen.

**Grenzen und Nachweise:** Der Windows-Gesamtpreflight ist nicht als bestanden gewertet: 635 Workflowfälle bestanden, drei bestehende Linux-/Shellfälle scheitern dort und 42 Fälle werden ausgelassen. Genau die drei fehlgeschlagenen Fälle bestehen unverändert im ergänzenden Linux-Lauf. Der vollständige CI-Workflownachweis bleibt vor einem Merge erforderlich. Kein Image-/Hosttest außerhalb der erlaubten GitHub-Umgebung gestartet. Keine lokale Supabase zurückgesetzt, keine fremde Instanz angehalten und keine Migration angewendet. Screenshots der tatsächlichen Anwendung, Quellnachweis und vollständige Protokolle im eigenen Nachweisordner `C:/Users/Grisc/.codex/visualizations/2026/10/30/vinted-bot-management-ui/`. Eigene Testcontainer und Fixture-Prozesse werden nach Sicherung bereinigt; die freigegebene Mockup-Vorschau und die reale lokale Vorschau bleiben erhalten. Kein Push, PR oder Merge.

## 2026-10-30 - Juna - Filtereinstellungen in der Vinted-Vorschau über ein Zahnrad öffnen

**Nutzerkorrektur:** In der bestehenden visuellen Vorschau ersetzt ein einzelnes Zahnrad die doppelte Kennzeichnung aus drei Punkten und „Mehr“. Das vorhandene Menü mit Bearbeiten, Duplizieren und Löschen bleibt darüber erreichbar. Zugänglicher Name und Tooltip benennen die Filtereinstellungen. Fortsetzung derselben Aufgabe auf `juna/vinted-bot-visual-mockup`; Git-Stand geprüft und `origin/master` erneut abgerufen. Die Änderung betrifft nur die außerhalb des Worktrees gespeicherte Demo und diesen Sitzungseintrag; kein Produktumbau und keine Veröffentlichung.

**Gezielte Prüfung:** Die geöffnete Vorschau aktualisiert, die bisherige Statusauswahl „Pausiert“ wiederhergestellt und das Zahnradmenü tatsächlich geöffnet. Menüeinträge, sichtbares Icon, Schließen mit Escape und Rückfokus auf das Zahnrad geprüft. Die Aufnahme `filter-settings-menu.png` liegt beim Mockup. Prüfscripte auf die neue zugängliche Beschriftung angepasst; Quellen gezielt formatiert und JavaScript-Syntax geprüft. Keine breite Produktprüfung.

## 2026-10-30 - Juna - Vinted-Bot-Verwaltung als unabhängigen visuellen Entwurf erkunden

**Auftrag und Grundlage:** Eine ausdrücklich wegwerfbare, anklickbare Vorschau für eine grundlegende Neugestaltung erstellen; keine produktive Oberfläche oder Backendlogik ändern. Git-Stand geprüft, `origin/master` frisch abgerufen und den eigenen Zweig `juna/vinted-bot-visual-mockup` vom aktuellen Stand `e0221349` angelegt. Primäre Arbeitskopie und der anderweitig belegte lokale `master` bleiben unverändert; keine alte Arbeitskopie oder abgeschlossenen Zweige wiederverwendet.

**Entwurf:** Vorhandene Verwaltungsrichtlinie, Apple-Rollenvertrag, Shell, Stammdaten-, Ausgaben- und Navigationsbausteine verglichen. Die Filterfläche kommt ohne zweite permanente Sidebar aus: 15 synthetische Filter als Kacheln, kompakte Alternative, Suche/Status/Sortierung, Mehrfachpause, direkte Aktivierung, Detail-/Bearbeitungsfluss und getrenntes Betriebspanel. Gewünschter Takt, tatsächlicher letzter Erfolg, begrenzte Abdeckung, Fehler und Pause bleiben unterscheidbar. Marken, Kategoriepfade, Bedingungen und Abruftexte sind nach dem visuellen Review lesbarer; die bestehende globale Navigationsreihenfolge und das Logo mit dunklem Träger bleiben Rahmen der Vorschau. Puffer-Vorschläge enthalten die fünf ausdrücklich gewählten Varianten, keine Pufferweste.

**Tatsächliche Prüfung und Ablage:** Lokale Vorschau in Chromium bei 1440/1280px Desktop und 390px Touch gerendert und Screenshots zusätzlich visuell geprüft; Hell/Dunkel, Kacheln/Kompakt, Suche/Status/Leerzustand, Auswahl/Pause, Erstellen/Bearbeiten/Duplizieren/Löschbestätigung, Betrieb, Escape/Fokusfalle/Rückfokus und mobiles Menü geprüft. Acht AXE-Prüfzustände ohne Verstöße im gewählten Umfang, keine JavaScript-Laufzeitfehler oder horizontalen Seitenüberläufe. Touch-Medienwerte und 44px-Aktionsflächen ausdrücklich kontrolliert; mobile Ganzseitenaufnahme über hohen Touch-Viewport statt einer die Medienwerte zurücksetzenden Chromium-Aufnahme. Vollständige Bilder, Panelansichten, Quelltexte, Designnotiz und Prüfergebnisse liegen dauerhaft unter `C:/Users/Grisc/.codex/visualizations/2026/10/30/vinted-bot-redesign-mockup/`; lokaler Server nur auf `127.0.0.1:4387`, zusätzlich offline direkt über `index.html` nutzbar. Kein vollständiger WCAG-/Safari-/Gerätenachweis. Alle Zustandsänderungen bleiben im Arbeitsspeicher; vereinfachte Kategorie-/Markenauswahl, feste Demozeiten, keinerlei echte Serverabfragen. Im Repository ausschließlich dieser Sitzungseintrag; kein Produktionsbau, Docker, Push, PR, Merge oder Deployment.

## 2026-10-30 - Juna - Vinted-Suchfilter über PR veröffentlichen

**Freigabe:** Der Nutzer hat Branch-Push, PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen sowie anschließende Bereinigung des eigenen Branches und Worktrees ausdrücklich beauftragt. Fortsetzung auf `juna/vinted-search-filters`; vor Beginn Git-Stand geprüft und `origin/master` frisch abgerufen. Die bereits gesicherten Screenshots und Nachweise außerhalb des Worktrees bleiben erhalten.

**Ablauf und Grenzen:** Den unveränderten geprüften Produktstand anhand der vorhandenen Quellhashes kontrollieren, Dokumentation aktualisieren, gezielt formatieren und den verbindlichen Vorabcheck erneut ausführen. Der PR hält die lokalen Ergebnisse einschließlich der zwei unter Windows nicht ausführbaren Linux-Hostgrenzentests und ihres erfolgreichen Linux-Nachweises fest. Erst nach den erfolgreichen GitHub-Pflichtprüfungen per Merge-Commit integrieren und die enthaltene Aufgabenrevision vor dem Löschen erneut bestätigen. Andere Zweige und Arbeitskopien bleiben erhalten; insbesondere die anderweitig belegte primäre Arbeitskopie und der in einer fremden Arbeitskopie ausgecheckte lokale `master` werden nicht umgestellt.

**CI-Zeitgrenze:** PR #515 führt dieselbe umfassende Auswahl wie der lokale Plan aus. Qualität, Datenbank, Dienst/Image, alle sieben Anwendungsgruppen, PWA, Kern/Layout und neue Verwaltungsfälle bestehen. Zwei der fünf allgemeinen Chromium-Gruppen werden nach 30 Minuten ohne gemeldeten fachlichen Testfehler abgebrochen. Ihre Protokolle und Artefakte sind gesichert. Die bisherige Aufteilung von 50 Fachdateien auf fünf Gruppen mit jeweils über 100 Fällen ist dafür zu groß. Kleinere Gruppen behalten sämtliche Fälle, Erwartungen, Wiederholungsregeln und Zeitlimits bei; ein zuvor roter Auswahltest sichert die neun Gruppen und die Fehlerweitergabe der letzten Gruppe ab. Der Linux-Nachweis und die neue Pflichtprüfung müssen auf dem endgültigen Stand erfolgreich sein.

**REST-Prüfprozess:** Im zweiten Lauf bestehen alle 5.074 SQL-Prüfungen und die vorgelagerten Nebenläufigkeitsfälle. Danach beendet Node die bestehende REST-Genauigkeitsfixture mit Exitcode 13 während eines offenen HTTP-Aufrufs. Isolierte Kindprozesse stellen den Fehler mit einer verzögerten Antwort und einem verzögerten Antworttext deterministisch nach. Ein aktiver, begrenzter Zeitwächter hält nun den Aufruf bis zum vollständig gelesenen Text am Leben und wird in jedem Ergebnisfall entfernt. Hängende Aufrufe und Antworttexte scheitern ausdrücklich; der echte REST-Parser muss weiterhin die große Konto-ID exakt als Text liefern. Die vier neuen Lebenszyklustests werden vom bestehenden Schemaregistrierungstest importiert und damit im unveränderten verpflichtenden Qualitätsablauf ausgeführt. Die gemeinsame Testorchestrierung bleibt unverändert. Keine Produktabfrage, SQL-Erwartung oder Schutzgrenze gelockert.

## 2026-10-29 - Juna - Gemeinsame Vinted-Suchfilter und Verwaltung umsetzen

**Auftrag:** Den bestätigten Umbau ohne weitere Entwurfsfreigaben in der eigenen Arbeitskopie umsetzen. Vorherige Messungen erhalten; frisch abgerufenes `origin/master` sicher übernommen und eigener Zweig `juna/vinted-search-filters` angelegt. Primäre Arbeitskopie und Planungszweig unverändert. Kein Push, PR, Merge oder Produktionsrollout.

**Verhalten:** Nach regulärem Sitzungsaufbau Katalogantworten seriell im bestehenden Browserkontext ohne Cache abrufen. Nur identische Quellparameter teilen, Kategorie/Marke/Preis/Suchtext erhalten und Titelbegriffe sowie Ausschlüsse je Filter anwenden. Pro Takt Fälligkeit neu lesen; höchstens drei Seiten mit ehrlicher Abdeckungsdiagnose nachladen. Anbieterpausen ab tatsächlicher Ablehnung berechnen, wartende Starts sperren und auch bei fehlgeschlagenem Speichern der Pause lokal geschlossen bleiben. Neue Vorgaben 2.500 ms Mindestabstand, 24 Starts/min und 1.000 ms Diensttakt; bestehende Betriebswerte haben weiterhin Vorrang, kein dauerhaftes Anbieterlimit behauptet.

**Speicherung und Oberfläche:** Deklarative Zuordnungstabelle mit RLS und aktiver Revision/Cursor-Prüfung; offiziell erzeugte Migration und lokale Typen. Stille Erstübernahme, historische Artikel/Favoriten und Rechte erhalten. Private Workspace-Broadcasts übertragen ausschließlich einen Nachladehinweis, anschließend greift die bestehende Berechtigungsprüfung. Filterverwaltung mit Such-/Statusauswahl, Kategorien, Mehrmarkenauswahl, bearbeitbaren Wortvarianten, Ausschlüssen, Preis, Tempo und Abrufdiagnose über vorhandene Shared Controls.

**Review und Korrekturen:** Unabhängiger Review und rote Regressionen sichern Legacy-Backoff, beide Seed-/Nicht-Seed-Reihenfolgen, frische Sitzungsauffrischung bei vorher gecachter URL sowie eigene Aufholstände je Filterrevision und Teilabfrage ab. Ein schnellerer Filter oder fehlgeschlagener Empfänger kann den Stand eines anderen Filters nicht vorziehen. Rohseiten bleiben gemeinsam, Übernahme und Abdeckung gelten je Empfänger; höchstens 2.048 Ausschnitte mit je 288 Kennungen im Speicher. Bereits eingelesene Teilabfragen ohne Vergleichsstand erhalten unbekannte Abdeckung. Die Puffer-Vorschläge enthalten beide ausdrücklich gewünschten Pluralformen. Übersicht verdichtet, Details per Tastatur erreichbar; relative Zeiten altern auch bei API-Ausfall weiter. Ein im Pflichtlauf aufgefallener bestehender Verkaufs-Routentest isoliert seine eingebetteten Hintergrunddienste jetzt vollständig und verbietet unerwartete Serverabfragen; keine Produktlogik oder fachliche Assertion geändert.

**Tatsächliche Prüfungen:** 6.057 Anwendungstests in den gewählten Node-/DOM-/fünf Angulargruppen, 567 Browserfälle der vollständigen Auswahl, 452 Linux-Diensttests und 5.074 SQL-Assertions bestanden. Neue Migration frisch angewandt; Historie und SQL-Inhalt stimmen exakt überein. Security-Advisors ohne Befunde, alle Datenbank-Nebenläufigkeitsgruppen und die echte Release-Migrationsfixture erfolgreich. Dienst-/Anwendungsbau sowie isolierter Start und echter Chrome im Produktionsimage bestanden. Unter Ubuntu 24.04 mit Node 22.23.2 und CI-Browsern bestehen 46 PWA-Skriptfälle sowie 42 PWA-Browserfälle mit einer vorgesehenen Desktop-Auslassung und entsprechendem Androidfall; drei echte Bauten einschließlich historischem Vorgänger geprüft. Marketplace-Deno-Prüfungen mit CI-Version 2.9.7 bestanden; zusätzlich 734 Linux-Workerfälle mit einer separat vorgesehenen Integrationsauslassung. Format, Lint, Typen und Testregistrierung geprüft; die Windows-Grenzen des Gesamt-Preflights und die einzelnen tatsächlichen Befehle stehen im [Prüfbericht](implementation/vinted-search-filter-verification.md).

**Abschließender Abgleich:** Den während der Arbeit integrierten Pipeline-Stand `155fe323` im eigenen Zweig per Fast-forward übernommen, beide eigenen Einträge und die vollständige fremde Changelog-Historie erhalten. 2.732 gesicherte App-/Datenbank-/Dienst-/Test-/Bauquelldateien bleiben bytegleich. Die aktualisierten Workflowverträge anschließend unter Linux erneut geprüft: 674 bestanden, eine separat bestandene Release-Migrationsintegration ausgelassen, Shared-UI-Audit ohne Befund. Vier visuell geprüfte vollständige Screenshots mit synthetischen Daten sind zusätzlich außerhalb des Worktrees gesichert. Die drei historischen Messdatendateien bleiben bytegleich; keine alten Messwerte als Leistungsgarantie des neuen Produkts ausgegeben. Die explizit gesetzten alten Produktionswerte werden durch den Code nicht ersetzt; Sicherung, spätere gezielte Umstellung und Erfolgskontrolle sind in der Dienst-README beschrieben. Kein Push, PR oder Merge dieser Aufgabe und keine weitere Produktionslastprobe oder Produktionsänderung.

## 2026-10-29 - Juna - Zentrale Vinted-Suchfilter vermessen

**Auftrag und Freigabe:** Den bestätigten Messplan in einer eigenen Arbeitskopie vom frisch abgerufenen `origin/master` ausführen. Die beiden noch unveröffentlichten Planungsdokumente ausschließlich lesend übernommen. Der Nutzer hat anschließend ausdrücklich auch kürzere eigene Abstände, höhere Minutenbudgets und reversible reale Belastungsversuche freigegeben. Zehn Sekunden sind ein Ist-Wert, keine Anforderung. Keine Anbieterpausen oder Zugriffsschutzmaßnahmen umgehen; keine Inserate, Käufe oder Nachrichten auslösen. Kein Push, PR, Merge oder dauerhafter Rollout beauftragt.

**Messung:** Bestehenden Betreiberzugang verwendet, den regulären Zulauf vom 29.10.2026, 20:50 bis 21:20 Uhr deutscher Zeit anhand vorhandener Logs und Datenbankzeiten ausgewertet und fünf ohnehin laufende Browserantworten passiv beobachtet. Vier aktive Filter ergeben sechs Teilabfragen. 1.950 neue Artikel sind im Datenbankzeitfenster gespeichert, zwei Sammelabrufe scheitern. Antwortzeiten der kleinen separaten Stichprobe: 1.448 bis 1.848 Millisekunden. Veröffentlichungszeit und Anzeigezeit sind damit nicht gemessen.

**Lokaler Nachweis:** Tatsächlichen Scheduler, Teilabfragen, Minutenbudget, Anfrageabstand, Collector und Parser mit künstlichen Antworten ausgeführt. Fünf, zehn und zwanzig Filter, Marken-/Begriffswechsel, Abstände von einer bis zehn Sekunden, langsame/leere Antworten, Anbieterpause, Änderungen während laufender Runden sowie identische und breite Abrufe verglichen. Der bisherige Fortschritt je Einzelabruf ist bereits im laufenden Abbild vorhanden. Guard-Antworten im Belastungsmodell ersetzen keinen echten Datenbanktest.

**Realer Belastungsvergleich:** Vor Änderungen Konfiguration und Ausgangszustand vertraulich auf dem Flipbase-Server gesichert und automatische Rückkehr vorbereitet. Sieben reale Laststufen verwenden denselben Sammler, Browserkontext, Profil und Image-Digest. Der vollständige Seitenaufbau schafft auch bei kürzeren eigenen Abständen nur rund 8,6 erfolgreiche Katalogaufrufe/min. Ein enger Browser-fetch-Vergleich erreicht ohne erneuten Seitenaufbau etwa 26–28/min in kurzen fehlerfreien Stufen, bei deutlich weniger Speicher. Die ersten sequentiellen Fetch-Stufen sind wegen fehlendem vollständigem Cache-Nachweis als Browseraufrufe gekennzeichnet. Der nach unabhängigen lokalen Kontrollen gestartete No-store-Vergleich begrenzt auf zwei gleichzeitige Anfragen; seine 250-ms-Stufe erhält nach rund 65 Sekunden eine tatsächliche HTTP-429-Ablehnung. Neue Starts werden gesperrt, die Stufe beendet und der ursprüngliche Betrieb wiederhergestellt. Kein festes Anbieterlimit aus dieser Einzelbeobachtung abgeleitet, kein Dauerprofil veröffentlicht.

**Wichtiger bestehender Fehler und Schutz der Messhilfe:** Der ursprüngliche Planer berechnet Fehlerpausen ab Rundenbeginn. Eine nach 200 ms eingehende 429 mit 120 Sekunden Pause führt deshalb schon nach 119,8 Sekunden ab Ablehnung zur Probe. Der Messfall und Bericht benennen diese Lücke ausdrücklich; keine Produktkorrektur vorgetäuscht. Die zusätzliche Parallelmesshilfe verwendet den tatsächlichen Fehlerzeitpunkt und stoppt wartende Startplätze nach Anbieterablehnung. Vier zunächst rote Verhaltensfälle zu Startschutz, Abbruch, gemeinsamer Initialisierung und Fehlerzählung wurden vor dem echten Versuch korrigiert. Sieben isolierte Prüfungen bestehen auch unabhängig. Quellnachweis und lesbare Messhilfe sind in der Recherche dokumentiert.

**Wiederherstellung:** Alle ursprünglichen Umgebungswerte, Profil-/Dateieinbindungen, Image und Filterbedingungen stimmen exakt mit der Sicherung überein. Alle drei Rückkehrtimer sind inaktiv; keine Messcodeeinbindung bleibt. Der Dienst nimmt nach der regulären Pause selbst wieder auf. Abschlusskontrolle um 21:12:39 UTC: healthy, Herkunft ready, alle vier aktiven Filter mit neuen erfolgreichen Abrufen und Fehlerzähler null. Es bleiben 10000 ms Mindestabstand, Budget 30, 5000 ms Rundenpause und 20000 ms Zeitlimit wirksam. Während der Laststufen keine automatischen Neustarts oder OOM; zehn beabsichtigte Containerwechsel einschließlich Rückkehr separat erfasst.

**Nachweise und Grenzen:** Messbericht, drei bereinigte Datendateien und Quellanhang unter `docs/research/2026-10-29-vinted-search-filter-*`. Die vorhandene Sniper-Testregistrierung nimmt die neue Datei mit 35 Messfällen automatisch auf. Insgesamt 386 Diensttests bestanden, sieben Linux-Profillockfälle unter Windows ausgelassen; Diensttypprüfung/-bau, Root-Typen, ESLint, Suite-Audit und neun Auswahl-/Ausführungsverträge bestanden. Ein zusätzlich ausgeführter vorhandener Marketplace-Auswahlvertrag endet unter Windows mit zwei Plattformfehlern; ausdrücklich nicht als bestanden gezählt. Die Gesamtvorprüfung bleibt ohne Actionlint und lokale Docker-Engine unvollständig; Linux-/Image- und echte Datenbanknachweise bleiben offen. Der anfängliche Root-Typprüffehler durch die noch fehlende generierte Versionsdatei ist mit dem regulären Generator behoben. Kein Commit, Push, PR oder Merge. Abschließend erneut abgerufenes origin/master enthält neue fremde Änderungen, aber keine Änderung an den hier vermessenen Sniper-Dateien und dem Suchfilterschema; fremde Zweige und Arbeitskopien bleiben erhalten.

## 2026-10-29 - Juna - Dauerhaften Marketplace-Zugang und automatische Releases einrichten

**Auftrag:** Der Nutzer beauftragt ausdrücklich die einmalige Einrichtung eines dauerhaften, begrenzten Serverzugangs und der Worker-Veröffentlichung über GitHub Actions. Normale Updates sollen anschließend ohne geöffnete Hetzner-Konsole laufen. Die bereits freigegebene Paketnamenkorrektur und die anschließende echte Veröffentlichungsprüfung bleiben Bestandteil der laufenden Aufgabe.

**Umsetzung:** Ein eigener SSH-Schlüssel erhält ausschließlich den fest installierten Marketplace-Status-/Deployment-Einstieg. Der öffentliche Schlüssel wird zur nachvollziehbaren Einrichtung versioniert; der private Schlüssel gehört ausschließlich in das geschützte GitHub-Environment. Der Installer bereitet ein geprüftes, versioniertes Bundle vor und ergänzt anschließend genau eine eingeschränkte Schlüsselzeile. Bestehende Webzugänge, SSH-Konfiguration und Firewall bleiben erhalten. Der Release-Workflow bindet die drei geprüften Images und die Runtime-Prüfsumme an den freigegebenen Hauptzweigstand und startet nach den erforderlichen Prüfungen und dem gegebenenfalls nötigen Web-/Migrationsdeployment.

**Betriebsgrenzen:** Der Server akzeptiert ein eng geprüftes Release-Manifest, keine freien Befehle, Dateipfade oder Skriptupdates. Deployment-Lock, persistentes Phasenjournal, geordneter Stopp, unveränderte übrige Konfiguration und anschließende Laufzeitprüfung bleiben verpflichtend. Der Statuskanal gibt aggregierte Betriebsdaten aus. Der Installer aktiviert keine Veröffentlichung und setzt keine Nachrichten- oder Inseratszustände zurück. Tatsächliche Prüfergebnisse und die erfolgte Aktivierung werden vor Abschluss im PR ergänzt.

**Frischer Hostbefund und begründete Präzisierung:** Die rein lesende Prüfung bestätigt den bisherigen Worker-/Brokerstand, eine aktive Worker-Lease und keine verbliebenen Browsercontainer. Eine Cloudnachricht vom 8. Oktober hat weiterhin einen unbekannten Versandausgang, obwohl ihre Sitzung geschlossen und der Anbieter-Stopp bestätigt ist. Zwei unabhängige Quellprüfungen belegen: Claim und Wiederherstellung starten `outcome_unknown` nicht erneut; ein späterer authentischer Beleg kann nur das Ergebnis vervollständigen. Deshalb trennt die neue Ablaufprüfung den unbekannten Versandausgang von einer noch laufenden Ausführung. Nur eine vollständig identisch gebundene, geschlossen und physisch beendet nachgewiesene Sitzung ohne aktive Nachrichten-Lease kann diesen Ausführungsblock aufheben. Ein stabiler Nachweis wird vor und nach dem geordneten Stopp verglichen. Fehlende oder widersprüchliche Belege, andere unbekannte Auftragstypen und aktive Sitzungen bleiben gesperrt. Nachrichtenzustand und Versand werden dabei nicht verändert; ein unterbliebener Versand wird nicht behauptet.

## 2026-10-29 - Juna - Marketplace-Rollout über einen begrenzten Serverbefehl vorbereiten

**Anlass:** PR #512 ist nach erfolgreichen Pflichtprüfungen integriert. Die drei Marketplace-Images für `8f9a81ac02556daf0f7db13b4169c76f703c0d15` sind veröffentlicht und unabhängig über ihre unveränderlichen Digests und den enthaltenen Runtime-Hash geprüft. Die frische Serverkonsole zeigt weiterhin den bisherigen Worker und Broker. Längere direkte Eingaben in der Browserkonsole brechen ab; deshalb erhält der bereits beauftragte Betreiberablauf einen kurzen, überprüfbaren Python-Aufruf.

**Umfang:** Ein einzelnes Serverskript liest zunächst ausschließlich den tatsächlichen Container-, Konfigurations- und Auftragsstand. Die Vorbereitung übernimmt die aktive aufgelöste Compose-Konfiguration, sichert sie mit eingeschränkten Dateirechten und ersetzt genau vier Imagefelder. Der getrennte Rollout stoppt zuerst den Worker mit seiner vollständigen Ablaufzeit und anschließend den Broker. Offene oder unklare Aufträge, nicht bestätigte Browserbereinigung und unterbrochene Rolloutphasen verhindern die automatische Fortsetzung. Die drei Zielimages und ihr Runtime-Hash sind auf den bereits freigegebenen Stand festgelegt.

**Grenzen:** Das Skript legt keine SSH-Schlüssel, Konten oder neuen Zugriffsrechte an und verändert weder Firewall noch Datenbankzustände, Freigaben oder Zeitpläne. Eine echte Veröffentlichung bleibt ein separater, bereits beauftragter regulärer Geschäftsvorgang nach erfolgreicher Prüfung. Ein vollständiger automatischer Deployment-Workflow wird damit noch nicht behauptet.

**Gezielte Prüfung:** Alle 14 neuen Rolloutfälle bestehen unter Node 22.23.4 ohne Auslassung. Sie führen die echte Plan-, Journal- und Ablaufsteuerung mit simulierten Hostzugriffen aus und prüfen insbesondere unveränderte Konfiguration, Stoppfolge, unbekannte Aufträge, unterbrochene Mutationen, private Ausgaben sowie neue Runtime-Epoch und Neustartzähler. Die anfängliche lokale Prozesssperre wurde durch die freigegebene Ausführung behoben; keine Assertion wurde abgeschwächt. Python-Syntaxprüfung und unabhängiger Quellreview sind erfolgreich. Der Review korrigierte zuvor die erneute Dollarzeichen-Interpolation im ausführbaren Rückweg. Weitere Pflichtprüfungen und der tatsächliche Hostnachweis werden im zugehörigen PR festgehalten.

## 2026-10-29 - Juna - Paketnamenkorrektur aus der unterbrochenen Sitzung übernehmen

**Übernahme:** Der bereits veröffentlichte Zweig juna/vinted-package-choice-label enthält den Paketnamenfix in b14ce7a788584f97483cdc40a52bd9ace2b8fa85; ein PR war noch nicht angelegt. Der aktuelle Hauptzweig mit den zwischenzeitlich abgeschlossenen CI-Anpassungen und der verbindlichen Vorabprüfung wird ohne Änderung des Formularverhaltens übernommen. Beide bisherigen Änderungsprotokolle bleiben vollständig erhalten.

**Abschlussumfang:** Die bestehende Freigabe umfasst PR, Merge nach erfolgreichen Pflichtprüfungen, Worker-Rollout und die anschließende Prüfung desselben unveränderten Entwurfs. Der historische Auftrag 14 scheiterte vor Upload mit package_match; erfolgreiche echte Veröffentlichung ist damit noch nicht nachgewiesen. Der unabhängige Quellreview bestätigt die Korrektur sowie alle ursprünglichen UI-Vorgaben einschließlich Anordnung, kompakter Aktionen, automatischer Statusaktualisierung und Header-Spinner.

**Erneute Prüfung:** Unter Node 22.23.4 bestehen 780 ausgewählte Anwendungstests in 49 Dateien, 734 Workerfälle bei einer bestehenden optionalen Auslassung sowie 249 Deno-Fälle. Typprüfungen, Workerbau, Angular-Produktionsbau, beide isolierten Extension-Browserprüfungen, Actionlint und alle elf Orchestratorfälle bestehen. Die tatsächliche Registrierung enthält 219 Anwendungsbrowserfälle in 15 Dateien und 19 native Worker-Browserdateien. Der native Gesamtlauf besteht 117 von 120 Fällen; drei Fehler betreffen ausschließlich die unveränderte Login-Fixture. Paketwahl, sämtliche vollständigen Veröffentlichungsvarianten einschließlich zehn Fotos und beide persistenten Browserfälle mit aktiver Chromium-Sandbox bestehen. Der vollständige GitHub-Nachweis bleibt vor dem Merge erforderlich.

**Belegter Testfehler und enge Korrektur:** Playwright ruft den bisherigen Routenhandler nach einer erfüllten HTTP-302-Antwort nicht erneut auf; das Weiterleitungsziel konnte deshalb das echte Netz erreichen. Eine kontrollierte Loopback-Probe bestätigt genau diese Folge. Der vorhandene Chromium-Test beantwortet jetzt jeden Weiterleitungsschritt über CDP Fetch und schaltet das Netz zusätzlich ab; eine zweite Probe erhält die echte 302-Navigation bei null Serveranfragen. Der Cookiezustand kommt aus dem tatsächlichen Browserkontext, weil der Netzwerkstack Cookie-Header erst nach der Interception ergänzt. Im Clientfall war außerdem der Antwortlistener erst nach dem Absenden registriert; allein seine rechtzeitige Registrierung macht den isolierten Gegenfall grün. Nach der begrenzten Fixturekorrektur bestehen alle vier Fälle dieser Datei, Typprüfung und ESLint. Die übrigen 116 Fälle sind unverändert im Gesamtlauf erfolgreich. Diese getrennten Nachweise werden nicht als ein einziger fehlerfreier Gesamtlauf dargestellt. Produktionsanmeldung, Assertions, Wiederholungen und Zeitlimits bleiben unverändert.

**Erster vollständiger PR-Lauf:** PR #512 veröffentlicht den exakt lokal geprüften Dateibaum als f0a0d8ef1d51a74284a907b46bd05721d33e83e6 unter der Nutzeridentität. Im Lauf 40908753542 bestehen Quality einschließlich der zuvor lokal fehlenden Dockerverträge, 780 Anwendungstests, beide Extension-Abläufe, sämtliche Marketplace-Imageprüfungen und erstmals alle 120 nativen Worker-Browserfälle in einem einzigen Lauf ohne Auslassung. Die ursprünglichen lokalen Prüfgrenzen sind damit für diese Bereiche geschlossen. Die Anwendungsbrowser wurden dagegen mit 219 Fällen in einem einzigen Worker gestartet und nach insgesamt 30 Minuten 40 Sekunden abgebrochen; das unveränderte Joblimit beträgt 30 Minuten. Das Log enthält zwei vollständige Zeilen mit zusammen 160 Erfolgspunkten und keine Assertionfehlermeldung, aber keinen abschließenden Ergebnisbericht. Die expliziten beiden Abbruchannotationen sind über die verfügbare GitHub-Schnittstelle nicht lesbar. Das Sammelgate weist den abgebrochenen Pflichtjob korrekt zurück. Kein Merge und keine unveränderte Wiederholung.

**Begrenzte Aufteilung großer gezielter Fachgruppen:** Die vorhandene Gruppierungsformel gilt jetzt auch für gezielte Chromium-Fachauswahlen mit mehr als zehn Dateien. Kleinere gezielte Auswahlen behalten einen Job; die bisherigen umfassenden, Kern-, Layout- und Änderungsgruppen bleiben erhalten. Der echte Listenvertrag scheitert vor dem Fix an 219 Fällen in einer Gruppe; danach ergeben sich genau 73, 73 und 73 Fälle. Der unabhängige Vergleich bestätigt exakt dieselben 219 eindeutigen Testidentitäten ohne Verlust, zusätzliche Fälle oder Doppelungen. Alle 64 Auswahl-, Ausführungs- und Registrierungsverträge bestehen unter Node 22.23.4. Der unabhängige Quellreview ist ohne Befund. Die Korrektur verändert weder fachliche Testkörper, Filter, Wiederholungen, Workeranzahl noch Zeitlimits. Der folgende CI-Lauf muss die tatsächliche Laufzeit innerhalb der bestehenden Grenze bestätigen.

**Abschließende Registrierung:** Der aktualisierte Plan für acht geänderte Pfade umfasst wegen der gemeinsamen Auswahlregel zusätzlich alle 557 Anwendungstestdateien sowie Kern-, Layout- und PWA-Prüfungen. Die unabhängige echte Playwright-Auflistung bestätigt 438 eindeutige Fälle in sechs Jobs: 15 Kernfälle, zweimal 93 Layoutfälle und dreimal 79 Fachfälle. Die umfassende Auswahl enthält 237 statt der gezielten 219 Fachfälle; alle Identitäten sind vollständig und überschneidungsfrei enthalten. Die tatsächlichen Ausführungsergebnisse des neuen Stands werden beim PR festgehalten.

**Ausführungsgrenzen:** preflight bricht weiterhin an der vorgesehenen Grenze für ausschließlich GitHub-gehostete Marketplace-Imageprüfungen mit Exitcode 1 als unvollständig ab. Drei vorhandene Deploymentverträge benötigen Docker; ihr lokaler Aufruf meldet ausdrücklich docker ENOENT. Die übrigen lokal ausführbaren Qualitätsprüfungen werden separat ausgeführt. Anwendungsbrowser mit lokaler Supabase und Container-/Isolationsprüfungen benötigen den vollständigen erfolgreichen CI-Nachweis für den neuen exakten PR-Stand vor dem Merge. Der reguläre Marketplace-Publisher veröffentlicht die drei geprüften Images; der anschließende Serverrollout bleibt ein eigener Betreiberablauf. Diese Arbeitsumgebung besitzt dafür keinen eingerichteten Betreiber-SSH-Zugang.

## 2026-10-29 - Juna - Vorabprüfung vor jedem KI-PR verbindlich machen

**Änderung:** Die zentrale AGENTS.md verpflichtet alle KI-Assistenten, vor jedem PR einschließlich Entwürfen und vor weiteren Pushes selbst die eigenen geänderten Dateien automatisch zu formatieren sowie preflight:plan und preflight auszuführen. Formatcheck und Lint bleiben auch bei Dokumentationsänderungen verpflichtend; bereits im Preflight erfolgreich ausgeführte identische Befehle werden auf unverändertem Stand nicht doppelt verlangt. Nach Korrekturen muss der endgültige Stand geprüft werden. Nur Befehle an den Nutzer weiterzugeben genügt nicht.

**Grenzen:** Echte Format-, Lint- und Testfehler sind vor dem PR zu beheben. Die bestehende Beschränkung der Marketplace-Imageprüfungen auf den GitHub-gehosteten Wegwerfrunner bleibt erhalten; offene technische Prüflücken sind konkret zu benennen und vor dem Merge durch die ausgewählte CI abzudecken. Die beiden Ablaufdokumentationen verweisen auf dieselbe zentrale Regel. Reine Regeländerungen benötigen keine vollständige Anwendungstestsuite und keine neuen Tests für Dokumentationstext.

## 2026-10-29 - Juna - Navigationsziel bei einem abgebrochenen Modulimport erhalten

**Abgeschlossener CI-Befund:** Der Hauptlauf 40844877261 zum exakten PR-Stand e5f8ebf besteht 24 von 26 ausgewählten Pflichtjobs; beide Reference-library-Jobs sind ebenfalls grün. Alle 592 regulären Browserfälle, 6012 Anwendungstests, 4993 SQL-Fälle mit zusätzlicher Parallelitätsprüfung und 118 native Workerbrowserfälle bestehen. Die Produktions-PWA hat nach 46 erfolgreichen Scriptprüfungen einen Fehler beim mobilen Rollback: 41 Browserfälle erfolgreich, ein Fehler und eine unveränderte plattformabhängige Auslassung. Das Sammelgate bleibt korrekt rot. Der Hauptlauf dauerte 27 Minuten 38 Sekunden; das ist eine Einzelmessung dieses umfangreichen Audit-PRs, kein Nachweis einer durchschnittlichen Beschleunigung.

**Ursache und Beweisgrenze:** Der Originaltrace zeigt einen abgebrochenen SettingsShell-Import und danach eine zweite echte Dokumentnavigation nach / statt zur angeforderten Einstellungsseite. Anmeldung und Workspace-Antworten sind erfolgreich. Die genaue Initiatorkette fehlt im Originaltrace. Eine gezielte lokale Probe mit genau einem gleichartigen Modulabbruch belegt den passenden Produktfehler: Angular setzt die URL bei NavigationError auf / zurück; AppErrorHandler ruft anschließend StaleChunkRecovery auf, das diese falsche Adresse neu lädt. Pfad, Query und Fragment gehen verloren. Browserereignisse, History-Aufrufstack und der bestehende Reloadmarker bestätigen diese Reihenfolge. Drei unveränderte mobile Diagnosewiederholungen bestanden zuvor; sie zählen ausdrücklich nicht als Fixnachweis.

**Korrektur:** Der vorhandene Startup-Listener merkt Fehlerobjekt und ursprüngliche Ziel-URL. Der gemeinsame Wiederherstellungsdienst verbraucht diesen Kontext einmalig und übernimmt die URL ausschließlich für dasselbe Fehlerobjekt. Sein kleiner Browseradapter akzeptiert nur HTTP(S)-Adressen derselben Origin, stellt den bestehenden History-Eintrag einschließlich State wieder her und führt danach den vorhandenen echten Reload aus. Der unabhängige Review hat den Fragmentfall abgesichert: Ein gewöhnlicher Adresswechsel allein würde bei /#preferences nicht zwingend neu laden. Ein Reload pro Build, normale Fehler, blockierter Session-Speicher und die bestehende Zugriffsprüfung behalten ihren Vertrag. Keine Router-Abhängigkeit im Recovery-Dienst, keine Änderungen an Anmeldung, Service-Worker-Cache, PWA-Testkörpern, Auswahl, Timeouts oder Retries.

**Lokaler Gegencheck:** Der tatsächliche Listener mit echtem Recovery-Dienst und drei Adapterziele scheitern vor der Verhaltenskorrektur an vier passenden Assertions; elf Fälle bleiben grün. Nach der Korrektur bestehen alle 20 engen DOM-Fälle und die vollständige Gruppe mit 369 DOM-Fällen. Die vier ursprünglichen Recovery-Verträge bleiben erhalten. Der erste Adapterversuch traf lediglich eine Grenze des DOM-Testpools; TestBed und globale Browserstubs wurden vollständig entfernt. Die produktiv verwendete Adapterfunktion wird mit expliziten lokalen History-/Location-Endpunkten geprüft. Dieser Setupfehler wird getrennt dokumentiert und nicht als fachlicher Rotnachweis verwendet. Der unabhängige Quellreview bestätigt die vier eingefrorenen Codehashes.

**Abschließende Prüfung:** Beide neuen Produktionsbauten und ihre Assetinventare bestehen; der Legacy-Bau bleibt unverändert. Die kontrollierte echte Browserprobe behält nach genau einem Modulabbruch jetzt Pfad, Query und Fragment und führt den vorhandenen Reload aus. Alle 46 PWA-Scriptfälle und alle 42 ausführbaren ursprünglichen PWA-Browserfälle sind erfolgreich nachgewiesen; die eine bestehende Desktop-Auslassung bleibt erhalten. Der erste vollständige Browserlauf bestand 41 Fälle, konnte den besonderen Hintergrundfensterfall aber wegen einer fehlenden vollständigen Chromium-Binärdatei noch nicht starten. Nach Ergänzung genau dieser gesperrten Browserversion besteht derselbe unveränderte Fall separat. Die beiden Läufe bleiben getrennt dokumentiert; kein einzelner unterbrechungsfreier grüner Gesamtlauf wird behauptet. Alle 6027 Anwendungstests in 557 Dateien bestehen lokal: 2733 Node-, 369 DOM- und 2925 Angularfälle. Reguläre App-/Spec-Typprüfung, vollständiger Suite-Audit, Formatierung, ESLint und der reguläre Produktionsbau sind erfolgreich. Die vier freigegebenen Codehashes sowie die ursprünglichen PWA-Testkörper, Konfiguration, Fixture und Workerdateien bleiben während der Prüfung identisch. Die konkrete CI-Auswahl bleibt bei denselben 592 regulären Browserfällen, 26 Hauptjobs und zwei Reference-Jobs. Vor dem Merge benötigt der neue exakte PR-Head sämtliche ausgewählten erfolgreichen GitHub-Prüfungen.

## 2026-10-29 - Juna - Einkaufsverträge und Kalenderkontrast abschließend prüfen

**Vollständiger CI-Befund:** Der Hauptlauf 40837518265 zu PR #504 beendet 24 von 27 ausgewählten Hauptjobs erfolgreich; beide Reference-library-Jobs sind ebenfalls grün. Die zuvor korrigierten PostgreSQL-, eBay-, Shop-/Versand- und Dropdownfälle bestehen. Alle 6012 Anwendungstests, 4993 Datenbankprüfungen und 118 nativen Workerbrowserfälle sind erfolgreich. Zwei neu erreichte alte Einkaufserwartungen scheitern; das Sammelgate bleibt deshalb korrekt rot. Kein unveränderter Wiederholungsstart und kein Merge trotz fehlender Freigabe.

**Zwei überholte Testerwartungen:** Nach dem Speichern eines Entwurfs öffnet die Anwendung unmittelbar dessen Detail. Der Originaltrace bestätigt erfolgreiche Anlage und anschließendes unabhängiges Lesen desselben Kaufs mit dem gespeicherten Datum. Der Kalendertest prüft deshalb die tatsächliche Detail-URL statt auf eine nicht vorhandene Übersichtszeile zu klicken; die folgende Datumsprüfung bleibt erhalten. Der Kopfzeilentest erwartet die beiden fachlich vorgesehenen Aktionen „Löschen“ und „Als bestellt markieren“ jetzt mit exaktem Text und exakter Reihenfolge. Die frühere zusätzliche „Bearbeiten“-Aktion ist bei bereits editierbaren Entwürfen ausdrücklich entfallen. Beide Aktionen werden vor der Geometriemessung sichtbar erwartet; Zentrierung, 28-Pixel-Höhe, letzte primäre Aktion und sekundäre Farben bleiben geprüft. Der vorhandene Komponentenvertrag bestätigt genau diesen Ablauf.

**Echter Kontrastfehler beim lokalen Gegencheck:** Der unveränderte offene Kalender-AXE-Fall findet „Heute“ im hellen Verwaltungsdesign mit #fcc601 auf #ffffff und nur 1,58:1 Kontrast. Schrift 13 Pixel, Deckkraft eins, reduzierte Bewegung und bereits beendete Animationen; nach deren Abschluss bleibt derselbe Befund. Das dunkle Design besteht. Ausschließlich dieser Text verwendet jetzt den vorhandenen semantischen Token text-fb-brand statt der gelben Aktionsflächenfarbe text-fb-primary. Der vorhandene Token liefert im hellen Design #303030 und im dunklen weiterhin #fcc601. Keine globale Farbe, Regel, Funktion oder Animationsdauer wird verändert.

**Echte fehlerhafte Labelzuordnung:** Der anschließende unveränderte Verkaufsfall findet dieselbe Kennung sale-date sowohl am Datepicker-Host als auch am nativen Input. Der tatsächliche Browser bestätigt label.control = null und falschen Fokus nach einem Labelklick. Die Komponente entfernt deshalb wie das vorhandene TextField ausschließlich die Kennung vom Host; das Input und seine weitergegebene Kennung bleiben erhalten. Der reine Erstellungstest wird durch ein echtes Angular-Hosttemplate mit externem Label ersetzt. Er prüft die native Labelzuordnung und genau eine Feldkennung; alle anderen fünf Testkörper bleiben bytegleich. Gegen die alte Komponente scheitert der neue Vertrag tatsächlich an label.control = null, nach der Korrektur bestehen alle sechs Fälle ohne Filter. Der Verkaufs-Browsertest behält seinen ursprünglichen eindeutigen ID-Selektor.

**Nachweis und Grenzen:** Der alte Kopfzeilenkörper reproduziert lokal exakt die falsche Mindestanzahl; der korrigierte Rest besteht mit echter Angular-Oberfläche. Alle 13 bestehenden Lifecycle- und sechs Datepicker-Komponentenfälle bestehen. Nach beiden Produktkorrekturen sind alle sieben ursprünglichen Kalenderfälle einschließlich der drei Entwurfsbreiten, beider Themes mit unveränderter AXE-Prüfung, Tastatur, Fokus, Scrollen, Größenwechsel und Verkaufsformular erfolgreich. Die zusätzliche echte Labelklick-Probe bestätigt genau eine Feldkennung, korrekte native Zuordnung und tatsächlichen Inputfokus. Ruhender Kontrast: hell 13,19:1, dunkel 9,25:1. Die Browserkörper unterscheiden sich nur im lokalen Fixtureimport; HTTP-Antworten sind isolierte Testdaten, die vollständige Supabase-Integration bleibt CI vorbehalten. Die unabhängige Gegenprüfung bestätigt alle fünf Codehashes; der neue Komponentenvertrag wurde vom jeweils anderen Prüfer kontrolliert. Formatierung, ESLint, reguläre App-/Spec-Typprüfung, Suite-Audit und Produktionsbau bestehen. Nach einem wegen einer vorübergehend nicht reagierenden lokalen Prüfumgebung abgebrochenen Vorbereitungslauf wurden die verbleibenden Prüfungen nacheinander ausgeführt; der Abbruch zählt nicht als Testergebnis. Die echte PR-Auflistung enthält weiterhin dieselben 592 eindeutigen Browserfälle: 358 Fach-, 223 direkt geänderte, neun Layout- und zwei Kernfälle. Acht Fälle wechseln lediglich zwischen den Gruppen. Der nächste exakte PR-Stand muss alle 26 ausgewählten Hauptjobs und beide Reference-Jobs bestehen; kein Fall entfällt, kein Timeout oder Retry wird erhöht.

## 2026-10-28 - Juna - CI-Audit im PR prüfen und Veröffentlichungsrechte trennen

**Auftrag und Stand:** Der Nutzer hat Branch-Veröffentlichung, PR, erfolgreiche Pflichtprüfungen, Merge-Commit und anschließende Bereinigung freigegeben. PR #504 enthält die beiden geprüften Audit-Commits. Weil lokal keine Git-Schreibanmeldung vorlag, wurden sie über die verbundene GitHub-Schnittstelle unter der Nutzeridentität veröffentlicht. Beide Git-Dateibäume stimmen exakt mit den lokalen geprüften Commits überein; die ursprüngliche lokale Historie bleibt bis zum bestätigten Merge separat erhalten. Keine KI-Autorschaft oder zusätzliche Signatur.

**Tatsächlicher CI-Befund:** Hauptworkflow 40773594958 endete vor jedem Testjob mit startup_failure. GitHub validiert sämtliche Jobs eines wiederverwendeten Workflows, auch den durch eine if-Bedingung für PRs ausgeschlossenen Publisher. Dessen packages:write widersprach dem nur lesenden Aufrufer. Die öffentliche GitHub-Annotation bestätigt genau diesen Fehler; ein unveränderter Wiederholungsstart wäre wirkungslos gewesen. Die beiden zusätzlichen Reference-library-Jobs des ersten PR-Stands bestanden.

**Korrektur:** Der wiederverwendete Marketplace-Workflow enthält ausschließlich die lesende Imageprüfung. Ein separater, ausschließlich manuell auf master aufrufbarer Publisher erhält die nötigen Registry-Schreibrechte. Extension- und native Workerbrowserprüfungen, gemeinsamer Imagebau und sämtliche Image-/Hostprüfungen bleiben vor Anmeldung und Push derselben lokal gebauten Images im selben Job erhalten. Es gibt keinen zusätzlichen Imagebau innerhalb eines Laufs und keine erhöhten PR-Rechte. Die neue Workflowdatei löst sämtliche passenden Marketplaceprüfungen aus. Dokumentation und der bisher zu eng auf einen einzelnen Job begrenzte Permissiontest prüfen nun die vollständige Grenze.

**Prüfung und Grenze:** Der gezielte Permissiongegenfall schlug vor dem Fix an packages:write fehl. Nach dem Fix bestanden alle 44 gezielten Auswahl-, Berechtigungs-, Gate- und Vorabcheckfälle ohne Fehler oder Auslassung; ESLint, Prettier, Actionlint und Diffprüfung jeweils Exit 0. Der unabhängige enge Review ist Approved und fand keine konkrete Rechte- oder Auswahllücke. Der vollständige GitHub-Nachweis bleibt vor Merge erforderlich; kein fehlgeschlagener Lauf wird als grün behandelt und keine Testbedingung gelockert.

**CI-Folgelauf:** Der Hauptlauf 40775071086 startet nach dem Rechtefix regulär. Quality, Datenbank, Sniper, Extension, Marketplace-Images, Produktions-PWA und alle 6012 Anwendungstests bestehen: 2733 Node-, 354 DOM- und 2925 Angularfälle ohne unbehandelte Ausnahme. Auch die 20 Browserkernfälle und beide zusätzlichen Reference-library-Jobs sind grün. Layout und native Workerbrowser schlagen dagegen fehl; der Sammelcheck weist diese Fehler korrekt zurück. Kein Merge und kein unveränderter Wiederholungsstart.

**Layoutursache und Korrektur:** Der Fehlertrace und die lokale Reproduktion mit der exakt gesperrten Chromium-Version zeigen mehrere vollständige Seitenstarts im gemeinsamen 60-Sekunden-Zeitbudget. Die schon erreichten Seitenassertions bestehen. Zwölf Verwaltungsseiten, 18 Seiten bei sechs responsiven Breiten und zehn Einstellungsseiten bei drei Breiten werden jetzt unabhängig registriert. Dieselben 150 Kombinationen, Hell/Dunkel, AXE, Screenshots und der App-Neuladecheck bleiben erhalten; echte zustandsabhängige Seitenwechsel bleiben zusammen. Die Aufteilung erhöht die Zahl benannter Fälle, nicht den fachlichen Prüfumfang: globale Auswahl jetzt 20 Kern- und 186 Layoutfälle. Breite Layoutauswahlen mit mehreren Dateien erhalten höchstens zwei Teilgruppen, weil die gemessenen Seitenzeiten plus 187,7 Sekunden CI-Vorbereitung kaum Reserve im bisherigen 30-Minuten-Job ließen. Einzeldateien bleiben in einer Gruppe, vollständige Fach-/Änderungsgruppen bei höchstens drei. Test- und Jobzeitlimits bleiben unverändert.

**Native Browser:** Zwei alte Loginfixtures widersprachen dem seit 6. Oktober freigegebenen Identitätsvertrag. Sie prüfen jetzt genau einen lesenden Kontoprüfungsabruf; ausschließlich HTTP 401 führt zu Pending beziehungsweise Ablehnung. Der bestehende HTTP-403-Gegenfall bleibt erhalten. Die exakte Requestfolge schließt weitere Abrufe, Schreibanfragen und fremde Ziele aus. Die beiden persistenten Browserfälle bestehen lokal unverändert als unprivilegierter Benutzer mit eingeschalteter Chromium-Sandbox. Ihr konkreter CI-Startfehler ist im bisherigen Log verdeckt. Ausschließlich der injizierte lokale Fixture-Launcher zeigt deshalb künftig die ursprüngliche Playwright-Ausnahme und wirft sie unverändert weiter. Produktionscode, AppArmor, Kerneloptionen und Sandbox bleiben unverändert; kein spekulativer Hostfix.

**Gezielter Nachweis und Gegenprüfung:** 44 echte Layoutfälle bestehen unter Node 22.23.4 und exakt gesperrtem Chromium: alle zwölf Verwaltungsseiten, jede der 18 responsiven Routen über alle sechs Breiten verteilt plus zwei Randbreitenfälle, alle zehn Settingsseiten mit beiden Themes plus zwei zusätzliche Screenshotzweige. Die vollständigen Varianten folgen verpflichtend in CI. Login vor Fix fünf Gegenfälle grün und die beiden ursprünglichen Fehler rot, danach sieben gezielt und beide vollständigen Dateien mit 20 Fällen grün. Persistenz vor/nach Testdiagnose jeweils zwei Fälle mit aktiver Sandbox grün; die negative Rootprobe zeigt den Originalfehler und bleibt rot. Alle 17 bestehenden Registrierungsverträge bestehen. Der vorhandene Prozessfall reproduziert vor der Layoutaufteilung den fehlenden zweiten Aufruf; danach 44 Auswahl-/Prozessfälle und drei betroffene echte Listen-/Matrixverträge grün. Ein zusätzlicher duplizierter Routenkatalog wurde nach unabhängiger Kritik wieder entfernt; der vollständige Vergleich aller 150 Kombinationen bleibt als Reviewnachweis erhalten. Die ergänzende strikte E2E-Typprüfung meldet drei bestehende TS4111-Fehler in der unveränderten article-design-fixture; der Vergleich mit den drei Originaltests liefert exakt dieselben Diagnosen. Keine neuen Typfehler, aber auch kein grüner strikter E2E-Typlauf behauptet. Gezieltes Lint, Formatierung, Worker-Typprüfung und Diffprüfung bestehen. Unabhängiger Review der fünf Browserdateien: Approved. Der neue PR-Stand muss sämtliche ausgewählten CI-Jobs einschließlich aller 203 Fälle der drei direkt geänderten Browserdateien erfolgreich abschließen; die konkrete native CI-Launchursache bleibt bis dahin offen.

**Weiterer CI-Gegencheck:** Im Lauf 40779364301 bestehen sämtliche fünf Anwendungsbrowsergruppen einschließlich der 203 direkt geänderten Fälle, alle Anwendungstests sowie Quality, Sniper, Extension, Images und PWA; auch beide Reference-library-Jobs sind grün. Die neue Diagnose weist bei beiden persistenten Workerbrowsern ausdrücklich `No usable sandbox` nach. Der Datenbanklauf entdeckt unabhängig davon einen bestehenden Kalenderfehler: Nach der Herbstumstellung reicht der Vorzeitraum in den aktuellen Zeitraum hinein und zählt 510 statt 10 Aufrufe. Keine unveränderte Wiederholung, kein Merge trotz rotem Sammelcheck.

**Begrenzter Sandbox-Setup:** Installation, Vorbereitung und native Workerbrowser verwenden denselben eigenen Ordner unter RUNNER_TEMP. Nur der wegwerfbare GitHub-gehostete Linux-Runner darf den Setup ausführen. Er liest die tatsächlichen AppArmor-Einstellungen, verlangt genau eine reguläre unverknüpfte Headless-Shell und lädt ausschließlich bei aktiver Usernamespace-Sperre ein root-eigenes Profil für deren exakten Pfad. Chromium behält seine Sandbox. Fehlende Werkzeuge, ungültige Pfade und Parserfehler brechen ab. Derselbe Setup gilt vor manueller Imageveröffentlichung; keine automatische Veröffentlichung ergänzt. Änderungen am Setup wählen alle nativen Browsertests. Die zehn Verhaltenstests sind ausdrücklich in test:workflow registriert; 30 betroffene Auswahl-, Rechte- und Setupfälle bestehen lokal mit vollständig abgefangenen Hostbefehlen. Die tatsächliche AppArmor-Wirkung muss der nächste GitHub-Lauf bestätigen.

**Kalenderkorrektur mit Migration:** Eine reine interne SQL-Funktion ermittelt den Vorzeitraum anhand der entsprechenden lokalen Kalenderuhrzeit; der Stundenvergleich bleibt bei 24 UTC-Stunden. Der bestehende Reader behält Signatur und Verwaltungsprüfung. Direkte Ausführung durch PUBLIC, anon und authenticated ist gesperrt. Elf feste pgTAP-Fälle prüfen beide Zeitumstellungen, 7/30 Tage, UTC, eine abweichende Sitzungszeitzone, die letzte Tagesmikrosekunde und beide Clientrechte. Die alte aus HEAD extrahierte Rechnung scheitert an sechs Fällen, die produktive Korrektur besteht alle elf. Die vorhandene Overviewprüfung behält ihre Summen; der Randdatensatz liegt eine Mikrosekunde statt einer Sekunde vor dem aktuellen Beginn, damit die exklusive Grenze auch in der letzten Tagessekunde gilt.

**Erzeugung und Prüfgrenze:** Ohne lokale Containerengine wurde ausschließlich eine eigene PostgreSQL-17.11-Instanz auf Loopback verwendet. Die exakt in Supabase CLI 2.114.0 verwendeten offiziellen Generatoren pg-delta 1.0.0-alpha.33 und postgres-meta 0.97.0 liefen direkt gegen die beiden eng abgegrenzten Funktionskataloge. Bestehende Default-Grants wurden ausdrücklich nachgebildet. Der offizielle SQL-Export enthält keine eigene Transaktionssteuerung oder globale Sessionänderung; die Funktionskörper sind unverändert. Auf einem frischen Baseline-Klon angewandt, ist der erneute Katalogvergleich leer und bestehen alle elf Regressionen. Das einzige erzeugte Typfragment wurde übernommen, alle anderen Typen bleiben bytegleich. Dies ist kein behaupteter vollständiger lokaler Supabase-Neuaufbau; die vorhandene 49-Fälle-Overviewintegration und das gesamte Anwendungsschema müssen im nächsten CI-Lauf bestehen.

**Abschließender Nachreview der Fehlerkorrekturen:** Unabhängiger Review der 13 betroffenen Code-, Workflow-, Schema-, Test-, Typ- und Anleitungsdateien: Approved. Die fehlende Registrierung des Sandboxtests und seine zunächst fehlende Linux-Plattformgrenze sind behoben; beide lokalen Ablehnungsfälle bleiben auf jeder Plattform aktiv. Auf Linux bestehen alle zehn Sandboxfälle ohne Auslassung, zusammen mit Auswahl und Rechten 30/30. Weitere 30 Migrations-/Paket-/Rechtevertragsfälle, App- und Testtypprüfung, Suite-Audit, Actionlint, ESLint, Format- und Diffprüfung bestehen. Der Reviewer hat Funktionskörper und tatsächliche ACLs unabhängig lesend am migrierten Klon bestätigt. Vor Veröffentlichung wurde origin erneut abgerufen; master ist unverändert. Das neu erzeugte gemeinsame Datenbank-Typfragment bezieht über seine bestehenden Verbraucher zusätzlich 49 fachliche Browserdateien ein; der endgültige Plan enthält acht Browsergruppen und 24 Hauptjobs. Diese breitere Auswahl bleibt für den Datenbank-/Typänderungsumfang bestehen. Der nächste vollständige CI-Lauf bleibt Voraussetzung des bereits autorisierten Merges.

**Vollständiger Sandbox-/Datenbanknachweis und weiterer Fachtestfund:** Im Lauf 40782665830 bestehen alle 118 nativen Workerbrowserfälle ohne Auslassung. Der tatsächliche Ubuntu-Runner meldet aktives AppArmor und eine aktive Usernamespace-Sperre; das exakte Headless-Shell-Profil ist geladen, beide ursprünglich fehlgeschlagenen persistenten Fälle sind grün. Die Datenbank besteht 133 SQL-Dateien mit 4993 Prüfungen einschließlich aller 49 Overview- und elf neuen Periodenfälle sowie anschließender Parallelitätsprüfungen. Auch alle 6012 Anwendungstests, Quality, Images, PWA, Sniper, Extension, beide Reference-library-Jobs und sämtliche direkt geänderten Layoutdateien bestehen. Die zusätzlich ausgewählte Accountdatei scheitert dagegen am bisherigen exakten Labelselektor: Der DOM-Labeltext enthält den dekorativen Pflichtstern, der zugängliche Name korrekt nicht. Der tatsächliche CI-DOM und die echte lokale Angular-Oberfläche reproduzieren denselben Fehler.

**Enger Account-Testfix und lokaler Gegencheck:** Ausschließlich der Passwortdialog enthält jetzt eine vollständig verankerte Feldsuche mit optionalem dekorativem Stern; zusätzlich wird der exakte zugängliche Name geprüft. Das Wiederholungsfeld bleibt ausgeschlossen. Beim Nachlauf fand die unveränderte AXE-Prüfung einen zweiten Testfehler: Sie maß die laufenden 150-/250-Millisekunden-Dialoganimationen. Instrumentiert ergeben die teilweise transparenten Flächen sechs Kontrastmeldungen; nach Ende derselben Animationen Opacity 1 und null Verstöße. Der Test wartet deshalb auf die tatsächlich endlichen Dialoganimationen. Keine Produktfarbe, AXE-Regel, Zeitgrenze oder Wiederholung verändert. Alle drei vorhandenen fachlichen Testkörper bestehen danach in der echten Angular-UI, Exit 0, ohne Auslassung oder Retry; Formatierung und ESLint ebenfalls grün. Die lokale Testkopie nutzt nur die vorhandene Preview-Backendfixture, die originale Supabase-Workspace-/Session-Fixture bleibt unverändert und muss im nächsten CI-Lauf bestehen. Der unabhängige Nachreview bestätigt den exakten Testkörpervergleich und lautet Approved. Die enge Folgeprüfung von 33 exakten Labelaufrufen in 49 Fachdateien sowie 13 importierten Helfern fand keinen zweiten belegten Pflichtsternfall. Der tatsächliche Umfang bleibt 569 Fälle in acht Browsergruppen; die drei Accountfälle wechseln vollständig in die Gruppe direkt geänderter Tests.
**Abgelaufene Sitzung in längerer Fachgruppe:** Chromium 2/3 scheitert nach 52 bestandenen Fällen und 14,9 Minuten am bestehenden Guard der gemeinsamen 15-Minuten-Sitzung; 65 Fälle kommen nicht mehr zur Ausführung. Derselbe Fehler ist mit echten Playwright-Fixtures und supabase-js gegen einen isolierten HTTP-Testserver vor dem Fix reproduziert. Jetzt erhält jeder Worker eine eigene reguläre Anmeldung. Eine testbezogene Fixture prüft mindestens 120 Sekunden Restgültigkeit und erneuert die Anmeldung vor dem nächsten Browserkontext. Browserzustand und Workspace-API teilen genau diese Sitzung; manuelle Touch-Kontexte und eBay-Identitätsprüfung verwenden ebenfalls den aktuellen Zustand. Das zufällige lokale Passwort bleibt in der vom Setup vererbten Laufprozessumgebung. Die alte Authdatei wird nicht zwischen Workern überschrieben; Produktions-TTL, Authlimits, Hostgrenze und anonyme/eigene Testzustände bleiben erhalten.

**Nachweis der Sitzungsgrenzen:** Zwei ausdrücklich in test:workflow registrierte Prozessverträge bestehen mit sieben positiven Playwright-Fällen sowie drei kontrolliert negativen Anmeldungen. Exakt 120 Sekunden verwenden die Sitzung weiter, 119 Sekunden und vollständiger Ablauf lösen vor dem Kontext eine neue Anmeldung aus. Abgelehnte Anmeldung, 60 Sekunden Restgültigkeit und ungültiges Ablaufdatum scheitern vor der Workspaceanlage. Ein unabhängiger Nachlauf mit echten Chromium-Kontexten besteht alle sieben positiven Fälle ohne Retry oder Auslassung. Die zusätzliche Windows-Symlinkhürde im Testharness ist durch eine Verzeichnis-Junction für das bereits absolute Ziel entfernt; kein Windows-Lauf behauptet. ESLint, eng begrenzte TS-Prüfung, Formatierung und vorhandene Offline-Listenverträge sind grün. Unabhängiger abschließender Review einschließlich aller sieben Datei-/Registrierungshashes: Approved. Die Protokollfixture ersetzt nicht den vollständigen fachlichen Supabase-Lauf in CI.

**Gemessene Browserjobgröße:** Chromium 3/3 wird nach rund 30 Minuten abgebrochen. Die gesicherten 80 Erfolgspunkte benötigen bereits 1369,77 Sekunden, davor 203,49 Sekunden Vorbereitung; ein vollständiger Ergebnisbericht fehlt wegen des Abbruchs. 118 zugeteilte Fälle passen bei dieser beobachteten Geschwindigkeit nicht in das bestehende Budget. Nur umfassende Fachgruppen wachsen daher ab 31 Dateien mit einer Teilgruppe je zehn Dateien. Kleine und gezielte Gruppen, Kern, Layout und direkt geänderte Dateien behalten ihre bisherigen Grenzen. Der erweiterte vorhandene echte Listenvertrag scheitert vorher mit 121 Fällen in einer Teilgruppe; danach müssen alle Fälle vollständig und eindeutig in kleinere Gruppen passen. Timeouts, Retries, Assertions und fachliche Auswahl bleiben unverändert. Der tatsächliche Integrationsplan mit der gemeinsamen Sessionkorrektur umfasst 592 eindeutige Browserfälle: 2 Kern, 9 Layout, 370 Fachfälle in sechs Teilgruppen und 211 direkt geänderte Fälle in drei Teilgruppen. Die neue Fixtureabhängigkeit erklärt die zusätzliche Auswahl; sie wird nicht ausgeblendet. Der abschließende gemeinsame Lauf besteht alle 67 Auswahl-, Ausführungs-, Vorabcheck- und echten Listenverträge ohne Fehler oder Auslassung. Formatierung, ESLint und Diffprüfung sind grün. Der unabhängige Review der fertig formatierten Matrix-/Listenänderung ist ohne Befund; sämtliche freigegebenen Datei-Hashes stimmen. Vor Merge sind alle 27 daraus abgeleiteten Hauptjobs und beide zusätzlichen Reference-library-Jobs des nächsten veröffentlichten Stands erforderlich.

**Weitere konkrete Befunde im Lauf 40787676678:** Alle 6012 Anwendungstests, 4993 Datenbankfälle, native Workerbrowser, Images, Extension, PWA, Sniper und beide Reference-library-Jobs bestehen. Quality scheitert erstmals vor dem Migrationstest an der PostgreSQL-Bereitschaft: Der vorläufige Initialisierungsserver akzeptiert kurz einen Unix-Socket und stoppt, bevor der reguläre Server beginnt. Beide bestehenden Bereitschaftsproben verwenden deshalb ausdrücklich TCP auf 127.0.0.1; die 30 Prüfversuche und Fehlerweitergabe bleiben erhalten. Ein registrierter Bash-Verhaltensfall reproduziert die drei Startphasen, scheitert mit dem alten Skript und besteht nach der Korrektur. Ein unabhängiger echter PostgreSQL-17-Vergleich bestätigt Socket-bereit/TCP-nicht-bereit während der Initialisierung. Vier zusätzliche negative Ablaufproben bestätigen Ende nach 30 Warteversuchen, Ausfall vor der Abschlussprobe, unveränderten Testfehlercode und begrenzte Bereinigung. Review der beiden Dateien samt Registrierung: Approved. Das konkrete Docker-Abbild wird weiterhin in CI geprüft; lokal steht keine Containerengine zur Verfügung.

**Zwei Fachabläufe mit unnötigen Dokumentstarts:** Der eBay-Trace erreicht die letzte Erstattungsprüfung erst nach dem 60-Sekunden-Budget: Der letzte Reload beginnt bei 54,735 Sekunden und endet bei 61,794 Sekunden. Zwei davor bereits vorhandene echte Routerlinks ersetzen die unnötigen vollständigen Navigationen; alle vier fachlich nötigen Reloads, genau-einmal-Buchung, Bestandszustände, Anbieterfehler und Erstattungsassertions bleiben erhalten. Der unabhängige Review bestätigt den lokalen Erstattungspfad trotz HTTP 502, zwei unveränderte Storefälle bestehen. Beim Shop-/Versandtest benötigen neun vollständige Seitenstarts allein 60,449 Sekunden. Zwei abschließende Routenwechsel verwenden deshalb die bestehende mobile Einstellungsnavigation und prüfen zusätzlich Ziel-URL und Überschrift. Alle drei Persistenz-Reloads sowie Datenbank-, Impressums-, Bank-, Versand-, AXE- und Fehlerassertions bleiben bestehen. Keine Erhöhung von Zeitlimits, Wiederholungen oder geänderte Produktlogik.

**Veraltete Kostenoption im Browservertrag:** Der Layer-/Tastaturtest verlangt eine inzwischen entfernte Auslandstransaktionsgebühr. Der tatsächliche CI-DOM und die bestehenden Fachverträge enthalten sechs aktuelle Optionen; die vorletzte ist Rabatt. Genau die beiden Auswahlliterale verwenden jetzt diesen aktuellen Eintrag. Überdeckungsprüfung per elementFromPoint, Fokus, Escape, End/Enter, letzter Eintrag Sonstiges und Größenwechsel bleiben bytegleich. Beide betroffenen Testkörper bestehen mit echter Angular-Oberfläche und der bestehenden lokalen HTTP-Fixture ohne Retry oder Auslassung; alle elf vorhandenen Fachfälle einschließlich der Bewahrung alter Auslandsgebühren unter Sonstiges sind grün. Formatierung, Lint und unabhängiger Review sind erfolgreich. Die lokale UI-Probe ersetzt nicht den originalen Supabase-Fixturepfad in CI.

**Gezielte Navigationsnachweise:** Die echte Angular-/Chromium-Probe bestätigt beide eBay-Routerlinks mit einem unveränderlichen Dokumentmarker und genau einer initialen Dokumentanfrage. Die mobile Company-Probe bestätigt bei 390 Pixeln auch nach ungespeicherter Absenderumschaltung beide Ziele, Überschriften und Bankdaten, keine nativen oder HTML-Dialoge, keine Carrier-Schreibanfrage und dieselbe Dokumentinstanz. Beide Proben bestehen jeweils einmal ohne Retry oder Auslassung und nutzen ausschließlich lokale HTTP-Fixtures; der vollständige Supabase-Fachlauf bleibt CI-Aufgabe. Alle sieben bestehenden Fälle der drei geänderten Browserdateien sind unter der tatsächlichen PR-Konfiguration mit unverändert 60 Sekunden und null Retries registriert. Der unabhängige abschließende Review aller sechs geänderten Code-/Registrierungsdateien ist Approved; sämtliche freigegebenen Hashes stimmen im gemeinsamen Stand.

**Umfang des nächsten gemeinsamen Nachlaufs:** Die echte Playwright-Auflistung enthält unverändert exakt dieselben 592 eindeutigen Fälle. Durch die beiden zusätzlich korrigierten Fachdateien wechseln vier Fälle in die vollständige Änderungsgruppe: 366 Fachfälle aus 52 Dateien, 215 direkt geänderte Fälle aus acht Dateien, neun Layout- und zwei Kernfälle. Die elf Browsergruppen sowie insgesamt 27 Hauptjobs und zwei Reference-library-Jobs bleiben erhalten. Der registrierte Bereitschaftsfall besteht auch im gemeinsamen lokalen Stand. Der nächste veröffentlichte Stand benötigt vor Merge erneut alle ausgewählten erfolgreichen CI-Ergebnisse.

## 2026-10-28 - Juna - CI-Prüfumfang und lokale Vorbereitung vereinheitlichen

**Änderung:** Lokaler Vorabcheck mit Planansicht und derselben Auswahl wie GitHub Actions. Der Git-Vergleich berücksichtigt Commits, Index, Arbeitskopie, neue und gelöschte Dateien. Qualitäts-, Dienst-, Datenbank-, PWA- und Baubefehle liegen gemeinsam vor; fehlende Werkzeuge und Fehlercodes werden ausdrücklich weitergegeben. Vor Datenbank- oder Anwendungsbrowserprüfungen wird der lokale Migrationsstand einschließlich des angewandten Inhalts neuer Branchmigrationen lesend geprüft. Eine vorhandene Entwicklungsdatenbank wird weder zurückgesetzt noch angehalten.

**Prüfumfang:** Breite Änderungen wählen einen ausdrücklich benannten Kern von 20 Browserfällen und derzeit 46 gemeinsame Layoutfälle statt pauschal 250 allgemeinen Fällen. Konkret betroffene Fachdateien und direkt geänderte Tests behalten ihren Vorrang; gemischte Änderungen verlieren keine unmarkierten Finanz-, Fehler- oder Berechtigungsfälle. Kleine Featureänderungen erhalten ausschließlich ihre passenden Regressionen. Bekannte redundante Layoutvarianten werden im gezielten Lauf begrenzt, vollständige manuelle Regression und Fehler-Traces bleiben. Extensionprüfungen laufen einmal, native Workerbrowserfälle werden anhand tatsächlicher Imports gewählt, und Worker-/Broker-/Sandboxprüfungen nutzen einen gemeinsamen Sessionbau. Der Wiederverwendungsnachweis bindet sämtliche neuen Jobgruppen und Imageflags.

**Testaufbau und Bereinigung:** Angular-Ressourcen werden an ihre wirklichen Quelldateien und transitiven Komponenten gebunden. Signalaliase, Fehler und Restore bleiben erhalten; unnötige globale UI-Importe entfallen. Der direkte Runner bleibt nach kontrolliertem Vergleich bestehen, wirkungsloses vmMemoryLimit im forks-Pool entfällt. Acht doppelte Prettierfälle und zwei JavaScript-Nachbauten einer SQL-UUID-Prüfung entfernt; die vorhandene pgTAP-Prüfung enthält zusätzlich unvollständige und überlange Lieferantenkennungen. Die bereits umgesetzten Ubuntu24-, Commitdatum-, Dependabot- und Previewkorrekturen bleiben erhalten. Keine technisch erzwungene Merge-Sperre für GitHub Free im privaten Repository vorausgesetzt.

**Unabhängige Gegenprüfung:** Vier getrennte Teilreviews mit gezielten Nachreviews, danach Review des gesamten Diffs und abschließender Nachreview der letzten Fixrunde. Sämtliche konkreten Befunde sind korrigiert, abschließendes Urteil Approved. Funde betrafen verlorene Finanzfälle bei gemischter Auswahl, verdeckten konservativen Rückfall, leere Browsergruppen, fehlende Session-Ignoredatei, durch den Builder umbenannte Angular-Klassen und einen nicht wiederverwendbaren lokalen Paketpfad. Ein kleinerer reiner Textvergleich des Migrationsnachweises wurde nach tatsächlichem Inlinekommentar-Gegenfall verworfen; unbekannte SQL-Lexik meldet eine unvollständige Prüfung. Paketierung, fremde Ressourcenqueue, Umgebungsgrenzen und echte Kindprozessfehler sind gezielt abgesichert.

**Hostgrenze:** Der Gesamtreview erkannte, dass bestehende Imageprüfungen den Host privilegiert einrichten und globale Containerfixtures verwenden. Preflight, gemeinsamer Image-Runner und direkter Shellaufruf benötigen dafür jetzt den wegwerfbaren GitHub-gehosteten Linux-Runner. CI=true allein genügt nicht. Auf Entwicklerhosts wird vor Imagebau oder Hosteingriffen ausdrücklich als unvollständig abgebrochen; Plananzeige und passende lokale Browserbefehle bleiben möglich. Die vorhandenen echten CI-Prüfungen, Rechte und Freigaben bleiben vollständig erhalten. 44 gezielte Prozess-/Auswahlfälle bestanden, ohne reale Docker-/sudo-Aufrufe.

**Angular-Nachweis:** 44 Dateien mit 594 Fällen zunächst erfolgreich; aktualisierte Ressourcen-/Buildergegenfälle separat erfolgreich, Buildervergleich 4 Dateien/86 Fälle. Der disjunkte Restlauf bestand 230 Dateien/2329 Testkörper, endete aber wegen einer unbehandelten Button.variant-Ausnahme nach DealFilters mit Exit 1. Gezielter Vergleich reproduzierte den Fehler ausschließlich mit der neuen Endbereinigung: Metadaten wurden vor der letzten lebenden Fixture zurückgestellt. Der kleine Fix zerstört TestBed-Fixtures vor Restore und unterdrückt keine Bereinigungsfehler. Finaler gezielter Nachlauf: DealFilters, nun sechs Harness-Gegenfälle, Button, Sidebar und ActionOverviewStore, zusammen 5 Dateien/55 Fälle, Exit 0 ohne unbehandelte Ausnahme. Alle 274 Angulardateien wurden in den disjunkten Mengen erfasst; kein grüner vollständiger Wiederholungslauf nach dem Fix behauptet.

**Weitere Gesamtprüfung:** Node 22.23.4: 2733 Nodefälle in 235 Dateien und 354 DOMfälle in 48 Dateien erfolgreich. Verfügbarer abschließender Workflowlauf: 613 bestanden, 0 Fehler, 1 bestehende PostgreSQL-Fixture-Auslassung; drei echte Dockerfälle ausdrücklich per CLI ausgenommen. Anschließende Shared-UI-Prüfung: 256 Dateien/0 Funde. Gemeinsamer Marketplacebefehl mit 249 Denofällen, Worker-Typprüfung, 734 erfolgreichen Workerfällen bei einer vorhandenen optionalen Auslassung und Workerbau erfolgreich. Push-, Sniper-, PWA-Skript- und Landingprüfung zusammen 502 Fälle erfolgreich. Produktionsbau einschließlich Angular-Vorlagen und 282 PWA-Appdateien, projektweiter Formatcheck/Lint, App-/Spec-Typprüfung, Suite-Audit, Actionlint, Shellsyntax und Diffprüfung erfolgreich; letzte Fixdateien gezielt nachgeprüft. Der echte Vorabcheckplan zeigt sämtliche erwarteten Gruppen einschließlich der ausdrücklich offenen lokalen Imageprüfung.

**Offene Ausführungsgrenzen:** Kein Docker in dieser Umgebung; echte Datenbank-, Image- und drei Docker-Deploymentprüfungen stehen daher aus. Die passenden offiziellen Chromiumdownloads lieferten HTML statt ZIP, deshalb keine bestandenen echten Browser-/Extension-/Produktions-PWA-Läufe behauptet. Ein vergleichender Angular-Wiederholungslauf blieb bei 80/81 mit Timeout; der unveränderte Fall bestand isoliert mit altem und neuem Aufbau sowie später im breiten Verbraucherlauf. Ursache nicht abschließend erklärt, keine Timeouts, Retries oder Assertions gelockert. Fallzahlen sind kein Nachweis einer bestimmten CI-Laufzeitersparnis. Keine Pushes, Merges oder Produktionszugriffe.

## 2026-10-28 - Juna - CI-Konfiguration nach dem Audit bereinigen

**Änderung:** Alle 23 Runner-Angaben der sieben verbleibenden Workflows auf Ubuntu 24.04 festgelegt. Der ausschließlich bei Push laufende Produktionsbau übernimmt das Commit-Datum aus `github.event.head_commit.timestamp` statt aus dem Aktualisierungsdatum des Repositorys. Dependabot prüft zusätzlich die vier npm-Lockfiles in Root, Sniper, Push-Worker und Marketplace-Worker; Minor/Patch-Versionen werden wöchentlich gruppiert, Angular-Majors samt zugehörigem Werkzeug bleiben dem manuellen `ng update` vorbehalten. Den temporären Product-Contract-Preview und seine reine Workflow-Testdatei entfernt. Der bestehende Actions-Dependabot-Eintrag bleibt erhalten. Für das später private Repository mit GitHub Free wird keine technisch erzwungene Branch Protection oder Ruleset-Pflicht eingeplant; Sammelcheck und Deployment-Abhängigkeiten bleiben bestehen.

**Prüfung:** 115 ausgewählte bestehende Workflow-, Auswahl-, Freigabe- und Metadatenfälle unter Node 22.23.4 erfolgreich. Drei unveränderte Docker-Integrationsfälle aus `deploy-script.test.mjs` mangels lokalem Docker ausdrücklich nicht ausgeführt. Der erste eingeschränkte Lauf konnte lokale HTTP-Testserver und Git-Kindprozesse nicht starten; nach Freigabe dieser Testhilfen war die ausgewählte Prüfung ohne Codeänderung grün. Actionlint 1.7.12 mit geprüfter CI-Prüfsumme, YAML-Prüfung aller sieben Workflows und vier npm-Verzeichnisse, gesperrte Prettier-Version 3.9.6, `git diff --check` sowie unabhängiger Review erfolgreich. Keine neuen Tests, fachlichen Änderungen oder Abhängigkeitsupdates.

## 2026-10-28 - Juna - Paketnamen unabhängig von Empfehlungen und Zusatztexten lesen

**Produktionsbefund:** PR #500 nach grünen Pflichtprüfungen mit `8c9ccb40e82a05c128ecbcca14ba1846f2f8edef` gemergt. Alle drei Images aus demselben Stand geprüft und bei ansonsten unveränderter Konfiguration ausgerollt. Worker gesund mit null Neustarts. Regulärer Auftrag 14 für denselben unveränderten Entwurf scheitert vor Begin/Upload mit `package_match`; Sitzung geschlossen, weiterhin kein Anbieterinserat. Freigaben, Zeitpläne und der alte unklare Nachrichtenbeleg bleiben unverändert. In der regulären Cloud-Browseransicht wurde ausschließlich eine leere Neuanlage mit Damen → Schuhe → Sneaker untersucht und die Prüfsitzung danach regulär beendet.

**Korrektur:** Die geprüfte native Paketkachel enthält einen eindeutig benannten Titelcontainer mit Empfehlungsbadge und direktem Namensspan. Bisher floss stattdessen ihr vollständiger Text einschließlich Beschreibung und Zusatzlink in den Namen ein. Der gemeinsame Formularvertrag liest jetzt den eindeutigen sichtbaren Namensspan innerhalb derselben per Radio-ID und Testkennung gebundenen Kachel. Leere, versteckte oder mehrdeutige Titel werden abgelehnt; die bisher unterstützte Darstellung ohne Titelcontainer bleibt erhalten. ID-, Auswahl-, Konto- und Freigabeprüfungen bleiben bestehen. Eine Testmaske mit wechselnden Zusatztexten reproduziert vor der Korrektur denselben `package_match` und läuft danach erfolgreich durch.

**Prüfung:** Native Namensauslese und vollständige Vorbereitung zunächst rot, nach Korrektur grün. Der Review fand eine äußere Fehlerfunktion im serialisierten Collector; alle neuen Ablehnungspfade werfen jetzt einen lokalen festen Fehler und der Negativtest verlangt dessen konkrete Meldung. Nachreview ohne Befund. 735 Workerfälle ohne Fehler (727 erfolgreich, acht optionale Auslassungen), 780 betroffene Anwendungstests, 54 Erweiterungs-/Auswahl-/Suitefälle, zwölf Browserregistrierungsfälle, Suite-Audit, Typprüfung und Workerbau erfolgreich. Alle 80 nativen Formularfälle unter Windows und Linux (Node 22.23.4/Playwright 1.63.0, zwei CPUs/vier GiB), alle 237 ausgewählten UI-Browserfälle mit den bestehenden Größen-/Touch-/Farbschemafällen, Produktionsbau sowie gezieltes Lint/Format erfolgreich. Der zusätzlich gestartete breitere native Lauf enthält zwei bereits auf dem unveränderten Hauptzweig isoliert reproduzierte Login-Testfehler; zwei persistente Browserstartfälle scheitern ebenfalls unverändert auf dem Hauptzweig im selben Linux-root-Container. Diese Fälle gehören nicht zur Paketnamensänderung. Keine Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Doppelte Kontoprüfungen beim Fotoupload vermeiden

**Befund:** PR #499 mit `c83e962c306695886644cecf95c96951f020d40b` nach grünen Pflichtprüfungen gemergt, aber noch nicht ausgerollt. Produktiv bleibt PR #497 mit dem vor Begin gescheiterten Auftrag 13. Auch der Fotouploader erhält bisher den vollständigen Submit-Kontocheck als Freigabecallback und prüft das Konto anschließend selbst nochmals. Ein vollständiger lokaler Veröffentlichungsfall mit zehn Originalfotos bestätigt acht Kontoabfragen zwischen zwei Uploads. Die Testmaske unterstützte bisher nur eine durchnummerierte Fotokachel und dieselbe Bild-URL; sie bildet jetzt mehrere eindeutige Kacheln, URLs und die tatsächliche Dateireihenfolge ab.

**Korrektur:** Vorbereitung und Fotoupload teilen denselben Freigabecallback mit exakter Neuanlage-URL. Ihre eigenen Konto-ID-, Routen-, Quellen-, Metadaten- und Reihenfolgeprüfungen bleiben erhalten. Ebenso Begin vor dem ersten Upload und die Behandlung unklarer Ergebnisse. Der vollständige Zehn-Foto-Fall misst danach vier Kontoabfragen zwischen Uploads, 42 vor dem ersten Upload und 100 insgesamt. Kein Cache und keine Wiederholung. Ein tatsächliches Anbieterlimit als Ursache des Produktionsfehlers bleibt unbestätigt; der nächste gemeinsame Rollout enthält diese Korrektur und die vollständige Diagnose.

**Prüfung:** Zehn-Foto-Submit zunächst wegen acht Abfragen zwischen Uploads rot, nach Korrektur mit bestätigtem Inhalt, Foto- und Dateireihenfolge, genau einem Begin und einer Speicherung grün. Alle 38 betroffenen nativen Kategorie-/Vorbereitungs-/Foto-/Submit-Fälle jeweils unter Windows und Linux (Node 22.23.4/Playwright 1.63.0, zwei CPUs/vier GiB) erfolgreich. Alle 735 Workerfälle ohne Fehler (727 erfolgreich, acht optionale Auslassungen), 50 Auswahl-/Suitefälle ohne Fehler (47 erfolgreich, drei plattformabhängige Auslassungen), Suite-Audit, Typprüfung, Workerbau, gezieltes Lint/Format und unabhängiger Review erfolgreich. Unveränderte Bearbeitungs-/Preis-/Fotoreihenfolgefälle behalten den vollständigen grünen PR-498-Abgleich. Keine Angular-, Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Doppelte Kontoprüfungen bei der Veröffentlichung vermeiden

**Befund:** PR #498 mit `2a79e04d5293c310bcaedc761c4df3ededcc134d` nach grünen Pflichtprüfungen gemergt; alle Images und Hauptzweigprüfung erfolgreich. Produktiv bleibt bis zum nächsten gemeinsamen Rollout PR #497, letzter echter Auftrag 13 vor Begin gescheitert. In der vollständig lokalen Submit-Testmaske erzeugt der bisherige Ablauf 95 Kontoprüfungen, davon 71 vor dem ersten Upload. Submit reicht seinen vollständigen Konto-/Routencheck als Freigabecallback an die Vorbereitung weiter; diese und ihre Kategorieauswahl prüfen das Konto anschließend nochmals selbst. Diese Doppelung ist belegt; ein tatsächliches Anbieterlimit als Ursache des Produktionsfehlers ist weiterhin nicht bestätigt.

**Korrektur:** Die Vorbereitung erhält die eigentliche Freigabeprüfung plus weiterhin dieselbe exakte Neuanlage-URL. Ihre eigenen Konto-, Routen- und Kategorieprüfungen bleiben bestehen, ebenso die äußeren Prüfungen vor/nach Vorbereitung, Upload, Speicherung und Verifikation. Keine zwischengespeicherte Identität und keine Wiederholung. Die Nachmessung ergibt 69 Kontoprüfungen insgesamt und 45 vor Upload. Der im Review erkannte Unterschied bei Query/Hash ist ausdrücklich erhalten.

**Prüfung:** Das bestehende vollständige Submit-Szenario überschreitet zunächst das lokale Testbudget von 50 Kontoprüfungen vor Upload (71); nach Korrektur bestehen alle Varianten. Das Budget ist eine Regressionserwartung der Testmaske und kein behauptetes Vinted-Limit. Neue Query-/Hash-Fälle waren ohne die strenge lokale URL-Grenze rot und brechen danach vor Texteingabe, Begin, Upload und Speicherung ab. Alle 32 betroffenen nativen Kategorie-/Vorbereitungs-/Submit-Fälle jeweils unter Windows und Linux (Node 22.23.4/Playwright 1.63.0, zwei CPUs/vier GiB) und alle 735 Workerfälle ohne Fehler (727 erfolgreich, acht optionale Auslassungen). 50 Auswahl-/Suitefälle ohne Fehler (47 erfolgreich, drei plattformabhängige Auslassungen), Suite-Audit, Typprüfung, Workerbau, gezieltes Lint/Format und abschließender unabhängiger Review erfolgreich. Unveränderte Foto-/Preis-/Bearbeitungsfälle wurden nach dem vollständigen grünen PR-498-Abgleich nicht nochmals ausgeführt. Keine Angular-, Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Merkmalsfehler und Zwischenprüfungen eindeutig zuordnen

**Produktionsbefund:** PR #497 mit `4faae50ed988f2c0f57cfa0a74b518544c1012d5` nach grünen Pflichtprüfungen gemergt und alle drei geprüften Images bei unveränderter Konfiguration ausgerollt. Quellen/Module stimmen überein, Worker gesund mit null Neustarts. Regulärer Auftrag 13 für den unveränderten Entwurf scheitert nach 40 Sekunden bereits bei `size`, vor Begin/Upload; kein Anbieterinserat, Sitzung geschlossen. Die genaue Paketdiagnose wird damit noch nicht erreicht. Die wechselnde Feldangabe reicht für eine weitere gezielte Verhaltenskorrektur nicht aus.

**Änderung:** Die feste Phasenklassifikation gilt nun auch für Größe, Zustand, Farbe und Material: Öffnen, Optionen, Parsing, Abgleich, Klick und Schließen. Der gemeinsame Escape-Ablauf bleibt erhalten und benennt ausschließlich seine feste Fehlerphase. Autorisierung, Identität, Formularroute und Kategorievergleich melden ihren tatsächlichen Prüfschritt. Erfolgreiche Zwischenprüfungen stellen den vorherigen Arbeitsschritt wieder her, damit etwa ein gesperrtes Titelfeld korrekt bei den Werten bleibt. Keine Wartezeit, Auswahl, Freigabe oder Schreibgrenze verändert; weiterhin nur eine feste Whitelist ohne private Seitendetails.

**Prüfung:** Fehlende Größenphase und der im Review gefundene verlorene Werte-Schritt zunächst jeweils rot, nach Korrektur grün. Alle 76 nativen Formularfälle unter Windows und Linux (Node 22.23.4/Playwright 1.63.0, zwei CPUs/vier GiB) erfolgreich; alle sechs Phasen für die vier gewöhnlichen Merkmale einschließlich geschlossener Seite geprüft. Alle 735 Workerfälle ohne Fehler (727 erfolgreich, acht optionale Auslassungen), 50 Auswahl-/Suitefälle ohne Fehler (47 erfolgreich, drei plattformabhängige Auslassungen), Typprüfung, Workerbau und gezieltes Lint/Format erfolgreich. Erneuter unabhängiger Review ohne weitere Befunde. Der erste Linuxlauf wurde vor der Korrektur des Reviewbefunds bewusst beendet und zählt nicht als Abschlussnachweis. Keine Angular-, Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Paketfehler vor dem Upload genauer unterscheiden

**Produktionsbefund:** PR #495 mit `8651672d464d9a7172d5ce2245b3c501f3159ff6` nach grünen Pflichtprüfungen gemergt; Worker, Broker und Browserimage aus demselben Stand veröffentlicht und bei unveränderter Konfiguration ausgerollt. Quell- und Modulhashes bestätigt, Worker gesund mit null Neustarts. Regulärer Auftrag 12 überwindet die Marke, scheitert aber vor Begin/Upload mit `package`; weiterhin kein Anbieterinserat, Sitzung geschlossen. In der regulären Cloudansicht dieselbe Sneaker-Kategorie ohne Texte/Fotos geöffnet: Mittel bereits ausgewählt, bekannte Paketkachel und Radio vorhanden. Der genaue Paketfehler ist noch nicht bestimmt. Die Diagnoseansicht verlor ihren Tab; die zugehörige Sitzung wurde später regulär geschlossen. Ein streng auf diese eigene Sitzung begrenzter normaler Revoke-Aufruf fand sie bereits geschlossen und änderte nichts. Danach alle Auftrags- und Sitzungszähler null; Freigabe-/Zeitplanhashes unverändert.

**Änderung:** Ausschließlich feste Codes unterscheiden fehlende Paketoptionen, leere Beschriftung, ungültige Optionsdaten, fehlende Übereinstimmung und Klickfehler. Sie nutzen die bestehende Whitelist bis zum Workerprotokoll. Keine privaten Seitendetails, keine neue Auswahl, Wartezeit oder Wiederholung und keine Änderung an der Grenze vor Begin/Upload. Die tatsächliche Veröffentlichung bleibt offen.

**Prüfung:** Fehlende Paketphase zunächst rot, alle fünf Phasen danach gezielt grün; Transport und Ausführer prüfen die festen Codes bei unveränderter Schreibgrenze. Alle 73 nativen Formularfälle unter Windows und Linux (Node 22.23.4/Playwright 1.63.0, zwei CPUs/vier GiB) erfolgreich. 50 Auswahl-/Suitefälle ohne Fehler (47 erfolgreich, drei plattformabhängig ausgelassen). Alle 735 Workerfälle mit der verwendeten aktuellen Windows-Laufzeit ohne Fehler (727 erfolgreich, acht optionale Auslassungen). Der versehentliche Lauf mit altem Node 22.16 scheitert in fünf unveränderten IP-Abgleichfällen; isoliert ebenso reproduziert. Dieselben acht IP-Abgleichfälle sind mit aktueller Windows-Laufzeit und unter Linux mit Node 22.23.4 erfolgreich. Typprüfung, Workerbau, gezieltes Lint/Format und unabhängiger Review ohne Befund. Keine Angular-, Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Drei Dependabot-Updates gemeinsam prüfen und übernehmen

**Auftrag und Umfang:** Die drei offenen Bot-PRs #386, #387 und #477 erklären, prüfen und abschließen. Nach frischem GitHub-Abgleich deren reine Versionsänderungen auf einem eigenen Zweig vom aktuellen `origin/master` zusammengeführt: `actions/upload-artifact` 7.0.1 → 7.0.2, `actions/setup-node` 7.0.0 → 7.1.0 und `docker/login-action` 4.6.0 → 4.7.0. Alle 30 Verwendungen bleiben auf vollständige veröffentlichte Commitkennungen festgelegt. Offizielle Releases als jeweils aktuellste stabile Version und zugehörige Tag-Commits geprüft. Bestehende Workflow-Eingaben, Berechtigungen, Node-Version und Veröffentlichungsgrenzen erhalten.

**Bisherige Prüfungen:** #386 besitzt erfolgreiche Pflichtprüfungen auf seinem älteren Stand. #387 scheitert am 24.10. an zwei PWA-Updatefällen; #477 überschreitet am 26.10. mit Angular-Gruppe 3/3 das Joblimit. Die Fehlerprotokolle vor einer Wiederholung gelesen. Die drei alten Zweige werden nicht umgeschrieben; ein gemeinsamer Wartungs-PR prüft die Kombination mit dem aktuellen Projektstand und ersetzt nach erfolgreichem Merge die ursprünglichen PRs. Die primäre Arbeitskopie ist durch eine andere Aufgabe belegt und bleibt unverändert.

**Lokale Prüfung:** Alle 6.014 Anwendungstests in 557 Dateien erfolgreich (2.741 Node-, 354 DOM- und 2.919 Angularfälle), zusätzlich 422 Serverfunktions- und 45 Landingpagefälle. Formatierung, ESLint, Typprüfung, Suite-Audit, Angular-Produktionsbau einschließlich PWA-Assetprüfung und gegen die offizielle Prüfsumme geprüftes `actionlint` 1.7.12 erfolgreich. Ein zusätzlicher vollständiger Dateivergleich bestätigt ausschließlich die drei vorgesehenen Versionswechsel an 30 Stellen, ohne geänderte Workflow-Eingaben oder Berechtigungen. Bauwarnungen zu bestehenden ungenutzten Imports, Paketgröße und `pako` bleiben sichtbar.

**Prüfgrenze vor dem PR:** `npm run verify` stoppt bei den Workflowtests: 569 erfolgreich, sechs ausgelassen, ein Fehler wegen der nicht erreichbaren Docker-Engine beim bestehenden Nginx-Test. Docker im normalen Benutzerkontext geprüft und über die vorhandene Datei im Explorer gestartet; die Oberfläche meldet zunächst weiterhin „Engine starting“. Kein Neustart, Zurücksetzen oder Anhalten fremder Projekte. Die übrigen oben genannten Prüfungen danach getrennt erfolgreich ausgeführt. Lokal Windows/Node 26.5.0; verbindliche Linux-/Node-22-Prüfung, Datenbank, Dienste, Browsermatrix und Produktions-PWA bleiben vor dem Merge erforderlich. Die tatsächliche Auswahl ist umfassend: 236 Node-, 48 DOM-, 273 Angular- und 64 Browserdateien plus PWA. Ergebnisse und Grenzen werden im Wartungs-PR festgehalten. Keine Anwendungs-, Schema- oder Paketänderung, keine abgeschwächten Prüfgrenzen.

**CI-Zeitgrenze und Korrektur:** Der erste gemeinsame Lauf von PR #496 bestätigt erfolgreiche Browsergruppen, Datenbank, Dienste, Imageprüfungen, Qualität und 42 Produktions-PWA-Fälle bei einer vorgesehenen Auslassung. Angular-Gruppe 2/3 meldet alle 91 Dateien und 1.015 Fälle erfolgreich, wird aber nach 580,49 Sekunden Testlauf einschließlich Vorbereitung am bestehenden Zehn-Minuten-Joblimit abgebrochen. Damit ist der bei #477 beobachtete Zeitengpass erneut belegt. Vollständige Angular-Auswahlen deshalb auf höchstens 60 statt 100 Dateien je Job verteilt; aktuell fünf statt drei Gruppen. Zeitlimit, Testfälle, Fehlerweitergabe und gezielte Auswahlen bleiben erhalten. Bestehender Grenzfalltest mit 61 Dateien zunächst rot, nach der Korrektur alle 71 Auswahl-/Registrierungs-/Freigabeprüfungen grün. Die echte Vitest-Aufteilung enthält alle 273 Dateien genau einmal in Gruppen mit 55/55/55/54/54 Dateien. Dokumentation angepasst. Nach erreichbarer Docker-Engine zusätzlich alle lokalen Workflowprüfungen erfolgreich: 570 bestanden, sechs vorgesehene Auslassungen, Shared-UI-Prüfung ohne Befund. Keine fachfremde Produktkorrektur.

**Linux-Nachweis vor dem Korrektur-Push:** Eine neue vollständige Angular-Gruppe mit identischer Sperrdatei und Node 22.23.4 im eigenen isolierten Container bei zwei CPUs, vier GiB und zwei Testprozessen erfolgreich: 55 Dateien, 641 Fälle, 217,04 Sekunden. Vollständige Quellkopie einschließlich versteckter Baukonfigurationen; Windows-Abhängigkeiten und Bauausgabe ausgeschlossen, Linux-Abhängigkeiten frisch aus der Sperrdatei installiert. Container automatisch entfernt. Die vollständige neue Fünf-Gruppen-Matrix bleibt vor dem Merge durch CI zu bestätigen.

**Abgleich während der Prüfung:** Zwischenzeitlich integrierten aktuellen `origin/master` einschließlich PR #497 übernommen. Ausschließlich die beiden neuen Protokolleinträge kollidierten; beide vollständig erhalten. Die fremde Workeränderung bleibt unverändert. Der Protokollkonflikt verhinderte den automatischen Prüflauf nach dem Korrektur-Push; nach Auflösung erneut die regulären PR-Prüfungen ausführen.

## 2026-10-28 - Juna - Vinted-Markensuche ohne populäre Vorschläge bedienen

**Produktionsbefund:** PR #494 mit `26302257490298e632da58f901f529ea2388993f` nach grünen Pflichtprüfungen gemergt und alle drei geprüften Images bei unveränderter Konfiguration ausgerollt. Worker gesund mit null Neustarts. Regulärer Auftrag 11 für denselben unveränderten Entwurf scheitert weiterhin vor Begin/Upload mit `brand_options`; kein Anbieterinserat, Sitzung geschlossen. Die längere Wartezeit allein behebt den Fehler nicht.

**Korrektur:** Die bisherige Vorbereitung wartet vor einer unterstützten Markensuche zwingend auf populäre Radiooptionen und beschränkt Suche und Ergebnis auf `#content`. Bei einer bekannten Marke akzeptiert sie nun das eindeutige native Suchfeld auch bei zunächst leerer Vorschlagsliste und bedient ein ausgelagertes Popup. Nichtleere fehlerhafte Optionen, doppelte Suchfelder sowie falsche Kennungen oder Labels bleiben Fehler. Leere Vorschläge erlauben keine erfundene Marke. Ob genau diese Darstellung den Produktionsfehler verursacht, ist erst mit dem nächsten echten Versuch prüfbar.

**Prüfung:** Leere Vorschläge und außerhalb von `#content` liegende Suche jeweils zunächst mit `brand_options` rot, danach bestehende Vorbereitung und vollständiger Submit grün. Die gespeicherte Testmaske bindet ihre Handler nach `DOMContentLoaded`, damit ein nach dem Script gespeichertes Popup ebenfalls eingelesen werden kann. Alle 71 nativen Formularfälle unter Windows und unter Linux mit Node 22.23.4/Playwright 1.63.0 bei zwei CPUs/vier GiB erfolgreich. Alle 735 Workerfälle ohne Fehler (727 erfolgreich, acht optionale Auslassungen); Typprüfung, Workerbau, gezieltes Lint, Formatierung und unabhängiger Review erfolgreich. Keine Angular-, Schema-, Migrations- oder Abhängigkeitsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

## 2026-10-28 - Juna - Auf nachgeladene Markenoptionen warten

**Produktionsbefund:** PR #493 nach grünen Pflichtprüfungen mit `873a90f8a6ef182520e6989b29a48743c197e272` gemergt. Alle drei Images aus demselben Stand veröffentlicht, Quellen und kompilierte Module geprüft und die bestehende Konfiguration bis auf die Imageverweise unverändert ausgerollt. Worker gesund, null Neustarts. Auftrag 10 für denselben unveränderten Entwurf scheitert vor Begin/Upload nun eindeutig mit `brand_options`: Der Feldklick ist durch, aber der bisherige sichtbare Optionen-Wait von fünf Sekunden läuft ab. Sitzung regulär geschlossen, weiterhin kein Anbieterinserat. Freigaben, Zeitplanstand und alter unklarer Nachrichtenbeleg unverändert.

**Korrektur:** Auch nach dem bedienbaren Markenfeld lädt Vinted seine Optionen gesondert nach. Nur die Sichtbarkeitsprüfung dieser Markenoptionen erhält dieselbe feste Grenze von 15 Sekunden wie das Markenfeld. Andere Felder behalten fünf Sekunden. Es wird weiter eine aktuelle sichtbare native Option verlangt; keine Auswahl geraten, kein Popup blind erneut geöffnet und keine Grenze vor Upload/Submit gelockert.

**Prüfung:** Die bestehende Vorbereitung mit erstmals sechs Sekunden nachladenden Markenoptionen scheitert vor der Korrektur exakt mit `brand_options`; danach erfolgreich ohne Upload/Speicherung. Auch der bestehende vollständige Submit enthält diese Verzögerung. Alle 71 nativen Formularfälle unter Windows, 60 betroffene Workerfälle, Typprüfung, Workerbau, gezieltes Lint und Formatierung erfolgreich. Unabhängiger Review ohne Befund. Die tatsächliche Anbieterbestätigung bleibt bis zum nächsten ausgerollten Versuch offen. Keine Angular-, Schema- oder Migrationsänderung; Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

**Linux-Abgleich:** Dieselben 71 nativen Formularfälle unter Linux mit Node 22.23.4, Playwright 1.63.0 und zwei CPUs/vier GiB vollständig erfolgreich. Die fest begrenzte Fehlerprüfung für dauerhaft fehlende Optionen bleibt ebenfalls grün.

## 2026-10-28 - Juna - Markenfehler vor dem Upload genauer zuordnen

**Produktionsbefund:** PR #492 nach vollständig grünen Pflichtprüfungen mit `9547ab735a8be3f974634f85cc077bf4c45e3571` gemergt; alle 237 ausgewählten CI-Browserfälle erfolgreich. Web und gemeinsam geprüfte Worker-/Broker-/Browserimages veröffentlicht und mit unveränderter Konfiguration ausgerollt. Ausgelieferte Quellen und kompilierte Module per Hash geprüft. Worker gesund mit null Neustarts, öffentliche API und ausgelieferter Webcommit bestätigt. Der reguläre Auftrag 9 für den unveränderten Entwurf 11 scheitert nach 42,27 Sekunden am Schritt `brand`, vor Begin/Upload; Sitzung geschlossen, kein Anbieterinserat. Die Paketkorrektur ist damit noch nicht im echten vollständigen Ablauf erreicht. Globale Freigaben, aktueller Zeitplanstand und der alte unklare Nachrichtenbeleg erhalten. Eine weitere reguläre Cloudbeobachtung konnte den Markenteilschritt nicht sicher bestimmen und wurde beendet. Ein zwischenzeitlicher App-Startfehler nach dem Versionswechsel war über den normalen erneuten Start in einer neuen Ansicht lösbar; keine lokalen Daten gelöscht.

**Änderung:** Sieben feste Markenphasen unterscheiden Öffnen, verfügbare Optionen, Parsing, Suche, Kennungs-/Labelabgleich, Klick und bestätigtes Feldlabel. Die bestehenden Whitelists übertragen diese Codes über den isolierten Browser und den Sessionbroker bis zum Auftragsprotokoll. Private Fehlermeldungen, Texte, Kennungen oder Selektoren werden nicht ergänzt. Wartezeiten, Auswahl, Kontofreigabe, Begin und das Verhalten bei unklarem Anbieterergebnis bleiben erhalten. Die Ursache des echten Markenfehlers ist weiterhin offen; diese Diagnose bereitet den nächsten bereits autorisierten Produktionsversuch vor.

**Prüfung:** Fehlende genaue Markenphase zunächst rot, nach Korrektur grün. Die neuen nativen Fälle lösen alle sieben Fehlerarten aus; isolierter Transport und Ausführer prüfen die Codes und die unveränderte Grenze vor Begin. Alle 735 Workerfälle unter Windows ohne Fehler (727 erfolgreich, acht optionale Fälle übersprungen), alle 71 nativen Inserat-Browserfälle unter Windows erfolgreich. Typprüfung, Workerbau und unabhängiger Review erfolgreich. Keine Angular-, Schema- oder Migrationsänderung. Flipbase weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

**Abschließende lokale Prüfung:** Dieselben 71 nativen Formularfälle unter Linux mit Node 22.23.4/Playwright 1.63.0 und zwei CPUs/vier GiB vollständig erfolgreich. 60 Auswahl-/Registrierungsprüfungen, gezieltes Lint, Formatierung und erneute Worker-Typprüfung/Bau ebenfalls grün. Die reine Worker-Diagnose erfordert keinen erneuten fachfremden Anwendungs- oder PWA-Lauf.

## 2026-10-28 - Juna - Sichtbare Vinted-Paketkachel lesen

**Echter Befund:** Auftrag 8 wurde über den normalen Editor direkt beauftragt und scheiterte vor Begin/Upload am Schritt `package`. Noch kein Anbieterinserat angelegt. In der regulären kontogebundenen Cloudansicht die leere Neuanlage und dieselbe Sneaker-Kategorie geprüft: Mittel ist bereits ausgewählt. Der native DOM-Inspektor zeigt `package_type_selector_2` mit `aria-labelledby="package-size-2"`, aber die sichtbare Kachel trägt `id="2-package-size"` und `data-testid="2-package-size--cell"`. Das Radio-Label enthält nur das Radio und einen leeren Span. Die bisherige Auswertung erhält dadurch keinen Text. Keine Artikeltexte, Fotos oder Speicherung im Anbieterformular; Diagnose regulär beendet. Wiehens Zehn-Minuten-Freigabe bleibt Version 16. Der globale Zeitplanhash hat sich durch den inzwischen sichtbaren Zustand eines anderen Kontos geändert; diesen fremden Zustand erhalten. Inseratfreigaben und der alte unklare Nachrichtenbeleg unverändert.

**Korrektur:** Ausschließlich die umgebende native Paketkachel mit derselben positiven Radio-Kennung und passendem `data-testid` liefert den fehlenden Text. Alte funktionierende Beschriftungen bleiben vorrangig. Die Auswahl unterstützt dieselbe eindeutig zugeordnete Kachel zusätzlich zum bisherigen Button. Keine Kennungen geraten, keine verborgene oder fremde Kachel als Beleg verwendet. Testmaske um den beobachteten Aufbau ergänzt und HTML einschließlich wieder eingelesener Speicherung ausdrücklich als UTF-8 ausgeliefert.

**Prüfung:** Vollständiger bestehender Submit-Fall mit nativer Paketkachel zunächst am Schritt `package` rot, nach Korrektur grün. Alle 69 nativen Formular-Browserfälle unter Windows und Linux (Node 22.23.4, Playwright 1.63.0, zwei CPUs/vier GiB) erfolgreich, einschließlich falscher/versteckter Kacheln und Auswahlwechsel. 32 Workerfälle, 54 Erweiterungs-/Auswahl-/Registrierungsfälle, 72 zusätzliche Modellfälle und alle 780 aus dem gemeinsamen Runtime-Verbrauch abgeleiteten Anwendungsfälle erfolgreich. Worker-Typprüfung/Bau, Anwendungsbau und gezieltes Lint erfolgreich; bestehende Bauwarnungen erhalten. Unabhängiger Review ohne Befund. Der offene PR #492 umfasst diese Korrektur und die geladene Markenauswahl. Der echte Veröffentlichungserfolg bleibt bis zum autorisierten Merge, Rollout und neuen Versuch offen. Flipbase ist weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden.

**Zusätzliche Oberfläche:** Alle 71 bestehenden Editor-/Randfall-/Workspace-Browserfälle mit 320–1440 Pixeln, Hell/Dunkel, Maus/Touch und AXE gegen die ruhende Bauvorschau erfolgreich. Der erste Vorschauversuch verwendete irrtümlich den PWA-Server mit Produktions-CSP gegen lokale Testantworten und scheiterte beim Startzugriff. Diesen Lauf beendet und die normale lokale statische Testvorschau verwendet; keine Produkt-Sicherheitsregel oder Prüfung geändert. Suite-Audit und abschließende Format-/Lintprüfung ebenfalls erfolgreich.

## 2026-10-28 - Juna - Auf geladene Vinted-Markenauswahl warten

**Echter Befund:** PR #491 nach grünen Pflichtprüfungen mit `0da6e689ddc774727773cee4d5bc692212eeabed` gemergt und Worker, Broker sowie Browserimage aus diesem Stand veröffentlicht. Auftrag 7 scheitert am 28.10.2026 um 13:47:12 MEZ noch vor Begin/Upload, jetzt eindeutig mit Schritt `brand`. Die Sitzung ist geschlossen; der Worker bleibt gesund mit null Neustarts und ohne unnötige Recovery. Die Browserverbindung war wieder verfügbar. Über die reguläre kontogebundene Flipbase-Cloudansicht ausschließlich die leere Neuanlage geöffnet und Damen > Schuhe > Sneaker gewählt. Marke zeigt danach noch einen Ladespinner und ist nicht bedienbar, während die übrigen Felder bereits da sind. Nach Ende des Ladens lässt sich die Auswahl öffnen; Nike ist erster populärer Treffer. Keine Texte, Fotos oder Anbieter-Speicherung, keine erneute Kontobestätigung. Sitzung regulär beendet; alle Freigabe-/Zeitplanhashes und der alte unklare Nachrichtenbeleg bleiben unverändert.

**Korrektur:** Die unmittelbare `isEnabled`-Abfrage des Ausführers lehnt den legitimen Ladezustand vorzeitig ab. Playwrights normale Klickprüfung wartet jetzt auf ein sichtbares, stabiles und bedienbares Feld. Die Marke hat eine feste Grenze von 15 Sekunden, andere Felder behalten fünf Sekunden. Ein dauerhaft gesperrtes Feld bleibt ein Fehler; Kennungen, Bezeichnungen, Kontozugriff und Grenzen vor Upload/Submit werden unverändert geprüft. Keine Anbieterangabe ersetzt oder geraten.

**Prüfung:** Kategorienabhängig verzögerte Markenfreigabe im bestehenden exakten Markenfall zunächst mit derselben Fehlermeldung aus `openVintedListingChoices` reproduziert, nach Korrektur grün. Der vollständige Submit-Fall enthält dieselbe Verzögerung. Jeweils alle 68 betroffenen bestehenden Formular-Browserfälle unter Windows und Linux (Node 22.23.4, Playwright 1.63.0, zwei CPUs/vier GiB), 88 betroffene Nodefälle, Worker-Typprüfung, Bau, gezieltes Lint und Formatierung erfolgreich. Unabhängiger Review ohne konkrete Befunde. Der echte Veröffentlichungserfolg wird erst nach dem bereits autorisierten grünen PR und Rollout geprüft; bisher kein bestätigtes Inserat.

## 2026-10-28 - Juna - Bestätigte Inseratbereinigung erhalten

**Befund:** PR #490 wurde nach grünen Pflichtprüfungen mit `e7a397da440f773f338738c18eb1f11dc70ff80d` gemergt und als gemeinsam geprüfter Worker-/Broker-/Browserstand ausgerollt. Die Oberfläche bleibt auf dem bereits veröffentlichten PR-489-Stand; die reine Workeränderung löst keinen eigenen Webbau aus. Der reguläre echte Auftrag 6 für den unveränderten Entwurf 11 scheiterte am 28.10.2026 um 13:19:31 MEZ vor Begin/Upload. Das neue Protokoll nennt `provider` und anschließend `cleanup`. Die Browserverwaltung verwirft im äußeren `run` auch den sicheren Formularfehler, beendet die Sitzung und wirft nur einen Sitzungsfehler. Der Ausführer versucht anschließend die bereits entfernte Sitzung nochmals zu schließen und löst unnötige Recovery aus.

**Korrektur:** Ein Sitzungsfehler bestätigt das vollständige Sitzungsende ausschließlich nach erfolgreichem Browserstopp und Freigabe der Lease. Für den gebundenen Inseratversuch bleibt ein gegen die feste Liste geprüfter Formularschritt erhalten; private Fehlermeldungen bleiben neutral. Der Ausführer überspringt nur bei dieser Bestätigung das zweite Schließen. Unbestätigte Stopps bleiben im Recoverypfad; Fehler nach Begin bleiben `outcome_unknown`. Keine Wiederholung oder Freigabegrenze gelockert. Der ursprüngliche Formularfehler und eine echte erfolgreiche Veröffentlichung sind weiter offen.

**Prüfung:** Neue Integration von echtem Sessionbroker und Inseratausführer zuerst mit genau der unnötigen Recovery fehlgeschlagen, nach Korrektur erfolgreich. Fälle enthalten sicheren Formularfehler, private Ausnahme, Fehler nach Begin und unbestätigten Stopp. Sämtliche 727 Worker-Einheitstests unter Windows erfolgreich, acht vorhandene optionale Auslassungen. Der breite Linuxlauf mit Node 22.23.4 beendet sich nach rund vier Minuten regulär mit 734 erfolgreichen Fällen und einer optionalen Auslassung; eine zuvor vermutete Blockade bestätigte sich nicht. Worker-Typprüfung, Bau, gezieltes Lint und Formatierung erfolgreich; unabhängiger Review ohne konkrete Befunde. Weitere Liveprüfung folgt über den schon beauftragten grünen PR und regulären Rollout. Flipbase fehlt weiterhin im verbundenen Lissie-Projektverzeichnis.

## 2026-10-28 - Juna - Veröffentlichung vor dem Upload gezielt diagnostizieren

**Live-Ergebnis:** PR #489 nach allen erfolgreichen Pflichtprüfungen mit `f9afd136f7fbb27e2ca2316028fd1e1d8349e389` gemergt. Web-App, Worker, Broker und Browserimage aus genau diesem Stand veröffentlicht; öffentliche Version und Quell-/Modulprüfsummen bestätigt. Der Worker wurde geordnet beendet, nur vier Imagefelder geändert, Kontofreigaben und Zeitplaneinstellungen blieben gleich. Der ausdrücklich beauftragte echte Versuch für Entwurf 11, Revision 13, zehn Fotos und 79,90 € wurde über den regulären autorisierten RPC als Auftrag 5 angenommen. Er scheiterte am 28.10.2026 um 12:54:53 MEZ vor Begin/Upload mit `provider_unavailable`; Sitzung geschlossen, kein Anbieterbeleg. Damit ist die echte Veröffentlichung weiterhin nicht als behoben bestätigt. Nach dem Versuch meldete der Worker Recovery und startete zehnmal neu; seit 12:56:50 MEZ wieder stabil gesund. Keine manuellen Änderungen an Profilen, Sperren oder Auftragszuständen.

**Diagnoseergänzung:** Der bisherige Sammelfehler verwirft den genauen Formularschritt. Unerwartete Fehler vor der Schreibgrenze übertragen jetzt ausschließlich feste vorhandene Schrittnamen über die bestehende Browserisolation. Der Worker protokolliert diese oder feste Controllerphasen für Kategoriepfad, Berechtigungsprüfung und Fotodownload. Fehler bei Ergebnisablage und Browserbereinigung werden getrennt benannt. Keine Anbieterantworten, Texte, URLs oder Zugangsdaten im neuen Protokoll; Fehler nach Begin und notwendige Recovery bleiben unverändert. Noch keine Behauptung einer behobenen Ursache.

**Prüfung:** Neue Regressionen für verlorenen Schritt und fehlendes Protokoll zuerst rot, danach grün. 58 betroffene Worker-Einheitstests und jeweils 54 vorhandene/neue Browserfälle unter Windows und Linux (Node 22.23.4, Playwright 1.63.0, zwei CPUs/vier GiB) erfolgreich. 61 Auswahl-/Registrierungsfälle, Worker-Typprüfung, Bau, Formatierung und gezieltes Lint erfolgreich. Unabhängiger Review ohne konkrete Befunde. Der Folge-PR gehört zur bereits autorisierten Fehlerkorrektur und zum anschließenden Rollout; echter Erfolg steht weiter aus. Flipbase ist im verbundenen Lissie-Projektverzeichnis nicht vorhanden, daher dort kein fremdes Projekt verwendet.

## 2026-10-28 - Juna - Kompakte Aktionen, Header-Spinner und Vinted-Kategorieauswahl

**Veröffentlichungsfreigabe:** Der Nutzer hat PR-Erstellung, Merge nach sämtlichen erfolgreichen Pflichtprüfungen, anschließenden Worker-/Broker-/Browser-Rollout und die Prüfung einer tatsächlichen Veröffentlichung des betroffenen Entwurfs ausdrücklich beauftragt. Die Bereinigung nach bestätigtem Merge gehört zum Auftrag.

**Auftrag und Umsetzung:** Auf ausdrücklichen Nutzerauftrag die kontofremden Links „Bei Vinted ansehen“ aus der zentralen Aktionsanzeige entfernt. Statuskreis, Überschrift und Angaben stehen dichter in einer gemeinsamen Zeile mit schmaleren Innenabständen; Planungs- und Abbruchaktionen bleiben erhalten. Während einer laufenden oder unmittelbar wartenden Aktion ersetzt ein drehendes Symbol das Header-Icon. Der Button bleibt anklickbar. Nur geplante, pausierte oder abgeschlossene Aufträge lösen dort keine Daueranimation aus; Vinteds nachgelagerte Prüfung ist kein noch laufender Cloud-Auftrag. Die Statuskreise bleiben erhalten. Der bestehende Header-Renderingtest lädt jetzt auch die neue Statuskomponenten-Ressource.

**CI-Korrektur der Testumgebung:** Der erste PR-Lauf fand die fehlende Ressourcenregistrierung der neuen Statuskomponente in den bestehenden Nachrichten- und Workspace-Renderingtests. Beide Fehler lokal reproduziert und ausschließlich deren Testzuordnung ergänzt. Danach bestehen zusammen mit dem Header alle 123 betroffenen Fälle (Exitcode 0); Vitest meldet beim Beenden eines Nachrichten-Testworkers eine Warnung. Keine Produktlogik oder Prüfung abgeschwächt.

**Backendfreigabe und Korrektur:** Der Nutzer hat Backendänderungen für diesen Auftrag ausdrücklich klargestellt. Die frühere Beschränkung auf eine Übergabe war für den gewünschten Projektauftrag falsch angewendet. Im Ausführer einen konkreten Timingfehler reproduziert: Nach Navigation in eine Kategorie konnte eine noch sichtbare Auswahl der vorherigen Ebene als fertig gelten. Der Ablauf wartet jetzt auf die konkrete Zielkennung, vor dem erneuten Auswerten auf deren sichtbaren Kandidaten und nach dem Klick auf das bestätigte Feldlabel. Fehlende Kategorien bleiben Fehler; Konto-, Kategorien-, Upload- und Wiederholungsgrenzen werden nicht gelockert. Regression mit verzögertem Ebenen-/Feldwechsel zuerst rot, nach Korrektur grün; der bestehende vollständige Veröffentlichungsfall enthält diese Verzögerung ebenfalls.

**Live-Diagnose und Grenze:** Die vier ursprünglichen Aufträge für Entwurf 11 sind vor Uploadbeginn mit `provider_unavailable` beendet; die Browsersitzungen wurden jeweils geöffnet. Kategoriepfad aus der aktuellen Datenbank gelesen. Ein ausschließlich lesender nativer Kategorieabruf scheiterte zunächst in der Kategorieauswahl und gelang anschließend; ein gesperrter Preflight erreichte keinen Upload. Die Ursache sämtlicher vier echten Fehler ist dadurch nicht abschließend bewiesen. Kein echtes Foto hochgeladen, kein Vinted-Inserat gespeichert oder veröffentlicht. Eine vorübergehende Diagnosesitzung kollidierte beim nächsten planmäßigen Abruf mit dem gemeinsamen Browserplatz. Die Sitzung über den regulären Broker beendet und die verwaiste eigene Profilreservierung über ChromiumProfileStore.recoverStopped/prepareStopped bereinigt. Den vorher aktiven Zehn-Minuten-Zeitplan mit derselben bestehenden Kontofreigabe und demselben Intervall über die reguläre versionierte RPC wiederaufgenommen; Änderung gegen den konkreten Diagnosefehlerzustand abgesichert. Anschließender regulärer lesender Abgleich am 28.10.2026 um 12:06:24–12:06:33 MEZ erfolgreich, kein Fehlercode, keine offene Browsersitzung und kein eigener Browsercontainer mehr. Worker gesund, Neustartzähler nach Wiederherstellung 60. Keine weitere direkte Diagnose. Die normale Browsersteuerung wurde später von der URL-Sicherheitsprüfung gestoppt; diese Sperre nicht umgangen.

**Prüfungen und Arbeitsstand:** 46 betroffene Anwendungs-/Headerfälle, 65 Worker-Einheitstests und 51 Auswahl-/Registrierungsprüfungen erfolgreich. 88 vorhandene Vinted-Browserfälle einschließlich 320–1920 Pixeln, Hell/Dunkel, Touch, AXE, automatischem Abschluss und reduzierter Bewegung erfolgreich. 30 betroffene Worker-Browserfälle unter Windows und dieselben 30 unter Linux mit Node 22.23.4, Playwright 1.63.0, zwei CPUs/vier GiB erfolgreich; dabei auch der vollständige Upload-/Speicherweg ausschließlich mit Testdaten. Die neue Header-Testressource zunächst fehlend, ergänzt und zwölf Headerfälle erneut erfolgreich; Headerzustände zuletzt mit elf Storefällen nachgeprüft. App-/Worker-Typprüfung, beide Bauten, gezieltes Lint, Formatierung, Shared-UI-Prüfung und Suite-Audit erfolgreich. Drei abschließende Browserfälle prüfen nach den letzten Anpassungen die tatsächliche Headerrotation, den automatischen Abschluss und die kompakte Liste ohne Kontolink; alle erfolgreich. Bestehende Bundle-, pako- und Importwarnungen erhalten. Die tatsächliche CI-Auswahl ist wegen des direkt geänderten Header-Testpfads umfassend; diese Auswahl wurde nicht abgeschwächt. Zwei zusätzlich ausgewählte fachfremde Kleinanzeigen-Studiofälle scheiterten lokal an der fehlenden Supabase-Testsitzung; für diese verbleibt der reguläre CI-Nachweis. Die lokale fachliche Browserprüfung blieb auf Vinted begrenzt. Unabhängiger Review ohne Befunde. Weiterhin derselbe eigene Zweig, noch kein Push, PR, Merge oder Deployment. Flipbase ist weiterhin nicht im verbundenen Lissie-Projektverzeichnis vorhanden; der Bericht wird deshalb hier geführt.

## 2026-10-28 - Juna - Vinted-Editor und automatische Aktionszustände nachbessern

**Auftrag und Umsetzung:** Den sichtbaren Auftragshinweis im Entwurfseditor entfernt; die kurze Screenreader-Meldung bleibt erhalten und der Fokus kehrt zum Veröffentlichungsbutton zurück. Vorlagen stehen rechts unter den Artikeldetails, Preis und Versand darüber. Das Beschreibungsfeld bietet zwölf Zeilen. Gemeinsamer Statusindikator mit gelbem Spinner, animiertem grünem Kreis und weißem Haken sowie Fehler-/Pausenzeichen. Bestätigte Inserate in Anbieterprüfung bleiben als laufend erkennbar. Beobachtete abgeschlossene Nachrichtenaktionen bleiben eine Minute sichtbar und werden nicht mehr als laufend gezählt. Das zentrale Menü benötigt keinen Aktualisieren-Button mehr: vorhandene private Inserat-Broadcasts, Fünf-Sekunden-Abrufe und Aktualisierung bei Fenster-/Sichtbarkeitswechsel halten den Stand aktuell; Kontextwechsel blenden fremde Daten unverzüglich aus.

**Tatsächlicher Veröffentlichungsfehler:** Die bestehende angemeldete Ansicht und die automatische Auftragsantwort ausschließlich gelesen. Die vier fehlgeschlagenen Aufträge 1–4 für Entwurf 11 melden jeweils `provider_unavailable`; der letzte Stand ist vom 28.10.2026 um 10:56:45 MEZ. Der Ausführer fasst mehrere mögliche Ursachen unter diesem Code zusammen. Kein einzelner fehlerhafter Anbieterschritt und keine erfolgreiche Veröffentlichung nachgewiesen. Entsprechend der verbindlichen Frontend-Grenze keine Backendkorrektur: nummerierte Übergabe unter `C:/Users/gt/Desktop/Backend Issues/vinted-editor-actions-fix/01-vinted-publication-provider-unavailable.md`. Die UI stellt diesen Cloud-Fehler verständlicher dar. Keine echte erneute Veröffentlichung, keine Änderung am Nutzerentwurf oder produktiven Konto ausgelöst.

**Prüfung:** Neue Regressionen für automatischen Abschluss und Fensterrückkehr zuerst fehlgeschlagen, nach Korrektur erfolgreich. 63 betroffene Angularfälle einschließlich Editor und Veröffentlichungsablauf, 59 Browserfälle in den beiden betroffenen Dateien, Anwendungsbau, Typprüfung, gezieltes Lint, Shared-UI-Prüfung und Suite-Audit erfolgreich. Browsermatrix mit 320–1920 Pixeln, Hell/Dunkel, Maus/Touch und vorhandenen AXE-Prüfungen. Unabhängiger Review ohne konkrete Befunde. Der ergänzte Reduced-motion-Test reproduzierte einen CSS-Prioritätsfehler der vorhandenen Hakenanimation; die neue Shared-Komponente setzt die Bewegungssperre nun ausdrücklich durch. Danach sechs gezielte Browserfälle einschließlich reduzierter Bewegung, Statuswechsel und zentraler Planung erfolgreich. Die isolierte Inserat-Testantwort enthält jetzt auch die leere Nachrichtenaktionsübersicht, sodass kein künstlicher Teilfehler entsteht. Vorhandene Bauhinweise zu Bundlebudget, pako und ungenutzten Imports bleiben bestehen. Erster lokaler Bau ohne generierte Versionsdatei fehlgeschlagen; nach regulärer Versionserzeugung erfolgreich. Prüfungen mit vorhandenem Node 24.19.0; keine Paketänderung.

**Arbeitsstand:** Eigener Zweig `juna/vinted-editor-actions-fix` ab aktuellem `origin/master` (`9789e7fa`); fremde Änderungen im Hauptcheckout erhalten. Noch kein Push, PR, Merge oder Deployment. Flipbase fehlt im verbundenen Lissie-Projektverzeichnis; deshalb dort kein Projektbericht möglich. Sitzung `01a181f2-6521-75e0-ab66-f2322c3eb637`; diese Eintragung umfasst auch den unabhängigen Review.

## 2026-10-28 - Juna - PR 488: CI-Nachprüfung für Vinted-Veröffentlichung

**Auftrag und Stand:** Die zweite Prüfseite des Vinted-Inserats und dessen unterer Auftragsverlauf wurden durch direkte Veröffentlichung und die zentrale Statusübersicht ersetzt. PR 488 ist geöffnet; Freigabe zum Merge erst nach allen erfolgreichen Pflichtprüfungen. Der tatsächliche Anbietererfolg des ursprünglich fehlgeschlagenen Inserats ist damit noch nicht nachgewiesen.

**Nachprüfung:** Ein neuer mobiler Veröffentlichungs-Test meldete doppelte Kopf- und Fuß-Landmarks, weil die Dialoghülle HTML-Header und -Footer als zusätzliche Dokumentbereiche ausgab. Die semantische Rolle der beiden internen Flächen wurde korrigiert; ihre Struktur und Bedienung bleiben bestehen. Die geänderten Browsergruppen, alle drei Angular-Gruppen, allgemeine Chromium-Gruppen sowie Formatierung, Lint, Typprüfung und Build bestanden auf diesem Stand.

**Getrennter PWA-Testbefund:** Bei zwei PWA-CI-Läufen öffnete ein zusätzliches Testfenster das gewünschte Formular nicht zuverlässig; die Mitschnitte zeigen abgebrochene Script-Anfragen beziehungsweise die Übersicht statt des Einkaufsformulars. Die Mehrfenster-Updateprüfung startet weitere Fenster nun zuerst auf einer vollständig gerenderten Dashboardseite und navigiert erst dann mit der vorhandenen Schnellaktion zum Einkauf. Das separate Start-/Deep-Link-Testverhalten wird nicht verändert. Ein Einstellungsformular wird ebenfalls nach gerendertem Einstieg aufgerufen. Bestehende Prüfungen auf ungespeicherte Inhalte, Versionswechsel und Rückkehr der Fenster bleiben bestehen. Dieser PWA-Testnachlauf ist noch offen.

## 2026-10-28 - Juna - Vinted-Veröffentlichung direkt starten und Aufträge zentral anzeigen

**Auftrag:** Die zweite Seite „Weiter zur Prüfung“ und den Auftragsverlauf im Vinted-Inserateditor entfernen. „Jetzt veröffentlichen“ soll den gespeicherten Entwurf ohne weiteren Bestätigungsschritt beauftragen; Status, Fehler, Abbruch und Terminänderung gehören zur vorhandenen Header-Ansicht „Laufende Aktionen“.

**Umsetzung:** Der Editor führt die vorhandenen lokalen Formularprüfungen und das Speichern weiterhin vor dem Auftrag aus. Die bisherige Veröffentlichungskomponente prüft Anbieterfreigabe, Cloud-Verfügbarkeit, Entwurf, Revision und vorhandene blockierende Aufträge unverändert, startet danach aber automatisch. Für diese direkte Variante zeigt sie nur Fortschritt und konkret erforderliche Korrekturen, nicht noch einmal alle Artikeldetails mit zusätzlichem Veröffentlichungsbutton. Die Terminplanung bleibt als eigener Auswahl-Dialog erreichbar. Auftragsstatus und geplante Aufträge werden workspace- und kontobezogen in die globale Vinted-Aktionsübersicht aufgenommen, einschließlich Abbruch und Terminänderung über die vorhandenen versionierten RPCs. Der Statusblock im Editor entfällt.

**Grenzen und Prüfschritte:** Die Änderung betrifft den Editor und die zentrale Auftragsanzeige, nicht den eigentlichen Headless-Browser-Ausführer. Der Screenshot mit „ohne bestätigten Anbietererfolg“ beweist noch keine konkrete Worker-Ursache. Der neue GitHub-PR muss vor einem Merge die betroffenen Angular-, Browser- und CI-Prüfungen bestehen; eine echte Vinted-Veröffentlichung wird mit diesen Änderungen nicht vorweg behauptet. Als Sicherheit bleibt die bisherige auftragsbezogene Wiederholungskennung bei unklarer Antwort erhalten; ein bestehender bestätigter oder ungeklärter Auftrag blockiert einen neuen.

## 2026-10-27 - Juna - Paketgröße trotz unbestätigtem Markentext übernehmen

**Veröffentlichungsfreigabe:** Der Nutzer hat die PR-Erstellung, den Merge nach erfolgreichen Pflichtprüfungen und die direkte Veröffentlichung dieser Folgekorrektur ausdrücklich beauftragt. Die anschließende Bereinigung gehört zur bestehenden Freigabe.

**Auftrag und Ursache:** In Version 0.381.5 zeigt der Inseratentwurf „Mittel“, meldet beim Wechsel zur Prüfung aber weiterhin eine fehlende Paketgröße. Die ausschließlich lesende Kontrolle des betroffenen Entwurfs bestätigt `brandId: null`, `brandLabel: Nike` und eine noch nicht gespeicherte Paketgröße. Die eigene Formularauswahl erzeugte daraus den ungültigen Markeneintrag `null/Nike`; erlaubt ist eine leere Markenkennung ausschließlich bei „Keine Marke“. Dadurch scheiterte die Übernahme sämtlicher Felder. Der Versandbereich zeigte zwar die lokale Auswahl, übergab sie aber nicht an den Entwurf. Der ursprüngliche Testfall enthielt bereits eine bestätigte Marke und erkannte diese Kombination nicht.

**Änderung:** Das lokale Feldschema verwendet ausschließlich bestätigte Markeneinträge. Andernfalls enthält es den gültigen Eintrag „Keine Marke“, während der ursprüngliche Markenname und seine fehlende Kennung im Entwurf erhalten bleiben. Paketgröße, Größe und weitere Artikelangaben lassen sich unabhängig davon übernehmen. Die Veröffentlichung verlangt weiterhin eine ausdrückliche Markenauswahl; der unbekannte Markentext wird weder bestätigt noch stillschweigend ersetzt. Keine Änderung am Ausführer oder Datenbankschema.

**Prüfungen:** Drei Modellfälle für Klein/Mittel/Groß und ein Versand-Komponentenfall reproduzierten den Fehler zuerst rot. Auch der bestehende Schuh-Browserfall scheiterte mit unbestätigtem Nike-Markentext gegen den alten Bau, weil die sichtbare Auswahl nicht übernommen wurde. Nach Korrektur 14 ausgewählte Modellfälle und 92 Angularfälle erfolgreich; die bestehenden Editor-, Feld-, Vorschau- und Routentests sind enthalten. Der erweiterte Schuhablauf prüft fehlende Paketgröße → Mittel, erhaltenen Markentext, weiterhin nötige Markenbestätigung → vollständige Vorschau. Alle 71 ausgewählten Oberflächenfälle in den vollständigen Dateien `vinted-listing-drafts`, `vinted-listing-edge-cases` und `vinted-workspace-ui` erfolgreich (320–1440 Pixel, Hell/Dunkel, Maus/Touch und bestehende AXE-Prüfungen). Formatierung, gezieltes Lint, Typprüfung, Produktionsbau, 51 Auswahl-/Registrierungsprüfungen und Suite-Audit erfolgreich. Unabhängiger Code-Review ohne Befund; diese Reviewsitzung ist hier mit erfasst.

**Grenzen und aktueller Stand:** Lokale Chromium-Prüfung unter Windows mit ruhender Produktionsvorschau und Testantworten; die Live-Browserverbindung ist nicht verfügbar. Keine Änderung oder Veröffentlichung eines echten Nutzerinserats. Der gespeicherte Entwurf wurde nur gelesen. Linux-/Safari-Prüfung und Veröffentlichung dieser Folgekorrektur stehen noch aus. Die primäre Arbeitskopie ist durch eine andere Aufgabe belegt und bleibt unverändert. Ein neuer eigener Zweig basiert auf dem frisch abgerufenen `origin/master`. Logs und Bilder liegen unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-package-size-*` beziehungsweise `flipbase-listing-browser-results`.

## 2026-10-27 - Juna - Inseratformular unabhängig vom Vinted-Formularabruf bereitstellen

**Veröffentlichungsfreigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen, anschließende Bereinigung und ausdrücklich auch die Veröffentlichung des Vinted-Ausführers beauftragt. Web-App, Worker/Broker und getrenntes Browserabbild werden auf den zusammengehörigen freigegebenen Stand geprüft.

**Zusätzliche Livekontrolle vor Merge:** Der bestehende Entwurf zeigt „Damen > Schuhe“ ohne Größe. Eine ausschließlich lesende Kontrolle belegt Kategorie 16 als Oberkategorie mit 13 Kindern. Die Inseratauswahl lässt deshalb nur konkrete Blattkategorien übernehmen; Eltern bleiben für Navigation und vorhandene Entwürfe sichtbar. Ein bestehender Elternwert wird vor der Vorschau mit einer verständlichen Unterkategorie-Meldung gesperrt. Auch ohne geladenen Kategoriebaum wird kein vollständiger Entwurf beauftragt. Der Baum kann nach Fehlern gezielt erneut geladen werden, ohne Formulareingaben zu verlieren; parallele und verspätete Abrufe sind geschützt. Die konkreten Regressionen zunächst rot, dann grün; unabhängiger Nachreview ohne offene Punkte. Der echte Nutzerentwurf wurde weder neu geladen noch gespeichert oder veröffentlicht.

**Auftrag und Ursache:** Beim Erstellen eines Nike-Inserats unter Damenschuhen fehlen Größe und weitere Angaben; „Weiter zur Prüfung“ scheitert mit „Vinted-Auswahl konnte nicht geladen werden“. Editor und Vorschau lesen bisher die native Vinted-Neuanlagemaske über das Zielkonto. Der Nutzer fordert ausdrücklich ein eigenes Flipbase-Formular.

**Umsetzung:** Größe, Zustand, Farben, Materialien und Paketgröße entstehen aus einer eigenen lokalen Auswahl. Schuh-, Kleidungs-, Kinder-, Mützen-, Handschuh-, Gürtel- und BH-Größen sind getrennt. Das Ausfüllen benötigt kein verbundenes Vinted-Konto. Die Vorschau liest keine Anbieterformularfelder mehr; Rechte, Konto, Laufzeit und Auftragszustand bleiben geprüft. Eigene Auswahlkennungen sind durch `attributes.flipbaseListingForm = '1'` gekennzeichnet und ausdrücklich keine Anbieterkennungen. Ein alter Entwurf wird vor einem neuen Auftrag in der eigenen Formularversion gespeichert. Erst der Ausführer ordnet diese Angaben anhand eindeutiger aktueller Anbieterbeschriftungen zu und prüft vor Upload/Speichern sowie nach Speicherung den aufgelösten Inhalt. Unmarkierte alte Aufträge behalten ihre bisherige strenge Kennungsprüfung. Keine neue Datenbankmigration oder Abhängigkeit.

**Reviewkorrekturen:** Kombinierte Altgrößen und EU-/Dezimalschreibweisen werden übernommen, spezielle Größenprofile vor allgemeiner Kleidung ausgewählt. Numerische Doppelgrößen werden vollständig verglichen; unbekannte oder mehrdeutige Größen bleiben als sichtbarer Korrekturhinweis erhalten. Keine Teilübernahme wie `176/182` zu `176`. Die konkreten Reviewbefunde jeweils zuerst mit fehlschlagenden Regressionen reproduziert. Unabhängiger abschließender Nachreview ohne offene Befunde.

**Gezielte CI-Korrektur:** Der Linuxlauf des aktualisierten PRs reproduzierte einen zu frühen Klick auf „Weiter zur Prüfung“, während der Kategoriebaum noch geladen wurde. Die übrigen Prüfbereiche bestanden. Log und DOM zeigen den verbliebenen Editor ohne Vorschau. Mit einem gezielt blockierten Kategorienabruf im bestehenden Wiederholungsfall lokal reproduziert; zusätzliche Komponentenregression zunächst rot. Die Prüfungsschaltfläche bleibt während des Kategorienabrufs gesperrt. Nach Freigabe des Abrufs prüft derselbe Browserfall weiterhin vollständige Vorschau und identischen Wiederholungsauftrag, ohne längere Zeitgrenzen oder abgeschwächte Prüfungen. Gezielt erfolgreich und im Nachreview ohne offenen Befund; der korrigierte Stand wird erneut regulär in der CI geprüft.

**Prüfungen:** 30 ausgewählte Modellfälle und 91 Angularfälle erfolgreich; bestehende Editor-, Feld-, Vorschau-, Routen- und Kontotests sind enthalten. 725 erfolgreiche Worker-Einheitstests bei acht bestehenden optionalen Auslassungen und 17 erfolgreiche betroffene Worker-Browserfälle prüfen einschließlich vollständigem Submit die eigene Formularversion sowie einen Abbruch vor jedem Upload bei unbekannter Größe. 71 bestehende und neue Browserfälle in `vinted-listing-drafts`, `vinted-listing-edge-cases` und `vinted-workspace-ui` prüfen Speichern/Wiederöffnen, Konto-/Revisiongrenzen, Fehler, Maus/Touch, Hell/Dunkel und AXE. Vier neue Damenschuhfälle mit konkreter Sneaker-Unterkategorie bestätigen bei 1440/390 Pixeln Größe 38, einen weiterhin funktionierenden Prüf-/Auftragsweg und null Formularabrufe trotz vorbereiteter HTTP-503-Antwort. Ein weiterer Fall sichert Kategorienfehler → erneuter Abruf → Oberkategorie-Meldung → konkrete Schuhart und Größe 44,5 ab. Die gerenderte Theme-Klasse wird ausdrücklich geprüft; die Bildkontrolle entdeckte und korrigierte die ursprüngliche Reihenfolge der Testinitialisierung. Formatierung, Lint, Typen, Produktionsbau, 51 Auswahl-/Registrierungsprüfungen, Suite-Audit und Shared-UI-Prüfung (254 Dateien, keine Findings) erfolgreich. Vorhandene Bauhinweise zu Bundlegröße, pako und ungenutzten Importen bleiben bestehen. Logs und Bilder unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-listing-*`.

**Lokale Umgebung und Grenzen:** Windows/Chromium mit ruhender optimierter Vorschau auf `http://127.0.0.1:4235`; Browser-Plugin nicht verfügbar, bestehendes Playwright verwendet. Eine anfängliche laufwerkübergreifende Abhängigkeitsverknüpfung ließ Angular Bilddateien nicht auflösen. Ihr Entfernen wurde automatisch blockiert; anschließend die Verknüpfung zerstörungsfrei ins eigene Temp-Verzeichnis verschoben und die festgeschriebenen Abhängigkeiten lokal installiert. Keine Sicherheitsregel abgeschwächt. Die isolierte Produktionsvorschau hat absichtlich blockierte Service Worker; deren Updateprüfhinweis ist kein Nachweis für einen Produktfehler oder eine PWA-Abnahme. Die CI-Auswahl enthält zusätzlich den unabhängigen alten `listing-studio`-Datenbankablauf; lokal nicht erneut durchgespielt. Linux-/native Safari-/Geräteprüfung und ein echter Vinted-Upload wurden nicht durchgeführt. Keine Behauptung, dass jede heutige Anbieteroption vollständig gespiegelt sei: Die Listen sind Flipbase-Auswahl, die tatsächliche Verfügbarkeit wird erst bei der Übertragung kontrolliert. Web-App, Worker und getrenntes Browserabbild benötigen nach Freigabe gemeinsam den neuen Stand. Noch nicht veröffentlicht.

## 2026-10-27 - Juna - Chatstatus erhalten und Headeranzeigen persönlich einstellen

**Auftrag:** Nach Nutzerkorrektur bleibt die Status-/Synchronisationsanzeige im Chat unabhängig von der optionalen Aktionsübersicht sichtbar. Das appweite Icon neben der Glocke wird mit der persönlichen Einstellung aktiviert; beim Aufklappen erscheinen ausschließlich gerade laufende Aktionen. Die Einstellungsseite erhält einen ausdrücklichen Speichern-Button.

**Ursache und Umsetzung:** Die bisherige Darstellungsbedingung blendete den Chatstatus bei aktivierter Übersicht aus. Diese Kopplung und die dauerhafte dritte Spalte entfallen. Ein eigener lesender Headerzustand sammelt laufende Vorgänge aller Vinted-Konten im aktuellen Workspace; wartende, unklare und abgeschlossene Vorgänge werden dort nicht als laufend gezeigt. Desktop verwendet ein kompaktes aufklappbares Panel, Mobil eine Ansicht von unten. Ohne laufenden Vorgang bleibt das aktivierte Icon mit einem Leerzustand verfügbar. Chatbelege und deren autoritative Wiederherstellung bleiben unabhängig davon. Die Checkbox wird zunächst als Formularentwurf bearbeitet und erst mit „Änderungen speichern“ über den bestehenden persönlichen Speicherweg übernommen. Nutzerwechsel verwerfen fremde Entwürfe und Antworten.

**Workspace-Auswahl:** Die persönliche App-Einstellung „Workspace-Auswahl im Header anzeigen“ ist standardmäßig an und blendet auf Wunsch ausschließlich die Auswahl aus; der aktive Workspace bleibt erhalten. Beide Anzeigeoptionen verwenden den gemeinsamen persönlichen Speicherweg mit getrennten Metadatenfeldern. Geänderte Teilfelder werden serialisiert gespeichert, unberührte Felder können aus verspäteten Antworten nachziehen. Ein im Review entdeckter Fehler beim Wiederholen nach Speicherfehlern wurde zuerst reproduziert und korrigiert: Auch beim Retry werden ausschließlich bearbeitete Felder gesendet. Drei zusätzliche Browserfälle prüfen explizites Speichern, Fehlerwiederholung, Neuladen, Wiederanzeigen und unveränderte Aktionsoption bei 1440/390/320 Pixeln.

**Prüfung:** Drei zunächst fehlgeschlagene Chatregressionen nach Korrektur erfolgreich. 161 betroffene Angular- und 43 Modell-/Headerprüfungen, 73 Auswahl-/Shared-UI-Prüfungen sowie 48 betroffene Browserfälle bestanden. Browser mit 1920/1280/390/320 Pixeln, Hell/Dunkel, Touch, AXE, Fokus/Escape, Größenwechsel, tatsächlichem Speichern/Deaktivieren, Neuladen, Leerzustand und Abruffehlern. Die Bildkontrolle fand zusätzlich eine Überlagerung des mobilen Panels durch die untere Navigation; mit einer tatsächlichen Treffertest-Regression reproduziert und durch den nur während des mobilen Panels angehobenen Header-Stackingkontext korrigiert. Die gesamte neue Browsermatrix danach erneut erfolgreich. Unabhängiger Review einschließlich dieser Korrektur ohne offene Befunde. Typprüfung, Formatierung, gezieltes Lint und Produktionsbau erfolgreich; bekannte Bundle-/Compilerhinweise bleiben bestehen.

**Prüfumfang und Stand:** Lokale Prüfung der unmittelbar betroffenen Header-, Nachrichten-, Angebots-, Workspace- und Einstellungsbausteine einschließlich ihrer bestehenden Browserfälle. Die tatsächliche CI-Auswahl bleibt wegen der globalen Headerabhängigkeit umfassend, einschließlich Produktions-PWA; ein neuer vollständiger CI-/Linux-Nachweis steht im PR aus. Keine neue Backend-/Schemaänderung. Korrektur und Workspace-Erweiterung auf eigenem Zweig `juna/action-overview-header`, noch nicht veröffentlicht. Der Nutzer hat PR und Merge nach erfolgreichen Pflichtprüfungen ausdrücklich freigegeben.

## 2026-10-27 - Juna - Optionale Aktionsübersicht im Chat umsetzen

**Auftrag:** Das freigegebene kompakte Mockup als optionale Aktionsübersicht mit rechter Desktopspalte, Tabletpanel und mobiler Ansicht von unten umsetzen.

**Problem:** Nachrichtenaufträge waren nur pro Gespräch lesbar; der Verhandlungsverlauf lieferte lediglich die neuesten 50 Ereignisse ohne Chatzuordnung. Angebotsbelege gingen beim Seitenneustart im Frontend verloren. Nach der zunächst dokumentierten Backend-Übergabe hat der Nutzer die nötige Backend-Erweiterung ausdrücklich freigegeben.

**Umsetzung:** Eine autorisierte, tatsächlich lesende Abfrage vereint reale Angebots-, Nachrichten- und Kontoabgleichsaufträge: alle wartenden, laufenden und unklaren Aktionen sowie die zehn neuesten abgeschlossenen Vorgänge. Stabile Kennungen und Angebots-/Nachrichtenzuordnung stellen manuelle Belege nach Neuladen wieder her. Die kompakte Übersicht steht ab 1280 Pixel verfügbarer Inhaltsbreite rechts; sonst öffnet ein beschrifteter Button auf Tablets einen seitlichen Dialog und auf Smartphones eine Ansicht von unten. Unter Einstellungen > App wird die persönliche, geräteübergreifend gespeicherte Ansicht aktiviert; standardmäßig ist sie aus. Der Schalter steuert ausschließlich die Darstellung. „Annahme beauftragt“ bleibt im Chat, der Zusatz „siehe Aktionen rechts“ entfällt. Abruffehler werden getrennt vom unveränderten Auftragsstatus gezeigt; eine globale Ausführungsreihenfolge wird nicht erfunden.

**Reviewkorrekturen:** Die neue SQL-Abfrage verwendet eine gleichwertige nicht sperrende Nutzerprüfung und besteht echte Read-only-Transaktionen. Das Speichern der persönlichen Einstellung bindet HTTP-Anfragen an die erfasste Nutzerkennung und Sitzung, ohne verspätete Antworten in den Auth-Zustand zu übernehmen. Automatische Angebotsaufträge bleiben manuell übernehmbar. Neue Angebotsaktionen warten auf den ersten erfolgreichen Statusabruf; unbekannte oder noch nicht wiederhergestellte Aufträge werden nicht erneut angelegt. Alle konkreten Reviewbefunde sind mit Regressionen korrigiert.

**Prüfung:** 259 SQL-Zusicherungen einschließlich generierter Migration und Replay, 114 gezielte Modell-/Angularprüfungen, 64 Auswahl-/Registrierungs-/Shared-UI-Tests und 52 Browserfälle bestanden. Desktop, Tablet, 390/320 Pixel, Hell/Dunkel, Touch, AXE, Fokus/Escape/Rückfokus, Breitenwechsel, persönliche Aktivierung mit Neuladen sowie Abruf-/Speicherfehler geprüft. Formatierung, gezieltes Lint, Anwendungs-/Test-Typprüfung, Shared-UI-Audit und Produktionsbau erfolgreich; der Bau meldet eine Budgetwarnung bei 963,36 kB gegenüber 900 kB Warnschwelle und vorhandene Compiler-/CommonJS-Hinweise. Browser gegen ruhenden Entwicklungsbau wie die bestehenden CI-Fälle; ein anfänglicher Produktionsvorschau-Lauf kollidierte mit deren bewusst blockierten Service Workern und wurde nicht als Produktfehler behoben. Keine native Safari-/iPad- oder Linux-Browserabnahme behauptet. Die vollständige CI-Auswahl bleibt im PR erforderlich.

**Integration:** Nutzer hat Branch-Push, PR und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausdrücklich freigegeben. Der Zweig `juna/message-action-queue` basiert weiterhin direkt auf aktuellem `origin/master`; lokale Prüfungen gelten unverändert für den Produktcode. Arbeitsplan und Fortsetzung im [Arbeitsplan](superpowers/plans/2026-10-27-message-action-queue.md). Die konkrete Ursache der ursprünglich gemeldeten produktiven Angebotsaktion ist durch diese Featurearbeit nicht nachgewiesen. Flipbase fehlt weiterhin im verbundenen Lissie-Projektverzeichnis; dort kein Projektbericht möglich.

**CI-Testvorbereitung:** Der umfassende Angular-Lauf in PR 484 fand im bestehenden Vinted-Arbeitsflächentest eine noch nicht registrierte HTML-Ressource der neuen Aktionskomponente. Den Fehler lokal nachgestellt und ausschließlich die Testregistrierung sowie die zugehörigen API-/Darstellungs-Fixtures ergänzt. Danach alle 50 bestehenden Arbeitsflächenfälle lokal erfolgreich; Formatierung und gezieltes Lint bestanden. Keine Änderung am Produktverhalten oder Abschwächung einer Prüfung.

**PWA-Nachprüfung:** Der erste CI-Lauf blieb im zweiten Android-PWA-Tab unerwartet auf dem Dashboard statt im Einkaufsformular. Der vollständige unveränderte betroffene Test besteht unter Linux mit Node 22.23.3, gesperrtem Playwright 1.62.1/Chromium 1234, zwei CPUs und vier GiB sowie echten getrennten Produktionsbauten. Auch die gezielte Navigation besteht unter Windows und Linux. Keine belegte Ursache für die einmalige Weiterleitung und deshalb keine künstliche Produkt- oder Testkorrektur; erneuter vollständiger CI-Nachweis auf dem ohnehin korrigierten Angular-Teststand erforderlich.

## 2026-10-27 - Juna - Vinted-Profil vollständig bearbeiten

**Auftrag:** Das Profil nach dem abgestimmten Mockup modernisieren und nach ausdrücklicher Nutzerfreigabe auch die Backend-Anbindung um zusätzliche bearbeitbare Felder erweitern.

**Umsetzung:** Gemeinsamer Dialog für Beschreibung, Profilbild, Vinted-Stadtauswahl, Stadtsichtbarkeit und Sprache. Neue kontogebundene Worker-Routen und isolierter Browsertransport mit strenger Feldvalidierung, begrenztem JPEG-Upload, Ausgangsvergleich und Bestätigung durch erneutes Lesen. Bestehende Profiltext-Routen bleiben kompatibel. Bestätigte Beschreibung, sichtbarer Standort und Bild werden im bestehenden JSON-Profilcache unter Erhalt anderer Felder und mit Compare-and-swap gesichert; keine Schemaänderung. Fehlerhafte oder unvollständige Speicherantworten erzwingen Neuladen. Benutzername bleibt ein separater Vinted-Vorgang; dort bestehen beim geprüften Konto eine laufende Bestellung und eine Wartefrist. Kein separates Anzeigenamenfeld im geprüften Formular. Die doppelte obere Bewertung entfällt; drei Bewertungskacheln verwenden den Dashboard-Baustein, „Über dieses Konto“ bleibt erhalten.

**Prüfung:** 82 betroffene Worker-/Browser-/Transport-/Cachetests, 199 betroffene Angular-Tests und 50 Tests für Auswahl/Registrierung bestanden. Sechs Browserfälle bei 1440/390/320 Pixeln, jeweils hell/dunkel und mobil mit Touch-Bedienung, einschließlich AXE, Überlaufprüfung, Speichern sowie Bildauswahl und Sprachwechsel im Desktopfall bestanden. Angular-Bau, Anwendungs-/Worker-Typprüfung und gezieltes Lint bestanden; der Bau meldet unter anderem eine Budgetwarnung. Der System-Node ist für Angular zu alt; Prüfungen mit dem bereits vorhandenen gebündelten Node 24.19.0 ausgeführt, keine Abhängigkeit aktualisiert. Unabhängiger Review beanstandete die Behandlung beschädigter Speicherantworten; Korrektur und Regressionen ergänzt. Unabhängiger Abschlussreview ohne offene Befunde; nach der Korrektur 52 gezielte API-/Editortests erneut bestanden.

**CI-Korrektur:** Der erste Imagebau in PR 483 fand die neue Profil-Typdatei nicht, weil sie in der Docker-Kopierliste und der Kontextfreigabe fehlte. Beide Listen ergänzt; der tatsächliche Linux-Bau der Worker-Buildstufe mit Node 22.23.2 sowie sechs Tests der Image-Berechtigungen bestanden. Keine Laufzeit- oder Anbieterlogik geändert.

**Barrierefreiheit:** Die bestehende Browsermatrix erkannte einen Sprung von der Seitenüberschrift direkt zu „Über dieses Konto“ als Ebene 3. Auf Ebene 2 korrigiert. Die neue Profilmatrix prüft jetzt zusätzlich die ganze Profilansicht vor dem Öffnen des Editors, damit dieser Fehler auch im gezielten Lauf auffällt. Danach alle sechs Profilfälle, sechs bestehende Arbeitsflächenfälle und der bestehende Bewertungs-/Teilfehlertest erfolgreich; letzterer gegen dieselbe Entwicklungsvorschau wie in CI, weil sein AXE-Ladeskript unter der Produktions-CSP blockiert wird. Sieben Profil-Komponententests, Produktionsbau mit Testumgebung, Formatierung und gezieltes Lint bestanden.

**Live-Nachweis und Grenzen:** Vinted-Formular lesend geprüft. Ausschließlich das bestehende öffentliche Profilbild mit ausdrücklicher Nutzerfreigabe unverändert erneut hochgeladen und gespeichert; neuer Bildstand nach erneutem Öffnen bestätigt. Beschreibung, Standort, Sichtbarkeit und Sprache produktiv nicht verändert. Lokaler Zweig `juna/vinted-profile-editor` basiert auf aktuellem `origin/master`; Anwendung und Worker noch nicht veröffentlicht. Flipbase fehlt weiterhin im verbundenen Lissie-Projektverzeichnis, daher dort kein Änderungsbericht möglich.

## 2026-10-26 - Juna - Beiges Burberry-Inserat nach Worker-Korrektur live bestätigen

**Ergebnis:** PR 481 nach erfolgreichen Pflichtprüfungen mit Merge-Commit integriert. Worker, Broker und Browserabbild aus genau diesem Stand veröffentlicht und anhand fester Digests sowie der Importmodul-Prüfsummen kontrolliert. Private Konfiguration gesichert; ausschließlich vier Imagezuordnungen geändert. Kontofreigaben, Zeitpläne und bestehende Pausen unverändert. Dienste gesund beziehungsweise laufend, ohne Neustart; öffentlicher Healthcheck erfolgreich und anonymer Abrufstart weiterhin HTTP 401.

**Tatsächlicher Nachweis:** Erster regulärer Wiehen-Store-Abruf mit neuem Worker von 23:24:40 bis 23:24:54 Uhr Europe/Berlin erfolgreich. Beim beigen Burberry-Schal steht nun der belegte Anbieterwert `16 hour`, beobachtet um `2026-10-26T22:24:45.484Z`. Kein Veröffentlichungs-/Erstellungszeitpunkt erfunden oder manuell in der Datenbank geändert. Der bestehende angemeldete Kleiderschrank zeigt anschließend **Neu** in Grün; sichtbaren Text, berechnete Textfarbe und Screenshot geprüft. Nach Abschluss keine offene Sitzung, kein offener Abruf und kein Browsercontainer. Betriebsnachweis und Rückweg im [Rolloutbericht](audit/2026-10-26-vinted-scarf-age-rollout.md). Produktzweig lokal und remote entfernt, fremde Arbeitskopie erhalten. Für diesen Nachweis ausschließlich Dokumentationsauswahl und Formatierung prüfen.

## 2026-10-26 - Juna - Fehlendes Vinted-Alter noch am selben Tag erneut lesen

**Auftrag und Befund:** Fehlende Altersangabe des beigen Burberry-Schals im Wiehen Store untersuchen und das korrekte Neu-Badge ermöglichen. Der gespeicherte Artikel ist aktiv, hat aber keinen Alterswert; `publicationAgeCheckedAt` steht auf `2026-10-26T06:03:25.411Z`. Die echte Vinted-Artikelseite zeigt inzwischen „Hochgeladen: 16 h“. Die vorhandene 24-Stunden-Wartezeit nach einem erfolglosen Versuch verhindert bis zum nächsten Morgen jede erneute Auslesung. Damit ist das Fortbestehen der Lücke belegt; weshalb der erste Versuch leer blieb, ist rückwirkend nicht nachgewiesen. Weitergehende DOM-Diagnose der Vinted-Seite wurde durch eine offene Erweiterungsoberfläche in Chrome blockiert; diese Sperre nicht umgangen.

**Korrektur:** Nur fehlende Altersangaben dürfen nach einer Stunde erneut gelesen werden. Bekannte Werte bleiben im Cache; keine Wiederholung bei jedem Kontosync. Entwürfe, versteckte/beendete Artikel, Kontofreigaben und Sperr-/Rate-Limit-Verhalten unverändert. Kein künstliches Veröffentlichungsdatum und keine manuelle Änderung des gespeicherten Artikelalters.

**Prüfung:** Zwei Regressionen reproduzierten zunächst die ausbleibende Auslesung. Danach alle 76 Importfälle und 230 betroffene Workerfälle erfolgreich; zehn bestehende Worker-Browserfälle unter Windows und Linux erfolgreich. Linux mit Node 22.23.3, Playwright 1.63.0, identischen Sperrdateien, vollständiger Quellkopie einschließlich versteckter Konfigurationen und zwei CPUs/vier GiB. 49 Auswahl-/Registrierungsprüfungen, Suite-Audit, gezieltes Lint, Formatierung, Worker-Typprüfung und Worker-Bau bestanden. Unabhängiger Review ohne Finding, Importdatei zusätzlich eigenständig erfolgreich geprüft. Tatsächliche CI-Auswahl ausschließlich Marketplace-Prüfungen, keine Frontend-, PWA- oder Datenbankänderung. Nachweise unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-scarf-age-*`.

## 2026-10-26 - Juna - Badge des heute eingestellten Schals kontrollieren

**Auftrag und Ergebnis:** Auf Nachfrage die tatsächliche Anzeige des beigen Burberry-Schals im Wiehen Store geprüft. Der bestehende angemeldete Chrome-Tab zeigt beim Artikel „Burberry Schal in Beige Lammwolle Vintage“ weiterhin „Alter unbekannt“, kein „Neu“. Die gezielte lesende Datenbankkontrolle bestätigt `publicationState=active`, aber weder `occurredAt` noch `createdAt` oder `publicationAge`. Damit fehlt der bestehenden Anzeige die Altersgrundlage. Der erfolgreiche Worker-Rollout und der frühere allgemeine Live-Abruf belegen keine erfolgreiche Altersübernahme dieses einzelnen Artikels. Keine Aussage über die Ursache des fehlenden Anbieterwerts getroffen.

**Grenzen:** Ausschließlich geprüft und protokolliert. Kein Anbieterabruf, keine produktive Datenänderung, keine Konto-/Zeitplanänderung und kein Produktcode verändert. Im Browser nur den bereits geöffneten Kleiderschrank gelesen; weder neu geladen noch ein Formular geöffnet. Formatierung und Dokumentationsauswahl geprüft.

## 2026-10-26 - Juna - Vinted-Alterskorrektur im Worker veröffentlichen

**Auftrag:** Nach Merge von PR 478 auch den Worker aktualisieren und den Erfolg der App-Veröffentlichung prüfen.

**Ergebnis:** App v0.378.0 öffentlich auf Commit `61aa3b725f72bf5e977afde2bf05982584648a91` bestätigt. Worker, Broker und Browserabbild aus demselben geprüften Commit manuell gebaut, vollständig geprüft und anhand fester Digests umgestellt. Vorher-/Nachhervergleich ausschließlich vier Imagezuordnungen; private Konfiguration gesichert. Kontofreigaben, Zeitpläne, Profile und bestehende Pausen erhalten. Neuer Worker gesund, öffentlicher Healthcheck HTTP 200, anonymer Abrufstart weiterhin HTTP 401. Keine produktive Schreibaktion oder zusätzliche Datenbankänderung. Betriebs- und Rückwegnachweis im [Rolloutbericht](audit/2026-10-26-vinted-publication-age-rollout.md).

**Liveprüfung:** Erster regulärer Flipbase-Abruf nach dem Wechsel um 21:35 Uhr Europe/Berlin erfolgreich, ohne Fehlercode: Profil, 15 Inserate, 84 Gespräche und Bewertungen vollständig, Nachrichten/Verkäufe weiterhin Teilstände. Anschließend keine offene Sitzung, kein wartender/laufender Abruf und kein verbliebener Browsercontainer; Worker und Broker ohne Neustart. Alle drei Veröffentlichungsworkflows erfolgreich. Bericht formatiert, Unterschiede kontrolliert und ausschließlich Dokumentation als Prüfumfang bestätigt. Keine Zugangsdaten oder privaten Konfigurationsinhalte im Repository.

## 2026-10-26 - Juna - Mobile Listenhöhe nach Linux-CI korrigieren

**Befund:** In [PR 478](https://github.com/GrischaTDev/flipbase/pull/478) bestand der erste große Browserlauf, aber der Lauf der geänderten Datei scheiterte bei 320 Pixel/Hell: Listenlink 144 statt weniger als 130 Pixel hoch. Unter Linux erbt die Statusgruppe 16px/24px, wodurch die umgebrochenen Badges und Kennzahlen zusammen 52 Pixel benötigen. Mit Node 22.23.3, Playwright 1.62.1 und identischer Sperrdatei in einem isolierten Linux-Container bei zwei CPUs/vier GiB exakt nachgestellt. Die vollständige Quellkopie enthält auch versteckte Konfigurationen; die Windows-Vorschau wurde ausschließlich über einen lokalen Container-Portweiterleiter gelesen.

**Korrektur:** Statusgruppe ausdrücklich auf die vorhandene kleine Textrolle gesetzt; vertikale mobile Innenabstände und Zeilenabstand verkleinert. Gleicher Linux-Fall misst jetzt 123 Pixel. Desktop-Abstände, Inhalte, Aktionsflächen, Fokus und die unveränderte 130-Pixel-Prüfung bleiben erhalten. Unabhängiger Nachreview ohne Befund.

**Prüfung:** Alle 23 Fälle der betroffenen Inseratdatei unter Linux erfolgreich, einschließlich 320/390/834/1440 Pixel, Hell/Dunkel, Preisdialog, Fokus und AXE. Unter Windows beide direkt betroffenen Browserdateien mit 29 erfolgreichen Fällen; 59 bestehende Angularfälle erfolgreich. Gezieltes HTML-Lint und Formatierung bestanden; Produktionsbau vor dem Korrekturpush erneut geprüft. Keine zusätzliche Testdefinition, kein abgeschwächter Grenzwert und kein unveränderter CI-Wiederholungsversuch. Temporäre Nachweise unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-pr478-*`. Für den geänderten Aufgabenstand die ausgewählten CI-Prüfungen erneut abwarten.

## 2026-10-26 - Juna - Kleiderschrankänderungen für PR und Merge freigeben

**Freigabe:** Nutzer hat nach Ansicht der Rastervorschau ausdrücklich PR-Erstellung und Merge nach erfolgreichen Tests beauftragt. Eigenen sauberen Zweig nach erneutem GitHub-Abgleich zur Veröffentlichung vorbereitet. Der zuvor dokumentierte lokale Prüfumfang bleibt gültig; seitdem ausschließlich das geprüfte Preis-Icon und die Vorschau-Dokumentation ergänzt. PR gegen `master`, vollständige ausgewählte Pflichtprüfungen abwarten, nur bei Erfolg mit Merge-Commit integrieren und anschließend ausschließlich den eigenen Aufgabenbranch lokal und remote entfernen. Kein zusätzliches Worktree für diese Aufgabe erstellt; fremde Arbeitskopien bleiben erhalten.

## 2026-10-26 - Juna - Rasteransicht mit Preis-Icon zeigen

**Auftrag und Nachweis:** Auf Nachfrage die aktuelle Rasteransicht mit vier ausdrücklich künstlichen Artikeln und den vorhandenen Bildplatzhaltern gerendert. Ausschnitt unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-grid-preview/grid-cards-dark.png`, vollständige Ansicht im selben Ordner. Dunkles Farbschema, vier Karten, Preisaktion ohne sichtbaren Text mit genau einem Euro-Icon und Tooltip „Preis ändern“ geprüft. Keine Produktänderung; keine echten Kontodaten oder Vinted-Schreibzugriffe. Vorschau und Hilfsskript außerhalb des Repositories.

## 2026-10-26 - Juna - Preisaktion im Kleiderschrank als Icon anzeigen

**Auftrag und Änderung:** Auf Nutzerwunsch den sichtbaren Text „Preis ändern“ in Raster und Liste durch ein einzelnes Euro-Icon ersetzt. Gemeinsame Tabellenaktionsvariante verwendet; Tooltip „Preis ändern“, artikelbezogener Screenreadername und Touch-Trefferfläche erhalten. Preisdialog und Speicherung unverändert.

**Prüfung:** Alle vier bestehenden Preisdialogfälle in Hell/Dunkel bei 390 Pixel/Touch und 1440 Pixel/Maus einschließlich Fokus und AXE erfolgreich; Angular-Produktionsbau, Formatierung und gezieltes Lint bestanden. Fortsetzung des eigenen, noch nicht veröffentlichten Zweigs `juna/vinted-listing-actions` nach frischem GitHub-Abgleich.

## 2026-10-26 - Juna - Kleiderschrankliste und direkte Preisaktion ergänzen

**Auftrag:** Kleiderschrank anhand der gezeigten Referenz übersichtlicher darstellen, Preise direkt aus Liste und Raster ändern und die Herkunft der Altersangaben prüfen. Kein Drawer. Nach ausdrücklicher Rückmeldung „Neu“ für belegte Veröffentlichungen unter 24 Stunden.

**Änderung:** Zusammenhängende Desktopliste mit Artikel, Status/Aktivität, Preis und Aktionen; schmale Ansichten bleiben ohne horizontales Scrollen bedienbar. Preisbutton außerhalb des Artikellinks in beiden Ansichten. Bestehenden Preisdialog und Preisablauf aus der Detailansicht gemeinsam verwendet: kein vorheriger Formularabruf, keine automatische Wiederholung, Preis erst nach Anbieterbestätigung übernehmen, Eingabe bei Fehler und Konflikt erhalten, Doppelspeichern sperren. Konto-/Rechtewechsel und Zerstörung verwerfen verspätete Antworten. Unveränderte Konto-Hintergrundprüfungen erhalten Dialog und laufende Speicherung; unabhängigen Reviewbefund mit Regression behoben.

**Zeitangaben:** Der Feed zeigt `first_seen_at` („Entdeckt“), keinen belegten Veröffentlichungszeitpunkt. Gerundete Minuten-/Stundenangaben stammen dagegen aus Vinteds Artikelseite. Im Cloudimport verhinderte ein vorhandenes Erstellungsdatum bisher deren Nachladen; diese Lücke korrigiert. Erstellung, Veröffentlichung und Import bleiben getrennt. „Neu“ nur bei bestätigtem Onlinestatus und unter 24 Stunden; bei gerundeter Angabe muss auch deren obere Altersgrenze passen. Taggenaue, unbekannte oder lediglich erstellte Artikel erhalten kein „Neu“. Vorhandene Tagesstufen bleiben bestehen.

**Prüfung:** Altersgrenze und Importregression zuerst mit dem bisherigen Verhalten fehlgeschlagen. 228 betroffene Workerfälle einschließlich aller 74 Importfälle, 975 Angularfälle in 75 Dateien, 220 Modellfälle in 24 Dateien sowie 49 Auswahl-/Registrierungsprüfungen erfolgreich. Worker-Typprüfung/-Bau, Anwendungstypprüfung, gezieltes Lint, Formatierung, Suite-Audit und Shared-UI-Prüfung bestanden. 29 unterschiedliche bestehende Browserfälle der direkt betroffenen Kleiderschrank-/Arbeitsflächendateien erfolgreich; nach den letzten Anpassungen die zwölf Preis-/Darstellungsvarianten erneut erfolgreich. Preisdialog in Detail, Raster und Liste mit Fehler, erneutem Speichern, Enter, Fokusfalle, Rückfokus und AXE geprüft; Listenmatrix 320/390/834/1440 Pixel in Hell/Dunkel. Beim Ansichtswechsel wartet die unverändert strenge Breitenprüfung jetzt auf die fertige Darstellung. Keine Prüflimits gelockert. Neuer Badge-Browsernachweis anfangs mit dem falschen Testdatenfeld versehen; an die bestehende Snapshot-Schnittstelle (`occurredAt`) angepasst, keine Produktlogik dafür geändert. Produktionsbau einschließlich Angular-Vorlagen vor Übergabe erneut geprüft.

**Grenzen:** Keine echte Vinted-Speicherung ausgeführt, kein Preis im produktiven Konto geändert. Fehlende Anbieterangaben werden nicht erfunden; ergänzte Altersangaben erscheinen nach dem nächsten erfolgreichen Kontoabruf mit dem aktualisierten Worker. Keine Schemaänderung und keine neue Abhängigkeit. Browser-Plugin nicht verfügbar; vorhandene Playwright-Vorschau unter Windows/Chromium genutzt, keine native Safari-/Geräteprüfung oder Linux-Wiederholung. Die echte CI-Auswahl umfasst durch das geteilte Altersmodell zusätzlich weitere Marktplatz-Browserbereiche; diese vollständige Matrix sowie die Linux-Ausführung bleiben der CI vorbehalten. Kein PWA-Lauf ausgewählt. Web-App und separaten Marketplace-Worker nach Freigabe gemeinsam veröffentlichen. Nachweise außerhalb des Repositories unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-listing-*`.

## 2026-10-25 - Juna - Vinted-Preis beim Fokussieren erhalten und Speicherung korrekt bestätigen

**Auftrag:** Weiterhin fehlschlagende Speicherung im vollständigen Bearbeitungsformular und im neuen Preisdialog untersuchen und korrigieren. Betroffen laut Nutzer: Konto Flipbase, „Burberry Schal in Rot Lammwolle Vintage“.

**Ursache und Nachweis:** Nach frischem GitHub-Abgleich auf eigenem Zweig fortgesetzt. Produktives Protokoll vom 25.10.2026 um 19:46:22 UTC bestätigt `price/save`, verdeckt aber den ursprünglichen Fehler durch `MarketplaceBrowserSessionEndedError`. Früherer Vollformularabbruch: `gegenlesen inhalt`. An einer echten bestehenden Vinted-Bearbeitungsmaske ohne Speicherklick nachvollzogen: Direktes Befüllen des unfokussierten Preisfelds wird durch die nachfolgende Darstellung des bisherigen Preises beim Fokuswechsel ersetzt. Im fokussierten Feld bleibt dieselbe Eingabe erhalten. Komma, geschütztes Leerzeichen und Eurozeichen unterstützt der vorhandene Centparser bereits. Im älteren einfachen Bearbeitungsweg dagegen ergibt dessen bisheriger direkter Zahlenvergleich mit Eurozeichen stets einen ungültigen Zahlenwert; zusätzlich konnte sofortiges Neuladen die laufende Speicherung unterbrechen. Nach der zwischenzeitlichen Sicherheitsunterbrechung die Browserprüfung auf ausdrücklichen Nutzerauftrag fortgesetzt. Beim konkret genannten Schal das vollständige Formular über dessen eigenes Cloudkonto erfolgreich geladen und ohne Änderung abgebrochen: Preis weiterhin 29,90 Euro.

**Änderung:** Gemeinsame Preiseingabe für Preisdialog, Vollformular und einfachen Fallback: fokussieren, die Darstellung über zwei Browserframes abschließen lassen, Preis eintragen und Feld verlassen. Bestehendes Gegenlesen von Preis, Begleitfeldern, Fotos, Konto und Rechten bleibt erhalten. Älterer Fallback nutzt den vorhandenen Centparser und wartet vor dem erneuten Lesen auf Vinteds Seitenwechsel. Kein automatisches Wiederholen des Speicherklicks. Preisaktion bewahrt jetzt feste Abbruchschritte vor der Ersetzung durch den Sitzungsbroker; nur belegte Abbrüche vor dem Speichern erhalten die Einordnung „nicht gespeichert“. Nach einem möglichen Speicherklick bleibt ein unbekanntes Ergebnis unbestätigt. Keine Artikelinhalte in neuen Protokollen.

**Prüfung:** Neue Fokusregressionen für Preisdialog und beide Vollformularwege scheiterten zunächst mit den bisherigen Abbruchmeldungen; danach erfolgreich. Fallbacktest deckt Euroformat und verzögerte Speicherantwort ohne vorzeitige Bearbeitungsnavigation ab. Echter isolierter Aktionstransport prüft beide Speicherwege mit erhaltenen Titeln/Beschreibungen und Benutzerseiten. 27 betroffene Worker-Browserfälle unter Windows erfolgreich; 717 erfolgreiche Workerfälle bei acht vorhandenen optionalen Auslassungen. 49 Auswahl-/Registrierungsprüfungen, Suite-Audit, gezieltes Lint, Worker-Typprüfung und Worker-Bau erfolgreich. Unabhängige Codeprüfung ohne handlungsbedürftige Findings und mit 37 zusätzlich erfolgreich ausgeführten Fällen. Zusätzlich dieselben 27 Browserfälle unter Linux mit Node 22.23.3 und der unveränderten Worker-Sperrdatei (Playwright 1.63.0) bei zwei CPUs und zwei Gigabyte Speicher erfolgreich. Die tatsächliche CI-Auswahl betrifft ausschließlich den Marketplace-Worker, keine Anwendungs-, PWA- oder Oberflächenmatrix. Kein Angular-Template verändert. Nachweise unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-save-*`.

**Grenzen und Veröffentlichung:** Keine produktive Speicherung oder Veröffentlichung ausgelöst und keinen Artikelpreis geändert. Die synthetische Frame-Darstellung bildet das beobachtete Verhalten nach; deren Zeitpunkt ist keine Zusage für zukünftige Anbieteränderungen. Der genaue verdeckte Fehler des damaligen Cloud-Preisversuchs lässt sich rückwirkend nicht aus dem alten Protokoll auslesen. Erst nach Freigabe über PR und erfolgreiche Pflichtprüfungen Worker und Browserabbild gemeinsam veröffentlichen. Keine neue Datenbankmigration, keine Abhängigkeit im Projekt geändert.

## 2026-10-25 - Juna - Vinted-Preis direkt ändern und Bearbeitung ohne Eingabewartezeit öffnen

**Auftrag:** Wartezeiten und fehlgeschlagene Preisänderungen im Kleiderschrank untersuchen; beim Artikel einen kleinen Preisdialog ergänzen und den häufigen Ablauf vereinfachen.

**Befund:** Produktive Protokolle bestätigen zwei Abbrüche vor dem Speicherklick bei `gegenlesen inhalt` sowie einen belegten Lesezugriff. Worker und eingestelltes Browserabbild enthalten bereits die bisherige Preisformat-Korrektur. Welches Feld beim alten Vollformular abwich, ist mit den vorhandenen Protokollen nicht belegbar. Vintz-Preisdialog in der öffentlichen Demo nur angesehen.

**Änderung:** Rechts beim Artikel „Preis ändern“ mit gemeinsamem kleinem Dialog und Zahlenfeld ergänzt. Eingabe sofort möglich; eine eigene serverseitige Aktion prüft Konto und bisherigen Preis, ändert ausschließlich das Preisfeld und bestätigt den gespeicherten Anbieterstand. Titel, Beschreibung, Merkmale und Fotos werden nicht mit alten Listenwerten überschrieben; keine Auswahllisten oder Fotoraster für die Preisaktion. Neuer Preis erst nach Bestätigung in Detail und Kleiderschrank. Unbestätigter Klick bleibt sichtbar, Eingabe erhalten, kein automatisches Wiederholen. Zwischenzeitlich geänderter Preis wird angezeigt und dient erst beim erneuten ausdrücklichen Speichern als neue Basis. Bereits gespeicherter Zielpreis wird ohne weiteren Speicherklick bestätigt. Allgemeine Bearbeitung öffnet auch während des Beschreibungsabrufs; gemeinsame Hintergrundabrufe kollidieren nicht mehr beim Wiederöffnen oder Abbrechen. Beschreibungsversion und verspäteten Fallback nach Abbruch abgesichert. Unabhängigen Review mit drei konkreten Randfällen vollständig umgesetzt und durch Regressionen geprüft.

**Prüfung:** 715 ausgewählte Angular-Fälle in 42 Dateien, 716 erfolgreiche Workerfälle bei acht vorhandenen optionalen Auslassungen, 23 gezielte Worker-Browserfälle, 66 bestehende und neue Vinted-UI-Browserfälle sowie 49 Auswahl-/Registrierungsprüfungen erfolgreich. Dialog bei 390 Pixel/Touch und 1440 Pixel/Maus jeweils Hell/Dunkel inklusive Enter, Fehlererhalt, Doppelklickschutz, AXE, Fokusfalle und Rückfokus geprüft. Shared-UI-Prüfung, Suite-Audit, gezieltes Lint, Typprüfung und Produktionsbau erfolgreich. Prüfprotokolle, neutrale Dialogansichten und Fehleransichten unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-price-*`.

**Grenzen:** Der zusätzliche breite Worker-Browserlauf hatte zwei alte Login-Testfehler, beide auch einzeln aus einem unveränderten HEAD-Archiv reproduziert. Keine zugehörige Produktions- oder Testlogik verändert. Lokal die drei unmittelbar berührten Vinted-UI-Dateien vollständig geprüft; die gemeinsame Store-Datei wählt in CI zusätzlich andere Marktplatzbereiche. Keine neue Datenbankmigration oder PWA-Änderung. Kein produktiver Preis geändert; keine echte Vinted-Speicherung bestätigt. Web-App, Worker und isoliertes Browserabbild müssen nach Freigabe zusammen veröffentlicht werden. Der genaue ursprüngliche Vollformularfehler bleibt bis zur gezielten Livekontrolle offen. Siehe [Plan und Prüfnachweise](superpowers/plans/2026-10-25-vinted-quick-price.md).

**Breiter Abschlusslauf:** Die aktualisierte Pflichtfall-Soll-Liste löst in der tatsächlichen CI-Auswahl für diesen PR einen Gesamtlauf aus. Deshalb zusätzlich alle 2.708 Node- und alle 2.854 Angular-Fälle erfolgreich geprüft. Im parallelen Sammellauf überschritt ein unveränderter Eigenbeleg-PDF-Test das bestehende Fünfsekundenlimit; anschließend die gesamte DOM-Suite allein mit unveränderten Limits erfolgreich: 354 Fälle. Damit alle 5.916 Anwendungsfälle über ihre Suiten bestanden, der erste parallele Sammelbefehl bleibt ausdrücklich fehlgeschlagen. Keine fachfremde Testlogik oder Zeitgrenze geändert. Die vollständige Datenbank-, PWA- und Browsermatrix bleibt der CI vorbehalten; lokal die unmittelbar betroffenen Oberflächen geprüft. Vier zusätzliche Node-Fälle aus der gezielten Auswahl ebenfalls erfolgreich.

## 2026-10-25 - Juna - Kleinanzeigen einfacher inserieren und ausgewählte Anzeigen neu einstellen

**Auftrag:** Ohne Kategorie ein vorbefülltes Kleinanzeigen-Formular öffnen, den vollständigen Kategoriebaum lokal anbieten, Verhandlungsbasis sowie Versand/Abholung vorbelegen und ausgewählte eigene Anzeigen über die Erweiterung neu einstellen.

**Änderung:** Alle 15 vorhandenen Kategoriegruppen mit 3087 Endkategorien freigegeben; die blockierende Liveprüfung und das Eigenschaften-Neuladen aus der Auswahl entfernt. Fehlende oder beim Anbieter unbekannte Kategorien führen nach Sicherung der aktuellen Fassung ins kontogebundene Formular. Aktuelle Eingaben und Bilder bleiben beim Wechsel zur nativen Kategorieauswahl erhalten. Bewusste gespeicherte Werte bleiben bestehen. „Nur Versand“ nicht ergänzt: Die offizielle Kleinanzeigen-Hilfe verlangt eine Abholmöglichkeit. Neuer Auswahlknopf für Kleinanzeigen mit gemeinsamer Bestätigung, vollständiger lokaler Sicherung einschließlich Originalbildbytes vor der Löschung, vorbereiteter Neufassung und bestätigter Neuanlage. Unklare Lösch- oder Veröffentlichungsergebnisse werden ausschließlich nachgelesen; offene Vorgänge können auch nach Neustart aus ihrer lokalen Sicherung fortgesetzt werden. Erweiterung auf 1.11.0 angehoben; drei konkrete Anbieter-Bildhosts ergänzt, keine neue allgemeine Berechtigung.

**Prüfung:** Vollständige Node-, Angular- und DOM-Läufe mit 2706, 2852 und 354 erfolgreichen Fällen; danach neun zusätzliche Modellfälle und betroffene 47 Angular-Fälle gezielt erfolgreich. Workflowprüfung mit 568 erfolgreichen Fällen und sechs bestehenden Auslassungen, 49 Auswahl-/Registrierungsprüfungen sowie Shared-UI mit 250 Dateien ohne Befund bestanden. Produktionsbau einschließlich Angular-Vorlagen, Typprüfung und Lint erfolgreich. 39 betroffene Oberflächenfälle sowie zwei zusätzliche Maus-/Tastaturfälle erfolgreich: 320 bis 1440 Pixel, Hell/Dunkel, Touch/Maus, Rückfokus und AXE. Echte MV3-Browserläufe prüfen unter Windows und Linux den Formularweg, Kategorie-Seitenwechsel, stabile Bildkennung bei erneuerten URL-Signaturen, vollständige Bildübernahme, verzögerte Löschbestätigung, genau einen Veröffentlichungsklick und Wiederaufnahme nach Worker-/Browserneustart. Linux mit Playwright 1.62.1, Chromium 151.0.7922.34 und CI-Hauptversion Node 22, begrenzt auf zwei CPUs und vier GiB. Nach unabhängigem Review zusätzlich Neuladen des Assistententabs abgesichert; gleicher Bildanzahl allein wird nicht vertraut, Bildpfade und Reihenfolge werden vor dem Löschen erneut geprüft.

**Grenzen:** Anbieteroberfläche im echten Konto ausschließlich gelesen. Sämtliche Lösch-/Veröffentlichungstests verwenden lokale Anbieter- und API-Antworten; keine produktive Anzeige gelöscht oder erstellt. Vollständige CI-Datenbank-, PWA- und fachfremde Browsermatrix lokal nicht wiederholt; die tatsächliche breite CI-Auswahl bleibt unverändert erforderlich. Der datenbankgestützte Inseratstudio-Browserfall bleibt mangels Testdatenbank auf `127.0.0.1:54351` offen. Keine Schemaänderung. Die primäre Arbeitskopie mit einer anderen laufenden Aufgabe bleibt unberührt. Abschließend auf aktuellen Hauptzweig `4a7c12d2` aufgesetzt; beide Sitzungseinträge erhalten, Typprüfung, Produktionsbau sowie 47 betroffene Angular-, 49 Auswahl- und alle 41 Oberflächenfälle erneut erfolgreich. Eigene Vorschau danach beendet. Umsetzung liegt im eigenen Arbeitszweig; Push, PR, Merge und gemeinsame Bereitstellung von App und Erweiterung stehen noch aus. Prüflogs liegen unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-ka-*`.

## 2026-10-25 - Juna - Flipbase-Entwürfe ohne zusätzlichen Kartenrahmen anzeigen

**Auftrag:** Die besprochene Entwurfsübersicht wie den Kleiderschrank darstellen. Vinted-Entwürfe bleiben direkt bearbeitbar; keine automatische Übertragung oder Löschung bei Vinted.

**Änderung:** Den zusätzlichen Tabellenrahmen samt 13 Pixel Einrückung um die Flipbase-Entwurfskarten entfernt. Raster und Liste stehen direkt auf der Seite; die gemeinsame Suchkomponente und der vorhandene Ansichtswechsel stehen im Abschnittskopf. Lade-, Fehler-, Leerzustand, Wiederholen, Nachladen, Bearbeiten und bestätigtes Löschen erhalten. Keine gemeinsame Komponente oder Speicher-/Veröffentlichungslogik geändert. Den bestehenden Browserfall um bündige Karten, volle Listenbreite sowie Suche, Laden, leere Treffer und Wiederholen nach Abruffehler ergänzt.

**Prüfung:** Abstandsprüfung auf unverändertem Ausgangsbau zunächst mit 13 statt höchstens einem Pixel gescheitert. Danach 44 ausgewählte Angular- und vier Node-Fälle sowie 49 Auswahl-/Registrierungsprüfungen erfolgreich. Produktionsbau einschließlich Vorlagen, Typprüfung, gezieltes Lint und Shared-UI-Prüfung erfolgreich. Alle 62 Fälle der drei ausgewählten Vinted-Browserdateien gegen ruhenden Produktionsbau bestanden; vier Übersichtsvarianten nach ergänzten Zustandsprüfungen gezielt erneut erfolgreich. 1440 Pixel/Maus und 390 Pixel/Touch jeweils Hell/Dunkel, Tastatur-/Rückfokus, AXE und Überlauf geprüft. Zusätzlich vier Übersichtsvarianten im Entwicklungsbau für vollständige Sichtnachweise erfolgreich; eigener Testharness nach Seitenneuladen um erneutes Laden von AXE korrigiert. Screenshots und Prüfprotokolle liegen außerhalb des Repositories unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-vinted-draft-layout-20261025/`.

**Grenzen:** Browser-Plugin mit zugehörigem `browser`-Skill nicht verfügbar; bestehende Playwright-Prüfungen unter Windows/Chromium verwendet. Die Produktionsvorschau mit absichtlich blockiertem Service Worker zeigt einen allgemeinen Updatehinweis; die zusätzlichen Sichtnachweise stammen deshalb aus dem Entwicklungsbau. Der ebenfalls automatisch ausgewählte alte Inseratstudio-Datenbankfall wurde lokal nicht ausgeführt: Der fest konfigurierte lokale Testanschluss `127.0.0.1:54351` ist nicht erreichbar. Andere laufende Datenbankprojekte unverändert erhalten. Keine native Safari-/Geräteprüfung und kein echter Vinted-Schreibzugriff; kein Datenbank- oder PWA-Umbau.

## 2026-10-25 - Juna - Aktuellen Arbeitsbeginn und vollständige Zweigbereinigung verbindlich machen

**Auftrag:** Jede neue Aufgabe auf einem neuen Zweig vom aktuellen Hauptzweig beginnen und nach erfolgreichem Abschluss ohne weitere Rückfrage sowohl lokal als auch auf GitHub aufräumen.

**Änderung:** Zentral in `AGENTS.md` den Abruf vor jeder neuen Aufgabe, die sichere Aktualisierung des lokalen `master` und einen eigenen `juna/`-Zweig von `origin/master` vorgeschrieben. Fortsetzungen derselben Aufgabe und parallele Arbeitskopien abgegrenzt. Nach bestätigtem Merge die dauerhaft autorisierte Löschung von Remotezweig, lokalem Aufgabenbranch und zusätzlichem Aufgaben-Worktree verpflichtend gemacht; anschließend aktuellen, sauberen Hauptzweig und entfernte Aufgabenreste prüfen. Ungesicherte Dateien, fremde Arbeiten und gemeinsam genutzte Verzeichnisziele bleiben geschützt. Rückfrage vor PR und Merge unverändert erhalten; keine zusätzliche Rückfrage zum anschließenden Aufräumen.

**Prüfung und Grenzen:** Ausschließlich Projektregeln und Sitzungseintrag geändert. Formatierung und Unterschiedskontrolle erfolgreich; tatsächliche Testauswahl bestätigt ausschließlich Dokumentation ohne Anwendungs-, Browser-, Dienst- oder PWA-Tests. Zentralen Verweis in `CLAUDE.md` geprüft, keine zweite Regelquelle angelegt. Kein Anwendungscode oder Produktionsstand geändert.

## 2026-10-25 - Juna - Alte Arbeitskopien und Zweige bereinigen

**Auftrag:** Alle noch vorhandenen lokalen Arbeitsstände prüfen und nicht mehr benötigte Reste entfernen.

**Ergebnis:** Elf zusätzliche Arbeitskopien, 22 lokale Altzweige und 20 alte GitHub-Zweige ohne offenen PR nach geprüfter Sicherung entfernt; vier alte Zwischenablagen archiviert und aktive Liste geleert. Lokalen Hauptzweig auf `ec024160` vorgezogen. Bisher nur lokale Recherche-/Rolloutberichte und einzelne Berichte aus alten Zweigen im Dokumentationszweig `juna/workspace-cleanup` erhalten. Lokale Sitzungseinträge in ein [Recherchearchiv](AI-CHANGELOG-research-archive-2026-10-25.md) überführt; neuere veröffentlichte Updateanalyse erhalten. Alten DPD-Tracking-Entwurf als tatsächlich unveröffentlichten Altentwurf ausdrücklich dokumentiert; keine alte Codeänderung integriert. Zwei offene Dependabot-PRs erhalten. Untersuchung und Wiederherstellungsanleitung im [Bereinigungsbericht](audit/2026-10-25-workspace-cleanup.md).

**Prüfung und Grenzen:** Alle Git-Stände einschließlich sämtlicher alter Zwischenablagen im verifizierten Bundle gesichert, lokale Dateikopien mit SHA-256 verglichen und ZIP-Archive vollständig geprüft. Vor Entfernung Pfadgrenzen, laufende Prozesse, eingebettete Projekte und Submodule abgeglichen; Windows-Dateipfadlänge bei der Bereinigung berücksichtigt. GitHub-Löschungen an die geprüften Commits gebunden. 43 Dokumentationsdateien erfolgreich formatiert, lokale Verweise geprüft und ausschließlich Dokumentation als betroffener Prüfumfang bestätigt. Lokale Hauptprojekt-Abhängigkeiten aus der unveränderten Sperrdatei wiederhergestellt. Nur Dokumentation verändert; kein neuer Produktcode, kein Deployment und keine Anwendungstests. Die Entwurfsdarstellung und DPD-Produktentscheidung bleiben offen. Der Nutzer hat den Dokumentations-PR, Merge nach erfolgreichen Pflichtprüfungen und anschließende Zweigbereinigung ausdrücklich freigegeben.

## 2026-10-24 - Juna - Erste alte Fenster bei fehlender Cachedatei reparieren

Nach ausdrücklicher Freigabe PR #469 mit vollständig grünen Pflichtprüfungen
per Merge-Commit `143db013` veröffentlicht. Servervorbereitung abgeschlossen;
gesunder Container ohne Neustarts, lesender Archiv-Mount sowie jeweils 278
prüfsummengleiche Dateien des bisherigen und neuen öffentlichen Baus bestätigt.
Der zusätzliche echte Browserwechsel erhielt die fremde Testeingabe. Eine danach
absichtlich entfernte alte Cachedatei lieferte jedoch 503 trotz korrektem Archiv.

Ursache: Eine beim allerersten Aufruf noch unkontrollierte alte Seite wird später
per `clients.claim` übernommen, erhält im alten Protokoll aber noch keine
Fensterzuordnung. Beim nächsten unabhängigen Update bleibt sie bewusst
`unassigned`. Bisher scheiterte dadurch auch eine eindeutig versionierte alte
Dateianforderung vor dem vorhandenen Reparaturweg. Neuer echter Browserfall
reproduziert unveränderte Eingabe, fehlende Zuordnung und 503 statt 200.

Folgekorrektur im eigenen Zweig auf dem veröffentlichten Hauptzweig: Ohne
Zuordnung ausschließlich versionierte alte JS-/CSS-Dateien aus vorhandenen
früheren Bauinventaren berücksichtigen. Alle passenden Inventare müssen dieselbe
SHA-256 nennen; anschließend unveränderter prüfsummengesicherter Cache-/Archivweg.
Keine Zuordnung raten, keine neue oder unversionierte Datei freigeben. Zwei neue
Workerfälle prüfen Reparatur, unveränderte Zuordnung und Konfliktabweisung.
Unabhängiger Nachreview ohne wesentliche Befunde; beide Worker-Suiten zusätzlich
eigenständig mit 30 erfolgreichen Fällen geprüft. 46 PWA-Skriptfälle, gezieltes
Lint, Typprüfung, Formatierung, Suite-Audit und 49 Auswahl-/Registrierungsfälle
erfolgreich. Vollständige Produktions-PWA-Matrizen mit drei frischen Bauten unter
Windows und Linux (Node 22, vier CPUs, acht GiB) jeweils 42 Fälle erfolgreich;
jeweils das vorgesehene Desktop-Duplikat ausgelassen. Neue erste Legacy-Sitzung
einschließlich erhaltener Eingabe und erzwungener Reparatur auf Desktop und
mobilem Touch-Kontext erfolgreich. Echte Apple-Geräteabnahme bleibt offen.

## 2026-10-24 - Juna - App-Aktualisierungen je Fenster unabhängig machen

**Auftrag:** Wiederkehrende Updateblockaden und wechselnde Ladeansichten untersuchen,
bewährte Verfahren recherchieren und den anschließend freigegebenen neuen Ablauf
mit gründlichen Prüfungen umsetzen.

**Umsetzung:** Eigene Zustimmung statt globaler Freigabe aller Fenster. Andere
aktive oder eingefrorene Dokumente behalten Eingaben und ihren bisherigen Dateistand;
geöffnete beziehungsweise geschlossene Fremdfenster brechen den Wechsel nicht mehr ab.
Gemeinsame Startfreigabe verhindert die kurz freigegebene alte Seite; vorbereitete
Updates werden beim frischen Start innerhalb derselben Ansicht übernommen und nach
bestätigtem Zielbau höchstens einmal automatisch neu geladen. Rückkehrprüfungen
öffnen keine weitere Ladefläche. Eigene Angular-/Routen-/native Eingaben, Kindentwürfe
und laufendes Speichern bleiben geschützt; Workerabbrüche lösen alle Sperren wieder.
Prüfsummengesicherte öffentliche Release-Dateien bleiben versionsbezogen reparierbar,
einschließlich verlorenem Inventar des noch aktiven alten Workers. Serverarchiv,
Aufbewahrung, lesender Mount und historischer Rückfall vorbereitet. Untersuchung,
Umsetzungsplan und aktualisierte Geräte-/Releaseanleitung dokumentieren Vertrag und
verbleibende Geräteabnahme.

**Geprüft:** Vollständiger Anwendungslauf: 2.708 Node-, 354 DOM- und 2.837
Angular-Tests erfolgreich; anschließend gezielte Update-Suite mit 46 Fällen
erfolgreich. 44 PWA-Skriptfälle, Lint, Typprüfung, Suite-Audit und Prüfregistrierung
erfolgreich. Unter Windows und unter Linux mit Node 22.23.4, Playwright 1.62.1 und
begrenzten Ressourcen jeweils 40 Produktions-PWA-Fälle erfolgreich; jeweils ein
vorgesehenes Desktop-Duplikat ausgelassen,
echter eingefrorener Touch-Kontext erfolgreich. Drei echte Produktionsbauten prüfen
unverändertes Vorgängerprotokoll, übersprungene Version, Rückwechsel und automatische
Startübernahme ohne alte Seitenfreigabe. Helle/dunkle Updateansicht, Fokus, AXE,
Touch, Offlinepuffer, Kontotrennung und unveränderte Wiederholung eingeschlossen.
Linux-Digestfixture prüft Archiv-/historischen Rückfall und unverändert blockierende
SQL-Fehler; echtes Nginx liefert alte Bytes und echte 404 mit Produktionsheadern.
Unabhängiger abschließender Review ohne offene wesentliche Befunde, einschließlich
28 nochmals eigenständig ausgeführter Worker-, Start- und Archivprüfungen.
Aktuellen Hauptzweig `46a51a66` übernommen; nur die parallelen Changelog-Einträge
mussten zusammengeführt werden. Danach 46 Update-, zwölf Bestands- und 102
Auswahl-/Workflowprüfungen sowie vollständige Formatprüfung erneut erfolgreich.
Auch Lint, Typprüfung, 44 PWA-Skripte und die komplette Linux-Produktions-PWA-Matrix
mit drei frischen Bauten und 40 erfolgreichen Fällen auf diesem Stand erneut grün.

**Stand und Grenzen:** Noch kein Push, PR, Merge oder Produktionswechsel. Vor dem
ersten Release ist die dokumentierte einmalige Übernahme des Deploy-Skripts und
Archivierers mit Betreiberzugang erforderlich. Echte iPhone-/iPad-Home-App-Abnahme
bleibt offen; WebKit ist kein Gerätenachweis. Fremde Änderungen in der primären
Arbeitskopie bleiben erhalten; Umsetzung im eigenen Zweig/Worktree.

**Freigegebener Releaseabschluss:** Nutzer hat PR, Merge nach erfolgreichen
Pflichtprüfungen und die nötige Servervorbereitung ausdrücklich beauftragt.
Mit Betreiberzugang Serverstand gegen den aktuellen Hauptzweig abgeglichen:
keine zusätzlichen Serveränderungen im Deploy-Skript. Bestehende Fassung unter
`/opt/flipbase/update-bootstrap-20261024-c3362e2d/` gesichert; geprüfte Skripte
aus `c3362e2d` nach Syntax-/Prüfsummenprüfung unter gemeinsamer Deploysperre
mit `root:root` und `0700` übernommen. Python 3.14.4 vorhanden. Alle 278 Dateien
des bisherigen Baus `b7600e1050b1` bereits geprüft archiviert; der laufende gesunde
Container blieb dabei unverändert. Der Archiv-Mount und die öffentliche
Dateiauslieferung werden nach dem regulären Release gesondert bestätigt.

**CI-Nachprüfung:** Der erste PR-Lauf fand zwei Lücken der Testvorbereitung:
Nginx konnte das mit `mkdtemp` angelegte Linux-Verzeichnis mit `0700` nicht lesen;
die vorhandene gemeinsame App-/Push-Fixture stellte den neuen Archivierer noch
nicht bereit. Öffentliches Fixtureverzeichnis wie im echten Archiv zugänglich
gemacht, HTTP im echten Nginx-Container ohne Hostport geprüft und die gemeinsame
Fixture um gültige App-Dateien sowie den echten Python-Archivierer ergänzt.
Byte-, Header-, 404-, Reihenfolge- und Fehlerprüfungen bleiben erhalten. Danach
106 Auslieferungs-/Auswahlfälle unter Linux ohne Auslassung erfolgreich, elf
Auslieferungsfälle unter Windows erfolgreich (vier POSIX-Fälle dort vorgesehen
ausgelassen); geänderte Datei formatiert und gelintet. Unabhängiger Nachreview
ohne wesentliche Befunde. Die Anwendung und die installierten Serverskripte
wurden durch diese Testkorrektur nicht verändert.

## 2026-10-24 - Juna - Bestandsverluste ausdrücklich bestätigen

Auf ausdrücklichen Auftrag die unmittelbare Formularbuchung im Bestandsabgang
entfernt: Enter im Mengenfeld übermittelt keine Ausbuchung mehr. Nur der sichtbare
Aktionsbutton startet den Vorgang. Für Verlust öffnet er zunächst den vorhandenen
Bestätigungsdialog mit Artikel, Menge, Grund und bekanntem Restbestand. Erst
„Verlust buchen“ ruft den Bestandsdienst auf. Abbrechen und Escape erhalten die
Eingaben; ein offener Dialog blockiert doppelte Anfragen. Ein Artikel-/Eingabewechsel
oder das Verlassen der Ansicht verhindert eine veraltete Bestätigung. Beim Zerstören
wird nur die eigene globale Rückfrage geschlossen. Schaden und Bestandskorrektur
bleiben nach ausdrücklichem Buttonklick ohne zusätzlichen Prüfschritt möglich.

Sechs neue Methodenfälle zuerst rot nachgewiesen, danach Dialog-/Dienstfälle grün.
Unabhängiger Review fand die fehlenden vier Einträge in der verbindlichen
Browser-Soll-Liste; ergänzt und 49 Auswahl-/Registrierungsprüfungen erfolgreich.
Die ergänzte echte Browserprüfung wies zusätzlich verlorenen Rückfokus nach Abbruch
nach. Während der Rückfrage bleibt der Auslöser deshalb fokussierbar; Deaktivierung
beginnt erst nach Zustimmung, doppelte Aufrufe sperrt bereits die offene Rückfrage.
Vier neue Browserfälle gegen eine eigene frische lokale Supabase erfolgreich:
1440px hell/Maus, 834px dunkel/Touch, 390px hell/Touch und 320px dunkel/Touch,
verteilt auf Bestandsübersicht und Variantendetail. Sie prüfen Enter ohne Aufruf,
Abbruch/Escape samt Rückfokus, erhaltene Eingaben, AXE, die echte einzelne
Verlustbuchung und keinen Verkauf. 60 betroffene Angularfälle erfolgreich.
Die fünf betroffenen Browserdateien enthalten insgesamt 37 Fälle: zunächst 33
erfolgreich; ein bestehender Bildfall zeigte fehlende Dienste der eigenen lokalen
Testinstanz. Diese ergänzt, den Fehler gezielt erfolgreich geprüft und die beiden
betroffenen Restdateien vollständig erfolgreich abgeschlossen (acht Fälle).
Typprüfung, ESLint, Formatierung, Suite-Audit und abschließender Produktionsbau
erfolgreich. Unabhängiger Nachreview des Fokusfixes ohne weitere wichtige Befunde.
Die angepasste verbindliche Testregistrierung wählt in CI weiterhin umfassende
Pflichtprüfungen. Nutzer hat PR und Merge nach deren Erfolg ausdrücklich freigegeben.
Keine Produktivbuchung und keine Änderung der Burberry-Reservierung.

## 2026-10-24 - Juna - Verlustherkunft vertiefen und Tastaturlücke nachweisen

Auf erneuten Auftrag ausschließlich lesend die produktiven Belege, das enge
Serverprotokollfenster und die damaligen lokalen Prüfverläufe abgeglichen.
Zwölf Archivierungen umgeben den einzelnen Burberry-Verlustaufruf; der eigene
Aniston-Verkauf liegt bereits rund vierzehn Minuten davor. Kein Beweis für die
Person am Browser oder den damaligen konkreten Klick gefunden. In einer isolierten
Angular-Vorschau den unveränderten echten Ausbuchungsdialog mit lokalem Ersatzdienst
und gesperrten Serververbindungen geprüft: Nach Auswahl von Verlust löst Enter
im Mengenfeld ohne sichtbaren Buchungsbutton einen Aufruf mit Menge eins und leerer
Notiz aus. Enter in der Grundauswahl bucht dagegen nicht; Verlust ist kein Standard.
Dieser reproduzierte Schwachpunkt wird ausdrücklich nicht als bewiesene historische
Ursache ausgegeben. Vorschau gebaut; zehn bestehende Methoden-/Diensttests erfolgreich.
Geschäftsdaten, Verkauf, Reservierung, Rechte und Anwendungscode unverändert.
Die aktive Reservierungssperre und der ungebuchte eBay-Entwurf erneut lesend bestätigt.
Bericht `docs/audit/2026-10-24-stock-removal-origin-followup.md` enthält Nachweise,
Grenzen und einen noch nicht umgesetzten Vorschlag für bewusste Bestätigung,
Pflichtbegründung und begrenzte Herkunftsprotokollierung.

Nachtrag zur Nutzerrückmeldung: Der Nutzer bestätigt, damals selbst Artikel
archiviert zu haben. Die Serie ist damit seiner Aufräumaktion zugeordnet;
ein bewusster Verlustauftrag oder der konkrete auslösende Tastendruck sind
dadurch weiterhin nicht belegt. Nur Untersuchungsbericht und dieser Nachtrag
ergänzt, keine neue Produkt- oder Datenänderung.

## 2026-10-24 - Juna - Gegenbuchung und eBay-Reservierung vorbereiten

Auf ausdrücklichen Auftrag einen begründeten Rücknahmeweg für losbasierte
Bestandsabgänge ergänzt. Eine neue unveränderliche Eingangsbewegung verweist auf
den ursprünglichen Abgang; ein eigenes Geschäftsereignis hält Akteur, Erklärung,
Ursprungsereignis und genaue Kostenfolge fest. Die originale Verlustbuchung wird
weder geändert noch gelöscht. Mengen- und Kostenabgleiche in Verkauf und erneutem
Abgang rechnen Aus- und Gegenbewegung mit Vorzeichen. Rücknahme prüft Berechtigung,
aktiven Workspace, vollständigen Ursprungsbeleg und aktuellen Mengen-/Kostenpool;
Sperren und ein eindeutiger Index verhindern eine doppelte Rückführung.

Regression zuerst rot: Rücknahmefunktion fehlt, elf von 16 fachlichen Prüfungen
scheitern. Danach Gegenbuchung, genaue 13-Euro-Kosten, unveränderte Verkäufe,
Folgeverkauf, Restcent, weitere Abgänge, fehlender Beleg und normale eBay-Reservierung
abgesichert. Unabhängiger SQL-Review fand eine vom Generator ausgelassene
rollenbezogene Rechteentziehung. Der neue Dienstrechte-Test scheitert zuerst am
frischen Replay; die Migration übernimmt anschließend den ausdrücklichen Entzug
aus der deklarativen Quelle und gewährt nur angemeldeten Benutzern den Aufruf.
Neuer kompletter Aufbau aus allen Migrationen und Seed: 131 SQL-Dateien mit
4.956 Assertions erfolgreich, einschließlich 44 neuer fachlicher Prüfungen.
Realer Zweitsitzungstest: zweite Rücknahme wartet auf die erste und erhält danach
denselben Beleg; eine Menge, eine Gegenbewegung und ein Geschäftsereignis.

Migration mit CLI aus dem deklarativen Schema erzeugt, vorhandene fachfremde
Schemaabweichungen ausgeschlossen und alle drei Funktionskörper gegen ihre
Quellen geprüft. Generierte Typen enthalten zusätzlich ausschließlich den neuen
RPC. Produktionsbau erfolgreich; bestehende Bauwarnungen bleiben bestehen.
59 Auswahl-/Registrierungs-/Migrationsvertragsprüfungen erfolgreich, eine optionale
Release-Integrationsprüfung erwartungsgemäß übersprungen; der vollständige echte
SQL-Replay ist oben belegt. Die breitere Anwendungsauswahl einschließlich aller
Browsergruppen bleibt vor dem Merge Aufgabe der unveränderten Pflichtprüfungen;
keine neue oder geänderte Oberfläche. Die bestehende PR-/Merge-Freigabe für den
eBay-Auftrag gilt fort. Gegenbuchung und Reservierung werden erst nach erfolgreicher
Veröffentlichung gemeinsam in einer gesondert abgesicherten Transaktion ausgeführt.
Keine endgültige Verkaufsbuchung vorgesehen; tatsächliche Versandkosten bleiben offen.

## 2026-10-24 - Juna - Ursprung der bestrittenen Burberry-Verlustausbuchung untersuchen

Die zuvor als Ursache vermutete Plattformzuordnung korrigiert: Drei tatsächliche
Vinted-Verkäufe und die separate eBay-Bestellung 7587 sind unterschiedliche
Vorgänge. Auf ausdrücklichen Auftrag wurde zuvor ein noch nicht gebuchter
eBay-Entwurf mit dem Burberry-Katalogartikel gespeichert; die Menge null lässt
keine Reservierung zu. Die nun beauftragte Herkunftsuntersuchung bleibt in
Produktion vollständig lesend. Datenbankbeleg, Geschäftsereignis und erhaltenes
Zugriffsprotokoll bestätigen einen erfolgreichen Chrome-Aufruf der Aktion
„Aus Bestand entfernen“ am 23.10.2026 um 13:02:46 Uhr Berliner Zeit: ein Stück,
Grund Verlust, keine Notiz, Stückkosten 13 Euro. Keine automatische
eBay-/Vinted-Verkaufsbuchung und kein bloßer Anzeigefehler. Der gespeicherte
Benutzer beweist nicht, wer den Browser bedient hat. In den verfügbaren lokalen
Prüfprotokollen keinen zugehörigen Assistentenaufruf gefunden; die menschliche
oder technische Ursache des auslösenden Klicks bleibt unbelegt. Dialogstandard,
Tastaturbehandlung, getrennte Aufrufwege und Schutztrigger gelesen. Bericht
`docs/audit/2026-10-24-burberry-stock-removal.md` trennt diese Nachweise von
offenen Fragen und beschreibt die nötige Gegenbuchung mit unverändertem
Originalbeleg. Kein Bestand, Verkauf, Entwurf, Schema oder Recht geändert;
die Bestandsblockade ist noch offen. Nur Dokumentation in eigener Arbeitskopie;
kein Anwendungsbau oder Testlauf für unveränderte Produktlogik behauptet.

## 2026-10-23 - Juna - Bestellung 7587 und fehlende Burberry-Zuordnung prüfen

Die echte eBay-Antwort für Bestellung 7587 bestätigt Zahlung, Versand und eine
leere Erstattungsliste. Die öffentliche Bestellprüfung verwendete noch einen
älteren Funktionsstand, obwohl Hintergrunddienst und Anwendung bereits auf dem
geprüften Merge `d5268ee3` liefen. Die 20 benötigten Funktionsquellen aus genau
diesem Merge abgeglichen, vor Änderung gesichert und neun abweichende Quellen
aktualisiert. Nur den öffentlichen Funktionsdienst neu erzeugt. Echte erneute
Prüfung: keine Sperrgründe, `hasRefund=false`, belegte Gebühr 4,68 Euro; keine
Verkaufsbuchung oder Zuordnung ausgeführt. Fremde Funktionsquellen unverändert.

Die drei vorhandenen Burberry-Verkäufe sind als Vinted gespeichert und wurden
durch den bisherigen eBay-Plattformfilter ausgeblendet. Die gesonderte Korrektur
bietet vorhandene Verkäufe mit sichtbarer gespeicherter Plattform an. Eine
bewusste vollständige Zuordnung erhält bestehende Verkaufsdaten und Bestandsabgänge.
Keinen der drei realen Verkäufe automatisch ausgewählt oder umgeschrieben.
Regressionen zuerst rot nachgewiesen: Auswahlbeschriftung, Antwortparser sowie
SQL-Auswahl und Zuordnung. Danach 34 betroffene Angularfälle, zehn Modellfälle,
56 Backendfälle, Typprüfung, Lint und Produktionsbau erfolgreich. Die Migration
wurde aus den zwei deklarierten Funktionen gegen den Migrationsstand erzeugt;
vorhandene fachfremde Schemaabweichungen nicht übernommen. Frischer Aufbau mit
allen Migrationen und Seed: 130 SQL-Dateien und 4.912 Assertions erfolgreich.
Typen aus der eigenen Datenbank neu erzeugt und unverändert. Unabhängiger Review
ohne kritischen oder wichtigen Befund; seinen kleinen Testhinweis übernommen und
die Bestätigungsgrenze mit vollständiger Bestellung positiv und negativ geprüft.
Linux-Browsermatrix mit Node 22.23.4 und Playwright 1.62.1 erfolgreich: zwölf
bestehende eBay-Fälle auf Desktop und Touch, jeweils hell/dunkel, einschließlich
AXE/WCAG-Prüfung des Plattformhinweises. Zwei vorher ausschließlich auf die
Desktop-Navigation gerichtete Testselektoren verwenden jetzt den jeweils
sichtbaren Link; keine Produktlogik oder Prüfbedingungen abgeschwächt. Die
erteilte PR-/Merge-Freigabe für den eBay-Gesamtauftrag wird weiter verwendet;
Merge erst nach sämtlichen erfolgreichen Pflichtprüfungen.

## 2026-10-23 - Juna - eBay-PR nach Freigabe mit aktuellem Hauptzweig integrieren

Nutzer autorisiert PR, erfolgreiche Pflichtprüfungen, Merge-Commit und anschließende Bereinigung des eigenen Zweigs samt Arbeitskopie. Vor dem ersten Push den inzwischen aktuellen Hauptzweig `962e4e14` mit Vinted-Entwurfsübernahme integriert. Beide Änderungsprotokolle erhalten; die gemeinsame Browserfixture enthält sowohl die eBay-Status-/Reservierungsantworten als auch den Vinted-Entwurfszähler. Die übrigen eingehenden Dateien bleiben unverändert. Integration vor dem Push geprüft: 74 Auswahl-/Registrierungsfälle, 174 betroffene Angularfälle, 25 Browserfälle mit gemeinsamer Marktplatzübersicht, Typografie und vollständigen eBay-Abläufen sowie Typen, Lint, Format und Produktionsbau erfolgreich. Eigene Testinstanz regulär frisch aus allen Migrationen und Seed aufgebaut: 130 SQL-Dateien/4.906 Assertions erfolgreich; Typen tatsächlich neu erzeugt und unverändert. Der PR wartet anschließend auf alle erfolgreichen Pflichtprüfungen. Kein direkter Hauptzweig-Push und keine fremde Arbeitskopie verändert.

## 2026-10-23 - Juna - eBay-Listen, Verkaufsentwürfe und persönliche Glocke integrieren

**Freigabe und Umsetzung:** Den ausdrücklich bestätigten Gesamtentwurf umgesetzt:
gespeicherte Bestell-/Inseratlisten mit Bildern und Hintergrundabgleich,
Bestandszuordnung, nachträglicher Abgleich vollständiger vorhandener Verkäufe,
dauerhafte Entwürfe unter „Zu prüfen“, sofortige eigene Reservierungen und
persönliche eBay-Meldungen in der Glocke. Käuferporto, belegte Gebühren und
tatsächliche Versandkosten bleiben getrennt; unbekannte Werte werden nicht zu
bestätigten Nullen. Erst die bewusste endgültige Buchung zählt als Verkauf.
Kontotrennung schließt private Bestelldaten, erhält aber die interne bewusste
Reservierungsklärung. Bestehende Vinted- und gemeinsame Formularänderungen aus dem
aktuellen Hauptzweig sind enthalten.

**Unabhängige Prüfungen und Korrekturen:** Aufgabenreview der Oberfläche fand
ausgeblendete gespeicherte Tabellenzeilen bei Abruffehlern, unvollständig
verworfene private Daten nach eindeutigem Rechteentzug und einen hängenbleibenden
internen Freigabevorgang bei persönlichem Kontofehler. Alle drei mit zunächst
roten Regressionen korrigiert; 64 betroffene Angularfälle einschließlich 23 neuer
Fälle erfolgreich, frischer Nachreview ohne offenen wichtigen Befund. Die
anschließende Integrationsprüfung isoliert einen bereits vorhandenen
Bildtest-Mock nach reproduzierbar rotem Minimalpaar; sämtliche 48 DOM-Dateien
bestehen danach ohne Produkt-, Pool-, Assertion- oder Timeoutänderung.
Unabhängiger Teilreview bestätigt diese Korrektur und die echte Testregistrierung.

**Abschlusskorrekturen:** Der unabhängige Gesamtbranchreview findet drei konkrete
Lücken: Der Aktualisierungsknopf fordert noch keinen Abgleich an, spätere
Erstattungen gebuchter oder zugeordneter Verkäufe fehlen als sichtbarer Klärfall,
und neue Anbietergebühren bleiben hinter automatisch vorbereiteten Kosten
verborgen. Eine gemeinsame Korrektur ergänzt den berechtigten Aktualisierungsweg,
getrennte Quellenhinweise bei unverändertem Buchungsbeleg und die Unterscheidung
automatischer von persönlich gespeicherten Kosten. Alte Eingaben ohne belegte
Herkunft bleiben erhalten und werden neben dem aktuellen Quellenbetrag gezeigt.
Ein zusätzlicher vorhandener SVG-Schriftfehler ist am unveränderten Hauptzweig
reproduziert; das gemeinsame Diagramm erbt nun die Schrift seines Umfelds.
Der gezielte Nachreview entdeckt außerdem den Statistikabruf im neuen
Nachlesetimer sowie Grenzfälle nachgeladener Seiten. Der Hintergrundweg wird
deshalb vom interaktiven Abruf getrennt und liest die bereits geöffneten Seiten
vollständig aus dem Cache, bevor er die Anzeige ersetzt. Regressionen decken
leeren Erstimport, neue Seitengrenzen, hinzugekommene und entfernte Zeilen sowie
den weiterhin erreichbaren nächsten Seitenabruf ab. Der Altverkaufstest wählt
seinen Artikel nach dem belegten Titel statt einer unbelegten Datenbankreihenfolge.
Ein zusätzlicher AXE-Befund der neuen Erstattungsliste ist durch einen getrennten
Statusrahmen und eine gezielte Assertion im vorhandenen Browserfall behoben.
Das abschließende eine Nachreview bestätigt F1–F6 als korrigiert, ohne offene
Codebefunde. Alle drei aktuellen eBay-Browserfälle und vier zusätzliche
Desktop-/Touch-/Hell-/Dunkel-/AXE-Abläufe bestehen am endgültigen Produktstand.

**Nachweise und Grenzen:** Linux-Anwendungsprüfungen, regulärer SQL-Replay mit
Rechte-/Schemaabgleich, echte Bestandskonkurrenz, Edge-Funktionen,
Produktions-PWA, Docker-/Funktionspakete und die betroffene Browserauswahl sind
im [integrierten Abnahmeprotokoll](testing/ebay-sales-review-validation.md)
mit tatsächlichem Umfang und Grenzen festgehalten. Die zusätzliche eBay-Abnahme
prüft Hell/Dunkel, Desktop und Touch, Tastatur und AXE; Aufnahmen liegen außerhalb
des Repositorys und wurden tatsächlich angesehen. Vorhandene Warnungen und
erwartete Fehlerausgaben bleiben benannt. Keine echte Anbieterzahlung,
Handy-Pushzustellung oder Produktionsveröffentlichung behauptet. Fremde
Arbeitskopien und laufende Projekte bleiben erhalten. Push, PR und gemeinsamer
Rollout folgen erst nach abgeschlossener Prüfung und vorgeschriebener Freigabe.

## 2026-10-23 - Juna - eBay-Verkaufsprüfung untersuchen und Erstattungssperre korrigieren

**Auftrag:** eBay-Listen mit gespeicherten Daten und Artikelbildern verbessern,
Inserate und Bestellungen mit Bestand oder bereits erfassten Verkäufen verbinden,
neue Verkäufe automatisch zur Prüfung vorbereiten und in der Glocke melden.
Nutzer bestätigt sofortige Mengenreservierung; endgültige Buchung erst nach Prüfung.

**Befund:** Aktuellen `origin/master` bei `3477b3e5` gelesen; ältere Hauptarbeitskopie
und fremde Zweige unverändert erhalten. Tabellenabrufe gehen direkt an eBay,
Formularentwürfe sind nicht dauerhaft gespeichert. Hintergrundbeobachter hängt
an Push-Geräten und schreibt keinen Glockeneintrag. Vorhandene Inseratzuordnung
und Altverkaufsauswahl sind die Grundlage für den Ausbau. Produktion ausschließlich
lesend geprüft: Bestellung mit Endnummer 7587 ist bezahlt, versendet und nicht
storniert; die Bestell-Erstattungsliste ist leer, das Positionsfeld fehlt.
Die bisherige Normalisierung erzeugt deshalb fälschlich die Erstattungssperre.
Gebührenbetrag vorhanden, eigene Versandkosten nicht als Bestellfeld geliefert.
Keine rohe Antwort, Käuferdaten oder Zugangsdaten als Artefakt gespeichert.

**Lokale Korrektur:** Im eigenen Zweig `juna/ebay-sales-review` erlaubt eine
ausdrücklich leere Erstattungsliste der Bestellung das fehlende Positionsfeld.
Echte, widersprüchliche, ungültige oder insgesamt fehlende Erstattungsnachweise
bleiben gesperrt. Erstattungen auf Bestellebene werden zusätzlich berücksichtigt.
Vier fachliche Regressionen ergänzt; vor Korrektur zwei passende Fehler,
anschließend 52 betroffene Edge-Prüfungen erfolgreich. Deno-Lint, Typprüfung
des echten eBay-Funktionseinstiegs, Prettier und Unterschiedskontrolle erfolgreich.
Der alte globale Deno-2.7.5-Lauf scheiterte an zwei Typfehlern in unveränderten
Handler-Tests; mit isoliert geladener, anhand offizieller SHA-256 geprüfter stabiler
Version 2.9.8 laufen dieselben Tests erfolgreich. Keine globalen Werkzeuge oder
Anwendungsabhängigkeiten aktualisiert.

**Gesamtentwurf und Grenzen:**
`docs/superpowers/specs/2026-10-23-ebay-sales-review-design.md` beschreibt dauerhafte
Lesekopien, unabhängigen Änderungsabgleich, Bestellbilder, Altverkaufszuordnung,
Entwürfe, eigene Reservierungen, Kostenlücken, historische Erstbasis und Glocke.
Unabhängiger lesender Entwurfs-/Parserreview ohne wichtigen offenen Befund.
Der Nutzer hat den Gesamtentwurf ausdrücklich zur Umsetzung freigegeben.
Keine Buchung, Reservierung, Migration, Anbieteränderung, Push-, PR-, Merge- oder
Produktionsveröffentlichung ausgeführt. Kein Angular- oder Browserumbau in dieser
Korrektur. Kein Linux-/Gesamt-CI-Lauf behauptet; die bestehende Testauswahl stuft
geteilte Edge-Quellen breit ein, dieser Pflichtlauf bleibt vor Veröffentlichung
erforderlich. Fremde lokale Dateien und der parallele Vinted-Zweig bleiben erhalten.
**Fortsetzung nach Freigabe:** Gespeicherte kontogebundene Bestell-/Inseratlisten mit
unabhängigem Hintergrundabgleich, Gebühren- und Bildnormalisierung umgesetzt.
Unabhängiger Aufgabenreview findet drei Randfälle bei schrumpfenden Seiten,
persönlichen Push-Empfängern und später erstmals sichtbaren Zahlungen; alle drei
mit zunächst roten Regressionen korrigiert. Frischer Nachreview ohne offene
wichtige Befunde. Zusätzliche generierte Migration erhält die vorherige Datei;
transaktionaler Replay und vollständiger Schema-/Rechtevergleich stimmen überein.
71 betroffene Edge-Fälle, davon 28 geänderte Fälle unter CI-Deno 2.9.7 auf Linux,
und der vollständige lokale Supabase-Lauf mit 128 Dateien/4.765 Assertions erfolgreich.
Bestehende echte Parallelfälle für Doppelbuchung und entzogene Rechte ebenfalls
erfolgreich. Linux-Browserbasis für den bisherigen Übernahmeweg bestätigt;
die neue Entwurfs-/Reservierungsoberfläche folgt erst im nächsten Schritt.
Aktuelles `origin/master` bei `7eb63bd5` in den eigenen Zweig integriert;
Änderungsprotokoll mit sämtlichen Einträgen erhalten, übrige Dateien unverändert
übernommen. Keine fremden Zweige oder Produktivdaten verändert.

**Verkaufsentwürfe und Bestandsprüfung:** Dauerhafte Entwürfe, eigene
Reservierungsbesitzer, atomare endgültige Buchung und vollständige Zuordnung zu
vorhandenen Verkäufen ergänzt. Persönliche Glockenbelege bleiben von Push und
allgemeiner Workspace-Mitgliedschaft getrennt. Kontotrennung und bestehende
Kontolöschung erhalten interne Reservierungsklärungen ohne private Bestellquelle.
Vollständige SQL-Suite vor dem letzten Randfall: 129 Dateien/4.840 Assertions;
danach betroffene Fälle und sechs echte Konkurrenzszenarien erfolgreich geprüft.
Der unabhängige Aufgabenreview fand verlorene Zahlungsübergänge nach persönlichem
Öffnen, unvollständig aufgehobene Erfasst-Markierungen und fehlende Dockerdateien.
Alle Befunde mit Regressionen korrigiert; 426 gezielte SQL-Assertions, sechs echte
Konkurrenzszenarien und vorhandene Docker-Kontextprüfungen erfolgreich. Beschädigte
Umlaute der vorherigen generierten Migration werden durch eine neue additive
Migration korrigiert; 31 tatsächliche Funktionskörper stimmen jetzt direkt mit
den deklarativen UTF-8-Dateien überein. Frischer unabhängiger Nachreview bestätigt alle vier Korrekturen ohne neuen Befund.
Der echte Docker-Paketbau bestätigt die Dateifreigaben; vollständiger Appbau,
neue Oberfläche und integrierte Browserprüfung folgen. Betriebsanleitung für
gemeinsame Migrationen, Hintergrunddienste und Anwendung ergänzt. Keine
Produktionsänderung oder PR-Veröffentlichung.

**Aktueller Hauptstand und regulärer Replay:** `origin/master` bei `8281c9d1`
mit den Vinted-Verkaufsabläufen in den eigenen Zweig übernommen. 46 eingehende
Dateien unverändert bestätigt; Änderungsprotokoll vollständig erhalten,
Schemaliste ausdrücklich vereinigt und gemeinsame Typen aus der frischen eigenen
lokalen Supabase-Instanz neu erzeugt. Alle Migrationen regulär chronologisch
angewendet und registriert; keine Migrationshistorie manuell nachgetragen.
Vollständige SQL-Suite: 130 Dateien/4.882 Assertions erfolgreich, sechs echte
Konkurrenzszenarien ebenfalls. 31 endgültige Funktionskörper und neuer
Schema-/Rechtekatalog stimmen mit den deklarativen Quellen überein. 60 Prüfungen
der Registrierung und Testauswahl, Typprüfung und Produktionsbau erfolgreich.
Bestehende Warnungen zu optionalem Zugriff im Einkauf, ungenutztem Vinted-Link,
Startpaketgröße und pako unverändert. Die neue eBay-Oberfläche folgt weiterhin
als eigener Umsetzungsschritt; keine produktive Veröffentlichung.

## 2026-10-23 - Juna - Vinted-Verkaufskarten und Entwurfsübernahme

**Auftrag und Ausgangslage:** Neuer eigener Zweig `juna/vinted-sales-drafts-and-transfer` auf dem gemergten Hauptstand `8281c9d1`. Fremde Arbeitskopie und deren Änderungen bleiben unberührt. Nutzer stellt den echten Kauf-/Stornotest zurück und beauftragt einheitliche Verkaufskarten, Diagnose des fehlenden Kaufpreises, getrennte native Vinted-Entwürfe und eine feldweise Datenübernahme in geöffnete Entwürfe. Untersuchung bisher ausschließlich lesend, keine Anbieteränderung. Plan und spätere Prüfungen: `docs/implementation/vinted-sales-drafts-and-transfer.md`.

**Umsetzung:** Verkaufskarten übernehmen Bildaufteilung, Abstände und einzeilige Titel des Kleiderschranks; Status steht neben Marke/Größe, Versand und kompakter Chatlink in der Fußzeile. Weitere Verkaufsangaben bleiben ausklappbar zugänglich. Der Preisimport liest zusätzlich den belegten Transaktionspreis `offer_price`; ein Versionswechsel erneuert alte Verkaufscaches einmalig. Chatzuordnung und eindeutige Einzelartikelmerkmale bleiben bei verkürzten Folgeantworten erhalten. Pakete übernehmen keine vermeintliche Einzelartikelmarke. Native Vinted-Entwürfe erscheinen unter Entwürfe, getrennt von Flipbase-Entwürfen, ohne Alter und außerhalb der Kleiderschrankzähler.

**Datenübernahme:** Beide Entwurfseditoren bieten Quellart, Konto, Suche, Nachladen, Vorschau und einzelne Feldhaken. Nur ausgewählte Felder ändern das offene Formular; ungewählte Eingaben, Fotos, Konto und Kennung bleiben erhalten. Es erfolgt keine automatische Speicherung oder Veröffentlichung. Kategorieabhängige Angaben benötigen passende Kategorien und gültige Zielauswahlen. Bei unvollständigen nativen Entwürfen bleiben Titel, Beschreibung und Preis nutzbar; formatierte Anbieterpreise werden normalisiert. Konto-/Arbeitsbereichswechsel sperren verspätete Antworten und fertige fremde Vorschauen.

**Review und Prüfung:** Unabhängiger Review führte zu Regressionen für unvollständige Preiseingaben, verkürzte Chatmetadaten, Wiederholungsimporte, Paketgrenzen, Kontowechsel und native Grundfeldmasken. Fehlerfälle vor der jeweiligen Korrektur nachgewiesen. Vollständige Anwendungssuite mit 545 Dateien/5.792 Fällen erfolgreich; spätere Ergänzungen zusätzlich gezielt geprüft. Vollständiger Worker mit 713 bestandenen Fällen und acht bestehenden Auslassungen, Worker-/Anwendungstypen, vollständige SQL-Suite mit 128 Dateien/4.724 Assertions, 75 Auswahl-/Registrierungs-/Migrationsprüfungen sowie Suite-Audit und Shared-UI-Prüfung erfolgreich. Abschließender Browser- und Produktionsbaunachweis wird im Implementierungsbericht ergänzt.

**Datenbank und Grenzen:** Neue Migration `20261023161900_vinted_provider_drafts.sql` mit offiziellem Supabase-pg-delta aus isoliertem Basis-/Zielkatalog erzeugt und frisch transaktional abgespielt; Funktion und Sicht entsprechen dem Ziel. Typen offiziell neu erzeugt, ohne fachliche Typänderung; bestehende bewusste Nicht-null-Einschränkung bleibt erhalten. Keine Produktivdaten oder echten Vinted-Anzeigen verändert. Der konkrete frische Verkauf ist durch den Parserfall abgesichert, sein tatsächlicher Anbieterabgleich nach Bereitstellung bleibt offen. Echte Käufe/Stornierungen sind weiterhin zurückgestellt; allgemeines Relisting und Warenbestandsverknüpfung bleiben Folgeaufträge.

**Lokaler Abschluss:** Alle 87 bestehenden und neuen Fälle der fünf betroffenen Browserdateien in Teilgruppen erfolgreich; die vier lokalen Übernahmevarianten nach ergänzter Prüfung des tatsächlich aktiven Farbschemas nochmals grün. Enthalten sind 320/390/834/1440px, Hell/Dunkel, Touch, Tastatur, AXE, Konto-/Arbeitsbereichsgrenzen und die vorhandene Inseratbearbeitung. Ruhende Entwicklungsvorschau während der Browserläufe; danach separater Produktionsbau samt PWA-Dateiprüfung erfolgreich. Verkaufskarten, native Entwürfe und Übernahmedialog mobil/Desktop visuell gelesen. Formatprüfung, gezieltes ESLint, Typen und Diffprüfung erfolgreich. Aktueller Hauptstand erneut abgerufen, unverändert `8281c9d1`. Nutzerfreigabe für PR und Merge nach erfolgreichen Pflichtprüfungen liegt bereits vor; der echte Kontotest bleibt zurückgestellt.

## 2026-10-23 - Juna - Vinted-Altersangaben und Verkaufsablauf korrigieren

**Auftrag und Ausgangslage:** Eigener Zweig `juna/vinted-sales-lifecycle` auf `3477b3e5f8304e792853f8042573058ad25ab16b`, fremde Arbeitskopie unverändert. Rein lesend festgestellt: Korrektur #461 bereits produktiv, dennoch alle 29 regulären Inserate mit unbekanntem Status und vorhandenem Alter. Aktuelle eigene Vinted-Liste liefert fünf eindeutige Zustandsflags, aber kein `is_visible`. Der bisherige Verkaufsimport erfasste ausschließlich versendete Transaktionen. Nutzer bestätigt ausdrücklich nur die Erkennung der nativen Vinted-Wiederaufnahme nach Storno; allgemeines zeitgesteuertes Relisting und Warenbestandsverknüpfung bleiben dokumentierte Folgeaufträge.

**Umsetzung:** Cloud- und Erweiterungsimport erkennen den belegten aktiven Flagzustand, unbekannte Zustände erhalten ihr neutrales Vinted-Alter. Gerundeter Veröffentlichungsanker kommt bei der Sortierung vor Erstellung und Abrufzeit. Verkäufe beginnen bei einem echten Verkäufer-Kaufbeleg; Käuferseite und angenommene Angebote bleiben ausgeschlossen. Strukturierte Systemereignisse erfassen Stornierung und native Wiederaufnahme. Paketkennungen, echter Gesamtpreis und erster Kaufzeitpunkt bleiben über Teilantworten erhalten. Die Kontolesesicht entfernt zugeordnete verkaufte beziehungsweise noch nicht wieder eingestellte Artikel aus Seite, Zähler und Übersicht, erhält aber die Historie. Wiederaufnahme benötigt ein datiertes Ereignis und eine anschließend tatsächlich gelesene aktive Anzeige. Neuere Käufe und zeitlich ungeklärte weitere Verkäufe sperren erneut. Verkäufe stehen nach dem Postfach und zeigen aktuelle Vorgänge getrennt vom Wiederaufnahmeverlauf mit intern gebundenem Chatlink.

**Review und Prüfung:** Unabhängiger Review deckte zusätzlich Cacheverlust bei manuellem Vollimport, verkürzte Stornoverläufe, singulären Paketzähler, isolierte Übergabefelder, Mehrfachverkäufe und veraltete Anzeigen auf; gezielte Regressionen zuerst rot, anschließend grün. Ein direkter angemeldeter Sichtzugriff schützt gegen versehentliche private Helperaufrufe. Vollständige Worker-Suite 709 bestanden/acht vorhandene Auslassungen; fachliche Anwendungsauswahl 18 Node-Dateien/162 Fälle und 70 Angular-Dateien/940 Fälle grün. Vollständige SQL-Suite 128 Dateien/4.719 Assertions und frischer Migration-Replay mit 36 Marketplace-Dateien/1.731 Assertions erfolgreich. 553 öffentliche Funktionen samt Rechten, Owner und Definer sowie Sichtoptionen identisch zum Zielkatalog nach Zeilenendennormalisierung. Anwendung-/Worker-Typen, Produktionsbau, gezieltes Lint, Shared-UI-Prüfung (244 Dateien/keine Befunde) und Suite-Audit erfolgreich. Vier neue Browserfälle separat registriert, einschließlich gezielter Auswahl und PR-Sollliste; keine Verkaufsfälle durch reine Galerieänderungen.

**Migration und Grenzen:** Neue Migration aus isoliertem Basis-/Zielkatalog generiert; deklarative Rechte, `security_invoker` und Altersbestandsabgleich vollständig enthalten. Die neue CLI-URL-Schnittstelle lieferte trotz Änderungen einen leeren Diff, der historische CLI-Weg scheiterte an einer alten unveränderten `lock table`-Migration; deshalb geprüfter `migra`-Kataloggenerator ohne Produktabhängigkeitsänderung. Vollständige SQL-Kopie enthält Schema und technische Referenzdaten, keine privaten Geschäftsdaten. Breiter CI-Lauf unter Linux bleibt vor dem Merge erforderlich; die echte Anbieterabnahme folgt gemeinsam nach Bereitstellung. Konto- und Anbieteraktionen wurden ausschließlich gelesen; kein Push, PR, Merge oder Deployment. Einzelheiten und spätere Warenbestandsverknüpfung: `docs/implementation/vinted-sales-lifecycle.md`.

**Browserabschluss:** Alle 58 Fälle der fünf betroffenen Kernansichten erfolgreich, darunter vier neue Verkaufsvarianten mit 390/1440px, echtem Hell-/Dunkelzustand und Touch. Vorhandene Fälle decken zusätzlich 320/834/1024px, Tastatur, Kontotrennung, Raster/Liste, Detail und AXE ab. Mobil-/Desktopansicht visuell gelesen. AXE fand die neue übersprungene Überschriftenebene; Gruppenüberschrift korrigiert und erneut geprüft. Erster Vorschauversuch blockierte lokale Testantworten durch Produktions-CSP; reguläre ruhende Entwicklungsvorschau ohne Produktänderung verwendet. Bestehender 503-Wiederholungstest besteht mit den unveränderten 15 Sekunden der CI. 197 Vertrags-/Auswahlprüfungen grün, Typen abschließend erneut geprüft. Tatsächliche CI-Auswahl ist umfassend (231 Node-, 48 DOM-, 262 Angular-Dateien; weitere Browser- und PWA-Prüfungen); lokal geprüfter fachlicher Plan enthält 18 Node-/70 Angular-Dateien. Acht weitere fachlich angewählte Browserdateien bleiben wie die fachfremde Gesamtregression dem verpflichtenden PR-Lauf vorbehalten. Keine vollständige CI-Freigabe behauptet.

**Abschlussfreigabe:** Nutzer autorisiert PR, Merge nach erfolgreichen Pflichtprüfungen und Bereinigung. Aktuellen Hauptstand `7eb63bd5ee864714b2b670473a4062df712fab25` einschließlich PR #462 übernommen; einziger Konflikt im Änderungsprotokoll durch Erhalt beider vollständiger Einträge gelöst. Keine Änderungen an fremden Zweigen. Integrierten Stand erneut geprüft: 102 Angular-Fälle aus acht gemeinsamen Navigations-/Vinted-Dateien und 27 Navigationsmodellfälle erfolgreich; Typprüfung und Produktionsbau ebenfalls grün. Die fachfremden Oberflächen aus PR #462 bleiben unverändert und werden nicht erneut manuell durchgespielt.

## 2026-10-23 - Juna - Tabellen und Kennzahlen vereinfachen

**Auftrag:** Mehrere kleine Verbesserungen an Einkäufen, Artikeln und Verkäufen in einem gemeinsamen Zweig umsetzen; PR erst nach Abschluss aller gemeinsam gesammelten Punkte.

**Umsetzung:** Rentabilität als beschrifteter Ein-/Aus-Button ohne dauerhaften Hilfstext. Artikelzeilen öffnen über freie Zeilenflächen ihr bestehendes Detailziel. Gemeinsames Drei-Punkte-Menü bündelt Artikel- und Verkaufsaktionen. Verkaufstitel werden gekürzt, Verkaufsnummer und Plattform stehen ausschließlich in ihren eigenen Tabellenspalten. Bekannte Plattformen erscheinen als Icon, eigene Plattformen als Text. Übersicht und Verkäufe verwenden denselben Kennzahlenbaustein.

**Prüfung:** 285 ausgewählte Anwendungstests (248 Angular, 28 Modelle, 9 DOM) und 47 Prüfungen der Testauswahl erfolgreich. Sämtliche 112 ausgewählten Browserfälle unter Windows/Chromium in Teilgruppen erfolgreich geprüft. Artikelmenüs mit Tastatur, Rückfokus, Klick außerhalb und Zeilenöffnung bei 1440/834/390 px, jeweils Hell/Dunkel und mit Touch auf schmalen Ansichten; Verkaufsaktionen zusätzlich mit Touch bei 1440/834/390/320 px in beiden Themes. Lange Verkaufstitel tatsächlich auf Auslassungspunkte geprüft, offene Menüs im Bildschirm und AXE ohne Befunde in den geprüften Zuständen. Gewinnbeträge verwenden nach einem belegten Kontrastfehler auf dem hellen Hoverhintergrund den vorhandenen dunkleren Erfolgsfarbton. Formatierung aller geänderten/neuen Dateien, gezieltes ESLint, Shared-UI-Vertrag ohne Befund, Typprüfung und abschließender Produktionsbau erfolgreich. Bestehende Bauwarnungen zu optionalem Zugriff im Einkauf, ungenutztem RouterLink der Vinted-Übersicht, Startpaketgröße und pako bleiben bestehen.

**Prüfbedingungen und Auffälligkeiten:** Eigene lokale Supabase-Testinstanz und ruhende Vorschau auf Port 4240, da 4200 von einem anderen Projekt belegt ist. Test-Anmeldestand und lokale Funktionsfreigaben dafür angepasst; nach wiederholten Diagnoseläufen ausschließlich die Drosselzähler der eigenen Testinstanz zurückgesetzt, Grenzwerte und Schutzprüfungen unverändert. Ein bestehender Bilddialogtest prüfte während der Einblendanimation; er wartet jetzt auf deren Ende, derselbe AXE-Check besteht. Ein Einkaufs-Navigationstest verlor einmal den Beschreibungstext; unverändert einzeln und anschließend in der vollständigen Dateigruppe erfolgreich, Ursache nicht abschließend nachgewiesen. Keine Änderung an Einkaufsformular, Navigationsschutz oder Datenpuffer. Keine native Safari-/iPad-Abnahme, keine Linux-/CI-Ausführung oder produktive Veröffentlichung behauptet.

**Ergänzung:** Nutzer benennt die Artikelübersicht in „Bestand“ um und ordnet die Warenwirtschaft als Einkäufe → Verkäufe → Bestand. Paket-Icon in Seitenkopf, Sidebar und mobiler Schnellnavigation. Ursache der abweichenden Schrift ist `appearance="content"`; Bestand verwendet nun dieselbe Standardvariante des gemeinsamen Seitenkopfs wie Einkäufe. Fachliche Artikelaktionen und Routen bleiben erhalten. Deutsche und englische Navigationsnamen sowie bestehende Navigations-Sollwerte angepasst.

**Prüfung der Ergänzung:** 33 Modell-/Übersetzungstests, 40 Angular-Tests und 47 Prüfungen der Testauswahl erfolgreich. 48 bestehende Browserfälle für Bestand, Navigation, Artikelanlage, gemeinsame Seitenbreiten und mobile PWA-Anordnung vollständig erfolgreich; Hell/Dunkel, Touch, Tastatur, Zoom und AXE enthalten. Die Bestandsfälle vergleichen die berechnete Schriftfamilie, Schriftgröße, Schriftstärke, Zeilenhöhe und Untertiteltypografie direkt mit Einkäufe bei 1440/834/390 px. Sidebar- und mobile Reihenfolge zusätzlich im Browser bestätigt, Paket-Icon und aktive Bestandsdetails in den bestehenden Navigationstests abgesichert. Formatierung, gezieltes ESLint, Shared-UI-Prüfung, Typprüfung und Produktionsbau erfolgreich; bestehende Bauwarnungen unverändert. Reine Begriffs-, Reihenfolge-, Icon- und Seitenkopfkorrektur ohne Routen- oder Fachlogikänderung. Die zentrale Navigation und der Übersetzungsloader lösen im Auswahlskript vorsorglich die umfassende CI einschließlich Produktions-PWA aus. Diese Gesamtauswahl bleibt für den späteren gemeinsamen PR ausstehend; die 48 lokalen Browserfälle werden nicht als vollständige CI oder native Safari-/iPad-Abnahme ausgegeben.

**Löschen ohne Tabellenreset:** Nach bestätigtem Löschen eines unbenutzten Artikels rief die Bestandsübersicht `reload()` auf. Die vier Dienste setzten dadurch ihre Ladezustände; der Tabellenbaustein blendete sämtliche Zeilen aus. Jetzt wird ausschließlich der bestätigte Artikel aus dem passenden lokalen Katalog- oder Einzelstückbestand entfernt, begrenzt auf seinen Workspace. Die übrigen Zeilen, Suche und Sortierung bleiben erhalten. Datenbankbestätigung, Fehlerbehandlung, Workspaceprüfung und Bildbereinigung bleiben im bestehenden Ablauf. Zwei neue Komponententestfälle zunächst rot und nach Korrektur grün; zusätzliche Fälle sichern abgelehntes Löschen und verspätete Antworten nach Workspacewechsel. Browsermatrix prüft beide Artikelarten mit unverändert verbundenen Tabellen-/Kartenflächen und übrigen Zeilen, erhaltener Suche sowie ohne erneute Listenabfragen bei 1440/834/390 px in Hell/Dunkel.

**Prüfung des Löschfehlers:** 16 ausgewählte Anwendungstests, 47 Prüfungen der Testauswahl und alle 33 ausgewählten Browserfälle erfolgreich. Bestehende Dateien für Artikelarbeitsfläche, Bestandsabgang, zentrale Artikelabläufe, Artikelanlage und Verkaufsauswahl vollständig ausgeführt; die sechs neuen Löschfälle enthalten zusätzlich AXE. Gezielt formatiert und gelintet, Shared-UI-Prüfung ohne Befund, Typprüfung und Produktionsbau erfolgreich. Bestehende Bauwarnungen unverändert. Windows/Chromium gegen ruhende eigene lokale Vorschau; keine vollständige Linux-/CI- oder native Safari-Prüfung für diese Ergänzung behauptet. Keine Änderung am gemeinsamen Tabellenbaustein oder an Datenbankabfragen.

**Plattformabhängige Verkaufserfassung:** Neue Verkäufe starten ohne vorbelegte Plattform. Nutzer bestätigt ausdrücklich die Auswahlpflicht vor dem Speichern; fehlende Auswahl zeigt einen Fehler am Feld mit Rückfokus. Vinted zeigt ausschließlich den kurzen Versandhinweis. Bei einem neuen Verkauf setzt der Plattformwechsel unpassende Gebühren und Vinted-Versandbeträge auf null, damit ausgeblendete Werte den Gewinn nicht beeinflussen. Direktverkauf, Shop, „Andere“ und eigene Plattformen zeigen bei eigenem Versand erhaltenes Käuferporto und tatsächliche Versandkosten; bei Abholung oder Plattformversandschein entfallen beide Betragsfelder. eBay und StockX behalten die Gebühreneingabe. Sichtbare Betragslabels ohne zusätzliches Eurozeichen. Bestehende Verkäufe behalten ihre gespeicherten Kosten sichtbar und editierbar; externe eBay-Entwürfe verlangen weiterhin ausdrücklich bestätigte Kosten. Auch die Rückkehr aus einem externen Entwurf startet mit leerer Plattform.

**Prüfung der Verkaufserfassung:** Neuer Komponentenfall zunächst mit der bisherigen Kleinanzeigen-Vorbelegung rot reproduziert. Alle 66 ausgewählten Anwendungstests und 47 Prüfungen der Testauswahl erfolgreich. Sämtliche 16 ausgewählten Browserfälle vollständig erfolgreich, einschließlich Artikelverkauf, Unternehmensbelegen, Variantenverkauf, Plattformverwaltung und beider eBay-Importfälle. Die sechs neuen Versandfälle bei 1440/834/390 px in Hell/Dunkel mit Touch auf schmalen Ansichten prüfen Auswahlfehler samt Fokus, eBay → Direktverkauf/Shop/Andere → Vinted, ausgeblendete Beträge, AXE und die tatsächlich gespeicherten Vinted-Werte. Gezielt formatiert und gelintet, Typprüfung und Shared-UI-Vertrag ohne Befund. Produktionsbau einschließlich Angular-Vorlagen erfolgreich; bestehende Bauwarnungen unverändert. Keine Änderung an Datenbankschema, Buchungsadapter oder Importregeln; die umfassende CI des späteren gemeinsamen PR bleibt ausstehend.

**Abschlussreview und PR-Auftrag:** Nutzer beendet die Sammlung und beauftragt ausdrücklich die gemeinsame Prüfung und PR-Erstellung, ohne Mergefreigabe. Aktuelles `origin/master` erneut abgerufen und weiterhin identisch mit der Zweigbasis `3477b3e5`. Sämtliche Änderungen einschließlich der neuen gemeinsamen Bausteine auf erhaltene Aktionen, Tastaturbedienung, Fehlermeldungen und Kostenübernahme geprüft. Dabei einen zusätzlichen Fehler gefunden: Bewusst wieder ausgeblendete Verkaufsnummer und Plattform wurden beim Neustart als alte Standardansicht erkannt und erneut eingeblendet. Neue Regression zunächst rot reproduziert, anschließend die bestehende `defaultsVersion` für Verkäufe auf 2 gesetzt und die Umstellung auf einen einmaligen Lauf begrenzt. Alle 28 Diensttests danach erfolgreich; persönliche Reihenfolge und Sortierung bleiben erhalten.

**Abschließender gemeinsamer Prüfumfang:** Sämtliche 5.767 Anwendungstests in 540 Dateien erfolgreich, einschließlich aller Modell-, DOM- und Angular-Dateien. Alle 143 Browserfälle in zwei vollständigen Dateigruppen erfolgreich: 51 für Bestand, Artikelarbeitsfläche, Plattformen, Verkauf und Navigation; 92 für Einkäufe, Übersicht, gemeinsame Seitenbreiten und mobile Anordnung. Hell/Dunkel, Maus/Touch, Tastatur, Zoom, AXE und tatsächliche Speicherung enthalten. Vollständige Formatierung, ESLint, Typprüfung, 544 erfolgreiche Workflowfälle bei sechs bestehenden Überspringungen, Suite-Audit, acht erfolgreiche Orchestratorfälle bei drei bestehenden Überspringungen, 41 PWA-Skriptfälle und Shared-UI-Vertrag ohne Befund. Abschließender Produktionsbau einschließlich Angular-Vorlagen und PWA-Integritätsliste erfolgreich; bestehende Bauwarnungen unverändert. Die automatische Auswahl verlangt wegen zentraler Navigation und Übersetzungen umfassende CI einschließlich Produktions-PWA; Auswahlhash `c15b450aef29b7f3fc4906441dd4d397a195c46dfde765308430e959bd636e42`. Lokale Prüfung unter Windows/Chromium; Linux-CI und echte Produktions-PWA bleiben als Pflichtprüfungen des PR offen. Kein offener wichtiger Befund aus dem Abschlussreview.

**Arbeitsstand:** Gemeinsamer Zweig `juna/table-actions-cleanup` im getrennten Worktree. Bestehende fremde Änderungen im ursprünglichen Checkout erhalten. Keine neuen Abhängigkeiten, Schemaänderungen oder produktiven Datenänderungen. Sammlung abgeschlossen; Branch-Push und gemeinsamer PR sind ausdrücklich beauftragt. Der PR wird ohne Merge und ohne Löschen des Zweigs erstellt.

## 2026-10-22 - Juna - Vinted-Kleiderschrankstatus, Datumsquellen und Reihenfolge korrigieren

**Auftrag und Arbeitszweig:** Nutzer autorisiert ausdrücklich, sämtliche zuvor belegten Probleme zu beheben. Den eigenen Analysezweig in `juna/vinted-wardrobe-state-and-order` umbenannt und auf dem unveränderten Ausgangsstand `726b98351e7f3657367a2613773be5032113fa84` weitergearbeitet. Den parallel offenen fremden PR #460 nicht verändert. Die reale Kleiderschrankansicht und das zugehörige Vinted-Profil ausschließlich gelesen: Der beige Burberry-Schal ist dort ausdrücklich als Entwurf gekennzeichnet, in der bisherigen Flipbase-Ansicht jedoch ohne Status. Der beobachtete aktuelle Detailseitenwert `1 h` enthält keine genaue Artikelzeit; das einzige weitere `created_at` im geprüften Seiten-HTML gehört zum Nutzer und ist keine Artikelquelle.

**Umsetzung:** Cloudimport und lokale Erweiterung speichern belegte Vinted-Flags als `publicationState`; fehlende Merkmale machen einen Artikel nicht aktiv. Tatsächliche Artikel-Erstellung wird als `createdAt` getrennt von bestätigter Veröffentlichung gespeichert. Die isolierte Browserübergabe und beide lokalen Vertragsvalidatoren akzeptieren die neuen Felder. Der bestehende Altersleser versteht die belegte Kurzform `1 h`; bekannte Entwürfe und versteckte Artikel lösen keinen Zusatzabruf aus. Raster, Liste, Detail und gemeinsame Übersicht zeigen den tatsächlichen Status; Erstellalter wird neutral als „erstellt“ bezeichnet. Vinted-Statusfilter verwenden für Seite und Gesamtzahl denselben kanonischen Status. Lokale Arbeitskopien verändern den aktiven Quellartikel nicht.

**Bestand und Datenbank:** Ein normalisierender Vinted-Trigger berechnet die globale Sortierung aus bestätigter Veröffentlichung, echter Erstellung, zulässigem ursprünglichem Altersanker oder einem festen unbekannten Wert am Ende. Bestehende Cursor und ID-Gleichstände bleiben stabil. Die Migration korrigiert bestehende Vinted-Lesekopien, bewahrt Beschreibungen und Quelleninformationen und erhält bekannte Status bei älteren Clients. Entwürfe zählen nicht aktiv und erzeugen keine neuen Statistikmessungen. Der unabhängige Review fand einen zusätzlichen Übergangsfehler: Ein alter eigener Veröffentlichungsauftrag konnte nach `draft → active` erneut erscheinen. Ein dauerhaft erhaltener, nur von der Datenbank geschriebener `publicationDraftObservedAt` sperrt diesen historischen Auftrag auch bei weiteren Folgeimporten. Der RPC und der Trigger beachten dieselbe Grenze. Die neue Migration `20261022091312_vinted_wardrobe_state_order.sql` wurde mit dem offiziellen pg-delta-Kataloggenerator erzeugt; der neue Typblock stammt aus dem offiziellen Supabase-Typgenerator. Historische Migrationen bleiben unverändert.

**Abschlussprüfung:** Kernregressionen für Import, Cache, Erweiterung, Statusparser und Altersanzeige vor der Korrektur erwartungsgemäß rot, anschließend grün. Vollständige betroffene Workerdateien 104/104 und Erweiterungsruntime 123/123 bestanden; Edge-Handler unter Node mit TypeScript-Transformation 24 bestanden, ein vorhandener Deno-spezifischer Fall unter Node ausgelassen. Der vollständige fachliche UI-Auswahlplan mit 23 Node-Dateien/208 Fällen und 69 Angular-Dateien/907 Fällen ist abgedeckt; gemeinsame Verbraucher wie Header, Routen, Shell und Inserateditor sind enthalten. Produktionsbau einschließlich Angular-Vorlagen, abschließende Typprüfung nach der Typgenerierung, gezieltes ESLint, Shared-UI-Prüfung (243 Dateien, keine Befunde), Suite-Audit und 36 Migrations-/Schema-/Rechteprüfungen erfolgreich. Alle 42 bestehenden Browserfälle für Übersicht, Kleiderschrank und Detail auf 320/390/834/1440 Pixeln, Hell/Dunkel, Touch, Tastatur und AXE erfolgreich; Mobil-/Desktopdarstellung zusätzlich visuell gelesen. Tests verwenden künstliche Daten gegen den ruhenden Produktionsbau.

**Migrationsnachweis:** Vollständige lokale SQL-Suite auf PostgreSQL 17.11 mit pgTAP 1.3.4: 127 Dateien und 4.647 Assertions erfolgreich. Die generierte Migration auf der vollständigen Basis aus 244 vorhandenen Migrationen transaktional eingespielt; danach alle 274 betroffenen SQL-Assertions erfolgreich. Zusätzlich 22 erfolgreiche Bestands-/Kontogrenzen-/Rechteprüfungen auf repräsentativen Altdaten. Offizieller Katalog-Diff vom Replay zum Ziel ohne Reständerung; Definition, Owner, Definer-Einstellung, Konfiguration und ACL sämtlicher 550 öffentlicher Funktionen identisch. Rechte aller sechs geänderten bestehenden Funktionen unverändert, neuer Helper nur für `service_role`. Unabhängiger Review bestätigt die exakte Übereinstimmung aller sieben Funktionskörper mit den Schemaquellen; keine offenen konkreten Befunde.

**Tatsächliche CI-Auswahl:** Alle 45 geänderten beziehungsweise neuen Pfade einschließlich generierter Datenbanktypen ergeben `full: true`, 231 Node-, 48 DOM- und 261 Angular-Dateien sowie 59 reguläre und zwei direkt geänderte Browserdateien; PWA und weitere Plattformprüfungen sind ausgewählt. Auswahlhash `ad46dd30c3f7e63ddacc6f98dc235e70b1be8d31478109b98b3422731594261d`. Der lokal vollständig geprüfte fachliche UI-Plan ohne generierten Typblock hat den Hash `7a11edb9a756652b7493b2c175d90ee2e1435351e4b646fdd3303d077b6965e4`. Fachfremde vollständige UI-/PWA-Prüfungen bleiben dem verpflichtenden PR-Lauf vorbehalten; keine vollständige CI-Freigabe behauptet. `origin/master` zum Abschluss erneut abgerufen und unverändert bei `726b98351e7f3657367a2613773be5032113fa84`.

**Grenzen:** Keine realen Vinted-Anzeigen verändert oder veröffentlicht. Ein genaues Erstelldatum wird nur übernommen, wenn die passende Artikelquelle es liefert; gerundete Angaben werden nicht zu exakten Daten umgedeutet. Fehlender historischer Anbieterstatus bleibt bis zum nächsten autorisierten Abgleich unbekannt. Die Sandbox blockierte lokale Chromium-Sockets und Git-Kindprozesse; nach automatischer Freigabe liefen dieselben unveränderten Prüfungen erfolgreich. Ein unveränderter Nachrichtentag-Test trifft in der lokalen Zeitzone Asia/Manila beide Nachrichten am selben Tag; die vollständige unveränderte Nachrichten-Testdatei besteht mit `TZ=UTC` mit 58/58 Fällen und ohne Auslassung. Die entfernte CI-Zeitzone wurde noch nicht gemessen. Kein Test wurde dafür abgeschwächt. Der Docker-basierte Supabase-Stack und CLI-Advisors liefen hier nicht; tatsächliche SQL-Tests, Replay, Katalogvergleich und Typgenerierung erfolgten direkt gegen die isolierte PostgreSQL-Instanz mit offiziellen Supabase-Paketen. Push, PR und Merge folgen der abschließenden Freigaberegel aus `AGENTS.md`.

**Abschlussfreigabe und Integration:** Nutzer bestätigt ausdrücklich PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und Bereinigung des eigenen Zweigs. Vor dem ersten Push aktuellen Hauptstand erneut abgerufen: `5e67d3eb8f7b966712de60c5c96a352d5e2bac17` enthält inzwischen den bereits abgeschlossenen PR #460. Ausschließlich `origin/master` in den eigenen Zweig übernommen; Konflikt im Änderungsprotokoll durch Erhalt sämtlicher Einträge gelöst, generierte Datenbanktypen automatisch zusammengeführt. Die unabhängige Entwurfsansicht und ihre PWA-Testkorrektur bleiben vollständig erhalten. Integrierten Stand erneut geprüft: alle 47 gezielten Angular-Integrationsfälle aus fünf Dateien, Typprüfung und Produktionsbau erfolgreich. Vollständiger SQL-Replay auf den 245 aktuellen Master-Migrationen plus unserer Migration mit 127 Dateien/4.698 Assertions erfolgreich; zusätzlich 22 Bestands-/Rechtefälle und 16 Übergänge zwischen lokalem Entwurf-Löschen und Veröffentlichungsbelegen erfolgreich. Vollständiger offizieller Schema-Diff ohne Restabweichung; alle 552 öffentlichen Funktionen einschließlich Rechten identisch. Unabhängiger Integrationsreview bestätigt unveränderten Featurecode, sämtliche Masterdateien und beide Typenergänzungen. Lokaler Git-Push mangels Anmeldung nicht verfügbar; Veröffentlichung über die authentifizierte GitHub-Verbindung mit Abgleich sämtlicher Blobs und des vollständigen Git-Baums vorbereitet. Vor erfolgreichem Pflichtlauf kein Merge.

## 2026-10-22 - Juna - Vinted-Datum, Kleiderschrankreihenfolge und Entwurfsstatus untersuchen

**Anlass und Stand:** Nutzer hinterfragt die fehlende genaue Erstellungszeit und meldet eine unsortierte Kleiderschrankansicht sowie einen als normale Anzeige dargestellten Entwurf. Aktuellen Hauptzweig `726b98351e7f3657367a2613773be5032113fa84` in einer eigenen Arbeitskopie untersucht; eigener Analysezweig `juna/vinted-wardrobe-diagnosis`. Der parallel offene PR #460 für lokale Entwurfskarten wurde nur gelesen und nicht verändert.

**Belegte Datums- und Sortierbefunde:** Der Cloudimport liest gültige `created_at_ts`/`created_at` aus der Kleiderschrankantwort. Die frühere produktive Untersuchung vom 16. Oktober dokumentiert deren Fehlen und eine gerundete Altersangabe auf der geprüften Artikelseite. Der aktuelle HTML-Leser wertet nur deren `upload_date`-Text aus; eine grundsätzliche Unmöglichkeit genauer Zeiten auf sämtlichen Vinted-Datenwegen ist damit nicht belegt. Unabhängig davon setzen Cloud- und Erweiterungsimport für Anzeigen `sortAt` auf die Abrufzeit. Die serverseitige Seitenauswahl ordnet nach `sort_at desc, id desc`, nicht nach `body.occurredAt`. Direkte Ausführung der vorhandenen Importfunktion mit zwei verschiedenen belegten Erstellungszeiten und einem fehlenden Datum bestätigt denselben Sortierwert für alle drei Artikel; ein Folgeabruf verschiebt alle drei Sortierwerte erneut.

**Belegter Statusbefund:** Beide Importwege schließen lediglich eigene beendete Artikel aus und übernehmen keine Entwurfskennung. Ein synthetischer eigener Artikel mit `is_draft: true`, `is_closed: false` und `is_reserved: false` gelangt durch die unveränderte Cloud-Importfunktion als `publication` und durch die bestehende Übersichtsnormalisierung als `active`; die Entwurfskennung geht verloren. Der unabhängige Lesereview bestätigt denselben Befund für die Browsererweiterung. Das vorhandene `status` wird als Artikelzustand angezeigt und ersetzt keine Veröffentlichungsprüfung. Lokale Flipbase-Entwürfe liegen getrennt in `marketplace_listing_drafts`; eine zusätzliche Arbeitskopie eines bereits veröffentlichten Originals ist fachlich zu unterscheiden.

**Quellen und Grenzen:** Vinteds aktuelle Hilfe bestätigt Entwürfe innerhalb der eigenen Profilliste; die getrennte Pro-API dokumentiert `is_draft`, garantiert aber keinen identischen Vertrag für den verwendeten Webabruf. Kein aktueller echter Anbieteraufruf, keine Zuordnung zum konkret vom Nutzer gemeinten Artikel und kein Produktivstatusnachweis. Die lokalen Nachstellungen prüfen gezielt die Originalfunktionen, keine vollständige Dienstintegration. Keine Produktänderung, Migration, Veröffentlichung, PR-Erstellung oder Anbieteraktion. Für eine Korrektur sind die tatsächlich gelieferten Statusmerkmale, beide Importwege, bestehende Zeit-Trigger, die Seitensortierung und bereits gespeicherte Einträge gemeinsam zu berücksichtigen.

## 2026-10-22 - Juna - Vinted-Entwürfe als Artikelübersicht anzeigen

**Auftrag und Umsetzung:** Entwürfe wie den Kleiderschrank mit Raster-/Listenumschaltung, Hauptfoto beziehungsweise gemeinsamem Platzhalter, Titel, Preis, Artikeldetails, Zielkonto, Erstelldatum und sichtbarer Kennzeichnung „Entwurf“ anzeigen. Einzelne Arbeitskopien lassen sich über die gemeinsame Löschbestätigung entfernen; Fehler erhalten die Liste, Abbruch und Erfolg führen den Tastaturfokus passend zurück. Suche und Nachladen bleiben verfügbar. Vorschaubilder werden pro Seite gemeinsam und ausschließlich für das erste Foto angefordert. Eigener Zweig `juna/vinted-drafts-views` auf `726b9835`.

**Datenbank:** Stabile Reihenfolge nach `created_at desc, id desc` einschließlich Cursor und passendem partiellen Index. Bearbeitung verändert die Position nicht. Gelöschte Arbeitskopien sind nicht mehr lesbar oder bearbeitbar; abgeschlossene Auftragsbelege und Originalfotos bleiben erhalten. Geplante, laufende und ungeklärte Veröffentlichungsaufträge sperren die Löschung. Gemeinsame Workspace-/Entwurfsperre schützt Speichern, Bildänderungen und neue Veröffentlichungsaufträge. Legacy-Cursor werden innerhalb des berechtigten Workspace auf das gespeicherte Erstelldatum aufgelöst; bereits vor der Migration gelesene alte Seiten benötigen einmaliges Neuladen. Neue Migration mit dem offiziellen, von der Supabase-CLI verwendeten pg-delta-Generator erzeugt, auf die betroffenen Objekte begrenzt und einschließlich deklarativer Rechte unabhängig geprüft. Typen aus der echten Ziel-Datenbank generiert; ausschließlich die fünf betroffenen Typenfelder übernommen, historische Migrationen unverändert.

**Review und Regressionen:** Neue Service-/Komponenten-/SQL-Fälle vor Umsetzung rot nachgewiesen. Unabhängiger Review findet zusätzlich eine verzögerte Löschung bei gleichzeitigem Suchwechsel: getrennten Benutzer-/Workspace-Kontext und identische laufende Löschoperation über Suchneuladungen erhalten; gelöschte Kennungen filtern auch verspätete Erstseiten. Beide Antwortreihenfolgen zuerst rot, danach grün. Abschließender UI- und Backendreview ohne offenen Befund. Gridfuß mit vorhandener Card-Füllanordnung ausgerichtet; sichtbarer Tastaturfokus bleibt innerhalb der Kartenbegrenzung.

**Lokale Prüfung:** 15 abschließende Übersichts-, elf Service- und sechs Vorschaubildfälle erfolgreich. Breiter Anwendungslauf: 539 erfolgreiche Dateien und 5.731 erfolgreiche Fälle; einziger Fehlschlag im unveränderten Nachrichtentest durch geerbte Zeitzone `Asia/Manila` eindeutig reproduziert und derselbe Fall mit `TZ=UTC` erfolgreich nachgeprüft, keine fremde Produkt- oder Teständerung. 79 Auswahl-/Registrierungs-/Migrationsprüfungen erfolgreich; anfängliche Sandbox-Unterprozessfehler mit identischem Befehl bei erlaubter Prozessausführung behoben. Finale Typprüfung, gezieltes ESLint, Formatierung, Shared-UI-Prüfung mit 243 Dateien ohne Befund und Produktionsbau samt PWA-Assetverarbeitung erfolgreich. Vorhandene fremde Bauwarnungen unverändert.

**Browserabschluss:** Alle 54 Fälle der drei betroffenen Oberflächendateien erfolgreich, darunter vier neue Übersichtsvarianten bei 1440/390px in Hell/Dunkel mit echter Touchbedienung, Tastatur, AXE, Fokusführung, Löschfehler/-abbruch/-erfolg, Bild-Sammelabruf und Beständigkeit nach Neuladen. Abschließende Raster-/Listenscreenshots visuell geprüft. Ruhende Entwicklungsvorschau ohne Watch/Live-Reload und das zur vorhandenen Playwright-Version passende Chromium 151.0.7922.34 verwendet. Erster Versuch bei gleichzeitigem Bau und breitem Anwendungslauf mit erreichter Speichergrenze und Seitenabsturz; vollständiger Abschlusslauf nach Entlastung mit unveränderten Assertions erfolgreich. Die vorhandenen Auth-/Backend-Fixtures prüfen die Oberfläche mit Testdaten; daraus wird kein echter API- oder Anbieterzugriff abgeleitet. Abschließender Suite-Audit erfolgreich. Aktuelles `origin/master` erneut abgerufen und unverändert bei `726b9835`.

**Migration und Prüfgrenze:** Alle 244 bisherigen Migrationen auf isoliertem PostgreSQL 17 mit offizieller Auth-/Storage-SQL und den benötigten Realtime-Objekten aufgebaut. Neue Migration atomar auf einer frischen Kopie angewendet; sämtliche 127 SQL-Dateien mit 4.637 pgTAP-Prüfungen erfolgreich. Drei zusätzliche echte Konkurrenzfälle mit getrennten authentifizierten Sitzungen und beobachteter Datenbanksperre erfolgreich: wartendes Speichern beziehungsweise Enqueue nach Löschung abgewiesen; wartende Löschung nach Enqueue abgewiesen, Auftrag erhalten. Abschließender offizieller Katalogvergleich aller betroffenen Funktionen, Rechte, Spalten, Indizes und RLS-Regeln ohne verbleibende Abweichung. Dies ersetzt weder den gepinnten Docker-Stack noch einen laufenden Supabase-API-Dienst. Die tatsächliche CI-Auswahl bleibt wegen der Schemaänderung umfassend einschließlich Produktions-PWA; echter API-Integrationslauf und vollständige Browser-/PWA-Auswahl müssen im PR bestehen. Noch kein Push, PR oder Merge.

**Abschlussfreigabe:** Nutzer bestätigt PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausschließlich des eigenen Zweigs. Vor dem ersten Push `origin/master` erneut abgerufen: unverändert bei `726b9835`, der geprüfte Anwendungsstand `6625887` bleibt inhaltlich unverändert. Die vollständige CI-Auswahl einschließlich Supabase-API-Integration und Produktions-PWA muss auf dem endgültigen PR-Stand bestehen. Nach dem Merge den regulären Migrations-/Deploymentlauf und die öffentlich ausgelieferte Version prüfen.

**PR und CI-Nachprüfung:** PR #460 mit exakt dem lokal geprüften Git-Baum veröffentlicht; wegen fehlender lokaler Git-Anmeldung über die authentifizierte GitHub-Verbindung, jeden Blob und den gesamten Baum abgeglichen, Nutzer als Autor und Committer bestätigt. Im ersten CI-Lauf sämtliche Qualitäts-, Modell-, DOM-, Angular-, Datenbank-/API- und regulären Browserprüfungen einschließlich aller 33 geänderten Browserfälle erfolgreich. Ein vorhandener Android-PWA-Handoverfall scheitert; dieselbe Startfehlerseite lokal mit unverändertem Test und beiden echten Produktions-Testbauten reproduziert. Die Aufzeichnung belegt einen manuellen Reload während des noch nicht abgeschlossenen automatischen Dokumentwechsels. Der ursprüngliche Heading-Nachweis galt dem alten Dokument; der Worker-Nachweis allein bestätigte keine gestartete Anwendung.

**Gezielte PWA-Testkorrektur:** Der Test wartet jetzt auf den abgeschlossenen Controllerwechsel oder ein neues Dokument, lehnt ein bereits entladendes Dokument ab und prüft vor dem abschließenden manuellen Reload erneut die sichtbare Anwendung sowie die entfernte Startupfläche. Ein erster Ansatz mit zwingendem automatischem Dokumentwechsel bestand neun von zehn Wiederholungen; die Codeprüfung bestätigte jedoch eine gültige Übernahme desselben Builds ohne Reload. Die endgültige Synchronisation berücksichtigt beide Abläufe. Native Chromium-Ereignisreihenfolge mit sechs Desktop-/Android-Messungen bestätigt; unabhängiger Review des Anwendungspfads ohne später geplanten Reload. Anschließend alle zehn gezielten Wiederholungen erfolgreich, je fünf Desktop und Android; Formatierung und gezieltes ESLint erfolgreich. Keine Timeout-Erhöhung, neue Überspringung oder geänderte fachliche Abschlussassertion; Produktcode unverändert. Vollständige Pflicht-CI muss auf dem ergänzten PR-Stand erneut bestehen.

## 2026-10-22 - Juna - Freigegebenen mobilen Übersichtsfilter abschließen

**Fortsetzung:** Nach unterbrochenen Abschlussaufrufen den tatsächlichen PR-Stand erneut geprüft: PR #456 weiterhin offen, Stand `b8dda137`; CI-Lauf 39624121177 mit sämtlichen Pflichtprüfungen erfolgreich, darunter 23 Angular- und 49 Browserfälle. Die bereits erteilte Freigabe für PR, Merge nach erfolgreichen Prüfungen und Bereinigung des eigenen Zweigs besteht weiter.

**Integration:** Aktuelles `origin/master` auf `0affc7ce` in den eigenen Zweig übernommen. Ausschließlich den Konflikt im Änderungsprotokoll durch Erhalt aller Sitzungseinträge aufgelöst; die mobile Filteranordnung und beide bereits geprüften, gezielten Browserselektor-/Typografiekorrekturen unverändert erhalten. Keine weiteren fachlichen Änderungen. Prüfungen und Veröffentlichung erfolgen auf dem integrierten Stand; vor erfolgreicher abschließender CI und Prüfung der ausgelieferten Version kein Live-Abschluss.

**Erneute lokale Prüfung:** Auf dem integrierten Stand alle 23 betroffenen Angular-Fälle, gezieltes ESLint, Formatierung, Typprüfung, Shared-UI-Prüfung mit 243 Dateien ohne Befund und Produktionsbau einschließlich Angular-Vorlagen erfolgreich. Die bestehenden fremden Bauwarnungen bleiben erhalten. Konkrete Testauswahl unverändert: zwei Angular- und vier vollständige Browserdateien, Auswahlhash `e7b1c45f8c450d0c90d3ebdeede81d3b297540dd745c88cded3f50ae9107ed72`. Unabhängiger Integrationsreview bestätigt vollständig erhaltenen Masterstand sowie unverändertes Dashboard-Template und beide Testkorrekturen. Lokale Browserumgebung weiterhin nicht verfügbar; sämtliche ausgewählten Browserfälle müssen auf dem endgültigen PR-Stand in CI bestehen. Abschließend gleiche Feldbreiten und bündige Außenkanten bei 320/390px in der ausgelieferten App prüfen.

## 2026-10-22 - Juna - Inserat in zwei Schritten erstellen und prüfen

**Freigabe und Umsetzung:** Nutzer bestätigt ausdrücklich „Ja, zwei Schritte“. Eigener Zweig `juna/vinted-listing-review-flow` auf `9ebf2ed2`. Editor und ganze Prüfseite mit sichtbarer Schrittanzeige statt des bisherigen großen Modals. KI-Fotooption steht unter der Galerie; boolescher Wert wird mit dem Entwurf gespeichert, bei alten Entwürfen auf false ergänzt und im endgültigen Auftrag übernommen. Zusätzliche Erlaubnis-Checkbox und Freigabeblock entfernt. Technische Kontofreigabe entsteht erst beim ausdrücklichen Veröffentlichungsauftrag; alle bestehenden Konto-, Workspace-, Revisions- und Wiederholungsschutzprüfungen bleiben erhalten. Terminwahl bleibt beim Zurückwechseln erhalten; laufende Auftragsübermittlung sperrt den Rückweg. Fokus auf Prüfung, Rückkehr und Erfolgsstatus ausdrücklich geführt.

**Datenbank und Review:** Inhaltsvalidator um streng boolesche Fotoangabe ergänzt. Unabhängiger Review findet die strenge Provider-Content-Allowlist: Persistierte Fotoangabe wird beim Snapshot-Aufbau ausdrücklich entfernt und wie bisher im eigenen Auftragsfeld übergeben. Bestehenden SQL-Auftragstest ergänzt, vor Korrektur rot und danach grün. Keine Änderung des Provider-Parsers oder eigener Worker-Rollout nötig. Generierte finale Migra-Migration enthält genau zwei vorhandene Funktionen; fachfremde Unterschiede aus dem ersten vollständigen Schemaabgleich verworfen. Vollständige lokale Datenbankprüfung: 127 Dateien, 4.586 Fälle erfolgreich. Typen neu erzeugt, inhaltlich unverändert. Nachreview korrigiert Erfolgsfokus und einen verlorenen Textumbruch in der Zweispaltenansicht; vorhandene Browsermatrix prüft zusätzlich lange gültige Kontonamen ohne abgeschnittenen Text.

**Prüfstand:** 2.673 Modellfälle und 354 DOM-Fälle erfolgreich. 48 gezielte Editor-/Prüfkomponentenfälle erfolgreich. Alle 58 bestehenden Formular-Browserfälle mit Maus/Touch, 390/1440px, Hell/Dunkel, Tastatur und AXE erfolgreich. Acht gezielte Fokus-Nachprüfungen erfolgreich; Textumbruch-Regressionsfall zunächst rot reproduziert. 41 PWA-Skriptfälle und 61 Auswahl-/Registrierungsfälle erfolgreich. Regulärer Produktionsbau und Root-Typen erfolgreich. Wegen Schema- und Vertragsänderung wählt CI den breiten Umfang. Vollständige Linux-Prüfung mit Node 22.23.3: 2.673 Modellfälle, 354 DOM-Fälle und alle 2.683 Angular-Fälle aus 261 Dateien erfolgreich; beide endgültigen Editor-/Prüfkomponenten zusätzlich mit 48 Fällen erfolgreich. Sämtliche 222 normalen CI-Browserfälle lokal erfolgreich, nach ergänztem lokalem Maildienst nur den gescheiterten Einladungsfall und die noch nicht geprüften Fälle fortgesetzt. Zwei echte Linux-Produktions-Testbauten und alle 36 ausführbaren PWA-Browserfälle unter Chromium, Android-Emulation und WebKit erfolgreich; ein bestehender Desktop-Skip bleibt erhalten, derselbe Lebenszyklusfall läuft auf Android. Worker-Typen sowie 693 Worker-Fälle erfolgreich, acht bestehende Überspringungen unverändert. Abschließende Textumbruchmatrix mit acht erfolgreichen Fällen und zusätzlicher sauberer Desktopansicht belegt. Unabhängiger Nachreview ohne offene wichtige Befunde. Nur Testdaten; keine echte Veröffentlichung, kein Duplikat und keine Änderung bestehender Vinted-Inserate.

**Testumgebung:** Ruhende lokale Vorschauen und eigene Supabase-Instanz, fremde Projekte unberührt. Ersten Produktionsvorschauversuch mit blockiertem lokalen Testzugang als Umgebungsfehler abgegrenzt; Formularprüfung anschließend gegen ruhenden Entwicklungsbau entsprechend dem regulären CI-Browserpfad. Den für eine unabhängige Einladungsprüfung fehlenden lokalen Maildienst ergänzt; derselbe fehlgeschlagene Fall anschließend erfolgreich. Breite Angular-Prüfung nach hängendem Windows-Lauf unter Linux mit Node 22.23.3 sowie zwei CPU-Kernen und 4 GiB Speicher erfolgreich abgeschlossen. Zusätzlichen Linux-Workflowversuch ohne Docker-CLI/Git-Kontext nicht als vollständigen Qualitätsnachweis gewertet; maßgeblich ist der Hostlauf mit diesen Werkzeugen. Dessen einziger zunächst fehlgeschlagener Registrierungstest erwartete LF-Zeilenenden in der lokal geänderten Konfiguration; Arbeitskopie zurückgesetzt und auf die unveränderten Git-Zeilenenden normalisiert, den Fall zunächst gezielt erfolgreich geprüft und anschließend den vollständigen Qualitätslauf erfolgreich abgeschlossen: 542 erfolgreiche Workflowfälle, sechs bestehende Überspringungen sowie Shared-UI-Prüfung ohne Befund. Orchestratorprüfung mit acht Erfolgen und drei bestehenden Überspringungen ebenfalls erfolgreich. Abschließendes Lint, Formatierung, Typprüfung und Produktionsbau erfolgreich; Arbeitskopie enthält keine Änderung an Konfiguration oder generierten Datenbanktypen. Aktuelles origin/master vor Abschluss erneut abgerufen und unverändert bei 9ebf2ed2. Keine Testbedingung gelockert und keine Produktionskonfiguration geändert. Kein Push, PR oder Merge vor Abschluss und neuer Freigabe.

**Abschlussfreigabe:** Nutzer bestätigt PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausschließlich des eigenen Zweigs und Worktrees. Vor dem ersten Push aktuellen Ursprung erneut abgerufen: `origin/master` weiterhin `9ebf2ed2`. Geprüfter Anwendungsstand `2ca9297d` unverändert, Arbeitsverzeichnis zuvor sauber. Der vorhandene lokale Nachweis umfasst die tatsächliche vollständige CI-Auswahl einschließlich Schema-/Auftragsfällen, Formularmatrix und Linux-PWA. Keine zusätzliche Freigabe zur echten Vinted-Veröffentlichung abgeleitet.

## 2026-10-21 - Juna - Veröffentlichungsprüfung als zweiten Schritt vorbereiten

**Auftrag:** KI-Fotoangabe in das Erstellformular verschieben, zusätzliche Erlaubnis-Checkbox und Freigabeblock aus der Prüfung entfernen. Nutzer erwägt eine ganze Prüfseite mit Schrittanzeige statt des großen Modals.

**Untersuchung und Vorschlag:** Aktuellen Stand `9ebf2ed2` und verbindliche Gestaltungsrichtlinie geprüft. Vorschlag „1. Erstellen → 2. Prüfen“ mit ausdrücklicher abschließender Veröffentlichungsaktion und verlustfreier Rückkehr in `docs/design/2026-10-21-vinted-listing-review-flow.md` festgehalten. KI-Fotoangabe ist bislang nur temporär im Prüfdialog; ihre Speicherung und unveränderte Auftragsübernahme gehören zur späteren Umsetzung. Technische Konto-/Rechteprüfungen bleiben erforderlich, zusätzliche UI-Erlaubnis soll entfallen. Entscheidung zur Seitenaufteilung per kurzer Frage offen.

**Zusätzliche Diagnose:** Vorherige Frage zur tababhängigen Aktualisierung anhand des aktuellen PWA-Diensts, Workers und vorhandener Tests erklärt: mehrere saubere Tabs sind erlaubt; offene Eingaben, geöffnete Dialoge und nicht sicher zuordenbare Hintergrundansichten können blockieren. Dieselbe pauschale Meldung deckt mehrere Gründe ab. Der genaue Auslöser beim Nutzer ist nachträglich nicht belegt. Kein Updateverhalten geändert.

**Grenzen:** Eigener Zweig `juna/vinted-listing-review-flow` auf aktuellem `origin/master`; fremder Hauptcheckout und abgeschlossene Zweige unberührt. Bislang ausschließlich Codeanalyse und Dokumentation, keine Produktumsetzung, Veröffentlichung, Datenbankänderung, Push oder PR. Anwendungstests sind für diesen Vorschlag kein Funktionsnachweis.

## 2026-10-21 - Juna - Inseratformular vereinfachen und gemeinsame Galerie verwenden

**Auftrag und Grenze:** Freigegebenen Bedienungsumbau umsetzen; nach versehentlichem Escape die Tests und den unabhängigen Review fortsetzen. Eigener Zweig `juna/vinted-listing-usability` auf `28bd8878`; fremder Hauptcheckout bleibt unberührt. Foto-KI und Relisting bleiben spätere Aufgaben. Keine echte Veröffentlichung, kein Duplikat und keine Änderung eines bestehenden Vinted-Inserats.

**Änderung:** Leere Maske ohne frühe Pflichtfeldwarnungen. Unvollständige Entwürfe bleiben speicherbar; die ausdrückliche Veröffentlichungsprüfung zeigt fehlende Angaben und fokussiert die passende Bedienung. Beanstandete Erklärungstexte entfernt und Speicherbestätigung auf „Entwurf gespeichert“ verkürzt. Fotos stehen links über Titel und Beschreibung; rechts liegen direkte Artikeldetails sowie Preis und Versand. Vorhandene Artikelgalerie einschließlich Bildnamen, Reihenfolge, Hauptbild und Zuschnitt wiederverwendet. Vinted verwendet den gemessenen 2:3-Zuschnitt, andere Verbraucher behalten den bisherigen Standard. Kategoriepanel erhält Inhaltshöhe; Marken werden direkt mit Vorschlägen gesucht. Kategorieabhängige Werte verwenden echte Kennungen und einen begrenzten, kontogebundenen Sitzungscache; die Veröffentlichungsprüfung liest weiterhin frisch.

**Review und Korrekturen:** Unabhängiger Gesamtreview und Nachreview. Zusätzliche Regressionen für ein neues Hauptfoto vor einer umbenannten oder zugeschnittenen gespeicherten Aufnahme zuerst rot, anschließend grün; Ersatzkennungen bleiben für ihr eigenes Foto reserviert. Preis-Zwischenstände verhindern keine andere Feldauswahl. Farben/Materialien sind während des Speicherns gesperrt; nicht mehr angebotene Altwerte bleiben sichtbar. Paketgröße übernimmt das Schema des Detailbereichs auch nach einem erneuten Ladeversuch. Verzögerte Markentreffer bei 1440 × 460 zuerst mit abgeschnittener Panelunterkante bei 602px nachgewiesen, danach automatische Neupositionierung und Bildschirmbegrenzung ergänzt. Feldfehler sind dem AttributePicker zugeordnet. Zielkonto und sichtbare Fotobedienung sind in der Fehlerfokusführung enthalten; versteckte Datei-Inputs ausgeschlossen. Crop-Abbruch fokussiert im unabhängigen Browsernachweis korrekt das ursprüngliche Galeriebild.

**Abschlussprüfung:** Alle 518 ausgewählten Angular-Fälle aus 39 Dateien sowie 21 Modell- und 28 DOM-Fälle erfolgreich. Root-Typprüfung, gezieltes Lint, Shared-UI-Prüfung, Suite-Audit und 69 Auswahl-/Registrierungsprüfungen erfolgreich. Regulärer Produktionsbau mit anschließender PWA-Assetprüfung erfolgreich; vorhandene Bauwarnungen bleiben bestehen. Alle 44 Formular-/Randfall-Browserprüfungen gegen eine ruhende Produktions-Testvorschau erfolgreich, einschließlich 29 Formularfällen, Desktop/Mobil, Hell/Dunkel, Touch, AXE, direkter Feld-/Markenauswahl, Fehlerfokus, verzögerten Vorschlägen und Fehler → Wiederholung → Paketgröße. Die 29 Formularfälle nach dem letzten Nachtrag nochmals gegen den endgültigen Linux-Produktions-Testbau erfolgreich geprüft; die Fotofehlermeldung ist der Galeriegruppe zugänglich zugeordnet und durch Accessible-Description-/AXE-Prüfung abgesichert. Kein Test erzeugt eine echte Anzeige.

**Erweiterte Abnahme:** Die tatsächliche CI-Auswahl umfasst wegen gemeinsamer Auswahlbausteine 24 Browserdateien und den PWA-Lauf. Sämtliche 170 ausgewählten Browserfälle erfolgreich in gezielten Teil- und Nachläufen geprüft; endgültige Auflistung: 131 normale Fälle aus 21 Dateien und 39 Fälle aus drei geänderten Dateien. Zusätzlich beide bestehenden Artikelgaleriefälle mit tatsächlichem Zuschnitt, Bildnamen, Reihenfolge und Speicherung bei 390/1440px erfolgreich. Keine unabhängigen bereits grünen Bereiche pauschal wiederholt. Linux-Prüfung mit Node 22.23.3, Playwright 1.62.1, zwei CPU-Kernen, 4 GiB und vollständigem Quellarchiv einschließlich versteckter Baukonfigurationen: 41 PWA-Skripttests erfolgreich; nach dem Einkaufsnachtrag regulärer Produktionsbau, zwei echte Produktions-Testbauten und alle 36 PWA-Browserfälle unter Chromium, Android-Emulation und WebKit erfolgreich. Ein bestehender bedingter Desktop-Skip für den Touch-Lebenszyklusfall bleibt erhalten; derselbe Fall läuft im Android-Projekt erfolgreich. Eigene isolierte lokale Datenbank nach normalem Docker-Start im Explorer verwendet; fremde Projekte nicht angehalten.

**Im erweiterten Lauf aufgedeckte Ausgangsfehler:** Offene Einkaufspreise zunächst mit Serverfehler reproduziert; derselbe Fehler auf unverändertem `28bd8878` aus einer eigenen Archivkopie bestätigt. Der sichtbare Teilbetrag bekannter Positionspreise wurde als vollständiger Warenbetrag gesendet. Beim Speichern einzelner offener Preise wird jetzt `null` übertragen; sichtbare Zwischensummen und Gesamtpreise bleiben erhalten. Bestehenden Komponententest um die tatsächliche Payload ergänzt, vor der Korrektur rot und danach alle 61 Fälle grün; der zuvor gescheiterte echte lokale Einkaufsfall besteht. Zwei alte Browsererwartungen angepasst: Sperre am vorhandenen `[entry-main-extra]` statt entferntem `app-card` prüfen und zusätzlich die Seitenleiste absichern; vollständige feste Liste der sechs seit `54324867` gültigen Kostenoptionen statt falscher Anzahl zehn prüfen. Vor erneutem Tippen im Wareneingangsfall auf geschlossenen Dialog, bestätigte Buchung und wieder freigegebenes Formular warten; eingegebenen Wert zusätzlich prüfen. Alle zehn Fälle beider Dateien danach erfolgreich. Keine fachliche Prüfung entfernt oder Bedingung abgeschwächt. Unabhängiger Nachreview bestätigt die Korrekturen und gibt den Code frei.

**Abschlussgrenze:** Aktuelles `origin/master` erneut abgerufen und unverändert bei `28bd8878`. Noch kein Push, PR oder Merge; die neue Abschlussfreigabe wird gemäß AGENTS.md separat eingeholt. Foto-KI, Relisting und echte Veröffentlichung sind weiterhin nicht Bestandteil dieses Umbaus.

**Abschlussfreigabe:** Nutzer bestätigt PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausschließlich des eigenen Zweigs und Worktrees. Vor dem ersten Push `origin/master` erneut abgerufen; weiterhin `28bd8878`. Geprüfte Anwendungsdateien unverändert, Arbeitsverzeichnis sauber; die vorhandenen Nachweise und der konkrete Auswahlplan erneut geprüft, Formatierung und Git-Diff vor dem Push nochmals kontrolliert. Keine zusätzliche Freigabe für Foto-KI, Relisting oder eine Vinted-Veröffentlichung abgeleitet.

## 2026-10-21 - Juna - Bedienhinweise zur Inseraterstellung und Vintz-Fotoerkennung untersuchen

**Auftrag:** Frühe Warnungen und beanstandete Hilfstexte entfernen; vorhandene Artikelgalerie wiederverwenden, Fotos vor Texte setzen, Artikeldetails und Preis rechts direkt bedienbar machen, Kategoriepanel verkleinern, Vinted-Markensuche als Vorschlagsfeld, passende Zuschnittvorgabe und kurze Speicherbestätigung. Vor Relisting zuerst diesen Bedienungsumbau behandeln. Zusätzlich den geöffneten Vintz-Editor auf KI-Funktionen, sichtbare Umsetzung und kostengünstige Alternativen untersuchen.

**Arbeitsstand:** Eigener verwalteter Worktree und Zweig `juna/vinted-listing-usability` auf aktuellem `origin/master` (`28bd8878`). Vorhandene fremde Änderungen im Hauptarbeitsverzeichnis unberührt. Noch keine Anwendungscodeänderung, kein Push oder PR. Bestehende Editorvalidierung zeigt fehlende Veröffentlichungsangaben sofort und sperrt zugleich die Prüfaktion; separater Inseratbildeditor weicht von `ProductMediaEditorComponent` ab. Gemeinsamer Kategoriepicker hat eine feste Höhe von 24rem. Reale Markensuche und echte Foto-Produktsuche existieren bereits; der alte `AiAssistantService` simuliert hingegen Dateinamen-Ergebnisse.

**Vintz-Befund:** Aktueller offener Entwurf enthält inzwischen neun Adidas-Fotos. Vorhandene Oberfläche und öffentlich geladene Skripte ausschließlich untersuchend gelesen; keine neuen Uploads, Speicherung, Preisrecherche, Veröffentlichungen oder Nachrichten. Clientcode trennt Fotoangaben (`listing-facts`), Texte (`listing-copy`), Maße und Preisrecherche. Score wird mit festen Browserregeln berechnet. Kein bestimmtes Modell oder interner Prompt nachgewiesen. REA-Analyse eines ausgewählten ausgelieferten Bundles statisch und mit ausdrücklichen Abdeckungsgrenzen; kein vergangener Netzwerkaufruf als aufgezeichnet behauptet. Konkrete Befunde zusätzlich direkt im Text geprüft. Quellen, eigene Promptidee, vorhandene Flipbase-Anbindung und nach offiziellen Quellen aktualisierte Modell-/Kostenkandidaten in `docs/research/2026-10-21-vintz-listing-photo-ai.md` dokumentiert.

**Entwurf und nächste Schritte:** Verhalten und Abnahmekriterien in `docs/superpowers/specs/2026-10-21-vinted-listing-usability-design.md`; konkrete Umsetzung und betroffene Prüfungen in `docs/superpowers/plans/2026-10-21-vinted-listing-usability.md`. Noch keine implementierte oder getestete Bedienänderung behauptet. Die verwendete Planungsanleitung verlangt eine Entwurfsprüfung vor der Implementierung; unabhängigen Builder Check beauftragt. Automatische Foto-KI bleibt vorerst ein gesonderter Vorschlag mit Modellvergleich, keine stillschweigende Erweiterung der bestehenden Betreiberberechtigung.

**Entwurfsprüfung:** Unabhängiger Builder Check ohne wichtige offene Frage; Hinweis zur Messung des Fotoformats vor Umsetzung aufgegriffen. An fünf tatsächlichen Vinted-Katalogbildern 235,19 × 352,78 Pixel beziehungsweise 2:3 gemessen. Entwurf und Plan auf diese belegte Vorgabe angepasst, keine Pflicht für hochgeladene Originaldateien behauptet. Die Dokumente wurden inhaltlich geprüft; Anwendungstests wären für die bislang ausschließliche Analyse und Dokumentation kein Nachweis einer umgesetzten Funktion.

## 2026-10-21 - Juna - Unterbrochenen Abschluss der Vinted-Kategorieprüfung fortsetzen

**Stand und Grenze:** Nach Unterbrechung beim Warten auf PR #455 fortgesetzt. Originalinserat unverändert; interner JAKO-Prüfentwurf 8 mit 18 € und fünf Originalfotos gespeichert, Auftragsverlauf ohne Anbieterauftrag. Kein Merge oder eigentlicher Farb-Fix-Rollout vor grüner Pflichtprüfung.

**CI-Nachtrag:** Worker-/Sitzungsabbilder, Qualität, Modell- und Angular-Prüfungen erfolgreich. Der zusätzliche Browserlauf endet mit 171 erfolgreichen Fällen und einem Fehler in der Verhandlungsprüfung bei 390px/dunkel: späterer Wert 17 statt 7. Neun weitere Fälle dadurch nicht ausgeführt. Logs und Fehlerartefakt untersucht; der betroffene Test gibt unmittelbar nach dem Einheitenwechsel eine Zahl ein, ohne die Umrechnung von 60 Sekunden auf 1 Minute abzuwarten. Die genaue seltene Ereignisfolge ist bislang nicht reproduziert; keine bestätigte Produktursache behauptet. Zehn Wiederholungen unter Windows und fünf mit achtfacher CPU-Drossel sowie zehn gedrosselte Wiederholungen unter Linux/Node 22.23.3/Playwright 1.62.1 erfolgreich. Zusätzliche Zustandsprüfungen sichern jetzt die umgerechnete 1 vor und die eingegebene 7 nach der Eingabe; alle bisherigen Speicher-, Rücklese- und Barrierefreiheitsprüfungen bleiben erhalten. Kein pauschaler Wiederholungslauf und keine gelockerten Bedingungen. Unabhängiger Nachreview ohne Befund; 35 Auswahlprüfungen, gezieltes Lint und Format erfolgreich. Danach alle zehn Fälle der betroffenen Browserdatei gegen den Linux-Entwicklungsserver mit zwei CPU-Kernen und 4 GiB Speicher erfolgreich, einschließlich Desktop/Mobil und Hell/Dunkel. Archivierte Quellkopie enthält die versteckten Baukonfigurationen; keine fremden Projekte angehalten.

## 2026-10-21 - Juna - Übersichtsfilter auf Mobilgeräten über die volle Breite verteilen

**Auftrag:** Die Auswahlfelder für Zeitraum und Plattform unter „Übersicht“ sollen auf Mobilgeräten gemeinsam die verfügbare Breite ausfüllen, ohne freien Rest rechts.

**Befund und Änderung:** Beide Felder hatten unabhängig von der Bildschirmbreite feste Breiten von 160 beziehungsweise 176px. Die produktive Ansicht bei 390px bestätigt diese unterschiedlichen Breiten und verbleibenden Platz rechts. Die Filtergruppe verwendet unterhalb des vorhandenen `sm`-Haltepunkts zwei gleich breite Rasterspalten; die bestehenden Selects füllen ihre Spalte vollständig. Ihre Hosts dürfen bei langen Beschriftungen schrumpfen. Ab `sm` bleiben das bisherige Flexlayout und die bisherigen Feldbreiten erhalten. Anwendungsänderung ausschließlich im Dashboard-Template; vorhandene Shared Components und Filteranbindung weiterverwendet. Separater eigener Zweig `juna/dashboard-mobile-filter-width` auf aktuellem `origin/master`.

**Prüfung:** Beide durch die Testauswahl ermittelten Angular-Dateien vollständig erfolgreich: 23 Fälle für Dashboard und Anwendungsrouten. Gezieltes ESLint, Formatprüfung, Typprüfung, Shared-UI-Prüfung mit 242 Dateien und Produktionsbau einschließlich Angular-Vorlagen erfolgreich; vorhandene fremde Template-, Bundlebudget- und CommonJS-Warnungen bleiben bestehen. Unabhängiger Code-Review ohne Befund. Die bisherige produktive Ansicht zusätzlich bei 320px gelesen: Das zweite Feld steht dort in einer zweiten Zeile. Die neue lokale Fassung wurde noch nicht im Browser abgenommen. Die vier ausgewählten bestehenden Browserdateien benötigen die lokale Supabase-Testumgebung; in dieser Arbeitsumgebung ist Docker nicht verfügbar, deshalb wurden diese Fälle nicht ausgeführt. Keine Prüfung abgeschwächt oder ersetzt.

**Abschlussfreigabe:** Nutzer autorisiert ausdrücklich Branch-Push, PR gegen `master`, Merge-Commit nach allen erfolgreichen Pflichtprüfungen und anschließende Bereinigung ausschließlich des eigenen Zweigs. Vor dem ersten Push `origin/master` erneut abgerufen; unverändert bei `0d606c9e`. Der geprüfte Anwendungsstand ist unverändert. CI muss insbesondere die ausgewählten Browserdateien vollständig prüfen; die lokale Prüflücke bleibt im PR benannt.

**CI-Nachtrag:** PR #456 besteht Qualität und Angular-Prüfungen. Der erste Browserlauf scheitert im bestehenden Typografiefall: Er verlangt pauschal mindestens 13px für sämtliche Überschriften, während die unveränderten Tabellenrollen der Diagrammzusammenfassung und Verkaufstabelle 12px verwenden. Dies ist bereits im Ausgangscommit vorhanden und auf der produktiven Seite für alle acht Tabellenüberschriften bestätigt. Die aktuellen Designregeln legen kein allgemeines 13px-Minimum für Tabellenköpfe fest und erhalten die eigene Dashboard-Tabellenrolle; historische Tabellenmesswerte dokumentieren 12px. Nach unabhängiger Prüfung wird ausschließlich für diese beiden konkreten Tabellenrollen exakt 12px geprüft; für Abschnittsüberschriften und weitere Tabellenköpfe bleibt mindestens 13px bestehen. Alle Elemente, Schreibweise, Laufweite, AXE- und Funktionsprüfungen bleiben erhalten. Keine Anwendungs-Typografie geändert und kein Test aus der Auswahl entfernt oder per `skip` deaktiviert. Formatierung, ESLint, Typprüfung und unveränderte vollständige Dateiauswahl lokal bestätigt; Nachtrag unabhängig geprüft. Erneuter vollständiger Lauf der ausgewählten Browserdateien vor Merge erforderlich.

**Zweiter CI-Befund:** Die drei Designfälle einschließlich Hell/Dunkel und AXE bestehen. Im übrigen Browserlauf bestehen 39 Fälle, bevor eine bestehende Bankzuordnungsprüfung nach dem Neuladen scheitert; sechs nachfolgende Fälle laufen deshalb noch nicht. Die Fehleraufzeichnung zeigt die korrekt geladene Steuerseite mit dem Buttonnamen „Bankabgleich 1“. Der vorhandene exakte Locator „Bankabgleich“ hängt davon ab, ob der Zuordnungszähler bereits geladen ist. Anwendungsseite, Fixture und Test waren gegenüber dem Ausgangscommit unverändert. Nach unabhängiger Bestätigung wird der gemeinsame lokale Testselektor an allen vier Verwendungen eng auf „Bankabgleich“ mit optionaler numerischer Zählung begrenzt. Zuordnung, Buchung, Wiederherstellung, AXE, Timeouts und Testauswahl bleiben unverändert. Keine Bankfunktion geändert. Der gemockte Fall benötigt selbst keine Datenbank; ein zusätzlicher lokaler Diagnoseversuch ist wegen fehlendem Chromium und fehlerhaftem Browserdownload nicht möglich. Der korrigierte vollständige Dateiumfang muss erneut in CI erfolgreich sein.

**Integration:** Während der Prüfungen wurde `master` mit der separaten Feed-Filterkorrektur aus PR #457 aktualisiert. Aktuellen Stand `dd08162d` einschließlich fremdem Änderungsprotokoll in den eigenen Zweig übernommen; Dashboard-Änderung und beide gezielten Testkorrekturen bleiben davon getrennt. Die endgültigen Prüfungen erfolgen auf diesem gemeinsamen Stand.

## 2026-10-21 - Juna - Filterleiste im Vinted Feed beim Zurücksetzen stabil halten

**Auftrag und Ursache:** Beim Eingeben eines Filters springt die Resetaktion in eine zusätzliche Zeile. Die sechs Feldgruppen belegen bereits alle acht Desktop-Rasterspalten; der bedingt angehängte Button erzeugt eine neue Rasterzeile. Im bestehenden Browserfall vor der Korrektur einen Höhensprung von 86 auf 130px nachgewiesen.

**Änderung:** Die vorhandenen Felder behalten ihr eigenes Raster; rechts liegt eine dauerhaft bemessene automatische Aktionsspalte. Ohne aktive Filter bleiben Button und Separator unsichtbar, der native Button ist zusätzlich deaktiviert. Beim Aktivieren und Zurücksetzen ändern sich weder Feldbreiten noch Leistenhöhe. Unter 20rem verfügbarer Containerbreite stehen die Felder einzeln untereinander: Der zunächst bei 320px nachgewiesene Anschnitt eines Preises von 123,45 € entfällt. Größere Ansichten behalten ihre bisherige Feldreihenfolge und Spaltenaufteilung.

**Prüfung:** Bestehende Browsermatrix um die konkrete schmale Regression erweitert; sowohl der ursprüngliche Höhensprung als auch der angeschnittene Preis vor ihrer jeweiligen Korrektur rot reproduziert. Abschließend 13 betroffene Angular-Fälle und sämtliche 12 Browserfälle der laut CI-Auswahl betroffenen Feed-/Administrationsdateien erfolgreich. Enthalten sind 320/390/1440px, Hell/Dunkel, echte Touch- und Tastaturbedienung, mindestens 44px Touchfläche, stabile Resetgeometrie, vollständig sichtbarer Preis, AXE und fehlender horizontaler Überlauf. Zusätzliche gezielte Tabletprüfung bei 834px erfolgreich. ESLint, Typprüfung, Shared-UI-Prüfung, Suite-Audit, Formatierung und regulärer Produktionsbau einschließlich PWA-Assetverarbeitung erfolgreich; vorhandene Angular-/Bundle-/CommonJS-Warnungen bleiben bestehen.

**Testauswahl und Grenze:** Alle 47 unveränderten Auswahl- und Registrierungsprüfungen erfolgreich. Der erste lokale Versuch scheiterte an leerer Ausgabe von Node-Kindprozessen innerhalb der Sandbox; denselben Befehl mit erlaubter Ausführung außerhalb dieser Einschränkung erfolgreich geprüft, keine Testbedingung verändert. Bestehenden Playwright-Ablauf nach Zeitüberschreitung der Browseranbindung mit der passenden Chromium-Version 151.0.7922.34 und Playwright 1.62.1 unter Linux verwendet. Screenshots zeigen ausschließlich lokale Testdaten. Unabhängiger Review einschließlich des schmalen Nachtrags ohne offenen Befund; beide Reviews und die Untersuchung der Testumgebung sind in diesem Sitzungseintrag enthalten. Eigener Zweig `juna/vinted-feed-filter-layout` auf `0d606c9`; alle bis hier dokumentierten Prüfungen fanden vor Push und PR statt.

**Abschlussfreigabe:** Nutzer bestätigt PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausschließlich des eigenen Zweigs. Vor dem ersten Push aktuellen `origin/master` erneut abgerufen; Ausgang unverändert bei `0d606c9`. Die lokalen Prüfungen gelten damit für denselben Anwendungsstand. Die konkrete CI-Auswahl erneut unabhängig geprüft: beide betroffenen Angular-Dateien, alle drei Administrationsfälle und alle neun Feed-Browserfälle sowie Qualitätsprüfung und abschließendes Pflichtprüfungs-Gate.

## 2026-10-20 - Juna - Aktuelle Vinted-Farbauswahl lesen und prüfen

**Auftrag:** Die noch offene Veröffentlichungsprüfung mit den JAKO-Fußballschuhen für 18 € aus Wiehen Store abschließen. Bestehendes Inserat unverändert lassen und keine zweite Anzeige oder Veröffentlichung auslösen. Fortsetzung des freigegebenen Abschlusses und des ausdrücklich beauftragten Browserdienst-Fixes; eigener Zweig auf dem aktuellen `origin/master` nach PR #454.

**Belegte Ursache:** Diagnose-Nachtrag aus PR #454 nach erfolgreichen Pflichtprüfungen und beiden Abbildprüfungen mit `0d606c9e` gemergt. Veröffentlichte Worker-, Broker- und Sitzungsabbilder gezielt mit gesicherter aktiver Compose-Konfiguration ausgerollt; ausschließlich vier Abbildverweise geändert, Profile, IPs, Rechte und Freigaben erhalten. Laufender Kontoabruf zunächst abgewartet, sauberes Workerende und danach laufende korrekte Abbilder/Worker-Gesundheit bestätigt. Erneuter echter Kategorieabruf meldet jetzt eindeutig `step: color`. An der echten angemeldeten Vinted-Maske bestätigt: äußere Checkbox ohne `color-…`-ID, stattdessen `data-testid="filter-grid-option-7"` mit innerem `data-testid="color-7"`. Der alte Leser wartet auf die nicht mehr vorhandene äußere Farb-ID.

**Änderung:** Gemeinsamer Formularleser und Worker-Warte-/Klickpfad unterstützen diese aktuelle Farbstruktur und die bisherige Struktur. Die neue Form wird nur bei genau einer gültigen inneren Farbkennung und Übereinstimmung mit Grid- sowie gegebenenfalls alter ID übernommen. Andere Grids und unsichtbare Optionen bleiben ausgeschlossen; widersprüchliche Kennungen werden abgewiesen. Bestehende Konto-, Kategorie-, Label-, Berechtigungs- und Rückleseprüfungen bleiben erhalten.

**Prüfung:** Kategorieabruf durch den echten isolierten Browsertransport sowie Feldvorbereitung/Rücklesen gegen die beobachtete Grid-Struktur zunächst rot mit `color` beziehungsweise dem bisherigen Selektor-Timeout reproduziert, danach grün. Zusätzliche Fälle für andere/unsichtbare Grids und widersprüchliche Kennungen erfolgreich. Alle 46 betroffenen Formular-Browserfälle, 693 Worker-Tests mit acht bestehenden Überspringungen und 652 ausgewählte Angular-Fälle erfolgreich. Worker-Typen/Bau, gezieltes Lint, Formatierung, Suite-Audit und Vertrags-/Auswahlprüfungen erfolgreich; gemeinsamer Laufzeitbaustein wählt in CI zusätzlich die zugeordneten Marketplace-Browserdateien aus. Unabhängiger Fix-Review ohne offenen Befund.

**Weitere Abschlussprüfungen:** Alle 30 ausgewählten Modellfälle und 50 Vertrags-/Auswahlfälle sowie Root-Typprüfung und Produktionsbau erfolgreich. Alle 47 betroffenen Oberflächenfälle für Inseratentwürfe, Randfälle und Arbeitsflächen erfolgreich, einschließlich schmaler Ansichten, Touch und Hell/Dunkel. Die zusätzliche CI-Auswahl des gemeinsamen Laufzeitbausteins bleibt erhalten.

**Live-Grenze:** In einer eigenen, ungespeicherten internen Prüfmaske Originaltitel, vollständige Beschreibung, 18 € und alle fünf unveränderten Originalfotos vorbereitet. Das ursprüngliche Inserat nur gelesen. Noch keine Veröffentlichung und kein Ersatz; erfolgreiche echte Kategorie-/Veröffentlichungsprüfung erst nach Veröffentlichung und gezieltem Rollout des eigentlichen Farb-Fixes bestätigen.

## 2026-10-20 - Juna - Abbruch der echten Vinted-Kategorieprüfung eingrenzen

**Auftrag und Grenze:** Nach PR #453 den weiterhin fehlgeschlagenen Kategorieabruf beheben und die JAKO-Fußballschuhe für 18 € aus Wiehen Store bis zur internen Veröffentlichungsprüfung prüfen. Das bestehende Inserat darf weder geändert noch dupliziert werden. Fortsetzung der noch offenen Live-Abnahme im zuvor für PR und Merge nach erfolgreichen Pflichtprüfungen freigegebenen Umfang; erforderliche gezielte Dienstkorrektur ist durch den aktuellen Behebungsauftrag umfasst. Keine neue Anzeige, Löschung oder Nachricht.

**Befund:** Erneuter echter Kategorieabruf auf der regulär aktualisierten App 0.365.4 scheitert; Worker und Broker laufen weiter. Die Kategorieelemente der angemeldeten Vinted-Maske entsprechen den erwarteten Kennzeichnungen. Laufende Images und den tatsächlich enthaltenen Kategoriecode ausschließlich lesend geprüft. Der Sitzungsbroker ersetzt jeden Aktionsfehler durch eine unterbrochene Sitzung; Kategorieabrufe bewahren den ursprünglichen Schritt bislang nicht. Die konkrete Ursache im Anbieterformular bleibt deshalb unbewiesen.

**Diagnose-Nachtrag:** Feste Schritte von Autorisierung und Seitenreservierung über Navigation und Formular bis Kategorie und einzelnen Auswahlfeldern über das bestehende isolierte Fehlerprotokoll erhalten. HTTP bewahrt diesen geprüften Schritt vor der Brokerumschreibung. Keine zusätzliche Übernahme beliebiger Fehlermeldungen; die unabhängige Prüfung hat den zunächst geplanten neuen generischen Detail-Sink als zu weitgehend erkannt, er wurde vor Veröffentlichung entfernt. Keine Rohfehler, Artikelinhalte oder Zugangsdaten im neuen Protokollpfad; Berechtigungen, Reservierung, Schließung und Veröffentlichungsgrenzen bleiben erhalten.

**Prüfung:** Neue Regression für ein fehlendes Größenfeld im echten lokalen Browsertransport und HTTP-Regression mit Brokerumschreibung zuerst rot, danach grün. Fehlende Größenoptionen werden als `size` statt pauschalem Sitzungsabbruch erkannt; keine Uploads oder Speicheraktionen. Vollständige lokale Worker-Suite: 693 bestanden, acht bestehende Überspringungen. Worker-Typprüfung und Bau erfolgreich; betroffene Formular-Browserfälle, Lint, Format und Testauswahl zusätzlich geprüft. Kein Nachweis einer bereits behobenen echten Anbieterursache; gezielter Rollout und erneuter Abruf sind der nächste Diagnoseschritt.

## 2026-10-20 - Juna - Vinted-Inseraterstellung vor Relisting abschließen

**Auftrag:** Die drei besprochenen Punkte umsetzen: frühe Eingabegrenzen, verständliche Kontovoraussetzungen und gezielte Prüfung des vorhandenen Veröffentlichungswegs. Bedienumbau und Relisting bleiben nachgelagert. Nutzer wählt die JAKO-j-sfg-Twist-Fußballschuhe für 18 € aus Wiehen Store; nach Bestätigung, dass sie bereits online sind, begrenzt er den echten Artikeltest ausdrücklich auf die interne Vorbereitung bis zur Veröffentlichungsprüfung. Kein Ersatz und keine doppelte Anzeige.

**Abschlussfreigabe:** Nutzer bestätigt PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen einschließlich anschließender Bereinigung ausschließlich des eigenen Zweigs und Worktrees. Vor dem ersten Push aktuellen `origin/master` erneut abgerufen; Ausgang unverändert bei `75b34b2d`. Lokale Prüfungen gelten für denselben Anwendungsstand; die noch offene echte Kategorie-/Veröffentlichungsprüfung bleibt ausdrücklich im PR benannt.

**Änderung:** Neue Fotoauswahl auf 20 begrenzt und Anzahl/Fehler direkt im Editor angezeigt; größere alte Entwürfe bleiben vollständig erhalten. Fehlende Titel-, Beschreibungs-, Preis-, Kategorie- und Fotoangaben sperren die Veröffentlichung, bleiben jedoch als Entwurf speicherbar. Nach ausdrücklichem Kategorieabruf werden aktuelle Textgrenzen und Auswahlfehler am Feld angezeigt; vorhandene Texte werden nicht gekürzt. Kategorieantworten sind an Nutzer, Arbeitsbereich, Kontoidentität, Verbindungsstatus und Kategorie gebunden und werden nach einem Wechsel verworfen. Fehlendes/lokales/pausiertes/abgemeldetes/gesperrtes Konto sowie unbekannte Identität erhalten konkrete Hinweise und einen Link zur Kontoverwaltung. Endgültige Markenprüfung, Serverfreigabe und Kontofreigabe bleiben in der bestehenden Vorschau.

**Prüfungen:** Neue Mindestangaben-/Nullpreisfälle zunächst rot, anschließend grün; weitere rote Regressionen für den Rückwechsel zum Konto und konkrete dynamische Textgrenzen bestätigt und korrigiert. Betroffene Modellauswahl 26 und abschließende Angular-Auswahl 97 Fälle erfolgreich. 14 echte Worker-Browserfälle gegen ausschließlich lokale Anbieterformulare erfolgreich; keine echte Vinted-Veröffentlichung daraus abgeleitet. Regulärer Produktionsbau, Typprüfung, gezieltes ESLint, Formatierung, Suite-Audit mit 539 Dateien, gemeinsame UI-Architekturprüfung und 47 Auswahl-/Registrierungsfälle bestanden. Erster Editor-Browserlauf 25 erfolgreich und ein neuer Fall wegen falscher Buttonbeschriftung fehlgeschlagen; Ursache anhand Aufzeichnung geklärt und korrigiert. Anschließend alle 47 betroffenen Vinted-Browserfälle erfolgreich, einschließlich Desktop/Touch und Hell/Dunkel. Zusätzlich zwei bestehende Listing-Studio-Fälle gegen eine eigene lokale Supabase-Instanz erfolgreich; keine fremden Projekte angehalten.

**Barrierefreiheit und Review:** Zusätzliche AXE-Prüfung des Foto-Fehlerzustands auf 390px fand eine unzulässige Alert-Rolle direkt an einer Liste. Rolle auf den umgebenden Container verschoben, normale Listenstruktur erhalten; derselbe Fall anschließend ohne AXE-Befund. Nach der Korrektur Produktionsbau und 97 Angular-Fälle einschließlich beider tatsächlichen Verbraucher sowie zwei Listing-Studio-Browserfälle erneut erfolgreich. Abschließender kompletter Entwurfsbrowserlauf mit allen 26 Fällen ebenfalls erfolgreich. Unabhängige Codeprüfung einschließlich des Nachtrags ohne relevanten Befund. Keine neue Abhängigkeit oder Datenbankänderung; eigene Testserver und die isolierte Datenbank nach den Prüfungen beendet. Noch kein Push, PR, Merge oder Deployment.

**Echter Prüfartikel:** In der bestehenden produktiven Oberfläche Titel, 18 €, fünf Fotos, Größe 36, Jako, Neu mit Etikett und Beschreibung gelesen. Bestehender lesender Bearbeitungsabruf liefert nur Teilangaben und lässt Fotos/weitere Merkmale unverändert. Bearbeitung ohne Eingaben geschlossen. Keine fehlende Anbieterkennung erfunden, kein Inserat gespeichert, veröffentlicht oder entfernt. Download der sichtbaren Fotos über die Browsersteuerung endete mit Zeitüberschreitung; kein vollständiger Bildexport behauptet. Die neue lokale Oberfläche und der bisher produktiv ausgelieferte Stand bleiben getrennte Nachweise.

**Offene Live-Abnahme:** Schuhangaben ausschließlich in einer ungespeicherten neuen Prüfmaske vorbereitet. Die ursprüngliche Kategoriekennung ist unbekannt; die gewählte Fußballschuhkategorie ist eine Prüfkategorie. Zwei ausdrücklich ausgelöste Kategorieabrufe scheiterten; der produktive Worker meldet jeweils eine unterbrochene Browsersitzung. Der bestehende Broker verdeckt dabei die ursprüngliche Fehlerursache, deshalb keine genauere Ursache behauptet. Öffentliche Dienstprüfung meldet weiterhin Schreibmodus und aktivierte Inseratveröffentlichung, reguläre Kontoabrufe waren erfolgreich. Ausschließlich lesende Betriebsdiagnose; keine Freigaben, Konten oder Produktionseinstellungen verändert. Die echte erfolgreiche Kategorie- und Veröffentlichungsprüfung bleibt offen. Der Ersatz des bestehenden Inserats folgt gemäß Nutzerentscheidung erst beim Relisting.

## 2026-10-20 - Juna - Vinted-Browserdienst gegen geschlossene Eingabekanäle absichern

**Auftrag:** Nach bestätigter Wiederherstellung den zugrunde liegenden Automatik-Ausfall dauerhaft beheben.

**Abschlussfreigabe:** Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und anschließende gezielte Aktualisierung des Browserdienstes ausdrücklich freigegeben. Eigene Branch- und Worktree-Bereinigung nach bestätigtem Abschluss eingeschlossen; keine zusätzliche Freigabe bestehender Kontopausen oder Schreibaktionen.

**Ursache und Änderung:** Unbehandelte `stdin`-Fehler aus Docker-Unterprozessen konnten den gesamten privaten Browserbroker beenden. Beide Befehlswege fangen den Fehler jetzt ab und weisen ausschließlich die betroffene Operation mit einer festen, bereinigten Meldung zurück. Auch ein erfolgreicher Unterprozess darf einen Eingabefehler nicht als Erfolg verdecken; der Prozessabschluss wird weiterhin abgewartet. Der Broker erhält zusätzlich dieselbe Neustartregel `unless-stopped` wie der Worker. Bestehende Runtimeberechtigung, Browser-Recovery und Kontopausen bleiben unverändert.

**Prüfung:** Beide neuen Fehlerfälle vor der Korrektur mit unbehandeltem `EPIPE` rot reproduziert. Danach 28 Launcher-Fälle erfolgreich, einschließlich erfolgreicher weiterer Aufrufe im selben Launcher. Vollständige Worker-Suite unter Windows: 692 bestanden, acht bestehende Überspringungen. Unter Linux mit der im Produktionsimage verwendeten Node-Version 22.23.2: 699 bestanden, eine bestehende Überspringung. Worker-Typprüfung, Worker-Bau, gezieltes ESLint, Formatierung und aufgelöste Compose-Konfiguration erfolgreich. Alle 35 Testauswahlprüfungen bestanden; keine neue Testdatei oder veränderte Registrierung. Die Deployment-Konfiguration löst weiterhin die breite Pflicht-CI aus; deren Prüfungen werden nicht abgeschwächt. Unabhängiger Review von Fehlerbehandlung, Prozessabschluss, Wiederanlauf, Testisolation und Datenschutz ohne relevanten Befund; Reviewsitzung hier mit dokumentiert.

**Veröffentlichungsgrenze:** Eigener Zweig `juna/vinted-broker-pipe-recovery` auf aktuellem `origin/master` (`a538c505`). Keine Produktionsimages oder Betriebseinstellungen für diesen Fix geändert; die zuvor freigegebene Wiederherstellung läuft weiter. Lokale Docker-Engine ist beendet, deshalb tatsächlicher Imagebau und Broker-/Browser-Smoke noch offen; Linux-Worker-Prüfungen ersetzen diesen Nachweis nicht. Nach grünem PR gezielt den Broker aus dem geprüften Stand veröffentlichen und mit gesicherter aktiver Compose-Konfiguration aktualisieren. Worker- und Sitzungsabbild, Profile, IP-Zuordnungen und Freigaben erhalten; anschließend tatsächliches Abbild, Neustartregel, Dienststatus und regulären Abruf bestätigen. Diagnose und Rolloutgrenzen in `docs/audit/2026-10-20-vinted-automation-outage.md` dokumentiert. Bestehende fremde Änderungen im Hauptarbeitsverzeichnis unberührt.

## 2026-10-20 - Juna - Langsamen App-Download nicht als fehlgeschlagene Updateprüfung melden

**Auftrag und Fortsetzung:** Nach der Veröffentlichung von PR #450 meldet der Nutzer beim erneuten Android-Appstart erneut eine durchsichtige Prüfungsansicht und einen wirkungslosen Wiederholungshinweis; anschließend wird das Update doch angeboten und übernommen. Nachbesserung desselben bereits für PR, Merge nach erfolgreichen Pflichtprüfungen und eigene Branchbereinigung freigegebenen Updateablaufs, kein zusätzlicher Funktionsumfang. Öffentliche Version 0.365.1, Commit `513dd60a`, Worker und Inventar nachweislich konsistent; die am Handy noch geladene Version ist unbekannt. Ein älteres zwischengespeichertes Dokument erklärt die Transparenz plausibel, ist am Gerät aber nicht belegt. Die bereits veröffentlichte Hintergrundkorrektur bleibt unverändert.

**Belegte Ursache:** Zwei echte Produktionsbauten mit einer gezielt um zwölf Sekunden verzögerten Schriftdatei nachgestellt. `registration.update()` ist nach 72ms fertig, während der Worker weiter installiert. Die zusätzliche Installationswartezeit im Prüfservice löst trotzdem nach etwa 8,4 Sekunden einen falschen Fehler mit „Erneut prüfen“ aus; nach etwa 14,9 Sekunden wird dieselbe gültige Aktualisierung angeboten. Der Installationsdownload umfasst im nachgestellten Bau 272 Dateien mit rund 8,15MiB. Kein Nachweis der exakten Netzlaufzeit am Nutzergerät.

**Änderung:** Nur die abgeschlossene Netzwerkprüfung beenden, statt zusätzlich auf den vollständigen Dateidownload zu warten. Die bestehenden `updatefound`-/`statechange`-Listener erkennen die fertige Version weiterhin und zeigen erst dann die verpflichtende Updatefläche. Der vorhandene Acht-Sekunden-Schutz gegen eine tatsächlich hängende Prüfung, Eingabeschutz, Aktivierung und Cacheprüfung bleiben erhalten. Keine Cachebereinigung, keine Verlängerung bestehender Zeitlimits. Geräteabnahme um den Hintergrunddownload ergänzt.

**Prüfung:** Neuer Komponentenfall zunächst rot, danach 35 Angular-Fälle in Update-/App-Rendering erfolgreich. Neuer Fall im echten Android-Produktionsbau ebenfalls zuerst rot wegen der zwischenzeitlich eingeblendeten Fehlerregion. Nach Korrektur vollständige Chromium-/Android-PWA-Projekte mit zwei frischen Produktionsbauten unter Linux/Node 22.23.3 und Playwright 1.62.1 erfolgreich: 23 bestanden, eine bestehende ausschließlich mobile Lebenszyklusprüfung auf Desktop übersprungen. Enthalten sind bedienbare Inhalte während der verzögerten Installation, ausbleibender falscher Fehler, deckende fertige Updatefläche und expliziter Versionswechsel. ESLint, Typen, Format, Suite-Audit und tatsächliche Auswahl des neuen Falls für beide Browserprojekte erfolgreich. Die zentrale App-Abhängigkeit wählt weiterhin den umfassenden CI-Lauf einschließlich Produktions-PWA aus. WebKit lokal wegen fehlender Systembibliotheken nicht geprüft; erfolgreiche Pflicht-CI bleibt vor dem Merge erforderlich. Unabhängiger statischer Nachreview ohne relevanten Befund; die Reviewsitzung ist in diesem Eintrag mit dokumentiert.

## 2026-10-20 - Juna - Laufende App-Aktualisierung bei erneuter Berührung erhalten

**Abschlussfreigabe:** Nutzer autorisiert den PR mit beiden Updatekorrekturen, den Merge nach erfolgreichen Pflichtprüfungen sowie anschließende Veröffentlichungskontrolle und Bereinigung des eigenen Branches. Aktueller Hauptzweig vor Push weiterhin `f9d83a70`; keine Integration fremder Änderungen erforderlich.

**Auftrag und Befund:** Nutzer meldet, dass die Android-Aktualisierung erst nach mehreren Versuchen angekommen ist. Die genaue Ursache am Gerät bleibt unbekannt. Die Aktivierungsbarriere widerruft jedoch nachweislich auch harmlose Interaktionen auf der Updatefläche. Komponententest mit erneutem Tippen zuerst rot; der echte Android-Browser ignoriert Berührungen direkt auf dem gesperrten Button, bricht aber beim zusätzlichen Tippen auf den Überschriftentext während der laufenden Prüfung den Versionswechsel ab. Diesen zweiten Fall mit echten Touch-Ereignissen, bestätigter Vorbereitung und eingefrorener Hintergrundansicht gegen den bisherigen Produktionsbau rot reproduziert.

**Änderung:** Pointer-, Klick- und Tastaturereignisse innerhalb der Updatefläche weiterhin vollständig unterbinden, ohne die Aktualisierung allein deshalb zu widerrufen. `beforeinput`, `submit`, Ereignisse außerhalb der Updatefläche, Kontextwechsel und die abschließende Eingabeprüfung bleiben unverändert geschützt. Vorhandenen Lebenszyklus-Browserfall erweitert, keine Wartezeit erhöht oder Prüfung abgeschwächt.

**Prüfung und Review:** 34 Angular-Fälle in Update-/App-Rendering, ESLint, Typen, Format und Suite-Audit erfolgreich. Zwei neue echte Produktionsbauten unter Linux/Node 22.23.3 und Playwright 1.62.1 erstellt; der zuvor rote Android-Fall besteht einschließlich erhaltenen ungespeicherten Hintergrundeingaben. Unabhängiger statischer Nachreview ohne relevanten Befund, ebenfalls durch diesen Sitzungseintrag dokumentiert. Die lokal nicht ausführbare WebKit-Prüfung und der umfassende ausgewählte CI-Lauf bleiben vor der Veröffentlichung erforderlich; noch kein Push oder PR.

**Gesamtlauf und Nachprüfung:** Chromium-/Android-PWA-Lauf mit 20 bestandenen Fällen und einer bestehenden Desktop-Auslassung; `legacy network-worker handover does not repeatedly offer the already loaded mobile build` scheitert auf Android einmal am 15-Sekunden-Limit für den Workerwechsel. Dieser Fall enthält keine Berührung der Updatefläche und nimmt den neuen Ausnahmezweig nicht. Ohne Änderung oder Zeitverlängerung gezielt isoliert erfolgreich; anschließend die vollständige Android-Gruppe mit allen drei Fällen in ursprünglicher Reihenfolge ebenfalls erfolgreich. Ursache des einzelnen Zeitüberschreiters nicht abschließend nachgewiesen, keinen unveränderten vollständigen Lauf wiederholt oder pauschalen Gesamterfolg behauptet. Vor Veröffentlichung weiterhin erfolgreiche Pflicht-CI erforderlich.

## 2026-10-20 - Juna - Deckenden Hintergrund für die App-Aktualisierung wiederherstellen

**Auftrag und Ursache:** Die verpflichtende Updatefläche scheint über dem Kleiderschrank durch. Ihre Klasse `bg-fb-bg-app` ist nicht als Tailwind-Farbe definiert; der vorhandene Anwendungshintergrund heißt `bg-fb-bg`. Genau diese Klasse korrigiert, ohne Updateablauf, Eingabeschutz oder Dialogverhalten zu ändern. Der zusätzlich gemeldete mobile Hinweis oben rechts mit „Flipbase … ist bereit“ entspricht der früheren, bereits durch die Vollbildanzeige ersetzten Vorlage; ein noch geöffneter älterer App-Bau ist damit die naheliegende Erklärung, am echten Nutzergerät aber nicht nachgewiesen.

**Prüfung:** Bestehenden Produktions-PWA-Fall mit zwei echten Bauten um deckende Startflächenfarbe in Hell/Dunkel und Abdeckung der Bildschirmecken erweitert. Android-Fall zuerst gezielt rot: erwartet `rgb(241, 241, 241)`, tatsächlich `rgba(0, 0, 0, 0)`. Danach beide Produktionsbauten und die vollständigen Chromium-/Android-PWA-Projekte unter Linux mit Node 22.23.3 und Playwright 1.62.1 erfolgreich: 21 Fälle bestanden, ein bestehender ausschließlich für Android vorgesehener Lebenszyklusfall auf Desktop übersprungen. Enthalten sind Touch, Fokusfalle, AXE, offene Eingaben, ältere Worker und eingefrorene Hintergrundansichten. Zusätzlich 41 PWA-Skriptfälle, 33 Angular-Fälle in Update-/App-Rendering und 15 Node-/DOM-Fälle des PWA-Dienstes sowie ESLint, Typprüfung, Format und Suite-Audit erfolgreich. Unabhängiger statischer Review der Änderung ohne Befund; dieser Eintrag umfasst auch die Reviewsitzung.

**Sichtprüfung und Grenzen:** Den betroffenen Updatefall zur dauerhaften Screenshotaufzeichnung zusätzlich auf Desktop und Android ausgeführt, beide erfolgreich; heller Smartphone- und dunkler Desktop-Screenshot visuell geprüft, ohne durchscheinenden Inhalt oder zusätzliches Eckfenster. Browser-Plugin nicht verfügbar, deshalb vorhandenen Playwright-Ablauf genutzt. WebKit lokal wegen fehlender Systembibliotheken nicht ausführbar; keine Prüfungen umgangen oder abgeschwächt. Die automatische Auswahl verlangt wegen der zentralen App-Abhängigkeit zusätzlich den umfassenden CI-Lauf; lokal gezielt den betroffenen PWA-Bereich geprüft. Keine Aussage über eine bereits erfolgte Veröffentlichung oder native iPhone-/iPad-Abnahme.

## 2026-10-20 - Juna - Vinted-Anpassungen für PR und Veröffentlichung abschließen

**Freigabe:** Nutzer autorisiert Branch-Push, PR gegen `master`, Merge-Commit nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung des eigenen Branches. `origin/master` vor dem Abschluss unverändert auf `624a8eba`; kein Integrationskonflikt.

**Reviewkorrektur:** Unabhängiger Review bestätigt abgeschnittene mobile Kennzahlen bei gepushten Artikeln mit Änderungswerten. Bestehenden Browserfall um Zustand, Push-Badge, 1.234 Aufrufe (+12), 123 Favoriten (+3) und echte Geometrie erweitert; zuerst wegen Zustandbreite 0px fehlgeschlagen. Metadatenzeile darf umbrechen, Kennzahlen bleiben innerhalb der Karte. Nachreview bei 320px bestätigt 49px Zustandsbreite, vollständig sichtbare Änderungen und kompakte 126px Kartenhöhe; keine weiteren Befunde.

**Prüfung und Übergabe:** Nach der Korrektur gesamte betroffene Angular-Auswahl mit 96 Fällen in fünf Dateien, vier Node-Routenfälle und 21 Browserfälle erfolgreich. Typen, gezieltes ESLint, Format und Produktionsbau ebenfalls erfolgreich; die CI-Auswahl für den Gesamtbranch ist vor Push dokumentiert. PR-Beschreibung vorbereitet. Git-Zugriff funktioniert, GitHub-API wird vom Cloud-Proxy mit HTTP 403 blockiert. Fehlende Netzwerkfreigaben für `api.github.com` und die öffentliche App im Cloud-Konfigurationsentwurf ergänzt; Übernahme ist vor PR-Erstellung, CI-Abfrage und Merge erforderlich. Keine Produktivänderung oder Umgehung der Pflichtprüfungen.

## 2026-10-20 - Juna - Kleiderschrank zwischen Raster und Liste umschalten

**Auftrag:** Zwei Buttons als gemeinsamen Umschalter für das bestehende Raster und eine Listenansicht ergänzen.

**Änderung:** Vorhandene Segment-Buttons mit Raster-/Listensymbol, zugänglichen Beschriftungen und aktivem Zustand in der Kleiderschrank-Kopfzeile verwenden. Raster bleibt der Anfangszustand. Die Liste zeigt kleine Vorschaubilder, Titel, Marke/Größe, Preis, Tagesangabe, Zustand, Pushstatus und dieselben Kennzahlen mit Änderungsanzeigen. Gemeinsame Artikellinks, Nachladen, Auswahl und Transferaktion bleiben an den vorhandenen Daten angebunden. Die Ansichtswahl ist lokal für die geöffnete Komponente; keine zusätzliche Speicherung oder Backendänderung.

**Prüfung:** Bestehenden Mosaik-/Zeit-Badge-Browserfall um Wechsel per Maus und Tastatur, aktiven Zustand, unveränderte Artikelanzahl, Listenmaße, Rückwechsel, AXE und Öffnen eines Artikels aus der Liste erweitert. Zunächst wegen fehlendem Umschalter erwartungsgemäß fehlgeschlagen, danach erfolgreich. Vollständige betroffene Browserauswahl mit 21 Fällen in `vinted-listing-edge-cases.spec.ts` und `vinted-workspace-ui.spec.ts` bestanden, einschließlich Umschalten und AXE bei 320/390/834/1440px in Hell/Dunkel; Desktop- und Smartphone-Screenshots visuell geprüft. Zusätzlich 80 Angular-Fälle in vier betroffenen Dateien, ESLint, Format, Typprüfung und Produktionsbau erfolgreich. Suite-Audit mit 538 Dateien und Shared-UI-Prüfung mit 242 Dateien ohne Befund; bestehende Buildwarnungen bleiben bestehen. Kein neuer pauschaler Browserfall, keine neue Abhängigkeit, keine Veröffentlichung.

## 2026-10-20 - Juna - Marken im Kleiderschrank neben der Tagesangabe anzeigen

**Auftrag:** Marke und Größe links, Tagesangabe rechts in derselben Zeile platzieren, damit Karten mit Markenangaben keine zusätzliche Höhe erhalten.

**Änderung:** Marke und Größe stehen links in derselben Zeile wie das rechtsbündige Alters-Badge und werden bei langen Namen gekürzt. Auch ohne Marke bleibt die Tagesangabe rechts ausgerichtet. Die vollständige Angabe bleibt über den Tooltip verfügbar. Nur das vorhandene Kleiderschrank-Template angepasst; vorherige Änderung der Aktualisierungszeit auf demselben eigenen Zweig erhalten.

**Befund und Prüfung:** Vorherige Browsermessung mit und ohne Marke sowie mit alleiniger Größe bestätigt rund 20px Höhenunterschied bei 1440/834/390/320px in Hell/Dunkel. Nachher acht Browserkombinationen erfolgreich: Karten mit/ohne Marke, mit alleiniger Größe und mit langem Markennamen sind jeweils gleich hoch, Marke und Tagesangabe liegen horizontal nebeneinander; keine Überläufe oder JavaScript-Ausnahmen. Bestehende Browserdateien `vinted-listing-edge-cases.spec.ts` und `vinted-workspace-ui.spec.ts` vollständig erfolgreich: 21 Fälle einschließlich AXE, Navigation und Galerie. 80 betroffene Angular-Fälle in vier Dateien, gezieltes ESLint, Formatprüfung, Typprüfung und Produktionsbau ebenfalls erfolgreich. Bestehende Buildwarnungen bleiben erhalten. Die endgültige Reihenfolge Marke links/Tage rechts zusätzlich mit erneutem Produktionsbau, ESLint, Formatprüfung und acht Browserkombinationen geprüft; rechtsbündige Tagesangabe auch bei fehlender Marke bestätigt. Screenshots und Messskript liegen außerhalb des Repositorys; kein neuer pauschaler Browsertest hinzugefügt. Nur lokale Testdaten, keine Veröffentlichung.

## 2026-10-20 - Juna - Aktualisierungszeit auf der Vinted-Seite nach Kalendertag anzeigen

**Auftrag:** In der Vinted-Kopfzeile bei einer Aktualisierung von heute nur die Uhrzeit, von gestern „Gestern“ und bei älteren Aktualisierungen das Datum anzeigen.

**Änderung:** Bestehenden Zeitpunkt der letzten Synchronisierung nach lokalem Kalendertag darstellen: `13:36 Uhr`, `Gestern • 13:36 Uhr` oder `18.10.2026 • 13:36 Uhr`. Die vorhandene gemeinsame Vinted-Uhr aktualisiert die Tageszuordnung auch bei offen gebliebener Seite. Vollständiger Zeitstempel bleibt im Tooltip und im semantischen `datetime`-Attribut erhalten. Umsetzung auf `juna/vinted-sync-time-display`.

**Prüfung:** Neue Fälle zunächst mit sieben erwarteten Fehlern gegen die alte Anzeige ausgeführt, danach alle 16 Komponentenfälle erfolgreich. Betroffene Angular-Komponenten und Routen: 90 Fälle in vier Dateien erfolgreich; zusätzlich vier Einstellungsroutenfälle. Lokale Kalendertage einschließlich Mitternacht, Monats-/Jahreswechsel und Zeitumstellung unter `Europe/Berlin` geprüft. ESLint, Typprüfung und Produktionsbau erfolgreich; bestehende Angular-/Bundlebudget-/CommonJS-Warnungen bleiben bestehen. Zusätzlicher Playwright-Nachweis mit kontrollierten lokalen Testdaten: zwölf Zeitangaben auf Desktop (1440px) und Smartphone mit Touch (390px), jeweils Hell/Dunkel und Europe/Berlin, ohne Konsolenfehler oder horizontalen Überlauf. Screenshots außerhalb des Repositorys visuell geprüft; Browser-Plugin nicht verfügbar. Zusätzlich beide bestehenden Browserdateien `marketplace-accounts.spec.ts` und `vinted-workspace-ui.spec.ts` vollständig ausgeführt: 37 Fälle erfolgreich, einschließlich 1440/390/320px, Hell/Dunkel, Kontoaktualisierung, Postfach und Bedienung. Die übrige Vinted-Regressionssuite wurde lokal nicht ausgeführt. Keine produktiven Daten oder entfernten Dienste geändert, noch kein Push oder PR.

## 2026-10-19 - Juna - Browser-Speicherabbruch des Vinted-Feeds wiederherstellen und absichern

**Auftrag:** Während des freigegebenen PR-Abschlusses den erneut veralteten Feedstatus nach Hinzufügen von Blauer untersuchen und den Abruf wiederherstellen.

**Abschluss von PR #447:** Nach erfolgreichen Pflichtprüfungen mit `4adcc781` gemergt, Produktionslauf `39306033344` einschließlich öffentlicher Kontrolle erfolgreich. Laufender Browserleser per Prüfsumme mit getestetem Abbild verglichen. Eigenen Remote-/lokalen Zweig gelöscht und Worktree archiviert; fremde Zweige erhalten. Gegen zwischenzeitlichen aktuellen origin/master ausschließlich additiven Protokollkonflikt mit beiden Seiten aufgelöst und erneut erfolgreiche CI abgewartet.

**Befund und Sofortmaßnahme:** Kernel bestätigt um 20:49:01 Uhr einen Chrome-Renderer-OOM an 2 GiB; Blauer war zuvor bereits erfolgreich. Node blieb in Browserbereinigung hängen, Betriebsmeldung seit 20:48 Uhr veraltet. Vorheriger Release #446 ersetzte den Container, verwaiste Profilsperren verhinderten danach den Start. Nur Feedcontainer gestoppt, fehlende Browserprozesse und freien Port geprüft, genau drei verwaiste Sperr-Symlinks entfernt, Profil/Cookies erhalten. Wiederanlauf 20:56:28 Uhr und anschließend alle vier Marken erfolgreich. Auch nach #447-Deployment aktuelle Betriebsmeldungen und Fehlerzähler null; zweiter Fehler damit nicht als erneut gescheiterte Sitzungserneuerung eingeordnet.

**Freigabe und Korrektur:** Die bereits erteilte Nutzerfreigabe für PR und Merge nach erfolgreichen Tests gilt weiterhin für die zusätzliche Korrektur desselben Feed-Ausfalls. Separater eigener Zweig `juna/vinted-feed-browser-recovery` auf veröffentlichtem origin/master. Tabwechsel vor Abruf 16, gemeinsame begrenzte Bereinigung einschließlich äußerer Verbindung, Erholung nur bei echtem Stillstand/unbrauchbarem Browser und sichere Startbereinigung verwaister Sperren. Bestehende Fortschrittsbewertung für Anbieterfehler, leere Durchläufe und Pausen erhalten. Gleichzeitigen Shutdown und späte Verbindungsantworten zusätzlich rot/grün abgesichert. Keine Speichererhöhung, Filter-/Takt-/Schema-/Abhängigkeitsänderung; fremden Entwurf ausschließlich gelesen.

**Prüfung und Grenzen:** Linux 358 Fälle erfolgreich; Windows 351 erfolgreich und sieben echte Linux-Symlinkfälle vorgesehen übersprungen. Typen, Dienstbau, Registrierung und echter Chrome-Smoke mit 40 zusätzlichen Abrufen, drei Tabs, Sitzungscookies und tatsächlichem verwaistem Profil erfolgreich. Unabhängige Reviews ohne offene wichtige Befunde. Kein Nachweis mehrstündiger realer Speicherstabilität; neue Korrektur noch nicht veröffentlicht. Lokale Testpakete nach Junction-Nebenwirkung der alten Archivierung exakt aus unveränderter Sperrdatei wiederhergestellt; neue Arbeitskopie besitzt eigene Pakete. Ausführlicher Bericht: `docs/audit/2026-10-19-vinted-feed-browser-recovery.md`.

## 2026-10-19 - Juna - Vinted-Feed nach blockierter Sitzungserneuerung wiederherstellen

**Integration vor dem Merge:** Während PR #447 geprüft wurde, wurde PR #446 in `origin/master` übernommen (`df6ea689`). Aktuellen Hauptzweig integriert und ausschließlich den additiven Protokollkonflikt unter Erhalt beider vollständigen Seiten aufgelöst. Der Feedcode und seine Abhängigkeiten unterscheiden sich durch diese Integration nicht; tatsächliche CI-Auswahl erneut geprüft.

**Abschlussfreigabe:** Nutzer hat PR-Erstellung und Merge nach erfolgreichen Tests ausdrücklich freigegeben. Aktueller Hauptzweig vor dem Push weiterhin `45d84e7a`, geprüfte Korrektur `f4eb4848`; keine erneute fachliche Änderung. Nach allen Pflichtprüfungen mit Merge-Commit integrieren, Veröffentlichung und Feed prüfen, eigenen Remote-/lokalen Zweig und Worktree aufräumen.

**Auftrag:** Wieder ausgefallenen Feed einschließlich vorhandener Fehleraufzeichnung untersuchen, wiederherstellen und die belegte Ursache beheben.

**Befund:** Alle drei aktiven Marken zuletzt am 09.10. erfolgreich, jeweils 952 Folgefehler mit HTTP 307; alter Artikelbestand regulär abgelaufen. Laufender Container und aktuelle Betriebsmeldung verdecken den ausbleibenden Zulauf. Ein begrenzter Browserabruf belegt Vinteds normale Weiterleitung zu `/session-refresh` mit exaktem Katalogrückziel; der bisherige Dokumentleser bricht alle Weiterleitungen ab. Rotierende Logs und gespeicherte Erfolgs-/Fehlerzeiten sind vorhanden, eine aktive externe Ausfallalarmierung damit nicht belegt.

**Wiederherstellung und Änderung:** Bestehenden Feed-Browser einmal normal zur angeforderten Sitzungserneuerung navigiert. Nike und Ralph Lauren speichern danach wieder fortlaufend Artikel; Adidas folgt nach seiner regulären Fehlerwartezeit um 20:41:06 Uhr. Abschlusskontrolle um 20:41:24 Uhr: alle drei Fehlerzähler null, 1.184 neu gespeicherte Artikel, Kategorien ebenfalls aktuell und fehlerfrei. Kein Produktionscode, Konto, Filter, Proxy oder Container geändert; keine Cookies manuell gelesen, gelöscht oder gesetzt. Vinteds reguläre Sitzungserneuerung durfte ihre Cookies selbst aktualisieren. Separater Zweig `juna/vinted-feed-session-refresh` auf aktuellem origin/master: genau eine auf Herkunft und ursprüngliches Rückziel begrenzte Sitzungserneuerung, kein erfolgreicher Katalog aus der Erneuerungsseite, weiterhin feste Zeit-/Größengrenzen sowie Fehler- und Prüfseitenschutz. Vorhandenen Linux-Chrome-Containertest erweitert und Diagnoseanleitung ergänzt.

**Prüfung und Grenzen:** Regressionen zunächst rot, danach 338 Botfälle unter Windows und Linux/Node 22 sowie Typprüfung und Dienstbau erfolgreich. Unabhängiger Review fand eine fehlende HTML-Prüfseitenerkennung bei der Erneuerung; mit zwei roten/grünen Fällen und echtem Chrome-Fall korrigiert, Nachreview ohne offene wichtige Befunde. Echter Linux-Chrome-Ablauf mit lokalem Katalog, Sitzungscookie, verzögerter Rücknavigation und begrenzter Wiederholung erfolgreich; bestehender isolierter Starttest ebenfalls grün. Vorhandene CI-Einbindung und gezielte Auswahl geprüft. Keine Schema-/Frontendänderung. Der echte Wiederanlauf erfolgte mit unverändertem Produktionscode; dauerhafte Korrektur noch nicht veröffentlicht. Ausführlicher Befund in `docs/audit/2026-10-19-vinted-feed-session-refresh.md`. Vorhandene fremde Zweige und unveröffentlichte Dokumentation erhalten.

## 2026-10-19 - Juna - Gesamten UI-Entwurf zur Veröffentlichung vorbereiten

**Browser-Gesamtlimit:** CI-Lauf39298047283 bestätigte erneut alle Anwendungsgruppen, Qualität, Datenbank und Produktions-PWA. Alle150 Standard-Browserfälle bestanden in drei frischen Sitzungen (6,2/3,9/4,7 Minuten). Die anschließend gestarteten129 geänderten Fälle erreichten gemeinsam mit den Standardläufen das bestehende30-Minuten-Joblimit; kein Testerfolg aus dem Abbruch abgeleitet. Browsermatrix trennt beide Bereiche und je drei Teilgruppen auf eigene Runner mit eigener Datenbank/Anmeldung. Zeitlimits, Fallauswahl, Fehlergrenzen und Pflichtfreigabe bleiben erhalten; eindeutige Artefaktnamen verhindern Überschreiben. Auswahl, genaue einmalige Ausführung und Fehlerweitergabe mit Skripttests sowie echter Playwright-Auflistung geprüft. Keine Anwendungskorrektur aus dem Laufzeitbefund abgeleitet. Nachweis:67 Auswahl-/Freigabetests grün; tatsächliche279 PR-Browserfälle genau einmal verteilt (3×50 Standard,3×43 geändert). Wenige Dateien erhalten höchstens ihre Dateizahl an Teilgruppen, keine leeren Jobs. Neuer vollständiger CI-Nachweis vor dem Merge erforderlich.

**Freigabe:** Nutzer autorisiert ausdrücklich den PR mit allen Änderungen des bisherigen Entwurfs und den Merge nach erfolgreichen Pflichtprüfungen. Umfang: Marktplatzkonten und Dialoge, gemeinsames Apple-orientiertes Flipbase-Design, Artikel- und Finanzansichten sowie manuelle Bankzuordnung einschließlich Migration und Richtlinien.

**Integration und Prüfplan:** Aktuellen origin/master in den eigenen Zweig integrieren, fremde Arbeitskopien unverändert lassen. Wegen gemeinsamer Controls, globaler Stile, Testauswahl und Datenbankschema den umfassenden CI-Prüfumfang verwenden: Format, Lint, Typen, Skript-/Suite-Registrierung, Anwendungstests, Bau, Datenbank-, Browser- und Produktions-PWA-Prüfungen. Vorhandene lokale Verbraucher- und Datenbanknachweise bleiben dokumentiert; neue Prüfungen des integrierten Stands werden vor dem Merge ergänzt.

**Lokaler integrierter Nachweis:** origin/master einschließlich Pflichtupdate-PWA übernommen; nur Protokollkonflikt unter Erhalt beider Seiten aufgelöst. npm run verify vollständig erfolgreich: Format, Lint, Typen,540 Skriptfälle (534 erfolgreich, sechs vorhandene umgebungsabhängige Integrationen übersprungen),404 Edge-Function-Fälle,538 Anwendungsdateien/5.657 Fälle,45 Landingpage-Fälle und Produktionsbau (PWA5090811f72d2/271 App-Dateien). Zusätzliche isolierte Linux-Prüfung mit Node22.23.3 und Playwright1.62.1, zwei CPUs und8GB:41 PWA-Skripttests und34 Browserfälle erfolgreich; ein vorhandener Nicht-Touch-Durchlauf des nur für Touch vorgesehenen Freeze-Falls übersprungen, derselbe Android-Fall erfolgreich. Die Testkopie enthält die benötigten versteckten Konfigurationen. Ihr erster Installationsaufbau fehlte am Versionsskript; ausschließlich Aufbau der Wegwerfkopie korrigiert. Lesende Vorprüfung des bestehenden Servers:0 alte doppelte manuelle Bankziele. Keine echten Finanzdaten geändert. CI muss vor dem Merge vollständig erfolgreich sein.

**CI-Befunde und gezielte Korrekturen:** Erster PR-Lauf mit erfolgreicher Qualität, Datenbank, Node und DOM, aber noch kein Merge: Ein Steuer-Browserfall erwartete die vor dem Designumbau verwendete Überschrift. Erwartung auf die vorhandene neue Überschrift korrigiert, Geld-/Steuer-/Exportprüfungen erhalten. Beide vollständigen Angular-Gruppen erreichten die bestehende Zehn-Minuten-Grenze; eine davon hatte bereits130 Dateien/1.401 Fälle grün, wurde beim Abschluss dennoch abgebrochen. Matrix jetzt anhand der Dateizahl in Gruppen von höchstens etwa100 Dateien aufgeteilt, ohne ausgelassene Tests oder größeres Zeitlimit;30 Auswahltests erfolgreich. WebKit-Aufzeichnung zeigte den Speichern-Button während des Mausklicks von aktiv zu deaktiviert/beschäftigt wechseln, ohne Onlineauftrag. Ursache: automatisches lokales Pufferschreiben zählte als ausdrückliches Speichern. Neuer Test mit echter reviewQueue zuerst rot, dann grün: Manuelles Speichern wartet auf die Dateisicherung; weiterer manueller Onlineauftrag bleibt gesperrt.94 bestehende und neue Formular-/Seitentests grün. Neun zusätzliche Linux-WebKit-Diagnosefälle ohne künstlich veränderte Fachlogik bestanden; Die korrigierte vollständige Linux-PWA-Matrix anschließend mit34 erfolgreichen Fällen und dem vorgesehenen Nicht-Touch-Skip grün. Erneutes npm run verify vollständig grün:538 Dateien/5.658 Anwendungsfälle,404 Edge-Fälle,541 Skriptfälle (535 erfolgreich, sechs vorgesehene Integrationen übersprungen),45 Landingpage-Fälle und Produktionsbau (PWAa80f1c73afcc). Zusätzliche konservative Linux-Gruppenmessung unter zwei CPUs läuft separat; Node meldet dort nur zwei verfügbare CPUs und Vitest entsprechend weniger Parallelität als im ersten CI-Lauf. Keine Laufzeitfreigabe daraus vor Abschluss behauptet.

**Weitere CI-Navigationskorrektur:** Der nächste Browserlauf traf noch auf die alte Erwartung einer vollgelben Desktopauswahl. Aktueller freigegebener Vertrag: neutrale Desktopfläche, primärer Text, mobile Auswahl und Demo-Markierung weiter in Markengelb;36px Desktop und44px Touch. Alle vier bestehenden Sidebar-Fälle behalten Geometrie, Fokus, Scrollen und AXE. Die rein visuellen Shell-Fälle verwenden nun vollständige Backend-Simulation statt echte Arbeitsbereichsschreibvorgänge. Umbenannten Pflichtfall in Konfiguration und Soll-Liste aktualisiert. Verwandte feste Farberwartung und Schriftprüfung mitgeprüft: Sieben Seiten verwenden Systemschrift mit lokalem Inter-Fallback. Dabei tatsächliche alte font-sans-Klasse an der Sidebar als Überschreibung gefunden, vor der Entfernung durch Browserfall belegt; entfernt statt zusätzliche CSS-Vorrangregel. Letzte CI hatte alle Anwendungsgruppen, Qualität, Datenbank und Produktions-PWA erfolgreich; einzig Browser war durch die alte Farberwartung blockiert. Konservative zusätzliche Linux-Gruppe:87 Dateien/907 Fälle grün in10m52 unter zwei CPUs mit geringerer Parallelität; die tatsächlichen drei CI-Gruppen bestanden vollständig innerhalb der bestehenden zehn Minuten.

**Finale Shell-Nachweise:** Elf vorhandene Farb-, Navigations- und Schrift-Browserfälle nach der Sidebar-Klassenkorrektur erfolgreich, einschließlich Hell/Dunkel, echter Touch-Konfiguration, Fokus, AXE, Scrollen und sieben Fachseiten.31 bestehende Angular-Navigationsfälle,40 Auswahl-/Soll-Listen-Prüfungen, Format, gezieltes Lint, Typen und Produktionsbau (PWA1263f75a27d8/271 App-Dateien) grün. Tatsächliche vollständige Browserliste geprüft:150 Standardfälle und129 Fälle in zwölf vollständig geänderten Dateien. Keine Kernmarkierung entfernt, Pflichtfall umbenannt und in beiden Registrierungen erhalten. Am Code hat sich gegenüber dem zuvor umfassend geprüften Stand nur die alte Schriftklasse geändert; fachfremde Modelltests lokal nicht nochmals wiederholt. Der neue PR-Lauf prüft vor dem Merge trotzdem wieder den vollständigen geforderten Umfang.

**Dauerhafter Schutz des tatsächlichen Schriftfehlers:** Vorhandenen Sieben-Seiten-Schriftfall als Pflichtfall aufgenommen, weil er die konkret nachgewiesene Sidebar-Überschreibung erkennt. Keine neue pauschale Fallserie. Soll-Liste entsprechend ergänzt;40 Auswahl-/Registrierungsfälle und der Schriftfall erneut grün. Dadurch bleibt die Korrektur auch bei späteren breiten gemeinsamen Stiländerungen geschützt, statt nur bei Änderungen an der Testdatei selbst.

## 2026-10-19 - Juna - Manuelle Bankzuordnung mit gemeinsamem Auswahlfenster ergänzen

**Auftrag:** Den bisher fehlenden manuellen Ablauf im Bankabgleich einschließlich Auswahlfenster im neuen Finanzdesign vollständig umsetzen.

**Umsetzung:** Eigenes Feature-Modell, Dienst und kleines Dialogbauteil mit ModalShell, Button, CustomSelect und CustomCheckbox. Bankdaten als flache Zusammenfassung; Einnahmen lassen sich Verkäufen oder offenen Shopbestellungen, Ausgänge Ausgaben oder abgeschlossenen Einkäufen zuordnen. Suche nach Bezeichnung, Belegnummer, Name und Betrag; passende Beträge zuerst. Nur verfügbare EUR-Ziele desselben Arbeitsbereichs mit bekanntem positivem Betrag. Ausgabenbetrag nicht nochmals mit der Menge multipliziert. Differenz muss bestätigt werden. Änderungen bestehender noch nicht gebuchter Zuordnungen möglich; Buchen bleibt ein eigener Schritt. Lade- und Speicherfehler halten Auswahl und Wiederholungsmöglichkeit offen. Kein neues Feature-CSS.

**Speicherung und Reviewkorrekturen:** Bankdienst aktualisiert gezielt die einzelne Bankbewegung statt die gesamte lokale Liste zurückzuschreiben. Arbeitsbereich, Anmeldung, Status, Bankbetrag und Zielbetrag vor dem Speichern erneut geprüft. Frisches Lesereview fand eine Bankbetragsänderung während des Nachladens; eigener Test zuerst rot, anschließend durch erneute Prüfung nach dem Warten grün. Gegen doppelte Ziele zwischen Sitzungen deklarativen Index und Trigger ergänzt, mit Benutzerrechten, leerem Suchpfad und vorhandener RLS. Automatische Sammelvorschläge und unveränderte bestehende Buchungen bleiben erhalten. Keine Zielbeträge oder Finanzpositionen verändert.

**Migration:** Fachfremden vollständigen Schema-Diff verworfen. Nur Struktur und Rechte der Bankzuordnung aus identischer Migrationsbasis automatisch erzeugt. Neuaufbau hat zunächst fehlende Rollenentzüge im Generatorauszug sichtbar gemacht; nicht durch schwächere Tests umgangen. Separaten Rechte-Diff der erstellten Funktion maschinell erzeugt und mit dem Strukturdiff zusammengeführt, nur SQL-Schreibweise formatiert. Endgültige Migration komplett neu eingespielt; abschließender Schema-Diff leer.226 SQL-Fälle in vier betroffenen Dateien und drei echte Zwei-Verbindungsfälle manuell/manuell, manuell/automatisch und automatisch/manuell erfolgreich. Supabase-Typen neu erzeugt, nach Zeilenendenabgleich inhaltlich unverändert. Lesende Vorprüfung möglicher alter Doppelzuordnungen und Verhalten bei Treffern dokumentiert; keine Altdaten automatisch verändert.

**Prüfstand:**538 Anwendungstestdateien mit5.646 Fällen erfolgreich.37 Skript-/Registrierungs-/Paketierungsfälle:36 erfolgreich, ein vorhandener gesonderter Release-Runner-Integrationstest ohne seine eigene Wegwerfdatenbank erwartungsgemäß übersprungen.242 Shared-UI-/Stildateien ohne Befund; Suite-Audit538 Dateien. Neue Browserfälle decken alle vier Ziele, Änderung, Abbruch, getrennte Buchung, Wiederladen, Differenzbestätigung, Lade-/Speicherfehler, leere Auswahl, Tastatur/Fokus, AXE und Reflow bei1440px Maus sowie834/390px Touch in Hell/Dunkel ab. Vollständiger bestehender Responsive-Browserlauf zunächst41/43 erfolgreich; zwei bestehende Startfälle nach Zeitlimit gezielt ohne parallelen Anwendungstest erneut geprüft. Beide gezielten Wiederholungen erfolgreich (je etwa31 Sekunden); damit alle43 ausgewählten Browserfälle nachgewiesen, kein abgeschwächtes Zeitlimit. Format, gezieltes Lint, Typprüfung, Diff und Angular-Produktionsbau einschließlich Vorlagen erfolgreich (PWA11193bd34611/271 App-Dateien). Bestehende Angular-/Bundle-/CommonJS- und Testumgebungswarnungen bleiben.

**Ansicht und Betrieb:** Unveränderte Bildschirmaufnahmen einschließlich Differenz und Speicherfehler unter bank-assignment/index.html. Browserantworten vollständig simuliert, SQL ausschließlich eigene isolierte Testinstanz. Keine echten Finanzdaten durch Tests geändert. Eigene Datenbank nach Abschluss gezielt beendet, andere Projekte unverändert. Lokale Vorschau4201 bleibt mit autorisiertem bestehenden Backend verfügbar. Zusätzlicher Serverschutz erst nach regulärer Veröffentlichung der Migration aktiv. Kein Commit, Push, PR, Merge oder Deployment; native Apple-/Safari-, CI- und Produktions-PWA-Abnahme bleiben getrennt.

## 2026-10-19 - Juna - Finanzbereiche nach Nutzerkritik grundlegend neu ordnen

**Auftrag:** Vorherigen kosmetischen Finance-Angleich korrigieren. Nutzer erlaubt ausdrücklich auch neue Layouts für Ausgaben, Steuer/DATEV einschließlich Bankabgleich und Auswertung. Alte braune Warnfarbe und uneinheitliche Monatssteuerung entfernen; Layoutschutz für Artikel bleibt bestehen.

**Umsetzung:** Gemeinsame Summenflächen statt einzelner KPI-Karten. Monatsauswahl als gleichhoher Shared Select mit Alle-Zeiträume-Option und direkt angrenzenden Monatsaktionen. Steuerhauptaktion im Seitenkopf, Ansichtswechsel und flache Filter-/Exportleiste. Großer Bankimport nur im leeren Zustand; bei Daten kompakte Kopfaktionen. Sieben tatsächlich vorhandene Auswertungsbereiche in lokaler Desktopnavigation beziehungsweise schmalem Auswahlmenü. Normale Kennzahlen neutral, zentrale Warnrollen ohne Braun/Orange; alte überlagernde KPI-Klasse im Steuerbereich entfernt. Vorhandene Listenbuttonrolle um fehlenden Iconabstand ergänzt. Keine neue Feature-CSS-Datei, keine geänderten Finanzformeln.

**Quellen und Grenzen:** Apple-HIG zu Toolbars, Pop-up Buttons und Segmenten erneut gelesen. Figma-Komponentenabruf weiterhin durch Starter-MCP-Grenze blockiert; keine neuen Kitmaße behauptet. Frühere Angabe neun Auswertungen korrigiert: tatsächlich sieben auswählbare Bereiche. Vorhandene unvollständige manuelle Bankzuordnung als separater Funktionsbefund dokumentiert, nicht als funktionierend behauptet.

**Prüfung und Review:** Frisches unabhängiges Lesereview durchgeführt; die konkreten Befunde in einem Korrekturdurchlauf erledigt. Große Umsatzwerte (1.234.567,89 €) bei390px zuerst als überstehende Kennzahl nachgewiesen, danach unter sm einspaltige Summen. Datei-Drop bei vorhandenen Bankumsätzen zuerst ohne Reaktion nachgewiesen, danach am Bankbereich wieder angebunden. Zentraler Warnfarbwechsel machte den aktiven Versandfilter unlesbar (AXE-Kontrast1,27 in Hell); dieser tatsächliche Verbraucher nutzt nun Shared Button/Segment, Hell/Dunkel grün. Auswahl dafür in fulfillment registriert und Auswahltest ergänzt.

Neun finale gezielte Browserfälle einschließlich1440/834/390px Hell/Dunkel, bestehendem320px-Fall, allen sieben Auswertungsbereichen, gefüllten Tabellen, Dialogen, AXE, großen Beträgen und Dateifehlern erfolgreich. Vier finale Aufnahme-/Messläufe1440/834px Hell/Dunkel erfolgreich. Gleiche Filterhöhe geprüft; Dialogfelder28px/13px Maus und44px/16px Touch, Labels Gewicht500. Begleitender breiter Anwendungslauf536 Dateien/5.625 Fälle erfolgreich; endgültigen Korrekturstand zusätzlich mit100 betroffenen Fällen in elf Dateien geprüft.56 Skript-/Registrierungsfälle,536 Dateien im Suite-Audit,241 Shared-UI-/Stildateien ohne Befund. Format, gezieltes Lint, Typprüfung, Diff und Angular-Produktionsbau einschließlich Vorlagen erfolgreich (PWA4a76e4edd537/271 App-Dateien). Bestehende Angular-/Bundle-/CommonJS- und Testumgebungswarnungen bleiben.

**Vergleich und Betrieb:** Vier vollständige neue Vorher-/Nachhervergleiche zeigen Ausgaben, Steuer, Auswertung und Bankabgleich in gleichem Maßstab und mit gleichen Beispieldaten. Vorherbilder unverändert, abgelehnte Vergleiche ebenfalls erhalten. Automatische Finanzantworten simuliert, keine echten Finanzdaten verändert. Lokale Vorschau4201 nach dem Bau mit HTTP200 bestätigt. Entwurf bleibt lokal; kein Commit, Push, PR, Merge oder Deployment. Native Apple-Geräte-/Safari-, CI- und Produktionsfreigabe bleiben offen.

## 2026-10-19 - Juna - Finanzseiten an die gemeinsame Gestaltung angleichen

**Auftrag:** Ausgaben, Steuer/DATEV und Auswertung nach dem vorhandenen Designvertrag vollständig gestalterisch überarbeiten. Bisherige Tabellenbegrenzung für Steuer auf ausdrücklichen Folgeauftrag aufgehoben; bestehende Anordnung und Finanzabläufe erhalten.

**Umsetzung:** Gemeinsame Inhaltsüberschriften, Abschnittskarten und Segmentbuttons.20 eigene Analytics-Karten durch Shared Card ersetzt; kleine Großbuchstaben und fest eingetragene Schrift-/Textfarben durch zentrale Rollen ersetzt. Vier manuelle Statusdarstellungen nutzen Shared Badge. Ausgaben-/Wiederholungsdialoge verwenden gemeinsame Zahlen-/Selectlabels; Datumsfelder über FormField mit ihrer tatsächlichen Eingabe verbunden. Alle neun Auswertungsbereiche, Spalten, Bindungen und Ereignisse erhalten. Belege und Druckgestaltung unverändert. Keine neue lokale CSS-/SCSS-Datei.

**Prüfkorrekturen:** Überschriftensprung im Bankabgleich behoben. Kontrastfehler mit echten AXE-Werten4,11/4,4 auf grauen Untergründen durch vorhandene zentrale Erfolgsfarbe und Badge-Rollen korrigiert; bestehende Klassenprüfungen entsprechend angepasst, alle Geld-/Kosten-/Offen-Fälle erhalten.390px-Aktionszeile und lange ungetrennte Artikelnamen zuerst rot nachgewiesen, danach ohne Abschnittsverschiebung umgebrochen; Gewinnbetrag bleibt rechts innerhalb der Karte. Steuerfilter zunächst sichtbar abgeschnitten und durch Tabletprüfung belegt; ausreichend Platz gegeben. Berichtsfeldgruppe bleibt auf Desktop dreispaltig, schmaler Umbruch hält Auswahlwerte lesbar.

**Review und Nachweis:** Ein frisches unabhängiges Lesereview hat unveränderte Analytics-Interpolationen, Kontrollblöcke und Handler gegenüber der Sicherung bestätigt. Dessen offene Renderpunkte anschließend mit gefüllter Banktabelle und langer Artikelbezeichnung ergänzt.58 vorhandene Fälle in acht Anwendungstestdateien erfolgreich.56 Skript-/Testauswahlfälle,536 Dateien im Suite-Audit und241 Shared-UI-/Stildateien ohne Befund. Sieben gezielte Browserfälle (sechs Finanzmatrizen plus vorhandener320px-Fall) und vier finale Aufnahme-/Messläufe erfolgreich. Format, gezieltes Lint, Typprüfung, Diffprüfung und Angular-Produktionsbau einschließlich Vorlagen erfolgreich (PWA8fb2c38e8532/271 App-Dateien). Bekannte Angular-/Bundle-/CommonJS-Warnungen bestehen weiterhin. Vorschau4201 nach dem Bau mit HTTP200 bestätigt. Testauswahl für alle drei Finanzfeatures registriert und separat abgesichert; keine Erweiterung universeller Kernfälle.

**Vergleich und Betrieb:** Unveränderte Originalaufnahmen, vollständiger Vorher-/Nachhervergleich in Hell/Dunkel bei1440/834px. Aktuelle Beleg-/Bankansichten zusätzlich aufgenommen. Automatische Antworten und Schreibaufrufe vollständig simuliert, keine echten Finanzdaten geändert. Vorschau4201 bleibt erreichbar. Gemeinsame Controls gelten global, aber vollständige visuelle Abnahme aller übrigen Fachseiten und native Safari-/iPad-/CI-Prüfung bleiben getrennte Schritte. Kein Commit, Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Unbeauftragte Layoutverschiebung im Artikelvergleich zurücknehmen

**Nutzerkorrektur:** Gewünscht war die gemeinsame Gestaltung, keine Umordnung der bestehenden Seite. Eigenschaften gehören auf Desktop weiterhin rechts. Varianten und Suchmaschineneintrag waren vorhanden, im verkürzten Vergleich jedoch nicht sichtbar.

**Umsetzung:** Nur die Eigenschaftenkarte in die ursprüngliche rechte Spalte vor Kennungen zurückgesetzt; gemeinsame Feldgestaltung unverändert. Hauptspalte mit Grunddaten, Bildern, Varianten und Suchmaschineneintrag erhalten. Alle vier Vorher-/Nachhervergleiche zeigen nun das vollständige Formular bei gleichem Maßstab und unverändertem Ausgangsbild. Messprotokoll aktualisiert. AGENTS, aktive Designrichtlinie und Apple-Vertrag verbieten ungefragte Layoutänderungen ausdrücklich; frühere Forderung „Eigenschaften vor SEO“ als eigene, zurückgenommene Interpretation gekennzeichnet.

**Prüfung:** Neue Geometrieprüfung belegt zuerst den Fehler in beiden Desktop-Farbschemata, danach vier Layout-/SEO-/Stilmessungen bei1440px Maus und834px Touch erfolgreich. Bestehenden Artikeltest um die erhaltene Spaltenzuordnung ergänzt. Beim Wiederladen sind Werte bereits während der noch gesperrten Bestands-/Variantenabfragen sichtbar; AXE prüft nun ausdrücklich erst nach Freigabe des Formulars. Keine Kontrastregel ausgeschlossen.47 vorhandene Produktdetail-/Bestandstests sowie gezieltes Lint und Typprüfung erfolgreich. Abschließend sechs vorhandene Artikelfälle bei1440/834/390px in Hell/Dunkel einschließlich Speichern, AXE und Dialogfokus grün; zusammen mit den vier Messfällen zehn Browserfälle. Format, gezieltes Lint, Typprüfung,241 Shared-UI-Dateien ohne Befund und Angular-Produktionsbau erfolgreich (PWA dde8824dc8d0/271 App-Dateien). Bestehende Angular-/Bundle-/CommonJS-Warnungen bleiben; keine vollständige neue Gesamt- oder native Gerätematrix für diese reine Spaltenkorrektur.

**Betrieb:** Ausschließlich eigener vorhandener Entwurf; keine fremden Änderungen angefasst, keine Datenbankänderung, kein Push/PR/Merge/Deployment. Vorschau4201 bleibt verfügbar.

## 2026-10-19 - Juna - Gemeinsame Formulargrundlagen und verbindliche Flipbase-Regeln umsetzen

**Auftrag:** Freigegebene Befunde des Apple-Formularaudits umsetzen, lokale Stilüberschreibungen vermeiden, gemeinsame Bausteine verwenden und widersprüchliche ältere Richtlinien ersetzen. Entwurf weiterhin lokal zur Ansicht.

**Umsetzung:** Neuer zustandsloser FormField-Rahmen für Label, Pflichtangabe, Hinweis, Fehler und ergänzende Feldaktionen. Text-, Zahlen-, Marken-, Kategorie-, Attribut- und einfache Auswahl verwenden denselben Rahmen; Werte, CVA, IDs und unterschiedliche Auswahlfunktionen bleiben erhalten. Doppelte Titelbeschriftung durch projizierte Feldaktionen ersetzt. Wichtige Eigenschaften stehen in der DOM-Reihenfolge vor optionalem SEO. Labels einheitlich 13/20px Gewicht500, Labelabstand6px, Desktopfelder28px, Touchfelder mindestens44px mit16/20px Eingabetext. Alle Maße ausdrücklich Flipbase-Webentscheidungen. Sichtbarer gedrückter Buttonzustand ohne Layoutsprung. Allgemeine form-label/input-Überschreibungen und doppelte Größen-/Übergangsregeln entfernt; zwei reine Host-SCSS-Dateien entfallen.

42 gewöhnliche native Aktionen einschließlich Datei-Auswählen auf den vorhandenen gemeinsamen Button umgestellt, auch in Scanner-, Workspace-, Beleg- und Verlaufdialogen. Fehlende Felder in Registrierung, Bestandsabgang, Workspace und manueller Barcodeeingabe nutzen gemeinsame Controls. Interner Spaltenauslöser bleibt Teil seiner spezialisierten gemeinsamen Auswahl und nutzt zentrale Rollen. Server-/Geschäftslogik unverändert. Shared-UI-Prüfung erkennt nun Angular-Kontrollblöcke, lokale innere Controlüberschreibungen, alte Standardaktionen und Fachseiten-CSS gegen Shared Controls; erfasst auch zusammengesetzte Shared Components. Dabei erkannte feste KI-Treffer-/Diagramm-Texttabellen und den eingebetteten Verkaufspositionseditor nach tatsächlicher Funktion dokumentiert.

**Dauerhafte Regeln:** Admin-UI-Richtlinie neu gefasst; alte Shopify-/Zwischenregeln eindeutig als Historie archiviert. Apple-Vertrag und AGENTS auf gemeinsame Bausteine, klare Stilzuständigkeit, Herkunftsnachweise und Verbraucherprüfungen ergänzt. Markenfarbe #fcc601, freigegebene Dashboard-Sonderrollen, Druckansichten und begrenzter Steuer-/DATEV-Umfang erhalten.

**Prüfstand:** Nach dem unabhängigen Lesereview und dem einen Korrekturdurchlauf sind alle536 Anwendungstestdateien mit5.624 Fällen erfolgreich.29 Artikelfälle gegen die eigene isolierte Datenbank beziehungsweise simulierte Antworten sowie zehn gezielte Verbraucherfälle nach den Korrekturen grün; zuvor vollständiger Lauf mit131 Verbraucherfällen grün. Vier Review-Regressionsläufe und vier finale Stil-/Zustandsmessungen Hell/Dunkel,1440px Maus/834px Touch erfolgreich.55 Skript-/Auswahltests,536 Testdateien im Suite-Audit und241 Shared-UI-/Stildateien ohne Befund. Format, Lint, Typen und erneuter Produktionsbau erfolgreich; PWA-Bau428be5e0a936/271 geprüfte App-Dateien. Bekannte Angular-/Budget-/CommonJS-Warnungen bleiben bestehen.

**Reviewkorrekturen:**35 normale Icon-Aufrufer verwenden den bestehenden Button-Icon-Eingang statt SVG im Textslot. Touch-Löschflächen in Marke/Kategorie reservieren die ganze belegte Breite. Die spezifische Dialogregel, die500 durch510 überschrieben hatte, ist entfernt. Alle drei Fehler zuerst durch rote Browser-/Schutztests belegt und danach grün. Zusätzlich den vom Reviewer abgegrenzten bisherigen Erstellen-Button mit AXE geprüft: aria-required-children reproduziert, Aktion außerhalb der Listbox angeordnet; äußerer Popover, Tastatur, Scrollen und Rückfokus erhalten.41 Selectfälle und AXE des offenen Menüs in vier echten Verbraucherfällen grün. Dauerhafte Browserfälle sowie statischer Schutz gegen erneute Icon-/Labelüberschreibungen ergänzt. Keine ungeprüft zurückgestellten Reviewbefunde und kein zweiter Reviewer.

**Betrieb und Grenzen:** Vorschau4201 bleibt mit der vorhandenen autorisierten Backendkonfiguration erreichbar. Automatische Schreibprüfungen ausschließlich lokal isoliert oder vollständig simuliert. Eigene Testinstanz und Testdienste nach den Läufen beendet; fremde Projekte unverändert. Vier echte Vorher-/Nachherpaare: unveränderte korrekt oben aufgenommene Bilder des unmittelbar vorausgehenden Artikelstands und aktuelle Aufnahmen, gleiche Beispieldaten und gleicher Maßstab. Versetzten festen Header zunächst als Aufnahme-Scrollposition erkannt und korrigiert, keine Bildretusche. Dauerhaftes Messprotokoll aktualisiert. Native Safari-/iPad-/vollständige CI-/Produktions-PWA-Matrix bleibt eigene Freigabe vor Veröffentlichung; keine native Pixelgleichheit behauptet. Entwurf bleibt lokal ohne Zwischencommits zur Nutzerprüfung; kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Apple-Formulargrundlagen vor weiteren Umbauten erneut prüfen

**Auftrag:** Bisherige UI-Recherche und reale Umsetzung erneut gegen Apple prüfen, einschließlich Formularaufbau, Inputfeldern, Abständen, Buttons, Aktionen und Schrift. Weitere seitenweise Änderungen bis zum gemeinsamen Abgleich zurückstellen.

**Recherche:**25 offizielle Inhalte direkt gelesen:17 HIG-Seiten, sechs SwiftUI-API-Seiten sowie AppKit/UIKit; aktuelle Design-Resources-Seite und offizielle lokalisierte macOS-Typografietabelle ergänzend geprüft. Markdown-Abruf im Webleser scheiterte am Inhaltstyp; direkter offizieller Abruf erfolgreich lokal zwischengespeichert. macOS/SwiftUI Columns und Grouped gegenüber UIKit-/iPadOS-Formularen abgegrenzt. Keine universellen Webabstände oder CSS-Maße aus nativen Punkten abgeleitet. Erneute Figma-Abfrage durch Starter-Zugriffslimit blockiert; keine frischen Kit-/nativen Gerätemessungen behauptet.

**Ist-Abgleich:** Vier erfolgreiche Messläufe der bestehenden Artikel-/Bearbeitungsansichten bei1440px Maus/834px Touch, Hell/Dunkel, mit vollständig simuliertem Backend. Tatsächlich gemessen: Textfeld28px versus Marke30px; Feldlabels600/500/510; Touch44px bei weiterhin13px Schrift; horizontales Padding12/10px; identische Hover-/Pressed-Darstellung des geprüften Standardbuttons; doppelte Titel-Feldbeschriftung; SEO vor wichtigen Eigenschaften auf schmaler Ansicht. Global-/Komponentenüberschreibungen als gemeinsame Ursache erfasst. Erster Messselektor traf sichtbares und verstecktes Label gleichzeitig; Messung gezielt auf sichtbares Label eingegrenzt und doppelte Zuordnung separat nachgewiesen.

**Ergebnis:** Neuen Quellen-/Befundbericht und dauerhaftes Messprotokoll angelegt. Apple-Maßvertrag, Geltungsstand der UI-Richtlinie und Paketplan auf zentrale Formulargrundlagen vor weiterem Seitenrollout präzisiert. Offene Touch-Schrift-/Abstands-/Labelentscheidungen ausdrücklich offen gelassen. Keine neue UI-Schätzung als Apple-Original ausgegeben. Recherche und Messprotokolle abgeschlossen; Anwendungsdateien unverändert. Nur Dokumentation formatiert/geprüft, kein Anwendungsbau erforderlich. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Vollständigen Artikelbereich an die gemeinsame Gestaltung angleichen

**Auftrag und Umfang:** Bestehende Artikelübersicht, Katalogdetail mit Erstellen/Bearbeiten und Bestand, Einzelartikeldetail sowie zugehörige Dialoge überarbeiten. Vorher-/Nachher in Hell/Dunkel auf Desktop/Tablet. Kein neues Demofeature und keine Veröffentlichung.

**Umsetzung:** Ausdrückliche Inhaltsrollen für PageHeader, Card und segmentierte Details-/Bestandsbuttons. Ruhige Abschnittskarten ohne Titelbänder, zusammengehörige Eigenschaften, flache Kennzahlen und einheitliche Aktionen statt doppelter Angaben. Varianten ohne verschachtelte Karten oder leeren Dialogfuß. Medienupload per Tastatur erreichbar, Hoveraktionen auch bei Fokus/Touch sichtbar. Gedämpfte Kleidungsplatzhalter erhalten. Marken-/Kategorie-/Attributmenüs an vorhandene Menü-/Fokusregeln angeglichen; doppelten Host-/Feld-IDs bei Marke/Kategorie durch leere Host-ID vorgebeugt. Bestehende Beschreibung und Zustandsnotiz im Einzelartikelformular/-detail sichtbar gemacht und mit vorhandenen Speicherwegen verbunden; lange Texte umbrechen. Änderungsverlauf nur hier an Abschnittsrolle angeglichen. Kontrast der Suchmaschinenvorschau folgt dem gewählten Farbschema. Karten-/Seitenmaße ausdrücklich als Flipbase-Webanpassungen dokumentiert.

**Prüfungen und Korrekturen:** Beschreibung/Zustandsnotiz zuerst im echten Formular fehlschlagen gesehen, danach alle drei Kostenfälle null/0/12 erfolgreich. Gesamte Anwendungssuite536 Dateien/5.622 Fälle ausgeführt; zwei Befunde betrafen veraltete Testselektoren (zusätzlicher Auswahlhaken und erster von mehreren Druckregelblöcken). Behoben und sechs betroffene Dateien/62 Fälle vollständig erfolgreich nachgeprüft. Bestehende Browserannahmen mit aktuellem Code und Git-Historie abgeglichen: genaue Grün/Blau-Auswahl; tatsächlicher Zur-Artikelliste-Link; aktuelle Shellfarben; beabsichtigte Nullpreis-Darstellung0,00 und manuelle Auswahl nach ungültigem Barcode. Preis-/Scannerlogik unverändert; Soll-Liste des umbenannten Browserfalls mit33 bestandenen Registrierungs-/Auswahltests geprüft. AXE nach abgeschlossenen Farbübergängen ausführen, unveränderte Kontrastanforderung.53 bestehende Browserfälle für Einstellungen, Marktplatzübersicht und Übertragung erfolgreich. Finaler gemeinsamer Artikellauf:27/27 Fälle erfolgreich, einschließlich echter lokaler Galerie-/Zuschnitt-/Speicher-/Bestandsabläufe, aller sechs Desktop-/Touch-/Farbschemavarianten, leerer/nicht gefundener Artikel, langer Texte und200%-Vergrößerung. Zusammen mit den53 Verbraucherfällen sind80 Browserfälle erfolgreich; zusätzlich vier finale Aufnahmeläufe grün. Format, Lint, beide Typprüfungen,180 Shared-UI-Dateien ohne Befund und33 Registrierungs-/Auswahltests erfolgreich. Produktionsbau nach Abschluss aller Browserprüfungen erfolgreich, PWA-Bau ea623496728e/270 geprüfte App-Dateien. Bekannte Angular-/Budget-/CommonJS-Warnungen bestehen fort.

**Umgebung und Vergleich:** Eigene lokale Supabase-Testinstanz aus aktuellem Schema/Migrationen aufgebaut, Docker lief bereits und wurde nicht neu gestartet; fremde Projekte unverändert. Edge Functions ohne Produktionsgeheimnisse lokal gestartet. Fehlende Dienste und danach nicht erlaubte Testadresse des Discord-Statusdienstes gezielt als lokale Testkonfiguration korrigiert; keine Auth-/Zugriffsprüfung umgangen. Automatische Artikel-Schreibtests ausschließlich isoliert oder mit simulierten Antworten. Nutzer-Vorschau bleibt localhost:4201 mit bestehender autorisierter Backendkonfiguration. Je28 Vorher-/Nachher-PNGs mit identischen Beispieldaten; tatsächliche sieben Ansichten,1440px Maus/834px Touch, Hell/Dunkel. Vergleich im gleichen Maßstab, Links auf unveränderte Originale. Keine erzeugten Schein-Screenshots.

**Review und Grenze:** Frischer unabhängiger Lesereview fand nur fehlenden Umbruch langer Texte; korrigiert und schmaler Regressionstest ergänzt. Vollständige CI-/Produktions-PWA-/native Safari-/iPad-Freigabe bleibt vor Veröffentlichung offen. Kein Push, PR, Merge oder Deployment.

**Abschluss:** Eigene isolierte Testinstanz und Testserver nach den Prüfungen beendet, andere Docker-Projekte unverändert. Vorschau4201 bleibt geöffnet. Finale Vergleichsbilder visuell auf Desktop und Tablet geprüft; helle/dunkle Desktop-Vergleiche zusätzlich als Dateiansichten vorgemerkt. Gesamter Apple-Entwurf weiterhin lokal und zur Nutzerabnahme, keine Veröffentlichung.

## 2026-10-19 - Juna - Verbleibenden Designumfang einordnen

**Anlass:** Nutzer fragt nach dem tatsächlichen Abschlussgrad und den nächsten Schritten nach Tabellen und Modalen.

**Einordnung:** Aktuellen Maßvertrag, Umsetzungsplan und letzte Prüfprotokolle gelesen. Gemeinsame Controls, Shell und Tabellen-/Dialograhmen sind umgesetzt; dies ist keine vollständige visuelle Abnahme sämtlicher Fachseiten und Sonderbausteine. Alte offene Planhäkchen sind teilweise historisch und müssen vor weiterer Umsetzung mit dem Code abgeglichen werden. Nächster sinnvoller Umfang: verbliebene gemeinsame Bausteine erfassen, den Artikelbereich vollständig einschließlich Erstellen/Bearbeiten und Dialogen angleichen, danach Einkäufe/Verkäufe und Marktplätze gezielt prüfen. Native Safari-/iPad-Prüfung, 200% Textvergrößerung und vollständige Freigabematrix bleiben offen. Keine Anwendungsänderung oder Veröffentlichung in diesem Analyseschritt.

## 2026-10-19 - Juna - Gemeinsame Tabellen und Modale auf bestehenden Seiten angleichen

**Auftrag:** Tabellen und Modale anhand passender Apple-Vorlagen direkt auf bestehenden Seiten einheitlich in Hell/Dunkel überarbeiten; echte Vorher-/Nachherbilder liefern.

**Quellen und Umsetzung:** Table/Outline View 4356:13263, Sheet 4358:15435 und Small Dialog 171:9049 im bereitgestellten macOS-Kit strukturell und visuell geprüft. Native 20px-Zeilen bewusst nicht auf Produkt-/Touchzeilen übertragen; Web 40px-Mindestzeilen, Touch 44px, Bild-/Aktionsinhalte dürfen wachsen. Mehrfache globale Tabellenregeln zusammengeführt: ruhiger Kopf mit feinen Trennern, zurückhaltende Wechselzeilen, kompaktere Geometrie, blauer Sortierfokus. Bestehende Auswahl, Spaltenpräferenzen und mobile Ersatzansichten erhalten. Dashboard-Spezialtabelle ausgenommen; Steuer/DATEV ausschließlich Tabellenumfang.

ModalShell zeigt zusammenhängende Fensterfläche, echte 16px-Fensterrundung, abgestimmte Schatten/Kontur, ruhigeren Kopf und Aktionsbereich; unabhängige Fensterrolle verhindert Überschreibung durch allgemeine Inhaltskarten. ConfirmDialog verwendet dieselbe Familie mit vorhandenen gemeinsamen Buttons. Eigene Workspace-, Scanner-, Foto-, Rechnungs-/Etikettenrahmen angeglichen; Inhalte und Drucklayouts nicht umgebaut. Öffentliche Fenster erhalten die gleiche Oberfläche ohne App-Shell. Der im berechneten Browserstil nachgewiesene Konflikt mit dem allgemeinen Kartenschatten ist durch die spezifische Fensterregel beseitigt; Schatten und Kontur sind dauerhaft im Browser geprüft.

**Befunde und Korrekturen:** Verkäufer-Erstellen verlor den Rückfokus, weil der beim Schließen entfernte Menübutton gespeichert wurde. Neuer Regressionstest zuerst rot, danach 40 Select-Fälle grün: bleibenden Auslöser synchron vor Dialogaktion fokussieren. Unabhängiger Review fand öffentliche Dialogfläche außerhalb app-shell und ungewollte Belegtabellen-Gestaltung. Korrigiert: globale Fensterrollen nur für Bildschirm, Papieransichten ausgenommen, bisherige Papierabstände in Vorschau/Druck erhalten. Öffentlicher Sichttest belegte zusätzlich falsche closeModal-Ereignisbindungen auf SetPassword; AGB/Datenschutz nun an vorhandenes closed gebunden. Zuerst Escape-Fehler nachgewiesen, danach öffentliche Dialoge erfolgreich geschlossen. Erste Testannahme /auth/register war überholt (Route leitet auf Login um); gültigen öffentlichen Einstieg /auth/set-password verwendet.

**Prüfung:** Vollständige Anwendungstests536 Dateien / 5.622 Fälle erfolgreich, anschließend 58 direkte Fälle einschließlich Passwortseite/Select/Modal erneut grün. Vier finale Sichtfälle auf 1440px-Maus/834px-Touch in Hell/Dunkel prüfen Sortieren, Suche, Formulareingabe, AXE, Fokusfalle und Rückfokus. Vier gezielte Review-Randfälle mit öffentlichen Dialogen und echter Kaufbelegansicht in Bildschirm/Druck erfolgreich. Dauerhafte bestehende Settings- und PurchaseProfitability-Fälle um Fenster-/Touch-/Fokus-/Papierprüfungen ergänzt, keine neue Browserdatei registriert.131 bestehende Browserfälle im ruhenden Lauf erfolgreich; nach der letzten reinen Schattenkorrektur sieben Settings-Fälle erfolgreich, ein Touchfall maß noch während der Öffnungsanimation. Strenge 44px-Erwartung unverändert, fertige Geometrie abwarten; danach alle vier Desktop-/Touch-Rollenfälle erneut erfolgreich. Acht finale Sicht-/Randfälle ebenfalls erneut erfolgreich. Lint, vollständige Typen, Shared-UI: 180 Dateien / 0 Befunde und Suite-Audit erfolgreich. Finaler Produktionsbau nach allen Browserprüfungen erfolgreich (PWA-Bau 9c29a852a180, 270 App-Dateien). Bekannte Angular-/Budget-/CommonJS-Warnungen bleiben; finale Format-, Diff- und Lintprüfung erfolgreich.

**Vergleich und Betrieb:** Vorherbilder vor Produktivcodeänderungen gesichert, danach identische simulierte Einkäufe/Formularwerte und gleiche Viewports/Farbschemata aufgenommen. Unveränderte PNGs werden mit gleichem Ausschnitt/Maßstab in Desktop- und Tablet-Vergleichen gegenübergestellt. Keine erzeugten Schein-Screenshots. Lokal unter localhost:4201; automatisierte Konten-/Backendantworten ausschließlich simuliert. Kein Push, PR, Merge oder Deployment. Globale Styles lösen umfassende CI-/PWA-Auswahl aus; vollständige CI-/Produktions-PWA-/Safari-/iPad-Matrix vor Veröffentlichung weiterhin offen.

## 2026-10-19 - Juna - Apple-Controlrollen und gemeinsame Shell nach Nutzerfeedback korrigieren

**Anlass:** Nutzer meldet zu dunkle Feld-/Menürahmen, schwarz-gelben Doppelfokus, pauschale Kapselbuttons, überbreiten Verkäuferfilter, schlecht erkennbare Erstellen-Aktion sowie Header-/Sidebarwechsel zwischen Seiten.

**Ursachen und Quellen:** Feld- und Menügrenze waren unpassend gekoppelt; eigene Rahmenfarbe #8e8e96 war keine Apple-Vorgabe. Fokusregeln überlagerten sich. Die Referenzübertragung verallgemeinerte Kapselrollen, obwohl das Apple-macOS-27-Kit eigene Inhaltsbuttons mit 6px Radius besitzt. Buttons-Seite/Komponentenset und fokussiertes Textfeld erneut strukturell sowie visuell geprüft. Separat veröffentlichten Lissie-Stand 4a67c68f samt Rollen untersucht: nicht alle Controls sind Kapseln; kein Beleg für einen neueren lokalen Entwurf. Zusätzlich Tabellen-Flexregel als Ursache des stark wachsenden Verkäuferfilters belegt. Vorherige Übersichtskapselung der Shell erklärt den Seitenwechsel.

**Korrektur:** Normale Buttons/Selects mit kleinen Radien, gelbe Primäraktion ohne zusätzliche sichtbare Rahmenkante; dezente getrennte Feld-/Menükonturen; genau ein blauer Fokus entsprechend Referenzfamilie, Marke #fcc601 bleibt. Standardfelder Desktop28px, Touch 44px, größere ausdrückliche Rollen erhalten. Einfache Formselects ebenfalls grau hervorgehoben. Tabellenfilter wachsen nicht mehr übermäßig, Verkäuferfilter maximal192px. Erstellen-Zeile mit eigener grauer Fläche und Plus-Symbol, bestehender Dialogablauf erhalten. Gemeinsame Shellfarben, Header und Navigation auf alle Verwaltungsrouten übertragen; Sidebar-Hover8px statt Kapsel. Stylesheet passend zu flipbase-shell.css umbenannt; Safe-Area im Header erhalten. Keine Fach-/Backendänderung.

**Prüfung:** Vier dauerhafte Browserregressionen für Hell/Dunkel und Maus/Touch ergänzt. Ursprünglichen Shellunterschied vor Korrektur nachgewiesen; anschließend Rollen/Feld-/Menükontur, Filterbreite, Seitenwechsel, fokussiertes Feld und Verkäuferdialog geprüft. AXE-Kontrastbefund beim Kategorie-Platzhalter durch lesbareren Text korrigiert. Alle 536 Anwendungs-Testdateien mit 5.621 Fällen erfolgreich. Alle 96 bestehenden und ergänzten Browserfälle aus Einstellungen, Konten, Marktplatzübersicht und Übertragung erfolgreich; sechs zusätzliche finale Artikelformular-Sichtfälle bis390px ebenfalls grün. Suite-Audit, alle 33 Testauswahl-/Browserregistrierungsfälle, Lint, vollständige Typen, SharedUI, Format und Diffprüfung erfolgreich. Unabhängiger Lesereview ohne verbliebene materielle Befunde. Abschließender Produktionsbau erfolgreich (PWA-Bau e8c3d93a04b1); bekannte Budget-/CommonJS-Warnungen bleiben. Erster Nachlauf traf noch den alten, gerade neu bauenden Stand; danach gegen ruhende Vorschau geprüft. Einen mehrdeutigen Kopfzeilen-Testselektor auf dessen tatsächlichen Bereich eingegrenzt. Keine Prüfbedingung abgeschwächt.

**Betrieb und Grenze:** Lokal auf localhost:4201; automatisierte Anbieter-/Backendvorgänge ausschließlich simuliert. Nutzerkonten und echte Artikel unverändert. Aktuellen Maßvertrag und Richtlinie berichtigt; frühere pauschale Kapsel-/Rahmenangaben gelten nicht mehr. Echte Apple-Geräte-/Safari-Prüfung und vollständige Produktions-PWA-/CI-Browsermatrix vor Veröffentlichung offen. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Gemeinsame Buttons und Formularfelder vereinheitlichen

**Auftrag:** Die geprüfte Apple-orientierte Vorlage auf gemeinsame Buttons, Eingabefelder und Select-Boxen übertragen, damit bestehende Seiten einheitlich werden.

**Umsetzung:** Zusätzliche Textfeld-Referenz im offiziellen macOS-Kit gelesen; 28px/Radius7/Text13-16-510 von den 32/36/40px-Webrollen und 44px-Touchflächen getrennt. Bestehende Farbvariablen um gemeinsame Controlrollen ergänzt und vorhandene globale Button-/Eingaberegeln angeglichen. Normale Buttons kapselartig, Sekundäraktionen grau; Marke #fcc601 und semantische Spezialaktionen erhalten. Gemeinsame Text-/Such-/Zahlenfelder mit konsistentem Rahmen, Schrift, Fokus und Fehlerdarstellung; Passwort-/Leeren-Aktionen auf Touch vergrößert. CustomSelect erhält das Menü mit linkem Auswahlhaken als Standard; vorherigen opt-in-Schalter und doppelte Darstellungszweige entfernt, Suchfunktion, Status-Pills, Varianten und Formularanbindung beibehalten. Kein Seiten-, Tabellen- oder Backendumbau.

**Prüfstand:** Bestehende Auswahl-/Buttonfälle zuerst gegen die neue Erwartung fehlschlagen gesehen, danach alle 71 direkten Fälle erfolgreich. Vollständige Anwendungstests: 536 Dateien und 5.621 Fälle erfolgreich. Alle 92 bestehenden Browserfälle aus Einstellungen, Marktplatzübersicht, Konten und Vinted-Kleinanzeigen-Übertragung erfolgreich. Nach der letzten Kategorie-/Select-Korrektur die 21 betroffenen Layoutfälle sowie 88 direkte Komponententests erneut erfolgreich. Sechs finale Sichtfälle auf der tatsächlichen Artikelerfassung bei 1440/834/390px in Hell/Dunkel erfolgreich: Eingabe, Tastaturauswahl, Kategorie-Feldfarbe, exakt 44px Touch-Select, Überlauffreiheit und AXE ohne Befund. Lint, beide Typprüfungen, Shared-UI-Prüfung und Format-/Diff-Prüfung erfolgreich. Unabhängiger Lesereview einschließlich letzter Korrekturen ohne verbleibende materielle Befunde. Produktionsbau abschließend separat geprüft; bekannte Angular-/Budget-/CommonJS-Warnungen bleiben. Keine Prüfbedingung abgeschwächt.

**Betrieb:** Entwicklung weiterhin nur localhost:4201 mit der zuvor autorisierten Backend-Konfiguration. Automatisierte Browserprüfungen simulieren alle Backend-/Anbieterantworten, keine echten Artikel gespeichert oder Anzeigen veröffentlicht. Vollständige CI-Browser-/Produktions-PWA-Matrix, echte Safari-/Mac-/iPad-Prüfung und reale Textvergrößerung bleiben vor einer Veröffentlichungsfreigabe offen. Noch kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Echte Übersicht anhand des Apple-Kits überarbeiten

**Auftrag:** Auf Nutzerkorrektur die vorhandene Übersicht anstelle einer zusammengewürfelten Artikeldemo gestalten; Apple-Figma-Komponenten tatsächlich prüfen und nach einer reinen Webreferenz suchen. Gewünschte gedeckte Kleidungsplatzhalter erhalten.

**Quellen:** Bereitgestellte macOS-27-Datei über Komponentenstruktur und Aufnahmen gelesen, einschließlich heller/dunkler Menüs, Popup-Varianten und Tabellenkopf. Apple Design Resources, Safari-Webhinweise und Web-View-HIG geprüft; kein separates allgemeines Web-UI-Kit gefunden. Kit-Werte K, native Messungen M und eigene Browseranpassungen F ausdrücklich getrennt. Keine Änderungen an der Figma-Datei.

**Umsetzung:** Verworfenes Demo-Feature entfernt; Starter zeigt normalen App-Einstieg auf localhost:4201/dashboard mit bereits autorisierter lokaler Backend-Konfiguration. Header, Navigation, Flächen und Schrift nur im tatsächlichen Übersichtskontext angepasst. Bestehendes CustomSelect erhält opt-in-macos-Erscheinung mit grauem Trigger, Auf-/Ab-Pfeilen und linksstehendem Auswahlhaken. Standard/CVA/Tastatur erhalten. Gedeckte, namensstabile Kleidungsplatzhalter im vorhandenen ProductThumbnail wirken absichtlich auch in anderen Produkt-/Inserat-Verbrauchern; echte Fotos und neutrale Profile bleiben erhalten. Kennzahlen, Chartmuster/-farben, Aktionen, Dienste und Datenmodelle unverändert. Im unabhängigen Review erkannten nur hell gesetzten Schriftstapel für beide Themen korrigiert.

**Prüfung:** 68 ausgewählte Angular-Fälle aus CustomSelect, ProductThumbnail und Dashboard erfolgreich; nach Korrektur der Testeinordnung Thumbnail-Datei erneut vollständig grün. Vier finale Browserfälle der echten Route bei 1440px Maus/834px Touch und Hell/Dunkel erfolgreich: 24/44px-Menüzeilen, Radius, Schriftstapel, Escape/Fokus und bestehendes Inseratmodal. AXE am Dashboard samt geöffnetem Menü ohne Befund, keine Seitenfehler. Gezieltes Lint, Typprüfung, Shared-UI-Prüfung und Produktionsbau erfolgreich. Finale Schriftänderung nochmals im Browser geprüft. Bekannte Compiler-/CommonJS-Warnungen bleiben.

**Betrieb und Grenzen:** Automatische Startprüfung lehnte Bindung der echten Backend-App an alle Netzwerkschnittstellen ab; sichere Variante ausschließlich 127.0.0.1 erfolgreich gestartet. Alte LAN-Adresse der Beispieldemo ungültig. Automatisierte Prüfungen nur mit simulierten Daten. Vollständige breite Testauswahl wegen globalem CSS/Shared-Verbrauchern einschließlich PWA vor PR noch offen; gezielte Prüfung ersetzt sie nicht. Native Safari-/Mac-/iPad-Prüfung, Textvergrößerung und Nutzerabnahme offen. Maßvertrag/Plan/Richtlinie aktualisiert. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Klickbare Apple-orientierte Musteransicht bereitstellen

**Auftrag:** Paket 1 lokal umsetzen: Header, Formular, Tabelle und Modal in Hell/Dunkel sowie Desktop/Tablet als gemeinsam prüfbare Ansicht bereitstellen.

**Umsetzung:** Separater Angular-Einstieg und wiederholbarer Starter auf Port 4201; keine produktive Route, keine Änderung an angular.json, Paketdateien oder vorhandenen Shared-Komponenten. Header mit Workspacewahl, Glocke, Theme und Profil; Artikeltabelle mit Suche, Filter, Sortierung und Mehrfachauswahl; vorbefülltes Formular mit Validierung und lokaler Übernahme aller Felder; Inserieren- und Kontomodal mit vorhandener Fokusführung. Vorhandene Button-, TextField-, Select-, Checkbox-, Badge-, DataTable- und ModalShell-Bausteine wiederverwendet. Alle Vorschauwerte auf apple-preview begrenzt, Marke #fcc601 erhalten, Tabletmodus und echte grobe Zeiger erhalten größere Ziele. Vollständig deckende Alternative und reduzierte Bewegung berücksichtigt. Beispielartikel bleiben ausschließlich im Arbeitsspeicher und werden beim Neuladen zurückgesetzt. Kein Backend-, Konto- oder Veröffentlichungsvorgang.

**Prüfung:** Fünf finale Playwright-Prüfungen erfolgreich: 1440/834 Pixel Hell/Dunkel mit Formularänderung/Validierung, Suche, Mehrfachauswahl, Workspace mit langem Namen, Modal, Escape und Fokusrückgabe; zusätzlich Touch-Ziele und Überlauffreiheit bei 390/1024/1440 Pixeln sowie deckende Darstellung. AXE für ganze Musteransicht, Formularfehler und Modal ohne Befund; keine Laufzeitfehler oder externen Requests. Browser-Plugin nicht verfügbar, bestehendes Playwright als dokumentierter Ersatz verwendet. Desktop-/Tablet-/Modalaufnahmen gesichtet. Erst falschen Prüfselektor korrigiert; im Review erkannte Checkbox-/Navigations-Touchgrößen sowie Auswahlzuordnung korrigiert. Tatsächlichen alten Fehlerfarb-Alias für ausreichenden Dunkelkontrast in der Vorschau abgebildet. Unabhängiger Lesereview ohne verbleibende materielle Befunde. Gezieltes Lint und Typprüfung erfolgreich; optimierter Vorschaubau erfolgreich. Gekapselte Prototypstyles überschreiten die 4-kB-Warnschwelle, liegen unter der unveränderten 8-kB-Fehlergrenze; vorhandene Angularwarnungen bleiben. Keine Prüfbedingung abgeschwächt.

**Dokumentation und Grenze:** Maß-/Zustandsvertrag, Startbefehl und lokale Tabletadresse in docs/design/apple-ui-reference.md. Alle konkreten CSS-Maße als eigene Webvorschläge F gekennzeichnet; keine native Apple-Vermessung behauptet. Echte Safari-/iPad-Geräteprüfung, reale Textvergrößerung und Nutzerabnahme bleiben offen. Bestehende Gestaltungsrichtlinie nicht ersetzt und Paket 2 nicht begonnen. App-Server 4200 und Vorschau 4201 bleiben aktiv. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Apple-orientiertes Designsystem recherchieren und planen

**Auftrag:** Lissie Harness, die bisherige Dashboard-Umsetzung und offizielle Apple-Vorgaben untersuchen; daraus einen globalen Plan für Header, gemeinsame Controls, Formulare, Modale und Tabellen entwickeln.

**Recherche:** Mit drei getrennten Recherchen den GitHub-Stand von GrischaTDev/lissie, PR441–444 samt ursprünglichem Dashboard-Chat und aktuelle Apple-Primärquellen geprüft. Lissie ist eine Angular-/Electron-Oberfläche mit eigenen Maßen, kein vollständiges natives Apple-Designsystem. Der Dashboard-Auftrag war ausdrücklich auf die Übersicht begrenzt; gemeinsame Navigation und allgemeine Controls wurden nicht global umgestellt. Native Apple-Typografiewerte, projektbezogene Maße und noch ungemessene Browserübertragungen im Recherchebericht getrennt. Die ältere unversionierte Recherche im fremden Hauptcheckout nur gelesen.

**Ergebnis:** Recherchebericht und sechsteiliger Umsetzungsplan mit Quellen, Komponentenbestand, Maßvertrag, Abnahmepunkten und betroffenen Prüfbereichen geschrieben. Zuerst eine gerenderte Musteransicht, danach Grundlagen/Kaskade, Shell/Header, Formulare/Modale, Tabellen und restliche Verbraucher. Bestehende Marke, fachliche Abläufe, Desktop-/Touchtrennung, Dark Mode und Seitenbreiten erhalten. Aktuelle Gestaltungsrichtlinie noch nicht ersetzt; keine UI-Implementierung.

**Prüfung:** Vier finale Chromium-Bestandsmessungen mit simulierten Konten bei 1440px Hell/Dunkel sowie 834/390px Touch erfolgreich; Aufnahmen gesichtet. Headercontrols bleiben bei Touch 36px, während gemeinsame Buttons 44px erhalten. Globaler linear-surface-Radius überschreibt den Modalradius auf effektiv 12px. Anfangs erfasste Animationszwischenwerte verworfen und stabil erneut gemessen. Keine native Mac-/Safari-Messung und kein neuer vollständiger AXE-/WCAG-Nachweis. Nur Dokumentation geändert; Formatierung, Diff-Prüfung und relative Dokumentlinks erfolgreich geprüft. Zwei abschließende Reviews von Quellen und Umsetzbarkeit ohne materielle Befunde. Entwicklungsserver antwortet mit HTTP 200. Keine realen Konten-/Datenaktionen, kein Push, PR oder Deployment.

## 2026-10-19 - Juna - Aktuellen Master in die lokalen Marktplatzänderungen integrieren

**Auftrag:** Den neuesten Master für den gemeinsamen lokalen Teststand übernehmen und die bisherigen Marktplatzänderungen erhalten.

**Integration:** Arbeitsstand zunächst im eigenen Zweig mit dfddb8da lokal gesichert. Origin/master mit Stand 7b80b8fa integriert; damit kommen die aktuelle Startübersicht, Verkaufsplattformen und die nachfolgenden Darstellungsverbesserungen hinzu. Einziger Konflikt im Änderungsprotokoll unter Erhalt der Einträge beider Seiten gelöst und deren Überschriften vollständig geprüft. Produktdateien ohne direkte Konflikte zusammengeführt. Paketdateien und gesperrte Abhängigkeiten unverändert. Fremde Zweige und der Hauptcheckout bleiben unberührt.

**Prüfung und Betrieb:** Gemeinsamer Produktionsbau und Typprüfung erfolgreich. Alle 145 betroffenen Komponententests, 61 bestehende Browserfälle einschließlich Kontenverwaltung, Übersicht, Einstellungen, Übertragung und Gebührenstopp sowie neun Registrierungsprüfungen bestanden. Shared-UI ohne Befund. Entwicklungsserver mit der vorhandenen Konfiguration für bestehende Flipbase-Daten neu gestartet; Marktplatzübersicht mit HTTP 200 erreichbar. Aktueller origin/master nachweislich vollständig in HEAD enthalten. Keine produktiven Testaktionen; kein Push, PR, Produktionsdeployment oder zusätzlicher Datenbankeingriff.

## 2026-10-19 - Juna - Lokalen Testserver erneut starten

**Auftrag:** Den unterbrochenen Entwicklungsserver wieder bereitstellen und den Startbefehl erklären.

**Ergebnis:** Zunächst Verbindung auf Port 4200 verweigert. Das bestehende lokale Startskript im eigenen Worktree erneut gestartet; es verwendet weiterhin die ausdrücklich gewünschten vorhandenen Flipbase-Daten und den bisherigen Browser-Proxy. Angular meldet erfolgreichen Entwicklungsbau und aktiven Watch-Modus; die Marktplatzübersicht antwortet mit HTTP 200. Nur bereits bekannte Compilerwarnungen. Keine Produkt-, Konfigurations- oder Datenänderung; nur dieses Sitzungsprotokoll ergänzt. Keine weiteren Tests oder Veröffentlichung erforderlich.

## 2026-10-19 - Juna - Konto hinzufügen an die kompakte Marktplatzauswahl angleichen

**Auftrag:** Das Hinzufügen-Modal in der Marktplatzübersicht mit den überarbeiteten Plattformzeilen abstimmen.

**Umsetzung:** Der Einstieg Konto hinzufügen verwendet die gemeinsame kompakte Liste mit Logo, Name und Pfeil zum nächsten Schritt. Die Plattformauswahl erhält einen ausdrücklichen Navigationsmodus: keine Sichtbar-/Ausgeblendet-Texte und kein irreführender gedrückt-Zustand bei einmaliger Plattformwahl. Die Sichtbarkeitseinstellungen behalten ihre Umschaltfunktion; die übrige Kachelauswahl bleibt unverändert. Der erste Schritt benötigt nur X beziehungsweise Escape zum Schließen und keinen leeren Aktionsfooter. Nach Plattformwahl stehen Zurück links und die vorhandenen Verbindungsaktionen rechts. Der bestehende separate Vinted-Anmeldedialog sowie eBay-/Kleinanzeigen-Verbindung bleiben erhalten. Keine neue Verbindung oder Veröffentlichung allein durch die Plattformwahl.

**Prüfungen:** Alle 43 betroffenen Komponententests und 45 vorhandenen Browserfälle für Übersicht und Übertragung erfolgreich. Bestehenden Kontextfall um Plattformwahl, Zurück, Schließen per Escape und Fokusrückgabe ergänzt. Vier zusätzliche Sichtfälle für 390/1440 Pixel, Hell/Dunkel, AXE, gleichmäßige Zeilen, alle drei Plattformen und Rücknavigation bestanden. Dabei den vorhandenen separaten Vinted-Anmeldeschritt ausdrücklich berücksichtigt; erste Sichtprüfung hatte fälschlich einen unmittelbar bedienbaren äußeren Zurück-Button angenommen. Abschließende Desktop-/Handyaufnahmen angesehen. Lint, Formatierung, Typprüfung, Shared-UI ohne Befund und Produktionsbau erfolgreich.

**Betrieb:** Entwicklungsserver mit bestehenden Flipbase-Daten bleibt aktiv. Konten- und Anbietervorgänge in automatisierten Prüfungen nur simuliert; keine realen Konten hinzugefügt oder Freigaben geändert. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Marktplatzeinstellungen als kompakte Liste gestalten

**Auftrag:** Die unruhige Einstellungskarte mit drei großen Plattformbuttons und uneinheitlichen Kontoverwaltungslinks durch eine übersichtlichere Darstellung ersetzen.

**Umsetzung:** Pro Marktplatz eine Zeile mit bestehendem Logo, Name und Sichtbarkeitsstatus. Die gemeinsame Plattformauswahl erhält dafür eine Listenansicht; ihre Kacheldarstellung beim Erstellen und Übertragen von Inseraten bleibt Standard. Der zusätzliche Aktiv-Zähler und die drei verstreuten Verwaltungslinks entfallen. Ein gemeinsamer Einstieg führt zur Marktplatzübersicht mit allen Konten und Inseraten. Die Einstellung gilt weiterhin für die Menüsichtbarkeit; vorhandene Konten, Freigaben und laufende Aufträge bleiben unverändert. Im Sichtbarkeitsdialog steht dieselbe Liste ohne zusätzliche innere Karte und ohne Verwaltungslink. Laden, Speichern, Fehlermeldung und Wiederholung bleiben erhalten.

**Prüfungen:** 38 betroffene Übersichts-/Übertragungs-Komponententests bestanden; die fünf Einstellungstests nach Anpassung der verbliebenen Erwartung an den entfernten Zähler vollständig erfolgreich, insgesamt 43 bestehende Fälle. Alle 49 vorhandenen Browserfälle für Einstellungen, Übersicht und Übertragung erfolgreich. Vier zusätzliche Sichtfälle für 390/1440 Pixel, Hell/Dunkel, Ausblenden, Erhalt nach Neuladen, Tastatur, AXE und Laufzeitfehler bestanden. Aktuelle Desktop- und Handyaufnahmen angesehen. Lint, Formatierung, Typprüfung, Shared-UI ohne Befund und Produktionsbau erfolgreich. Der vorhandene eBay-Seitentest startet direkt bei eBay; den gemeinsamen Verwaltungseinstieg prüfen die Einstellungslayoutfälle und Komponententests.

**Betrieb:** Lokaler Entwicklungsserver mit bestehenden Flipbase-Daten bleibt aktiv. Alle automatisierten Einstellungs-/Kontenänderungen verwenden simulierte Antworten. Keine echte Verbindung getrennt und keine Anbieteranzeige verändert. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Kontostatus unabhängig von der Namenslänge ausrichten

**Auftrag:** Versetzte Statusbadges hinter unterschiedlich langen Kontonamen vermeiden und einheitliche kompakte Abmessungen erhalten.

**Umsetzung:** Kontoidentität verwendet auf breiten Ansichten eine feste Statusspalte. Name und Status sind damit unabhängig voneinander ausgerichtet. Auf schmalen Ansichten steht der Status immer links in seiner eigenen Zeile, statt je nach Namenslänge zwischen Kopfzeile und Folgezeile zu wechseln. Der vorhandene Badge-Baustein behält seine einheitliche Höhe von 20 Pixeln, Schrift und Innenabstände; die Breite folgt weiter dem jeweiligen Text. Keine globale Badge-Änderung, kein veränderter Verbindungsstatus oder Kontenablauf.

**Prüfungen:** Alle 33 betroffenen Browserfälle erfolgreich. Die bestehende Darstellungsmatrix enthält jetzt gleichzeitig ein verbundenes und ein pausiertes Konto und prüft bündige Statusposition sowie gleiche Höhe über mehrere Konten bei 320/390/834/1440 Pixeln, Hell/Dunkel und Touch. Desktop- und Handyaufnahmen angesehen; AXE und Tastatur erfolgreich. Lint, Formatierung, Typprüfung und Produktionsbau bestanden.

**Betrieb:** Lokaler Entwicklungsserver mit bestehenden Flipbase-Daten bleibt aktiv. Kontozustände im automatisierten Test nur simuliert; keine realen Konten pausiert oder anderweitig verändert. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Kontokarten in der Marktplatzübersicht übersichtlich anordnen

**Auftrag:** Die unstrukturierte Stapelung aus Kontoname, Status, Inseratzahl und letztem Abgleich sowie die getrennt wirkenden rechten Aktionen überarbeiten.

**Umsetzung:** Gemeinsame Kontokarte für Vinted, eBay und Kleinanzeigen mit drei klaren Bereichen: Name und Status zusammen, beschriftete Kennzahlen für Inserate und letzten Abgleich, daneben kompakte Aufklapp-/Einstellungsaktionen. Breite Ansichten verwenden über mehrere Karten bündige Spalten; auf schmalen Geräten stehen die Kennzahlen in einer eigenen Zeile. Die Aktion Inserate verwendet den vorhandenen dezenten Buttonstil mit Pfeil. Verbundene Konten erscheinen einheitlich mit dem Erfolgsbadge, bestehende Warnzustände und Kleinanzeigen-Statusaufbereitung bleiben erhalten. Keine zusätzliche Karte innerhalb des Kontokopfs und keine neuen globalen UI-Varianten. Unbekannte Werte bleiben ausdrücklich unbekannt; tatsächliche Datenquellen, Kontentrennung und verzögertes Laden beim Aufklappen unverändert.

**Prüfungen:** Alle 33 bestehenden Browserfälle für Übersicht und Kleinanzeigen erfolgreich, einschließlich 320/390/834/1440 Pixeln, Hell/Dunkel, Touch, Tastatur, AXE und Kontenabläufen. Erwartungen an die jetzt getrennt beschrifteten Kennzahlen angepasst. Nach dem bündigen Spaltenabgleich alle acht vorhandenen Übersichtslayoutfälle erneut erfolgreich; diese sichern nun auch die identische Spaltenposition mehrerer Karten. Aktuelle Desktop- und Handyaufnahmen angesehen. Lint, Formatierung, Typprüfung, Shared-UI mit null Befunden und Produktionsbau erfolgreich. Keine neuen Tests, die nur den Vorlagenaufbau nachbilden.

**Betrieb:** Bestehender lokaler Entwicklungsserver mit den vom Nutzer gewünschten Flipbase-Daten bleibt aktiv; automatisierte Prüfungen ausschließlich mit simulierten Konten. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Marktplatzübersicht zeigt alle Konten ohne zusätzliche Auswahl

**Auftrag:** Kontoauswahl wie Alle Konten und die Kontenanzahl-Badges neben den Plattformnamen aus der Übersicht entfernen. Alle Konten bleiben sichtbar, ihre Inserate weiter einzeln einklappbar.

**Umsetzung:** Vinted, eBay und Kleinanzeigen zeigen unmittelbar sämtliche Kontokarten. Die überflüssige Auswahl samt Optionsaufbereitung, ungenutzten Komponentenimporten und ausschließlich dafür vorhandener Filterlogik entfernt. Die Kleinanzeigen-Seite greift entsprechend direkt auf ihre vollständige Kontenliste zu. Inseratfilter, Kontoauswahl beim Erstellen, Kontoverwaltung und Status-Badges bleiben erhalten. Das Öffnen einer zweiten Kontoliste verändert die Inseratauswahl der ersten nicht.

**Prüfungen:** Alle 33 vorhandenen Browserfälle für Übersicht/Kleinanzeigen mit 320/390/834/1440 Pixeln, Hell/Dunkel, Touch, AXE und Tastatur bestanden. Bestehender Mehrkontenfall an die vollständige Anzeige angepasst; Kontentrennung, Sichtbarkeit nach Neuladen und getrennte Inseratauswahl gesichert. Nach ergänzter Auswahl-Erwartung diesen Fall nochmals erfolgreich geprüft. 15 betroffene Komponenten-/Zustandstests und neun Testregistrierungsfälle erfolgreich. Umbenannten Browserfall auch in der verbindlichen Registrierungsprüfung aktualisiert. Lint, Formatierung, Typprüfung und Produktionsbau erfolgreich; aktuelle Desktopaufnahme angesehen.

**Betrieb:** Entwicklungsserver mit bestehenden Flipbase-Daten bleibt aktiv. Automatisierte Tests verwenden simulierte Antworten, keine echten Kontoänderungen oder Veröffentlichungen. Kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Kontokopf bei Vinted und eBay nachprüfen

**Auftrag:** Die abgestimmte Aufteilung auch für die anderen Marktplätze übernehmen beziehungsweise prüfen.

**Befund:** Vinted und eBay verwenden bereits denselben gemeinsamen Kontokopf wie Kleinanzeigen. Die zuletzt geänderte horizontale Aufteilung ist deshalb dort ebenfalls wirksam: Logo links, Kontoidentität daneben mittig, Status rechts. Die übrigen Einstellungen bleiben entsprechend ihrer bestehenden Aufgaben unterschiedlich: Vinted mit lokalem beziehungsweise Cloud-Zugang, Benachrichtigungen und Kontoverwaltung; eBay mit OAuth-Verbindung und Statusabruf. Keine zusätzliche Produktänderung für die bereits wirksame Kopfzeile erforderlich.

**Prüfung:** Acht gezielte Browserfälle für Vinted/eBay bei 390/1440 Pixeln, Hell/Dunkel, AXE, mittiger Kontoidentität, rechts stehendem Status und Escape erfolgreich. Aktuelle Aufnahmen beider Desktopmodale angesehen. Keine realen Kontenaktionen; Entwicklungsserver bleibt aktiv. Nur Dokumentation ergänzt, kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Kontoidentität und Verbindungsstatus nebeneinander

**Auftrag:** Name und Kontotyp neben dem Marktplatzlogo vertikal zentrieren und das Status-Badge rechts ausrichten, damit die Kontoangaben weniger untereinander stehen.

**Umsetzung:** Gemeinsamer Kontokopf für Kleinanzeigen, Vinted und eBay zeigt Logo links, Name und Kontotyp als mittig ausgerichteten Textblock daneben und den Status am rechten Rand. Lange Kontonamen umbrechen innerhalb des verfügbaren Textbereichs; das Badge bleibt rechts. Der zentrierte Hinzufügen-Einstieg bleibt erhalten. Keine Änderung an Verbindung, Berechtigungen, Anbieterdaten oder Dialogaktionen.

**Prüfungen:** 91 bestehende Komponententests der vier Einsatzstellen sowie 28 Browserfälle erfolgreich, einschließlich Hinzufügen, Kontoverwaltung, Maus/Touch, 320/390/834/1440 Pixeln und Hell/Dunkel. Die bestehende Ausrichtungsprüfung folgt der neuen Nutzerentscheidung: Textblock mittig zum Logo und Status rechts neben dem Namen. Zusätzliche Sichtfälle aller drei Marktplätze und Desktop-/Handyaufnahmen geprüft; AXE, Fokus und Escape erfolgreich. Lint, Formatierung, Typprüfung und Produktionsbau erfolgreich.

**Betrieb:** Entwicklungsserver für den direkten Test mit bestehenden Flipbase-Daten bleibt aktiv; automatisierte Prüfungen ausschließlich mit simulierten Konten. Keine echten Kontenaktionen oder Veröffentlichungen. Weiterarbeit im unveröffentlichten Zweig; kein Push, PR, Merge oder Deployment.

## 2026-10-19 - Juna - Kontokopf und gemeinsame Dialogaktionen nachziehen

**Auftrag:** Den Kontonamen an der Oberkante des Marktplatzlogos ausrichten, Konto entfernen und Inserate abgleichen in einer gemeinsamen Aktionszeile anbieten und den überflüssigen Schließen-Button aus der Kontoverwaltung entfernen.

**Umsetzung:** Der gemeinsame Kontokopf richtet nicht zentrierte Kontoidentitäten am Logo aus; der zentrierte Hinzufügen-Einstieg bleibt erhalten. Kleinanzeigen bündelt Entfernen, gegebenenfalls Freigabe erneuern und Abgleichen im Footer. Die bestehende Bestätigung zum Entfernen sowie Abgleich bei älteren Lesefreigaben bleiben erhalten. eBay verwendet dieselbe Anordnung für Verbindung trennen und Status aktualisieren. Die Kontoverwaltungen schließen über X oder Escape; die Vinted-Verwaltung in der Übersicht erhält keinen leeren Footer. Schließen beim Hinzufügen und Zurück zum Inserat bleiben als eigene Ablaufschritte erhalten. Auf schmalen Geräten dürfen die Aktionen innerhalb desselben Footers umbrechen.

**Prüfungen:** Alle 129 betroffenen Komponententests und 28 gezielte Browserfälle bestanden. Vorhandene Kleinanzeigen-Fälle prüfen dauerhaft die gemeinsame Footer-Platzierung, fehlenden redundanten Schließen-Button und gemessene Logo-/Namensausrichtung. Sichtprüfung aller drei Plattformen bei 390/1440 Pixeln, Hell/Dunkel, AXE und Tastatur erfolgreich. Erste Messung zeigte, dass ein Klassenbinding mit Dezimalpunkt den Abstand verkürzte; vollständige Klassenbindung verwendet und danach die tatsächliche Oberkante erneut geprüft. Lint, Formatierung, Typprüfung und abschließender Produktionsbau erfolgreich. Endgültige Desktop- und Handyaufnahmen angesehen; lokale Anwendung abschließend mit HTTP 200 erreichbar.

**Betrieb:** Lokaler Entwicklungsserver mit bestehenden Flipbase-Daten bleibt aktiv. Automatisierte Prüfungen verwenden simulierte Konten; keine echten Konten geändert oder Anzeigen veröffentlicht. Kein Push, PR, Merge oder Deployment; CI/Linux noch offen.

## 2026-10-19 - Juna - Marktplatz-Modale mit klarer visueller Ordnung

**Auftrag und Eingrenzung:** Der Nutzer beanstandet die beliebige Abfolge aus Titel, Fließtext und verteilten Aktionen. Auf Rückfrage ausdrücklich zuerst die Marktplatz-Modale bearbeiten. Kontoauswahl, Hinzufügen und Verwaltung für Vinted, eBay und Kleinanzeigen sowie die Navigation beim Inserieren innerhalb des bestehenden Flipbase-Designs ordnen; andere Anwendungsmodale unverändert.

**Gestaltung:** Gemeinsamer rein visueller Kontokopf mit vorhandenen Plattformlogos, Kontoidentität und Status; zentrierter Einstieg beim Hinzufügen. Keine neue Schrift-, Farb- oder globale Dialogvariante. Kleinanzeigen stellt Inseratzahl und beobachtetes Kontingent als getrennte Kennzahlen dar, darunter Zeitpunkte als beschriftete Datenzeilen. Hauptaktionen über die bestehenden Dialog-Footer, Entfernen als getrennte destruktive Aktion. eBay zeigt für verbundene Konten passende Kontodaten statt wiederholter Anmeldeanweisungen. Vinted erhält denselben Kontokopf; ausführliche lokale Einrichtungsschritte sind bei Bedarf aufklappbar, notwendige Profil-/Fehlermeldungen bleiben sichtbar. Beim Inserieren steht Zurück im Footer. Die bestehenden kompakten Maus- und größeren Touch-Zielflächen bleiben bestehen. Kein Schema-, Berechtigungs-, Server- oder Erweiterungsumbau.

**Prüfungen und Zwischenbefunde:** Alle 129 betroffenen Komponententests erfolgreich; Rendering-Ressource des neuen gemeinsamen Bausteins in den bestehenden Testaufbereitungen ergänzt und Erwartungen an bewusst entfernte Wiederholungstexte angepasst. Browserprüfung fand nach der Footer-Verlagerung einen fehlenden Inseratabgleich bei älteren Lesefreigaben. Abgleich und Veröffentlichung wieder korrekt getrennt angeboten, danach alle zwölf Kleinanzeigen-Browserfälle bestanden, einschließlich des unveränderten Fehler-/Kontentrennungsablaufs. Alle weiteren 92 Vinted-/eBay-/Übersichts-/Inserieren-Fälle anschließend vollständig erfolgreich, zusammen mit den zwölf Kleinanzeigen-Fällen 104 betroffene Browserfälle bestanden. Zwölf zusätzliche Sichtfälle für drei Plattformen, 390/1440 Pixel, Hell/Dunkel, AXE und Fokus bestanden. Sichtaufnahmen zeigten noch doppelte eBay-Aktion und Vinted-Statusanzeige; beide bereinigt. Danach 19 gezielte Sicht-/Einbindungsfälle einschließlich aller drei Plattformen, Hell/Dunkel und 390/1440 Pixeln sowie weitere 48 direkt betroffene Komponententests erfolgreich. Keine Konsolen-Laufzeitfehler in den Sichtfällen, AXE und Escape weiterhin erfolgreich. Lint, Format, Typen, Shared-UI, Suite-Audit und neun Browserauswahl-Prüfungen bisher erfolgreich. Abschließender Produktionsbau mit allen Angular-Vorlagen, erneute Typprüfung und Testregistrierung erfolgreich; nur bereits bekannte Bauwarnungen. Endgültige Aufnahmen aller drei Kontomodale und des Hinzufügen-Dialogs angesehen, lokaler Server nach Abschluss mit HTTP 200 erreichbar.

**Betrieb:** Vorhandener Entwicklungsserver mit den vom Nutzer gewünschten bestehenden Flipbase-Daten bleibt aktiv. Konten-/Anbieterabläufe der automatisierten Prüfungen ausschließlich mit simulierten Antworten; keine echte Verbindung, Entfernung, Anmeldung oder Veröffentlichung durchgeführt. Weiterarbeit im bestehenden unveröffentlichten Zweig juna/kleinanzeigen-dialog-surface; kein Push, PR, Merge oder Deployment. Pflicht-CI/Linux noch offen.

## 2026-10-19 - Juna - Kleinanzeigen-Verknüpfung korrekt und Inserate direkt anzeigen

**Auftrag und Ursache:** Der Nutzer sieht nach erfolgreichem Verknüpfen fälschlich Anmeldung erforderlich und in der Verwaltung einen grauen Verbindungsstatus. Der deklarative Verbindungsablauf setzt needs_login auch nach bestätigter Kontoprüfung bis zum vollständigen Inseratabgleich. Die Übersicht übersetzte diesen technischen Abgleichstatus als tatsächliche Loginaufforderung; die Kontoverwaltung verwendete dagegen die aktive Freigabe und einen neutralen Farbton.

**Umsetzung:** Gemeinsame Statusaufbereitung trennt aktive Kontoverknüpfung und Abgleich. Aktive Freigabe erscheint in beiden Ansichten mit dem gemeinsamen grünen Erfolgsbadge; fehlende oder widerrufene Freigaben bleiben erkennbar. Tatsächlich gemeldete Login-/Kontowechselfehler bleiben als konkrete Abrufhinweise sichtbar, gespeicherte Inserate erhalten. Der rohe Serverstatus wird weder überschrieben noch für Veröffentlichungen umgedeutet. Kleinanzeigen-Seite lädt die gespeicherten Inserate jedes Kontos direkt: oben die Kontokarte mit Zahnrad, darunter eine eigene Inseratekarte mit bestehender Suche, Auswahl und Seitennavigation. Kein Aufklappen nötig. Die gemeinsame Übersicht bleibt aufklappbar. Erneutes Laden öffnet vorhandene Abschnitte nicht versehentlich wieder zu. Nur gespeicherte Daten werden angezeigt, kein automatischer Anbieterabgleich oder Schreibvorgang gestartet.

**Prüfung:** Zwei gezielte Statusfälle zunächst rot, anschließend sechs neue schnelle Status-/Fehlerfälle und alle 88 betroffenen Komponenten-/Store-/Servicefälle erfolgreich. Breiter Browserlauf mit 61 bestandenen Fällen einschließlich Übertragungs- und Gebührenstopp. Nach der abschließenden Kartenaufteilung 23 von 27 Darstellungsfällen direkt grün; vier mobile AXE-Fälle wiesen die übersprungene Überschriftenebene der neuen Kartenüberschrift nach. Semantische Ebene korrigiert, keine AXE-Regel gelockert; anschließend alle zwölf Kleinanzeigen-Fälle einschließlich 320/390/834/1440 Pixeln, Hell/Dunkel, Maus/Touch, grüner Status in Liste und Modal, direkt sichtbarer Inserate, Suche, Seitenwechsel und Kontentrennung erfolgreich. Typen, Format, gezieltes Lint, Shared-UI, Suite-Audit mit neuer Modelldatei und neun Browserregistrierungsfälle bestanden. Abschließender Produktionsbau erfolgreich; zwei zusätzliche Sichtfälle bei 390/1440 Pixeln mit AXE, Konsolenprüfung, zwei getrennten Karten und ohne automatisch gestarteten Anbieterabgleich bestanden. Aufnahmen außerhalb des Repositories angesehen.

**Betrieb und Grenzen:** Weiterarbeit im bestehenden unveröffentlichten Zweig juna/kleinanzeigen-dialog-surface. Lokaler Entwicklungsserver bleibt mit den vom Nutzer ausdrücklich gewünschten bestehenden Flipbase-Daten erreichbar. Alle automatisierten Kontentests verwenden ausschließlich simulierte Antworten; keine echten Konten getrennt, verbunden oder Anzeigen veröffentlicht. Keine Schema-, Server-, Erweiterungs- oder Berechtigungsänderung. Kein Push, PR, Merge oder Deployment; Linux-/Pflicht-CI stehen noch aus.

## 2026-10-18 - Juna - Kleinanzeigen-Verbindung mit klarer Hauptaktion

**Auftrag:** Den Hinzufügen-Dialog deutlich vereinfachen. Die Veröffentlichung gehört beim Hinzufügen zum gewünschten Verbindungsumfang; dafür soll keine zusätzliche Checkbox nötig sein.

**Umsetzung:** Kurzer Anmeldehinweis statt mehrerer Erklärungstexte, keine verschachtelte Karte und keine separate Veröffentlichungswahl. Konto verbinden steht neben Schließen im Dialog-Footer; die wiederverwendete Aktionsvorlage bleibt im Kontenbaustein, sodass Kleinanzeigen-Seite, Marktplatzübersicht und Inserieren dieselben Bedingungen verwenden. Erweiterung prüfen erscheint nur bei fehlender Erreichbarkeit. Verbinden und Erneuern fragen die Veröffentlichungsfreigabe ausdrücklich mit an. Die Kontoprüfung und Bestätigung in der Erweiterung bleiben bestehen. Bestehende reine Lesefreigaben lassen sich über Freigabe erneuern auf denselben Umfang bringen; keine stillschweigende Änderung bestehender Freigaben, keine automatische Veröffentlichung beim Verbinden. Keine Änderung an Serververträgen, Erweiterung oder Gebühren-/Kontingentschutz.

**Prüfung:** Vor der Verhaltensänderung vier gezielte erwartete Fehler bestätigt; den fehlenden Erneuerungseinstieg bei aktiver Lesefreigabe anschließend separat rot nachgewiesen. Nach Korrektur alle 69 betroffenen Komponententests für Konten, Kontoaktionen, Übersicht und Übertragungsdialog erfolgreich. Enthalten sind Veröffentlichungsumfang bis zur Erweiterungs-/Serveranfrage, abgebrochene Bestätigung, Erneuerung und Kontentrennung. Im breiteren Browserlauf 60 von 61 Fällen direkt bestanden; die Einstellungen-Fehlerprüfung verwendete lokal zunächst fünf Sekunden statt der verbindlichen 15 Sekunden aus playwright.pr.config.ts. Mit identischem CI-Wartefenster gezielt bestanden (8,4 Sekunden); kein Produktcode oder Fehlerverhalten dafür geändert. Kontingent 100/101, unbekanntes Kontingent, Gebühren und fehlende Erweiterung stoppen weiterhin. Nach der letzten Lesefreigabe-Korrektur zusätzlich alle 17 betroffenen Konten-/Übersichts- und Sichtfälle gezielt bestanden. Hell/Dunkel, 320/390/834/1440 Pixel, Maus/Touch, Fokus und AXE enthalten. Aufnahmen außerhalb des Repositories angesehen; Kontenvorgänge ausschließlich simuliert. Alle 30 Gebühren-/Browserauswahl-Prüfungen, Typen, gezieltes Lint, Format, Shared-UI und Suite-Audit bestanden. Abschließender Produktionsbau und erneute Typprüfung ebenfalls erfolgreich; nur bereits bekannte Bauwarnungen.

**Betrieb und Grenzen:** Bestehender lokaler Entwicklungsserver auf http://127.0.0.1:4200 mit ausdrücklich gewünschten bestehenden Flipbase-Daten bleibt aktiv. Keine echte Kontoverbindung, Löschung oder Veröffentlichung durch die Prüfungen. Unveröffentlichter gemeinsamer Arbeitszweig juna/kleinanzeigen-dialog-surface; kein Push, PR, Merge oder Deployment. Linux-/Pflicht-CI noch nicht ausgeführt.

## 2026-10-18 - Juna - Kleinanzeigen-Kontendialog ohne innere Karten

**Auftrag:** Die im Screenshot erkennbare zusätzliche Karte im Hinzufügen-Dialog entfernen und die Anwendung lokal im Entwicklungsmodus für direkte Nutzertests starten. Nutzer wählt ausdrücklich seine bestehenden Flipbase-Daten.

**Umsetzung:** Kartenflächen aus dem eingebetteten Kleinanzeigen-Kontenbaustein entfernt, auch für Verwaltung und Leerzustand. Der gemeinsame Dialograhmen und seine Abstände bleiben bestehen; leeres Kontenraster ausgeblendet, ungenutzte Kartenimporte entfernt. Desktop-/Touch-Größen, Verbindung, Freigabe und Gebührenstopp unverändert. Eigener Zweig auf origin/master `0a29ee5e`; fremde Änderungen im ursprünglichen Arbeitsordner unberührt.

**Prüfung:** Alle 53 bestehenden Komponententests für Konten, Übersicht und Übertragungsdialog sowie alle 12 Kleinanzeigen-Browserfälle bestanden. Zusätzlich vier lokale Sichtprüfungen des Hinzufügen-Dialogs bei 390/1440 Pixeln in ausdrücklich gesetztem Hell/Dunkel: Checkbox, Escape/Fokusrückgabe, AXE, kein horizontaler Überlauf und keine Konsolen-/Laufzeitfehler. Aufnahmen außerhalb des Repositories angesehen. Im ersten temporären Prüflauf wurde die asynchron gerenderte Checkbox nach `check()` zu früh bewertet; mit Klick und anschließend abgewarteter Zustandsprüfung bestehen alle vier Fälle. Typprüfung, gezieltes Lint, Format, Shared-UI-Prüfung und Produktionsbau erfolgreich; nur bereits bekannte Bauwarnungen. Browser-Plugin nicht verfügbar; reguläres Playwright genutzt. Kontenvorgänge in diesen Prüfungen ausschließlich simuliert, keine echten Konten entfernt oder Inserate veröffentlicht. Kein neuer dauerhafter Testfall für die reine Flächenkorrektur nötig.

**Lokaler Testbetrieb:** Angular-Entwicklungsserver unter `http://127.0.0.1:4200` mit öffentlicher Browser-Konfiguration von `https://api.flipbase.de`; Browser-Dienst wird zum bestehenden öffentlichen App-Endpunkt weitergeleitet. Ausschließlich ignorierte Start-/Konfigurationsdateien im eigenen Worktree, keine Änderung der versionierten Umgebungsdateien und keine internen Server-Schlüssel. Echter Login bleibt dem Nutzer überlassen. Lokale Änderungen an Konten und Inseraten wirken auf seine bestehenden Daten; Nutzer darüber informiert. Server bleibt zum Testen aktiv. Kein Push, PR, Merge oder Deployment dieser Korrektur.

## 2026-10-19 - Juna - Verbindliche App-Aktualisierung und Prüfung bei Rückkehr

**CI-Nachprüfung:** PR #445 wurde nach der Freigabe erstellt. Im ersten Lauf waren Qualität, sämtliche Anwendungstests und Produktions-PWA erfolgreich. Der umfassende Browserlauf stoppte nach 140 bestandenen Fällen am unveränderten Sitzungsschutz: Die gemeinsame Anmeldung galt nur 15 Minuten; 84 weitere Fälle waren noch offen. Den langen Standardlauf deshalb in drei sequenzielle Teilgruppen mit jeweils frischem globalem Setup aufgeteilt. Alle 225 vorgesehenen Browserfälle bleiben genau einmal enthalten, gezielte Auswahl und ausdrücklich vorgegebene Gruppen unverändert. Weder Sitzungslaufzeit, Sicherheitsmarge noch Wartezeiten oder Assertions abgeschwächt. Neue Runner-Regressionen vor der Korrektur rot; danach 37 Runner-/Registrierungsprüfungen unter Windows und in einer eigenständigen Linux-Kopie (Node 22.23.3) erfolgreich. Vollständige Workflow-Prüfung: 525 erfolgreich, sechs bestehende bedingte Skips, Shared-UI-Audit ohne Befund. Format, Lint und unabhängiges Review erfolgreich. CI muss den korrigierten vollständigen Lauf vor dem Merge bestätigen.

**Abschlussfreigabe:** Nutzer hat PR-Erstellung, Branch-Push und Merge nach erfolgreichen Pflichtprüfungen ausdrücklich freigegeben. Umsetzung als `d0eff639` lokal geprüft; aktuelles `origin/master` vor dem Push unverändert `7b80b8fa`. Nach erfolgreicher CI per Merge-Commit integrieren, Veröffentlichung prüfen und eigenen Zweig samt Arbeitsbereich aufräumen.

**Auftrag:** Freigegebenen Ablauf mit voller Aktualisierungsseite ohne „Später“, Prüfung beim Zurückkehren und Schutz offener Eingaben umsetzen; ausbleibende iPad-Hinweise untersuchen.

**Umsetzung:** Bestehendes Mehrfenster-Aktivierungsprotokoll erhalten. Start, Sichtbarkeitswechsel, Fokus, `pageshow` und erneute Verbindung prüfen gezielt; gleichzeitige Ereignisse teilen eine laufende Prüfung. Nach mindestens einer Minute Hintergrundpause erscheint ohne offene Eingaben kurz die Logo-Prüfung. Nach acht Sekunden endet eine hängende Prüfungsansicht mit erreichbarer Wiederholung; später fertig installierte Versionen bleiben erkennbar. Fehler beim Statuskontakt zu beendeten Workern unterbrechen die Netzwerkprüfung nicht mehr. Fehlgeschlagene Startregistrierungen werden sichtbar und können ohne Neuladen erneut versucht werden.

**Eingaben und Darstellung:** Vollseite mit Flipbase-Logo, Logo-Gelb und „Jetzt aktualisieren“, ohne spätere Verschiebung oder Escape-Schließen. Bestehende Routensperren, offene Angular-Formulare und eigenständige Felder, ausstehende Prüfungen, als beschäftigt markierte Aktionen sowie andere Eingabedialoge erhalten Vorrang. Statt der Sperrseite bleibt ein Speicherhinweis; ältere Masken nach dem Speichern schließen, wenn sie ihren Änderungsstatus nicht zurücksetzen. Keine automatische Speicherung oder Verwerfung. Unabhängiges Review fand zunächst ungeschützte ältere Formulare und fehlende Wiederholung der Registrierung; beide Lücken samt eigenständigen Feldern und laufenden Speicheraktionen durch rot/grün geprüfte Regressionen korrigiert. Abschließendes Review ohne weitere wichtige Befunde.

**Prüfungen:** `npm test`: 5.620 Fälle erfolgreich (2.627 Node, 354 DOM, 2.639 Angular); `npm run test:pwa:scripts`: 41 erfolgreich. Produktions-PWA mit jeweils zwei frischen App-Bauten unter Windows sowie Linux (Node 22.23.3, Playwright 1.62.1, 4 CPUs/8 GB): jeweils 34 erfolgreich und ein erwarteter Desktop-Skip, dessen eingefrorene Hintergrundansicht im mobilen Projekt geprüft wird. Enthalten sind volle Bildschirmabdeckung, Fokus/Escape, AXE in Hell/Dunkel, Logo-Gelb, offener Einkauf und Kontoprofil sowie Mehrfenster- und Legacy-Übergänge. Eine weitere rot/grün belegte Race beim Ende kurzer Beschäftigt-Zustände korrigiert: Der passende wartende Worker wird nach erneuter Sicherheitsprüfung wieder angesprochen. Browserprüfungen verwenden den bestätigten Workerzustand und überstehen den dabei erwarteten Dokumentwechsel. Lint, Typprüfung, Formatierung, Suite-Audit und 33 Testauswahl-/Registrierungsprüfungen erfolgreich. Vorhandene Bauwarnungen zu ungenutzten Imports, Anfangspaket und `pako` bleiben bestehen.

**Testumgebung:** Angular teilte unter Windows zunächst den Cache des Hauptarbeitsbereichs und scheiterte an unterschiedlichen Pfadschreibweisen. Für die Prüfung wurde ausschließlich vorübergehend ein absoluter Cache im eigenen Arbeitsbereich verwendet; `angular.json` ist unverändert wiederhergestellt. Die Linux-Kopie enthielt alle erforderlichen versteckten Konfigurationsdateien. Der eigene Linux-Testcontainer und sein Testvolume wurden nach Abschluss entfernt, andere Projekte bleiben unberührt.

**Grenzen:** Ohne Gerätelog keine konkrete iPad-Ursache behauptet. Echte iPad-/iPhone-Home-App-Abnahme bleibt offen; WebKit-Oberflächentests ersetzen sie nicht. Keine Datenbankänderung und keine Produktionsaktion. CI wählt wegen des zentralen App-Templates einen umfassenden Prüfumfang; die zusätzliche vollständige Browserauswahl bleibt vor einem Merge Pflicht. Eigener Zweig `juna/pwa-required-update` auf Basis `origin/master` (`7b80b8fa`); fremde Arbeitsbereiche und Änderungen unverändert.

## 2026-10-19 - Juna - Gewinnfarbe und Streifenabstand an die Bildreferenz angleichen

**Abschlussfreigabe:** Nutzer hat PR-Erstellung und Merge nach sämtlichen erfolgreichen ausgewählten Prüfungen ausdrücklich freigegeben. Aktueller Hauptzweig unverändert `7b4870ff`; lokale Umsetzung als `a2a9d5dd` geprüft. Vor dem Merge die vollständige betroffene Browserauswahl unter Linux einschließlich echter lokaler Anmeldung abwarten. Anschließend mit Merge-Commit integrieren, öffentliche Bereitstellung prüfen und eigenen Zweig samt Arbeitsordner aufräumen.

**Auftrag:** Gewinn dunkler und näher am eingereichten Bild darstellen; diagonale Streifen in den Diagrammsäulen weiter auseinander setzen.

**Referenz und Umsetzung:** Bildausschnitt angesehen und die häufigste Grundfarbe der Gewinnsäule direkt ausgelesen: `#006b73`. Dieser Wert wird bereits im hellen Schema verwendet und bleibt erhalten. Im dunklen Schema wurde bisher `#52b7bd` verwendet; dort jetzt gedecktes Grün `#288b78`. Gelb und Grau unverändert. SVG-Kachel und tatsächliche Apex-Bildfüllung von 8 × 8px auf 12 × 12px vergrößert, Linienstärke 1px und Weiß mit 16 Prozent Deckkraft erhalten. Legende und Details verwenden weiterhin dieselbe Palette wie die Säulen. Verbindliche Gestaltungsregel aktualisiert.

**Prüfung:** Vorhandene Konfigurationsfälle an die gewünschte dunkle Gewinnfarbe und 12px-Musterperiode angepasst; vor der Änderung schlagen beide Themenfälle erwartungsgemäß fehl. Alle 15 ausgewählten Modell-/Finanzfarbenprüfungen und 30 Routen-, Dashboard- und Diagrammkomponentenfälle bestanden. Neun vorhandene Browserfälle für Touch bei 320/390/834/1.194px in Hell/Dunkel einschließlich AXE sowie große Werte erfolgreich. Zusätzliche gefüllte Abnahme mit HTTP-Beispieldaten: tatsächliche Musterfüllungen, dunkle Palette nach Themenwechsel, Pointer-/Tastaturdetails und Legendenschalter ohne Laufzeitfehler. Desktop-, Mobil- und gezielte Diagrammaufnahmen in beiden Farbschemata außerhalb des Repositorys gesichert und angesehen. Format, Lint, Typprüfung und Produktionsbau bestanden. Eine externe Sichtprüfungsannahme zu Bildbreiten korrigiert: Apex erzeugt bei der 12px-Kachel eine 13px-breite Bildfläche; intrinsische SVG-Größe und tatsächliche 12px-Höhe gesichert. Kein Anwendungsfehler und keine Abschwächung der bestehenden Prüfungen.

**Prüfumfang:** Die tatsächliche Auswahl umfasst die zwei Diagramm-/Finanzfarbenmodelle, drei Routen-/Dashboard-/Diagrammkomponenten und vier vorhandene Browserdateien, kein PWA- oder Datenbanklauf. Lokal Chromium unter Windows mit simulierten HTTP-Antworten; die übrigen vorhandenen Fälle mit echter lokaler Anmeldung und die Linux-CI bleiben vor dem Merge erforderlich. Keine neuen oder verschobenen Testdateien.

**Arbeitsstand:** Eigener Zweig `juna/overview-chart-green` auf `7b4870ff`. Keine neue Abhängigkeit, Datenbankänderung, Anbieteraktion oder Veröffentlichung; fremde Arbeitsordner bleiben unverändert.

## 2026-10-19 - Juna - Artikelspalte verbreitern und Plattformen kompakt anzeigen

**Abschlussfreigabe:** Nutzer hat PR-Erstellung und Merge nach allen erfolgreichen ausgewählten Prüfungen ausdrücklich freigegeben. Aktueller Hauptzweig unverändert `6b4fff5c`; lokale Umsetzung als `42c09f9c` geprüft. Vor dem Merge die vollständige betroffene Browserauswahl einschließlich echter lokaler Anmeldung unter Linux abwarten. Danach mit Merge-Commit integrieren, öffentliche Bereitstellung prüfen und eigenen Zweig samt Arbeitsordner aufräumen.

**Auftrag:** In „Letzte Verkäufe“ mehr Platz für Artikelnamen schaffen und die Plattformspalte auf das Logo ohne sichtbaren Namen reduzieren.

**Umsetzung:** Plattformspalte auf 80px begrenzt. Datum und Gewinn behalten jeweils 20 Prozent der Tabellenbreite; der Artikel erhält den übrigen Raum. Die zuvor gesicherte Kürzung innerhalb der Zelle, vollständiger Linkname und Tooltip bleiben erhalten. Den gemeinsamen Plattformbaustein um eine ausdrücklich aktivierte Logoanzeige ergänzt; der Plattformname bleibt als Screenreader-Text und Tooltip erhalten. Eigene Plattformen behalten das allgemeine Marktplatzsymbol. Nur die Verkaufszeilen der Übersicht aktivieren die neue Darstellung; Stammdaten, Verkaufsliste und Inseratwahl behalten sichtbare Namen. Gestaltungsentscheidung dokumentiert.

**Prüfung:** Vorhandene Komponenten- und Browserfälle um unsichtbare, weiterhin zugängliche Plattformnamen und mindestens doppelte Artikelbreite gegenüber der Plattform erweitert. Die Komponentenprüfung scheitert vor der Änderung am noch sichtbaren Namen. Nach der Umsetzung alle 39 ausgewählten Routen-, Dashboard- und Verkaufsprüfungen sowie neun gezielte Browserfälle erfolgreich. Artikelnamen, Kürzung, Spaltenbreiten, Logo, Tooltip und Tastaturfokus bei 1.440/1.194/834/390/320px geprüft; Touch und AXE in Hell/Dunkel bei 320/390/834/1.194px ohne Laufzeitfehler. Ein im gefüllten Zustand gefundener 4px-Seitenüberlauf entstand durch die absolute Position des Screenreader-Texts; im Logo-Modus jetzt relativ zum eigenen Element begrenzt und die betroffene Prüfung erneut erfolgreich. Format, Lint, Typprüfung und Produktionsbau bestanden. Desktop-/Mobilaufnahmen außerhalb des Repositorys gesichert und angesehen. Keine neuen oder verschobenen Testdateien.

**Prüfumfang:** Die tatsächliche Auswahl berücksichtigt die drei Verbraucher des gemeinsamen Plattformbausteins: Übersicht, Verkäufe und Stammdaten. Drei Angular-Dateien und elf Browserdateien sind ausgewählt, kein PWA- oder Datenbanklauf. Lokal Chromium unter Windows mit HTTP-Beispieldaten; zusätzliche Fälle mit echter lokaler Anmeldung sowie die Linux-CI bleiben vor einem Merge erforderlich. Bestehende Verkaufs-Komponentenprüfungen sind lokal mitgelaufen; die sichtbaren Namen außerhalb der Verkaufszeilen bleiben der Standard.

**Arbeitsstand:** Eigener Zweig `juna/overview-sale-columns` auf `6b4fff5c`. Fremde Arbeitsordner bleiben unverändert. Keine Datenbankänderung, neue Abhängigkeit, Anbieteraktion oder Veröffentlichung.

## 2026-10-19 - Juna - Artikelnamen in den letzten Verkäufen begrenzen

**Abschlussfreigabe:** Nutzer hat PR-Erstellung und Merge nach sämtlichen erfolgreichen ausgewählten Prüfungen ausdrücklich freigegeben. Aktueller Hauptzweig weiterhin `2b4f7185`; der Fehlerfix ist lokal als `fc05d0f8` geprüft. Die CI prüft zusätzlich die vollständige betroffene Browserauswahl unter Linux einschließlich echter lokaler Anmeldung. Erst nach erfolgreicher Sammelprüfung mit Merge-Commit integrieren, öffentliche Bereitstellung kontrollieren und eigenen Zweig samt Arbeitsordner aufräumen.

**Auftrag:** Überlaufende Artikelnamen in „Letzte Verkäufe“ korrigieren. Der zwischenzeitliche Auftrag zu „Konto hinzufügen“ wurde vom Nutzer als Nachricht für einen anderen Chat zurückgenommen; keine entsprechenden Oberflächenänderungen vorgenommen.

**Ursache und Umsetzung:** Der Link zum Verkauf konnte seine feste Tabellenspalte überbreiten; die bisherige Zweizeilenbegrenzung begrenzte seine Breite nicht. Den vorhandenen gemeinsamen Button ausdrücklich auf die Zellenbreite setzen und den Artikelnamen einzeilig mit Auslassungspunkten kürzen. Vollständiger Linkname, Tooltip, Verkaufsziel, Datumsspalte und Plattformdarstellung bleiben erhalten. Keine globale Buttonänderung.

**Prüfung:** Den vorhandenen Browserfall für große Dashboardwerte um einen sehr langen Artikelnamen mit ungetrennter Artikelnummer ergänzt. Der Fall scheitert vor der Korrektur bei 1.440px: Link und Titel überragen die Artikelspalte. Nach der Korrektur besteht die Prüfung bei 1.440/1.194/834/390/320px einschließlich tatsächlicher Kürzung, Spaltenbegrenzung, unverändertem Verkaufslink, vollständigem zugänglichem Namen und Tastaturfokus. Nach der Unterbrechung alle 23 ausgewählten Routen-/Dashboard-Komponentenfälle und neun gezielte Browserfälle erfolgreich geprüft; Touch bei 320/390/834/1.194px in Hell/Dunkel einschließlich AXE und Laufzeitfehlerkontrolle. Desktop- und Mobilaufnahmen außerhalb des Repositorys gesichert und angesehen. Format, Lint, Typprüfung und Produktionsbau erfolgreich. Keine neuen oder verschobenen Testfälle; tatsächliche Browserauswahl zusätzlich mit dem CI-Starter aufgelistet. Browserprüfungen verwenden ausschließlich lokale HTTP-Beispieldaten; Browser-Plugin nicht verfügbar, vorhandenes Playwright verwendet.

**Prüfgrenze:** Die zusätzlichen bestehenden Browserfälle mit echter lokaler Anmeldung sind vor dem PR noch offen: Die Docker-Engine ist auch im normalen Benutzerkontext nicht erreichbar. Kein fremdes Projekt angehalten oder zurückgesetzt. Der konkrete Tabellenfehler ist mit gefüllten Beispieldaten vor und nach der Änderung belegt; keine Aussage über einen bereits erfolgreichen Linux-/CI-Lauf.

**Arbeitsstand:** Eigener Zweig `juna/overview-sale-title` auf `2b4f7185` im zuvor unbenutzten Arbeitsordner. Fremde Zweige und ungesicherte Dokumentation bleiben erhalten. Keine Kontoverbindung, Anbieteraktion, Datenbankänderung, Veröffentlichung oder Push.

## 2026-10-19 - Juna - Übersichts-PR freigeben und zusammenführen

**CI-Nachprüfung:** Erster PR-Lauf: Qualität, alle Anwendungstests, Datenbank und Produktions-PWA erfolgreich; erste Browsergruppe mit 191 erfolgreichen Fällen. In der zweiten Gruppe scheitert der bestehende Login-Test, weil sein frisch angelegtes Konto ohne abgeschlossene Workspace-Einrichtung korrekt zum Einrichtungsdialog gelangt. Mit eigener lokaler Supabase und echtem Browser identisch reproduziert. Testkonto jetzt wie im globalen Browser-Setup ausdrücklich als eingerichtet vorbereiten, einschließlich Prüfung der tatsächlichen Workspace-Aktualisierung. Anmeldung, Weiterleitung und Überschrift bleiben unverändert streng geprüft; keine Änderung an der Anwendungslogik. Gezielte Nachprüfung mit echter Anmeldung gegen die eigene lokale Supabase erfolgreich (1/1); Format und Lint der Änderung bestanden. Vollständigen PR-Pflichtlauf vor dem Merge erneut ausführen.

**Freigabe:** Nutzer hat die fertige Übersicht einschließlich Plattformverwaltung, Schnellaktionen, Datumsspalte, Haus-Symbol und schraffiertem Diagramm abgenommen. Branch-Push, PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen sowie anschließendes Aufräumen sind ausdrücklich freigegeben.

**Integration und Prüfumfang:** Aktuellen Hauptzweig `0a29ee5e` übernommen. Nur das Änderungsprotokoll war konfliktbehaftet; beide unabhängigen Einträge erhalten. Navigation und Seitenleiste konfliktfrei zusammengeführt. Wegen neuer Plattform-Speicherung und gemeinsamer UI-Bausteine wählt die tatsächliche CI-Auswahl den umfassenden Umfang: 227 Node-, 48 DOM-, 260 Angular-Dateien, 61 Browserdateien sowie Produktions-PWA. Die bestehenden Datenbanknachweise gelten für das unveränderte neue Schema und die transaktional geprüfte Migration; der Hauptzweig enthält seitdem keine Datenbankänderung. Lokale Integrationsprüfungen laufen vor dem ersten Push erneut. Linux-/Browser-/PWA-Pflichtprüfungen und die öffentliche Bereitstellung werden anhand der CI kontrolliert. Fremde Zweige und ungesicherte Dateien im ursprünglichen Arbeitsordner bleiben unberührt.

**Lokale Integrationsabnahme:** Sämtliche 535 Anwendungstestdateien mit 5.609 Fällen bestanden. Vollständiges Format, Lint, Typprüfung, Suite-Audit und Produktionsbau erfolgreich; Workflow-Prüfungen mit 521 erfolgreichen und sechs regulär übersprungenen Fällen. Ein Windows-Zeilenendenfehler der lokalen TOML-Datei wurde durch Normalisieren auf den bestehenden LF-Vertrag behoben; keine zusätzliche Konfigurationsänderung. Schema und neue Migration weiterhin inhaltsgleich. In der vollständigen Browserauswahl einen veralteten Login-Selektor von „Dashboard“ auf den freigegebenen Titel „Übersicht“ berichtigt; keine Änderung an Anmeldung oder Testbedingungen. Die bisherigen lokalen Browser-/Datenbanknachweise und die noch ausstehenden umfassenden Linux-/PWA-Prüfungen werden im PR ausdrücklich benannt.

## 2026-10-19 - Juna - Feine Schraffur und Orientierung im Ergebnisdiagramm

**Auftrag und Umsetzung:** Das Diagramm enger an den freigegebenen Entwurf angleichen und die vom Nutzer gewünschte feine Streifentextur ergänzen. ApexCharts bleibt erhalten. Drei lokal erzeugte SVG-Kacheln kombinieren die unveränderten Reihenfarben mit dünnen diagonalen weißen Linien bei 16 Prozent Deckkraft; die Grundfläche bleibt deckend. Die Bildfüllung wird vollständig eingebettet, ohne Anbieterzugriff oder neue Abhängigkeit. Säulengruppen etwas breiter und eine gemeinsame gestrichelte Auswahllinie für Pointer/Tastatur ergänzt. Daten, unbekannte/negative Werte und gespeicherte Plattformen unverändert.

**Prüfung:** Alle zehn Konfigurations- und 26 betroffenen Angular-Prüfungen sowie neun bestehende Browserfälle zu Touch, Hell/Dunkel, AXE und großen Beträgen bestanden. Bestehende Konfigurations-/Browserfälle sichern eingebettete Texturen und weiterhin die Reihenfarben ab. Zusätzliche Browserabnahme mit gefüllten Beispieldaten bestätigt die sichtbare Schraffur, begrenzte Wertanzeige, Auswahllinie, mobile Größenanpassung sowie korrekte dunkle Texturen nach Themewechsel und das Aus-/Einblenden einer Datenreihe. Keine Laufzeitfehler; Detail-, Desktop-, Mobil- und Dunkelaufnahmen außerhalb des Repositorys gesichert und mit dem Entwurf verglichen. Die bestehende Produktions-CSP erlaubt die verwendeten eingebetteten Bilddaten bereits. Format, Lint, Typprüfung und Produktionsbau bestanden; keine Datenbank- oder Produktionsänderung und kein Push.

## 2026-10-18 - Juna - Passendes Symbol für die zentrale Übersicht

**Auftrag und Umsetzung:** Die zentrale Übersicht erhält ein Haus-Symbol als erkennbaren Einstieg ins Geschäft. Das bisherige Dashboard-Raster ersetzt: einheitlich im Seitentitel, in der Seitenleiste und in der mobilen Navigation einschließlich der Rückwege aus den Marktplätzen. Vorhandenes Lucide-Symbol, keine neue Abhängigkeit. Alle 50 bestehenden betroffenen Komponentenprüfungen sowie Format, Lint und Produktionsbau bestanden; kein Push oder Deployment.

## 2026-10-18 - Juna - Datum links in der Verkaufsübersicht erhalten

**Auftrag:** Datum in „Letzte Verkäufe“ als eigene Spalte links vor den Artikelnamen wiederherstellen und die technische Grenze von Swift Charts erklären.

**Umsetzung:** Reihenfolge wieder Datum, Artikel, Plattform, Gewinn. Ruhiger Tabellenstil, drei letzte Verkäufe, Plattformlogos und gleiche Kartenhöhen bleiben erhalten. Datumswerte stehen nicht mehr unter dem Artikelnamen. Bei wenig Platz ist die Tabelle innerhalb ihrer Region horizontal erreichbar. Apple-Dokumentation geprüft: Swift Charts baut auf SwiftUI für native Apple-Plattformen auf; Apple bietet keine direkt in Angular verwendbare Browser-Version. Keine neue Abhängigkeit und keine Datenbankänderung.

**Prüfung:** Bestehenden Dashboard-Test um die getrennte Datumsspalte vor dem Artikel ergänzt; alle 19 Dashboard-Komponentenprüfungen und neun bestehende Touch-/Hell-/Dunkel-Browserfälle bestanden. Mit gefüllten HTTP-Beispieldaten die Spaltenfolge sowie getrennte Zellen für Datum und Artikel geprüft, gleiche Karten- und Inhaltshöhen bestätigt, Desktop-/Mobilaufnahmen gesichert und keine Laufzeitfehler beobachtet. Format, Lint und Produktionsbau bestanden. Vorschau auf eigenem freien Port 4206; den bereits belegten Port 4200 nicht verändert. Kein Push oder Deployment.

## 2026-10-18 - Juna - Übersicht näher am Bildentwurf ausrichten

**Auftrag:** Zusätzliche Stückzahl unter „Verkäufe“ entfernen; Diagramm, Verkaufstabelle und Bestandsdarstellung näher am freigegebenen Bild gestalten. Beide unteren Karten sollen auch mit unterschiedlich viel Inhalt gleich hoch wirken. Frage nach Apples Diagramm-Framework klären.

**Änderung:** Die Verkäufe-Kennzahl zeigt keine zusätzliche Stückzahl. Kompakte Vorschau mit drei Verkäufen, Datum beim Artikelnamen und eigenem ruhigen Tabellenstil; Plattformlogos, echte Gewinnwerte und vollständige Liste über „Alle anzeigen“ bleiben vorhanden. Beide Karten nutzen den vorhandenen füllenden Kartenaufbau; Bestandsbalken verteilen sich über dieselbe Inhaltshöhe. Erste Gruppe gelb, weitere grau, kräftigere Balken wie im Entwurf. Diagramm auf 280px Zeichenhöhe verdichtet, weniger Kopf-Leerraum, feines Raster und kürzere Achsenwerte. Detailanzeige mit Farbpunkten und getrennten Werten. Bei der Sichtprüfung einen bestehenden Beschnitt durch feste Tooltip-Positionierung gefunden: lokale Koordinaten und Begrenzung innerhalb der Zeichenfläche verhindern den abgeschnittenen Tooltip. Tastatur, unbekannte und negative Werte bleiben erhalten. Kein Frameworkwechsel: Swift Charts ist laut Apple ein natives SwiftUI-Framework; das Mockup war ein erzeugtes Bild.

**Prüfung:** 26 betroffene Angular- und 17 Modell-/Konfigurationsprüfungen bestanden. Neun bestehende Browserfälle für Touch bei 320/390/834/1194px, Hell/Dunkel, AXE und große Beträge bestanden. Bestehende Prüfungen um fehlende Zusatzzeile sowie gleiche Kartenhöhen ergänzt; ein verschobener Diagrammbereich ist als Tooltip-Regression abgesichert. Zusätzliche Browserabnahme mit gefüllten, ausdrücklich als Beispieldaten benannten HTTP-Fixtures: beide Karten exakt 291px hoch, Verkaufs- und Bestandsinhalt enden bei derselben Position; Pointer- und Tastaturdetails vollständig innerhalb der Zeichenfläche, kein Seitenüberlauf nach mobiler Diagrammanpassung und keine Laufzeitfehler. Bildschirmaufnahmen außerhalb des Repositorys gesichert. Keine echte Anmeldung, keine Anbieterzugriffe, keine Datenbankänderung. Produktionsbau, Typen, Format, Lint, gemeinsamer UI-Check und 48 Auswahl-/Registrierungsprüfungen bestanden. Vollständige Linux-/PWA-Pflicht-CI bleibt vor Merge erforderlich; kein Push oder Deployment.

## 2026-10-18 - Juna - Übersicht vereinfachen und Verkaufsplattformen vereinheitlichen

**Auftrag:** Den freigegebenen zweiten Bildentwurf umsetzen, ergänzt um dezente Kennzahlensymbole und Plattformlogos bei Verkäufen. Verkaufsplattformen zentral pflegen und sortieren; Schnellaktionen auf Einkauf, Verkauf und Inseratwahl begrenzen.

**Umsetzung:** Seitentitel und Navigation heißen „Übersicht“. Vier ruhige Kennzahlen ohne Mini-Kurven, drei Schnellaktionen, höheres Diagramm mit Gelb/Grau/Petrol und korrigierter Zeigerauswahl, letzte Verkäufe mit Plattformlogos und vier angebundene Bestandsaltersgruppen. Kapital-Kennzahl, Aufgabenkarte und Durchschnitts-EK entfallen. Die Inseratwahl öffnet den vorhandenen Vinted-Editor; eBay und Kleinanzeigen bleiben sichtbare Platzhalter. Keine Veröffentlichung aktiviert. Bestandsalter nutzt Einkauf, ersatzweise Wareneingang; fehlende oder zukünftige Daten bleiben unbekannt. Gemeinsame Karten, Überschrift und Buttons erhalten ausdrücklich aktivierte Varianten; keine globale Umgestaltung.

**Plattformen:** Zentraler Workspace-Service und eigene RLS-geschützte Konfiguration mit atomarer, versionierter Speicherung. Stammdaten erlauben Anlegen, Umbenennen und Sortieren per Ziehen oder Pfeilen. Übersicht, Verkaufsfilter und Verkaufserfassung verwenden dieselbe Reihenfolge. StockX ergänzt, Gebührenzusatz entfernt. Historische Kennungen einschließlich unbekannter Werte bleiben erhalten; ähnlich benannte Altwerte werden unterscheidbar angezeigt. Fehlgeschlagene Abrufe erscheinen mit Wiederholaktion; bestätigte Daten desselben Workspace bleiben bei einem fehlgeschlagenen Nachladen erhalten. Unabhängiger Review ergab zwei entsprechende Randfälle, beide durch Regressionen abgesichert und behoben.

**Prüfung:** Alle 535 Anwendungstestdateien mit 5.598 Tests und alle 126 Datenbankdateien mit 4.564 Prüfungen bestanden. 22 relevante Browserfälle zu Übersicht, gemeinsamem Layout, Plattformen und Verkäufen bestanden; zusätzlich neun Touch-/Großbetragsfälle bei 320/390/834/1194px in Hell/Dunkel, einschließlich AXE und Bedienflächen. Bestehenden Variantentest an die fachliche Größe statt zufällige Zeilenreihenfolge gebunden und erneut bestanden. Ein zwischenzeitlicher Browserabbruch entstand durch Formatierung mit anschließendem Vorschau-Neuladen; die betroffenen Fälle anschließend gegen ruhende Vorschau erfolgreich. Neuer Fehlerfall verwendet einen sofortigen verweigerten Abruf statt der automatisch wiederholten 503-Antwort. 52 Auswahl-/Registrierungsprüfungen, gemeinsamer UI-Check, Suite-Audit, Format, Lint, Typen und Produktionsbau bestanden. Bekannte Bauwarnungen zu Vinted-RouterLink, Paketgröße und pako bleiben bestehen. Desktopaufnahme mit klar benannten lokalen Beispieldaten und Marktplatzdialog außerhalb des Repositorys gesichert und mit dem Entwurf verglichen; keine Browser-Laufzeitfehler in dieser Abnahme.

**Migration und Grenzen:** Deklaratives Schema registriert und Typen neu erzeugt. Erster CLI-Abgleich enthält fachfremde bestehende Abweichungen; diese nicht übernommen. Neue Objekte und vollständige explizite Rechte aus dem deklarativen Schema abgegrenzt. Zusätzlicher direkter CLI-Abgleich liefert trotz unterschiedlicher Tabellenstände einen leeren Unterschied. Deshalb die neue Migration in einer frischen eigenen Datenbankkopie transaktional eingespielt und den vollständigen public-Schema-Dump einschließlich Rechten mit dem deklarativen Ziel verglichen: identisch. Ein ergänzender Containerabgleich wurde automatisch abgelehnt, weil lokale Datenbankzugänge an das Abbild gegangen wären; nicht ausgeführt. Die erfolgreiche direkte Prüfung benutzt ausschließlich die bereits vorhandenen lokalen Datenbankwerkzeuge.

**Stand:** Eigener Zweig `juna/dashboard-overview-platforms` auf `40b11b22`; fremder ursprünglicher Arbeitsordner unberührt. Browser lokal unter Windows/Chromium, Datenbank unter Linux im eigenen Docker-Projekt; keine Anbieterzugriffe und keine Produktionsänderung. Die tatsächliche CI-Auswahl ist wegen Schema und gemeinsamer Bausteine umfassend (61 Browserdateien und Produktions-PWA); der vollständige Linux-/Browser-/PWA-Pflichtlauf steht vor Merge noch aus. Kein Push, PR, Merge oder Deployment. Abschlussfreigabe wird nach der lokalen Prüfung erfragt.

## 2026-10-18 - Juna - Kontenseiten-PR ausdrücklich freigeben

**Auftrag und Freigabe:** Alle vorbereiteten Kontenseiten-, Menü- und Desktop-/Touch-Prüfänderungen als PR veröffentlichen und nach erfolgreichen Pflichtprüfungen mit Merge-Commit integrieren; anschließend eigenen Zweig und Worktree aufräumen.

**Integration:** Zwischenzeitlich integrierte einheitliche Seitenbreite aus origin/master übernommen. Ausschließlich der Changelog musste unter Erhalt beider unabhängiger Einträge zusammengeführt werden; produktive Änderungen und Browser-Sollliste waren konfliktfrei. Betroffene Layout-/Kontenprüfungen vor dem Push erneut ausführen; vollständige Pflicht-CI und öffentliche Bereitstellung nach dem PR prüfen. Fremde Zweige und ungesicherte Dateien im Hauptverzeichnis unberührt.

## 2026-10-18 - Juna - Desktop- und Touch-Buttongrößen getrennt absichern

**Auftrag:** Verhindern, dass die größeren Tablet-/Touchbuttons versehentlich das kompakte Desktopdesign ersetzen.

**Ergebnis:** Bestehende gemeinsame Buttonregeln gegengelesen und im Browser bei 834 und 1.440 Pixeln jeweils mit Maus und Touch gemessen: normale Text- und Symbolaktionen bei Maus 28 Pixel, bei grobem Zeiger 44 Pixel Mindestgröße; Schrift jeweils 13 Pixel. Die größeren bisherigen Desktopbreiten-Bildbelege stammten aus der ausdrücklich aktivierten Touch-Testmatrix. Keine globale Größen- oder CSS-Änderung erforderlich. Einen gezielten Pflicht-Browserfall einschließlich Soll-Listen-Eintrag ergänzt, der beide Eingabemodi bei identischer Breite sowie Symbolbreite und Schrift prüft.

**Prüfungen und Grenzen:** Neuer Browserfall mit allen vier Kombinationen erfolgreich; lokale ruhende Vorschau mit Anbieter-Fixtures, keine produktiven Kontenaktionen. Eigenen Nachweis um echte Maus-/Touch-Vergleichsbilder ergänzt. Keine erneute Produktbereitstellung, kein neuer PR oder Push; Freigabe für den bereits vorbereiteten Zweig bleibt offen.

## 2026-10-18 - Juna - Kleinanzeigen- und eBay-Kontenansichten vereinheitlichen

**Auftrag:** Kontenseiten an das bestehende Design angleichen, große Sonderbuttons und die doppelte Kleinanzeigen-Kontendarstellung entfernen, Kontoentfernung und Wechsel im Browser ermöglichen, Inserate verständlich benennen und den Vinted Feed unter Tools einordnen.

**Ergebnis:** Kleinanzeigen verwendet dieselben Konto-/Inseratkarten wie die Marktplatzübersicht; Einrichtung und Verwaltung öffnen getrennte Modals. eBay zeigt eine kompakte Kontokarte mit Einstellungsdialog und bietet entsprechend seiner bestehenden Grenze kein zweites Konto an. Gemeinsame Standardbuttons statt Touch-Sondergröße. Die bestätigte Kleinanzeigen-Entfernung widerruft die bestehende Freigabe und blendet getrennte Konten in allen aktiven Auswahllisten aus; Originaldaten und Anbieteranzeigen bleiben erhalten. Auch eine lokal verbliebene Bindung nach einem früheren Serverwiderruf lässt sich gezielt lösen. Nutzer-/Workspacegrenzen und gesonderte Veröffentlichungsfreigabe bleiben erhalten. Sichtbare Listen heißen Inserate. Auf kleinen Bildschirmen stehen die Kontoaktionen unter den Kontoinformationen, damit Namen und Status nicht zusammengedrückt werden. Vinted Feed einschließlich Untermenüs unter Tools verschoben, bestehende Sichtbarkeitsrechte erhalten.

**Prüfungen und Grenzen:** Neue Regressionen vor der Korrektur rot; vollständiger Anwendungslauf mit 5.614 Fällen erfolgreich, danach gezielte 40 Konto-/Servicefälle einschließlich verwaister Bindung erfolgreich. Typprüfung, Lint und regulärer Produktionsbau erfolgreich. Der erste lokale Bau scheiterte an laufwerksübergreifenden Modulpfaden; unveränderte gesperrte Abhängigkeiten lokal installiert, keine Paketänderung. 57 bestehende betroffene Browserfälle erfolgreich: 11 Kleinanzeigen, 21 Übersicht, 24 Übertragung mit Kontingent-/Gebührenstopp und ein eBay-Fall mit drei Breiten. AXE einschließlich Kontrast, Escape/Fokusrückgabe, Touch, Hell/Dunkel und Konsolenfehler in der Kleinanzeigen-Matrix geprüft. Nach der visuellen Handyabnahme den Kartenkopf korrigiert und die 16 betroffenen Layoutfälle erneut geprüft. 48 Testauswahl-/Shared-UI-/Browserregistrierungsfälle erfolgreich; Shared-UI-Audit ohne Befund. Zwei umbenannte Fälle in der verbindlichen Soll-Liste aktualisiert. Unabhängiges Review und dessen Korrektur nachgeprüft. Browserprüfung gegen ruhende lokale Vorschau und Anbieter-Fixtures unter Windows; die breitere CI-Auswahl einschließlich Linux/PWA steht nach PR-Freigabe noch aus. Keine echte Kontoentfernung, Freigabe, Anmeldung oder Veröffentlichung vorgenommen; keine Datenbank-, Anbieter- oder Erweiterungsänderung. Noch kein Push/PR für diesen Zweig.

## 2026-10-18 - Juna - Einheitliche Maximalbreite ohne Seitenausnahmen

**Auftrag:** Nach der ersten Layout-Einführung ausdrücklich auch Dashboard sowie Einkaufs-, Artikel- und Verkaufsübersichten mit derselben Maximalbreite versehen.

**Umsetzung:** Seitenausnahmen entfernt. Der Standard Mittel begrenzt den Inhalt überall auf 80rem / 1.280px. Schmal und Volle Breite bleiben browserlokal wählbar und wirken weiterhin auf alle Verwaltungsseiten. Nicht mehr benötigte URL-Auswertung samt Router-Abonnement aus der Shell entfernt. Bestehende Modell-, Shell- und Browserprüfungen sowie deren Soll-Liste und Gestaltungsrichtlinie an die neue Entscheidung angepasst. Eigener Zweig `juna/uniform-page-width` auf aktuellem Hauptzweig; fremde Dokumentationsänderungen im ursprünglichen Arbeitsordner unberührt.

**Freigabe:** Nutzer hat anschließend die PR-Erstellung und den Merge nach erfolgreichen Pflichtprüfungen ausdrücklich bestätigt. Der geprüfte Zweig wird gegen den unveränderten aktuellen Hauptzweig veröffentlicht; Remote-/lokaler Zweig und eigener Worktree werden nach bestätigtem Merge aufgeräumt.

**Prüfung und Stand:** Bisherige Ausnahmen vor der Korrektur mit sechs erwarteten Fehlschlägen nachgewiesen. Anschließend alle 533 Anwendungstestdateien mit 5.591 Tests bestanden. Sechs bestehende Layoutfälle und 27 bestehende responsive Browserfälle unter Windows grün; die sechs Layoutfälle zusätzlich unter Linux mit Playwright 1.62.1 und 2 CPUs / 4 GiB geprüft. Damit sind 2.560px, Dashboard-/Tabellen-/Seitenwechsel, gespeicherte Breitenwahl, Hell/Dunkel, AXE am Profilmenü sowie Touch bei 320/390/768px abgesichert. Produktions- und Entwicklungsbau, Typen, Lint, Format, Suite-Audit und alle 33 Testauswahl-/Registrierungsprüfungen bestanden. Sichtbaren Dashboard-Nachweis nach geladenem Diagramm mit exakt 1.280px Inhalt und ohne Laufzeitfehler außerhalb des Repositories gesichert. Browserläufe mit simulierten Daten, ohne echte Anbieterzugriffe. Vollständige CI-/Produktions-PWA-Prüfungen bleiben vor einem Merge erforderlich. Kein Push, PR, Merge oder Deployment dieser Folgeänderung.

## 2026-10-18 - Juna - KI-Avatar auch bei automatischen Angeboten anzeigen

**Auftrag und Ursache:** Im Nutzerbild trägt die automatische Textantwort bereits das KI-Avatar, das danach automatisch gesendete Angebot aber das Kontobild. Die serverseitige Herkunftserkennung prüfte nur Text-Versandbelege. Eine ausschließlich lesende Produktionsabfrage bestätigt für das gezeigte Gespräch einen passenden gespeicherten Angebotsbeleg; keine Nachricht oder kein Angebot wurde versendet.

**Korrektur:** Bestätigte Favoritenangebote und automatisch versandte Gegenangebote werden anhand ihrer Angebots-ID, ihres Gesprächs und des aktuellen Kontos erkannt. Text- und Angebotskennungen bleiben getrennt; manuelle, fehlgeschlagene oder unklare Vorgänge erhalten keine automatische Herkunft. Die bestehende Avataranzeige kann das Ergebnis direkt verwenden. Auch bereits gespeicherte Angebote werden beim Lesen erkannt, sofern der bestätigte Versandbeleg vorliegt. Neue Teilindizes unterstützen die Abfragen. Änderungen an der deklarativen Funktion und den Indizes sind gemeinsam mit einer automatisch erzeugten Migration enthalten; keine Tabelle, Rechte oder RLS-Regel geändert.

**Prüfungen:** Die neuen Datenbankfälle zuerst rot, nach Korrektur alle 160 gezielten und alle 4.534 Datenbankprüfungen erfolgreich. Sämtliche Anwendungstests bestanden: 2.616 Node-, 347 DOM- und 2.619 Angular-Fälle. Zusätzlich alle 58 Chat-Komponentenfälle gezielt geprüft. Alle 28 Postfach-Browserfälle einschließlich Cloud/Erweiterung, 390/1440 Pixel, Touch, Hell/Dunkel und AXE bestanden; mobile und große Bildschirmaufnahme angesehen. Ein anfänglicher AXE-Fehler entstand bei Zwischenfarben während des Designwechsels; die betroffenen Avatarfälle warten nun auf das Ende der laufenden endlichen Animationen. Keine Kontrastbedingung gelockert. Produktionsbau, Typprüfung, gezieltes ESLint, Formatierung und Suite-Audit erfolgreich. 31 Auswahl-/Registrierungsprüfungen sowie 29 Migrations-/Paket-/Rechteprüfungen bestanden. Ein temporärer Git-Test und ein Browserstart waren durch Sandboxzugriffe gestört; die identischen Prüfungen im normalen Benutzerkontext bestanden.

**Migration und Grenzen:** Ein erster vollständiger Schemaabgleich enthielt bestehende fachfremde Abweichungen und wurde verworfen. Die neue Migration wurde per CLI aus einer isolierten unveränderten Datenbankkopie und einer Kopie mit ausschließlich der Zielfunktion und zwei Indizes erzeugt, geprüft und lokal eingespielt. Generierte Supabase-Typen sind nach normalisiertem Dateiende unverändert. Nur die eigene Testdatenbank gestoppt und die temporäre lokale Konfiguration zurückgesetzt; fremde Projekte unverändert. Browserprüfung unter Windows/Chromium gegen einen ruhenden Produktionsbau mit nachgebildetem Backend ohne Produktions-CSP wie beim CI-Entwicklungsserver. Die durch Schemaänderungen breiter gewählte Linux-/Browser-/PWA-Pflicht-CI steht noch aus. Eigener Zweig `juna/vinted-automated-offer-avatar` aus origin/master. PR, Merge nach erfolgreichen Pflichtprüfungen und anschließendes Aufräumen am 18.10.2026 ausdrücklich freigegeben. Die zusätzliche Aktualisierung des veralteten Cloud-Workers für die Preisanzeige und die Kontrolle beider Korrekturen bei bestehenden Angeboten sind nun ebenfalls ausdrücklich freigegeben; keine neue Nachricht und kein neues Angebot versenden.

**Integrationsstand:** Auf origin/master `5880c744` gesetzt; ausschließlich den Changelog-Konflikt unter Erhalt beider Einträge gelöst. Danach alle 5.604 Anwendungstests (2.616 Node, 367 DOM, 2.621 Angular), Produktionsbau, Typen, Lint, 37 Auswahl-/Migrationsregistrierungsfälle und erneut alle 28 Postfach-Browserfälle erfolgreich. Ein Cache-Schreibfehler verhinderte im ersten Sandboxlauf die Testausführung; derselbe Gesamtlauf im normalen Benutzerkontext erfolgreich. Unabhängiger vollständiger Diff-/Persistenzreview ohne belegten Befund; Schema-/Migrationsfunktion und beide Indizes identisch.

**Freigegebener Workerwechsel:** Veröffentlichungsworkflow `39138337934` für den bereits geprüften Hauptzweig `5880c744` erfolgreich. Ausschließlich der Worker wurde auf Digest `sha256:2a33fcc1d04c0c91251494a080ecaf6ca4ffe1e02de3f404d9b04ea114c7f22e` umgestellt und ist gesund. Vorher keine laufenden Abrufe/Schreibvorgänge oder Browsersitzungen; neue geschützte Compose-Datei unter `/opt/flipbase-marketplace/chat-prices-5880c744/`, ursprünglicher Stand dort gesichert. Alle 27 Umgebungswerte sowie Brokerinstanz/-image unverändert, korrigierter Angebotsparser im laufenden Container bestätigt. Zwei nachgelagerte Prüfvergleiche zunächst zu streng (Listenreihenfolge der Umgebung beziehungsweise kurze gegen volle Container-ID); nach korrektem Schlüssel-/ID-Vergleich unverändert bestätigt, kein weiterer Dienstwechsel. Sichtprüfung bestehender Angebote und Avatar-Veröffentlichung folgen nach dem PR.

**Nachkontrolle und zusätzliche Kopfpreis-Korrektur:** Die tatsächliche Cloudausführung verwendet den Parser im getrennten Browser-Sitzungsabbild. Auch dieses war veraltet; nach erfolgreichem Workflow `39139012453` auf Digest `sha256:84ddef6d08521cf367cdf1c0e218add92648b6faf891897aeb37d4386155778e` gesetzt. Worker zuvor geordnet angehalten; nur die Sitzungsabbild-Variable in Worker und Broker geändert, Profile/Mounts und beide Dienstabbilder nachweislich unverändert. Beide Dienste gesund. Danach zeigt ein bestehendes Angebot den Originalbetrag 26,90 € und den Rabattbetrag 24,21 €. Der Kopf behielt jedoch 24,21 €, weil fehlende Artikelpreise beim Detailabruf den alten gespeicherten Transaktionspreis erhalten.

**Ergänzte Lösung und Abnahme:** Der Gesprächskopf verwendet nun serverseitig das gültige Preis-/Währungspaar des genau verknüpften Inserats im selben Konto und Workspace. Fehlt es oder liegt ein bekanntes Bundle vor, bleibt das bisherige Paar erhalten; kein historischer Angebotspreis und keine Rabatt-Rückrechnung. Bewusste Quellenentscheidung: letzter gespeicherter Inseratspreis, auch wenn ein Gespräch einen anderen Preis enthält. Die gespeicherten Zeitpunkte unterscheiden keine Preisbeobachtung, daher keine erfundene Aktualitätsentscheidung. Der Kopf stellt den verknüpften Artikel dar; unbekannte historische Bundles sind ohne zusätzliche Importangaben nicht sicher erkennbar.

Zwölf weitere Datenbankfälle, darunter der echte Altpreis 24,21 gegenüber Inseratspreis 26,90; drei erwartete Fehler vor der Korrektur bestätigt. Anschließend alle 172 gezielten und alle 4.546 Datenbankprüfungen erfolgreich. Noch unveröffentlichte PR-Migration erneut automatisch aus derselben unveränderten Basiskopie und dem erweiterten deklarativen Ziel erzeugt, in frischer Kopie transaktional ausgeführt und leeren Gesamtabgleich bestätigt. Typen neu erzeugt und unverändert; zehn Migrations-/Paket-/Registrierungsprüfungen bestanden. Zweiter unabhängiger Review ohne belegten Befund; vollständige Schema-/Migrationsfunktion erneut identisch. Keine weitere Frontend- oder Worker-Quellcodeänderung. Überholten ersten PR-Lauf vor dem Korrektur-Push gezielt beendet; erweiterter Pflichtumfang und gemeinsame Liveabnahme stehen noch aus.

## 2026-10-18 - Juna - Layout-PR freigeben und Browsergruppen isolieren

**Auftrag:** PR erstellen und nach erfolgreichen Pflichtprüfungen mergen; Zweig und Worktree anschließend aufräumen.

**Zwischenstand und Fehlerursache:** PR #437 erstellt, aktuellen Hauptzweig übernommen und alle übrigen CI-Prüfungen einschließlich Produktions-PWA unter Linux erfolgreich. Im Browserlauf bestanden 218 Fälle, bevor die Gruppe mit vollständig geänderten Testdateien begann. Deren gemeinsame Anmeldung war nach dem rund 20-minütigen ersten Lauf abgelaufen; Abbruch vor dem ersten Seitenaufruf in der bestehenden Layoutprüfung, kein nachgewiesener Anwendungsfehler. Kein unveränderter Neustart und kein Merge.

**Korrektur:** Der Browserstarter führt die beiden unveränderten Auswahlen nacheinander in eigenen Playwright-Prozessen aus. Jeder Prozess erhält über das vorhandene globale Setup eine frische Anmeldung. Alle 230 Fälle bleiben ausgewählt; die Sitzungsprüfung, Wartezeiten und der Abbruch beim ersten Fehler bleiben bestehen. Fünf Schutzfälle bilden den ursprünglichen Fehler sowie beide einzelnen Gruppen und Fehlerweitergabe aus erster oder zweiter Gruppe nach. Vor der Korrektur fehlgeschlagen; danach alle 33 Auswahl-/Starterprüfungen unter Windows bestanden. Die fünf neuen Unterprozessfälle bestehen zusätzlich unter Linux mit dem vorhandenen Node-22-Abbild, ohne Netzwerk und mit 2 CPUs / 1 GiB Arbeitsspeicher. Die echte Playwright-Auflistung bestätigt weiterhin 218 plus 12 Fälle; Format und Lint bestehen. Unabhängige Diff-Prüfung ohne Befund. Endgültige CI-Abnahme und Merge folgen erst nach grünem Lauf.

## 2026-10-18 - Juna - Einheitliche Inhaltsbreite mit Layoutwahl

**Auftrag:** Die Breite der Marktplatzübersicht für alle Verwaltungsseiten vereinheitlichen, besonders Vinted-Feed, Suchfilter, Favoriten, Ausgaben, Steuern und Auswertungen. Im Profilmenü drei Breiten anbieten. Nutzer bestätigt: Standard mit breiten Ausnahmen; eigene Schmal-/Vollwahl gilt überall.

**Umsetzung:** Zentrale Begrenzung des Seiteninhalts in der Shell: Schmal 64rem, Mittel 80rem als Standard und volle verfügbare Breite. Nur Dashboard sowie Einkaufs-, Artikel- und Verkaufsübersicht bleiben im Standard breit; Detail- und Erfassungsseiten folgen Mittel. Auswahl wirkt sofort, über Seitenwechsel hinweg und nach Neuladen im selben Browser; gesperrter Browserspeicher verhindert die laufende Auswahl nicht. Profilmenü mit beschrifteter Tastatur-/Touch-Auswahl und eindeutigem Auswahlzustand. Frühere äußere Seitenlimits sowie doppelte Seitenabstände entfernt; Formulare, Dialoge, Textabsätze, Shop und Druckdokumente behalten ihre fachlichen Grenzen. Gestaltungsrichtlinie und bestehende CI-Soll-Liste ergänzt. Eigener Zweig `juna/page-content-width` auf aktuellem Integrationsstand, fremder Arbeitsordner unverändert.

**Prüfung:** Alle 533 Anwendungstestdateien mit 5.604 Tests bestanden, darunter 20 Breiten-/Speicherfälle und 13 Header-/Shell-Fälle. Sechs neue Browserfälle prüfen 2.560px, Seitenwechsel, Neuladen, breite Ausnahmen, 320/390/768px und Touch einschließlich kurzem Querformat. 65 bestehende Browserfälle für Marktplatzübersicht, Vinted-Arbeitsfläche, Feed/Favoriten, Einstellungen/eBay und responsive Ansichten geprüft; 64 direkt bestanden, der Offline-Wiederholfall anschließend gezielt mit dem tatsächlichen CI-Wartefenster (15 statt lokal zunächst 5 Sekunden) bestanden. AXE am Profilmenü in Hell/Dunkel ohne Befund, Desktop-/Mobilbilder außerhalb des Repositories und keine Browser-Laufzeitfehler in der sichtbaren Stichprobe. Produktions- und Entwicklungsbau, Typen, Lint, Format, Suite-Audit, 28 Testauswahl-/Registrierungsprüfungen und 41 PWA-Skriptprüfungen bestanden. Für den Windows-Bau wurde ausschließlich die Abhängigkeitsverknüpfung im eigenen Worktree durch eine echte lokale Kopie ersetzt.

**PR-Freigabe:** Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und anschließendes Aufräumen ausdrücklich freigegeben. Vor dem ersten Push auf den aktuellen Hauptzweig mit der Vinted-Chatpreiskorrektur gesetzt; ausschließlich den Dokumentationskonflikt unter Erhalt beider Einträge aufgelöst.

**Grenzen beim lokalen Abschluss:** Browserläufe gegen ruhende lokale Vorschau mit simulierten Daten, ohne echte Anbieterzugriffe. Vollständige CI-Browserregression, Linux und Produktions-PWA-Lebenszyklus noch nicht ausgeführt; Docker-Engine war nicht gestartet. Kein Push, PR, Merge oder Deployment. Lokale Profil-/Layoutpräferenz bleibt gerätebezogen.

## 2026-10-18 - Juna - Originalpreis und Rabatt im Vinted-Chat trennen

**Auftrag:** Im Artikelstreifen des Chats den Originalpreis zeigen und bei gesendeten Angeboten den durchgestrichenen Originalpreis vor dem reduzierten Preis darstellen.

**Umsetzung:** Cloud- und Erweiterungsimport verwenden für den Artikelpreis ausschließlich den gelieferten Artikelpreis statt des privaten Transaktionsangebots. Der Cloud-Import übernimmt nun auch getrennte Angebotspreise aus der Anbieterantwort und behält fertige Preislabels als Rückfall bei. Beide Abrufwege kennzeichnen nur einen tatsächlich höheren Originalbetrag derselben Währung als Reduzierung. Die Chatvorlage zeigt Originalpreis und Angebotspreis in dieser Reihenfolge, gruppiert beide Beträge auch auf kleinen Bildschirmen und ergänzt Bezeichnungen für Screenreader. Fehlende Originalpreise werden nicht aus Rabattregeln zurückgerechnet. Regressionen in den bestehenden Import-, Komponenten- und Browserdateien ergänzt; keine neue Testdatei.

**Prüfungen:** 69 Importtests einschließlich gemeinsamer Cloud-/Erweiterungsfälle, 140 bestehende Erweiterungs-/Postfach-/Verhandlungstests, 125 betroffene Angular-Tests und vier Routentests sowie 28 Auswahl-/Browserregistrierungsprüfungen erfolgreich. 46 ausgewählte Browserfälle einschließlich zusätzlicher Touch-Prüfung, hell/dunkel und mobilen Breiten erfolgreich; nach abschließender Gruppierung der Preise erneut alle 58 Chat-Komponententests und 28 Postfach-Browserfälle erfolgreich. Mobile Bildkontrolle bestätigt beide Preise direkt nebeneinander. Produktionsbau, App-/Worker-Typprüfung, Lint, Formatierung und gemeinsame UI-Architekturprüfung erfolgreich. Vorhandene Bauhinweise zu fremden Vorlagen, Anfangspaketgröße und pako bleiben bestehen.

**Integration:** Auf origin/master nach PR #435 erneut 127 betroffene Angular-Tests, vier Routentests, 140 Erweiterungstests sowie die Worker-Prüfung mit 690 erfolgreichen und acht regulär übersprungenen Fällen bestanden. Worker-Typprüfung und -Bau, App-Typprüfung und Produktionsbau ebenfalls erfolgreich. Der erste Worker-Gesamtlauf war durch Sandbox-Dateizugriffe gestört; ein kleiner Registry-Test und anschließend der Gesamtlauf im normalen Benutzerkontext bestätigten die Ursache und bestanden. Die acht Ausnahmen betreffen vorhandene System-/Symlink- und optionale Datenbankfälle; Linux-Abdeckung folgt über die Pflicht-CI.

**Grenzen und Stand:** Lokale Windows-/Chromium-Prüfung mit vollständig simulierten Backendantworten gegen einen ruhenden Produktionsbau. Für die bestehenden HTTP-Fixtures ohne Produktions-CSP wie beim CI-Entwicklungsserver; kein CSP-, Linux- oder echter Versandnachweis. Keine Datenbankänderung und kein Angebot versendet. PR-Erstellung und Merge nach erfolgreichen Pflichtprüfungen am 18.10.2026 ausdrücklich freigegeben. Integration auf dem aktuellen origin/master; fremde Dokumentationsentwürfe bleiben außerhalb des PR.

## 2026-10-18 - Juna - Gesamte Marktplatz-Rückmeldung nachbessern

**Auftrag:** Nutzer stellt klar, dass die vollständige Rückmeldung zur Marktplatzübersicht, Konto-/Plattformauswahl, Header-/Updatebedienung und einfachem Inserieren erwartet ist. Kategorie-PR #434 hat nur Baum und Filter geliefert. Fehlende Beschreibung und falsche Browserprofilmeldung zusätzlich ursächlich prüfen. Alle ursprünglichen Punkte in Abnahme und Umsetzungsplan erfasst; aktueller Hauptzweig in eigenem Worktree, fremde uncommittete Analyse bleibt unverändert. Keine echte Anbieter-Veröffentlichung.

**Umsetzung:** Gesamte Bedienliste umgesetzt: direkte Theme-Umschaltung, tatsächliche Zielversion im Updatehinweis und Schutz vor erneutem Angebot derselben Aktivierung; normalen Flipbase-Rückweg erhalten; gemeinsame Plattformbuttons im Verwaltungs-/Auswahldialog; Kontoanlage und Verwaltung in der Übersicht; einfacher Plattform→Konto→Formular-Ablauf mit Bildern oben, automatisch übernommenen gespeicherten Angaben, später feldnaher Validierung und automatischem Laden der Eigenschaften. Abgelaufene lokale Kleinanzeigen-Freigabe ursächlich von fremdem Konto unterschieden und kontogebundene Erneuerung angeboten. Gespeicherte vollständige Vinted-Quellen beim Listenimport erhalten; fehlender Beschreibungscache kann aus exakt zugehörigem bestätigtem Veröffentlichungsauftrag ergänzt werden. Quellprüfung und Fingerprints bleiben über Lesen, Entwurf und Bilder identisch. Migration aus lokalem Datenbankvergleich erzeugt, Rechte geprüft, Typen neu generiert. Keine neue Veröffentlichungstechnik für andere Kopierrichtungen und keine echten Anzeigen für Tests.

**Prüfung:** Vollständige Node-/DOM-/Angular-Suiten mit 2.616/347/2.614 Fällen erfolgreich; zusätzliche gezielte Komponentenregressionen nach Review zuletzt 48 Fälle grün. 125 Datenbankdateien mit 4.513 Fällen nach Migration grün; deklarativer Funktionsabgleich leer. Workflow-/Erweiterungsprüfungen 516 bestanden/sechs bestehende bedingte Fälle übersprungen, 404 Edge- und 45 Landingfälle grün. Linux-Produktions-PWA mit zwei echten Bauten, zwei CPUs/sechs GB: 34 bestanden/ein projektspezifischer Installationsfall übersprungen. Typprüfung, ESLint, Format, Suite-Audit und finaler Produktionsbau grün. Finale Browserabnahme 45 Übersichts-/Transferfälle inklusive Breiten/Farbschemata/Touch/Tastatur/AXE erfolgreich; ergänzende gezielte Konto-/Entwurfsnachprüfung mit sechs Fällen ebenfalls grün (zusammen 51 abschließende Browserfälle). Unabhängiger Review: Kontoanlage bei leerer Liste und Schutz separater Kategorie-/Versandänderungen korrigiert und erneut bestätigt. Vollständige Abnahme und Grenzen: `docs/testing/marketplace-feedback-validation-2026-10-18.md`.

**Zusätzliche Header-Einsatzstellen:** Nach PR-Erstellung drei alte Browsererwartungen im Dashboard, Postfach und Vinted-Bereich auf den direkt erreichbaren Theme-Schalter und entfernten Rücklink angepasst. Tatsächlicher Farbwechsel zusätzlich geprüft, übrige Assertions erhalten; unabhängiger Review bestätigt. 20 bestehende Postfach-/Arbeitsflächenfälle vollständig grün, damit 71 abschließende lokale Browserfälle. Dashboard-Designfälle mit echter Datenbank-Testanmeldung bleiben Teil der umfassenden CI. Eigenen überholten ersten CI-Lauf vor dem Korrektur-Push gezielt beendet.

**CI-Fehler gezielt behoben:** Umfassender PR-Lauf bestand alle übrigen Pflichtjobs und134Browserfälle, scheiterte im zusätzlich erfassten Dashboardfall an403. Eigene isolierte echte API-/Browserreproduktion belegte `/functions/v1/beta-discord` mit `origin_not_allowed`: Browserfixture erlaubte die lokalen Discord-Origins noch nicht. Nur diese Testkonfiguration ergänzt, Produktionsfunktion/Rechte unverändert. Fehlerausgabe des bestehenden Dashboardtests umURL ergänzt; keine Ausnahme aus der fehlerfreien Konsolenprüfung. Zuerst rot, danach alle drei Dashboardfälle und30bestehende Vertrags-/Auswahlfälle grün; unabhängiger Review bestätigt. Neuer vollständiger CI-Lauf erst nach dieser Korrektur; insgesamt74abschließende lokale Browserfälle.

**Abschluss:** Bestehende ausdrückliche PR-/Mergefreigabe auf den bislang fehlenden Gesamtkorrekturumfang angewendet. CI wählt wegen Schema und globalem Update-/Baupfad den umfassenden Pflichtumfang. Kein Merge vor dessen Erfolg; keine öffentlichen Beta-Mitteilungen und keine fremden Änderungen oder Testdienste angefasst.

## 2026-10-17 - Juna - Kategorieauswahl zur Integration freigegeben

**Auftrag:** Nach ausdrücklichem Ja den lokal geprüften Zweig `juna/kleinanzeigen-category-tree` veröffentlichen, PR gegen den aktuellen Hauptzweig erstellen und sämtliche erforderlichen Prüfungen abwarten. Nur bei Erfolg mit Merge-Commit integrieren, anschließend den eigenen Remote-/lokalen Zweig und Worktree aufräumen sowie den automatischen Veröffentlichungslauf kontrollieren. Der aktuelle Hauptzweig ist bereits enthalten. Vollständiger Kleinanzeigen-Baum, gemeinsamer Wähler und freigegebene Wiederverkaufsfilter gehören zusammen in diesen PR; die dokumentierten lokalen Prüfungen gelten für denselben Anwendungscode. Vor dem Merge erfolgt eine unabhängige Codeprüfung. Keine erneute Produktionsprüfung mit Server-Zugangsdaten; die sichere lokale REST-Prüfung bleibt der Nachweis.

**Reviewkorrektur vor Merge:** Zwei belegte Filterlücken außerhalb der offensichtlichen Hauptbereiche geschlossen: separater Pflanzen-/Saatgutast sowie Tierbedarf unter Dekoration und Sport einschließlich Vogelhäusern/-tränken, Futterspendern, Pferde-/Stallbedarf, Jagdhund-Ausrüstung und Wildtierfutter. Menschliche Reitbekleidung und -helme bleiben erhalten. 24 neue Modell-/Serviceregressionen zunächst rot; nach Korrektur 114 betroffene Modell-/Servicefälle grün. Erneuter vollständiger Quellen- und echter isolierter REST-Abgleich bestätigt 10.135 auswählbare und 10.147 sichtbare interne Kennungen bei unveränderten 14.539 Originaldatensätzen. Eigene Testcontainer und Netz wieder entfernt. Überholten ersten PR-Lauf vor dem Korrektur-Push beendet; Prüfbedingungen unverändert.

## 2026-10-17 - Juna - Freigegebene Kategorienfilter umsetzen

**Auftrag:** Die abgestimmten Ausschlüsse für die internen Flipbase-Kategorien sowie Vinted und Kleinanzeigen anwenden. Originaldaten und bestehende Zuordnungen erhalten; die allgemeine Liste künftig als Flipbase-Kategorien bezeichnen. Vorhandenen eBay-Stand prüfen und nächsten Kategorienweg anhand offizieller Dokumentation erläutern. Ausdrückliche Umsetzungsfreigabe, noch keine neue PR-/Mergefreigabe.

**Umsetzung:** Bestehende Quellen um kleine Regeln je Datenquelle ergänzt. Neue Auswahl und Suche werden gefiltert; Einzelabrufe bestehender Werte bleiben ungefiltert. Notwendige ausgeschlossene Eltern bleiben reine Navigationsknoten und sind nicht neu auswählbar. Interne Abfragen filtern vor dem Suchlimit. Hersteller-/Anbieterkennungen, Originaldaten und historische Herkunfts-/Lizenznachweise unverändert. Neue Auswahl: 10.319 interne Flipbase-, 2.392 Vinted- und 342 Kleinanzeigen-Knoten. Vollständiger Originalabgleich und sämtliche Regelkennungen geprüft. Kein Schema-/Erweiterungs-/Veröffentlichungsumbau. eBay-Taxonomy-API mit Marktbaum, Version und Pflichtmerkmalen als nächsten Schritt anhand offizieller Dokumentation eingeordnet, noch keine eBay-Kategoriequelle implementiert.

**Prüfungen:** Filter, Auswahlsperre, Smart-Home-Ausnahme und Lebensmittel-Navigationspfad zuerst rot, danach grün. Abschließend 88 betroffene Modell-/Service-, 471 Komponenten- und 36 DOM-Fälle erfolgreich. Alle 100 ausgewählten Marktplatz-Browserfälle einschließlich 24 Transferfällen, 320/390/834/1440 Pixel, Hell/Dunkel, Touch, Tastatur, Gebühren-/Kontingentstopps und AXE grün; Bildschirmaufnahme angesehen. Produktionsbau, Typprüfung, gezieltes ESLint, Formatierung, Suite-Audit und 28 Auswahl-/Registrierungsfälle erfolgreich. Bestehende Werte bleiben im gemeinsamen Wähler sichtbar, ohne automatische Wertänderung.

**Zusätzlicher REST-Nachweis und Grenze:** Automatische Freigabeprüfung lehnte einen optionalen Produktions-API-Vergleich wegen geplanter Nutzung eines Service-Role-Schlüssels aus einer Server-.env ab. Der Befehl wurde nicht ausgeführt, keine Zugangsdaten gelesen oder verwendet und kein weiterer Produktionszugriff versucht. Sichere Alternative: isolierter lokaler PostgREST 16.1/PostgreSQL 16.14 mit sämtlichen öffentlichen Originalkategorien und rein lesender Rolle; sämtliche Auswahl-/Navigationskennungen entsprechen exakt den Regeln (10.319/10.331), ausgeblendeter Einzelwert weiter lesbar. Der interne Docker-Netzaufbau veröffentlicht keine Hostports; nach gezielter Diagnose Client im selben privaten Testnetz verwendet. Eigene Container/Netz entfernt, keine fremden Projekte gestoppt. Datenbankgestützte Artikel-/Katalog-/Einkaufs-Browserläufe und breiter CI-Pflichtumfang einschließlich Linux/Produktions-PWA stehen für den PR aus. Kein Push, Deployment oder Produktions-/Anbieterdatenänderung.

## 2026-10-17 - Juna - Nutzernotizen zum breiteren Wiederverkauf übernehmen

**Auftrag:** Die Ausschlussliste während der Nutzerprüfung korrigieren: Elektronik/Software, Haushalt/Einrichtung, Beauty/Gesundheit, allgemeine Babyausstattung, Sport/Camping sowie Medien/Spielzeug/Hobby bleiben erhalten. Jobs/Dienstleistungen, Fahrzeuge/Immobilien, Garten-/Bau-/Gewerbebedarf sowie Tiere/Lebensmittel sollen herausfallen. Noch kein Auftrag zur technischen Umsetzung.

**Ergebnis:** Bestehenden Kategoriebericht widerspruchsfrei auf den breiteren Umfang umgestellt. Frühere Modebeschränkung einschließlich Elektronik-/Wearableausschluss und der engen Kleinanzeigen-95-Knoten-Variante ist überholt. Bekleidungsausnahmen und Überschneidungen zwischen erhaltenen und ausgeschlossenen Sortimenten ausdrücklich festgehalten; zusätzliche nicht angesprochene Ausschlüsse nicht als Nutzerfreigabe gewertet. Ausschließlich Dokumentation verändert, keine Daten-/Filter-/Anbieteränderung, kein Push oder Deployment. Formatierung, Unterschiedskontrolle und genannte Kategoriekennungen geprüft. Abschließende inhaltliche Freigabe steht weiter aus.

## 2026-10-17 - Juna - Kategoriebäume auf Modebezug prüfen

**Auftrag:** Shopify-, Vinted- und Kleinanzeigen-Kategorien vollständig auf Relevanz für Secondhand-Kleidung untersuchen und eine verständliche Ausschlussliste zur Nutzerprüfung erstellen. Noch keine Auswahl beschränken oder Kategorien löschen.

**Analyse:** 14.539 Shopify-Knoten (Version 2026-08), den vollständigen gespeicherten Vinted-Baum mit 2.920 Knoten und den eigenen Kleinanzeigen-Browserstand mit 3.239 Knoten ausgewertet. Shopify-Version/-Umfang und Vinted-Baum ausschließlich lesend aus Produktion geprüft. Vinted-Stand vom 09.10.2026 und fehlgeschlagene letzte Auffrischung (HTTP 307) im Bericht ausdrücklich benannt. Originalpfade und Elternbeziehungen aller drei Bäume konsistent. Nicht nur Hauptbereiche prüfen: Motorradbekleidung, Sport-Fantextilien, Arbeits-/Sportkleidung sowie Schul-/Wickeltaschen liegen teils außerhalb offensichtlicher Modebereiche.

**Ergebnis:** Prüfvorschlag unter `docs/research/2026-10-17-fashion-category-scope.md` mit zu erhaltendem Sortiment, allgemeinen Ausschlüssen, konkreten Anbieterästen und getrennten Empfehlungen zu textilen Babysachen, Reisegepäck, Wearables und Schutzausrüstung. Eine klar bezeichnete Kleinanzeigen-Prüfvariante enthält 95 Knoten einschließlich benötigter Eltern und 83 Endkategorien; gemischte Sportbereiche bleiben gesondert offen. Vollständige Quellen und alte Zuordnungen sollen intern erhalten bleiben. Keine Filter, Schema-, Anbieter- oder Bestandsdatenänderungen; kein Push oder Deployment. Dokumentation geprüft und formatiert, kein Anwendungsbau für diese reine Analyse erforderlich. Inhaltliche Freigabe durch den Nutzer steht aus.

## 2026-10-17 - Juna - Vollständigen Kleinanzeigen-Kategoriebaum übernehmen

**Auftrag:** Bestehenden gemeinsamen Kategorie-Wähler mit Suche und Unterkategorien auch für Kleinanzeigen verwenden. Den vollständigen Originalbaum über Browsersteuerung erfassen und lokal einpflegen; native Kategorieauswahl nur als Ersatzweg, falls der Scan scheitert.

**Erfassung:** Im tatsächlichen angemeldeten Kleinanzeigen-Browser sämtliche sichtbaren Kategorieverknüpfungen rekursiv durchlaufen. Vollständiger nativer Formularbaum mit 3.239 Knoten, 15 Wurzeln, 152 geprüften verzweigten Knoten und 3.087 Endkategorien, maximal vier Ebenen; keine offenen Äste oder fehlgeschlagenen Eltern. Namen, Reihenfolge und Originalpfade unverändert gespeichert. Ein anfänglicher 403 im schon geöffneten Formular ließ sich im frischen Formular nicht reproduzieren; der vollständige Scan gelang dort. Keine Anzeige, kein Entwurf, keine Bilder oder Nachrichten auf Kleinanzeigen angelegt.

**Umsetzung:** Vorhandenen Shared-Wähler unverändert mit eigener Kleinanzeigen-Datenquelle im Übernahmedialog und im Zielbereich des Listing-Editors eingebunden. Vollständige lokale Suche und Navigation ohne Erweiterungs-/Anbieterabfrage. Erst die bewusste Endkategoriewahl lädt die passenden Eigenschaften über die bestehende kontogebundene Erweiterung. Veröffentlichung lädt keinen Kategoriebaum mehr nach, sondern verlangt die abgeschlossene Auswahl und Feldprüfung. Anbieter-, Kosten- und Kontingentprüfungen sowie dauerhafte Aufträge bleiben erhalten. Der Scan enthält auch zehn Originalpfade aus dem Fahrzeugbereich mit Leerzeichen/Bindestrichen, die die bestehende automatische Übergabe noch nicht akzeptiert: Baum zeigt sie vollständig, automatische Übernahme wird verständlich als nicht unterstützt gemeldet. Bestehende Freigaben für automatische Veröffentlichung wurden nicht erweitert. Kein Schema-/Server-/Erweiterungsupdate erforderlich.

**Prüfungen:** Neue Baumtests und fehlender Shared-Wähler zunächst rot, danach grün. Unveränderten Inhalt aller Browserkategorien zusätzlich per SHA-256 abgesichert. Eine weitere rote Regression zeigte beim Kategoriewechsel verworfene eigene Angaben; kompatible Eigenschaften bleiben nach der Korrektur erhalten. Abschließend 14 Modellfälle und alle 125 betroffenen Komponentenfälle erfolgreich; zusätzlich Shared-Wähler und Formularservice im gezielten 44-Fälle-Lauf geprüft (teilweise überlappender Umfang). Alle 100 ausgewählten Browserfälle aus Transfer, Übersicht, Kleinanzeigen-Konten und Vinted-Einstiegen bestanden in 5,1 Minuten, darunter die vollständige Transfermatrix 24/24 mit 320/390/834/1440 Pixeln, Hell/Dunkel, Touch, Tastatur und AXE. Neuer Fall beweist lokale Baum-Navigation/Suche ohne Erweiterung; geöffnetes Auswahlfenster ebenfalls AXE-geprüft und Bildschirmaufnahme angesehen. Typprüfung, Produktionsbau, gezieltes ESLint, Formatierung, Suite-Audit und 28 Auswahl-/Registrierungsprüfungen erfolgreich. Die Registrierungsprüfung erkannte die noch fehlende Soll-Listen-Ergänzung für den neuen Browserfall zunächst rot, nach Ergänzung unverändert grün. Der erste isolierte Bau scheiterte ausschließlich an laufwerksübergreifenden Bildpfaden der verknüpften Telefonbibliothek; mit eigener Kopie dieses Pakets regulär grün. Keine Testbedingung gelockert.

**Prüfgrenze:** Die zwei normalen Listing-Studio-Browserfälle erreichen den geänderten transfergebundenen Baustein nicht und wurden lokal nicht erneut durchgespielt; dessen Einbindung ist durch die bestehenden Editor-Komponentenfälle geprüft. Keine Schema-, Server- oder Erweiterungsänderung, keine Datenbanktests erforderlich. Die notwendige Soll-Listen-Ergänzung wählt in der CI nach bestehender Regel den breiten Pflichtumfang einschließlich PWA; dieser steht für den noch zu erstellenden PR aus. Anbieterantworten in Veröffentlichungstests sind lokal nachgebildet; keine echte Anzeige veröffentlicht. Noch kein Push, PR, Merge oder Deployment.

## 2026-10-17 - Juna - Chatkorrektur zur Integration freigegeben

**Auftrag:** Nach ausdrücklichem Ja den lokal geprüften Zweig `juna/vinted-chat-activity` veröffentlichen, PR erstellen, alle erforderlichen CI-Prüfungen abwarten und ausschließlich bei Erfolg mit Merge-Commit integrieren. Anschließend den eigenen Remote-/lokalen Zweig und Worktree aufräumen sowie den automatischen Produktionslauf kontrollieren. Die Codebasis entspricht den dokumentierten lokalen Prüfergebnissen; neu ist nur diese Freigabedokumentation.

## 2026-10-17 - Juna - Verfügbarkeitsmeldungen ohne neue Chataktivität

**Auftrag:** Vinteds Systemmeldung „Artikel nicht mehr verfügbar“ soll im Verlauf sichtbar bleiben, aber vorhandene Chats weder zeitlich aktualisieren noch nach oben schieben. Ursache in Cloud- und Erweiterungsimport sowie dem Listenfallback untersuchen; gezielte Regressionen vor der Korrektur und betroffene bestehende Prüfungen ausführen. Eigener Zweig aus aktuellem origin/master; keine echten Nachrichten, Anbieteränderungen oder Veröffentlichung.

**Korrektur:** Cloud- und Erweiterungsimport berücksichtigen die deutsch-/englischsprachige reine Verfügbarkeitsmeldung nur noch im Verlauf. Listenrevision (`sourceUpdatedAt`) bleibt getrennt von belegter Aktivitätszeit und Vorschau; `sortAt` folgt der bekannten Aktivität auch bei wiederverwendetem Cache. Ohne sicheren Detailabruf bleibt die vorherige Aktivität erhalten. Echte Nachrichten mit identischem Wortlaut, Angebote und andere Statusmeldungen bleiben wirksam. Bereits betroffene Vorschauen werden innerhalb der bestehenden Drei-Detailabruf-Grenze aus belegten Nachrichten repariert. Erweiterung als 1.10.2 gekennzeichnet.

**Reviewkorrekturen:** Ausstehende Detailstände gehen ausdrücklich als `null` durch Cacheleser und isolierten Browserauftrag, damit ein zweiter Cloudabgleich die bewahrte Zeit nicht wieder verliert. Rote Regressionen durchlaufen beide tatsächlichen Grenzen. Die lokale Speicherregel bewahrt bei Teilverläufen eine neue Vorschau ausschließlich, wenn eine Nachricht desselben Gesprächs exakt Text und Zeitpunkt belegt. Unbestätigte kurze Listenbeschreibungen überschreiben weiterhin keine vollständige Vorschau. Auch ein gekürzter Verlauf behauptet keine neue vollständige Detailbestätigung. Zwei unabhängige Reviewdurchgänge ohne offene Befunde nach den Korrekturen.

**Migration:** Aus der unveränderten eigenen Migrationsdatenbank und einer Vergleichskopie mit ausschließlich der geänderten deklarativen Funktion automatisch per pg-delta erzeugt. Nur die bestehende Funktion `marketplace_import_local_inbox` wird ersetzt; keine Tabellen, RLS- oder Zugriffsrechte geändert. Generierte SQL transaktional eingespielt; anschließender Vergleich leer. Supabase-Typen aus der eigenen lokalen Datenbank neu erzeugt, fachlich und nach normalisiertem Dateiende identisch.

**Datengrenze:** Ohne bekannte frühere Aktivität und ohne andere belegte Nachricht im Verlauf lässt sich eine historische Chatposition nicht rekonstruieren. Das gilt auch für einen ausschließlich verschmutzten Cache ohne brauchbaren Verlauf. Keine frühere Zeit erfinden. Bekannte Aktivitäten bleiben erhalten; eine Reparatur alter Vorschauen setzt vorhandene belegte Nachrichten voraus.

**Prüfungen:** Regressionen zu Vorschau, Sortierzeit, wiederholtem Import, offenem Detailstand, isoliertem Browserauftrag, gekürztem Verlauf und gleichlautender echter Nachricht zunächst rot, danach grün. Abschließende vollständige Workergruppe 688 erfolgreich, acht bestehende Ausnahmen. 125 SQL-Dateien mit 4.474 erfolgreichen Prüfungen einschließlich Rechte- und Benachrichtigungsschutz; 135 bestehende Chat-/Kontospeicher-Komponentenfälle und 36 Antwort-/Nachrichtenmodelle erfolgreich. Worker-Typprüfung und Workerbau sowie Anwendungstypprüfung und regulärer Produktionsbau bestanden. Der erste Bau mit laufwerksübergreifend verknüpften Abhängigkeiten scheiterte an deren Bildpfaden; mit eigener Abhängigkeitskopie regulär grün. Abschließend 516 Workflow-/Erweiterungsfälle erfolgreich, sechs bestehende Ausnahmen; alle 14 vorhandenen Chat-Browserfälle mit Desktop/Mobil, Hell/Dunkel und AXE erfolgreich. Der erste Browserstart nutzte irrtümlich eine Produktions-CSP bei lokaler Testadresse, danach blockierte dieselbe CSP das vorhandene Inline-AXE. Beide Fehler gezielt der Testumgebung zugeordnet; unveränderte Tests unter dem regulären CI-Vorschauserver grün, keine Erwartungen oder Sicherheitsregeln geändert. ESLint, Formatierung der unterstützten Dateitypen, 31 Auswahl-/Registrierungsfälle und Suite-Audit erfolgreich. SQL über tatsächliche Datenbanktests und Funktionsreview geprüft. Breiter CI-Pflichtumfang wegen der Schema-/Scriptänderungen bleibt für den PR erforderlich; keine echten Nachrichten oder Anbieteraufrufe.

## 2026-10-17 - Juna - Korrektur-PR zur Integration freigegeben

**Auftrag:** Nach ausdrücklichem Ja den geprüften Korrekturzweig zur Inseratübernahme und Marktplatzbedienung veröffentlichen, den PR erstellen und sämtliche erforderlichen CI-Prüfungen abwarten. Nur bei Erfolg mit Merge-Commit integrieren, danach den eigenen Remote-/lokalen Zweig und den zugehörigen Worktree aufräumen. Der aktuelle Hauptzweig ist unverändert enthalten. Die vorhandenen lokalen Prüfbelege gelten für denselben Code; neu ist nur diese Freigabedokumentation. Anbieter-Liveabnahme und Bereitstellung der korrigierten Server-Endpunkte und Erweiterung bleiben gesondert zu prüfen.

**CI-Korrektur:** Alle Qualitäts-, Datenbank-, Anwendungs- und Produktions-PWA-Jobs bestanden im ersten PR-Lauf. Der breite Browserlauf fand eine echte Abweichung auf der normalen Einstellungsseite: Angular setzt bei direkter Routenbindung den nicht vorhandenen neuen Eingang `showAccountManagement` auf `undefined`; dadurch wurden dort versehentlich ebenfalls die Kontolinks versteckt. Eine gezielte lokale Regression bestätigte den Fehler zunächst rot. Die Umwandlung des Eingangs behandelt jetzt ausschließlich ein ausdrücklich gesetztes `false` als Ausblenden. Der Sichtbarkeitsdialog der Übersicht bleibt unverändert reduziert. Keine Browsererwartung und kein Zeitlimit gelockert. Nach Korrektur fünf Komponententests und alle 25 betroffenen Einstellungs-/Übersichts-Browserfälle einschließlich des unveränderten eBay-Verbindungsfalls erfolgreich; Produktionsbau, ESLint, Typprüfung und Suite-Audit ebenfalls grün.

## 2026-10-17 - Juna - Inseratübernahme und Marktplatzbedienung korrigieren

**Auftrag:** Nutzer meldet fehlende Bilder, Preise und Altersangaben bei Kleinanzeigen, verstreute Kontoverwaltung, missverständliche Entwurf-/Transferaktionen und einen unerwarteten Vinted-Leseprozess beim internen Kopieren. Bestehende Verwaltung und Gebührenabsicherung bleiben erhalten. Gespeicherte Quelldaten zuerst verwenden; Zielplattform und Konto auswählen, danach automatisch das passende vorbefüllte Inseratformular öffnen. Anbieterzugriff beim internen Vorbereiten nicht stillschweigend auslösen. Diagnose und Korrektur im eigenen Zweig aus aktuellem origin/master; keine Veröffentlichung oder Produktionsdatenänderung ohne gesonderten Auftrag.

**Korrektur:** Kontozahnrad direkt am jeweiligen Konto, kontogebundene Verwaltung und zusammenstehende Aktionen „Inserieren“/„Ansehen“; verstreute Verwaltungslinks und Wochenzieltexte entfernt. „Inserieren“ öffnet Plattform und Konto, danach automatisch die gespeicherte Vinted-Vorlage. Kein erneuter Quellabruf, keine 24-Stunden-Pflicht und kein verpflichtender Entwurfsschritt. Vorhandene Originalbilder bleiben vor unvollständigen Vorschaulisten erhalten. Passende Eigenschaften werden nur bei eindeutiger Übereinstimmung zugeordnet. Gespeicherte Zielkategorien werden ohne Anbieterabruf gelesen; erst explizites „Inserieren“ prüft aktuelle Anbieterfelder und verlangt bei Änderungen erneut Prüfung. Speichern geschieht intern vor dem dauerhaften Auftrag; späte Antworten und Formularänderungen überschreiben keine andere Auswahl. Gebühren- und Kontingentstopps bleiben erhalten.

**Bestandsdaten:** Kleinanzeigen-Import speichert jetzt Preis, Währung, Vorschaubild und gegebenenfalls das tatsächliche Erstelldatum ohne erfundene Uhrzeit. Dazu drei vollständig erzeugte Migrationen einschließlich expliziter Funktionsrechte; Typen neu erzeugt. Bereits vorhandene Inserate benötigen nach Bereitstellung der Erweiterung 1.10.1 einen ausdrücklichen neuen Abgleich. Keine Produktionsdaten oder echten Inserate verändert. Bilder werden im Übernahmeformular angezeigt; die vollständige Bildauswahl und Reihenfolge bleiben im vorhandenen Listing-Editor. Andere Übertragungsrichtungen und eBay-Veröffentlichung sind weiterhin nicht implementiert und werden nicht als verfügbar dargestellt.

**Prüfungen:** Frischer Aufbau aller Migrationen und 125 SQL-Testdateien mit 4.469 erfolgreichen Prüfungen. Ganze Anwendungsgruppen: 2.539 Modell-, 2.568 Angular-, 347 DOM-, 404 Deno- und 45 Landingpagefälle; 509 Workflowfälle erfolgreich, sechs bestehende Windows-Ausnahmen. Die zuletzt geänderten Dialog- und Veröffentlichungsfälle zusätzlich 20/20 grün. Der parallele Gesamtlauf scheiterte an einem bestehenden PDF-Test mit Zeitlimit; unverändert einzeln 5/5 und komplette DOM-Gruppe mit zwei Workern 347/347 grün. Format, ESLint, Typprüfung, Worker-Typprüfung, sechs betroffene Workerfälle und Produktionsbau bestanden. Echte MV3-Erweiterung im isolierten Browser: genau ein kostenloser Submit; kein Submit bei Gebühren, 100/101 Anzeigen, unbekannten Kosten, Bild- oder Kategorieänderung. Worker- und Browserneustart gleichen ausschließlich lesend ab. Anbieter- und API-Antworten in diesen Tests sind vollständig lokal. Keine echte Anzeige veröffentlicht.

**Browserabnahme:** Übersicht 21, Altersdarstellung acht und Kleinanzeigen-Kontoverwaltung elf betroffene Browserfälle erfolgreich. Abschließender vollständiger Transferlauf 23/23 erfolgreich in 57,3 Sekunden: 320/390/834/1440 Pixel, Hell/Dunkel, Touch, Tastatur und AXE; keine versteckten Quellaufrufe, kontogebundene gespeicherte Zielfelder, Gebühren-/Kontingentstopps, fehlende Angaben und Zielwechsel. Sichtbarkeit im Bildschirm und Textüberlauf ausdrücklich geprüft, aktuelle Desktop- und Mobilbilder zusätzlich angesehen. Testregistrierung/Auswahl 28/28 und Suite-Audit erfolgreich. Der geänderte Veröffentlichungsbaustein ist im vorhandenen Listing-Editor durch dessen Angularfälle abgedeckt; die zwei normalen Listing-Studio-Browserfälle erreichen diesen transfergebundenen Baustein nicht. Die automatische Testauswahl verlangt wegen Schema- und Registrierungsänderungen den breiten CI-Lauf einschließlich PWA; dieser steht mit dem neuen PR noch aus.

**Review:** Unabhängige Prüfung und gezielte rote Regressionen deckten zusätzlich verdrängte Originalbilder, blockierte Zielwechsel und durch geerbtes `nowrap` abgeschnittene Dialogtexte auf. Minimal korrigiert; kein neuer Architekturumbau. Auftragsstatus, Gebührenstopp, Fehler und Erfolg erscheinen im festen Fußbereich statt außerhalb des sichtbaren Formularbereichs. Verifizierter Docker-Kaltstart über den normalen Explorer-Weg dokumentiert; fremde Projekte nicht gestoppt. CI-Abnahme und Veröffentlichung dieses Korrekturzweigs stehen noch aus.

## 2026-10-16 - Juna - Transfer-PR zur Integration freigegeben

**Auftrag:** Nach ausdrücklicher Freigabe den geprüften Vinted-zu-Kleinanzeigen-Zweig pushen, den PR erstellen, alle erforderlichen CI-Prüfungen abwarten und ausschließlich bei Erfolg mit Merge-Commit integrieren. Danach den eigenen Feature-Zweig und Worktree aufräumen. Der aktuelle Hauptzweig ist bereits enthalten; funktionaler Stand und lokale Prüfbelege bleiben unverändert. Live-Anbieterabnahme und separate Bereitstellung der Server-Endpunkte bleiben offen.

**CI-Korrektur vor Merge:** PR #431 deckte im separaten Worker-Image fehlende gemeinsame Validierungsdateien und den dafür zu engen TypeScript-Ausgabebereich auf. Der Fehler ist lokal mit dem tatsächlichen Workerbau nachgestellt. Explizite Docker-Kontextfreigabe, passende kompilierte Ausgabepfade und ein zusätzlicher Laufzeitimport im Image-Smoke sichern die Korrektur. Worker-Bau, Typprüfung, Quelltests und 22 bestehende Docker-/Runtime-/Workflowverträge bestehen lokal. Eine unabhängige Qualitätsprüfung scheiterte am Download-Limit der Supabase-Registry; keine Testbedingung wurde dafür geändert. Der Datenbankjob erreichte sämtliche SQL- und Konkurrenzprüfungen erfolgreich, lehnte aber das offizielle Ersatzimage ghcr.io/supabase/postgrest ab. Dieser genaue Anbieterpfad ist jetzt erlaubt; Baseline rot, echter PostgREST v16.1 danach grün mit Konto-ID 9007199254740993. Beide Worker-/Broker-Abbilder bauen lokal, ihre Trennung und tatsächlichen Modulimporte bestehen ohne Netzwerk. 502 Workflowfälle bestehen erneut.

**Registry-Abbruch behoben:** Der separate Push-Function-Smoke scheiterte zweimal am ECR-Downloadlimit, bevor Prüfungen anliefen. Nur dessen Bezugsquelle wurde auf das offizielle ghcr.io/supabase/edge-runtime:v1.73.5 derselben Version umgestellt. Der bestehende Startfehler-/Cleanupfall belegt die Änderung zuerst rot und danach grün; alle 15 betroffenen Deploymentfälle (vier bestehende Windows-Ausnahmen) sowie der tatsächliche lokale Function-/Gateway-Smoke mit Auth-, Widerrufs-, Größen-/Anfragelimit- und Commitprüfung bestehen. Kein Produktionszugang, kein Versand, keine Prüfbedingung abgeschwächt. Der zweite CI-Datenbanklauf besteht vollständig mit 4.432 Prüfungen und allen Konkurrenznachweisen.

## 2026-10-16 - Juna - Vinted nach Kleinanzeigen übertragen

**Auftrag:** Vollständigen Übertragungsweg einschließlich Kontingentprüfung und automatischem Gebührenstopp umsetzen. Bestehende Übersicht und Entwürfe weiterverwenden; notwendige Kleinanzeigen-Kontobindung mit umsetzen.

**Stand:** Vollständiger Übertragungsweg im eigenen Feature-Zweig: private Kleinanzeigen-Kontobindung mit getrennter Lesefreigabe und Veröffentlichungsfreigabe, atomarer Inseratabgleich, vollständige Vinted-Quelle und geprüfte Originalbilder, Zielformular aus dem gebundenen Browserprofil sowie dauerhafte Veröffentlichungsaufträge. Entwürfe bleiben im bisherigen Listing Studio. Die Erweiterung prüft Kontingent und Formular unmittelbar vor dem verbindlichen Klick. Gebühren und unbekannte Kosten stoppen den Auftrag; unbekannte Ergebnisse erlauben nur einen lesenden Abgleich. Bestätigte Ziele erscheinen mit ihrer tatsächlichen Ziel-ID in der zentralen Übersicht. Erweiterungsversion 1.10.0.

**Geprüfter Stand:** Auf aktuellen Hauptzweig einschließlich Veröffentlichungszeiten und Navigation integriert. Alle zehn neuen Migrationen zusammen mit dem Hauptzweig vollständig in einer eigenen isolierten Datenbank neu eingespielt; 361 SQL-Prüfungen bestanden. Echte konkurrierende Sitzungen prüfen den letzten freien Platz, Claim und begin. Ein echter PostgREST-Aufruf erhält große Kontokennungen verlustfrei als Zeichenfolge. Der vollständige MV3-Ablauf mit tatsächlicher Erweiterung, privaten Binärbildern und genau einem Submit sowie Stopps bei 100/101 Anzeigen, Gebühren, unbekannten Kosten, extern verbrauchtem Kontingent und beschädigten Bildern besteht unter Windows und Linux mit Chromium 151. Ein echter Worker- und Browserneustart setzt einen gespeicherten writing-Versuch ausschließlich lesend fort. Anbieterantworten bleiben in diesen Tests synthetisch und vollständig lokal.

Die vollständige Projektprüfung besteht: Format, ESLint, Typen, 502 erfolgreiche Workflowtests (sechs bestehende Windows-Ausnahmen), 402 Deno-, 2.528 Modell-, 347 DOM-, 2.555 Angular- und 45 Landingpagefälle sowie Produktionsbau. 88 betroffene Workerfälle und Typprüfung ebenfalls grün. Beide bestehenden Listing-Studio-Browserfälle sind gegen eigene vollständige API-Dienste geprüft. Die Transfermatrix umfasst 320/390/834/1440 Pixel, Hell/Dunkel, Touch, Tastatur, Fokus und AXE; alle 95 betroffenen Browserfälle des integrierten Produktionsstands bestehen. Der unabhängige Abschlussreview fand vier belegte Verhaltensfehler; alle vier wurden mit roten Regressionen korrigiert. Der tatsächliche Erweiterungscontroller ist zusätzlich mit PostgreSQL geprüft. Die abschließende Gesamtprüfung des Fixdurchgangs ist erfolgreich. Ein zusätzlicher durchgehender Editor-Browsertest zur Bildreihenfolge bleibt als kleiner Testbefund zurückgestellt.

**Zusätzliche Abschlusskorrekturen:** Reine Kleinanzeigen-Verträge ausdrücklich für den Docker-Bau freigegeben; echten MV3-CI-Test nach der Chromium-Installation eingeordnet. Bestehende Browserfixtures verwenden die passende Backendadresse und CSP-verträgliche AXE-Ausführung. Drei vorbestehende offene Dienst-Client-Timer im Beta-Bewerbungsendpoint mit der gleichen unveränderten Testgruppe nachgewiesen und durch deaktivierte automatische Sitzungserneuerung behoben. Kein Prüflimit und keine Rechteprüfung abgeschwächt.

**Grenze der Abnahme:** Kein echter Anbieter-Upload, kein echter Entwurf und keine echte Anzeige mit diesem neuen Weg erstellt. Bildvorschau und Erfolgsseite sind noch nicht live abgenommen. Ein Test mit einem echten Artikel benötigt dessen konkrete Auswahl und ausdrückliche Freigabe. Die Ableitung kostenloser Veröffentlichung aus offiziellem Privatkontingent und ungewählten Zusatzoptionen ist dokumentiert; ein sichtbarer Null-Gesamtpreis wird nicht behauptet. Kein Push und kein neuer PR.

**Docker-Korrektur:** Der Nutzer hat Docker vor dem fehlgeschlagenen Start nicht bereits gestartet. Frühere Vermutung einer zweiten Instanz zurückgenommen. Zugriffsunterschied zwischen geschützter und normaler Befehlsumgebung lesend bestätigt; Ursache des Socketfehlers offen. Verbindlichen Ablauf für künftige Starts über Computer Use dokumentiert und hier verlinkt. Kein Neustart laufender Projekte und keine Socketdateien gelöscht.

## 2026-10-16 - Juna - Eigene Veröffentlichungszeit vor Vinted-Altersfallback verwenden

**Auftrag:** Beim ersten Kontoabruf alle fehlenden Altersangaben ergänzen, danach
gespeicherte Werte weiterverwenden und neue Inserate ergänzen. Für über Flipbase
veröffentlichte Inserate soll die bestätigte eigene Veröffentlichungszeit Vorrang
haben; Vinteds Altersangabe ist Fallback. Dies ersetzt die bisherige Begrenzung
auf drei Zusatzseiten und das tägliche Auffrischen bekannter Alterswerte.

**Entscheidung:** Nur bestätigte aktive Veröffentlichungen sind Zeitbeleg;
Entwurf, wartender Auftrag, Verarbeitung und fehlgeschlagene/ungeklärte Versuche
sind keine Online-Zeit. Gleiche Kontoidentität und Workspacebindung bleiben
verbindlich. Erstimport fragt alle fehlenden Werte ab; erfolgreich gespeicherte
Angaben werden nicht neu gelesen. Für fehlgeschlagene Zusatzabrufe bleibt die
bisherige tägliche Wiederholpause erhalten. Unbekannte Werte werden nicht aus
Abruf- oder Änderungszeit erfunden.

**Umsetzung und Prüfung:** Eigener Zweig `juna/vinted-publication-time` aus
aktuellem `origin/master`; fremde Zweige und Produktionsdaten unverändert.
Importregressionen zuerst rot (Dreiergrenze, erneutes Lesen bekannter Angaben,
falsche Zeitpriorität). Nach der Workeränderung 680 Tests bestanden, acht bestehende
Windows-/Integrationsausnahmen. Mehrseitiger Erstimport mit 25 Inseraten,
Folgeimport mit genau einem neuen Inserat, Monatsgrenze gespeicherter Angaben,
Rechtewiderruf sowie 403/429 geprüft. Worker-Typprüfung, Bau und gezieltes ESLint
bestanden.

**Datenbank und Integration:** Bestätigte aktive Veröffentlichungen aus demselben
Workspace, derselben Verbindung und aktueller Kontoidentität liefern den
vorrangigen Zeitpunkt. Der sitzungsgebundene Server-RPC liefert ihn auch vor dem
ersten Inseratimport. Datenbanktrigger ergänzen vorhandene Einträge bei neuer
Veröffentlichungsbestätigung und bewahren die Zeit bei Cloud-/Extensionimports.
Alte Einträge werden beim nächsten Import nachgezogen. Entwürfe und noch
verarbeitete oder ungeklärte Aufträge bleiben ausgeschlossen. Ein Reviewbefund
zu ungültigen/future Altwerten wurde mit fünf weiteren Regressionen behoben;
gültige Fallbackwerte bleiben erhalten.

**Migration:** Deklaratives Schema und neue additive Migration. Vollständiger
Schemaabgleich enthielt fremden bestehenden Drift; deshalb automatisch auf
Migrationsbasis gegen nur die neue Schemadatei eingegrenzt. Der CLI-Generator ließ
Client-REVOKEs trotz bestehender DEFAULT PRIVILEGES aus. Die zehn fehlenden
Anweisungen wurden automatisch aus den getesteten PostgreSQL-Katalogrechten der
fünf neuen Funktionen erzeugt, keine Rechte von Hand geraten. Finale Datei
bytegenau transaktional auf dem alten Stand eingespielt; danach Schema-/Rechte-
Abgleich leer und 301 SQL-Fälle aus sieben betroffenen Dateien bestanden,
darunter 50 neue. Alle fünf Funktionen für anon/authenticated gesperrt und nur
für service_role freigegeben. Generierte Typen aus dem finalen Replay aktualisiert.
Sicherheitsprüfung ohne Fehler, keine neuen SQL-Lintbefunde. Nur die eigene
isolierte Datenbank samt Schattenressourcen anschließend gesichert gestoppt.

**Abschlussprüfung:** 2.818 Node-/DOM- und 2.480 Angularfälle bestanden.
Die anfänglich fehlende lokal generierte Versionsdatei wurde erzeugt; nur die
drei betroffenen Suites wurden danach gezielt erneut erfolgreich ausgeführt.
53 bestehende Alters-/Antwortmodelle ebenfalls geprüft. Anwendungs- und
Worker-Typprüfung/Bau, geänderte Dateien formatiert/gelintet, 26 Auswahl-/Schema-
Registrierungsfälle und Suite-Audit bestanden. Unabhängiges Abschlussreview
bestätigt Migration, Trigger, Quellenpriorität und Rechte ohne wichtige offene
Befunde. Lokale Anwendungssuiten unter Windows, SQL-Replay auf isoliertem Linux-
Postgres; kein neuer Browserlauf für unveränderte Vorlagen. Vor Veröffentlichung
bleiben die ausgewählten Linux-/Image-/Browser-/PWA-CI-Prüfungen erforderlich.

Kein Push oder produktiver Wechsel in dieser Umsetzung. Veröffentlichung:
zuerst regulärer Web-Release mit Migration, danach Worker, Broker und Sitzung
zusammen aus demselben geprüften Merge-Stand aktualisieren.

## 2026-10-16 - Juna - Überflüssigen Zurück-Link „Alle Konten“ auf Vinted-Unterseiten entfernen

**Auftrag:** Auf den Vinted-Unterseiten (Übersicht, Kleiderschrank, Statistik, Verkäufe,
Verlauf, Profil) den oberen Zurück-Link mit Pfeil („Alle Konten“) entfernen, da der Wechsel
zur Kontenübersicht direkt über den Reiter „Konten“ in der Seitenleiste möglich ist und
die zusätzliche Zeile unnötig Platz einnimmt.

**Änderung:** Den einfachen Zurück-Link `<app-button variant="plain" link="/marketplaces/vinted/accounts" [icon]="backIcon">Alle Konten</app-button>`
unterhalb des Seitenkopfs in `src/app/features/marketplaces/vinted-workspace.component.html`
sowie die nicht mehr benötigte Eigenschaft `backIcon` (`LucideArrowLeft`) in
`src/app/features/marketplaces/vinted-workspace.component.ts` entfernt. Bestehende
Komponententests und den Browserfall in `e2e/vinted-account-grid.spec.ts` auf die
Rücknavigation über den Seitenleisten-Eintrag „Konten“ umgestellt.

**Prüfung:** Gezielte Angular- und Node-Tests (`vinted-workspace.component.angular.spec.ts`,
`app.routes.angular.spec.ts`, `ebay-account.component.angular.spec.ts`,
`settings.routes.spec.ts`), Workflow-/Testauswahl (`affected-tests.test.mjs`,
`playwright-pr-smoke.test.mjs`), ESLint, Prettier, Typprüfung, Anwendungsbau sowie
Playwright-Prüfung von `e2e/vinted-account-grid.spec.ts` bestanden.

> > > > > > > origin/master

## 2026-10-16 - Juna - Zeitbudget der Einstellungsprüfung pro Breite trennen

**CI-Befund:** Im PR 428 bestanden alle Fach-, Qualitäts-, Image- und PWA-Prüfungen.
Der bestehende Einstellungstest verbrauchte sein gemeinsames 60-Sekunden-Budget
mit 27 Seitenaufrufen und 54 erfolgreichen AXE-Prüfungen. Die letzte Navigation
endete erst am Budgetende; der Weiterleitungsprüfung blieben etwa 100 Millisekunden.
Der Fehler wurde gezielt mit Node 22 und Playwright 1.62.1 unter Linux nachgestellt.

**Korrektur:** Derselbe Inhalt läuft je Bildschirmbreite als eigener Fall.
Alle neun Seiten, beide Farbschemata, Überlauf-, Seitenfehler- und Screenshotprüfungen
bleiben erhalten. Die Weiterleitung wird nun bei jeder Breite geprüft.
Keine Zeitgrenze oder Fehlerbedingung geändert. Die verbindliche Soll-Liste der
PR-Tests enthält alle drei Fälle; dadurch wählt CI vorsichtshalber den breiten
Prüfumfang. Keine zusätzliche fachliche Anwendung geändert.

**Prüfung:** Vier bestehende beziehungsweise aufgeteilte Einstellungs-/eBay-Fälle
unter Linux mit zwei CPUs, 7 GB Speicher und eingeschaltetem Trace bestanden
(43,7 / 40,4 / 40,6 / 8,0 Sekunden). Vollständige Projektkopie einschließlich
versteckter Baukonfigurationen aus dem Git-Stand; nur die Anmeldevorbereitung
für diese vollständig simulierten Testkonten ausgelassen. 25 Auswahl- und
Registrierungsprüfungen, Suite-Audit, ESLint und Formatprüfung bestanden.
Unabhängiges Review ohne wichtige Befunde. Der neue CI-Lauf bleibt vor Merge
verpflichtend; keine unveränderte Wiederholung des fehlgeschlagenen Laufs.

## 2026-10-16 - Juna - Inseratsalter zur Integration freigeben

**Freigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen
sowie das anschließende Aufräumen des eigenen Zweigs und Worktrees bestätigt.
Der Fehlerzweig enthält den aktuellen Stand von `origin/master`; der Abgleich
vor dem ersten Push erfordert keine weitere Integration. Die zuvor dokumentierten
lokalen Prüfungen bleiben gültig. Linux-, Image- und alle weiteren ausgewählten
CI-Pflichtprüfungen müssen vor dem Merge erfolgreich sein.

## 2026-10-16 - Juna - Inseratsalter einheitlich in Tagen anzeigen

**Auftrag und Entscheidung:** Inseratslaufzeiten grundsätzlich in Tagen statt
Stunden anzeigen und das sichtbare „ca.“ entfernen. Die Regel soll später auch
für die anderen Marktplätze gelten.

**Änderung:** Exakte Zeitpunkte und gerundete Vinted-Angaben verwenden dieselbe
Tagesdarstellung: unter 24 Stunden „Unter 1 Tag online“, danach „1 Tag online“,
„2 Tage online“ usw.; kompakt „< 1 Tag“, „1 T“, „2 T“. Die gerundete Datenherkunft
bleibt getrennt gespeichert und im Hinweis benannt. Die Vorgabe steht dauerhaft
in `docs/design/admin-ui-guidelines.md`; andere Marktplatzabrufe werden hier
nicht erweitert. Dies ersetzt die frühere Entscheidung für ein sichtbares „ca.“.

**Prüfung:** Neue Grenzfälle für 0/24/48 Stunden und gröbere Anbieterangaben
scheiterten zunächst am alten Verhalten. Danach 164 betroffene Modelltests und
732 betroffene Angularprüfungen bestanden; Typprüfung, ESLint, Formatierung und
regulärer Produktionsbau ebenfalls. Drei bestehende Browserdateien vollständig
geprüft: 41 Fälle bestanden direkt; ein Fall meldete nach bestandenen fachlichen
Prüfungen lokal `ERR_NO_BUFFER_SPACE` und bestand danach einzeln mit einem
Browserprozess. Kein Test abgeschwächt. Unabhängiges Anschlussreview ohne wichtige
Befunde. Weiterhin eigener unveröffentlichter Zweig `juna/vinted-listing-age`.

## 2026-10-16 - Juna - Gerundetes Vinted-Inseratsalter aus der Detailseite übernehmen

**Auftrag:** „Alter unbekannt“ in Marktplatzübersicht, Kleiderschrank und
Inseratdetail untersuchen. Nutzerentscheidung: Vinteds gerundete Angabe mit
„ca.“ anzeigen, falls keine genaue Veröffentlichungszeit vorliegt.

**Ursache und Nachweis:** Die produktiven Feldnamenprotokolle der Kleiderschrankliste
enthalten weder `created_at_ts` noch `created_at`. Alle drei Ansichten verwenden
denselben bisher leeren Wert. Ein rein lesender echter HTML-Abruf des geprüften
Inserats liefert HTTP 200 und am zugehörigen `upload_date`-Attribut „2 Tagen“;
die kanonische Inseratadresse stimmt überein. Die Altersberechnung selbst war
nicht die Ursache.

**Korrektur:** Der Cloudabruf ergänzt höchstens drei eigene Inserate je Durchlauf
aus der passenden HTML-Detailseite. Fehlende Angaben werden zuerst gelesen;
gespeicherte Angaben zählen ab ihrer Beobachtungszeit weiter und werden höchstens
täglich aufgefrischt. Wert, Einheit und Beobachtungszeit bleiben ausdrücklich
getrennt von einem genauen Veröffentlichungszeitpunkt. Vorhandene genaue Daten
haben Vorrang. Fremde kanonische Seiten und unbekannte Altersangaben liefern
keine Schätzung; 403/429 stoppen weitere Anbieterabrufe. Die bestehenden
kontogebundenen JSON-Lesekopien speichern die Angaben ohne Schemaänderung.
Die lokale Browsererweiterung ist von diesem Cloudabruf nicht betroffen.

**Prüfung:** Import- und Anzeigeregressionen scheiterten vor der Korrektur am
fehlenden Zusatzabruf beziehungsweise an „Alter unbekannt“. Worker-Suite:
673 bestanden, acht bestehende Plattform-/Integrationsausnahmen. 158 betroffene
Modelltests und 2.480 Angularprüfungen bestanden; anschließend sechs zuletzt
angepasste Komponenten-/Übersichtsfälle gezielt erneut bestanden. HTML-Leseweg
mit echten DOMParser-Selektoren, Cachegrenzen/-rotation, Kontotrennung und
isolierter Prozessübergabe geprüft. Unabhängiges Abschlussreview ohne wichtige
Befunde. 27 bestehende Browserfälle der Übersicht sowie des Kleiderschranks und
Inseratdetails bestehen gegen einen ruhenden Produktionsbau: 320/390/834/1440
Pixel, Hell/Dunkel, Tastatur/Touch und AXE. Frontend-/Workerbau, Formatierung,
ESLint und beide Typprüfungen bestanden. 25 Testauswahl-/Registrierungsfälle und
Suite-Audit bestanden. Die Windows-Laufwerkverknüpfung der Abhängigkeiten wurde
für den regulären Bau durch eine lokale Offlineinstallation aus unverändertem
Lockfile ersetzt; keine Paketversion geändert.

**Prüfgrenzen:** Lokal gezielt die drei tatsächlich geänderten Oberflächen geprüft;
keine unabhängigen Einkaufs-/PWA-Abläufe durchgespielt. Die vollständige konservative
CI-Auswahl zusätzlicher Verbraucher sowie Linux-/Imageprüfungen bleiben vor dem
Merge erforderlich. Der echte Vinted-Nachweis prüft nur den lesenden Datenweg;
der neue Cloudimport wurde nicht produktiv ausgerollt.

Kein Produktionscode veröffentlicht, keine echten Inserate geändert. Eigener
Zweig `juna/vinted-listing-age`; fremde Arbeitsstände bleiben unberührt.

## 2026-10-16 - Juna - Chrome-Abschluss und getrennte Kontowiederherstellung absichern

**Auftrag:** Die Ursache des unsauberen Chrome-Abschlusses untersuchen und
verhindern, dass ein betroffenes Konto dauerhaft alle anderen Abrufe blockiert.

**Nachweis:** Das bisherige Schließen aller Fenster beendet Chrome mit aktiven
Hintergrundaufgaben nicht. Der synthetische Linux-Fall scheitert am alten
Acht-Sekunden-Stopp und besteht mit ausdrücklichem regulärem Browserabschluss.
Welcher konkrete Hintergrundzustand beim ursprünglichen Ausfall vorlag, bleibt
mangels damaliger Aufzeichnung offen. Der globale Stillstand durch einen längst
beendeten Container ist dagegen eindeutig nachgewiesen.

**Änderung:** Regulären Chrome-Abschluss mit begrenztem Warten auf Prozessende
verwenden. Der Host unterscheidet ein geprüftes physisches Ende von einer
unsauberen Profilspeicherung. Containerentfernung erhält das Profil; nur der
betroffene Abrufplan pausiert, während weitere Konten weiterlaufen. Feste private,
atomar veröffentlichte Stoppmetadaten überleben Dienstneustarts und
Datenbankausfälle. Die Wiederherstellung respektiert die gespeicherte
Auftragsfreigabe und neue Nutzerentscheidungen. Eigene und verwaiste lokale
Profilreservierungen werden getrennt geprüft. GoLogin benötigt weiterhin einen
zusätzlich bestätigten entfernten Anbieter-Stopp. Details und Einführung in
`docs/audit/2026-10-16-vinted-browser-shutdown.md`.

**Prüfumfang:** Bestehende und neue Workerfälle, echte Linux-Chrome-Abschlüsse
mit Cookiepersistenz, tatsächliches Sitzungsimage mit eingefrorenem Chrome und
anschließendem Profilneustart, Workflow-/Testauswahl, Formatierung, Lint,
Typprüfung und Worker-/Broker-/Sitzungsbau. Kein Angular- oder Schemaumbau und
kein fachfremder Verkaufs-/Einkaufsbrowserlauf. Linux: 674 Workerfälle bestanden,
ein bestehender Integrationsfall ohne Test-URL ausgelassen; Windows: 667 bestanden,
acht Plattform-/Integrationsausnahmen. Beide echten Chrome-Regressionen und der
Runtime-Freeze-Nachweis bestehen; 22 Workflow-/Auswahlprüfungen und Suite-Audit
ebenfalls. Reviewbefunde zu Startfehlern, Profilbesitzern, Auftragsversionen und
dauerhafter Stoppwarnung behoben, Abschlussreview ohne offene wichtige Befunde.
Nachträglich ergänzter Datenbankausfall-/Workerneustartfall ist gezielt bestanden.
Der Nutzer hat PR-Erstellung, erfolgreiche Pflichtprüfungen und anschließenden
Merge ausdrücklich freigegeben. Danach werden Worker, Broker und Sitzungsimage
gemeinsam veröffentlicht und die drei produktiven Abrufe überprüft.

## 2026-10-16 - Juna - Blockierte Vinted-Synchronisierung wiederherstellen

**Auftrag:** Alle drei Cloudkonten zeigen seit rund vier Stunden unveränderte
Abrufzeiten; Wiehen Store meldet „Abruf wartet“. Den Ausfall untersuchen und nach
ausdrücklicher Nutzerfreigabe das betroffene Profil serverintern sichern und den
bereits beendeten Browsercontainer gezielt entfernen.

**Befund:** Am 15.10. um 19:55 Uhr bleibt die Browsersitzung von Wiehen Store nach
erfolgreicher Datenübernahme offen. Der zugehörige isolierte Browsercontainer ist
bereits beendet: Exitcode 75, kein laufender Prozess, kein Speichermangel-Abbruch.
Die Laufzeit verwendet 75 für einen unbestätigten sauberen Browserstopp; der
Containerlauncher lehnt seine Entfernung deshalb absichtlich ab. Die normale
Bereinigung wiederholt diesen unveränderlichen Fehler alle 30 Sekunden. Die
globale Browsersperre verhindert anschließend auch die wartenden Abrufe von
Flipbase und Maike Vintage. Wiehen Stores Zeitplan ist zusätzlich mit `cleanup`
deaktiviert, während der Worker weiterhin als gesund gilt. Der ursprüngliche
Fenster-/Prozesszustand ist nicht protokolliert; warum Chrome nicht sauber endete,
ist damit nicht abschließend bewiesen. Kein erneuter 80-Gespräche-Seitenfehler:
die letzten Gesprächslisten wurden vollständig übernommen.

**Wiederherstellung:** Geschützte vollständige Profilsicherung ausschließlich
auf dem Server unter
`/opt/flipbase-marketplace/recovery/20261016-stopped-browser-222714` (Elternverzeichnis
und Sicherungsordner Modus 0700). SQLite-Integritätsprüfungen von separaten Kopien
einschließlich Journalen bestehen für Cookies, History, Web Data und Login Data.
Keine Inhalte oder Zugangsdaten ausgegeben. Nach erneutem Abgleich von Container-ID,
Kontoprofil, Mount und beendetem Prozesszustand nur diesen Container entfernt;
das eigentliche Profil einschließlich Anmeldedaten bleibt erhalten. Die vorhandene
Bereinigung schließt danach selbst die Datenbanksitzung und gibt die Warteschlange
frei. Keine Datenbankstände von Hand geändert und keine Schutzregel abgeschwächt.
Wiehen Stores Automatik über die vorhandene angemeldete Oberfläche mit dem
bisherigen Zehn-Minuten-Abstand fortgesetzt und einen normalen Kontrollabruf
gestartet. Keine erneute Anmeldung erforderlich.

**Prüfung:** Am 16.10. erfolgreiche Abschlüsse einschließlich Browserbereinigung:
Flipbase 00:27:54 Uhr, Maike Vintage 00:28:07 Uhr, Wiehen Store 00:29:10 Uhr
(Europe/Berlin). Kein `error_code`, keine offene Browsersitzung; alle drei
Zeitpläne wieder aktiviert, bisherige Abstände 5/15/10 Minuten erhalten.
UI bestätigt Wiehen Stores neuen Datenstand. Dies stellt den Betrieb wieder her,
belegt aber keine dauerhafte Behebung des ursprünglichen Chrome-Stoppfehlers.
Kein Produktcode, Schema oder Image geändert; deshalb keine Anwendungstests oder
neuen Bauten. Eigener Dokumentationszweig `juna/vinted-sync-recovery-2026-10-16`;
fremde unversionierte Dateien bleiben unverändert.

## 2026-10-16 - Juna - Marktplatzübersicht zur Integration freigeben

**Auftrag:** PR erstellen und nach erfolgreichen Pflichtprüfungen per Merge-Commit
integrieren; anschließend eigenen Feature-Zweig und Worktree aufräumen.

**Vorbereitung:** Nutzerfreigabe liegt vor. Aktuellen Hauptzweig einschließlich der
gezielten Testauswahl integriert; beide Einträge im Änderungsprotokoll erhalten.
Die neue Übersicht ist in dieser Auswahl ausdrücklich ihren eigenen Browserfällen
zugeordnet. Der neue Auswahlfall schlug zunächst fehl; nach der Korrektur bestanden
46 Auswahl-, Registrierungs- und Freigabevertragstests einschließlich der tatsächlichen
Playwright-Auflistung. Bereits dokumentierte lokale Anwendungs-, Datenbank- und
Browserprüfungen bleiben Grundlage; die erforderlichen CI-Prüfungen müssen vor
dem Merge erfolgreich sein.

**CI-Nachprüfung:** Im ersten PR-Lauf waren Qualität, Datenbank, PWA und alle
Anwendungstests erfolgreich. Ein bestehender Vinted-Browserfall erwartete noch
die Menüliste ohne den neu vorgesehenen Rücklink „Alle Marktplätze“. Fehler lokal
identisch nachgestellt; erwarteten Link und seine Zieladresse ergänzt, danach alle
sechs vorhandenen Vinted-Ansichten in 1440/390/320 Pixeln und Hell/Dunkel erfolgreich.
Keine Produktänderung und keine Prüfgrenze abgeschwächt; neuer CI-Lauf erforderlich.

## 2026-10-15 - Juna - Zentrale Marktplatzübersicht umsetzen

**Auftrag:** Paket A direkt in dieser Sitzung umsetzen. Kontingent und Gebührenstopp
bleiben für den späteren Veröffentlichungsweg verbindlich.

**Stand:** Persönliche Sichtbarkeit je Nutzer und Workspace mit sicherer
Altdatenübernahme und Rücknahme fehlgeschlagener Änderungen implementiert.
Neue RLS-Fälle bestehen nach vollständigem Neuaufbau aus der erzeugten Migration.
Die CLI ließ anfangs geerbte Standardrechte bestehen; ein zusätzlich erzeugter
Rechte-Diff ist Teil der neu generierten Migration. Bestehende Tests wurden
unverändert auf diese Grenze angewendet.

Gemeinsame Übersicht unter /marketplaces/overview mit Accountfiltern, aufklappbaren
Inseratlisten, vollständiger Vinted-Suche und Statusfilter auf der gespeicherten
Lesekopie, eBay-Seitennavigation und getrennter Auswahl geliefert. Vorhandene
Detail-/Bearbeiten-/Entwurfswege wiederverwendet; Kleinanzeigen-Abgleich und Transfer
bleiben klar als Folgeschritte getrennt. Keine echten Inserate verändert.

**Prüfung:** Anwendungssuiten 5.287/5.287, neue SQL-Zugriffsfälle 14/14 nach
Migrations-Neuaufbau, neue Browserfälle 21/21 (320/390/834/1440, Hell/Dunkel,
Touch/Tastatur/AXE, Auswahl, Workspacewechsel, Freigabe und Kontextnavigation).
Bestehende Browserfälle: Account-/Einstellungsansichten 29 bestanden plus vier
gezielt reparierte Testfälle bestanden; lokale Backend-Navigation/Listing-Studio
6/6. Bei den vier Fällen Dialoganimation abgewartet und mehrdeutigen Statusbezug
auf die betreffende Accountkarte eingegrenzt; keine Prüfgrenzen abgeschwächt.
Testregistrierung, Schema-Registrierung, Suite-Audit, Shared-UI-Prüfung, gezielte
Formatierung/ESLint, Typprüfung und Produktionsbau bestanden.
Abschließendes unabhängiges Codereview durchgeführt: plattformbezogene Wiederholung
erhält fremde Auswahl; bisherige Einstellungsseite kann Erstabrufe wiederholen;
eBay-Sandbox behält den vorhandenen Ansehen-Link. Neue Fehlerfälle jeweils vor
Korrektur reproduziert, danach gezielt und mit vollständiger Anwendungssuite grün.
Nach den Korrekturen 23/23 Browserfälle (21 neue plus zwei Einstellungen) bestanden.
Noch kein Push oder PR; Linux-/CI-
Gesamtprüfung und echte Anbieterabnahme stehen außerhalb dieser lokalen Abnahme.

## 2026-10-15 - Juna - Privatkontingent für Kleidungsanzeigen recherchieren

**Auftrag:** Prüfen, ob die Privatkonto-Regel für 100 neue Anzeigen in 30 Tagen
auch Kleidung betrifft und welche Folgen sie für die Marktplatzplanung hat.

**Ergebnis:** Offizielle Privatgebührenseite und Warenzuordnung gelesen;
Bekleidung als Konsumgut eingeordnet, keine dokumentierte Bekleidungs-Ausnahme
gefunden. Privatstatus und fehlendes PRO-Abo sind getrennte Merkmale.
Quellen, Grenzen und Folgen in
docs/research/2026-10-15-kleinanzeigen-private-listing-quota.md festgehalten.
Spezifikation und Teilpläne ergänzen Standard-Privataccounts als erste Abnahme,
ehrliche Kontingentanzeige und zusätzliche Gebühren-/Kontotypfälle.

**Prüfung:** Öffentliche Quellen, Dokumentverweise, Markdown-Formatierung und
Unterschiedskontrolle. Keine Anmeldung, Produktcodeänderung, Anwendungstests
oder echten Inserataktionen; eigener Planungszweig juna/marketplace-hub-planning.

## 2026-10-15 - Juna - Marktplatzübersicht und ersten Transfer konkret planen

**Auftrag:** Den im Chat bestätigten Aufbau als konkreten Umsetzungsplan ausarbeiten,
mit Vinted → Kleinanzeigen als erstem vollständigen Übertragungsweg.

**Ergebnis:** Eine gemeinsame Spezifikation, eine Umsetzungsfolge und drei Teilpläne
für Übersicht, Kleinanzeigen-Kontobindung/Inseratabgleich und den vollständigen
Einzeltransfer geschrieben. Dateien, Schnittstellen, Schemaänderungen, betroffene
bestehende Tests, neue Fälle, CI-Registrierung und Abnahmekriterien sind benannt.
Die vorhandenen Kleinanzeigen-Entwürfe und Bilder bleiben Grundlage; kein zweites
Entwurfssystem. Lokale und Cloud-Vinted-Quellen werden berücksichtigt. Relisting,
Sammelausführung, weitere Richtungen und mehrere eBay-Verbindungen folgen getrennt.
Sichtbarkeit ist persönlich je Workspace und getrennt von Accountpause/Freigabe.

Der Integrationsstand enthält inzwischen Galerie/Inseratsalter aus PR #423.
Den älteren Transferentwurf als überholt gekennzeichnet: keine automatische
Titelkürzung, geratenen Zustandswerte oder festen Versandpreise übernehmen.
Offizielle Kleinanzeigen-Hilfe und Gebühreninformationen gelesen; automatische
Ausführung stoppt vor kostenpflichtigen/unklaren Buchungsschritten. Anbieteridentität,
Formularvertrag und Erfolgsbelege müssen vor der Browserumsetzung lesend nachgewiesen
werden. Das ist im Plan eine eigene überprüfbare Aufgabe.

**Prüfung und Grenzen:** Eigenreview von Umfang, Typen, Dateipfaden, Fehlerfällen
und tatsächlicher CI-Auswahl. Markdown-Formatierung, Dokumentverweise und Unterschiedskontrolle bestanden. Keine Produktcodeänderung, Migration, Installation,
Anwendungstests oder echten Inserataktionen. Planung im eigenen Zweig
juna/marketplace-hub-planning; keine fremden Zweige verändert.
Die konkreten Pläne werden jetzt zur Prüfung vorgelegt, noch keine Umsetzung.

## 2026-10-15 - Juna - Zentrale Marktplatzverwaltung vorbereiten

**Auftrag:** Eine gemeinsame Übersicht für aktivierte Marktplätze, Accounts und
Inserate sowie Übertragung, Bearbeitung, Löschen, Relisting und Mehrfachaktionen
durchplanen.

**Befund und Vorschlag:** Navigation, Aktivierung, Vinted-/eBay-Verbindungen,
Inseratdienste, Entwürfe, Auftragsmodelle und Extension gelesen. Kleinanzeigen
besitzt derzeit vor allem Entwürfe und Formularübergabe; Kategorie und
Veröffentlichen bleiben manuell. Ein Tab-Erfolg ist keine Veröffentlichung.
Der eBay-Datenvertrag sieht eine persönliche Verbindung je Workspace und Umgebung
vor. Lokale Vinted-Veröffentlichungsdateien sind im geprüften Extension-Einstieg
noch nicht geladen. Vorhandenen Code daher nicht als bestätigten Live-Ablauf gewertet.

Vorschlag: Übersicht mit direkt bedienbaren Plattformabschnitten und Accountfiltern,
getrennte Zielentwürfe statt erzwungenem Einheitsformular, gemeinsame Aufträge mit
kontrolliertem Ergebnis und späteren Sammelaktionen. Kleinanzeigen-Abgleich vor
vollständiger Verwaltung ergänzen; Vinted-Relisting als dieselbe Aktion aus
Kleiderschrank, Detailseite und Übersicht aufrufbar planen. Grundlagen,
Alternativen, Umsetzungspakete und spätere Prüfungen stehen in
`docs/audit/2026-10-15-marketplace-hub-planning.md`.

**Prüfung und Stand:** Reine Analyse und Planungsdokumentation im eigenen Worktree
und Zweig `juna/marketplace-hub-planning`, ausgehend vom lokal vorhandenen
`origin/master` bei `36723117`. Die laufende Vinted-Galerie-/Altersarbeit nur
lesend berücksichtigt. Keine Produktcode-, Schema- oder Live-Kontoänderung,
keine Anwendungstests. Markdown-Formatierung und Unterschiedskontrolle bestanden. Vorschlag noch nicht als Umsetzung freigegeben.

## 2026-10-15 - Juna - Tests anhand betroffener Funktionen auswählen

**Auftrag:** Die freigegebene Auswahl umsetzen: unabhängige Funktionen nicht bei
jeder Änderung erneut im Browser prüfen und die Projektregeln entsprechend ändern.

**Umsetzung:** Ein gemeinsamer Testplan verfolgt lokale Imports, Reexports und
Angular-Ressourcen rückwärts. Er wählt betroffene Modell-, DOM- und Angular-Dateien
sowie zugehörige Browserdateien aus. Globale App-Provider, Testanmeldung,
Konfiguration, Schemaänderungen und unbekannte Bereiche behalten einen breiten
Lauf; Lazy-Routen machen eine einzelne Ansicht dabei nicht wieder global.
Geänderte Browserdateien laufen vollständig. Leere Auswahlen überspringen den Job,
statt fehlende Tests als Erfolg zu melden. PWA läuft nur bei Bedarf als eigener
paralleler Pflichtjob. Eigenständige Worker und Landingpage wählen ihre eigenen
Prüfungen. Lint, Formatierung, Typprüfung und erforderlicher Bau bleiben bestehen.

Die Freigabe verlangt exakt den ausgewählten Erfolgs-/Skip-Zustand. PR-Nachweise
binden im neuen V3-Format zusätzlich die konkrete Auswahl einschließlich der
Dienstprüfungen; ein identischer Dateibaum allein genügt nicht. Die manuelle
vollständige Regression bleibt verfügbar. Es wurde kein neuer Zeitplan angelegt.
`AGENTS.md` und `docs/testing/affected-test-selection.md` beschreiben diese Regeln
und verlangen einen konkreten Nutzen vor dem Ergänzen neuer Browserfälle.

**Prüfung:** 322 Workflowprüfungen erfolgreich, sechs bestehende Umgebungsfälle
unter Windows übersprungen. 43 relevante Auswahl-, echte Playwright-Auflistungs-,
Freigabe- und Nachweisprüfungen bestehen auch unter Ubuntu mit Node 22.23.3.
Für die Galerie wurden 84 tatsächlich ausgewählte Anwendungstests ausgeführt;
Playwright wählt 21 passende Browserfälle aus, bei der Einkaufsübersicht acht.
Einkauf/Verkauf und PWA bleiben bei der Galerie aus. Der unabhängige Review fand
zunächst fehlende globale Start-/Testvorbereitungsabhängigkeiten und zu breite
Landing-/Push-Worker-Auswahl; diese Fälle sind korrigiert und abgesichert.
Abschließender Review ohne offene Befunde. Actionlint 1.7.12, gezieltes ESLint,
App-/Testtypprüfung, Suite-Audit, Shared-UI-Prüfung, Formatierung und Diffprüfung
bestanden.

**Grenzen und Stand:** Kein Produktcode, Schema oder Service Worker geändert;
deshalb kein neuer Anwendungsgesamtbau oder kompletter Browserlauf lokal.
Actionlint lokal ohne Shellcheck/Pyflakes; der reguläre Linux-Workflow bleibt die
abschließende Prüfung. Eine neue CI-Wartezeit wurde noch nicht gemessen. Der
CI-Umbau selbst verlangt einmal den breiten Prüfumfang. Eigener Zweig
`juna/affected-test-selection`. Der Nutzer hat Push, PR und Merge nach erfolgreichen
Pflichtprüfungen sowie das anschließende Aufräumen freigegeben. Vor dem Push wird
der aktuelle `origin/master` mit der inzwischen veröffentlichten Landingpage
übernommen; deren fremde Umsetzung bleibt erhalten.

**CI-Korrektur in PR #425:** Der unveränderte Sniper-Containertest verglich den
zuletzt eingetroffenen HTTP-Zwischenstand der Texteingabe mit dem Endtext. Im
lokalen Linux-Abbild reproduziert eine verzögerte vorletzte Meldung denselben
Fehler, obwohl im Browser bereits der vollständige Text steht. Der Test sammelt
nun beobachtete Eingabeereignisse und prüft zusätzlich den tatsächlichen Feldinhalt
über die bereits verwendete reine CDP-Inspektion. Regulärer Image-/Browsersmoke
und gezielt vertauschte Meldungen bestehen; eine Negativkontrolle mit tatsächlich
fehlendem Zeichen schlägt weiterhin fehl. Keine Änderung an der Tastatureingabe
oder dem Produktionsverhalten. Der korrigierte Stand erhält neue Pflichtprüfungen.

## 2026-10-15 - Juna - Lange PR-Prüfzeit untersuchen

**Auftrag:** Die rund 23 Minuten Wartezeit vor dem Merge prüfen, gesunde Zeitziele
recherchieren und konkrete Verbesserungen für Flipbase ableiten.

**Befund:** Drei erfolgreiche PR-Läufe dauern 23:10 bis 23:43 Minuten. Hauptengpass
ist ein einzelner Browserjob: zuletzt 160 Fälle in 16:14 Minuten, danach weitere
PWA-Prüfungen und zwei Testbauten. Angular braucht parallel bis zu 9:19 Minuten.
DORA nennt wenige Minuten und ungefähr zehn Minuten als Obergrenze für schnelle
Integrationsprüfungen; Fowler empfiehlt ebenfalls zehn Minuten als Richtlinie.
Vorgeschlagen sind zuerst höchstens zehn, später fünf bis acht Minuten für normale
PRs. Zuerst bestehende Browserfälle auf isolierte Rechner verteilen, PWA parallel
prüfen und Angular-Kosten messen. Keine Prüfungen abgeschaltet oder umgestuft.

**Nachweise und Grenzen:** GitHub-Metadaten und vollständige Browser-/Angularlogs
gelesen, lokale Workflow- und Testkonfigurationen geprüft, offizielle DORA-, Fowler-
und Playwright-Quellen recherchiert. Details und Quellen in
`docs/audit/2026-10-15-ci-feedback-duration.md`. Die Veröffentlichung nach PR #423
ist inzwischen erfolgreich; sie dauerte zusätzlich 3:08 Minuten und verwendete
die bestandenen PR-Prüfungen nach Dateistandnachweis wieder. Reine Analyse im eigenen
Zweig `juna/ci-feedback-analysis`; nur Dokumentation geändert, keine neuen
Anwendungstests oder CI-Läufe ausgelöst. Die Laufzeit einer künftigen Aufteilung
muss erst unter Linux gemessen werden.

**Vertiefung auf Nachfrage:** Playwright-Auswahl ohne Ausführung aufgelistet:
160 Fälle in 32 Dateien, darunter zahlreiche Geräte-/Farbschemavarianten.
Echte lokale Datenabläufe und Ansichten mit ersetzten Serverantworten anhand des
Codes unterschieden. Wenige kritische Browserabläufe sind bereits sinnvoll;
der vollständige Umfang vor jeder Änderung braucht eine eigene Begründung.
Vor zusätzlicher Parallelisierung zuerst Pflichtfälle nach Risiko und zusätzlichem
Nutzen einordnen: Kernabläufe, betroffene Funktionen, regelmäßige Gesamtmatrix.
Testpyramide als offizielle Autorenquelle gelesen. Keine Tests entfernt oder
Prüfregeln geändert.

## 2026-10-15 - Juna - Neue Startseite mit Dashboard-Nachbau live schalten

**Auftrag:** Die gestaltete Vorschau soll die echte Startseite unter `/` werden,
weiterhin mit Umschalter Deutsch/Englisch. Eigener Worktree und Zweig
`juna/landing-go-live`.

**Vorgehen:** Die bestehende Startseite bleibt das technische Grundgerüst:
Design- und Sprachumschalter ohne JavaScript, Analytics-Einwilligung, Beta-Formular,
Ergebnisdialoge, Suchmaschinenangaben und die bereits abgesicherten Formulierungen zu
Datenschutz, Steuern und Paketen. Darauf sitzt die neue Gestaltung: Hero „Die
Warenwirtschaft für dein Reselling.“ mit dem Dashboard-Nachbau, Überblicksleiste,
animierte Gewinnrechnung, klickbarer Ablauf und Beispielbilder an allen acht
Funktionskarten. Alle neuen Texte sind zweisprachig, Beispielbilder tragen deutsche
und englische Namen. Großbuchstaben-Etiketten entfallen. `/preview/` und der
eigene Vorschau-Test sind entfernt; dessen Prüfungen laufen jetzt gegen die Startseite.

**Prüfung:** 45 Landingpage-Tests bestanden, davon sechs neue (Dashboard-Aufbau,
stimmige Beispielzahlen, zweisprachige Bildnamen, Animationen, Ablauf, Zuschnitt);
der Farbschema-Test bekommt getrennte Medienabfragen. Landing-Template-Spec,
Auslieferungstests, Test-Suite-Audit, Prettier, ESLint und Git-Differenz ohne Fehler.
axe in Chromium bei 1440, 1100, 768, 390 und 320 Pixeln, hell und dunkel, Deutsch und
Englisch ohne Verstöße, ohne horizontalen Überlauf und ohne Konsolenfehler.
Sichtprüfung bei 1440 und 375 Pixeln. Auslieferung erst nach Merge.

## 2026-10-15 - Juna - Große Artikelfotos und Inseratsalter anzeigen

**Auftrag:** Die freigegebene Vinted-artige Artikelansicht und Zeit-Badges in
Übersicht und Detailseite umsetzen. Relisting bleibt einer späteren Klärung vorbehalten.

**Umsetzung:** Die Galerie erhält ungefähr zwei Drittel der Desktopbreite. Je nach
Fotoanzahl stehen neben dem großen Hauptfoto bis zu vier weitere Bilder; weitere
Fotos sind über die Großansicht erreichbar. Diese zeigt das vollständige Bild,
unterstützt Touch, Pfeiltasten und Escape und gibt den Fokus an den Auslöser zurück.
Beschreibung und Bearbeiten stehen im schmaleren Informationsbereich. Bestehende
Bearbeitung und das Nachladen von Beschreibungen bleiben erhalten.

Das Inseratsalter erscheint in Tagen und Stunden: unter 72 Stunden grün, ab 72
Stunden orange und ab 120 Stunden rot. Ab 168 Stunden ist zusätzlich das
überschrittene Wochenziel in beiden Ansichten sichtbar. Cloud-Import und lokale
Erweiterung übernehmen ausschließlich ausdrücklich vorhandene ursprüngliche
Veröffentlichungsdaten. Abruf- und Änderungszeitpunkte ersetzen diese nicht;
fehlende, ungültige oder zukünftige Angaben bleiben neutral als unbekannt markiert.
Die Anzeige aktualisiert sich über eine gemeinsame Uhr. Keine Schemaänderung.

**Prüfumfang und Nachweise:** 122 betroffene Modell- und Angular-Tests sowie 169
Import-/Erweiterungstests bestehen. 21 Browserfälle bestehen: 15 Galerie-, Alters-,
Beschreibungs- und Bearbeitungsfälle sowie sechs bestehende Workspace-Fälle.
Die neuen Fälle prüfen 320/390/834/1440 px in beiden Farbschemata mit Touch,
Tastatur, AXE, unbekannten Daten und allen Galerieanordnungen. Die abschließenden
15 Browserfälle liefen nach den Reviewkorrekturen gegen eine ruhende isolierte
Produktionsvorschau. Der Review deckte einen fehlenden sichtbaren Wochenhinweis
in der Übersicht und Fokusverlust an deaktivierten Galerienavigationsbuttons auf;
beides ist korrigiert und durch Browserfälle abgesichert. Pflichtfallregistrierung,
Suite-Audit, Shared-UI-Prüfung, gezieltes ESLint, Typprüfung, Formatierung und
Produktionsbau bestehen.

**Grenzen:** Lokal Windows und Chrome mit abgefangenen Testantworten; kein
Linux-/GitHub-Lauf und kein echter Inseratimport. Die tatsächliche Verfügbarkeit
ursprünglicher Veröffentlichungsdaten hängt von Vinteds Antwort ab. Bekannte
Bauhinweise außerhalb dieser Änderung bleiben bestehen. Screenshots und isolierte
Vorschauen liegen außerhalb der versionierten Dateien. Eigener Zweig
`juna/vinted-listing-research`. Der Nutzer hat Push, PR und Merge nach erfolgreichen
Pflichtprüfungen sowie das anschließende Aufräumen des eigenen Zweigs freigegeben.
Vor dem Push wird der aktuelle `origin/master` übernommen; dessen zusätzliche
Landingpage-Änderung überschneidet sich nicht mit dem Produktcode dieser Umsetzung.

## 2026-10-15 - Juna - Vinted-Artikelseite, Zeit-Badges und Relisting untersuchen

**Auftrag:** Die offenen Vinted-, Vintz- und Bleam-Seiten mit Flipbase vergleichen
und einen Vorschlag für große Artikelfotos, Inseratsalter und Relisting vorbereiten.

**Ergebnis:** Vinteds Vier-Foto-Mosaik direkt gemessen und die Großansicht geprüft;
die aktuelle Flipbase-Ansicht begrenzt Fotos auf 360 px. Vorschlag: größere Galerie,
schmaler Informationsbereich, aufklappbare Beschreibung und Aktionen darunter.
Zeit-Badges wechseln nach 72 Stunden auf Orange, nach 120 Stunden auf Rot;
ab 168 Stunden kommt ein Hinweis auf das überschrittene Wochenziel hinzu.
Der untersuchte Inseratimport liefert den Abrufzeitpunkt und noch kein eigenes
Veröffentlichungsdatum. Dieses muss vor einer verlässlichen Altersanzeige in
allen unterstützten Datenwegen geklärt werden. Unbekanntes Alter bleibt neutral.

Vintz-Relisting-Dialog und Foto-Hilfe, Bleam-Details und Herstelleranleitungen,
offizielle Vinted-Katalogregeln und widersprüchliche Nutzerberichte gelesen.
Veränderte Fotos sind keine belegte Freigabe für erneutes Hochladen. Sicherung,
Vorbereitung, Duplikatvermeidung und Wiederaufnahme bei unklarem Ergebnis müssen
vor einer Umsetzung zusammen geklärt werden. Die deutsche AGB-Seite lieferte
keinen lesbaren Vertragstext. Befunde, Quellen und Grenzen stehen in
`docs/audit/2026-10-15-vinted-listing-layout-relisting.md`.

**Prüfung und Stand:** Ausschließlich Recherche und Dokumentation im eigenen
Zweig `juna/vinted-listing-research`. Keine Produktcode- oder Schemaänderung,
keine Anwendungstests und keine Veränderungen an echten Inseraten. Markdown-
Formatierung und Unterschiedskontrolle bestanden.

## 2026-10-15 - Juna - Startseitenentwurf vom Vintz-Look lösen und echtes Dashboard zeigen

**Auftrag:** Die Vorschau unter `landing/preview/` sah zu sehr nach Vintz aus, und das
Bild oben zeigte keine echte Flipbase-Oberfläche. Freigegeben: Dashboard der App mit
Beispieldaten nachbauen, Vintz-typische Elemente entfernen, Beispielbilder an die
echten Masken angleichen. Eigener Worktree und Zweig `juna/landing-own-look`.

**Befund:** Der bisherige Hero übernahm Aufbau und Texte der Vintz-Startseite fast
wörtlich: zweizeilige Überschrift nach demselben Muster, Arbeitsbereich mit
„Persönlicher Arbeitsbereich“, Suche mit ⌘K, „Dein Geschäft im Überblick“ und
„Verkaufsentwicklung“. Das echte Dashboard zeigt laut Code fünf Kacheln (Umsatz,
Gewinn, Marge, Kapital im Bestand, Verkäufe); die Gestaltungsnotiz nennt noch sechs.

**Änderung:** Neue Überschrift „Die Warenwirtschaft für dein Reselling.“ mit Text
links und Dashboard-Nachbau rechts, der auf breiten Bildschirmen über den Rand läuft.
Der Nachbau verwendet die echte Seitenleiste, Zeitraumwahl, die fünf Kacheln mit
Verlaufslinien, das gelb-rot-grüne Diagramm, „Zu erledigen“ und Schnellaktionen mit
den Farben des Verwaltungsdesigns hell und dunkel. Beispielzahlen sind in sich
stimmig: Kachelwerte entsprechen den Diagrammsummen, die Marge dem Verhältnis.
Säulen und Verlaufslinien wachsen einmal beim Laden, nur bei erlaubter Bewegung.
Großbuchstaben-Etiketten über den Abschnitten entfallen. Beispielmasken nutzen
App-Fläche, Karten, Felder, Badges und Toast; der Vinted Feed erscheint als Raster.

**Prüfung:** 54 Landingpage-Tests bestanden, davon drei neue für Dashboard-Aufbau,
stimmige Beispielzahlen und fehlende Großbuchstaben-Etiketten. Prettier, ESLint und
Test-Suite-Audit ohne Fehler. axe in Chromium bei 1440, 1100, 768, 390 und 320 Pixeln
hell und dunkel ohne Verstöße, ohne horizontalen Überlauf und ohne Konsolenfehler;
Kontrast im als Bild ausgezeichneten Nachbau anhand der App-Farben beurteilt.
Sichtprüfung im Browser bei 1440, 768 und 375 Pixeln. Keine Angular-Änderung, keine
Veröffentlichung; die Startseite unter `/` bleibt unverändert.

## 2026-10-15 - Juna - Einkaufsübersicht und Rentabilität getrennt anzeigen

**Auftrag:** Den freigegebenen Umschalter „Übersicht / Rentabilität“ rechts neben
dem Verkäuferfilter umsetzen, ohne die normale Tabelle um Finanzspalten zu erweitern.

**Umsetzung:** Die Rentabilitätsansicht zeigt genau Einkauf, Verkaufsstand,
Gesamtkosten, Verkaufserlös und Ergebnis. Suche und Verkäufer-/Statusfilter bleiben
beim Wechsel erhalten. Beide Ansichten speichern Spaltenwahl und Sortierung getrennt;
die neuen Einstellungen sind zusätzlich je Nutzer und Workspace getrennt.
„Erhalten“ ist im Standard ausgeblendet und weiterhin auswählbar. Die Migration
erhält persönliche Spaltenansichten und setzt unveränderte alte Standards einmalig um.
Ein Klick oder Enter auf ein Ergebnis öffnet dessen Berechnung.

Die Berechnung zieht sämtliche Einkaufskosten und die zugeordneten direkten
Verkaufskosten vom Erlös ab. Sammelverkäufe werden anhand der Positionen, Mengenlose
anhand tatsächlicher Entnahmen zugeordnet. Gemeinsame Gebühren, Versand und
Erstattungen werden nach Artikelerlös verteilt, bei Nullerlösen nach Menge;
Rundungsreste werden centgenau zugeteilt. Teilverkäufe bleiben als Zwischenstand
erkennbar. Stornos zählen nicht als Erlös; Retouren behalten tatsächlich verbuchte
Erstattungen und direkte Kosten. Ungeprüfte Altverkäufe und unbekannte Beträge
werden nicht als null dargestellt. Die Verkaufsdaten werden erst beim Öffnen der
Ansicht vollständig über gezählte Seiten geladen. Fehler und verspätete Antworten
nach Workspacewechseln liefern keine unvollständigen Summen. Keine Schemaänderung.

**Prüfumfang und Nachweise:** 131 betroffene Anwendungstests aus Einkaufsdarstellung,
Berechnung, Verkaufskennzahlen, Datenladung, Einkaufskomponente und gemeinsamem
Spaltendienst bestehen. 14 Browserfälle bestehen: acht neue Ansichtswechsel bei
320/390/834/1440 px in beiden Themes mit Touch, Tastatur, AXE und gespeicherten
Ansichten sowie sechs bestehende Verwaltungsseitenfälle bei den CI-Breiten.
Die neuen Browserfälle sind als Pflichtfälle registriert; alle drei Prüfungen der
PR-/Regressionsauswahl bestehen. Suite-Audit, Shared-UI-Prüfung, gezieltes ESLint,
Typprüfung, Formatierung und Produktionsbau sind erfolgreich. Die Browserprüfung
deckte und behob Überlauf durch unsichtbare Beschriftungen und eine Überlagerung
des Umschalters durch die Mindestbreite des Verkäuferfilters.

**Grenzen:** Lokal Windows und Chrome mit abgefangenen Testantworten; kein Browser-
Plugin verfügbar, deshalb reguläres Playwright. Keine Prüfung gegen eine echte
Datenbank und noch kein Linux-/GitHub-Lauf. Bekannte Bauhinweise zu Paketgröße,
`pako` und einem ungenutzten Import außerhalb dieser Änderung bleiben bestehen.
Screenshots und Vorschaukonfiguration bleiben außerhalb der versionierten Dateien.
Zweig `juna/purchase-profitability-view`. Die Freigabe für Push, PR und Merge nach
erfolgreichen Pflichtprüfungen liegt vor. Vor dem Push bestätigt der Abgleich:
Der Zweig baut direkt auf dem aktuellen `origin/master` auf; keine Integration
fremder Zweige erforderlich. Der lokale Prüfumfang bleibt unverändert, die
abschließende Gesamtprüfung läuft im PR.

## 2026-10-15 - Juna - Ergebnis je Einkauf fachlich vorbereiten

**Auftrag:** Eine einfache Anzeige vorschlagen, mit der sich der bisherige
Verkaufserfolg eines Einkaufs beurteilen lässt; die sichtbare Spalte „Erhalten“
dabei auf ihren Nutzen prüfen.

**Analyse und Vorschlag:** Einzelartikel sind über ihren Einkauf, Mengenverkäufe
über Loszuordnungen verknüpft. Die Einkaufsübersicht lädt derzeit keine
Verkaufsbeträge. Der Nutzer verwirft eine Erweiterung der normalen Übersicht um
zusätzliche Finanzspalten zugunsten einer getrennten Tabellenansicht. Der
überarbeitete Vorschlag ist ein Umschalter „Übersicht / Rentabilität“ rechts neben
dem Verkäuferfilter. Die Rentabilitätsansicht zeigt ausschließlich Einkauf,
Verkaufsstand, Gesamtkosten, Verkaufserlös und Ergebnis; Suche und Filter bleiben
beim Umschalten erhalten. Spaltenauswahl und Sortierung gelten je Ansicht separat.
„Erhalten“ bleibt in der normalen Übersicht optional und standardmäßig ausgeblendet.
Gemeint sind zugeordnete Erlöse abzüglich direkter Verkaufskosten und sämtlicher
Einkaufskosten. Ein Zwischenstand ist vom abgeschlossenen Ergebnis zu unterscheiden;
unverkaufte Ware erhält keinen geschätzten Erlös. Sammelverkäufe, Erstattungen,
Retouren, Stornos und unbekannte Werte müssen bei der Umsetzung ausdrücklich
berücksichtigt werden. Die Detailansicht soll die Rechnung erklären.

**Prüfung und Stand:** Bestehende Einkaufsübersicht, Spaltenvorgaben,
Darstellungsmodelle, Verkaufskennzahlen und Artikel-/Losverknüpfungen im Code
gelesen. Nur Analyse und Vorschlag, keine Änderung am Anwendungsverhalten oder
Datenbankschema. Entscheidung über den überarbeiteten Vorschlag steht aus. Markdown-Formatierung
und Unterschiedskontrolle geprüft; keine Anwendungstests erforderlich.

## 2026-10-15 - Juna - Dokumentationsänderungen ohne Anwendungslauf prüfen

**Auftrag:** Untersuchen und korrigieren, warum reine Änderungen an der
AGENTS.md Anwendungstests und ein Deployment auslösen.

**Ursache:** Die Dateiauswahl nimmt `AGENTS.md` ausdrücklich von der vorhandenen
Dokumentationsausnahme aus. Deshalb werden Anwendungstests und der Releaseweg
gewählt. Der große Qualitätsjob lief außerdem bisher auch für andere reine
Dokumentationsänderungen.

**Umsetzung:** AGENTS.md gehört jetzt zur bekannten Root-Markdown-Dokumentation.
Eine ausdrücklich als rein dokumentarisch erkannte Änderung erhält einen
kurzen Markdown-Formatcheck ohne Anwendungshooks und anschließend die gemeinsame
Pflichtprüfung. Anwendungstests, große Qualitätsprüfung, Image, Deployment und
Release werden nur für diesen Fall übersprungen. Gemischte Änderungen,
unbekannte Pfade und reine Worker-Qualitätsprüfungen behalten ihren bisherigen
Umfang. Fehlende oder fehlgeschlagene Dokumentationschecks blockieren. Reine
Dokumentationsläufe stellen keine Nachweise über technische Prüfungen aus.

**Prüfung:** Regressionstests prüfen Dateiauswahl bei PR und Push einschließlich
AGENTS.md mit Änderungsprotokoll, gemischten Änderungen, unbekannten Pfaden und
Verschiebungen. Die Freigabeprüfung prüft Fehler, Abbrüche und widersprüchliche
Ausgaben; der bestehende Wiederverwendungsnachweis bleibt abgedeckt.
Alle 39 gezielten Tests bestehen unter Windows (Node 26.5.0) und Linux
(Node 22.23.2).
Die gesamte lokale Workflow-Reihe besteht mit 299 erfolgreichen und sechs
unter Windows vorgesehenen übersprungenen Fällen. Actionlint in der CI-Version
1.7.12 prüft alle Workflows erfolgreich. Der neue Markdown-Befehl besteht unter
Linux auch nach frischer Installation der gesperrten Abhängigkeiten ohne
Anwendungshooks. Ein absichtlich unformatiertes AGENTS.md wird abgelehnt.
Der tatsächliche Dateivergleich von PR #419 wählt jetzt ausschließlich
Dokumentation aus. Formatierung, gezieltes ESLint und Unterschiedskontrolle
sind erfolgreich. Ein GitHub-Lauf mit der neuen Auswahl steht noch aus.

## 2026-10-15 - Juna - Betroffene Prüfungen vor dem PR verbindlich festhalten

**Auftrag:** Unnötige PR-Prüfschleifen durch eine bessere lokale Vorbereitung
vermeiden und das Vorgehen in der AGENTS.md festhalten.

**Umsetzung:** Vor dem ersten Push den Prüfumfang aus Änderungen und tatsächlicher
CI-Auswahl ableiten, bestehende betroffene Abläufe und Testregistrierungen
einbeziehen und relevante Linux-Unterschiede gezielt lokal prüfen. Für UI-Tests
eine ruhende Vorschau verwenden; isolierte Projektkopien einschließlich
versteckter Baukonfigurationen vollständig vorbereiten. CI-Fehler erst gezielt
nachstellen und beheben; unveränderte Wiederholungen auf begründete
Infrastrukturprobleme begrenzen. Die vollständige verbindliche CI bleibt
erhalten, ohne bei jedem Push die gesamte lokale Suite doppelt auszuführen.

**Prüfung:** Markdown-Formatierung und Unterschiedskontrolle. Ausschließlich
Projektregeln und Änderungsprotokoll angepasst.

## 2026-10-15 - Juna - Mobile und Tablet-Layouts durchgehen

**Auftrag:** Ungenutzte Breite, zu frühe Kachelumbrüche und uneinheitliche
Bedienelemente auf Handy und Tablet beheben. Ausgangspunkte sind drei
Vinted-Konten und die Kennzahlen und Filter im Dashboard.

**Umsetzung:** Vinted-Konten erhalten ein fließendes Raster mit lesbarer
Mindestbreite und voller verfügbarer Kartenbreite; die Hinzufügen-Aktion bleibt
oben rechts. Kartenaktionen dürfen bei knappem Platz untereinander stehen.
Die Dashboard-Kennzahlen füllen auch die letzte Zeile und passen bei genügend
Platz zu fünft nebeneinander. Zeitraumwahl und Plattformfilter verwenden auf
Touch-Geräten dieselbe Mindesthöhe von 44 px. Gemeinsame Seitenköpfe schützen
den Platz für Titel und Beschreibung, Tabellenfilter teilen ihre Zeile mit
dem Spaltenmenü. Zweispaltige Formulare und Einstellungen richten ihren Umbruch
nach der tatsächlichen Inhaltsbreite aus. Der Vinted-Feed verliert doppelte
Außenabstände und ordnet kleine Filter paarweise an. Die Auswertungen verwenden
für Zeiträume und Bereichswechsel die gemeinsamen Buttons statt teilweise
unlesbarer, gequetschter Eigenbauten. Keine Daten oder Kennzahlen ausgeblendet.

**Prüfung:** Die neuen Browserprüfungen belegen zunächst die gemeldeten
Darstellungsfehler. Abschließend bestehen 39 Browserfälle: 18 Verwaltungsseiten
bei sechs Breiten, Konten von 320 bis 1440 px, lokale Kartenaktionen mit Touch,
Dashboard in beiden Themes, Auswertungsfilter und bestehende Vinted-Abläufe.
Ein zusätzlicher Datenfall prüft 1.234.567,89 Euro Bestandswert und den
Diagrammumbruch nach Größenwechseln. Die geprüften Dashboard-, Konto- und
Auswertungsansichten bestehen AXE; das Touch-Dashboard erzeugt keine
Konsolen- oder Laufzeitfehler. 118 Tests in neun betroffenen Komponentenbereichen,
Formatierung, gezieltes ESLint, Typprüfung, Shared-UI-Prüfung, Suite-Audit und
Produktionsbau sind erfolgreich. Der Bau meldet weiterhin Hinweise auf die
Paketgröße (938,21 kB bei 900 kB Warnschwelle), `pako` und einen ungenutzten
Import außerhalb der Änderung. Screenshots und Testausgaben bleiben außerhalb
des Repositorys. Browsernachweise stammen aus lokalem Chrome mit simulierten
Breiten, Touch und Testdaten; ein physisches iPad und Safari wurden nicht
geprüft. Umsetzung auf `juna/responsive-admin-layout`, keine Änderungen an
produktiven Daten.

**Freigabe:** Der Nutzer hat PR-Erstellung, Branch-Push, Merge-Commit nach
erfolgreichen Pflichtprüfungen und anschließend das Aufräumen des eigenen
Zweigs freigegeben. Der Zweig basiert auf dem aktuellen `origin/master`
(`887d9d8e`). Die Veröffentlichung erfolgt über die reguläre CI; danach wird
die öffentlich ausgelieferte Version lesend geprüft.

**CI-Nachprüfung:** Im ersten PR-Lauf besteht die Format-, Lint-, Typ- und
Funktionsprüfung. Die Workflow-Suite erkennt jedoch die 27 neuen Browserfälle,
die noch nicht in ihrer verbindlichen Soll-Liste registriert sind. Die
Registrierung wird ergänzt; der gezielte Auswahltest prüft weiterhin den
vollständigen Umfang ohne Wiederholungen und ohne `test.only`. Alle Node-,
DOM- und Angularprüfungen des ersten Laufs bestehen. Nach erfolgreicher lokaler
Workflow-Suite (294 bestanden, sechs unter Windows bewusst übersprungen)
startet der korrigierte Push die vollständige CI einschließlich der Browserfälle
erneut; der alte, bereits fehlgeschlagene Lauf wird dabei regulär abgelöst.

**Weitere CI-Befunde:** Im zweiten Lauf bestehen sämtliche Anwendungstests.
Die Qualitätsprüfung scheitert vor den Workflowtests an einer externen
Container-Abrufbegrenzung (`toomanyrequests`) bei der Supabase-Testlaufzeit.
Die Browsersuite besteht 139 Fälle und findet anschließend in der mobilen
Vinted-Kontoansicht eine umgebrochene Einstellungsaktion. Lokal ist derselbe
38-px-Versatz nachstellbar. Der gemeinsame Seitenkopf gibt seinem mobilen
Aktionsbereich wieder die volle verfügbare Breite. Die bestehende Prüfung
bleibt unverändert. Für 143 Browserfälle zuzüglich Produktions-PWA-Prüfung
wird das CI-Zeitfenster von 20 auf 30 Minuten erhöht; bereits die erste
Browserphase benötigt im zweiten Lauf 15 Minuten zuzüglich Einrichtung.
Die erneute lokale Prüfung bei ruhender Vorschau besteht alle 33 responsive
und Vinted-Ansichtsfälle einschließlich 320/390 px in beiden Themes. Die zwei
Seitenkopf-Komponententests, zwölf Auswahl-/Freigabeprüfungen, Formatierung,
gezieltes Lint und der Produktionsbau bestehen ebenfalls. Im ersten lokalen
Nachlauf war ein Desktopfall durch das Neuladen während des parallelen Baus
unterbrochen worden; bei ruhender Vorschau besteht derselbe unveränderte Test.

**PWA-Teststeuerung:** Die aktuelle CI besteht alle 143 Browserfälle und alle
weiteren Pflichtprüfungen, hängt aber zweimal im bestehenden Android-PWA-Fall
beim Aufruf von `registration.update()`, noch vor dem Einfrieren der zweiten
Ansicht. Unter Windows besteht der unveränderte Fall. Eine isolierte Linux-
Umgebung mit derselben Playwright-Version und zwei CPU-Kernen stellt den
gleichen Hänger nach. Der separate Testbrowser wird deshalb direkt gestartet
und nur einmal über CDP gesteuert; vorher waren gleichzeitig zwei
Playwright-Verbindungen angehängt. Der Standardkontext behält seine echten
Sichtbarkeits- und Lebenszykluszustände. Browser und temporäres Profil werden
anschließend geschlossen und entfernt. Die unveränderte Prüfung besteht mit
dieser Teststeuerung zehnmal unter Linux und dreimal unter Windows. Mit dem
Worker vor der früheren Hintergrundansicht-Korrektur scheitert sie weiterhin
gezielt am ausbleibenden Versionswechsel. Produktiver Worker, Update-Schutz
und Testbedingungen werden nicht geändert. Formatierung und gezieltes ESLint
bestehen.

## 2026-10-15 - Juna - Update der installierten Android-App untersuchen

**Auftrag:** Das iPad ist laut Nutzer erfolgreich aktualisiert und für Push
aktiviert. Die installierte Android-App bleibt dagegen trotz Aktualisierung
auf dem alten Stand. Der Meldungstext wird nicht erneut angefragt.

**Diagnose:** Ein eingefrorener Hintergrundtab bleibt für den Worker eine
offene Ansicht, beantwortet aber dessen Update-Abfrage nicht. Bisher blockiert
das dauerhaft die sichtbare App. Der Browserfall mit einer echten gebauten
Version 0.348.0 scheitert am alten Worker und besteht mit dem korrigierten
Worker dreimal hintereinander; Versionswechsel, verschwindender Updatehinweis
und erhaltene ungespeicherte Eingaben der Hintergrundansicht sind geprüft.
Die Ursache auf dem physischen Handy ist damit noch nicht unmittelbar belegt.

**Korrektur:** Ausschließlich andere, nicht antwortende Ansichten dürfen auf
ihrem bereits zugeordneten alten Bau bleiben. Vor der Freigabe werden alle
alten App-Dateien gegen ihre gespeicherten Inhaltsprüfungen geprüft und die
Zuordnung erneut bestätigt. Die angeklickte Ansicht muss selbst beide
Update-Schritte bestätigen. Antwortende unsichere Ansichten, ein Widerruf,
fehlende oder beschädigte alte Dateien und geänderte Fensterlisten blockieren
weiterhin. Die Änderung liegt im wartenden Worker, damit auch ältere
App-Versionen unmittelbar davon profitieren.

**Browserprüfung:** Der dauerhafte Androidfall startet einen eigenen isolierten
Chromium-Prozess ohne erzwungen sichtbare Tabs. Sichtbar/verborgen wird vor dem
Einfrieren geprüft; der Updateknopf erhält echte Touch-Ereignisse. Ein normaler
Playwright-Kontext hält Tabs künstlich sichtbar und bildet diesen Fehler daher
nicht ab. Der neue Test verwendet die vorhandene automatische Trace-Aufzeichnung;
ein anfangs zusätzlich gestarteter Trace wurde nach dem erkannten Testfehler entfernt.

**Prüfungen:** 40 PWA-Skriptprüfungen einschließlich neun neuer Schutzfälle,
Format, Lint, Typprüfung und Suite-Audit sind bestanden. Beide
Produktionsteststände sind gebaut; die vollständige PWA-Browsersuite besteht
mit 34 erfolgreichen Fällen und einem bewusst auf Desktop übersprungenen
Androidfall. Die unabhängige Codeprüfung meldet keine Befunde und bestätigt
die 16 Update-Skriptprüfungen zusätzlich. Der Nutzer hat PR und Merge nach
grünen Pflichtprüfungen bereits freigegeben. Vor dem Push wird die inzwischen
veröffentlichte unabhängige Vinted-Korrektur aus `origin/master` integriert.
Fremde Zweige und unversionierte Auditdateien bleiben erhalten.

**CI-Nachprüfung:** Im ersten PR-Lauf bestehen alle Anwendungstests, die
Qualitätsprüfung, 116 allgemeine Browserfälle und 40 PWA-Skriptprüfungen.
Der neue Linux-Browserfall wartet jedoch schon vor dem Updateklick unbegrenzt
auf `registration.update()`, wenn die andere Seite vorher eingefroren wurde.
Die Aufzeichnung bestätigt sichtbare Hauptseite und verborgenen Hintergrund.
Der Test stellt deshalb zuerst den wartenden neuen Worker bereit und friert
die Hintergrundseite unmittelbar vor dem eigentlichen Updateklick ein.
Damit bleibt genau die fehlerhafte Aktivierungsbarriere geprüft. Auch dieser
Ablauf scheitert mit dem bisherigen Worker und besteht mit der Korrektur
dreimal; der erneute CI-Lauf muss vor dem Merge vollständig erfolgreich sein.

## 2026-10-15 - Juna - Vinted-Postfachkorrektur über PR veröffentlichen

**Freigabe:** Der Nutzer autorisiert Branch-Push, PR-Erstellung, Merge nach
erfolgreichen Pflichtprüfungen und anschließend das Aufräumen des eigenen
Zweigs und Arbeitsverzeichnisses. Die geprüfte Korrektur `40b6324a` basiert
auf dem aktuellen `origin/master` mit `a48177c1`.

**Abschlussweg:** Der PR enthält die nachgewiesene Korrektur der fortlaufend
wachsenden Vinted-Seitenangabe und die im folgenden Eintrag dokumentierten
Prüfungen. Nach grünen Pflichtprüfungen folgen Merge-Commit, reguläre
Veröffentlichung und lesende Kontrolle des Worker-Stands sowie des nächsten
Abrufs beim Konto „Flipbase“. Produktive Zeitpläne werden nicht manuell
zurückgesetzt; ausschließlich der eigene Zweig wird aufgeräumt.

## 2026-10-15 - Juna - Vinted-Abruf bei vollen Gesprächsseiten korrigieren

**Auftrag:** Beim Vinted-Konto „Flipbase“ steht „Abruf wartet“ mit einer
Anbieterausfallmeldung. Manuelle Abrufe werden grün abgeschlossen, melden aber
Gespräche, Nachrichten und Verkäufe als unvollständig.

**Nachweis:** Ausschließlich lesende Serverabfragen bestätigen erfolgreiche
Profil-, Inserat- und Bewertungsabrufe. Der Fehler beginnt beim Übergang von
79 auf 80 Gespräche. Ein über die bestehende Oberfläche gestarteter normaler
Kontoabruf wurde passiv beobachtet: Vinted liefert vier volle Gesprächsseiten
mit je 20 Einträgen und danach leere Seiten, jeweils HTTP 200. `total_pages`
steigt trotzdem von Seite zu Seite auf die nächste Seitennummer. Der bisherige
Abruf läuft dadurch bis zur Grenze von 20 Seiten und meldet `invalid_response`.
Die bestehende Zeitplanlogik ordnet diesen Teilfehler als `server` ein.
Es wurden nur Seitenzahlen, Antwortstatus und Anzahlen ausgegeben, keine
Nachrichteninhalte, Cookies oder Zugangsdaten.

**Korrektur:** Nur für Gespräche beendet eine bereits validierte leere
Anbieterliste die Seitenfolge erfolgreich. Ungültige Antworten bleiben Fehler;
volle Listen ohne belegtes Ende bleiben an der bestehenden Abrufgrenze ein
Teilstand. Inserat- und Bewertungsabrufe behalten ihre bisherigen Regeln.
Keine Schemaänderung, kein Zurücksetzen produktiver Zeitpläne und keine
Anbieter-Schreibaktion. Arbeit isoliert auf `juna/vinted-inbox-pagination`;
parallele Änderungen im Hauptverzeichnis bleiben unberührt.

**Prüfung:** Die drei Regressionen für 0, 20 und 80 Gespräche scheitern vor dem
Fix mit dem nachgewiesenen Teilfehler und bestehen danach. Zusätzlich werden
ungültige leere Antworten, unabhängige Inseratseiten und die Grenze von 400
Gesprächen geprüft. Worker-Suite: 649 bestanden, sieben bestehende Fälle
übersprungen, kein Fehler. Der neue echte Browserfall bestätigt 80 Gespräche
und genau fünf Postfachanfragen. Formatierung, Lint, Typprüfung und Worker-Bau bestehen. Noch kein Push, PR oder Deployment.

## 2026-10-14 - Juna - Push-Aktivierungsfix als PR veröffentlichen

**Freigabe:** Der Nutzer autorisiert PR-Erstellung und Merge nach vollständig
grünen Pflichtprüfungen. Der eigene Zweig `juna/mobile-update-push-activation`
enthält den lokal geprüften Fix `316034ff` auf Basis von `7dc53c55`.

**Abschluss:** Die nachfolgenden Regressionen, 147 gezielte Tests, 31
Worker-Prüfungen, vier Desktop-/Android-Updatefälle, Produktionsbau, Format,
Lint, Typprüfung und Suite-Audit sind bestanden. Der PR durchläuft die
verbindlichen Prüfungen; danach werden Merge, öffentliche Auslieferung und
Push-Gesundheit geprüft und ausschließlich der eigene Zweig aufgeräumt.
Die auf dem echten Handy gemeldete Schleife ist weiterhin nicht nachgestellt.

## 2026-10-14 - Juna - Mobile Update- und Push-Probleme erneut eingrenzen

**Auftrag:** Android bleibt laut Nutzer auf 0.348.0 und bietet nach dem
Aktualisieren wieder dasselbe Update an. Das iPad zeigt 0.348.1, startet nun
korrekt über das Home-Symbol und kann die Geräteaktivierung nicht bestätigen.
Der Nutzer möchte keine wiederholte Nachfrage zum gleichen Meldungstext.

**Serverdiagnose:** Ausschließlich lesende Prüfungen bestätigen die öffentliche
Auslieferung `7dc53c55`. Eine Apple-Gerätebindung ist aktiv und ihre Sitzung
gültig, aber es fehlt die gespeicherte Kategorienauswahl. Zwei interne
Push-RPC-Antworten sind 403. Der ältere der beiden zugehörigen Arbeitsbereiche
ist archiviert und erlaubt keine Push-Kategorie. Die einzelnen fehlgeschlagenen
Anfrageinhalte wurden nicht ausgelesen; die konkrete Arbeitsbereichsauswahl
auf dem iPad ist damit nicht unmittelbar belegt.

**Korrektur:** Ein neuer Start wählt einen nicht archivierten Arbeitsbereich,
auch wenn bisher die Archivansicht gespeichert war. Aktive gespeicherte
Auswahlen und die vollständige Liste zum Lesen bleiben erhalten. Push bietet
ohne Kategorienberechtigung keine Aktivierung an und prüft diese Berechtigung
erneut vor der Registrierung. Eine unvollständige erste Geräteaktivierung
bekommt wieder eine sichtbare Anfangsauswahl; vorhandene Einstellungen und
bewusst ausgeschaltete Kategorien bleiben erhalten. Im normalen iPad-Tab wird
der Home-App-Hinweis vor dem möglicherweise fehlschlagenden Abonnementabruf
geprüft. Serverfehler unterscheiden Anmeldung, Drosselung, Geräteaktivierung
und Kategorienbestätigung, ohne interne Antworten anzuzeigen.

**Updateprüfung:** Der Quellstand der tatsächlich älteren Version `82e09f67`
wurde in einer isolierten, ignorierten Testkopie als 0.348.0 gebaut. Der Wechsel
zum neueren Produktionscode besteht dreimal mit Android-Emulation und echten
Touch-Ereignissen, inklusive Schutz eines ungespeicherten zweiten Fensters
und erneutem Start. Die dauerhaften Updatefälle bekommen zusätzlich ein
Android-Projekt. Neue Testansichten müssen fertig starten und vor dem Tippen
in den Vordergrund wechseln. Der ältere Dienst bietet anderen offenen Tabs
nach fremder Aktivierung kein erneutes Update an; ihr eigener Neustart lädt
den neuen Stand. Die gemeldete Schleife auf dem echten Handy ist nicht
nachgestellt; der Schutz offener Eingaben wird deshalb nicht abgeschwächt.

**Prüfungen:** Neue Regressionen schlagen jeweils vor der passenden Korrektur
fehl. Danach bestehen 147 gezielte Dienst- und Settings-Tests sowie Lint und
Typprüfung und Suite-Audit. Die Speicherfälle laufen in der DOM-Suite. Die
Produktionsbauten sind erfolgreich mit den bestehenden Budget-/CommonJS-Warnungen.
31 Worker-Prüfungen und vier endgültige Browserfälle (Desktop/Android) bestehen.
Der endgültige Stand wird vor dem lokalen Commit nochmals gezielt geprüft.
Keine Schemaänderung und keine Produktionsdatenmutation.
Fremde Zweige und die bestehenden unversionierten Auditdateien bleiben erhalten.

## 2026-10-14 - Juna - Folge-PR für Updates und Favoriten-Push abschließen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und das Aufräumen des eigenen Zweigs
`juna/pwa-refresh-notification-details`. Der geprüfte Stand `0ab5e7a8` basiert
auf dem aktuellen Hauptzweig `82e09f67`.

**Abschluss:** Die im folgenden Eintrag belegten lokalen Prüfungen sind bestanden.
Der Folge-PR durchläuft die vollständigen Pflichtprüfungen. Anschließend werden
die reguläre Veröffentlichung, der öffentlich ausgelieferte App-/Worker-Stand
und die Gesundheit des Push-Diensts geprüft. Die endgültige Umsetzung benötigt
keine Schemaänderung und keine Testinstanz auf dem Produktionsserver.
Die native Anzeige auf iPad und Android bleibt nach dem Update am Gerät zu prüfen.

## 2026-10-14 - Juna - Update-Anzeige und Favoriten-Push nachbessern

**Auftrag:** Das iPad zeigt weiterhin 0.347.0 ohne Update-Angebot. Der Nutzer
möchte in Systemmeldungen denselben Kontonamen und Artikeltitel wie unter der
Glocke statt „Neue Favoriten auf Vinted“.

**Updates:** Sichtbare Online-Tabs prüfen jetzt regelmäßig im Minutenabstand.
Ältere Dokumente fragen zusätzlich den aktiven Worker nach seiner Baukennung;
die Update-Meldung bleibt erhalten, wenn ein anderer Tab bereits aktiviert hat.
Der Klick lädt erst nach der eigenen Eingabeprüfung neu. Die bestehende Prüfung
aller offenen Ansichten vor Worker-Aktivierung bleibt erhalten. Die periodische
Prüfung wird beim Zerstören des Diensts abgeräumt; fremde Workerantworten gelten
nicht als bestätigter aktiver Stand.

**Favoriten:** Der Push-Dienst liest die belegte Glockenmeldung über bestehende
interne Schnittstellen im autorisierten Workspace und Konto. Einzelmeldungen
heißen „Artikel wurde favorisiert · Kontoname“, darunter steht der Artikeltitel.
Bei mehreren Inseraten erscheinen Anzahl und Artikeltitel. Danach prüft der
Dienst die Versandberechtigung erneut, auch bei fehlenden Details. Ungültige
Quellen, fremde Konten, gelöschte Meldungen und Abruffehler liefern keine Details.
Texte sind begrenzt, enthalten keine Steuerzeichen und teilen keine Emoji-Paare.
Der Worker zeigt nur die erlaubten Favoritenüberschriften mit strukturiertem Ziel;
Nachrichten und Bestellungen bleiben ohne Kontakt-/Bestelldetails.

**Umgebung:** Die automatische Freigabe lehnte eine isolierte Testinstanz auf
dem Produktionsserver samt Schema-/Rollenkopie ab; der Befehl wurde nicht
ausgeführt. Die anfängliche eigene Schemaänderung wurde vollständig verworfen.
Die endgültige Umsetzung verwendet vorhandene Schnittstellen und benötigt
keine Migration. Lokale Docker-Startversuche stellten keine Engine bereit;
Anwendungs-, HTTP-Fixture- und Browserprüfungen laufen unabhängig davon.

**Prüfung:** 46 gezielte Angularfälle, 31 PWA-Skriptprüfungen und 27 Push-Dienstfälle
bestanden, einschließlich Kontobindung, Rechteentzug nach Abruf und Unicodegrenzen.
Zwei echte Produktionsbauten mit je 261 geprüften App-Dateien sowie zwei
Chromium-Updateabläufe bestanden. Die Browserregression klickt in einer alten
zweiten Ansicht nach Aktivierung jetzt deren Update-Angebot. Typprüfung und
Push-Dienst-Bau, Formatierung, Lint und abschließender Produktionsbau erfolgreich.
Echte iPad-Home-App und native Systemanzeige bleiben
Geräteabnahmen; Chrome-Tab und Home-App haben getrennte Speicherbereiche.

## 2026-10-14 - Juna - Gemeinsamen Einstellungs- und PWA-Zweig abschließen

**Freigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und das anschließende Aufräumen ausdrücklich bestätigt.
Der eigene Zweig `juna/pwa-update-push-fixes` enthält die beiden zuvor
dokumentierten Umsetzungen und basiert auf dem aktuellen Hauptzweig `382bf13c`.

**Abschluss:** Die gezielten lokalen Prüfungen und Browserabnahmen sind bestanden.
Der gemeinsame PR durchläuft nun die verbindlichen vollständigen Prüfungen.
Nach erfolgreichem Merge wird die reguläre Veröffentlichung einschließlich
öffentlich ausgelieferter Version und Push-Dienst geprüft. Fremde Zweige und
bereits vorhandene unversionierte Auditdateien bleiben unberührt.
Die tatsächliche Systemzustellung bei geschlossener App auf iPad und Android
bleibt eine anschließende Geräteabnahme; Browserprüfungen ersetzen sie nicht.

**CI-Nachprüfung:** Der erste PR-Lauf besteht Qualität und sämtliche
Anwendungstestpakete. Der Versand-Browserfall sucht noch die alte Beschriftung
„Carrier-Einstellungen speichern“ und stoppt deshalb vor dem Speichern.
Beide Klicks prüfen jetzt exakt „Versandeinstellungen speichern“; die bestehenden
Prüfungen für Unternehmensanschrift, individuelle Absender, gespeicherte Daten
und Wiederladen bleiben vollständig erhalten. Die vollständige Browserprüfung
wird im neuen PR-Lauf erneut ausgeführt. Der lokale echte Datenbank-Browserfall
steht mangels laufendem Docker-Dienst nicht zur Verfügung.

## 2026-10-14 - Juna - Einstellungen vereinheitlichen und eBay-Verbindung bündeln

**Auftrag:** Die übrigen Einstellungstabs im selben Zweig wie die PWA-/Push-Fixes
durchgehen, technische und doppelte Bereiche aufräumen und die eBay-Anmeldung
verständlich gestalten. Daten und Protokolle ausdrücklich ausgenommen.

**Umsetzung:** Der technische Tab „App & Geräte“ samt ungenutzter Komponente
entfällt. Installation bleibt über das Menü erreichbar; alte `/settings/app`-Links
führen zu „Marktplätze“. Dort verlinkt eBay direkt auf die vorhandene
Kontoverbindung unter eBay. Ohne verbundenes Konto erscheint eine zentrierte Karte
mit Anmeldung und Statusprüfung; bestätigtes Konto, erneute Verbindung und Trennen
sind übersichtlich gegliedert. Die bestehende persönliche Einzelverbindung und
der serverseitige Anmeldeablauf bleiben erhalten. eBay erlaubt grundsätzlich mehrere
Konten; eine Mehrkontenfunktion war ausdrücklich nicht gewünscht.

**Gestaltung:** Konto, Unternehmen, Workspace, Nummernkreise, Team, Marktplätze,
Benachrichtigungen, Shop-Zahlungen und Versand wurden durchgesehen. Gemeinsame Karten
und Touchbuttons ersetzen lokale Buttonnachbauten; große Auswahlzeilen ersetzen
kleine unbeschriftete Schalter. Normale Überschriften, kürzere Beschriftungen und
ruhige Icons verbessern die Lesbarkeit. Webhooks heißen nicht mehr irreführend
System-Push; bestehende Konfigurationen und Aktionen bleiben unverändert.
Die Nummernformatvorschau erhält eine korrekte Überschriftenebene. Lange Texte
passen auch bei vergrößerter Schrift in die Karten. Sidebar und Schnellnavigation
bleiben bei 200 Prozent Schriftgröße innerhalb der Bildschirmbreite.

**Installation:** Der echte WebKit-Klick reproduziert fehlenden Rückkehrfokus,
weil Safari den nativen Menübutton nicht automatisch fokussiert. Der auslösende
Button erhält nun vor dem Öffnen der Installationshilfe ausdrücklich den Fokus;
die bestehende Dialoglogik stellt ihn beim Schließen wieder her.

**Prüfung:** 26 gemeinsame Browserabläufe in Chromium und WebKit erfolgreich.
Neun Einstellungsbereiche in 390/1024/1280 px und beiden Themes geprüft, einschließlich
AXE mit Kontrast und ungefangener Seitenfehler. Hinzu kommen Installation,
Safe Areas, 200 Prozent Schriftgröße, echte Worker-Updates und Offline-Dateien.
Der simulierte eBay-Ablauf prüft Einstellungslink, Anmeldeaufruf und die bestätigte
Kontokarte; native eBay-Anmeldung wird damit nicht behauptet. 128 gezielte
Angularfälle, 32 Einstellungs-/Modellprüfungen sowie separat 21 Navigationsprüfungen
bestanden. Die beiden neuen Browserfälle sind in der verbindlichen PR-Auswahl
registriert; alle drei Auswahlverträge bestehen. Produktionsbauten mit 261 geprüften
App-Dateien, Anwendungstypen, Lint, Format, Shared-UI-Prüfung und Suite-Audit erfolgreich.
Kontrastprüfungen warten auf das Ende der gesamten Einblendanimation; die
Produktions-CSP bleibt unverändert. Keine Datenbank- oder Daten-/Protokolländerung.
Aktuellen Hauptzweig abgerufen; Basis weiterhin `382bf13c`. Frühere Push-/Update-Fixes
bleiben Teil desselben geplanten PR. Echte Systemzustellung auf gesperrten Geräten
bleibt nach Veröffentlichung zu prüfen.

## 2026-10-14 - Juna - Versionswechsel und System-Push prüfen, Einstellungen vereinfachen

**Auftrag:** Wiederkehrenden Update-Hinweis auf dem iPad untersuchen, ausbleibende
Systemmeldungen auf Android prüfen und die Push-Einstellungen mit weniger Text
und größeren Bedienelementen gestalten. Eigener Zweig ab `origin/master`;
vorhandene fremde Analysedateien unverändert.

**Befund:** PR401 führte PWA/Push ein; PR408 ergänzte Geräteaktivierung und
Favoriten, PR410 die native Darstellung. Die laufende Produktion entspricht
Commit `382bf13c`. Ausschließlich lesende Serverprüfung: 21 angenommene Sendungen,
keine wartenden Aufträge oder Versandfehler. Die letzten echten Nachrichten und
Favoriten erreichten zwei registrierte Geräte; eine dritte Registrierung entstand
erst um 17:49 Uhr nach diesen Ereignissen und erhielt anschließend Testmeldungen.
Die Zuordnung dieser Registrierung zum Handy ist nicht unabhängig bestätigt.
Die Glocke allein belegt keine Systemzustellung; Anbieterannahme ebenfalls nicht.

**Änderung:** Zwei zuerst fehlgeschlagene Workerprüfungen reproduzieren den
Rückfall auf alte App-Dateien, wenn beim Neustart eine neue Dokumentkennung fehlt
oder wiederverwendet wird. Navigation lädt nun den aktivierten Bau und bindet nur
das neu geladene Dokument daran; andere offene Ansichten behalten ihre alten
Chunks. Die vorhandene Zustimmung aller Fenster und der Schutz offener Eingaben
bleiben bestehen. Der reale Mehrfenstertest prüft außerdem den späteren Neustart
eines zunächst unveränderten zweiten Fensters ohne wiederkehrenden Update-Hinweis.

**System-Push:** Der bestehende Sender verwendet normale Priorität, die auf
ruhenden Geräten verzögert werden darf. Ein zuerst fehlgeschlagener Test prüft
den tatsächlich erzeugten Web-Push-Header. Sichtbare Meldungen fordern jetzt
`Urgency: high` an; Verschlüsselung, Ablauf, Rechte und Kategorien bleiben erhalten.
Kein neuer Produktionsversand, keine Änderung von Freigaben oder Schlüsseln.
Die genaue Ursache der gemeldeten fehlenden Android-Banner ist damit noch nicht
am Gerät bestätigt. Die echte gesperrte Geräteabnahme ist dokumentiert.

**Oberfläche:** Push steht weiterhin vor Webhooks. Kurze Aktionen, gemeinsame
44-px-Touchbuttons, vollständig bedienbare 64-px-Kategoriezeilen und aufklappbare
Infohilfe ersetzen die technische Textwand. Ein bewusst leerer Kategorienstand
bleibt erkennbar. Die gemeinsamen bisherigen Größen bleiben unverändert.

**Prüfung:** 131 gezielte Angularfälle, 30 PWA-Skriptprüfungen und alle 21
Versanddiensttests bestanden; Diensttypen und Dienstbau ebenfalls erfolgreich.
Echte Produktionsbauten mit 263 geprüften App-Dateien erfolgreich. Vier
Chromium-PWA-Abläufe prüfen Offline-Dateien, Beschädigung, Mehrfenster-Update und
Altworker-Übergang. Oberfläche in Chromium und WebKit geprüft: Aktivierung,
Kategorienauswahl, Infohilfe, 360/390/1024/1280 px, vergrößerte Schrift und AXE
einschließlich Kontrast in beiden Themes; keine ungefangenen Seitenfehler.
Der Kontrasttest wartet auf das Ende der Farbtransition beim Theme-Wechsel.
Format, gezieltes Lint, Anwendungstypen, Shared-UI-Prüfung und Suite-Audit erfolgreich.
Bestehende Buildhinweise zu Bundlegröße, RouterLink und pako bleiben vorhanden.
Keine echte iPad-Worker- oder native Systembanner-Abnahme behauptet.

## 2026-10-14 - Juna - Freigegebenen Startseitenentwurf über PR abschließen

**Auftrag:** Den geprüften Entwurf pushen, nach erfolgreichen Pflichtprüfungen
per Merge-Commit integrieren und den zugehörigen Zweig samt Worktree aufräumen.

**Änderung:** Die Auslieferungsprüfung und der vorhandene CSP-Vertrag erwarten
jetzt das gemeinsam verwendete `beta-application.js`. Eine fehlende Formular-Datei
wird weiterhin als fehlgeschlagene Veröffentlichung erkannt. Der freigegebene
Gestaltungsstand liegt unter `/preview/` mit `noindex, nofollow`; die bestehende
Startseite unter `/` wird gestalterisch nicht ersetzt.

**Lokale Prüfung:** 51 Landingpage-, 10 Auslieferungs- und 9 CSP-/Vorlagenprüfungen
bestanden. Geänderte Dateien formatiert und gelintet; Git-Differenz ohne Fehler.

## 2026-10-14 - Juna - Startseitenentwurf vervollständigen und Darkmode ergänzen

**Auftrag:** Die restliche Startseite im bestätigten Flipbase-Stil mit eigenen
Funktionen, passenden Animationen und erneutem Darkmode ausbauen.

**Änderung:** Die Vorschau enthält zusätzlich animierte Vinted-Funde,
Inseratsvorbereitung und Betriebsausgaben, einen bedienbaren Bildzuschnitt,
Workspaces, geplante Pakete, acht FAQ-Antworten und die Beta-Bewerbung. Inhalte
und vorläufige Preise stammen aus der bestehenden Landingpage. Illustrationen
sind als Beispiele gekennzeichnet; spätere Paketleistungen bleiben als geplant
markiert. Header über die volle Breite, Inter und Logo-Gelb bleiben erhalten.

**Bedienung:** Darkmode für alle Seiten- und Produktflächen, Systemvorgabe und
gespeicherte Auswahl über den vorhandenen Präferenzschlüssel. Mobiles Menü mit
Tastaturbedienung. Neue Animationen laufen nur im sichtbaren Bereich und stoppen
bei Pause, verborgenem Tab oder reduzierter Systembewegung. Ohne JavaScript
bleiben Inhalte lesbar. Die Formularlogik wurde unverändert in ein gemeinsames
Skript verschoben; die Vorschau aktiviert ihren Senden-Button erst damit.

**Prüfung:** 51 Landingpage-Tests bestanden, einschließlich Farbauswahl, Navigation,
Zuschnitt, Animationssteuerung sowie Formularvalidierung, Doppelversand-Sperre und
Fehlerfällen. Formatierung, JavaScript-Lint und Git-Differenz geprüft. Im Browser
1440, 768, 390 und 320 Pixel ohne horizontalen Überlauf; beide Farbmodi, FAQ,
Bildzuschnitt, Menü und Dialog-Tastaturfokus bedient. Axe meldet keine Verstöße;
einzelne Kontrastprüfungen im mobilen beziehungsweise modalen Zustand bleiben
automatisch unbestimmt. Erfolgsdialog ausschließlich mit simulierter Antwort
geprüft, keine echte Bewerbung versendet. Belege außerhalb des Repos. Die Seite
bleibt eine lokale Vorschau mit `noindex, nofollow`; keine Veröffentlichung.

## 2026-10-14 - Juna - Landingpage-Entwurf an den eigenen Flipbase-Stil angleichen

**Auftrag:** Die eigene Gestaltung stärker beibehalten, insbesondere den Header
direkt oben über die gesamte Breite und die vorhandene Flipbase-Typografie.

**Befund:** Anwendung, bestehende Landingpage und Entwurf laden bereits Inter.
Der Entwurf wich vor allem durch Schriftgewicht 500, engen Zeilenabstand,
zentrierte Überschriften und den schwebenden Header sichtbar von Flipbase ab.

**Änderung:** Header mit voller Breite bei `top: 0`, ausgerichtetem Innenbereich
und unterer Trennlinie. Überschriften mit dem bestehenden Schriftgewicht 800,
Flipbase-Zeilenabständen, linksbündigem Hero und gelber Texthervorhebung.
Neutrale Flipbase-Flächen und Karten mit 12-px-Radius ersetzen die bisherigen
pastellfarbenen Flächen und mehrfachen Rahmen. Die vorhandenen Animationen und
der bedienbare Ablauf bleiben erhalten.

**Prüfung:** 44 Landingpage-Tests bestanden; Formatierung und Git-Differenz
geprüft. Header und Schrift im Browser vermessen, Desktop sowie 390 und 320 Pixel
ohne horizontale Überläufe geprüft. Ablauf per Maus und Pfeiltaste bedient;
keine Browserfehler und keine gemeldeten axe-Verstöße. Keine Veröffentlichung.

## 2026-10-14 - Juna - Ersten Vintz-nahen Landingpage-Entwurf für Flipbase bauen

**Auftrag:** Hero, animierte Funktionskarte und Ablaufbeispiel mit hoher Nähe zur
untersuchten Vintz-Startseite, Flipbase-Gelb und eigenen Funktionen umsetzen.

**Änderung:** Eigene statische Vorschau unter `landing/preview/` im Zweig
`juna/vintz-landing-draft`: schwebende Navigation, zentrierter Hero mit illustrativer
Geschäftsübersicht, animierte Gewinnrechnung und ein bedienbarer Ablauf von Einkauf
über Bestand bis Verkauf. Eigene SVG-Artikelillustration, lokale Schrift und
vorhandenes Logo. Alle Zahlen sind als Beispiele gekennzeichnet. Die Beta-Links
führen zum bestehenden Bewerbungsformular; die Vorschau trägt `noindex, nofollow`.

**Bewegung:** Animationen laufen nur im sichtbaren Bereich und bei sichtbarem Tab.
Eine gemeinsame Pause und reduzierte Systembewegung zeigen die vollständige
Rechnung. Manuelle Schrittauswahl sowie Tastaturfokus stoppen den automatischen
Ablauf bis zum erneuten Start. Ohne JavaScript bleiben die drei Schritte lesbar.

**Prüfung:** 44 Landingpage-Tests einschließlich fünf neuer Vorschauprüfungen.
Desktop- und Mobilprüfung bei 320, 390, 768 und 1440 Pixeln ohne horizontale
Überläufe; Schritte per Maus und Pfeiltasten, Animation, Pause und reduzierte
Bewegung geprüft. Automatische axe-Prüfung ohne gemeldete Verstöße; Kontrastfälle
auf den illustrierten Flächen ergänzend anhand der verwendeten Farben beurteilt.
Formatierung, JavaScript-Syntax, ESLint und Git-Differenz geprüft. Keine
Angular-Änderung, kein Deployment. Browserbelege liegen außerhalb des Repos.

## 2026-10-14 - Juna - Neue Vinted-Cloudkonten ohne erneuten Einrichtungsstart abschließen

**Auftrag:** Fehlermeldung nach erfolgreicher IP-Nachbuchung, Browseransicht statt
SMS-Eingabe und irreführenden lokalen Cloudwechsel bei einem neuen Konto prüfen
und korrigieren. Backendänderungen für diese Fehler ausdrücklich freigegeben.
Eigener Worktree und Zweig `juna/vinted-cloud-onboarding`.

**Befund:** Ausschließlich lesend in Produktion bestätigt: Die heutige Buchung und
die Einrichtung sind abgeschlossen; das Konto trägt `is_new_connection=true`.
Die ursprüngliche IP-Fehlerstelle ist nicht protokolliert. Im Code hängen
Bestandsprüfung, Kauf und erneute IP-Prüfung an einer Anfrage mit 90 Sekunden
Frontendlimit; jede Ablehnung erscheint pauschal als Prüffehler. Reproduziert:
Eine langsame Vorbereitung liefert keine rechtzeitige Antwort. Eine erkannte
Mensch-Prüfung öffnet die Vorschau und verhindert weitere automatische Prüfungen;
eine nachfolgende SMS-Stufe wird erst nach manuellem Prüfen erkannt. Alle
Einrichtungen verwenden bisher den Text und Abschluss eines lokalen Cloudwechsels.

**Änderung:** Der Worker beantwortet lange Vorbereitungen nach einer Sekunde als
ausstehend und führt dieselbe Anfrage weiter. Folgeabfragen prüfen die Berechtigung
erneut und übernehmen das Ergebnis ohne erneute Vorbereitung; fertige, nicht
abgeholte Ergebnisse verfallen im Speicher. Die App wartet mit derselben
Buchungskennung bis zu etwa fünf Minuten. Nach einer Mensch-Prüfung wird der
Anmeldestatus ohne erneute Zugangsdaten oder Browsereingaben geprüft; bei SMS
wechselt die Oberfläche zurück zum Codefeld. Ausdrücklich manuelle Anmeldungen
bleiben manuell. Neue Cloudkonten schließen die geprüfte Einrichtung automatisch
ab; bestehende lokale Konten behalten ihre ausdrückliche Wechselbestätigung.
Ein fehlgeschlagener Abschluss bleibt reserviert und wiederholbar, mit passendem
Text für neue Konten. Keine Schemaänderung oder Migration.

**Prüfung:** Die neuen Regressionstests scheitern vor der Korrektur. Anschließend
129 Angularprüfungen und 27 Workerprüfungen erfolgreich; Formatierung, ESLint,
App-/Test-/Workertypen und Angular-Produktionsbau mit Node 24 bestanden. Vier
Chromiumabläufe gegen den gebauten Stand mit simulierten API-Antworten bestanden:
IP-Wartephase und automatische Aktivierung bei 1440/390 Pixeln, Mensch-Prüfung
mit anschließender SMS sowie bestehender lokaler Cloudwechsel. Der erste
Browseraufbau war durch die Produktions-CSP für lokale API-Fixtures blockiert;
die abschließende lokale Fixture verwendet den gebauten Stand ohne diese
Produktionsheader. Keine echte Buchung oder Anmeldung ausgelöst, keine
Produktionsdaten geändert, kein Deployment. Ein echter Vinted-Durchlauf nach
Veröffentlichung und der historische Auslöser des ersten IP-Fehlers bleiben offen.

**Freigabe und Integration:** PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen
und anschließende Bereinigung sind freigegeben. Aktuellen `origin/master`
eingebunden; der einzige Konflikt im Änderungsprotokoll erhält beide Beiträge.

**CI-Korrektur:** Die feste Liste der Browser-Pflichtfälle enthielt noch die
vorherigen Titel zur ausdrücklichen Aktivierung neuer Konten und kannte den
neuen Mensch-Prüfung-/SMS-Ablauf nicht. Die Auswahlverträge werden mit den
tatsächlich geprüften Fällen abgeglichen; kein Browserfall wird entfernt.
Die drei bisherigen Mensch-Prüfungsfälle erlauben nun ausschließlich die neue
Statusabfrage; erneute Anmeldungen, Codeübermittlung, Eingaben und Bildabrufe
bleiben während der ungelösten Prüfung ausgeschlossen.
Alle sieben betroffenen Browserfälle und die drei Auswahlverträge bestehen lokal.

## 2026-10-14 - Juna - Systembenachrichtigungen übersichtlicher darstellen

**Auftrag:** Die abgestimmte Darstellung mit transparentem PC-Logo, kurzen
Kategorietiteln und passender Öffnen-Aktion umsetzen. Auf dem Handy soll das
zusätzliche große Logo entfallen, das Statussymbol bleibt erhalten.

**Umsetzung:** Der Service Worker verwendet das vorhandene transparente Logo nur
auf Desktopgeräten. Mobile Browser werden über ihre Geräteangabe oder die
Android-/iOS-Kennung erkannt. Einfarbiges Statussymbol und weiße Installationsicons
bleiben unverändert. Feste Meldungstexte schützen Kundendaten auf dem Sperrbildschirm;
verfügbare Aktionsbuttons führen durch den bisherigen geprüften Klickpfad.

**Prüfung:** Alle 28 PWA-Prüfungen bestanden, davon acht Push-Prüfungen für mobile
Logoauslassung, Desktoplogo, alle fünf Meldungsarten, fehlende Aktionsunterstützung
und unveränderte sichere Klickziele. Format, gezieltes Lint, JavaScript-Syntax und
Produktionsbau bestanden. Die unabhängige Codeprüfung fand keine Fehler.
Die tatsächliche native Darstellung bleibt browser- und betriebssystemabhängig;
Desktopmodus mit verschleierter mobiler Kennung lässt sich nicht sicher erkennen.
Die Veröffentlichung über einen grünen PR ist ausdrücklich freigegeben.
Die weißen Installationsicons bleiben nach Rücksprache bestehen.

**CI-Diagnose:** Der isolierte Push-Smoke verdeckte einen Startfehler durch den
fehlgeschlagenen Logabruf eines nicht erzeugten Containers. Der ursprüngliche
Fehler bleibt jetzt erhalten; ein zuerst fehlschlagender Regressionstest sichert
Diagnose und Bereinigung ab. Der tatsächliche Startfehler wird im nächsten Lauf
erneut geprüft, Produktionsdienste und Benachrichtigungsrechte bleiben unverändert.

## 2026-10-14 - Juna - Vinted-Verkäufebezeichnungen, Statusmeldungs-Badges und Profilbutton im Chat ergänzen

**Auftrag:** Die Beschriftung „Letzte gespeicherte Verkäufe“ und „Gespeicherte Verkäufe“ in der Vinted-Übersicht auf „Letzte Verkäufe“ bzw. „Verkäufe“ vereinfachen, den doppelten Button „Bewertungen ansehen“ aus der Profilkarte entfernen, Statusmeldungen in Gesprächen als zentrierte Badge-Pills darstellen und im Gesprächskopf einen direkten „Profil“-Button zum Partner einbinden.

**Befund:** In der Übersichtskarte wirkten die Bezeichnungen „Gespeicherte Verkäufe“ und „Letzte gespeicherte Verkäufe“ unnatürlich lang und auf der Profilkarte führten beide Aktionen („Profil ansehen“ und „Bewertungen ansehen“) auf dasselbe Ziel. Im Gesprächsverlauf wurden Status- und Systemmeldungen bisher als gewöhnliche Textzeilen mit Info-Icon gerendert. Im Kopfbereich des aktiven Gesprächs fehlte eine direkte Verlinkung zum Profil des Gesprächspartners.

**Änderung:**

- Übersicht: KPI-Karte auf „Verkäufe“ und Detailkarte auf „Letzte Verkäufe“ angepasst; redundanten Button „Bewertungen ansehen“ entfernt und nur „Profil ansehen“ beibehalten.
- Gesprächsverlauf (`VintedMessagesComponent`): System- und Statusmeldungen werden nun als zentrierte Badge-Pills dargestellt (mit passendem Icon wie 🤝 für Verkäufe/Abschlüsse, 📦 für Sendungen/Versand, 📬 für Zustellung, ❌ für Stornierungen etc. sowie dem Zeitstempel im Format `• HH:mm Uhr`).
- Gesprächskopf: Bei vorhandener `partnerId` einen Profil-Button mit Benutzer-Icon (`LucideUser`) und Beschriftung „Profil“ ganz rechts eingebunden, der das Vinted-Profil des Partners in einem neuen Tab öffnet (`https://www.vinted.de/member/:id`).
- Tests: Neue Unit-Tests in `vinted-messages.component.angular.spec.ts` für die Badge-Pill-Darstellung und den Profil-Button hinzugefügt; Test in `vinted-overview.component.angular.spec.ts` für den Profil-Link aktualisiert.

**Prüfung:** 7 Tests in `vinted-overview.component.angular.spec.ts` und 58 Tests in `vinted-messages.component.angular.spec.ts` erfolgreich bestanden. Prettier-Formatierung, ESLint und TypeScript-Typprüfung (`npm run typecheck`) ohne Fehler abgeschlossen.

## 2026-10-14 - Juna - Weiße App-Icons und Gerätebenachrichtigungen umsetzen

**Auftrag:** Den ausdrücklich freigegebenen Plan für weiße App-Icons, direkte mobile
Installation, Geräteaktivierung auf Android/iPad/Windows und Vinted-Favoriten-Push
einschließlich kompatiblem Backend, geschütztem Pilotbetrieb und grünem PR umsetzen.

**Arbeitsstand:** Eigener Zweig `juna/pwa-install-push` ab aktuellem `origin/master`.
Aufgaben und Prüfungen stehen in `docs/implementation/pwa-install-push-plan.md`.
Implementierung und unabhängige Prüfung erfolgen mit Agents; bestehende Einkäufe
und der interne Zwischenspeicher bleiben unverändert. Reale Systemzustellung wird
erst nach Geräteabnahme bestätigt; andere Nutzer bleiben bis dahin ausgeschlossen.

**Umsetzung:** Weiße Installations-, Maskable- und Apple-Icons mit unverändertem
Symbol auf 64 Prozent sichtbarer Ausdehnung sowie transparentes monochromes
Push-Badge. Mobile Installation startet den verfügbaren Systemdialog oder einen
kurzen Dialog auf derselben Seite. Geräteaktivierung steht zuerst in den
Benachrichtigungseinstellungen, mit Glockenlink und vier berechtigten Kategorien.
Windows benötigt keine App-Installation; iPad verwendet die Home-Bildschirm-App.
Favoritenversand hängt an einer neu bestätigten Glocken-Sammelmeldung, bleibt bei
Baseline und Altmeldungen still und prüft Rechte erneut beim Versand und Klick.
API-Version 2 ergänzt Favoriten, ältere Clients bewahren deren Einstellung atomar.

**Prüfung:** 206 Datenbankprüfungen nach erneutem Einspielen der erzeugten Migration,
13 Edge- und 20 Workerprüfungen bestanden; frisch erzeugte Typen unverändert.
189 fokussierte Frontendprüfungen, acht Workflow-/Service-Worker-Verträge und sechs
Browserfälle bestanden. Die Gegenprüfung reproduzierte verborgene Kategorien nach
Rechteverlust; 88 gezielte Prüfungen sichern Korrektur und erneute Bestätigung ab.
Icons werden pixelgenau, mobile Aktivierung bei 360/390 Pixeln mit vergrößerter
Schrift geprüft. Format, Lint, Typen und Produktionsbau bestanden. Aktuellen
Hauptzweig eingebunden; beide Shared-Button-Erweiterungen bestehen 18 Prüfungen.
Browserfähigkeiten sind in diesen Abläufen simuliert; echte Systemzustellung
bleibt Teil der Geräteabnahme.

**Betrieb:** Release übernimmt die geschützte Push-Konfiguration für Worker und
Edge Functions, ohne die Freigabe pauschal zurückzusetzen. Fehlende Flags bleiben
aus; dauerhafte und sofortige Notabschaltung bleiben verfügbar. Zehn Prüfungen
mit echten Compose-/Nginx-Aufrufen und separat alle vier POSIX-Deploymentfixtures
bestanden, dazu Format, Lint und Shellsyntax. Versandschlüssel sind einmalig
geschützt vorbereitet; das verifizierte Pilotkonto wird erst nach grünem Release
freigeschaltet, andere Konten bleiben bis zur Geräteabnahme ausgeschlossen.

## 2026-10-14 - Juna - Vinted-Übersichtsseite modernisieren und Synchronisationsstatus anpassen

**Auftrag:** Das Mockup für die modernisierte Vinted-Übersichtsseite 1:1 übernehmen und die Synchronisationsanzeige mit grünem Statuspunkt und Zeitstempel („Zuletzt aktualisiert: DD.MM.YYYY • HH:mm Uhr“) umsetzen.

**Befund:** Das Profil befand sich bisher am Fuß der Übersichtsseite. Die Kennzahlenkarten nutzten einfache Standardkopfzeilen ohne Symbole und Pfeilaktionen. Die rechte Spalte für die Verkäufe besaß keinen illustrierten Leerzustand und die Datumsangaben der Gespräche waren unauffällig als einfacher Text formatiert. In den Kontrollaktionen wurde die erfolgreiche Synchronisierung bisher über ein neutrales Aktualisiert-Badge ohne Statuspunkt dargestellt.

**Änderung:**

- Profilkarte an den Anfang der Übersicht verlegt: Avatar, Name, Handle, Vinted-Bewertung im Format `5,0 ★★★★★ (X Bewertungen)` und Schnellaktionen „Profil ansehen“ sowie „Bewertungen ansehen“ (mit Fragmentunterstützung in `ButtonComponent`).
- KPI-Karten modernisiert: Eigene Kopfzeilen mit Kleiderbügel-Icon und `+0%`-Badge für Inserate, Sprechblasen-Icon für Gespräche und Einkaufstaschen-Icon für gespeicherte Verkäufe samt Pfeillinks (`→`).
- Liste der letzten Gespräche: Zeitstempel als abgerundete Pills (`dd.MM., HH:mm`), klare Gliederung und Erhalt des Neu-Badges.
- Letzte gespeicherte Verkäufe: Moderner illustrierter Leerzustand mit Einkaufstasche und Paket-Icon bei fehlenden Verkäufen.
- Synchronisationsanzeige in den Vinted-Kontokontrollen: Bei erfolgreichem Stand auf einen grünen Statuspunkt (`bg-emerald-500`) und den Text `Zuletzt aktualisiert: DD.MM.YYYY • HH:mm Uhr` umgestellt.

**Prüfung:** 7 gezielte Angular-Tests in `vinted-overview.component.angular.spec.ts`, 8 Tests in `vinted-account-controls.component.angular.spec.ts`, 18 Tests in `button.component.angular.spec.ts` und 50 Tests in `vinted-workspace.component.angular.spec.ts` erfolgreich. ESLint, Prettier-Formatierung und TypeScript-Typprüfung (`npm run typecheck`) ohne Fehler bestanden.

## 2026-10-14 - Juna - Doppelte Statusmeldungen in Vinted-Gesprächen korrigieren

**Auftrag:** Auffällige und doppelte Statuseinträge aus dem Gesprächsscreenshot
prüfen und beheben. Backendänderungen sind für Flipbase ausdrücklich freigegeben.
Eigener Worktree und Zweig `juna/vinted-system-messages` auf dem aktuellen
`origin/master`; parallele Arbeit im gemeinsamen Checkout bleibt unberührt.

**Befund:** Ausschließlich lesend in Produktion bestätigt: Die Abschlussmeldung
liegt mit identischem JSON-Inhalt und Ereigniszeitpunkt unter zwei Hash-Kennungen
vor. Eine alte Zustellmeldung blieb neben dem aktuellen Lieferstatus gespeichert.
Das zusätzliche „Kauf“ stammt aus einem technischen Beleg für die Verhandlungslogik.
Lokal reproduziert: Veränderte versteckte Templates und JSON-Schlüsselreihenfolgen
erzeugten neue Kennungen für dieselbe sichtbare Meldung.

**Änderung:** Cloud- und Erweiterungsimport bilden Systemkennungen aus normalisierten
Ereigniszeiten und fachlichen Nachrichtenfeldern. Texte, Beträge, Absenderseite,
Bilder und bekannte Ereignistypen unterscheiden weiterhin verschiedene Meldungen.
Einfache gleichzeitige Zustell-/Liefermeldungen erscheinen einmal als „Geliefert“.
Ein kontogebundener Datenbanktrigger entfernt nur passend erneut belegte alte
Hash-Kopien desselben Systemereignisses. Andere Zeiten, Gespräche, Konten,
Marktplätze, echte Nachrichten, Angebote und Kaufbelege bleiben erhalten;
fehlende Einträge in Teilabrufen werden nicht gelöscht. Der technische Kaufbeleg
bleibt für die Angebotssperre verfügbar, erscheint aber nicht als Chattext.
Die lokale Erweiterung trägt Version 1.8.1.

**Prüfung:** 50 Importtests, 127 Erweiterungs-/Verhandlungstests, 56 Gesprächstests
und 324 Datenbankprüfungen in sechs betroffenen Dateien bestanden. Dazu 30
Workflowprüfungen bestanden, ein bestehender plattformabhängiger Fall übersprungen;
Format, ESLint, App-/Worker-Typen, Shared-UI-Prüfung und Angular-Produktionsbau
erfolgreich. Die bestehende Paketgrößen- und CommonJS-Warnung bleibt bestehen.
Migration durch Schemaabgleich erzeugt und vollständig auf isoliertem Stand
neu eingespielt. Der Rechteabgleich erkannte vom Diff ausgelassene geerbte
Funktionsrechte; der erzeugte ergänzende Rechteblock übernimmt die expliziten
Revokes/Grants aus dem deklarativen Schema. Kein Browserzugriff auf die
Bereinigungsfunktion. Neu erzeugte Datenbanktypen inhaltlich unverändert.
Native Windows-CLI und Standard-Node waren inkompatibel; temporäre Linux-CLI
und gebündelte Node-Laufzeit verwendet, ohne Projektabhängigkeiten zu ändern.

**Veröffentlichung:** Noch kein Push, Merge oder Deployment. Vorhandene Dubletten
werden nach Veröffentlichung beim nächsten Import desselben Ereignisses bereinigt.

## 2026-10-13 - Juna - Mobile PWA-Rückmeldung korrigieren

**Auftrag:** Wiederkehrenden wirkungslosen Updatehinweis auf Android, fehlende mobile Installation, unerwünschtes Desktopangebot und separaten Einkaufsmenüpunkt sowie springendes Tablet-Menü korrigieren. Eigener Zweig juna/pwa-mobile-fixes ab aktuellem origin/master; drei Agents mit getrennten Zuständigkeiten für Installation/Layout, Einkaufsintegration und unabhängige Updateprüfung.

**Befund:** Installationsnavigation hängt bisher ausschließlich am Browserprompt. Der innere Sticky-Header ist auf seinen kurzen Komponentencontainer begrenzt. Updatehinweise werden vor Bestätigung der wartenden Baukennung und auch für die bereits geladene HTML-Version angezeigt; fehlende Antworten und bestimmte Blockaden bleiben ohne verständliche Meldung.

**Nutzerkorrektur:** Keine sichtbaren lokalen Entwürfe, eigene Mechanik oder manuelle Übernahme. Die normale Einkaufsmaske und ihre Aktionen bleiben; fehlgeschlagene Speicheraufträge werden intern gepuffert und später nach erneuter Onlineprüfung fortgesetzt. Die zuvor begonnene sichtbare Einkaufsintegration wurde entsprechend verworfen.

**Änderung:** Mobiles Installationsangebot mit Browseranleitung und Geräteerkennung; Desktopangebot ausblenden. Header im gesamten Seitencontainer verankern. Separaten Offlinebereich und Exportdialog entfernen. Normale Erfassung geräteintern sichern und nur ausdrücklich beauftragte Speicherungen mit unverändertem Auftrag wiederholen; neuere Eingaben erhalten. Updateangebot an bestätigten Worker und abweichenden Bau binden, ersten Wechsel bei bereits passender HTML-Version mit derselben Eingabeprüfung übernehmen, veraltete Hinweise entfernen und Blockaden beziehungsweise Zeitüberschreitungen erklären.

**Prüfung:** Zwei echte Produktionsbauten und alle 31 PWA-Browserfälle in Chromium/WebKit grün, einschließlich verlorener Speicherantworten, unverändertem Wiederholen, originalen Belegbytes, neuerer Eingaben und zweier Fenster. Weitere 22 mobile Browserfälle prüfen Installation, Tablet-Scrollen, Safe Areas, Schriftvergrößerung, Barrierefreiheit und Navigation. Ein echter Angular-Konstruktortest reproduziert die wiederholte Verarbeitung derselben Bestätigung; nach idempotenter Übernahme bestehen dieser Test und 87 bestehende Form-/Positionsprüfungen. Zusätzlich 137 Layout-/Update-/Routingtests und gezielte Speicher-/Beleg-/Authprüfungen grün; Formatierung, Lint, Typen und Suite-Audit bestanden. Unabhängige Agents prüfen Rechte, unveränderliche Aufträge, Belege, Konkurrenz und Versionswechsel. Die Geräteabnahme auf echter Android-/iPad-Hardware und die echte Push-Zustellung bleiben offen; Versand bleibt ausgeschaltet. Veröffentlichung erst nach erfolgreichen PR-Prüfungen und öffentlichem Versionsabgleich berichten.

**CI-Auswahl:** Die erste PR-Prüfung meldet sieben noch nicht registrierte mobile Pflichtfälle und zählt drei unterschiedliche Gerätefälle wegen ihres gleichen kurzen Titels als Duplikate. Die vollständigen Titelpfade unterscheiden die Geräte; sämtliche Fälle bleiben Pflicht. Drei gezielte Auswahltests bestehen und weisen auch den getrennten Produktions-PWA-Lauf nach.

**Integration:** Den während der PR-Prüfung veröffentlichten `origin/master` aus PR403 eingebunden. Beide Konflikte erhalten die vollständigen Einträge und sämtliche Pflichtfälle beider Beiträge. Der kombinierte Auswahltest besteht; Typen, Produktionsbauten und PWA-Browserfälle werden auf diesem integrierten Stand erneut geprüft.

## 2026-10-13 – Juna – Freigegebenen Bestands- und Verkaufsumbau veröffentlichen

**Auftrag:** Nach ausdrücklichem Ja den geprüften Zweig pushen, PR erstellen, erfolgreiche Pflichtprüfungen abwarten und mit Merge-Commit integrieren; anschließend Zweig und Worktree aufräumen.

**Integration:** Aktuellen `origin/master` eingebunden. Die beiden Konflikte im Änderungsprotokoll und in der Schemaliste erhalten jeweils beide Beiträge; Push-Schemas und Bestandsjournal bleiben registriert. Die automatisch verbundenen Datenbanktypen enthalten beide Erweiterungen. Der integrierte Stand besteht 4.110 Datenbankprüfungen in 112 Dateien, 98 Modell-/Serviceprüfungen, 63 Komponenten-/Serviceprüfungen und sechs Browserabläufe einschließlich AXE, Variantenverkauf und Rechnungsbestandsschutz. Generatorvergleich der Datenbanktypen identisch, Formatierung, Lint, Typen und Produktionsbau einschließlich PWA erfolgreich. Drei neue Bestandsabläufe sind verpflichtende PR-Browserfälle; bestehende Verkaufs- und Rechnungsprüfungen entsprechen der freigegebenen Oberfläche. Die lokale API-Adresse wurde wiederhergestellt. Vollständige Pflichtprüfungen und Release laufen über den PR beziehungsweise den bestehenden Veröffentlichungsweg.

**CI-Korrektur:** Der erste PR-Lauf zeigte zwei Fehler im alten, über den Prototyp künstlich aufgebauten Rechnungstest: Das neu hinzugekommene Fehlermeldungs-Signal fehlte im Testobjekt. Testaufbau ergänzt und konkrete fehlende Unternehmensfelder sowie deren Zurücksetzen nach erfolgreicher Rechnung geprüft. Alle 319 DOM-Prüfungen in 44 Dateien lokal grün; Format/Lint und Testtypen erfolgreich. Anwendungscode unverändert; vollständige PR-Prüfungen werden auf dem korrigierten Stand erneut ausgeführt.

## 2026-10-13 – Juna – Bestandsabgänge, Variantenaktionen und einfachere Verkäufe umsetzen

**Auftrag:** Den abgestimmten Ablauf „Aus Bestand entfernen“, die Aktionen pro
Variante, eine kompakte Verkaufsübersicht und verständliche Rechnungsfehler umsetzen.

**Änderung:** Auf der Artikelseite und an jeder Variante kann eine ganze Stückzahl
mit Grund Beschädigung, Verlust oder Erfassungskorrektur ausgebucht werden. Einkauf,
ursprüngliche Menge und Kosten bleiben erhalten. Nach dem letzten Stück wird
Archivieren angeboten. Varianten können einzeln archiviert, wiederhergestellt oder
bei fehlenden Geschäftsbeziehungen gelöscht werden; Geschwister bleiben erhalten.
Unbekannte Bestände, Inserate, Reservierungen und offene Shopaufträge werden konkret
gemeldet statt stillschweigend verändert.

**Datenbank:** Neues unveränderliches Bestandsjournal mit Workspace-Rechten,
geschützten Bewegungen und einer wiederholbaren Buchungskennung. Gleichzeitige
Bestandsaktionen nutzen die vorhandene Sperrreihenfolge. Einzelstücke können nach
dem Abgang nicht erneut verkauft oder heimlich aktiviert werden. Mengenkosten
werden stückgenau gekürzt; auch nach älteren Teilverkäufen bleibt der belegte
Restkostenbetrag erhalten. Verkäufe ziehen bereits ausgebuchte Kosten vom
verbleibenden Kostenpool ab. Es entsteht weder ein Verkauf noch eine zweite Ausgabe.
Schema, registrierte Datei, erzeugte Migration und lokal neu erzeugte Typen gehören
zum selben Änderungsstand.

**Oberfläche:** Verkäufe zeigen standardmäßig Datum, Artikel, Menge, Verkaufsbetrag,
Gewinn und Marge. Verkaufsnummer und Plattform stehen kompakt beim Artikel;
Kostenfelder bleiben über die Spaltenauswahl erreichbar. Oben bleiben Anzahl und
Gewinn. Haltedauer ist im Standard ausgeblendet, Prüfbeleg und Chronik stehen unter
„Weitere Aktionen“. Persönlich angepasste Ansichten bleiben erhalten. Rechnungen
nennen ihre Aktion als Erstellen oder Anzeigen und zeigen konkret fehlende
Unternehmensfelder mit einem direkten Einstellungslink.

**Migrationserzeugung:** Den CLI-Abgleich auf isolierten Vorher-/Nachher-Datenbanken
ausgeführt, weil der vollständige Schemaabgleich ältere, fremde Abweichungen enthielt.
Geerbte Standardrechte, die der Abgleich ausließ, automatisch aus der deklarativen
Quelle ergänzt und die endgültige Buchungsfunktion aus derselben Quelle übernommen.
Die vollständig transaktionale neue Migration wurde auf der frisch aus bestehenden
Migrationen aufgebauten Testdatenbank erfolgreich angewendet. Keine bestehende
Migrationsdatei geändert. Ein temporär abweichender CLI-Aufruf und ein Fehler des
Erzeugungsskripts wurden vor dem abschließenden Datenbanklauf korrigiert.

**Prüfung:** Alle 3.952 Datenbankprüfungen in 108 Dateien bestanden, davon 33 neue
Abgangsprüfungen. 87 gezielte Modell-/Serviceprüfungen, 17 Chronikprüfungen und
63 Komponenten-/Serviceprüfungen bestanden. Vier echte Browserabläufe bestanden:
Bestandsabgang mit AXE-Prüfung des Dialogs, Variantenaktionen ohne Geschwisterverlust,
Verkaufsübersicht/Rechnungsfehler und der vorhandene Verkauf aus der Artikelliste.
Formatierung, gezieltes ESLint, Typprüfung, Produktionsbau, Schema-/Migrationsverträge,
Prüfung gemeinsamer UI-Bausteine und Testsuite-Audit erfolgreich. Der separate
Release-Shell-Integrationstest blieb wegen seiner nicht gestarteten speziellen
Testdatenbank übersprungen. Bestehende Vite-/pako-Hinweise bleiben unverändert.
Browserprüfungen nutzten nur isolierte lokale Daten; nicht gestartete Edge Functions
meldeten dort erwartete Benachrichtigungsfehler. Die vorübergehende lokale
API-Adresse wurde zurückgesetzt. Keine Produktionsdaten verändert, kein Push und
kein Deployment. Der größere Umbau der Einkaufsübersicht ist nicht Teil dieses Auftrags.

## 2026-10-13 – Juna – Einfachere Bestandsabgänge, Varianten und Verkaufsübersicht prüfen

**Auftrag:** Gesperrtes Löschen bei vorhandenen Beständen und Varianten erklären,
einen einfachen Ablauf für beschädigte Lagerware vorschlagen und überladene
Verkaufs- und Einkaufsabläufe bewerten.

**Befund:** Endgültiges Löschen ist wegen vorhandener Geschäftsbeziehungen gesperrt,
nicht nur wegen einer positiven Stückzahl. Archivieren lässt Menge und Wert stehen.
Die Variantenliste enthält keine Entfernen-Aktion. Ein allgemeiner Lagerabgang fehlt
in der Artikelseite, obwohl das Datenmodell Beschädigung und Verlust kennt.
Die Haltedauer nutzt nur die Einzelstückbeziehung im Verkaufskopf und fällt bei
fehlender Einkaufsherkunft auf null zurück. Die Rechnungsfehlermeldung nutzt die
vorhandene Liste fehlender Unternehmensfelder bislang nicht für eine konkrete Anzeige.

**Ergebnis:** Vorschlag unter
`docs/design/inventory-and-sales-simplification.md` dokumentiert: kurzer Dialog
„Aus Bestand entfernen“, gleiche Aktionen je Variante, kompakte Verkaufsliste
mit Betrag/Gewinn/Marge und Prüf-/Chronikzugriff in Details. Ursprüngliche Buchungen
bleiben bei Korrekturen nachvollziehbar; die sichtbare Oberfläche muss dafür nicht
alle Prüfaktionen ständig zeigen.

**Prüfung:** Code und bestehende Schemafunktionen gelesen, amtliche AO-/GoBD-Quellen
für die Nachvollziehbarkeit recherchiert. Reine Analyse mit Dokumentationsänderungen;
keine neue Anwendungs- oder Datenbankänderung, keine Kontodatenprüfung, kein Push.
Die bereits geprüfte Änderung an Artikelliste und Archivfilter bleibt erhalten.

## 2026-10-13 – Juna – Artikelliste mit einer Bestandszahl und ausdrücklichem Archivfilter

**Auftrag:** Auf der Seite „Artikel“ nur „Auf Lager“ anzeigen und archivierte Artikel
aus der normalen Liste ausblenden. Das Archiv soll über einen Filter erreichbar bleiben.

**Befund:** „Auf Lager“ und „Verfügbar“ sind bei unreservierten Artikeln gleich,
unterscheiden sich aber bei Reservierungen. „Alle“, die Bestandsfilter und „Zu prüfen“
ließen bislang auch archivierte Artikel durch.

**Änderung:** „Verfügbar“ entfällt auf der Artikelseite aus Desktop- und Mobilansicht,
Spaltenauswahl und Sortierung. Die interne verfügbare Menge bleibt für Verkaufsprüfungen
erhalten; der normale Status heißt „Auf Lager“. Archivierte Stammartikel und Einzelstücke
erscheinen ausschließlich bei Auswahl von „Archiv“, auch während einer Suche.
Aktive Artikel ohne Bestand bleiben unter „Alle“ sichtbar. Gespeicherte Spalten werden
bereinigt, eine frühere Sortierung nach Verfügbarkeit fällt auf den Standard zurück;
die bestehende Übernahme alter Standardansichten bleibt erhalten.

**Gestaltung:** Die bestehende Tabelle und der vorhandene Ansichtsfilter bleiben gemäß
`docs/design/admin-ui-guidelines.md` erhalten. Keine neuen Farben, Abstände oder Bedienelemente.

**Prüfung:** 60 gezielte Filter-, Übersichts-, Komponenten- und Tabellenpräferenztests
bestanden; Formatierung, ESLint, Typprüfung und Produktionsbau erfolgreich.
Der erste Bau scheiterte an einer Abhängigkeitsverknüpfung über zwei Windows-Laufwerke;
nach lokaler Installation aus der unveränderten Lockdatei besteht der Bau.
Der aktualisierte Verkaufs-Browsertest kann lokal mangels erreichbarer Test-Supabase
nicht ausgeführt werden. Keine Datenbankänderung, kein Push und kein Deployment.

## 2026-10-13 - Juna - PWA-Produktionspaket vollständig ausliefern

**Auftrag:** Freigegebenen PWA-Abschluss nach erfolgreichem PR401 bis zur Veröffentlichung fortsetzen. Eigener Folgefix auf juna/pwa-release-package; fremder Arbeitszweig bleibt unberührt.

**Befund und Änderung:** Der Releasebau stoppt vor Deployment, weil die Docker-Ausschlussliste den eBay-Beobachter und fünf benötigte Shared-Dateien aus dem Pushpaket entfernt. Nur die sieben Runtime-Dateien ausdrücklich aufnehmen. Der anschließende echte Image-Start weist außerdem einen Nginx-Parserfehler an der ungequoteten Hash-Regel nach; Anführungszeichen erhalten deren regulären Ausdruck und Auslieferungsverhalten. Zwei Regressionen prüfen sämtliche tatsächlich paketierten Quellen und die echten Nginx-Konfigdateien mit dem Produktions-Nginx. Die Browserprüfung erhält 20 Minuten Laufzeit, weil der vollständige grüne PR-Lauf 14 Minuten 55 Sekunden des bisherigen 15-Minuten-Limits benötigt; Prüfumfang und Assertions bleiben erhalten.

**Prüfung:** Beide Fehler vor der Korrektur reproduziert, danach neun Deploy-Prüfungen grün; vier POSIX-Fälle lokal unter Windows ausdrücklich übersprungen. Formatter, Lint, vollständiger Docker-Produktionsbau und tatsächlicher Image-Smoke grün. HTTP bestätigt passende App-/PWA-Metadaten, immutable für Hash-Dateien und 404 für unbekanntes JavaScript. Das aus dem Image extrahierte Functionpaket besteht Integrität, isolierte Edge-Runtime-/Gateway-Prüfung, Auth, Widerruf, Grenzen und Commitgleichheit. Worker-Smoke bestätigt ausgeschalteten Versand. Agent prüft Importkette, Artefakte und Nginx-Regel unabhängig. PR401 bestand zuvor alle Pflichtprüfungen mit 100 Browserfällen, 24 PWA-Skripttests, 23 Produktions-PWA-Fällen und 4.030 Datenbanktests. Der fehlgeschlagene Release änderte die laufende Produktion nicht; Veröffentlichung erst nach dem grünen Folge-PR berichten.

## 2026-10-13 – Juna – Vinted-Statistik: offene Kleinigkeiten aus der Gegenprüfung

**Auftrag:** Die nach PR 394 bewusst offen gelassenen Kleinigkeiten der
Statistikseite aufräumen; Artikelbilder sollen ihre Kachel füllen statt links und
rechts einen Rand zu lassen.

**Änderung:**

- Beim Öffnen wartet die Seite auf den Kontostand, statt einmal umsonst zu laden.
- „Alle Konten“ lädt neu, sobald irgendein Konto frisch abgerufen wurde, nicht nur
  das gewählte.
- Scheitert eine Aktualisierung im Hintergrund, bleiben die letzten Zahlen stehen
  und der Fehlerhinweis erscheint darüber.
- Die Sortierung der Bestenliste übersteht einen Zeitraum- oder Kontowechsel.
- Die Wertetabelle des Diagramms ist zugeklappt wirklich verborgen; das Diagramm
  wird für Bildschirmleser durch die Kurzbeschreibung erläutert.
- Am Tag der Zeitumstellung heißen die doppelten Stunden „02A Uhr“ und „02B Uhr“.
- Bei Gleichstand sortiert der Browser wie die Datenbank nach der Nummer.
- Die Bilder der Bestenliste füllen ihre Kachel (`fit="cover"`).
- Inserat-Detailansicht: Der Rahmen des großen Fotos nimmt die Form des Fotos an
  (höchstens 360 px breit, 320 px hoch am Handy, 560 px am Desktop). Damit gibt es
  weder einen Rand neben dem Bild noch einen Beschnitt. Die kleinen Vorschaubilder
  füllen ihre Kachel. Ohne Foto bleibt ein fester Hochformat-Platzhalter.

**Zur Bildfrage:** Auf vinted.de nachgemessen (13.10.2026): Vinted zeigt Listenkacheln
in 2 : 3 und Fotos der Artikelseite in etwa 5 : 8, jeweils füllend und beschnitten.
Ein 659 × 800 px großes Foto verliert dort seitlich knapp ein Viertel. Der Nutzer hat
sich deshalb gegen die Übernahme und für den angepassten Rahmen entschieden.

**Bewusst nicht geändert:** Die wirkungslose Bedingung `gain is not null` in der
Lesefunktion bleibt, weil das Ergebnis stimmt und eine Migration ohne
Verhaltensänderung nicht lohnt. Der Hinweis „Verwaltungsrechte nötig“ bleibt als
Absicherung stehen. Die kurze Sperre der Migration ist mit PR 394 bereits gelaufen.

**Prüfung:** Neun neue Tests schlugen zuerst fehl und bestehen jetzt. Gesamte
Suite: Node 2382 und Angular 2365 Tests bestanden; in der DOM-Suite lief ein
fachfremder PDF-Test (`purchase-self-receipt.service`) im Gesamtlauf einmal in
eine Zeitüberschreitung und bestand einzeln sowie im erneuten DOM-Lauf (318/318).
`typecheck`, ESLint, `test:workflow`, `test:audit` und Produktionsbau ohne
Beanstandung. Der Browsertest lief lokal nicht: Windows hält auf diesem Rechner
den Portbereich 54344–54443 reserviert, in dem die lokale Supabase-Umgebung
liegt. Er läuft im PR. Die Geometrie des neuen Fotorahmens ist ersatzweise mit einer
Nachbildung in Chromium gemessen (Hochformat 1 : 4, Querformat 4 : 1 und 3 : 4: Rahmen
gleich Foto bis auf die Rahmenlinie, Seitenverhältnis unverändert).

## 2026-10-13 – Juna – Bearbeiten: Speichern ohne Auswahllisten, Preisänderung, klare Meldungen; Konkurrenzvergleich

**Befund (echte Versuche des Nutzers nach PR 395):**

- Titelbild getauscht: bei Vinted geändert, Flipbase meldete trotzdem „nicht eindeutig
  bestätigt“. Das Ziehen der Fotos greift also an der echten Maske. Warum die Bestätigung
  ausblieb, ist offen; das erneute Lesen der Maske dauert rund 25 Sekunden bei 20 Sekunden Frist,
  es gibt also nur einen Versuch.
- Preis von 8 auf 10 Euro: Protokoll „Speichern abgebrochen bei gegenlesen“, bei Vinted nichts
  geändert. Die Oberfläche meldete auch hier „nicht eindeutig bestätigt“, was in diesem Fall
  falsch ist (Abbruch vor dem Speichern).

**Vermutete Ursache (nachgestellt, an echtem Vinted nicht gemessen):** Der Preis wird eingetragen,
das Feld aber nicht verlassen. Formatiert die Maske den Wert erst beim Verlassen, ändert er sich
während des Gegenlesens, und der Leser wertet das als fremde Änderung der Maske. Bei Änderungen,
die danach noch eine Auswahlliste öffnen, fiel das nicht auf.

**Änderung 1 – Preis:** Nach dem Eintragen von Titel, Beschreibung und Preis wird das Feld
verlassen. Ein Abbruch beim Gegenlesen nennt zusätzlich, woran es lag: den Schritt des Lesens
oder ob Inhalt, Fotos oder der Speichern-Knopf abwichen. Die Testmaske formatiert den Preis beim
Verlassen; ein neuer Fall ändert nur den Preis und scheiterte ohne die Korrektur mit derselben
Meldung wie beim Nutzer.

**Änderung 2 – Speichern ohne Auswahllisten:** Ändern sich nur Titel, Beschreibung, Preis oder
Fotos, klappt der Worker keine Auswahlliste mehr auf. Ausgangsstand und Bestätigung kommen dann
aus Vinteds eigener Abfrage des Inserats (`item_upload/items/{id}`, in der angemeldeten Seite,
nur lesend); Fotos werden über ihre Kennungen bestätigt, sofern sich jedes Foto des Rasters
eindeutig einem Foto der Abfrage zuordnen lässt. Der Weg ist reine Abkürzung: Stimmt irgendetwas
nicht eindeutig überein (Abfrage unvollständig, andere Kennungen, andere Texte, Fotos nicht
zuordenbar), wird die Maske noch nicht angefasst und der bisherige Weg entscheidet – auch über
einen Konflikt. Zeigt die Abfrage nach dem Speichern den neuen Stand nicht, bestätigt wie bisher
die Maske. Änderungen an Marke, Größe, Zustand, Farben, Material oder Paketgröße laufen
unverändert über die Maske.

**Änderung 3 – Meldungen:** Bricht das Speichern vor dem Klick bei Vinted ab, antwortet der Worker
mit `vinted_listing_not_saved`; die Oberfläche sagt dann, dass nichts gespeichert wurde. Ist das
Konto gerade durch eine andere Aktion belegt, sagt sie das ebenfalls. „Nicht eindeutig bestätigt“
bleibt für die Fälle, in denen offen ist, ob Vinted gespeichert hat.

**Nicht gemessen:** Ob Vinteds Abfrage dieselben Kennungen und Texte liefert wie die Maske und ob
sich ihre Fotoadressen dem Raster zuordnen lassen, zeigt erst ein echter Lauf. Trifft es nicht
zu, bleibt es beim bisherigen, langsamen Weg – schneller wird es dann nicht, falscher auch nicht.

**Konkurrenz angesehen (Oberflächentexte der Vintz-Demo, Bleam-Dashboard im Browser des
Nutzers, nichts gespeichert):** Vintz bietet eine Browser-Erweiterung und Cloud-Konten mit Proxy,
arbeitet wahlweise mit direkten Anfragen im Hintergrund („Auto“) oder über das sichtbare
Originalformular („Semi“, wie Flipbase bisher), bearbeitet auf gespeicherten Artikeldaten und
führt Cloud-Aktionen als Warteschlange aus. Bleam ist eine Erweiterung in der Vinted-Sitzung, zeigt
den Kleiderschrank aus einer Sicherung und bietet dort Relist, Preis und Löschen.

**Reihenfolge (vom Nutzer bestätigt, in zwei PRs; dies ist der erste):** Lesen, Kontrolle und Bestätigung
über Vinteds Schnittstellen; Inseratdaten beim Synchronisieren mitspeichern; Speichern als
Auftrag im Hintergrund; direktes Speichern zunächst nur für Titel, Beschreibung und Preis.

**Hinweis:** Eine reine Beobachtung auf dem Server zeichnete zwei Läufe nicht auf, weil das
Skript den Namen der Browsersitzung falsch filterte; korrigiert, Auswertung steht aus.

**Prüfungen:** Worker: 638 Tests, Typen, ESLint; 17 Browserfälle des Speicherns und Lesens,
darunter Preis allein (ohne Korrektur rot), Rückfall bei unvollständiger Abfrage und bei nicht
zuordenbaren Fotos, Konflikt über den vollständigen Vergleich; neue Tests für die Abfrage des
Inserats und die Antwort „nicht gespeichert“. App: 63 Testdateien des Marktplatz-Bereichs, Typen,
ESLint und Bau grün.

## 2026-10-13 - Juna - Geprüften PWA-Plan umsetzen

**Auftrag:** „los“ für den gegengeprüften PWA-Plan; geplantes Supabase-Backend danach ausdrücklich freigegeben. Eigener Zweig juna/pwa-mobile-plan, fremde eBay-Änderungen unberührt.

**Stand:** PWA-Start mit Theme, 10-/30-Sekunden-Status und Wiederholung; ehrlicher Installationszustand; mobile Safe Areas und wachsender Header bei Schriftvergrößerung. Vollständiges Bauinventar, geprüfter App-Dateicache und koordinierter Versionswechsel über mehrere Fenster. Lokale Einkaufsentwürfe mit gerätegebundener IndexedDB, Konto-/Workspace-Zuordnung, Export, ausdrücklicher Onlineprüfung und unveränderlichen Übertragungsversuchen. Die Übernahme verwendet serverseitig gespeicherte EANs, statt sie anhand einer fremden Positionsreihenfolge zu überschreiben.

**Push:** Sitzungsgebundene Gerätegenerationen, dauerhafter Widerruf, Kategorien und sichere Klickziele. Supabase-Schema/Migrationen und begrenzte Edge Functions; eigener Versanddienst mit Rechteprüfung, vier parallelen Claims, Rückoff und Ablauf. Vinted-Nachrichten, Shopbestellungen, Kontostörungen und eBay-Bestellbeobachtung erzeugen dauerhafte Ereignisse. eBay-Erstbaseline löst keine Altmeldungen aus; der Beobachter respektiert die konfigurierte Umgebung. CI baut und prüft Dienst-/Functionpakete sowie echte PWA-Produktionsbauten. Auslieferung prüft Commit, HTML-Baukennung, Manifest, Worker und Inventar.

**Prüfung:** `npm run verify` vollständig grün: Formatierung, Lint, Typen, Workflowtests, 279 Edge-Tests mit CI-Deno 2.9.7, Suite-Audit, 4.998 Anwendungstests, 39 Landingtests und Produktionsbau. Zusätzlich 111 Push-SQL-Prüfungen nach tatsächlich transaktional angewandten Migrationen, 19 Versandtests einschließlich reproduziertem langsamen Altbatch, 24 Startup-/Worker-/Bauskripttests und 23 Produktionstests grün. Chromium weist echten Worker, Offline-Lazy-Routen und den Wechsel zwischen zwei echten Bauten nach; WebKit prüft UI und echte IndexedDB. Vier mobile Browseransichten einschließlich AXE/Hell-Dunkel/200-%-Schrift grün und ausdrücklich in PR/Nightly aufgenommen. Agentenbefunde zu Rechteentzug, Eingaben während Laden/Übertragung, Bestätigungsfenster, neueren lokalen Ergänzungen, Push-Navigation und eBay-Umgebung korrigiert und gezielt nachgeprüft. Der abschließend gefundene Releasefilter erfasst jetzt auch Observer- und Shared-Änderungen; 20 gezielte Auswahltests und finales Actionlint grün. Neu erzeugte Supabase-Typen behalten die unveränderte Generatorformatierung; abschließende Typprüfung grün.

**Grenzen:** Keine echte Smartphone-/Tabletinstallation oder Push-Zustellung bei geschlossener App behauptet. Versand bleibt mit WEB_PUSH_ENABLED=false bis zur Geräte-/Pilotabnahme ausgeschaltet; Abnahmevertrag in docs/testing/pwa-device-acceptance.md. Gesamte lokale DB-Suite reproduziert außerhalb der neuen Push-Prüfungen einen PostgreSQL-Absturz in inventory_archive.test.sql; keine grüne DB-Gesamtsuite behauptet. Keine Veröffentlichung oder Änderung am fremden Arbeitszweig.

**CI-Nachprüfung:** Im PR besteht die vollständige Datenbanksuite. Die Linux-Deployfixture simuliert die root-Metadaten jetzt ausdrücklich, weil der CI-Nutzer kein root ist; falscher Eigentümer und Modus bleiben abgewiesen. Die frühe PWA-Initialisierung legt einen bestehenden Workspace-Cachefehler beim direkten Kontowechsel offen: `true` bleibt `true`, obwohl die Sitzung zu einem anderen Nutzer gehört. Cache und laufende Anfragen sind jetzt synchron an Nutzer-ID und Ladegeneration gebunden. Vier neue Regressionen schützen den direkten Wechsel, verspätete Erfolgs-/Fehlerantworten sowie A-B-A einschließlich Ladezustand. Gezielte Tests, Typen, Lint, Bau und echter Linuxlauf als normaler Nutzer grün; der Agent bestätigt den Fix. Kein Abschwächen der Produktionsrechte. Der folgende CI-Lauf besteht alle Anwendungstests und 4.030 Datenbanktests; der Browserlauf besteht 94 Fälle einschließlich Kontowechsel. Die veraltete Vinted-Menüerwartung berücksichtigt anschließend auch den neuen Offline-Link; alle sechs hellen/dunklen Desktop-/Mobilansichten lokal grün.

## 2026-10-13 - Juna - PWA-Plan mit drei unabhängigen Reviews gegenprüfen

**Auftrag:** Zielbild und den gesamten PWA-Umsetzungsplan nochmals mit Agents prüfen.

**Prüfung:** Drei getrennte lesende Reviews für PWA/Start/Updates, Push/Rechte/Betrieb und Offline-Einkaufsverträge. Befunde anschließend gegen Repository und Primärquellen bewertet; gezielte Nachprüfungen der eingearbeiteten Korrekturen. Keine Agent-Dateiänderungen oder Produktimplementierung.

**Änderung:** Updatefreigabe an Build und Aktivierungsversuch binden; Runtime-Cacheintegrität und begrenzte Reparatur definieren. Workerabnahme auf Chromium begrenzen, WebKit-UI und reale Safari-Geräte trennen; Produktionsspecs vom Devserver ausschließen. Einkaufsübertragung erhält unveränderlichen vollständigen Sendeversuch, unbekannten Ausgang, Revisions-/Leasevergleich sowie dauerhaftes Feldmapping und Katalog-Handoff. Vor Freigabe den nachgewiesenen indexabhängigen EAN-Retryfehler im vorhandenen Frontendservice absichern. Neuer Desktopauftrag 02-purchase-retry-contract.md dokumentiert dazu SQL-/Clientbelege.

**Push:** Eigener begrenzter serverseitiger eBay-Bestellbeobachter; konkrete Empfängermatrix und Kontostatusschreiber. Geräte-Settings, VAPID-Wechsel, Retry-After und Claim-Token vollständig im Vertrag. Offline-Revoke über vorab persistierte generationgebundene Capability; terminaler Widerruf blockiert verspätete Registrierung. CI-/Image-/Digest-/Functions-Release samt Rücknahme ausdrücklich verdrahtet. Bestehender Desktopauftrag 01-pwa-web-push.md entsprechend ergänzt.

**Ergebnis:** Die ursprünglichen Reviewbefunde wurden auf Planungsebene geschlossen; ergänzende Grenzfälle und spätere Implementierungs-/Gerätetests stehen im Plan. Markdownformatierung, Aufgabenfolge, Vertragsabgleich und Diffprüfung; keine echte Push-, Offline- oder Gerätefunktion als bereits bestanden behauptet.

## 2026-10-13 - Juna - PWA für Smartphone und Tablet genau aufarbeiten

**Auftrag:** Vorhandenen PWA-Stand prüfen und einen genauen Umsetzungsplan für ein stärkeres App-Gefühl, Ladebildschirm, echte Push-Meldungen und Offline-Nutzung erstellen.

**Entscheidungen:** Offline nur App-Start und lokale Einkaufsentwürfe mit ausdrücklicher späterer Übertragung. Erste Push-Kategorien sind Nachrichten, Bestellungen und Kontoprobleme; vom Nutzer bestätigt.

**Befund:** Installationsgrundlage und statischer Worker vorhanden und öffentlich ausgeliefert. Installationsdialog nicht universell; kein vollständiger Lazy-Chunk-Cache, baugebundener Worker oder koordinierter Update-Schutz. Vorhandene Notifications laufen aus der geöffneten Seite. Für Hintergrund-Push fehlen Geräte-/Sitzungsbindung, dauerhafter Serverversand und Empfangs-/Klickhandler. Start und Workspace-Guards benötigen eigene Fehler-/Offlinebehandlung. Vorhandene request_id-Deduplizierung ermöglicht sichere spätere Einkaufsübertragung.

**Ergebnis:** Zielbild und 14 Aufgaben mit konkreten Dateien, neuen Verträgen, Tests, Zuständigkeiten, Geräteabnahme und Rollout unter docs/superpowers/specs/2026-10-13-pwa-mobile-app-design.md und docs/superpowers/plans/2026-10-13-pwa-mobile-app.md. Nummerierter Backendauftrag unter C:/Users/gt/Desktop/Backend Issues/pwa-mobile-plan/01-pwa-web-push.md. Details wie Aufbewahrung und neue serverseitige Bibliothek sind Vorschläge zur Planprüfung, keine vorweggenommene Freigabe. Keine Produktcodeänderung, Migration oder Veröffentlichung.

**Prüfung:** Repository-/Vertragsanalyse gegen origin/master c1d4564a; Primärquellen für Web Push, Installation, Safe Areas und Worker gelesen. Öffentliche PWA-Dateien in der vorausgehenden Analyse jeweils HTTP 200, Worker entspricht Quelle. Plan auf Abdeckung, Verträge und Grenzfälle überprüft; Markdownformatierung und Diffprüfung. Keine tatsächliche Geräteinstallation, Offline-Abnahme oder Push-Zustellung behauptet. Eigener Planungszweig juna/pwa-mobile-plan; vorhandener Arbeitszweig unverändert.

**Fortsetzung:** Nutzerfreigabe für PR, erfolgreichen Merge und anschließendes Aufräumen erteilt. Aktuelles origin/master einschließlich PR400 integrieren; beide Changelogverläufe bleiben erhalten. Keine Änderung am fremden Arbeitszweig.

## 2026-10-11 – Juna – Eigene Vinted-Statistikseite mit echten Messwerten

**Auftrag:** Kacheln und Diagramm aus dem Kleiderschrank herausnehmen und als
eigene Seite „Statistik“ mit Verlauf und Bestenliste neu aufbauen, je Konto und
für alle Konten. Verkaufte oder gelöschte Artikel sollen in ihren Zeiträumen
weiter mitzählen.

**Befund:** Das bisherige Diagramm verteilte die Gesamtsumme nach festen
Prozentsätzen auf Tage und zeigte ohne Daten Beispielwerte; „Beste Zeit: Sonntag“
war fest eingetragen. Echte Messwerte je Abruf lagen bereits in
`marketplace_listing_metric_observations`, wurden aber mitgelöscht, sobald ein
Inserat aus dem Kleiderschrank verschwand.

**Änderung:**

1. **Datenbank:** Neue Tabelle `marketplace_listing_statistic_items` als
   dauerhafter Datensatz je Vinted-Artikel. Messungen hängen daran statt am
   Kleiderschrank-Eintrag und bleiben erhalten; verschwundene Inserate bekommen
   den Vermerk „nicht mehr online“. Vorhandene Messungen werden übernommen. Neue
   Lesefunktion `marketplace_read_listing_statistics_overview` für Summen,
   Zeitabschnitte und Bestenliste, je Konto oder für alle Konten.
2. **Seite:** Menüpunkt „Statistik“ unter „Kleiderschrank“ mit Schaltern für
   Konto-Umfang und Zeitraum, drei Kacheln mit Vergleich zum Zeitraum davor,
   Säulendiagramm (ApexCharts) mit einblendbarer Wertetabelle und Bestenliste.
3. **Kleiderschrank:** Das simulierte Diagramm samt Beispielzahlen ist entfernt;
   die „+N“-Zahlen an den Karten bleiben.

**Abwägungen:** Die Migration ist von Hand aus der Schema-Datei zusammengestellt,
weil der erzeugte Abgleich viele fremde, bereits vorhandene Abweichungen enthielt.
Ein Schild „Verkauft“ gibt es nicht, weil Vinted-Verkäufe keine Artikelnummer
tragen. Bereits früher gelöschte Inserate sind nicht wiederherstellbar. Alte
Messungen werden noch nicht verdichtet.

**Nach der Gegenprüfung behoben:** Die Lesefunktion prüft das Verwaltungsrecht
jetzt einmal selbst (`security definer`), weil die Prüfung je Messzeile bei
1,7 Mio. Zeilen 46 s (7 Tage) bzw. über 3 Minuten (30 Tage) brauchte; danach
0,7 s und 2,9 s. Der Vorzeitraum zählt nur so weit, wie der aktuelle Zeitraum
schon gelaufen ist. Index auf `entry_id` ergänzt. Der Store lädt nur noch neu,
wenn sich die Anfrage selbst ändert.

**Prüfung:**

- Datenbank: neue pgTAP-Datei (47 Prüfungen) und die gesamte Suite
  (108 Dateien, 3958 Prüfungen) bestanden; Datenübernahme zusätzlich gegen
  Altbestand geprüft; erneuter Schemaabgleich ohne Treffer auf die neuen Objekte.
- Unit-Tests `marketplaces` und Navigation: 65 Angular-Dateien / 804 Tests und
  28 Node-Dateien / 247 Tests bestanden.
- Browsertest `e2e/vinted-workspace-ui.spec.ts` in sechs Varianten (1440, 390,
  320 px; hell und dunkel) bestanden, einschließlich AXE und Überlaufprüfung der
  neuen Seite.
- Prettier, ESLint, `typecheck`, `test:audit` und Produktionsbau ohne Beanstandung.

## 2026-10-13 - Juna - eBay-Statistiken über PR veröffentlichen

**Auftrag:** Den geprüften eBay-Zweig über einen grünen PR zusammenführen und veröffentlichen.

**Änderung:** Die CI erkennt einen unvollständigen Ressourcenresolver im Settings-Test;
die beiden neuen eBay-Vorlagen ergänzen, ohne das Anwendungsverhalten zu ändern.
Der Serverrollout wird auf die zusammengehörigen eBay-Quellen begrenzt und erhält fremde
installierte Funktionsstände; Sicherung und Zugriffsprüfung gehören zum Rollout.

**Prüfung:** Der CI-Fehler benennt die fehlende Angebotsvorlage ausdrücklich. Nach der
Korrektur bestehen 77 gezielte Settings- und eBay-Tests sowie Format/Lint; die vollständige
CI läuft erneut im PR. Produktionsnachweise werden erst nach erfolgreichem Rollout berichtet.

## 2026-10-13 - Juna - eBay-Statistiken kompakter darstellen

**Auftrag:** Infotexte auf das Nötigste beschränken und Platz für eine klare Übersicht sparen.

**Änderung:** Kennzahlerklärungen, Vergleichsdetails und Datenabgrenzungen hinter einem
zugänglichen Info-Schalter zusammenfassen. Wiederholte Absätze aus Kennzahlen, Diagramm,
Aufrufquellen, Werbung und Tabelle entfernen. Werbung verwendet eine kompakte Kartenkopfaktion;
Werte, Datenstand, Ladezustände und Fehler bleiben sichtbar. Keine Änderungen an der Auswertung.

**Prüfung:** Betroffene Angular-Tests, Format/Lint, Typprüfung, Shared-UI-Prüfung und
Produktionsbau. Lokale Browserprüfung mit Testdaten für kompakte Ansicht, Info-Schalter,
Werbestatus und mobile Darstellung; AXE einschließlich Farbkontrast. Noch nicht veröffentlicht.

## 2026-10-13 - Juna - eBay-Traffic mit Seller-Hub-Referenz abgleichen

**Auftrag:** Den Screenshot der eBay-Trafficseite als fachliche Referenz für
Kennzahlen, Diagramm und Artikeltabelle verwenden.

**Änderung:** Aufrufe bei eBay und externe Aufrufe getrennt auswerten; dafür
`LISTING_VIEWS_SOURCE_OFF_EBAY` im echten Serverbericht ergänzen. Die Klickrate
verwendet jetzt eBay-Aufrufe geteilt durch Gesamtimpressionen, statt allein die
Suchergebnisse auszuwerten. Die Artikel zeigen ihren bekannten aktuellen Bestand.
Neben dem Diagramm steht die Herkunft der Aufrufe. Fünf Kennzahlen vergleichen
den unmittelbar vorherigen gleich langen Zeitraum; die API-Abfragen bleiben
einzeln auf höchstens 90 Tage begrenzt. Fehlende Vorwerte und Nullnenner erzeugen
keine erfundenen Trends. Vergleichsfehler lassen aktuelle Daten bestehen; ein
Widerruf der Kontorechte wird weiterhin weitergegeben.

eBays Seller Hub zählt verkaufte Stücke, die Analytics-API abgeschlossene
Transaktionen. Die Beschriftung und Quotenerklärung nennen diese Grenze.
Die dokumentierte API liefert keine vollständige organische/externe
Impressionsaufteilung oder Top-20-Veränderungen. Deshalb keine fingierten
gestapelten Serien. CPS-Werbeklicks können externe Plätze enthalten; eine daraus
berechnete vermeintliche Seller-Hub-Klickrate wird nicht mehr angezeigt.
Keine Migrationen, zusätzlichen Rechte oder Abhängigkeiten.
Quellen: https://www.ebay.de/verkaeuferportal/angebote/verkaeufer-cockpit-pro/performance-kennzahlen
und https://developer.ebay.com/api-docs/sell/static/marketing/reports-by-platform.html.

**Prüfung:** Lokale Modell-, Angular- und serverseitige Tests einschließlich
Klickrate, Quellenlücken, Bestandsmetadaten, Vergleichszeiträumen und Widerruf.
Format/Lint, Typprüfung, Shared-UI-Prüfung und Produktionsbau. Lokale Browserprobe
mit künstlichem Konto: getrennte Artikelaufrufe, Vorzeitraumvergleich und
asynchrone Werbeberichte. Statistikbreite bei 2.560 px auf 1.200 px begrenzt;
bei 390 px kein Seitenüberlauf, Tabelle scrollt intern. AXE einschließlich
Farbkontrast ohne Befund auf Desktop und mobil. Echte eBay-Daten bleiben vor
Veröffentlichung ungeprüft; Frontend und Edge-Functions gemeinsam ausrollen.

## 2026-10-13 - Juna - eBay-Artikelauswertung und Werbeberichte anbinden

**Auftrag:** Unter den Trafficdiagrammen die einzelnen Artikel mit Impressionen,
Aufrufen, Klickrate und Conversion Rate anzeigen und Werbetraffic ergänzen. Die
zusätzliche OAuth-Freigabe `sell.marketing` wurde ausdrücklich bestätigt; sie wird
ausschließlich für das Erzeugen und Lesen von Berichten genutzt.

**Änderung:** Artikelauswertung der Sell Analytics API für 7, 30 oder 90 abgeschlossene
UTC-Tage, bis zu 200 Angebote nach Gesamtimpressionen, Suche und Sortierung.
Aktive Angebote erhalten Titel, Bild und Beobachterzahl aus der bestehenden
persönlichen Inseratabfrage; fehlende Metadaten bleiben als Angebotsnummer mit
neutralem Titel sichtbar. Keine erfundenen Bilder oder vermeintlichen Nullzähler.
Asynchrone Konto- und Artikelberichte der Marketing API für Allgemein/CPS und
Priorität/CPC auf eBay: passende laufende Berichte wiederverwenden, Status manuell
prüfen und fertige TSV/Gzip-Berichte begrenzt herunterladen. Es werden weder
Kampagnen noch Gebote oder Budgets verändert. Fremde Download-URLs werden nicht
mit Zugangsdaten aufgerufen. Artikelkennungen stammen aus dem eigenen Analyticsbericht.
Gesamt- und Werbeimpressionen werden als getrennte Balken verglichen, Werbeklicks
als eigene Diagrammkennzahl und als Artikel-/Tageswerte angezeigt. Die dokumentierte
API stellt keine bestätigte getrennte organische Trafficserie bereit; deshalb kein
ungeprüftes Abziehen unterschiedlicher Zählwerte. Der Hinweis steht in der Oberfläche.
Konto-/Zeitraumwechsel verwerfen alte Auswertungen, die Serveraufrufe verwenden die
bestehende persönliche Kontosperre und Versionsprüfung. Bestehende Tokenrechte
bleiben beim Refresh erhalten; für Werbung muss das Konto erneut verbunden werden.
Keine Migrationen oder zusätzlichen Abhängigkeiten.
API-Verträge: https://developer.ebay.com/api-docs/sell/static/marketing/pl-reports.html
und https://developer.ebay.com/api-docs/sell/static/performance/traffic-report.html.

**Prüfung:** 24 Angular-Tests für Kontoansicht/Store, zwölf Modelltests, 38
serverseitige Tests unter Deno sowie 27 betroffene Workflowtests bestanden.
Format/Lint, Typprüfung, Shared-UI-Prüfung und Produktionsbau bestanden.
Lokale Browserprüfung mit künstlichem Konto: asynchrone Berichte, Artikelwerte,
Suche/Sortierung, Diagrammwechsel, Werbe-Tageswerte und Zeitraumwechsel.
Bei 390 px kein Seitenüberlauf, die Tabelle scrollt intern; bei 2.560 px bleibt der
Statistikinhalt 1.200 px breit. AXE einschließlich Farbkontrast ohne Befund für helle
Desktop- und helle/dunkle mobile Statistik mit fertigen Werbeberichten. Die zunächst
interaktive Diagrammlegende wurde durch eine einfache zugängliche Legende ersetzt.
Echte Kontodaten und eBays Marketing-Berechtigung sind vor Veröffentlichung noch
nicht live geprüft. Die Edge-Functions müssen gemeinsam mit dem Frontend ausgerollt
werden; eBay kann zusätzlich eine geeignete Verkäuferberechtigung verlangen.

## 2026-10-13 - Juna - eBay-Trafficübersicht über die Analytics-API ergänzen

**Auftrag:** Die Statistikseite als Trafficübersicht mit Impressionen, Aufrufen,
Klickrate und Conversion Rate überarbeiten; Beobachter und Aufrufe bei Inseraten
anzeigen. Die nötigen eBay-Servererweiterungen sind ausdrücklich freigegeben.

**Änderung:** Kontoweiter Tagesbericht der eBay Sell Analytics API für den deutschen
Marktplatz, einschließlich inzwischen verkaufter Angebote. Auswahl für 7, 30 oder
90 abgeschlossene UTC-Tage, Datenstand, fünf Kennzahlen, wechselbares Diagramm und
zugängliche Tageswerttabelle. Gesamtimpressionen verwenden `TOTAL_IMPRESSION_TOTAL`
entsprechend dem Seller Hub. Klickrate und Conversion Rate werden für Gesamt- und
Tageswerte aus den jeweiligen API-Zählwerten berechnet, ohne Tagesprozente zu
mitteln. Nullwerte, fehlende Tage und nicht berechenbare Quoten bleiben unterscheidbar.
Beobachter und Aufrufe der letzten 30 Tage stehen nebeneinander in den Inseraten;
die Statistikseite lädt keine aktive Inseratliste mehr. Der neue Serveraufruf nutzt
die bestehende persönliche Kontosperre, Workspaceberechtigung und Versionsprüfung;
überholte Antworten werden verworfen. Keine neuen OAuth-Rechte, Abhängigkeiten oder
Migrationen. Original-Trafficseite bleibt über einen Link erreichbar. API-Vertrag:
https://developer.ebay.com/api-docs/sell/static/performance/traffic-report.html

**Prüfung:** 23 Angular-Tests für Kontoansicht/Store, neun Modelltests, 16 serverseitige
Tests unter Deno sowie 27 betroffene Workflowtests bestanden. Format/Lint,
Typprüfung, Shared-UI-Prüfung und Produktionsbau bestanden. Lokale Browserprüfung
mit künstlichem Konto und schreibgeschütztem Antwortserver: Zeitraumwechsel,
Diagrammwechsel, Tageswerte, aktuelle Beobachter/Aufrufe und mobile Tabellenansicht.
Bei 390 px kein Seitenüberlauf, Diagramm 318 px breit. AXE einschließlich Farbkontrast
ohne Befund für helle Desktop-Statistiken, helle/dunkle mobile Statistiken und dunkle
mobile Inserate. Echte eBay-Trafficdaten des neuen Kontoaufrufs sind vor dem Rollout
noch nicht live geprüft. Die Edge-Function-Erweiterung muss zusammen mit dem
Frontend veröffentlicht werden; der reine Frontend-Release reicht dafür nicht.

## 2026-10-13 – Juna – eBay-Arbeitsbereich und Navigation neu ordnen

**Auftrag:** Den gesamten eBay-Bereich übersichtlicher aufteilen, bei Bedarf wie
bei Vinted das Menü wechseln und die Inhaltsbreite auf großen Bildschirmen begrenzen.

**Änderung:** Eigener eBay-Menükontext mit Inseraten, Bestellungen, Statistiken und
Kontoverbindung sowie Rückweg zu Flipbase. Mobile Schnellnavigation und das
aufklappbare Menü verwenden dieselben Seitenziele. Die bisherige Einstiegsroute
leitet unter Erhalt der OAuth-Queryparameter zu den Inseraten weiter; der Editor
behält seinen Pfad, seine Kontoparameter und den Schutz ungespeicherter Änderungen.
Alle eBay-Seiten einschließlich Editor stehen in einem zentrierten 1.200-px-Rahmen,
entsprechend der bestehenden Flipbase-Erfassungsbreite, ohne Anspruch auf einen
gemessenen Shopify-Breitenwert. Verbindungseinstellungen stehen separat, das
verbundene Konto bleibt im Seitenkopf sichtbar. Bestellungen laden direkt ihren
Datenbereich. Die gemeinsame Tabellen-Suche filtert geladene Einträge; eine weitere
Ergebnisseite wird ausdrücklich berücksichtigt. Konto- und Workspacewechsel
verwerfen die Suche und alte Daten. Keine Backendänderung oder Migration.

**Prüfung:** 52 Angular-Tests für eBay-Konto/Store/Editor und Sidebar/Mobilnavigation,
35 Konfigurations- und Routentests, Typprüfung, Format/Lint, Shared-UI-Prüfung und
Produktionsbau bestanden. Lokale Browserprüfung mit künstlichem Konto und
schreibgeschütztem Antwortserver: bei 2.560 px genau 1.200 px Inhaltsbreite mit
gleichen Seitenabständen, bei 390 px 358 px Inhalt und kein Seitenüberlauf. Editor,
Bestellungen, Statistik- und Verbindungsseiten öffnen korrekt. AXE einschließlich
Farbkontrast ohne Befund für mobile Bestellungen, mobile/dunkle/helle Statistiken
und den hellen Editor. Bestehende Produktionsangebote wurden nicht verändert.
Der vorhandene Bestellimport-Browsertest wurde an den neuen Menülink angepasst
und prüft zusätzlich die Einstiegsweiterleitung und den Bestellseitenpfad.

## 2026-10-13 - Juna - eBay-Bearbeitungslink und Statistikabruf korrigieren

**Auftrag:** Bearbeiten führte zum Dashboard; Aufrufe und Verkaufsquote fehlten.
Die Bedeutung der Quote bei überwiegend einzelnen Artikeln erklären.

**Befund:** Im echten Browser enthält der Bearbeitungslink den kodierten Querystring
im Pfad (`edit%3Fconnection%3D…`). Die Statistikabfrage liefert HTTP 502 mit
`invalid_response`, bisher irreführend als fehlende Erreichbarkeit dargestellt.
Der Parser verlangt einen bestimmten Namen für die Berichtsdimension, obwohl
der aktuelle eBay-Vertrag dafür kein festes Enum vorgibt. Ein direkter Diagnoseweg
über gespeicherte Zugangsdaten wurde vor Ausführung blockiert; keine Zugangsdaten
wurden dafür ausgelesen.

**Änderung:** Konto-ID separat über Router-Queryparameter; Navigationstest mit
Dashboard-Rückfall. Statistiken werden nach dem Inseratabruf automatisch geladen.
Die einzige Dimension des Angebotsberichts wird positionsbezogen ausgewertet;
angefragte Angebots-IDs, Metrikschlüssel und Dimensionanzahl bleiben geprüft.
Ladezustand, fehlende Daten und Abruffehler sind sichtbar unterscheidbar. Die
Spalte „Käufe / Aufrufe“ und ein Einzelstück-Beispiel erklären die Quote.
Ungültige Antworten protokollieren nur Berichtsschlüssel, keine Tokens oder
Angebotsinhalte. Echte Speicheraufrufe gehören nicht zur Fehlerprüfung.

**Prüfung:** 19 Angular-Tests für Kontoansicht und Store sowie 13 serverseitige
Tests unter Node; Typprüfung, Format/Lint, gemeinsame UI-Regeln und Produktionsbau
bestanden. Der echte Editor lädt mit korrigierter URL Titel, Preis, Beschreibung
und acht Bilder. Der neue Statistikparser ist lokal geprüft; die echte Antwort
muss nach dem freigegebenen Rollout erneut abgenommen werden. Kein Live-Schreiben.

## 2026-10-13 - Juna - eBay-Inserate mit Bildern, Bearbeitung und Statistiken erweitern

**Auftrag:** Fehlende Bilder, direkte Angebotsbearbeitung sowie Aufrufe,
Beobachter und Verkaufsquote je Inserat ergänzen. Die nötigen Änderungen an
Supabase-Edge-Functions und API-Verträgen wurden ausdrücklich freigegeben.

**Änderung:** Vorschaubilder und Beobachter aus der vorhandenen Trading-Antwort;
neue Bearbeitungsseite für Titel, Preis, Beschreibung und Bilder mit der gemeinsamen
Produkt-Bildverwaltung. Vorhandene HTML-Beschreibungen bleiben erhalten. Die aktuelle
eBay Media API übernimmt neue Fotos. Statistiken kommen aus der Analytics API für
30 abgeschlossene UTC-Tage, mit Datenstand und unbekannten statt erfundenen Nullwerten.
Geänderte Inserate werden vor dem Schreiben erkannt; unklare Speicherantworten sperren
einen weiteren Versuch bis zum Neuladen. Konto-/Workspace-Grenzen, erneute Freigaben,
Dateigrößen und XML-Eingaben bleiben serverseitig geprüft. Neue OAuth-Rechte erfordern
für Uploads und Statistiken eine erneute Kontoverbindung; alte Lesefunktionen behalten
beim Tokenrefresh ihre bisherigen Rechte. Variantenpreise und von anderen Anwendungen
verwaltete Angebote unterliegen weiterhin den eBay-Beschränkungen. Keine Migration.

**Prüfung:** Gezielte Angular-, Antwortvertrags- und serverseitige eBay-Tests;
TypeScript für Anwendung, Tests und betroffene Edge-Module; Format/Lint,
Shared-UI-Architekturprüfung und Angular-Produktionsbau. AXE für Angebotsliste und
Editor ohne Farbkontrastmessung. Servertests lokal unter Node, der verbindliche
Deno-Lauf bleibt im PR und enthält die neuen Tests. Kein echter eBay-Schreibaufruf
und keine Veröffentlichung; Live-Kontoabnahme bleibt nach Freigabe erforderlich.

## 2026-10-12 – Juna – Bearbeiten: Bild-Baustein der Produktseite, Speicherabbruch einordnen

**Auftrag (Nutzer):** Das Speichern einer geänderten Fotoreihenfolge meldete „Vinted hat die
Änderung nicht eindeutig bestätigt“. Außerdem ist der Bildeditor mit Griff, Pfeilen und Stern
nicht der gewünschte Baustein; gemeint ist die Bildverwaltung der Produktseite.

**Befund:** Der Speicherversuch vom 12.10. (20:44 Uhr) endete nach rund 25 Sekunden mit
„Browsersitzung unterbrochen“. Der Sitzungsbroker ersetzt jeden Fehler, und die Speicher-Route
hielt den Abschnitt nicht fest. Die Dauer passt zu einem Abbruch beim Verschieben der Fotos, also
vor dem Klick auf „Speichern“ – belegt ist das nicht. Welche Bedingung Vinteds Ziehrahmen an
einen Zug stellt (Haltezeit oder Mindestweg), ist ebenfalls nicht gemessen.

**Änderung Worker:**

- Das Speichern nennt bei einem Abbruch den festen Abschnitt (berechtigung, öffnen, lesen,
  prüfen, fotos entfernen, fotos verschieben, texte eintragen, merkmale wählen, gegenlesen,
  speichern, bestätigen). Die Route schreibt ihn als `marketplace_listing_read_detail` mit
  `route: content/save` ins Protokoll, bevor der Broker den Fehler ersetzt. Inhalte, Kennungen
  und Anbieterantworten bleiben draußen.
- Fotos werden wie von Hand gezogen: drücken, kurz halten, langsam zum Ziel, dort verweilen,
  loslassen. Greift ein Zug nicht, folgt genau ein zweiter am vorderen Rand des Ziels; zeigt das
  Raster etwas anderes als „unverändert“ oder „verschoben“, wird abgebrochen und nicht gespeichert.
- Die Testmaske verlangt jetzt Haltezeit und Weg (bewusst strenger als gemessen) und kann Ablagen
  verwerfen.

**Änderung Oberfläche:**

- `app-product-media-editor` liegt jetzt unter `shared/components`, weil ihn Katalog und
  Vinted-Bearbeitung verwenden. Neue Schalter: `canAdd`, `canCrop`, `canDescribe`
  (Bildname und Alternativtext) und `minimumImages`. Die Produktseite verhält sich unverändert.
- Die Bearbeiten-Maske zeigt die Vinted-Fotos mit diesem Baustein: großes Hauptbild, Ziehen direkt
  am Bild, Klick öffnet die Bilddetails mit Position und „Bild löschen“.
- Vorschaufehler eines Bildes verschwinden, sobald das Bild nicht mehr in der Galerie liegt
  (vorher blieb die Meldung stehen, wenn die Fotos durch den Vinted-Stand ersetzt wurden). Das
  technische Datei-Feld trägt zusätzlich `hidden`.
- Die Schalter `canAdd`, `canCrop` und `minimumImages` am `app-listing-image-editor` aus der
  vorigen Sitzung sind wieder entfernt, weil sie niemand mehr verwendet.

**Offen:** Ob das Ziehen an der echten Vinted-Maske jetzt greift, zeigt erst der nächste Versuch
an einem unkritischen Inserat; scheitert er, steht der Abschnitt im Protokoll. Die Maske zum
Erstellen eines Inserats verwendet weiterhin `app-listing-image-editor`.

**Prüfungen:** Worker: 634 Tests, Typen, ESLint, neun Browserfälle des Speicherns (darunter
wiederholter und endgültig gescheiterter Zug) und zehn Fälle der Inhalts-Routen grün. App: alle
231 Angular-Testdateien (2295 Tests), 206 Node-Testdateien, Workflow-Tests, Typen, ESLint,
Prettier, Shared-UI-Prüfung und Bau grün; sechs Browserfälle der Inseratseite lokal mit
Barrierefreiheitsprüfung auch des Bilddetails-Fensters, Bildschirmfotos bei 1440 und 390 Pixeln
angesehen. Die Browserfälle der Produktseite brauchen die Datenbank und laufen erst im PR.

## 2026-10-12 – Juna – Bearbeiten: Bildeditor mit Drag and drop, Zielbild und Schnittstellen-Befund

**Zielbild des Nutzers (12.10., nach PR 392):** „Bearbeiten“ soll ohne Wartezeit vollständig
gefüllt öffnen; Fotos per Drag and drop mit dem Bildeditor der Inserat-Erstellung, Zuschneiden
im vorhandenen Fenster; Speichern als Auftrag in einer Warteschlange statt Ladebildschirm;
Artikelangaben rechts unter „Preis und Versand“.

**Änderung (Schritt 1):** Die Bearbeiten-Maske verwendet für die vorhandenen Fotos den
gemeinsamen Bildeditor (ziehen, Titelbild setzen, entfernen) statt der vier Knöpfe aus PR 392.
Der Editor kann dafür neue Bilder ablehnen (`canAdd`), das Zuschneiden ausblenden
(`canCrop`) und eine Mindestzahl halten (`minimumImages`); bestehende Verwendungen bleiben
unverändert. Die Artikelangaben stehen in der rechten Spalte. Neue Fotos und Zuschneiden bleiben
aus, bis das Speichern über die Auftragswarteschlange läuft, die Fotodateien bereits überträgt.

**Befund zu Vinteds Schnittstellen (nur Feldnamen und Typen mitgelesen, Beobachtung entfernt):**

- `GET /api/v2/item_upload/items/{id}`: Titel, Beschreibung, Preis, `catalog_id`, `brand_id`
  mit `brand_dto`, `color1_id`/`color2_id`, `package_size_id`, Fotos mit Adressen und
  `item_attributes` mit den Kennungen `size`, `condition` und `material` samt gewählten IDs.
- `POST /api/v2/item_upload/attributes` mit `{attributes:[{code, value:[…]}]}` liefert je
  Kategorie die Merkmale `brand`, `size`, `condition`, `color`, `material`; für Größe,
  Zustand und Material samt Auswahlwerten, Auswahlart und Höchstzahl.
- `GET /api/v2/item_upload/colors`, `…/brands?category_id` (auch mit `keyword`) und
  `…/catalogs` liefern Farben, Marken und den Kategorienbaum.

Damit lässt sich ein Inserat in etwa einer Sekunde über Schnittstellen lesen statt in rund 25
Sekunden durch Aufklappen jeder Liste – auch beim regelmäßigen Synchronisieren.

**Noch zu klären:** Kennung der Kategorie in der Merkmal-Anfrage, Herkunft der Paketgrößen und
ob die Fotoadressen der Schnittstelle denen im Raster der Maske entsprechen.

**Prüfungen:** Alle 231 Angular-Testdateien mit neuen Fällen, sechs Browserfälle der
Inseratseite lokal mit Barrierefreiheitsprüfung, Bildschirmfoto angesehen, Typen, ESLint,
Prettier, Shared-UI-Prüfung und Bau grün.

## 2026-10-12 – Juna – Bearbeiten: Titelbild festlegen, Fotos verschieben und entfernen

**Auftrag (Nutzer):** In der Bearbeitung sollen sich die Fotos wie bei Vinted ändern lassen.
Erste Stufe: Reihenfolge und Entfernen vorhandener Fotos. Neue Fotos folgen getrennt.

**Befund an der echten Maske (12.10., nur Aufbau gelesen, Beobachtung danach entfernt):** Im
Raster `media-upload-grid` hat jedes Foto einen ziehbaren Rahmen
(`aria-roledescription="sortable"`) um `image-wrapper-<n>` und einen Löschknopf
`media-select-grid-delete-button-<n>`; das Datei-Feld `add-photos-input` nimmt mehrere
Bilder an.

**Änderung Worker:** Das Speichern eines bestehenden Inserats nimmt optional eine Fotoanordnung
an: den Stand, auf dem die Änderung beruht, und eine Auswahl daraus in neuer Reihenfolge.
Inzwischen bei Vinted geänderte Fotos ergeben einen Konflikt und werden nicht überschrieben. In
der Maske werden überzählige Fotos von hinten entfernt und die übrigen an ihre Stelle gezogen;
nach jedem Schritt wird das Raster geprüft. Gespeichert wird weiterhin genau einmal, bestätigt
erst nach erneutem Lesen. Fremde Adressen, Doppelte und neue Fotos lehnt schon die Übertragung
ab.

**Änderung Oberfläche:** Unter dem großen Foto stehen „Als Titelbild“, „Nach vorn“, „Nach
hinten“ und „Foto entfernen“. Sie wirken erst, wenn der Vinted-Stand gelesen ist, und arbeiten
auf den Fotos, die Vinted dabei geliefert hat. Mindestens ein Foto bleibt.

**Einschränkung:** Ob das Ziehen an der echten Maske so greift wie an der Testseite, zeigt erst
ein echter Lauf mit einem unkritischen Inserat. Scheitert ein Schritt, wird nicht gespeichert.

**Prüfungen:** 634 Worker-Prüfungen, 48 Browserfälle der Inserate mit drei neuen, alle 231
Angular- und 206 Node-Testdateien der Anwendung, sechs Browserfälle der Inseratseite lokal mit
Barrierefreiheitsprüfung, Bildschirmfoto angesehen, Typen, ESLint, Prettier, Shared-UI-Prüfung
und Bau grün.

## 2026-10-12 – Juna – Bearbeiten: Auswahlboxen für Farben und Material, großes Titelbild

**Stand nach PR 390:** Das vollständige Lesen eines bestehenden Inserats läuft an der echten
Vinted-Maske durch (im Browser des Nutzers angesehen): Kategorie, Marke, Größe, Zustand, Farben,
Material und Paketgröße sind richtig vorbelegt.

**Rückmeldung des Nutzers:** Farben und Material als lange Checkbox-Listen sind unbrauchbar; er
will die Auswahlboxen der Artikel-Erstellung. Die Fotos sollen wie bei Vinted aussehen (großes
Titelbild, kleine Bilder darunter) und austauschbar sein.

**Änderung:**

- Farben und Material verwenden die gemeinsame Auswahlbox `app-attribute-picker` mit Suche und
  Chips. Die Box kann jetzt eigene Eingaben sperren (`allowCustom`) und eine Höchstzahl
  einhalten (`maxSelected`); beides braucht die Vinted-Auswahl (zwei Farben, drei Materialien,
  nur vorgegebene Werte). Bestehende Verwendungen bleiben unverändert.
- Die Paketgröße zeigt nur noch Klein, Mittel oder Groß statt Vinteds zusammengezogenem
  Kacheltext („EmpfohlenMittelFür Artikel, …“).
- Fotos: großes Titelbild, kleine Bilder darunter, anklickbar wie in der Ansicht.

**Noch offen:** Fotos austauschen, hinzufügen und umsortieren sowie die Kategorie ändern. Das
braucht einen eigenen Schreibweg im Worker und ist das nächste Paket.

**Prüfungen:** Alle 231 Angular- und 206 Node-Testdateien der Anwendung, neuer Fall der
Auswahlbox (Höchstzahl, keine eigene Eingabe), sechs Browserfälle der Inseratseite lokal mit
Barrierefreiheitsprüfung, Bildschirmfoto der Maske angesehen, Typen, ESLint, Prettier,
Shared-UI-Prüfung und Bau grün.

## 2026-10-12 – Juna – Materialvorschlag und Marke beim Lesen bestehender Inserate

**Befund nach PR 389 (echter Lauf, Aufbau der Auswahllisten mitgeschrieben):** Die neue
Bearbeiten-Maske öffnet sofort. Das vollständige Lesen kam über die Kategorie hinaus und
scheiterte am Schritt `fields`:

- Über der Materialliste steht ein Vorschlag mit der Kennung `material-suggestion-<id>`. Der
  gemeinsame Formularvertrag kannte nur `material-<id>` und brach ab.
- Die Vorschlagsliste der Marken (50 Einträge) enthielt die Marke des Inserats nicht; sie
  erscheint erst nach einer Suche. Das wäre der nächste Abbruch gewesen.
- Größe, Zustand und Farben sind an der echten Maske so markiert, wie der Leser es erwartet.

**Änderung:** Der Formularvertrag liest Materialvorschläge mit. Der Leser nimmt neben der
Kategorie auch Marke und Markenname aus `/api/v2/item_upload/items/{id}` und sucht die Marke
über die vorhandene Markensuche, wenn die Vorschlagsliste sie nicht zeigt. Die Testseiten
enthalten jetzt Materialvorschlag und Markensuche wie gemessen.

**Prüfungen:** 44 Browserfälle der Inserate mit einem neuen (Marke nur über die Suche); die
Fälle des Lesers sind ohne die Änderung rot (3 von 5) und mit ihr grün; 633 Worker-Prüfungen,
282 Workflow-Prüfungen, 206 Node- und 231 Angular-Testdateien der Anwendung, Typen, Format und
ESLint grün.

**Weitere Wünsche des Nutzers vom 12.10. (noch offen):** Fotos in der Bearbeitung wie bei Vinted
(großes Titelbild, kleine Bilder darunter, austauschbar); Favoriten-Benachrichtigung zusätzlich
als Hinweis unten rechts und als Windows-Benachrichtigung über den Browser, einschaltbar.

## 2026-10-12 – Juna – Bearbeiten im Aufbau der Erstellen-Maske und Kategorie aus dem Inserat

**Auftrag (Nutzer):** Bearbeiten soll wie „Inserat erstellen“ aussehen und sofort öffnen; Fotos
oben, Auswahlfelder nur mit Vinted-Werten. Künftig größere PRs statt vieler kleiner.

**Befund am echten Vinted (12.10., mit Zustimmung des Nutzers beobachtet):**

- Nach PR 388 nennt das Protokoll den Schritt: Das vollständige Lesen scheiterte an `category`.
- Beim Bearbeiten öffnet Vinted die Kategorieauswahl ganz oben im Katalog: Suchfeld, ein nicht
  markierter Vorschlag, darunter die Hauptgruppen als Schaltflächen. Die gewählte Kategorie ist
  dort nicht markiert; sie steht nur als Text im Feld. Der Leser suchte genau einen markierten
  Eintrag. Die bisherigen Testseiten nahmen fälschlich eine markierte Kategorie an.
- Die Maske lädt Katalog, Farben, Marken und Merkmale über `/api/v2/item_upload/…`. Das Inserat
  selbst liefert `GET /api/v2/item_upload/items/{id}` lesend mit Kategorie, Marke, Farben,
  Paketgröße, Beschreibung, Preis und Merkmalen (geprüft: Status 200 und Feldnamen, keine Werte).

**Änderung Worker:** Der Leser nimmt die Kennung der Kategorie aus dieser Schnittstelle und die
Bezeichnung aus dem sichtbaren Feld. Die Prüfung „Kategorie unverändert“ beim Lesen der
Merkmale fragt dieselbe Quelle. Das Erstellen eines Inserats bleibt unverändert beim Popup. Die
Testseiten bilden die gemessene Maske nach.

**Änderung Oberfläche:** Die Bearbeitung öffnet sofort mit gespeichertem Titel, Preis,
Beschreibung und Fotos im Aufbau der Erstellen-Maske (Fotos zuerst, Texte, Artikelangaben; rechts
Preis und Paketgröße). Der Vinted-Stand wird im Hintergrund gelesen; Speichern ist erst danach
möglich. Eingaben während des Ladens bleiben erhalten. Fotos und Kategorie bleiben bei Vinted
unverändert.

**Einschränkungen:** Ob die übrigen Auswahllisten (Marke, Größe, Zustand, Farbe, Material) an der
echten Bearbeitungsmaske markiert sind, zeigt erst der nächste Lauf; dafür läuft die Beobachtung
auf dem Server bis zum Nachmittag weiter (`/root/juna-edit-*`). Die Oberfläche wurde nicht im
Browser angesehen (lokal keine angemeldete Datenbank), aber mit echtem Template gerendert und auf
Barrierefreiheit geprüft.

**Prüfungen:** 633 Worker-Prüfungen, 43 Browserfälle der Inserate mit einem neuen (fremdes oder
unlesbares Inserat scheitert am Kategorie-Schritt), neun Komponentenfälle mit drei neuen, Typen,
ESLint, Prettier, Shared-UI-Prüfung und Bau grün.

**Als Nächstes:** Vollständige Angaben über dieselbe Schnittstelle beim Synchronisieren
mitspeichern, damit die Maske ohne Wartezeit gefüllt ist.

## 2026-10-12 – Juna – Reine Worker-Änderungen ohne Anwendungstests und Web-Release

**Auftrag (Nutzer, 12.10.):** Die Wartezeit je PR ist zu lang; Prüfungen, die nicht jedes Mal
nötig sind, gezielter auslösen. Außerdem künftig größere statt vieler kleiner PRs.

**Befund:** Bei den reinen Worker-PRs vom 11./12.10. liefen jedes Mal die Angular-Tests (bis 8,5
Minuten) und der Browser-Smoke (10 bis 13 Minuten), obwohl beide den Worker nicht prüfen. Die
Änderungserkennung stufte alles außer Doku und Deal-Monitor als Anwendungsänderung ein. Typen,
633 Tests und Bau des Workers laufen ohnehin in jedem Lauf im Qualitäts-Job, sein Abbild im
eigenen Workflow. Nach dem Merge wurde zusätzlich jedes Mal die Web-Anwendung neu gebaut und
ausgeliefert.

**Änderung:** Pfade unter `services/marketplace-worker/` zählen nicht mehr als Anwendungs- und
Release-Änderung. Ausgenommen sind die Dateien, die Anwendungstests, E2E-Tests oder die
Erweiterung einbinden (die beiden Vertragsdateien und `test/fixtures/`). Gemischte Änderungen
bleiben im vollen Umfang.

**Bewusst nicht geändert:** Die Worker-Abbilder werden weiterhin nur von Hand aus `master`
veröffentlicht. Ein automatischer Bau nach dem Merge war vorbereitet, widerspricht aber dem
Vertragstest „nur manuelles master darf Registry-Schreibrechte erhalten“ und wurde verworfen.
Aus demselben Grund gibt es keine Auslieferung aus einem Zweig. Der Browser-Smoke läuft bei
Oberflächenänderungen unverändert.

**Prüfungen:** Neuer Fall der Änderungserkennung (reine Worker-Pfade, geteilte Dateien, gemischte
Pfade), Pflichtprüfung für Worker-PR und Worker-Merge durchgespielt, 282 Workflow-Prüfungen,
Format und ESLint grün. Dieser PR selbst läuft noch im vollen Umfang, weil er die Erkennung
ändert.

## 2026-10-12 – Juna – Aufräumen überdeckte die Ursache gescheiterter Inseratabrufe

**Befund nach PR 385:** Der nächste Klick auf „Bearbeiten“ protokollierte
`detail: "Error: Sitzungszugriff verweigert"` – ohne Abschnitt. Der Fehler entsteht also im
Aufräumen: Scheitert eine Aktion, beendet der Sitzungsbroker die Sitzung selbst. Die Route
schließt sie danach im `finally` noch einmal, der Broker lehnt das ab, und diese Ablehnung
ersetzt die eigentliche Ursache. Darum gingen seit PR 375 der Schritt des Lesers und die
Fehlerart verloren, obwohl beides gemeldet wurde. Die Tests bemerkten es nicht, weil ihr
Stellvertreter des Brokers ein zweites Schließen immer annahm.

**Änderung:** Alle sechs Aufräumstellen der Browser-Routen verwenden `closeAfterFailure`: Das
Schließen nach einem Abbruch darf scheitern, ohne die Ursache zu ersetzen. Der Stellvertreter im
Test verhält sich jetzt wie der echte Broker und lehnt das Schließen einer beendeten Sitzung ab.

**Prüfungen:** Der vorhandene Fall „nennt den gescheiterten Schritt“ ist mit dem ehrlichen
Stellvertreter ohne die Änderung rot (Antwort „Browsersitzung nicht verfügbar“) und mit ihr grün;
633 Worker-Prüfungen, Typen, Format und ESLint grün.

**Offen:** Ausliefern und erneut klicken; dann steht der Schritt des Lesers im Protokoll.

## 2026-10-12 – Juna – Abbruch beim vollständigen Lesen eines Inserats eingrenzen

**Ergebnis der Nacht:** 102 Abrufe beider Cloud-Konten ohne Fehler, 25 Erneuerungen der
Anmeldung in höchstens 1,2 Sekunden, kein Fehlstart. Die Beobachtung ist beendet, ihre Dateien
sind vom Server gelöscht.

**Auftrag:** Bearbeiten eines Inserats fällt weiter auf die Maske mit Titel, Beschreibung und
Preis zurück („Vinted hat nicht alle Angaben dieses Inserats geliefert“).

**Befund:** Die Browsersitzung des vollständigen Lesens lief am 12.10. um 09:40 Uhr 10,5
Sekunden und endete mit `reason: failed`. Der Leser selbst meldete weder einen festen Schritt
noch eine Fehlerart – beides wird seit PR 377 und 379 protokolliert. Der Abbruch liegt also
außerhalb des Lesers: beim Öffnen, beim Kontoeintrag, bei der Bestätigung nach dem Lesen oder
beim Schließen der Sitzung. Welcher Abschnitt es ist, ließ sich aus Code und Daten nicht sicher
ableiten.

**Änderung:** Die Route `content/read` hält ihren Abschnitt fest (öffnen, Eintrag, lesen,
bestätigen, schließen). Das Protokoll eines unerwarteten Abbruchs nennt zusätzlich die
Fehlerklasse, bei beendeter Sitzung deren festen Grund und die geprüfte Kurzbeschreibung aus
reinen Wörtern. Am Verhalten ändert sich nichts.

**Prüfungen:** 633 Worker-Prüfungen mit zwei neuen Fällen (Abbruch beim Schließen und bei der
Bestätigung nach dem Lesen, ohne privaten Text), Typen, Format und ESLint grün.

**Offen:** Ausliefern, dann ein weiterer Klick auf „Bearbeiten“.

## 2026-10-11 – Juna – Kontenschild zeigt den Abrufzustand statt immer „Verbunden“

**Auftrag (Nutzer, 11.10.):** Auf der Kontenseite steht grün „Verbunden“, während das Postfach
einen Abruffehler meldet. Das verwirrt.

**Befund:** Es sind zwei getrennte Werte. „Verbunden“ ist der Status der Verbindung und wird nur
bei der Anmeldung gesetzt. Ein gestörter Abruf steht am Zeitplan des Kontos. Am 11.10. stand der
Zeitplan beider Konten auf „Anmeldung nötig“, die Verbindung aber weiter auf „verbunden“.

**Änderung:** Das Schild eines Cloud-Kontos zeigt den schlechteren der beiden Zustände: „Abruf
wartet“ (gelb), „Abruf angehalten“ (gelb), „Anmeldung erforderlich“, „Prüfung erforderlich“
oder „Abruf abgelehnt“ (rot). Ohne Störung bleibt es bei „Verbunden“. Eine bewusst pausierte
Automatik gilt nicht als Störung. Der Abrufzustand wird über die vorhandene Lesefunktion je
verbundenem Cloud-Konto geladen und mit jeder Aktualisierung der Kontenliste erneuert; ohne
Verwaltungsrecht oder bei einem Lesefehler bleibt das bisherige Schild. Lokale Konten und die
Auswahlliste im Postfach sind unverändert.

**Einschränkung:** Nicht im Browser angesehen, weil die Seite eine angemeldete lokale Datenbank
braucht, die hier nicht lief. Abgesichert über Komponententest mit echtem Template.

**Prüfungen:** Kontenkarte mit neuem Fall, neuer Dienst mit drei Fällen (27 Angular-Fälle),
Darstellung mit drei Fällen, Typen, ESLint, Prettier, Shared-UI-Prüfung, Suite-Audit und Bau grün.

## 2026-10-11 – Juna – Gescheiterten Browserstart einmal wiederholen und einordnen

**Auftrag:** „Browser-Sitzung nicht verfügbar“: Am 11.10. scheiterte der Start des Cloud-Browsers
zweimal nach rund drei Sekunden (12:43 und 17:41 Uhr), der jeweils nächste Versuch klappte. Der
Grund wurde nirgends festgehalten.

**Befund:** Der Container-Starter protokolliert eigene Startfehler, hat zu diesen Zeiten aber
nichts gemeldet. Der Browser lief also; gescheitert ist danach das erste Laden der
Vinted-Startseite. In einer Aufzeichnung derselben Sitzungen lehnte die Cloud-IP einzelne
Verbindungen ab (`ERR_TUNNEL_CONNECTION_FAILED`). Dass genau das der Auslöser war, ist eine
begründete Vermutung, kein Nachweis.

**Änderung:** Schlägt das erste Laden der Startseite fehl, wird es nach 1,5 Sekunden einmal im
selben Browser wiederholt. Scheitert auch das, steht im Protokoll neben `browser_start` jetzt der
Abschnitt (Netz, Start oder Startseite) und eine feste Kurzbeschreibung aus reinen Wörtern, etwa
„Startseite nicht geladen tunnel connection failed“. Adressen, Meldungstexte und Zugangsdaten
gelangen weiterhin nicht ins Protokoll. Ein gescheiterter Containerstart wird nicht wiederholt.

**Prüfungen:** 631 Worker-Prüfungen mit fünf neuen Fällen (zweiter Versuch gelingt; zweimal
gescheitert meldet nur Abschnitt und geprüfte Kurzbeschreibung; Containerstart ohne Wiederholung
und ohne privaten Text; Weitergabe durch den Sitzungsbroker; Kurzbeschreibungen), Typen, Format
und ESLint grün. Am echten Server zeigt es sich erst beim nächsten Fehlstart.

## 2026-10-11 – Juna – Automatik hält nicht mehr nach einer einzelnen Ablehnung an

**Auftrag:** Zweite Absicherung für die Vinted-Cloud-Konten: Ein einzelner Ausrutscher bei der
Anmeldung soll niemanden mehr zur Neuanmeldung zwingen.

**Befund nach PR 381:** Die erste Erneuerung mit dem neuen Stand dauerte 0,4 Sekunden statt 61
(Aufzeichnung vom 11.10., 19:25 Uhr); seitdem kein fehlgeschlagener Abruf. Unabhängig davon hielt
`marketplace_sync_finish` die Automatik bisher schon nach der ersten nicht bestätigten Anmeldung
an und entzog die Freigabe.

**Änderung:** Die ersten beiden nicht bestätigten Anmeldungen in Folge lassen den Zeitplan aktiv;
der nächste reguläre Abruf versucht es erneut. Erst die dritte beendet die Freigabe wie bisher.
Die Warnung bleibt in der Zwischenzeit gesetzt, daher warten Cloud-Nachrichten und Favoriten so
lange. Die Oberfläche zeigt dann „Abruf wartet“ mit dem Hinweis, dass der nächste Abruf es
automatisch erneut versucht, statt zur Anmeldung aufzufordern. Andere Gründe (Ablehnung durch
Vinted, Prüfung, entzogene Rechte) halten weiterhin sofort an.

**Einschränkung:** Lokal lief keine Datenbank. Die Migration ist deshalb von Hand aus der
Schemadatei übernommen (identischer Funktionstext) statt mit `supabase db diff` erzeugt, und die
neuen Datenbankfälle laufen erst im PR.

**Prüfungen:** Oberflächentest des Zeitplans mit neuem Fall (17 Fälle), Typen, ESLint, Prettier,
Migrations- und Paketprüfungen grün; Datenbanktests im PR.

## 2026-10-11 – Juna – Während Vinteds Erneuerung nichts abfragen

**Auftrag:** Nach PR 380 liefen beide Cloud-Konten wieder, ohne neue Anmeldung. Die Erneuerung
bei „Maike Vintage“ dauerte aber erneut rund eine Minute. Das soll nicht der Normalfall sein.

**Befund (Aufzeichnung der Sitzung auf dem Server, nur Adressen, Status und Zeiten):** Vinteds
Erneuerungsseite war nach 1,7 Sekunden geladen. 0,4 Sekunden später fragte Flipbase das Konto ab
und bekam eine Ablehnung. Erst 61 Sekunden nach dem Laden schickte die Seite ihren
Erneuerungsaufruf (`/web/api/auth/refresh`), der sofort klappte. Ohne Anmeldung startet dieselbe
Seite den Aufruf nach gut einer Sekunde. Ob die abgelehnte Abfrage die Wartezeit auslöst, ist
nicht bewiesen; ohne Anmeldung lässt es sich nicht nachstellen.

**Änderung:** Steht der Browser auf der Erneuerungsseite, wartet der Kontoabruf zuerst auf deren
Ende und fragt erst danach ab. Die Kontoprüfung der Anmeldesitzung meldet in dieser Zeit „noch
nicht bestätigt“, ohne Vinted abzufragen. Das ist ein gezielter Versuch: Bleiben die nächsten
Erneuerungen bei einer Sekunde, war die eigene Abfrage der Auslöser.

**Prüfungen:** Der Browserfall zur Erneuerung prüft jetzt zusätzlich, dass währenddessen keine
Abfrage abgelehnt wird (ohne die Änderung rot); 626 Worker-Prüfungen, neun Browserfälle, Typen,
Format und ESLint grün.

**Offen:** Die nächsten Erneuerungen in der Aufzeichnung auswerten; danach Beobachtung und
Skripte `/root/juna-*` vom Server entfernen.

## 2026-10-11 – Juna – Konten galten als abgemeldet, obwohl Vinted nur langsam erneuerte

**Auftrag:** Auch nach PR 378 meldete Flipbase ein Cloud-Konto als abgemeldet, und die
Anmeldung zeigte erneut Vinteds Erneuerungsseite. Alles andere ist zurückgestellt, bis Anmeldung
und Sitzung stabil laufen.

**Befund (Browserverlauf der Profile, Abrufe und laufende Sitzung auf dem Server):**

- Vinteds Zugang gilt 60 Minuten. Danach leitet Vinted auf `/session-refresh` um. Meist ist die
  Erneuerung nach einer Sekunde fertig. In der Anmeldesitzung vom 11.10. um 17:42 Uhr dauerte sie
  61 Sekunden und endete von selbst mit gültiger Anmeldung – ohne Eingabe von Zugangsdaten.
- Flipbase gab bis mittags nach gut zwei, seit PR 378 nach 25 Sekunden auf, markierte das Konto
  als abgemeldet und pausierte die Automatik. Das Konto war bei Vinted aber nicht abgemeldet.
- Die Automatik wird schon nach einer einzigen Ablehnung angehalten und läuft erst nach einer
  neuen Anmeldung weiter.
- Zweimal am Tag scheiterte der Start des Browsers nach drei Sekunden ohne festgehaltenen Grund
  („Browser-Sitzung nicht verfügbar“).
- Warum die Erneuerung manchmal eine Minute braucht, ist noch nicht geklärt. Auf dem Server
  läuft dafür bis zum 12.10. eine reine Beobachtung neuer Browsersitzungen
  (`/root/juna-renewal-watch.log`, `/root/juna-container-events.log`): nur Adresse ohne
  Parameter, Methode, Status und Zeit sowie die Endcodes der Container.

**Änderung:** Die Wartefunktion liegt jetzt in `vinted-session-renewal.ts` und wartet bis zu
120 Sekunden. Neben dem Kontoabruf beginnen auch alle übrigen Aktionen (Inserat lesen, speichern
und veröffentlichen, Nachrichten, Angebote, Favoriten, Profil) erst, wenn keine Seite des
Browsers mehr erneuert. So löst eine zweite Seite keine zweite Erneuerung mit derselben
abgelaufenen Anmeldung aus.

**Prüfungen:** 626 Worker-Prüfungen mit drei neuen Fällen, neun Browserfälle zur Sitzung
einschließlich eines neuen, Typen, Format und ESLint grün.

**Offen:** Automatik nicht schon nach der ersten Ablehnung anhalten; Grund des gescheiterten
Browserstarts festhalten und den Start einmal wiederholen; Hinweis in der Anmeldung, solange
Vinted erneuert; Ursache der langsamen Erneuerung aus der Beobachtung ableiten.

## 2026-10-11 – Juna – Unerwartete Abbrüche beim Lesen eines Inserats einordnen

**Befund:** Nach PR 377 scheiterten am echten Konto sowohl das vollständige Lesen
(nach rund 10 Sekunden) als auch die einfache Bearbeitung (nach rund 30 Sekunden)
weiter ohne Schritt. Es ist also kein Fehler der Leseschritte, sondern ein
unerwarteter Abbruch im getrennten Browser oder im Worker, dessen Art bisher
nirgends festgehalten wird.

**Abmeldungen, lesend untersucht:** „Maike Vintage“ wurde am 11.10. zwischen 08:50
und 09:05 Uhr abgemeldet, „Wiehen Store“ zwischen 09:36 und 09:50 Uhr. Zu beiden
Zeitpunkten gab es keinen Worker-Neustart. Die Anmeldecookies von „Maike Vintage“
wurden um 08:04 Uhr von Vinted erneuert, sauber gespeichert und funktionierten
noch dreimal; ein verlorener Cookie-Stand scheidet damit aus. Die Sitzung wurde
bei Vinted beendet. Ursache offen; Rückfrage an den Nutzer zu Anmeldungen oder
Kontowechseln in der Vinted-App zu diesen Zeiten.

**Änderung:** Ein unerwarteter Abbruch meldet seine Fehlerart und, nur wenn sie aus
gewöhnlichen Wörtern besteht, die feste eigene Meldung. Meldungen mit Ziffern,
Adressen, Sonderzeichen oder schlüsselartigen Wörtern entfallen; die Prüfung läuft
auf beiden Seiten der Übertragung. Der Worker protokolliert die Einordnung als
`marketplace_listing_read_detail` mit Herkunft Browser oder Worker.

**Prüfungen:** 623 Worker-Prüfungen einschließlich der Fälle, die Adressen,
Selektoren und Schlüssel abweisen; Gesamttest der Übertragung; Typen, Format und
ESLint grün.

## 2026-10-11 – Juna – Vinteds Anmelde-Erneuerung nicht mehr unterbrechen

**Auftrag:** Die Cloud-Konten werden immer wieder von Vinted abgemeldet. Das soll
ohne Zutun des Nutzers stabil laufen.

**Befund:** Die Abbrüche der letzten zwölf Tage stehen in der Datenbank auch
nachts, also ohne fremde Anmeldung. Die Zeitpunkte passen zu Vinteds stündlicher
Erneuerung der Anmeldung: rund eine Stunde nach der letzten Erneuerung folgt die
Ablehnung. Mit abgelaufener Anmeldung steht der Browser auf Vinteds eigener
Erneuerungsseite `/session-refresh`. Der Kontoabruf bekam dort eine Ablehnung,
lud sofort die Startseite neu und gab nach gut zwei Sekunden auf; danach wurde
der Browser geschlossen. Die laufende Erneuerung wurde so abgebrochen, die
gespeicherte Erneuerung war verbraucht und die neue Anmeldung nie gespeichert.
Das ist die wahrscheinliche Ursache, am echten Vinted aber noch nicht bewiesen.

**Änderung:** Steht der Browser auf der Erneuerungsseite, lädt der Kontoabruf
nicht mehr neu, sondern wartet bis zu 25 Sekunden auf deren Ende und prüft erst
dann die Anmeldung. Das gilt auch, wenn erst das bisherige Neuladen dort landet.
Nur wenn die Seite in dieser Zeit nicht fertig wird, gilt die Anmeldung als
abgelehnt.

**Prüfungen:** Zwei neue Browserfälle (Erneuerung nach vier Sekunden wird
abgewartet und nicht unterbrochen; unfertige Erneuerung endet erst nach der
Wartezeit als abgelehnt), ohne die Änderung rot, mit ihr grün; die sechs
vorhandenen Fälle zur Sitzungswiederherstellung, die Worker-Prüfungen, Typen,
Format und ESLint grün.

**Offen:** Worker-Image bauen und ausliefern, danach die Abrufe über mehrere
Stunden beobachten.

## 2026-10-11 – Juna – Leser-Schritt ging im Sitzungsbroker verloren

**Befund:** Auch nach PR 375 meldete der Server beim Bearbeiten eines echten
Inserats nur `reason: failed`. Die gesamte Übertragung zwischen Worker und
getrenntem Browser läuft lokal fehlerfrei; ein neuer Gesamttest belegt das. Der
Schritt ging im Sitzungsbroker verloren: `run` ersetzt jeden Fehler der Aktion
durch „Sitzung unterbrochen“. Der regelmäßige Abruf zeigte außerdem, dass Vinteds
Inseratliste weder Kategorie, Farben, Material, Paketgröße noch Kennungen oder
die Beschreibung mitliefert.

**Änderung:** Die Routen zum Lesen eines Inserats halten den festen Schritt fest,
bevor der Broker den Fehler ersetzt, und melden ihn danach. Das Verhalten des
Brokers bleibt unverändert.

**Folge für die Planung:** „Bearbeiten“ kann nicht allein aus dem regelmäßigen
Abruf befüllt werden. Die fehlenden Angaben müssen einmal je Inserat aus der
Bearbeitungsmaske gelesen und gespeichert werden.

**Prüfungen:** 616 Worker-Prüfungen einschließlich eines Falls mit einem Broker,
der Fehler wie der echte ersetzt; vier Browserfälle einschließlich der gesamten
Übertragung; Typen, Format und ESLint grün.

## 2026-10-11 - Juna - Verlängerung von Cloud-IPs an die Nutzung koppeln

**Auftrag:** Nach dem ersten echten IP-Kauf klären, ob sich die Verlängerung per Schnittstelle
steuern lässt, und umsetzen: freigegebene IPs nicht mehr verlängern, wiederverwendete wieder
verlängern.

**Befund:** Kauf über die hinterlegte PayPal-Zahlungsart und Cloud-Wechsel von „Wiehen Store“
haben geklappt (Bestellung 84994098, 4 USD). Der Anbieter meldet für beide IPs eine aktive
Verlängerung, obwohl Flipbase beim Kauf `auto_extend: false` sendet. Die Schnittstelle bietet
`POST /orders/toggle-auto-extend`, aber keine sofortige Kündigung. Weitere Funde aus dem
Live-Test, noch nicht behoben: Direkt nach dem Kauf erscheint ein IP-Prüffehler, weil die frische
IP zu früh geprüft wird; ein zweiter Klick übernimmt sie ohne neuen Kauf. Der erste Start des
Cloud-Browsers bricht sporadisch im Schritt nach dem Chrome-Start ab, ohne dass der Worker den
Grund festhält; Container, IP und Seitenauswahl waren im Einzeltest in Ordnung.

**Änderung:** Neuer, getrennt einschaltbarer Abgleich im Worker (`IPROYAL_RENEWAL_MANAGED`,
Standard aus). Er liest den Stand beim Anbieter und schaltet die Verlängerung nur für
Bestellungen aus dem Flipbase-Bestand um; unklare oder fremde Bestellungen bleiben unberührt.
Neue IPs werden bewusst mit Verlängerung bestellt. Die Dokumentation behauptet nicht mehr,
die Verlängerung sei aus. In den Kontoeinstellungen steht unter „Verbindung“ je Betriebsart ein
Wechsel: lokale Konten „Auf Cloud wechseln“, Cloudkonten „Auf lokale Verbindung umstellen“ mit
Rückfrage zur auslaufenden IP sowie „Erneut bei Vinted anmelden“. „Cloud-IP einrichten“ entfällt
dort; ältere Cloudkonten ohne IP-Zuordnung gibt es im Bestand nicht mehr.

**Prüfung:** Worker-Testlauf ohne Fehlschlag, Typprüfung des Workers. 23 Angularprüfungen der
Kontokarten einschließlich AXE für die neue Rückfrage, Typprüfung, Lint, Format und
Produktionsbau. Keine Sichtprüfung im Browser. Kein echter Aufruf zum Umschalten und keine
produktive Aktivierung.

**Offen:** Erster echter Umschaltaufruf (geplant mit dem dritten Konto) und Anbindung der
Abo-Kündigung.

## 2026-10-11 – Juna – Leser-Diagnose erweitern und Inseratfelder mitlesen

**Befund:** Seit PR 373 erreicht das vollständige Bearbeiten den Server. Der Leser
lief am echten Inserat rund elf Sekunden und scheiterte mit `reason: failed` ohne
Schritt, also außerhalb der bisher erfassten Leseschritte. In der Datenbank
liegen je Inserat nur Titel, Preis, Fotos sowie Marke, Größe und Zustand als
Text; Kategorie, Farben, Material, Paketgröße und alle Kennungen fehlen.

**Nutzerentscheidung vom 11.10.2026:** „Bearbeiten“ soll sofort dieselbe Maske wie
„Inserat erstellen“ öffnen, befüllt aus gespeicherten Daten; geladen wird erst
beim Speichern. Die Maske soll nur Werte anbieten, die Vinted kennt, und die
Fotobox nach oben bekommen.

**Änderung:** Die Diagnose meldet zusätzlich die Schritte Reservierung,
Rechteprüfung und Abschlussprüfung, sodass kein Abbruch des Lesers mehr ohne
Schritt bleibt. Der Abruf meldet außerdem die Feldnamen des ersten Inserats aus
Vinteds Liste (bis zur zweiten Ebene, niemals Werte) als
`marketplace_publication_fields`, um zu klären, welche Angaben der regelmäßige
Abruf künftig mitspeichern kann.

**Prüfungen:** 615 Worker-Prüfungen, sieben Browserfälle für Lesen und Ändern,
Typen, Format und ESLint grün.

## 2026-10-11 - Juna - Vinted Kleiderschrank & Performance-Statistiken

**Auftrag:** Die Vinted-Inserateseite wie gewünscht und am Mockup ausgerichtet in „Kleiderschrank“ umbenennen und eine Performance-Kurve für Aufrufe und Favoriten mit Zeitachsen-Filtern (24 Stunden, 7 Tage, 30 Tage) und Ausblend-Möglichkeit exakt nach Vorlage integrieren.

**Befund:** Die Seite hieß bisher „Inserate“, was zu Verwechslungen mit „Inserat erstellen“ führte. Zudem fehlte eine visuelle Verlaufsanzeige zur Erkennung von Spitzenzeiten (z. B. Sonntagabend).

**Änderung:**

1. **Umbenennung:** Navigation (`vinted-workspace-navigation.ts`), Seitenkopf (`vinted-workspace.component.ts`), Detailansicht und Übersichts-Kacheln auf „Kleiderschrank“ umgestellt. Die mobile Leiste (`bottom-nav.component.ts`) behält das kompakte Label „Inserate“ mit Textkürzung (`truncate`) und Overflow-Schutz, um Viewport-Überläufe auf extrem schmalen Bildschirmen (320px) sicher zu verhindern.
2. **Performance-Kurve & KPIs:** Neue Komponente `VintedWardrobeStatisticsComponent` erstellt:
   - Obere KPI-Karten für Aufrufe (türkis mit Auge) und Favoriten (korallfarben mit Herz).
   - Zeitfenster-Umschalter für `24 Stunden`, `7 Tage` und `30 Tage`.
   - Umschalter `Diagramm ausblenden / einblenden` mit Schalter.
   - Glatte kubische Bézier-Kurven für Aufrufe und Favoriten mit dezentem Farbverlauf nach unten.
   - Interaktiver Hover- und Tastaturfokus mit Tooltip (`Sonntag: 128 Aufrufe, 24 Favoriten`) und Leitlinie.
   - Automatische Spitzenzeiten-Erkennung (`Beste Zeit: Sonntag 19–22 Uhr`).
   - Barrierefreie Datentabelle für Bildschirmleser (WCAG AA).
3. **Integration & Responsiveness:** Komponente in `VintedListingsComponent` eingebunden. Responsive Absicherung für 320px-Viewports: 2-Spalten-Raster für KPI-Karten, Textkürzung (`truncate`) mit `min-w-0`, `overflow-hidden` und `max-w-full` auf Host- und Kartenebene, Kapselung der barrierefreien Screenreader-Tabelle in einem geschützten `sr-only`-Block-Container zur Verhinderung von Tabellenbreiten-Überläufen sowie detaillierte Elementdiagnose in `checkSurface`.

**Prüfung:**

- Unit-Tests: 86 Dateien / 971 Tests in `marketplaces` (einschließlich 5 neuer Komponententests und 3 Modelltests) sowie mobile Navigationsprüfung bestanden.
- TypeScript `typecheck`, ESLint und Prettier ohne Beanstandungen.
- Angular Produktionsbau (`ng build`) erfolgreich abgeschlossen.

## 2026-10-11 – Juna – Vollständiges Bearbeiten erreichte den Server nicht

**Befund:** Am echten Konto erschien statt des vollständigen Formulars immer der
Rückfall auf Titel, Beschreibung und Preis. Im Worker-Protokoll stand dazu trotz
neuer Diagnose nichts: Die Anfrage wurde nie gesendet. Die App verlangte vorab die
Vinted-Kennung des Inserats, die Datenbank liefert diese für Inserate aber nicht
an die App aus (nur für Nachrichten). Die Testdaten enthielten die Kennung,
deshalb blieb der Fehler in den Prüfungen unbemerkt.

**Änderung:** Die App verlangt die Kennung nicht mehr. Welches Vinted-Inserat zum
Eintrag gehört, bestimmt allein der Server aus dem eigenen Kontoeintrag; die App
prüft weiterhin das Konto und die Form der Antwort. Der Browsertest der
Detailseite arbeitet jetzt wie die Produktion ohne Kennung in den Inseratdaten.

**Prüfungen:** 129 Angular-Fälle (Schnittstelle, Detailseite, Store), Typen, Bau,
Format und ESLint grün; alle sechs Browserfälle der Detailseite lokal grün.

## 2026-10-11 – Juna – Diagnose für das Lesen bestehender Inserate

**Anlass:** Nach dem Einschalten von `MARKETPLACE_CHROMIUM_WRITES_ENABLED` und
`MARKETPLACE_LISTING_PUBLISH_ENABLED` auf dem Server (Nutzerfreigabe vom
10.10.2026) scheiterte „Bearbeiten“ an einem echten Inserat. Ein Versuch fiel in
einen Browserstart-Fehler um 23:44–23:59 Uhr, ein weiterer brach nach 21 Sekunden
im Cloud-Browser ab. Der Server protokollierte dazu nichts; die Browsersitzung
schreibt kein Protokoll, und der Reverse-Proxy nur Fehler ab 5xx.

**Änderung:** Das Lesen der Bearbeitungsmaske meldet bei einem Abbruch nur den
festen Schritt (Navigation, Formular, Konto, Werte, Fotos, Kategorie, Merkmale,
Veränderung, Prüfung). Der Schritt übersteht den getrennten Browser, wird vom
Worker als `marketplace_listing_request_failed` mit Route und Grund protokolliert
und in der Antwort genannt. Keine Seiteninhalte, Kennungen oder Anbieterantworten.
Ein Rechteverlust bleibt als solcher erkennbar.

**Nebenbefund:** Die Server-Sitzung überstand die normale Nutzung der Handy-App
(sieben fehlerfreie Abrufe von 21:58 bis 23:29 Uhr). Nach einem gescheiterten
Browserstart startete der Worker zehnmal neu, bevor er stabil lief.

**Prüfungen:** 612 Worker-Prüfungen, die Browserfälle für Lesen und Ändern, Typen,
Format und ESLint grün. Serverzugriffe zur Ursachensuche ausschließlich lesend.

## 2026-10-10 - Juna - Alte ungeklärte Nachrichten sperren den Cloud-Wechsel nicht mehr

**Auftrag:** Stand der IPRoyal-Nachbuchung prüfen und klären, warum „Auf Cloud wechseln“
sofort mit „Die Cloud-IP-Verfügbarkeit konnte nicht geprüft werden“ abbricht.

**Befund:** Nachbuchung, Preisgrenze 8 USD und PayPal-Zahlungsart sind im laufenden Worker
aktiv; Bestandsabgleich, Preisangebot (4 USD) und Zahlungsart wurden ausschließlich lesend
bestätigt. Keine Bestellung und keine Kaufabsicht entstanden. Die Datenbank lehnte den Wechsel
von „Wiehen Store“ mit „Laufende oder ungeklärte Aktion verhindert den Wechsel“ ab: zwei lokale
Nachrichten vom 05.10.2026 stehen auf `outcome_unknown` mit `login_required`. Die Erweiterung
ist nicht mehr verknüpft, die Nachrichten ließen sich also nicht mehr klären. Der Worker meldet
jede Ablehnung pauschal als IP-Prüffehler.

**Änderung:** Nach Entscheidung des Nutzers sperrt nur noch ein gerade laufender Versand
(`claimed`, `sending`) den Wechsel. Abgelaufene Versandversuche werden vor der Prüfung wie beim
normalen Nachrichtenabruf als unklar beziehungsweise wartend eingeordnet. Alte unklare
Nachrichten bleiben unverändert im Verlauf und werden nicht in der Cloud wiederholt. Ungeklärte
Abrufe und Aufträge (`marketplace_operations`) blockieren weiterhin. Der automatische Abgleich
lieferte fremde Altabweichungen; die Migration enthält nur die drei betroffenen Funktionen.
Der Worker meldet eine Sperre durch eine laufende Aktion jetzt getrennt vom IP-Prüffehler
(`cloud_switch_blocked`), ohne Datenbanktexte weiterzugeben; die App zeigt dafür einen eigenen
Text. Scheitert „Auf Cloud wechseln“ ohne offenen Dialog, erscheint der Hinweis als bleibender
Fehler-Toast statt als Balken in voller Breite; ein neuer Versuch ersetzt den alten Toast.
Hinweise in einem offenen Dialog bleiben dort.

**Prüfung:** Der angepasste Test scheitert an der bisherigen Regel mit genau dieser Meldung.
Nach vollständiger Migrationswiederholung bestehen 282 Prüfungen in sechs Datenbanktestdateien
(Cloud-Einrichtung, IP-Nachbuchung, lokaler und Cloud-Nachrichtenversand, Wiederholung,
Schreibpausen). Datenbanktypen lokal neu erzeugt. Neun Workerprüfungen und 48 Angularprüfungen
der betroffenen Dateien bestehen; Typprüfung, Format/Lint und Angular-Produktionsbau erfolgreich.
Der Browsertest zum gescheiterten Wechsel lief lokal nicht, weil ein Testserver der Suite nicht
startete. Kein echter Kauf, kein Schreibzugriff auf Produktionsdaten.

**Offen:** Erster echter Kauf über PayPal. Die genauere Workermeldung wirkt erst nach
Auslieferung eines neuen Worker-Images; bis dahin zeigt die App weiter den pauschalen Text.

## 2026-10-10 - Juna - Vinted-Karten exakt an Vorlage angleichen

**Auftrag:** Kritik des Nutzers umsetzen: Einstellungs-Zahnrad oben rechts bündig auf Höhe des Namens positionieren, Kartenfooter mit dezent abgesetztem Hintergrund und gleichmäßig aufgeteilten Buttons ausstatten sowie die maximale Kartenbreite begrenzen, damit die Karten nicht übermäßig breit gezogen werden.

**Umsetzung:**

1. **Einstellungs-Button oben rechts:** Die Kopfzeile richtet sich nun per `items-start` aus; das Zahnrad-Icon ist mit `-mt-0.5 -mr-1` bündig an der Oberkante des Namens und des Avatars platziert statt vertikal zentriert zwischen zwei Textzeilen zu hängen.
2. **Abgesetzter Footer:** Der Aktionsbereich ist nun als echter Kartenfooter mit `border-t border-fb-line bg-fb-subtle/50 px-3.5 py-2.5 sm:px-4 sm:py-3` abgesetzt.
3. **Gleichmäßige Button-Aufteilung:** Buttons nutzen `[fullWidth]="true"` und `class="flex-1 min-w-0"`. Ein einzelner Button (wie „Synchronisieren“ bei Cloud) füllt die volle Breite; zwei Buttons (wie bei lokalem Modus) teilen sich die Fläche gleichmäßig 50/50 mit `gap-2`.
4. **Begrenzte Kartenbreite:** Das Raster begrenzt die Spaltenbreite auf maximal `21.5rem` (`max-w-[21.5rem]`, ~344px), wodurch die Karten kompakt und formschön bleiben.

**Prüfung:** Unit-Tests (22/22), Prettier, Angular-Entwicklungsbuild erfolgreich.

## 2026-10-10 – Juna – Angebotsstatus für Cloud-Konten

**Befund:** Im Postfach eines Cloud-Kontos blieb ein abgelehntes eigenes Angebot
ohne Status. Den Stand eines Angebots (offen, angenommen, abgelehnt, abgebrochen)
übernahm bisher nur die lokale Erweiterung; der Server-Abruf ließ das Feld weg.
PR #356 ist gemergt, ein offener Zweig dazu existiert nicht. Kaufen als Käufer
war dort ausdrücklich ausgenommen und bleibt es.

**Änderung:** Der Server-Abruf liest den Status mit derselben Zuordnung wie die
Erweiterung, nur an Angebotsnachrichten. Die Anzeige im Postfach zeigt ihn als
Status-Baustein: angenommen grün, abgelehnt rot, sonst neutral. In der
Produktionsdatenbank lesend geprüft: Angebotsnachrichten tragen eine eigene
Kennung, ein späterer Abruf überschreibt also dieselbe Nachricht.

**Prüfungen:** 611 Worker-Prüfungen, 54 Postfach-Komponentenfälle, Typen, Bau,
gemeinsame UI-Prüfung, Format und ESLint grün. 14 Postfach-Browserfälle lokal
grün, Screenshot angesehen. Vier Verhandlungs-Browserfälle schlagen lokal mit
und ohne diese Änderung fehl. Der Worker auf dem Server wurde auf `3e75483d`
aktualisiert; die Neuanmeldung des Kontos hat danach funktioniert.

**Offen:** Ändert Vinted beim Ablehnen den Änderungszeitpunkt des Gesprächs
nicht, erscheint der neue Status erst beim Öffnen des Gesprächs. Wirkt erst
nach erneuter Aktualisierung des Workers.

## 2026-10-10 – Juna – Inserat-Entwürfe nur auf Wunsch speichern

**Anlass:** Der Editor speicherte jede Eingabe nach kurzer Pause automatisch und
wechselte dabei von „Inserat erstellen“ zu „Entwurf bearbeiten“. Beim erneuten
Öffnen von „Inserat erstellen“ entstand so jedes Mal ein weiterer Entwurf.

**Änderung (Nutzerentscheidung vom 10.10.2026):** Das automatische Speichern
entfällt. Gespeichert wird nur über „Entwurf speichern“. Die Seite „Inserat
erstellen“ bleibt danach geöffnet und behält ihren Titel; weiteres Speichern
aktualisiert denselben Entwurf. „Veröffentlichung vorbereiten“ sichert offene
Eingaben zuerst und zeigt dann wie bisher nur den gespeicherten Stand. Der
Hinweis beim Verlassen mit ungespeicherten Eingaben bleibt.

**Prüfungen:** 23 Komponentenfälle des Editors, Typen, Angular-Bau, gemeinsame
UI-Prüfung, Format und ESLint grün. Alle 23 Browserfälle der Entwürfe laufen
lokal mit abgefangenen Serverantworten durch; sie klicken jetzt ausdrücklich
auf Speichern und prüfen, dass ohne Klick kein Entwurf entsteht.

## 2026-10-10 - Juna - Vinted-Kartenlayout entzerren und Badges auf volle Breite setzen

**Auftrag:** Kritik des Nutzers am Live-Design umsetzen: Badges und Sync-Status waren fälschlicherweise in der rechten Spalte neben dem Avatar verschachtelt, wodurch Badges wie „Erweiterung nicht erreichbar“ in eine neue Zeile umbrachen und unter dem Avatar ein großes schwarzes Loch entstand. Zudem wurden Grammatikfehler („Vor 1 Tagen“) behoben.

**Umsetzung:**

1. **Entkopplung der Kopfzeile:** Die Kopfzeile enthält nun sauber nur noch Avatar, Anzeigename, Handle und das Einstellungs-Zahnrad.
2. **Volle Kartenbreite für Badges & Sync:** Badges und Synchronisationszeile sitzen nun darunter auf voller Kartenbreite. Dadurch passen Modus- und Status-Badge ohne Zeilenumbruch nebeneinander.
3. **Proportioniertes Padding:** Das Innen-Padding wurde von `p-5 md:p-6` auf `p-4 sm:p-5` angepasst, um horizontalen Platz für 3-Spalten-Grids zu schaffen.
4. **Grammatikkorrektur:** `formatSyncTime` unterscheidet nun exakt zwischen Singular („Vor 1 Tag“, „Vor 1 Std.“, „Vor 1 Min.“) und Plural.

**Prüfung:** Unit-Tests (22/22), Lint und Angular-Entwicklungsbuild erfolgreich.

## 2026-10-10 - Juna - Vinted-Kontokarten freizügiger gestalten und bereinigen

**Auftrag:** Kritik des Nutzers umsetzen: Punkte auf Profilbildern und in Badges entfernen, Modus-Badges mit passenden Icons (Cloud / Laptop) statt Klammern versehen, den verwirrenden „Cloud-IP“-Button bei aktiven Cloud-Konten entfernen und den Cards deutlich mehr Freiraum und eine ruhigere Ein-Button-Struktur geben.

**Befund & Konzept-Überarbeitung:**

1. **Entfall von „Cloud-IP einrichten“:** Bei verbundenen Cloud-Konten ist ein IP-Setup-Button im Alltag überflüssig und verwirrend. Nur noch der primäre „Synchronisieren“-Button bleibt auf der Karte; IP-Einstellungen gehören ins Einstellungs-Menü (⚙️).
2. **Keine überflüssigen Punkte:** Reine Avatare ohne Punkte; Status-Badges als saubere Farbflächen (`Verbunden` in Grün, `Erweiterung nicht erreichbar` in Orange) ohne Textpunkte.
3. **Icons in Modus-Badges:** Echtes Wolken-Icon für `Cloud` und Laptop-Icon für `Lokal` (Chrome Extension).
4. **Bewertung entfernt & nahtloser Sync-Status:** Die Sterne-Bewertung wurde entfernt. Störende horizontale Trennlinien (`border-y`) um die Sync-Zeile wurden vollständig beseitigt; der Synchronisationsstatus sitzt nun als ruhige Meta-Angabe direkt unter den Badges.
5. **Freizügiges, nahtloses Layout:** Die Karte bildet eine zusammenhängende, weiße Fläche ohne horizontale Streifenbildung. Aktionen sind klar im Footer verankert; der Synchronisieren-Button nutzt das standardmäßige kreisrunde `LucideRefreshCw`-Icon.

**Prüfung:** Bild-Mockup (`vinted_cards_seamless_1791657612901.jpg`) und interaktiver HTML-Entwurf (`vinted_cards_concept.html`) generiert. Unit-Tests (22/22), E2E-Spec-Anpassung, Lint und Angular-Build erfolgreich.

## 2026-10-10 – Juna – Vinted-Neuanmeldung bei abgelehnter früherer Sitzung

**Befund:** Das Cloud-Konto ist seit dem 09.10., 20:10 Uhr abgemeldet (drei
Abrufe mit `unauthorized`). Der Worker lief dabei seit 18:03 Uhr ohne Neustart;
die Auslieferungen vom 10.10. haben ihn nicht berührt. Zeitlich fällt die
Ablehnung in das Fenster, in dem sich der Nutzer für die Formularprüfung im
eigenen Chrome bei Vinted angemeldet hat. Das ist ein Zusammenhang, kein Beweis.
Nebenbefund: Der Worker wird beim Merge nicht automatisch aktualisiert und
läuft noch mit dem Stand vom 09.10.; Kategorieauswahl im Editor und das
vollständige Bearbeiten erreichen ihn erst nach einer Aktualisierung.

**Fehler:** Bei der Neuanmeldung leitet Vinted mit den abgelehnten Anmeldecookies
auf `/session-refresh` um und bleibt dort im Ladekreis. Der Anmeldeablauf
erwartete das Formular und meldete es als nicht verfügbar.

**Korrektur:** Landet eine ausdrückliche Anmeldung auf der Erneuerungsseite,
werden genau einmal nur `access_token_web` und `refresh_token_web` verworfen
und die Anmeldeseite neu geöffnet. Andere Cookies bleiben, Zugangsdaten werden
nie doppelt abgeschickt, und ohne gültige Berechtigung wird nichts verworfen.

**Prüfungen:** Vier neue Browserfälle (Weiterleitung durch Server und Seite,
dauerhafte Weiterleitung, Widerruf), 610 Worker-Prüfungen und Typen grün. Zwei
unveränderte Login-Browserfälle schlagen auf diesem Windows-Rechner weiterhin
fehl. Serverzugriffe ausschließlich lesend; nicht am echten Vinted geprüft.

## 2026-10-10 - Juna - Ursachenanalyse und kritisches Review für den Vinted-Feed

**Auftrag:** Dokumentation, frühere Audits und Codebasis des Vinted-Bots (`services/sniper`)
untersuchen und den Lösungsplan für den wiederholten Stillstand des Vinted-Feeds
kritisch mit Subagents auf Nebenwirkungen, Session-Verhalten und Resilienz prüfen.

**Befund & Kritisches Review:**

1. **Tab-Recycling-Strategie:** Ein sofortiges Schließen des Tabs nach dem Parsen
   würde asynchrone Vinted-/DataDome-Skripte abwürgen und zu 403-Sperren führen.
   Die optimale Strategie ist das Recycling des Tabs alle 15–20 erfolgreichen
   Abrufe (entspricht 3–4 Min. Browsing) sowie sofort nach jedem Fehler.
2. **Stale-Lock-Bereinigung:** Nach einem OOM-Kill verbleiben `SingletonLock`,
   `SingletonCookie` und `SingletonSocket` auf dem gemounteten Volume.
   `chrome-process.ts` muss verwaiste Locks (tote Ziel-PID `kill(0) -> ESRCH`
   und freier CDP-Port) sowie verwaiste `/tmp/.X99-lock` autonom vor dem Start
   bereinigen, um Crash-Loops zu verhindern.
3. **2-Stufen-Self-Healing:** Chrome-Ausfälle fängt `ChromeProcess` in Stufe 1 bis
   zu 3-mal innerhalb von 5 Minuten in-process ab. Scheitert dies, beendet sich
   Node via Stufe 2 kontrolliert mit `process.exit(1)`, sodass Dockers
   `restart: unless-stopped` den gesamten Container sauber durchstartet.
4. **Healthcheck & Liveness-Watchdog:** `health.recordProgress()` in `index.ts`
   wurde fälschlicherweise im `finally` von `counted` und unweigerlich nach
   `catch (error)` ausgeführt. Dies wird bereinigt. Ein Liveness-Watchdog
   erzwingt `process.exit(1)`, wenn `/live` länger als 6 Minuten 503 meldet.
5. **Ressourcen & Timeouts:** `--disable-dev-shm-usage` darf wegen des 384-MB-`tmpfs`
   nicht verwendet werden. Stattdessen wird `shm_size: 512m` in Compose gesetzt,
   und V8 wird auf 512 MB gedeckelt (`--js-flags=--max-old-space-size=512`).
   Alle CDP-Kommandos in `vinted-browser.ts` erhalten strikte Timeouts (`sendWithTimeout`).

**Prüfung:** Reine Dokumentations-, Code- und Architekturprüfung ohne Codeänderung am Produktivsystem.

## 2026-10-10 – Juna – Bestehendes Vinted-Inserat vollständig lesen

**Arbeit:** Der Zweig `juna/vinted-listing-publishing` wurde gepusht und als
PR #363 eingereicht. Auf dem neuen Zweig `juna/vinted-listing-edit` beginnt das
Bearbeiten bestehender Inserate: Ein eigener Leser öffnet die Bearbeitungsmaske
in einem frisch reservierten Tab, liest Texte, Preis, Kategorie, Marke, Größe,
Zustand, Farben, Materialien, Paketgröße, Fotos und die KI-Fotokennzeichnung
samt gesperrter Auswahlwerte und schließt den Tab wieder. Er speichert nichts.
Konto und Inserat bestimmt der Server aus dem eigenen Kontoeintrag. Die Antwort
prüft derselbe gemeinsame Prüfer im Worker, im getrennten Browser und in der App;
Inhalt und ausgewählte Werte müssen zusammenpassen.

**Korrektur:** Die übernommene Testseite lieferte Umlaute und das Eurozeichen
ohne Zeichensatz aus; der Preis war dadurch nicht lesbar.

**Prüfungen:** 608 Worker-Prüfungen (7 übersprungen), drei neue Browserfälle,
45 Fälle der App-Schnittstelle, 124 Erweiterungsprüfungen, Typen, Format und
ESLint grün. Zwei unveränderte Login-Browserfälle schlagen auf diesem
Windows-Rechner fehl. Keine Anfrage an Vinted, kein Deployment.

**Bearbeiten:** PR #363 ist gemergt und ausgeliefert; ein veralteter
Seitenleisten-Smoke-Test wurde dafür angepasst. Die Inserat-Detailseite lädt
jetzt den frischen Vinted-Stand und bietet Marke, Größe, Zustand, Paketgröße,
Farben und Material aus der aktuellen Auswahl an. Der Worker schreibt nur
geänderte Felder in einem eigenen Tab, klickt genau einmal auf Speichern und
bestätigt durch erneutes Lesen. Weicht Vinted vom Ausgangsstand ab, wird nichts
geschrieben. Nutzerentscheidung vom 10.10.2026: Fotos bleiben in der ersten
Version unverändert. Die Änderung läuft über den bestehenden direkten
Bearbeitungsweg statt über die Auftragswarteschlange; dafür ist keine Migration
nötig.

**Weitere Prüfungen:** 610 Worker-Prüfungen, vier Browserfälle für das Ändern,
vier Modell-, fünf Komponenten- und 127 Store-/Arbeitsbereichsfälle, Angular-Bau
und gemeinsame UI-Prüfung grün. Der neue Browserfall der Detailseite besteht bei
1440 und 390 px einschließlich AXE.

**Offen:** Echter Lese- und Schreibtest an einem ausgewählten Inserat, Fotos
ändern, Kategorie wechseln, Markensuche im Bearbeitungsformular, lokale
Ausführung über die Erweiterung und Relist. Die frühere Drei-Felder-Bearbeitung
bleibt als Rückfall erhalten: Kann die vollständige Maske nicht sicher gelesen
werden, lassen sich weiterhin Titel, Beschreibung und Preis ändern.

## 2026-10-10 – Juna – Inserat-Veröffentlichung auf aktuellen Master übernehmen

**Arbeit:** Den lokal geprüften Stand des Inserat-Zweigs auf den neuen Zweig
`juna/vinted-listing-publishing` übernommen und mit dem aktuellen `origin/master`
zusammengeführt. Einziger Konflikt war dieses Protokoll; beide Eintragsreihen
bleiben erhalten. Schema-Präfixe 460–466 und Migrationszeitpunkte kollidieren
nicht mit Master.

**Korrekturen:** Der Docker-Kontext schloss den neuen lokalen Inseratvertrag aus,
der Frontend-Bau hätte ihn nicht gefunden. Die vier als Kernprüfung markierten
Entwurfsfälle fehlten in der erwarteten PR-Auswahl. Der Editor legte Textfelder
über eine Hilfsfunktion an, die die Vorlagenprüfung für Formularfelder nicht
erkennt; die Felder sind jetzt ausdrücklich angelegt.

**Prüfungen:** Typen, ESLint, Format der geänderten Dateien, Angular-Bau,
2318 Node-, 309 DOM-, 172 betroffene Angular-, 605 Worker- und 144 Edge-Prüfungen
erfolgreich. Workflow-Skripte bis auf einen PowerShell-abhängigen Fall grün.
57 von 63 Worker-Browserfällen grün, darunter alle Inseratfälle; die sechs übrigen
betreffen unveränderte Login-/Profilfälle mit vollem Chromium, der in dieser
Umgebung nur in abweichender Version vorliegt. Datenbank- und E2E-Prüfungen laufen
im PR, weil hier kein Docker-Dienst verfügbar ist.

**Offen:** Veröffentlichung bleibt per `MARKETPLACE_LISTING_PUBLISH_ENABLED`
ausgeschaltet. Bearbeiten bestehender Inserate folgt als eigener Zweig; Livefall,
lokale Ausführung und Relist stehen weiter aus.

## 2026-10-10 – Juna – Veröffentlichung aus dem gespeicherten Entwurf vorbereiten

**Arbeit:** Eine eigene Vorschau verbindet den Inserateditor mit sofortigen und
geplanten Cloud-Aufträgen. Sie prüft frische Kategorie- und Markenwerte,
Pflichtangaben und Fotos, zeigt Zielkonto, Preis und Artikelinhalt und bietet die
KI-Fotokennzeichnung. Eine neue Kontofreigabe verlangt eine bewusste Auswahl;
eine vorhandene lässt sich versionsgebunden widerrufen. Gespeicherte Revision,
Benutzer, Arbeitsbereich und Konto bleiben während des Ablaufs gebunden.
Eine verlorene Antwort behält denselben Versuch und dieselben Angaben, auch
bei erneutem Prüfen. Angenommene Antworten müssen zur Kontoidentität passen.
Der Verlauf aktualisiert sich nach Annahme auch ohne Liveverbindung und zeigt
beauftragt statt eines unbelegten Veröffentlichungserfolgs.

**Ausführung:** Das neue `MARKETPLACE_LISTING_PUBLISH_ENABLED` ist standardmäßig
aus. Es verlangt Chromium und die bisherige Schreibfreigabe, bleibt unabhängig
von Nachrichten und verhindert die Übernahme neuer Inserataufträge durch den
Ausführer. Die Health-Antwort zeigt die Verfügbarkeit; alte Antworten ohne Flag
oder Lesezugänge aktivieren sie nicht. Beispielkonfiguration und Pilot-Compose
lassen das Flag bis zum freigegebenen Anbieter-Schreibtest ausgeschaltet.

**Prüfungen:** Fehlende Editoranbindung und Verlaufsaktualisierung sowie falsche
Kontoantwort und fehlende Ausführungssperre zuerst durch fehlgeschlagene Tests
belegt. Betroffene Angular- und Modellprüfungen sowie 594 Workerprüfungen
erfolgreich; sieben bestehende Workerfälle ausgelassen. Typen, Angular-/Worker-Bau,
Format, ESLint und Shared-UI-Prüfung erfolgreich. Alle 23 Browserfälle einschließlich
sechs neuer Vorschau-/Annahmefälle, Fotos, Vorlagen, Marken-/Merkmalsauswahl,
Terminänderungen und privater Statusmeldungen erfolgreich. Desktop/Mobil,
hell/dunkel, Tastatur, Fokusrückkehr und verschachtelte Terminwahl ohne AXE-Befund;
mobile Vorschau zusätzlich angesehen. Verlorene Antwort, unveränderte Wiederholung,
gesperrter Server und unvollständige Angaben geprüft. Beide Container neu gebaut
und zehn Inseratmodule jeweils ohne Netzwerk geladen. Alle Anbieteranfragen
dieser Tests sind abgefangen.

**Offen:** Gesamtplan bleibt teilweise umgesetzt. Lokale Ausführung, zusätzliche
Kategoriearten/-felder, native Vinted-Entwürfe, vollständige Bearbeitung, Relist
und der freigegebene Livefall stehen noch aus. Keine echte Vinted-Schreibaktion,
Produktionsänderung, Erweiterungsinstallation oder Veröffentlichung des Zweigs.

## 2026-10-10 – Juna – Vinted-Merkmale im Inserat-Editor auswählen

**Arbeit:** Die kontogebundene Schnittstelle verbindet den getrennten Cloud-Leser
mit Größe, Zustand, Farben, Materialien und Paketgröße im Editor. Das Zielkonto
wird serverseitig aus der berechtigten Verbindung ermittelt; der Client kann
weder Kontoidentität noch Kategoriepfad vorgeben. Rechte, Konto und Kategorie
bleiben während des Abrufs gebunden. Der Dialog übernimmt ausschließlich
angebotene, freigegebene Kennungen und ihre Namen; freie Texte sind nur eine
Eingabehilfe. Nicht angezeigte Felder und andere laufende Eingaben bleiben erhalten.
Manuelle Änderungen lösen die betreffende neue Kennung, ein Kategorienwechsel
deren gesamte Zuordnung. Konto-/Arbeitsbereichswechsel verwerfen alte Antworten.
Die Auswahl speichert nur im eigenen Entwurf; sie löst keine Anbieter-Schreibaktion aus.

**Prüfungen:** Fehlendes Auswahlmodell, fehlender Dialog und fehlende Editoranbindung
zuerst durch fehlgeschlagene Tests belegt. Eine fehlende Arbeitsbereichszuordnung des
Kontos sowie ein im Browser erkannter falscher Service-Kontext wurden behoben.
Der kontogebundene Service wird jetzt je Editor bereitgestellt. 77 Angular- und
23 Modellprüfungen sowie 591 Workerprüfungen erfolgreich; sieben bestehende
Workerfälle ausgelassen. Parallele Abfragen, Sperren, verspätete Antworten,
unpassende Kategorien und bewusst unvollständige Entwürfe geprüft. Typprüfung,
Angular-Bau, Format, ESLint und Shared-UI-Prüfung erfolgreich. Vier Browserfälle
prüfen Auswahl, Tastatur, Fokusrückkehr, Speichern/Wiederladen und Fehler mit
erhaltenen Eingaben auf Desktop/Mobil, hell/dunkel, jeweils ohne AXE-Befund.
Anschließend alle 17 Browserfälle einschließlich Fotos, Vorlagen, Planung,
Markensuche und privater Statusmeldungen erfolgreich.
Beide Testcontainer gebaut und zehn Inseratmodule jeweils ohne Netzwerk geladen.
Alle Anbieteranfragen dieser Tests sind abgefangen.

**Offen:** Die aktuelle Merkmalsauswahl benötigt ein verbundenes Cloud-Konto.
Zusätzliche Kategoriearten/-felder, lokale Ausführung, native Vinted-Entwürfe,
Veröffentlichungsaktionen im Editor, vollständige Bearbeitung und Relist bleiben
im Gesamtplan offen. Keine echte Vinted-Schreibaktion, Produktionsänderung,
Installation einer Erweiterung oder Veröffentlichung des Arbeitszweigs.

## 2026-10-10 – Juna – Aktuelle Vinted-Merkmale getrennt lesen

**Arbeit:** Eine feste Cloud-Browseraktion liest kategorieabhängige Größen,
Zustände, Farben, Materialien und Paketgrößen auf einem eigenen frischen Tab.
Sie übernimmt keine Artikeltexte/Fotos und speichert nichts. Konto, Kategorie
und aktuelle Rechte werden während des Abrufs geprüft; der eigene Tab wird
auch bei Fehlern geschlossen. Bestehende Benutzerseiten bleiben erhalten.
Die bisherige Feldvorbereitung verwendet dieselbe Kategorieauswahl. Übertragene
Formularwerte werden begrenzt und gegen ihre Kategorie geprüft; unbekannte
Felder bleiben sichtbar statt still verworfen zu werden.

**Prüfungen:** Fehlendes Modul, fehlende feste Browseraktion und fehlender
Antwortprüfer zuerst durch fehlgeschlagene Tests belegt. Ein weiterer Fehlerfall
mit gleichwertigen Kategorie-Vorschlägen wurde reproduziert und behoben.
Alle 34 nativen Browserprüfungen einschließlich des vollständigen getrennten
Lesewegs und der bisherigen Veröffentlichung erfolgreich; Anbieteranfragen
vollständig abgefangen. 584 Workerprüfungen erfolgreich, sieben bestehende Fälle
ausgelassen. 15 lokale Protokollprüfungen, Typprüfung, Bau, Format und ESLint
erfolgreich. Beide Testcontainer gebaut und acht Inseratmodule jeweils ohne
Netzwerk geladen. Ein dabei erkannter Typfehler wurde vor dem Neubau behoben.

**Offen:** Der Leser wird als nächstes über eine kontogebundene Schnittstelle
an die Merkmalsauswahl im Editor angeschlossen. Gesamtplan weiterhin offen;
keine echten Vinted-Schreibaktionen oder Produktionsänderungen.

## 2026-10-10 – Juna – Vinted-Marken im Inserat-Editor auswählen

**Arbeit:** Der Editor ergänzt die freie Markeneingabe um eine Suche mit echten
Vinted-Kennungen und der ausdrücklichen Wahl „Keine Marke“. Name und Kennung
werden gemeinsam übernommen, ohne andere Eingaben zu ersetzen. Änderungen am
Markentext oder an der Kategorie lösen die neue Zuordnung. Verspätete Antworten,
Arbeitsbereichswechsel und geschlossene Dialoge übernehmen keine alte Auswahl.
Die vorhandene Suchfunktion prüft für Inserate die konkreten Arbeitsbereichsrechte
vor und nach dem Anbieterabruf; die bisherige Plattformverwaltung bleibt getrennt.

**Prüfungen:** Fehlende Editoranbindung und fehlende Arbeitsbereichsprüfung zuerst
durch fehlgeschlagene Tests belegt. 37 Angularprüfungen einschließlich der bisherigen
Markensuche und Plattformeditoren sowie elf Edge-Prüfungen erfolgreich. Typprüfung,
Angular-Bau, Format, Frontend-ESLint und Shared-UI-Prüfung erfolgreich; Edge-Handler
mit Deno geprüft. Vier Browserfälle bestätigen Tastaturbedienung, Fokusrückkehr,
Speichern/Wiederladen und freie Änderungen auf Desktop/Mobil, hell/dunkel, jeweils
ohne AXE-Befund. Anschließend alle 13 Browserfälle einschließlich bisheriger
Entwürfe, Fotos, Vorlagen, Terminplanung und privater Statusmeldungen erfolgreich.
Alle Anbieteranfragen dieser Tests sind abgefangen.

**Offen:** Weitere Merkmalsauswahl, lokale Ausführung, native Vinted-Entwürfe,
vollständige Bearbeitung und Relist bleiben im Gesamtplan offen. Keine echte
Vinted-Schreibaktion, installierte Erweiterung oder Produktionsänderung.

## 2026-10-10 – Juna – Gewählte Vinted-Marke außerhalb der Vorschläge finden

**Arbeit:** Fehlt die gewählte Markenkennung in den sichtbaren Vorschlägen,
verwendet der native Veröffentlichungsablauf die beobachtete Vinted-Markensuche.
Er wartet auf genau diese Kennung und prüft die unveränderte Bezeichnung.
Ähnliche Namen und freie Markentexte ersetzen keinen Treffer. Nach Auswahl
wird die asynchrone Aktualisierung des Markenfeldes abgewartet. Feldvorbereitung,
letzte Prüfung vor dem Speichern und frischer gespeicherter Inhaltsbeleg
verwenden dieselbe Auswahlhilfe.

**Prüfungen:** Fehlende Suche zunächst mit einer Marke außerhalb der Vorschläge
belegt. Drei neue Browserfälle prüfen den tatsächlichen Treffer, ähnliche/freie
Marken und verlorene Freigabe während der Suche. Der komplette native
Veröffentlichungstest prüft zusätzlich die gespeicherte Marke. Alle 28
Browserprüfungen mit abgefangenen Anfragen und 579 Workerprüfungen erfolgreich;
sieben bestehende Workerfälle ausgelassen. Typprüfung, Bau, Format und ESLint
erfolgreich. Beide Testcontainer gebaut und sieben Inseratmodule jeweils ohne
Netzwerk geladen. Keine echte Vinted-Aktion, Schema- oder Produktionsänderung.

**Offen:** Die Markenauswahl im Flipbase-Editor wird als nächster Schritt
angeschlossen. Weitere Merkmale, lokale Ausführung, native Vinted-Entwürfe,
vollständige Bearbeitung und Relist bleiben Bestandteil des offenen Gesamtplans.

## 2026-10-10 – Juna – Inserataufträge automatisch im Editor aktualisieren

**Arbeit:** Der Auftragsverlauf empfängt private Änderungsmeldungen für seinen
gespeicherten Entwurf. Meldungen enthalten ausschließlich Workspace-, Entwurfs-
und Ereigniskennung; den aktuellen Stand lädt Flipbase mit den vorhandenen
Zugriffsrechten neu. Während laufender Abfragen oder eines Planungsdialogs
bleibt eine Aktualisierung vorgemerkt. Konto-, Nutzer- und Rechtewechsel sowie
das Schließen der Seite entfernen den Kanal und verwerfen verspätete Antworten.
Lease-Prüfungen ohne sichtbare Änderung erzeugen keine Meldung.

**Prüfungen:** Fehlende Kanal- und Editoranbindung zuerst durch fehlgeschlagene
Tests belegt. 37 Angularprüfungen, 15 neue und 159 bestehende Datenbankprüfungen
nach frischem Aufbau der isolierten Testdatenbank erfolgreich. Migration mit
dem CLI erzeugt; dessen fehlende Realtime-Policy wird automatisch aus der
deklarativen Datei ergänzt. Datenbanktypen neu erzeugt. Zwölf Skriptprüfungen,
Typprüfung, Angular-Bau, Format und ESLint erfolgreich. Neun Browserdurchläufe
einschließlich tatsächlicher WebSocket-Meldung, Statuswechsel, Desktop/Mobil,
hell/dunkel und AXE erfolgreich. Keine echte Vinted-Aktion oder Produktionsänderung.

**Recherche:** Native Markensuche mit „JAKO“ geprüft: „Jako“ und „Jako-o“
haben verschiedene Anbieterkennungen. Kein Vinted-Entwurf ist vorhanden;
für die Leseprüfung wurde keiner angelegt. Lokaler Ausführer, vollständige
Merkmalsauswahl, native Vinted-Entwürfe und Live-Veröffentlichung bleiben offen.

## 2026-10-10 – Juna – Inserataufträge in die Cloud-Warteschlange aufnehmen

**Arbeit:** Der Chromium-Worker nimmt jetzt Inserataufträge über den bestehenden
gemeinsamen Browserplatz an. Manuelle Gesprächsantworten und Verhandlungen
bleiben vorrangig; Inserate werden vor automatischen Favoritenaufträgen
angenommen. Die Datenbank bestimmt weiterhin Fälligkeit, Revision und
Ausfallregel. Die Abschaltung geplanter Kontoabrufe deaktiviert keine bewusst
angelegten Inserataufträge. Ein verlorener Claim oder ungeklärter physischer
Browserstopp beendet weitere Annahmen. Die Ausführung verwendet den
bestehenden Inserat-Runner, Originalfotoabruf und getrennten Browsertransport.

**Prüfungen:** Fehlenden gemeinsamen Verteiler zuerst durch fehlgeschlagenen
Test belegt. Vier neue Ablaufprüfungen sichern Reihenfolge, unveränderte
Workerbindung, höchstens eine Browserreservierung, leere Warteschlange und
Abbruch nach unklarer Bereinigung. Alle 579 Workerprüfungen erfolgreich;
sieben bestehende Fälle ausgelassen. Worker-Typprüfung, Bau, Format und
ESLint erfolgreich. Kein Anbieter-Schreibtest, keine Schemaänderung oder
Veröffentlichung des Arbeitszweigs.

**Offen:** Lokale Browserausführung, vollständige Merkmalsauswahl,
Veröffentlichungsdialog, Live-Status und ein freigegebener echter Einzelfall.

## 2026-10-10 – Juna – Inseratablauf an den getrennten Cloud-Browser anschließen

**Arbeit:** Die feste Browseraktion für Inserate verbindet nun die zentrale
Freigabe mit dem nativen Veröffentlichungsbaustein. Der Controller bestätigt
den Schreibbeginn genau einmal, bevor der Browser weiterarbeiten darf.
Originalfotos werden in Teilen von höchstens einem MiB übergeben; Kennung,
Dateiname, Dateityp, Gesamtgröße, Reihenfolge und Vollständigkeit werden
beidseitig geprüft. Jeder weitere Teil benötigt aktuelle Rechte. Die Fototeile
enthalten keine Speicherpfade oder Schlüssel. Eine verspätete Ergebnisrückgabe
darf einen bereits belegten Versuch abschließen, aber keine neue Aktion starten.
Der Browser eröffnet einen eigenen Tab innerhalb des reservierten Kontos.
Die gemeinsamen Inseratregeln werden auch in das Sitzungsabbild kopiert.

**Prüfungen:** Fehlenden Fototransfer, Browseranschluss und getrennte Aktion
zuerst durch fehlgeschlagene Tests belegt. Ein neun MiB großes Original wird
über zehn begrenzte Nachrichten übertragen. Widerruf zwischen Teilen,
falsche Kennungen/Metadaten, unvollständige Teile, falsche Freigabeantworten,
fehlendes oder wiederholtes Schreibbeginn-ACK und Belege ohne Schreibbeginn
werden abgelehnt. 25 Inserat-Browserprüfungen mit abgefangenen Anfragen und
alle 575 Workerprüfungen erfolgreich; sieben bestehende Fälle ausgelassen.
Worker-Typprüfung, Bau, Format und ESLint erfolgreich. Controller- und
Sitzungscontainer gebaut und sechs Inseratmodule jeweils ohne Netzwerk geladen.
Keine echten Anbieteraktionen, produktiven Container oder installierten
Erweiterungen verändert.

**Offen:** Aufnahme der Inserataufträge in die bestehende Auftragsverteilung,
Anschluss der lokalen Erweiterung, vollständige Editor-Merkmalsauswahl und
ein konkret freigegebener echter Veröffentlichungstest bleiben in Arbeit.

## 2026-10-10 – Juna – Nativen Veröffentlichungsablauf verbinden

**Arbeit:** Ein Worker-Baustein verwendet ausschließlich eine frisch reservierte
leere Seite. Er verbindet die echte Feldvorbereitung und Fotoeingabe mit der
beobachteten Speichern-Schaltfläche. Fotos werden erst nach bestätigtem
Schreibbeginn hochgeladen; Speichern wird einmal ausgelöst. Eine konkrete
Kennung aus der anschließenden Vinted-Artikelroute wird erst nach erneutem
Inhalts-, Foto- und Aktivstatusvergleich bestätigt. Antwortverlust und
Abweichungen bleiben offen. Bestehende Benutzerseiten werden weder verwendet
noch geschlossen. Gemerkte Merkmalsauswahlen sind ausschließlich in dieser
frisch reservierten Maske zulässig; vorhandene Texte/Fotos bleiben geschützt.
Native Vinted-Entwürfe werden weiterhin vor dem Schreibbeginn abgelehnt,
solange ihre Ergebnisroute nicht anhand eines konkreten Falls geprüft ist.

**Prüfungen:** Fehlenden Ablauf und Ablehnung gemerkter Auswahlen zuerst durch
fehlgeschlagene Tests belegt. 24 Inserat-Browserprüfungen mit vollständig
abgefangenen Anfragen erfolgreich, einschließlich Antwortverlust, falschem
gespeichertem Preis, fehlendem Aktivstatus, fehlendem Schreibbeginn-ACK,
falschem Konto und Widerruf zwischen Upload und Speichern. AI-Fotooption
wird vor und nach dem Speichern verglichen. Alle 566 Workerprüfungen
erfolgreich, sieben bestehende Fälle ausgelassen. Worker-Typprüfung, Bau,
Format und ESLint erfolgreich. Keine echten Uploads oder Veröffentlichungen.

**Offen:** Der neue Ablauf ist noch nicht an Browsertransport und Dispatch
angeschlossen. Die neue Speicherroute und Fotos sind ausschließlich im
abgefangenen Ablauf geprüft; ein konkret freigegebener Anbieter-Schreibtest
steht weiterhin aus. Der Gesamtplan bleibt in Arbeit.

## 2026-10-10 – Juna – Gespeicherte Inseratinhalte und Fotos erneut prüfen

**Arbeit:** Ein lesender Worker-Baustein öffnet die Bearbeitungsmaske einer
bekannten Vinted-Kennung frisch und vergleicht Titel, Beschreibung, Centpreis,
Kategorie, ausgewählte Merkmale und Zusatzoptionen mit dem Auftragsinhalt.
Ein gemeinsamer Fotoleser und Vergleich prüfen die vollständige Reihenfolge
anhand der beobachteten Vinted-Bildkennungen. Unterschiedliche Bildgrößen,
CDN-Server und Vorschau-Signaturen ändern diese Kennung nicht. Fehlende,
vertauschte, doppelte, versteckte oder noch ungeladene Bilder bestätigen nichts.
Konto und Freigabe werden vor und nach dem Lesen geprüft. Der Nutzer bestätigt,
dass kein bestehender Vinted-Entwurf für eine Leseprüfung vorhanden ist.

**Prüfungen:** Fehlende Vergleicher und Inhaltsprüfung zuerst durch
fehlgeschlagene Tests belegt. Ein verstecktes Preisfeld deckte eine falsche
Bestätigung auf; Sichtbarkeitsprüfung über die Eltern und eindeutige
Zusatzoptionen korrigieren sie. Alle 20 Inserat-Browserprüfungen mit abgefangenen
Anfragen, 159 Erweiterungsprüfungen und 566 Workerprüfungen erfolgreich;
sieben bestehende Workerfälle ausgelassen. Worker-Typprüfung, Bau, Format
und ESLint erfolgreich. Keine echten Anbieteraktionen oder Schemaänderungen.

**Offen:** Der Baustein bestätigt Inhalt einer bekannten Kennung, noch keinen
neuen Speichervorgang. Die tatsächlich zurückgegebene neue Kennung muss erst
mit Inhalts- und Aktivstatusprüfung verbunden werden. Native Entwürfe,
Veröffentlichungsweg und Anschluss der Ausführer bleiben in Arbeit.

## 2026-10-10 – Juna – Aktiven Vinted-Status anhand der eigenen Profilansicht lesen

**Arbeit:** Den tatsächlich ausgewählten Aktiv-Filter und konkrete ID-/Titel-
Kacheln am eigenen Vinted-Profil gelesen. Ein gemeinsamer DOM-Leser und ein
Worker-Baustein prüfen sichtbare eindeutige Kontrollen, eigenes Profil, exakte
Inseratkennung und Titel. Konto und Auftragsfreigabe werden davor/danach geprüft.
Alte ungefilterte Kacheln und laufende Ladeanzeigen gelten nicht als Beleg.
Der Baustein liest ausschließlich den aktiven Status einer bekannten ID;
ein neues Inserat oder vollständig gespeicherte Inhalte bestätigt er noch nicht.
Zusätzlich die gesamte sechs Bilder umfassende Galerie und gleiche
Bildkennungen in gespeicherten Bearbeitungsvorschauen gelesen. Keine Inhalte
des bestehenden Inserats oder des ursprünglichen Neuanlage-Tabs geändert.

**Prüfungen:** Fehlenden Statusbaustein zuerst durch fehlgeschlagenen Test
belegt. Ein kurzer Ladevorgang und ein leeres Profil deckten zwei Fehler auf;
konkreter alter DOM-Verweis und Prüfung auf vorhandene Kacheln beheben sie.
Fünf neue und alle 14 bisherigen Inserat-Browserprüfungen erfolgreich,
einschließlich falschem Konto, Widerruf, versteckten/doppelten Kontrollen,
falscher ID/Titel, laufendem Laden und fehlender Kachel nach dem Filtern.
Alle 566 Workerprüfungen erfolgreich, sieben bestehende Fälle ausgelassen.
Alle 157 Erweiterungsprüfungen, Worker-Typprüfung, Bau, Format und ESLint
erfolgreich. Testcontainer neu gebaut. Kein Anbieter-Schreibtest, keine
Schemaänderung, keine installierte Erweiterungsänderung oder Veröffentlichung
des Arbeitszweigs. Der eigene Recherchetab wurde geschlossen.

**Offen:** Verknüpfung mit einem neuen Speicherergebnis, vollständiger Inhalts-
und Fotobeleg, native Vinted-Entwürfe und tatsächlicher Veröffentlichungsweg.

## 2026-10-10 – Juna – Inseratclient und gemeinsamer Auftragsinhalt

**Arbeit:** Cloud und lokale Erweiterung prüfen den unveränderlichen
Inseratinhalt mit demselben Parser. Der eigene Erweiterungsclient verbindet
Übernahme, Freigabeprüfung, einmaligen Schreibbeginn, Originalfotoabruf und
Ergebnisrückmeldung über gebundene Adapter. Er übernimmt nur das gekoppelte
Konto und registrierte Versuche; große Kennungen bleiben Text. Parallele
Schreibbeginn-Aufrufe lösen höchstens eine Anfrage aus. Antwortverlust erzeugt
keinen erneuten Schreibbeginn. Späte Prüfantworten dürfen einen inzwischen
widerrufenen oder beendeten Versuch nicht wieder öffnen. Nach Fristablauf kann
weiterhin das Ergebnis des ursprünglichen Versuchs gemeldet werden. Die
Rückmeldung wird anhand von Konto, Auftrag, Aktion und Anbieterbeleg geprüft.
Die neuen Prüfungen sind in der bestehenden Workflow-Suite registriert.

**Prüfungen:** Fehlende gemeinsame Schnittstelle und Client zuerst durch
fehlgeschlagene Tests belegt; zusätzlich Kennungsumwandlung und verspätete
Prüfantworten durch fehlgeschlagene Tests nachgewiesen und korrigiert.
13 neue und 144 bestehende Erweiterungsprüfungen erfolgreich. Alle 566
Workerprüfungen erfolgreich, sieben bestehende Fälle ausgelassen. Alle 14
Inserat-Browserprüfungen mit abgefangenen Anbieteranfragen erfolgreich.
Worker-Typprüfung, Bau, Format und ESLint erfolgreich. Testcontainer neu gebaut;
fünf Inseratmodule einschließlich gemeinsamem Parser ohne Netzwerk geladen.
Suite-Audit erfolgreich. Keine Schemaänderung oder echte Anbieteraktion.

**Offen:** Der Client ist noch nicht im Hintergrundablauf oder Manifest
aktiviert. Native Speicherung, belastbarer Anbietererfolg und automatischer
Start bleiben anzuschließen; die installierte Erweiterung wurde nicht geändert.

## 2026-10-10 – Juna – Private Originalfotos für lokale Inserataufträge

**Arbeit:** Eigene Fotoaktion liefert Originalbytes ausschließlich anhand einer
Bildkennung im übernommenen Inseratauftrag. Workspace, Konto, Auftragskennung,
Versuch und Secret begrenzen die Datenbankabfrage. Die bestehende Inseratfreigabe
wird vor dem Lesen, vor dem Storage-Abruf und vor der Rückgabe geprüft. Ein
Widerruf während des Downloads verhindert die Ausgabe. JPEG, PNG und WebP,
exakte Dateigröße, begrenzte Pfade und Dateisignaturen werden geprüft;
Weiterleitungen und Teilantworten abgewiesen. Die Erweiterung erhält keine
Storage-URLs oder Serverzugänge. Der Abruf speichert oder veröffentlicht nichts.

**Prüfungen:** Fehlenden Fotohandler und fehlende Indexverbindung zuerst durch
fehlgeschlagene Tests belegt. Alle 38 lokalen Edgeprüfungen einschließlich
Widerruf an jeder Grenze und realer Indexzuordnung mit abgefangenen Anfragen
erfolgreich. Alle 144 bestehenden Erweiterungsprüfungen erfolgreich.
TypeScript, Angular-Produktionsbau und Format erfolgreich. Deno-Lint für sechs
Vertrags-/Handler-/Fotodateien erfolgreich mit den bereits dokumentierten
Ausnahmen für explizite Importpräfixe und bestehende Steuerzeichenprüfung.
Keine Schemaänderung, Anbieteraktion, installierte Erweiterungsänderung oder
Veröffentlichung des Arbeitszweigs.

**Offen:** Erweiterungsclient, native Ausführung, bestätigtes Anbieterergebnis
und automatische Abholung. Dateisignaturen ersetzen keine Bilddekodierung.
Die Vinted-Browserverbindung war bei der anschließenden Leseprüfung nicht mehr
verfügbar; der ursprüngliche Formular-Tab wurde nicht geändert.

## 2026-10-10 – Juna – Lokalen Inseratablauf mit Edge verbinden

**Arbeit:** Die lokale Erweiterungsschnittstelle hat eigene Aktionen für
Auftragsübernahme, Freigabeprüfung, Schreibbeginn und Ergebnisrückmeldung.
Workspace, Konto, Auftragskennung und Versuchkennung werden streng geprüft;
große Auftragskennungen bleiben Text. Unvollständige oder widersprüchliche
Bestätigungen und zusätzliche Befehle werden vor dem Datenbankaufruf abgelehnt.
Eigene Inserat-RPCs prüfen weiterhin die tatsächliche Freigabe und Bindung.
Konflikte und Fehler werden ohne interne Details zurückgegeben. Gemeinsamer
Parser bleibt auch im Angular-Bau verwendbar; separate Typdatei hat keine
Laufzeitabhängigkeit.

**Prüfungen:** Fehlende Handler/RPC-Verbindung, falsche Konfliktantwort und ein
als Liste gelieferter Anbieterstatus zuerst durch fehlgeschlagene Tests belegt.
30 lokale Edgeprüfungen einschließlich echter Indexzuordnung mit abgefangenen
Anfragen erfolgreich. 144 bestehende Erweiterungsprüfungen und 48 Angularprüfungen
für lokale Verbindung/Übertragung erfolgreich. TypeScript und Produktionsbau
erfolgreich. Format und Suite-Audit erfolgreich. Die geänderten Edge-Dateien
sind in der bestehenden ESLint-Konfiguration ausgenommen; sie wurden mit der
Deno-Typprüfung geprüft. Deno-Lint für die fünf neuen/geänderten Vertrags- und
Handlerdateien erfolgreich; die Regeln für explizite Importpräfixe und die
bestehende Prüfung verbotener Steuerzeichen sind dabei ausgenommen.
Keine Schemaänderung, keine Anbieteraktion, keine installierte Erweiterung
geändert und kein Push, PR, Merge oder Deployment.

**Offen:** Originalfotoabruf für die Erweiterung, native Ausführung und deren
bestätigtes Ergebnis sowie automatisches Abholen. Das Feature bleibt in Arbeit.

## 2026-10-10 – Juna – Planungsdialog und Terminwechsel anschließen

**Arbeit:** Datum, Uhrzeit, Zeitzone, Schnelltermine und Ausfallregel in einem
eigenen Dialog ergänzt. Doppelte Uhrzeiten verlangen eine bewusste Auswahl;
gespeicherte Termine behalten das richtige Vorkommen. Bestehende wartende
Aufträge lassen sich mit dem aktuellen gespeicherten Entwurf umplanen. Die
Datenbank übernimmt Aktion und Fotoeinstellung aus der bisherigen Aufnahme;
Abbruch und Ersatz sind atomar. Die gleiche Anfrage bleibt nach Antwortverlust
wiederholbar. Ungespeicherte Änderungen, Rechte-/Konto-/Revisionswechsel und
begonnene Schreibversuche werden abgefangen. Die Formularhülle des Editors
vermeidet verschachtelte Formulare. Fokusrückkehr nach Escape korrigiert.

**Prüfungen:** Fehlende Funktionen und die Zeitzone mit Leerzeichen zuerst durch
fehlgeschlagene Tests belegt. 33 Angular- und 68 Modellprüfungen erfolgreich.
159 Datenbankprüfungen nach frischem Aufbau erfolgreich; Typen neu erzeugt.
Neue Migration aus dem CLI-Abgleich erzeugt und um die deklarativen Rechte
ergänzt: ausschließlich neue Termin-RPC, keine fremden Tabellenänderungen.
Zehn Skript-/Schemaregistrierungsprüfungen, TypeScript, Produktionsbau,
Format/ESLint, Shared-UI und Suite-Audit erfolgreich. Acht Browserfälle auf
Desktop/Mobil, hell/dunkel einschließlich AXE erfolgreich. Keine reale
Anbieter-Schreibaktion, kein Push, PR, Merge oder Deployment.

**Offen:** Neue Veröffentlichungsaufträge, tatsächliche Ausführer und der
bestätigte Anbietererfolg. Der Gesamtplan bleibt in Arbeit.

## 2026-10-10 – Juna – Kategoriepfad an den Inseratversuch anbinden

**Arbeit:** Der Worker liest den benötigten Elternpfad aus der bestehenden
Vinted-Kategorietabelle. Er prüft echte Ganzzahlkennungen, Blattkategorie,
fehlende Eltern, Schleifen, maximale Tiefe und einheitliche Aktualisierungsmarken.
Der Auffrischungsstand und die Inseratfreigabe werden vor/nach dem Abruf geprüft.
Der Browser erhält ausschließlich die geordneten Elternkennungen. Der Cache ist
eine Navigationshilfe; die angebotenen Werte prüft weiterhin das native Formular.
Ein fehlender Pfad verhindert Vorbereitung und Schreibbeginn.

Eigenes vorhandenes Inserat und Profil erneut nur gelesen. Sichtbare
Detailmerkmale für Preis, Beschreibung, Eigentümer, Fotoelemente und Aktionen
dokumentiert. Im Profil waren nur aktive/verkaufte Angebote sichtbar. Der Nutzer
bestätigt, dass derzeit kein Vinted-Entwurf vorhanden ist. Das Ergebnis der
nativen Entwurfsanlage bleibt daher offen; keine Ersatzannahme aus einem Button.

**Prüfungen:** Sechs neue Pfad-/Storeprüfungen und zwei neue Ablaufregressionen
zuerst fehlgeschlagen, danach erfolgreich. 566 Workerprüfungen erfolgreich,
sieben bestehende Fälle ausgelassen. Worker-Typen, Bau, Format/ESLint erfolgreich.
Zusätzlicher Recherchetab geschlossen. Keine reale Anbieter-Schreibaktion.

## 2026-10-10 – Juna – Native Inseratfelder vorbereiten

**Arbeit:** Leere Vinted-Neuanlagemasken lassen sich anhand ihrer tatsächlichen
Kategorieauswahl vorbereiten. Marke, Größenfamilie, Zustand, Farben, Materialien
und Sendungsgröße werden mit Kennung und Beschriftung abgeglichen. Unbekannte
Merkmale, deaktivierte Werte und vorhandene Eingaben verhindern die Übernahme.
Preisübernahme verwendet ganze Centbeträge. Kategorie, Konto und Freigabe bleiben
während der Vorbereitung gebunden; abschließend werden die Eingaben erneut gelesen.
Versteckte Versandgrößen-Radios werden über ihre sichtbaren Labels erkannt.
Parallele Schreibbeginn-Callbacks im Worker reservieren den Beginn vor der
asynchronen Rechteprüfung und können keine zweite Begin-Anfrage senden.

Der Baustein speichert oder veröffentlicht nichts bei Vinted. Marken außerhalb
der sichtbaren Auswahl und bisher unbekannte Kategorien bleiben eingeschränkt.
Anbieterergebnis, automatische Abholung und Erweiterungsanschluss sind offen.

**Prüfungen:** Neue Browserregressionen für versteckte Radios und Kategorieänderung
sowie Workerregression für parallelen Beginn zuerst fehlgeschlagen und nach der
Korrektur erfolgreich. Sechs Feldprüfungen und 13 Worker-Ablaufprüfungen erfolgreich.
Insgesamt 14 Browserfälle und 558 Workerprüfungen erfolgreich, sieben bestehende
Fälle ausgelassen. Typen, Worker-Bau, Format/ESLint und Containerbau mit Importtest
ohne Netzwerk erfolgreich. Alle Browseranfragen abgefangen; keine reale Anbieteraktion.

## 2026-10-10 – Juna – Nativen Foto-Upload für Inserate vorbereiten

**Arbeit:** Einen getrennten Browserbaustein für die bestätigte Vinted-
Fotoeingabe ergänzt. Er verarbeitet die Originale einzeln in ihrer Reihenfolge
und verlangt die bestätigte Schreibfreigabe vor der ersten Dateiauswahl.
Vorhandene oder während der Vorbereitung hinzugekommene Fotos werden nicht
überschrieben. Konto und Freigabe werden vor und nach der Übertragung geprüft.
Lokale Blob-Vorschauen bestätigen keinen Upload; erwartete, geladene
Anbieterbilder und unveränderte vorherige Fotokacheln sind erforderlich.
Nach einem unklaren Upload wird keine Datei erneut ausgewählt.

Der Baustein ist noch nicht an eine Veröffentlichungsaktion angeschlossen und
bestätigt ausschließlich Fotokacheln, kein gespeichertes Inserat. Vollständige
Feldübernahme, Anbieterergebnis und automatische Ausführung bleiben offen.

**Prüfungen:** Fünf neue Browserprüfungen und drei bestehende Formularprüfungen
mit abgefangenen Anfragen erfolgreich; Kontowechsel, fehlendes Begin-ACK,
Vorschau ohne Uploadbestätigung, veränderte Reihenfolge und Vorbereitungskonflikt
abgedeckt. Worker-Typen, Bau, Format und ESLint erfolgreich. Browserdateien
nur im eigenen Testverzeichnis installiert. Keine reale Anbieteraktion.

## 2026-10-10 – Juna – Private Originalfotos an Cloud-Inseratversuche binden

**Arbeit:** Der Worker lädt ausschließlich ein Foto aus der übernommenen,
unveränderlichen Aufnahme. Auftrag und Browserfreigabe werden vor und nach dem
Download geprüft. Die private Storage-Anfrage bleibt im Worker; der Adapter
erhält nur Bildbytes, Kennung, Dateiname und Bildtyp. Dateigröße, MIME-Typ und
Bildsignatur werden geprüft, unvollständige oder übergroße Streams abgebrochen
und Weiterleitungen abgelehnt. Einzelne Downloads bleiben auf die vorhandene
eigene Grenze von 50 MiB begrenzt. Geschlossene Adapter können keine weiteren
Fotos laden. Ein Fehler nach Schreibbeginn bleibt ein unklarer Versuch.

Fotoeingabe, Speicherbuttons und vorhandene Fotokacheln am angemeldeten Vinted
erneut nur gelesen. Das vorbereitete Neuanlageformular blieb erhalten. Chrome
registrierte sich nach Navigation erneut; die dokumentierte Verbindung wurde
jeweils neu aufgenommen. Der zusätzliche Recherchetab ist geschlossen.
Anbieterupload, Veröffentlichung und automatische Abholung bleiben offen.

**Prüfungen:** 557 Workerprüfungen erfolgreich, 7 bestehende Fälle ausgelassen.
25 gezielte Prüfungen zum Fotozugriff, Ablauf und Datenbank-Service sowie
Worker-Typen und Bau erfolgreich. Storage-Route mit dem installierten
Supabase-SDK abgeglichen. Format/ESLint erfolgreich. Container gebaut und neue
Module ohne Netzwerk geladen. Es wurde weder ein Foto zu Vinted hochgeladen
noch ein reales Inserat gespeichert, geändert oder veröffentlicht.

## 2026-10-10 – Juna – Inserataufträge im Entwurf anzeigen

**Arbeit:** Gespeicherte Entwürfe zeigen ihren Auftragsverlauf mit Termin,
Ausführer und Anbieterstatus. Auftragsannahme, Anbieterprüfung und unklarer
Ausgang bleiben unterscheidbar. Wartende Aufträge lassen sich versionsgebunden
abbrechen; nach Beginn wird diese Aktion nicht angeboten. Neuere Änderungen am
Entwurf werden kenntlich gemacht. Antworten aus einem vorherigen Benutzer- oder
Workspace-Kontext können den aktuellen Verlauf nicht überschreiben.

Termine zeigen Zeitzone und MEZ/MESZ, damit die beiden Vorkommen einer Uhrzeit
bei der Herbstumstellung unterscheidbar sind. Die Speicherhinweise beziehen
sich auf die Arbeitskopie; die Oberfläche behauptet keinen Anbietererfolg.
Veröffentlichungsaktionen und Anbieteradapter bleiben in Arbeit.

**Prüfungen:** 15 gezielte Angularprüfungen, TypeScript, Produktionsbau,
Format und betroffene ESLint-Dateien erfolgreich. Vier Browserdurchläufe mit
Speichern, Wiederladen, Verlauf und Abbruch auf Desktop/Mobil in hell/dunkel
einschließlich AXE erfolgreich. Shared-UI-Prüfung und Suite-Audit erfolgreich.
Keine reale Anbieteraktion, Produktionsänderung, Push, PR oder Merge.

## 2026-10-09 – Juna – Cloud-Inseratversuche und Worker vorbereiten

**Arbeit:** Cloud-Aufträge an Worker, Konto, freigegebenes Profil und
Browser-Sitzung gebunden. Eine abgelaufene Vorbereitung wird erst nach
bestätigtem physischem Browserstopp erneut übernommen. Begonnenes Schreiben
bleibt bei Antwortverlust unklar. Späte Belege werden auch nach Ablauf des
Workers oder Kontolöschung dem ursprünglichen Versuch zugeordnet.

Worker-Ablauf und privater Datenbank-Service ergänzt. Die Vorabprüfung darf
vor dem einmaligen Schreibbeginn erfolgen. Vor dem ersten Foto-Upload muss
der Adapter den bestätigten Beginn abwarten. Fehlende Bestätigung löst keine
Anbieteraktion aus. Konto, Artikelkennung, Anbieterstatus und Bestätigungszeit
werden auch in der gespeicherten Antwort geprüft. Inseratberechtigungen
erlauben keine anderen Browseraktionen. Anbieteradapter, Fotobezug, Dispatch
und Erweiterungsanschluss bleiben offen; keine automatische Ausführung aktiv.

**Prüfungen:** Neue Migration separat erzeugt, frisch eingespielt und Typen
regeneriert. 150 Datenbankprüfungen, 545 Workerprüfungen (7 ausgelassen),
9 Skript-/Schemaregistrierungsprüfungen, Worker-Typen und Bau erfolgreich.
Container gebaut und beide neuen Module ohne Netzwerk geladen. Format,
betroffene ESLint-Dateien und Angular-Typen erfolgreich. Keine Produktion,
reale Anbieteraktion, installierte Erweiterungsänderung, Push, PR oder Merge.

## 2026-10-09 – Juna – Lokale Inseratversuche und Ergebnisannahme absichern

**Auftrag:** Die freigegebene Inseratumsetzung nach „dann weiter“ fortsetzen.

**Arbeit:** Übernahme, erneute Rechte-/Foto-/Artikelprüfung, einmaliger
Schreibbeginn und gebundene Ergebnisannahme ergänzt. Vorbereitung darf nach
abgelaufener Übernahme neu beginnen; nach möglichem Anbieter-Schreiben bleibt
der Ausgang unklar. Der Verlauf erkennt solche Ausfälle auch ohne laufende
Erweiterung. Späte Antworten bleiben mit Konto, ursprünglichem Geheimnis und
Versuchkennung verbunden, auch nach Widerruf oder Entfernen der Verbindung.
Wechsel von Kontoidentität oder Ausführer sowie Pause, Sperre und Trennung
entziehen alte Inseratfreigaben dauerhaft. Browseradapter, Erweiterungsanschluss
und Cloud-Ausführung fehlen weiterhin; keine Anbieteraktion wurde ausgelöst.

**Prüfungen:** Schema 464 registriert, separate Migration erzeugt und frisch
eingespielt; Typen erneut generiert. 130 Datenbankprüfungen, davon 27 zum lokalen
Ablauf mit synthetischen Ergebnissen, sowie 8 Skriptprüfungen erfolgreich.
Format, betroffene ESLint-Dateien und Angular-Typen erfolgreich. Keine
Produktionsmigration, installierte Erweiterungsänderung, reale Anbieteraktion,
Push, PR oder Merge.

## 2026-10-09 – Juna – Anbieterangaben und Inserataufträge weiter vorbereiten

**Auftrag:** Nach „dann weiter“ die freigegebene Inseratumsetzung fortsetzen.
Eigener Zweig sauber bei `8ec7aee5` übernommen; fremder Checkout bleibt unberührt.

**Arbeit:** Gemeinsame Formularverträge und Leser aus der beobachteten
Vinted-Struktur ergänzt. Tatsächliche ARIA-Auswahl statt versteckter Eingaben,
Kategoriepfad, Sperren und Kontoidentität geprüft. Offizielle Grenze von 20
Fotos dokumentiert. Kategorie- und Vorlagenwechsel erhalten keine alten,
widersprüchlichen Kennungen oder Zusatzattribute.

Eigene Inseratfreigaben und dauerhafte Aufträge speichern Inhalt, Originalfotos,
Konto, Ausführer und Termin unveränderlich. Doppelte Anfragen bleiben idempotent;
Verlauf und Abbruch prüfen Rechte und Version. Neue lokale Kopplung entzieht
alten Aufträgen die Freigabe. Widerruf während eines Schreibversuchs bewahrt
ein unklares Ergebnis. Noch keine Ausführung oder sichtbare Anbieteraktion.

**Prüfungen:** Neue Migration erzeugt und in der eigenen Testdatenbank frisch
eingespielt; Typen neu generiert. 94 Datenbankprüfungen, 42 Inhalts-/Terminmodelle,
8 Editorprüfungen, 5 Migrationsskriptprüfungen, 529 Workerprüfungen (7 weitere
ausgelassen) und 3 synthetische Formular-Browserprüfungen erfolgreich.
Worker-Typen, Worker-Bau und Container mit gemeinsamem Laufzeitmodul geprüft.
Angular-Typen, Produktionsbau, Format, betroffene ESLint-Dateien und Suite-Audit
erfolgreich. Keine Produktionsmigration, installierte
Erweiterungsänderung, reale Anbieter-Schreibaktion, Push, PR oder Merge.

**Weitere Umsetzung:** Geplante Aufträge lassen sich jetzt atomar durch einen
neuen gespeicherten Entwurfsstand und Termin ersetzen. Scheitert die Annahme,
bleibt der bisherige Termin bestehen. Auftrag, Version, Freigabe und Zielkonto
werden geprüft; begonnene Schreibversuche sind vom Ersatz ausgeschlossen.
Die Anfragenkennung macht auch diesen Ersatz wiederholbar. Neue Migration
separat erzeugt; die bereits versionierte erste Migration bleibt unverändert.
Frontend-Modell und Feature-Service prüfen große Textkennungen, Arbeitsbereich,
Entwurf, Revision, Aktion, Termin und Zeitzone. Der Status unterscheidet
Auftragsannahme, Anbieterprüfung, Vinted-Entwurf und unklares Ergebnis.

**Zusätzliche Prüfungen:** Frischer Reset einschließlich Ergänzungsmigration,
Typen erneut erzeugt; insgesamt 103 Datenbankprüfungen, 48 betroffene
Modellprüfungen und 6 neue Angular-Serviceprüfungen erfolgreich. Sieben
gezielte Migrations-/Registrierungsprüfungen und Suite-Audit erfolgreich.
Ausführung, Terminmaske und tatsächliche Anbieterbestätigung bleiben offen.

## 2026-10-09 – Juna – Vinted-Formulare nach Wiederverbindung geprüft

**Auftrag:** Mit „probier nochmal“ die Browserprüfung erneut versuchen.

**Recherche:** Angemeldetes Neuanlageformular und vollständige Bearbeitungsmaske
eines eigenen aktiven Inserats gelesen. Zwei Kategorien zeigen unterschiedliche
Größengruppen. Auswahlkennungen, zwei Farben/drei Materialien, Sendungsgrößen,
Dateiformate und Entwurf-/Veröffentlichungsaktionen dokumentiert. In der
Bearbeitung wurden Fotoaktionen, gesperrte Markenwechsel, KI-Fotohinweis und
kostenpflichtige Push-Option erkannt. Unterbrechungen nach Seitenwechseln durch
erneutes Verbinden überwunden. Keine Zugangsdaten oder versteckten Zustände gelesen.

**Grenze und Prüfung:** Auswahl nur im ungespeicherten Neuanlageformular erprobt;
bestehendes Inserat ausschließlich gelesen. Keine Fotos hochgeladen, keine
Anbieter-Speicherung, Veröffentlichung oder Löschung. Anbietergrenzen und
Schreib-/Ergebnisbelege bleiben offen. Nur Recherche und Dokumentation geändert;
keine neuen Anwendungstests, Builds, Migrationen, Pushes oder Produktionsänderungen.

## 2026-10-09 – Juna – Inseratumsetzung fortgesetzt

**Auftrag:** Mit „weiter“ die begonnene Inseratumsetzung fortsetzen.

**Stand:** Eigener Arbeitszweig bei `6ed63be8` sauber übernommen. Der Nutzer
hat die Vinted-Anmeldung bestätigt; die angemeldete Seite ist nachgewiesen.
Die Browserverbindung brach anschließend wiederholt ab, bevor das
Neuanlageformular gelesen werden konnte. Der Anbieterbericht unterscheidet
daher Anmeldung und tatsächlich bestätigte Formularfelder. Veralteten
Planabsatz zum noch nicht begonnenen Implementierungsstand korrigiert.

**Änderung:** Terminmodell berechnet UTC-Zeitpunkt und IANA-Zeitzone unabhängig
von der Gerätezeitzone. Übersprungene Uhrzeiten werden abgewiesen; doppelte
Uhrzeiten verlangen eine ausdrückliche Wahl. Neue Termine müssen zukünftig
sein. Die Fälligkeit berücksichtigt beide Ausfallregeln und die genaue
30-Minuten-Grenze. Das Modell ist eine vorbereitete Grundlage; ein
Planungsdialog und dauerhafte Veröffentlichungsaufträge sind noch offen.

**Prüfung:** 23 neue Terminprüfungen nach zunächst fehlender Funktion bzw.
fehlender Auswahlregel erfolgreich. Zusammen mit Inhalt und Entwurfsmodell
43 Modellprüfungen erfolgreich. Die Terminprüfungen bestehen zusätzlich mit
Gerätezeitzonen New York und Tokio. TypeScript, gezieltes ESLint, Format und
Testzuordnung erfolgreich. Keine Angular-Vorlagen oder Datenbankschemas
geändert; deshalb keine neuen Browser-/Datenbanktests oder Builds in dieser
Fortsetzung. Keine Anbieter-Schreibaktionen, Produktionsänderungen oder Pushes.

## 2026-10-09 – Juna – Grundlage für Vinted-Entwürfe, Fotos und Vorlagen

**Auftrag:** Mit „dann los“ den besprochenen Inseratplan umsetzen. Die Umsetzung
beginnt im eigenen Arbeitszweig auf `origin/master` bei `638b2ace`, einschließlich
der abgeschlossenen Nachrichten-/Verhandlungs- und Cloud-Korrekturen aus PR #356/#357.

**Änderung:** Eigene Entwürfe können ohne verbundenes Konto angelegt, automatisch
gespeichert, gesucht und weiterbearbeitet werden. Verkaufspreise werden bewusst
eingegeben. Private Fotos unterstützen Dateiauswahl, Drag-and-drop, Titelbild,
Reihenfolge und den vorhandenen Zuschneide-/Drehdialog. Die Bildkomponente wird
auch vom bisherigen Kleinanzeigeneditor genutzt. Vorlagen speichern ausgewählte
Angaben und zeigen Änderungen vor dem Übernehmen. Konto und Fotos bleiben außen vor.
Die neuen Schemas 460–462 prüfen Arbeitsbereich, Zielkonto, Anlegekennung und
Revision. Direkte Schreibrechte bleiben gesperrt; große interne IDs sind im
Client Zeichenketten. Uploadfehler dürfen bestätigte Originalfotos nicht löschen.
Die CLI-Migration wird um die deklarativen Rechte, Bucket-Daten und Storage-Policies
ergänzt; fremde Tabellenänderungen werden dabei abgewiesen.

**Grenze:** Der Vinted-Tab ist ausgeloggt; Anmeldung wurde angefragt. Anbieterfelder
und vollständige Schreibwege sind noch nicht bestätigt. Vinted-Entwurf,
Veröffentlichen, Termine, vollständige Live-Bearbeitung/Drawer und Relist bleiben
offen. Ebenso fehlen dauerhafte Bereinigung verwaister Uploads und Sicherungsregeln.
Die Oberfläche bezeichnet Entwürfe eindeutig als Speicherung nur in Flipbase.
Details stehen in `docs/research/2026-10-09-vinted-listing-provider-contract.md`.

**Prüfung:** 96 betroffene Angularprüfungen einschließlich Kleinanzeigeneditor,
30 Modell-/Navigationsprüfungen und 11 gezielte Skriptprüfungen bestehen.
56 neue Datenbankprüfungen bestehen nach vollständigem lokalem Reset einschließlich
der erzeugten Migration und privater Storage-Policies. Produktionsbau und
TypeScript-Prüfung bestehen. Vier Browserfälle mit künstlichen Daten prüfen
Desktop/Mobil, hell/dunkel, Kategorie, Entwurf, Fotos und Vorlagen; AXE findet
auf der Editorfläche keine Verstöße. Unabhängige Review-Funde zu Vorlagenfeldern,
Fotoersatz am Limit und Autosave während des Zuschnitts sowie eine Dialogsperre
nach Kontextwechsel sind durch Regressionstests reproduziert und behoben.
Kein Anbieter-Schreibtest, keine Produktionsmigration, kein Push/PR/Merge,
kein Deployment und keine Änderung
der installierten Erweiterung.

## 2026-10-09 – Juna – Vinted-Inserateditor und Veröffentlichung geplant

**Auftrag:** Bleam-Publish und Inseratverwaltung recherchieren; einen Plan für
Erstellen, Bilder, Entwürfe, Vorlagen, Veröffentlichung zum Termin, vollständige
Bearbeitung und späteres manuelles Relist entwickeln. Kontotransfer folgt später.

**Recherche und Entwurf:** Aktuelles `origin/master` und offenen PR #356 lesend
abgeglichen. Bleam-Publish, Zusatzaktionen, Termin-/Entwurfs-/Vorlagendialoge,
Inserat-Drawer, Relist und Archiv im vorhandenen Browser geprüft sowie offizielle
Hilfeseiten gelesen. Flipbase-/Vinted-Entwürfe, Vorlagen und Sicherungen getrennt
erklärt. Gemeinsame vollständige Erfassungsseite mit schneller Detailansicht rechts,
vorhandenem Bildeditor, bestätigten Anbieterfeldern, revisionsgebundenen Aufträgen
und nachvollziehbarer lokaler/Cloud-Ausführung vorgeschlagen. Echte Vinted-Entwürfe
in Version eins und die vorgeschlagene Ausfallregel sind noch abzustimmen.

**Dokumentation:** Produktentwurf und paketweiser Umsetzungsplan unter
`docs/superpowers/specs/2026-10-09-vinted-listing-publishing-design.md` und
`docs/superpowers/plans/2026-10-09-vinted-listing-publishing.md` im eigenen Zweig
`juna/vinted-listing-plan` auf aktuellem Masterstand angelegt. Vorhandene lokale
Arbeit im ursprünglichen Checkout und fremden PR-Zweig erhalten.

**Prüfung:** Quellen-/Dateipfadabgleich und Dokumentationsprüfung; keine
Anwendungsimplementierung, kein Anbieter-Schreibtest, keine Aktivierung,
Migration, Veröffentlichung oder Änderung der installierten Erweiterung.
Keine Anwendungstests oder Builds für diese reine Planung ausgeführt.

## 2026-10-10 - Juna - Sidebar- und Header-Feinschliff umsetzen

**Auftrag:**

1. Vinted-Feed in der Sidebar wieder integrieren: `/vinted-bot` (Vinted Feed) unter „Marktplätze“ mit den Unterlinks (`Vinted Feed`, `Suchfilter`, `Favoriten`) einbinden.
2. Header-Aufräumung & Steuerung: Umschalter für Theme (Hell/Dunkel) und Sprache (DE/EN) aus der oberen Header-Leiste entfernen und ausschließlich im Benutzer-Profil-Dropdown platzieren.
3. Benutzer-Dropdown Controls & Wording: Kein „Erscheinungsbild“, sondern klare Bezeichnungen „Design“ und „Sprache“. Echte segmentierte Umschalter (Pill-Switches) für `[ ☀️ Hell | 🌙 Dunkel ]` und `[ DE | EN ]`.
4. Sidebar-Höhenkorrektur unten: Administration und Einstellungen saßen durch den vorherigen 32px-Puffer zu hoch. Abstände gestrafft (`data-sidebar-lower pt-2`, `data-sidebar-divider mt-1.5 pt-1.5 pb-2`, `<nav pb-4>`).
5. Build- und Startfähigkeit sicherstellen: Unbenutzte Imports entfernen und Build-Fähigkeit (`npm run build`) verifizieren.

**Umsetzung:**

1. Navigationsmodell (`src/app/core/config/workspace-navigation.ts`): `/vinted-bot` mit `icon: 'bot'` und `children: VINTED_BOT_NAVIGATION` unter der Gruppe `marketplaces` integriert. In `SidebarComponent` wird `/vinted-bot` dynamisch an `settings.vinted` gekoppelt.
2. Übersetzungen (`src/app/core/i18n/translations.ts`): `NAV.VINTED_FEED: 'Vinted Feed'`, `COMMON.THEME: 'Design'`, `COMMON.LANGUAGE: 'Sprache'`, `COMMON.LIGHT: 'Hell'`, `COMMON.DARK: 'Dunkel'` in DE und EN hinterlegt.
3. Header (`src/app/layout/header/header.component.html`, `header.component.ts`): Standalone-Buttons aus der Kopfzeile entfernt. Im Benutzer-Dropdown segmentierte Umschalter für Design und Sprache mit Signal-Anbindung (`setTheme`, `switchLanguage`) ergänzt. Unbenutzten `DatePipe`-Import bereinigt.
4. Sidebar-Layout (`src/app/layout/sidebar/sidebar.component.html`): Spacing im unteren Bereich korrigiert (`pt-2`, `mt-1.5 pt-1.5 pb-2`, `nav pb-4`), sodass Administration und Einstellungen bündig und harmonisch am unteren Rand positioniert sind, ohne übermäßig nach oben geschoben zu werden.
5. Tests & Verifikation: `workspace-navigation.spec.ts`, `sidebar.component.angular.spec.ts`, `sidebar-ideas.angular.spec.ts` und `header.component.angular.spec.ts` sowie die E2E-Browsertests (`marketplace-accounts.spec.ts`, `dashboard-design.spec.ts`, `vinted-inbox-experience.spec.ts`) für die Theme-Umschaltung über das Benutzermenü angepasst.

**Prüfung:**

- Alle Unit- und Angular-Tests fehlerfrei bestanden (38x Angular-Komponententests, 25x Node-Navigationstests).
- `npm run typecheck` fehlerfrei bestanden.
- `npm run build` (Angular-Produktionsbau) erfolgreich und ohne Warnungen abgeschlossen.
- ESLint (`npx eslint`) und Prettier (`npx prettier --check`) auf allen modifizierten Dateien erfolgreich.

## 2026-10-10 - Juna - Header- und Sidebar-Designverfeinerung 1:1 umsetzen

**Auftrag:** Präzise 1:1-Nachbearbeitung von Header und Sidebar entsprechend den Design- und Layoutvorgaben:

1. Header-Polish: Benutzer-Avatar im satten Marken-Gelb `#fcc601` mit fettem schwarzem Initial und Dropdown-Chevron `▾`. DE/EN-Sprachumschalter mit aktiver Marken-Hervorhebung und dezentem Hover. Schnelle Umschalter für Sprache und Theme (Hell/Dunkel) zusätzlich direkt im Benutzer-Dropdown integrieren.
2. Sidebar-Footer & Administration-Positionierung: Beseitigung des doppelten `pb-8`-Abstands (im `<nav>` entfernt, im Footer als 32px-Puffer gegen den Browser-Link-Tooltip beibehalten). Dadurch sitzt der Punkt „Administration“ nicht mehr zu weit oben. Hinzufügen der Admin-Badge (`app-badge tone="admin"`) am Administration-Eintrag.
3. Marktplatz-Icons in der Sidebar: Die Einträge Vinted, eBay und Kleinanzeigen unter „Marktplätze“ erhalten ihre jeweiligen Original-Plattform-Logos (`vinted.svg`, `ebay.svg`, `kleinanzeigen.svg`), identisch zu ihrer Darstellung in den Verkäufen.

**Umsetzung:**

1. Navigationsmodell: `WorkspaceNavigationItem` um die optionale Eigenschaft `platform` erweitert und in `WORKSPACE_NAVIGATION_GROUPS` für Vinted, eBay und Kleinanzeigen hinterlegt.
2. Sidebar: `SidebarComponent` bindet `marketplacePlatformAppearance` ein und rendert für Marktplatz-Einträge mit Plattform-Schlüssel das entsprechende SVG (`size-4 shrink-0 object-contain`). Das Padding des `<nav>` wurde auf `pb-2` angepasst, während der Puffer am Footer (`pb-8`) beibehalten wird. Am Eintrag `Administration` wurde die Admin-Badge ergänzt.
3. Header: Benutzer-Avatar auf `bg-[#fcc601] text-black font-black` mit Dropdown-Pfeil `▾` aktualisiert. Der DE/EN-Switcher hebt die aktive Sprache mit `bg-[#fcc601] text-black font-bold` hervor. Im Benutzer-Dropdown wurden Direktsteuerungen für Sprache und Design (Hell/Dunkel) integriert.

**Prüfung:**

- 82 Tests der betroffenen Bereiche fehlerfrei bestanden (17x `sidebar.component.angular.spec.ts`, 15x `workspace-navigation.spec.ts`, 10x `sidebar-ideas.angular.spec.ts`, 10x `header.component.angular.spec.ts`, 14x `header-notification-visuals.spec.ts`, 13x `header-notification-actions.spec.ts`, 3x `header-role-and-timer.spec.ts`).
- Vollständige Vitest-Suite mit 456 Testdateien und 4.735 Tests ohne Fehler bestanden.
- Typprüfung (`npm run typecheck`), Linter (`npm run lint`) und Prettier-Formatierungsprüfung (`npm run format:check`) erfolgreich.

## 2026-10-09 - Juna - Sidebar-Navigation & Modulare Marktplatz-Steuerung refaktorisieren

**Auftrag:** Die Sidebar-Navigation und Informationsarchitektur intuitiver und modularer gestalten:

1. Warenwirtschaft schärfen: Konsolidierung auf Kern-Wawi (`Einkäufe`, `Artikel & Bestand`, `Verkäufe`). Entfernung des isolierten 1-Item-Headers „Einkauf“ und Ausgliederung von „Inserate“, da Inserate plattformspezifisch gepflegt werden.
2. Modulare Marktplätze: Neue Navigationsgruppe „Marktplätze“ (Vinted, eBay, Kleinanzeigen). Marktplätze sollen einzeln unter `/settings/marketplaces` aktivierbar/deaktivierbar sein; inaktive Marktplätze verschwinden samt Unterbereichen aus der Sidebar.
3. Neuer Marktplatz Kleinanzeigen: Einrichtung der Route `/marketplaces/kleinanzeigen` und des zugehörigen Workspace-Hubs.
4. Browser-Link-Puffer: Hinzufügen einer Pufferzone (`pb-8`) im Footer der Sidebar, damit der temporäre Ziel-URL-Tooltip moderner Browser beim Hovern über Links die Punkte „Einstellungen“ und „Administration“ nicht überdeckt.
5. Cross-Listing-Konzept: Architektur- und Transferplan für das Übertragen von Inseraten (Vinted ➔ Kleinanzeigen) ausarbeiten.

**Umsetzung:**

1. Reaktivität & Settings: `MarketplaceSettingsService` mit Signals und LocalStorage-Persistenz (`flipbase_marketplace_settings`) für schnelles Umschalten ohne Neuladen.
2. Navigationsmodell: `WORKSPACE_NAVIGATION_GROUPS` in `workspace-navigation.ts` angepasst (`merchandise`, `marketplaces`, `finances`, `tools`). Unbenutzter Import entfernt.
3. Sidebar-Filterung: `SidebarComponent` filtert Menügruppen reaktiv per `computed()` unter Einbezug von `MarketplaceSettingsService` und Betreiberstatus. `pb-8` Pufferzone im Sidebar-Footer ergänzt.
4. Einstellungsseite: `MarketplacesSettingsComponent` unter `/settings/marketplaces` erstellt und in `settings.routes.ts` sowie `SettingsShellComponent` integriert.
5. Kleinanzeigen-Workspace: `KleinanzeigenWorkspaceComponent` unter `src/app/features/marketplaces/components/kleinanzeigen-workspace/` angelegt und in `marketplaces.routes.ts` geroutet.
6. Dokumentation & Mockup: Konzeptdokument `docs/superpowers/plans/2026-10-09-cross-marketplace-listing-transfer.md` und interaktives HTML-Mockup im Brain-Ordner erstellt.

**Prüfung:**

- 51 automatisierte Tests bestanden (15x `sidebar.component.angular.spec.ts`, 14x `workspace-navigation.spec.ts`, 10x `sidebar-ideas.angular.spec.ts`, 4x `settings-shell.component.angular.spec.ts`, 3x `marketplace-settings.service.dom.spec.ts`, 3x `settings.routes.spec.ts`, 2x `marketplaces-settings.component.angular.spec.ts`).
- E2E-Tests in `e2e/marketplace-accounts.spec.ts` und `e2e/vinted-workspace-ui.spec.ts` aktualisiert, sodass Kontoverwaltungstests direkt die vorgesehene Route `/marketplaces/vinted/accounts` ansteuern.
- Vollständige Typprüfung (`npm run typecheck`) ohne Fehler abgeschlossen.
- ESLint und Prettier auf allen geänderten und neuen Dateien erfolgreich und fehlerfrei ausgeführt.

## 2026-10-09 - Juna - PayPal-Zahlungsart und 8-USD-Grenze für IPRoyal vorbereiten

**Auftrag:** Neue IPs direkt über eine hinterlegte Zahlungsart statt Guthaben
bezahlen und das Preisangebot auf höchstens 8 USD je 30-Tage-IP begrenzen.

**Änderung:** Private Zahlungsarten-ID im Worker, lesende Prüfung über
`GET /cards` und Übergabe als `card_id`. Das echte Anbieter-Konto liefert eine
hinterlegte PayPal-Zahlungsart über Paddle. Kein Guthaben-Rückfall und keine
automatische Verlängerung. Preisprüfung einschließlich Steuern vor Kaufabsicht
und Zahlungsaufruf, mit gesondertem Hinweis bei Überschreitung; die Grenze ist
weiter senkbar. Die bisher unbegrenzte produktive Nachbuchung wurde während
der Umstellung ausgeschaltet, ohne offene Cloudarbeit. Neue PayPal-Abbuchung
und Preisbindung durch den Anbieter bleiben echte Live-Nachweise.

**Prüfung:** Neue Zahlungs-/Preisgrenzentests zunächst am bisherigen Worker
fehlgeschlagen, danach erfolgreich. Grenze von 8 USD und Überschreitung von
8,01 USD, fehlende oder ungeeignete Zahlungsart, kein Guthaben-Rückfall sowie
bestehender Schutz vor doppelten Zahlungen geprüft, auch bei unbezahlter
PayPal-Bestellung und Neustart. 36 gezielte Workerprüfungen, 45 Angularprüfungen
und drei Modellprüfungen bestehen. Typprüfung, Format/Lint, Angular-Produktionsbau
sowie Worker-Containerbau und Modulimport erfolgreich. Der öffentliche Worker
bleibt erreichbar; anonyme Einrichtung wird abgewiesen. Keine echte Bestellung
ausgelöst. Der inzwischen veröffentlichte Hauptstand mit der Vinted-Zugriffsprüfung
wurde integriert; beide Änderungsprotokolle bleiben vollständig erhalten.

## 2026-10-09 - Juna - Vinted-Zugriff nach gescheitertem Profilabruf prüfen

**Auftrag:** Widersprüchliche Cloud-Anzeige bei Maike Vintage untersuchen und
den Einstieg in die Browserprüfung korrigieren.

**Befund:** Der manuelle Profilabruf scheitert mit HTTP 403; der Nutzer bestätigt,
dass der Cloud-Browser nicht mehr angemeldet ist. Die gespeicherte Verbindung
bleibt `connected`. Der Diagnose-Link öffnete die Verbindungsübersicht ohne
den vorhandenen Wiederanmeldemodus. Der Grund für das Ende der Anmeldung ist
damit noch nicht geklärt.

**Änderung:** „Vinted-Zugriff prüfen“ nutzt denselben kontogebundenen Prüfmodus
wie der bestehende Wiederanmeldeeinstieg. Der Dialog bezeichnet die gespeicherte
Verbindung als „Verknüpft“ und erklärt einen unbestätigten Zugriff ausdrücklich.
Die beiden Anmeldebuttons verwenden für Pfeil und externen Link die vorhandene
Icon-Funktion des gemeinsamen Buttons. Projizierte SVGs standen im Textbereich
und rutschten dort unter die Beschriftung.
Nach einem erfolgreich abgeschlossenen manuellen Abruf ohne Quellenfehler
entfernt der Server ältere Anmelde-, Ablehnungs- und Prüfungswarnungen des
Zeitplans. Pause, Abstand und Freigabeversion bleiben erhalten. Neuere Änderungen,
Quellenfehler und unbestätigter Browserstopp verhindern die Bereinigung. Die
Migration bereinigt vorhandene Warnungen, wenn der neueste Auftrag diesen Erfolg
bereits nachweist. Keine automatische Wiederaufnahme oder Änderung des Browserprofils.

**Ergänzung:** Nach erfolgreicher Cloud-Anmeldung startet der bestehende
manuelle Kontoabruf automatisch und zeigt sein Fortschrittsmodal. Beim Wechsel
von lokal auf Cloud erfolgt dies erst nach bestätigtem Cloud-Abschluss; ein
Kontowechsel oder ungeklärter Browserstopp verhindert einen falschen Erstabruf.
Die Cloud-Versandsteuerung steht mit Erklärung in den Kontoeinstellungen unter
„Nachrichtenversand“, nicht mehr unter dem Chat. Widerruf und Versionsprüfung
bleiben beim vorhandenen Serververtrag. Keine neue Versandfreigabe oder
Aktivierung von Verhandlungsregeln durch Anmeldung oder Erstabruf.
Der Anmeldedialog bleibt beim Neuladen der Kontoliste erhalten, damit der
Erstabruf auch im routenbasierten Anmeldeweg ohne SMS startet.

**Prüfung:** Der fehlerhafte Einstieg und die Statusmeldung sind in gezielten
Renderingtests reproduziert. 81 betroffene Angularprüfungen einschließlich DOM-AXE,
Produktionsbau, ESLint, Format und Diffprüfung bestehen. Die Icon-Regression ist
auf Desktop/Mobil durch tatsächliche Positionen reproduziert. Fünf erfolgreiche
Browserprüfungen decken zusätzlich Anmeldekorrektur und SMS-Bestätigung ab.
Die neue Zeitplanregression scheitert am bisherigen Servercode. 107 Datenbanktests
bestehen nach dem Fix, 110 inklusive separatem Migrationsabgleich. 13 zusätzliche
Angularprüfungen bestätigen die sofortige Warnungsbereinigung mit erhaltener Pause.
Die Ergänzungen bestehen nach Integration des aktuellen Hauptstands alle 673
Angularprüfungen im Marktplatzbereich einschließlich drei zusätzlicher
AXE-Prüfungen für laufende, erfolgreiche und fehlgeschlagene Fortschrittsicons.
Elf Browserfälle decken Anmeldebuttons, Korrektur von
Zugangsdaten, SMS, Cloud-Einrichtung, lokalen Cloud-Wechsel und Versandsteuerung ab.
Produktionsbau, ESLint, Format und Diffprüfung bestehen. Die bestehenden
Renderingtests laden die hinzugekommenen Vorlagen; Kontrastprüfungen warten nach
dem verschachtelten Dialog auf das Ende der Einblendanimation.

**Echtkonto:** Nach der erneuten Anmeldung bestätigt der manuelle Abruf vom
09.10.2026 um 14:55 Uhr Profil, Inserate, Bewertungen und Gesprächsliste als
vollständig. Nachrichten und Verkäufe bleiben Teilantworten. Die frühere
Synchronisierungspause bleibt erhalten; keine automatische Wiederaufnahme oder
Aktivierung der neuen Verhandlungsregeln durch diese Prüfung.

## 2026-10-09 - Juna - IPRoyal-IPs bei fehlendem Bestand nachbuchen

**Auftrag:** Bei berechtigter Cloud-Einrichtung vorhandene IPs verwenden und bei
fehlender Kapazität automatisch eine deutsche Dedicated-ISP-IP nachbuchen.
Vorgabe: immer 30 Tage, aktueller Anbieterpreis ohne Preisobergrenze;
Kundenabonnements erst später anbinden.

**Änderung:** Optional aktivierbare Nachbuchung im Chromiumworker, dauerhafte
Kaufabsichten und globale Kaufsperre gegen Doppelzahlungen, geprüfter
Bestandsimport vor Reservierung, Wiederaufnahme bekannter Bestellungen und
Freigabe bestätigter IPs verlassener Einrichtungen. Ungeklärte Zahlungen bleiben
gesperrt. Wartestatus und gleiche Anfragekennung in der Oberfläche; separate
optionale IP-Grenzen als Anschluss für spätere Pakete. Deklaratives Schema,
erzeugte Migration und lokal neu erzeugte Datenbanktypen gehören zusammen.

**Prüfung:** 121 betroffene Datenbankprüfungen nach vollständiger
Migrationswiederholung und ein Konkurrenztest mit zwei Datenbanksitzungen.
Gezielte Worker-, Modell-, Angular- und Schema-/Migrationsprüfungen sowie
Typprüfung, Format/Lint, Angular-Produktionsbau und echter Worker-Containerbau
mit Modulimport. Lesende Anbieterprobe bestätigt den deutschen 30-Tage-Tarif
und aktuell 4 USD. Keine Bestellung ausgelöst, keine produktive Aktivierung.

## 2026-10-09 - Juna - Benachrichtigungs-Dropdown-Layout an Mockup anpassen

**Auftrag:** Das Layout des Benachrichtigungs-Dropdowns im Header exakt an das Mockup-Design anpassen: Bisher war die Kopfzeile durch äußeres Padding eingerückt und die Einträge wirkten wie kleine isolierte Karten mit Randabstand. Das Dropdown soll einen durchgehenden Kopfbereich mit Kante-zu-Kante-Trennlinie (`border-b border-fb-line`) und eine nahtlose, durchgehende Eintragsliste (`divide-y divide-fb-line`, `px-4 py-3.5`) ohne äußeres Padding und ohne abgerundete Einzelkarten erhalten.

**Umsetzung:**

1. Header-Dropdown (`header.component.html`):
   - Äußeres Padding `p-3` und `space-y-2` auf dem Menü-Container entfernt, `overflow-hidden` ergänzt.
   - Kopfbereich erhält `px-4 py-3 border-b border-fb-line bg-fb-surface` für eine klare, durchgehende Trennung von Rand zu Rand.
   - Fehlerbox spannt ebenfalls über die volle Breite (`px-4 py-2 border-b border-fb-line`).
   - Eintragsliste nutzt `divide-y divide-fb-line` und jede Zeile füllt die volle Breite (`px-4 py-3.5`) ohne eigene Rundung (`rounded-lg`), sodass der Hover-Effekt und die Trennlinien bündig von Kante zu Kante verlaufen.

**Prüfung:**

- Angular-Komponententests in `header.component.angular.spec.ts` (8 Tests, alle bestanden).
- Unit-Tests in `header-notification-visuals.spec.ts` (14 Tests, alle bestanden).
- Typprüfung (`npm run typecheck`), ESLint und Prettier ohne Beanstandung.

## 2026-10-09 - Juna - Angebotsaktionen und Verhandlungsautomatik umsetzen

**Auftrag:** Den abgestimmten Verhandlungsentwurf für Cloud und Extension
umsetzen: manuelle Angebotsaktionen, Preisgrenzen und Stufen, alternative
Ereignistexte und Nachrichtenfolgen, Verzögerungen sowie Kaufnachrichten.

**Änderung:** Manuelle Annahme, Ablehnung und Gegenangebot im Chat sowie
kontobezogene Verhandlungsregeln für Cloud und Extension. Preise, Bereiche,
Stufen, Vorschau, Alternativen und echte Nachrichtenfolgen mit Wartezeiten sind
konfigurierbar. Kaufnachrichten wirken unabhängig. Eigene dauerhafte Jobs und
Freigabe-/Kontoprüfungen verhindern veraltete und doppelte Schreibversuche;
unklarer Ausgang wird nicht erneut versendet. Neue Einstellungen bleiben aus.

**Prüfung:** 117 neue und 676 bestehende Datenbankchecks auf der transaktionalen
Migrationskopie; erzeugte Migration/Typen und identische Funktionsrechte.
Cloud-/Extensionregressionen, tatsächlicher Worker-Image-Bau samt Modulimport,
40 Modell-/Navigationstests, 86 relevante Angularprüfungen und zehn Mock-
Browserabläufe mit AXE auf Desktop/Mobil in hell/dunkel erfolgreich.
Produktionsbau, Format/Lint und Shared-UI bestehen. Die bestehende vollständige
Deno-Lintbaseline bleibt offen; ein gefilterter Lauf ist kein vollständiger
Lintnachweis. Aufgabenreviews, Zweigreview und abschließende Nachprüfung sind
abgeschlossen. Der einzige fachliche Abschlussbefund ist behoben: Unklarer
Schreibausgang bleibt ausdrücklich unbestätigt, sicherer Fehler wird getrennt
angezeigt. Zwei neue Renderingregressionen, die betroffene Komponente mit elf
Tests, erneuter Produktionsbau, Format/Lint und branchweiter Diffcheck bestehen.

**CI-Korrektur (PR356):** Nachlass und Preisbereichsgrenze verwenden explizite
FormControl-Konstruktionen für die bestehende Formularbindungsprüfung. Die
Smoke-Erwartungsliste enthält die sechs vorhandenen Bot-Icon-/Lesestatusfälle.
54 Formularbindungs- und elf Komponententests, beide Smoke-Auswahlprüfungen,
Produktionsbau sowie gezieltes Format/Lint bestehen; Assertions und
Testauswahl bleiben unverändert.

Das isolierte Chromium-Sitzungsimage erhält jetzt ebenfalls die gemeinsame
Verhandlungslaufzeit. Der fehlende Modulimport ist im tatsächlichen Image vor
dem Fix reproduziert; danach bestehen die Aktionsimporte ohne Netzwerk und mit
schreibgeschütztem Dateisystem. Beide Image-Workflows prüfen diesen Import vor
ihren Browser-Smokes. 54 gezielte Kanal-/Isolations-/Angebotsprüfungen bestehen.
Der Workspace-Test registriert die neuen Angebotsaktionen und das Zahlenfeld;
alle 55 Workspace-/Angebotsaktionstests bestehen.

**Grenze:** Bestätigte Zahlungen sind belegte Kaufauslöser. Für die separate
Käuferannahme unseres Gegenangebots fehlt bislang ein eindeutiger Anbieterbeleg;
die Oberfläche erklärt die Nichtverfügbarkeit und bewahrt gespeicherte Texte.
Keine echte Anbieteraktion oder produktive Aktivierung. PR356 ist nach
Nutzerfreigabe erstellt; die vollständige CI und Veröffentlichung stehen aus.
Umsetzungs- und Prüfstände: [Plan](superpowers/plans/2026-10-09-vinted-negotiation.md).

## 2026-10-09 - Juna - Verhandlungsseite im Browser analysieren

**Auftrag:** Die geöffnete Bleam-Seite „Automatische Verhandlung“ lesen und
Preisregeln, Stufen, Ereignisnachrichten sowie Versandverzögerungen für Flipbase
ableiten; zusätzlich Nachrichten nach Annahme und allgemeinem Kauf aufnehmen.

**Beobachtung:** Preisbereiche mit Euro-Nachlass, Stufen als Anteil dieses
Nachlasses, zufällig gewählte alternative Texte je Verhandlungsmoment,
Minuten-/Sekundenverzögerung und Reihenfolge Nachricht/Angebot. „Nachrichten nach
der Annahme“ betrifft dort erneutes Verhandeln, keine belegte Kaufnachricht.
Auswahlmenü nur geöffnet und geschlossen; keine fremden Einstellungen geändert.

**Ergebnis:** Bestehendes Rechercheprotokoll und Angebotsplan ergänzt. Eigener
Menüpunkt, gemeinsame Regeln für Cloud/Extension, separate Ereignisse für
Annahme/Kauf, optionale echte Nachrichtenfolgen zusätzlich zu Textalternativen
und dauerhaft geplante Folgeschritte. Die frühere Einmal-Gegenangebotsauswahl
ist durch den neuen Stufenauftrag ersetzt. Aktions-/Ereignisnachweise bleiben
Voraussetzung vor Umsetzung und Aktivierung; keine erfundenen Provider-APIs.

**Prüfung:** Sichtbare Oberfläche samt Hilfetexten gelesen, aktuelle Navigation
und bestehende Angebotsplanung abgeglichen; Formatprüfung und Diffcheck für die
Dokumentation. Keine Produktänderung, kein Versand und keine Änderung am Flipbase-Betrieb.
Die bereits geprüften Bot-Icon-/Lesestatusänderungen bleiben unverändert.

## 2026-10-09 - Juna - Angebotsaktionen und automatische Verhandlung aufnehmen

**Auftrag:** Manuelles Annehmen/Ablehnen/Gegenangebot im Chat und eine pro Konto
konfigurierbare Annahmegrenze mit Reaktion auf zu niedrige Angebote prüfen.

**Befund:** Die Favoritenregeln samt Verzögerung und optionalem Preisvorschlag
sind für Extension und Cloud im aktuellen Code verdrahtet. Ihr kontrollierter
Echtkonto-Abnahmetest bleibt offen. Erhaltene Angebote werden bislang angezeigt;
Annahme/Ablehnung und eine darauf bezogene Verhandlungsautomatik fehlen.
Bleams eigene Hilfe dokumentiert Preisgrenzen und automatische Gegenangebote.

**Ergebnis:** Den Ergänzungsauftrag im bestehenden Angebotsplan aufgenommen,
mit konkreter Chatbedienung, Daten-/Aktionsnachweisen und getrennten Regeln.
Die Gegenangebotsstrategie ist noch mit dem Nutzer abzustimmen. Keine neuen
Anbieterendpunkte angenommen, keine Produktänderung und keine Vinted-Schreibaktion.
Formatprüfung und Diffcheck sind die Prüfungen dieser reinen Analyseergänzung;
die vorher geprüften Bot-Icon-/Lesestatusänderungen bleiben unverändert.

## 2026-10-09 - Juna - Geöffnete Vinted-Gespräche als gelesen speichern

**Auftrag:** Ein geöffnetes und erfolgreich synchronisiertes Gespräch soll in
Flipbase den Status von ungelesen auf gelesen wechseln.

**Änderung:** Cloud und Extension bestätigen den Lesestatus erst nach dem
vollständigen Gesprächsabruf. Die gespeicherte Version hängt von Kontoidentität
und eingegangenen Nachrichtenkennungen ab. Wiederholte Importe und eigene
Antworten lassen das Gespräch gelesen; ein neuer Eingang wird wieder ungelesen,
auch bei identischem Text und Datum. Fehlgeschlagene oder abgebrochene Abrufe
und verspätete Bestätigungen können neuere Eingänge nicht als gelesen markieren.
Die passenden Glockenmeldungen werden ebenfalls gelesen. Vinteds eigener
Lesestatus wird durch diesen Flipbase-Lesebeleg nicht geändert.

**Datenbank:** Gesonderte Lesespalte mit geprüftem Konto-/Workspace-Zugriff;
Bestätigung über den vorhandenen Importlock. Die Migration wurde per
`supabase db diff` erzeugt, auf die betroffenen Anweisungen begrenzt und auf einer
frischen Wegwerfkopie transaktional geprüft. Datenbanktypen wurden neu erzeugt.

**Prüfung:** Die gezielten Komponenten-/Modelltests, 267 Datenbankprüfungen und
14 Browserabläufe mit AXE bestehen, einschließlich Cloud/Extension, Neuladen,
Ungelesenfilter und gleichzeitigem Eingang. Produktionsbau, Typprüfung, ESLint,
Formatierung und Diffcheck bestehen. Die älteren Kontotests benötigen in der
isolierten Kopie ihren bisherigen Archivierungs-Fixture; der Schutztrigger
wurde dort nach dem Test wieder aktiviert. Keine produktive Datenbankänderung
und keine Vinted-Schreibaktion. Die Ergänzung bleibt mit dem Bot-Icon auf dem
eigenen, noch nicht veröffentlichten Zweig. Der aktuelle Hauptzweig ist integriert;
beide Einträge im additiven Changelog-Konflikt bleiben vollständig erhalten.

## 2026-10-09 - Juna - Automatische Chatantworten mit Bot-Icon kennzeichnen

**Auftrag:** Automatisch von Flipbase gesendete Antworten erhalten ausschließlich
in Flipbase ein Bot-Icon anstelle des eigenen Profilbilds. Für Flipbase hat der
Nutzer Backend-Änderungen ausdrücklich freigegeben; die globale Frontend-Grenze
seiner anderen Arbeitsprojekte gilt hier nicht.

**Änderung:** Der bestehende Chatabruf ordnet bestätigte Automatik-Versandbelege
über Nachrichten-ID, Workspace, Konto und vorhandene Gesprächs-ID zu. Einträge
aus Cloud und Extension werden identisch dargestellt. Gleiche Texte, fremde
Konten, unbestätigte Ergebnisse und importierte Herkunftsbehauptungen reichen
nicht aus. Manuelle Nachrichten behalten ihr Profilbild. Das runde Bot-Icon
trägt den zugänglichen Hinweis „Automatisch von Flipbase gesendet“.

**Datenbank:** Der bereits abgesicherte Chatabruf liest private Versandbelege
mit ausdrücklich geprüfter Benutzeridentität und Kontozuordnung. Die Belegtabelle
bleibt für Clients gesperrt; ein begrenzter Index beschleunigt die Zuordnung.
Die Migration wurde mit `supabase db diff` auf einer isolierten Testkopie erzeugt,
auf die betroffenen Funktions-/Indexanweisungen begrenzt und transaktional auf
einer frischen Kopie geprüft. Die neu erzeugten Datenbanktypen bestätigen die
unveränderte RPC-Signatur; keine manuelle Änderung generierter Typen.

**Prüfung:** 72 Komponenten-/Modelltests, vier Browserprüfungen mit AXE für
Cloud/Extension bei 1440/390 px und 154 Datenbankprüfungen bestehen. Die älteren
Kontotests verwenden in der Wegwerfkopie ihr bisheriges Archivierungs-Fixture;
der neue Herkunftstest prüft die reguläre Archivierungsaktion. Produktionsbau,
Typprüfung, ESLint, Formatierung, Shared-UI-Prüfung und Diffcheck bestehen.
Keine Vinted-Nachricht gesendet und keine produktive Migration ausgeführt.

## 2026-10-09 - Juna - Benachrichtigungs-Dropdown modernisieren und Plattform-Logos einführen

**Auftrag:** Benachrichtigungs-Dropdown im Header refaktorisieren: Die aufdringliche gelb-beige Ganzzeilen-Tönung (`bg-fb-brand-surface`) für ungelesene Einträge durch ein modernes, dezentes Ungelesen-Muster mit klarem Indikatorpunkt ersetzen, und vor Marktplatz-Benachrichtigungen (Vinted, eBay, Kleinanzeigen) das jeweilige Plattform-Logo sowie für Einkäufe, Verkäufe und Systemankündigungen passende Typ-Icons anzeigen.

**Umsetzung:**

1. Hilfsmodul `header-notification-visuals.ts`: Automatische Erkennung des visuellen Erscheinungsbilds (Vinted anhand von Marktplatz-Favoriten-, Feedback- und Gesprächs-IDs, Links sowie Verkaufstexten; eBay und Kleinanzeigen anhand von Links/Verkäufen; passende Fallback-Icons für Einkäufe, Verkäufe, System und Alerts) sowie kompakte Datumsformatierung (heutige Uhrzeit, "Gestern", oder Datum).
2. Header-Komponente und Template (`header.component.html`, `header.component.ts`):
   - Ungelesene Meldungen erhalten eine ruhige, neutrale Hintergrundschattierung (`bg-fb-subtle`), einen Indikatorpunkt im Flipbase-Markengelb (`#fcc601`) und halbfetten Titel ohne blauen Texthover.
   - Jede Meldung zeigt links ein einheitliches 32x32-Badge mit dem offiziellen Vinted-, eBay- oder Kleinanzeigen-Vektorlogo bzw. dem entsprechenden Typ-Icon (Einkaufspaket, Trendlinie, Systemsternchen).
   - Kopfbereich mit neutralem Glocken-Icon und markenkonformem Gelb-Badge für die Anzahl neuer Meldungen.
   - Freundlicher leerer Zustand bei keinen neuen Meldungen.
3. Favoriten-Meldungstext (`marketplace-favorite-notifications.ts`):
   - Titel auf 'Artikel wurde favorisiert · [Konto]' umgestellt.
   - Nachricht zeigt direkt den Artikeltitel ohne unlogische 'Favoritenzahl +1'-Angabe.

**Prüfung:**

- Unit-Tests in `header-notification-visuals.spec.ts` (14 Tests, alle bestanden).
- Angular-Komponententests in `header.component.angular.spec.ts` (8 Tests, alle bestanden) inklusive Prüfung auf Vinted-Logo und Ungelesen-Indikator.
- Model- und Store-Tests in `marketplace-favorite-notifications.spec.ts` und `marketplace-favorite-notification.store.angular.spec.ts` (alle bestanden).
- E2E-Erwartungstext in `vinted-workspace-ui.spec.ts` an den neuen Favoritentext angepasst.
- Alle 135 Node-Tests für Header und Marktplatz-Modelle bestanden.
- Typprüfung (`npm run typecheck`), ESLint und Prettier ohne Beanstandung.

## 2026-10-09 - Juna - Hosenmaße direkt in der Größenübersicht zeigen

**Auftrag:** Die allgemeine Hosenübersicht soll neben der flachen Bundweite
auch belegte Innenbein- und Außenbeinbereiche anzeigen. Der Tabellenplatzhalter
„Am Stück messen“ erklärt keine Vergleichswerte und wird entfernt.

**Umsetzung:** Die bestehenden Damen- und Herrentabellen enthalten Innenbein,
Außenbein einschließlich Bund und vordere Leibhöhe. Aus Herstellermaßtabellen
werden pro Buchstabengröße die kleinsten und größten veröffentlichten Werte
zusammengefasst: drei Damenschnitte von zwei Marken und vier Herrengrößenreihen
von drei Marken. Ein Rechercheagent prüft Werte, Messdefinitionen, Quellen und
Randgrößen. Fehlende Werte werden weder interpoliert noch aus anderen Längen
berechnet. Quellen bleiben in der gemeinsamen aufklappbaren Liste.

**Einordnung:** Diese begrenzten Hersteller-Beispiele sind keine universellen
Größenbereiche oder Vintage-Norm. Allgemeine W-/Länder-Gegenstellungen und
Längenbeispiele müssen nicht gemeinsam an einer Hose vorkommen. Die Länge
ändert keine XS–XL-Weitenschätzung; Innenbein bleibt separat mit nominellen
L-Angaben vergleichbar. Umgebrochene Spaltenköpfe halten alle Maße auf dem
Desktop sichtbar; breite Tabellen bleiben mobil seitlich erreichbar.

**Prüfung:** 72 Modelltests und 19 Angular-Tests erfolgreich; gezieltes ESLint,
Formatierung, Typprüfung, Shared-UI-Prüfung und Produktionsbau bestanden.
Isolierter Chromium-Test mit synthetischer Sitzung und RPC-Antworten auf
Desktop und Mobilgerät prüft Tabellenwerte, Filter, unabhängige Weite/Länge,
Kinderlabels, Quellenliste, Ausfall und Wiederholung sowie seitliche
Erreichbarkeit der Maßspalten. AXE WCAG AA ohne Befunde und keine Seitenfehler;
einziger Konsolenfehler ist der absichtlich simulierte HTTP-503.
Browser-Plugin nicht verfügbar; vorhandenes Playwright verwendet. Keine
produktive Anmeldung, Datenbankänderung oder neue Abhängigkeit. Kein Push.

**Freigabe:** Nutzer bestätigt PR-Erstellung, erfolgreiche Pflichtprüfungen,
Merge und anschließendes Aufräumen. `origin/master` vor dem Push aktualisiert;
der geprüfte Zweig basiert bereits auf dessen aktuellem Stand `cb463edf`.
Nach dem Merge wird die öffentliche Version samt Commit kontrolliert.

## 2026-10-09 - Juna - Kinderlabels und Hosenlängen ergänzen

**Auftrag:** Quellen nicht unter jeder Karte zeigen, Nike-/adidas-Kindergrößen
ergänzen, Bundumfang aus der allgemeinen Hosenübersicht entfernen und Innen-
sowie Außenbeinlängen sichtbar erklären. Zwei Rechercheagenten prüfen die
Herstellerquellen für Kinderlabels und Hosenlängen und anschließend die Tabellen.

**Umsetzung:** Gemeinsame aufklappbare Quellenliste für recherchierte und
veröffentlichte Tabellen. Sechs Kinderreferenzen unterscheiden Nike Jungen,
Mädchen und CN-Labels sowie adidas EU- und US-Jugendgrößen. Suchangaben wie YM,
M/147, 160 oder 160/80 werden im jeweiligen Kindersystem nachgeschlagen.
Körpergröße bleibt von gemessenen Kleidungsmaßen getrennt; Kinder-M ist kein
Erwachsenen-M. Regionale und heutige Passformen belegen keine identischen
historischen Labels. Veröffentlichte Erwachsenen-Unisex-Referenzen erscheinen
nicht im Kinderfilter, und Quellen werden beim Sitzungswechsel zurückgesetzt.

**Längen:** Die Hosenübersicht zeigt nur die flache Bundweite. Eine eigene,
direkt erreichbare Längensektion enthält bonprix-Richtwerte für Damen Kurz,
Normal und Lang sowie Herren Normal-, untersetzte und schlanke Größen.
Diese Herstellerreferenzen sind keine allgemeine Norm oder feste Länge je
XS–XL. Außenbein einschließlich Bund am Kleidungsstück messen; keine erfundenen
Außenbeinbereiche oder feste Zugabe zur Innenbeinlänge. Allgemeine Bundbereiche
bleiben ausdrücklich redaktionelle Schätzwerte aus nominellen W-Gruppen.
Insgesamt 21 Tabellen; keine Datenbankänderung oder neue Abhängigkeit.

**Prüfung:** 66 Modelltests, 19 Angular-Tests, gezieltes ESLint, Formatierung,
Typprüfung, Shared-UI-Prüfung und Produktionsbau erfolgreich. Isolierter
Chromium-Test mit synthetischer Sitzung und RPC-Antworten auf Desktop und
Mobilgerät: Kinderlabels, Quellenliste, Sprunglinks, unabhängige Weite/Länge,
Zusatzreferenzen und simulierter Ausfall samt Wiederholung. AXE WCAG AA ohne
Befunde und keine Seitenfehler; einziger Konsolenfehler ist der absichtlich
simulierte HTTP-503. Browser-Plugin nicht verfügbar; vorhandenes Playwright
verwendet. Keine produktive Anmeldung oder Datenbank geprüft. Kein Push.

**Abschluss:** Nutzer hat PR, Pflichtprüfungen, Merge und anschließendes Aufräumen
ausdrücklich freigegeben. Aktuellen `origin/master` vor dem Push geprüft;
veröffentlichte Version und Commit werden nach erfolgreichem Deployment
anhand der öffentlichen Metadaten kontrolliert.

## 2026-10-09 - Juna - Allgemeine Größenhilfe über PR veröffentlichen

**Auftrag:** Nach ausdrücklicher Freigabe den geprüften Zweig pushen, PR erstellen,
Pflichtprüfungen abwarten, mit Merge-Commit integrieren und den eigenen Zweig
samt Arbeitskopie aufräumen.

**Integration:** Aktuellen `origin/master` übernommen. Der additive Konflikt im
gemeinsamen Änderungsprotokoll erhält beide vollständigen Sitzungsberichte.
Die Größenhilfe enthält allgemeine Richtbereiche und eine getrennte Suche nach
Weite und Beinlänge. Keine Datenbankänderungen. Produktionsversion und
ausgelieferter Commit werden nach erfolgreicher CI anhand öffentlicher
Deployment-Metadaten geprüft.

**CI-Nachtrag:** Die beiden neuen Browser-Kernfälle waren bereits über
`@core-smoke` ausgewählt, fehlten aber in der ausdrücklich gepflegten
Erwartungsliste des Workflow-Vertrags. Beide Fälle dort aufgenommen; keine
Prüfung entfernt oder abgeschwächt.

## 2026-10-09 - Juna - Allgemeine Größenbereiche statt einzelner Modelle zeigen

**Auftrag:** Nutzer möchte allgemeine Größenreihen und typische Maßbereiche
zur Einordnung seiner Ware. Die zuvor eingefügten Karten einzelner Hosenmodelle
entsprechen diesem Bedarf nicht und sind aus der Übersicht entfernt.

**Umsetzung:** Drei allgemeine Tabellen für Damenhosen, Herrenhosen und normal
geschnittene Unisex-T-Shirts stehen vor den Labelvergleichen. XS/S/M bis XXL
stehen neben Ländergrößen, Jeans-W und ungefähren Bund- beziehungsweise
Brustweiten. Die Hosenbereiche sind ausdrücklich redaktionelle Schätzwerte:
Levi's Alpha-/W-Gruppen werden einschließlich einer halben Inch-Stufe an den
Grenzen in cm übertragen. Das belegt keine tatsächlichen Kleidungsmaße;
Ländergrößen aus Next, ASOS und bonprix sind ungefähre Gegenstellungen.
Die T-Shirt-Spannen fassen zwei Hersteller-Größenreihen zusammen und gelten
nicht für jeden Schnitt oder Jacken. Jede Grundlage ist direkt verlinkt.

**Suche:** Flach gemessene Breite grenzt die Größenbereiche ein. Innenbeinlänge
ermittelt unabhängig davon eine nominelle L-Angabe; Außenbeinlänge bleibt ein
zusätzlicher Hinweis und liefert keine allgemeine XS/M-Grenze. Maßfelder werden
nur mit vergleichbaren Spalten geprüft. Gerundete sichtbare Bereichsgrenzen
gelten auch in der Suche. XXL/2XL und XXXL/3XL werden gleich behandelt.
Labelsuche und vorhandene veröffentlichte Zusatzreferenzen bleiben erhalten.
Insgesamt 13 Tabellen mit 184 Größenzeilen, keine Backend-Änderung.

**Prüfung:** 55 Modelltests und 17 Angular-Tests, gezieltes ESLint, Formatprüfung,
Typprüfung, Shared-UI-Prüfung und Produktionsbau erfolgreich. Isolierte
Chromium-Prüfung mit synthetischer Sitzung und RPC-Antworten auf Desktop und
Mobilgerät: allgemeine Tabellen, unabhängige Weite/Länge, Labelsuche,
Zusatzreferenzen samt simuliertem Ausfall und Wiederholen; AXE WCAG AA ohne
Befunde. Browser-Plugin nicht verfügbar; vorhandenes Playwright verwendet.
Kein Test gegen die produktive Anmeldung oder Datenbank. Kein Push/Deployment.

## 2026-10-09 - Juna - Bedarf für die Größen-Nachschlagehilfe korrigieren

**Auftrag:** Die vorhandene leere Referenzverwaltung trifft den beschriebenen
Bedarf nicht. Gewünscht sind recherchierte, bereits gefüllte Größenvergleiche
und verständliche Erklärungen der Angaben auf Vintage-Kleidungslabels.

**Recherche:** Offizielle Größenhilfen von Silver, Levi's, Next, ASOS, H&M und
bonprix geprüft. Länder-Konfektionsgrößen, Jeansweite/Innenbeinlänge in Inch,
Buchstabengrößen und Kurz-/Lang-/Plusreihen müssen erkennbar getrennt bleiben.
Die aktuelle Silver-Damentabelle nennt für Jeansgröße 29 die Konfektionsgröße
6/8 und einen natürlichen Taillenumfang von 30–31 Inch. W29 darf deshalb nicht
als gemessener Bundumfang oder als universelle EU-Größe ausgegeben werden.
Einzelne Zahlen und unbekannte Codes wie 3R bleiben ohne Marken-/Etikettbeleg
mehrdeutig. Aktuelle Herstellerhilfen belegen keine historischen Vintage-Maße.

**Nachtrag Refuge:** Nutzer nennt eine Damenhose von Refuge. Die auf der offiziellen
Charlotte-Russe-Seite verlinkte Refuge-Denim-Tabelle führt 0, 1, 3, 5 bis 15.
Größe 3 hat dort 26 Inch Taille und 36½ Inch Hüfte (66,04 / 92,71 cm).
Die Bedeutung des R und die Gültigkeit für das konkrete ältere Modell bleiben
unbelegt. Keine direkte universelle EU-Entsprechung daraus abgeleitet.
[Offizielle Refuge-Tabelle](https://charlotterusse.com/pages/size-guide).

**Vorgeschlagener Aufbau:** Direkt gefüllte Leseransicht für Hosen/Jeans und
Oberteile/Jacken, jeweils Damen/Herren, mit Quellenangabe an jedem Vergleich.
Labelsuche einschließlich W/L, Zahlpaaren und halben Inch; zusätzliche
Kurz-/Lang-/Plusübersicht. Markenreferenzen ergänzen die Grundübersicht.
Die Administration bleibt eine Pflegefunktion; Leser müssen keine Tabelle anlegen.

**Maßsuche als Hauptbedarf:** Nutzer misst vorhandene Hosen an Bund,
Innenbein und Außenbein und möchte auch ohne Label eine Größenrange ableiten.
Der geplante Ablauf enthält deshalb eine Suche mit tatsächlichen Kleidungsmaßen
in cm, zusätzlich zur Labelsuche. Bundweite flach und Bundumfang bleiben
ausdrücklich verschiedene Eingaben. Hüftweite und vordere Leibhöhe ergänzen
die Einordnung bei unterschiedlichen Bundpositionen; Stretch bleibt relevant.
Weitengröße und Beinlänge werden getrennt ausgegeben, mehrere passende Größen
bleiben sichtbar. Keine universellen XS/S-Grenzen oder Kleidungsmaßbereiche aus
Hersteller-Körpermaßtabellen erfinden. Nur belegte, gleichartig gemessene
Kleidungsreferenzen können als direkte Maßtreffer zählen; übrige Hinweise sind
als Näherung oder nicht ausreichend belegt zu kennzeichnen.
[Kleidungs-Messvertrag](https://nakedandfamousdenim.com/pages/measuring-guide-1).

**Darstellung präzisiert:** Nutzer verkauft die vorhandene Ware; es gibt keine
Endkunden-Körpermaße. Labelgröße, Kleidungsmaße und ungefähre Verkaufsgröße
stehen deshalb nebeneinander. Die Seite zeigt ihre vorhandenen Tabellen bereits
ohne Suche. Oben liegt eine Filterkarte nach dem bestehenden Vinted-Feed-Muster
(`deal-monitor.component.html`): Kategorie, Damen/Herren, Marke, Labelangabe und
Maßfelder mit gemeinsamem Zurücksetzen. Darunter bleiben getrennte Tabellenkarten
für Größenvergleiche, Kleidungsmaßbereiche und Sondergrößen sichtbar. Eingaben
grenzen die Übersicht ein und markieren passende Zeilen; Ergebnisse und
Vergleichsgrundlage sind gemeinsam nachvollziehbar. Shared-Karten, Suchfelder,
Selects und Zahlenfelder aus dem bestehenden Feed übernehmen, keine neue UI-Lib.

**Quellen:** [Silver](https://www.silverjeans.com/size-charts.html),
[Levi's](https://www.levi.com/US/en_US/info/sizeguide),
[Next](https://www.next.co.uk/sizeguide),
[ASOS](https://www.asos.com/discover/size-charts/women/jeans-trousers-leggings/),
[H&M](https://www.hm.com/ge/customer-service/sizeguide/ladies/),
[bonprix](https://www.bonprix.de/service/beratung/groessentabellen/).

**Umsetzung nach Freigabe:** Die Leserroute zeigt unmittelbar 14 recherchierte
Tabellen mit Größenvergleich, Sonderreihen und tatsächlichen Kleidungsmaßen
einzelner Modelle. Gemeinsame Filter für Marke, Kleidungsart, Zielgruppe, Label
und flach gemessene Kleidung; einstellbarer Suchspielraum statt erfundener
allgemeiner XS/S-Grenzen. Alle eingegebenen Maße müssen in derselben belegten
Zeile vorhanden sein und passen. Körpermaßtabellen und nominelle W-Werte bleiben
Nachschlagekontext und liefern keine Kleidungsmaßtreffer. Die Labelsuche versteht
EU/UK/US-Präfixe, W/L-Paare, halbe Inch und Refuge 3R. Zusatzreferenzen aus der
vorhandenen Veröffentlichung erscheinen direkt darunter; deren Ausfall blockiert
die Grundübersicht nicht. Die bisherige Leseransicht bleibt unter
`sizes/references`, die Administration unverändert erreichbar.

**Prüfung:** 41 Modelltests und 11 Angular-Verhaltenstests erfolgreich, Typprüfung
und Produktionsbau erfolgreich. Isolierte Chromium-Prüfung mit synthetischer
Sitzung und RPC-Antworten: sofort sichtbare Tabellen, Maßtreffer, W/L-Erklärung,
Zusatzreferenzen samt simuliertem Ausfall und Wiederholen, mobile Breite 390 px
ohne Dokumentüberlauf. AXE WCAG AA in Desktop-, Treffer- und Mobilansicht ohne
Befund. Browser-Plugin nicht verfügbar; reguläres Playwright verwendet. Kein
Test gegen die produktive Anmeldung oder Datenbank. Keine Datenbankänderung.

**Quellen für Kleidungsmaße:** Iron Heart IH-666S-142, Lands’ End 509417,
CottonMill B090 und Port & Co PC54C. Die PC54C-Tabelle benennt die Einheit nicht
separat; ihre US-Inch-Messkonvention ist als Ableitung im Tabellenhinweis sichtbar.
Aktuelle Modellmaße sind Vergleichsbelege, keine historischen Vintage-Maßgrenzen.

**Stand:** Eigener geprüfter Zweig; Veröffentlichung erst nach Freigabe des PR.

> > > > > > > origin/master

## 2026-10-09 - Juna - Vinted-Feed nach Chrome-Speicherausfall wiederherstellen

**Auftrag:** Speicherverbrauch des zentralen Vinted-Bots untersuchen, den Bot
nach dem bestätigten Ausfall wieder starten und gezielte Anpassungen vorbereiten.

**Befund:** Der Kernel beendete am 09.10. um 00:59:14 Uhr deutscher Zeit einen
Chrome-Prozess innerhalb der 1-GiB-Containergrenze. Abrufe und Betriebsmeldungen
standen seit 00:59:07 Uhr still, während `/live` weiterhin erfolgreich antwortete.
Der Host hatte freien RAM. Nach vollständigen Katalogseiten mit Sitzungsskripten
benötigt der Browser mehr Speicher; eine passive Messung zeigte einen offenen
Tab mit mehreren eingebetteten Dokumenten und rund 210 MiB JavaScript-Heap.
Ein dauerhaft wachsender Speicherverlust ist damit nicht bewiesen.

**Wiederherstellung:** Auf Nutzerauftrag den Container gestoppt, ausschließlich
die verwaiste Chrome-Profilsperre nach Prüfung auf beendete Browserprozesse und
freien Steuerungsport entfernt und mit 2 GiB RAM sowie insgesamt 3 GiB RAM/Swap
gestartet. Profil, Cookies, Filter und Vinted-Sperrzustand bleiben erhalten.
Alle drei Filter lieferten wieder Daten: 29 erfolgreiche Abrufe und 483 neue
Artikel ohne Fehler nach erfolgreichem Start; rund 1,08 GiB RAM, kein neuer OOM.
Die ursprüngliche 48-Stunden-Abnahme bleibt gescheitert.

**Änderung:** Die Compose-Datei erhält dieselben Speichergrenzen dauerhaft.
`/live` und `/health` melden fehlenden Fortschritt im Sammeln nach fünf Minuten
als ungesund. Abgeschlossene Einzelabrufe und laufende leere oder bewusst
pausierte Durchläufe bleiben lebendig; lange konfigurierte Taktintervalle werden
berücksichtigt. Das ist eine Zustandsprüfung, kein automatischer Containerneustart.
Keine Änderung an Vinted-Schutzregeln, Sitzungsskripten oder Ressourcenabrufen.

**Prüfung:** Regression des weiterhin antwortenden HTTP-Servers zuerst rot,
nach Änderung grün; zusätzlich Pausen, leere Durchläufe, lange Filterrunden und
Taktintervalle geprüft. Alle 322 Bot-Tests, Typprüfung, Bau, Formatierung und
gezieltes Lint bestehen. Die Deployment-Prüfung besteht mit fünf Tests;
drei POSIX-Shell-Fixtures bleiben unter Windows ausgelassen und benötigen
Linux-CI. Docker Compose validiert die neue Speicher-/Swap-Konfiguration.

## 2026-10-09 - Juna - Cloud-Gesprächsbilder und Profilbilder veröffentlichen

**Auftrag:** Nach ausdrücklicher Freigabe PR erstellen, erfolgreiche Pflichtprüfungen
abwarten, mit Merge-Commit integrieren und den eigenen Zweig samt Arbeitskopie aufräumen.

**Integration:** Den aktuellen `origin/master` übernommen; der additive Konflikt
im gemeinsamen Changelog ist mit beiden vollständigen Sitzungsberichten aufgelöst.
Die runden Absenderbilder nutzen den inzwischen erweiterten Shared-Bildbaustein.
Bildimport und Darstellung bleiben die einzigen Produktänderungen dieses Zweigs.

**Abnahme:** 55 gezielte Komponententests und der Produktionsbau bestehen auf dem
aktuellen Integrationsstand; Formatierung, ESLint und Diffcheck sind ebenfalls grün. Veröffentlichung, passende Cloud-Worker-Version und
echter Bildabruf werden nach dem Merge anhand laufender Belege kontrolliert.
Der bereits ausgeführte Bildversand wird nicht wiederholt; die automatische
Uploadbestätigung und Favoriten-/Angebotsabnahme bleiben getrennte offene Punkte.

**CI-Nachtrag:** Die ältere Vinted-Layoutprüfung maß weiterhin den rechten Rand
der Sprechblase. Mit dem Profilbild daneben muss sie die gesamte Nachrichtenzeile
messen. Der bestehende Grenzwert bleibt erhalten; alle sechs gezielten
Browserprüfungen bei 1440/390/320 px im hellen und dunklen Design bestehen.

## 2026-10-09 - Juna - Profilbilder neben Vinted-Chatnachrichten ergänzen

**Auftrag:** Runde Profilbilder neben den Nachrichten wie in Vinted ergänzen.

**Änderung:** Eingehende Nachrichten und Angebote zeigen links das vorhandene
Kontaktbild; eigene Nachrichten zeigen rechts das Bild des ausgewählten Vinted-Kontos.
Systemmeldungen und unbekannte Absender erhalten kein zugeordnetes Profilbild.
Der bestehende Shared-Bildbaustein übernimmt Kreisform, Zuschnitt und Platzhalter
bei fehlenden oder fehlerhaften Bildern. Cloud und Extension verwenden dieselbe
Darstellung; zusätzliche Anbieterabrufe oder Versandaktionen sind nicht erforderlich.

**Prüfung:** 47 Komponententests und sechs Browserprüfungen bestehen, einschließlich
Cloud bei 1440/390 px sowie lokal im hellen/dunklen Design, jeweils mit AXE.
Absenderzuordnung und Platzhalter bei fehlerhaften Bildern sind geprüft.
Produktionsbau, Typprüfung, ESLint, Formatierung und Shared-UI-Prüfung bestehen.
Die Vorschau verwendet ausschließlich künstliche Daten; keine Vinted-Schreibaktion.
Die Ergänzung gehört zum noch nicht veröffentlichten Bildimport-Zweig.

## 2026-10-09 - Juna - Cloud-Testbild prüfen und Gesprächsbilder übernehmen

**Auftrag:** Die noch offenen Bild-/Favoriten-/Dauerbetriebstests fortsetzen;
zuerst einen ausdrücklich freigegebenen Bildversand von Maike Vintage an wiehenvintage prüfen.

**Befund:** Der automatische Abruf um 23:44 Uhr ist erfolgreich, die Automatik
bleibt aktiv und Worker/Broker sind gesund. Der veröffentlichte Bildadapter
sendet einen einzelnen Anhang, besitzt aber noch keinen im Echtkonto belegten
Bestätigungsvertrag und lässt das Ergebnis deshalb gegebenenfalls unklar.

**Echtkonto:** Nach der vom Nutzer geänderten Dateizugriffsoption wurde das
öffentliche Flipbase-Logo als PNG (21.625 Bytes) mit dem Text
„Cloud-Bildtest: Flipbase-Logo.“ am 08.10. um 23:52 Uhr genau einmal versendet.
Text und Logo sind im vorhandenen Vinted-Testgespräch beim Empfänger sichtbar.
Der Cloudauftrag bleibt `outcome_unknown` mit `reply_unconfirmed`; er wurde
nicht wiederholt. Keine neuen Anbieterzugänge oder Versandfreigaben angelegt.

**Änderung:** Die beim normalen Laden beobachtete Vinted-Antwort enthält die
Bilddaten der Testnachricht in `data.entity.photos` einer `legacy_reply`.
Der Cloudparser für dieselbe Entity-Struktur ließ die Fotos bisher weg.
Er übernimmt jetzt begrenzte, eindeutige HTTPS-Bildadressen in das vorhandene
`imageUrls`-Feld; ausgeblendete Bilder und Adressen mit Zugangsdaten werden verworfen.
Keine privaten Originalantworten, Anbieterkennungen oder Bildadressen eingecheckt.

**Prüfung:** Der Regressionstest für Bilder mit Text und reine Bildnachrichten
scheiterte zuerst am fehlenden Feld und besteht nach der Korrektur. Der sichtbare
Bildempfang ist belegt; die automatische Zuordnung zum ursprünglichen Upload ist
weiter offen, da die beobachtete Nachricht keine temporäre Uploadkennung enthält.
Die Worker-Suite besteht mit 478 erfolgreichen und sieben bestehenden ausgelassenen
Tests; Typprüfung, Worker-Bau, ESLint, Formatprüfung und Diffcheck sind grün.
Die Korrektur ist noch nicht veröffentlicht. Favoriten-/Angebotstests stehen aus.

## 2026-10-09 - Juna - Referenzbibliothek über PR veröffentlichen

**Auftrag:** Geprüften Feature-Branch nach ausdrücklicher Freigabe pushen,
PR erstellen, erfolgreiche Pflichtprüfungen abwarten, mit Merge-Commit integrieren
und den eigenen Branch samt Arbeitskopie aufräumen.

**Integration:** Aktuellen `origin/master` übernommen. Ausschließlich das gemeinsame
AI-Changelog hatte einen Konflikt; beide Sitzungsberichte bleiben vollständig
erhalten. Die übrigen Änderungen am Browserdienst und Sniper stammen unverändert
aus dem Hauptzweig. Featureprüfung und Produktionsbau vor dem Push erneut geprüft.
Releasezustand und Bereitstellung des neuen Medien-Endpunkts werden getrennt
anhand aktueller Pipeline- und Serverbelege kontrolliert.

**CI-Nachtrag:** Der Formularbindungstest erkennt nur ausdrücklich angelegte
FormControls; die Feldinitialisierung im neuen Labeleditor verwendet deshalb
das bestehende direkte Muster. Den neuen Referenz-Browserablauf außerdem in
die verbindliche PR-Testauswahl aufgenommen. Beide Regressionen lokal geprüft.

**Migrationsnachtrag:** Die vollständige Datenbank-CI erkannte zusätzliche,
unabhängige Rechteabweichungen im CLI-Abgleich. Die Migration wurde automatisiert
auf ihre tatsächlich neu angelegten Featureobjekte begrenzt; Rechte und Kommentare
anderer Themenbereiche bleiben unverändert. Insbesondere bleibt der bestehende
Service-Zugriff auf Produktbilder samt Archivschutz erhalten. Frischen
Migrationspfad und bestehende Produktbildprüfung erneut ausgeführt.
Bestehende Sidebar-Regressionen um den neuen Werkzeug- und Administrationslink
ergänzt; Reihenfolge und genau ein aktiver Unterpunkt bleiben geprüft.

## 2026-10-08 - Juna - Marken-, Label- und Größenreferenzen abschließen

**Auftrag:** Die im Web begonnene Referenzbibliothek vollständig fortführen;
Backendarbeiten in diesem eigenständigen Projekt ausdrücklich freigegeben.

**Umsetzung:** Bestehenden Integrationsstand in eigener Arbeitskopie mit dem
aktuellen Hauptzweig zusammengeführt. Marken und Linien archivieren und
wiederherstellen, Labelentwürfe bearbeiten, prüfen und veröffentlichen, Bilder
mit Nutzungsrechten verwalten und quellengebundene Größentabellen pflegen.
Leser sehen nur freigegebene Veröffentlichungen; die Bibliothek bleibt anfangs
geschlossen. Bildoriginale und bereinigte Vorschaubilder bleiben privat;
geprüfte Bildlinks gelten 60 Sekunden. Versionskonflikte, Rollenwechsel,
ungespeicherte Eingaben und bewusste Wiederholung unklarer Aufträge berücksichtigt.
Navigation, Filter, Bildvergrößerung und Quellenverweise integriert.

**Datenbank:** Kanonische Schemata registriert, Migration mit dem lokalen CLI
erzeugt, unabhängigen bestehenden Schema-Drift ausgeschlossen und ausgelassene
Initialdaten sowie explizite Rechte aus den Schemata übernommen. Migration
frisch lokal angewendet und API-Typen aus dieser Datenbank erzeugt.

**Prüfung:** 247 SQL-Verhaltensprüfungen, 14 Prüfungen am echten Migrationspfad,
403 Modell-/Navigations-/Übersetzungstests, 92 Angular-Tests und 11
Medienprüfungen erfolgreich. Typen, Formatierung, Lint, Shared-UI und
Produktionsbau geprüft. Vollständiger Browserablauf gegen echtes lokales
Supabase und den Medien-Endpunkt: Redaktion, Upload, Veröffentlichung,
Leserfreigabe, Quellenklick, Größenfilter und Bildwiderruf. Mobile AXE- und
Überlaufprüfungen erfolgreich, keine unbehandelten Browserfehler. Sechs Befunde
des unabhängigen Reviews korrigiert und nachgeprüft.

**Grenzen:** Nur synthetische Referenzinhalte für Tests; keine Markenfakten oder
allgemeinen Größenumrechnungen erfunden. Kein Push, Merge oder Produktionszugriff.
Der neue Medien-Endpunkt muss vor produktiver Leserfreigabe bereitgestellt werden;
das Vorgehen steht in der Deployment-Dokumentation. PR-Abschluss nach Freigabe.

## 2026-10-08 - Juna - Web-Arbeit am Marken- und Labellexikon lokal einordnen

**Auftrag:** Vorhandene Web-Branches für Markenlabels, Echtheitsvergleich und
Größenreferenzen finden und den Stand für eine lokale Fortsetzung prüfen.

**Befund:** Entwurfs-PR 331 auf `juna/brand-labels-integration-20261007`
enthält Galerie, Detailansicht, Referenzmarken-/Linienverwaltung und geprüfte
SQL-Kandidaten. App-Navigation, produktive Datenbankintegration, Labeleditor,
Bildverwaltung und echte Referenzinhalte fehlen. Größenfinder sind laut
Integrationsdokumentation ausdrücklich nicht Teil dieses Ausbaus. Die älteren
Branches `juna/brand-labels` und `juna/brand-labels-foundation` enthalten gegenüber
ihrem gemeinsamen Hauptzweig nur Test-/Übertragungsworkflows beziehungsweise
keine eigenen Änderungen.

**Prüfung:** Remote-Branches aktualisiert, Commitstände und Quellumfang verglichen,
PR-Dokumentation, Routen, Bildplatzhalter und aktuelle CI-Ergebnisse gelesen.
SQL-Kandidaten, Datenbank-, Anwendungs-, Sniper- und allgemeine Browserprüfungen
sind im letzten PR-Lauf erfolgreich. Quality und Label-Modulprüfung scheitern
an Formatierung; der Produktionsbau wurde nicht ausgeführt. Keine eigene
Build-, Browser- oder vollständige Supabase-Abnahme durchgeführt.

**Fortsetzung:** PR-Head `1c786863` in einer eigenen lokalen Arbeitskopie auf
`juna/brand-labels-local-continuation` bereitgestellt. Bestehende Remote-Branches,
Anwendung und Produktivdaten unverändert. Noch keine Implementierung, kein Push,
Merge oder Deployment. Die im Web erwähnten zusätzlichen lokalen Editor- und
Medienbausteine sind im abrufbaren Git-Stand nicht enthalten.

## 2026-10-08 - Juna - Sitzungs-Skripte im automatischen Vinted-Katalog erhalten

**Auftrag:** Den belegten Unterschied zwischen manueller Seitenladung und
automatischem Dokumentabruf gezielt beheben und wiederholte Abrufe prüfen.

**Änderung:** Chrome erhält das originale HTML mit Status, Cookies und
Sicherheitsheadern; externe Skripte und eingebettete Dokumente dürfen normal
laden. Ein erfolgreicher Katalog wartet auf das Ladeereignis seiner eigenen
Navigation und bleibt danach für verzögerte Sitzungs-Skripte geöffnet. Bekannte
HTTP-Ablehnungen werden sofort weitergegeben. Größenlimit, Abbruch, Zeitlimit,
gemeinsamer Abrufabstand und manuelle Schutzprüfung bleiben bestehen. Chromiums
Netzwerkfehler werden als solche mit sicherer Fehlerkennung eingeordnet;
Parserfehler behalten den tatsächlich erhaltenen HTTP-Status.

**Prüfung:** Der neue Container-Test scheitert am bisherigen Bot wegen
unterbundener Skripte. Der geänderte Bot besteht Skripterneuerung über mehrere
lokale Katalogabrufe, originale Challenge-Antwort, Abbruch/Wiederaufnahme,
manuelle Bild-/Texteingabe, exklusive Bedienung und Cookiepersistenz nach
Chrome-Neustart. Sandbox und privater CDP-Zugang bleiben geprüft. Alle 318
Diensttests, Typprüfung, Dienstbau, gezieltes ESLint und Formatierung bestehen.
Docker-Bau und beide vorhandenen Abbildprüfungen bestehen.

**Grenze:** Ausschließlich lokaler Testkatalog ohne Vinted-Abrufe. Die konkrete
Vinted-Schutzregel bleibt unbekannt; Produktionsvergleich und 48-Stunden-Abnahme
folgen nach freigegebener Veröffentlichung. Dabei auch Ladezeiten und zusätzlichen
Ressourcenverkehr beobachten. Keine Filter-, IP-, Proxy- oder Schemaänderung.

## 2026-10-08 - Juna - Wiederkehrende Vinted-Ablehnungen technisch eingrenzen

**Auftrag:** Die Ursache der wiederholten Feedunterbrechungen untersuchen und
den bisherigen Abruf mit öffentlich dokumentierten Vinted-Bots vergleichen.

**Befund:** Der laufende Bot verwendet denselben Dokumentleser wie der lokale
Stand: Katalogantworten werden gelesen, in Chrome aber durch leeres HTML ersetzt;
alle Nebenanfragen und Seitenskripte werden unterbunden. Eine passive CDP-Messung
bestätigt originale Cloudflare-HTTP-200-Antworten und das anschließend künstlich
ausgelieferte Dokument. Die normalen Vinted-Seiten enthalten ein DataDome-Skript
unter `static-assets.vinted.com/datadome/5.9.4/tags.js`. Im eigenen Botprofil
liegen Cloudflare- und DataDome-Cookies aus der manuellen Freigabe; nur Namen
und Zeitstempel wurden gelesen, keine Cookiewerte exportiert. Tatsächliche
Chrome-Verbindungen gehen direkt von der Hetzner-IPv6 zu Cloudflare. Der
automatische Katalog läuft mit gemeinsamem Mindestabstand von zehn Sekunden.

**Prüfung:** Ein isolierter lokaler HTTP-/Chrome-Vergleich verwendet die
unveränderte `readBrowserDocument`-Funktion. Eine Seite mit erforderlicher
Skripterneuerung bleibt bei normalem Chrome-Laden dreimal erfolgreich. Der
bisherige Dokumentleser unterbindet die Erneuerung und erhält nach einem
erfolgreichen Folgeabruf HTTP 403. Dieser Test beweist den Mechanismus an einem
lokalen Modell, nicht die unbekannte Vinted-WAF-Regel. Passive Produktionsmessung
ändert keine Filter, Browseridentität, Schutzregeln oder Produktionsdateien.

**Weitere Diagnosegrenze:** Nach der Wiederaufnahme traten vorübergehende
Browserfehler bei Adidas/Nike und eine Adidas-Antwort ohne lesbare Katalogdaten
auf; die Folgeabrufe erholten sich. Der Transport verwirft den konkreten
`responseErrorReason`, und die Parserfehlermeldung enthält weder HTTP-Status
noch eine sichere Seitenklassifikation. Das verhindert eine präzise Zuordnung.

**Folgerung:** Normalen Browser-Seitenlebenszyklus mit sicherer, begrenzter
Diagnose gegen den bisherigen Leser vergleichen; IP, Profil, Filter und Takt
dabei konstant halten. Erst danach die feste Serveranbindung separat bewerten.
Abnahme über mindestens 48 Stunden mit allen drei Filtern, ohne manuelle
Freigaben, einschließlich dokumentiertem Datenalter und Fehlerarten. Keine
Produktionsumstellung und kein Nachweis einer dauerhaften Lösung in dieser Sitzung.

**Quellen:** Cloudflare dokumentiert clientseitige Erneuerung und mögliche
erneute Prüfung trotz nicht abgelaufenem Cookie; DataDome beschreibt die
erforderliche JavaScript-/Cookie-Kommunikation. Veröffentlichte Botprojekte
dokumentieren Proxy-Pools und teilweise zusätzliche Anti-Bot-Dienste; deren
Angaben sind kein verifizierter Zuverlässigkeitsnachweis. Fyndits öffentliches
Projekt warnt selbst vor nicht mehr gepflegtem Code.

- https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/
- https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/
- https://docs.datadome.co/docs/javascript-tag
- https://github.com/teddy-vltn/vinted-discord-bot/blob/main/readme.md
- https://github.com/masolupo/vinted-live-feed
- https://pro-docs.svc.vinted.com/

## 2026-10-08 - Juna - Erneute Vinted-Feedpause prüfen und Zugriff wiederherstellen

**Auftrag:** Die erneut ausbleibenden Feeddaten und die Anzeige
„Wartet auf manuelle Vinted-Prüfung“ im Adminbereich untersuchen.

**Befund:** Der gemeinsame Vinted-Zustand ist seit 14:42:30 Uhr deutscher Zeit
mit `interaction_required` gesperrt. Der zugehörige Ralph-Lauren-Abruf wurde
abgewiesen; Adidas und Nike waren unmittelbar davor erfolgreich. Alle drei
Filter sind inzwischen mit 20 Sekunden und Kategorie Herren/Kleidung aktiv.
Der Botprozess läuft, fragt während dieser gespeicherten Pause aber keine
neuen Vinted-Artikel ab. Der Containerstart um 16:38 Uhr hat die Pause erhalten.

**Maßnahme und Prüfung:** Die vorhandene angemeldete Admin-Botsitzung zeigt
den normalen Vinted-Katalog ohne CAPTCHA. Die bestehende Wiederprüfung
bestätigt den Zugriff um 22:44:10 Uhr und setzt den gemeinsamen Zustand auf
`ready`. Bis 22:46 Uhr bestätigen die Datenbank und zehn automatische Abrufe
erfolgreiche Abfragen aller drei Marken sowie 353 neue Artikel ohne Fehler.
Keine Änderung an Filtern, Botcode oder Produktionskonfiguration.

**Grenze:** Die Wiederherstellung belegt keine dauerhafte Beseitigung der
wiederkehrenden Vinted-Sperre. Die genaue Ursache der Anbieterablehnung bleibt
ungeklärt; sie ist durch diese Daten nicht als Adidas-Filterfehler bewiesen.

## 2026-10-08 - Juna - Cloud-Browserstart ohne private Daten eingrenzen

**Auftrag:** Nach der Cloud-Postfach-Abnahme den einmaligen ersten Versandstartfehler
weiter untersuchen und die automatische Aktualisierung prüfen.

**Befund:** Die bestätigte Testantwort wurde beim gezielten Folgeversuch genau einmal
versendet. Der erste Versuch begann keinen Anbieter-Versand; seine Ursache ist aus
den bisherigen neutralen Logs nicht rückwirkend belegbar. Der Hintergrundabruf
um 22:58 Uhr und der folgende geplante Abruf um 23:14 Uhr waren erfolgreich;
die Automatik bleibt mit 15 Minuten aktiv, ohne Pause oder Folgefehler. Beide
Browsersitzungen wurden vollständig beendet.

**Änderung:** Worker und privater Browser-Broker melden bei einem fehlgeschlagenen
Start ausschließlich die feste Fehlerstufe. Freigaben, Ablauf, Fehlerbehandlung und
Bereinigung bleiben erhalten. Keine Zugangsdaten, Profilkennungen, Anfragen oder
privaten Fehlermeldungen werden in die neue Diagnose übernommen.

**Prüfung:** Neue Fehlertests wurden zuerst rot und anschließend grün ausgeführt.
Die Worker-Suite besteht mit 476 erfolgreichen und sieben bestehenden ausgelassenen
Tests; Typprüfung, Worker-Bau, ESLint und Formatprüfung sind erfolgreich.
Die Diagnose ist noch nicht veröffentlicht und belegt keine rückwirkende Fehlerursache.

## 2026-10-08 - Juna - Gemeinsames Cloud-Postfach umsetzen

**Auftrag:** Gemeinsames Cloud-/Extensionpostfach mit Nachrichtenversand,
Glockenmeldungen und ausdrücklich aktivierten Favoriten-/Angebotsregeln umsetzen.

**Eingang:** Ein vom Nutzer freigegebener GET am Testkonto belegt echte
Nachrichten-/Preisvorschlagskennungen, Richtung und ISO-Zeit. Ungelesen bleibt
vorher/nachher erhalten; die separate Gelesen-Aktion wurde nicht aufgerufen.
Cloud und Extension verwenden denselben anonymisierten Vertrag. Höchstens drei
Gesprächskopien pro Lauf, ältere Prüfungen zuerst. Erstbestand und später geladene
alte Historie bleiben still; fehlende oder widersprüchliche Belege erzeugen keine
Glockenmeldung. Ereignisse werden atomar importiert, dedupliziert und über private
Broadcasts angezeigt. Glockenlinks öffnen Konto und Gespräch; Markieren betrifft
nur Flipbase. Alte Extension-Payloads bleiben gültig.

**Versand:** Gemeinsamer Composer und Warteschlange, eigene Cloudfreigabe gebunden
an Konto, Profil und Freigabeversion. Zentraler Dispatcher und bestehende
Browsersperre führen manuelle Nachrichten vor Favoritenphasen aus. Claim/Begin/
Finish prüfen Worker-Epoche und Konto. Ein Textversand braucht eine neue eigene
externe Nachricht; Bildbelege, verlorene Antworten und unbestätigter Browserstopp
bleiben unklar. Keine automatische Wiederholung eines begonnenen Versands.

**Favoriten:** Bestehende Vorlagen, Zeitfenster und Preisregeln gelten für beide
Ausführer. Cloud-Aktivierung ist bewusst und bleibt standardmäßig aus. Gemeinsame
Ereignis- und Preisprüfung, getrennte Nachrichten-/Angebotsphasen, Automatikpause
und Widerruf bleiben verbindlich. Kein Angebot ohne bestätigte Nachricht und
zentrale Preisfreigabe.

**Integration:** Aktueller Hauptzweig mit isoliertem Browserdienst integriert.
Nachrichten, Favoriten und Preisbestätigung laufen durch dessen festen
Aktionstransport; Gesprächsartikel und versionierte Eingangsereignisse bleiben
beim Transport erhalten. Kein zentraler Playwright-Zugriff hinzugefügt.
Migrationen offiziell gegen isolierte Vorher/Nachher-Datenbanken erzeugt und
angewendet; API-Typen aus der migrierten Datenbank erzeugt.

**Abschlussreview:** Vier wichtige Befunde durch Regressionen zuerst reproduziert
und in einem Korrekturdurchlauf behoben: Kontopausen nach Cloud-Schreibfehlern
gelten vor Claim, Check und Begin auch für manuelle Nachrichten. Alte Profil-
abschlüsse verändern keine neue Freigabe. Ein fehlgeschlagener Favoritenabruf
verwirft keine bestätigten Kontodaten; 401/403/429 und Retry-After bleiben im
isolierten Transport erhalten. Bereits belegte Versandantworten bleiben trotz
späterem Widerruf belegbar. Ungeprüfte nichtleere Postfächer setzen keinen
Benachrichtigungs-Erstbestand. Bestehende Regeln für bewusste Wiederaufnahme und
Anmeldebestätigung bleiben erhalten. Veraltetes Header-Testfixture und die
verbindliche PR-Browsertestliste an den Nachrichtenstrom/Cloudfälle angepasst.

**Prüfstand:** 468 Workerprüfungen bestanden, sieben bestehende Skip; Worker-Bau
und Typen bestehen. 663 Datenbankassertions auf offiziell migriertem Teststand
einschließlich lokaler Nachrichten, Favoriten/Angebote, Feed, Import und Scheduler
bestanden. Alle Node-, DOM- und Angular-Anwendungssuiten bestehen; zusätzlich
239 Workflow- und 211 Deno-Prüfungen bestanden (fünf bestehende Workflow-Skip).
16 Browserfälle für Cloud/Extension, Desktop/Mobilgerät und AXE bestanden.
Produktionsbau, App-Typprüfung, beide Worker-/Browserabbilder und ein isolierter
Runtime-Smoke ohne Netzwerk bestehen. Stark parallel ausgeführte Angular-Tests
hatten Zeitüberschreitungen; der vollständige Lauf mit vier Workern besteht
ohne Produkt- oder Timeoutänderung. Unabhängiges Gesamt-Review abgeschlossen,
keine kleinen offenen Reviewbefunde. Veröffentlichung steht aus.
Die vorbereitete Extension 1.7.1 wurde noch nicht in der registrierten Installation
ausgerollt. Kein Live-Versand, keine automatische Favoritenregel und kein Release.
Echtkonto-Abnahme folgt nach Veröffentlichung; Bildbestätigung bleibt eingeschränkt.

## 2026-10-08 - Juna - Gemeinsamen Cloud-Postfachausbau planen

**Auftrag:** Nach Bestätigung des schriftlichen Entwurfs den Umsetzungsplan
für das vollständige gemeinsame Postfach erstellen.

**Plan:** Neun aufeinander abgestimmte Aufgaben für belegte Eingangsdaten,
Cloud-Freigaben und gemeinsame Outbox, Browserversand, Worker-Ausführung,
Glockenmeldungen, gemeinsame Oberfläche, vorhandene Favoriten-/Angebotsregeln,
Integration und Echtkonto-Abnahme. Lesefreigaben bleiben von Schreibaufträgen
getrennt; bestehende Kontosperren und der Worker-Lease werden weiterverwendet.

**Prüfstand:** Datei- und Schnittstellenzuordnung gegen aktuelle Worker-,
Extension-, SQL- und Frontend-Verträge gelesen. Plan auf Entwurfsabdeckung,
Abhängigkeiten und Fehlerfälle geprüft. Formatierung und Diffprüfung bestehen.
Noch keine zusätzlichen Produktfunktionen oder
Anbieteraktionen ausgeführt; die Planprüfung und Ausführungswahl stehen aus.

## 2026-10-08 - Juna - Gemeinsamen Cloud-Postfachentwurf ausarbeiten

**Auftrag:** Den bestätigten Umfang für Gesprächsabgleich, Glocke, Text-/Bildversand
und Favoriten-Antworten als prüfbaren Ausbauentwurf festhalten.

**Entwurf:** Gemeinsame Oberfläche und bestehende dauerhafte Aufträge mit
getrennter Ausführung durch Extension und Cloudworker. Neue Eingangsmeldungen
benötigen belegte Ereignisse und einen ersten Referenzstand; ungelesene Details
bleiben bei Hintergrundabgleichen geschlossen. Freigaben, Konto-/Profilsperren,
unklare Versandzustände und vorhandene Favoriten-Angebotsregeln bleiben verbindlich.

**Prüfstand:** Aktuelle Vertrags- und Ausführungsdateien gelesen; Entwurf auf
Widersprüche, offene Platzhalter und Abnahmekriterien geprüft. Die zusätzliche
Cloud-Ausführung bleibt bis zur Prüfung des schriftlichen Entwurfs unimplementiert.
Keine Anbieteraktion, Nachricht oder Veröffentlichung ausgelöst.

## 2026-10-08 - Juna - Gemeinsame Gesprächsfunktionen für lokale und Cloud-Konten prüfen

**Auftrag:** Den Cloud-Ausbau auf neue Nachrichten, Glocken-Benachrichtigungen
und den vorhandenen Chatversand der lokalen Lösung erweitern.

**Befund:** Eingabefeld, Versandstatus und Wiederholung sind vorhanden, jedoch
an lokale Konten und Extension-Freigaben gebunden. Die Warteschlange prüft
zusätzlich serverseitig die lokale Installation. Der Cloudworker besitzt noch
keinen Nachrichtenexecutor. Die Glocke übernimmt Favoriten und Bewertungen;
ein Benachrichtigungspfad für neue Chatnachrichten fehlt für beide Betriebsarten.
Bildversand hat laut vorhandenem Postfachplan noch keinen im Echtkonto belegten
Bestätigungsvertrag.

**Vorschlag:** Gemeinsame Gesprächsoberfläche und Auftragszustände erhalten,
Cloud-Ausführung über das zugeordnete Browserprofil ergänzen und pro Konto
genau einen Ausführer zulassen. Neue Postfachereignisse nach einem ersten
Referenzabgleich ohne Duplikate benachrichtigen; ungeklärte Versandversuche
nicht automatisch wiederholen. Favoritenregeln bleiben separat freizugebende
Automatisierung. Der genaue Ausbau und die Echtkonto-Abnahme werden vor der
Implementierung abgestimmt. Die bisherigen beiden Fehlerkorrekturen bleiben
vorbereitet; es wurde noch kein PR erstellt oder veröffentlicht.

**Prüfstand:** Lesender Abgleich von Oberfläche, Nachrichtenstore, lokalen
Versandfunktionen, Cloudworker, Datenbankverträgen und Benachrichtigungsleiste.
In diesem Schritt wurden keine Produktfunktionen geändert und keine Nachrichten
versendet.

## 2026-10-08 - Juna - Cloud-Gesprächsartikel ergänzen und Einzelabruf verkürzen

**Auftrag:** Den vorbereiteten PR um fehlende Artikeldaten in Cloud-Gesprächen
ergänzen und die längere Synchronisierung gegenüber der Extension prüfen.

**Befund:** Der Cloud-Parser übernimmt bisher keine Artikelfelder aus Liste
oder Gesprächsdetail. Ein ausdrücklich geöffnetes Gespräch führt außerdem
Inserats-, Bewertungs- und Verkaufsabrufe aus.

**Umsetzung:** Titel, Bild, Artikelkennung, Preis, Währung und Transaktionsstatus
werden nach dem bestehenden Extension-Muster übernommen. Beobachtete Details
ergänzen die Listenangaben; unveränderte Gespräche erhalten bekannte Artikeldaten
aus dem vorhandenen Cache. Einzelabrufe überspringen die unabhängigen Datenbereiche
und melden diese als Teilstand, damit gespeicherte Inserate und Bewertungen
erhalten bleiben. Kontoidentität, ausgewähltes Gespräch und Sitzungsabschluss
werden weiterhin geprüft.

**Prüfstand:** Vier neue Regressionen scheitern vor der Korrektur. 350 Worker-Tests
bestehen, sieben bleiben unverändert ausgelassen. 176 Datenbankprüfungen bestehen
einschließlich des Erhalts von Inseraten und Bewertungen beim Gesprächsabruf.
Worker-Typprüfung, Bau und gezieltes ESLint bestehen. Der Einzelabruf benötigt
im Test drei Anbieteranfragen statt sechs; echte Laufzeiten und Artikeldaten
sind nach Veröffentlichung zu prüfen.

## 2026-10-08 - Juna - Erledigte Cloud-Anmeldewarnung automatisch entfernen

**Auftrag:** Nach erfolgreich bestätigter Vinted-Anmeldung darf die alte
Warnung „Vinted verlangt eine neue Anmeldung“ nicht stehen bleiben.

**Befund:** Die Kontobestätigung erneuert die Verbindung, lässt aber
`marketplace_sync_schedules.paused_reason = needs_login` unverändert.
Die Oberfläche lädt den Zeitplan zudem bei identischem Verbindungsstatus
nicht sofort erneut.

**Umsetzung:** Die vorhandene Kontobestätigung bereinigt ausschließlich den
Anmeldefehler samt zugehöriger Wartezeit und Fehlerzähler. Eine neue
Sperrversion verhindert, dass alte Auftragsabschlüsse diesen Status
wiederherstellen. Automatikfreigabe, gewählter Abstand, Importzeit und andere
Pausengründe bleiben unverändert. Das erneut geladene Konto löst auch bei
gleichem Verbindungsstatus eine sofortige Zeitplanabfrage aus.

**Prüfstand:** Der Oberflächen- und Datenbanktest reproduzieren den Fehler vor
der Korrektur. 156 Angular-Tests und 129 Datenbankprüfungen bestehen. Die
erzeugte Migration wurde auf dem vorherigen Funktionsstand angewendet und
ebenfalls mit diesen Datenbanktests geprüft. Typprüfung, Produktionsbau,
gezieltes ESLint, Formatierung und Migrations-/Schemaregistrierungstests
bestehen; neu erzeugte API-Typen sind unverändert. Die Veröffentlichung
steht noch aus.

## 2026-10-08 - Juna - Endlose Filterprüfung bei globaler Vinted-Pause beenden

**Befund:** Nach einer erfolgreichen Wiederprüfung sperrt Vinted um 11:00 Uhr
einen Ralph-Lauren-Abruf mit HTTP 403 und erkanntem Challenge-Signal. Adidas wird
erst um 11:42 Uhr aktiviert und führt während der globalen Pause keinen neuen
Abruf aus. Die Filterseite wartet trotzdem unbegrenzt auf einen neuen
Abrufzeitpunkt. Nach Neuladen zeigt sie stattdessen den alten Adidas-Fehler vom
Vortag neben dem gespeicherten Aktivstatus.

**Umsetzung:** Die Filterseite liest den vorhandenen Browserstatus mit dem
Betriebsstand. Bei notwendiger manueller Prüfung endet die Warteanzeige;
ein Hinweis erklärt die globale Pause und verlinkt den Botbetrieb. Aktive
Filter zeigen ihren Wartegrund, historische Ergebnisse heißen "Letzter Abruf".
Eine Aktivierung verspricht keinen sofortigen Anbieterabruf mehr.

**Live-Vergleich:** Nach ausdrücklicher Zustimmung den Adidas-Filter auf die
Hauptmarke (14) und 60 Sekunden umgestellt. Nike und Ralph Lauren bleiben
pausiert. Die reguläre Admin-Botsitzung zeigt den Adidas-Katalog ohne CAPTCHA;
die bestehende Wiederprüfung bestätigt den Zugriff um 12:03 Uhr. Danach
folgen fünf erfolgreiche automatische Abrufe bis 12:09 Uhr mit insgesamt
97 neuen Adidas-Artikeln; aktuelle Funde sind im Nutzerfeed sichtbar.
Eine dauerhafte Anbieterfreigabe oder ein Fehler
einer bestimmten Adidas-Variante ist damit nicht bewiesen.

**Prüfung:** Der Regressionstest reproduziert zuerst die endlose Warteanzeige.
Mit der Korrektur bestehen 22 gezielte Tests einschließlich echter Vorlage,
historischem Fehler nach Neuladen, späterer globaler Pause und Statusfehler.
Der neue Hinweis besteht die automatisierte AXE-Prüfung. Typprüfung, gezieltes
ESLint, Formatierung, Suite-Audit, Shared-UI-Prüfung und Produktionsbau bestehen.
Die bestehende CommonJS-Warnung für `pako` bleibt. PR #344 ist nach erfolgreichen
Pflichtprüfungen einschließlich Browser-Smoke gemergt und als v0.310.4
veröffentlicht. Die öffentliche Commitprüfung und die angemeldete Filterseite
bestätigen den neuen Stand. Bis 13:50 Uhr bestehen 100 automatische Adidas-Abrufe
mit 1.873 neuen Artikeln ohne Fehler. Der Bot wird beim Webrelease nicht neu gestartet.

## 2026-10-08 - Juna - Ausbleibenden Vinted-Feed live untersuchen und freigeben

**Befund:** Der globale Vinted-Zustand steht seit dem 07.10. um 17:18 Uhr auf
`blocked / interaction_required`. Der zeitgleiche Adidas-Abruf ist als
`forbidden` gespeichert. Der später neu gestartete Container ist lebendig,
aber `/health` meldet mangels erfolgreicher Suchrunde 503. Am 08.10. sind vor
der Wiederprüfung keine neuen Artikel gespeichert. Nike und Ralph Lauren sind
aktiv; Adidas ist deaktiviert. Eine erneute Bereitstellung löscht die notwendige
manuelle Pause nicht. Die private Browserroute und Betreiberanmeldung funktionieren.

**Wiederherstellung:** Über die vorhandene angemeldete Admin-Botsitzung den
Nike-Katalog geöffnet, den Cookiehinweis auf notwendige Cookies beschränkt und
nach dem bestehenden Mindestabstand „Zugriff erneut prüfen“ ausgeführt.
Die Oberfläche bestätigt den erfolgreich gespeicherten Katalogzugriff und die
Freigabe aktiver Markenfilter. Kein CAPTCHA wird angeboten oder gelöst.
Keine Änderung an Code, Suchbedingungen, Datenbankschema oder Zugriffsschutz.

**Abnahme:** Elf automatische Durchläufe nach der Freigabe bestehen ohne Fehler.
369 Artikel sind heute neu gespeichert; Nike und Ralph Lauren haben aktuelle
Erfolgszeitpunkte. `/health` ist bereit, der globale Zustand ist `ready`.
Der angemeldete Adminbereich zeigt „Vinted verbunden“ und der Nutzerfeed zeigt
neue Artikel von heute um 10:38 Uhr. Formatierung und Git-Diff bestehen.
Eine dauerhafte Anbieterfreigabe ist damit nicht zugesichert.

**Adidas-Nachprüfung:** Der Nutzer berichtet wiederholte Ausfälle nach Aktivierung
dieses Filters. Der aktuelle Filter enthält sieben Adidas-Varianten und einen
20-Sekunden-Abstand. Sie werden einzeln im Wechsel abgefragt, nicht gleichzeitig.
Die gespeicherte Position 9 entspricht bei sieben Varianten dem Index 2,
also `adidas NEO` (132738); an dieser Position steht der letzte Fehler. Alle
sieben Varianten sind zuvor erfolgreich initialisiert worden. Auch der ältere,
inzwischen gelöschte Filter mit ausschließlich `adidas` (14) hat einen früheren
`forbidden`-Eintrag. Damit ist die letzte globale Pause einem Adidas-Abruf
zuordenbar, aber kein Fehler einer bestimmten Markenkennung bewiesen. Der Filter
bleibt bei dieser lesenden Analyse deaktiviert und unverändert. Ein kontrollierter
Vergleich mit nur der Hauptmarke und längeren Abständen ist noch nicht ausgeführt.

## 2026-10-08 - Juna - Cloud-Browserauswertung mit begrenzter Sitzung isolieren

**Auftrag:** Die offenen Security-Meldungen zur gemeinsamen Browsersteuerung
mit dem vorhandenen kleinen Server bearbeiten. Bestehende Warteschlange, ein
Cloudplatz und gespeicherte Kontoprofile bleiben erhalten; kurze Folgeaktionen
sollen keinen neuen Browserstart benötigen. Die lokale Erweiterung bleibt unverändert.

**Umsetzung:** Browser- und Playwright-Auswertung laufen im Sitzungscontainer
mit genau einem Profil, ohne globale Anbieterschlüssel oder Docker-Socket.
Controller und Broker übertragen ausschließlich feste Browseraktionen über
einen an den Container gebundenen Kanal. Berechtigungsprüfungen während Abrufen
und Schreibaktionen bleiben im Controller. GoLogin verwendet einen kurzlebigen
Profilkanal; sein globaler Schlüssel wird nicht an den Auswerter weitergegeben.
Aktionen desselben Kontos können ihre Sitzung innerhalb von 20 Sekunden Leerlauf
und höchstens zwei Minuten nach Erstellung erneut verwenden. Kontowechsel und
Queue-Claim bereinigen zuerst die bisherige Sitzung. Unklarer Stopp hält die
Reservierung gesperrt. Controller/Broker bleiben bei je 512 MiB und der eine
Sitzungscontainer bei 2 GiB. Keine Schemaänderung oder Datenbankmigration.

**Prüfung:** 380 Linux-Worker-Tests bestehen; ein bestehender Test bleibt
ausgelassen. Typprüfung, Worker-Bau, gezieltes ESLint und Formatierung bestehen.
Der echte lokale Containertest prüft fehlende globale Rechte, feste Aktionen,
erneute Nutzung, frische Kontowechsel und persistente Anmeldung. Zwei Aktionen
(Kontoerkennung plus Screenshot) benötigen lokal ungefähr 90–115 ms, ein neuer
Container etwa 1,2–1,3 Sekunden; die Test-Sitzung belegt rund 376 MiB. Diese Werte
belegen keine Produktionslast. GoLogin-Profilbindung, Kanalablauf und Widerruf,
Zugriffswechsel, Leerlaufgrenze, absolute Wiederverwendungsgrenze und unsicherer
Startabbruch sind automatisiert geprüft. Eine unabhängige Kandidatenprüfung
erkannte eine versehentliche Abschaltung geplanter GoLogin-Abrufe; der korrigierte
Compose-Override erhält beide bisherigen Freigabewerte aus der privaten env_file.
Die CI prüft den echten Broker mit Host-Firewall und isolierter Sitzung.
Beim PR-Lauf blieb einmal ein sehr schneller Browser-Stopp unbestätigt;
zwei Wiederholungsläufe und 15 lokale schnelle Start-/Stopp-Versuche bestanden.
Ein gezielter Regressionstest belegt die Lücke bei verspäteter Fensterregistrierung:
Der native Schließbefehl wird jetzt innerhalb derselben acht Sekunden erneut
gesendet. Ein weiterhin laufender Browser bleibt ein Fehler mit gesperrter
Reservierung. Verspätete Fenster, vorübergehend fehlende Fensterverwaltung und
die unveränderte Fehlergrenze werden zusätzlich geprüft; die Ursache des
einzelnen CI-Fehlers ist nicht abschließend belegt.

**Grenzen:** Die lokale Docker-Desktop-Umgebung kann die vollständige Host-Firewall
nicht prüfen (fehlendes WSL-Kernelmodul `br_netfilter`); diese Prüfung bleibt im
Linux-PR-Lauf erforderlich. Zwei bestehende Browser-Login-Tests schlagen auch
im unveränderten Ausgangsstand fehl. Echte GoLogin-/Vinted-Abnahme und die
koordinierte Serverumstellung stehen aus. Ein vollständig übernommener zentraler
Controller oder Docker-Broker besitzt weiterhin globale Rechte. Die beiden
ursprünglichen Security-Meldungen bleiben daher offen; dies ist die vereinbarte
Abschottung des Browser-Auswerters, keine vollständige Aufhebung dieser Vertrauensgrenze.

## 2026-10-08 - Juna - Falsche Beta-Umleitung beim Tabwechsel verhindern

**Auftrag:** Die gelegentliche Umleitung eines Administrators auf `beta-ended`
beim Zurückkehren zum Flipbase-Tab untersuchen und korrigieren.

**Befund:** Die Zugangsprüfung beim Sichtbarwerden des Tabs leitet bereits bei
einem RPC-Fehler auf die Beta-Seite um. Ein Workspace ohne Beta-Lizenz wird
serverseitig als aktiv geführt; der Fehlerpfad unterscheidet einen
Prüfungsfehler bisher nicht von einer bestätigten Zugangssperre.

**Umsetzung:** Fehlgeschlagene Hintergrundprüfungen behalten den zuletzt
bestätigten Zustand und wiederholen die Prüfung nach fünf Sekunden. Auch
geworfene Ausnahmen werden berücksichtigt. Neue Navigationen bleiben bei
fehlgeschlagener Prüfung gesperrt; bestätigte Zugangssperren und Nutzerwechsel
werden weiterhin berücksichtigt. Keine Änderung der Admin-Rechte oder des Backends.

**Prüfung:** Sechs Regressionstests decken Tabwechsel, erneute Prüfung,
geworfene Ausnahmen, bestätigtes Beta-Ende, Workspace-Wechsel und verspätete
Fehler nach Abmeldung ab. Zusammen mit den bestehenden Zugangs-, Einrichtungs-
und Betreiberprüfungen bestehen 25 Tests, zusätzlich 49 bestehende Auth- und
Workspace-Tests. Typprüfung, gezieltes ESLint, Formatierung, Suite-Audit und
Produktionsbau bestehen. Der Bau läuft mit dem vorhandenen Node 24.19.0,
da das systemweite Node 22.16.0 für Angular 22 zu alt ist; die bestehende
CommonJS-Warnung für `pako` bleibt. Der konkrete Aussetzer in der produktiven
Sitzung ist nicht live reproduziert.

## 2026-10-08 - Juna - Cloud-Gesprächszugriff ohne Schreibfreigabe bereitstellen

**Auftrag:** Den unterbrochenen Abschluss von PR 340 fortsetzen und den echten
Cloud-Gesprächsabruf mit Maike Vintage prüfen.

**Befund:** PR-Prüfungen, Merge und Veröffentlichung sind erfolgreich. Anwendung
und Worker liefern den gemergten Stand aus. Der echte Aufruf liefert jedoch
HTTP 503 vor dem Browserstart: Die Eintragsprüfung ist bisher an die Freigabe
von Chromium-Schreibfunktionen gebunden. Unabhängig davon hat der bestehende
15-Minuten-Abruf um 00:44 UTC wegen `identity` pausiert; diese Pause bleibt erhalten.

**Umsetzung:** Der Gesprächsabruf erhält die vorhandene RLS-geschützte
Eintragsprüfung als eigene Leseabhängigkeit. Die bisherigen Freigaben für
Profil- und Inseratänderungen bleiben unverändert. Ein Regressionstest bildet
den Cloud-Lesebetrieb ohne Schreibfreigabe ab und prüft gleichzeitig, dass
beide Speicherrouten vor einem Browserstart abgewiesen werden.

**Prüfstand:** Der Regressionstest zeigt vor der Korrektur HTTP 503 statt 200.
347 Worker-Tests bestehen, sieben bleiben unverändert ausgelassen. Typprüfung, Produktionsbau, gezieltes ESLint, Formatierung und Diff-Prüfung bestehen. Die erneute Live-Prüfung steht bis zur Veröffentlichung der Korrektur aus.

## 2026-10-07 - Juna - Cloud-Gespräche beim Öffnen aktuell abrufen

**Auftrag:** Den bislang nur lokal vorhandenen Gesprächsabruf an den eigenen
Cloud-Browser anschließen und den Prüfzeitpunkt nachvollziehbar anzeigen.

**Befund:** Die Gesprächsansicht lädt bei Cloud-Konten nur gespeicherte Nachrichten.
Der direkte Anbieterabruf ist auf `executionMode = local` begrenzt; deshalb fehlt
die aktuelle Gesprächsbestätigung. Der automatische Cloud-Kontoabruf ist auf dem
Server um 20:56 und 21:11 UTC erfolgreich, die Nachrichtenquelle bleibt teilweise
gelesen. Eine Kontosynchronisation bestätigt nicht sämtliche Gesprächsdetails.

**Umsetzung:** Beim Öffnen eines Cloud-Gesprächs liest der vorhandene Browserdienst
das ausdrücklich ausgewählte Gespräch. Die RLS-geschützte Eintragszuordnung,
angemeldete Kontoidentität und aktive Browserreservierung werden geprüft.
Der bestehende Kontoimport übernimmt Nachrichten und Detailprüfzeitpunkt gemeinsam;
andere ungelesene Gespräche werden nicht geöffnet. Vorhandene Versionen erhalten
die unveränderten Detailprüfzeitpunkte anderer Gespräche. Die Ansicht übernimmt
die aktualisierten Daten ohne Konto- oder Gesprächswechsel. Veraltete Auswahlen
übernehmen keine verspätete Bestätigung; Fehler lassen gespeicherte Nachrichten
sichtbar. „Synchronisiert“ bleibt an den tatsächlich übernommenen Prüfzeitpunkt
gebunden. Cloud-Schreibaktionen werden nicht freigeschaltet.

**Prüfstand:** Regressionstests zeigen vor der Umsetzung die fehlende Detailprüfung
und anschließend neue Nachrichten und bestätigten Prüfzeitpunkt. 187 betroffene
Angular-Tests bestehen. Die Worker-Suite besteht mit 347 erfolgreichen Tests und
sieben unveränderten Auslassungen. Typprüfung und Produktionsbau für Anwendung
und Worker, gezieltes ESLint und Formatierung bestehen. Der Anwendungsbau meldet
weiterhin die bekannte CommonJS-Warnung für `pako`. Noch kein Deployment und kein
echter Vinted-Detailabruf mit dieser Änderung.

**CI-Nachprüfung am 08.10.:** Der Browser-Oberflächentest verwendet bislang eine
ungültige Gesprächs-ID und bildet den neuen Cloud-Abruf nicht ab. Dadurch erscheint
korrekt der Fehler mit Wiederholknopf. Die künstliche Testantwort erhält eine UUID,
den bestätigten Abruf und den gemeinsam übernommenen Detailprüfzeitpunkt. Der Test
prüft jetzt zusätzlich die Kontozuordnung des Abrufs und "Synchronisiert". Die
bestehende Prüfung gegen Bedienelemente in Nachrichten bleibt unverändert.
Alle sechs lokalen Browserprüfungen mit künstlichen Antworten bestehen bei
1440, 390 und 320 Pixeln im hellen und dunklen Design einschließlich AXE-Prüfungen.
Die vollständige CI-Nachprüfung auf diesem korrigierten Stand steht noch aus.
Die UUID gilt ausdrücklich für diese Cloud-Testdaten; die unabhängigen lokalen
Extension-Testantworten behalten ihre bisherigen Gesprächs-IDs. Ein pauschaler
Austausch würde dort einen bislang nicht simulierten Detailabruf aktivieren.
Der gemeinsame lokale Nachweis besteht mit acht Browserprüfungen: sechs Cloud-
Ansichten und beide unveränderten lokalen Postfach-Abläufe.

## 2026-10-07 - Juna - Cloud-Browserdienst wiederherstellen und Wiederanlauf absichern

**Auftrag:** Die Meldungen zum nicht erreichbaren Browserdienst und wartenden
Cloud-Abruf für Maike Vintage untersuchen und beheben.

**Befund:** Der Worker endet am 07.10.2026 um 19:11:21 UTC mit Exitcode 1,
ohne OOM-Abbruch. Seine Neustartregel ist `no`; der öffentliche Endpunkt liefert
HTTP 502. Davor sind automatische Abrufe um 18:40 und 18:56 UTC erfolgreich.
Der fehlgeschlagene Abruf um 19:11 UTC endet in der Browserphase. Die Protokolle
benennen den genauen Auslöser des Prozessendes nicht. Maike bleibt verbunden,
der 15-Minuten-Zeitplan bleibt aktiviert und wartet wegen `network` bis
19:41:21 UTC. Speicher, Festplatte und Firewallprüfung sind unauffällig.

**Betrieb:** Nach Bestätigung, dass keine offenen Aufträge, Browsersitzungen oder
Kontobrowsercontainer bestehen, wird ausschließlich der vorhandene Worker
erneut gestartet. Öffentliche Gesundheitsprüfung und Workerstatus sind danach
erfolgreich. Profil, Proxy und Zeitplan bleiben erhalten; Schreibaktionen sind
weiterhin deaktiviert. Dieser Neustart belegt noch keinen anschließenden Abruf.

**Umsetzung:** Die Compose-Vorlage erhält ausschließlich für den Worker
`restart: unless-stopped`. Die bestehende Berechtigungsprüfung und Recovery
bleiben Voraussetzung jedes Neustarts. Runtime-Abbrüche melden eine feste,
typisierte Fehlerkategorie, damit fehlgeschlagene Reservierung, Auftrag und
Lebenszeichen unterschieden werden können. Private Fehlertexte werden nicht
weitergegeben. Die Serverkonfiguration wird erst nach PR-Freigabe angepasst.

**Prüfung:** 51 gezielte Worker-Tests für Runtime, Browser-Recovery und
Sitzungsreservierung sowie Worker-Typprüfung und Bau bestehen. Ergänzte
Regressionstests prüfen alle sieben Abbruchkategorien und die einmalige
Sperrung weiterer Aufträge. Formatierung, gezieltes ESLint und Compose-Prüfung
bestehen. Die Compose-Prüfung bestätigt den Worker-Wiederanlauf, die erhaltene
Broker-Startregel und deaktivierte Schreibaktionen. Der öffentliche Dienst ist
bei der abschließenden Prüfung gesund; ein Abruf nach der Wiederherstellung
ist noch nicht nachgewiesen.

## 2026-10-07 - Juna - Alten Abruffehler aus der Vinted-Anmeldung entfernen

**Auftrag:** Prüfen, warum trotz angemeldetem Cloud-Konto nach dem Verbinden ein
Profilabruf-Fehler angezeigt wird.

**Befund:** Der Server hat Maikes Kontobestätigung am 07.10.2026 um 17:09:24 UTC
angenommen. Die beiden manuellen Profilabrufe davor (17:07:56 und 17:08:19 UTC)
scheiterten mit `forbidden`, entsprechend HTTP 403 beim Lesen von
`/api/v2/users/current`. Der Anmeldedialog zeigte deren gespeicherten
`mutationError` weiter an. Eine fehlgeschlagene Anmeldung folgt daraus nicht.
Die genaue Ursache der HTTP-403-Ablehnung bleibt offen. Der bestehende Zeitplan
ist weiterhin mit `needs_login` deaktiviert; diese Analyse aktiviert ihn nicht.

**Umsetzung:** Beim tatsächlichen Start eines neuen Browser-Anmeldeversuchs
wird der alte Kontofehler über die vorhandene Methode `clearMutationError`
zurückgesetzt. Neue Fehler dieses Anmeldeversuchs bleiben sichtbar. Keine
Änderung an Worker, Browserprofil, Proxy, Datenbank oder Sitzungsdaten.

**Prüfung:** Die beiden Regressionstests scheitern vorher am gespeicherten
Abruffehler. Nach der Korrektur bestehen 120 Angular-Tests für Browser-Store,
Anmeldedialog, Vinted-Arbeitsbereich und Marktplatz-Testseite. Die Service-Ersatzobjekte
auf der Testseite berücksichtigen ebenfalls das Zurücksetzen alter Meldungen.
Formatierung, gezieltes ESLint und der
Angular-Produktionsbau sind erfolgreich. Die Live-Kontobestätigung und vorherigen
403-Abrufe wurden nur über vorhandene Servermetadaten und Protokolle geprüft.
Ein erfolgreicher neuer Cloud-Abruf ist damit noch nicht nachgewiesen.

## 2026-10-07 - Juna - Meldungen des Sicherheits-Scans prüfen und korrigieren

**Auftrag:** Alle 19 Meldungen des vorhandenen Scans gegen den aktuellen
Repositorystand prüfen, bestätigte Fehler beheben und relevante Abläufe testen.

**Umsetzung:** 17 Meldungen erhalten gezielte Korrekturen: getrennte Registry-
Berechtigungen für PRs und Veröffentlichungen, Sniper-Deployment über den
gebauten Digest, ausdrückliche Verbindungserlaubnis im Erweiterungsfenster,
begrenzte Beta-Anfragen und Vinted-Antworten, Merkzettel-Limits, abgesicherte
Passwortänderungen, Adminrechte für Webhook-Ziele, Fremdschlüssel innerhalb
desselben Arbeitsbereichs, Bereinigung globaler Finanz-Caches, begrenzte
Kontoauszugs- und Bildimporte, stabile Kategorieprüfung, frühzeitige Entfernung
des Beta-Tokens, neutrale Beta-Antworten, begrenztes Retry-After und reservierte
Discord-Bindung vor der externen Rollenvergabe.

Die unabhängige Prüfung findet zusätzliche Wege in diesen Grenzen. Die
Korrekturen verhindern dauerhaft privilegierte Recovery-Sitzungen bei neuen
Beta-Abschlüssen, beenden verwendete Einladungs-/Recovery-Sitzungen nach dem
Passwortsetzen, entkoppeln SMTP vom öffentlichen Antwortpfad, speichern den
größten Kategorieumfang über Neustarts und prüfen Fotoarray-Längen vor Zod-
Kopien. Bildzuschnitte behalten die tatsächliche Browserorientierung. Zwei
generierte Migrationen begleiten die Schemaänderungen; API-Typen stammen aus
der isolierten Datenbank. Der bestehende Test für beschädigte Einkaufsdaten
legt seine absichtlich ungültige Zeile nur im vorhandenen Replikations-Fixture
an; die produktive Fremdschlüsselprüfung bleibt aktiv.

**Offen:** Zwei Meldungen zur vollständigen Übernahme des zentralen Chromium-
Workers benötigen eine gemeinsame Trennung von Browserarbeit und Verwaltung.
Für den vorhandenen kleinen Server ist eine Variante im bereits gestarteten
Browsercontainer vorbereitet: unveränderte Speichergrenzen, ein gleichzeitiger
Cloud-Abruf und die bestehende Warteschlange. Keine Worker pro Nutzer. Dieser
Umbau einschließlich GoLogin und Hostregeln ist noch nicht umgesetzt.

**Prüfung:** Beide Migrationen lassen sich mit der vollständigen Historie und
synthetischen Daten anwenden. 3.343 SQL-Prüfungen und 25 Sniper-Integrationsprüfungen
bestehen. Parallele Datenbankverbindungen können weder Merkzettel-Limits noch
die eindeutige Discord-Bindung umgehen. Direkte GoTrue-API-Prüfungen bestätigen
den Passwortschutz einschließlich erneuerter Sitzungen; Einladung und Reset
bleiben möglich. Der zuvor speicherintensive Katalogtrigger mit 1,5 Millionen
Vorschaubildern wird bei 110 MiB gemessenem Prozessmaximum abgewiesen. Caddy-
Konfiguration und Actionlint bestehen. Format, Lint, Typen, Workflow-Prüfungen,
Suite-Audit, 1.760 Node-, 306 DOM-, 210 Edge- und 39 Landing-Prüfungen sowie
der Produktionsbau bestehen. Der Gesamtbefehl scheitert zunächst an einem
unveränderten Deal-Monitor-Test mit fünf Sekunden Zeitlimit. Der Einzeltest
und anschließend alle 1.944 Angular-Prüfungen bestehen mit vier gleichzeitigen
Testprozessen; das Zeitlimit bleibt unverändert. Sieben Deployskript-Prüfungen
bestehen zusätzlich unter Linux ohne die Windows-bedingten Auslassungen.

**Einführung:** Noch kein Push, Merge oder produktiver Eingriff. Das aktualisierte
rootgeschützte Deployskript, die GoTrue-Einstellung und die neue Erweiterung
müssen gemeinsam mit der Anwendung eingeführt werden. Früher ausgegebene
Beta-Recovery-Sitzungen müssen vor der Freigabe widerrufen werden.

**Fortsetzung nach Freigabe:** Der Nutzer gibt PR, Pflichtprüfungen und Merge frei.
Der aktuelle master mit den unabhängig veröffentlichten Browseränderungen wird
übernommen. Botprofil-Vorbereitung, manuelle Prüfpause und optionale Wiederholungen
bleiben erhalten; Antwortgrößen und Retry-After bleiben auch in diesen Wegen
begrenzt. Die neuen Fremdschlüssel treffen produktiv auf keine ungültigen
arbeitsbereichsübergreifenden Beziehungen. Servervorbereitung und Veröffentlichung
werden vor dem Merge geprüft.

Das rootgeschützte Deployskript und das Auth-Overlay sind nach Sicherung auf dem
Server vorbereitet. Direkte API-Kontrollen mit einem anschließend entfernten
Testkonto liefern 400 ohne bisheriges Passwort, 400 bei falschem Passwort und
200 bei korrektem Passwort. Zwei alte Beta-OTP-Sitzungen werden über den nativen
Logout widerrufen; normale Passwortsitzungen bleiben erhalten. Der produktive
Auth-Dienst kennzeichnet bestätigte Reset-Links als `otp`; die Passwortseite
berücksichtigt diese verifizierte Sitzungsart, mit eigener Angular-Regression.

Der PR-Browserlauf zeigt eine kurzzeitig noch nicht angepasste Breite im
Auswahlmenü. Die Layoutprüfung wartet nun auf die geforderte Breite statt nur
auf Sichtbarkeit; ihre Grenze bleibt unverändert. Der Beta-Lebenszyklustest
zeigt bei fehlgeschlagenem Funktionsaufruf zusätzlich dessen öffentliche
Fehlerantwort, damit vor einem Merge die tatsächliche Ursache sichtbar ist.

## 2026-10-07 - Juna - Fehler beim erneuten Cloud-Seitenaufruf sichtbar machen

**Auftrag:** Den freigegebenen Cloud-Abruf-Fix veröffentlichen und mehrere
reguläre automatische Abrufe mit Maike Vintage prüfen.

**Produktiver Stand:** PR #332 ist mit grünen Pflichtprüfungen als v0.308.1
veröffentlicht. Ausschließlich das Worker-Image wurde ausgetauscht; Browserdienst,
Profil, Proxybindung und Berechtigungsversion 22 bleiben erhalten. Drei
kontrollierte Leseproben und ein vollständiger manueller Flipbase-Abruf laufen
durch. Automatische Abrufe um 13:02 und 13:17 UTC sind erfolgreich und beenden
den alten Wartestatus. Um 13:32 UTC scheitert der Profilschritt erneut mit
`browser_context`; der aktivierte Zeitplan wartet regulär bis 14:02 UTC.

**Eingrenzung:** Das neue Fehlerereignis enthält keine Browserkategorie.
Der entsprechende Fehlerpfad verwirft die Ausnahme beim erneuten Seitenaufruf
nach einer initialen 401-Antwort. Welche konkrete Navigationsausnahme im
Produktivbetrieb auftrat, ist deshalb weiterhin nicht bewiesen. Sechs weitere
kontrollierte Starts liefern jeweils 200 und reproduzieren diesen Ausfall nicht.
Die bisherigen erfolgreichen Abrufe belegen daher keine abgeschlossene Korrektur.

**Änderung:** Auch dieser Seitenaufruf erhält jetzt eine feste Fehlerkategorie.
Unterschieden werden unterbrochene oder abgebrochene Navigation, Zeitüberschreitung,
Netzwerk, geschlossener Browser, Skriptfehler und unbekannte Fehler. Die bestehende
Ausgabe bleibt auf acht Kategorien begrenzt und verwirft beliebige Fremdwerte.
Rohfehler, URLs, Anbieterantworten und Zugangsdaten werden nicht gespeichert.
Es kommen keine Wiederholungen oder sonstigen Änderungen am Abrufverhalten hinzu.

**Prüfung:** Neue Unit- und echte Chromium-Regressionen scheitern vor der
Ergänzung und bestehen danach. 41 gezielte Tests sind erfolgreich, einschließlich
sechs Chromium-Tests. Zusätzlich bestehen 339 Worker-Tests bei sieben bestehenden
übersprungenen Prüfungen, Typprüfung, Worker-Bau, Formatierung und gezieltes Lint.
Veröffentlichung dieser Diagnose-Ergänzung und Bestätigung der konkreten
produktiven Navigationsausnahme stehen noch aus.

**Fortsetzung nach Freigabe:** Der Nutzer gibt den zusätzlichen PR und dessen
Veröffentlichung frei. Weitere automatische Abrufe um 14:02 und 14:18 UTC sind
erfolgreich. Um 14:33 UTC scheitert die Identitätsbestätigung mit `unauthorized`;
der Zeitplan ist jetzt wegen `needs_login` angehalten und hat Berechtigungsversion 23. Die Veröffentlichung aktiviert diesen Zeitplan nicht eigenmächtig.
Der aktuelle `origin/master` mit den unabhängig veröffentlichten Botänderungen
wird übernommen; ausschließlich dieses Protokoll kollidiert. Alle Einträge beider
Sitzungen bleiben erhalten, persönliches Cloudprofil und Botprofil bleiben getrennt.

## 2026-10-07 - Juna - Vinted-Browserrelease produktiv abnehmen

**Abschluss:** PR #333 und die Profilkorrektur #334 sind nach erfolgreichen
Pflichtprüfungen gemergt. Version v0.309.4 ist einschließlich Produktionsbau,
Image-Smoke und öffentlicher Versionsprüfung erfolgreich veröffentlicht.
Bei der Abnahme am 07.10. läuft der neue Bot seit 16:26 Uhr mit seinem eigenen Chrome-Profil und sammelt
über 35 Minuten regulär Artikel ohne fehlgeschlagene Abrufe.

**Servervorbereitung:** Die private Browser-API war vom Caddy-Container durch
die bestehende Host-Firewall nicht erreichbar. Nach Prüfung der tatsächlichen
Container-IP, Bridge und Gateway sowie privater Sicherung der Regeln erlaubt
UFW ausschließlich diesem Container den internen Port 8081. Der öffentliche
Statusendpunkt antwortet ohne Anmeldung jetzt mit 401 statt 502. Die
Releaseanleitung enthält diese Voraussetzung und den Abgleich bei Netzwechseln.

**Live-Abnahme:** Der angemeldete Adminbereich zeigt „Vinted verbunden“, null
abgewiesene Anfragen in der letzten Minute und keine Fehlermeldung am aktiven
Markenfilter. Der Container ist gesund; der Webrelease hat ihn nicht neu
gestartet. Eine manuelle Prüfsitzung war im laufenden Betrieb nicht nötig;
deren Freigabe- und Abbruchverhalten wurde lokal und in CI geprüft.

## 2026-10-07 - Juna - Botprofil ohne passenden Host-Benutzer anlegen

**Auftrag und Befund:** Den freigegebenen Vinted-Browserrelease nach dem
erfolgreichen Merge von PR #333 fertigstellen. Der erste Produktionslauf stoppt
vor dem Austausch der Anwendung: `install (uutils coreutils) 0.8.0` lehnt
`-o 1000 -g 1000` ab, weil kein entsprechender Host-Benutzer vorhanden ist.
Die bestehende Anwendung und der bisherige Bot laufen weiter.

**Korrektur:** Das Deployskript legt das private Verzeichnis mit Modus `0700`
an und setzt anschließend den numerischen Eigentümer per `chown 1000:1000`.
Die Prüfung bestehender Profile und das Anhalten bei Fehlern bleiben erhalten.
Es wird kein Host-Benutzer angelegt. Der neue Zweig basiert ausschließlich auf
dem aktuellen `origin/master`; der bereits gemergte Featurezweig ist gelöscht.

**Prüfung:** Die Linux-Deploymentfixture simuliert fehlende Host-Benutzer und
scheitert zunächst mit derselben Meldung. Nach der Korrektur bestehen alle acht
Deploytests ohne Netzwerk, Formatierung, Lint und Git-Diff. Eine isolierte leere
Teststruktur auf dem echten Server bestätigt `700 1000:1000` mit dessen
Installationswerkzeug; sie wird danach entfernt. Das leere eigene Botprofil wird
als freigegebene Servervorbereitung mit denselben Rechten angelegt. Der bereits
vollständig geprüfte Release kann damit wiederholt werden; die dauerhafte
Skriptkorrektur wird über einen eigenen PR geprüft und veröffentlicht.

## 2026-10-07 - Juna - Manuellen Browserzugriff für den Artikelbot umsetzen

**Freigabe:** Der Nutzer bestätigt Entwurf, Umsetzungsplan und die Umsetzung in
dieser Sitzung mit einer unabhängigen Gesamtprüfung. Die ausdrückliche Ausnahme
für den Node-Bot gilt weiterhin. Nach den erfolgreichen lokalen Prüfungen
bestätigt der Nutzer die PR-Erstellung, den Merge nach erfolgreichen
Pflichtprüfungen sowie die anschließende Servervorbereitung und Veröffentlichung.

**Änderung:** Eigener nativer Chrome mit persistentem Botprofil. Automatische
Dokumentabrufe führen keine Seitenskripte aus. Bestätigte Prüfseiten sperren alle
gemeinsamen Botabrufe dauerhaft; reguläre Zeitlimits bleiben erhalten. Betreiber
öffnen im Botbetrieb eine exklusive, zeitlich begrenzte Sitzung mit Browserbild,
nativer Eingabe und manueller Wiederprüfung. Anmeldung und Betreiberrolle werden
bei jeder API-Aktion geprüft. Erst der revisionsgesichert angenommene Katalog
eines weiterhin aktiven Filters gibt den Bot frei. Persönliche Kontoprofile und
Datenbankschema bleiben unverändert.

**Prüfung:** 299 Botprüfungen, elf gezielte Angular-Prüfungen, Typprüfung und
Produktionsbau erfolgreich. Der echte Admin-Browsertest bestätigt Tastatur,
Fokus, Fehlerpause und AXE. Die isolierte lokale Chrome-Prüfung bestätigt aktive
Namespace-/Seccomp-Sandbox, private CDP-Adresse, native Eingabe, Bildabruf,
unterdrückte automatische Seitenskripte und Cookies nach regulärem Neustart.
Sie findet zunächst eine zurückbleibende Profilsperre; reguläres Browserende vor
Prozessbeendigung behebt sie. Alle acht Deploytests laufen in Linux erfolgreich,
einschließlich Laufzeitdateien vor Botstart und Abbruch bei fehlendem Auth-Key.
Shared-UI-Prüfung und Suitezuordnung bestehen.

**Unabhängige Gesamtprüfung:** Vier funktionale Fehler werden lesend reproduziert
und anschließend jeweils mit fehlschlagendem Regressionstest behoben. Die
gemeinsame Zugriffssperre gilt jetzt auch bei Origin-, Query- oder Probe-
Speicherfehlern; fehlgeschlagene dauerhafte Speicherung wird ohne weitere Abrufe
wiederholt. Eine hängende Navigation wird sofort abgebrochen. Manueller Zugriff
teilt den tatsächlichen letzten Abrufzeitpunkt mit Kategorien und anderen
Filtern. Schließen während der Verifikation entwertet die Lease sofort und
verwirft verspätete Ergebnisse im Dialog. Die letzte Prüfung besteht erneut:
299 Botprüfungen, elf Angular-Prüfungen, drei Admin-Browsertests, 227 Workflow-
Prüfungen (fünf Plattformausnahmen; die acht Deploytests laufen separat vollständig
unter Linux), Typen, Lint, Bau und Sandbox-Image. Caddyvalidierung und
Formatter bestehen. Die Auswahlprüfung enthält den neuen PR-Browsertest.
Der Container erhält 90 Sekunden zum regulären Beenden, damit laufende Abrufe
das saubere Schließen des Chrome-Profils nicht verhindern.

**Integration:** Der aktuelle `origin/master` (`41f3174e`) wird übernommen.
Der einzige Konflikt betrifft dieses Protokoll; beide Sitzungseinträge bleiben
erhalten. Anschließend bestehen erneut alle 299 Botprüfungen sowie 337
Workerprüfungen bei sieben bestehenden Ausnahmen, Worker-Typprüfung und -Bau.

**PR und Servervorbereitung:** PR #333 ist erstellt. Vor der Veröffentlichung
werden Deployskript und Botkonfiguration auf dem Server unter einem privaten
Betreiberbackup gesichert. Der Dateivergleich enthält ausschließlich die
geprüfte Browservorbereitung. Das geprüfte Deployskript und der bestehende
öffentliche Auth-Key sind installiert; der produktive Bot bleibt bis zum
erfolgreichen Merge auf der bisherigen Fassung.

**Linux-CI-Korrektur:** Der erste Botlauf wird durch ein Signal beendet. Ein
isolierter Linux-Test reproduziert den Abbruch im Prozess-Test: künstliche
`ChildProcess`-Objekte rufen die echte Betriebssystem-Signalmethode auf. Die
Tests ersetzen diese Methode jetzt durch eine Attrappe und prüfen weiterhin
`SIGTERM`, anschließend `SIGKILL` und die gesperrte Wiederverwendung bei nicht
bestätigtem Ende. Alle 299 Botprüfungen bestehen danach auch im Linux-Container
ohne Netz; der gezielte Windows-Test, Typprüfung, Lint und Formatierung bestehen.
Die übrigen Prüfungen des ersten PR-Laufs einschließlich Browserprüfung sind
erfolgreich. Die Pflichtprüfungen werden für den korrigierten Stand erneut ausgeführt.

**Releasevertrag:** Webimage enthält die passende Bot-Compose-/Seccomp-Konfiguration.
Der Betreiber muss das geprüfte Deployskript und den öffentlichen Auth-Key vor
der ersten Veröffentlichung bereitstellen. Keine produktive Browserfreigabe und
keine wiederhergestellte Liveverbindung behauptet. Die unabhängige Gesamtprüfung
ist mit den geprüften Korrekturen abgeschlossen; die PR-Freigabe liegt vor.

## 2026-10-07 - Juna - Eigene Browsersitzung für den Artikelbot entwerfen

**Freigabe:** Der Nutzer erlaubt ausdrücklich Änderungen am serverseitigen
Node-Bot als Ausnahme zur allgemeinen Frontend-Grenze. Die vorgeschlagene
eigene Botsitzung mit manueller Prüfung wird als konkreter Entwurf ausgearbeitet.

**Entwurf:** Persistentes eigenes Chrome-Profil, dauerhafte gemeinsame Pause
bei bestätigter Prüfseite und exklusiver manueller Zugriff im Adminbereich.
Wiederaufnahme erst nach erfolgreich geparstem und revisionsgesichert
angenommenem Katalog. Die heutige Behandlung alter `blocked`-Zustände würde
sonst neue Proben starten; der neue Grund `interaction_required` muss deshalb
gezielt dauerhaft respektiert werden. Kategorieabrufe und manuelle Bedienung
teilen die Abrufsperre. Betreiberrechte werden bei jedem Browser-API-Aufruf
serverseitig geprüft. Persönliche Kontositzungen bleiben getrennt.

**Stand:** Der Nutzer hat den schriftlichen Entwurf ausdrücklich freigegeben.
Der konkrete Umsetzungsplan liegt unter
`docs/superpowers/plans/2026-10-07-vinted-bot-browser.md`: sechs Aufgaben mit
Schnittstellen, Regressionstests, Authentifizierung, UI und Releasevertrag.
Die Prüfung konkretisiert im Entwurf, dass ein `Retry-After` den frühesten
manuellen Abruf bestimmt, die dauerhafte Sperre aber nicht automatisch aufhebt.
Plan und Schnittstellen sind intern gegen den Entwurf geprüft; Planfreigabe
und Ausführungswahl stehen aus. Keine Produktcode-, Schema-, Paket- oder
Releaseänderungen und keine weiteren produktiven Vinted-Anfragen. Formatierung
und Git-Diff bestehen; Anwendungstests sind noch nicht sinnvoll.

## 2026-10-07 - Juna - Erneute Ablehnungen und regulären Chrome-Vergleich prüfen

**Auftrag:** Nach dem fehlgeschlagenen ersten langsameren Abrufversuch die
Reparatur weiter untersuchen. Der Nutzer bestätigt den zentralen Artikelbot
im Adminbereich, nicht die persönlichen Kontoverbindungen.

**Befund:** Auch die automatischen Proben um 12:59:50 und 13:04:51 Uhr scheitern
mit HTTP 403 und erkannter Cloudflare-Prüfseite. Die aktuellen Suchbedingungen
erzeugen weiterhin denselben Kategorie-/Markenabruf; die Ablehnung geschieht
vor Parser und Titelprüfung. Die passive Socketbeobachtung erfasst die kurze
Vinted-Verbindung nicht und beweist deshalb deren tatsächliche IP-Familie nicht.

**Browservergleich:** „Nike Neu“ wird kurz pausiert, damit keine reguläre Probe
parallel läuft. Nach Ende der bereits gespeicherten Zugriffspause erhält genau
ein Abruf derselben Katalogadresse in Google Chrome 155.0.8059.39 um 13:09:56 Uhr
ebenfalls HTTP 403 mit `cf-mitigated: challenge`. Die Prüfseite wird vor
Darstellung und Ausführung beendet; keine Challenge-Lösung wird versucht.
Ein frischer Browser erhält damit ebenfalls eine Prüfseite. Das ist kein Test
einer legitimen manuellen Freigabe und beweist keine dauerhafte IP-Sperre.

**Betrieb:** Vorhandenes geprüftes Chrome-Abbild, aktivierte Sandbox, isolierter
Container ohne Produktionsvolumes oder Kontodaten, dieselbe Serveranbindung,
keine Proxies oder veränderte Browseridentität. Testcontainer anschließend
automatisch entfernt und seine Abwesenheit geprüft. Nach mindestens 60 Sekunden
Abstand wird ausschließlich der eigene pausierte Auftrag per Revisionsprüfung
wieder aktiviert; 60 Sekunden Takt und Suchbedingungen bleiben erhalten. Um
13:12:31 Uhr ist Nike aktiv, Adidas/Ralph Lauren bleiben deaktiviert. Die
reguläre Probe um 13:11:24 Uhr ist erneut abgewiesen; der Zugang ist nicht repariert.

**Nächster Schritt und Grenze:** Die offiziellen Cloudflare-Verträge bestätigen
die Grenze reiner HTTP-Clients und nicht unterstützte automatische Challenge-
Löser. Die dokumentierte Vinted-Pro-API ist kein geprüfter Ersatz für die
allgemeine Markensuche. Ein Browserwechsel allein ist ebenfalls keine belegte
Reparatur. Ein geregelter Zugriffspfad mit expliziter Freigabe muss festgelegt
werden. Wegen der aktuellen globalen Backend-Grenze ist eine ausdrückliche
Ausnahme für Änderungen an `services/sniper` angefragt und noch offen. Der
nummerierte Auftrag mit Befunden, Grenzen und Abnahme liegt unter
`C:\Users\gt\Desktop\Backend Issues\vinted-access-analysis\01-vinted-article-bot-challenge-recovery.md`.
Keine Anwendungscode-, Schema-, Paket- oder Releaseänderung ausgeführt.

## 2026-10-07 - Juna - Langsameren Abruf des zentralen Artikelbots produktiv testen

**Freigabe:** Der Nutzer bestätigt mit „los“ den vorgeschlagenen Versuch mit
längeren Abrufabständen für den zentralen Marken-/Artikelbot im Adminbereich.

**Vorprüfung:** Vor der Änderung ist die automatische Probe um 12:41:21 Uhr
bereits erfolgreich. Seitdem liefern die regulären Abrufe wieder Artikel.
Diese Erholung geschieht beim bisherigen Zehn-Sekunden-Solltakt und darf nicht
der späteren Änderung zugeschrieben werden.

**Änderung:** Am 7. Oktober um 12:53:52 Uhr wird ausschließlich der aktive
Suchauftrag „Nike Neu“ von zehn auf 60 Sekunden gestellt. Eine kurze Transaktion
prüft und sperrt den erwarteten Auftrag und bricht bei einer abweichenden
Einstellung oder weiteren aktiven Aufträgen ab. Ein Vergleich der vollständigen
Zeile erlaubt nur das Intervall, den Änderungsstempel und die vom vorhandenen
Trigger erhöhte Formularrevision. Suchbedingungen, Aktivierung, Cursor und
Fehlerzustand bleiben erhalten. Der Container wird nicht neu gestartet;
Zugriffspausen werden nicht zurückgesetzt. Kein Schema- oder Produktcodeumbau.

**Prüfung:** Die Transaktion ist bestätigt; der gespeicherte Solltakt beträgt
60.000 Millisekunden. Der erste nachfolgende automatische Abruf um 12:54:48 Uhr
scheitert erneut mit HTTP 403 und `challengeDetected=true`, etwa 65 Sekunden
nach dem letzten erfolgreichen Abruf. Die gemeinsame Pause und die einzelne
nächste Wiederprüfung ab 12:59:47 Uhr sind korrekt gespeichert. Um 12:55:21 Uhr
stehen weiterhin 60 Sekunden, ein Folgefehler und keine seit der Änderung neu
entdeckten Artikel in der Datenbank. Die Intervalländerung verhindert diese
nächste Ablehnung nicht. Damit ist weder eine Lösung noch ein Ausschluss des
Abrufrhythmus als Mitursache bewiesen; eine schon bestehende Anbieterbewertung
kann fortwirken. Für weitere Beobachtung bleibt die freigegebene Einstellung
bei 60 Sekunden. Keine zusätzlichen Vinted-Anfragen oder produktiven Änderungen.
Nur Betriebswerte und Logs gelesen; Formatierung und Git-Diff des Protokolls
geprüft. Keine Anwendungstests oder Builds für diese reine Betriebseinstellung.

## 2026-10-07 - Juna - Wiederkehrende Zugriffssperren des zentralen Vinted-Artikelbots untersuchen

**Auftrag:** Die häufige Meldung „Zugriff abgewiesen“ seit dem letzten Update
im administrativen Bereich des zentralen Marken-/Artikelbots untersuchen.

**Befund:** Lesende Server- und Datenbankprüfung um 12:31 Uhr deutscher Zeit.
Der Container `flipbase-sniper` läuft mit `sha-da3069f`, Hostnetzwerk und ohne
Neustarts seit 11:56 Uhr. Bereits sein erster Durchlauf übernimmt eine
gespeicherte Zugriffspause. Alle sieben protokollierten Abrufe von 12:00 bis
12:31 Uhr scheitern mit HTTP 403 und `challengeDetected=true` in der
Anfragephase. Die Cloudflare-Prüfseite ist damit anhand des vom Sammler
ausgewerteten Antwortheaders erkannt; ihr Auslöser bleibt unbewiesen.

Nur „Nike Neu“ ist aktiv: Kategorie 2050, Marke 53, Sollintervall zehn Sekunden.
Adidas und Ralph Lauren sind deaktiviert. Der letzte erfolgreiche Abruf und
Artikel-Erstfund stammen vom 7. Oktober um 11:30:24 Uhr; im letzten
Stundenfenster wurden keine neuen Artikel gespeichert. Der Dienst hält die
gemeinsame Pause ein und führt etwa alle fünf Minuten eine einzelne Probe aus.
Das konfigurierte Minutenbudget von 30 ist eine Obergrenze, keine gemessene
Anfragerate. Ein hoher Anfragetakt oder eine konkrete IP-Sperre ist als Ursache
nicht nachgewiesen.

**Updateabgleich:** Zwischen dem lokal vorgefundenen Stand `b0cdf268` und dem
produktiven `da3069f1` sowie seit dem Suchfeed-Stand `c40f9f42` gibt es keine
Änderungen an Botquellcode, Bot-Lockfile oder Bot-Compose. Die vorherige Änderung
vom 6. Oktober ergänzt die Suchfilterverarbeitung; Anfrageabstand, Fehlerpolitik
und Netzwerkpräferenz bleiben im geprüften Vergleich unverändert. Der heutige
Neustart kann deshalb nicht als Beginn dieser Zugriffspause gelten. Eine
Regression durch die früheren Suchfilteränderungen ist dadurch nicht vollständig
ausgeschlossen. Der Audit vom 1. Oktober dokumentiert bereits denselben
Fehlertyp, beweist aber keine identische Ursache für den aktuellen Vorfall.

**Prüfung und Grenze:** Dockerstatus und gefilterte Botlogs gelesen, produktive
SQL-Abfragen ausschließlich in `begin read only` mit anschließendem Rollback,
Git-Unterschiede geprüft und den offiziellen Cloudflare-Vertrag zu
`cf-mitigated: challenge` abgeglichen. Keine zusätzlichen Vinted-Anfragen,
keine Kontoaktionen, keine produktiven Änderungen und kein Anbieterzugriff
umgangen. Kein bestätigter Codefehler und keine Korrektur behauptet. Nur dieser
Sitzungseintrag wird im eigenen Analysezweig ergänzt; keine Anwendungstests
oder Builds für die reine Diagnose ausgeführt.

## 2026-10-07 - Juna - Unterbrochene Cloud-Leseanfragen begrenzt wiederholen

**Auftrag:** Sporadische Browserfehler beim automatischen Abruf von Maike
Vintage untersuchen, die Ursache eingrenzen und die regelmäßige Aktualisierung
gezielt absichern.

**Produktive Diagnose:** Nach dem Bewertungsupdate folgen erfolgreiche
automatische Abrufe um 11:00 und 11:15 UTC; um 11:31 scheitert der Profilschritt
mit `browser_context`. Der reguläre Folgeversuch um 12:01 UTC läuft erfolgreich
und beendet den Wartestatus. Beim kontrollierten Starttest sind zusätzliche
Navigationen innerhalb derselben Vinted-Seite sichtbar. Die produktive
Fehlerkategorie verliert bisher die konkrete Ausnahme; eine abschließende
Zuordnung dieses sporadischen Fehlers bleibt deshalb offen.

**Reproduktion und Korrektur:** Zwei echte Chromium-Tests zeigen den Ausfall
beim Dokumentwechsel während Profil- und Postfachanfragen. Ein zerstörter
Ausführungskontext wartet jetzt auf ein auswertbares, geladenes Dokument und
wiederholt ausschließlich die betroffene GET-Anfrage genau einmal. Profil,
IP und Sitzung bleiben gleich; Zugriff wird vor dem Warten und vor der
Wiederholung neu geprüft. Anmelde-/Zweitfaktorseiten, geschlossene Browser,
Skriptfehler und HTTP-Ablehnungen starten keine zusätzliche Wiederholung.
Auch ein zweiter Dokumentverlust bleibt ein sichtbarer Quellenfehler.

**Diagnoseausgabe:** Feste Kategorien für Navigation, geschlossene Browser,
Skriptfehler und unbekannte Fehler bleiben sowohl bei fehlgeschlagenen als
auch bei übernommenen Teilabrufen erkennbar. Die Ausgabe enthält höchstens
acht Kategorien, keine Rohfehler, Anbieterantworten oder Zugangsdaten.

**Prüfung:** Die neuen Unit- und Chromium-Regressionen scheitern vor der
Korrektur. Nach der Änderung bestehen 337 Worker-Tests bei sieben bestehenden
übersprungenen Prüfungen und die fünf echten
Browsertests zur Sitzungswiederherstellung, Typprüfung, Worker-Bau, Format
und gezieltes Lint. Drei kontrollierte Leseproben mit dem geänderten Import
im bestehenden Cloudprofil laufen durch, ohne Produktionsdaten zu schreiben.
Der produktive Worker bleibt unverändert; temporäre Prüfmodule wurden
entfernt. Mehrere automatische Durchläufe mit der neuen Version und die
Bestätigung der genauen produktiven Fehlerursache stehen noch aus.

## 2026-10-07 - Juna - Neue Vinted-Bewertungen in der Glocke melden

**Auftrag:** Neue Bewertungen nach einem Kontoabruf dauerhaft in der
Benachrichtigungsglocke anzeigen, zusätzlich zur Korrektur ihrer Herkunft.

**Umsetzung:** Der übernommene Profilstand erzeugt serverseitig eine Meldung je
neuer Bewertungskennung. Der erste erfolgreiche Abruf übernimmt nur den
Ausgangsbestand; bestehende Profile verwenden ihren vorherigen Bestand.
Mitgliederbewertungen, automatische und noch unbekannte Herkunft werden
gemeldet. Wiederholungen, Herkunfts-/Textkorrekturen, fehlgeschlagene oder
veraltete Importe erzeugen keine zusätzlichen Meldungen. Beim Leeren bleiben
die bekannten Kennungen gespeichert, damit Meldungen nicht wiederkehren.

Die Glocke vereint allgemeine Meldungen, Favoriten und Bewertungen. Ein Klick
führt zur Bewertungsübersicht des zugehörigen Kontos. Lesestatus und Leeren
gelten workspaceweit wie beim vorhandenen Favoritenstrom. Ein eigener privater
Broadcastkanal invalidiert den Feed ohne Kontodetails; regelmäßiges Nachladen
sichert Wiederverbindungen ab. Betreiber- und Workspace-Adminrechte bleiben
erforderlich; Browser können keine Meldungen erzeugen oder Details ändern.

**Datenbank:** Deklaratives Schema, registrierte Migration und neu erzeugte
API-Typen. Die Migration stammt aus dem Supabase-PgDelta-Katalogabgleich;
objektbezogene ACLs werden aus dem Zielkatalog explizit ergänzt, einschließlich
der Identitätssequenz. Der Transaktionsrahmen bleibt beim Releasepaket.
Isolierte Datenbanken enthalten ausschließlich Schema und synthetische
Testkonten. Keine Produktionsdaten oder Kontozugänge werden kopiert.

**Prüfung:** 44 Datenbankprüfungen bestehen sowohl auf dem deklarativen Ziel
als auch nach Migration mit der Produktionsrolle. Objektberechtigungen sind
abgeglichen. 20 Modell-/Headeraktionstests und 24 Angular-Tests bestehen;
Typprüfung, Format, Lint und Anwendungsbau bestehen. Testzuordnung,
Schemaregistrierung und die betroffenen Workflowprüfungen bestehen ebenfalls.
Die produktive Veröffentlichung und eine tatsächlich neu eingegangene
Bewertung sind noch nicht bestätigt.

## 2026-10-07 - Juna - Herkunft und Datum von Cloud-Bewertungen korrigieren

**Auftrag:** Bewertungen von Mitgliedern und automatische Vinted-Bewertungen
korrekt unterscheiden. Im Cloudkonto erscheinen beide importierten Einträge
als „Herkunft unbekannt“ und dadurch in keiner der beiden Kategorien.

**Ursache:** Zwei kontrollierte manuelle Kontoabrufe bestätigen die echte
Antwortform von `/api/v2/feedbacks`: `system_feedback=false` bei beiden
Mitgliederbewertungen. Der Import berücksichtigt bislang nur `is_automatic`
und `feedback_type`. Außerdem überdeckt das lokalisierte `created_at` den
gültigen ISO-Zeitstempel in `created_at_ts`, wodurch das Abrufdatum erscheint.
Die Diagnose liest nur Feldnamen, Herkunftskennzeichen und Zeitstempel;
Zugangsdaten oder vollständige Anbieterantworten werden nicht protokolliert.

**Korrektur:** Der Worker wertet das ausdrückliche boolesche Kennzeichen
`system_feedback` aus und bevorzugt `created_at_ts`. Bestehende Kennzeichen
bleiben unterstützt, fehlende oder unpassende Werte bleiben unbekannt.
Keine Herkunftserkennung anhand des Freitexts, kein Frontend-Workaround und
keine Datenbankmigration. Nach Veröffentlichung ersetzt ein regulärer Abruf
die bisher unbekannten Herkunftswerte und falschen Daten.

**Prüfung:** Der neue Regressionstest scheitert vor der Änderung an der
unbekannten Herkunft. Nach der Korrektur bestehen 27 Importtests und die
Worker-Suite mit 330 bestandenen und sieben bestehenden übersprungenen Tests.
Worker-Typprüfung einschließlich Produktionsbau-Typen, acht Angular-Tests der
Bewertungsanzeige sowie Format und gezieltes Lint bestehen. Veröffentlichung
und Bestätigung der korrigierten produktiven Anzeige stehen noch aus.

## 2026-10-07 - Juna - Ersten geplanten Proxyabruf beobachten

**Auftrag:** Der Nutzer aktiviert Maikes Automatik in Flipbase. Den ersten
geplanten Abruf ohne zusätzliche manuelle Aktualisierung beobachten.

**Vorprüfung:** Der gespeicherte Zeitplan ist aktiviert, mit Abstand 15 Minuten
und Berechtigungsversion 22. Nächster Termin ist der 07.10., 08:58:51 UTC.
Kein anderes Konto ist aktiviert, keine Cloudaktion oder Browsersitzung offen.
Der Worker bestätigt aktive Zeitsteuerung, aktuelle Firewallfreigabe und
deaktivierte Schreibaktionen.

**Ergebnis:** Der erste Auftrag mit `authorization_kind=scheduled_read`
startet um 08:59:04 UTC und endet um 08:59:11 UTC erfolgreich. Der gespeicherte
Datenstand stammt aus 08:59:08 UTC. Profil, Inserate, Gesprächsübersicht und
Bewertungen sind vollständig; Nachrichten und Verkäufe fehlerfreie Teilstände.
Keine neue Anmeldung erforderlich. Der Kontoterminplan bleibt aktiviert mit
Berechtigungsversion 22, ohne Pausengrund; nächster Termin 09:14:11 UTC.
Nach dem Abruf sind keine Cloudaktionen, Browsersitzungen oder regulären
Browsercontainer offen. Die Profilbindung bleibt `iproyal-pilot-a` und die
Gesundheitsprüfung des Workers besteht. Dies bestätigt den ersten geplanten
Proxyabruf, noch keinen Langzeitbetrieb oder automatische Schreibaktionen.

## 2026-10-07 - Juna - Proxyverbindung prüfen und Cloud-Zeitsteuerung freigeben

**Auftrag:** Nach erfolgreicher Cloud-Verbindung erklären und prüfen, warum
Maike Vintage weiterhin eine pausierte Automatik anzeigt; den bereits
freigegebenen lesenden Pilot über die reservierte IP vorbereiten.

**Live-Prüfung:** Maikes neues Profil ist an `iproyal-pilot-a` gebunden,
die Cloud-Einrichtung abgeschlossen. Ein erneuter Ausgangstest bestätigt
Deutschland und denselben IP-Fingerabdruck wie der registrierte Zugang.
Der manuelle Abruf vom 07.10., 08:36:52 bis 08:36:57 UTC endet erfolgreich:
Profil, Inserate, Gesprächsübersicht und Bewertungen vollständig;
Nachrichten und Verkäufe als fehlerfreie Teilstände. Der Kontoterminplan
ist deaktiviert, ohne Pausengrund und ohne aufeinanderfolgende Fehler.

**Betrieb:** Eine private Kopie der aktuellen Produktionskonfiguration
aktiviert ausschließlich die globale Zeitsteuerung. Worker- und Browserimage,
Hostbroker, Firewall, Profil und deaktivierte Schreibaktionen bleiben erhalten.
Der Worker wurde bei leerer Warteschlange geordnet neu gestartet und ist gesund.
Maikes Kontoschalter bleibt deaktiviert; in Flipbase kann der Nutzer jetzt
unter Kontoeinstellungen die Automatik fortsetzen. Ein erfolgreicher geplanter
Abruf über den Proxy ist noch nicht bestätigt. Kein automatischer Nachrichten-
oder Angebotsversand und kein anderer Kontoterminplan wurden aktiviert.

## 2026-10-07 - Juna - Borg-Umbau umgesetzt und vollständigen Restore geprüft

**Auftrag:** Den recherchierten schlanken Backup-Aufbau auf dem vorhandenen zweiten Server umsetzen.

**Umsetzung:** Ein aktueller Rohstand auf dem Hauptserver statt täglich neuer Bild-Vollarchive. Der Backupserver holt neue Stände über einen eigenen, auf seine IP und `rrsync -ro` beschränkten Leseschlüssel. Borg, Repository-Zugang und Bereinigung bleiben vollständig auf dem Backupserver; der Hauptserver erhält keine Borg-Passphrase und keinen Repo-Löschzugriff. Nach vollständigem Zurücklesen und Prüfsummenvergleich bestätigt eine kleine Datei den Stand; erst dann darf die Quelle ihren Vorgänger ersetzen. Bereits bestätigte Stände übertragen bei weiteren Abfragen nur das Manifest. Fehler, beschädigte Inhalte, veränderte Storage-Daten und Stände älter als 26 Stunden werden abgewiesen. Sieben Tages- und vier zusätzliche Wochenstände, drei vorhandene Release-Abzüge und begrenzter Altbestand; die strikte Migrationssicherung bleibt erhalten. PostgreSQL-Konfiguration mit dem separaten pgsodium-Schlüssel wird ebenfalls erfasst. Eine rootgeschützte Bestätigungsdatei wird atomar publiziert, ohne Verknüpfungen im Uploadordner zu folgen.

**Pilot und Prüfung:** Borg 1.2.8 aus den Ubuntu-Paketen auf dem zweiten Server eingerichtet, ohne bestehende Pakete zu aktualisieren oder Anwendungscontainer neu zu starten. Neuer vollständiger Stand mit 261 Dateien und rund 403 MB Rohinhalt erfolgreich übertragen und aus Borg zurückgelesen. Zwei Pilotstände haben zusammen 309.855.298 komprimierte Bytes, tatsächlich 156.986.506 eindeutige komprimierte Bytes; Repo-Verzeichnis 157.097.984 Bytes. Repository-Limit 8.000.000.000 Bytes. Isolierter Restore mit dem identischen Supabase-PG17-Abbild erfolgreich: 105 öffentliche Tabellen, vier Auth-Konten, 117 Storage-Objekte, passende Storage-Metadaten und sämtliche 117 referenzierten Bilddateien vorhanden. PostgreSQL-17-Grantor erfordert denselben Bootstrap-Superuser `supabase_admin`; nur dessen vorhandene CREATE-ROLE-Zeile wird übersprungen, alle übrigen SQL-Fehler bleiben strikt. Recovery-Paket verschlüsselt auf beiden Servern abgelegt und nach Entschlüsselung ausschließlich per Hash mit den Originalen verglichen; keine Schlüssel oder Datensätze ausgegeben. 11 neue Schutztests und 18 bestehende Retention-Tests unter Linux erfolgreich; neue Workflow-Datei gelintet und formatiert. Fremde Shellbefehle über den Leseschlüssel abgewiesen.

**Stand:** Neue Zeitpläne und Umschaltung sind vorbereitet, aber noch nicht aktiviert; bestehende Nachtläufe und Altstände bleiben bis zum freigegebenen PR bestehen. Betriebsanleitung enthält Installation, Rückfallweg, einen wöchentlichen lokalen Restore-Test und den separaten Test eines tatsächlich aus Borg extrahierten Stands. Eine dritte unabhängige Schlüsselkopie außerhalb beider Server bleibt nicht verifiziert.

## 2026-10-07 - Juna - Vinted-Anmeldemodal 1:1 an freigegebenen Entwurf angleichen

**Auftrag:** Das Vinted-Anmeldemodal exakt an den freigegebenen Polaris-Entwurf
(Mockup) anpassen. Die Segmented-Control-Methode-Tabs wiederherstellen, den
Konto-Identitätsstreifen bündig unter der Kopfzeile platzieren, das Kopfzeilen-
Icon ergänzen und die 2 Ansichten (Formular vs. interaktive Browseransicht) mit
voller Aktionsbreite umsetzen.

**Umsetzung:**

1. **Bündiger Identitätsstreifen:** Der Konto-Identitätsstreifen sitzt mit
   `-mx-5 -mt-5` randbündig direkt unter der Kopfzeilentrennlinie mit
   Konto-Badge (Teal-Statuspunkt) und Bereit-Status.
2. **Kopfzeilen-Icon:** Einbindung von `LucideLink2` mit `brand`-Farbton auf
   `app-modal-shell` in `MarketplaceAccountsComponent` und `MarketplaceConnectComponent`.
3. **Segmented Method Tabs:** Pill-Container mit den beiden Methoden
   („Zugangsdaten eingeben“ mit Schloss-Icon und „Direkt im Browser“ mit Bildschirm-Icon)
   zum Umschalten zwischen Formular und Direktansicht.
4. **Ansicht 1 (Zugangsdaten):** 2-spaltige Eingabefelder, Trust-Box mit grünem Schild,
   breiter primärer Aktionsbutton („Anmelden und Konto verbinden“) in Flipbase-Gelb
   mit Pfeilsymbol sowie dezenter Direktbrowser-Link darunter.
5. **Ansicht 2 (Direkt im Browser):** Zentrierte Informationskarte mit
   Bildschirm-Icon, Erklärungstext und „Browser-Sitzung starten“-Aktion.

**Prüfung:** 99 Angular-Unit-Tests in `marketplace-browser-test`, `marketplace-accounts`
und `vinted-workspace` (inkl. AXE-Barrierefreiheit) bestehen. TypeScript-Typprüfung,
ESLint, Prettier und Admin-UI-Check fehlerfrei (0 Findings).

## 2026-10-07 - Juna - Vinted-Anmeldefenster nach Shopify-Polaris überarbeiten

**Auftrag:** Das Vinted-Anmeldefenster stimmig, aufgeräumt und passend zur
Polaris-Designlinie gestalten. Die dreifache Kasten-in-Kasten-Verschachtelung
beseitigen, die breite Leere im Anmeldeschritt beheben und die beiden
Anmeldewege verständlich strukturieren.

**Umsetzung:**

1. **Entschachtelung:** Das Modal (`app-modal-shell`) bildet den direkten Rahmen.
   Im Kompaktmodus entfallen die verschachtelten `app-card`-Container um das
   Formular.
2. **Kompakte Anfangsgröße & dynamische Erweiterung:** Der Dialog startet fokussiert
   in `size="lg"` (ca. 620 px) und erweitert sich über ein `previewActive`-Signal
   erst bei aktiver interaktiver Browser-Vorschau (Captcha/Stream) auf `size="xl"`
   (896 px).
3. **Konto-Identitätszeile:** Ein kompakter Streifen fasst den Namen des
   ausgewählten Kontos mit Statusindikator und Bereit-Status zusammen.
4. **Klare 2-Wege-Aktionen:** Primärer Anmeldebutton („Anmelden und Konto verbinden“)
   in Markenfarbe Flipbase-Gelb (`#fcc601`) neben direktem sekundären Button
   („Direkt im Browser anmelden“) für Google-/Apple-Login und manuelle Eingabe
   ohne Umwege über Zwischen-Tabs.
5. **Datenschutz & Sicherheit:** Ein dezenter Trust-Hinweis mit Schild-Symbol
   erklärt die sichere Ausführung im isolierten Cloud-Profil und die flüchtige
   Handhabung von Passwörtern. Redundante Fußzeilen und Abbrechen-Links entfallen.

**Prüfung:** 103 Tests in `marketplace-browser-test`, 30 Tests in `marketplace-accounts`
(inkl. AXE-Barrierefreiheit) und 50 Tests in `vinted-workspace` bestehen. TypeScript-
Typprüfung, ESLint, Prettier-Formatierung und `scripts/check-admin-shared-ui.mjs`
bestehen fehlerfrei (0 Findings).

## 2026-10-07 - Juna - Zweiten Server gezielt bereinigt

**Auftrag:** Im Zuge der Speicher- und Sicherungsanalyse auch auf dem zweiten Server Platz freigeben.

**Umsetzung:** Nach konkreter Vorschau 73 ältere verschlüsselte Release-Abzüge mit 10.389.338.139 Bytes entfernt. Die neuesten drei Release-Abzüge und alle täglichen Sicherungen bleiben erhalten. Sämtliche 24 auf dem Hauptserver aufbewahrten Sicherungsdateien vor und nach der Bereinigung per SHA-256 mit dem zweiten Server abgeglichen. Neun eindeutig dem Agency-Care-Worker zugeordnete, ungetaggte und von keinem Container verwendete Images ohne Erzwingen entfernt; aktives Image, Compose-Referenzen und zwei zusätzliche Vorgängerversionen geschützt. Archivierte Systemjournale nach Rotation auf etwa 476 MiB reduziert. Keine Volumes, Container, Anwendungsdaten oder VS-Code-Installationen gelöscht.

**Prüfung:** Root-Belegung von 90 auf 59 Prozent, verfügbare Bytes von 3.951.255.552 auf 15.715.565.568; insgesamt 11.764.310.016 Bytes beziehungsweise etwa 10,96 GiB freigegeben. Alle sechs Container haben nachher dieselben IDs, Images, Laufzustände und Startzeiten. Vorschau und Ergebnis als rootgeschützte JSON-Protokolle auf dem zweiten Server abgelegt. Die vorhandene altersbasierte Backup-Cronregel und die Sicherungsarchitektur wurden bei diesem einmaligen Lauf nicht umgestellt; die dauerhafte neue Aufbewahrung bleibt Teil des Vorschlags.

## 2026-10-07 - Juna - Borg mit Restic, Kopia und gehosteten Sicherungszielen verglichen

**Auftrag:** Prüfen, ob Borg die passende Wahl ist oder eine andere Sicherungslösung für Flipbase besser passt.

**Ergebnis:** Herstellerdokumentation zu Borg, Restic, Kopia und BorgBase verglichen und das Recherchepapier ergänzt. Borg bleibt der bevorzugte Kandidat für den vorhandenen SSH-Backupserver; Restic ist die passendere Option bei einem direkt S3-basierten Sicherungsziel. Ein späterer S3-Bildspeicher allein erzwingt keinen Werkzeugwechsel. Gehostete Repositorys reduzieren Zielserver-Wartung, ersetzen aber weder den konsistenten PostgreSQL-Abzug noch die Einrichtung und Restore-Prüfung des eigenen Laufs. Keine produktiven Installationen, Löschungen oder Änderungen; keine pauschale Leistungsüberlegenheit ohne Benchmark behauptet.

## 2026-10-07 - Juna - Sicherungsvorschlag auf kleine Web-App und Objektspeicher zugeschnitten

**Auftrag:** Übrigen Platzverbrauch auf dem Backupserver erklären und eine schlanke Lösung für ein Ein-Personen-Projekt ohne aktuelle Nutzer, später 50–100 Nutzer, einschließlich Blob-/Objektspeicher recherchieren.

**Analyse:** Ausschließlich lesende Verzeichnisgrößen und Docker-Summen auf dem zweiten Server geprüft: 38-GiB-Partition, 33 GiB belegt, 91 Prozent. Etwa 14 GiB Flipbase-Sicherungen, 8 GiB Docker-Verzeichnis, 4,6 GiB VS-Code-Server/Insiders, 2,1 GiB Logs und 2,3 GiB Systemdateien. Die Maschine betreibt auch n8n und weitere Dienste. Docker meldet 3,971 GB theoretisch freigebbare Images; keine pauschale Löschung vorgenommen. Herstellerquellen zu Supabase-S3, R2-Tarifen/EU-Speicherort, Hetzner Storage Box/Object Storage und Blob-Datenhaltung geprüft.

**Vorschlag:** Den pauschalen Stunden-Aufbau im Recherchepapier durch einen täglichen Startlauf mit sieben Tages- und vier Wochenständen, drei geschützten Release-Punkten und Wiederverwendung unveränderter Dateien ersetzt. Vor echten Nutzern Verlustziel erneut festlegen. Bestehenden Backupserver zunächst nach begrenzter Bereinigung weiterverwenden, keine zusätzliche Bestellung voraussetzen. R2 als Kandidat für private Bilddateien über das bestehende Supabase-Backend erläutert; ein explizites 25-GB-Nutzungsbeispiel ergibt ungefähr 0,23 USD reine monatliche Speicherkosten nach Freikontingent, ohne zusätzliche Anfragen/Dienste/Backups/Steuern. Keine Umwandlung in Programmcode und keine automatische Fotokomprimierung durch Objektspeicher. Keine Infrastruktur, Zugangsdaten, produktiven Sicherungen oder Kundendaten verändert.

## 2026-10-07 - Juna - Sicherungskonzept recherchiert und beide Server geprüft

**Auftrag:** Ermitteln, welche Sicherungen Flipbase tatsächlich benötigt und wie Wiederherstellungspunkte platzsparend und sicher aufbewahrt werden.

**Analyse:** BSI-, Behörden-, Supabase-, PostgreSQL-, Restic- und pgBackRest-Dokumentation recherchiert. Beide Server ausschließlich lesend geprüft: Nächtliche Sicherung um 03:30 Uhr, sieben lokale Sätze, drei lokale Release-Abzüge, etwa 2,4 GiB lokale Sicherungen. PostgreSQL-Archivierung ist ausgeschaltet. Der Backupserver meldet 90 Prozent Belegung; rund 14 GiB Flipbase-Sicherungen, darunter 76 Release-Abzüge mit 9,98 GiB. Die dortige 30-Tage-Regel begrenzt das Alter, nicht die Zahl der Release-Abzüge. Erzwungenes `rrsync -wo -no-del` bestätigt. Der lokale abweichende Hosteintrag wurde nicht überschrieben: Die ED25519-Identität wurde über den bereits vertrauten Produktionsserver abgeglichen und für die lesende Prüfung temporär festgelegt. Keine privaten Schlüssel oder Kundendaten gelesen.

**Ergebnis:** `deploy/BACKUP-STRATEGY.md` enthält den konkreten Vorschlag einschließlich Verlustziel, deduplizierter Dateisicherung, begrenzter Release-Aufbewahrung, unabhängiger Kopie, vollständigen Restore-Tests, Datenbank-/Storage-Konsistenz und unverändertem Schutz gegen Löschen durch den Anwendungsserver. Die Rückfrage zum tolerierbaren Datenverlust ist noch offen. Vor einer Restic-Umstellung müssen Backend, Initialplatz und vollständige Wiederherstellung nachgewiesen werden. Keine produktiven Änderungen oder Löschungen; eigener Recherchezweig, fremde Zweige unverändert.

## 2026-10-07 - Juna - Cloud-PR freigeben und Browserprüfung eindeutig machen

**Freigabe:** Der Nutzer bestätigt PR, erfolgreiche Pflichtprüfungen, Merge
und anschließende Bereinigung des eigenen Zweigs. Die Cloud-Automatik bleibt
bis zum bestätigten Proxy-Anmeldeversuch pausiert.

**CI-Korrektur:** Der Browser-Smoke scheitert im bestehenden Sniper-Test an
einem mehrdeutigen Status-Locator: Markenauswahl und Suchfilter-Zusammenfassung
haben beide `role="status"`. Die Prüfung wird auf die Zusammenfassung mit der
ausgewählten Kategorie eingegrenzt; die verlangten Titel-Stichwörter bleiben
unverändert. Kein Sniper-Produktcode wird geändert. Format, Lint und das Laden
beider Testvarianten bestehen; der vollständige Browsernachweis folgt in CI.

## 2026-10-07 - Juna - Bestehende Cloudkonten auf reservierte Proxyprofile umstellen

**Auftrag:** Nach dem lesenden Pilot beauftragt der Nutzer den fehlenden
geregelten Wechsel älterer Cloudkonten auf ein reserviertes ISP-Profil.
Maikes produktiver Zeitplan bleibt pausiert. Andere Sitzungen und Zweige
werden nicht verändert.

**Umsetzung:** Der vorhandene Einrichtungsablauf wird für ältere Cloudkonten
ohne abgeschlossene IP-Zuordnung geöffnet. Die Kontoaktion prüft den Bestand
und verwendet denselben Anmelde-/Identitätsablauf wie der Lokal-zu-Cloud-Wechsel.
Laufende und ungeklärte Aufträge verhindern die Umstellung; ein vorhandener
Zeitplan wird erst nach erfolgreicher Reservierung widerrufen. Alte Profile
werden nach bestätigtem Stopp archiviert. Reguläre manuelle und geplante
Chromiumstarts benötigen anschließend eine bestätigte Proxyreservierung;
Abbruch oder fehlende Kapazität erzeugen keinen stillen direkten Zugang.
Fertige Zuordnungen öffnen keinen neuen Anmeldedialog und werden beim Verlassen
der Seite nicht als laufende Reservierung abgebrochen.

**Prüfung:** 329 Worker-Tests bestehen, sieben bestehende Tests sind übersprungen.
61 Angular-Tests einschließlich Cloud-Kontoaktion und fertig eingerichteter
Zuordnung, 14 Workflow-Tests, Typprüfung, Lint, Format und Angular-Bau bestehen.
Die Migration wird mit Supabases PgDelta aus dem tatsächlichen Vergleich zweier
isolierter Testdatenbanken erzeugt: genau zwei Funktionen, transaktional, ohne
Tabellen- oder Rechteänderung. Ihr Replay gegen die bisherigen Migrationen
besteht 76 pgTAP-Assertions; Funktionsdefinitionen und Rechte stimmen mit dem
deklarativen Ziel überein. Die nach der Migration neu erzeugten API-Typen sind
gegenüber dem ebenfalls neu erzeugten Ausgangsstand unverändert. Es werden
keine echten Kontodaten in die Testdatenbank kopiert.

**Betriebsgrenze:** Noch nicht veröffentlicht. Maikes Zeitplan und die globale
Zeitplan-/Schreibfreigabe bleiben deaktiviert. Keine produktive Anmeldung,
Profiländerung oder Datenbankmigration wird vor dem geprüften PR ausgeführt.

## 2026-10-07 - Juna - Lesende Cloud-Automatik mit Maike Vintage testen

**Freigabe:** Nach dem vorgeschlagenen Pilotablauf beauftragt der Nutzer die
Aktivierung ausschließlich für Maike Vintage. Mehrere geplante Abrufe,
Browserabschluss, Wiederanlauf und Fehlerpausen werden geprüft. Versand und
sonstige Vinted-Schreibaktionen bleiben deaktiviert.

**Vorprüfung:** Die Cloud-Verbindung ist bestätigt. Es existiert genau ein
gespeicherter Zeitplan, bislang mit altem `forbidden` pausiert. Kein anderer
Zeitplan ist aktiviert. Ein anfänglich laufender manueller Abruf ist vor der
Umstellung beendet. Die aktuelle gehärtete Worker-/Broker-Konfiguration
wird direkt vom Server geprüft und erhalten; keine Rückkehr zur früheren
Docker-Socket-Konfiguration im Worker. Zugangsdaten und Kontoinhalte werden
nicht protokolliert.

**Live-Ergebnis:** Zwei echte geplante Abrufe am 07.10. um 00:50 und 00:53 Uhr
(Berlin) speichern erfolgreich ihre Ergebnisse und beenden den Browser. Der
zweite läuft nach einem geordneten Worker-Neustart ohne erneute Anmeldung.
Profil, Inserate, Gespräche und Bewertungen sind vollständig; Nachrichten und
Verkäufe bleiben fehlerfreie Teilstände. Insgesamt 60 gezielte Worker-Tests
bestehen, darunter Anmeldeverlust, Abbruch bei 403/429, Rate-Limit-Pause,
Zugriffsentzug, geordneter Dienstabschluss und Auftragsabgrenzung. Ein echter
Anbieterfehler wird im produktiven Konto nicht künstlich ausgelöst.

**Abweichung und Endzustand:** Die anschließende direkte Prüfung des privaten
Profilmanifests zeigt für Maike `networkId=direct`; für diese Verbindung
existiert kein Cloud-Einrichtungsdatensatz. Der verifizierte, gültige deutsche
ISP-Zugang `iproyal-pilot-a` ist im Bestand vorhanden, aber diesem Profil nicht
zugeordnet. Der Pilot bestätigt deshalb die Zeitsteuerung, nicht den
gewünschten Proxybetrieb. Diese Bindungsprüfung hätte vor der Aktivierung
erfolgen müssen. Maikes Zeitplan wird über die regulären Kontoeinstellungen
pausiert und auf 15 Minuten gespeichert. Die globale Dienstfreigabe wird
geordnet auf die vorherige Sicherheitskonfiguration zurückgenommen. Es gibt
keine offenen Sitzungen, laufenden Aufträge oder Browsercontainer; der Worker
ist gesund. Profil, Verbindung und Proxybestand bleiben erhalten. Vor einer
erneuten Freigabe braucht dieses ältere Cloudkonto einen unterstützten Wechsel
in die kontogebundene IP-Einrichtung; keine manuelle Manifest-/Datenbankänderung.

## 2026-10-07 - Juna - Klarere Meldung zur pausierten Cloud-Automatik veröffentlichen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und Bereinigung des eigenen Zweigs. Der aktuelle master
mit den Speicheränderungen wird übernommen; beide Protokollabschnitte bleiben
erhalten. Die Änderung erklärt den früheren automatischen Abruffehler und
die davon unabhängige manuelle Aktualisierung. Automatikfreigabe und
Browserdienst werden durch diese Textkorrektur nicht verändert. Nach dem
Merge wird die tatsächlich veröffentlichte Web-Version geprüft.

## 2026-10-06 - Juna - Alten automatischen Abruffehler nach erfolgreicher Cloud-Verknüpfung einordnen

**Auftrag:** Die Cloud-Verknüpfung gelingt und manuelle Kontenaktualisierungen
sind grün, während der Seitenkopf eine pausierte Automatik und eine
Vinted-Ablehnung meldet.

**Live-Diagnose:** Die gebundene Maike-Vintage-Verbindung ist `connected` im
Cloudmodus. Drei heutige manuelle Abrufe sind erfolgreich abgeschlossen und
gespeichert, ohne Quellenfehler. Profil, Inserate, Gesprächsübersicht und
Bewertungen sind vollständig; Nachrichten und Verkäufe bleiben fehlerfreie
Teilstände. Der getrennte Zeitplan ist seit dem 2. Oktober nach einem
automatischen Abruf mit `forbidden` pausiert. Der Worker meldet weiterhin
deaktivierte Zeitsteuerung. Nur Statusmetadaten werden gelesen; keine
Kontoinhalte, Zugangsdaten, Datenbankkorrektur oder neue Anbieteranfrage.

**Korrektur:** Der Ablehnungshinweis benennt den letzten automatischen Abruf
und erklärt, dass manuelle Aktualisierungen unabhängig davon möglich sind.
Eine manuelle Aktualisierung erteilt keine neue Automatikfreigabe. Der
Pausengrund bleibt erhalten; weder Zeitsteuerung noch Schreibaktionen werden
aktiviert. Ein gezielter Dialogtest prüft diese Trennung auch bei einem
neueren manuellen Aktualisierungszeitpunkt. Veröffentlichung erst nach
erfolgreichen Prüfungen und PR-Freigabe.

**Prüfung:** 87 gezielte Angular-Tests für Zeitplan, Kontrollzeile und Workspace
bestanden. Typprüfung, ESLint, Prettier und Angular-Produktionsbau erfolgreich;
nur die bestehende CommonJS-Warnung zu `pako`. Die Änderung ist lokal geprüft,
noch nicht veröffentlicht.

## 2026-10-06 - Juna - offene Sicherheitsgrenzen serverseitig schließen

**Freigabe:** Der Nutzer bestätigt Branch-Push, PR-Erstellung, Merge-Commit nach erfolgreichen Pflichtprüfungen und anschließendes Aufräumen des eigenen Zweigs samt Worktree. Der vorbereitete Installationsweg hält den Webhook-Dienst vor der Rechte-Migration verfügbar und trennt die Chromium-Serverumstellung vom Web-Release.

**Auftrag:** Die beiden offenen Befunde nach PR #320 einschließlich der dafür
notwendigen Serveränderungen im eigenen Zweig `juna/security-backend-boundaries` beheben.

**Umsetzung:** Webhook-Konfigurationen nur noch über einen angemeldeten Funktionsdienst
lesen und ändern; gespeicherte Zugangsdaten bleiben serverseitig. Versandziele und
Workspace-Zugriff werden am Server geprüft. Ein privater Broker übernimmt die
Docker-Operationen und die echten Chromium-Profile; der Worker erhält nur getrennte
Metadaten und einen begrenzten Auftragskanal.

**Prüfung:** Produktionsbau, Formatierung, ESLint und Typprüfung bestanden. Die vollständigen Node-, DOM- und Edge-Suites bestehen; die Angular-Suite besteht mit vier Prozessen (189 Dateien, 1.901 Tests). Der unbegrenzte Gesamtaufruf wurde nach lokalen Zeitüberschreitungen beendet. Worker: 326 Tests bestanden, sieben bestehende Fälle übersprungen. Alle 190 Migrationen in einer isolierten Datenbank angewendet; abschließend 3.229 Datenbanktests bestanden. Der Transport mit geprüfter IP und TLS-Host wurde in einer isolierten User-Worker-Instanz derselben installierten Edge-Runtime-Version bestätigt. Ein unabhängiger Review fand drei Versandregressionen; Kanalisolation, Wiederholung fehlgeschlagener Nachrichten und der bisherige Kennzahlenvertrag sind korrigiert und geprüft. Der aktuelle origin/master ist enthalten. Testcontainer entfernt; keine Produktionseinstellungen geändert und kein Deployment. Tatsächliche Image-Bauten, Broker-Browser-Smoke und produktive Serverumstellung stehen aus.

## 2026-10-06 - Juna - Speichermelder mit eingeschränktem Verwaltungszugang einrichten

**Befund und Korrektur:** PR #323 ist nach vollständig grünen Prüfungen gemergt und produktiv. Die Einrichtung scheiterte zunächst daran, dass der produktive PostgreSQL-Verwaltungszugang kein Superuser ist und daher auch `NOSUPERUSER` nicht setzen darf. Das Installationsskript prüft nun die sicheren Standardattribute der neu angelegten Rolle beziehungsweise lehnt unerwartete Verwaltungsrechte einer vorhandenen Rolle ab. Es ändert ausschließlich Login, Vererbung, Verbindungslimit und SCRAM-Passwort; keine Erweiterung des Verwaltungszugangs. Die Provisionierung ist vollständig transaktional.

**Prüfung und Aktivierung:** Einrichtung und Rotation mit einem isolierten Nicht-Superuser bestätigt; Rollen mit BYPASSRLS oder Rollenmitgliedschaften werden abgewiesen. Fünf Python-Prüfungen und Generator-Vertrag bestehen. Der produktive DynamicUser-Dienst meldet erfolgreich, der Minutentimer ist aktiv. Zwölf echte Rechte-/Aktualitätsprüfungen sind erfolgreich, native Leseversuche auf Messwerte und Arbeitsbereiche werden abgewiesen, die Credential-Datei gehört ausschließlich Root mit Modus 0600. Der eigene Testcontainer wurde entfernt. Die Folgekorrektur wird im eigenen Zweig `juna/server-storage-installer` über den bereits freigegebenen PR-Ablauf abgeschlossen.

## 2026-10-06 - Juna - Supabase-Imagevorrat begrenzen und Speicheranzeige freigeben

**Auftrag und Freigabe:** Nach der Erklärung der mehreren Supabase-Versionen beauftragt der Nutzer die Umsetzung. Die vorbereitete Betreiberanzeige wird über den bereits besprochenen grünen PR veröffentlicht; zusätzlich wird die stündliche Bereinigung auf benannte Supabase-Repositories erweitert.

**Regel:** Alle laufenden und gestoppten Container sowie die vorgesehenen Images der aktiven Supabase-Compose-Dateien bleiben geschützt. Je Supabase-Dienst bleiben zwei weitere unbenutzte Versionen, ohne Referenz drei. Docker-Hub und ECR teilen dieselben Plätze anhand eindeutiger Image-IDs. Fremde Tags, Testcontainer, Volumes und Kundendaten werden nicht entfernt. Vor jeder Löschung werden Container und Compose erneut geprüft; keine erzwungene Entfernung. Eine zusätzliche Anmeldung oder öffentliche Schnittstelle wird nicht eingerichtet.

**Prüfung:** 18 Aufbewahrungstests unter Linux bestanden, einschließlich Registry-Aliasse, fremder Tags, Compose-Schutz und erneuter Prüfung vor dem Entfernen. Die Vorschau wählt drei ungenutzte Supabase-Images aus. Der erste CI-Datenbanklauf zeigte, dass der eingeschränkte Testnutzer nicht in die neu erzeugte Melderrolle wechseln durfte. Die ausschließlich transaktionale Testvorbereitung gewährt nun ausdrücklich diesen Rollenwechsel. Alle 18 Datenbankprüfungen bestehen auch mit einem isolierten Nicht-Superuser und pauschalen Default-Grants; Produktionsrechte wurden dafür nicht erweitert. Die abschließende Speicher- und Dienstprüfung folgt nach der freigegebenen produktiven Ausführung. Frühere Größenangaben dokumentieren ihren jeweiligen Messzeitpunkt.

## 2026-10-06 - Juna - sichere Server-Speicheranzeige und Restbelegung prüfen

**Auftrag:** Die vorbereitete Speicheranzeige in den Betreiberbereich einbauen und die weiterhin hohe Hetzner-Belegung anhand echter Messungen erklären.

**Umsetzung:** Eigener Zweig `juna/server-storage-dashboard` vom aktuellen `origin/master`. Neue Seite unter Administration → Server-Speicher mit Gesamtgröße, belegten und verfügbaren GiB, Prozentberechnung wie `df`, Messzeit, Warnstufen und ausdrücklich unbestätigtem Zustand bei fehlender Aktualität. Vorhandene Shared-Komponenten und Anmeldung werden verwendet. Der Minutentimer läuft ohne Rootrechte oder Docker-Socket; ein eigener Loopback-DB-Login besitzt ausschließlich die Meldefunktion für einen Datensatz. RLS-Lesen nur für Plattformbetreiber, keine Messrechte für Browser oder allgemeine Dienstrolle, keine neue öffentlich erreichbare Schnittstelle. Installation und Credential-Rotation erfolgen erst nach dem freigegebenen Release; der PostgreSQL-Client ist eine notwendige Servervoraussetzung.

**Datenbankvertrag:** Die Migration wurde mit Supabase CLI 2.114.0 in isolierten Vorher-/Nachher-Datenbanken erzeugt. Der CLI-Abgleich lässt explizite Revokes gegenüber vorhandenen pauschalen Default-Grants aus; ein eng begrenzter Generator ergänzt die Rechte aus dem deklarativen Schema. TypeScript-Verträge wurden vollständig aus einer reinen Strukturkopie mit der neuen Tabelle generiert; der Unterschied besteht ausschließlich aus 32 Zeilen für Tabelle und Funktion. Keine Kundendaten kopiert, keine Proxydateien von Hand angepasst.

**Bestandsanalyse:** Live etwa 44 GiB belegt und 29 GiB verfügbar, 61 Prozent. Größte Posten: containerd etwa 30 GiB, Swap 4 GiB, Backups 2,7 GiB und PostgreSQL 2,2 GiB. Docker-Verwaltung/Logs/Volumes etwa 1,7 GiB und Systemlogs etwa 0,6 GiB. Die Feed-Tabelle belegt 1.945 MiB einschließlich Indizes und ausgelagerter Werte; Statistiken schätzen etwa 836.000 lebende Zeilen. Der Feed erklärt damit etwa 1,9 GiB, nicht den Docker-Hauptposten. Mehrere Supabase-Versionen und drei große Chromium-Versionen sind vorhanden. Es laufen parallel isolierte Datenbanktests anderer Sitzungen. Keine weiteren Produktionsimages, Container, Volumes, Profile oder Nutzerdaten gelöscht. Aufbewahrung und gemessene Größen sind in der bestehenden Deployment-Dokumentation ergänzt.

**Prüfung:** 18 echte Datenbankprüfungen auf einer isolierten Strukturkopie mit pauschalen Default-Grants bestanden. Ein echter SCRAM-Login über libpq meldet gemessene Hostwerte und erhält keinen Lesezugriff auf Messwerte, Auth-Nutzer oder Arbeitsbereiche. Systemd-Dienst und Timer syntaktisch geprüft. Die produktive Installation, der echte Timerlauf unter DynamicUser und die Anzeige in einer angemeldeten Produktionssitzung stehen noch aus. 25 gezielte Angular-Tests einschließlich gerenderter Shared-Komponenten und AXE-Strukturprüfung bestanden; Farbkontrast ist im DOM-Test ausgenommen. Fünf neue Python-Tests unter Windows und Linux, der Generator-Vertrag, Schema-/Migrationsprüfungen und die bestehende Aufbewahrung bestehen. ESLint, beide TypeScript-Prüfungen, Shared-UI-Grenze und Angular-Produktionsbau bestanden. Die Passwortrotation wurde mit einem clientseitig erzeugten SCRAM-Verifier und echter Anmeldung verifiziert; kein Klartextpasswort gelangt ins SQL. Suite-Audit und geänderte Dateien sind geprüft und formatiert. Eigene temporäre Testdatenbank, Zugangsdaten und Hilfsdateien wurden anschließend vollständig entfernt; der Produktions-Meldetimer wurde noch nicht installiert.

## 2026-10-06 - Juna - Serverbereinigung und automatische Aufbewahrung freigegeben

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen, einmalige produktive Bereinigung und Aktivierung der vorbereiteten stündlichen Aufbewahrung. Die bestätigte Regel schützt alle Container-Versionen, zwei zusätzliche eigene Images je Dienst, drei lokale Release-Sicherungen und sieben vollständige nächtliche Sätze nach bestätigtem externem Inhaltsvergleich. Die längere externe Aufbewahrung bleibt unverändert. Der Vorschlag einer Adminanzeige gehört nicht zur freigegebenen Umsetzung.

**Integration:** Vor dem Push wird der aktuelle `origin/master` übernommen. Anwendung, Backend und fremde Zweige bleiben außerhalb der Speicheränderung. Die produktive Installation erfolgt erst nach erfolgreichem PR-Merge. Exakte Ersparnis und Dienststatus werden nach der Ausführung geprüft und im Chat berichtet.

## 2026-10-06 - Juna - Begrenzte Server-Aufbewahrung vorbereitet

**Auftrag:** Übliche Aufbewahrung recherchieren, konkrete Speicherersparnis prüfen, Wiederholung verhindern und eine sichere Speicheranzeige im Flipbase-Betreiberbereich beurteilen.

**Entscheidung:** Alle von Containern verwendeten Images schützen und zwei zusätzliche Versionen je eigenem Dienst behalten; ohne Container drei Versionen. Lokal drei verschlüsselte Release-Sicherungen und sieben vollständige nächtliche Sätze behalten. Die getrennte externe Aufbewahrung von etwa 30 Tagen bleibt erhalten. Die Zahlen sind ein Flipbase-Vorschlag, keine allgemeine Sicherheitsnorm. Recherche bei Docker, restic und CISA sowie Architektur und Installationsweg sind in `deploy/README.md` dokumentiert.

**Vorbereitung:** `cleanup-server-storage.py` zeigt standardmäßig nur die Auswahl. Container einschließlich gestoppter Container, fremde Repositories, unbekannte Dateien, unvollständige Sätze und symbolische Links sind geschützt. Die automatische Image-Löschung verwendet keine Erzwingung und keine Container-/Volume-Bereinigung. Die verbliebenen verschlüsselten Sicherungen müssen über den vorhandenen streng geprüften SSH-/rsync-Weg inhaltlich übereinstimmen, bevor lokale Backups entfernt werden. Image-Bereinigung ist von der Backup-Erreichbarkeit unabhängig. Gemeinsame Deploy-/Backup-Sperren verhindern Überschneidungen; `backup.sh` und `migration-backup.sh` erhalten die Backup-Sperre. Die alte ungeprüfte Alterslöschung entfällt. Ein stündlicher Cronauftrag ist vorbereitet, noch nicht installiert.

**Live-Vorschau:** 391 eigene alte Images ausgewählt; 108 Backupdateien mit exakt 12.932.477.886 Bytes zur Löschung vorgesehen. Die drei verbleibenden Release-Sicherungen und sieben vollständigen nächtlichen Sätze vom 30. September bis 6. Oktober wurden ohne Schreiboperationen erfolgreich mit den externen Kopien verglichen. Docker meldet aktuell etwa 29,3 GB insgesamt freigebbar; die tatsächliche Ersparnis der begrenzten Image-Auswahl kann erst nach ihrer Ausführung festgestellt werden. Ein direkter Zugriff vom Arbeitsplatz auf den Backupserver wurde wegen abweichender gespeicherter SSH-Hostschlüssel abgewiesen; dieser Schutz wurde nicht umgangen. Der vorhandene Backupweg vom Produktionsserver besteht mit strenger Hostprüfung und Inhaltsvergleich.

**Adminanzeige:** Lokaler Timer meldet ausschließlich Partitionsgröße, Belegung, verfügbaren Speicher und Messzeit. Ein eigener eng begrenzter Schreibzugang aktualisiert nur diesen Datensatz; Lesen ausschließlich über die vorhandene Betreiberprüfung `public.is_platform_operator()`. Kein öffentlicher Zusatzport, Browser-SSH oder Docker-Socket im Webcontainer. Datenbankvertrag, Meldeprozess und UI sind ein dokumentierter Vorschlag, noch nicht implementiert.

**Prüfung:** 14 isolierte Python-Tests unter Linux erfolgreich, einschließlich echter Dateisperren und einer Shell-Fixture mit simulierten Docker-/age-/rsync-Befehlen. Lokal unter Windows bestehen dieselben zwölf plattformunabhängigen Tests, zwei Linux-Tests sind dort übersprungen. Die gezielten Node-Verträge bestehen mit drei ausgeführten und vier plattformbedingt übersprungenen Fällen. Shell-Syntax, ESLint für geänderte JavaScript-Tests, Prettier und `git diff --check` bestanden. Der neue Test wird in die reguläre Workflow-Suite aufgenommen. Kein Docker-Bau, kein echtes Backup oder Restore im Test.

**Freigabegrenze:** Nur temporäre Vorschau-/Testdateien und eine Sperrdatei auf dem Produktionsserver für die Untersuchung verwendet. Keine Anwendung ausgerollt, keine Backups/Images entfernt und keinen Cronauftrag installiert. Änderungen liegen ausschließlich im eigenen Zweig `juna/server-storage-retention`; PR, Merge und produktive Aktivierung sind noch nicht freigegeben.

## 2026-10-06 - Juna - Speicherverbrauch des Hetzner-Servers untersucht

**Auftrag:** Ursachen der hohen Festplattenbelegung und den Einfluss von Docker-Logs sowie der Sieben-Tage-Aufbewahrung im Vinted Feed feststellen.

**Analyse:** Ausschließlich lesende SSH-Prüfung auf dem Produktionsserver. Die Root-Partition meldet 67 G belegt und 5,5 G verfügbar bei 93 Prozent. Die Overlay-Mounts zeigen dieselbe zugrunde liegende Partition mehrfach und dürfen nicht addiert werden. Docker meldet 440 Images mit 42,96 GB, davon 30,68 GB freigebbar; 344 Image-Einträge gehören zum Webabbild, 30 zum Feed und 21 zum Marketplace-Worker. Das produktive Deployskript verwendet lediglich `docker image prune -f`, wodurch benannte ungenutzte Versionen bestehen bleiben.

**Weitere Verbraucher:** Lokale Backups belegen rund 15 G: 42 Release-DB-Sicherungen mit 8,53 GiB, 30 nächtliche DB-Dateien mit 5,71 GiB sowie 30 Storage-Sicherungen mit 0,47 GiB. Nächtliche Sicherungen behalten komprimierte und verschlüsselte Kopien. PostgreSQL-Dateien belegen 2,6 G, die Feedtabelle einschließlich Indizes 1.945 MB. Docker-Containerlogs belegen insgesamt 944 M; der Feedcontainer hat nachweislich drei Logdateien mit jeweils höchstens 10 MB. Hochgeladene Dateien belegen 36 M.

**Feed-Aufbewahrung:** Die aktuelle SQL-Abfrage zählt 1.921.037 Funde, davon 1.067.190 älter als sieben Tage; der älteste stammt vom 18. September. Die produktive Löschfunktion und aktuelle Dienstlogs bestätigen die aktive Bereinigung: Pakete von 1.000 Funden etwa alle sechs Sekunden. Die Ursache des historischen Rückstands wurde nicht abschließend untersucht. Der Collector speichert Bildlinks statt Kopien der Vinted-Bilder. Autovacuum war zuletzt am 6. Oktober um 18:08 UTC aktiv; SQL-Löschungen bedeuten keine sofortige vollständige Rückgabe der Dateigröße an das Betriebssystem.

**Prüfung und Grenzen:** `df`, begrenzte Verzeichnisgrößenmessungen, `docker system df`, ausschließlich ausgewählte Container-Metadaten, aggregierte Backup-Dateigrößen, SQL-Größen/Statistiken, die produktive Löschfunktion sowie gefilterte Bereinigungslogs gelesen. Keine Serverdateien, Datenbankdaten oder Container verändert, keine Images oder Backups gelöscht. Die Untersuchung dokumentiert einen Zeitpunkt; die laufende Feedbereinigung verändert die Zahlen. Das Protokoll liegt in einem eigenen Analysezweig; fremde Zweige bleiben unverändert.

## 2026-10-06 - Juna - Sicherheitskorrekturen über PR abschließen

**Freigabe:** Der Nutzer bestätigt Push, PR-Erstellung, Merge-Commit nach
erfolgreichen Pflichtprüfungen und anschließendes Aufräumen des eigenen Zweigs
`juna/security-report-triage` samt Worktree. Der aktuelle master einschließlich
PR #318 und #319 ist enthalten. Serverseitiger Webhook-Versand und die Trennung
des Docker-Controllers bleiben als nummerierte Backend-Issues offen.

## 2026-10-06 - Juna - bestätigte Sicherheitsbefunde korrigieren

**Auftrag:** Nach Freigabe die bestätigten Befunde im eigenen Zweig
`juna/security-report-triage` korrigieren und prüfen.

**Umsetzung:** Caddy sperrt `/mcp` und `/api/mcp` einschließlich Unterpfaden vor
der öffentlichen API-Freigabe. Alle fünf TLS-Domains erhalten HSTS mit zunächst
300 Sekunden ohne Subdomainbindung oder Preload. Webhook-Konfigurationen werden
nicht mehr im Browser gespeichert; beide früheren Speicherschlüssel werden bereits
vor Angular und der Präfix-Migration entfernt. Speichern setzt die vollständig
geladene Konfiguration des aktiven Workspace voraus. Eigene Webhook-Tests melden
den fehlenden Versand korrekt. Nodemailer gehört im Hauptprojekt nur noch zu den
Testabhängigkeiten. Die zusammengehörigen Angular-Pakete sind auf 22.2.1 aktualisiert;
die abhängigen Buildpakete einschließlich Piscina 5.3.2 sind neu aufgelöst.

**Prüfung:** Paket-Audit ohne bekannte Schwachstellen, vollständige Anwendungssuiten
(Node, DOM, Angular), 222 Workflow-Tests sowie Build, Lint und Typprüfung bestanden.
Die unabhängige Prüfung zeigte zwei zusätzliche Browser-/Workspace-Pfade; die neuen
Regressionstests reproduzierten sie vor der Korrektur und bestehen danach zusammen
mit den zugehörigen Service-, Speicher- und gerenderten Einstellungsprüfungen.
Caddy-Konfiguration validiert und mit dem installierten Image in einem kurzlebigen
Container ohne Netzanschluss gegen lokale Testgegenstellen geprüft: sechs MCP-Pfade
abgewiesen, öffentliche APIs und angemeldetes Studio erreichbar, anonymes Studio
abgewiesen, Browserroute und HSTS aller fünf Hosts erhalten. Testcontainer entfernt.
Die währenddessen gemergten PRs #318 und #319 sind aus `origin/master` übernommen;
alle Protokolleinträge bleiben erhalten. Auf den verbundenen Ständen bestehen
zusätzlich 127 Einstellungs-/Produkt-/Einkaufstests und vier Browserdialogtests
sowie die Typprüfung und der Produktionsbau.

**Offen:** Produktionskonfiguration nur gelesen, keine Auslieferung. Das installierte
Envoy verweigert MCP bereits; Caddy ergänzt die äußere Sperre. Serverseitiger
Webhook-Geheimnisspeicher und die Trennung des Docker-Controllers erfordern Backend-
beziehungsweise Betriebsarbeit. Gemäß der Frontend-Grenze liegen dafür die nummerierten
Dateien `01-webhook-secrets-and-server-dispatch.md` und
`02-docker-controller-privilege-boundary.md` auf dem Desktop unter
`Backend Issues/security-report-triage`. Keine Backend-, Schema- oder Edge-Änderung.

## 2026-10-06 - Juna - externen Sicherheitsbericht prüfen

**Auftrag:** Die Befunde des bereitgestellten Sicherheitsberichts am aktuellen Projektstand prüfen und Sicherheitsrisiken von Funktionsfehlern und Wartungsaufgaben unterscheiden.

**Analyse:** Der untersuchte Arbeitsstand `c7d5c2cc` und `origin/master` `d73e990b` enthalten dieselben für den Bericht relevanten Konfigurationen. `/mcp` umgeht im Caddyfile Authelia; eine anonyme administrative Zugriffsmöglichkeit bleibt ohne die installierte Gateway-Konfiguration unbewiesen. HSTS fehlt in den versionierten Headerkonfigurationen. Der Chromium-Pilotcontroller erhält den Docker-Socket, die Browsercontainer erhalten ihn nicht; eine reine Freigabe von Container-Erstellung und Start würde gefährliche Hostmounts nicht verhindern. Telegram-Token und Discord-Webhook-URL werden im Browser verarbeitet und lokal gespeichert; die Tabelle ist durch Workspace-RLS geschützt. Custom-Webhooks besitzen dagegen keinen tatsächlichen Versand, und ihr Test meldet ohne Anfrage Erfolg. Nodemailer wird außerhalb der Edge Function nur im Testfixture importiert und gehört dort in die Entwicklungsabhängigkeiten; das Produktionsimage enthält keinen Node-Laufzeitserver. Die beiden Marketplace-Preview-Workflows haben keinen passenden Remotezweig mehr; der Product-Preview-PR #46 ist bereits gemergt, sein lokaler Worktree besteht noch. Die beiden genannten Hilfsskripte haben keine gefundenen produktiven Aufrufer; daraus folgt bei manuellen Wartungswerkzeugen noch keine sichere Löschfreigabe. 20 ignorierte `.superpowers`-Dateien sind weiterhin versioniert. Die genannten großen Dateien existieren mit den angegebenen Größen; ihre Aufteilung ist eine Wartungsaufgabe.

**Prüfung:** Statische Quellcode-, Konfigurations-, Schema-, Lockfile- und CI-Prüfung sowie lesende GitHub-Abfragen. Die aktuellen Herstellerhinweise zu Supabase-MCP, Docker, HSTS und den betroffenen Angular-/Piscina-Paketen wurden geprüft. `npm audit --json --ignore-scripts` meldet 13 betroffene Pakete (3 kritisch, 7 hoch, 3 moderat). Ohne Entwicklungsabhängigkeiten bleibt ein hoher Angular-Router-Befund; dessen SSR-Voraussetzung fehlt bei der dokumentierten statischen Browserauslieferung. Keine Tests, Builds, Exploitversuche oder Produktionszugriffe. Kein Produktcode geändert; nur dieser vorgeschriebene Sitzungseintrag im eigenen Worktree.

## 2026-10-06 - Juna - Korrektur der Cloud-Anmeldebestätigung veröffentlichen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und anschließende Bereinigung des eigenen Zweigs. Die lokal
geprüfte Korrektur der Identitätsprüfung, der kompakte Anmeldedialog und das
bestehende Rolloutprotokoll werden gemeinsam integriert. Anschließend wird
der Browserdienst auf das geprüfte Workerimage aktualisiert; das bereits
abgenommene unveränderte Chrome-Sitzungsimage bleibt erhalten. Eine erfolgreiche
produktive Kontoverknüpfung bleibt bis zum echten Nutzerabschluss offen.

## 2026-10-06 - Juna - Cloud-Anmeldung trotz verbliebenem Loginformular bestätigen

**Auftrag:** Die manuelle Anmeldung mit SMS gelingt, aber „Anmeldung prüfen &
verbinden“ meldet weiterhin ein Anmeldeformular. Zugangsdaten kompakter darstellen
und die zugehörige Meldung direkt bei der großen Browseransicht platzieren.

**Live-Diagnose:** Im laufenden Cloudprofil sind ein alter, inaktiver Login-Tab
mit Passwortfeld und ein sichtbarer Vinted-Tab vorhanden. Die unveränderte
Identitätsprüfung bricht im Login-Tab vor dem Kontoprüfungsabruf ab. Ein eigener
begrenzter GET auf denselben Tab liefert dagegen HTTP 200 und bestätigt die
erwartete Maike-Vintage-ID. Auch der sichtbare Tab bestätigt diese Identität.
Es werden nur Status und Übereinstimmung ausgegeben, keine Zugangsdaten oder
Kontoinhalte. Die Ursache der veralteten Seite selbst ist damit nicht bewiesen.

**Korrektur:** Die feste Vinted-Kontoprüfung erhält Vorrang vor einem verbliebenen
E-Mail-Anmeldeformular. Nur HTTP 401 wertet dessen Ablehnungshinweis aus.
Mensch-Prüfung, SMS-Stufe, Domainprüfung und Validierung der Kontoidentität
bleiben erhalten. Kein Konto wird anhand eines sichtbaren Seitenelements
oder einer ungültigen API-Antwort verbunden; keine automatischen Loginversuche.

**Dialog:** Die Zugangsdaten stehen in einer eigenen kompakten Karte, auf breiten
Ansichten nebeneinander und ohne die bisherige schmale Formularbegrenzung.
Browserfehler, Fortschritt und Prüfhinweise erscheinen einmal innerhalb der
großen Vorschaukarte. Ohne Browserbild und nach bestätigter Anmeldung bleiben
Fehler weiterhin sichtbar, insbesondere beim gesonderten „Cloud aktivieren“.

**Prüfung:** 49 gezielte Worker-Tests und neun echte Browsertests mit synthetischen
Antworten bestehen. Darunter: gültige Identität trotz altem Formular, HTTP 401,
Ablehnung, HTTP 403, ungültige Identität und unveränderte Mensch-Prüfung.
47 Angular-Tests bestehen einschließlich vier gerenderter Dialogtests und
DOM-AXE-Prüfung ohne in JSDOM nicht messbaren Farbkontrast. Worker-Typprüfung
und Worker-Bau sowie Angular-Produktionsbau bestanden. Geänderte Dateien werden
formatiert und gelintet. Der erste Angular-Bau mit einem Verzeichnisverweis
auf fremde Abhängigkeiten scheiterte an Windows-Assetpfaden; mit eigenen,
unverändert aus dem Lockfile installierten Abhängigkeiten besteht er.

**Grenzen:** Noch keine Veröffentlichung dieser Korrektur. Die ursprüngliche
Cloud-Sitzung war vor dem separaten Live-Test des korrigierten Lesers bereits
geschlossen; dieser Test wurde ohne Neustart oder Kontobestätigung beendet.
Der neue Leser ist deshalb durch synthetische Browsertests, noch nicht durch
eine erneute produktive Kontoverknüpfung bestätigt. Keine Datenbankänderung,
kein Versand und keine Änderung an der lokalen Erweiterung. Der bereits
geprüfte Rolloutnachweis bleibt im selben eigenen Zweig erhalten.

## 2026-10-06 - Juna - Cloud-Browserdienst auf Hetzner aktivieren

**Freigabe:** Der Nutzer bestätigt die Aktualisierung des Browserdienstes nach
Platzprüfung. PR #317 ist integriert; Web-Version 0.303.0 sowie die separat
geprüften Worker- und Chromeimages stammen aus `d73e990b`.

**Betrieb:** Nur die beiden Imagereferenzen der bisherigen Compose-Konfiguration
werden auf feste Digests umgestellt. Vor und nach dem Wechsel: keine offenen
Browsersitzungen und keine laufenden Marketplace-Aufträge. Der unabhängige
noVNC-Pilot wird sauber gestoppt; das angemeldete Maike-Vintage-Profil bleibt
gespeichert, mit `profile.exit_type='Normal'`. Regenerierbarer, ungenutzter
Build-Cache wird freigegeben; keine Images, Volumes oder Nutzerprofile gelöscht.
Nach dem Laden der Images sind rund 5,5 GB frei. Die vorige Konfiguration und
beide bisherigen Images bleiben für eine Rücknahme erhalten.

**Firewall:** Die Regeln des separaten Piloten standen vor den regulären
Cloudregeln und verhinderten dadurch deren strikte Reihenfolgeprüfung. Nur
die vorhandenen regulären Sprungregeln werden nach vorne verschoben; sämtliche
Regeln und Sperren bleiben erhalten. Der bestehende Prüfdienst bestätigt
anschließend wieder die aktuelle Firewallfreigabe.

**Prüfung:** Der Worker ist gesund, ohne Neustarts. Öffentlicher Healthcheck
HTTP 200; Cloud-Einrichtung ohne Anmeldung HTTP 401. Ein eigener synthetischer
Browser ohne Vinted-Zugang bestätigt auf Hetzner Namespace- und Seccomp-Sandbox,
`navigator.webdriver=false`, CDP-Verbindung ohne Kontextvorgaben, native
Bildschirmaufnahme und echte Texteingabe. Geordneter Stopp mit Exitcode 0;
Testcontainer einschließlich seines flüchtigen Profils entfernt. Kein
Nachrichteninhalt, Passwort oder Browserbild gespeichert.

**Offen:** Maike Vintage ist durch diesen Rollout noch nicht in Flipbase mit
Cloud verbunden. Die reguläre Anmeldung, automatische IP-Reservierung,
Kontobestätigung und der erste lesende Abgleich sind die nächsten Live-Prüfungen.
Automatischer Zeitplan und Cloud-Schreibaktionen bleiben deaktiviert. Details
und Image-Digests stehen im bestehenden Worker-Rolloutprotokoll.

## 2026-10-06 – Juna – Einkaufskosten bei unbepreisten Artikeln korrigiert und Mehrfach-Farbauswahl ermöglicht

**Auftrag:** Bei der Einkaufserfassung soll die Kostenübersicht den aktuellen Gesamtpreis weiterhin anhand aller ausgefüllten Stückpreise berechnen, selbst wenn neu hinzugefügte Positionen noch keinen Preis tragen (statt 0 anzuzeigen). Bei der Produkterstellung soll die Farbauswahl mehrere Farben unterstützen.

**Änderung:**

- Im Einkaufsformular (`PurchaseEntryFormComponent`) berechnet `updatePurchaseBasePriceFromLines` den Warenwert nun als Summe aller vorhandenen, ausgefüllten Positionspreise (`lineTotal`). Frisch hinzugefügte, noch unbepreiste Zeilen setzen den Kopfpreis und die Kostenübersicht nicht mehr auf `null`/`0` zurück.
- Im `AttributePickerComponent` werden ausgewählte Werte bei `multiple: true` mit Farbpunkten (Swatches) dargestellt, sofern für die Farbe ein Farbwert hinterlegt ist. Klicks auf bereits gewählte Optionen schalten diese wieder ab (Toggle).
- In der Produkterstellung (`ProductDialogComponent`), der Variantenanlage (`ProductVariantCreateFormComponent`) und den Artikeldetails (`ProductDetailComponent`) ist die Farbauswahl nun für Mehrfachauswahl (`[multiple]="true"`) aktiviert.

**Prüfung:**

- Angular-Komponententests für `PurchaseEntryFormComponent`, `AttributePickerComponent`, `ProductDialogComponent`, `ProductVariantCreateFormComponent` und `ProductDetailComponent` erfolgreich ausgeführt (302 Tests in 29 Testdateien).
- Prettier-Formatierung und ESLint ohne Fehler/Warnungen abgeschlossen.
- TypeScript-Typprüfung (`npm run typecheck`) ohne Fehler.
- Angular-Produktionsbau (`ng build`) erfolgreich durchgelaufen.

## 2026-10-06 - Juna - Cloud-Chrome über PR #317 abschließen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung des eigenen Zweigs. Der aktuelle master f53eb483 wird übernommen; sein Feed und beide Protokollarchive bleiben erhalten. Der einzige Merge-Konflikt betrifft die vorangestellten Einträge im Änderungsprotokoll. Image-Prüfungen und produktive Cloud-Verknüpfung bleiben bis zu ihrem tatsächlichen Nachweis offen.

## 2026-10-06 - Juna - normalen Chrome in die bestehende Cloud-Einrichtung integrieren

**Auftrag:** Den erfolgreich angemeldeten eigenständigen Chrome-Pilot als
Browsermodell für Flipbase übernehmen. Vorhandene Cloud-IP-Reservierung,
Kontoprüfung, Wiederaufnahme und Abbruch verwenden; kein GoLogin-Abonnement.

**Umsetzung:** Das Sitzungsimage startet Google Chrome als eigenen Betriebssystemprozess
mit isoliertem Profil, Sandbox und Anzeige. Erst danach verbindet sich der Worker
über seinen privaten CDP-Zugang ohne Playwright-Kontextvorgaben. Der bereits geprüfte
Proxy-Weiterleiter und der reguläre Fensterschließweg werden aus dem Pilot verwendet.
Zugangsdaten gelangen über eine private Startdatei und den Eingabekanal in den Container,
nicht über Browserargumente. Die manuelle Browseransicht nutzt native Bildschirmaufnahme,
Maus und Tastatur im verifizierten Kontocontainer. Unbestätigter regulärer Browserstopp
führt zu Exitcode 75; Profil und IP bleiben dadurch reserviert. Ein altes Sitzungsimage
wird vor einem neuen Containerstart abgewiesen. Die Anmeldedialoge erhalten die
vorhandene große Dialogvariante und erklären das Einfügen von Text.

**Prüfung:** 38 gezielte Worker-Tests, Worker-Typprüfung und Worker-Bau sowie
43 Angular-Tests einschließlich vorhandener gerenderter Kontodialogprüfungen bestanden.
Geänderte TypeScript- und HTML-Dateien sind gelintet. Der Angular-Produktionsbau
besteht mit dem gebündelten Node 24.19.0; die systemweite Version 22.16.0 ist für
die aktuelle Angular-CLI zu alt. Die vollständige Worker-Suite besteht in einem
temporären Linux-Testordner mit 327 erfolgreichen und einem übersprungenen Test.
Unter Windows besteht sie mit Node 24.19.0 mit 321 erfolgreichen und sieben
übersprungenen Tests. Fünf unveränderte IPRoyal-Abgleichstests schlagen nur mit
dem alten systemweiten Node 22.16.0 fehl. Acht Tests der wiederverwendeten
Pilot-Helfer sowie YAML- und Shell-Syntaxprüfung bestehen. Das neue Browserimage erhält in CI eine Prüfung
für echte native Eingaben, Bildschirmaufnahme, Profiltrennung und regulären Stopp.

**Grenzen:** Das neue Image wurde noch nicht gebaut oder aktiviert; sein Linux-Smoke
läuft im PR. Keine produktive Cloud-Verknüpfung oder Datenbankänderung. Das angemeldete
Maike-Vintage-Pilotprofil bleibt erhalten. Anbieterprüfungen oder Sperren können
weiterhin auftreten; aus dem Pilot folgt keine Garantie für jedes Konto.

## 2026-10-06 - Juna - automatischen Seitenneuladeweg im echten Cloudbrowser prüfen

**Auftrag:** Nach dem Nutzerhinweis auf sein manuelles Neuladen den vorhandenen
HTTP-401-Wiederanlauf ohne weitere Nutzerbedienung prüfen. Das Profil und die
gespeicherten Anmeldedaten bleiben erhalten; keine produktive Kontoumstellung.

**Prüfung:** 31 bestehende Tests für Kontoimport und Identität bestanden,
einschließlich erfolgreicher 401-Erneuerung, entzogener Freigabe und Abbruch
bei 403/429. Im echten Chrome bestätigt ein kurzer Baselineabruf das Konto
mit zwei HTTP-200-Antworten ohne Neuladen. Anschließend beantwortet ein
temporärer Playwright-Test ausschließlich den ersten Profil-GET synthetisch
mit HTTP 401. Der unveränderte produktive Import lädt selbst einmal das
Hauptdokument neu; danach wird die erwartete Identität bestätigt. Fünf weitere
beobachtete API-Antworten liefern HTTP 200, keine sichtbare Mensch-Prüfung und
keine beobachteten API-Schreibaufrufe. Der Test endet vor dem erneuten Abruf
von Inseraten/Gesprächen. Die temporäre Antwortsimulation wird entfernt und
der Testclient beendet; der Browser bleibt geöffnet. Keine Datenbankzugriffe.

**Messgrenze:** Zwei Hauptframe-Navigationsereignisse bedeuten hier einen echten
Dokumentabruf plus ein weiteres Browserereignis. Die zunächst zu strenge
Testbedingung wurde auf die tatsächliche Hauptdokumentanfrage korrigiert;
der wiederholte begrenzte Test bestätigt genau einen solchen Abruf. Kein
Produktcode geändert. Dieser Test beweist den automatischen 401-Ablauf bei
gültiger gespeicherter Anmeldung, nicht die Erneuerung wirklich abgelaufener
Anmeldedaten. Die Ursache des vorherigen echten 401 bleibt offen. Der
vorhandene Synchronisierungsrunner ruft diesen Import direkt auf; die
gesonderte Identitätsprüfung des Loginablaufs ist damit nicht mitgeprüft.

## 2026-10-06 - Juna - echten lesenden Cloudabruf bei Maike Vintage prüfen

**Auftrag:** Nach der erneuten Nutzerbestätigung der angemeldeten Vinted-Startseite
den vorhandenen produktiven Kontoabruf im unabhängigen Chrome-Pilot testen.
Das Browserprofil bleibt erhalten und ist weiterhin keiner Flipbase-Verbindung
zugeordnet. Kein produktiver Workerwechsel oder Datenbankimport.

**Nachweis:** Der unveränderte kompilierte Kontoimport aus dem laufenden Worker
liefert ein Profil, fünf Inserate, acht Gespräche, 28 Nachrichten aus bereits
gelesenen Gesprächen und zwei Bewertungen. Profil, Inserate, Gesprächsübersicht
und Bewertungen sind vollständig gemäß dem bestehenden Leser. Nachrichten und
Verkäufe bleiben ausdrücklich Teilstände; ungelesene Gespräche werden nicht
geöffnet. Zwei Identitätsprüfungen bestätigen Maike Vintage vor den weiteren
Kontobereichen und nach dem Import. 17 Quellanfragen plus diese beiden Prüfungen
liefern ausschließlich HTTP 200. Keine sichtbare Mensch-Prüfung, kein beobachteter
API-Schreibaufruf und kein Datenbankzugang. Der Testclient endet ohne Browserstopp.

**Einordnung:** Eine vorherige einzelne Identitätsprüfung lieferte HTTP 401 und
wurde beendet. Im anschließenden produktiven Import trat dieser Fehler nicht
erneut auf; dessen vorhandener Seitenneuladeweg wurde deshalb nicht ausgelöst.
Der Nutzer bestätigt nachträglich, während des ersten API-Fehlers die Vinted-Seite
manuell neu geladen zu haben. Der erfolgreiche Folgeabruf ist deshalb nach
diesem manuellen Eingriff einzuordnen, nicht als Nachweis selbstständiger
Sitzungserneuerung. Eine Erneuerung der API-Anmeldung durch den Seitenaufbau
ist eine plausible Erklärung; ein eingefrorener Browser ist nicht nachgewiesen.
Die genaue Ursache des ersten 401 bleibt offen. Es wurden keine Cookies,
Passwörter, Nachrichteninhalte oder vollständigen Antworten gespeichert oder
ausgegeben. Der Test ist auf 40 API-Anfragen und 120 Sekunden begrenzt.
Cloud-Verknüpfung, Favoritenereignisse, Schreibaktionen und Dauerbetrieb bleiben
eigene Abnahmen. Keine Funktion oder Anmeldeerkennung geändert.

## 2026-10-06 - Juna - Account-Favoriten über PR #316 abschließen

**Freigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und das anschließende Aufräumen des eigenen Featurezweigs ausdrücklich bestätigt. PR #316 führt `juna/vinted-feed-account-favorites` nach `master`.

**Integration:** Der geprüfte Feedstand `c40f9f42` wird mit dem aktuellen master `845fc8af` verbunden. Dessen Änderungen am Cloudbrowser-Piloten und seiner Dokumentation bleiben unverändert. Die Überschneidung liegt im gemeinsam vorangestellten Änderungsprotokoll, nicht im Anwendungscode.

**Historie erhalten:** Die vollständigen Protokolle beider Stände bleiben über dieselben Git-Blobs erhalten, ohne Kürzung oder Rekonstruktion. Die Archive liegen weiterhin direkt unter `docs/`, damit ihre relativen Verweise gültig bleiben:

- [Vollständiger master-Verlauf bis zu diesem Abgleich](AI-CHANGELOG-2026-10-06-master.md), unveränderter Blob `d808f266052fb7f3d669ad341592e6d47a2f53f4`. Enthält insbesondere die zwischenzeitlichen Cloudbrowser-Arbeiten und sämtliche älteren Einträge.
- [Vollständiger geprüfter Feed-Verlauf](AI-CHANGELOG-2026-10-06-feed.md), unveränderter Blob `4543609f7f1a6895ab07f42a41212d1790818c31`. Enthält die Implementierungs- und Fehleranalyse der Account-Favoriten sowie den Abschlussnachweis.

**Prüfstand:** Der erneut gelesene Integrationslauf `37497892235` ist erfolgreich: 222 betroffene Anwendungstests, 246 Collector-Tests, 3.209 Datenbankprüfungen und neun Browserabläufe ohne Retry; Produktionsbau, Formatierung, Lint, Typprüfung und Workflow-Verträge bestanden. Die regulären vollständigen PR-Prüfungen auf dem verbundenen Stand sind noch ausstehend. Kein Merge nach master und kein Deployment wurden zu diesem Zeitpunkt durchgeführt.

**Umfang:** Persönliche Account-Favoriten je Benutzer und Workspace, ausdrücklich bestätigter Altimport ohne Wiederherstellung manuell entfernter Einträge, keine zeitliche Löschung und keine 500er-Verdrängung. Normale Funde und Referenzpreise verwenden sieben Tage. Feed mit Titelsuche vor der Seitengrenze, fünf Desktopspalten, kleineren Bildaktionen, Heute/Gestern und gemeinsamem Kategorie-Wähler mit Vinted-Datenquelle.

**Grenzen:** Die Browserprüfungen verwenden getrennte Desktop-/Tablet-Kontexte mit Testantworten. Kein echter Vinted-Abruf, kein unabhängiger zweiter Reviewer und keine Spiegelung externer Produktbilder. Ältere Hinweise auf damals offene Prüfungen bleiben in den historischen Archiven unverändert.

**Cloud-Favoritenregeln:** Eigene Cloud-Aktivierung mit erneuter Kontofreigabe,
Versionsbindung und getrennten Nachrichten-/Angebotsclaims umgesetzt. Die bestehende
Ereignisvalidierung, Berliner Zeitregeln und serverseitige Preisformel werden geteilt.
Cloud- und Extensionclaims bleiben getrennt. Hintergrundversand respektiert die
Automatikpause; unklare Texte erzeugen kein Angebot und keine automatische Wiederholung.
Favoritenabruf liest höchstens zwei Benachrichtigungsseiten ohne Gelesen-Markierung,
nur bei aktivierter Regel. Ein Widerruf schaltet die Cloud-Regel aus.
Offiziell erzeugte Migration auf isoliertem Stand geprüft: 356 DBassertions;
419 Workerprüfungen bestanden, sieben bestehende Skip; 13 Favoriten-UI-Prüfungen,
Worker-/App-Typprüfung und Bau sowie ESLint/Formatierung bestehen.
Browserintegration und unabhängiges Abschlussreview folgen. Kein Live-Versand.
