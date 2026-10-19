# Manuelle Bankzuordnung

Stand: 19.10.2026. Ergänzung zum [Finanzumbau](apple-finance-area.md).

## Bedienung

Unter Steuer & DATEV → Bankabgleich öffnet „Transaktion zuweisen“ das Auswahlfenster. Bei bereits zugeordneten, noch nicht gebuchten Bewegungen heißt die Aktion „Zuordnung ändern“.

Das Fenster zeigt Empfänger beziehungsweise Absender, Bankbetrag, Datum und Verwendungszweck. Danach folgen zwei gemeinsame Auswahlfelder:

- Einnahmen: Verkauf oder Shopbestellung.
- Ausgänge: Ausgabe oder Einkauf.
- Eintrag: durchsuchbar nach Bezeichnung, Belegnummer, Name und Betrag; passende Beträge zuerst.

Der Betrag des Eintrags wird angezeigt. Eine Differenz muss ausdrücklich bestätigt werden. „Zuordnung speichern“ speichert nur die Verbindung; „Buchen“ bleibt eine eigene Aktion. Gebuchte Bankbewegungen lassen sich hier nicht nachträglich umhängen. Es werden keine Zielbeträge, Verkaufspositionen oder Ausgaben verändert.

## Daten und Fehler

Es werden nur verfügbare EUR-Einträge desselben Arbeitsbereichs angeboten: keine stornierten/zurückgegebenen Verkäufe, Einkaufsentwürfe, gelöschten Ausgaben oder nicht mehr offenen Shopbestellungen. Unbekannte, nicht endliche und nicht positive Zielbeträge entfallen. Bei Ausgaben ist der gespeicherte Bruttobetrag bereits der Gesamtbetrag; die Menge wird nicht nochmals multipliziert.

Vor dem Speichern werden die Ziele neu geladen und Arbeitsbereich, Anmeldung, Bankstatus, Bankbetrag sowie Zielbetrag erneut geprüft. Eine zwischenzeitlich veränderte Bankbewegung oder ein geänderter Zielbetrag erfordert eine neue Auswahl. Bereits durch andere Bankbewegungen belegte Ziele werden ausgeblendet. Die Serverantwort entscheidet, ob die Zuordnung erfolgreich ist; Fehler lassen das Fenster mit seiner Auswahl offen.

Der vorhandene Bankdienst aktualisiert gezielt nur die Zuordnung dieser Bankbewegung. Filter auf Arbeitsbereich, Betrag, Währung und noch änderbaren Status verhindern, dass eine veraltete Ansicht diese Werte überschreibt.

## Gemeinsame Gestaltung

ModalShell, Button, CustomSelect und CustomCheckbox übernehmen Darstellung, Dichte, Tastaturbedienung und Fokus. Keine neue Feature-CSS-Datei. Bankdaten stehen in einer flachen Zusammenfassung; darunter Auswahl und bei Bedarf Differenzbestätigung. Gleicher Aufbau in Hell und Dunkel, mit Maus und Touch.

## Datenbankschutz und Veröffentlichung

Die deklarative Quelle liegt in `supabase/schemas/195_bank_manual_assignment.sql`. Die zugehörige erzeugte Migration ergänzt ausschließlich einen Index, eine Triggerfunktion und deren Trigger auf `public.bank_transactions`.

Eine gemeinsame Transaktionssperre und der eindeutige Index verhindern, dass zwei Sitzungen dasselbe Ziel manuell belegen. Manuelle und automatische Zuordnungen dürfen einander ebenfalls kein schon belegtes Ziel wegnehmen. Bestehende automatische Sammelvorschläge bleiben möglich. Die Funktion läuft mit den bestehenden Benutzerrechten und leerem Suchpfad; RLS bleibt maßgeblich. Sie ist kein öffentlicher Aufrufpunkt.

Vor einer Veröffentlichung vorhandene doppelte manuelle Zuordnungen **lesend** prüfen:

```sql
select workspace_id,
  match_json ->> 'targetType' as target_type,
  match_json ->> 'targetId' as target_id,
  count(*) as assignments
from public.bank_transactions
where status in ('matched', 'booked')
  and match_json ->> 'confidenceLabel' = 'manual'
  and match_json ->> 'targetType' in ('sale', 'store_order', 'purchase', 'operating_expense')
  and match_json ->> 'targetId' is not null
group by workspace_id, match_json ->> 'targetType', match_json ->> 'targetId'
having count(*) > 1;
```

Bei Treffern muss die fachlich richtige Zuordnung geklärt werden; die Migration löscht keine bestehenden Daten und bricht beim eindeutigen Index sicher ab. Die Migration ist Bestandteil des lokalen Entwurfs. Auf dem bestehenden Backend wird der zusätzliche Schutz erst nach regulärer Freigabe und Veröffentlichung aktiv.

## Prüfnachweise

Die Browserfälle verwenden vollständig simulierte Finanzantworten und Schreibaufrufe. Die Datenbankprüfungen laufen ausschließlich in einer eigenen, isolierten Docker-Instanz. Keine bestehenden Finanzdaten werden dafür verändert.

Nachweise: Auswahl und Änderung aller vier Zielarten, getrennte Buchung, Differenzbestätigung, Abbruch ohne Schreiben, Speichern und Wiederladen, Lade-/Speicherfehler, leere Auswahl, Kontext- und Betragsänderungen, Fremdzugriff sowie konkurrierende Sitzungen. Aktuelle Ergebnisse stehen im [Änderungsprotokoll](../AI-CHANGELOG.md).

### Erzeugungsnachweis

Der erste vollständige deklarative Abgleich enthielt bereits bestehende fachfremde Abweichungen und wurde verworfen. Der begrenzte Struktur-Diff einer identischen Migrationsbasis ließ bei der neuen Funktion Rollenentzüge aus; der echte Neuaufbau und der Rechte-Test zeigten dies. Der anschließende automatisch erzeugte Rechte-Diff der bereits erstellten Funktion ergänzt diese Entzüge. Beide Tool-Diffs sind in einer transaktionalen Migration zusammengeführt, ohne handgeschriebene SQL-Logik. Erneuter Neuaufbau,226 betroffene SQL-Prüfungen, drei echte konkurrierende Verbindungspaare und ein leerer abschließender Schema-Diff bestätigen den Stand. Typen erneut erzeugt; keine inhaltliche Änderung.

Hinweise zum Prüfen generierter Migrationen: [offizieller Supabase-Arbeitsablauf](https://supabase.com/docs/guides/local-development/cli-workflows).
