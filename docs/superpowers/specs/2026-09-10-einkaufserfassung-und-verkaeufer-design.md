# Einkaufserfassung und Verkäuferverwaltung

**Datum:** 2026-09-10  
**Status:** fachlich im Dialog freigegeben; schriftliche Abnahme und Umsetzungsplan ausstehend  
**Ersetzt beziehungsweise präzisiert:** den Einkaufsablauf aus dem Design vom
31.08.2026 und die Umsetzung aus PR 39

## Ziel

Flipbase bildet künftig den normalen Einkauf bekannter Waren ab. Der
Standardablauf besteht aus Verkäufer, Produktpositionen, Mengen und Preisen.
Plattformen, Profile, Bezugsquellen und unbekannte Mystery-Inhalte bestimmen die
Erfassung nicht mehr.

Der Kernablauf lautet:

```text
Verkäufer wählen oder erstellen
  → Produkte wählen oder erstellen
  → Menge und Einkaufspreis je Position erfassen
  → Warenwert automatisch berechnen
  → optionale Zusatzkosten ergänzen
  → als bestellt markieren
  → optional eine Sendungsverfolgung hinterlegen
  → Ankunft manuell bestätigen
  → Erfassung abschließen
```

Für Pakete mit bekannten Positionen, aber nur einem Gesamtpreis, gibt es eine
gezielte Ausnahme: Der Gesamtpreis wird gleichmäßig auf die vorhandenen
Produktpositionen verteilt, unabhängig von deren Stückzahl.

## Verbindliche Begriffe

Die Oberfläche verwendet durchgehend **Verkäufer**. Texte wie „Quelle“,
„Bezugsquelle“, „Lieferant“ oder „Profil“ entfallen aus dem Einkaufsbereich.

Interne englische Bezeichner dürfen weiterhin `supplier` verwenden. Dieser
Begriff ist technisch korrekt und wird nicht angezeigt. Das eigenständige
Fachmodell `sources` wird dagegen vollständig entfernt.

Weitere verbindliche Texte:

| Bedeutung                   | Nutzertext                |
| --------------------------- | ------------------------- |
| Verkäuferkennung            | Verkäufer                 |
| externe Vorgangskennung     | Referenznummer (optional) |
| interne Freitextangabe      | Beschreibung (optional)   |
| gespeicherte Trackingnummer | Tracking hinterlegt       |
| Warenwert aus Positionen    | Warenbetrag               |
| weitere Beschaffungskosten  | Zusätzliche Kosten        |

## Verkäuferverwaltung

### Navigation und Seite

Die bisherige Seite „Quellen & Lieferanten“ wird durch die Seite **Verkäufer**
unter `/sellers` ersetzt. Der Quellen-Tab, das Quellenformular und das gesamte
Kartenraster entfallen.

Der Seitenkopf enthält die Anzahl der Verkäufer und die Hauptaktion
**Verkäufer erstellen**. Darunter steht eine Shopify-nahe Verwaltungstabelle.
Die Tabelle verwendet denselben Rahmen, dieselbe Dichte, dieselben Zustände und
dieselbe mobile Strategie wie die übrigen modernisierten Admin-Tabellen.

Vorgesehene Spalten:

- Name beziehungsweise Firmenname;
- Typ: Unternehmen oder Privatperson;
- Kontaktperson;
- E-Mail und Telefon;
- Ort und Land;
- Status;
- Aktionen.

Oberhalb der Tabelle gibt es genau den fachlichen Typfilter **Alle**,
**Unternehmen** und **Privatpersonen**. Archivierte Verkäufer werden über die
separate Aktion **Archivierte anzeigen** erreichbar, nicht über einen zweiten
Hauptfilter. Die Tabelle besitzt verständliche Lade-, Leer-, Fehler- und
Keine-Treffer-Zustände.

Erstellen und Bearbeiten verwenden denselben Verkäuferdialog. Ein archivierter
Verkäufer bleibt an vorhandenen Einkäufen sichtbar, steht aber bei neuen
Einkäufen nicht mehr zur Auswahl. Ein verknüpfter Verkäufer wird nicht hart
gelöscht.

