# Vintz: Bildstudio und Galerie im Vergleich mit Flipbase

Untersuchung von Juna am 18.10.2026. Die Finanzpunkte bleiben als Richtung
festgehalten. Freigegeben ist ausschließlich dieser Analyseblock, danach Stopp.
Keine Umsetzung, Bildgenerierung, Übernahme in Angebote oder Veröffentlichung.

## Ergebnis und Untersuchungsgrenzen

Vintz besitzt ein eigenständiges KI-Bildstudio mit geführten Arbeitsschritten,
Vorlagen, Stapelaufträgen und gespeicherten Ergebnissen. Flipbase besitzt bereits
einen umfangreichen lokalen Bildoptimierer und gespeicherte Artikelgalerien.
Was dort fehlt, ist die Verbindung dieser Abläufe und eine tatsächlich
angebundene generative Bildbearbeitung.

| Belegart                  | Tatsächlich untersucht                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vintz live                | Alle sechs Werkzeugeinstiege; Try-on-Fotoeingabe, Hintergrund-/Flatlay-/Upscale-/Produktbildvarianten, leere Produktbild-Stapeleingabe, Prompt-/Communityansicht, Galerie mit drei bestehenden Ergebnissen und null eigenen Modelvorlagen. |
| Vintz ausgelieferter Code | Vorbereitung/Upload, Generierungs-/Stapelaufträge, Wiederaufnahme, Kosten, Promptbibliothek, Galerie, Downloadpfade und Angebotsübernahme. Kein Zugriff auf die Serverimplementierung oder den Bildanbieter.                               |
| Flipbase live             | Leerer Einstieg des Bildoptimierers, Plattformauswahl und Beschreibung im separaten Lesetab. Keine Bilder importiert und keine Bildbearbeitung ausprobiert.                                                                                |
| Flipbase Quellen          | HEAD `e3ef736370640125c1abddcaf82de6079205d9fa`: lokaler Optimierer, Metadaten, Export, Medienablage und Angebotsbilder.                                                                                                                   |
| Nicht ausgeführt          | Upload, Generierung, kostenpflichtige Bereinigung, Guthabenkauf, Prompt speichern/veröffentlichen, Fehlermeldung versenden, Löschen oder Übernahme eines Bildes in ein Angebot.                                                            |

Kein Qualitäts-, Zeit-, Erfolgsquoten- oder Kostenbenchmark. Die drei alten
Ergebnisse belegen vorhandene Historie; sie ersetzen keinen Vergleich zwischen
Original, Auftrag und Ergebnis. Beispielbilder auf Werkzeugkarten ebenfalls
nicht als aktuelle eigene Testergebnisse bewerten.

## Vintz: sechs Werkzeuge und ihre Eingaben

