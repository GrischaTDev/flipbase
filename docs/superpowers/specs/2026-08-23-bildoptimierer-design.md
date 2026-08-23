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

**Vinteds Suchraster schneidet das erste Bild hochkant** auf rund 310 × 430
Punkte, unabhängig davon, was hochgeladen wurde. Ein Querformat verliert dort
links und rechts genau das, worauf der Käufer schaut. Damit ist belegt, was
das Werkzeug überhaupt rechtfertigt: **eBay quadratisch, Vinted hochkant** –
ein Format für alle gibt es nicht.

Diese Beobachtung stammt aus Fachbeiträgen, nicht aus Vinteds Hilfe. Sie wird
deshalb im Profil als „beobachtet" gekennzeichnet, nicht als „offiziell".

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

Der gestrichelte „empfohlene Produktbereich" ist die **Schnittmenge aller
abgeleiteten Rechtecke** der gewählten Plattformen, jeweils Export- **und**
Vorschauverhältnis, weil beide schneiden können.

Bei eBay (1:1) und Vinted (3:4 Export, 310:430 Raster) ist das der schmalste
hochkante Bereich. Liegt das Produkt darin, schneidet keine Plattform es an.

## Plattformprofile

Ein Profil beschreibt: Kennung, Anzeigename, Exportverhältnis, Exportgrösse,
Grenze für die Dateigrösse, Vorschauverhältnis (die Kachel im Suchergebnis)
und je Wert eine Herkunft (`offiziell` oder `beobachtet`).

| Profil            | Exportverhältnis          | Exportgrösse       | Grenze | Vorschau (Kachel) |
| ----------------- | ------------------------- | ------------------ | ------ | ----------------- |
| **eBay**          | 1:1 (offiziell)           | 1600 × 1600        | 12 MB  | 1:1               |
| **Vinted**        | 3:4 (beobachtet)          | 1200 × 1600        | –      | 310:430           |
| **Kleinanzeigen** | **keins** (keine Vorgabe) | längste Kante 1600 | 12 MB  | wie Export        |

**Kleinanzeigen exportiert den Zuschnitt unverändert im Seitenverhältnis** und
begrenzt nur Kantenlänge und Dateigrösse. Das ist die ehrliche Umsetzung:
Kleinanzeigen macht keine Vorgabe, also erfindet Flipbase keine. Das Profil
nimmt damit auch keinen Einfluss auf die Safe-Area. Wer trotzdem ein
einheitliches Format möchte, wählt zusätzlich eBay oder Vinted.

Vinted nennt keine Dateigrössengrenze; das Feld bleibt leer und es wird nur
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
│   └── plattform-vorschau/         die abgeleiteten Fassungen als Kacheln
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

- Das Vinted-Rasterformat (310 × 430) ist beobachtet, nicht offiziell. Vor der
  Veröffentlichung als Webtool sollte es an einer echten Vinted-Suche
  nachgemessen werden.
- Ob Kleinanzeigen ohne Zielverhältnis in der Praxis angenehm ist, zeigt die
  Benutzung. Sollte sich ein Verhältnis als sinnvoll erweisen, ist es eine
  Zeile im Profil.

## Quellen

- eBay, Bilder zu Angeboten hinzufügen – https://pages.ebay.de/picture_manager/
- eBay-Bildanforderungen (Zusammenfassung) – https://www.img.vision/handbook/ebay/tips/image-dimensions/
- Kleinanzeigen Hilfe, Bilder hinzufügen – https://hilfe.kleinanzeigen.de/hc/de/articles/17049460199196-Wie-f%C3%BCge-ich-Bilder-zu-meiner-Anzeige-hinzu
- Vinted-Fotorichtlinien, Rasterformat – https://vintedify.com/en/blog/vinted-photo-guidelines-2026-sizes-aspect-ratios-how-to-take-better-listing-photos
