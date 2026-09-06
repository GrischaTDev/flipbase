# Einkaufsablauf nach dem Designumbau – Folgeplan

> Für die spätere Ausführung `superpowers:executing-plans` verwenden. Dies ist ein fachlicher Folgeplan; keine Datenbankänderung ist mit der jetzigen Planerstellung verbunden.

**Ziel:** Einen Einkauf mit bekanntem Gesamtbetrag erfassen können, auch wenn seine Artikel erst teilweise oder später aufgenommen werden. Lieferant/Verkäufer und Einkauf stehen im Mittelpunkt, kein technischer Typ als Einstieg.

**Architektur:** Einkaufskopf, zugehörige Artikel und Kostenverteilung getrennt betrachten. Vorhandene Modelle und Buchungsregeln zuerst prüfen und möglichst weiterverwenden. Bestehende Datensätze und bereits gebuchte Kosten bleiben nachvollziehbar.

**Techstack:** Bestehendes Angular/Tailwind und Supabase, keine neue Bibliothek vorgesehen.

**Spezifikation:** Nutzerentscheidungen in [Designgesamtplan](2026-09-06-polaris-design-consolidation.md); Gestaltung aus [Designrichtlinien](../../design/admin-ui-guidelines.md). Diese Phase beginnt nach den dortigen grundlegenden UI-Arbeiten.

## Festgelegtes Zielbild

- Ein Einkauf kann als gesamter Vorgang erfasst werden, bevor alle Artikel bekannt sind.
- Kopf: Lieferant beziehungsweise privater Verkäufer, Kaufdatum, bekannter Gesamtbetrag und vorhandener Beleg. Keine neue vollständige Lieferantenverwaltung als Nebenprojekt.
- Artikel sofort, teilweise oder später ergänzen; Paketkäufe mit unterschiedlichen Weiterverkaufsartikeln ausdrücklich berücksichtigen.
- Gesamtbetrag bleibt unabhängig vom Erfassungsfortschritt sichtbar. Unbekannter Einzelpreis wird nicht zu null umgedeutet.
- Spalte „Typ“ und die Erfassungs-Typauswahl erst nach Prüfung ihrer fachlichen Bedeutung ersetzen. Ein verborgenes Datenfeld kann für Migration/Altfälle weiter nötig sein.
- Kein automatisches Überschreiben bereits gebuchter Einstandskosten beim späteren Hinzufügen von Artikeln.

## Paket B1: Bestehende Fachregeln und Beispiele abgleichen

Lesen: `src/app/core/models/flipbase.models.ts`, `src/app/core/services/purchase.service.ts`, `src/app/features/purchases/components/purchase-entry-form/`, `purchase-line-editor/`, `purchase-cost-editor/`, `purchase-cost-repair/`, `purchase-correction-dialog/`, `src/app/features/purchases/models/`, `supabase/schemas/` und zugehörige Datenbanktests. Tatsächliche Schema-/RPC-Dateien anhand dieser Aufrufer identifizieren, bevor ein technischer Migrationsplan geschrieben wird.

- [ ] Alle heutigen Einkaufstypen ihren Auswirkungen auf Gesamtbetrag, Bestand, Kostenzuordnung und Korrekturen zuordnen. Reine UI-Unterscheidungen von fachlich notwendigen Unterschieden trennen.
- [ ] Folgende verbindliche Beispielszenarien gegen das heutige Modell prüfen: Paket für 300 Euro ohne Artikel; zwei Artikel später ergänzt; noch nicht alle Artikel erfasst; vollständige Aufteilung; bereits verkaufter Artikel vor Ergänzung weiterer Artikel; Kauf mit bekannten Einzelpreisen; nachträgliche Korrektur des Gesamtbetrags.
- [ ] Eine Entscheidungsunterlage mit den konkreten Auswirkungen erstellen: Darf ohne Lieferantenangabe gespeichert werden? Darf ein Artikel mit offener Kostenverteilung verkauft werden und wie wird die Marge dargestellt? Wann gilt die Artikelerfassung als abgeschlossen? Welche Verteilungsmethode ist zulässig?
- [ ] Diese fachlichen Entscheidungen vor Schema-/Buchungsänderungen mit dem Nutzer klären. Keinen festen Verteilungsschlüssel aus der Designreferenz ableiten.

