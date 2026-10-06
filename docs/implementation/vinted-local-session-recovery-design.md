# Vinted: verlässlicher lokaler Betrieb und Erweiterungsmodal

Stand: 6. Oktober 2026. Analyse und Entwurf auf `5c968829` / Flipbase 0.297.0,
Erweiterung 1.5.0. Noch keine Umsetzung oder Produktionsänderung dieses Entwurfs.

## Auftrag und Erfolgskriterium

Eine bereits eingerichtete lokale Verbindung muss im Alltag ohne erneuten
Einrichtungsdurchlauf funktionieren. Browserstart, geschlossener Arbeitstab und
Erweiterungsneustart dürfen die gespeicherte Kontozuordnung nicht verlieren.
Kontenseite und Erweiterungsmodal müssen zeigen, welches Profil zu welchem Konto
gehört und ob Live-Abrufe tatsächlich möglich sind. Gespeicherte Chats erscheinen
sofort; ein Hintergrundabruf erhält die vorhandenen Daten und liefert einen
ehrlichen, gesprächsbezogenen Status.

Die Logo-Blase soll weiß mit gelbem Flipbase-Logo und Schatten sein. Beim Öffnen
erscheint ein zentriertes Modal mit abgedunkeltem Hintergrund, Kontodaten,
Betriebsstatus und tatsächlich unterstützten Einstellungen. Die Einrichtung
gehört zum Hinzufügen eines Kontos; bestehende Konten werden direkt auf der
Kontenseite geprüft und wieder in Betrieb genommen.

## Nachweise und Grenzen

- Die beiden Blasen wurden im selben angemeldeten Vinted-Tab geöffnet. Bleam zeigt
  das zentrierte Modal mit Kontozuordnung, Tarif, Assistenten und Backupstatus.
  Flipbase zeigt nur ein kleines Popup unten rechts mit gespeicherter Zuordnung
  und Links zur lokalen Einrichtung beziehungsweise Kontenseite.
- Gemessen am Flipbase-Button: 52 Pixel, gelber Hintergrund, 1-Pixel-Rahmen;
  Schwarz stammt laut CSS auch vom Hoverzustand. Das ist keine reine
  Tastaturfokusfrage. Das Bleam-Livebild bestätigt die weiße Schattenblase.
- Der Übersichtseinstieg ins Postfach wurde gelesen: Artikelbild vorhanden,
  Titel und Aktivität nicht verfügbar, leerer Detailverlauf und gleichzeitig
  grünes „Synchronisiert“. Die Gesprächsliste enthält eine Textvorschau.
- Ein vorübergehender Hinweis auf fehlenden Verwaltungszugriff verschwand nach
  „Erneut versuchen“. Seine ursprüngliche Ursache ist nicht nachgewiesen; daraus
  folgt keine Aussage über einen tatsächlichen Rechteentzug.
- Der Arbeitstab war bei der Beobachtung wieder vorhanden. Welcher konkrete
  Pausenzustand vor der manuellen Wiederaufnahme bestand, lässt sich rückwirkend
  nicht beweisen. Die folgenden Wiederaufnahmefehler sind Codebefunde.
- Keine Automatik umgeschaltet, kein Konto getrennt, kein Arbeitstab absichtlich
  geschlossen und keine Nachricht gesendet. Die Untersuchung ist kein Nachweis
  eines ausgeführten Neustart- oder Wiederanlauftests.

## Belegte Ursachen

