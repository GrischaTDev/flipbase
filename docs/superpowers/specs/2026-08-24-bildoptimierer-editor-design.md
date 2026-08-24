# Bildoptimierer: Zuschnitt je Plattform

**Datum:** 2026-08-24
**Beteiligt:** Grischa Tänzer, Claude Opus 5
**Status:** Entwurf, freigegeben – Umsetzung offen

**Ersetzt Teile von** `2026-08-23-bildoptimierer-design.md`: die Entscheidung
„einmal zuschneiden, Formate ableiten" und den gesamten Abschnitt zur
Safe-Area. Alles Übrige aus jenem Entwurf – Plattformprofile mit ihren
gemessenen Werten, die Ableitungsregel, Export und ZIP – bleibt gültig.

---

## Anlass

Der Bildoptimierer ist seit dem 24.08.2026 im Betrieb. Die erste Benutzung hat
vier Dinge gezeigt:

1. Das Bild wird in Originalgröße ausgebreitet und füllt den ganzen Bereich,
   statt in einem handlichen Fenster zu stehen.
2. Der gestrichelte „empfohlene Produktbereich" ist unverständlich: Man sieht
   ihn, weiss aber nicht, zu welcher Plattform er gehört.
3. Man kann nicht sagen, für welche Plattform man gerade zuschneidet.
4. Die Bildliste steht unten statt neben dem Editor.

Dazu ein Fehler: In den Vorschaukacheln erscheinen gelegentlich verschobene,
angeschnittene Bereiche, die nicht zum Bild passen.

## Die Ursache hinter den Punkten 2 und 3

Der ursprüngliche Entwurf liess den Nutzer **einen** Rahmen ziehen und
berechnete daraus jedes Plattformformat. Das spart Arbeit – und macht genau
die Frage unbeantwortbar, die beim Zuschneiden zählt: _Wie sieht mein Bild
bei eBay aus?_

Weil der Rahmen kein Plattformformat hat, ist er **kein** Zuschnitt, sondern
nur die Grundlage für drei berechnete. Die Safe-Area war der Versuch, das
aufzufangen: der Bereich, den keine gewählte Plattform anschneidet. Das ist
mathematisch korrekt und in der Praxis nichtssagend, weil er zu keinem
einzelnen Format gehört.

Die Wahl zwischen beiden Modellen wurde am 23.08. bewusst getroffen und fiel
auf das Ableiten. Die Benutzung hat sie widerlegt.

## Getroffene Entscheidungen

| Frage                    | Entscheidung                                           | Begründung                                                                                                      |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Rahmenformat             | **Fest auf das Format der gewählten Plattform**        | Was im Rahmen liegt, ist die Exportdatei. Keine Ableitung, nichts zu interpretieren.                            |
| Zustand                  | **Zuschnitt je Bild _und_ Plattform**                  | Die Matrix, die der erste Entwurf vermeiden wollte. Die Benutzung zeigt: hier ist sie die richtige Komplexität. |
| Mehrfacharbeit vermeiden | **Erster Zuschnitt leitet die übrigen ab, plus Knopf** | Das Ableiten bleibt als Abkürzung erhalten, nur nicht mehr als einziger Weg.                                    |
| Safe-Area                | **Ersatzlos entfernt**                                 | Beantwortet eine Frage, die es nicht mehr gibt, und erklärte sich selbst falsch.                                |
| Editorgrösse             | **Feste Höhe, Bild eingepasst**                        | Ein Werkzeug zum Zuschneiden braucht einen ruhigen Rahmen, keine Bildschirmfüllung.                             |
| Bildliste                | **Rechts neben dem Editor**                            | Durchklicken, ohne zu scrollen. Auf schmalen Bildschirmen darunter.                                             |

### Verworfene Alternativen

- **Beim Ableiten bleiben, nur die Plattformumrisse farbig einzeichnen** –
  weniger Umbau, aber man schneidet weiterhin nicht für eine einzelne
  Plattform zu; die eigentliche Frage bliebe offen.
- **Beide Modelle nebeneinander** – grösster Funktionsumfang, aber die
  Oberfläche müsste zwei Arbeitsweisen erklären.
- **Safe-Area nur beim Übernehmen zeigen** – erwogen; verworfen, weil die
  Vorschaukacheln nach dem Übernehmen ohnehin zeigen, was passiert ist.

---

## Zielbild

```
┌──────────────────────────────────────────┬──────────────┐
│  eBay · Kleinanzeigen · Vinted           │  Bild 1 ←    │
│  ────                                    │  Bild 2      │
│                                          │  Bild 3      │
│  ┌────────────────────────┐              │  Bild 4      │
│  │                        │  feste Höhe  │              │
│  │   Rahmen im Format     │              │              │
│  │   der Plattform        │              │              │
│  └────────────────────────┘              │              │
│                                          │              │
│  [drehen]  [auf andere Plattformen …]    │              │
└──────────────────────────────────────────┴──────────────┘
   eBay · Vorschau    Kleinanzeigen · Vorschau    Vinted …
```

