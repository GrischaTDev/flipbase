# Verlässliche App-Aktualisierung in Flipbase

Stand: 24.10.2026. Untersuchung und Empfehlung von Juna, noch keine Produktänderung.

Folgeauftrag vom selben Tag: Der Nutzer hat diesen Ablauf zur Umsetzung freigegeben.
Der [Umsetzungsplan](../superpowers/plans/2026-10-24-reliable-app-updates.md) und
das AI-Änderungsprotokoll dokumentieren die anschließenden Änderungen und Prüfungen.
Die folgenden Befunde beschreiben den unveränderten Ausgangsstand der Untersuchung.

## Entscheidungsvorschlag

Flipbase sollte neue Versionen im Hintergrund vollständig vorbereiten und den
Wechsel je Fenster durchführen. Andere Fenster behalten bis zu ihrem eigenen
sicheren Wechsel ihre vollständige bisherige Version und ihre Eingaben. Ein
Update darf nicht davon abhängen, dass alle Fenster gleichzeitig antworten oder
geschlossen werden.

Start, Updateprüfung, Versionswechsel und Freigabe der Oberfläche brauchen einen
gemeinsamen Ablauf. Beim Öffnen bleibt dieselbe Logo-Ansicht sichtbar, bis die
Startentscheidung getroffen ist. Eine bereits bedienbare Seite darf bei einer
gewöhnlichen Hintergrundprüfung nicht kurz verschwinden und wieder erscheinen.

Die bisherige Nutzerentscheidung vom 19.10. zur vollen Updateansicht ist zu
berücksichtigen: Während der Arbeit bleibt bei tatsächlich fertiger neuer
Version die bewusste Aktualisierung möglich, sobald die eigenen Eingaben sicher
sind. Als Weiterentwicklung empfehle ich beim frischen Start die automatische
Übernahme eines bereits vorbereiteten Updates innerhalb derselben Startansicht.
Das ist ein Vorschlag, keine bereits freigegebene oder umgesetzte Änderung.

## Grundlage und Grenzen

- Untersucht wurde der am 24.10. frisch abgerufene `origin/master`, Commit
  `f6a5a2abdbcefaba232b733fdb97ccdfe90a4f05`.
- Die lokale Arbeitskopie steht auf `8cef6b78`; deshalb stammen die maßgeblichen
  Codebefunde aus `git show origin/master:…`, nicht aus der älteren Arbeitskopie.
- Keine produktive Browsersitzung, iPad-Home-App oder Serverauslieferung untersucht.
  Der konkrete aktuelle Gerätefehler ist damit nicht reproduziert. Die
  nachfolgenden Mechanismen sind im aktuellen Hauptzweig nachweisbar.
- Zwei bestehende Testdateien des Hauptzweigs isoliert unter Windows mit Node
  `v26.5.0` ausgeführt: 27 Fälle erfolgreich. Das bestätigt bestehende Regeln,
  nicht bereits einen verbesserten Ablauf oder einen Linux-/Safari-Nachweis.
- Externe Quellen sind offizielle Herstellerdokumentation und veröffentlichte
  technische Erfahrungsberichte. Ein älterer Bericht belegt den beschriebenen
  Ansatz, nicht automatisch die heutige Implementierung des Produkts.

## Was im Code die Probleme erklärt

