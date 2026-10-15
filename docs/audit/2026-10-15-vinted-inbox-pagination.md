# Vinted-Konto Flipbase: Abrufwarnung bei genau 80 Gesprächen

Stand: 15. Oktober 2026, Europe/Berlin.

Der letzte erfolgreiche automatische Gesprächsabruf vor dem Fehler erfolgte
am 14. Oktober gegen 17:07 Uhr mit 79 Gesprächen. Ab 17:12 Uhr liefern die
Abrufe 80 Gespräche mit `partial` / `invalid_response`. Profil, 15 Inserate
und Bewertungen bleiben vollständig. Der Zeitplan ist weiter eingeschaltet,
ordnet den Teilfehler aber als `server` ein und verlängert die Wartezeit.
Auch manuelle Abrufe bestätigen denselben Teilfehler; die grüne Gesamtanzeige
bedeutet, dass die erfolgreich gelesenen Daten gespeichert wurden.

Bei einem normalen, über Flipbases Oberfläche gestarteten Kontoabruf wurden
nur Antwortmetadaten passiv beobachtet. Keine privaten Inhalte ausgegeben.

| Seite | HTTP-Status | Gespräche | `total_pages` | `total_entries` |
| ----- | ----------- | --------- | ------------- | --------------- |
| 1     | 200         | 20        | 2             | 40              |
| 2     | 200         | 20        | 3             | 60              |
| 3     | 200         | 20        | 4             | 80              |
| 4     | 200         | 20        | 5             | 100             |
| 5     | 200         | 0         | 6             | 120             |
| 6–20  | 200         | 0         | jeweils +1    | jeweils +20     |

Alle 80 gelieferten Gesprächskennungen sind gültig und unterschiedlich.
`current_page` entspricht jeweils der angeforderten Seite, `per_page` ist 20.
Vinteds Seitenangaben sind hier keine feste Gesamtanzahl. Flipbase folgt ihnen
bis zur Abrufgrenze und erzeugt dort selbst `invalid_response`, obwohl die
Liste bereits vollständig gelesen ist. Nachrichten und Verkäufe übernehmen
diesen Gesprächsfehler in ihre Bereichsergebnisse.

Die Korrektur beendet ausschließlich die Gesprächsfolge bei einer gültigen
leeren Liste. Die übrige Antwortprüfung und die Grenze für durchgehend volle
Seiten bleiben bestehen. Die produktive Warnung verschwindet erst nach
Veröffentlichung und einem erfolgreich abgeschlossenen automatischen Abruf.
Ein manueller Abruf ändert den gespeicherten Zeitplan nicht.

Es wurden keine Produktionsdateien oder Datenbankstände manuell verändert,
keine Nachrichten gesendet und keine Kontodaten gelöscht.