Einstieg [Bildstudio](https://vintz.ai/dashboard). Vier geführte Schritte, je nach
Werkzeug anders benannt: Werkzeug → Stil/Prompt/Kleidung → Fotos/Model/Artikel →
Prüfen und Generieren. Ohne nötige Bilder beziehungsweise Prompt bleibt Weiter
deaktiviert. Diese Sperre wurde nicht umgangen.

| Werkzeug                       | Live sichtbare Optionen                                                                                                                                                                                        | Grenze                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace Try-on             | Auto, nur Oberteil, nur Hose, ganzes Set; bis zu drei Kleidungs-/Setfotos. Oberteil-Fits u. a. original, slim, locker, oversized, boxy; Hosen-Fits u. a. original, straight, skinny, bootcut, baggy, wide leg. | Modelwahl und Abschluss ohne Foto nicht erreicht. Fitänderung kann den dargestellten Schnitt verändern; keine Garantie unveränderter Produkteigenschaften.                |
| Bulk-Produktbilder             | Jacken/Pullover, Jogginghosen/Jeans, Jeans hinten, Trainingsanzüge; leere Stapeleingabe **0/30**, bis zu 30 Fotos.                                                                                             | Einheitliches Ergebnis und richtige Kategoriezuordnung nicht getestet.                                                                                                    |
| Custom                         | Promptname, bis 6.000 Zeichen, eigene Bibliothek, Community und Suche.                                                                                                                                         | Nichts eingegeben, verwendet, gespeichert oder geteilt. Die Community zeigte einen Eintrag mit zugleich angezeigtem Privat-Hinweis; dessen Herkunft/Rechte nicht geprüft. |
| Flatlay                        | Beton-Einzelteil, kompletter Trainingsanzug, zwei Trainingsanzüge im V-Layout, Trainingsanzug-Bündel, Jeans-Fächer. Je nach Stil ein Hauptfoto plus bis zu acht angezeigte Referenzen.                         | Die fünf Varianten sind konkrete Anordnungen, kein frei getesteter allgemeiner Szeneneditor.                                                                              |
| Hintergrund entfernen/ersetzen | Reinweiß, weicher Studioverlauf, transparenter Freisteller, eigene Hintergrundreferenz; letzte Variante zeigt zwei Fotos.                                                                                      | Kein tatsächlich transparenter Export oder korrekter Freisteller getestet.                                                                                                |
| Upscaler & Bügeln              | Nur Upscale; Bügeln + Upscale.                                                                                                                                                                                 | Keine verifizierte Auflösungsverbesserung oder bewahrte Stoffstruktur. Glätten kann die Darstellung des Zustands verändern.                                               |

„Original beibehalten“ ist bei den gesehenen Fitfeldern die Voreinstellung.
Die Oberfläche verspricht, Farbe, Material und Details aus Produktfotos zu
übernehmen. Diese inhaltliche Treue wurde nicht praktisch geprüft.

Der Code sieht Modelvorlagen nach eigene/alle/Männer/Frauen, eigene Referenzbilder
und gespeicherte Vorlagen vor. Die Modelauswahl wurde ohne Kleidungsupload nicht
live vollständig erreicht. Es gibt außerdem Verhältniswerte 1:1, 3:4, 4:5 und
9:16 im Code; die gesehenen Hintergrund-/Produktbildvarianten verwendeten 1:1,
Flatlay 3:4. Kein Nachweis, dass jedes Werkzeug jedes Verhältnis frei anbietet.

## Einzel-, Stapel- und Wiederholungsabläufe

Neben Einzeln/Bulk besitzt Bulk-Produktbilder einen eigenen Stapeleinstieg.
Der Code unterscheidet einzelne Produktfotos und Artikelgruppen mit mehreren
Referenzen. Für Gruppen sind Varianten, Fitvorgaben und Model-/Promptbezug
vorgesehen. Ein vorhandener Zugang kann mehrere aktive Vinted-Angebote auswählen
und ihre Fotos in Gruppen übernehmen; die Codepfade für Browser- und Cloudkonto
sind getrennt. Dieser Import wurde nicht ausgelöst.

Die Ergebnisdarstellung ordnet Bilder wieder dem jeweiligen Artikel zu, zeigt
Gesamtfortschritt und kann mehrere Ausgaben je Artikel darstellen. Im Code gibt
es queued/running sowie completed, completed_with_errors, failed und cancelled.
Fehlgeschlagene Aufträge haben Wiederholen-, laufende Aufträge Abbruchzugänge.
Ein Teilfehler ist damit ein eigener Zustand. Tatsächliche Rückerstattung,
Abbruchwirkung und sichere Wiederholung nicht getestet.

Stapel und auch bestimmte Einzelläufe verwenden `/api/studio/bulk-jobs` mit einer
vorab erzeugten Auftragskennung. Ein weiterer Pfad verwendet `/api/generate`.
Nach einer unklaren Startantwort versucht der Client zunächst, den Auftrag
wiederzufinden, bevor er erneut startet. Die lokale Vordergrundkennung unter
`vintz:studio-foreground-job:v1` kann bis zu drei Stunden zur Wiederaufnahme
dienen. Listen-/Einzelabfragen aktualisieren gespeicherte Jobs unter anderem
bei Sichtbarkeit und Seitenwiederkehr.

Das ist ein deutlich weitergehendes Wiederaufnahmekonzept als ein rein lokaler
Editor. Es ist **kein praktischer Nachweis**, dass jeder Auftrag bei geschlossenem
Browser oder ausgeschaltetem PC erfolgreich weiterläuft. Keine Laufzeit aus den
angezeigten Schätzungen ableiten.

## Upload und Speicherung

Generierung ist im untersuchten Vintz-Pfad keine rein lokale Bearbeitung:

1. Eingabedateien im Browser vorbereiten, bei Bedarf verkleinern/komprimieren.
2. Uploadsatz über `/api/studio/upload-batches` reservieren.
3. Dateien im Storage-Bucket `studio` unter Nutzerkennung und Uploadsatz ablegen.
4. Auftragsdaten mit Datei-/Referenzpfaden an den Generierungsdienst übergeben.
5. Ergebnis-/Auftragsbezug für Wiederaufnahme und Galerie verwenden.

Die Vorbereitung komprimiert Dateien oberhalb von 7 MiB zunächst in Richtung
6 MiB. Ein gemeinsamer Eingabesatz kann im gelesenen Helfer auf ungefähr
7,25 MiB vorbereitet werden; Referenzen werden stärker reduziert als Hauptbilder.
Transparenz kann bei dieser JPEG-Vorbereitung auf Weiß gesetzt werden. Das sind
Grenzen dieses Helfers, nicht eine allgemeine Zusicherung über jeden Serverpfad.

Die **eigene Modelgalerie** hat dagegen einen separaten Upload: JPEG, PNG, WebP,
HEIC oder HEIF bis 12 MiB je Datei laut Frontendprüfung. Galerie-Vorlagenlimit,
Gesamtspeicher, Originalaufbewahrung und vollständige Löschwirkung sind nicht
nachgewiesen. „12 MB“ für Modelvorlagen nicht mit den Generierungseingaben oder
der sichtbaren 30er-Produktbildgrenze verwechseln.

Im ausgelieferten Modellkatalog ist intern `nano-banana-2` mit Anzeigename
„Vintz AI“ und bis zu 14 Eingaben definiert. Das belegt eine interne Modellkennung,
keinen verifizierten externen Anbieter, Modellvertrag oder tatsächlich aufgerufene
Modellversion. Einzelne Werkzeuge beschränken Referenzen zusätzlich.

## Galerie, Wiederverwendung und Originale

[Galerie](https://vintz.ai/gallery) trennt **Generierungen** und **Model templates**:

- Drei vorhandene Ergebnisse: ein Try-on vom 17.10.2026 und zwei
  Upscaler-&-Iron-Ergebnisse vom 21.08.2026.
- Pro Ergebnis Werkzeug/Variante, Datum, Bildzugang, Download, Problem melden und
  Zugang zur Löschprüfung. Keine Änderung oder Meldung ausgeführt.
- Eigene Galerie: null gespeicherte Modelvorlagen; Vorlagen sollen nach Upload
  im Studio wieder auswählbar sein.
- Weitere Ergebnisse können im Code über einen Cursor nachgeladen werden.

Keinen vollständigen Ordner-/Tag-/Versionsbaum oder eine artikelübergreifende
Such-/Zuordnungsverwaltung in dieser Galerieansicht gefunden. Die gespeicherten
Modelvorlagen sind außerdem etwas anderes als generierte Produktbilder und
Originalfotos eines Angebots.

Der Löschdialog war im Code eindeutig **laufbezogen**: Er kündigt alle Ergebnisse
des Durchlaufs und dessen hochgeladene Originalfotos an, einschließlich anderer
Ergebniskarten. Das wäre mehr als nur eine einzelne Karte entfernen. Nicht
geöffnet oder bestätigt; tatsächliche Löschung und Aufbewahrungsfristen offen.

„Problem melden“ würde eine private Kopie samt Kontobezug an den Prüfbackend
übermitteln, mit Grund und optionalem Text. Es ist ein eigener Sendevorgang,
keine lokale Fehlermarkierung; nicht ausgeführt.

## Kosten, Downloads und KI-Herkunft

Live wurden **1.000 Credits** und eine laufende Gratis-Studio-Wochenendaktion
angezeigt. Der Countdown ist eine zeitlich begrenzte Aktion, kein dauerhaft
kostenloses Produktversprechen. Kein Creditverbrauch ausgelöst.

Der geladene Kostenhelfer sieht normalerweise **10 Credits pro 2K-Ausgabe** und
**20 Credits pro 4K-Ausgabe** vor, mit Multiplikation für mehrere Ausgaben.
Die Gratisaktion kann den Generierungspreis auf null setzen. Zusätzliche
Creditpakete sind im Code definiert; kein Kaufdialog oder Checkout geprüft.
Kostenhinweise, tatsächlicher Abzug und Erstattung sind getrennte Belegstufen.

In der aktuellen Galerie war der sichtbare Download **AI-labelled**. Der
zugehörige aktive Darstellungsmodus sieht eine sichtbare KI-Kennzeichnung und
maschinenlesbare Herkunft vor. Der Code enthält daneben andere Downloadpfade
für Original beziehungsweise eine gesondert freizuschaltende bereinigte Kopie.
Dafür wird außerhalb des aktiven Kennzeichnungsmodus eine einmalige
10-Credit-Freischaltung beschrieben. Präzisierung durch
[V-18](vintz-pricing-quotas-comparison.md): Der geladene Dialog nennt einmal
10 Credits für ein Bild oder einen Batch; die tatsächliche serverseitige
Berechnung wurde nicht ausgeführt. Im aktiven Modus werden diese
zusätzlichen Knöpfe nicht entsprechend angeboten, obwohl ein allgemeiner
Galeriehinweis noch von bereinigten Kopien sprach.

Deshalb weder „jeder Download kostet“ noch „jede Metadatenbereinigung ist hier
verfügbar“ behaupten. Keine Datei heruntergeladen oder Freischaltung ausgelöst;
Dateiformat, sichtbare Kennzeichnung, Herkunftsdaten und Größenanpassung nicht
an realen Downloadbytes geprüft. Die KI-Herkunft nicht mit Kameradaten/GPS
gleichsetzen.

## Direkte Verbindung zu Angeboten

Ein im Studio vorbereitetes Angebotsergebnis kann im Code bewusst übernommen
werden als:

1. Ausgewähltes Foto ersetzen.
2. Zusätzliches Foto anhängen.
3. Als neues Titelbild voranstellen.

Dazu sind erneutes Bearbeiten/Generieren und ein Zuschnittzugang vorgesehen.
Für neue Angebotsentwürfe kann eine eingebettete Rückgabe eine Datei an den
Editor liefern. Für bestehende Cloudangebote wird dagegen ein echter Auftrag
an `/api/seller/multi-accounts/{connection}/listing/photo` angelegt; Browserkonten
verwenden eine Erweiterungsbrücke.

Der Browserpfad lädt den aktuellen Fotostand neu und prüft beim Ersetzen, ob
das gewählte Quellfoto noch vorhanden ist. Der Cloudpfad verwendet eine
Anfragekennung mit Bezug auf Bild, Modus und Quellfoto. Das sind sinnvolle
Schutzansätze, keine verifizierte Garantie gegen jede parallele Änderung.
**In Warteschlange** bleibt außerdem etwas anderes als erfolgreich auf Vinted
gespeichert. Keine dieser Übernahmen ausgeführt.

## Vergleich mit Flipbase

| Aufgabe                | Vintz                                                                                        | Flipbase                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generative Bearbeitung | Sechs geführte Werkzeuggruppen und Auftrags-/Ergebnislogik                                   | Keine angebundene Ausführung für Freistellen, Hintergrund, Modelbilder, generative Retusche oder KI-Upscaling im untersuchten Code gefunden.                   |
| Klassische Bearbeitung | Zuschnittzugänge im Studio-/Ergebnispfad; Schwerpunkt generative Vorlagen                    | Lokaler Zuschnitt, Zoom, Zentrieren, 90°-Drehung, Helligkeit, Kontrast, Sättigung, Graustufe, Wärme und Schärfe. Regler auf mehrere Bilder übertragbar.        |
| Stapel                 | Produktbildstapel und Artikelgruppen, serverbezogene Aufträge mit Teilfehlern/Wiederaufnahme | Mehrbildbearbeitung und Reihenfolge lokal; kein entsprechender fortgesetzter Serverauftrag.                                                                    |
| Plattformausgabe       | Vorlagenabhängige Bildverhältnisse, 2K/4K im Code                                            | Plattformvorschau und Zuschnitt je eBay/Kleinanzeigen/Vinted, JPEG oder ZIP mit Plattformordnern.                                                              |
| Gespeicherte Bilder    | Generierungshistorie und eigene Modelvorlagen                                                | Dauerhafte Katalog-/Lagerbilder vorhanden; Optimierer selbst bleibt im Browser und verwirft seinen Arbeitszustand beim Verlassen.                              |
| Angebotsübernahme      | Ersetzen/Anhängen/Titelbild und eingebettete Rückgabe im Code                                | Optimierer hat keine direkte Übernahme in Artikelgalerie oder Vinted-Entwurf. Separate Editoren speichern dort bereits Bilder/Reihenfolge.                     |
| Metadaten              | Unterschiedliche Original-/bereinigte-/KI-gekennzeichnete Downloadpfade                      | Detaillierte lokale Anzeige; Export übernimmt nur vorhandenes Aufnahmedatum, sonst keine ausgewählten EXIF-/GPS-/Herkunftsfelder. Keine Inhaltsprüfung auf KI. |
| Kosten                 | Credits und zeitlich begrenzte Gratisaktion                                                  | Kein angebundener Bild-KI-Auftrag oder entsprechender Creditpreis. Klassischer Optimierer verarbeitet lokal.                                                   |

Flipbase-Details aus den tatsächlichen Quellen:

- Optimierer: maximal 24 Bilder, 20 MiB je Datei, 100 MiB insgesamt,
  64 Megapixel je Bild, 16.000 Pixel je Seite und 128 Megapixel insgesamt.
  Formatprüfung ist nicht gleich garantierter Browserdecoder für HEIC/AVIF.
- Vorschau/Export nutzen denselben Renderweg, JPEG-Qualität 0,92; kleine
  Quellen werden nicht hochskaliert. Transparenz wird für JPEG weiß.
- Aktuelle Appprofile: eBay 1600 × 1600, Kleinanzeigen 1600 × 1200, Vinted
  1200 × 1800. Insbesondere Vinted/Kleinanzeigen beruhen auf dokumentierter
  älterer Desktopmessung, nicht auf einer neuen Prüfung der Plattformvorgaben.
- Originaldateien im Optimierer bleiben unverändert; Arbeitsfassungen liegen
  in Speicher/Object-URLs. Keine dauerhafte lokale Entwurfsablage gefunden.
- Katalog-/Lagerbilder besitzen tatsächliche Storage-/Datenbankeinträge mit
  Hauptbild und Reihenfolge. Größere Produktdateien können vor Upload zu WebP
  mit maximal 1600 Pixeln vorbereitet werden; eine zusätzliche Originalkopie
  ist in diesem Pfad nicht belegt.
- Der Vinted-Entwurfseditor ist separat: eigenes Bildlager mit Reservierung und
  bestätigter Revision, JPEG/PNG/WebP, Appmaximum 100 Fotos und 50 MB je Foto.
  Dies ist nicht die tatsächlich erlaubte Veröffentlichungsmenge; die frühere
  [Erstellungsanalyse](vintz-listing-creation-comparison.md) grenzt dies ab.

Eine allgemeine globale Medienbibliothek mit Ordnern/Tags und Wiederverwendung
zwischen Produkten wurde auch bei Flipbase nicht gefunden. Die bestehenden
Artikelgalerien deshalb weder übersehen noch als solchen Medienpool ausgeben.

## Punkte für die gemeinsame Besprechung

1. **Zuerst vorhandene Abläufe verbinden:** Optimieren → Artikelgalerie →
   Angebotsentwurf. Zuschnitt, lokale Regler, Reihenfolge und ZIP sind bereits da.
2. **KI-Werkzeuge gezielt ergänzen:** Hintergrund/Freistellen und Modelbilder
   als mögliche eigene Aufgaben prüfen. Die sechs Vintz-Karten allein sind
   keine Grundlage für die Entscheidung über Bildqualität oder Anbieter.
3. **Ergebnisse bewusst übernehmen:** Original, Vorschau und neue Fassung
   unterscheidbar halten; Ersetzen, Anhängen und Titelbild ausdrücklich wählen.
   Herkunft, Artikelbezug und Rückkehr zur vorherigen Fassung vorsehen.
4. **Wiederverwendbare Vorlagen:** Eigene Models, Hintergründe und private Prompts
   können Serien konsistenter machen. Keine automatische Communityfreigabe.
5. **Verlässliche Aufträge:** Kosten vor Start, Fortschritt je Artikel,
   Teilergebnisse und sichere Wiederaufnahme nach Verbindungsabbruch. Erfolgreiche
   Generierung und erfolgreiche Angebotsaktualisierung getrennt anzeigen.
6. **Produktdarstellung prüfen:** Fit-/Stoffänderungen und übersehene Details
   am Originalvergleich beurteilen. KI-Kennzeichnung, Exportformat und
   Metadatenumfang verständlich halten; keinen Kennzeichnungsabbau als Vorteil
   übernehmen.

Für einen späteren, gesondert freigegebenen Qualitätstest wären dieselben
Artikelbilder vor/nach Bearbeitung zu vergleichen: Schnitt, Farbe, Material,
Logo, Gebrauchsspuren, Kanten und Transparenz; dazu reale Kosten, Auflösung,
Laufzeit und Wiederholbarkeit. Hier wurde dafür kein Auftrag gestartet.

## Quellen und Bildschirmbelege

Vintz: [Bildstudio](https://vintz.ai/dashboard),
[Galerie](https://vintz.ai/gallery), geladene Erstanbieter-JavaScriptmodule.
Keine fremden Quelltexte im Repository gespeichert.

| Modul              | Bereich                                           | SHA-256                                                            |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| `3rnq28vvxwyqv.js` | Studio, Stapel, Ergebnisse und Angebotsübernahme  | `463ed17cca920645c933ce00c836ad08ddc6e89048faa0ee6124cf3276ce54ff` |
| `2t8d5dpkojdt6.js` | Uploadvorbereitung, Storage und Wiederherstellung | `c652aa14490a8d74d298251ec6e6b314d8a488a30043277ca839d9309d6cc6f6` |
| `1qo2arosrd090.js` | Galerie, eigene Vorlagen, Verlauf und Meldungen   | `0cd253f3f3c97dfc5bcdc04c9b9bab78476d36f9b41c8ec98c7deff723e2981a` |
| `27_-kqsl9q6fz.js` | Downloads, Herkunft und Zusatzfreischaltung       | `df4b4dab91815c36d721518301ce441aba82e95c99f6b1427f3ee7e1183dd899` |
| `017ne7iwbqmbb.js` | Auflösungen und Credits                           | `2a2d7eaa192b1b454b99dd6c4d6b3fd8ad80e96bf74796ea53c0fe277221671c` |
| `2g-x9-pscq687.js` | Promptbibliothek                                  | `5ef70ba6b5ebb4d90657cb7089deea329b30ff15deb43171079f2429f0a8fe0f` |

- [Vintz-Werkzeuge](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-image-studio-tools-2026-10-18.png).
- [Bestehende Galerie](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-image-gallery-2026-10-18.png).
- [Flipbase-Einstieg ohne Bilder](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-image-optimizer-entry-2026-10-18.png).

Flipbase-Quellen beim oben genannten Stand:

- [Optimierer](../../src/app/features/image-optimizer/image-optimizer.component.ts),
  Zustand 142, Aufräumen 308, Zuschnittübernahme 552, Reihenfolge 672,
  Reglerübernahme 685, Export 711.
- [Regler](../../src/app/features/image-optimizer/services/adjustments.ts), ab 9;
  [Drehung](../../src/app/features/image-optimizer/services/image-rotation.service.ts), ab 7;
  [Importgrenzen](../../src/app/features/image-optimizer/services/image-import-limits.ts), ab 4.
- [Renderweg](../../src/app/features/image-optimizer/services/image-renderer.ts), ab 13;
  [JPEG/Metadatenexport](../../src/app/features/image-optimizer/services/image-export.service.ts), ab 12;
  [ZIP](../../src/app/features/image-optimizer/services/zip-export.service.ts), ab 19;
  [Plattformprofile und Herkunft](../../src/app/features/image-optimizer/models/platform-profile.ts), ab 51.
- [Metadatenleser](../../src/app/features/image-optimizer/services/metadata-reader.service.ts), ab 68;
  [Herkunftshinweise](../../src/app/features/image-optimizer/components/metadata-modal/metadata-modal.component.html), ab 66/77.
- [Katalog-/Lagerablage](../../src/app/core/services/media.service.ts), ab 352/651;
  [Produktbildvorbereitung](../../src/app/core/services/product-image-preparation.ts), ab 4;
  [Galerieeditor](../../src/app/shared/components/product-media-editor/product-media-editor.component.ts), ab 47.
- [Kataloggalerie speichern](../../src/app/features/catalog/pages/product-detail/product-detail.component.ts), ab 1028;
  [Lagerbilder](../../src/app/features/inventory/pages/item-detail/item-detail.component.ts), ab 286.
- [Vinted-Bildspeicherung](../../src/app/features/marketplaces/services/vinted-listing-image.service.ts), ab 11;
  [Angebotseditor](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts), ab 644;
  [separate zentrale Angebotsbilder](../../src/app/features/listings/services/listing-images.service.ts), ab 116.

Nur Dokumentation geändert. Separate Lesetabs geschlossen, keine Bilder importiert,
keinen Auftrag oder Speichervorgang gestartet. Dokumentation und Links geprüft;
keine Anwendungstests erforderlich. Stopp zur Besprechung.