### Verkäuferdialog

Der Dialog unterscheidet zwei Typen:

**Unternehmen**

- Firmenname, verpflichtend;
- Kontaktperson, optional;
- Anschrift;
- Land;
- E-Mail;
- Telefon;
- Website, optional;
- Notizen, optional.

**Privatperson**

- Vor- und Nachname, verpflichtend;
- Anschrift;
- Land;
- E-Mail;
- Telefon;
- Website, optional;
- Notizen, optional.

„Name oder Profilname“ und „Plattform / Profilverweis“ entfallen. Das Feld
`profile_url` wird aus Oberfläche, Typen und Datenbank entfernt.

Das Land ist eine alphabetisch nach deutschem Anzeigenamen sortierte Select-Box
mit ISO-3166-Ländercodes. Gespeichert wird der zweistellige Ländercode, nicht der
übersetzte Anzeigename.

Das optionale Telefonfeld erhält eine integrierte Länderwahl mit Flagge,
Länderkürzel und Vorwahl. Dafür ist vor der Installation die aktuelle stabile,
mit Angular 22 kompatible Version des offiziellen Pakets
`@intl-tel-input/angular` zu prüfen. Die Nummer wird vollständig im
E.164-Format gespeichert. Eine zweite Datenbankspalte für die Telefonvorwahl ist
nicht erforderlich.

### Verkäuferauswahl im Einkauf

Die Verkäuferauswahl zeigt aktive Verkäufer alphabetisch. Am Ende des geöffneten
Dropdowns steht dauerhaft **Verkäufer erstellen**. Nach erfolgreichem Speichern
wird der neue Verkäufer automatisch ausgewählt. Abbruch oder Speicherfehler
verändern die bisherige Auswahl nicht.

## Einkaufserfassung

### Vereinfachtes Formular

Folgende Eingaben entfallen vollständig:

- Plattform / Bezugsquelle;
- Auswahl „Inhalt bekannt / unbekannt“;
- Auswahl einer Einkaufsart wie Einzelkauf, Paket, Palette oder Mystery Box;
- Mystery-Box-Schwerpunkt;
- sichtbarer Modusschalter „Gesamtpreis / Einzelpreise“;
- Beleg- oder Angebotslink;
- separate interne Notiz;
- manuelle Eingabe des Warenbetrags in der Kostenübersicht.

`source_id`, `original_url`, `type` und `content_status` werden aus dem aktiven
Einkaufsmodell entfernt. Die
eigenständige Tabelle `sources`, ihre Oberfläche, Services, Navigation,
Auswertungen und Exportbestandteile entfallen. Vorhandene Quelldaten werden nicht
in ein neues Modell überführt.

Die optionale **Referenznummer** bleibt bestehen. Sie bezeichnet beispielsweise
die Angebots-, Bestell- oder Rechnungsnummer des Verkäufers. Die optionale
**Beschreibung** ist ein mehrzeiliges internes Textfeld und ersetzt die bisherige
doppelte Notizstruktur.

### Produktpositionen

Der normale Ablauf beginnt mit mindestens einer Produktposition. Eine Position
enthält:

- Produkt;
- Menge, standardmäßig `1`;
- Einkaufspreis pro Stück;
- automatisch berechneten Gesamtbetrag.

Der Warenbetrag ist die Summe aller Positionsbeträge und wird nur angezeigt,
nicht nochmals eingegeben. Eine Preisänderung oder Mengenänderung aktualisiert
Position und Kostenübersicht sofort.

Die Produktauswahl bietet am Ende **Produkt erstellen**. Die vollständige
Produkterstellung enthält die bereits benötigten Stammdaten und die
Bildauswahl. Das Einkaufsformular speichert kein separates Positionsbild,
sondern zeigt das Bild des gewählten Produkts.

### Paketpreis verteilen

In der Kostenübersicht steht die sekundäre Aktion **Paketpreis verteilen**. Sie
ist erst bedienbar, wenn mindestens eine gültige Produktposition vorhanden ist.

Der Dialog enthält:

- den Gesamtpreis der Waren;
- die Anzahl der Produktpositionen;
- eine kurze Erklärung der Verteilung;
- **Abbrechen** und **Preis verteilen**.

