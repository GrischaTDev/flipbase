# Übrige Vintz-Automationen im Vergleich mit Flipbase

Untersuchung von Juna am 18.10.2026. Auftrag: Nach dem Postfach die übrigen
Automationen analysieren, mit Flipbase vergleichen und anschließend stoppen.
Keine Umsetzung, Aktivierung oder Ausführung. Die Postfachpunkte sind als
Richtung festgehalten, ohne Umsetzungs- oder Versandfreigabe.

## Ergebnis und Untersuchungsgrenzen

Vintz bündelt mehrere bislang in Flipbase nicht verbundene Abläufe: Kennzahlen
überwachen, öffentliche Preise regelbasiert senken, regelmäßig neu einstellen
und Schritte nach einem Verkauf. Die gemeinsame Übersicht, verständliche
Zusammenfassung und Protokolle sind unabhängig vom grafischen Editor wertvoll.

Flipbase hat bereits automatische Kontoabgleiche mit Fehlerbehandlung und eine
Nachrichtenfolge nach bestätigtem Kauf. Ein allgemeiner Vinted-Regelbaukasten,
Versandetikett-/Abholablauf oder regelmäßiges Vinted-Relisting wurde im
untersuchten Code nicht gefunden. Ein vollständiger Neubau aller Grundlagen
ist deshalb ebenso wenig begründet wie die Behauptung, alle Funktionen seien
schon vorhanden.

| Belegart                  | Umfang                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live                | Prozugang, ein Cloudkonto; Übersicht, Vorlagen, Satzeditor-Menüs, Verkaufsablauf, Auto-Relist, Kennzahlenentwurf, Zeitpläne, Filter, Ruhezeit und Protokoll |
| Weitere Vintz-Oberflächen | Angebotsvorgaben und separater Konkurrenz-Monitor mit Auto-Block nur gelesen                                                                                |
| Vintz Frontend            | Bereits geladene Module, Datenmodelle, Validierungen, Speicher-/Aufrufpfade und lokale Speicherzuordnung                                                    |
| Flipbase                  | Lokale Quellen bei `e3ef736370640125c1abddcaf82de6079205d9fa`, zuvor dokumentierte Live-Befunde nur als ältere Befunde                                      |
| Nicht ausgeführt          | Speichern/Aktivieren einer Regel, Probelauf, Versand, Preisänderung, Relisting, Etikettenanforderung, Scan, Blockierung und KI-Satzerzeugung                |

Der Flipbase-Browsertab war in diesem Schritt anderweitig belegt und wurde
nicht übernommen. Keine neue produktive Flipbase-Funktionsprüfung behaupten.
Keine Aussage zur tatsächlichen Vintz-Erfolgsquote, vollständigen
Servervalidierung oder Langzeitstabilität aus einer sichtbaren Maske ableiten.

Bereits untersuchte Bereiche werden nur eingeordnet:
[Preisangebote und Favoriten](vintz-price-offers-comparison.md),
[Postfachantworten](vintz-inbox-ai-comparison.md),
[manuelles Neueinstellen](vintz-relisting-comparison.md),
[neue Angebote und Terminierung](vintz-listing-creation-comparison.md).

## Übersicht, Vorlagen und Satzeditor

Die zentrale Automationsseite zeigte unverändert zwei Einträge:

| Eintrag            | Angezeigte Vorgabe                                                  | Gespeicherter Betriebszustand in der Übersicht |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| Nach einem Verkauf | Etikett, Dank nach 5 Minuten, Abholhinweis, Erinnerung nach 3 Tagen | Nicht aktiv, noch nicht gelaufen               |
| Auto-Relist        | Nach 3 Tagen online, bis 10 Angebote pro Tag, 18–21 Uhr             | Nicht aktiv, noch nicht gelaufen               |

Die Übersicht gruppiert beide unter „Pausiert“, während die Datenmodelle
zusätzlich einen Entwurfszustand kennen. Null aktive Abläufe und null
Protokolleinträge sind bestätigt. Das bedeutet nicht, dass sämtliche anderen
Vintz-Vorgaben aus wären: Kopienausblendung und automatischer Upload waren
in den separaten Einstellungen bereits eingeschaltet und blieben unverändert.

Übersicht und Editor bündeln Konto, Zustand, Zeitplan, letzten/nächsten Lauf
und Aktivität. Vorlagen:

