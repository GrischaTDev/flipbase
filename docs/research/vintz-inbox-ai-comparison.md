# Vintz-Postfach und KI-Antworten: Vergleich mit Flipbase

Untersuchung von Juna am 17./18.10.2026. Auftrag: Postfach und KI-Antwortfunktionen
analysieren, mit Flipbase vergleichen und anschließend stoppen. Keine Umsetzung
und kein Versand. Die Empfehlungen zur Angebotserstellung sind als Richtung
festgehalten, ohne Umsetzungsfreigabe.

## Ergebnis und Beleggrenzen

Vintz bietet mehr unmittelbar nutzbare Schreibhilfen und mehr Orientierung im
Postfach: Aufgabenpriorisierung, zusätzliche Themenansichten, gespeicherte
Antworten, vier Arten von KI-Entwürfen, Diktat und Bildwerkzeuge. Flipbase hat
bereits ein technisches Postfach mit Verlauf, Bildern, Angebotsaktionen und einem
kontrollierten Versandweg. Im aktuellen Flipbase-Antworteditor sind KI,
Schnellantworten, Übersetzung und Diktat nicht verbunden.

Die allgemeine automatische Antwort von Vintz verwendet eine feste gespeicherte
Vorlage. Das ist vom manuell erzeugten KI-Entwurf und von den bereits separat
untersuchten Angebotsautomatiken zu unterscheiden. Eine frei formulierende
KI-Automatik für alle Käufernachrichten ist hier nicht nachgewiesen.

| Belegart        | Umfang                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live      | Ein Cloudkonto mit 14 Gesprächen; Liste, Menüs, historischer Verlauf, Suchprobe, Schnellantworten, KI-Auswahl, Regelmaske, gespeicherte Fitpics und Verbindungsanzeige |
| Vintz KI-Test   | Ein Entwurf zur gewöhnlichen Artikelkommunikation, nicht gesendet und anschließend geleert                                                                             |
| Vintz Frontend  | Bereits geladene eigene Browsermodule zu Anfrageumfang, Entwurfsspeicherung, Klassifikation, Diktat und Regelmodell                                                    |
| Flipbase live   | Gleiches Konto Maike Vintage, 14 gespeicherte Gespräche und derselbe historische Verlauf; Konto weiter pausiert                                                        |
| Flipbase Quelle | Aktueller lokaler Stand `e3ef736370640125c1abddcaf82de6079205d9fa`, Komponenten, Versandlogik und vorhandene Testdefinitionen                                          |
| Nicht geprüft   | Tatsächlicher Nachrichtenversand, aktive Antwortautomatik, Diktatqualität, Bildgenerierung, Langzeitverbindung und große Postfächer                                    |

Die ausgelieferte Flipbase-Commitkennung wurde nicht neu ermittelt. Quellenbefund
und aktueller Produktivnachweis bleiben getrennt. Keine vollständigen privaten
Verläufe oder fremden Quelltexte ins Repository übernommen.

## Gesprächsliste und Arbeitsablauf

### Vintz

- Kontoauswahl im gemeinsamen Kopf. Mit diesem einzelnen verbundenen Konto wurde
  keine praktische Mehrkonto-Zusammenführung geprüft.
- Status mit Aktualisierungszeit und separater Liveverbindung. Die aufgeklappte
  Liveanzeige zeigt das Konto und den letzten Signalzeitpunkt sowie einen Zugang
  zum Verbindungsprotokoll. Das bestätigt eine gemeldete Verbindung, noch keine
  gemessene Zustelllatenz einer neuen Käufernachricht.
- Gruppe „Aktion erforderlich“ vor den übrigen Gesprächen. Im Test ein Gespräch
  mit Handlungsbedarf und 13 weitere Gespräche.
- Ohne Auswahl eine Arbeitsübersicht mit Antwortbedarf, erhaltenen Angeboten,
  Versandfragen, Problemen und Warten auf Käufer. Dazu „Nächste Aufgabe öffnen“.
- Sortierung: sinnvolle Reihenfolge, neueste, älteste und ungelesene zuerst.
- Direkt erreichbare Ansichten: Ungelesen, Alle, Updates, erhaltene/gesendete
  Angebote sowie Bestell-/Ankunfts-/Abholstatus.
