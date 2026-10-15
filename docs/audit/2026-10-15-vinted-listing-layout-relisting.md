# Vinted-Artikelseite, Inseratsalter und Relisting

Stand: 15.10.2026. Recherche und Vorschlag von Juna, keine freigegebene
Umsetzungsspezifikation. Keine Angebote veröffentlicht, verändert oder gelöscht.

## Auftrag

Die Artikelseite im Kleiderschrank soll große Fotos nach dem Vinted-Vorbild und
einen schmaleren Informationsbereich erhalten. Das Alter eines Inserats soll in
Tagen und Stunden auf der Detailseite und in der Übersicht erkennbar sein.
Bearbeiten und Löschen werden benötigt; Relisting soll fachlich vorbereitet
werden. Pushen, Verkauft-/Reserviert-Markierung und Verstecken sind nicht gewünscht.

## Direkt im Browser beobachtet

### Vinted

Referenz: [Ralph-Lauren-Jacke mit vier Fotos](https://www.vinted.de/items/10375965453-ralph-lauren-sweatjacke-damen-gr-l).

- Links ein durchgehend hohes Hauptbild, rechts oben ein breites Bild und
  darunter zwei nebeneinanderliegende Bilder.
- DOM-Messung im vorhandenen Desktopfenster: Hauptbild ungefähr 394 × 624 CSS-px,
  oberes Nebenbild 392 × 312 CSS-px, die beiden unteren jeweils 195 × 310 CSS-px.
  Die gesamte Galerie misst mit Zwischenraum ungefähr 789 × 624 CSS-px und ist
  damit in diesem Beispiel querrechteckig, nicht quadratisch. Diese Messung
  belegt keine feste Vinted-Vorgabe für andere Fenstergrößen oder Fotoanzahlen.
- Klick auf ein Foto öffnet eine Fotogalerie mit Vorher, Weiter und Schließen.
- Rechts: Titel, Angebotspreis, separat die Käufer-Zwischensumme inklusive
  Vinted-Gebühr, Merkmale, Hochgeladen-Angabe, Beschreibung und Verkäuferaktionen.
- Drei-Foto-Aufteilung aus dem Nutzerbericht: Hauptbild links, zwei Nebenbilder
  rechts übereinander. Diese Variante wurde nicht an einem weiteren Angebot geprüft.

### Flipbase

- Die geöffnete Detailseite bestätigt den beschriebenen Effekt.
- Das Template begrenzt die linke Spalte auf 360 px und gibt den restlichen
  Platz der rechten Spalte: `md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]`.
- Fotos werden als einzelnes Hauptbild mit kleinen Auswahlbildern dargestellt;
  eine Großansicht wird an dieser Stelle nicht geöffnet.
- Die Beschreibung des geöffneten Angebots war nicht geladen. Die Ursache wurde
  in dieser Recherche nicht untersucht. Der neue Aufbau muss Lade-, Leer- und
  Fehlerzustände weiterhin verständlich darstellen.

Relevante Stellen:

- `src/app/features/marketplaces/components/vinted-listing-detail/`
- `src/app/features/marketplaces/components/vinted-listings/`
- `src/app/features/marketplaces/models/marketplace-read.models.ts`
- `services/marketplace-worker/src/vinted-account-import.ts`

### Vintz

Referenz: [öffentliche Vintz-Demo](https://vintz.ai/demo/listings).

- Die ersten Angebotszeilen haben deaktivierte Bearbeitungsaktionen. Der
  beobachtete Hinweis verweist auf eine veraltete Connect-Version. Daraus lässt
  sich keine allgemeine Produktsperre ableiten.
- Der Relisting-Dialog ist über die bereits ausgewählte Demozeile zugänglich.
  Er bietet Original/Hell/Weich/Klar, Foto-Versionen, Original/1600/2400 px,
  Entfernen von Metadaten, Titelbild-Zuschnitt sowie Titel und Preis je Angebot.
- Der Hilfetext beschreibt den Vergleich fertiger JPEGs mit Original und
  anderen Kontoversionen, einen erstmaligen Werkzeugdownload von rund 125 MB
  und ausdrücklich keine garantierte Annahme durch den Marktplatz. Der tatsächliche
  Bildalgorithmus und seine Wirkung wurden nicht geprüft.
- Laut Dialog werden Ersatzangebote nacheinander erstellt; das jeweilige
  Original bleibt bis zum erfolgreichen Erstellen online. Das ist eine
  Anbieterbeschreibung, kein überprüfter Veröffentlichungsablauf.
- Die Demo bietet außerdem einen Filter für seit mindestens sieben Tagen
  unverkaufte Angebote. Das belegt keine Vinted-Regel oder sichere Relisting-Frist.

### Bleam

Referenz: [geöffneter Kleiderschrank](https://bleam.app/en/dashboard/dressing).

- Artikeldetails öffnen als seitliches Panel. Enthalten sind Preis, Aufrufe,
  Favoriten, Relisting-Zähler und -Datum, Sicherung, Relist, Preisänderung,
  Vinted-Link und Löschen bei Vinted.
- Die Übersicht erklärt ihre Altersanzeige ausdrücklich über das Upload-Datum
  der Fotos. Das ist keine belegte genaue Veröffentlichungszeit des Inserats.
- Historische Relistings vor Beginn der Erfassung sind ausdrücklich unbekannt.
- Die [Relisting-Anleitung](https://bleam.app/en/help/republier-annonce)
  beschreibt mehrere Fotoänderungen und Text-/Preisänderungen sowie Entwürfe
  und zeitversetzte Verarbeitung. Die Anbieterbehauptung, dadurch die
  Duplikaterkennung zu vermeiden, wurde nicht unabhängig bestätigt.
- Bleams [Hinweise zu Einschränkungen](https://bleam.app/en/help/combien-republier-par-jour)
  nennen Einschränkungen wegen automatisierter Aktivität. Die dort genannten
  Erfahrungswerte sind weder offizielle Vinted-Grenzen noch eine Sicherheitsgarantie.

## Offizielle Regeln und Nutzererfahrungen

Die deutschen [Vinted-Katalogregeln](https://www.vinted.de/catalog-rules)
verlangen in den allgemeinen Regeln ein einmaliges Hochladen je Artikel und
unbearbeitete, selbst aufgenommene Artikelfotos. Das Hauptbild soll den gesamten
Artikel zeigen. Bis zu 20 Fotos je Angebot sind erlaubt. Verstöße können zu
Entfernung und Kontoeinschränkungen führen. Eine ausdrückliche Freigabe für
wöchentliches Ersetzen eines Angebots zur Reichweitensteigerung oder eine
Ausnahme durch veränderte Fotos konnte nicht belegt werden.

Die deutsche [AGB-Seite](https://www.vinted.de/terms_and_conditions) lieferte
sowohl im Browser als auch beim Webabruf keinen lesbaren Vertragstext. Deshalb
wird daraus keine konkrete deutsche Automatisierungsklausel behauptet. Der
Suchtreffer der [US-AGB](https://www.vinted.com/terms-and-conditions) erwähnt
Einschränkungen für externe Software; er ersetzt keine Prüfung der deutschen AGB.

Die Diskussion [Hilft das erneute Hochladen der Artikel für die Sichtbarkeit?](https://www.reddit.com/r/VintedDeutschland/comments/1u76iq1/hilft_das_erneute_hochladen_der_artikel_f%C3%BCr_die/)
enthält widersprüchliche Erfahrungen: Verkäufe nach besseren Fotos ebenso wie
weniger Aufrufe oder eine unveränderte Position. Ein Kommentar weist auf verlorene
Beobachter hin. Auch [Erfahrung mit Re-Uploads](https://www.reddit.com/r/VintedDeutschland/comments/1qnafxw/erfahrung_mit_reuploads/)
enthält individuelle Erfolgsberichte. Das sind unkontrollierte Einzelfälle und
keine Belege für den Algorithmus, verlässliche Intervalle oder risikolose Bildänderungen.

## Vorschlag für den nächsten Umbau

### Große Fotos und schmalere Informationen

- Eigene Detailseite beibehalten. Auf breiten Ansichten ungefähr zwei Drittel
  Bilder und ein Drittel Informationen, mit begrenzter Gesamtbreite, damit auf
  sehr breiten Monitoren weder Fotos noch Text unnötig groß werden.
- Eine Aufnahme: großes Einzelbild; zwei: zwei Bilder; drei: Hauptbild links,
  rechts zwei übereinander; vier: beobachtetes Mosaik; ab fünf: Hauptbild und
  vier Nebenbilder. Bei mehr als fünf eine beschriftete Anzeige der weiteren
  Fotos. Die nicht direkt beobachteten Varianten sind Umsetzungsvorschläge.
- Die Mosaikvorschau darf passend zum Raster beschneiden. Beim Öffnen muss
  das vollständige Original sichtbar sein. Die Vorschau verändert keine Upload-Datei.
- Großansicht mit Tastaturbedienung, Escape, Fokusführung und Rückkehr zum
  auslösenden Bild. Auf kleinen Bildschirmen Galerie über den Informationen.
- Rechts: Titel, Verkäuferpreis, Aufrufe/Favoriten, Alter, Merkmale,
  aufklappbare Beschreibung und Aktionen unter dem Text.
- Die Käufer-Zwischensumme nur übernehmen, wenn Vinted sie verlässlich liefert;
  dann ausdrücklich als Käuferbetrag kennzeichnen. Keine selbst geschätzte Gebühr.
- Bearbeiten und „Auf Vinted löschen“ vorsehen. „Neu einstellen“ folgt mit dem
  geklärten Ablauf; keine funktionslose Schaltfläche als bereits fertige Funktion.
- Bestehende gemeinsame Buttons, Badges und Dialoge sowie Flipbase-Farben verwenden.

### Inseratsalter

Interpretation des Nutzerwunschs: Tag 1 beginnt mit dem Veröffentlichen, Tag 4
nach 72 Stunden, Tag 6 nach 120 Stunden. Tage sind jeweils vergangene 24 Stunden,
keine Kalendertage. Sieben Tage sind eine interne Arbeitsrichtlinie.

| Vergangene Zeit             | Darstellung                                       |
| --------------------------- | ------------------------------------------------- |
| Unter 72 Stunden            | Grün                                              |
| Ab 72 bis unter 120 Stunden | Orange                                            |
| Ab 120 Stunden              | Rot                                               |
| Ab 168 Stunden              | Weiter rot, zusätzlich „Wochenziel überschritten“ |
| Veröffentlichung unbekannt  | Neutral, „Inseratsalter unbekannt“                |

Beispiel: „Seit 1 Tag und 12 Stunden online“, kompakt „1 T 12 Std.“. Unter
einer Stunde „Unter 1 Stunde“. Keine Minuten und kein Zurücksetzen beim
Synchronisieren oder Bearbeiten. Text und zugängliche Beschriftung ergänzen
die Farbe. In Übersicht und Detail dieselbe Berechnung verwenden.

Im untersuchten Worker-Import enthalten Inserate `sortAt: observedAt` und kein
eigenes Veröffentlichungsdatum im übertragenen Inhalt. `occurredAt` existiert
im allgemeinen Lesemodell, ist damit aber für diese Aufgabe noch keine geprüfte
Quelle. Vor der Umsetzung müssen lokale und Cloud-Importwege, Speicherung und
Lesemodell auf einen tatsächlich von Vinted gelieferten Veröffentlichungszeitpunkt
geprüft werden. Foto-Upload, erster Import und letzte Synchronisierung dürfen
die fehlende Quelle nicht stillschweigend ersetzen. Altdaten ehrlich unbekannt
anzeigen, bis sie mit verlässlicher Quelle ergänzt sind.

### Relisting separat klären

Sinnvoll sind eine vollständige Sicherung, eine bearbeitbare Vorschau und eine
eindeutige Erfolgskontrolle. Den Grundsatz „Original bis zur fertigen Vorbereitung
behalten“ übernehmen; eine zeitweilige doppelte Veröffentlichung nicht ungeprüft
übernehmen. Ohne bestätigten Vinted-Ablauf lässt sich nicht gleichzeitig
garantieren, dass das Original immer online bleibt und niemals zwei aktive
Angebote entstehen.

Vor einer Umsetzung klären:

1. Welche konkreten Wiederveröffentlichungen Vinted erlaubt und welcher
   unterstützte Ablauf beziehungsweise welche Berechtigung dafür besteht.
2. Vollständigen Ersatz lokal vorbereiten, Fotos sichern, Titel/Beschreibung,
   Preis und Merkmale prüfen. Kein Löschen vor fertiger Vorbereitung.
3. Zulässige Reihenfolge für Entfernen und Veröffentlichen bestimmen; mögliche
   Lücke und Wiederherstellung aus der Sicherung offen anzeigen. Bestehende
   Favoriten und Aufrufe nicht als auf neue Angebote übertragbar versprechen.
4. Vor Ausführung frisch prüfen, ob der Artikel inzwischen verkauft,
   reserviert oder anderweitig geändert wurde. Aktionen je Konto und Artikel
   gegen doppelte Ausführung sperren. Auch bei einer einzelnen Auswahl beachten.
5. Bei unklarem Ergebnis nach einem Verbindungsabbruch zuerst den tatsächlichen
   Stand abgleichen. Kein blindes erneutes Erstellen oder Löschen. Alte und neue
   Angebots-ID sowie die gemeinsame interne Artikelzuordnung erhalten.
6. Erfolg erst nach bestätigter Veröffentlichung melden und erst dann das Alter
   der aktuellen Veröffentlichung neu beginnen lassen. Frühere Laufzeit und
   Relisting-Verlauf getrennt aufbewahren.

Automatische wöchentliche Wiederveröffentlichung und Fotoänderungen zum
Überlisten der Erkennung sind durch diese Recherche nicht freigegeben.

## Prüfung für eine spätere Umsetzung

Galerie mit 0/1/2/3/4/5/20 Fotos, defekten Bildern, langen Texten und sämtlichen
Lade-/Fehlerzuständen prüfen. Bestehende Detail-/Bearbeitungs- und Kleiderschrankfälle
einbeziehen; CI-Breiten, Hell/Dunkel, Touch, Tastatur und AXE berücksichtigen.
Zeitberechnung an 72/120/168 Stunden, fehlenden/ungültigen/zukünftigen Daten und
Zeitzonenwechseln prüfen. Synchronisierung darf das Alter nicht verjüngen.
Import- und Lesetests müssen Herkunft und Erhalt des Veröffentlichungsdatums
für die unterstützten Ausführungswege belegen.

In dieser Sitzung wurden nur Browseransichten, öffentliche Quellen und lokale
Dateien gelesen sowie diese Recherche und das Sitzungsprotokoll ergänzt.
Kein Anwendungsbau, keine Anwendungstests, keine Migration und kein Live-Relisting.
