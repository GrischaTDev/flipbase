# Aufgabenbezogene Navigation und Ideen

Freigegeben im Chat am 16. September 2026.

## Zielstruktur

Dashboard steht ohne zusätzliche Übersichtsgruppe oben. Darunter stehen vier nicht klickbare Gruppenüberschriften:

- Einkauf: Einkäufe, Verkäufer, Vinted Bot.
- Artikel: Artikelübersicht, Bildoptimierer.
- Verkauf: Inserate erstellen, Verkäufe.
- Finanzen: Steuern & DATEV, Auswertungen.

Danach folgt der aufklappbare Menüpunkt **Ideen** mit Online-Shop, Preisrecherche, Kalkulation und Packtisch & Versand. Einstellungen und die rollenabhängige Administration stehen darunter, optisch abgetrennt.

## Verhalten

- Ideen ist bei einem frischen Einstieg außerhalb seiner Seiten zugeklappt.
- Ein Button klappt die Liste auf und zu, ohne zu navigieren oder die mobile Sidebar zu schließen. Er besitzt `aria-expanded` und `aria-controls`.
- Beim direkten Einstieg und bei einer Navigation auf eine Ideen-Seite öffnet sich die Liste automatisch. Manuelles Zuklappen bleibt bis zur nächsten entsprechenden Navigation möglich.
- Die Liste bleibt im DOM; `hidden` entfernt geschlossene Inhalte aus der Tastaturreihenfolge und dem Accessibility Tree.
- Ein gewählter Seitenlink schließt wie bisher die mobile Sidebar.
- Vinted-Bot- und Administrationsunterpunkte sowie `/inventory` als Teil des Artikelbereichs bleiben erhalten. Genau ein Seitenlink erhält `aria-current`.
- Alle bisherigen URLs bleiben erhalten. `/shop` bleibt eine eigenständige Storefront außerhalb der Admin-Shell, keine neue Shopverwaltung. Sein vorhandener Demo-Hinweis bleibt am Menülink sichtbar.
- Neue Navigationsschlüssel ergänzen Deutsch und Englisch. Vorhandene Seitentexte bleiben unverändert.

## Technischer Umfang

Die explizite Konfiguration liegt unter `src/app/core/config/workspace-navigation.ts`. Die Sidebar verwendet ein gemeinsames Linktemplate und einen lokalen Signal-Zustand für Ideen. Es werden keine Abhängigkeiten, Datenmodelle, Authentifizierungsregeln, Fachfunktionen oder mobilen Hauptverknüpfungen geändert.

## Abnahme

Die bestehenden Sidebar-Tests bleiben erhalten. Neue Logiktests prüfen Zuordnung, Reihenfolge, Erhaltung aller Pfade, Untermenüs und Pfadgrenzen. Zusätzliche Angular-Tests prüfen Aufklappen, Direktaufruf, Navigation, mobile Ausgabe, Sprachwechsel und automatisch erkennbare Barrieren. Vollständige CI und Produktionsbau sind vor dem Merge erforderlich. Eine bestandene DOM-Prüfung ersetzt keine visuelle Browserabnahme.