Abnahme: Jeder heutige Typ und jeder Beispielfall besitzt eine dokumentierte Zuordnung. Offene Regeln werden als Entscheidungen vorgelegt, nicht stillschweigend implementiert.

## Paket B2: Erfassung und Übersicht fachlich entwerfen

Betroffen: bestehende Einkaufs-Erfassungsseite, `purchase-entry-form`, `purchases.component.ts/.html`, Einkaufsdetails und Artikelanlage aus einem Einkauf.

- [ ] Einstieg ohne technische Typfrage entwerfen: Einkaufskopf und Gesamtbetrag, darunter Artikelbereich mit optionaler späterer Ergänzung.
- [ ] Erfassungsfortschritt und Kostenverteilung als getrennte Zustände modellieren. „Keine Artikel“, „teilweise erfasst“ und „vollständig“ dürfen nicht allein aus der Anzahl abgeleitet werden; Abschluss braucht eine fachliche Festlegung.
- [ ] Tabelle anhand konkreter Aufgaben abnehmen. Vorschlag: Einkauf/Datum, Lieferant, Gesamtbetrag, erfasste Artikel, Erfassungsfortschritt und Kostenstatus. Referenz/Beleg und Zusatzinformationen nur bei Bedarf. Bestehende Spaltenpräferenzen beim Ersetzen von „Typ“ migrieren.
- [ ] Bekannten Kaufpreis, verteilte Kosten und noch nicht zugeordneten Betrag getrennt zeigen. Kaufnebenkosten und Änderungen müssen erkennbar bleiben.

Beispiel für die Abnahme: Bei 300 Euro Gesamtbetrag und 100 Euro ausdrücklich zugeordneten Kosten bleiben 200 Euro offen. Zwei erfasste Artikel beweisen weder, dass das Paket vollständig aufgenommen ist, noch dass die Kosten vollständig verteilt sind. Die fachliche Kostenbasis einschließlich Nebenkosten wird in B1 festgelegt.

## Paket B3: Technischer Plan, Migration und Umsetzung

- [ ] Nach B1/B2 einen ausführbaren technischen Teilplan mit tatsächlich betroffenen Tabellen, RPCs, Services und Prüfdateien erstellen. Die Datenbankstruktur wird hier bewusst nicht anhand ungeprüfter Annahmen vorgegeben.
- [ ] Gesamtbetrag ohne Artikel und getrennte Kostenzuordnung nur dann ergänzen, wenn das bestehende Modell dies nicht bereits korrekt unterstützt.
- [ ] Änderungen über deklarative Schema-Dateien und erzeugte Migration durchführen; generierte Typen, RLS, Transaktionsverhalten und Bestandswirkung zusammen prüfen.
- [ ] Vorhandene Einkäufe vollständig migrierbar halten. Historische Typen nicht löschen, bevor ihre Bedeutung und alle Verbraucher abgedeckt sind. Gebuchte Verkäufe und Einstandskosten nicht rückwirkend still neu berechnen.
- [ ] Korrekturen, Rundungsreste, Wiederholungsversuche und parallele Artikelergänzung mit passenden Fachtests absichern.

Abnahme: Derselbe Gesamteinkauf bleibt bei späterer Artikelerfassung finanziell nachvollziehbar; keine doppelte Kostenverteilung, keine verlorenen Altbezüge und keine still veränderten Buchungen.

## Abschlussfälle

- [ ] Einkauf ohne Artikel speichern und später wieder öffnen; Gesamtbetrag bleibt erhalten.
- [ ] Teilweise ergänzen, speichern, erneut ergänzen; Zuordnung zum ursprünglichen Einkauf bleibt bestehen.
- [ ] Vollständige Kostenverteilung stimmt inklusive Rundung exakt mit der festgelegten Kostenbasis überein; unzulässige Überverteilung wird verhindert.
- [ ] Unbekannte Einzelkosten unterscheiden sich in Inventar und Verkauf von echten Nullkosten.
- [ ] Bestehende Einkaufsarten, Verkauf, Retouren, Korrekturen und Exporte durchlaufen die festgelegten Regressionen.

Diese Phase ist ein eigenständig abnehmbarer Folgeumbau. Der Abschluss des Designplans hängt nicht von ihrer Umsetzung ab.
