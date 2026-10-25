# Vintz: Funktionsabdeckung und Animationsvergleich

Stand: 18.10.2026, Juna. Der Nutzer fragt, ob alle Funktionen untersucht sind,
schließt den Konkurrenz-Monitor aus und bittet um Einordnung der als angenehm
wahrgenommenen Menü-/Dialoganimationen. Keine Umsetzung freigegeben.

## Gesamtstand

Die Einzelbefunde sind im [priorisierten Gesamtplan](vintz-flipbase-priority-plan.md)
zusammengeführt: bestehende Funktionen erhalten, Verlässlichkeit zuerst,
danach tägliche Arbeit und zusammenhängende Abläufe verbessern. Nur Planung;
keine Umsetzung, Aktivierung oder weitere Ausführung freigegeben.

Die wesentlichen Verkaufsabläufe sind als Wettbewerbsvergleich untersucht.
**Die gesamte Vintz-Anwendung ist noch nicht vollständig analysiert.**
Ein eigener Bericht bedeutet zudem nicht, dass jede Funktion produktiv
ausgeführt wurde. Schreibende Abläufe blieben überwiegend vor Ausführung stehen;
die jeweiligen Berichte nennen UI-, Quellcode- und Ausführungsgrenzen.

Diese Liste ordnet Funktionsbereiche, nicht jedes einzelne verborgene oder
tarifgesperrte Bedienelement. Eine Prozentzahl der Gesamtvollständigkeit wäre
deshalb nicht belastbar.

## Untersuchte Kernbereiche

