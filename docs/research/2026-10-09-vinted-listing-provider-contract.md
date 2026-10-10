# Vinted-Inserate: Anbieterprüfung und Umsetzungsstand

Stand: 10.10.2026. Der Nutzer hat die Umsetzung mit „dann los“ freigegeben.
Arbeitsbasis ist `origin/master` bei `638b2ace`, einschließlich PR #356 und #357.

## Nachgewiesen und offen

Nach „probier nochmal“ wurden am 09.10.2026 das angemeldete Neuanlageformular
und die vollständige Bearbeitungsmaske eines eigenen aktiven Inserats gelesen.
Unterbrechungen beim Seitenwechsel wurden durch erneutes Verbinden überwunden.
Die Prüfung benutzt sichtbare Bedienelemente und deren DOM-Attribute; es wurden
keine versteckten Anwendungszustände oder Zugangsdaten ausgelesen.
Die Bleam-Recherche ist im
[Produktentwurf](../superpowers/specs/2026-10-09-vinted-listing-publishing-design.md)
festgehalten. Die folgenden Vinted-Nachweise ergänzen diese Recherche.

| Bereich                                    | Aktueller Nachweis                                                                                                    | Nächster Nachweis                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Kategorie                                  | Gespeicherter Baum; Neuanlage/Bearbeitung mit Kleidung und Kinderschuhen geprüft                                      | Weitere Kategoriearten und deren Pflichtmerkmale prüfen                            |
| Titel, Beschreibung, Verkaufspreis         | Frei speicherbare Flipbase-Arbeitskopie; Betrag in Cent, kein Übernehmen von Einkaufskosten                           | Vinted-Längen, Preisgrenzen und Währung bestätigen                                 |
| Marke, Größe, Zustand, Farben, Materialien | Auswahlstruktur und Beispiele am Anbieter bestätigt; Entwurfeditor verwendet noch freie Angaben                       | Dynamische Auswahl mit bestätigten IDs integrieren; weitere Kategorien prüfen      |
| Paketgröße und weitere Merkmale            | Sendungsgrößen 1/2/3 am Anbieter bestätigt; KI-Fotokennzeichnung im Inhaltstyp noch nicht enthalten                   | Sendungsgröße und Kennzeichnung in den vollständigen Editorvertrag aufnehmen       |
| Fotos                                      | Private Originaldateien, nativer Uploadbaustein und Reihenfolge synthetisch geprüft; bis 20 Fotos offiziell bestätigt | Echten Upload und Zuordnung zu einem bestätigten Inserat prüfen                    |
| Flipbase-Entwurf                           | Anlegen, automatisch speichern, suchen und wieder bearbeiten implementiert                                            | Echte Umgebung erst nach abgeschlossener Integration migrieren                     |
| Vinted-Entwurf                             | Eigene Schaltfläche im Vinted-Formular nachgewiesen; noch kein Schreibadapter                                         | Speicherung und bestätigte Entwurfs-ID an später freigegebenem Fall prüfen         |
| Veröffentlichen und Bearbeiten             | Beide vollständigen Formulare gelesen; neue Schreibwege und Ergebnisbelege fehlen                                     | Ergebnis-ID, Antwortverlust und Wiedererkennung am geprüften Schreibweg bestätigen |
| Termin und Relist                          | Dauerhafte Aufträge, Terminmodell, Dialog und atomarer Terminwechsel geprüft; Relist offen                            | Tatsächlichen Ausführer anschließen; Relist-Reihenfolge separat bestätigen         |

Es wurden keine neuen Vinted-Schreibendpunkte oder Anbieter-IDs geraten.
Ein echter Schreibtest braucht einen vom Nutzer ausgewählten Artikel und die
Freigabe der konkreten Aktion. Die automatischen Browserprüfungen verwenden
ausschließlich künstliche Konten, Inserate und Fotos mit abgefangenen Anfragen.

## Direkt am Vinted-Formular bestätigt