| Beobachtung                                                          | Nachweis im Hauptzweig                                                                                                                                                                                                           | Einordnung                                                                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ein anderes Fenster verhindert die Aktualisierung.                   | `public/sw.js`: `beginUpdate`, `updateReply`, `advanceUpdate`; ein antwortender Client mit `safe: false` beendet den ganzen Versuch.                                                                                             | Beabsichtigte globale Sperre, durch bestehenden Test ausdrücklich abgesichert.                                                                                                              |
| Auch nach dem Schließen weiterer Fenster kann ein Versuch scheitern. | `advanceUpdate` verlangt dieselbe Clientliste vor und nach der Vorbereitung. Ein geöffnetes oder geschlossenes Fenster kann den Versuch abbrechen.                                                                               | Die Empfehlung, Tabs zu schließen, kollidiert während eines laufenden Versuchs mit dessen Bedingungen.                                                                                      |
| Schlafende Tabs wirken unberechenbar.                                | `preserveSleepingViews` lässt nicht antwortende fremde Clients nach zwei Sekunden nur mit gültiger Zuordnung und vollständig geprüftem altem Cache weiterlaufen. Eine ausdrückliche Ablehnung bleibt global blockierend.         | Eine Ausnahme existiert bereits; „jeder Tab muss immer antworten“ wäre als vollständige Beschreibung falsch.                                                                                |
| Unterschiedliche Probleme bekommen dieselbe Hilfe.                   | `pwa-update.service.ts`: mehrere fehlgeschlagene Worker-Ergebnisse werden auf „Speichere … und schließe andere … Tabs“ reduziert.                                                                                                | Fehlender Cache, geänderte Clientliste und echte offene Eingaben sind für Nutzer nicht unterscheidbar.                                                                                      |
| Erst Seite, dann Update-/Prüfungsansicht.                            | `AppStartupService.markRouteRendered()` meldet nach dem ersten Rendern bereit. `public/app-startup.js` entfernt daraufhin die Startansicht. Die asynchrone Updateprüfung und das `@defer` in `app.html` laufen unabhängig davon. | Ein sichtbares Zwischenbild ist möglich; die tatsächliche Reihenfolge hängt von Laufzeiten ab.                                                                                              |
| Prüfungsansicht verschwindet, Updateansicht kommt später.            | `checkForUpdate()` beendet seine Prüfungsanzeige nach `registration.update()` beziehungsweise Zeitlimit. Die Installation läuft getrennt über `updatefound`/`statechange` weiter.                                                | Die Trennung ist technisch sinnvoll, die Anzeige besitzt aber keine gemeinsame Startentscheidung.                                                                                           |
| Gespeicherte Ansicht bleibt als offen eingestuft.                    | `hasOpenChanges()` berücksichtigt zusätzlich `.ng-dirty`, `.ng-pending`, `[aria-busy="true"]`, `[appModalDialog]` und `dialog[open]`.                                                                                            | Eine Markierung oder ein beliebiger Dialog ist kein präziser Nachweis ungespeicherter Geschäftsdaten. Die Geräteanleitung beschreibt selbst Formulare, die nach Speichern markiert bleiben. |
| Button wirkt während des Versuchs tot.                               | Die Aktualisierung setzt `isApplying`; der Button wird über `loading` deaktiviert. Eine dokumentweite Eingabesperre fängt zusätzlich Interaktionen während der Übergabe ab.                                                      | Während des kurzen verbindlichen Wechsels sinnvoll; zusammen mit globalen Wartebedingungen entsteht vermeidbare Blockade. Kein Nachweis eines konkreten Geräte-Klickfehlers.                |

Wichtige vorhandene Grundlagen bleiben erhalten: vollständige Installation mit
Dateiprüfsummen, getrennte Versionscaches, persistente Zuordnung eines Dokuments
zu seinem Bau und Schutz lokaler Eingaben. In `readNavigation()` erhält ein neu
geladenes Dokument bereits den aktiven Bau; andere Dokumente können ihren alten
behalten. Es fehlt somit nicht jede Grundlage für unabhängige Fensterwechsel.

Das Nginx-Abbild enthält den aktuellen Bau. Die gelesene Docker-/Nginx-Konfiguration
bietet keine ausdrückliche Auslieferung älterer Release-Dateien. Lokale Caches
können fehlen oder beschädigt sein; der Reparaturabruf einer alten Datei unter
derselben URL kann nach einem Deployment bereits neue Bytes oder 404 liefern.
Versionsschutz braucht deshalb auch einen geregelten serverseitigen Rückweg.

## Was andere Plattformen dokumentieren

