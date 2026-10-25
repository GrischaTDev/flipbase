# Neue Angebote bei Vintz erstellen: Vergleich mit Flipbase

Untersuchung von Juna am 17.10.2026. Auftrag: Neue Angebotserstellung bei Vintz
analysieren, mit Flipbase vergleichen und anschließend stoppen. Keine Umsetzung,
keine Veröffentlichung. Empfehlungen zu Preisangeboten als Richtung festgehalten.

## Ergebnis und Beleggrenzen

Vintz hat bei der unmittelbaren Erfassung mehr integrierte Hilfen: drei Schritte,
laufende Vorschau, Fotoerkennung, Text- und Preisvorschläge, Maßablesung,
Handy-Übergabe und Gruppierung mehrerer Artikel. Flipbase hat einen vorhandenen
Veröffentlichungsweg mit zentralen Entwürfen, Vorlagen, Versionsprüfung und
ausdrücklicher Prüfung des gespeicherten Inhalts. Diese Vorteile sollten bei
einer späteren Vereinfachung erhalten bleiben.

Die Belege sind unterschiedlich tief:

| Bereich                          | Tatsächlich geprüft                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Vintz-Einstieg                   | Leere Erstellungsseite, Vorschau, Schrittanzeige und Fehlermeldung beim Fortfahren ohne Foto live                 |
| Vintz-Sammelerfassung            | Leere Maske mit 60-Foto-Hinweis geöffnet und geschlossen                                                          |
| Vintz mobil                      | Einstiegsseite bei 390 × 844 CSS-Pixeln, anschließend Originalgröße wiederhergestellt                             |
| Vintz-Details/Prüfung            | Im geladenen Browsercode gelesen; ohne Foto sind diese Schritte live gesperrt                                     |
| Vintz-KI und Upload              | Aufrufpfade gelesen, keine Bilder ausgewählt, hochgeladen oder generiert                                          |
| Flipbase                         | Leeren Editor mit Konto Maike Vintage, Vorlagenbereich und Kategoriebaum live gelesen; weitere Logik im Quellcode |
| Veröffentlichung beider Produkte | Nicht ausgeführt; keine Aussage über heutige Erfolgsquote oder vollständige Anbieterkompatibilität                |

Keine künstlichen Artikeldaten eingegeben, kein neuer interner oder nativer
Entwurf gespeichert, keine Telefonübergabe gestartet, kein KI-/Preisaufruf und
kein Veröffentlichungsauftrag ausgelöst. Der vom Nutzer bereits vorgemerkte
Relisting-Auftrag bleibt unberührt. Flipbases Vergleichskonto bleibt pausiert.

Lokaler Flipbase-Stand: `e3ef736370640125c1abddcaf82de6079205d9fa`.
Produktivoberfläche und lokaler Quellcode bleiben unterschiedliche Belegarten;
die ausgelieferte Commitkennung wurde nicht neu ermittelt. Keine vollständige
AXE-, Kontrast-, Tastatur- oder Browsermatrixprüfung.

## Vintz: Einstieg und Führung

Angebote → „Neues Angebot“ öffnet `/listings/new`. Sichtbar sind:

1. Fotos hinzufügen.
2. Angebotsdetails.
3. Dein Angebot prüfen.

Die letzten beiden Schritte sind ohne Foto gesperrt. „Weiter“ bleibt im ersten
Schritt bedienbar, zeigt ohne Foto aber ausdrücklich „Füge mindestens ein
Artikelfoto hinzu, um fortzufahren“. Es wird nicht still weitergeschaltet.

Am Desktop steht daneben eine **Live-Vinted-Vorschau**. Titel, Preis, Marke,
Zustand, Größe und Beschreibung sind direkt in dieser Vorschau bearbeitbar.
Anfangszustand: null von 20 Fotos, Zustand „Sehr gut“, übrige Artikeldaten leer.
„Speichern & schließen“ und ein Link zu den Angebotsstandards sind präsent.