1. Weniger als 50 Aufrufe nach 24 Stunden melden.
2. Erreichen von 100 Aufrufen melden.
3. Erreichen von 10 Favoriten melden.
4. Nach Favorisierung eine Nachricht zur Prüfung vorbereiten.
5. Verkaufsschritte abwickeln.
6. Automatisch neu einstellen.

Der geführte Satzeditor bietet zunächst „Push senden“ oder „Nachricht
vorbereiten“, dazu sechs Ereignisse: wenige/viele Aufrufe, Favoritenschwelle,
einzelne Favorisierung, Verkauf und Angebotsalter. Zeitwörter: sofort, nach einem
Tag, drei Tagen oder einer Woche. Der erweiterte Editor bietet anschließend
mehr Einstellungen und zusätzliche Aktionen.

„Selbst schreiben“ ist ein weiterer Einstieg. Im gelesenen Code gibt es eine
begrenzte lokale Erkennung von Verkaufssätzen und ansonsten einen Aufruf an
`/api/seller/automation-rules/ai-draft` mit Satz und Sprache. Das Ergebnis wird
in vorhandene Regeltypen überführt; eine Ersatzinterpretation aus Schlüsselwörtern
ist vorgesehen. Kein Nachweis beliebiger frei programmierbarer Arbeitsabläufe,
Webhooks oder Fremdsystemintegration. Kein KI-Satz wurde abgeschickt.

Die Oberfläche sieht wie ein Bausteinsystem aus, besitzt aber je Regeltyp feste
Fähigkeiten. Kennzahlenregeln verwenden im gelesenen Modell einen Hauptauslöser,
zusätzliche Bedingungen, Filter, Zeitbezug und eine gewählte Fachaktion.
Bausteine aus anderen Regeltypen sind teilweise gesperrt oder verlangen eine
neue Automatisierung. Verschieben einer Karte ist nicht automatisch ein
Nachweis beliebiger Ausführungsreihenfolge oder Verzweigung.

## Kennzahlenregeln und öffentliche Preisaktionen

Eine Vorlage „Langsame Angebote erkennen“ wurde als **ungespeicherter lokaler
Entwurf** geöffnet. Dort wurden Preisaktion, Zeitplan und leerer Filterbaustein
nur zur Ansicht geändert, anschließend vollständig verworfen. Die Oberfläche
bestätigte das Verwerfen; danach wieder genau die ursprünglichen zwei Einträge.

| Baustein            | Möglichkeiten                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Signal              | Aufrufe, Favoritenanzahl, Preis, Alter in Stunden, Angebotsstatus                                                |
| Vergleich           | Unter/über, kleiner/größer oder gleich, gleich/ungleich im Modell                                                |
| Zusätzliche Signale | Bis vier weitere Bedingungen im Modell; alle müssen zutreffen                                                    |
| Artikelfilter       | Titel enthält, Marke, Größe, Mindest-/Höchstpreis, Status; Filter gemeinsam erforderlich                         |
| Wartebezug          | In der geöffneten Vorlage ein Tag seit bestätigter Veröffentlichung; Modell kennt auch erstes Erfassen           |
| Wiederholung        | Einmal pro Angebot, erneuter Wechsel zu zutreffend oder erneut nach Abkühlzeit bei weiter zutreffender Bedingung |
| Pushtext            | Titel und Text mit `{{listing.title}}`, `{{rule.name}}`, `{{metric.value}}`                                      |
| Konto               | Bewusste Auswahl der überwachten Konten; fehlende oder nicht mehr verfügbare Ziele werden im Client beanstandet  |

Zeitpläne: jede Hintergrundprüfung laut UI ungefähr alle fünf Minuten, festes
Intervall, täglich zur Uhrzeit oder zufällig innerhalb eines Intervalls.
Täglicher Zeitplan zeigt die Zeitzone, hier Europe/Berlin. Zufallsvorgaben
umfassen 1–3, 3–6, 6–12 und 12–24 Stunden sowie benutzerdefinierte Werte.
Das Modell begrenzt benutzerdefinierte Intervalle auf 15 Minuten bis sieben Tage.
Dies sind Einstellungsmöglichkeiten, keine gemessenen Ausführungstakte.

Die drei Kennzahlenaktionen:

| Aktion         | Sichtbare beziehungsweise geladene Wirkung                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Push           | Benachrichtigung an die Vintz-iPhone-App mit eingeschalteten Benachrichtigungen; Zustellung nicht getestet   |
| Preis senken   | Öffentlichen Angebotspreis prozentual senken und Push melden; optionaler Mindestpreis; nur verwaltete Konten |
| Neu einstellen | Ersatz erzeugen und prüfen, bevor das Original entfernt wird, plus Push; nur verwaltete Konten               |

**Öffentliche Preisabsenkung ist ein zusätzlicher Ablauf.** Sie ist kein
privates Rabattangebot an einen einzelnen Käufer. Der lokale Preisentwurf
zeigte 5 Prozent und einen optionalen Mindestpreis. Laut Erklärung wird eine
Absenkung unter die Grenze übersprungen; wiederholte Läufe können erneut
reduzieren. Das Modell nennt 1–50 Prozent und höchstens 20 Aktionen pro
Synchronisierung. Diese Grenze ist ein Clientkonstanten-Befund, kein Nachweis
der vollständigen Serverdurchsetzung.

Preisplatzhalter werden in der Zusammenfassung auf die Artikelwährung bezogen;
das Mindestpreisfeld zeigt hier Euro. Währungsübergreifende Berechnung blieb
ungeprüft. Ebenfalls ungeprüft: gleichzeitige Regeln, kumulative Preisgrenzen,
geänderte Preise zwischen Planung und Ausführung und die tatsächliche
Bestätigung einer Preisänderung.

**Es gibt keinen belegten allgemeinen Prüfmodus für alle Aktionen.** Ein
ungespeicherter Entwurf ist noch kein Testlauf. Der bekannte Prüfmodus für
Favoritennachrichten darf nicht auf Preis-/Relistingregeln übertragen werden.
Neue Kennzahlenentwürfe haben im Client zunächst `enabled: true`; die
Einstellungsseite kann deshalb „an“ zeigen, obwohl oben „noch nicht gespeichert“
steht. Bewusstes Speichern kann den Ablauf aktivieren.

## Nach einem Verkauf

Der bestehende nicht aktive Verkaufsablauf wurde mit seinen vier Schritten,
Einstellungen und leerer Aktivitätsanzeige geöffnet. Kein Schalter und kein
Nachrichtentext wurde verändert.

| Schritt                  | Möglichkeiten und erklärte Absicherung                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Versandetikett anfordern | Mit gespeicherter Absenderadresse; laut Oberfläche bleibt das Etikett mit Käuferadresse auf Vinted und wird nicht bei Vintz gespeichert |
| Käufer bedanken          | Einmal im Bestellchat; sofort oder nach 5/10/30/60 Minuten; bis 2.000 Zeichen, `{{item}}` als Variable                                  |
| Paketankunft melden      | Wenn Vinted das Paket am Abholpunkt meldet; bei unbekanntem Status laut Oberfläche keine Nachricht                                      |
| Einmal erinnern          | Nach 1/2/3/4/5/7 Tagen; entfällt laut Erklärung nach Abholung; setzt im Modell den Abholhinweis voraus                                  |

Verkäufe sollen bei einer Kontoprüfung erkannt werden. Die Einstellungszusammenfassung
beschränkt den Ablauf auf **nach dem Einschalten verkaufte Artikel**; vorherige
Verkäufe werden nicht einfach rückwirkend verarbeitet. Leere Kontoauswahl heißt
alle Serverkonten. Das Modell kennt zusätzlich eine ausdrücklich gewählte
Browsererweiterung; mit diesem Cloudkonto wurde nur der Serverfall betrachtet.

Die Schritte sind optionale Teile einer festen Konfiguration. Die vier
angehakten Schrittschalter bedeuten nicht, dass der übergeordnete Ablauf läuft.
Die englischen Schalternamen beschreiben teilweise die Ausschaltaktion,
während `checked` den eingeschalteten Einzelschritt anzeigt. Das muss zusammen
mit dem übergeordneten Pausiert-/Entwurfszustand gelesen werden.

Im Frontend werden Fähigkeiten für Etiketten und Nachrichten getrennt geprüft.
Ein gespeicherter Ablauf kann wegen abgeschaltetem Serverbetrieb, fehlendem
Worker, fehlender Anmeldung oder fehlender Einzelfähigkeit trotzdem nicht laufen.
Die lokale Versandstatuszuordnung kennt unbekannte Zustände und mehrere
Sprachmuster. Daraus folgt keine verifizierte internationale Erkennungsqualität.

