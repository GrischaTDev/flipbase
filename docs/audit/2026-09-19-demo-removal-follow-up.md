# Nachprüfung der Demo-Entfernung

Stand: `master`, Commit `5f78d7f577b143ffbcda59a21818281e0abf2e71` nach PR #131.

Status: Die drei Befunde sind auf `codex/fix-demo-removal-followup` behoben.
Der Bericht bewahrt den geprüften Ausgangszustand und die Abnahmekriterien.

## Urteil und Umfang

Die Entfernung des zentralen Demo-Modus ist umgesetzt. Die weitergehende Aussage,
alle Beispieldaten und lokalen Ersatzpfade seien entfernt, ist jedoch nicht
zutreffend. Drei bestätigte Lücken sollten vor der Weiterarbeit am Inserat-Ersteller
behoben werden. Die betroffenen Stellen waren bereits vor PR #131 vorhanden;
es handelt sich um übersehene Restarbeiten, nicht um nachgewiesene neue Regressionen.

Diese Nachprüfung konzentriert sich auf die zuletzt bearbeiteten Dienste für
Retouren, Preisradar und Versand einschließlich ihrer Aufrufer und Tests. Sie ist
keine erneute vollständige Prüfung aller Einkäufe, Fixkosten, Tabellen oder
Datenbankregeln. Produktivdaten wurden weder gelesen noch verändert.

## 1. Hohe Priorität: Workspace-Isolation bei Retouren und Preisradar

Betroffen: `src/app/core/services/return.service.ts` (Zustand ab Zeile 43,
Laden ab Zeile 83) und `src/app/core/services/price-tracker.service.ts`
(Zustand ab Zeile 39, Laden ab Zeile 84).

Beide Dienste lesen einen globalen Browser-Cache ohne Nutzer- oder
Workspace-Abgrenzung. Beim Wechsel werden alte Daten nicht sofort geleert.
Die Ladeantwort prüft nicht, ob ihr Workspace noch aktuell ist. Bei Abmeldung
räumt der Effekt nicht auf; bei Ladefehlern bleiben alte Daten erhalten.

Reproduktion: Anfrage für A offenhalten, zu B wechseln, B beantworten und danach
A beantworten. Beide Dienste zeigen anschließend wieder Datensätze von A.
Separat bestätigt: gespeicherte Retouren von A erscheinen bereits beim Erzeugen
des Dienstes ohne aktuellen Workspace. Das ist eine lokale Datenisolation-Lücke;
ein Umgehen der Datenbank-Zugriffsregeln wurde damit nicht nachgewiesen.

Abnahme für die Korrektur:

- Geschäftsdaten bei Workspace-Wechsel und Abmeldung sofort zurücksetzen.
- Globale Alt-Caches entfernen oder strikt nach Nutzer und Workspace abgrenzen;
  Daten ohne bestätigten Kontext nicht anzeigen.
- Antworten überholter Anfragen verwerfen, einschließlich Lade-/Fehlerzustand.
- Tests für A/B-Antwortreihenfolge, Abmeldung, Ladefehler und alte Browser-Caches.

## 2. Hohe Priorität: Erfundene Marktpreise werden weiter gespeichert

Betroffen: `src/app/core/services/price-tracker.service.ts`, ab Zeile 144;
Darstellung und Preisanpassung in `src/app/features/research/research.component.html`.

`addTrackedItem` errechnet bei einem eigenen Preis von 100 Euro ohne Datenquelle
einen Marktmittelwert von 95 Euro, einen Tiefstpreis von 88 Euro und eine Empfehlung
von 91,50 Euro. Dazu kommen zwölf angebliche Angebote und ein Unterboten-Alarm.
Diese Werte werden an Supabase zum Speichern übergeben. Der Hinweis
`marktdatenAngebunden = false` verhindert das nicht. Die Oberfläche zeigt weiterhin
Vergleichswerte und eine Schaltfläche zur Preisanpassung.

Abnahme für die Korrektur:

- Ohne echte Quelle sind Marktpreise, Verlauf und Wettbewerber ausdrücklich unbekannt.
- Keine daraus abgeleiteten Alarme oder Preisanpassungen anbieten oder ausführen.
- Eigene Preisbeobachtungen dürfen weiter gespeichert werden.
- Bereits gespeicherte synthetische Vergleichswerte bei der Umsetzung berücksichtigen;
  keine echten Nutzerdaten pauschal löschen.
- Tests prüfen den Inhalt der Datenbank-Schreibanfrage und die gesperrten Aktionen,
  nicht nur einen erfolgreichen Speichervorgang.

## 3. Mittlere Priorität: Beispiel-Absender im Versand

Betroffen: `src/app/core/services/fulfillment.service.ts`, ab Zeile 416;
`src/app/features/fulfillment/fulfillment.component.html`, ab Zeile 504.

`getSenderAddress` liefert weiterhin fest eingebaute Firmen- und Adressdaten
(Gewerbestraße 10, 10115 Berlin). Die druckbare Etikettenansicht verwendet diese
Daten. Auch die Standardkonfiguration enthält Beispiel-Kundennummern und
voreingeschaltete Versanddienstleister. Entfernte Beispielbestellungen allein
machen diesen Bereich noch nicht frei von Beispieldaten.

Abnahme für die Korrektur:

- Absender nur aus tatsächlich hinterlegten Workspace-Einstellungen beziehen.
- Bei fehlenden Daten einen verständlichen Leerzustand anzeigen und einen
  vermeintlich fertigen Etikettendruck verhindern.
- Beispiel-Kundennummern entfernen und fehlende Versand-Anbindung eindeutig darstellen.
- Test mit leerem Workspace-Profil sowie einem vollständig eingerichteten Profil.

## Tatsächlich ausgeführte Prüfungen

- Bestehende Node-Tests für Retouren, Preisradar und Versand: 28 von 28 bestanden.
- Fünf temporäre DOM-Reproduktionen bestätigten das vorhandene Fehlverhalten:
  globaler Retouren-Cache, verspätete Antworten in beiden Diensten, erfundene
  Marktwerte in der Schreibanfrage und erfundene Absenderadresse. Diese Prüfungen
  erwarteten ausdrücklich das Fehlverhalten; ihr grünes Ergebnis ist kein Fix.
  Die temporäre Testdatei wurde anschließend entfernt.
- Kein neuer Gesamt-Testlauf, Produktionsbau oder Browser-Ende-zu-Ende-Test.
- Im Hauptverzeichnis fehlten die installierten Abhängigkeiten. Der erste Teststart
  über `npx` scheiterte beim Start des ersatzweise geladenen Vitest 5.0.1. Die oben
  genannten erfolgreichen Läufe verwendeten anschließend das vorhandene Vitest
  4.1.11 aus dem lokalen Audit-Worktree über eine temporäre Verzeichnisverknüpfung.
- Keine Änderungen am Anwendungscode, keine Fehlerbehebung, kein Push oder Merge.

Empfohlene Reihenfolge: Workspace-Isolation, verlässliche Radar-Leerzustände,
Versand-Absender. Danach die gezielten Regressionstests und die vorgeschriebenen
PR-Prüfungen durchführen, bevor der Inserat-Ersteller fortgesetzt wird.