- Neuanlage: `/items/new`, getrennte Schaltflächen **Entwurf speichern** und
  **Hochladen**. Vor der Kategorieauswahl sind Fotos, Titel, Beschreibung und
  Kategorie sichtbar. Nach Wahl der Kategorie erscheinen deren weitere Felder.
- Beispiel Herren → Kleidung → Jacken & Mäntel → Jacken → Bomberjacken:
  Kategorie `1223`; Marke, Größe, Zustand, Farbe und Material sowie Preis und
  Sendungsgröße. Material wird ausdrücklich als empfohlen bezeichnet.
- Größen sind kategorieabhängig: Männergrößen gehören im Beispiel zur Gruppe
  `14`, etwa M mit Kennung `208`. Beim eigenen Inserat in Kinder → Jungs →
  Schuhe → Sportschuhe → Fußballschuhe (`2738`) erscheint stattdessen die
  Kinderschuhgrößengruppe `31`, etwa 38 mit Kennung `607`.
- Zustandskennungen im geprüften Kleidungsformular: `6` für neu mit Etikett,
  `1` für neu, `2` sehr gut, `3` gut und `4` zufriedenstellend.
- Farbe erlaubt zwei Werte. Bei Wahl eines dritten Werts ersetzt Vinted einen
  bisherigen Wert. Material erlaubt entsprechend drei Werte. Flipbase soll
  diese Grenzen erklären und vorhandene Auswahlen bewusst ändern lassen.
- Sendungsgröße: klein `1`, mittel `2`, groß `3`. Nach dem Laden der
  Bomberjacken-Kategorie wurde mittel automatisch als Empfehlung ausgewählt.
  Die Empfehlung kann verspätet erscheinen; ein Ausführer muss auf den fertigen
  Formularstand warten und die tatsächlich gewünschte Größe prüfen.
- Foto-Dateiauswahl: `name="photos"`, Mehrfachauswahl und
  `accept="image/jpeg,image/gif,image/png,image/webp"`. Eine zahlenmäßige
  Fotogrenze oder maximale Dateigröße ist damit **nicht** bestätigt. GIF ist
  am Anbieter auswählbar, im bisherigen Flipbase-Fotoweg jedoch nicht unterstützt.
  Erneute Prüfung am 10.10.: `data-testid="add-photos-input"`, Fotobereich
  `media-upload` und `media-upload-grid`; die Aktionen heißen
  `upload-form-save-draft-button` und `upload-form-save-button`.
  Vorhandene Fotokacheln enthalten geordnete `image-wrapper-0` bis `-5`,
  Bildbeschriftung „Hochgeladenes Foto …“, Titelbildmarkierung und
  eigene Bearbeiten-/Entfernen-Buttons. Die fertigen Bilder sind geladene
  HTTPS-Bilder von `images1.vinted.net`. Ein echter Uploadzustand wurde
  weiterhin nicht ausgelöst; Kachel oder Vorschau bestätigt kein neues Inserat.
- DOM-Felder: `input[name="title"]`, `textarea[name="description"]`,
  `input[name="price"]` sowie `#category`, `#brand`, `#size`, `#condition`,
  `#color` und `#material`. Die Auswahlfelder sind schreibgeschützte Eingaben
  mit aufklappbarer Auswahl, keine freien Textfelder.
- Auswahlkennungen stehen unter anderem in `catalog-<id>`,
  `catalog-suggestion-<id>`, `brand-<id>`, `suggested-brand-<id>`,
  `condition-<id>`, `color-<id>`, `material-<id>` und
  `data-testid="size-group-<group>-grid-option-<id>"`. Vorgeschlagene und
  reguläre Einträge können dieselbe Kennung enthalten; sie müssen beim Lesen
  zusammengeführt werden. Nicht aus bloßen Beschriftungen eine ID erfinden.
- Bearbeitung: Die Aktion **Angebot bearbeiten** führt zu `/items/<id>/edit`.
  Die Maske enthält die vorhandenen Fotos mit Reihenfolge und Titelbild,
  Entfernen-/Bearbeiten-Aktionen, alle genannten Angaben und **Speichern**.