**Offen:** Sichere Definition eines tatsächlich bezahlten Verkaufs, Aufteilung
von Bundles, stornierte Käufe, gleichzeitige manuelle Etikettenanforderung,
Adressfehler, Statuswechsel während einer Wartezeit und Schutz vor doppelter
Dankes-/Abholnachricht. Die Aussagen „einmal“ und „keine alten Verkäufe“ wurden
nicht durch einen aktivierten Ablauf getestet. Auch die Aussage zur
Nicht-Speicherung von Adressdaten bleibt eine Produktbeschreibung, keine
vollständige Prüfung des Serververkehrs oder der Datenhaltung.

**Ergänzung aus der anschließenden [Versandanalyse](vintz-orders-shipping-comparison.md):**
Der manuelle Cloud-Labelpfad sieht ausdrücklich Speicherung und Dateiausgabe
über Vintz vor. Die Beschreibung dieses Automationsschritts ist daher keine
allgemeine Zusicherung für alle Labelabläufe. Tatsächliche Speicherung und
Aufbewahrung wurden nicht mit einem Käuferlabel getestet.

## Regelmäßiges Auto-Relist

Das ist vom einzelnen manuellen Relistingauftrag und von der Terminierung
einer neuen Veröffentlichung zu unterscheiden. Alle sechs Einstellungsseiten
wurden ohne Änderung oder Speichern gelesen.

| Einstellung     | Angebotene Möglichkeiten                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Fälligkeit      | 1/2/3/4/5/7/10/14/21/30 Tage seit Onlinegang; neues Listing beginnt bei null                                       |
| Tagesmenge      | 1/2/3/5/10/15/20/30/50 je Konto und Tag; die ältesten Angebote zuerst, Rest wartet laut Erklärung auf nächsten Tag |
| Zeitfenster     | Frei wählbare Uhrzeiten, mindestens 30 Minuten laut Modell; Vorgaben morgens/mittags/abends/spätabends             |
| Verteilung      | Laut Erklärung innerhalb des Fensters und mindestens drei Minuten Abstand                                          |
| Zeitzone        | Hier Europe/Berlin; Überlappung mit Ruhezeit wird berücksichtigt beziehungsweise angezeigt                         |
| Artikelumfang   | Alle aktiven oder nur ausdrücklich markierte Artikel; einzelne Ausschlüsse möglich                                 |
| Favoritenschutz | Angebote mit Favoriten überspringen; Erklärung: Aufrufe und Favoriten beginnen beim Neueinstellen bei null         |
| Neue Uploads    | Vorgabe, ob der Auto-Relist-Schalter bei neuen Veröffentlichungen an ist                                           |
| Konten          | Serverkonten; „alle“ schließt laut Oberfläche später hinzugefügte Konten ein                                       |
| Strategie       | Direkt: erst neu veröffentlichen, dann alt entfernen; Nahtlos als Beta: Entwurf, alt entfernen, veröffentlichen    |

Das Altersmodell normalisiert intern bis 60 Tage, die sichtbare Auswahl endet
bei 30. Beides ist nicht als identisches sichtbares Limit auszugeben.

**Bedienfalle bestätigt:** Die Übersicht zeigte Auto-Relist nicht aktiv. Beim
Öffnen zeigte der lokale Dialog trotzdem „An“ und ein nächstes Zeitfenster.
Der gelesene Initialisierungscode setzt einen bisherigen Entwurf bei verfügbarer
Funktion im Dialog auf aktiv. Erst Speichern überträgt diese Vorgabe. Ohne
Speichern geschlossen; abschließend weiterhin null aktive Einträge. Das ist
kein Nachweis einer ungewollten bereits ausgeführten Aktivierung.

Der Speicherpfad meldet bei Abschalten die Anzahl zurückgezogener wartender
Relistings. Das belegt eine vorgesehene Reaktion, keine hier getestete
Stornierungswirkung. Der schon vom Nutzer vorgemerkte einzelne Mares-Auftrag
wurde weder geprüft, verändert noch abgebrochen.