- „Mehr“ ergänzt Zu erledigen, Probleme und Rückgaben, Warten auf Antwort,
  akzeptierte Angebote, laufende/abgeschlossene Bestellungen, Ich verkaufe,
  Von mir gekauft, Favoriten-Leads, Versand und Tracking, Artikelfragen sowie
  ältere Unterhaltungen. „Älter“ bedeutet im Code mehr als 30 Tage ohne neue
  Nachricht, keine Archivierung.
- Suche mit verständlichem Leerzustand und Möglichkeit zum Leeren. Die
  Suchprobe wurde wieder entfernt. Im Code stehen Name/Artikel und ein
  begrenzter Suchtext aus geladenem Verlauf beziehungsweise Vorschautext zur
  Verfügung; der Verlaufssuchtext wird auf 6.000 Zeichen begrenzt. Kein Nachweis
  einer vollständigen serverweiten Volltextsuche über sämtliche alten Nachrichten.
- Einzelmenü mit Gelesen-/Ungelesenstatus, bedarfsabhängig Erledigen/Wiederöffnen
  und Löschen. Auswahlmodus für Sammelaktionen; dessen Abschlussknopf
  „Erledigt“ schließt nur die Auswahl. Die Quelllogik unterscheidet das von
  „Als erledigt markieren“ am Gespräch.
- Sammellogik enthält gelesen, ungelesen und löschen. Keine fachliche Aktion
  davon wurde ausgeführt, keine Gespräche ausgewählt oder gelöscht.
- Gesprächsliste in der Breite veränderbar. Mobil eigener Gesprächsbereich mit
  Zurück-Aktion; Layout bei 390 × 844 kurz betrachtet und Größe zurückgesetzt.
  Tastatur-, Gesten- und Barrierefreiheitsqualität nicht vollständig geprüft.

**Die Priorisierung ist nicht automatisch KI.** Das geladene Frontend erkennt
Themen über Wörter und Muster für Preise, Maße, Zustand, Versand und Probleme.
Antwortbedarf wird unter anderem aus letzter Richtung, Nachrichtentyp und kurzen
Bestätigungen abgeleitet. Eine lange Entschuldigung nach einem angenommenen
Angebot stand im Test weiterhin unter Handlungsbedarf. Solche Heuristiken können
helfen, ersetzen aber keine sichere Erkennung offener Käuferfragen.

Die zwei erhaltenen Angebote in der Übersicht sind keine Zusage, dass zwei
Angebote noch angenommen werden müssen. Historisch akzeptierte Fälle können
mitgezählt werden; siehe [Preisangebotsvergleich](vintz-price-offers-comparison.md).

### Flipbase

Kontoauswahl, Suche, Filter, Sortierung und chronologische Liste sind vorhanden.
Filter: Alle, Ungelesen, Fragen, Verhandlung, Verkauft und Systemnachrichten.
Sortierung nach neuestem/ältestem Datum. Die Frageansicht prüft ein Fragezeichen
im Vorschautext; das ist keine KI-Auswertung.

Suche und Zähler beziehen sich auf bereits geladene Gesprächseinträge. Weitere
Gespräche können nachgeladen werden. Es gibt getrennte Leerzustände für noch
nicht synchronisiert, keine passenden Treffer und noch keine gespeicherten
Gespräche. Eine gemeinsame Ansicht über alle Konten, Erledigen, Wiederöffnen,
persönliche Labels oder manuelles Wieder-ungelesen-Markieren wurde im untersuchten
Postfachpfad nicht gefunden.

Belege: [Gesprächsliste und Bedienelemente](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L22),
[Filter, Suche und Sortierung](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L72),
[Frageerkennung](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L469).

## Verlauf und Artikeldaten

Beide Produkte zeigen Tagestrenner, ein- und ausgehende Nachrichten,
Angebotsereignisse, Bilder und einen Artikelbezug. Vintz ergänzt direkte
Gelesen-/Erledigt-/Löschaktionen und die bereits untersuchte Angebotskarte.
Flipbase zeigt Profilzugang, Artikel und tatsächlichen Gesprächsabgleich
getrennt vom allgemeinen Kontostempel.