- Einige Markenwechsel sind gesperrt. Im geprüften Schuh-Inserat sind etwa
  bestimmte Zielmarken deaktiviert, andere auswählbar. Flipbase muss eine
  konkrete Sperre anzeigen; sie darf keine ungefragte Neuanlage auslösen.
- Bei vorhandenen Fotos erscheint `ai_photo`, eine Kennzeichnung für KI-Fotos.
  Der aktuelle Entwurfsvertrag enthält sie noch nicht. Vor vollständiger
  Live-Bearbeitung muss sie ausdrücklich erfasst und erhalten werden.
- Die Bearbeitungsmaske enthält außerdem die kostenpflichtige Zusatzoption
  `bump`. Ein normaler Bearbeitungsauftrag darf sie nicht einschalten.
- Titel, Beschreibung und Preis haben in der beobachteten DOM-Struktur keine
  `maxlength`-/`min`-/`max`-Grenzen. Daraus folgt **keine** unbegrenzte Eingabe:
  tatsächliche Anbietergrenzen und Pflichtvalidierung bleiben zu bestätigen.

Es wurden nur Auswahllisten im ungespeicherten Neuanlageformular ausprobiert.
Anschließend wurde das leere Ausgangsformular wiederhergestellt und gelesen.
Das bestehende Inserat wurde ausschließlich gelesen. Keine Fotos hochgeladen,
kein Vinted-Entwurf angelegt und kein Inserat gespeichert oder veröffentlicht.
Ein erfolgreicher Schreib-/Ergebnisvertrag und weitere Kategorien sind noch
offen; die sichtbaren Schaltflächen allein liefern diesen Nachweis nicht.

## Fertige Grundlage im Arbeitszweig

### Ergänzende Formularprüfung und offizielle Grenzen

Am 09.10.2026 wurde das angemeldete Neuanlageformular erneut ausschließlich
gelesen. Es enthielt bereits ausgewählte Werte; diese wurden erhalten. Nur
Auswahllisten und Kategoriegruppen wurden geöffnet und anschließend mit Escape
geschlossen. Die frühere Rücksetzung beschreibt den vorherigen Recherchelauf.

Die Auswahlwerte stehen auf äußeren `div`-Elementen mit `role="radio"` bzw.
`role="checkbox"` und `aria-checked`. Die darin enthaltenen nativen Eingaben
sind teilweise absichtlich verborgen und eignen sich nicht als sichtbare
Auswahlquelle. Der Leser berücksichtigt doppelte Vorschläge, Sperren,
Größengruppen und versteckte alte Listen. Paketgrößen können ihre Beschriftung
über `aria-labelledby` erhalten. Die Kategorieauswahl öffnet auf der obersten
Ebene; für Bomberjacken führt die reine Gruppennavigation über
`5 → 2050 → 1206 → 2052` zur bereits gewählten Endkategorie `1223`.