Offen bleiben sichere Veröffentlichung/Entfernung, Verlust von Favoriten,
Angebotszuordnung nach Ersatz, abgebrochene Beta-Schritte, parallele Regeln und
Wiederherstellung bei unklarem Ausgang. Die Beschreibung einer Ersatzprüfung
ersetzt keinen Anbieterbeleg.

## Andere Einstellungen und separater Auto-Block

### Kopien nach Verkauf ausblenden

In den automatisch speichernden Angebotsvorgaben war diese Option bereits an.
Die Erklärung bezieht sich auf denselben Artikel auf mehreren Konten und warnt
vor Verwendung bei mehrfach vorhandenem Bestand. Nichts geändert.

Im bereits geladenen Erstellungsmodul wird bei Mehrkonto-Veröffentlichung eine
ausdrückliche Kopiengruppe mit Kennung und `hideOnSale` mitgegeben. Das ist ein
Beleg für geplante Zuordnung von Kopien, nicht für eine universelle zuverlässige
Erkennung aller ähnlichen vorhandenen Angebote. Tatsächliches Ausblenden nach
Verkauf, Freigabe von Konten und Verhalten bei Storno sind nicht geprüft.

### Keine-Aufrufe-Hinweis

Vorgabe drei Tage, Wertebereich im Client 1–365. Sie soll schwache Angebote in
der Liste markieren. Das ist weder ein automatisch gesendeter Push noch eine
automatische Preisänderung oder ein Relisting. Die gleichartige Kennzahlenvorlage
im Automationsbereich ist ein anderer Ablauf. Voll-/Halbautomatik und Uploadvorgabe
in den Einstellungen beziehen sich teilweise weiterhin ausdrücklich auf die
Erweiterung; ihre Wirkung auf alle Cloudautomatiken ist nicht belegt.

### Konkurrenz-Monitor

Separater Funktionsbereich, kein weiterer Baustein der zentralen Regeltypen.
Die Automatik „Auto-Block“ war aus. Nur Erklärung und Einstellungsdialog gelesen;
kein Scan, kein KI-Analyseauftrag und keine Blockierung.

Die Oberfläche nennt maximal 24 Verkäufer pro Scan und 96 Angebote je
Kleiderschrank. Verlauf und Auto-Block-Vorgaben liegen laut Erklärung und
Clientcode lokal in diesem Browser, je Vinted-Konto. Der Scan verlangt eine
offene Seite; kein belegter zeitgesteuerter Cloud-Dauerlauf.

Auto-Block kann während eines gestarteten Scans ohne Einzelrückfrage blockieren.
Schätzwert 50–100 Prozent, geladene Vorgabe 85 Prozent. Der Client verlangt
zusätzlich eine aktuelle KI-Bewertung, noch offene Prüfung, fremden Verkäufer
und noch nicht blockierten Zustand. Bei Blockierung prüft er Konto, Domain,
Verkäuferkennung und bestätigten Blockierzeitpunkt. Kein echter Blockiertest.

Die allgemeine Erklärung „Du entscheidest über jede Blockierung“ passt nur zum
manuellen Modus; der Auto-Block-Dialog erklärt ausdrücklich die Einzelwirkung
ohne Rückfrage und das mögliche Irren der KI. Für Flipbase kein vorrangiges
Übernahmeziel. Eine entsprechende Funktion wurde in den Vinted-Frontend-,
Worker-, Erweiterungs- und Funktionsquellen nicht gefunden.

## Ruhezeit, Protokolle und technische Aufteilung

Gemeinsame Ruhezeit 00:00–08:00 unverändert an. Die Erklärung verspricht nachts
keine Prüfungen und Nachholen am Morgen. Das ist mehr als ein bloßer
Nachrichtenversandstopp. Genaue Geltung für jeden Spezialpfad, verpasste
Zeitfenster, Prioritäten und Reihenfolge am Morgen wurden nicht ausgeführt.

Das zentrale Protokoll war leer. Sichtbare Filter: alle, Prüfungen,
Benachrichtigungen und Nachrichten; Relistingfilter wird im Client abhängig
von vorhandenen Einträgen eingeblendet. Das Frontend kennt geprüft, bereit zur
Freigabe, geplant und Fehler sowie Zuordnung zu Regel, Konto und Zeit.
Kein Nachweis, dass jeder Serverfehler lückenlos protokolliert wird.