| Bereich                | Befund                                                                                                                                    | Konsequenz                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Übersicht → Gespräch   | `vinted-messages.component.ts:348` ruft `openConversation(entry, false)` auf.                                                             | Dieser Einstieg überspringt den Detailabruf, normale Chatwahl nicht.                            |
| Gesprächsstatus        | `vinted-messages.component.html:414–433` verwendet Kontosynchronisationszeit und zeigt ohne Fehler oder Spinner pauschal Erfolg.          | Grün beweist keinen erfolgreichen Abruf dieses Gesprächs.                                       |
| Unbekannte Metadaten   | `component.ts:239–243` und `component.html:195` behandeln fehlende Aktivität beziehungsweise fehlenden Titel als nicht verfügbar.         | Unbekannt, noch nicht geladen und ausdrücklich entfernt werden vermischt.                       |
| Detaildatenverlust     | `20261004233236_vinted_local_messaging.sql:244–251` erhält Metadaten nur bei gleicher Listenrevision; Angular erhält nur das Artikelbild. | Eine neue Listenrevision kann einen bekannten Titel durch null ersetzen.                        |
| Übersprungener Abruf   | `vinted-local-extension.store.ts:419` beendet einen Aufruf bei `busy()` ohne Ergebnis; der Aufrufer lädt anschließend den Cache.          | Ein nicht ausgeführter Abruf kann als erledigt erscheinen.                                      |
| Erweiterung erreichbar | `flipbase-bridge.js:18–45` kündigt das Content Script unabhängig vom späteren Hintergrundstatus an.                                       | Das bestätigt weder richtige Profilbindung noch Login oder Arbeitstab.                          |
| Lokal verbunden        | Kachel und Blase lesen Serverstatus beziehungsweise gespeicherte Zuordnung.                                                               | Eine dauerhafte Zuordnung wird mit aktueller Betriebsbereitschaft verwechselt.                  |
| Persistierte Pause     | `vinted-local-scheduler.js:16–21` stoppt vor der Identitätsprüfung bei jedem `pauseReason`.                                               | Ein später erfolgreicher normaler Vinted-Login hebt die alte Loginpause nicht auf.              |
| Browserstart           | `vinted-local-background.js:211–237` stellt den Alarm her, startet aber keinen unmittelbaren Bereitschaftscheck.                          | Der Arbeitstab entsteht erst bei einem fälligen, erlaubten Abruf.                               |
| Tabverlust             | `vinted-local-background.js:16–55,82–97` erstellt schon jetzt inaktive, angeheftete Ersatzarbeitstabs.                                    | Wiederherstellung fehlt nicht grundsätzlich; ihre Auslöser und Grenzen sind unklar.             |
| Fehlender Receiver     | Vor einem Ersatz fehlen Websiteberechtigungsprüfung und eindeutiger Fehlercode. Der alte reservierte Tab bleibt liegen.                   | Fehlende Berechtigung kann wiederholte Ersatzanlage verursachen; Reloads können Tabs ansammeln. |
| Konto pausiert         | SQL-Grantprüfung meldet 42501; dieser Fehler wird zu `local_binding_invalid`, die Blase nennt ihn widerrufen.                             | Pause, Widerruf und andere Freigabefehler brauchen getrennte Zustände.                          |

Die detaillierte Bleam-Referenz bleibt in
[bleam-vinted-analysis.md](../research/bleam-vinted-analysis.md:185) erhalten.
Die lokale Codekopie belegt für die Blase weiß, kein Rahmen, Schatten und
`scale(1.1)` beim Hover. Frühere Regeln im selben Bundle unterscheiden sich;
Maße aus diesem Bundle sind Quellenbefunde, keine vollständige Live-CSS-Messung.

## Zielablauf im täglichen Betrieb

1. Chrome startet. Die Erweiterung lädt die bestehende Profilbindung und prüft
   Freigabe, Websiteberechtigung, Pause und Vinted-Identität. Sie verlängert keine
   Freigabe und richtet kein neues Konto ein.
2. Bei gültiger Verbindung wird genau ein reservierter Arbeitstab im Hintergrund
   wiederverwendet oder hergestellt. Das normale Vinted-Fenster bleibt nutzbar.
3. Flipbase erkennt die Bindung dieses Browserprofils. Ohne bewusste frühere
   Kontowahl wird das passende Konto vorgeschlagen. Eine ausdrücklich gewählte
   andere Verbindung wird nicht stillschweigend ersetzt.
