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
- **Datenquelle:** Der Feed liest nur aus unserer Datenbank (`sniper_feed_search`);
  Vinted und der Bot werden dabei nicht abgefragt, gefiltert wird in der
  Datenbankfunktion. Jede Suche schaut alle zwei Sekunden nach neuen Funden,
  das ist für die Datenbank eine kleine Abfrage.
- **Übersicht (`DashboardComponent`, ergänzt am 08.11.2026):**
  - Statt den gestapelten Aufbau nur in die Breite zu ziehen, teilt sich die
    Übersicht im Widescreen-Modus ohne vertikalen Seiten-Scrollbalken in drei
    gleich breite Spalten (`xl:grid-cols-3`) über die verfügbare Bildschirmhöhe:
    - **Linke Spalte:** Oben stehen die vier Kennzahl-Kacheln (`Umsatz`, `Gewinn`,
      `Marge`, `Verkäufe`) ohne eigene Mini-Charts nebeneinander in einer Reihe.
      Darunter füllt die Karte „Zeitraum- und Kostenübersicht“ (Aufschlüsselung
      nach Zeitraum mit Verkäufen, Umsatz, Wareneinsatz, Verkaufskosten,
      Ausgaben gesamt, Marge und Gewinn) den restlichen Platz bis zum unteren Rand.
    - **Mittlere Spalte:** Enthält oben die Schnellaktionen, darunter das
      Hauptdiagramm „Umsatz, Ausgaben und Gewinn“ (das sich dynamisch an die
      verfügbare Höhe anpasst) und unten „Bestand im Blick“ inklusive Bestandswert.
      Ist das Shop-/Bestands-Feature deaktiviert, wird „Bestand im Blick“
      ausgeblendet und das Hauptdiagramm dehnt sich über die gesamte verbleibende
      Höhe der mittleren Spalte aus.
    - **Rechte Spalte:** „Letzte Verkäufe“ läuft über die volle Spaltenhöhe mit
      unveränderter Zeilenhöhe und den gewohnten vier Spalten (`Datum`, `Artikel`,
      `Plattform`, `Gewinn`) sowie bis zu zwölf Einträgen pro Seite.
- **Einkäufe (`PurchasesComponent`) & Verkäufe (`SalesComponent`, ergänzt am 08.11.2026):**
  - Nutzen im Widescreen-Modus eine zweispaltige 50/50-Master-Detail-Ansicht
    (`xl:grid-cols-2`) mit direkt integrierter Inline-Erfassung:
    - **Linke Hälfte (`[data-purchases-master]` / `[data-sales-master]`):** Die
      Tabellenansicht (bei Verkäufen inklusive Kennzahl-Kacheln und Entwürfen).
    - **Rechte Hälfte (`[data-purchases-detail-pane]` / `[data-sales-detail-pane]`):**
      - Ein Klick auf eine Tabellenzeile öffnet rechts sofort die Detailansicht
        (bei Einkäufen die vollständige `PurchaseDetailComponent`, bei Verkäufen
        die Detailkarte mit Positionen, Kennzahlen, Beleg-/Retouren-Aktionen und
        direkt eingebetteter Chronik). Standardmäßig wird der erste sichtbare
        Eintrag angezeigt.
      - Ein Klick auf „Einkauf erfassen“ bzw. „Verkauf erfassen“ (oder „Verkauf
        korrigieren“) schaltet die rechte Bildschirmhälfte direkt auf die
        Erfassungsmaske (`PurchaseCreateComponent` / `SaleCreateComponent`) um,
        ohne die Seite zu verlassen.
- **Marktplatzübersicht (`MarketplaceOverviewComponent`, ergänzt am 08.11.2026):**
  - Zeigt die aktivierten Marktplätze (`Vinted`, `eBay`, `Kleinanzeigen`) im
    Widescreen-Modus nebeneinander in eigenen Spalten (`xl:grid-cols-3` bei drei
    aktiven Plattformen, `xl:grid-cols-2` bei zwei aktiven Plattformen), sodass
    Konten, Abgleichstatus und ausgeklappte Inseratstabellen aller Kanäle direkt
    nebeneinander verglichen und Crosslistings beobachtet werden können.
  - Übertragbare Vinted-Inserate lassen sich ohne zusätzliche Drag-Icons direkt
    per Drag-and-Drop auf die Kleinanzeigen-Spalte (oder gezielt auf ein
    Kleinanzeigen-Konto) ziehen, um die vorausgefüllte Inseratsübertragung zu
    öffnen.

## Offen

- **Suchen merken:** Zusätzliche Suchen und ihre Filter gehen beim Neuladen der
  Seite verloren (wie die Filter der einzelnen Suche bisher auch).
- **Weitere Seiten:** Alle übrigen Seiten neben Vinted Feed, Übersicht, Einkäufen,
  Verkäufen und Marktplatzübersicht nutzen im Widescreen-Modus bisher nur die
  volle Breite und werden schrittweise einzeln angepasst.

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