Die gemeinsame Oberfläche fasst mehrere getrennte Konfigurationen zusammen:

| Frontend-Schnittstelle               | Verantwortung                             |
| ------------------------------------ | ----------------------------------------- |
| `/api/seller/automation-rules`       | Allgemeine Kennzahlenregeln               |
| `/api/seller/sale-automations`       | Fester Verkaufsablauf und Einzelschritte  |
| `/api/seller/auto-relist`            | Wiederkehrendes Relisting und Wartestatus |
| `/api/seller/automation-quiet-hours` | Gemeinsame Ruhezeit                       |
| `/api/seller/favorite-automations`   | Bereits untersuchte Favoritenabläufe      |

Für einzelne Browserabläufe kennt der Client „sicher vor Schreibaktion
gescheitert“ und bietet bedarfsabhängig erneutes Ausführen. Daraus keine
allgemeine sichere Wiederholung aller Cloudaktionen ableiten. Die internen
Serverabläufe sind nicht mit ausgeliefertem Frontendcode gleichzusetzen.

## Was Flipbase bereits hat und was fehlt

| Bereich                                  | Befund im untersuchten Flipbase-Stand                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cloud-Kontosync                          | Ausführbarer kontoweiser Zeitplan, Pause/Fortsetzen, Zustände und Fehlerbehandlung                              |
| Bestätigter Kauf                         | Tatsächlich angebundene Nachrichtenfolge nach Zahlungsbeleg, unabhängig von automatischer Verhandlung schaltbar |
| Verkauf importieren                      | Kontogebundene Lesekopie, keine vollständige automatische Warenwirtschaftsbuchung                               |
| Etikett/Abholhinweis/Abholerinnerung     | Kein entsprechender allgemeiner Vinted-Ereignisablauf gefunden                                                  |
| Regelmäßiges Vinted-Relisting            | Kein fertiger Ausführungspfad; einzelne Veröffentlichungstermine sind etwas anderes                             |
| Kennzahlenabhängiger Preisnachlass/Push  | Kein entsprechender angebundener Regelablauf gefunden                                                           |
| Kopien bei externem Verkauf entfernen    | Kein entsprechender Vinted-Ausführer gefunden                                                                   |
| Bewertungen                              | Lesen und neue Bewertungen melden; kein automatisches Abgeben/Antworten gefunden                                |
| Gemeinsamer Baukasten/Ruhezeit/Protokoll | Nicht vorhanden im untersuchten Pfad; feste Featureseiten und eigene Verläufe                                   |

**Cloud-Sync ist keine fehlende Grundlage.** Neue bestätigte Cloudkonten bekommen
einen aktiven 15-Minuten-Standardzeitplan; eine vorhandene Pause oder individueller
Abstand wird nicht überschrieben. Wählbar sind 3/5/10/15/30/60 Minuten, soweit der
laufende Server sie freigibt. Verpasste Abrufe werden zusammengefasst, doppelte
offene Abrufe vermieden und Browserzugriffe reserviert.

Nach Netzwerk-/Serverfehlern wird zunächst 30, dann 60 Minuten gewartet;
der dritte Folgefehler stoppt. Bestimmte Rechte-, Schutzprüfungs- oder
Bereinigungsfehler pausieren direkt. Die lokale Erweiterung besitzt getrennte
Postfach-/Favoritenprüfungen und Auftragsabholung, benötigt aber laufenden Browser
und passende Bindung. Das ist kein Ersatz für eine vollständige lokale
Verkaufssynchronisierung.

**Dankesnachricht nicht neu erfinden:** Der vorhandene Kauf-Auslöser in der
Verhandlungsinfrastruktur kann nach exakt zugeordnetem Zahlungsbeleg eine
Nachrichtenfolge planen. Diesen Baustein fachlich aus dem Preisverhandlungsbild
heraus verständlich anbieten, statt einen unabhängigen doppelten Versandweg
anzulegen. Versand- und Abholereignisse fehlen dadurch weiterhin.

**Verkauf und Lager sauber trennen:** Der gelesene Vinted-Import übernimmt
im konkreten Extraktor nur passende Transaktionen mit Status „Versendet“ als
`sale` in `marketplace_account_entries`. Er schreibt nicht automatisch einen
zentralen Verkauf mit Verkaufspositionen und Lagerabgang. Ein älterer interner
Trigger, der nach einem intern gebuchten Verkauf interne Inserate beendet,
löscht oder reserviert kein externes Vinted-Angebot.

