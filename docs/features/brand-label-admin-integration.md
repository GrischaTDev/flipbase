# Referenzbibliothek: Redaktion

Stand: 08.10.2026. Assistent: Juna.

Nur Plattformbetreiber verwenden die geschützten Redaktionsrouten:

- `/tools/brand-labels/admin`: Labelsuche, Statusfilter, Neuanlage und Leseröffnung.
- `/tools/brand-labels/admin/brands`: Referenzmarken und Markenlinien einschließlich Archiv/Wiederherstellung.
- `/tools/brand-labels/admin/images`: Upload, Bildnachweis, erlaubte Verwendung und Widerruf.
- `/tools/brand-labels/admin/labels/:id`: Inhalte, Quellen, Datierungen, Prüfhilfen, Grenzen, Verweise und Bildreihenfolge.
- `/tools/brand-labels/admin/sizes`: Größentabellen mit getrenntem Entwurf und veröffentlichtem Stand.

Labels durchlaufen Entwurf, Prüfung und Veröffentlichung. Veröffentlichte
Revisionen bleiben unveränderlich. Die Redaktion kann Bearbeitungen verwerfen,
Referenzen archivieren und wiederherstellen. Marken-/Linienumbenennungen ändern
bereits veröffentlichte Labeltexte nicht rückwirkend.

Schreibaktionen prüfen Rolle, Versionsnummer und Vorgangskennung in der
Datenbank. Eine unklare Antwort wird nach ausdrücklicher Aktion mit demselben
unveränderlichen Auftrag wiederholt. Bestätigte Validierungsfehler geben die
erhaltenen Eingaben zur Korrektur frei. Versionskonflikte überschreiben keine
neueren Daten. Ungespeicherte Werte sind bei Navigation und Fensterschluss
geschützt; Rechteentzug und Kontextwechsel entfernen lokale private Inhalte.

Uploads akzeptieren JPEG, PNG und WebP bis 10 MB. Der Browser begrenzt die
Anzeige auf 1200 × 1200 Pixel. Der Server prüft die normalisierte PNG
einschließlich Prüfsummen und entpackter Scanlines und entfernt Metadaten.
Originale und Anzeigen liegen privat. Ausschließlich die interne Medienaktion
darf den erfolgreichen Abschluss bestätigen.