Die Verteilung erfolgt gleichmäßig je Produktposition und ausdrücklich
unabhängig von der Stückzahl. Erst innerhalb einer Position wird deren Anteil
auf die enthaltenen Stücke verteilt.

Beispiel:

```text
Paketpreis: 100,00 €

Position A, Menge 1   → 25,00 € gesamt → 25,00 € je Stück
Position B, Menge 5   → 25,00 € gesamt →  5,00 € je Stück
Position C, Menge 2   → 25,00 € gesamt → 12,50 € je Stück
Position D, Menge 1   → 25,00 € gesamt → 25,00 € je Stück
```

Die Datenbank verteilt Rundungsreste deterministisch und centgenau in stabiler
Positionsreihenfolge. Der gespeicherte Paketpreis und die Summe aller
Positionsanteile müssen exakt übereinstimmen. Wenn sich Positionen oder Mengen
danach ändern, wird die Verteilung als veraltet markiert und muss erneut
bestätigt werden; Flipbase verändert den bestätigten Paketpreis nicht
unbemerkt.

Die technische Berechnungsgrundlage bleibt gespeichert, damit Flipbase
unterscheiden kann, ob der Warenbetrag aus eingegebenen Einzelpreisen oder aus
einem verteilten Paketpreis stammt. Sie beschreibt eine aktuelle Berechnung und
keinen alten Einkaufsstatus. Dieser Unterschied benötigt keinen dauerhaften
Schalter in der Oberfläche.

### Kostenübersicht

Die Kostenübersicht zeigt:

```text
Warenbetrag                 aus Positionen oder Paketpreis
Zusätzliche Kosten          Versand, Zoll, Versicherung, sonstige Kosten
Rabatt                      falls vorhanden
Gesamtsumme                 automatisch berechnet
```

Zusätzliche Kosten werden über **Kosten hinzufügen** gepflegt. Der Nutzer gibt
den Warenbetrag nicht doppelt ein. Bestehende fachliche Regeln zur Verteilung
der Zusatzkosten und zur Kostenkorrektur nach einem Verkauf bleiben erhalten.

Eine spätere Änderung der Kostenverteilung erfolgt am Einkauf über den
Korrekturablauf. Der Verkaufsdialog verändert niemals rückwirkend den Einkauf.

## Einkaufsstatus

Der nutzerseitige Hauptablauf lautet:

```text
Entwurf → Bestellt → Angekommen
```

Eine Teillieferung bleibt als abgeleiteter Zustand erhalten, wenn nur ein Teil
der bestellten Menge eingebucht wurde. Abschluss und Archivierung bleiben
separate Aktionen.

Der Einkaufsstatus **Unterwegs** wird vollständig aus dem Hauptablauf entfernt:

- kein Button „Als unterwegs markieren“;
- kein Unterwegs-Filter;
- keine Pflicht zur Sendungsnummer;
- kein versteckter Unterwegs-Status für Altdaten;
- keine automatische Ableitung des Einkaufsstatus aus einer Trackingnummer.

Das bisherige Feld `shipment_status` entfällt vollständig. Stattdessen speichert
ein optionaler Ankunftszeitpunkt nur noch, ob und wann die tatsächliche Ankunft
manuell bestätigt wurde. Vorhandenes `in_transit` wird nicht übernommen;
vorhandenes `arrived` darf in den Ankunftszeitpunkt überführt werden, weil es den
weiterhin gültigen Sachverhalt „Angekommen“ beschreibt. Der Hauptstatus wird aus
Entwurf/Bestellung, Ankunft, Wareneingang und Abschluss abgeleitet.

## Optionale Sendungsverfolgung

Eine Sendungsverfolgung darf nach der Bestellung unabhängig vom Einkaufsstatus
hinzugefügt, bearbeitet oder entfernt werden. Nummer und Versanddienstleister
sind nur erforderlich, wenn Tracking gespeichert werden soll.

Aktuell wird keine Paketdienst-API abgefragt. Bis zu einer echten Anbindung zeigt
Flipbase deshalb ausschließlich:

- **Tracking hinterlegt**;
- Versanddienstleister und Nummer;
- Link zur offiziellen Tracking-Seite.

Eine vorhandene Nummer setzt nicht mehr automatisch den Trackingstatus
„Unterwegs“. Erfundene Checkpoints und Zustellprognosen bleiben entfernt.

Eine spätere API-Anbindung aktualisiert ausschließlich den getrennten
Trackingbereich, beispielsweise mit „Unterwegs“, „In Zustellung“, „Zugestellt“
oder „Problem“ sowie dem Zeitpunkt der letzten Aktualisierung. Zugangsdaten und
Abfragen gehören dann in das Backend, nicht in den Angular-Client. Selbst ein
gemeldetes „Zugestellt“ bucht keinen Bestand und setzt den Einkauf nicht
automatisch auf „Angekommen“; die tatsächliche Warenannahme bleibt eine bewusste
Nutzeraktion.

Die externe API-Anbindung selbst gehört nicht zum aktuellen Umsetzungspaket.
Der aktuelle Umbau beseitigt nur die falsche Statusannahme und hält den
Trackingbereich dafür unabhängig.

## Statusdarstellung

Liste und Detailseite verwenden eine gemeinsame Zuordnung von Einkaufsstatus zu
`BadgeComponent`-Farbtönen:

| Status                  | Farbton  |
| ----------------------- | -------- |
| Entwurf                 | neutral  |
| Bestellt                | info     |
| Prüfung erforderlich    | caution  |
| Teillieferung           | caution  |
| Angekommen              | success  |
| Erfassung abgeschlossen | success  |
| Storniert               | critical |
| Archiviert              | neutral  |

Die Einkaufsliste zeigt nicht länger einfachen schwarzen Statustext. Dieselbe
Präsentationsfunktion liefert Bezeichnung und Farbton für Tabelle, Detailkopf
und Filterlogik. Der optionale Trackingstatus verwendet eigene Badges und wird
nicht mit dem Einkaufsstatus vermischt.

## Chronik

### Fehlerursache

Normale Entwurfsänderungen und Statuswechsel aktualisieren `purchases` aktuell
ohne Eintrag in `business_events`. Die Chronik liest jedoch ausschließlich
`business_events` und Kommentare. Außerdem wird sie nach erfolgreichen
Änderungen nicht neu geladen. Deshalb fehlen die beobachteten Vorgänge
vollständig oder erscheinen erst nach einem Seitenwechsel.

### Zielverhalten

Jede fachliche Änderung erzeugt genau einen verständlichen Chronikeintrag:

- **Einkauf bearbeitet** für einen Speichervorgang; nur tatsächlich geänderte
  Felder und Positionen werden aufgenommen;
- **Als bestellt markiert**;
- **Ankunft bestätigt**;
- **Sendungsverfolgung hinzugefügt**, **geändert** oder **entfernt**;
- bestehende Einträge für Abschluss, Wiedereröffnung und Kostenkorrektur.

Änderung und Ereignis werden in derselben Datenbanktransaktion gespeichert.
Direkte Client-Updates für diese Abläufe werden durch klar begrenzte
Datenbankfunktionen ersetzt oder in vorhandene atomare Funktionen integriert.
Das Ereignis enthält Workspace, Einkauf, Ereignisart, Benutzer, Zeitpunkt sowie
vorherige und neue Werte. Geheimnisse und unnötige personenbezogene Daten werden
nicht aufgenommen.

Nach erfolgreichem Speichern erhält die Chronik einen eindeutigen
Aktualisierungsimpuls und lädt die erste Seite neu. Bei einem Fehler bleibt der
vorherige Zustand sichtbar und die Anwendung zeigt eine verständliche Meldung.

## Datenbank und Migration

Schemaänderungen werden zuerst in den thematisch passenden Dateien unter
`supabase/schemas/` definiert und anschließend als neue Migration erzeugt. Bereits
vorhandene Migrationen werden nicht geändert.

Vorgesehene Änderungen:

- `public.sources` und zugehörige Policies, Funktionen und Verknüpfungen
  entfernen;
