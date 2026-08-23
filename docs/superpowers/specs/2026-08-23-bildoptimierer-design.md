# Bildoptimierer

**Datum:** 2026-08-23
**Beteiligt:** Grischa Tänzer, Claude Opus 5
**Status:** Entwurf, freigegeben – Umsetzung offen

---

## Ziel

Unter „Werkzeuge & Ertrag" entsteht ein Werkzeug, das Produktfotos einmal
entgegennimmt und daraus die Formate der Verkaufsplattformen erzeugt. Der
entscheidende Punkt: **Man sieht vor dem Export, was später sichtbar ist** –
und zwar sowohl im großen Bild als auch in der kleinen Kachel der
Suchergebnisse, wo über den Klick entschieden wird.

Alles läuft im Browser. Keine Bilder verlassen den Rechner, kein Supabase,
keine Serveranbindung. Damit bleibt die Möglichkeit offen, dasselbe Werkzeug
später als eigenständige, kostenlose Seite zu veröffentlichen.

## Was geprüft wurde

Grundlage war ein Vorschlag, der bei mehreren Plattformwerten ausdrücklich
offen liess, ob sie stimmen. Nachgeprüft:

| Angabe                                        | Befund                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| eBay: ~1600 × 1600, min. 500 px, 12 MB        | **Bestätigt.** Dazu: bis 24 Fotos, das erste ist das Bild im Suchergebnis.                                 |
| Kleinanzeigen: Formate + 12 MB                | **Bestätigt.** jpg/gif/heic/png, 12 MB. **Kein** offizielles Seitenverhältnis.                             |
| Vinted: 20 Bilder, erstes Bild ganzer Artikel | **Bestätigt.** Vinted nennt **gar keine** technische Vorgabe – weder Maße noch Verhältnis noch Dateigröße. |

Zwei Funde kamen dazu, die im Vorschlag fehlten:

**eBay verbietet hinzugefügte Ränder**, ebenso Text, Grafiken und
Wasserzeichen. Ein Hochkantfoto mit weissen Balken auf 1:1 zu bringen wäre
also regelwidrig. Daraus folgt die wichtigste Regel des Werkzeugs:
**schneiden, nie auffüllen.**

**Die Trefferlisten schneiden unterschiedlich** – und das ist der Kern des
Werkzeugs. Statt es aus Fachbeiträgen abzuschreiben, wurde es am 23.08.2026
an den echten Seiten nachgemessen (Schreibtisch-Ansicht, Fensterbreite
1280 px), indem die Kacheln der Trefferliste und ihr `object-fit` ausgelesen
wurden:

| Plattform     | Kachel    | Verhältnis   | `object-fit` | Folge               |
| ------------- | --------- | ------------ | ------------ | ------------------- |
| eBay          | 289 × 289 | 1:1          | `contain`    | **schneidet nicht** |
| Kleinanzeigen | 200 × 150 | 4:3 quer     | `cover`      | **schneidet**       |
| Vinted        | 216 × 325 | 2:3 hochkant | `cover`      | **schneidet**       |

Bei Vinted lagen über 150 Kacheln in vier Grössen vor (216 × 325, 212 × 319,
187 × 281, 108 × 162) – alle mit demselben Verhältnis 0,665. Das ist **2:3**,
nicht die in Fachbeiträgen genannten 310 × 430 (0,72). Gemessen schlägt
abgeschrieben.

Daraus folgt die eigentliche Erkenntnis:

- **Geschnitten wird nur bei Kleinanzeigen und Vinted** – und zwar in
  **entgegengesetzte Richtungen**, quer gegen hochkant. Wer auf beiden
  einstellt, hat den härtesten Fall.
- **eBay schneidet nie.** Ein Hochkantfoto wird in der quadratischen Kachel
  nur _eingepasst_ und wirkt dadurch neben quadratischen Konkurrenzbildern
  kleiner. Das ist das echte Argument fürs Quadrat – nicht ein Zwang, den es
  nicht gibt.

Diese Werte sind gemessen, nicht offiziell dokumentiert. Sie stehen deshalb mit
Messdatum im Profil und lassen sich in einer Zeile nachziehen. Die Ansicht in
den Mobil-Apps wurde nicht gemessen und kann abweichen.

## Was im Projekt schon vorhanden ist

- **`ngx-image-cropper`** und **`browser-image-compression`** sind installiert.
- **`shared/components/image-cropper-modal`** schneidet, zoomt und dreht
  bereits – benutzt von der Artikelanlage und der Einkaufsansicht. Das
  Seitenverhältnis steht dort allerdings fest auf `1/1` im Template.

