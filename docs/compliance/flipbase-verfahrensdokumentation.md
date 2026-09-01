# Flipbase-Verfahrensdokumentation für Geschäftsdaten

Stand: 1. September 2026

Dieses Dokument beschreibt den derzeit im Quellcode umgesetzten Ablauf. Es unterstützt die interne Dokumentation und ersetzt keine steuerliche oder rechtliche Beratung. Ob die beschriebenen Verfahren für einen konkreten Betrieb ausreichen, muss anhand der tatsächlichen Nutzung, Zuständigkeiten und gesetzlichen Anforderungen beurteilt werden.

## Zweck und Verantwortlichkeiten

Flipbase verwaltet je Workspace insbesondere Einkäufe, Einkaufspositionen und Zusatzkosten, Inventarartikel und Lagerbewegungen, Verkäufe und Verkaufspositionen, Verkaufskosten, Retouren sowie fachliche Änderungsereignisse. Der jeweilige Betrieb bleibt für vollständige Eingaben, Belegaufbewahrung, Rollenvergabe, Datensicherung und fristgerechte Vorlage verantwortlich.

Workspace-Rollen trennen den Zugriff:

- `owner` und `admin` verwalten den Workspace und dürfen das globale Prüfprotokoll lesen.
- `accountant` darf das globale Prüfprotokoll und Datenarchive lesen, aber keine operativen Buchungen ändern.
- `member`, `fulfillment` und `readonly` erhalten kein globales Prüfprotokoll. Datensatzbezogene Verläufe können über die rollenprüfende Datenbankfunktion freigegeben werden, wenn der konkrete Datensatz im Workspace zugänglich ist.

Die Berechtigung wird serverseitig in `list_business_events` und `list_entity_business_events` geprüft. Die Oberfläche blendet globale Exportfunktionen zusätzlich rollenabhängig aus; diese Anzeigeprüfung ist kein Ersatz für die serverseitige Prüfung.

## Entwürfe, Abschluss und Korrekturen

Entwürfe können vor dem Abschluss bearbeitet werden. Das fachliche Journal ist für abgeschlossene und wirtschaftlich relevante Vorgänge vorgesehen; reine Entwurfsänderungen erscheinen deshalb nicht zwingend im Prüfprotokoll.

Abgeschlossene Einkaufs- und Verkaufsvorgänge werden nicht durch unprotokolliertes Überschreiben historischer Werte korrigiert. Die vorgesehenen Fachfunktionen erzeugen zusammengehörige `business_events` mit stabiler Ereignis-ID, Workspace, Datensatzart und -ID, Ereignistyp, handelnder Person, Zeitstempel, Korrelations-ID sowie fachlichen Vorher-/Nachher-Werten. Retouren und Stornierungen bleiben als eigene Vorgänge erkennbar.

Die Datenbank verhindert `update`, `delete` und `truncate` auf `business_events` durch den Trigger `prevent_business_event_mutation`. Direkte Client-Schreibrechte auf das Journal sind entzogen. Das schützt das Anwendungsjournal vor nachträglicher Änderung; es ersetzt keine unabhängige externe Sicherung der gesamten Datenbank.

## Kostenverteilung und Rundung

Bei normalen Einkäufen können Einkaufspositionen einen bekannten Einzelpreis oder Positionsbetrag tragen. Bei Mystery Boxen und anderen gemeinsam bepreisten Einkäufen verteilt die Abschlussfunktion die tatsächlichen Einkaufsgesamtkosten nach der gewählten Methode. Die fachlichen Regeln und Rundungsfälle sind in der [Design-Spezifikation](../superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md) und im [Implementierungsplan für Einkaufskosten](../superpowers/plans/2026-08-31-purchase-costing-foundation.md) beschrieben.

Cent-Rundungsdifferenzen werden innerhalb eines Abschlussvorgangs deterministisch ausgeglichen. Ein optionaler geschätzter Marktwert ist eine Planungshilfe und kein Anschaffungswert.

## Prüfprotokoll in der Anwendung

Der Bereich `/settings/data` bietet:

- Filter nach Zeitraum, Benutzer, Datensatzart und Vorgangstyp;
- cursorbasierte Seiten mit höchstens 100 Einträgen je Datenbankaufruf;
- eine lesbare Detailansicht der protokollierten Änderungen;
- ein maschinenlesbares ZIP-Datenarchiv;
- eine separate Druckansicht unter `/settings/data/print`.

Filter werden in der URL gespeichert, damit eine Ansicht nach einer Navigation wiederhergestellt werden kann. Abfragen bleiben an den aktuell ausgewählten Workspace gebunden. Ein Workspace-Wechsel während eines Ladevorgangs verwirft verspätete Ergebnisse des vorherigen Workspace.

Die Druckansicht ist auf 5.000 Ereignisse begrenzt, damit der Browser nicht unkontrolliert große Datenmengen rendert. Sie kann über die Browserfunktion gedruckt oder als PDF gespeichert werden. Ein PDF allein ist kein maschinenlesbares Archiv.

## Datenarchiv

Das Archiv heißt `flipbase-audit-<UTC-Zeitstempel>.zip` und enthält:

