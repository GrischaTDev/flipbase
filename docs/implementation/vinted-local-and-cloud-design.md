# Vinted in Flipbase: Entwurf für Erweiterung und Cloud

Stand: 04.10.2026. Entwurfsplan auf Nutzerauftrag. Der erste lesende lokale
Pilot ist gemäß [Umsetzungsplan](vinted-local-extension-pilot.md) lokal umgesetzt;
die weiteren Pakete und Veröffentlichung stehen aus. Grundlage sind der
gemeinsame Bleam-Rundgang und die dort untersuchten Browser-/Erweiterungsdateien.
Die vollständigen Befunde stehen im [Rechercheprotokoll](../research/bleam-vinted-analysis.md).
Die Recherche ersetzt keine Abnahme unseres eigenen Produkts.

## Ziel und empfohlener Einstieg

Flipbase erhält einen eigenen Vinted-Bereich mit zentraler Kontoverwaltung,
Postfach, Anzeigen und schrittweise ergänzten Automatisierungen. Nutzer wählen
je Konto zwischen lokaler Browsererweiterung und Cloud-Ausführung. Beide Wege
verwenden dieselben Regeln, gespeicherten Daten, Aufträge und Ergebnisse.
Rund-um-die-Uhr-Betrieb bei ausgeschaltetem Nutzer-PC bleibt das Cloudziel.

**Empfehlung: zuerst einen kleinen lokalen Erweiterungspiloten bauen, danach
den Cloudbetrieb mit denselben Verträgen nachweisen.** Die vorhandene lokale
Vinted-Sitzung reduziert die ungeklärten Variablen des Serverlogins. Sie beweist
aber nicht bereits alle Datenzugriffe oder die Zuverlässigkeit jeder Funktion.
Nicht erst den gesamten Bleam-Funktionsumfang nachbauen, bevor die Cloud erneut
geprüft wird: Der lokale Pilot liefert die erste belastbare Grundlage.

| Vorgehen                   | Nutzen                                                                           | Nachteil / Entscheidung                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Erweiterung zuerst         | Anmeldung im Nutzerbrowser; Kontoverknüpfung und gezielter Abgleich früh prüfbar | Kein Dauerbetrieb bei ausgeschaltetem PC. Empfohlener Einstieg.                                                         |
| Cloud zuerst               | Das ursprüngliche Dauerbetriebsziel direkt prüfen                                | Login-/Prüfungsursache weiterhin ungeklärt, schwerer erster Produktnachweis.                                            |
| Beide vollständig parallel | Beide Betriebsarten früh verfügbar, wenn alles gelingt                           | Mehr gleichzeitige Fehlerquellen und Abstimmungsaufwand. Erst nach gemeinsamem Grundvertrag und lokalem Pilot sinnvoll. |

## Verifizierter Ausgangspunkt im Repository

- Vinted besitzt bereits einen Arbeitsbereich mit Konten, Übersicht, Anzeigen,
  Nachrichten, Verkäufen, Profil und Aktivität. Kontowechsel und Bereichstabs sind
  vorhanden; die globale Seitenleiste wechselt noch nicht auf ein Vinted-Menü.
- `supabase/functions/_shared/marketplace-contracts.ts` enthält gemeinsame
  Konto-, Capability- und Auftragsverträge einschließlich `outcome_unknown`.
  Eine deklarierte Capability ist kein Nachweis, dass sie tatsächlich funktioniert.
- Der Cloudworker hat bereits Synchronisierungsaufträge, Claims, Heartbeats und
  Wiederherstellung. Seine privilegierten Serverzugriffe sind keine API, die
  einer Kunden-Erweiterung unverändert gegeben werden darf.
- Unter `tools/flipbase-extension/` liegt ein Manifest-V3-Listing-Assistent für
  Kleinanzeigen mit Flipbase-Bridge. Vinted-Verknüpfung, regelmäßige Abgleiche
  und ein gemeinsamer lokaler Auftragsexecutor sind dort noch nicht vorhanden.
  Die bestehende Erweiterung ist ein Ausgangspunkt, keine fertige Vinted-Lösung.