4. Die Kontenseite zeigt gespeicherte Zuordnung, aktuelle Betriebsbereitschaft
   und Datenstand getrennt. Ein Problem bekommt dort eine passende Aktion wie
   „Verbindung wiederherstellen“, „Vinted anmelden“ oder „Freigabe erneuern“.
5. Gespeicherte Konto- und Chatdaten bleiben sofort sichtbar. Ein Initialabgleich
   läuft einmal pro erfolgreicher Wiederaufnahme für erlaubte, fällige Daten;
   spätere Klicks starten nicht jedes Mal einen vollständigen Import.
6. Ein bewusst geöffnetes Gespräch erhält aus Übersicht und Postfach denselben
   Detailabruf. Gespeicherte Inhalte bleiben sichtbar, der Status aktualisiert
   sich ohne springende Header oder zusätzliche Ladebanner.

Ein anderes Browserprofil darf gespeicherte Daten des ausgewählten Kontos lesen.
Live-Aktionen benötigen jedoch die passende Profilbindung. „Dieses Konto gehört
zu einem anderen Browserprofil“ darf nicht als Verbindungsfehler oder Aufforderung
zum Ersetzen des bestehenden Vinted-Logins dargestellt werden. Ohne bestätigten
Kontakt zum anderen Profil wird dessen aktuelle Bereitschaft nicht behauptet.

## Gemeinsamer Statusvertrag

Die Kontenkachel behält „Lokal verknüpft“ als dauerhafte Zuordnung. Ein zweiter,
textlich erklärter Betriebsstatus wird von Kontenseite, Kopfbereich und Blase
gemeinsam verwendet:

| Zustand              | Darstellung und zulässige nächste Aktion                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Noch unbekannt       | „Verbindung wird geprüft“; keine vorzeitige Widerrufs- oder Erfolgsmeldung.                           |
| Bereit               | „Dieses Browserprofil ist verbunden“; geprüftes Konto, Freigabe und nutzbarer Arbeitstab.             |
| Wiederaufnahme       | „Arbeitstab wird wiederhergestellt“; ein begrenzter Hintergrundversuch.                               |
| Anderes Profil       | „In anderem Browserprofil verknüpft“; gespeicherte Daten lesen, passendes Profil öffnen.              |
| Login fehlt          | „Bei Vinted anmelden“; danach dasselbe Konto verifiziert erneut prüfen.                               |
| Websitezugriff fehlt | Konkrete Chrome-Berechtigung nennen; keine Ersatz-Tab-Schleife.                                       |
| Manuell pausiert     | „Pausiert“ und ausdrückliches „Fortsetzen“; keine automatische Aufhebung.                             |
| Freigabe abgelaufen  | „Freigabe erneuern“ am bestehenden Konto; kein Konto-hinzufügen-Ablauf.                               |
| Freigabe widerrufen  | „Nicht mehr freigegeben“; gespeicherte Daten bleiben, explizite erneute Freigabe nötig.               |
| Mensch-Prüfung/SMS   | Kontrollierte Übergabe; nach bewusst abgeschlossener Prüfung und bestätigter Identität erneut prüfen. |
| Kontosperre          | Konkrete Sperrmeldung; keine automatische Wiederaufnahme.                                             |
| Technischer Fehler   | Letzter geprüfter Stand bleibt; „Erneut prüfen“ mit begrenzter Wiederholung.                          |

„Bereit“ enthält einen Prüfzeitpunkt und darf nicht allein aus einem vorhandenen
Content Script entstehen. Die Statusantwort unterscheidet `workspaceId`,
`connectionId` und Vinted-Konto-ID ausdrücklich. Kontobezogene Links und Aktionen
verwenden die geprüfte Zuordnung und die zulässige App-Herkunft. Hinzu kommen
Version, Freigabe-/Profil-/Tabzustand, letzte Prüfung und letzte Abrufzeit;
keine Zugangsdaten. Bereitschaftsprüfung führt selbst keine Versandaufträge aus.

