# Umsetzung der vollständigen Marktplatz-Nachbesserung

**Ziel:** Sämtliche gemeldeten Bedienpunkte aus der Spezifikation korrigieren und jeden Punkt als umgesetzt, geprüft oder konkret offen dokumentieren.
**Architektur:** Bestehende Formulare/Verbindungswege wiederverwenden; gemeinsame zustandslose Plattformauswahl. Keine neue Transferarchitektur.
**Technik:** Angular, Signals, Tailwind, vorhandene Supabase-/Extension-Verträge.
**Spezifikation:** ../specs/2026-10-18-marketplace-feedback-fixes.md

## Gemeinsame Regeln

Deutsch und Du-Texte, englische Bezeichner, vorhandene Designregeln, OnPush/externe Templates, keine neuen Pakete, keine fremden Dateien/Zweige. Tests nach betroffener Auswahl. Keine Veröffentlichungen bei Anbietern. Kein Push/Merge ohne dafür geltende Nutzerfreigabe.

## Task 1: Übersicht, Konten und gemeinsame Plattformbuttons

Dateien: marketplace-overview, marketplaces-settings, vorhandene Anbieter-Kontokomponenten; neuer shared/components/marketplace-platform-picker. Zustandslose Schnittstelle: platforms readonly MarketplaceId[], selectedPlatforms readonly MarketplaceId[], disabledPlatforms readonly MarketplaceId[], disabled boolean, output platformSelected MarketplaceId. Parent behandelt Einzel- oder Mehrfachauswahl.

- [x] Vorhandene Kontoabläufe und Kontextschutz lesen; Fehler durch gezielte bestehende Tests belegen.
- [x] Alle Punkte zu Übersicht, Sichtbarkeit, Kontoanlage/-verwaltung aus Spezifikation implementieren; Shared-Auswahl für Task 2 bereitstellen.
- [x] Bestehende Übersicht/Konto-/Einstellungsfälle gezielt prüfen und Bericht mit offenen Grenzen schreiben.

## Task 2: Einfaches Inserieren-Formular und Beschreibung

Dateien: listing-transfer-dialog, kleinanzeigen-transfer-target und relevante Beschreibung-/Transferdatenpfade. Benutzt gemeinsame Plattformauswahl aus Task 1; parallel eigene Dateien bearbeiten, keine Änderungen an deren Shared-Baustein.

- [x] Ursache fehlender Beschreibung über gespeicherte Quelle, API, Mapping, FormControl und DOM untersuchen; Regression zuerst rot.
- [x] Plattform/Konto/Formular als klare Schritte; Bilder oben; kurze Feldlabels; störende Hilfstexte/Quellenblock/Normalaktion Eigenschaften laden entfernen. Automatische Eigenschaften und sinnvolle Fehlerwiederholung erhalten.
- [x] Bestehende Transfer-/Editor-/Gebührenfälle gezielt prüfen; echte fehlende Daten von Übertragungsfehlern unterscheiden.

## Task 3: Updatehinweis, Header und Navigation

Dateien: pwa-update.service, pwa-update-notice, public/sw.js, zugehörige Bau-/PWA-Scripte nur soweit Versionstransport erforderlich, header/sidebar und Tests.

- [x] Doppeltanzeige/Aktivierungszustände mit Regression reproduzieren; Version an tatsächlich wartenden Bau binden.
- [x] Updatezustand korrigieren, Version anzeigen, Theme-Schalter zurück und Extra-Rücklink entfernen.
- [x] Betroffene Unit-/PWA-Script-/Header-/Sidebarfälle ausführen; Produktions-Mehrtabprüfung im Abschluss.

## Task 4: Lokale Kontobindung und gemeinsame Abnahme

Dateien: kleinanzeigen-form-schema.service, extension bridge, gegebenenfalls tools/flipbase-extension nur bei belegter Ursache; Controller verantwortet dieses Paket.

- [x] Aktuellen Browserablauf lesend reproduzieren und lokale/Server-Bindungen vergleichen, ohne Secrets zu lesen.
- [x] Ursache mit Test korrigieren, aussagekräftige Unterscheidung von Fehlzuständen und echter Wiederverbindungsaktion.
- [x] Gemeinsame betroffene Auswahl prüfen, Produktionsbau und gerenderte Browserabnahme; unabhängigen Abschlussreview durchführen.
- [x] Vollständige Abnahmeliste mit belegtem Status erstellen; PR enthält gesamten angefragten Umfang, verbleibende Grenzen ausdrücklich nennen.

## Prüffokus

Späte Kategorieantwort nach Konto-/Plattformwechsel; leere oder nicht gespeicherte Beschreibungen; verlorene lokale Bindung nach Extension-Reload; Konto-/Arbeitsbereichwechsel bei geöffnetem Modal; Aktivierung in anderem Tab mit offenen Eingaben. Diese Fälle gehören zu Task 2/4, Task 2, Task 4, Task 1/4 beziehungsweise Task 3.

## Umsetzung und Nachweise

Die Pakete sind implementiert. Detaillierte Abnahme und konkrete Grenzen stehen in [der gemeinsamen Prüfung](../../testing/marketplace-feedback-validation-2026-10-18.md). Die neue PR-/Bereitstellung erfolgt erst nach Abschluss der örtlichen Abnahme und der dafür geltenden Freigabe; ein abgeschlossener Teiltest bedeutet keine veröffentlichte Produktversion.
