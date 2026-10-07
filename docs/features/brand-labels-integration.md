# Marken & Labels – Integrationsstand

Stand: 07.10.2026. Assistent: Juna.

## Auftrag

Zentrales Referenzlexikon für Bekleidungslabels, zunächst Nike. Nur
Flipbase-Plattformbetreiber pflegen Marken, Linien, Labels, Bilder, Quellen
und Veröffentlichungen. Normale Nutzer und Workspace-Admins lesen ausschließlich
freigegebene Inhalte. Kein automatisches Echtheitsurteil, keine persönlichen
Lexikonkopien und kein Größenfinder in diesem Ausbau.

## Dieser Entwurfs-PR

Die Umsetzung wird vom Hauptzweig `9612647709f5bf15ba6ae3936656a6c8c0d120c5`
aus übernommen. Der ältere leere Zweig `juna/brand-labels-foundation` wird nicht
umgeschrieben. Der erste Commit enthält die Referenzverträge, Eingabegrenzen
und die mit Tests abgesicherten Revisionsübergänge. Weitere bereits lokal
vorhandene Bausteine werden im selben Entwurfs-PR ergänzt.

Dies ist kein fertig nutzbares Feature. Datenbankintegration, Medienverarbeitung,
Admin- und Leseroberfläche sowie vollständige Projektprüfungen fehlen noch.
Insbesondere dürfen die SQL-Kandidaten nicht ohne Datenbanktests als
Release-Migrationen eingetragen werden. Keine Änderung der laufenden Anwendung
und keine Freigabe für Nutzer durch diesen Entwurfsstand.

## Prüfungen

Am 07.10.2026 wurden im bereitgestellten Quellpaket 398 Verhaltenstests erneut
mit dem dokumentierten Node-/TypeScript-Offline-Testläufer ausgeführt: kein
Fehler. Darin sind die 16 Revisionsübergänge dieses ersten Commits enthalten.
Das ist weder ein vollständiger Projekt-Vitest-Lauf noch ein Angular-Build.
Der GitHub-PR muss die echten Projektprüfungen durchlaufen. Bis zur vollständigen
Integration bleibt er ausdrücklich Entwurf; kein Merge mit offenen Prüfungen.

## Fortsetzung

1. Vorhandene Validierung, Veröffentlichungsprüfung, API-Aufträge und
   Editorsteuerung samt zugehörigen Tests in den Projekt-Testlauf übernehmen.
2. SQL-Kandidaten in einer neuen isolierten PostgreSQL-17-Testinstanz prüfen;
   dabei keine produktive Datenbank oder bestehende Nutzerkonten verwenden.
3. Erst nach dieser Prüfung registrierte Schemata, erzeugte Migrationen,
   Supabase-Anbindung und geschützte Bildverarbeitung ergänzen.
4. Admineditor, Galerie und Navigation mit vorhandenen Shared-Komponenten bauen.
5. Rechte-, Browser-, Build- und redaktionelle Abnahme vor Freigabe.

Der Sitzungseintrag steht vorerst hier, damit beim Übertragen nicht das große,
parallel fortgeschriebene `docs/AI-CHANGELOG.md` durch einen unvollständig
abgerufenen Stand ersetzt wird. Vor dem Merge ist der Eintrag im vollständigen
Checkout in das zentrale Änderungsprotokoll zu übernehmen.