- `purchases.source_id` entfernen;
- `purchases.original_url` entfernen;
- `purchases.type` und `purchases.content_status` entfernen;
- `suppliers.profile_url` entfernen;
- das bisherige Verkäuferland durch `country_code` als
  ISO-3166-Ländercode ersetzen;
- `purchases.shipment_status` durch einen optionalen Ankunftszeitpunkt ersetzen;
  `in_transit` wird nicht übernommen;
- die automatische Vorgabe `tracking_status = 'in_transit'` bei vorhandener
  Nummer entfernen;
- atomare Ereigniserzeugung für Einkauf bearbeiten, bestellen, Ankunft und
  Tracking ergänzen;
- Supabase-Typen nach der Migration neu erzeugen;
- Auditexport und Prüfsnapshot an die entfernten Felder und Tabellen anpassen.

Die Migration löscht keine vollständigen Einkäufe, Verkäufe oder Bestände.
Obsolete Quelldaten und die ausdrücklich entfernten Profil-/Linkfelder werden
nicht übernommen. Der automatische Deployment-Ablauf sichert die Datenbank vor
der Migration gemäß bestehender Projektregel.

## Fehlerbehandlung und Barrierefreiheit

- Dialoge besitzen eindeutige Titel, Beschreibungen, Fokusführung und
  Fokus-Rückgabe.
- Selects und Telefonnummerneingabe sind vollständig per Tastatur bedienbar und
  haben programmatisch verknüpfte Bezeichnungen und Fehlermeldungen.
- Flaggen sind dekorativ; Land und Vorwahl werden immer als Text ausgegeben.
- Tabellenaktionen besitzen verständliche zugängliche Namen.
- Lade-, Leer-, Keine-Treffer- und Fehlerzustände bleiben unterscheidbar.
- Speichervorgänge verhindern Doppelklicks und verändern die Oberfläche erst
  nach bestätigtem Erfolg beziehungsweise über einen rücksetzbaren optimistischen
  Zustand.
- Rundungs- oder Verteilungsfehler verhindern das Speichern und nennen die
  betroffene Position.

## Tests und Abnahme

Die Umsetzung beginnt testgetrieben und deckt mindestens ab:

1. Verkäuferdialog für Unternehmen und Privatperson;
2. alphabetische Länderliste, ISO-Code und E.164-Telefonnummer;
3. Verkäufererstellung aus dem Dropdown samt automatischer Auswahl;
4. Verkäuferseite als Tabelle mit Typfilter, Archivansicht und Zuständen;
5. Entfernung aller sichtbaren Quellen-, Profil-, Mystery- und Angebotsfelder;
6. Positionssumme aus Menge und Stückpreis;
7. positionsgleiche Paketpreisverteilung einschließlich Rundungsresten und
   Mengen größer als eins;
8. ungültig gewordene Verteilung nach Positionsänderung;
9. Statusfolge Entwurf → Bestellt → Angekommen ohne Trackingpflicht;
10. optionales Tracking ohne fingierten Live-Status;
11. gemeinsame Badge-Farben in Liste und Detailseite;
12. atomare Chronikeinträge mit Vorher-/Nachher-Werten und sofortiger
    Aktualisierung;
13. Datenbankregeln, RLS, Berechtigungen und Migration;
14. bestehende Abschluss-, Korrektur-, Bestands- und Verkaufsabläufe.

Vor dem Push werden betroffene Tests, Formatierung, Lint, Typprüfung,
Datenbanktests und Angular-Bau ausgeführt. Vor dem Pull Request folgt die
vollständige projektübliche Prüfung. Die Oberfläche wird zusätzlich im Browser
für Desktop, schmale Ansicht, Tastaturbedienung und AXE geprüft.

## Abgrenzung

Nicht Bestandteil dieses Pakets sind:

- die tatsächliche Anbindung externer Paketdienst-APIs;
- automatische Hintergrundabfragen oder Webhooks von Paketdiensten;
- eine neue Steuer- oder Buchhaltungslogik;
- eine pauschale Neuerfassung oder Löschung vollständiger alter Einkäufe;
- Umbauten außerhalb von Verkäufern, Einkäufen und direkt betroffenen
  Auswertungs-/Exportverknüpfungen.