**Konkrete Vintz-Datenlücke:** Beim getesteten Schalgespräch erschien der letzte
eigene Nachrichtentext mit der Schallänge als Artikeltitel. Der verlinkte
Vinted-Pfad gehörte weiterhin zum richtigen Schal. Flipbase zeigte im gleichen
Verlauf den eigentlichen Artikeltitel. Vintz zeigte 39,90 EUR als Artikelpreis,
die Angebotskarte den angenommenen Preis von 35 EUR. Flipbases Gesprächskopf
zeigte 35 EUR. Listenpreis und vereinbarter Preis sollten ausdrücklich
unterschieden werden; keine allgemeine Aussage über alle Artikel daraus ableiten.

Flipbase erhält beim Nachladen älterer Nachrichten und bei Hintergrundimport die
Leseposition. Automatische Nachrichten sind als automatisch markiert; dieses
Symbol belegt keine KI-Erzeugung. Bilder lassen sich einzeln in einem neuen Tab
öffnen. Ein eigener Nachrichtenbild-Dialog ist im untersuchten Pfad nicht vorhanden.

Belege: [Gesprächskopf](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L139),
[Verlauf und Bilder](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L270),
[Abgleichsstatus](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L492),
[Leseposition](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L916).

## KI-Entwürfe und Schnellantworten

### Sichtbare Bedienung bei Vintz

Der Antworteditor bündelt Textfeld, Plusmenü, KI-Auswahl, optionales Diktat und
Sendeknopf. Vier KI-Aufgaben sind verfügbar:

| Aufgabe             | Vorgabe im Frontend                                 |
| ------------------- | --------------------------------------------------- |
| Antwort             | Klar und freundlich antworten                       |
| Gegenangebot        | Freundlich verhandeln, ohne einen Preis zu erfinden |
| Frage stellen       | Eine kurze Rückfrage zu fehlenden Angaben           |
| Freundlich ablehnen | Angebot höflich ablehnen und Gespräch offenhalten   |

Die Auswahl erzeugt einen Entwurf. Sie führt weder eine Angebotsablehnung noch
eine Preisaktion aus. Der Text wird bearbeitbar eingesetzt und ausdrücklich als
KI-Entwurf, noch nicht gesendet, gekennzeichnet. Ein eigener Sendeschritt bleibt
nötig. Im Code sendet Strg/⌘ + Enter; normales Enter bleibt im Textfeld beziehungsweise
übernimmt bei geöffneter Kürzelliste die Auswahl.

Der separate Bereich „Schnellantworten“ enthält dieselben KI-Aufgaben mit eigener
Vorschau und „Einfügen“ sowie gespeicherte Antworten. Im geladenen Code kann
dieser Bereich bei erkanntem Antwortbedarf und passender Mitgliedschaft bereits
beim Öffnen einen Vorschlag erzeugen. Das wurde nicht zusätzlich in einem
offenen Käuferfall getestet. Ein solcher automatischer Analysebeginn sollte in
Flipbase hinsichtlich Kontext und Nutzungskontingent sichtbar sein.

### Tatsächlicher Einzeltest

Ein historisches Artikelgespräch enthielt Fragen nach Zustand und Länge. Die
Länge war bereits durch den Verkäufer beantwortet. Ein manueller KI-Aufruf
erzeugte einen deutschen Text mit der bekannten Länge von ungefähr 140 cm,
zusätzlicher Werbesprache und Emojis. Die Oberfläche forderte ausdrücklich zur
Prüfung auf.

Positiv: Die vorhandene Maßangabe wurde übernommen; kein Versand erfolgte.
Grenze: Die KI wiederholte eine bereits beantwortete Frage und ergänzte
allgemeine Werbeaussagen. Der bewusste Aufruf in einem bereits beantworteten
Gespräch ist kein fairer Nachweis, dass Vintz grundsätzlich unpassende Antworten
auf offene Fragen erzeugt. Ein einzelnes Ergebnis ist keine Qualitätsmessung.

Der Entwurf wurde geleert. Danach wurde das gespeicherte `/versand`-Kürzel nur
zur Vorschau eingesetzt und wieder geleert. Nach Verlassen und erneutem Öffnen
war der Editor leer und der Sendeknopf deaktiviert. Keine neue ausgehende
Nachricht wurde erzeugt. Der konkrete Kontingentverbrauch wurde nicht gemessen.

### Welche Daten der sichtbare KI-Aufruf enthält

`POST /api/seller/message-draft` erhält im Haupteditor:

- geladene Nachrichten mit bereinigtem Text, Richtung, Nachrichtentyp und Zeit;
- den Artikeltitel aus dem Gespräch;
- die gewählte Arbeitsanweisung und fest `tone: friendly`;
- die abgeleitete Käufer-/Verkäuferrolle.