Die Plattformreihe oben hat zwei Aufgaben, die vorher getrennt waren: Sie
wählt aus, **welche** Plattformen exportiert werden, und **an welcher** gerade
gearbeitet wird. Nicht gewählte Plattformen sind ausgegraut und lassen sich
nicht als Arbeitsziel setzen.

## Zustand

`OptimiererBild.ausschnitt` wird von einem einzelnen Rechteck zu einer
Zuordnung `ProfilId → Rechteck`:

```ts
readonly ausschnitte: Partial<Record<ProfilId, Rechteck>>;
```

- Der Editor liest den Zuschnitt der **aktiven** Plattform und schreibt ihn
  dorthin zurück.
- Beim **ersten** Zuschnitt eines Bildes werden die übrigen gewählten
  Plattformen automatisch per `leiteAb` daraus gefüllt – so ist ein Bild nach
  einer Geste für alle Plattformen fertig.
- Der Knopf **„auf die anderen Plattformen übernehmen"** wiederholt das
  jederzeit und überschreibt dabei auch bereits angepasste Zuschnitte. Das ist
  gewollt und steht am Knopf.
- Fehlt für eine Plattform ein Zuschnitt, greift beim Export und in den
  Warnungen weiterhin die volle Bildgrösse – wie bisher.

Beim **Drehen** werden alle Zuschnitte dieses Bildes verworfen, nicht nur
einer: Nach einer Drehung zeigt kein gespeichertes Rechteck mehr auf dieselbe
Stelle.

## Was entfernt wird

- `safeArea()` und `schnittmenge()` aus `services/zuschnitt.ts`, samt ihrer
  Tests. Beide haben nach diesem Umbau keinen Aufrufer mehr.
- Das Overlay im Editor und die Erklärzeile darunter.
- Die gesamte Geometrie, die das Overlay am Zuschnittrahmen ausrichtete –
  einschliesslich der Messung des Versatzes und der zwei Messdurchgänge bei
  Fenstergrössenänderung. Damit verschwindet auch die bekannte Grenze aus dem
  Betrieb, dass die Overlay-Grösse nach einem Resize nachhinkt.

`leiteAb()` bleibt und wird wichtiger: Es füllt jetzt die übrigen Plattformen.

## Der Vorschaufehler

`PlattformVorschauComponent` liest die natürliche Bildgrösse im `load`-Ereignis
und setzt sie **nie zurück**. Wechselt das Bild oder wird es gedreht – wobei
Breite und Höhe tauschen –, rechnet die Vorschau mit den Maßen des vorherigen
Fotos weiter, bis das neue geladen ist. Das erzeugt genau die verschobenen,
angeschnittenen Bereiche aus der Rückmeldung.

Behebung: Die Grösse beim Wechsel von `datenUrl` zurücksetzen; solange sie
unbekannt ist, zeigt die Kachel wie bisher das ganze Bild.

## Was schiefgehen kann

| Fall                                                   | Folge                            | Umgang                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nutzer schneidet für eBay zu, wählt danach Vinted dazu | Vinted hat noch keinen Zuschnitt | Beim Hinzufügen wird ihr Zuschnitt aus dem der **aktiven** Plattform abgeleitet; hat auch die keinen, bleibt er leer und der Export nimmt das ganze Bild. |
| „Übernehmen" überschreibt mühsam angepasste Zuschnitte | Arbeit verloren                  | Beschriftung sagt es klar; kein stilles Überschreiben an anderer Stelle.                                                                                  |
| Aktive Plattform wird abgewählt                        | Editor ohne Ziel                 | Die Auswahl springt auf die erste noch gewählte Plattform; ist keine gewählt, ruht der Editor.                                                            |
| Bild ohne Zuschnitt für eine Plattform                 | Export nimmt das ganze Bild      | Wie bisher, und die Auflösungswarnung greift dafür ebenfalls.                                                                                             |

## Prüfung

- **Rechenfunktionen (vitest):** `leiteAb` bleibt getestet. Die Tests von
  `safeArea` und `schnittmenge` entfallen mit den Funktionen.
- **Neu:** Das Ableiten beim ersten Zuschnitt und das Übernehmen sind reine
  Zustandsübergänge auf `ausschnitte` und werden als solche getestet, ohne
  Oberfläche.
- **Von Hand im Browser**, vor der Übergabe: Plattform wechseln und prüfen,
  dass der Rahmen sein Format ändert; zuschneiden, Plattform wechseln,
  zurückwechseln; drehen und prüfen, dass die Zuschnitte verworfen werden;
  exportieren und die Maße der Dateien nachmessen.

## Bewusst weggelassen

- Ein Verlaufsspeicher oder „rückgängig".
- Zuschnitte über mehrere Bilder hinweg übernehmen („auf alle Bilder
  anwenden") – sinnvoll, sobald mehrere Fotos unter gleichen Bedingungen
  entstehen, aber nicht nötig, damit das Werkzeug seinen Zweck erfüllt.
- Eine Warnung, wenn ein abgeleiteter Zuschnitt das Produkt anschneidet: Ohne
  Objekterkennung nicht seriös feststellbar. Die Vorschaukacheln zeigen es.
