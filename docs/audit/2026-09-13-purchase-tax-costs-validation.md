# Kosten und Steuerberechnung – Umsetzung und Prüfung

Stand: 13. September 2026. Branch `codex/purchase-tax-costs`, Basis
`origin/master` bei `15b07ca`. Freigegebener nächster Schritt nach dem Produkteditor.

## Verhalten

- Die Umsatzsteuer wird für jede Einheit aus ihrer positiven Differenz berechnet.
  Verluste anderer Stücke werden nicht gegengerechnet – auch innerhalb einer
  Mengenposition aus mehreren Einkäufen. Die Bemessungsgrundlage ist netto.
- Einkaufspreis für § 25a und betrieblicher Wareneinsatz sind getrennt. Zusatzkosten
  erhalten eine kleine Herkunftsauswahl: vom Verkäufer berechnet, separat bezahlt
  oder noch zu prüfen. Die Kostenart allein legt die Zuordnung nicht fest.
- Beim Verkaufsabschluss werden Einkaufspreis und Stückkostenaufschlüsselung
  gespeichert. Reparaturen erhöhen die betrieblichen Kosten, nicht den Steuer-EK.
- Nicht zugeordnete historische Kosten bleiben unbekannt. Steuerübersicht und
  Verkaufserfassung zeigen offene Werte; betroffene Steuerexporte bleiben gesperrt.
- Vorsteuer wird nicht mehr aus pauschal unterstellten 19 Prozent der Kosten
  errechnet. Die Übersicht kennzeichnet ausdrücklich, dass sie noch keine
  belegbezogene Vorsteuer berücksichtigt.
- Monatsbericht, Journal und CSV verwenden die berechneten Positionswerte.
  Verkaufsanzahl zählt Vorgänge statt Positionen. Gemischte Steuerarten werden
  nicht als einheitlicher Gesamt-Steuerfall ausgegeben.

## Rechtsgrundlagen der Rechenregeln

§ 25a Abs. 3 UStG verlangt, die enthaltene Umsatzsteuer aus der Differenz
herauszurechnen. Absatz 6 betrifft die Aufzeichnung von Verkaufs-, Einkaufspreisen
und Bemessungsgrundlagen. Die optionale Gesamtdifferenz ist kein Bestandteil
dieser Umsetzung. [Amtlicher Gesetzestext](https://www.gesetze-im-internet.de/ustg_1980/BJNR119530979.html).

Die erneut abgerufene **konsolidierte amtliche UStAE-Fassung, Stand 2. Juni 2026**,
bestätigt in 25a.1 Abs. 8 und 11: Nicht im Einkaufspreis enthaltene spätere Kosten
wie Reparaturen mindern die Bemessungsgrundlage nicht; positive und negative
Einzeldifferenzen werden nicht verrechnet. Damit ist die frühere Handbuchfassung
2024 für diese Aussagen ausdrücklich gegen die aktuelle Fassung geprüft.
[UStAE, PDF-Seite 840 / gedruckte Seite 816](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/Umsatzsteuer-Anwendungserlass-aktuell.pdf?__blob=publicationFile&v=52).

Art. 312 der Mehrwertsteuerrichtlinie bezieht die Gegenleistung an den Lieferer
einschließlich zugehöriger Nebenkosten ein. Vom Warenverkäufer mit der Lieferung
berechneter Versand ist deshalb anders einzuordnen als eine separate
Transportrechnung. [Richtlinie 2006/112/EG](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A02006L0112-20190101).

Der Vorsteuerabzug folgt seinen eigenen Voraussetzungen, insbesondere der
belegten Leistung und Rechnung, nicht allein der Bezeichnung einer Kostenart.
[§ 15 UStG](https://www.gesetze-im-internet.de/ustg_1980/__15.html).

## Datenhaltung und Grenzen

Neue Steuerkostenfelder bleiben für Altbestände leer; es erfolgt keine pauschale
Rückrechnung oder stille Änderung früherer Verkäufe. Die bestehenden
Kostenkorrekturwege erhalten die Klassifizierung und protokollieren Änderungen.
Ursprüngliche steuerliche Verkaufssnapshots bleiben bestehen. Eine spätere
Korrektur des Einkaufs ist keine automatische steuerliche Berichtigung eines
bereits gebuchten Verkaufs.

Die belegbezogene Vorsteuererfassung samt zeitlicher Zuordnung, die Freigabe
historischer ungeklärter Steuerfälle sowie vollständige periodengerechte
Steuerberichtigungen/Gutschriften benötigen eigene Folgeumsetzungen. Die jetzige
Änderung ist eine korrigierte vorläufige Berechnung und sichere Kostengrundlage,
keine fertiggestellte Steuererklärung. Wareneingangsmodell und wertgewichtete
Konvolutverteilung gehören ebenfalls nicht zu diesem Schritt.

## Nachweise

- Der Ausgangsfehler wurde vor der Änderung mit fünf gezielten Regressionstests
  reproduziert: Steuer 3,19 / −3,19 statt 3,19 / 0; Bruttomarge als Nettobasis;
  falsche Behandlung von Reparaturen, unbelegte Vorsteuer und fehlende Prüfsperre.
- 318 gezielte Anwendungstests erfolgreich: 185 Node, 47 DOM, 86 Angular.
- 13 betroffene Browserfälle erfolgreich, einschließlich Desktop 1440 px,
  Mobilgerät 390 px, Persistenz der Kostenherkunft, Steuerjournal und Exportblock.
- AXE/WCAG-AA für neue Kostenherkunft und Steuerjournal erfolgreich;
  keine JavaScript-Laufzeitfehler in den neuen Browserfällen.
- App-/Testtypen, gezieltes ESLint und Produktionsbau erfolgreich.
- Neun Prüfungen der PR-/Nightly-Auswahl und Migrationsprüfung erfolgreich;
  die zwei neuen Kernabläufe sind verpflichtende PR-Browserfälle.
- 24 SQL-Dateien mit 988 erfolgreichen Assertions, darunter 47 neue Regressionen.
  Beide erzeugten Migrationen wurden auf einer leeren isolierten Datenbank
  angewandt; alle zwölf geänderten Funktionen entsprechen dem deklarativen Schema.
- Unabhängige Gegenprüfungen von Steuerberechnung, Oberfläche und Backend ohne
  verbleibende P1/P2 im vereinbarten Umfang. Der Mengenrechenweg wurde zusätzlich
  mit 7.728 Referenzberechnungen je Einheit verglichen.

Browserprüfung über vorhandenes Playwright (`Browser plugin not available`),
lokal unter `http://127.0.0.1:4219`; Screenshots außerhalb des Repositorys
visuell geprüft. Keine Änderung von Produktionsdaten. Nur isolierte lokale
Datenbankinstanzen für Migrationen und SQL-Tests.
