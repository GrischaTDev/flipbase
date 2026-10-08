# Marken & Labels: Admin-Schnittstellen

Stand: 08.10.2026. Assistent: Juna. Fortsetzung von PR #331.

## Umfang

Globale Referenzmarken und ihre Linien für Plattformbetreiber laden,
Referenzen nach Bearbeitungsstand durchsuchen, gespeicherte Entwürfe und
Veröffentlichungen ohne Schreibnebenwirkung öffnen sowie Markenlinien
anlegen und umbenennen. Nutzer und Workspace-Admins erhalten keinen Zugang.

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

## Prüfweg und Grenzen

Die lokale Ausführungsumgebung antwortet vor jedem Programmstart mit
`ClientError`. Daher wird dieser isolierte SQL-Kandidat im bereits
vorhandenen CI-Testcluster geprüft. Der erste Commit enthält bewusst
Tests ohne Implementierung. Ein erwarteter Fehler ist kein Erfolg.
Nach der Implementierung muss derselbe Lauf vollständig bestehen.

Der Testläufer behält seine Isolierung: neuer zufälliger Container,
keine veröffentlichten Ports, keine Host-Volumes, keine Produktivdaten.
Keine Workflowänderung und keine Lockerung bestehender Tabellenrechte.
Die SQL-Dateien sind weiterhin keine registrierten Release-Migrationen.

Die vorher blockierten Änderungen an Editorsteuerung, Formatierung und
Workflow werden nicht über einen anderen Schreibweg übertragen. Die neue
Adminarbeit ist davon unabhängig. Ein neuer zentraler Changelog-Eintrag
muss im vollständigen Checkout ergänzt werden; dessen vorhandene Historie
wird hier nicht durch einen Teilabruf ersetzt.

Offen bleiben die sichtbare Adminoberfläche, vollständige Supabase- und
Bildintegration, Migrationen sowie die Gesamtfreigabe. Diese Datei ist
zugleich der Ausführungsnachweis für diesen klar begrenzten Arbeitsschritt;
Prüfergebnisse werden nach dem tatsächlichen Lauf ergänzt.