In der mobilen Stichprobe rücken Fotografieren und Galerie in den Vordergrund;
die ausführliche Desktop-Vorschau wird im ersten Schritt nicht daneben gezeigt.
Schrittanzeige und Speichern/Weiter bleiben sichtbar. Die Kamera wurde nicht
gestartet, keine Geräteberechtigung angefragt. Das ist eine Layoutprobe,
kein vollständiger mobiler Erstellungsdurchlauf.

## Vintz: Fotos aufnehmen, ordnen und bearbeiten

### Auswahl und Formate

Die Oberfläche nennt maximal 20 Fotos für einen Artikel. Im gelesenen
Auswahlcode zugelassen: JPEG, PNG, WebP, AVIF sowie HEIC/HEIF. Leere Dateien,
unbekannte Formate und Überschreitung der verbleibenden Bildanzahl erzeugen
Dateihinweise. HEIC/HEIF wird im Browser in JPEG umgewandelt; der Code prüft
anschließend die JPEG-Kennung. Keine tatsächliche Formatkonvertierung getestet.

Eine allgemeine maximale Größe jeder Originaldatei wurde im untersuchten
Auswahlvalidator nicht gefunden. Größen für Analysebilder und spätere
Veröffentlichung sind davon getrennt. Eine irgendwo im KI-Uploadcode genannte
Größe darf deshalb nicht als einheitliche Grenze aller Artikelfotos gelten.

Bereits die Auswahl der ersten Fotos kann automatische Foto-/Textanalyse
auslösen. Dafür gibt es im Client nicht zwingend einen zweiten ausdrücklichen
Generierungsklick. Deshalb wurden für diese Untersuchung keine Fotos gewählt.

### Handy-Fotos zum Desktop

„Fotos vom Handy“ ist am Desktop sichtbar. Gelesener Ablauf:

- Kurzlebige Übergabesitzung über `/api/seller/listing-handoff` anfordern.
- QR-Code beziehungsweise Link mit vom Server gemeldetem Ablaufzeitpunkt.
- Desktop fragt ungefähr alle zwei Sekunden neue Fotos ab und übernimmt sie
  einmalig in die aktuelle Auswahl.
- Beim Abschließen ist ein letzter Abruf vorgesehen; beim Schließen wird das
  Löschen der Übergabesitzung angefragt.

Keine Sitzung gestartet, kein QR-Code und kein Zugriffscode gespeichert.
Tatsächliche Berechtigungsgrenzen, maximale Laufzeit und Uploadverhalten des
Handys wurden nicht verifiziert.

### Bilder im fertigen Artikel

Im gelieferten Erstellungsmodul vorhanden: Bildreihenfolge und Titelbildwahl,
Metadatenentfernung für ein oder alle Fotos, Bildstudioanbindung sowie
KI-Bildbearbeitung mit Original-/KI-Herkunft. Änderungen wirken auf die
Vorschau. Der Veröffentlichungsinhalt besitzt eine ausdrückliche
KI-Fotodeklaration; diese Checkbox ist keine eigene Generierungsfunktion.

Die Bildwerkzeuge wurden in diesem Schritt ohne Foto nicht ausgeführt. Der
Client kennt Credit-/Tarifgrenzen; Kosten, derzeitige Aktionen und Bildqualität
wurden nicht bestimmt. Die im vorherigen Relisting-Bericht festgestellte
deaktivierte automatische Foto-Versionsfunktion darf nicht durch Beschriftungen
wie „New version per account“ als heute funktionierend ausgegeben werden.

## Vintz: mehrere Artikel vorbereiten

Der sichtbare Einstieg „Mehrere Artikel? Fotos automatisch in Entwürfe sortieren“
öffnet eine eigene Maske:

- Bis zu 60 Fotos mehrerer Artikel.
- „In Artikel sortieren“ ohne Fotos deaktiviert.
- Laut Beschreibung ein Entwurf pro erkanntem Artikel.

