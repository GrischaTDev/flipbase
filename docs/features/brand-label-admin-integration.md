# Marken & Labels: Admin-Schnittstellen und Markenpflege

Stand: 08.10.2026. Assistent: Juna. Fortsetzung von PR #331.

## Aktueller Umfang

Die sechs Dateien der Markenverwaltung enthalten jetzt eine implementierte
Angularseite mit Shared-Tabelle, Suche und Bearbeitungsdialogen, einen
validierenden Datenadapter und Tests. Plattformbetreiber können Referenzmarken
mit Alternativnamen sowie zugehörige Markenlinien anlegen und umbenennen.
Workspace-Stammdaten bleiben getrennt. Archivierte Marken und Linien werden
angezeigt, aber noch nicht über diese Oberfläche archiviert oder wiederhergestellt.

Die Seite ist bewusst noch nicht in App-Routing und Hauptnavigation eingebunden.
Sie ersetzt nicht den ausstehenden Labeleditor und bietet keine Bildverwaltung.
Die zugrunde liegenden SQL-Funktionen bleiben Schemakandidaten, nicht produktiv
bereitgestellte Endpunkte. Das Gesamtfeature bleibt Entwurf.

## Bearbeitungs- und Rechteverhalten

Nur der bestehende Supabase-Client wird verwendet. Der Adapter übergibt keine
Nutzerrolle oder Workspace-Schreibfreigabe. Die SQL-Funktionen prüfen weiterhin
die aktuelle Plattformbetreiberrolle.

Speicheraufträge halten Eingaben, Versionsnummer und Vorgangskennung unveränderlich
fest. Doppelklicks erzeugen keinen zweiten Auftrag. Eine unklare Antwort wird nicht
automatisch wiederholt; eine ausdrückliche Wiederholung nutzt denselben Auftrag.
Widersprüchliche Serverantworten gelten nicht als bestätigte Speicherung.
Versionskonflikte erhalten lokale Eingaben und verlangen Nachladen.

Bei Nutzer-, Workspace- oder Rollenwechsel verschwinden alte Daten und Dialoge.
Verspätete Antworten dürfen den neuen Kontext nicht überschreiben. Auch ein
serverseitiger Rechteentzug leert den Editor. Schließen und Nachladen schützen
ungespeicherte Werte; bei unbestätigter Speicherung bleibt der Dialog offen.
Vor dem Schließen des Browserfensters wird bei offenen Änderungen gewarnt.
Der vorhandene Unsaved-Guard muss bei der späteren Routeneinbindung gesetzt werden.

Veröffentlichte Labeltexte werden durch Marken- oder Linienumbenennung nicht
rückwirkend verändert. Die Oberfläche zeigt diese Abgrenzung ausdrücklich.

## Tests dieser Fortsetzung

Die zuvor begonnenen Tests wurden zunächst gegen die fehlende Implementierung
ausgeführt: 27 von 29 Modelltests und nach Auflösung externer Vorlagen zehn von
elf Seitentests schlugen fehl. Die frühere Angabe von 35 Modelltests war falsch.
Danach wurden Adapter und Oberfläche implementiert und acht Interaktionstests ergänzt.

Auf einer eigenen Kopie von PR-Head `ce038670` mit ausschließlich diesen sechs
neuen Dateien bestehen **358 Modelltests und 53 Angulartests**. Darin enthalten
sind **29 neue Modelltests und 19 Adminseitentests**. Die Seitentests rendern
die echte externe Vorlage und Shared-Komponenten, betätigen Buttons, ändern
Formularfelder, senden das Formular ab und prüfen Suche, Dialog und Rechteentzug.
Die bestehende JIT-Testumgebung erhält dafür explizite Signal-Metadaten nur im
Test und stellt sie danach wieder her.

Projekt-Typprüfung, Angular-Vorlagenkompilierung (`ngc --noEmit`), gezieltes Lint,
Formatierung der neuen Dateien und Shared-UI-Architekturprüfung bestehen lokal.
Dies ist keine Browser-, AXE- oder vollständige Supabase-Abnahme.
Ein unabhängiges Review wurde nicht ausgeführt.

Der lokale CLI-Produktionsbau endet vor dem Bau mit Exit 3: Node 22.16.0 erfüllt
die von der Projekt-CLI verlangte Mindestversion nicht. Diese Prüfung wurde
nicht umgangen. Ein erfolgreicher Produktionsbau muss aus der Projekt-CI kommen.

## Formatierung und Übertragung

Die zwölf älteren Formatfehler sind lokal mit dem festgelegten Projektformatter
korrigiert. Der vollständige lokale Formatlauf besteht; ein Syntaxbaumvergleich
bestätigt unveränderte Logik einschließlich Tests. Der ursprüngliche Vergleich
der gedruckten JavaScript-Ausgabe war wegen verbleibender Layoutunterschiede
nicht aussagekräftig.

Die Übertragung dieser Formatkorrekturen wurde von der Werkzeug-Sicherheitsprüfung
blockiert. Sie sind nicht Bestandteil des neuen Markenverwaltungsbaums und
werden nicht über einen anderen Schreibweg übertragen. Deshalb ist die
vollständige Formatprüfung im PR weiterhin offen. Der zentrale Sitzungseintrag
liegt im lokalen, vollständig erhaltenen AI-Changelog und im Ergänzungspatch.

## Bereits geprüfte SQL-Kandidaten

Commit `9b411ec` enthält `list_label_admin_brands`,
`list_label_admin_references`, `get_label_admin_reference` und
`save_label_brand_line`. Der frühere isolierte PostgreSQL-17.11-Lauf besteht
mit 227 Zusicherungen und zwei Runner-Tests. Die SQL-Dateien wurden in dieser
Fortsetzung nicht verändert und nicht lokal erneut ausgeführt.

Listen und Details lesen ohne Schreibnebenwirkung; Markenlinien werden
versionsgesichert angelegt und umbenannt. Alte Veröffentlichungen behalten
ihre gespeicherten Namen. Die vereinfachten Testkonten und Bildmetadaten
ersetzen keine vollständige Auth-, PostgREST-, Storage- oder Decoderprüfung.

## Vor einer Freigabe offen

Vollständiger Labeleditor und Redaktionsübersicht, Marken-/Linienarchivierung,
geschützte Bildverarbeitung und Bildrechtepflege, registrierte Schemata und
erzeugte Migrationen samt API-Typen, Routing mit Unsaved-Guard, Navigation,
visuelle und unabhängige Abnahme sowie redaktionell freigegebene Nike-Referenzen.
Keine Produktivdaten geändert, kein Merge und kein Deployment.