**Bewertungen nicht verwechseln:** Flipbases „Automatische Bewertungen“ sind
erhaltene Vinted-Systembewertungen. Neue importierte Bewertungen erzeugen
Meldungen; das ist kein Bewertungsversand. Auch im untersuchten Vintz-Vorlagen-,
Baustein- und Verkaufsmodell wurde keine eigene Bewertungsautomatik angeboten.
Das ist eine begrenzte Suche, kein Beweis globaler Abwesenheit.

## Empfehlungen zur Besprechung

1. **Gemeinsame Übersicht zuerst.** Bestehende Automatikfunktionen mit Konto,
   aktiv/pausiert, Voraussetzungen, letzter/nächster Ausführung und verständlichem
   Ergebnis zusammenführen. Dafür ist noch kein großer grafischer Editor nötig.
2. **Kennzahlenhinweise als erste neue Regelart.** Wenige Aufrufe nach belegtem
   Onlinegang oder Favoritenschwelle erkennen und zunächst nur informieren.
   Datenalter und unbekannte Veröffentlichungszeit kenntlich machen.
3. **Verkaufsablauf schrittweise ergänzen.** Bestätigten Kauf wiederverwenden,
   Versand-/Abholereignisse belastbar zuordnen, doppelte Nachrichten verhindern.
   Keine unbelegten Versandversprechen aus Standardvorlagen übernehmen.
4. **Auto-Relist als eigenes größeres Vorhaben.** Altersbeleg, Tagesquote,
   Zeitfenster, Favoritenschutz, gezielte Artikelwahl, sichere Ersatzprüfung und
   erreichbares Stornieren vorsehen. Das bekannte manuelle Relisting ist noch
   keine Freigabe für einen dauernden Zyklus.
5. **Öffentliche Preisautomatik getrennt planen.** Mindestpreise, Gesamtgrenze
   über Wiederholungen und konkurrierende Regeln, Prüfmodus und Bestätigung des
   tatsächlichen Anbieterpreises. Kein stilles wiederholtes Heruntersetzen.
6. **Kopienausblendung an echte Bestandszuordnung binden.** Gleiche Ware und
   mehrfach vorhandene Stücke unterscheiden; Storno und Teilfehler berücksichtigen.
   Dafür muss auch die zentrale Verkauf-/Lagerzuordnung verlässlich sein.
7. **Aktivierung und Stopp eindeutiger gestalten.** Ein neuer lokaler Entwurf
   soll nicht wie ein bereits laufender Prozess aussehen. Ruhezeit, Ausfall,
   Nachholen und endgültiger Stopp müssen erkennbar unterschiedliche Zustände sein.
8. **Konkurrenz-Monitor ausgeschlossen.** Der Nutzer hat diesen Bereich am
   18.10.2026 ausdrücklich aus der weiteren Analyse und Übernahme gestrichen.
   Die vorangegangenen Beobachtungen bleiben als historischer Befund erhalten.

Diese Empfehlungen werden zur gemeinsamen Besprechung festgehalten. Keine
Umsetzungsfreigabe daraus ableiten.

## Quellen und Bildschirmbelege