Der gelesene Code fordert zur Gruppierung `/api/seller/listing-groups` an.
Er prüft die Gruppenzuordnung, ergänzt unzugeordnete Bilder und erlaubt
manuelles Verschieben. Bei nicht verfügbarer KI fällt er auf manuelle
Gruppierung zurück und zeigt den Grund. Sortieren startet erst mit mehreren
Fotos. Das ist keine bewiesene Erkennungsqualität und noch keine gemeinsame
Veröffentlichung mehrerer Artikel.

Gespeicherte Gruppen werden anschließend als lokale Entwürfe weiterbearbeitet.
Kein Bild gewählt, keine Gruppierung ausgelöst und kein solcher Entwurf angelegt.

## Vintz: Details und Erfassungshilfen

Dieser Abschnitt ist **Codebefund**, kein mit ausgefülltem Fotoartikel live
abgeschlossener Schritt.

### Aktuelle Kategorie- und Anbieterangaben

Der Editor kombiniert Kategoriebaum, Markensuche und aktuelle Felder für das
gewählte Konto und die Kategorie. Dafür gibt es Katalogabfragen und
vorbereitende Metadatenaufträge. Der Browser lädt bei Bedarf deren Ergebnis
nach; die aktuelle Feldstruktur ist Voraussetzung für die automatische
Veröffentlichung. Bei fehlenden Daten verweist der Ablauf auf erneutes Laden
oder manuelle Übergabe, statt erfolgreiche Vollständigkeit zu behaupten.

Vorgesehene Angaben umfassen Titel, Beschreibung, Preis, Kategorie/Zielgruppe,
Marke, Größe, Zustand, Farben, Material und Paketgröße. Der Code rendert auch
aktuell gelieferte Zusatzattribute und enthält kategorietypische Eingaben wie
ISBN und Speicher. Maße können mit eigenen Feldern erfasst und umgeordnet
werden. Keine vollständige Liste aller heute unterstützten Vinted-Kategorien
oder Sondermerkmale getestet.

Gelesene Textprüfung: Titel 5–100, Beschreibung 5–2000 Zeichen. Europreis
im geladenen Clientmodell 1–30.000 Euro mit maximal zwei Nachkommastellen.
Das sind Clientgrenzen dieses Stands, keine unabhängig verifizierten aktuellen
Vinted-Plattformregeln. Maße werden als Zahlen zwischen 0,01 und 500 cm geprüft.

Es gibt gespeicherte Angebotsstandards, kontobezogenen Schreibstil und optionale
interne Artikelnummern/SKU. Favorisierte Kategorien und das Speichern von
Standardwerten haben eigene Schreibaktionen; diese wurden nicht bedient.

### KI-Vorschläge mit Prüfung

| Hilfe                           | Gelieferter Clientpfad und Grenze                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Artikelerkennung                | Bis zu acht Fotos, bevorzugt Originale, verkleinert an `/api/seller/listing-facts`; erwartet Antwortquelle `vision`                     |
| Titel/Beschreibung              | `/api/seller/listing-copy` mit Fotos oder Analyse und bestätigten Angaben; bei fehlender KI einfache Textvorlage möglich                |
| Überarbeitung vorhandener Texte | Vorgeschlagene Änderungen zum Vergleichen; veränderte Nutzereingaben werden über Änderungszähler geschützt                              |
| Preisrecherche                  | Bis zu drei Fotos sowie Artikeldaten an `/api/seller/pricing`; vorgeschlagener Preis und Vergleichsbelege mit Herkunft/Links vorgesehen |
| Maße aus Foto                   | `/api/seller/listing-measure`; Foto mit gut sichtbarem Maßband, danach ausdrücklicher Hinweis zum Prüfen                                |
| Bildbearbeitung                 | In den Erstellungseditor eingebundenes Bildstudio und KI-Herkunft; nicht ausgeführt                                                     |