| Kennung | Bereich                                      | Stand und wichtige Grenze                                                                                                                                                                                                                                                | Bericht                                                                 |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| V-01    | Cloudkonten, Anmeldung und Synchronisierung  | Technisch untersucht; manueller erfolgreicher Login und Erstabgleich beobachtet. Proxyanbieter/-IP der konkreten Verbindung und Serverinternes teilweise offen                                                                                                           | [Cloudanalyse](vintz-cloud-connection-analysis.md)                      |
| V-02    | Angebotsübersicht                            | Liste/Karten, Filter, Suche, Auswahl, Aktionsmasken und mobile Stichprobe verglichen; keine fachlichen Schreibaktionen                                                                                                                                                   | [Angebote](vintz-listings-comparison.md)                                |
| V-03    | Manuelles Neueinstellen                      | Einzel-/Sammelmasken, Varianten, Termine, Auftrags-/Abbruchfragen untersucht; kein durch Juna ausgeführtes Relisting                                                                                                                                                     | [Neueinstellen](vintz-relisting-comparison.md)                          |
| V-04    | Preisangebote und Favoritenabläufe           | Annahmeregeln, private Rabatte, Nachfassen, Prüfmodus und Ruhezeit verglichen; keine aktive Angebotsaktion                                                                                                                                                               | [Preisangebote](vintz-price-offers-comparison.md)                       |
| V-05    | Neues Angebot erstellen                      | Einstieg, Fotos, Vorschau, Entwürfe und Vorlagen verglichen; nachfolgende Vintz-Schritte teilweise anhand des Codes, keine Veröffentlichung                                                                                                                              | [Erstellung](vintz-listing-creation-comparison.md)                      |
| V-06    | Postfach und KI-Antworten                    | Liste, Verlauf, Schnellantworten, Entwurfsspeicherung und feste Antwortregel; ein ungesendeter KI-Entwurf getestet und wieder geleert                                                                                                                                    | [Postfach](vintz-inbox-ai-comparison.md)                                |
| V-07    | Übrige Automationen                          | Kennzahlen, öffentliche Preisabsenkung, Verkaufsablauf, Auto-Relist, Protokoll und weitere Vorgaben untersucht; keine Aktivierung                                                                                                                                        | [Automationen](vintz-other-automations-comparison.md)                   |
| V-08    | Menü-/Dialoganimationen                      | Gezielte Live- und Quellstichprobe beider Produkte, siehe unten; kein vollständiger Bewegungs-/Leistungstest                                                                                                                                                             | Dieser Bericht                                                          |
| V-09    | Bestellungen und Versand                     | Zwei abgeschlossene Bestellungen live; Etiketten-, Pack-, Sammeldruck- und Importpfade im Frontend verglichen. Kein offener Versandfall und keine fachliche Schreibaktion                                                                                                | [Bestellungen und Versand](vintz-orders-shipping-comparison.md)         |
| V-10    | Finanzen und Exporte                         | Fünf Finanzbereiche, Import-/Kosten-/Artikelformulare und zwei leere CSV-Dateien geprüft; Quellen verglichen. Keine Buchung, Firma oder Rechnung angelegt; Zusammenfassungsdownload unbestätigt                                                                          | [Finanzen und Exporte](vintz-finance-exports-comparison.md)             |
| V-11    | Bildstudio und Galerie                       | Sechs Werkzeuge, Varianten, leere Stapeleingabe, Promptbibliothek und bestehende Galerie live; Upload-/Auftrags-/Übernahmecode verglichen. Keine Generierung, Qualitäts- oder Kostenausführungsprüfung                                                                   | [Bildstudio und Galerie](vintz-image-studio-gallery-comparison.md)      |
| V-12    | Eigenständiger KI-Chat                       | Leerer Chat/Verlauf live; Datenkarten, Kontext, lokaler Verlauf, Streaming und Freigabecode verglichen. Keine Frage oder Aktion ausgeführt; Freigabedatenfluss inkonsistent                                                                                              | [KI-Chat](vintz-ai-chat-comparison.md)                                  |
| V-13    | Cockpit und Widgets                          | Übersicht, Kontomenü, Definitionen, Handlungsbedarf und Statistikvorschau live; Daten-/Vergleichs-/Speicherpfade untersucht. Keine Aktualisierung, Filteränderung oder Ausgabe. Native iOS-Widgets nur Codebefund                                                        | [Cockpit und Widgets](vintz-cockpit-widgets-comparison.md)              |
| V-14    | Archiv                                       | Acht gesicherte Einträge, Fotos/Feldlücken, Details, unveränderte Bearbeitung, Import-/Backup-/Transfermasken und leeren Verlauf gelesen; Quellen mit internem Flipbase-Archiv verglichen. Keine Sicherung, Übertragung, Wiederherstellung oder Löschung ausgeführt      | [Archiv](vintz-archive-comparison.md)                                   |
| V-15    | Auswertungen und Berichte                    | Drei Tempo-Zeitfenster und Marktgruppen live samt GET-Aggregaten geprüft; Empfehlungen, Messhilfe und Teilnahmezustand untersucht. Flipbase-Berichte und konkrete Filter-/Kohorten-/Dauergrenzen verglichen; keine eigenen Tempo-Messungen verfügbar                     | [Auswertungen und Berichte](vintz-analytics-reports-comparison.md)      |
| V-16    | Einstellungen und Team                       | Neun Einstellungsbereiche, unveränderte Stil-/Teamdialoge live und geladene Speicher-/Rollen-/Seitenmechaniken verglichen. Kein Team erstellt, keine Rechte verändert; Servergrenzen offen. Flipbase-Einladungsplatzhalter und konkrete Rollenlücken dokumentiert        | [Einstellungen und Team](vintz-settings-team-comparison.md)             |
| V-17    | Erweiterung gegenüber Cloud                  | Browseranleitung, Cloudkarten/-verlauf und geladene Fähigkeiten, Wiederverbindung sowie Handy-Fernsteuerung mit Flipbase-Paket/Worker verglichen. Keine Installation, Kopplung oder neue Ausführung; Vintz-Manifest und Langzeitbetrieb offen                            | [Erweiterung und Cloud](vintz-extension-cloud-comparison.md)            |
| V-18    | Tarife, Kontingente und Zusatzkosten         | Tarif-/Creditvorschauen, aktuelles Proabo, Verbrauch und Resetzeiten live samt bereinigten GET-Feldern geprüft; Zusatzkonto-Konfiguration und Gratisaktion getrennt. Flipbase-Betapreise, Lizenzen und interne Kosten verglichen. Keine Buchung oder Grenzfallausführung | [Tarife und Kosten](vintz-pricing-quotas-comparison.md)                 |
| V-19    | Benachrichtigungen und Hilfen                | Handlungsbedarf, iPhone-Mitteilungsseite, Fehlerhilfe, Produkt-E-Mail-Zustand und Supportverweise gelesen; mit Flipbase-Web-Push, Glocke, Fachereignissen und Recovery verglichen. Keine Aktivierung, Lesemarkierung, Tonprobe oder Zustellung getestet                  | [Benachrichtigungen und Hilfen](vintz-notifications-help-comparison.md) |
| V-20    | Rangliste, Rewards, Empfehlungen und Discord | Rangliste, unveränderter Beitrittsdialog, Rewardfortschritt/-vorschau, Empfehlungsbedingungen und Discordzugang live; GET-Zähler und geladene Quellen mit Flipbase-Beta-/Discordpfaden verglichen. Kein Beitritt, Claim, Kauf oder Verknüpfen                            | [Community und Rewards](vintz-community-rewards-comparison.md)          |

