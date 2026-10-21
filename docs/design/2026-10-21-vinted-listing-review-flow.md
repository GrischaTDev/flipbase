# Inserat erstellen und anschließend prüfen

Stand: 21.10.2026. Nutzer bestätigt den Ablauf mit zwei Schritten; Umsetzung freigegeben.

## Nutzerwunsch

Die KI-Fotoangabe gehört direkt zu den Fotos im Erstellformular. Die zusätzliche
Checkbox zur Erlaubnis von Inserataktionen und der zugehörige Freigabeblock sollen
entfallen. Der bisherige große Prüfdialog stört. Ein Ablauf mit zwei Schritten
wurde als mögliche Alternative angesprochen.

## Vorgeschlagener Ablauf

Oben steht eine kompakte Schrittanzeige: **1. Erstellen → 2. Prüfen**.

1. **Erstellen:** Bestehende Aufteilung mit Fotos, Titel und Beschreibung links,
   Artikeldetails, Preis und Versand rechts. Unter der Galerie steht die Option
   „Meine Fotos wurden mit KI erstellt oder verändert“. „Entwurf speichern“
   bleibt unabhängig von der Veröffentlichungsreife möglich. „Weiter zur Prüfung“
   prüft die Angaben, zeigt fehlende Angaben am Feld und sichert den Entwurf vor
   dem Wechsel.
2. **Prüfen:** Eine ganze Inhaltsseite ersetzt das Modal. Sie zeigt Fotos, Titel,
   Beschreibung, Artikeldetails, Preis, Zielkonto, KI-Fotostatus und den
   Veröffentlichungszeitpunkt. „Zurück zum Bearbeiten“ erhält den Entwurf und die
   gewählten Optionen. Die endgültige Aktion heißt „Jetzt veröffentlichen“ oder
   „Veröffentlichung planen“. Erst diese Aktion erteilt einen Auftrag.

Die zweite Seite bleibt Teil desselben Editors. Keine zusätzliche Taböffnung und
kein zusätzlicher dritter Schritt. Die Aufteilung ist durch die Nutzerentscheidung zu zwei Schritten freigegeben.

## Technische Grenzen und Abnahme

- Die zusätzliche Erlaubnis-Checkbox, ihre Erklärung und die Freigabeverwaltung
  verschwinden aus der Prüfung. Bestehende serverseitige Konto-, Workspace- und
  Rechteprüfungen bleiben wirksam. Die nötige Kontofreigabe erfolgt beim
  ausdrücklichen abschließenden Veröffentlichungsauftrag.
- Die KI-Fotoangabe darf beim Wechsel zurück zum Editor, beim erneuten Prüfen
  und beim Speichern und Wiederöffnen des Entwurfs nicht verloren gehen. Im
  aktuellen Stand ist sie nur ein temporärer Zustand des Prüfdialogs; eine
  Umsetzung muss daher auch die Speicherung und die Auftragsübernahme abdecken.
- Während des Absendeversuchs bleiben eingefrorene Auftragsdaten, Wiederholung
  desselben Auftrags und der Schutz vor doppelter Veröffentlichung erhalten.
- Zurück-Navigation, Fokus und Änderungen von Konto/Workspace dürfen keine
  veraltete Prüfung oder Veröffentlichung ermöglichen.
- Vorhandene gezielte Modell-, Komponenten- und Browserfälle anpassen und
  ausführen. Schmale Ansicht, Touch, Hell/Dunkel, Tastatur und AXE berücksichtigen.
  Angular-Bau, Typen, Formatierung und gezieltes Lint bleiben erforderlich.
- Falls die persistente Fotoangabe eine Datenbankanpassung benötigt, gehören
  deklaratives Schema, erzeugte Migration und passende Datenbanktests zusammen.
- Keine echte Veröffentlichung, kein Duplikat und keine Änderung des bestehenden
  JAKO-Inserats im Rahmen der Entwicklungstests.

## Entscheidungsstand

Der Nutzer bestätigt ausdrücklich „Ja, zwei Schritte“. Der beschriebene Ablauf
ist damit zur Umsetzung freigegeben. Eine echte Veröffentlichung gehört weiterhin
nicht zu den Entwicklungstests.