Der Code kann Vorschläge in noch leere Felder übernehmen. Bei bewusster
Textüberarbeitung vorhandener Inhalte ist eine Vergleichsprüfung vorgesehen.
Die Preisrecherche kann einen vorgeschlagenen Preis übernehmen, wenn das
Preisfeld noch leer ist. „Aktualisiert sich“ heißt hier nicht, dass jeder Wert
bereits vom Nutzer bestätigt oder fachlich korrekt ist.

Ein Fortschrittsbereich unterscheidet Analyse, Pflichtangaben und Textstand;
Überspringen beziehungsweise Wiederholen sind vorgesehen. Konkretes Modell,
Anbieterqualität, Erkennungsfehler, Vergleichsangebot-Güte und tatsächlicher
Creditverbrauch bleiben ohne KI-Aufruf offen. Ein Vergleichspreis ist kein
belegter tatsächlich erzielter Verkaufspreis.

## Vintz: Entwürfe und Verlassen

„Speichern“ sichert im untersuchten Pfad Felder und Bilddateien in
**IndexedDB des jeweiligen Browsers**, nach angemeldetem Nutzer getrennt.
Das ist ein interner Vintz-Entwurf auf diesem Gerät, kein Cloud-Entwurf und kein
nativer Vinted-Entwurf. Browserwechsel, Gerätewechsel und Löschen lokaler
Browserdaten sind daher wesentlich für die Verfügbarkeit. Keine zusätzliche
Cloudsynchronisierung dieser Entwürfe im gelesenen Speicherpfad gefunden.

Explizites Speichern, Aktualisieren eines vorhandenen Entwurfs und eine
Verlassenswarnung mit Weiterbearbeiten/Verwerfen/Speichern sind vorhanden.
Eine allgemeine laufende automatische Entwurfssicherung wurde nicht belegt.
Bei Teilannahme einer Veröffentlichung kann der Client den verbleibenden Stand
zusammen mit bereits angenommenen Zielkonten als lokalen Entwurf sichern.

Die Bezeichnung „Entwurf“ unterscheidet sich damit von den zuvor untersuchten
Beta-Entwurfsstrategien beim Relisting. Beide Vorgänge dürfen nicht gleichgesetzt
werden.

## Vintz: Abschlussarten, Konten und Termine

Im gelesenen letzten Schritt vorgesehen:

| Abschluss         | Inhalt                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| Automatisch       | Für ausgewählte verwaltete Konten oder verfügbares verbundenes Browserkonto beauftragen |
| Manuelle Übergabe | Text/Fotos zum Kopieren/Herunterladen und Vinted öffnen; Nutzer stellt selbst fertig    |
| Entwurf speichern | Nur lokalen internen Entwurf sichern                                                    |

Eine gesonderte Veröffentlichungsprüfung zeigt ausgewählte Konten und erlaubt
deren Texte und Bilder vor dem Absenden zu prüfen. Mehrere Zielkonten,
kontoweise Texte/Stile und Preise sind im Client vorgesehen. Bei verschiedenen
Landeswährungen wird eine Umrechnung angefragt oder eine manuelle lokale
Preisangabe verlangt. Nur ein Cloudkonto war im Zugang verfügbar; diese
Mehrkonto-/Währungsabläufe wurden nicht ausgeführt.

Der Erstellungs-Terminvalidator erlaubt mindestens eine Minute Vorlauf und
höchstens **30 Tage**. Das unterscheidet sich von den 14 Tagen beim zuvor
untersuchten Relisting. Die Maske zeigt die Browserzeitzone. Geplante
Veröffentlichung verlangt verwaltete Konten, ein Browserkonto muss abgewählt
sein. Eine ausdrückliche Auswahl für doppelte Uhrzeiten oder verpasste Termine
wurde im Erstellungs-Codepfad nicht gefunden.

Bei mehreren Kopien sind eine Zuordnung und „weitere Kopien nach Verkauf
ausblenden“ vorgesehen. Eine bestehende Auto-Relist-Vorgabe kann im Abschluss
ebenfalls einbezogen werden. Das sind eigenständige Wirkungen, deren Serverlauf
hier nicht verifiziert oder aktiviert wurde.

