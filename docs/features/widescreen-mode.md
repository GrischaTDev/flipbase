# Widescreen-Modus

Für sehr breite Bildschirme, zum Beispiel einen 49-Zoll-Monitor im 32:9-Format
(5120 × 1440 Pixel).

## Stand (umgesetzt am 01.11.2026)

- **Schalter:** Im Nutzermenü oben rechts unter „Layout“, unter den drei Breiten
  „Schmal / Mittel / Volle Breite“, steht der Knopf „Widescreen-Modus“. Die Wahl
  wird im Browser gemerkt (`flipbase_widescreen`). Eingeschaltet nutzt jede Seite
  die volle Breite; ein Klick auf eine der drei Breiten schaltet den Modus wieder aus.
- **Vinted Feed als erste Seite:**
  - Links bleibt die Filterspalte, rechts füllen die Karten die ganze Breite
    (so viele Spalten à mindestens 15rem wie hineinpassen statt höchstens fünf).
  - Unter der Filterkarte erscheint „Weitere Suche hinzufügen“. Jede weitere Suche
    erscheint rechts daneben mit eigenen Filtern und eigenen Funden; die Breite
    teilt sich zu gleichen Teilen (zwei Suchen = Hälften, drei = Drittel).
  - Höchstens vier Suchen. Weitere Suchen lassen sich mit „Suche entfernen“
    schließen; die erste bleibt immer.
  - Ohne Widescreen-Modus gibt es den Knopf nicht, und nur die erste Suche ist
    sichtbar.
  - Bewusst ohne Namen über den Suchen.
- **Technik:** `PageLayoutService.widescreen`, Seite `DealMonitorComponent`
  verwaltet die Suchen, jede Suche ist eine eigene `DealFeedSearchComponent`
  mit eigenem Abruf. Weitere Suchen hängen ihre Nummer an die Feld-IDs an
  (`feed-min-price-2`).

## Offen

- **Suchen merken:** Zusätzliche Suchen und ihre Filter gehen beim Neuladen der
  Seite verloren (wie die Filter der einzelnen Suche bisher auch).
- **Abfragelast:** Der Feed liest nur aus unserer Datenbank (`sniper_feed_search`);
  Vinted und der Bot werden dabei nicht abgefragt, gefiltert wird in der
  Datenbankfunktion. Jede Suche liest alle zwei Sekunden selbst nach, bei vier
  Suchen also vier kleine Datenbankabfragen statt einer. Erst bei spürbarer Last
  bündeln.
- **Weitere Seiten:** Alle übrigen Seiten nutzen im Widescreen-Modus bisher nur
  die volle Breite und müssen einzeln angepasst werden.

## Spätere Idee: geteilter Arbeitsbereich

Flipbase wie Browser-Tabs nebeneinander, ohne echte Browser-Tabs zu öffnen.

- Rechtsklick auf einen Menüpunkt öffnet ein kleines Kontextmenü mit
  „Im zweiten Arbeitsbereich öffnen“ (Arbeitstitel; Alternativen: „Daneben
  öffnen“, „In geteilter Ansicht öffnen“).
- Die Seite teilt sich dann in der Mitte: links die bisherige Seite, rechts die
  neue, zum Beispiel links Artikel erfassen und rechts den Vinted Feed. Ein
  dritter Bereich teilt in Drittel.
- Nur im Widescreen-Modus verfügbar.
- **Zu klären beim Umsetzen:**
  - Bekommt jeder Bereich ein eigenes Menü, oder steuert das eine Menü den
    gerade aktiven Bereich? Am besten mit einem Klickdummy ausprobieren.
  - Jeder Bereich braucht einen eigenen Router-Zustand (z. B. benannte
    Router-Outlets oder eine eigene Adresse je Bereich), damit Zurück-Knopf
    und Neuladen nachvollziehbar bleiben.
  - Breiten der Bereiche fest oder mit verschiebbarem Trenner.
  - Seiten mit Dialogen und mitlaufenden Leisten müssen sich auf ihren Bereich
    beziehen statt auf das ganze Fenster.