Diese Befunde stammen aus dem untersuchten Arbeitsstand. Vor Umsetzung den
aktuellen Integrationsstand und Zuständigkeiten anderer Arbeitszweige abgleichen.

## Vinted-Bereich und Bedienung

Beim Betreten von Vinted wechselt die Seitenleiste auf das Bereichsmenü.
„Zurück zu Flipbase“ bleibt oben sichtbar. Die bestehende gemeinsame Anwendung,
Anmeldung, Arbeitsplatzauswahl und Shared-Komponenten bleiben die Grundlage.
Zurückwechseln beendet keine bereits gestarteten Aufträge.

Zielmenü: Übersicht, Konten, Postfach, Anzeigen mit Sicherungen, Veröffentlichen
mit Entwürfen/Vorlagen, Automatisierung, Planung & Verlauf, Einstellungen.
Neue Punkte erst mit nutzbaren Funktionen anbieten. In der ersten Stufe reichen
Konten, Übersicht, Anzeigen, Postfach und Verlauf, soweit jeweils nachgewiesen.
Kontowahl und Verbindungszustand bleiben im gemeinsamen Seitenkopf sichtbar.
Kontoübergreifende Aktionen brauchen ausdrücklich ausgewählte Zielkonten.
Bestehende mobile Navigation, Direktlinks und Zugriffsrechte berücksichtigen.

## Gemeinsame Grundlage für beide Ausführungsarten

**Verwaltung:** Flipbase speichert Einstellungen, erlaubte Funktionen, geplante
Aufträge, Ergebnisse und die für die Oberfläche benötigten synchronisierten
Daten. Die Oberfläche liest diesen Stand und zeigt seine Aktualität. Ein
Dashboard-Refresh ist von einem tatsächlichen Vinted-Abgleich unterscheidbar.

**Ausführung:** Ein lokaler Executor oder der Cloudworker führt kontoabhängige
Aufträge aus. Gemeinsam nutzbar sind Verträge, reine Validierung, Regeln und
Ergebnisdarstellung. Chrome-APIs, DOM-Zugriff und Playwright-/Node-Code bleiben
in den jeweils passenden Adaptern. Keine pauschale Portierung des bestehenden
Serverworkers in die Erweiterung.

**Zuordnung und Rechte:** Arbeitsplatz, Flipbase-Nutzer, Kontoverbindung und
externe Vinted-Identität müssen serverseitig geprüft und eindeutig zugeordnet
sein. Eine lokale Installation erhält widerrufbare, begrenzte Berechtigungen
für ihre bestätigte Verbindung; keinen Service-Role-Key und keine freie
Ausführung beliebiger URLs oder Skripte. Nur vertraglich erlaubte Aktionen.

**Zuständigkeit:** Pro Konto genau ein aktiver Ausführer. Übernahme und Claim
werden serverseitig verbindlich geprüft. Ein neuer Ausführer darf nicht einfach
starten, während eine frühere externe Schreibaktion ungeklärt ist. Ausfall,
Verbindungswechsel und Betriebswechsel verlangen Wiederabgleich; ein abgelaufener
Claim allein beweist nicht, dass im alten Browser nichts mehr passiert.

**Zustände:** Kontoverknüpfung, Verfügbarkeit des Ausführers, Vinted-Anmeldung
und Auftragsfortschritt getrennt darstellen. Ein angelegter Auftrag ist noch
kein Erfolg. Fehlendes Lebenszeichen nicht als „läuft“ anzeigen. CAPTCHA/SMS
erfordern manuelle Bearbeitung, eine blockierte Sitzung stoppt Folgeaktionen.
Ein unklarer Ausgang wird nicht durch blindes erneutes Senden aufgelöst.