**Kontingentdetail aus dem Code:** Im manuellen Übergabepfad wird ein
Listing-Kontingent bereits vor dem Öffnen Vinteds als verwendet bestätigt.
Das ist noch kein Nachweis, dass der Nutzer anschließend erfolgreich
veröffentlicht hat. Tatsächliche Abrechnung und Anzeige wurden nicht getestet.

## Vintz: Annahme, Teilfehler und unklarer Ausgang

Verwaltete Konten werden je Zielkonto über
`POST /api/seller/multi-accounts/listings` mit Anfragekennung, Artikeldaten,
Bildern, Zielpreis und gegebenenfalls Termin beauftragt. `queued`, `running`
und `succeeded` gelten im Client als angenommene Ziele. Die Meldung „gesendet“
bestätigt deshalb nicht zwangsläufig die veröffentlichte neue Vinted-Kennung.

Der Browser verarbeitet Zielkonten nacheinander, hält Teilfehler getrennt und
merkt bereits angenommene Konten, damit sie nicht einfach nochmals ausgewählt
werden. Für den Browser-/Erweiterungsweg ist ein ausdrücklich unklarer
Veröffentlichungsausgang vorgesehen, der weitere blinde Versuche blockiert.
Dauerhafter serverseitiger Wiederholschutz, sichere Anbieterbestätigung und
Neustart nach Teilerfolg sind ohne tatsächlichen Ausführungsfall nicht
abschließend beurteilt.

Die Veröffentlichung kann an Tarifkontingent, Kontoverbindung, fehlenden
aktuellen Anbieterfeldern, unvollständigem Zieltext oder Preis scheitern.
Der Entwurf beziehungsweise die aktuelle lokale Arbeit bleibt laut Fehlerpfad
zur weiteren Bearbeitung bestehen. Kein solcher Fall wurde durch einen echten
Anbieterauftrag provoziert.

## Flipbase: bestehende Erstellung

### Live gelesene Oberfläche

Vinted → „Inserat erstellen“ öffnet eine eigene Formularseite. Live sichtbar:
„Noch kein Entwurf angelegt“, leere Titel-/Beschreibungsfelder, null Bilder,
Kategorie und Artikelangaben, Zielkonto Maike Vintage, Verkaufspreis sowie
Vorlagen. Speichern und Veröffentlichungsvorbereitung waren beim leeren
Formular deaktiviert.

Die Kategorieauswahl zeigt einen Baum mit Hauptbereichen. Ohne Auswahl wurde
sie wieder geschlossen. Aktuelle Vinted-Angaben verlangen eine Kategorie und
ein verbundenes Cloudkonto; die Maike-Verbindung blieb pausiert. Keine Felder
ausgefüllt, keine Bilder gewählt und keine Vorlage gespeichert.

### Vorhandene Bausteine im Code

- Zentral gespeicherte, versionierte Entwürfe mit privaten Bildern und
  zeitbegrenzten Vorschaulinks. Nicht auf IndexedDB eines Browsers begrenzt.
- Bildreihenfolge per Ziehen/Touch und beschrifteten Pfeilen; Titelbildstern,
  Entfernen, Zuschneiden und 90-Grad-Drehung.
- JPEG/PNG/WebP; Clientgrenze 50 MB je internem Entwurfsbild.
- Bewusst bearbeitete Bilder werden als JPEG mit maximal 1200 Pixeln Kantenlänge
  und Zielgröße 0,35 MB verarbeitet. Unveränderte Bilder werden im untersuchten
  Uploadpfad nicht automatisch entsprechend komprimiert.
- Kategoriebaum, aktuelle Vinted-Feldauswahl und Markensuche. Freitext ist für
  Vorbereitung möglich, ersetzt aber keine bestätigte Anbieterkennung.
- Größe, Zustand, Paketgröße, bis zwei Farben und drei Materialien; veraltete
  IDs werden bei passenden Inhalts-/Kategorieänderungen verworfen.