Vintz live: [Automationen](https://vintz.ai/automations),
[Angebotsvorgaben](https://vintz.ai/settings),
[Konkurrenz-Monitor](https://vintz.ai/blocker).
Gezielt geladene Module untersucht, keine fremden Quelltexte im Repository gespeichert:

| Datei unter `https://vintz.ai/_next/static/chunks/` | SHA-256 des UTF-8-Quelltexts                                       |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `2oj4qgz94r4-o.js`                                  | `01597b3c16ed55af5cf2fd515665b723a51dec6abf6f45fe931a9c90018129c5` |
| `1_f4nrn8dk85w.js`                                  | `afb0096092b9134d56062053e0365fbc4db35229ad5bf61b8df8c1a58f240fe6` |
| `2cjn1m-e122cd.js`                                  | `3422fb853a5957f49307d9bf83a69046a62348977b6fdc9df6404d590edccb46` |
| `195z8-dyqny2h.js`                                  | `50fa90454fcbb70719488a9beb8243174be8ceb0c9836c5aa65e6a2127e453de` |
| `2e55v10sy1ulg.js`                                  | `15f699b04dd35fbe506b78a185a1bb290c398390e488ff3cba85ac1b7bf318d5` |
| `108hdokc4vt2i.js`                                  | `67626cb04b66cf9620cacaec067781f0084e1f10a24aa8e3f1ed12d3fdb2ad27` |
| `35s2kcd72n1je.js`                                  | `62017905bc08bb0c995cc3598efbc8835297eb649c2faa75856112ea34800b1a` |

Reihenfolge: zentrale Bedienung/Speicherpfade; Verkaufs-/Kennzahlen-/Satzmodelle;
Auto-Relist-Modell; Beschreibungen/Validierung; Angebotsvorgaben;
Konkurrenz-Monitor; Auto-Block-Bedingungen. Kopienzuordnung zusätzlich aus dem
bereits im [Erstellungsbericht](vintz-listing-creation-comparison.md) identifizierten
Modul `2162wxv65d-ws.js`.

Flipbase-Belege:

- [Feste Automatiknavigation](../../src/app/core/config/vinted-workspace-navigation.ts#L37).
- [Standardzeitplan nach Kontobestätigung](../../supabase/schemas/265_marketplace_account_verification.sql#L73),
  [Sync-Intervalle](../../src/app/features/marketplaces/models/marketplace-sync-schedule.ts#L4),
  [Bündelung und Reservierung](../../supabase/schemas/310_marketplace_sync_scheduling.sql#L163),
  [Fehlerstrategie](../../supabase/schemas/310_marketplace_sync_scheduling.sql#L307).
- [Bestätigter Kauf](../../src/app/features/marketplaces/components/vinted-negotiation/vinted-negotiation.component.ts#L160),
  [Planung der Kaufnachrichten](../../supabase/schemas/426_marketplace_negotiation.sql#L375).
- [Vinted-Verkaufsextraktor](../../services/marketplace-worker/src/vinted-account-import.ts#L675),
  [Kontolesekopie statt zentraler Verkaufsbuchung](../../supabase/schemas/360_beta_business_access.sql#L6319),
  [Interne Inseratbeendigung](../../supabase/schemas/230_listings.sql#L393).
- [Lokale Verkaufsgrenze](../../src/app/features/marketplaces/components/vinted-account-content/vinted-account-content.component.html#L15),
  [Lokaler Scheduler](../../tools/flipbase-extension/vinted-local-scheduler.js).
- [Lesende Bewertungen](../../src/app/features/marketplaces/components/vinted-feedback-list/vinted-feedback-list.component.ts#L33),
  [Bewertungsmeldungen](../../supabase/schemas/420_marketplace_feedback_notifications.sql#L32).

Negative Flipbase-Befunde beziehen sich auf Vinted-Frontend/Core, relevante
Verkaufs-/Lager-/Versandfunktionen, Marketplace-Worker, Erweiterung,
Serverfunktionen und deklarative Schemas. Vorhandene passende Testdefinitionen
wurden gelesen, keine neuen Produktiv- oder Testläufe ausgeführt.

Bildschirmbelege außerhalb des Repositorys:

- [Übersicht: null aktiv](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-other-automations-overview.png).
- [Verkaufsablauf](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-other-automations-sale.png).
- [Ungespeicherte Auto-Relist-Vorgabe](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-other-automations-auto-relist.png).
- [Ungespeicherter Kennzahlen-/Preisregelentwurf, danach verworfen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-other-automations-price-rule.png).

## Abschluss

Kein Speichern/Aktivieren/Ausführen einer Regel und keine externe Fachaktion.
Lokalen Kennzahlenentwurf vollständig verworfen, Auto-Relist abgebrochen,
Einstellungen nur gelesen, Auto-Block aus belassen. Abschließend ursprüngliche
Vintz-Automationsübersicht mit zwei Einträgen, null aktiv, zwei im Pausiert-Filter,
keinen Läufen und unveränderter Ruhezeit. Keine Flipbase-Kontoeinstellung
bedient und nutzerseitigen Relistingauftrag unberührt gelassen.

Nur Dokumentation geändert. Markdown-Formatierung und Unterschiedskontrolle
geprüft, keine Anwendungstests erforderlich. **Stopp zur gemeinsamen Besprechung.**