**Datenschutz und Sitzung:** Im lokalen Modus verbleiben Vinted-Passwort und
Sitzungscookies im Nutzerbrowser. Nur die für freigeschaltete Funktionen
benötigten Inhalts-/Ergebnisdaten übertragen. Lokale Erweiterungstoken,
Sitzungsgeheimnisse und Nachrichteninhalte nicht protokollieren. Zugriff anderer
Arbeitsplätze verhindern; Verbindung widerrufbar und gespeicherte Daten nach
den bestehenden Löschregeln behandelbar machen. Cloudprofile brauchen weiterhin
ihre eigene serverseitige Isolation.

## Lokaler Verbindungsablauf

1. In Flipbase „Lokal verbinden“ wählen und Erweiterungsinstallation erkennen.
   Für Nutzer führt der Installationsbutton zum Chrome Web Store.
2. Für ein weiteres Vinted-Konto ein separates Browserprofil verwenden und die
   Erweiterung dort installieren. Profile trennen Logins, keine Garantie gegen
   Kontozuordnung oder Sperren. Anmeldung erfolgt durch den Nutzer bei Vinted.
3. Erweiterung über einen einmaligen, kurzlebigen und an die angeforderte
   Verbindung gebundenen Vorgang dem angemeldeten Flipbase-Nutzer zuordnen.
   Origins, Nachrichtenschemata, Ablauf und Wiederverwendung prüfen. Den
   bestehenden allgemeinen Bridge-Code nicht als ausreichende Freigabe behandeln.
4. Aktuelle Vinted-Identität auslesen, dem Nutzer anzeigen und ausdrücklich
   bestätigen lassen. Ein Kontowechsel im Profil stoppt die bisherige Zuordnung.
5. Zunächst nur lesend synchronisieren und erfolgreichen Import samt Zeitpunkt
   bestätigen. Einstellungen für automatische Schreibaktionen bleiben aus.

**Reservierter Arbeitstab:** Für Hintergrundprüfungen und Automatisierungen
einen eindeutig der Kontoverbindung zugeordneten Vinted-Tab verwalten. Im Tab
sichtbar erklären: „Für Flipbase reserviert. Hier werden automatische Aufgaben
ausgeführt. Bitte verwende für eigene Aktionen einen anderen Vinted-Tab.“
Darunter „Vinted in einem neuen Tab öffnen“ anbieten. Der Button öffnet einen
normalen Nutzertab im selben Browserprofil; der reservierte Arbeitstab bleibt
bestehen. Die Eingabe im neuen Tab ersetzt nicht die Freigabe einer manuellen
Prüfung im Arbeitstab. Beide Tabs verwenden weiterhin dieselbe Vinted-Sitzung;
vor Folgeaktionen Kontowechsel, Abmeldung und geänderte Daten berücksichtigen.
Bedienung dieses Arbeitstabs während der Ausführung sperren, damit Klicks und
Eingaben des Nutzers den Vorgang nicht verändern. Anstehende manuelle Prüfungen
pausieren die Automatik und geben die erforderliche Bedienung gezielt frei.
Ein solches Overlay ist eine Bedienhilfe, keine Sicherheits- oder Kontogrenze.

Pro Verbindung keine zusätzlichen dauerhaften Arbeitstabs durch Wiederanlauf
erzeugen. Geschlossenen oder navigierten Arbeitstab erkennen; vor erneutem
Öffnen/Übernehmen den Auftrag und die Vinted-Identität prüfen.

**Separater Aktionstab für Relisting:** Beim beobachteten Bleam-Relisting öffnete
die Erweiterung einen zusätzlichen gesteuerten Tab und füllte dort das
Verkaufsformular. Sie verwendete dafür nicht den dauerhaften Automationstab.
Ein eigener Hinweis sperrte Nutzereingaben, während die Formulararbeit hinter
dem Hinweis sichtbar blieb. Nach dem beobachteten Ablauf wurde der Aktionstab
geschlossen; das Ergebnis wurde zusätzlich über Anzeige und Journal bestätigt.