- Unbekannte Pflichtfelder oder nicht unterstützte Kategorien blockieren
  Veröffentlichung, statt lediglich geschätzte Werte zu senden. Noch keine
  generische Erfassung sämtlicher kategorietypischer Zusatzattribute.
- Vorlagen mit gezielt auswählbaren Inhaltsfeldern, Platzhaltern und
  Vergleichsvorschau. Fotos und Konto sind nicht Bestandteil einer Vorlage.
- Ausdrückliches Speichern, Warnung beim Verlassen und Behandlung von
  Versionskonflikten; fehlgeschlagenes Speichern erhält Texte.

**Konkrete Bedienungsdiskrepanz:** Der interne Editor erlaubt bis zu 100 Bilder,
der gemeinsame Veröffentlichungsvalidator dagegen nur 1–20. Eine spätere
Anpassung sollte die Arbeitsgrenze bereits im Editor verständlich machen.
Die 100 Bilder sind keine bewiesene Vinted-Veröffentlichungskapazität.

Keine Fotoerkennung, KI-Textgenerierung, Preisrecherche, Maßablesung aus Fotos,
Handy-QR-Übergabe oder Foto-Gruppierung mehrerer Artikel im gelesenen
Vinted-Erstellungseditor verkabelt gefunden. Eine KI-Fotocheckbox in der
Veröffentlichungsprüfung deklariert lediglich die Herkunft.

### Veröffentlichung und Grenzen

„Veröffentlichung vorbereiten“ speichert gegebenenfalls Änderungen und prüft
den gespeicherten Stand. Vorschau mit festem Konto, Texten, Preis, Merkmalen und
Bilderreihenfolge; sofort oder Einzeltermin mit ausdrücklicher Zeitzone,
Zeitumstellungsbehandlung und Regel für verpasste Termine.

Im aktuellen Erstellungseditor ist dieser Weg auf verbundenes Cloudkonto,
bestätigte Identität und zusätzliche Serverfreigabe begrenzt. Vorhandene lokale
Auftragstypen beweisen keinen freigeschalteten lokalen Editorweg. Die gesamte
Vinted-Funktion besitzt außerdem derzeit einen Betreiberzugang; sie darf nicht
als allgemein für alle Kunden freigegeben dargestellt werden.

Der Ausführer verwendet eine eigene Seite, prüft Konto und Freigabe erneut,
übernimmt die Bilder, sendet einmal und bestätigt danach neue Angebotskennung,
Inhalt, Bilder und aktiven Zustand. Die Zusatzoption Bump muss aus sein;
eine umfassende Kontrolle sämtlicher denkbarer Gebühren ist damit nicht belegt.
Identische Anfragen bleiben beim selben Auftrag. Ein unklarer Ausgang führt
zu `outcome_unknown`, ohne automatische zweite Veröffentlichung.

Native Vinted-Entwürfe sind weiterhin **nicht unterstützt**: Der Typ existiert,
der tatsächliche Ausführer lehnt ihn ausdrücklich ab. Interne Flipbase-Entwürfe
sind davon getrennt. Keine neue Veröffentlichung oder Anbieterbestätigung in
dieser Sitzung getestet.

## Direkter Vergleich

