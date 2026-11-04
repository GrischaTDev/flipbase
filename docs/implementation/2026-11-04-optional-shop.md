# Einfache Einkäufe und optionaler Shop

## Verhalten

Einkaufspositionen tragen ausdrücklich `free` oder `stock`. Eine freie Position
besteht aus Beschreibung, Menge und Preis. Ihr finanzieller Abschluss legt weder
Einzelstücke noch Lose an und behauptet keinen Wareneingang. Ein Gesamtpreis ist
auch bei unbekanntem Paketinhalt möglich. Bei aktivem Shop bleiben freie und
bestandsgebundene Positionen nebeneinander verfügbar; gemischte Einkäufe erhalten
die bisherigen Wareneingangs- und Abschlussbedingungen für ihre Bestandspositionen.

Freie Verkaufspositionen können auf einen abgeschlossenen Einkauf desselben
Arbeitsbereichs verweisen. Diese Herkunft verteilt den Paketpreis nicht pauschal
auf jeden Verkauf. Die Einkaufsauswertung berücksichtigt zugeordnete Erlöse und
Erstattungen; unbekannter Wareneinsatz bleibt unbekannt. Gebuchte Zuordnungen
werden nicht durch direkte Tabellenänderungen überschrieben.

## Shop-Einstellung und Bestandsschutz

`shop_entitled` bildet die serverseitige Freigabe ab, `shop_enabled` die freiwillige
Nutzung. In der Beta ist die Freigabe vorhanden; eine künftige Tarifzuordnung ist
nicht Teil dieses Umbaus. Bestehende Arbeitsbereiche bleiben bei der Migration
aktiv, neue beginnen ausgeschaltet. Eigentümer und Administratoren schalten mit
Versionsprüfung um. Ein Freigabeentzug schaltet aus; eine erneute Freigabe
aktiviert nicht automatisch. Journal, privater Broadcast und Abgleich beim
Wiederöffnen halten mehrere Sitzungen aktuell.

Bei ausgeschaltetem Shop fehlen Bestandsnavigation, Bestandserfassung und die
Bestandsauswahl für neue Verkäufe. Direkte Bestandsrouten werden umgeleitet;
Lader überspringen vollständige Katalog- und Lagerabfragen. Die Datenbank sperrt
neue Lager-, Katalog-, Medien- und Shop-Bestelländerungen unabhängig vom Browser.
Historische Daten bleiben lesbar. Bereits bestehende Retouren, Kostenkorrekturen
und Wiederöffnungen verwenden eng begrenzte Serverfunktionen. Ihre interne
Freigabe ist transaktionsgebunden, nicht vom Client setzbar und nicht als
ausweichender Bestandsanlageweg nutzbar. Historische Zahlungsabwicklung und das Löschen ungebuchter Altentwürfe bleiben
möglich. Autorisierte Löschungen räumen angehängte Medien weiterhin über ihre
bestehenden Fremdschlüssel auf.

## Importwege

Neue Offlinepositionen beginnen frei; vorhandene Bestandsabsichten bleiben
beim Wiederöffnen erhalten. CSV kann frei oder mit Artikelzuordnung übernommen
werden; bei ausgeschaltetem Shop wird frei erfasst. Titel, Mengen und Preise
bleiben erhalten.

eBay behält Quellprüfung, Centaufteilung, bestätigte Kosten und Wiederholschutz.
Neue Entwürfe können ohne Lagerzuordnung beginnen. Ausschalten gibt offene
Reservierungen frei und erhält bisherige Zuordnungen mit ausdrücklichem
Prüfbedarf. Lesen, Hintergrundabgleich und erneutes Einschalten reservieren
solche Entwürfe nicht automatisch. Eine freie Übernahme einer bestehenden
Zuordnung erfolgt ausdrücklich und betrifft alle Preisgruppen derselben Quelle.
Dauerhafte Artikelzuordnungen bleiben Bestandszuordnungen. Ihr Einstieg und
ihre Serverfunktionen sind bei ausgeschaltetem Shop gesperrt; die Inserate und
freie Bestellübernahme bleiben verfügbar.

## Grenzen und Freigabe

Der Demo-Shop unter Ideen bleibt bestehen. Öffentlicher Shop, Domains,
Tarifabrechnung sowie eine neue automatische Vinted-/Kleinanzeigen-Buchung sind
nicht Teil dieses Schritts. Änderungen und Nachweise liegen gemeinsam mit den
freien Verkäufen auf dem noch nicht veröffentlichten Aufgabenbranch.

Die Migration wurde mit der gesperrten Supabase-CLI aus dem lokalen Änderungsstand
gegen die bisherigen Migrationen erzeugt. Der direkte deklarative Gesamtabgleich
enthält bereits vorhandene, fachfremde Abweichungen und wurde nicht übernommen.
Daten-Backfill und Policies außerhalb von `public` wurden aus der Schemaquelle,
endgültige Funktionsrechte aus dem lokalen Katalog ergänzt. Die vollständige
Wiedereinspielung einschließlich Seed wurde geprüft; interne Abwicklungsfunktionen
und ihre Transaktionstabelle sind für API-Rollen nicht direkt ausführbar/beschreibbar.

Zusätzliche lokale Nachweise: 143 SQL-Suiten mit 5.374 TAP-Prüfungen gegen die endgültig
eingespielte Migration;
gemischter Einkauf/Verkauf samt Retoure bei ausgeschaltetem Shop; 15 Edge-Tests;
25 Browserfälle einschließlich freier Belege/Korrekturen/Erstattungen, bestehendem
Bestand, Varianten, eBay und einfacher Erfassung in drei Breiten, Hell/Dunkel,
Touch und AXE. Der abschließende Node-22-Vorabcheck einschließlich Format, Lint, Typen,
Suite-Audit, Skriptverträgen, 4.070 Anwendungstests und Angular-Bau ist erfolgreich.
Die 34 betroffenen Funktionskörper wurden nach dem Reset mit dem Schemaquelltext
abgeglichen. Weitere Detailnachweise stehen im Änderungsprotokoll.

Unter Windows wurden die vorbereiteten SQL-Includes zusammen mit den Tests in
den isolierten Container kopiert. Alle Dateien liefen dort über
`psql -X -A -t -v ON_ERROR_STOP=1 -f`; TAP-Plan, Prüfanzahl, Fehler und Exitcodes
wurden gemeinsam ausgewertet. Der reguläre Linux-Lauf bleibt Teil der CI.
Die Prüfung schließt eine nachträgliche Bestandskostenkorrektur eines gemischten
Einkaufs bei ausgeschaltetem Shop und die anschließende Retoure ein.

Die ausgewählten CI-Freigabeprüfungen müssen vor einem Merge erfolgreich sein.