| Quelle                                                                                                                                   | Veröffentlichter Ansatz                                                                                                                                                                                    | Folgerung für Flipbase                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Slack Engineering, 29.08.2019](https://slack.engineering/service-workers-at-slack-our-quest-for-faster-boot-times-and-offline-support/) | Versionsgetrennte Dateien; regelmäßige Prüfungen mit zeitlicher Streuung laden den nächsten Stand vorab, genutzt wird er beim nächsten Start.                                                              | Vorbereitung und laufende Arbeit trennen; Startdatei und nachgeladene Dateien müssen zusammenpassen. Historischer Erfahrungsbericht, keine Aussage zur heutigen Slack-Oberfläche.                                |
| [Angular: Betrieb von Service Workern](https://angular.dev/ecosystem/service-workers/devops)                                             | Ein laufender Tab bleibt auf seiner App-Version; ein neuer Tab kann bereits eine neuere Version erhalten. Nicht mehr verwendete Versionen werden aufgeräumt.                                               | Unterschiedliche App-Versionen je Tab sind ein vorgesehenes Modell. Flipbase verwendet aktuell einen eigenen Worker, daher keine unmittelbare Funktionsgarantie durch Angular.                                   |
| [Vercel: Skew Protection](https://vercel.com/docs/skew-protection)                                                                       | Unterstützte Anfragen werden einer konkreten Bereitstellung zugeordnet; vollständige Navigationen erhalten normalerweise den aktuellen Stand. Eigene Abrufe brauchen gegebenenfalls zusätzliche Zuordnung. | Die ganze Bereitstellung betrachten. Bei Flipbase müssen insbesondere Supabase-Schnittstellen und lokale Datenformate mit zeitweise älteren Clients kompatibel bleiben. Kein Vorschlag für einen Hostingwechsel. |
| [Chrome/Workbox: bewusster Updatewechsel](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)                     | Eine fertig installierte Version anbieten; nach Zustimmung aktivieren und nach Übernahme neu laden. Vorher kann flüchtiger Zustand gesichert werden.                                                       | Ein Klick soll einen vollständig vorbereiteten Wechsel auslösen, keine unbekannte Kette aus Vorbereitung und weiteren Nutzeraktionen.                                                                            |
| [web.dev: Lebenszyklus](https://web.dev/articles/service-worker-lifecycle)                                                               | Der Standard-Worker wartet auf das Ende alter Clients. `skipWaiting()` kann die Wartephase umgehen, anschließend kann der neue Worker alte Dokumente bedienen. Das birgt Versionsmischungen.               | Die Browsermechanik ist real, aber keine Verpflichtung zum manuellen Tabschließen. Sofortaktivierung verlangt sicheren Umgang mit alten Dokumenten.                                                              |
| [Chrome: Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)                                              | Browser können Hintergrundseiten einfrieren oder verwerfen; eingefrorene Seiten führen bestimmte Aufgaben nicht aus.                                                                                       | Die Aktualisierung darf keine rechtzeitige Antwort jedes Hintergrundfensters voraussetzen.                                                                                                                       |

Es gibt damit keinen universellen Standard, nach dem jede Web-App sofort und ohne
Rücksicht auf Eingaben neu lädt. Der gemeinsame Nenner ist: konsistente Version,
vorbereiteter Wechsel und Schutz der laufenden Arbeit. Die folgende Ausgestaltung
ist die daraus abgeleitete Empfehlung für Flipbase.

## So sollte sich Flipbase verhalten

| Situation                                              | Empfohlenes Verhalten                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frischer Start, aktuelle Version                       | Eine durchgehende Logo-Ansicht, anschließend die fertige Seite.                                                                                                  |
| Frischer Start, Update bereits vollständig vorbereitet | Innerhalb derselben Logo-Ansicht übernehmen und einmal neu laden. Kein zusätzlicher Pflichtklick.                                                                |
| Frischer Start, Download langsam oder Verbindung fehlt | Nach einem begrenzten Startbudget die vorhandene funktionsfähige Version öffnen. Offlinefähige Bereiche bleiben erreichbar; Download bei Gelegenheit fortsetzen. |
| Rückkehr aus dem Hintergrund                           | Prüfung bündeln und im Hintergrund durchführen. Vorhandene Eingaben bleiben sichtbar und bedienbar.                                                              |
| Update fertig, eigener Tab ohne offene Arbeit          | Eindeutige volle Updateansicht mit einem bedienbaren „Jetzt aktualisieren“. Nach Klick durchgehende Fortschrittsansicht bis zur neuen Seite.                     |
| Eigene Eingaben oder laufender Speichervorgang         | Eingabeansicht zugänglich lassen; Speichern oder Verwerfen ermöglichen. Anschließend den Wechsel für diesen Tab anbieten.                                        |
| Anderer Tab mit Eingaben oder eingefroren              | Dieser Tab bleibt auf seiner alten vollständigen Version. Das aktuelle Fenster darf unabhängig wechseln.                                                         |
| Download-/Aktivierungsfehler                           | Konkreten Zustand erklären, laufenden Versuch sauber beenden und gezielte Wiederholung ermöglichen. Keine endlose Ladeansicht.                                   |
| Mehrere Deployments während einer Sitzung              | Den tatsächlich vorbereiteten Zielbau festhalten. Spätere Versionen dürfen keinen Reload-Kreislauf erzeugen.                                                     |

Das Startbudget muss vor der Umsetzung anhand langsamer Verbindungen festgelegt
werden; eine konkrete Sekundenzahl ist kein allgemeiner Herstellerstandard.
Wenn keine lauffähige Version vorhanden ist, braucht es eine echte Fehleransicht
mit Wiederholung statt einer nicht erfüllbaren Weiterarbeitszusage.

## Technische Bedingungen für diese Bedienung

1. **Ein gemeinsamer Ablauf für Start und Update.** Eindeutige Zustände statt
   unabhängig schaltender boolescher Anzeigen: Startprüfung, arbeitsbereit,
   Download, Update bereit, eigene Eingaben offen, Wechsel, Fehler. Die Startansicht
   wird erst freigegeben, wenn sowohl die erste Route als auch die begrenzte
   Startentscheidung fertig sind. Nach dieser Freigabe darf eine verspätete
   Hintergrundprüfung keinen neuen Startbildschirm öffnen.
2. **Fenster einzeln wechseln.** Worker-Aktivierung und Neuladen eines Dokuments
   sind verschiedene Schritte. Der neue Worker muss alte Dokumente weiterhin
   ihrer bisherigen Version entsprechend bedienen. Nur der wechselnde Tab
   benötigt seine eigene Eingabe-/Speicherfreigabe. Tabnachrichten sind eine
   Ergänzung; die Sicherheit darf nicht von Antworten schlafender Tabs abhängen.
3. **Alte Versionen wirklich erhalten.** Zuordnungen müssen auch nach Worker-Neustart
   funktionieren. Alte Chunks und nicht inhaltsbenannte Dateien dürfen nie durch
   neue Bytes ersetzt werden. Alte referenzierte Caches erhalten, Speichergrenzen
   und beschädigte Zuordnungen behandeln. Für fehlende Bytes versionsbezogene
   Serverdateien mit Aufbewahrungs- und Bereinigungsregel bereitstellen. Bestehende
   Prüfsummen und Ausschluss privater/API-Daten beibehalten.
4. **Fachlichen Eingabestatus verwenden.** Eine gemeinsame Schnittstelle meldet
   ungesicherte Änderungen, laufendes Speichern und gesicherte Entwürfe. Nach
   erfolgreichem Speichern wird der Zustand verlässlich zurückgesetzt. Ein
   beliebiger Dialog oder eine alte Formularmarkierung genügt nicht als Sperre.
   Lokal sichern nur für ausdrücklich unterstützte Entwürfe und mit bestehender
   Konto-/Workspace-Trennung; keine Nachrichten oder Verkäufe automatisch absenden.
5. **Backend und lokalen Speicher kompatibel halten.** Unterstützte Altversionen
   und Ablauffrist definieren. Neue Felder zunächst ergänzend einführen; alte
   Clients und gleichzeitige IndexedDB-Zugriffe berücksichtigen. Unverträgliche
   Änderungen benötigen einen geplanten Wechsel. Ein Sicherheitsupdate darf
   gezielt strenger sein, braucht aber ebenfalls Eingabeschutz und klare Hilfe.
6. **Wechsel abschließen und belegen.** Zielbau vor dem Neuladen je Tab merken,
   nach dem Start mit der tatsächlich geladenen Baukennung vergleichen. Pro
   Versuch/Zielbau höchstens ein automatischer Reload; bei Abweichung Fehler und
   bewusste Wiederholung statt Schleife. Bei Abbruch Sperren und Timer freigeben.
   Protokollieren: Phase, alter/erwarteter/geladener Bau, Dauer und konkreter
   Fehlergrund; keine Formulardaten, Tokens oder Kontoinhalte.

## Sichere Einführung

Zuerst den Startablauf und die fachlichen Eingabestatus vereinheitlichen sowie
versionsbezogene Dateiverfügbarkeit sichern. Danach die globale Zustimmungspflicht
durch unabhängige Dokumentwechsel ersetzen. Ein gleichzeitiger Wechsel auf Angular
Service Worker oder Workbox ist dafür nicht zwingend und würde zusätzlich Offline-,
Push- und Cacheverhalten verändern. Die vorhandenen Schutzmechanismen gezielt
weiterzuentwickeln ist die zunächst kleinere Umstellung.

Besonders wichtig ist der erste Wechsel vom alten Protokoll zum neuen: Alte
Dokumente kennen bereits die globale Sperre. Ein Übergangsrelease muss mit diesem
Stand zusammenarbeiten und darf bekannte alte Dokumente nicht unbemerkt auf
inkompatible Dateien oder Speicherformate umstellen. Der Weg **Alt → Übergang →
Neu**, ein übersprungener Übergangsstand und ein Rollback gehören zur Abnahme.
Bei tatsächlich unverträglichen alten Ständen bleibt ein einmaliger klar erklärter
Wechselpfad erforderlich; „nie wieder in irgendeiner Altversion blockiert“ ist
ohne diesen Nachweis nicht belastbar.

## Abnahme vor Veröffentlichung

- Bestehende Update-, Cache-, Startup-, Eingabeschutz- und Produktions-PWA-Fälle
  an den neuen Vertrag anpassen. Der aktuelle Test, der bei offenen Eingaben eines
  anderen Tabs globale Blockade verlangt, muss durch unabhängigen Wechsel mit
  nachgewiesen erhaltenen Eingaben und alten Lazy-Dateien ersetzt werden.
- Zwei und drei echte Produktionsbauten prüfen: Einzeltab, mehrere aktive Tabs,
  fremde offene Eingaben, eingefrorenes Fenster, Fensteröffnung/-schließung während
  Aktivierung, Worker-Neustart und gleichzeitige Updateklicks.
- Alte Version einschließlich Cachefehler, verlorener Zuordnung, alter Datei vom
  Server, Offlinezustand, langsamer Installation, Speicherfehler, Rollback und
  übersprungenen Releases prüfen. Bei Fehlern weder Datenverlust noch Reloadschleife.
- Bildfolgen oder Video für Start, Rückkehr und Updateklick auswerten: keine
  kurz freigegebene alte Seite vor dem Startabschluss, keine Lücke während des
  Wechsels, keine zweite automatische Neuinitialisierung derselben Zielversion.
- AXE, Tastaturfokus, Touch, reduzierte Bewegung sowie betroffene helle/dunkle
  Ansichten und CI-Breiten prüfen. Fokus nach einem Fehler wieder erreichbar.
- PWA-Pflichtjob mit dessen Produktionsbedingungen unter Linux/CI-Versionen
  ausführen. Browserauswahl und Testregistrierung gemäß
  [betroffener Testauswahl](../testing/affected-test-selection.md) mitprüfen.
- Safari auf echtem iPhone/iPad und Home-App getrennt vom Browsertab prüfen;
  Playwright-WebKit allein ist kein Nachweis des dortigen Worker-Lebenszyklus.
  Ergebnisse nach [Geräteabnahme](../testing/pwa-device-acceptance.md) festhalten.

## In dieser Sitzung geprüft

Unveränderte Dateien `public/sw.js`, `scripts/service-worker-test-fixture.mjs`,
`scripts/service-worker-update.test.mjs` und `scripts/service-worker-cache.test.mjs`
aus dem genannten Hauptzweig in eine separate temporäre Struktur exportiert.
Ausführung mit `node --test` für beide Testdateien: **27 bestanden, 0 fehlgeschlagen**.
Darunter ausdrücklich: antwortender fremder Tab mit offenen Änderungen blockiert;
gesicherter schlafender Tab darf alt bleiben; geänderte Clientliste blockiert;
ein neu geladenes Dokument wechselt, das alte behält seinen Bau.

Kein Anwendungsbau, Browserlauf, Linuxlauf oder Gerätetest in dieser Recherche.
Die Untersuchung verändert nur diesen Bericht und den vorgeschriebenen
Sitzungseintrag; vorhandene fremde Änderungen bleiben erhalten.
