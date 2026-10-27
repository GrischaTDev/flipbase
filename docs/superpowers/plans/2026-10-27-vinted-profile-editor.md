# Vinted-Profilbearbeitung

**Ziel:** Das bestätigte Profil-Mockup um einen gemeinsamen Bearbeitungsdialog für die tatsächlich verfügbaren Vinted-Felder ergänzen.

**Grundlage:** Nutzerfreigabe für die Backend-Erweiterung und Prüfung des angemeldeten Vinted-Formulars am 27.10.2026. Beschreibung, Profilbild, Stadt, Stadtsichtbarkeit und Sprache sind vorhanden. Der Landeswert wird unverändert als Kontext angezeigt; der Benutzername hat einen separaten, kontobedingt gesperrten Ablauf. Kein frei bearbeitbarer Anzeigename vorhanden.

**Technik:** Bestehender kontogebundener Worker, isolierter Browsertransport und Angular-Shared-Komponenten. Alte Profiltext-Endpunkte bleiben kompatibel. Bestätigte Felder im vorhandenen JSON-Profilcache speichern; keine Schemaänderung oder Migration erforderlich.

## Schritte

- [x] Backend-Vertrag und Browseradapter: Tests für Ausgangskonflikte, fremdes Konto, ungültige Städte/Bilder und ignoriertes Speichern zuerst ergänzen; anschließend Lesen, Stadtsuche und einmaliges Speichern mit Gegenlesen implementieren.
- [x] Transport und HTTP-API: neuen Vertrag validieren, Berechtigungen und Sitzungssperre erhalten; Bildgröße nur auf der neuen Speicherroute begrenzen. Bestätigte Cachewerte gegen parallele Importe absichern.
- [x] Frontend: Shared-Dialog, echte Stadtauswahl, Stadtanzeige, Sprache und Bildvorschau ergänzen. Unveränderte Werte erhalten; unbestätigte Antworten nicht übernehmen. Profilkopf und drei Bewertungskacheln entsprechend Mockup angleichen.
- [x] Betroffene Worker-, Transport-, Cache-, API- und Angular-Tests sowie passende Browserfälle ausführen. Formatierung, Lint, Typprüfung und Angular-Bau prüfen. Danach vor Push/PR/Merge die vorgeschriebene Freigabe einholen.

## Prüfgrenzen

Keine echte Änderung von Beschreibung, Stadt oder Sprache für Tests. Nur der unveränderte erneute Upload des bestehenden öffentlichen Profilbilds ist ausdrücklich freigegeben. Standort-Sichtbarkeit ist eine Nutzereinstellung und wird beim normalen Speichern nur mit ausdrücklich veränderter Formulareingabe geändert. Kein automatischer Wiederholungsversuch nach unklarem Speicherausgang.