Für den Gesprächsfooter gelten getrennte Ergebnisse: gespeicherter Stand,
Aktualisierung, bestätigter Gesprächsstand und Abruffehler. „Synchronisiert“
verwendet den tatsächlichen `detailCheckedAt` dieses Gesprächs. Ein wegen eines
anderen Vorgangs wartender Abruf bleibt wartend; er gilt nicht als Erfolg.

## Wiederaufnahme und Datenhaltung

- Ein gemeinsamer Bereitschaftsaufruf verarbeitet Start, Appkontakt, Tabverlust
  und relevante Berechtigungsereignisse. Bestehende Lease und laufende Aufträge
  verhindern parallele Arbeit. Der Scheduler führt anschließend nur erlaubte,
  fällige Aktionen aus; keine neue Versandlogik im Bereitschaftscheck.
- Ein normaler, inzwischen behobener Loginfehler darf nach bestätigter Identität
  und gültiger Freigabe aufgehoben werden. Manuelle Pause, Widerruf, Ablauf,
  Kontowechsel und Mensch-Prüfung bleiben gesonderte Zustände.
- Ersatz nur für nachweislich eigene Arbeitstabs, nie für normale Nutzertabs.
  Nach erfolgreichem Ersatz wird ein alter eigener Tab gezielt freigegeben oder
  geschlossen. Fehlende Websiteberechtigung erzeugt keinen neuen Tab.
- Lokale Vorgänge werden geordnet ausgeführt oder liefern ein ausdrückliches
  Ergebnis: erfolgreich, wartet, übersprungen, falsches Profil oder Fehler.
  Antworten bleiben an Konto, Gespräch und Abrufrevision gebunden.
- Fehlende Felder einer Listen- oder Teilantwort löschen keine bekannten Titel,
  Bilder, Preise oder Aktivitätsangaben. Die Herkunft und der Prüfstand bleiben
  erhalten. Eine bestätigte Entfernung oder fachliche Änderung wird dagegen
  verarbeitet; verkauft bedeutet nicht automatisch gelöscht.
- „Artikel nicht verfügbar“ benötigt einen ausdrücklichen Quellnachweis. Wenn
  Aktivität nicht geliefert wird, lautet der neutrale Hinweis „Keine
  Aktivitätsangabe“; weder Onlinezeit noch Artikelverfügbarkeit werden erfunden.
- Automatische Listenabrufe öffnen keine ungelesenen Gespräche. Bewusste
  Chatöffnung kann wie bisher von Vinted als Lesen behandelt werden.

Aktueller eigener Scheduler: Nachrichten-/Favoritenliste ungefähr fünf Minuten,
Versandaufträge ungefähr 90 Sekunden, weitere Listenseiten ungefähr eine Minute,
Weckalarm 30 Sekunden. Das sind geplante Abstände; Browserstillstand, Sperren und
laufende Arbeit beeinflussen die tatsächliche Zeit. Ein Startcheck ersetzt diese
Intervalle nicht durch dauernde Vollabfragen.

## Erweiterungsmodal und Einrichtung

- Weiße Blase mit gelbem Flipbase-Logo, ohne schwarzen Standard-/Hoverrahmen;
  dezenter Schatten und kleine Hoverbewegung. Tastaturfokus bleibt sichtbar,
  reduzierte Bewegung wird berücksichtigt.
- Zentriertes, responsives Modal mit dunklem transparentem Hintergrund,
  Kopfzeile, Kontozuordnung, Betriebsstatus, letzter Aktualisierung und kompakten
  Aktionen. Escape, Fokusführung und Fokusrückgabe gehören zur Abnahme. Die
  Erweiterung übernimmt die zentralen Flipbase-Designwerte in ihren eigenen
  Content-Script-Kontext; sie kann Angular-Komponenten nicht unmittelbar laden.