Der separate Vorschlagsbereich übergibt ähnliche Daten, im sichtbaren Aufruf
ohne Rolle. Angehängte Bilder, vollständige Artikeldetails, Einkaufskosten,
Mindestpreis und eine strukturierte Preisfreigabe sind in diesen Nutzlasten
nicht enthalten. Nachrichten können natürlich Preisangaben enthalten. Ob das
Backend zusätzlich Daten ergänzt, ist von außen nicht bewiesen.

**„Neu entwerfen“ ist im Haupteditor keine belegte Textverbesserung:** Der gerade
eingegebene Antworttext wird in diesem Aufruf nicht mitgeschickt. Ein neuer
Vorschlag ersetzt das Eingabefeld. Der separate „Einfügen“-Pfad hängt Vorschläge
an vorhandenen Text an. Flipbase sollte vorhandene Eingaben schützen und
„Antwort erzeugen“ und „meinen Text verbessern“ klar unterscheiden.

Der Code behandelt eine als Vorlage gekennzeichnete Ersatzantwort gesondert.
Modell, Modellanbieter, vollständige serverseitige Anweisungen und Wirksamkeit
aller Schutzregeln sind unbekannt. Keine auswählbaren Modelle, freie
Tonsteuerung, dedizierte Übersetzung oder freie Zusatzanweisung in der
untersuchten Postfachoberfläche nachgewiesen.

### Gespeicherte Antworten und Entwürfe

Im Test eine gespeicherte Antwort `/versand`. Tippen eines Kürzelanfangs öffnet
eine auswählbare Liste; Übernehmen setzt den Text nur in den Editor. Vollständiges
Kürzel mit Leerzeichen wird laut Quelllogik ebenfalls ersetzt.

Die Verwaltung erlaubt im Frontend höchstens 50 eindeutige Kürzel, bis 40 Zeichen
nach `/`, Antworttexte bis 2.000 Zeichen. Eine Verwaltung für dynamische
Platzhalter wurde hier nicht nachgewiesen.

**Antwortentwürfe sind bei Vintz serverseitig gespeichert.** Der Postfachzustand
liest `/api/seller/inbox-state`; Änderungen an Text, Gelesen- und Erledigtstand
werden mit Revisionsnummer über denselben Endpunkt gespeichert. Texte werden
nach etwa 500 ms gesammelt übertragen; bei Versionskonflikten sind begrenzte
Wiederholungen vorgesehen. Das ist von den browsergebundenen Entwürfen der
Angebotserstellung zu unterscheiden. Auch der Testentwurf und die eingesetzte
Schnellantwort unterlagen dieser automatischen Zwischenspeicherung, bevor sie
wieder geleert wurden. Keine Zusage einer rein lokalen Vorschau.

Flipbase hat im aktuellen Editor nur Text, Bild und Senden. Ein dauerhafter
Antwortentwurf je Gespräch fehlt im untersuchten Pfad; Kontextwechsel setzt
Text/Bild zurück. KI-Funktionen anderer Flipbase-Bereiche sind damit nicht
automatisch im Postfach verfügbar.

Belege: [Vollständiger Antworteditor](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L527),
[Komponentenabhängigkeiten](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L91),
[Kontextwechsel](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L319).

## Diktat, Bilder und Fitpics

Vintz zeigt Diktat nur bei verfügbarer Browser-Spracherkennung. Der Code verwendet
`SpeechRecognition` beziehungsweise `webkitSpeechRecognition`, Sprache aus dem
Browser und einen einzelnen Erkennungslauf. Erkannter Text wird an die Eingabe
angehängt; das ist keine Sprachnachricht. Kein Mikrofon aktiviert, keine Aussage
über Erkennungsqualität oder den tatsächlich verarbeitenden Sprachdienst.

Das Plusmenü bietet AI Fitpic mit sichtbarem Hinweis auf 20 Credits, gewöhnlichen
Bild-Upload ohne Credits, gespeicherte Fitpics und Kürzel. Die Fitpic-Liste war
leer. Die Oberfläche erklärt, dass ungesendete Fitpics auch beim Gesprächswechsel
oder Entfernen eines Marktplatzkontos verfügbar bleiben. Das ist ein Hinweis zur
Wiederherstellung, keine Prüfung von Löschfristen oder Datenhaltung.

