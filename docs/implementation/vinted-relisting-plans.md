# Relist-Planungen bearbeiten und abschließen

Stand: 02.11.2026. Umsetzung: Juna.

## Bearbeitung

Beim Öffnen speichert der Auftrag seinen bisherigen Zustand und Fehler, bevor
die Ausführung pausiert. Schließen stellt beides wieder her. Ein fehlgeschlagener
Auftrag wird dadurch nicht erneut ausführbar; auch eine vorherige Pause bleibt
erhalten. Wiederholtes Öffnen überschreibt diese Sicherung nicht. Ältere bereits
unterbrochene Bearbeitungen ohne Sicherung bleiben beim Schließen angehalten.
Versionsvergleich und Zeilensperre verhindern Änderungen an inzwischen
übernommenen Aufträgen.

Die Karte im Kleiderschrank liest Inhalt und Originalfotos aus der unveränderlichen
Auftragsaufnahme. Der Editor lädt weiterhin den Arbeitsentwurf. Scheitert dessen
anschließende Beauftragung, bleiben neuere Eingaben dort erhalten, während die
Karte den tatsächlich angenommenen Inhalt zeigt. Der Client prüft Konto,
Entwurfskennung, Revision und Relist-Quelle der gelieferten Aufnahme. Die
bisherigen Auftragsfelder bleiben zusätzlich auf derselben Antwortebene
erhalten, damit bereits geöffnete Appversionen weiter lesen können.

## Veröffentlichung und Import

Nach bestätigter Veröffentlichung bleibt die Karte mit neuer Anbieterkennung
sichtbar. Alte und gegebenenfalls bereits vorhandene neue Cachekarten werden
während dieses Übergangs ausgeblendet. Ein kontogebundener Leseauftrag gleicht
das Ergebnis ab; die bestehende Leseautorisierung wird erneut geprüft.

Es läuft höchstens ein solcher Kontoabgleich gleichzeitig. Lief bereits vor der
Veröffentlichung ein Abgleich, wird nach dessen Abschluss bei Bedarf genau ein
Folgeauftrag angestellt. Fehlgeschlagene Abgleiche werden frühestens nach einer
Minute wiederholt. Maßgeblich ist die serverseitige Abschlusszeit, damit eine
abweichende Anbieteruhr diese Begrenzung nicht aufhebt.

Erst wenn die neue Kennung importiert und die alte entfernt ist, markiert die
Datenbank den Übergang dauerhaft als abgeglichen. Der Client lädt anschließend
die aktualisierte Lesekopie, bevor er die bestätigte Karte entfernt. Bei einem
Fehler oder einem noch laufenden Abruf bleibt sie stehen. Ein Kontowechsel
verwirft verspätete Antworten. Ein späteres Entfernen des neuen Inserats lässt
keine frühere Planung wieder erscheinen.

## Nachweise

Elf zusätzliche SQL-Regressionen reproduzierten zunächst die bestehenden Fehler.
Der korrigierte Cloudablauf besteht 77 Fälle; zusammen mit Entwürfen, Aufträgen,
Änderungen, Bildern und lokaler Ausführung sind es 303 Datenbankfälle. Die
Migration wurde erzeugt, auf einer frischen isolierten Ausgangskopie vollständig
transaktional angewendet und dort geprüft. Interne Aufnahme- und Abgleichfunktionen
sind für Clients nicht direkt ausführbar.

110 Angular-/Servicefälle prüfen insbesondere angenommene Inhalte und den
Kontowechsel. Acht bestehende Browserfälle prüfen Preisänderung, Relisten und
Vorlage auf Mobilgerät und Desktop, hell/dunkel einschließlich AXE. Der Import
wird dabei absichtlich verzögert, um ein Wiedererscheinen der alten Karte zu
erkennen. Diese Nachweise verwenden synthetische Anbieterantworten; echte
Inserate wurden dabei nicht verändert.