Für Flipbase diese Trennung ausdrücklich planen: dauerhafter Automationstab für
Prüfungen, temporärer gesteuerter Aktionstab für das jeweilige Relisting und
normaler Nutzertab für eigene Bedienung. Aktionstab eindeutig dem Auftrag und
Konto zuordnen; sichtbare Fortschrittsanzeige und Eingabesperre vorsehen. Erst
nach geklärtem Ergebnis bereinigen, bei unklarem Ausgang keine erneute
Veröffentlichung automatisch starten. Ein geschlossener Tab allein bestätigt
keinen Erfolg. Andere Funktionen nur dann in separate Aktionstabs auslagern,
wenn ihr konkreter Ablauf das benötigt.

Bei geschlossenem Browser, Schlafmodus oder fehlender Verbindung zeigt Flipbase
„lokal nicht verfügbar“; fällige Aufgaben dürfen beim Wiederaufwachen nicht als
ungeprüfte Massenaktion nachgeholt werden.

**Automatische Textantworten benötigen im geprüften Bleam-Pfad keinen Aktionstab.**
Auf Nutzerrückfrage den vorhandenen statischen Code erneut bis zum Versand
nachvollzogen: Der Bot-Zyklus im reservierten Vinted-Tab liest geänderte
Gespräche und Details, holt eine Antwort-/Aktionsanweisung von Bleams Backend
und übergibt Text an den gemeinsamen Nachrichtendienst. Dieser reiht den Versand
ein, prüft die Gesprächsaktualität und sendet eine HTTP-Anfrage an Vinted über
den vorhandenen Browserkontext. Keine Neuerstellung eines Antworttabs oder
sichtbare Befüllung eines Chatformulars in diesem Pfad.

Nachweise in der formatierten Analysekopie von `base.js`:
`processConversation`/`callBackendAI` ab 51724/51861, `handleSimpleMessage` ab
52669, `sendMessage` ab 50978, Queueausführung ab 48663, eigentlicher Versand
ab 48862 und Dedicated-Tab-Prüfung ab 53179. Die Zeilen beziehen sich auf die
Analysekopie des untersuchten Pakets, nicht auf eine ursprüngliche Quelldatei.
Das ist ein statischer Codebefund; keine weitere Nachricht versendet oder
Laufzeitaufnahme vorgenommen. Nicht mit allen möglichen Nachrichtenfunktionen
oder der unbekannten Serverimplementierung gleichsetzen.

Für Flipbase daher getrennte Ausführungswege vorsehen: regelmäßige Prüfungen
und nachgewiesener Nachrichtenversand im lokalen Browserkontext, separate
Aktionstabs für aufwändige Formularabläufe wie Relisting. Den konkreten eigenen
Nachrichtenzugriff erst im Pilot bestätigen; der Konkurrenzbefund ist kein
bereits verfügbares Flipbase-APIversprechen.

## Umsetzungspakete und Abnahme

| Paket                                | Inhalt                                                                                                                                          | Abnahme vor dem nächsten Paket                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Gemeinsame Verträge               | Konto-/Installationszuordnung, begrenzte Rechte, Ausführungszuständigkeit, Auftrags-/Fehlerzustände, Importweg                                  | Falscher Arbeitsplatz/Konto verweigert; widerrufene oder abgelaufene Verbindung wirkungslos; parallele Ausführer verhindert.                                   |
| 2: Lokaler Lesepilot                 | Eigene Erweiterung, regulärer Vinted-Login, Identitätsbestätigung, gezielter Profil-/Anzeigenabgleich; Postfachzugriff separat nachweisen       | Ein echtes Konto importiert korrekt; erneuter Abgleich ohne doppelte Einträge; Neustart/Wiederaufnahme, Kontowechsel und Prüfseiten korrekt behandelt.         |
| 3: Bereich und Mehrkontenpilot       | Eigenes Vinted-Menü, Kontowechsel, Lokalstatus, Aktualität und Verlauf; zwei Profile/Konten                                                     | Keine vertauschten Daten/Aufträge; mobile Bedienung und Direktlinks funktionieren; Browser-/Netzausfall sichtbar; tatsächliche Abrufe und Laufzeiten gemessen. |
| 4: Begrenzte Aktionen und Store-Beta | Eine ausdrücklich ausgelöste Schreibfunktion nach Capability-Nachweis, danach eine abschaltbare Automatik; Veröffentlichung vorbereiten         | Externer Erfolg bestätigt; unklarer Ausgang ohne Doppelausführung; manuelle Übernahme/Pause; reguläre Storeinstallation im Testprofil nach Freigabe.           |
| 5: Cloudpilot                        | Manueller Chrome-Test, Profilwiederöffnung, danach kontrollierte Anbindung desselben Auftragsvertrags                                           | Loginursache eingegrenzt; Sitzungserhalt, Neustart, richtige Identität, Prüfungsstopp, lokaler/Cloudwechsel und vereinbarter Dauerlauf bestanden.              |
| 6: Funktionsausbau                   | Nach lokalem Pilot und eigener Priorisierung Sicherungen, Favoritennachrichten, Antworten, Verhandlungen, Nachverkauf, Veröffentlichung/Planung | Jede Funktion mit echten Ergebnissen und passenden Fehlerfällen abgenommen; keine bloße Übernahme aus Konkurrenzmarketing.                                     |

