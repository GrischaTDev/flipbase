# Verbindliche Testregeln

Aktueller CI-Umfang: [Schlanke CI für Flipbase](lean-ci.md). Die sechs allgemeinen
Browser-Kernfälle laufen automatisch; zusätzliche Featureprüfungen werden vor
einem betroffenen Merge gezielt ausgeführt. Es gibt keine geplanten Zusatzläufe.

Tests schützen beobachtbares Produktionsverhalten und die fachlichen Risiken von Flipbase. Jeder neue Test braucht deshalb drei klar erkennbare Bestandteile:

1. einen Aufruf von Produktionscode,
2. ein von außen beobachtbares Ergebnis,
3. ein im Testnamen oder Testkontext benanntes fachliches Risiko.

Sollwerte werden unabhängig und möglichst als handgeprüfte Literale festgelegt. Ein Test darf seine Erwartung nicht mit derselben Logik berechnen, die er prüfen soll.

## Welche Tests bleiben

Tests für Geld, Bestand, Verkauf, Retoure, Steuer, Export, RLS, Rechte und frühere Produktionsfehler bleiben erhalten. In diesen Bereichen kann ein kleiner Fehler unmittelbar zu falschen Buchungen, Datenverlust oder unzulässigem Zugriff führen.

## Welche Tests ersetzt werden

Reine Quelltextsuche wird durch die Ausführung des betroffenen Artefakts ersetzt. Prüfungen privater Angular-APIs werden durch sichtbares DOM- oder Komponentenverhalten ersetzt. Prototyp-Aufrufe werden ersetzt, wenn das Verhalten über eine echte Instanz oder für Benutzer sichtbar geprüft werden kann.

## Wann ein Test gelöscht werden darf

Ein Test darf nur gelöscht werden, wenn mindestens einer dieser Gründe nachweisbar ist:

- Er ruft keinen Produktionscode auf.
- Er ist ein vollständiges Duplikat.
- Die geprüfte Funktion wurde entfernt.
- Ein stärkerer Ersatz deckt dasselbe Risiko stabil und nachweislich ab.

Ein Test wird niemals allein deshalb gelöscht, weil er alt, unbequem oder langsam ist.

## Passende Testebene wählen

- **Node:** reine Geschäftslogik, Berechnungen, Transformationen und Exportformatierung ohne Browser.
- **DOM/Angular:** sichtbares UI-Verhalten, Formulare, Fokus, Zugänglichkeit und Komponenteninteraktion.
- **Supabase/pgTAP:** RLS, Rechte, Datenintegrität, Constraints und Datenbankfunktionen.
- **Playwright:** ausschließlich kritische Benutzerwege, bei denen mehrere echte Oberflächen und Systemgrenzen zusammenspielen.

Vor dem Abschluss wird eine realistische Produktionsmutation gedanklich oder kontrolliert geprüft. Der zuständige Test muss bei einem falschen Wert, einer falschen Verzweigung oder einer fehlenden Wirkung rot werden und nach der Wiederherstellung grün laufen.
