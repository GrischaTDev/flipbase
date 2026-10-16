# Vinted: Veröffentlichungszeit und einmaliger Altersfallback

## Quellenreihenfolge

1. Über Flipbase bestätigte aktive Veröffentlichung: `verified_at` des frühesten
   passenden `marketplace_listing_jobs`-Auftrags (`confirmed`, `publish`, `active`).
   Workspace, Verbindung, Inserat und aktuelle externe Kontoidentität müssen passen.
2. Bereits gespeicherter genauer Zeitpunkt beziehungsweise verlässliche
   Vinted-Erstellungszeit aus der Inseratsliste.
3. Gerundetes Alter von der passenden Vinted-Inseratseite mit Beobachtungszeit.

Entwurfs-, Auftrags-, Änderungs- und Importzeiten sind keine Veröffentlichungszeit.
Vinted-Entwürfe, noch laufende Verarbeitung und unbestätigte Versuche sind kein
Nachweis für ein online stehendes Inserat. Ohne Beleg bleibt das Alter unbekannt.
Die Darstellung bleibt bei vollen 24-Stunden-Tagen ohne sichtbares „ca.“.

## Abruf und Speicherung

Die vollständige normale Inseratsliste wird weiter importiert. Der Erstabruf
liest alle darin noch fehlenden Altersangaben von Vinted nach; die bisherige
Dreiergrenze entfällt. Erfolgreich gespeicherte Angaben zählen ab ihrer
Beobachtungszeit weiter und werden nicht täglich erneut gelesen. Folgeabrufe
lesen deshalb nur neue oder bisher erfolglos ergänzte Inserate nach.
Die tägliche Wiederholpause gilt weiterhin für fehlgeschlagene Zusatzabrufe.
Vor jeder weiteren Seite wird die Abrufberechtigung geprüft; 403/429 stoppen
weitere Anbieteranfragen, 401 beendet den autorisierten Kontoimport.

`marketplace_publication_versions` liefert der aktiven autorisierten Cloud-
Sitzung die gespeicherten Werte und bestätigten Flipbase-Zeiten. Ein neu über
Flipbase veröffentlichtes Inserat erhält den Zeitpunkt bereits vor seinem
ersten Import; ein eigener HTML-Altersabruf ist dann unnötig.

Der Datenbanktrigger schützt `body.occurredAt` auch bei lokalen Extensionimports
und ergänzt schon vorhandene Cachezeilen bei neuer Veröffentlichungsbestätigung.
Historische Einträge erhalten den eigenen Zeitpunkt beim nächsten Import.
Ungültige Kalender- und Zukunftswerte verdrängen keinen gültigen Fallback.
Keine neuen Datenbanktabellen und keine geratenen Cachezeilen aus Entwürfen.

## Migration und Veröffentlichung

Schema: `supabase/schemas/467_marketplace_publication_times.sql`.
Migration: `20261016082736_marketplace_publication_times.sql`.
Fünf Funktionen, ein Index und zwei Trigger; keine Datenlöschung und keine eigene
Transaktionssteuerung. Nur `service_role` darf die neuen Funktionen ausführen.

Der Schemaabgleich wurde in eigenen lokalen Datenbanken auf die neue Datei
begrenzt, um bestehenden fremden Schema-/Migrationsdrift nicht einzubeziehen.
Da der CLI-Generator die bestehenden Default-Grants für Clientrollen beim
Abgleich nicht vollständig berücksichtigte, wurden die expliziten Client-REVOKEs
automatisch aus den getesteten Zielrechten in `pg_catalog` erzeugt. Finale
Migration transaktional auf dem vorherigen Stand eingespielt, danach leerer
Schema-/Rechtevergleich und 301 erfolgreiche SQL-Fälle. Keine manuell gepflegte
Integritätsliste; der normale Imagebau erzeugt weiterhin das SQL-Paket.

Nach grüner PR-Integration zuerst den Web-Release einschließlich Migration
abwarten. Danach Worker, Broker und Sitzungsimage gemeinsam aus demselben
Merge-Stand veröffentlichen. Bestehende Kontofreigaben und Zeitpläne bleiben
unverändert. Vor Dienstwechsel keine laufende Cloudarbeit; nach dem Wechsel
Gesundheit, erfolgreiche reguläre Abrufe und geschlossene Sitzungen prüfen.