Vintz akzeptiert im Frontend JPEG, PNG und WebP bis 7 MiB, mit Vorschau und
Entfernen vor dem Versand. Generierte Bilder haben einen getrennten
Wiederherstellungspfad. Kein Upload und keine Bildgenerierung ausgeführt; die
tatsächliche Anbieterannahme ist nicht geprüft.

Flipbase bietet JPEG/PNG, Vorschau, Entfernen und Verkleinerung auf höchstens
256 KiB bei maximal 1.600 Pixeln; Zielgröße ungefähr 0,25 MB. Der Bildversand ist
implementiert, seine sichere Bestätigung derzeit begrenzt. Oberfläche und
Ausführer behandeln das ausdrücklich als möglichen unklaren Ausgang. Die
größere Vintz-Uploadgrenze allein beweist keinen besseren Versand.

Belege: [Bildvorbereitung](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L572),
[Bildwarnung](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html#L572),
[Ausführer und Bestätigung](../../services/marketplace-worker/src/vinted-browser-messages.ts#L208).

## Allgemeine automatische Antworten

Vintz' Seite „Antwortregeln“ zeigte unverändert den Status **Entwurf**.

| Einstellung                     | Sichtbarer beziehungsweise geladener Stand                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Auslöser                        | Versandfrage oder jede neue Nachricht                                                                      |
| Konten                          | Auswahl der Serverkonten; leer bedeutet alle verwalteten Konten                                            |
| Wartezeit                       | Sofort, 5, 10, 30 oder 60 Minuten                                                                          |
| Verhalten während der Wartezeit | Laut Oberfläche nur antworten, wenn bis dahin niemand geantwortet hat                                      |
| Inhalt                          | Eine der gespeicherten festen Antworten                                                                    |
| Ausnahmen                       | Gesprächskennungen zeilenweise; Quellmodell höchstens 500                                                  |
| Zustand                         | Entwurf, aktiv oder pausiert                                                                               |
| Frequenz                        | Aktive Oberfläche nennt im Code höchstens einmal je Gespräch und Tag                                       |
| Betriebszustand                 | Frontend berücksichtigt gemeldete Liveverbindung und zeigt Ausfälle/Anmeldebedarf/Pausen als Einschränkung |

Keine freie KI-Generierung innerhalb dieser Regel nachgewiesen. Es ist im
gelesenen Modell eine einzelne allgemeine Regel mit einer gewählten Vorlage,
keine belegte Liste beliebig vieler priorisierter Antwortregeln.

Nichts gespeichert oder aktiviert. Deshalb bleiben tatsächliches Abbrechen bei
manueller Zwischenantwort, Tagesgrenze, Ruhezeit, Rückstände, Mehrfachereignisse
und Fehlerfälle des Servers ungeprüft. Die Versandzusage der Standardvorlage ist
nur ein Text; sie prüft nicht automatisch, wann der Verkäufer wirklich verschickt.

Flipbase hat im untersuchten Postfach keinen entsprechenden allgemeinen
Antwortregelpfad. Die vorhandenen Favoritennachrichten und Verhandlungsfolgen
sind eigenständige regelbasierte Funktionen, keine allgemeine KI-Antwortfunktion.
Siehe [separater Vergleich](vintz-price-offers-comparison.md).

## Versand und Live-Daten

Vintz trennt im Haupteditor Erzeugung und Versand. Cloudantworten werden über
kontogebundene Aufträge behandelt; das Frontend kennt wartende und fehlgeschlagene
Antworten. Aus dem geöffneten Editor wurde kein Versand ausgeführt. Interne
Zustellbestätigung, Wiederholschutz und Verhalten bei verlorenem Serverergebnis
lassen sich daraus nicht vollständig bewerten.

Flipbase hat im Quellcode getrennte Lese-/Sendefreigaben, passende Kontoidentität,
Warteschlange und Zustände für wartet, läuft, gesendet, fehlgeschlagen und unklar.
Bei verlorenem Annahmeergebnis bleibt dieselbe Anfragekennung erhalten. Vor
erneutem Senden eines unklaren Textes wird frisch nachgelesen. Ein tatsächlicher
Texterfolg braucht eine neue eigene Anbieternachricht mit passendem Text und
eindeutiger Nachrichtenkennung. Diese vorhandenen Eigenschaften sollten bei
einer späteren KI-Ergänzung erhalten bleiben.

Flipbases private Livebenachrichtigung meldet einen Import und lädt anschließend
den gespeicherten Stand. Dazu kommt eine 30-Sekunden-Kontrolle; die
Versandwarteschlange wird getrennt kontrolliert. Das ist keine direkte
Echtzeitverbindung von Vinted zum sichtbaren Chat. Vintz meldet eine eigene
Liveverbindung; ein aktueller Ende-zu-Ende-Vergleich mit neuer Nachricht fand
nicht statt.

Bewusstes Öffnen eines Gesprächs kann einen Anbieterabruf und damit einen
Gelesenstatus beeinflussen. Es wurden keine manuellen Gelesen-/Ungelesenaktionen
ausgeführt. Daraus folgt keine Garantie eines vollständig unveränderten
Lesestands bei beiden Produkten.

Belege: [Versandfreigaben](../../src/app/features/marketplaces/services/vinted-messaging.store.ts#L292),
[Anfragekennung](../../src/app/features/marketplaces/services/vinted-messaging.store.ts#L181),
[Prüfung vor Wiederholung](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts#L519),
[Bestätigter Textversand](../../services/marketplace-worker/src/vinted-browser-messages.ts#L219),
[Privater Importkanal](../../src/app/features/marketplaces/services/marketplace-api.service.ts#L79),
[Aktualisierung gespeicherter Daten](../../src/app/features/marketplaces/services/marketplace-account.store.ts#L174).

## Vergleich auf einen Blick

| Funktion                        | Vintz                                                        | Flipbase                                                               |
| ------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Basispostfach                   | Liste, Verlauf, Artikel, Bilder und Angebote                 | Vorhanden                                                              |
| Priorisierte Aufgaben           | Antwortbedarf, Probleme, Warten und nächste Aufgabe          | Keine entsprechende Aufgabenübersicht im untersuchten Pfad             |
| Themen und Status               | Viele direkte und zusätzliche Ansichten, Mustererkennung     | Weniger Filter; einfache Fragezeichenprüfung                           |
| KI-Entwurf                      | Vier Aufgaben, bearbeitbarer Vorschlag, ein Test erfolgreich | Nicht mit dem Postfach verbunden                                       |
| Eigenen Text verbessern         | Keine Übergabe der aktuellen Eingabe im Hauptaufruf          | Nicht vorhanden                                                        |
| Übersetzung/Modellwahl          | In untersuchter Oberfläche nicht nachgewiesen                | Nicht verbunden                                                        |
| Schnellantworten                | Verwaltung und `/Kürzel`                                     | Nicht im Postfach verbunden                                            |
| Antwortentwurf je Gespräch      | Serverzustand mit Revisionsnummer im Code                    | Beim Kontextwechsel zurückgesetzt                                      |
| Diktat                          | Browser-Spracherkennung, nicht getestet                      | Nicht verbunden                                                        |
| Allgemeine automatische Antwort | Feste Vorlage, Wartezeit, Konten, Ausnahmen                  | Kein entsprechender allgemeiner Pfad gefunden                          |
| Fitpic                          | Verbundener Bildgenerator und Wiederherstellung              | Keine entsprechende Funktion im Postfach                               |
| Versandkontrolle                | Auftragslogik sichtbar, nicht Ende zu Ende geprüft           | Vorhandene Freigaben, Wiederholprüfung und Anbieterbestätigung im Code |

## Empfehlungen zur Besprechung

Der Nutzer hat diese Punkte am 18.10.2026 als Richtung bestätigt. Das ist keine
Umsetzungs- oder Versandfreigabe. Es folgt die gesonderte Untersuchung der
[übrigen Automationen](vintz-other-automations-comparison.md), danach erneut Stopp.

1. **Zuerst Schnellantworten und gespeicherte Gesprächsentwürfe.** Häufige
   Antworten ohne KI abrufbar machen. Vorlagen vor Übernahme anzeigen und
   Platzhalter nur aus bestätigten Daten füllen. Bei Konto-/Gesprächswechsel
   Eingaben erhalten, Speicherfehler und Konflikte verständlich anzeigen.
2. **Manuelle KI-Hilfe im vorhandenen Antworteditor.** Freundlich antworten,
   Rückfrage, höflich ablehnen und eigenes Formulieren verbessern. Entwurf,
   bewusste Übernahme und Versand trennen; vorhandenen Text nicht still ersetzen.
   Nutzung und mögliche automatische Analyse vorab verständlich machen.
3. **Saubere Gesprächs- und Artikelfakten als Voraussetzung.** Richtung und
   zeitliche Reihenfolge berücksichtigen, bereits beantwortete Fragen erkennen,
   bestätigte Maße/Zustand nutzen. Fehlende Fakten als Rückfrage behandeln.
   Listenpreis, angenommener Preis und erlaubte Preisgrenzen unterscheiden.
4. **Aufgabenansichten ergänzen.** Offen, Warten, Erledigt und Probleme helfen
   mehr als zusätzliche beliebige Filter. Erkennung erklärbar und korrigierbar
   halten; ein freundlich beendetes Gespräch nicht unnötig wieder hochstufen.
5. **Allgemeine Vorlagenautomatik als eigenen späteren Schritt betrachten.**
   Prüfmodus, ausdrückliche Kontofreigabe, Verzögerung mit Abbruch nach manueller
   Antwort, Tagesgrenze, Ruhezeit, klare Ausnahmen und nachvollziehbares Protokoll.
   Vorlagen dürfen keine ungesicherten Versand- oder Preiszusagen machen.
6. **Vorhandene Flipbase-Versandabsicherung erhalten.** KI darf die Freigaben,
   Kontoidentität, Anfragekennungen und Behandlung unklarer Ergebnisse nicht
   umgehen. Insbesondere Bildbestätigung gesondert verbessern, bevor Bildhilfen
   als zuverlässiger automatischer Versand dargestellt werden.
7. **Diktat und Fitpics nach Nutzen priorisieren.** Diktat kann das Schreiben
   erleichtern. Fitpics sind ein eigener Bildprozess mit Kosten und Prüfung;
   im aktuellen Vergleich kein vorrangiger Ersatz für gute Textantworten.

Diese Punkte sind Vorschläge für die Besprechung, keine Umsetzungsvorgabe.

## Quellen und Bildschirmbelege

Liveoberflächen: [Vintz-Postfach](https://vintz.ai/inbox) und
[Antwortregeln](https://vintz.ai/inbox/rules). Keine öffentliche Werbequelle als
Funktionsbeweis verwendet. Bereits geladene Browsermodule gezielt gelesen:

| Datei unter `https://vintz.ai/_next/static/chunks/` | SHA-256 des UTF-8-Quelltexts                                       |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `0fq95l_un25qf.js`                                  | `f2b6f851d431ab7f3bad19a601a4e6901a14817b4117f5166677abb405ca2164` |
| `2f1_0oaecd10z.js`                                  | `a7972348b05bb8874d87d3c23def49b333369b07951c28229dd2685726e7ac34` |
| `0vjwd7fvap9iu.js`                                  | `1588b92fc130b6aa075a5c01a4b305a69126298956dae4500a606b8d042ba00b` |

Reihenfolge: Postfach/Composer/Entwurfsspeicherung; Antwortregelmodell und
Verwaltung; Themen- und Antwortbedarfserkennung.

Bildschirmbelege außerhalb des Repositorys:

- [Vier KI-Aufgaben](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-inbox-ai-draft-options.png).
- [Einzelner ungesendeter Entwurf](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-inbox-ai-draft-preview.png).
- [Antwortregeln im Entwurfszustand](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-inbox-reply-rules.png).

Vorhandene Flipbase-Testdefinitionen zu Filterung, Bildern, unklarem Versand,
Kontextwechsel und Leseposition wurden gelesen, nicht neu ausgeführt:
[Komponententests](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.angular.spec.ts),
[Browserfälle](../../e2e/vinted-inbox-experience.spec.ts).

## Abschluss

Vintz-Testentwurf und eingesetzte Schnellantwort wieder geleert; leerer Editor
mit deaktiviertem Sendeknopf bestätigt. Regeln bleiben Entwurf. Keine Nachricht,
keine Preisaktion, keine Regelaktivierung, kein Upload und kein Mikrofonzugriff.
Das nutzerseitig vorgemerkte Relisting blieb unberührt. Mobile Größe zurückgesetzt,
Flipbase wieder Marktplatzübersicht, Maike-Konto weiterhin pausiert.

Nur Dokumentation geändert. Markdown-Formatierung und Unterschiedskontrolle,
keine Anwendungstests erforderlich. **Stopp zur gemeinsamen Besprechung.**