## Noch offene oder nur teilweise untersuchte Bereiche

| Kennung | Bereich                           | Bisheriger Teilbefund                     | Was fehlt                                                                          |
| ------- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| V-21    | Konkurrenz-Monitor und Auto-Block | Historische erste Beobachtungen vorhanden | **Vom Nutzer am 18.10.2026 ausgeschlossen. Keine weitere Analyse oder Übernahme.** |

Übergreifend offen: echte Mehrkonto-/Währungsabläufe, größere Datenmengen,
verlässliche Erfolgsquoten, tatsächlicher Hintergrundbetrieb über längere Zeit,
umfassende mobile Bedienung und Barrierefreiheit sowie Produktivtests der
schreibenden Aktionen. Diese Punkte sind keine stillschweigende Freigabe für
weitere Tests.

Bestellungen und Versand wurden nach gesonderter Nutzerfreigabe als V-09
untersucht. Offen bleiben dort insbesondere echte offene Sendungen, Druck,
Bundles, Storno und Rückgaben in der praktischen Ausführung.
Finanzen und Exporte sind nach weiterer Einzelfreigabe als V-10 untersucht;
echte Geschäftsdatenexporte, Belegimport und Rechnungsausstellung bleiben
ungeprüft. Bildstudio/Galerie sind als V-11 verglichen; echte Eingabe-/Ergebnis-
und Kostentests bleiben gesondert offen. V-12 untersucht den eigenständigen
KI-Chat ohne Frage oder Ausführung; Antwortqualität, tatsächlicher Serverkontext
und erfolgreiche Aktionsfreigabe bleiben ungeprüft. V-13 vergleicht Cockpit,
Kennzahlen, Aufgaben, Datenstand und Statistikvorschau; echte Mehrkontodaten,
Exporte und native iOS-Widgets bleiben ungeprüft. Die eigenständige Auswertung
V-15 wurde anschließend gesondert untersucht: Verkaufstempo, Marktpool,
Gruppierungen und drei Zeitfenster sind verglichen; eigene nichtleere Messungen,
serverseitige Erfassung/Anonymisierung und belastbare Marktbreite bleiben offen.
V-14 wurde danach gesondert verglichen: Vintz-Angebotssicherung und erneute
Uploads sind vom reversiblen internen Flipbase-Artikelarchiv getrennt.
Echte Sicherungs-/Transfer-/Recoveryabläufe, Bildvollständigkeit und
Aufbewahrung bleiben ungeprüft; kein Artikel verändert oder gelöscht.
Weitere Bereiche stehen oben.
V-16 wurde anschließend gesondert verglichen: Einstellungen, Größen, Schreibstile,
Teamkonten und geladene Rollen-/Seitenfreigaben. Kein Team erstellt und kein
Einladungs-/Entzugsablauf ausgeführt; Vintz-Serverrechte bleiben offen.
Flipbase-Einladungen sind im geprüften Service nur lokal; mehrere Schreibpfade
setzen fachliche Rollenbeschränkungen noch nicht durch. Keine Umsetzung.
V-17 vergleicht anschließend lokale und Cloudausführung, Kontobindung,
Funktionsgrenzen, Hintergrundzeitpläne, Update-/Fehlerhilfen und Moduswechsel.
Vintz' vollständiges Erweiterungspaket und echte Handy-/Offline-/Wechseltests
bleiben ungeprüft. Kein neuer Auftrag ausgelöst und nichts installiert.
V-18 vergleicht danach Tarife, Aktions-/Bildkontingente, Zusatzkosten und
Abrechnung. Aktueller Verbrauch, UTC-Monatsreset, Aboverlängerung, Zusatzkonto-
Preisfeld und Gratisaktion sind belegt; kein Checkout, Refund, Limitende oder
Tarifwechsel ausgeführt. Flipbase-Betalizenzen und interne Proxybeschaffung
bleiben von geplantem Kundenpreis und noch fehlender SaaS-Abrechnung getrennt.
V-19 unterscheidet danach Aufgaben, Ereignisverlauf, iPhone-/Web-Push und
Vinted-Ereigniseingang. Geräte-/Ton-/Testhilfen, gemeinsame Zustände,
Zielöffnung und konkrete Fehlerwege sind verglichen. Zustellung, Mobilgeräte,
Serverfreigaben und echte Wiederherstellung bleiben ungeprüft; keine
Benachrichtigung aktiviert, gelesen markiert oder versendet.
V-20 vergleicht anschließend Rangliste nach Verkaufsanzahl, Umsatzmeilensteine,
physische Rewards, Empfehlungscredits und Discordrollen. Leeres Wochenranking,
zwei ältere Feedverkäufe, null Rewardfortschritt und unveränderte Freigaben
sind belegt. Keine Teilnahme, Prämie, Zahlung oder Discordverbindung ausgeführt;
Serverprüfung, echte Gutschriften/Versand und Rollenlebenszyklus bleiben offen.
Damit ist kein weiterer benannter Navigationsblock ungeprüft; der ausgeschlossene
Konkurrenz-Monitor und die übergreifenden Ausführungs-/Qualitätslücken bleiben
ausdrücklich getrennt. Keine pauschale Vollständigkeit aller versteckten Funktionen.
Der Nutzer entscheidet über den nächsten Schritt; „danach stoppen“ bleibt bestehen.

