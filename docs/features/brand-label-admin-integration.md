# Marken & Labels: Admin-Schnittstellen

Stand: 08.10.2026. Assistent: Juna. Fortsetzung von PR #331.

## Übertragener Umfang

Globale Referenzmarken und ihre Linien für Plattformbetreiber laden,
Referenzen nach Bearbeitungsstand durchsuchen, gespeicherte Entwürfe und
Veröffentlichungen ohne Schreibnebenwirkung öffnen sowie Markenlinien
anlegen und umbenennen. Nutzer und Workspace-Admins erhalten keinen Zugang.

Die SQL-Implementierung ist in Commit `9b411ec` enthalten. Sie bleibt unter
`supabase/test-support/brand-label-candidate` und ist keine registrierte
Release-Migration. Es gibt weiterhin keine nutzbare Adminoberfläche.

## Entscheidungen und Schnittstellen

- `list_label_admin_brands()` liefert Marken samt Linien, Kennungen,
  Versionsnummern und Archivstatus. Auch archivierte Stammdaten bleiben
  für den Betreiber sichtbar.
- `list_label_admin_references(p_filter, p_offset)` erwartet exakt
  `brandId`, `state` und `search`. Zustände: `all`, `draft`, `review`,
  `published`, `unpublished`, `archived`. Seiten enthalten 24 Referenzen
  in absteigender Kennungsreihenfolge. Der Archivstatus hat Vorrang vor
  einem noch vorhandenen Entwurf; die Veröffentlichung bleibt separat
  erkennbar.
- `get_label_admin_reference(p_reference_id)` lädt Entwurf und aktuelle
  Veröffentlichung getrennt. Lesen erzeugt keine neue Revision und
  keinen Änderungsauftrag. Unbekannte Kennungen liefern JSON-null.
- `save_label_brand_line(p_id, p_expected_version, p_input, p_request_id)`
  erwartet `brandId` und `name`. Es verwendet dieselbe Rechteprüfung,
  Versionskontrolle und Wiederholungskennung wie die vorhandene Redaktion.
  Die Referenzmarke einer bestehenden Linie bleibt unveränderlich.

Entscheidung: Eine Linienumbenennung verändert keine historische
Veröffentlichung. Die dort gespeicherte Bezeichnung bleibt erhalten.
Archivierung und Wiederherstellung von Markenlinien sind nicht Teil
dieses Schritts; archivierte Linien werden nicht beim Speichern reaktiviert.

## Nachgewiesener SQL-Testlauf

Der erste Testcommit `1f7b111` enthielt bewusst noch keine Implementierung.
Im [ersten Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/37761777261)
schlug die neue Zusicherung zur fehlenden Admin-Markenabfrage erwartungsgemäß
fehl. Nach der Implementierung besteht der
[SQL-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/37762122304)
auf PostgreSQL 17.11 mit **227 Zusicherungen, davon 62 neu**, zusätzlich zu
beiden Regressionstests des Testläufers.

Nachgewiesen sind unter anderem Rollenentzug, keine Rechte durch editierbare
Nutzermetadaten, Versionskonflikte, unveränderliche Markenlinienzuordnung,
keine Dubletten durch wiederholte Aufträge und keine neue Revision beim
reinen Öffnen eines Eintrags. Die Adminliste unterscheidet Bearbeitungsstände
und liefert eine zweite Seite bei mehr als 24 Treffern.

Der Testläufer behält seine Isolierung: neuer zufälliger Container,
keine veröffentlichten Ports, keine Host-Volumes, keine Produktivdaten.
Vereinfachte Auth-/Workspace-Fixtures und synthetische Revisionsdaten
beweisen keine vollständige Supabase-, PostgREST- oder Storage-Integration.
Keine Workflowänderung und keine Lockerung bestehender Tabellenrechte.

## Abgebrochene Oberflächenintegration

Commit `f6c8de4` enthielt zuerst neue Vertragsprüfungen und ausdrückliche
Implementierungsplatzhalter für die Markenverwaltung. Im
[ersten Frontend-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/37763486990)
schlugen alle 35 neuen Modellprüfungen an diesen Platzhaltern fehl, während
die bestehenden 329 Modellprüfungen bestanden. Das war kein erfolgreicher
Frontend-Testlauf. Ein erfolgreicher Lauf der neuen Angularseite liegt
nicht vor.

Die anschließende Übertragung des Markenadapters wurde durch die
Werkzeug-Sicherheitsprüfung blockiert. Die Blockierung wurde nicht über
einen anderen Schreibweg umgangen. Statt unimplementierten Produktcode
zurückzulassen, stellt Commit `a9f99f4` den vollständigen, zuvor geprüften
SQL-Stand wieder her. Die sechs Dateien der begonnenen Oberflächenintegration
sind daher nicht im aktuellen Branchbaum enthalten; sie bleiben lediglich
in der nachvollziehbaren Commit-Historie.

## Ausführungsumgebung und offene Arbeit

Die lokale Ausführungsumgebung antwortete vor dem Programmstart mit
`ClientError`. In dieser Sitzung wurden deshalb keine lokalen Typ-,
Format-, Build- oder Browsertests ausgeführt. Die vorhandenen CI-Prüfungen
sind davon getrennt zu betrachten. Die ältere Formatblockade im PR ist
nicht behoben; ein vollständiger grüner Qualitäts- oder Produktionsbau
ist nicht nachgewiesen.

Die vorher blockierten Änderungen an Editorsteuerung, Formatierung und
Workflow wurden nicht über einen anderen Schreibweg übertragen. Ein
zentraler Changelog-Eintrag muss im vollständigen Checkout ergänzt werden;
dessen vorhandene Historie wird nicht durch einen Teilabruf ersetzt.

Offen bleiben die sichtbare Adminoberfläche samt geprüfter Formularanbindung,
Markenlinienarchivierung, vollständige Supabase- und Bildintegration,
generierte Migrationen, API-Typen, Navigation sowie technische und visuelle
Abnahme. Die Codeprüfung war ein Selbstreview, kein unabhängiges Review.
Keine Leserfreigabe, kein Merge, kein Deployment.