Das Herzstück ist also zur Hälfte gebaut. Der Bildoptimierer benutzt
`ngx-image-cropper` direkt mit variablem Verhältnis; das vorhandene Modal
bleibt unangetastet, damit die beiden bestehenden Aufrufer nicht betroffen
sind.

- **Keine ZIP-Bibliothek** im Projekt. `jszip` kommt neu dazu – die einzige
  neue Abhängigkeit des Werkzeugs.

## Getroffene Entscheidungen

| Frage                              | Entscheidung                                         | Begründung                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bildquelle                         | **Nur frisch hochgeladene Dateien**                  | Eigenständig, ohne Bindung an Artikel und Speicher. Hält die spätere Veröffentlichung als Webtool offen.                     |
| Zuschnitt bei mehreren Plattformen | **Einmal je Bild setzen, Formate ableiten**          | Der Zustand `Bild × Plattform` ist das, woran solche Werkzeuge komplex werden. 5 Bilder × 3 Plattformen wären 15 Zuschnitte. |
| Umgang mit fremden Verhältnissen   | **Schneiden, nie auffüllen**                         | eBay verbietet hinzugefügte Ränder.                                                                                          |
| Export                             | **ZIP mit Ordnern je Plattform**                     | Beim Einstellen einen Ordner öffnen und alles auswählen. Kostet `jszip`.                                                     |
| Plattformwerte                     | **Zentrale Profile mit Herkunftsangabe**             | Ändert eine Plattform etwas, ändert sich eine Zeile. Und man sieht, worauf eine Zahl beruht.                                 |
| Safe-Area                          | **Berechnet als Schnittmenge der gewählten Formate** | Kein Daumenwert, sondern eine Zusage, die sich halten lässt.                                                                 |

### Verworfene Alternativen

- **Je Plattform ein eigener Zuschnitt** (Tabs, wie ursprünglich vorgeschlagen)
  – maximale Kontrolle, aber der grösste Teil der Komplexität für einen
  Gewinn, den die Ableitung in den meisten Fällen ebenso liefert. Kann später
  als Ausnahme je Bild nachgerüstet werden, ohne den Aufbau zu ändern.
- **Eine Plattform pro Durchgang** – am einfachsten, aber doppelte Arbeit.
- **Illustration „gut/schlecht fotografiert"** – die Safe-Area zeigt dasselbe
  am echten Bild, während gearbeitet wird.
- **Prüfung „Produkt am Rand"** – ohne Objekterkennung nicht seriös
  feststellbar. Safe-Area und Kachelvorschau leisten dasselbe ehrlich.

---

## Die Ableitungsregel

Der Nutzer legt je Bild **einen** Ausschnitt fest: ein Rechteck auf dem
Original, erzeugt durch Verschieben und Zoomen.

Jedes Plattformformat ist dann das **grösste Rechteck mit dem Zielverhältnis,
das mittig in diesen Ausschnitt passt**:

```
Ausschnitt: Breite b, Höhe h, Mittelpunkt m
Zielverhältnis r = Breite / Höhe

wenn b / h > r:   Zielhöhe  = h,        Zielbreite = h * r
sonst:            Zielbreite = b,       Zielhöhe   = b / r
```

Damit ist **jede** Plattformfassung ein Teil dessen, was der Nutzer gerade
sieht. Es kommt nie Bildinhalt hinzu, den er nicht geprüft hat – und es
entstehen nie Ränder.

### Daraus folgt die Safe-Area

Der gestrichelte „empfohlene Produktbereich" ist die **Schnittmenge der
abgeleiteten Rechtecke aller gewählten Plattformen** – unabhängig davon, ob
ihre Trefferliste schneidet oder einpasst. `schneidet` beschreibt nämlich nur,
was die Kachel der Trefferliste mit dem Bild macht; der Export schneidet für
**jede** Plattform unbedingt auf ihr Zielverhältnis zu, auch für eBay (1:1).
Eine Plattform, die aus der Safe-Area ausgenommen wäre, könnte also trotzdem
etwas wegschneiden, das der Nutzer nie geprüft hat.

_Korrektur:_ Der erste Entwurf dieses Dokuments schloss eBay hier aus, weil
`schneidet: false` ist. Das war falsch – `schneidet` ist eine Aussage über die
Vorschau-Kachel, nicht über den Export, und der Export beschneidet auch
eBay-Bilder auf das Quadrat.