- Vorhandene Favoritenmeldungen und Favoritennachrichten sind erreichbar.
  Ihren Aktivierungszustand zeigt das Modal nur mit serverbestätigten Werten
  und Aktualität; `ACCOUNT_STATUS` liefert diese Einstellungen bisher nicht.
  Ohne diesen Nachweis führt "Einstellungen öffnen" direkt zur passenden
  Einstellung des gebundenen Kontos, ohne einen Aktivierungszustand zu behaupten.
  Direkte Schalter benötigen einen authentifizierten, kontogebundenen
  Konfigurationsvertrag. Der vorhandene Lesestatus und die Versandfreigabe sind
  keine allgemeine Erlaubnis, Einstellungen aus jeder Vinted-Seite zu verändern.
- Automatische Verhandlung, Antworten, Antworten-Analyse und stündliche
  Inseratsbackups bleiben weitere Ausbaupakete. Keine scheinbar funktionsfähigen
  Schalter für diese noch nicht implementierten Assistenten.
- „Lokale Freigabe trennen“ bezeichnet den vorhandenen Widerruf plus lokale
  Trennung; gespeicherte Flipbase-Daten und Vinted-Login bleiben. „Konto entfernen“
  ist die getrennte Aktion zum Entfernen der Flipbase-Verknüpfung. Bleams
  „Abmelden“ beendet dessen Erweiterungsanmeldung; diesen Login gibt es bei uns
  derzeit nicht in derselben Form.
- „Einrichtung“ entfällt als täglicher Navigationspunkt. Hinzufügen enthält den
  Ablauf für neues Profil, Installation, Vinted-Login und bestätigte Zuordnung.
  Alte URLs bleiben mit kontextgerechter Weiterleitung erreichbar. Erneuern oder
  Reparieren bestehender Freigaben beginnt am betroffenen Konto.

## Empfohlene Umsetzung und Abnahme

1. **Gesprächspfade und Datenstand korrigieren.** Einheitlicher bewusster
   Detailabruf, ausdrückliche Abrufresultate, Metadatenerhalt und ehrlicher Footer.
   Soweit Persistenzregeln betroffen sind: Schema und neue erzeugte Migration
   gemeinsam prüfen; vorhandene Migrationen nicht ändern.
2. **Lokalen Betrieb vereinheitlichen.** Bereitschaftsprüfung, sichere
   Wiederaufnahme, Profilabgleich, Pause-/Widerrufsunterscheidung und genau ein
   Arbeitstab. Die Kontenseite erhält diesen Zustand und die passenden Aktionen.
3. **Einrichtungswege zusammenführen.** Hinzufügen führt zur Einrichtung,
   vorhandene Konten zu Prüfung oder Reparatur. Kein erneutes Hinzufügen zum
   Wiederherstellen derselben Verbindung.
4. **Blase und Modal umbauen.** Gleiches Betriebsmodell und klare Kontoaktionen;
   vorhandene Favoritenkonfiguration direkt erreichbar. Direkte Schalter erst
   mit geprüftem Konfigurationsvertrag, weitere Assistenten als eigene Pakete.

Die ersten drei Pakete gehören funktional zusammen und werden vor reinem
Blasen-Polish umgesetzt. Danach gezielter echter Kontotest der Wiederaufnahme;
reale Versandtests werden separat bewusst ausgelöst.

Pflichtfälle für die spätere Umsetzung: Browserstart und Extensionreload mit
gültigem Grant; geschlossener Arbeitstab; verweigerte Websiteberechtigung ohne
Tabansammlung; gewöhnlicher erneuter Login; falsches Profil; manuelle Pause,
Ablauf und Widerruf; CAPTCHA/SMS/Sperre; Übersichtseinstieg mit leerem Detailcache;
langsames Laden der Bindung; parallel laufender Import; schneller Chat-/Kontowechsel;
neue Listenrevision ohne Metadaten; bestätigte Artikelentfernung; Desktop/Mobil,
Tastatur, AXE und reduzierte Bewegung. Ein erfolgreicher Abruf darf erst dann
grün werden, wenn sein eigenes Ergebnis nachweislich übernommen wurde.
