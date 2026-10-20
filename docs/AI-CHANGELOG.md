# 🤖 KI-Änderungsprotokoll

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