- `manifest.json`
- `business-events.csv` und `business-events.json`
- `purchases.csv`, `purchase-lines.csv` und `purchase-costs.csv`
- `inventory-items.csv`, `stock-lots.csv` und `stock-movements.csv`
- `sales.csv`, `sale-lines.csv` und `sale-costs.csv`

Das Manifest nennt Schema- und Exportversion, Erstellungszeit, Workspace-ID, angewandte Journalfilter, Zeilenzahlen und – falls die Browser-Kryptografie verfügbar ist – SHA-256-Prüfsummen der enthaltenen Datendateien. CSV-Spaltennamen sind stabile englische Maschinenbezeichnungen. Kennungen und Fremdschlüssel bleiben enthalten. Vorher-/Nachher-Payloads bleiben vollständig in JSON erhalten. CSV-Zellen mit möglichen Tabellenformeln werden beim Export neutralisiert.

Der Export lädt Tabellen und Journal seitenweise. Ein abgebrochener oder fehlgeschlagener Lauf erzeugt keinen als vollständig gemeldeten Download. Objekt-URLs werden nach dem Download wieder freigegeben. Das Archiv enthält bewusst keine Zahlungs-, Webhook-, API- oder Geräte-Konfigurationen.

## Aufbewahrung, Löschung und Sicherung

Die Datenbank verhindert das direkte Löschen eines Workspace, sobald abhängige Geschäfts- oder Journalinformationen vorhanden sind. Dazu zählen unter anderem Einkäufe, Inventar, Verkäufe, Retouren, Belege und `business_events`. Ein leerer Workspace kann über die vorhandene bestätigte Löschfunktion entfernt werden.

Flipbase löscht Geschäftsdaten nicht automatisch nach einer pauschalen Frist. Welche Unterlagen sechs, acht, zehn Jahre oder abweichend aufzubewahren sind, hängt von Rechtsraum, Unterlagenart, Zeitraum und Einzelfall ab. Der Betrieb muss die geltenden Fristen mit fachkundiger Beratung festlegen und dokumentieren.

Das Browser-ZIP ist ein portabler Anwendungsexport, aber kein vollständiger Datenbank- oder Infrastruktur-Backup. Für den Betrieb muss zusätzlich ein Sicherungskonzept für Supabase/PostgreSQL bestehen. Empfohlen sind regelmäßige automatisierte Datenbanksicherungen, getrennte Aufbewahrung, Zugriffsschutz und dokumentierte Wiederherstellungstests. Diese Maßnahmen werden in diesem Repository nicht automatisch eingerichtet und dürfen erst nach einem tatsächlich erfolgreichen Restore-Test als wirksam dokumentiert werden.

## Softwareänderungen und Nachvollziehbarkeit

Änderungen an Datenbanktabellen, Funktionen und Rechten werden im deklarativen Schema `supabase/schemas/database.sql` gepflegt und über überprüfbare Migrationen ausgerollt. Anwendungscode, Tests und Dokumentation werden über Git versioniert. Release, Migration und Wiederherstellung müssen im Betriebsprozess miteinander verknüpft werden; die reine Git-Historie belegt nicht, welche Version zu einem bestimmten Zeitpunkt produktiv ausgeführt wurde.

Für ältere Datensätze gelten die dokumentierten Legacy-Prüf- und Migrationspfade des [Gesamtdesigns](../superpowers/specs/2026-08-31-einkaufs-bestandskosten-und-pruefprotokoll-design.md). Eine Migration darf unbekannte Werte nicht als `0` interpretieren und muss vor und nach dem Lauf durch Mengen-, Kosten- und Ereignisabgleiche geprüft werden.

## Regelmäßige Betriebskontrollen

Der verantwortliche Betrieb sollte mindestens regelmäßig prüfen und dokumentieren:

1. Sind Rollen und ausgeschiedene Benutzer noch korrekt?
2. Lassen sich Prüfprotokoll und ZIP-Archiv für einen Testzeitraum erzeugen und öffnen?
3. Stimmen Stichproben zwischen Oberfläche, CSV, JSON und Datenbank überein?
4. Sind Prüfsummen und Zeilenzahlen im Manifest plausibel?
5. Wurde eine Datenbanksicherung erfolgreich in einer getrennten Testumgebung wiederhergestellt?
6. Sind Änderungen an Steuern, Aufbewahrungsfristen oder internen Zuständigkeiten in diesem Dokument nachgetragen?

## Bekannte Grenzen

- Die Funktion unterstützt Dokumentation und Datenbereitstellung, verspricht aber keine automatische Rechts- oder Steuerkonformität.
- Der Browserdruck ist keine elektronische Signatur und keine unveränderbare externe Archivierung.
- Die Vollständigkeit hängt von den in Flipbase erfassten Vorgängen und den tatsächlich angebundenen Datenquellen ab.
- Externe Plattformbelege, Rechnungen und Versandnachweise müssen entsprechend dem betrieblichen Belegkonzept zusätzlich aufbewahrt werden.
- Datenschutzrechtliche Auskunfts-, Berichtigungs- und Löschpflichten müssen gegen handels- und steuerrechtliche Aufbewahrungspflichten abgewogen werden.

Technische Umsetzungsdetails stehen im [Settings-, Audit- und Exportplan](../superpowers/plans/2026-08-31-settings-audit-export.md).