| Bereich                 | Vintz, untersuchter Stand                                       | Flipbase, untersuchter Stand                                                |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Führung                 | Fotos → Details → Prüfen, laufende bearbeitbare Vorschau        | Formular mit getrenntem Speichern und späterer Veröffentlichungsprüfung     |
| Bildergrenze            | 20 bereits am Einstieg                                          | Intern 100, Veröffentlichung 20: uneinheitlich                              |
| Formate                 | Zusätzlich AVIF und lokale HEIC/HEIF-Konvertierung im Code      | JPEG/PNG/WebP im internen Uploadpfad                                        |
| Entwürfe                | Lokaler Browserspeicher                                         | Zentral und versioniert mit privaten Bildern                                |
| Wiederverwendung        | Angebotsstandards und kontoweiser Stil                          | Explizite Inhaltsvorlagen mit Platzhaltern und Vergleich                    |
| KI-Erfassung            | Foto-, Text-, Preis- und Maßhilfen verbunden                    | Nicht in diesem Editor verbunden                                            |
| Viele Artikel           | Foto-Gruppierung zu mehreren Entwürfen vorgesehen               | Einzelner Entwurf pro Erstellungsablauf                                     |
| Handy/Computer          | QR-Übergabe im Code, mobiler Kamerastart sichtbar               | Kein entsprechender Übergabepfad im untersuchten Editor                     |
| Aktuelle Anbieterfelder | Konten-/kategorieabhängig, dynamische Zusatzfelder vorgesehen   | Aktuelle Auswahl für unterstützte Angaben, unbekannte Pflichtfelder sperren |
| Konten/Währungen        | Mehrkonto- und lokale Preisprüfung im Code                      | Ein festes Zielkonto, EUR im Veröffentlichungsmodell                        |
| Termin                  | Cloud, bis 30 Tage, Browserzeitzone                             | Cloud im Editor, ausdrückliche Zeitzone und Ausfallregel                    |
| Ergebnis                | Auftragsannahme und tatsächliche Veröffentlichung unterscheiden | Auftragsstatus plus Prüfung des konkreten Anbieterergebnisses im Ausführer  |

## Empfehlungen zur Besprechung

Der Nutzer hat diese Punkte im nächsten Schritt als Richtung bestätigt. Das ist
keine Freigabe zur Umsetzung oder Veröffentlichung. Die Untersuchung wird mit
[Postfach und KI-Antworten](vintz-inbox-ai-comparison.md) fortgesetzt.

1. **Geführte Erfassung mit laufender Vorschau planen.** Fotos, bestätigte
   Artikeldaten und Abschluss verständlich trennen. Vorhandene gemeinsame
   Flipbase-Komponenten und Gestaltungsregeln erhalten.
2. **Zentrale Entwürfe, Vorlagen und Versionsschutz beibehalten.** Vintz'
   browsergebundene Entwurfsablage ist hierfür kein Vorbild. Speichern,
   Vorbereitung, Auftrag und bestätigte Veröffentlichung klar unterscheiden.
3. **Bildgrenze früh vereinheitlichen.** Schon beim Hinzufügen die tatsächliche
   Veröffentlichungsgrenze erklären; Formatkonvertierung und Verarbeitung großer
   Dateien mit aussagekräftigen Fehlern erwägen. Nicht ungefragt alle Originale
   ersetzen oder stärker komprimieren.
4. **KI-Hilfen mit kontrollierter Übernahme ergänzen.** Zunächst Fotoerkennung
   und Textvorschläge priorisieren, vorhandene Eingaben schützen und unbestätigte
   Vorschläge sichtbar lassen. Kosten und automatischen Analysebeginn vorab
   erklären. Preisschätzung mit nachvollziehbaren Belegen getrennt bewerten.
5. **Handy-Fotos und Sammelerfassung als eigene spätere Schritte betrachten.**
   Geräteübergreifender Upload und Gruppierung helfen bei größerem Bestand,
   brauchen aber eigene Grenzen, Prüfung und sichere Zuordnung.
6. **Zusatzfelder und Maße nach tatsächlichem Bedarf erweitern.** Aktuelle
   Anbieterwerte und Fehlerbehandlung erhalten; ein aus dem Foto vermuteter
   Wert ist keine bestätigte Größe, Marke oder Maßangabe.
7. **Mehrkonto-Veröffentlichung und Folgeautomatiken gesondert planen.**
   Je Konto Preis/Inhalt und Teilresultat prüfen. Kopienausblendung und
   Auto-Relisting sind zusätzliche Entscheidungen mit eigener Wirkung.

