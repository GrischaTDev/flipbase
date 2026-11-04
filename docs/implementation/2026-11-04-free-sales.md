# Freie Verkäufe – erster Umsetzungsschritt

Freie Positionen lassen sich mit Beschreibung, Menge und Preis erfassen und mit
Bestandspositionen kombinieren. Sie erzeugen weder Artikel noch Lagerbewegungen.
Wareneinsatz und steuerlicher Einkaufspreis bleiben ohne Nachweis unbekannt.
Bestehende Bestandsverkäufe und externe Übernahmen behalten ihre bisherigen Wege.

## Buchung, Belege und Erstattung

`record_sale` akzeptiert zusätzlich `position_kind = 'free'`. Freie Positionen
benötigen eine Beschreibung und dürfen kein Bestandsziel enthalten. Ihr Speichern
wartet nicht auf eine erfolgreiche Bestandsladung. Rechnungen verwenden die
gespeicherten Verkaufspositionen und die bisherigen Unternehmenssnapshots.

Manuelle Buchungsversuche eines geöffneten Formulars behalten ihre
Workspace-gebundene Buchungskennung. Gleiche Kennung und gleicher Inhalt liefern
das gespeicherte Ergebnis, auch nach einer verlorenen Antwort. Abweichender Inhalt
mit derselben Kennung wird abgelehnt. `sale_booking_requests` bietet Mitgliedern
eine durch RLS geschützte Ergebnisabfrage; direkte Schreibrechte sind entzogen.
Ein eigener neuer Offline-Entwurfseditor ist nicht Teil dieses Schritts.

Teilbeträge sind finanzielle Erstattungen, keine behaupteten positionsbezogenen
Warenrückgaben. Eine Vollerstattung freier Positionen berührt keinen Bestand.
Gemischte Verkäufe behandeln ausschließlich ihre tatsächlichen Bestandspositionen
über den bisherigen Rückgabeweg. Die Oberfläche verwendet auch für Erstattungen
eine stabile Buchungskennung. Gutschriften behalten Nummer und Unternehmenssnapshot.

## Korrektur

Neue rein freie Verkäufe ohne Erstattung können mit Begründung ersetzt werden.
Original und ursprüngliche Rechnung bleiben erhalten; eine atomare Transaktion
kennzeichnet das Original als korrigiert, bucht einen neuen Verkauf mit eigener
Nummer und speichert Bezug und Historieneintrag. Existiert eine Rechnung, wird
zusätzlich ein negativer Korrekturbeleg aus deren eingefrorenem Inhalt gespeichert.
Dieser ist über das Original zugänglich und enthält den Korrekturgrund.
Korrigierte Originale zählen nicht erneut in Erlöse, Gewinn oder Steuerberechnung.
CSV-Ausgaben kennzeichnen den Status und Korrekturgrund.

Korrektur und Rechnungserstellung verwenden dieselbe Sperre; parallele Korrekturen
können das Original nur einmal ersetzen. Bereits erstattete oder gemischte
Verkäufe lassen sich nicht über diesen neuen Korrekturweg ersetzen.

## Nachweise und Abgrenzung

Neue Datenbankfälle prüfen Wiederholung, widersprüchliche Kennungen, Pflichtfelder,
Belegbezug, Teil-/Vollerstattung, gemischten Bestand und Workspacegrenzen.
Browserfälle prüfen den vollständigen freien Ablauf in drei Breiten und beiden
Farbschemata mit Touch und AXE. Bestehende Einzelstück-, Varianten- und
Unternehmensbelegfälle sichern die bisherigen Abläufe ab.

Die lokale Prüfung verwendet ausschließlich eine getrennte Supabase mit
synthetischen Daten. Der erzeugte Migrationsdiff wird zusätzlich aus einem
sauberen Migrationsstand abgespielt. Die tatsächlichen Rechte neuer Objekte werden
dabei geprüft, weil der Generator implizite Supabase-Standardrechte nicht
vollständig widerruft. Die ergänzenden Rechteanweisungen stammen aus dem
Katalogabgleich des deklarierten Sollstands.

Einkaufszuordnung, freie Paketkäufe, Shop-Schalter und automatische
Marktplatzbuchungen bleiben den folgenden Schritten vorbehalten. Der Demo-Shop
wird durch diesen Schritt nicht verändert. Vor Veröffentlichung gelten weiterhin
der lokale Vorabcheck und die ausgewählten Pflichtprüfungen in CI.