Paket 4 erfordert noch keine vollständige Relisting-Automatik. Vorrang hat ein
kleiner kontrollierter Schreibtest; weitergehende Funktionen nach erfolgreichem
Nachweis freischalten. Wartezeit einer Storeprüfung kann für getrennte
Cloud-Diagnose genutzt werden, ohne die lokale Abnahme davon abhängig zu machen.

## Technische Leitplanken für die Erweiterung

Manifest V3, kleiner TypeScript-/Browser-API-Aufbau, vorhandene eigene Bausteine
gezielt wiederverwenden. Keine weitere UI-Bibliothek allein für die Erweiterung.
Produktionsrechte auf benötigte Flipbase-/Vinted-Domains begrenzen; die bestehende
pauschale `<all_urls>`-Freigabe nicht ungeprüft weiterführen. Kleinanzeigen-Verhalten
beim Ausbau der bestehenden Erweiterung erhalten und gezielt prüfen.

Chrome kann den Hintergrunddienst beenden; globale Variablen und dauerhaft
laufende Timer sind deshalb keine zuverlässige Auftragsablage. Ereignisse,
Alarme und gespeicherte Zustände zur Wiederaufnahme verwenden. Beendeten Dienst,
Browserstart, Schlafmodus und Update testen. Dokumentiert in der
[Chrome-Service-Worker-Lebenszyklusbeschreibung](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
Content Scripts können DOM-Daten lesen, laufen aber standardmäßig in einer
isolierten Umgebung; benötigten Zugriff und jede Überbrückung gesondert prüfen,
statt Zugriff auf sämtliche Seitenvariablen vorauszusetzen. Siehe
[Content-Script-Dokumentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Abgleiche bündeln und Änderungen gezielt übertragen; keine komplette Seite je
Funktionsprüfung neu laden. Das erste Intervall ist ein zu messender Pilotwert,
keine behauptete Sofortreaktion. Bei Drosselung pausieren und vorhandene
Wartevorgaben beachten. Technische Wartezeiten an Lade-/Aktionszustände knüpfen;
keine Wirksamkeitsgarantie aus simulierten menschlichen Pausen ableiten.

## Chrome-Web-Store-Veröffentlichung

Nutzerziel bleibt die Installation per Storelink mit normalem Installationsdialog.
Entpacktes Laden dient ausschließlich internen Entwicklungstests. Storeeintrag,
Entwicklerkonto, nachvollziehbare Berechtigungen, Datenschutzerklärung, Screenshots,
Testzugang und nachvollziehbarer Build gehören zur Vorbereitung. Verfügbarkeit
und Reviewdauer nicht vorab versprechen; Ablauf anhand der
[offiziellen Veröffentlichungsanleitung](https://developer.chrome.com/docs/webstore/publish)
prüfen. Store-Veröffentlichung und notwendige Kontofreigaben erst nach konkreter
Produktprüfung und ausdrücklicher Nutzerfreigabe; in diesem Entwurf nichts gebucht
oder veröffentlicht.

## Funktionsumfang aus der Recherche

- Anzeigen: Karten/Details, Statistik mit Aktualitätsangabe, Sicherungen,
  nachvollziehbare Archivdefinition und Preisvorschau bei Sammeländerungen.
- Postfach: gezielte Aktualisierung, Kontokontext, klare Trennung zwischen
  Server-Refresh und Vinted-Sync, manuelle Gesprächsübernahme.
- Automatisierung: Favoritennachrichten mit Textvarianten, Sprache, Regeln und
  Verzögerung; Antworten mit Wissen; Verhandlungen mit Preisgrenzen;
  Nachverkaufsaktionen nach bestätigtem Status. Aktivierung ausdrücklich.
- Veröffentlichung: Entwürfe, Vorlagen, Fotos und Zielkonto; Ergebnisse je
  Artikel prüfen. Relisting mit Löschung separat behandeln: Teilfehler und
  unklarer Zustand dürfen weder eine Anzeige verlieren noch Duplikate erzeugen.
- Planung: Termin, wartend/laufend/Ergebnis, Ausfall-/Nachholregel und Journal.
  Optionale, abschaltbare Ergebnis-Mail erst nach bestätigter Ausführung.

Die Reihenfolge dieser Funktionen nach dem Pilot bleibt eine Produktentscheidung.
Bereits importierte Bestands-/Verkaufsdaten zentral weiterverwenden.

## Verbleibende offene Nachweise

Lokaler Zugriff auf jede gewünschte Vinted-Funktion, Storefreigabe, langfristiger
Sitzungserhalt, Reaktionszeit und Daten-/Ressourcenverbrauch werden erst im eigenen
Pilot bestätigt. Cloud-IP/Proxy und Browserstart sind weiterhin keine gelöste
Ursache. Kein GoLogin-Abonnement, Proxykauf oder eigener IP-Vertrag je Konto wird
hier beschlossen. Vor einer breiten Freigabe außerdem die bereits dokumentierten
Vinted-Regeln und fehlende Plattformfreigabe der betroffenen Funktionen klären.

## Ergänzung am 5. Oktober 2026: Cloudpilot mit festem IP-Bestand

Der Nutzer hat den [Cloudpilot mit fester IP-Zuordnung](vinted-cloud-ip-pilot.md)
und seinen [Umsetzungsplan](vinted-cloud-ip-pilot-plan.md) freigegeben. Jedes
Cloudkonto erhält eine vorhandene, geprüfte deutsche Dedicated-ISP-IP. Ist keine
frei, erscheint eine Kapazitätsmeldung. Automatische IP-Bestellungen und
Kundenabrechnung folgen später. Beim Hinzufügen oder Cloudwechsel liest der Server
bereits gekaufte deutsche Dedicated-ISP-IPs automatisch aus dem IPRoyal-Konto ein;
eine manuelle Registrierung ist im normalen Einrichtungsablauf nicht erforderlich.

Ein lokales Konto behält beim Upgrade seine Verbindungs-ID und vorhandenen
Daten. Die lokale Freigabe wird erst nach geprüfter Identität und bestätigtem
Cloudbrowserstopp atomar widerrufen. Ein Abbruch erhält den lokalen Betrieb;
die IP wird erst nach bestätigter Bereinigung wieder frei. Dieses Paket wird
auf einem eigenen Zweig umgesetzt. Der lokale Erweiterungsausbau läuft weiter;
seine Funktionsnachweise und ausstehenden Pakete bleiben gesondert abzunehmen.

## Umsetzungsstand am 4. Oktober 2026

Der lokale Lesepilot ist als Version 0.288.0 veröffentlicht. Version 0.289.0
ergänzt den eigenen Vinted-Menükontext mit Rückweg zu Flipbase und eine
schrittweise Einrichtung. Installationserkennung, Anmeldung auf
Vinted und die ausdrückliche Freigabe des erkannten Kontos bleiben getrennte
Schritte. Neue lokale Konten benötigen keinen erreichbaren Cloudbrowser.

Der Chrome-Store-Eintrag bleibt offen; die Oberfläche benennt den internen
Pilotweg ausdrücklich. Storeveröffentlichung und Cloudbetrieb bleiben weitere
Schritte. Der erste echte lokale Kontotest und die nächsten Datenquellen sind
unten getrennt erfasst.

### Rückmeldung aus dem echten lokalen Kontotest

Die Einrichtung ist inzwischen mit Version 0.289.0 veröffentlicht. Der Nutzer
bestätigt eine erfolgreiche Kontoverknüpfung und Anzeigenübernahme. Damit ist
der erste lesende Profil-/Anzeigenweg praktisch bestätigt. Postfach, Verkäufe,
regelmäßiger Abgleich und Schreibaktionen gehören noch nicht zu diesem Pilot.
Ihre leeren Ansichten sind deshalb kein Nachweis für ein leeres Vinted-Konto.

Die nächste Korrektur hält den reservierten Tab dauerhaft mit einem zentrierten
Hinweis und heller, durchscheinender Sperrfläche geschützt. Nur sichtbare
Anmeldung, SMS oder Mensch-Prüfung geben die Seite zur manuellen Bedienung frei.
Danach startet kein Abgleich selbstständig. Die Einrichtung zeigt eine
erreichbare, bereits installierte Erweiterung und eine ausbleibende Antwort
ausdrücklich. Fehlende lokale Datenquellen erscheinen als noch nicht angebunden;
gespeicherte Daten aus früheren Importen bleiben sichtbar.

### Nächstes Folgepaket: lesendes lokales Postfach und erkannte Verkäufe

Der nächste Ausbau orientiert sich an den dokumentierten Bleam-Funktionen und
verwendet unsere eigenen Leseroutinen und Verträge. Reihenfolge und Abnahme:

1. Gesonderte Postfach-/Verkaufsfreigabe pro Konto und Installation speichern.
   Bereits erteilte Profil-/Anzeigenfreigaben erhalten keine zusätzlichen Rechte.
   Freigabedialog, RPC, Importvertrag, erlaubte lokale Aktionen und Quellzustände
   müssen denselben Umfang bestätigen; Schemaänderung und Migration zusammen.
2. Gesprächsliste gezielt lesen, anschließend nur bereits gelesene Verläufe.
   Unser Cloudleser nutzt `/api/v2/inbox`, `/api/v2/conversations/{id}` und bei
   verknüpften Transaktionen `/api/v2/transactions/{id}`. Ungelesene Verläufe
   werden nicht automatisch geöffnet, um ihren Lesestatus nicht zu verändern.
3. Nachrichten mit stabiler Ereignis-ID, Gesprächszuordnung und Kontokontext
   übernehmen. Große Postfächer in begrenzten Teilimporten bearbeiten; nicht die
   bestehende 35-Sekunden-/512-KiB-Grenze durch einen großen Gesamtabruf ersetzen.
   Teilfehler erhalten vorhandene Daten und dürfen keinen vollständigen Stand melden.
4. Verkäufe zunächst nur mit bestätigter Verkäuferidentität und Bestellung
   übernehmen. Der bestehende Leser erkennt derzeit nur den Status „Versendet“.
   Diese Daten heißen erkannte Verkäufe und bleiben ein Teilstand; weitere
   Zustände erst anhand eigener Antworten ergänzen. Angebote zählen nicht als Verkauf.
5. Echten Abgleich mit gelesenem und ungelesenem Gespräch, eigener Transaktion,
   Kontowechsel, Neustart, Widerruf und Teilfehler prüfen. Aktualität je Quelle
   anzeigen; erst danach regelmäßige Abgleiche aktivieren und Intervalle messen.

Danach folgen kontrollierter Nachrichtenversand und Favoritenregeln, gemeinsame
Aufträge mit Journal und bestätigtem Ergebnis, Sicherungen und Veröffentlichung
mit eigenem Aktionstab sowie weitere Verhandlungs-/Nachverkaufsregeln. Die
dokumentierte Featureliste bleibt das Ausbauziel; erfolgreiche Verbindung und
Anzeigenimport ersetzen keinen Funktionsnachweis für diese Folgepakete.