## Animationen: gezielter Abgleich

**Der Nutzereindruck ist bestätigt: Flipbase besitzt bereits animierte
Dropdowns und Dialoge.** Das ist eine vorhandene gemeinsame Funktion, keine
erst noch zu bauende Grundfähigkeit.

Live geprüft:

- Vintz: Drei-Punkte-Menü eines bestehenden Polo-Angebots sowie dessen
  Bearbeitungsdialog; keine Werte eingegeben, nichts eingeplant.
- Flipbase: Vinted-Kontofilter in der Marktplatzübersicht und Dialog
  „Marktplätze verwalten“; keine Auswahl oder Einstellungen verändert.
  Dafür separaten Lesetab verwendet, vorhandenen anderweitig belegten Tab
  nicht übernommen.

| Eigenschaft              | Vintz, geprüfte Stichprobe                                                                                              | Flipbase, geprüfte Stichprobe                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Menü öffnen              | 180 ms, einblenden und von 96 % vergrößern                                                                              | 250 ms, einblenden, von 98 % vergrößern und 4 px nach unten bewegen                                                                    |
| Verlauf der Menübewegung | `cubic-bezier(0.25, 1, 0.5, 1)`                                                                                         | `cubic-bezier(0.19, 0.91, 0.38, 1)`                                                                                                    |
| Dialogkarte öffnen       | 220 ms, einblenden, 6 px Bewegung und von 98 % vergrößern                                                               | 250 ms, einblenden, 4 px Bewegung und von 97 % vergrößern                                                                              |
| Dialoghintergrund        | 180 ms einblenden                                                                                                       | 150 ms einblenden                                                                                                                      |
| Menüpunkte               | Gemeinsames Erscheinen im Menü; in den ersten drei gemessenen Punkten keine eigene Startanimation, 100-ms-Farbübergänge | Geprüftes Auswahlmenü verwendet gemeinsame Panelanimation und Farbwechsel; kein Nachweis gestaffelter Einträge                         |
| Menü schließen           | Geladenes CSS definiert 120 ms Ausblenden/Verkleinern                                                                   | Geprüfte gemeinsame Auswahl-/Spaltenmenüs entfernen das Panel beim Schließen; keine entsprechende Austrittsanimation im gelesenen Pfad |
| Bewegung reduzieren      | Gemessene Vintz-Klassen wechseln auf reines Einblenden; Menü-Schließen ohne Animation                                   | Globale Vorgabe verkürzt Bewegungen stark und schaltet die gemeinsame Popoveranimation ab                                              |

