# Task 6 – Listings, Fulfillment, Recherche und Bildexport

## Umsetzung

- Listings, Fulfillment, Preisübernahme und Bildexport melden ihren bestätigten Abschluss per Toast; die bisherigen Veröffentlichungs- und Bündelungsbanner wurden entfernt.
- Erfolgszustände und Dialogschlüsse erfolgen erst nach einem bestätigten Service-Ergebnis. Lokale Fehler werden persistent gezeigt, zentral gemeldete Sync-Fehler nicht dupliziert.
- Listing-, Fulfillment- und Preisradar-Services liefern nun explizite Fehlerergebnisse beziehungsweise werfen beim bereits zentral gemeldeten Persistenzfehler. Die Versanddaten werden außerhalb des Demo-Modus vor der lokalen Übernahme gespeichert und Nulltreffer als Fehler behandelt.
- Der Bildexport zeigt bei Fehlern einen angepinnten Toast mit der Ausnahmebeschreibung; Vorschau-, Scan-, Kopier- und Navigationsaktionen bleiben ohne Toast.

## Tests und Prüfungen

- RED: neue Feature-Specs initial rot mit neun fehlenden/falschen Meldungen; Service-Vertrags-Specs anschließend rot mit fünf fehlenden Ergebnis-/Persistenzpfaden.
- Gezielte Tests: 7 Dateien, 30 Tests grün.
- Vollsuite: 79 Dateien, 548 Tests grün.
- Typecheck, Prettier und Build: grün.
- ESLint: keine Fehler; 48 bestehende `any`-Warnungen im Projekt.

## Hinweise

Die drei ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden nicht verändert oder gestaged.
