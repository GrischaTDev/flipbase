# Vinted Feed und persönliche Account-Favoriten

## Freigegebener Umfang

Sieben Tage Aufbewahrung für gewöhnliche Funde und den zugehörigen Preisvergleich. Persönliche Favoriten werden unabhängig davon unter Benutzer und Workspace gespeichert und ausschließlich bewusst entfernt. Desktop und Tablet greifen auf dieselben Einträge zu. Der Altimport aus dem Browser wird ausdrücklich bestätigt, ist wiederholbar und darf entfernte Einträge nicht durch alte Gerätebestände wiederherstellen.

Im Feed werden Titel und Datum verständlicher, die zusätzliche Fundüberschrift entfällt, Desktop zeigt fünf Karten, Bildaktionen und Kompaktpreis werden kleiner. Eine serverseitige Titelsuche wirkt vor der Seitengrenze. Der zentrale Suchfilter verwendet dieselbe Kategorieauswahl wie das Artikelanlegen mit einer eigenen Vinted-Datenquelle. Markenpfeil und Erläuterung mehrerer Titelbegriffe werden korrigiert.

## Umsetzung

1. Eigenständige Favoritentabelle ohne Fremdschlüssel auf den kurzlebigen Feed; Zugriff nur für den angemeldeten Benutzer im berechtigten Workspace. Begrenzte Artikelkopie, keine gespiegelt gespeicherten Bilder, keine 500er-Verdrängung.
2. Bestätigte Schreibzugriffe, Schutz bei Accountwechsel, vollständige Seitennavigation und Importpakete. Fehler behalten Daten und lokale Quellen bei.
3. Tatsächliche Bereinigung, Feed-Abfragen und Referenzvergleich auf sieben Tage; Titelindex und Suche vor Pagination.
4. Gemeinsamer Kategoriebaustein mit getrennten Datenquellen; verständliche Titelwortauswahl erst ab zwei Begriffen.
5. Tests für Accounttrennung, Lebensdauer, Importwiederholung, Seitenwechsel, Tastatur, responsive Darstellung und Datumswechsel.

## Fortsetzung am 06.10.2026

Der unvollständige eigene Zweig wurde wieder aufgenommen und auf den aktuellen master `70d2fe796a5912de4bbcd9e43a9be4c58a792a94` bezogen. Die erste Datenbankprüfung zeigte drei noch auf 14 beziehungsweise 30 Tage bezogene Erwartungen sowie fehlende Rechteentzüge in der generierten Migration. Die Rechte werden deshalb unverändert aus den expliziten Deklarationen in den Generatorausgang übernommen und am frischen Neuaufbau erneut geprüft. Die Prüfung direkter Schreibrechte wird nicht abgeschwächt.

Lokal wurden neue Account-Favoriten zuerst mit fehlgeschlagenen Tests gegen den alten Local-Storage-Dienst belegt. Die Account-Integration, Titelsuche und Kalenderdatumsdarstellung sind in Arbeit. Kein PR, keine Produktionsänderung und noch keine Abschlussfreigabe.

**Abschlussprüfung:** Lauf `37497892235`: 222 betroffene Anwendungstests, 246 Collector-Tests, 3209 Datenbankprüfungen und 9 Browserabläufe bestanden. Produktionsbau, Formatierung, Lint, Typen und Workflow-Verträge bestanden. Temporäre Prüfdateien entfernt. Keine Änderung an Produktion; Abschlussfreigabe für PR und Merge steht aus.