Vinted nennt offiziell **bis zu 20 Fotos** und höchstens drei Materialien.
Die Erstellungsanleitung nennt Kategorie, Marke oder ausdrücklich „Keine
Marke“, Zustand, Preis und Paketgröße. Sie beschreibt auch eine mögliche
Prüfung nach dem Hochladen; eine angenommene Aktion bedeutet deshalb nicht
automatisch ein bereits sichtbares Inserat.
[Quelle: Vinted, Artikel hochladen](https://www.vinted.de/help/4/375-vaiheittaiset-ohjeet-tuotteen-lataamista-varten).

Der offizielle Button „Erneut hochladen“ wird für vom Käufer vor Versand
stornierte Bestellungen beschrieben. Das belegt keinen allgemeinen Ablauf
zum Löschen und Neuerstellen aktiver Inserate. Manuelles Relist bleibt
gesondert zu klären.
[Quelle: Vinted, erneutes Hochladen](https://www.vinted.de/help/102?access_channel=hc_topics).

Der gemeinsame lokale/Cloud-Leser und seine synthetischen Browserprüfungen
verwenden diese DOM-Struktur. Kategorie und Konto werden vor und nach dem
Lesen verglichen. Vor einer späteren Anbieteraktion werden tatsächliche IDs,
Beschriftungen, gesperrte Optionen, unbekannte Merkmale, Fotoformate und
beobachtete Textgrenzen geprüft. Fehlende Pflichtfelder und eine aktivierte
kostenpflichtige Push-Option führen zum Anhalten. Das ist bisher Vorbereitung;
ein Upload-, Schreib- oder Bestätigungsadapter ist noch nicht angeschlossen.

- Eigene Entwürfe mit optionalem Zielkonto, unveränderlichen privaten Fotos und
  ausgewählten Vorlagenfeldern in deklarativen Schemas 460–462.
- Kontrollierte Datenbankfunktionen prüfen Arbeitsbereich, Konto und Revision.
  Derselbe Anlegeversuch kann nach Verbindungsabbruch wiederholt werden, ohne
  einen zweiten Entwurf anzulegen. Große interne IDs bleiben Zeichenketten.
- Eine gemeinsame Bildkomponente für Kleinanzeigen und Vinted unterstützt
  Dateiauswahl, Drag-and-drop, Titelbild, zugängliche Verschiebeaktionen sowie
  den vorhandenen Zuschneide-/Drehdialog.
- Autospeichern hält nach einem Fehler an und bewahrt Eingaben. Konflikte
  verlangen bewusstes Laden des gespeicherten Stands. Ausstehende Antworten
  eines anderen Arbeitsbereichs werden verworfen.
- Vorlagen zeigen Änderungen vor dem Übernehmen. Konto und Fotos gehören
  nicht zur Vorlage; Preisübernahme ist ausdrücklich auswählbar.
- Kategorieänderungen leeren alte Merkmalskennungen und zusätzliche Attribute.
  Geänderte Vorlagenbeschriftungen behalten keine widersprüchlichen alten IDs.
- Entwürfe können ohne verbundenes Vinted-Konto vorbereitet werden. Die Seite
  bezeichnet die Speicherung ausdrücklich als Speicherung in Flipbase.

Die Speichergrenzen von 100 Fotos, 50 MiB pro Foto, 20.000 Zeichen pro Text
und 200.000 Byte JSON sind eigene Schutzgrenzen für Arbeitskopien. Sie sind
**keine bestätigten Vinted-Grenzen**. Unterstützt werden JPEG, PNG und WebP;
vor dem Upload muss der Browser die Bilddatei lesen können. HEIC und andere
Formate sind derzeit nicht unterstützt.

## Noch erforderliche Arbeit

Paket 1 ist durch die beschriebenen Formularbeobachtungen teilweise geklärt.
Anbietergrenzen, weitere Kategoriearten und Schreib-/Ergebnisbelege bleiben
offen. Paket 2 ist teilweise
umgesetzt: fehlschlagende Uploads werden nach Serverfreigabe bereinigt;
bestätigte Originale bleiben für spätere Sicherungen erhalten. Eine dauerhafte
serverseitige Bereinigung verwaister Uploads, vollständige Sicherungen und
deren Aufbewahrungsregeln fehlen noch. Das Löschen eines Entwurfs wird deshalb
noch nicht angeboten und hat keine öffentliche Schreibfunktion.

Paket 3 enthält die funktionsfähige eigene Entwurfsmaske. Die bestätigten
kategorieabhängigen Anbieterfelder sowie Aktionen für Vinted-Entwurf,
sofortige/geplante Veröffentlichung fehlen. Paket 5 enthält inzwischen das
Terminmodell: UTC und Zeitzone, explizite Auswahl bei doppelten Uhrzeiten,
Ablehnung übersprungener bzw. vergangener Termine und beide Ausfallregeln.
23 Modellprüfungen bestehen auch mit Gerätezeitzonen New York und Tokio.
Paket 4 enthält jetzt die dauerhafte Auftragsannahme und eigene Inseratfreigaben
in Schema 463. Inhalt und Fotoreihenfolge, Konto, Entwurfsrevision, Ausführungsort
und Termin werden unveränderlich aufgenommen. Wiederholte Anfragen liefern
denselben Auftrag. Aufträge können vor Beginn abgebrochen werden; ein Widerruf
während eines begonnenen Versuchs bleibt „Ergebnis unklar“. Konto- und
Installationswechsel entziehen alten Aufträgen die Freigabe. `queued` bestätigt
ausschließlich die Speicherung in Flipbase. Anbieteradapter, Ausführeranschluss,
Anschluss der neuen Veröffentlichungsaktionen und der dauerhaften Fälligkeit sowie
vollständige Live-Bearbeitung mit Drawer und manuelles Relist fehlen weiterhin.

Der Terminersatz ist inzwischen als eigene atomare Datenbankfunktion ergänzt:
neuer gespeicherter Inhalt und Termin ersetzen einen noch nicht begonnenen
geplanten Auftrag. Bei einem Fehler bleibt der alte Auftrag erhalten. Eine
wiederholte Anfragenkennung liefert denselben Ersatz. Frontend-Modell und
Feature-Service prüfen den Auftragskontext und unterscheiden Anbieterprüfung
von Veröffentlichung. Der Editor zeigt inzwischen den Verlauf, erlaubt den
versionsgebundenen Abbruch wartender Aufträge und weist auf neuere Änderungen
gegenüber dem eingefrorenen Inhalt hin. MEZ/MESZ und die IANA-Zone machen doppelte
Uhrzeiten eindeutig. Ein Planungsdialog für bestehende wartende Aufträge ist jetzt
angeschlossen. Er übernimmt den aktuellen gespeicherten Entwurf und speichert
Termin und Ausfallregel atomar. Die ursprüngliche Aktion, Fotoeinstellung,
Kontoidentität und der Ausführungsort bleiben erhalten. Ungespeicherte Änderungen
sperren den Dialog; Kontext-/Revisionswechsel schließen ihn. Nach Antwortverlust
behält eine Wiederholung derselben Angaben ihre Anfragenkennung. Dialog, Escape,
Fokusrückkehr und AXE wurden auf Desktop/Mobil in hell/dunkel geprüft.
Die Neuanlageaktionen und Ausführer sind weiterhin anzuschließen.

Für lokale Versuche sind Übernahme, erneute Prüfung, einmaliger Schreibbeginn
und Ergebnisannahme inzwischen in Schema 464 vorbereitet. Abgelaufene
Vorbereitung kann erneut übernommen werden; ein möglicherweise begonnenes
Schreiben bleibt unklar. Verlaufabfragen erkennen diesen Zustand auch bei
ausgeschalteter Erweiterung. Späte Antworten sind an den ursprünglichen
Versuch und das Zielkonto gebunden. Änderungen von Konto oder Ausführer
entziehen die alte Freigabe dauerhaft. Die 27 Ablaufprüfungen verwenden
synthetische Ergebnisse und bestätigen keinen echten Vinted-Schreiberfolg.

Die lokale Edge-Schnittstelle verbindet jetzt `listing_claim`,
`listing_check`, `listing_begin` und `listing_finish` mit diesen eigenen RPCs.
Sie übernimmt nur freigegebene Konto-/Versuchkennungen und strukturierte
Ergebnisbelege, keine vom Client gelieferten Inhaltsaufträge. Das gekoppelte
Secret wird vor Übergabe an die Datenbank gehasht. Bestätigungen verlangen
Artikel-/Konto-ID, Aktion, passenden Anbieterstatus und eine gültige UTC-Zeit;
die Datenbank prüft zusätzlich die tatsächliche Bindung. Die Erweiterung ruft
diesen Ablauf noch nicht automatisch auf; native Ausführung und der
Hintergrundablauf bleiben anzuschließen. Ein eigener, noch nicht im Manifest
aktivierter Client prüft Konto, Fristen und Versuchbindung, übernimmt die
Originalbytes und meldet Ergebnisse. Nur vom Client registrierte Versuche sind
verwendbar. Schreibbeginn wird vor dem ersten Warten reserviert und nach einer
verlorenen Antwort nicht erneut gesendet. Späte Freigabeantworten können keinen
bereits widerrufenen oder beendeten Versuch wieder öffnen. Der Inhaltsparser
ist mit dem Cloud-Worker geteilt und liefert tief eingefrorene Auftragskopien.

`listing_photo` liefert die privaten Originalbytes für eine Bildkennung aus
dem übernommenen Auftrag. Die Erweiterung darf keinen Storage-Pfad oder eine
URL vorgeben. Der Server prüft den aktuellen Versuch vor dem Lesen des festen
Auftragsstands, vor dem Download und vor der Rückgabe. Konto, Workspace,
Versuchkennung und gehashtes Secret begrenzen die Abfrage. JPEG, PNG und WebP
werden anhand der Metadaten, Größe und Dateisignatur geprüft; höchstens 50 MiB
werden gepuffert. Teilantworten, Weiterleitungen und falsche Dateien werden
abgewiesen. Die Antwort enthält Bytes und Bildkennung, keine Storage-URL oder
Serverzugänge. Dateisignaturen ersetzen keine vollständige Bilddekodierung.
Diese Prüfungen liefen mit abgefangenen Datenbank-/Storage-Anfragen; ein realer
Download in die installierte Erweiterung wurde nicht ausgeführt.

Schema 465 ergänzt den Cloud-Versuch mit Worker-Epoche und reserviertem Profil.
Eine abgelaufene Vorbereitung wird erst nach bestätigtem physischem Stopp
freigegeben. Worker-Ablauf, private Datenbankanbindung und exklusive
Browserberechtigung sind geprüft. Der Zugriff auf private Originalfotos ist
inzwischen an den übernommenen Auftrag gebunden: Rechteprüfung vor/nach dem
Download, begrenzter Stream und Prüfung von Typ/Größe/Signatur. Der Adapter
erhält keine Storage-URLs oder Serverzugänge. Der eigentliche Anbieteradapter
und die automatische Auftragsabholung fehlen noch.
Der getrennte native Foto-Uploadbaustein ist inzwischen mit Browserfixtures
geprüft: einzelne Dateiauswahl in ursprünglicher Reihenfolge, Begin-ACK vor
erstem Upload, Kontoprüfung und keine Bestätigung aus Blob-Vorschauen.
Zusätzliche oder veränderte vorherige Fotos brechen den Ablauf ab.
Der Baustein ist noch nicht mit einer Veröffentlichungsaktion verbunden.
Ein weiterer getrennter Baustein bereitet eine leere Neuanlagemaske vor:
Kategoriepfad und Endkategorie aus tatsächlich sichtbaren Kennungen, abhängige
Auswahlwerte einschließlich Beschriftung und Größenfamilie sowie Preis in Cent.
Vorhandene Benutzereingaben werden erhalten. Konto, Kategorie und Freigabe bleiben
gebunden; die abschließende Leseprüfung vergleicht Texte, Preis und Auswahlen.
Die Versandgrößen-Metadaten prüfen dieselben sichtbaren Labels wie der
Auswahlleser, auch bei versteckten nativen Radios. Unbekannte Merkmale und Werte
außerhalb der sichtbaren Auswahl werden abgelehnt. Marken-Suche und Abruf weiterer
Werte sind noch nicht angeschlossen. Auch dieser Baustein ruft keinen Speicherbutton
auf und bestätigt keinen Anbietererfolg.
Die Navigation wird inzwischen aus `public.vinted_categories.parent_id` geladen,
mit Blatt-, Schleifen-, Tiefen- und Aktualisierungsprüfung. Im übernommenen
Versuch werden Rechte vor/nach jedem Abruf geprüft; Serverzugänge bleiben im
Worker. Diese Quelle bestätigt nur Navigationskennungen, keine Anbieterfelder.

Zusätzliche Leseprüfung am 10.10.2026: Die native Detailseite enthält im `#sidebar`
`item-price`, `itemprop="description"` und einen Profil-Link `/member/<id>` mit
`profile-username`. Fotokacheln heißen `item-photo-N` mit `item-photo-N--img`;
das Raster zeigt höchstens fünf Bilder und eine zusätzliche Anzahl, daher ist es
allein kein Nachweis der vollständigen Fotoreihenfolge. Eigene Aktionen heißen
`item-edit-button`, `item-hide-button`, `mark-as-sold-button` und
`mark-as-reserved-button`. Die letzten beiden Links enthalten die Artikelkennung.
Diese Bedienelemente wurden ausschließlich gelesen. Sie allein beweisen keinen
Speichererfolg einer neuen Anlage oder einen endgültigen Moderationsstatus.
Im eigenen Profil waren `closet-seller-filters-active` und
`closet-seller-filters-sold` sichtbar. Die spätere Leseprüfung hat die Auswahl
des Aktiv-Filters konkret bestätigt: `aria-pressed="true"`, anschließend neun
aktive statt zwölf gemischter Artikel. Die Kacheln enthalten
`product-item-id-<id>--overlay-link`, den konkreten `/items/<id>`-Link und den
Artikeltitel im `title`-Attribut. Ein gemeinsamer Leser verlangt den ausgewählten
Aktiv-Filter, keinen zusätzlich ausgewählten Verkauft-Filter, das eigene Profil
und genau eine sichtbare passende ID/Titel-Kachel. Der Worker prüft Konto und
Freigabe davor/danach und wartet auf den Ersatz oder das Verbergen der alten
ungefilterten Kachel sowie das Ende des Ladens. Eine kurze Ladeanzeige allein
ist kein verlässlicher Übergangsbeleg. Dieser Leser bestätigt ausschließlich
den aktiven Status einer bereits bekannten ID; er beweist noch keine Neuanlage
oder deren vollständigen Inhalt.

Die geöffnete Galerie `image-carousel` zeigt alle sechs Fotos in ihrer
ursprünglichen DOM-Reihenfolge, auch nach Wechsel zum zweiten Bild.
`image-carousel-image-shown` kennzeichnet das ausgewählte Bild, die übrigen
heißen `image-carousel-image`. Navigation und Schließen haben eigene
`image-carousel-button-left/right/close`-Kennungen. Die gespeicherten
Bearbeitungsvorschauen verwenden `/tc/<bildkennung>/...`, die öffentliche
Galerie `/t/<bildkennung>/...`. Bildkennung und Dateiname bleiben gleich;
Signaturen im Query unterscheiden sich. Das ist ein konkreter Vergleichspunkt
für einen späteren gespeicherten Fotobeleg, noch kein geprüfter neuer Upload.
Der eigene Recherchetab wurde anschließend geschlossen, ohne Inhalte zu ändern.

Ein lesender Inhaltsprüfer öffnet inzwischen die bekannte
`/items/<id>/edit`-Maske frisch. Er vergleicht die gespeicherten Texte,
Centpreis, tatsächliche Merkmalsauswahl samt IDs/Labels, Zusatzoptionen und
das vollständige Fotogitter. Der gemeinsame Fotobeleg vergleicht Bildordner
und Dateiname zwischen `/t/` und `/tc/`; andere Reihenfolge, Anzahl, Kennung,
unsichere URL oder ungeladene/versteckte Kachel werden abgelehnt. Die Umsetzung
ist anhand abgefangener Browseranfragen geprüft. Ein echter neuer Upload ist
damit weiterhin nicht geprüft; eine bekannte ID allein beweist keine Neuanlage.

Der native Veröffentlichungsbaustein verbindet inzwischen Feldvorbereitung,
Fotoeingabe, einmaligen Klick auf `upload-form-save-button` und erneute
Inhalts-/Foto-/Aktivstatusprüfung. Er akzeptiert ausschließlich eine neue
reservierte `about:blank`-Seite. Eine neue Kennung wird aus einer konkreten
Artikelroute nach dem Speicherklick gelesen; die Artikelroute ist aus der
Bestandsprüfung bekannt. Dass Vinted nach einer echten Neuanlage auf diese
Route wechselt, ist bisher ausschließlich im abgefangenen Browserablauf
angenommen und noch durch einen freigegebenen Einzelfall zu bestätigen.
Keine Wiederholung bei fehlender Ergebnisroute. Native Entwürfe bleiben vor
jeglichem Upload als nicht unterstützt zurückgewiesen.

Die feste Cloud-Browseraktion ist jetzt mit diesem Baustein verbunden. Der
Controller bestätigt den ersten Schreibbeginn und übergibt die Originalbytes
in Teilen von höchstens einem MiB. Der Sitzungsbrowser prüft beidseitig die
aufgenommenen Metadaten und setzt nur vollständige Fotos zusammen. Aktuelle
Rechte werden vor jedem Teil geprüft. Konto, Aktion und bestätigter
Schreibbeginn binden die abschließende Rückmeldung. Der gesamte getrennte
Browserablauf mit eigenem Tab ist mit abgefangenen Anbieteranfragen geprüft;
ein geöffnetes Benutzerformular bleibt dabei unverändert. Dies ersetzt
weiterhin keinen echten freigegebenen Anbieter-Schreibtest.

Der Nutzer bestätigt, dass aktuell kein
gespeicherter Vinted-Entwurf vorhanden ist. Entwurfs-Ergebnisroute und Kennung
bleiben ungeprüft. Eine fokussierte Hilfesuche lieferte keinen belastbaren
offiziellen Beleg; fremde Erfahrungsberichte werden nicht zum Formularvertrag.
Auch die 20 Cloud-Datenbankprüfungen verwenden ausschließlich synthetische
Belege. Keine echte Veröffentlichung oder Anlage eines Vinted-Entwurfs geprüft.

Die Markensuche wurde zusätzlich in einer frischen Neuanlagemaske mit der
Kategorie Herren → Kleidung → Jacken & Mäntel → Jacken → Bomberjacken geprüft.
Sie öffnet `brand-search--input` mit `id="brand-search-input"` und Platzhalter
„Marke suchen“. Die Suche nach „JAKO“ liefert unter anderem „Jako-o“ mit
`brand-radio-317425` und „Jako“ mit `brand-radio-254956` sowie ähnliche Marken.
Daneben erscheint eine freie Markenoption ohne Anbieterkennung. Diese darf
keinen bestätigten Markentreffer ersetzen. Nach Auswahl des tatsächlichen
„Jako“-Treffers zeigt `#brand` den Wert „Jako“; die Aktualisierung erfolgt
asynchron. Es wurden keine Texte/Fotos eingegeben oder gespeichert. Der eigene
Recherchetab wurde anschließend geschlossen; das Benutzerformular blieb offen.

## Prüfungen dieser Grundlage

- Produktionsbau und TypeScript-Prüfung erfolgreich; bestehende Warnungen
  zu `HeaderComponent.DatePipe` und `pdf-lib/pako` bleiben bestehen.
- 96 betroffene Angularprüfungen einschließlich bisherigem Kleinanzeigeneditor;
  30 Modell-/Navigationsprüfungen und 11 gezielte Skriptprüfungen erfolgreich.
- 56 neue Datenbankprüfungen nach frischem Reset aus allen Migrationen;
  Zugriffsrechte und private Storage-Policies tatsächlich geprüft.
- Vier echte Browserdurchläufe der Testoberfläche: Desktop/Mobil, hell/dunkel,
  Kategorieauswahl, Speichern/Wiederladen, Fotos, Reihenfolge und Vorlagen.
  AXE prüft die neue Editorfläche; alle vier Durchläufe sind ohne Befund.
  Der Bilddialog wird zusätzlich mit Escape und Fokusrückkehr geprüft.
- Die unabhängige Review fand drei Randfälle. Regressionstests reproduzierten
  sie; Vorlagen ändern nun nur ausgewählte Texte, Fotoersatz funktioniert auch
  bei voller Auswahl und Autospeichern pausiert während der Bildbearbeitung.
  Ein zusätzlicher Test sichert die Freigabe dieser Pause beim Kontextwechsel.

Kein Push, kein PR, kein Merge, keine Produktionsmigration, kein Deployment
und keine Änderung installierter Erweiterungen oder realer Inserate.
