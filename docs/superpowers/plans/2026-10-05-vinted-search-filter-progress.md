# Vinted-Suchfilter: Arbeitsstand

Basis: `02dbcfbddaba4dfae0736bbd879d265fe2296b5a`.
Eigener Zweig: `juna/vinted-central-search-filters`.

Der Nutzer hat nach dem Filterentwurf die Umsetzung und die Fortsetzung über die GitHub-Anbindung bestätigt. PR und Merge bleiben bis zur Abschlussfreigabe aus.

Die Chat-Testumgebung erreicht GitHub/npm nicht direkt. Deshalb laufen die Projektprüfungen auf einem isolierten GitHub-Runner des eigenen Arbeitszweigs. Der temporäre Prüfworkflow verwendet ausschließlich Leserechte, keine Produktionsgeheimnisse, keine Veröffentlichung und kein Deployment. Er wird vor dem fertigen PR entfernt. Fremde Zweige, insbesondere die Favoritennachrichten, bleiben unverändert.

## Schritte

- [ ] Fehlende Titel-/Kategoriefilter mit realen Regressionstests belegen.
- [ ] Gemeinsamen Kategorie-/Marken-/Titel-Editor integrieren.
- [ ] Administrativen Speichervertrag, Revisionen und atomare Übernahme einbauen.
- [ ] Migration erzeugen, Datenbankrechte und Kompatibilität prüfen.
- [ ] Collector-, Angular-, Datenbank-, Browser- und Architekturprüfungen ausführen.
- [ ] Temporären Workflow entfernen und Abschlussfreigabe einholen.

Keine abgeschlossene Implementierung und keine bestandenen Tests behauptet.