Bei Kleinanzeigen (4:3 quer) und Vinted (2:3 hochkant) ist das ein
vergleichsweise kleiner Bereich in der Mitte – genau deshalb ist er sichtbar.
Wer auf beiden Plattformen einstellt, muss sein Produkt dort platzieren; wer
nur eine bedient, hat viel mehr Luft. Das Werkzeug zeigt diesen Unterschied,
statt eine pauschale Empfehlung auszusprechen.

## Die Vorschau ist ein Nachbau der Trefferliste

Statt einer abstrakten Kachel zeigt die Vorschau, **wie der Artikel in der
Trefferliste der Plattform aussieht** – mit dem eigenen Foto in der richtigen
Bildöffnung, daneben Titel und Preis als Platzhalter. Dann muss niemand aus
einem Zahlenverhältnis erschliessen, was passiert; man sieht es.

Entscheidend für die Wahrheit dieser Vorschau ist allein die **Bildöffnung**:
Seitenverhältnis und `object-fit` – beides gemessen, siehe oben. Kleinanzeigen
als Zeile mit Bild links, eBay und Vinted als Kachel im Raster.

**Bewusst kein originalgetreuer Nachbau.** Keine fremden Logos, Schriften oder
Farbwelten – die Anordnung reicht zum Wiedererkennen. Zwei Gründe: Für die
Zuschnitt-Entscheidung trägt nur die Bildöffnung etwas bei, und eine spätere
Veröffentlichung als öffentliche Seite wäre mit nachgebauten Marken ein
Rechtsproblem. Die Vorschau ist als Vorschau beschriftet.

## Plattformprofile

Ein Profil beschreibt: Kennung, Anzeigename, Exportverhältnis, Exportgrösse,
Grenze für die Dateigrösse, Vorschauverhältnis (die Kachel im Suchergebnis)
und je Wert eine Herkunft (`offiziell` oder `beobachtet`).

| Profil            | Exportverhältnis    | Exportgrösse | Grenze | Kachel   | schneidet |
| ----------------- | ------------------- | ------------ | ------ | -------- | --------- |
| **eBay**          | 1:1 (offiziell)     | 1600 × 1600  | 12 MB  | 1:1      | nein      |
| **Kleinanzeigen** | 4:3 quer (gemessen) | 1600 × 1200  | 12 MB  | 4:3 quer | **ja**    |
| **Vinted**        | 2:3 hoch (gemessen) | 1200 × 1800  | –      | 2:3 hoch | **ja**    |

Das Exportverhältnis entspricht überall dem der Kachel. Wer im Werkzeug ein
Format erzeugt, das die Trefferliste ohnehin herstellt, sieht dort später
genau sein Bild – nichts wird nachträglich beschnitten.

Für **Kleinanzeigen** gibt es keine offizielle Vorgabe; die 4:3 stammen aus
der Messung der Trefferliste, nicht aus einer Ansage der Plattform. Die im
Netz kursierenden 1600 × 1200 passen dazu, sind aber Forenwissen – hier zählt
die Messung.

**eBay** schneidet in der Trefferliste nicht. Das 1:1-Format sorgt dort nur
dafür, dass die Kachel gefüllt wird statt das Bild darin zu verkleinern. Der
Export schneidet aber auch bei eBay auf das Quadrat zu; das Profil schränkt
die Safe-Area deshalb genauso ein wie jedes andere.

**Vinted** nennt keine Dateigrössengrenze; das Feld bleibt leer, es wird nur
auf Qualität komprimiert.

---

## Bausteine

```
features/image-optimizer/
├── models/
│   └── plattform-profile.ts        reine Daten, keine Logik
├── services/
│   ├── zuschnitt.ts                reine Rechenfunktionen, ohne DOM
│   ├── bild-export.service.ts      Canvas, Skalierung, Kompression
│   └── zip-export.service.ts       Ordnerstruktur und Download
├── components/
│   ├── bild-liste/                 Filmleiste, Hauptbild markiert
│   ├── zuschnitt-editor/           ngx-image-cropper mit variablem Verhältnis
│   └── plattform-vorschau/         Nachbau der Trefferliste je Plattform
├── image-optimizer.component.ts    Seite, hält den Zustand
└── image-optimizer.routes.ts
```

**`zuschnitt.ts` ist das Herz** und enthält ausschliesslich reine Funktionen:

- `leiteAb(ausschnitt, verhältnis)` – die Ableitungsregel oben.
- `schnittmenge(rechtecke)` – die Safe-Area.
- `reichtAufloesung(ausschnitt, zielgröße)` – ob genug Pixel vorhanden sind.
- `vergrößerungsfaktor(ausschnitt, zielgröße)` – wie stark hochskaliert wird.

Alles ohne Browser prüfbar. Die Komponenten enthalten keine Rechenlogik.

## Zustand

Je Bild: die Datei, die Originalmasse, der Ausschnitt (Rechteck auf dem
Original), die Drehung, die Reihenfolge. Die Plattformauswahl gilt für alle
Bilder gemeinsam.

Das erste Bild der Liste ist das **Hauptbild** und wird markiert – bei eBay
ist es das Bild im Suchergebnis, bei Vinted das im Raster. Die Reihenfolge
lässt sich per Ziehen ändern.

## Qualitätsprüfungen vor dem Export

Angezeigt am betroffenen Bild, nicht als Sammelmeldung:

- **Auflösung reicht nicht** – der Ausschnitt hat weniger Pixel als die
  Exportgrösse verlangt. Bei eBay zusätzlich hart: unter 500 px an der
  längsten Seite lehnt eBay ab.
- **Stark vergrössert** – ab Faktor 1,5 ein Hinweis, dass das Ergebnis
  unscharf werden kann.
- **Dateigrösse** – die Kompression zielt automatisch unter die Grenze des
  Profils; erst wenn das nicht gelingt, erscheint eine Meldung.

## Was schiefgehen kann

| Fall                                 | Folge                                 | Umgang                                                                         |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| Sehr grosse Bilder, viele auf einmal | Speicherdruck im Browser, Ruckeln     | Vorschauen verkleinert halten, Export nacheinander statt gleichzeitig.         |
| HEIC-Dateien vom iPhone              | Browser kann sie oft nicht darstellen | Beim Einlesen prüfen und verständlich melden, statt ein leeres Bild zu zeigen. |
| Zuschnitt kleiner als das Zielformat | Unscharfer Export                     | Warnung vor dem Export, kein stilles Hochskalieren.                            |
| Vinted-Raster ändert sich            | Vorschau stimmt nicht mehr            | Wert steht als „beobachtet" im Profil und ist eine Zeile.                      |

## Prüfung

- **Rechenfunktionen (vitest):** Ableitung für quadratisch, hochkant und quer;
  Ableitung bei bereits passendem Verhältnis; Schnittmenge zweier und dreier
  Formate; Auflösungswarnung genau an der Grenze; Verhalten bei extremen
  Seitenverhältnissen.
- **Von Hand im Browser**, vor der Übergabe an den Nutzer: Bilder hineinziehen,
  verschieben, zoomen, Plattformen umschalten, exportieren, ZIP öffnen und die
  Masse der erzeugten Dateien nachmessen.

## Bewusst weggelassen

- KI, Objekterkennung, Hintergrundentfernung.
- Supabase-Speicher und Anbindung an Artikel.
- Helligkeit, Kontrast, Filter.
- Eigene Formatvorlagen des Nutzers.
- Instagram, Facebook Marketplace – kommen als Profil dazu, wenn sie gebraucht
  werden.

## Offene Punkte

- Die Kachelmasse sind am 23.08.2026 in der Schreibtisch-Ansicht gemessen. Die
  Mobil-Apps wurden nicht geprüft und koennen abweichen; wer viel ueber die App
  verkauft, sollte das nachmessen. Jede Aenderung ist eine Zeile im Profil.
- Ob die Safe-Area bei gleichzeitig Kleinanzeigen und Vinted im Alltag zu klein
  wirkt, zeigt die Benutzung. Falls ja, waere die Antwort ein eigener Zuschnitt
  je Plattform - der Aufbau laesst das zu, ohne umgebaut zu werden.

## Quellen

- eBay, Bilder zu Angeboten hinzufügen – https://pages.ebay.de/picture_manager/
- eBay-Bildanforderungen (Zusammenfassung) – https://www.img.vision/handbook/ebay/tips/image-dimensions/
- Kleinanzeigen Hilfe, Bilder hinzufügen – https://hilfe.kleinanzeigen.de/hc/de/articles/17049460199196-Wie-f%C3%BCge-ich-Bilder-zu-meiner-Anzeige-hinzu
- Vinted-Fotorichtlinien, Rasterformat – https://vintedify.com/en/blog/vinted-photo-guidelines-2026-sizes-aspect-ratios-how-to-take-better-listing-photos