Öffnungszeiten und Kurven wurden über tatsächlich berechnete Browserstile
gelesen. Bewegungswege, Schließanimation und Reduktionsregeln zusätzlich im
geladenen CSS beziehungsweise in Flipbase-Templates/Quellen geprüft. Es handelt
sich nicht um eine gemessene Bildrate oder eine Befragung zur gefühlten Qualität.
Die Menürollen unterscheiden sich: Vintz-Aktionsmenü gegenüber gemeinsamem
Flipbase-Auswahlmenü. Keine pauschale Aussage zu jedem Menü beider Anwendungen.

Vintz verankert das Desktopmenü über den Auslöser und dessen Öffnungsrichtung.
Unter 768 px sieht das geladene CSS für die geprüften Klassen ein Einfahren
von unten vor. Diese mobile Bewegung wurde in diesem Schritt nicht zusätzlich
live gemessen. In Flipbase ist die gemeinsame Popoveranimation unter anderem
im Auswahlmenü, Spaltenmenü und mehreren Kopfmenüs eingebunden. Nicht jedes
fachspezifische Panel wurde auf durchgängige Verwendung geprüft.

### Einordnung für Flipbase

Vintz' geprüfte Menüs öffnen etwas schneller, die Dialoge liegen nahe
beieinander. Beide nutzen eine kurze Bewegung mit sanftem Abbremsen. Die
relevante mögliche Verbesserung wäre **einheitlicher Feinschliff**, besonders
Öffnen/Schließen, passende Verankerung, gleiche Komponenten und mobile
Übergänge. Daraus folgt keine Freigabe, pauschal alle Zeiten zu verkürzen oder
die bestehende Gestaltungsgrundlage zu ersetzen.

Die [verbindlichen Verwaltungsrichtlinien](../design/admin-ui-guidelines.md)
und der Wunsch nach geringer Bewegung bei entsprechender Systemeinstellung
bleiben bestehen. Vor einer Umsetzung müssten die betroffenen Einsatzstellen
gezielt verglichen werden; kein neues Animationssystem allein aufgrund dieser
Stichprobe nötig.

## Belege und Abschluss

Flipbase:

- [Gemeinsame Animationen und Bewegungsreduktion](../../src/styles.css#L1293).
- [Auswahlmenü](../../src/app/shared/components/custom-select/custom-select.component.html#L161)
  und [Schließen](../../src/app/shared/components/custom-select/custom-select.component.ts#L281).
- [Spaltenmenü](../../src/app/shared/components/table-column-menu/table-column-menu.component.html#L45)
  und [Schließen](../../src/app/shared/components/table-column-menu/table-column-menu.component.ts#L152).
- [Dialoghülle](../../src/app/shared/components/modal-shell/modal-shell.component.ts#L32)
  und [Template](../../src/app/shared/components/modal-shell/modal-shell.component.html).
- [Gemeinsame Kopfmenüs](../../src/app/layout/header/header.component.html#L45).

Vintz: [Angebotsoberfläche](https://vintz.ai/listings), berechnete Stile des
geöffneten Menüs und Bearbeitungsdialogs. Bereits geladenes Stylesheet
`https://vintz.ai/_next/static/chunks/1exgm4yw4_sbd.css`, SHA-256 des
UTF-8-Quelltexts:
`811700f22bae5eb5d5c69e37da2b281d9042ba64fbf7c1ccda429d936d7c934b`.
Fremdes CSS nicht in das Repository übernommen.

Ein statischer Screenshot beweist keine zeitliche Bewegung. Der Bildschirmbeleg
dient nur der Zuordnung des geprüften Menüs; maßgeblich für Zeitwerte sind die
gelesenen Browserstile. Kein flächendeckender Leistungs-, Tastatur-, Kontrast-
oder AXE-Lauf durchgeführt.

[Geprüftes Vintz-Menü](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-motion-listing-menu.png).

Keine Anwendung geändert, keine Einstellung gespeichert und kein Auftrag
ausgeführt. Vintz-Dialog und Menü nach Prüfung geschlossen. Separaten
Flipbase-Prüftab geschlossen, vorhandene Tabs unberührt. Maike-Verbindung
war im Lesetab weiterhin pausiert. Dokumentation formatiert und
Unterschiedskontrolle geprüft; keine Anwendungstests erforderlich.