Offen bleiben die Qualität der Vintz-KI, tatsächliche Dateigrenzen beim
Anbieter, heutige Ausführung aller Sonderkategorien, Speicherung/Fehler bei
Telefonübergabe und Ende-zu-Ende-Veröffentlichung. Der vollständige zweite und
dritte Vintz-Schritt wurde ohne Bild nicht live abgeschlossen. Ein späterer
Foto- oder Veröffentlichungstest müsste ausdrücklich abgestimmt werden.

## Quellen und Bildschirmbelege

Vintz live: `https://vintz.ai/listings/new`. Bereits geladene Browsermodule
gezielt gelesen, fremde Quelltexte nicht in das Repository übernommen:

| URL unter `https://vintz.ai/_next/static/chunks/` | SHA-256 des UTF-8-Quelltexts                                       |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `2162wxv65d-ws.js`                                | `b050537ed9634d5d6ce6c6da95e64aafd19fafb275feb7468dade4b193029142` |
| `1aochbqhp2yqk.js`                                | `d1017d36853cf0bd64c4ecb2ceff4c11c19b6c5be338cab2114ce7a4f11810eb` |
| `1thvl_iffmkcm.js`                                | `4756295840fb014613ae8adb4aca490646cc09198158c5e5a6b419412b9de72d` |
| `2be85nvndtyhu.js`                                | `879b4309014e67788b796d2b4f9c8e000e8daa127ab3627dca203dba69bbf5f7` |

Reihenfolge: Erstellungs-/Prüfablauf und Handyübergabe; Bildformate und
Gruppierung; lokale Entwurfsablage; Text-/Preis-/Fotogrenzen.

Flipbase-Belege:

- [Editor](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.html)
  und [Speichern/Prüfung](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts).
- [Bildspeicherung](../../src/app/features/marketplaces/services/vinted-listing-image.service.ts),
  [Bildbedienung](../../src/app/shared/components/listing-image-editor/listing-image-editor.component.html),
  [Bearbeitung](../../src/app/shared/components/image-cropper-modal/image-cropper-modal.component.ts).
- [Aktuelle Anbieterangaben](../../src/app/features/marketplaces/components/vinted-listing-fields-dialog/vinted-listing-fields-dialog.component.ts),
  [Markensuche](../../src/app/features/marketplaces/components/vinted-listing-brand-dialog/vinted-listing-brand-dialog.component.ts),
  [Vorlagen](../../src/app/features/marketplaces/components/vinted-listing-template-panel/vinted-listing-template-panel.component.html).
- [Veröffentlichungsgrenzen](../../tools/flipbase-extension/vinted-listing-runtime.js),
  [Vorschau und Kontofreigabe](../../src/app/features/marketplaces/components/vinted-listing-publication-preview/vinted-listing-publication-preview.component.ts),
  [Tatsächlicher Ausführer](../../services/marketplace-worker/src/vinted-browser-listing-submit.ts).
- [Vorhandene Editortests](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.angular.spec.ts)
  und [Ausführertests](../../services/marketplace-worker/test/browser/vinted-listing-submit.browser.test.ts).
  Nur gelesen, keine neuen Testläufe für diese Dokumentationsanalyse.

Bildschirmbelege außerhalb des Repositorys:

- [Vintz-Einstieg und Vorschau](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-create-listing-start.png).
- [Vintz-Sammelerfassung ohne Bilder](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-create-listing-batch.png).
- [Vintz-Einstieg mobil](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-create-listing-mobile.png).
- [Flipbase-Erstellungseditor](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-create-listing-start.png).

## Abschluss

Leere Erstellungsseiten verlassen, keine Inhalte oder Bilder hinzugefügt und
keinen Entwurf gespeichert. Vintz zurück in der aktiven Angebotsliste für
Maike Vintage, Flipbase zurück in der Marktplatzübersicht. Verbindung bleibt
pausiert, temporäre Mobilgröße zurückgesetzt. Nur Dokumentation;
Markdown-Formatierung und Unterschiedskontrolle, keine Anwendungstests nötig.

**Stopp zur Besprechung.** Empfehlungen sind keine Umsetzungsfreigabe.
