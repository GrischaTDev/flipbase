# Umsetzung: Bedienung der Inseraterstellung

> Nach Freigabe dieses Entwurfs in derselben Sitzung durch Juna umsetzen. Fachliche Änderungen und Prüfungen jeweils abschließen, bevor der nächste abhängige Schritt beginnt.

**Ziel:** Den bestehenden Vinted-Editor nach den konkreten Nutzerhinweisen vereinfachen, mit Fotos zuerst, gemeinsamer Artikelgalerie und direkten Auswahlfeldern.

**Architektur:** Angular-Signals/Reactive Forms; bestehende Shared-Komponenten für Galerie, Kategorie und Auswahl. Marketplace-Services liefern fachliche Daten und echte Vinted-Kennungen. Kein neues Backend-Schema. Die bestehende Veröffentlichungsprüfung bleibt die abschließende Prüfung vor einer gesonderten Freigabe.

**Stack:** Angular 22, Tailwind, bestehender Zuschneider und vorhandene Marketplace-/Supabase-Anbindung. Keine neuen Abhängigkeiten oder Major-Updates.

**Entwurf:** [Verhalten und Abnahmekriterien](../specs/2026-10-21-vinted-listing-usability-design.md). [Vintz-/KI-Befund](../../research/2026-10-21-vintz-listing-photo-ai.md) ist eine getrennte Untersuchung, keine Freigabe einer neuen automatischen KI-Verarbeitung.

**Globale Grenzen:** Nur eigener Zweig `juna/vinted-listing-usability` auf aktuellem `origin/master`. Fremde Änderungen im Hauptordner unberührt. Konto-/Benutzer-/Workspace-Bindung, Revisionsschutz, echte Anbieterkennungen und unverändertes JAKO-Original erhalten. Keine Veröffentlichung, Nachricht oder Duplikation. Vor Push gezielte Prüfungen und neue PR-/Merge-Freigabe gemäß AGENTS.md.

**Review-Schwerpunkte:** verspätete Antworten, keine Veröffentlichung aus einem ungültigen Zustand, unvollständige Entwürfe, Verlust bestehender Bildpfade/Dateinamen, vorhandene Verbraucher der Shared-Komponenten, Fokus und Touch, keine erneute Warnflut.

## 1. Ausgang und tatsächliche Testauswahl sichern

- Aktuellen Basispunkt und sauberen eigenen Arbeitsstand bestätigen; `docs/AI-CHANGELOG.md` und `docs/design/admin-ui-guidelines.md` beachten.
- Vorhandene Tests für Editor, Bilderdienst, Bildeditor, Kategoriepicker, Feldzuordnung, Marken und Publikationsvorschau lesen. Geplante Änderungspfade an `scripts/affected-tests.mjs --paths …` übergeben und ausgegebene Modell-/Angular-/Browserauswahl als Prüfumfang festhalten.
- Vor Implementierung Abhängigkeiten mit Lockfile installieren (`npm ci`, keine Updates); betroffene Basistests ausführen. Kein breiter Gesamtworkflow für unabhängige fertige Funktionen.
- Bereits bestehende geeignete Testdateien erweitern. Nur wenn ein neuer fachlicher Baustein eigene ungesicherte Fälle braucht, neue Tests anlegen und deren Registrierung mitprüfen.

## 2. Prüfung von Darstellung trennen

**Ändern:** `src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts`, zugehöriges HTML und vorhandene Angular-Tests. Bei Bedarf `models/vinted-listing-editor-validation.ts` und dessen Tests.

- Zunächst einen fehlgeschlagenen Regressionstest für ruhiges Öffnen, speicherbaren unvollständigen Entwurf und erreichbaren Veröffentlichungsversuch ergänzen.
- Vorhandene interne Validierung vollständig erhalten, sichtbare Fehler aber an passenden Aktionsversuch binden. Speichern zeigt nur tatsächliche Speicherfehler; Veröffentlichungsversuch markiert fehlende Pflichtangaben und fokussiert das erste Feld.
- `canStartPublication` nicht von schon fehlerfreiem Inhalt abhängig machen; der Handler prüft zuerst, öffnet aber nur für einen gültigen, gespeicherten Stand die Vorschau. Änderungen während Speichern/Prüfung weiterhin an Scope/Revision binden.
- Kein entfernter/gesperrter Benutzer erhält durch diese Bedienänderung eine Aktion. Lade-, Konflikt- und Berechtigungsfehler bleiben sichtbar.
- Fehlermeldungen und beanstandete Erklärungstexte reduzieren; Status `Entwurf gespeichert`.
- Ausgewählte Editor-/Validierungstests ausführen.

## 3. Artikelgalerie wiederverwenden

**Ändern:** `src/app/shared/components/product-media-editor/product-media-editor.component.ts` und HTML/Tests; `src/app/shared/components/image-cropper-modal/image-cropper-modal.component.ts` und HTML/Tests. Marketplace-Adapter im Feature, bestehende `ListingImageDraft`-Schnittstelle nur gezielt erweitern. Editor und gegebenenfalls `services/vinted-listing-image.service.ts` samt bestehender Tests.

- Tests sichern die unveränderten Defaults der bisherigen Galerie-/Zuschneider-Verbraucher und die konfigurierten Vinted-Grenzen.
- `ProductMediaEditorComponent`: konfigurierbare akzeptierte Dateiformate und Zuschnittparameter, Bearbeitungsstatus als Ausgabe. Die Darstellung wird direkt wiederverwendet, kein kopiertes HTML.
- Adapter hält Produktmedien und Inseratbildspeicherung getrennt. Key, bestehender Storagepfad, Dateiname und unveränderte Datei bleiben nachvollziehbar erhalten. Nach Crop alte Speicherreferenz verwerfen; beim bloßen Umsortieren/Umbenennen keine Bilder verlieren.
- Falls der bestehende Entwurfsspeicher geänderte Bildnamen nur bei Upload kennt, im Adapter die betreffende Datei gezielt neu bereitstellen oder vorhandenen Metadatenvertrag verwenden; keine erfundene/unsichere Backendänderung. Speicher-/Rücklesetest belegt den gewählten Weg. Alternativtext nur dort anbieten, wo er verlässlich gespeichert werden kann.
- Zuschneider bekommt `aspectRatio` mit bisherigem Default; Vinted setzt 2:3 und einen passenden Titel. Keine automatische Bearbeitung beim Upload. Verschieben, Drehen, Übernehmen/Abbrechen sowie Touch-/Tastaturfokus prüfen.
- Vorhandenen Alert-Listenfehler in der wiederverwendeten Galerie vermeiden: Rolle auf umgebendem Container, semantische Liste erhalten.
- Betroffene bestehende Galerie-, Zuschnitt-, Bilddienst- und Consumer-Tests ausführen.

## 4. Kategoriepicker auf Inhalt begrenzen

**Ändern:** `src/app/shared/components/category-picker/category-picker.component.html`, gegebenenfalls TS/SCSS und vorhandene Tests.

- Regression für wenige Einträge, viele Treffer, Navigation und Bildschirmrand zuerst absichern.
- Festhöhe entfernen, Scrollfläche nur bei erreichter Maximalhöhe. Popover nach asynchron geladenen Einträgen passend positionieren; schmale Breiten ohne Überlauf.
- Bestehende Such-/Hierarchie-/Tastatursteuerung und tatsächliche Einsatzstellen prüfen. Vinted-Feldlabel zu Kategorie ändern.

## 5. Feldkatalog automatisch laden und direkt bearbeiten

**Ändern/ergänzen im Feature:** Editor; `services/vinted-listing-category.service.ts`; bei Bedarf ein `vinted-listing-fields`-Baustein unter `features/marketplaces/components/` statt des Auswahlmodals. Bestehende Feldmodelle und deren Prüfung weiterverwenden.

- Kurze automatische Ladephase nach gültiger Kategorie-/Kontowahl. Kein Abruf ohne ausreichende Berechtigung oder bestätigte Kontoidentität. Gleiche laufende Abrufe zusammenfassen und geprüfte Antworten während der Editorsitzung begrenzt zwischenspeichern; frische Veröffentlichungsprüfung bleibt erhalten.
- Cache/Antwortprüfung an Benutzer, Workspace, Connection, externe Identität, Verbindungsstatus/-modus und Kategorie binden. Änderungen und Abbruch verwerfen späte Ergebnisse. Fehlgeschlagene Antworten nicht als dauerhaft erfolgreichen Cache speichern.
- Größe und Zustand über bestehendes `CustomSelectComponent`; Mehrfachauswahl für Farbe/Material auf vorhandener geeigneter Shared-Bedienung. Bestehende Limits und ID-/Labelprüfung weiter nutzen. Paketgröße direkt und lesbar darstellen.
- Beim Wechsel ungültige Auswahlkennungen verwerfen, sichtbare Entwurfsangaben nicht unbemerkt überschreiben. Felder, die eine Kategorie nicht anbietet, nicht künstlich verlangen. Noch nicht unterstützte Pflichtfelder verhindern die Veröffentlichung mit konkretem Fehler.
- Dialogaufruf und zugehörige Erklärungstexte aus dem Editor entfernen. Bestehenden Dialog erst löschen, wenn keine weiteren Verbraucher vorhanden sind.
- Tests für erfolgreichen Abruf, Fehler/Wiederholung, identische Mehrfachabrufe, raschen Kontextwechsel, gespeicherte alte Entwürfe, fehlende/entfernte Wahl und ungültige Kennung.

## 6. Marke als Suche mit Vorschlägen

**Ändern/ergänzen:** Gemeinsame zustandslose Vorschlagsbedienung, fachlicher `vinted-listing-brand-picker` im Marketplace-Feature und bestehender `VintedBrandSearchService`; alten Markenmodal-Aufruf im Editor ersetzen.

- Bestehende BrandPicker-/CustomSelect-Mechanik als Darstellungsgrundlage prüfen. Kein Datenbankzugriff in neuem Shared-UI und keine Veränderung von Workspace-Marken zu Vinted-Marken.
- Texteingabe mit kurzer Verzögerung; Ergebnisse mit echten Vinted-IDs. Keine komplette Markenliste importieren. Suche, Tastaturauswahl, Löschen, Keine Marke und erneuter Versuch im Feld.
- Manuelles Weitertippen entwertet frühere ID; Text bleibt für Entwurf erlaubt. Alte Antworten nach Query-/Kontextwechsel oder Destroy ignorieren. Doppelte widersprüchliche Marken-IDs nicht übernehmen.
- Bestehende Tests für Suche, fehlende/mehrdeutige Treffer, Auswahl und Kontextwechsel übernehmen beziehungsweise gezielt erweitern.

## 7. Endgültigen Seitenaufbau und Browserfälle prüfen

- Galerie links nach oben, Text darunter; rechts Artikeldetails und Preis/Versand. Seitenkopf und vorhandene Designwerte wiederverwenden. Keine neue Layout-/Farbsprache.
- Bestehende `e2e/vinted-listing-drafts.spec.ts`, `e2e/vinted-listing-edge-cases.spec.ts` und die durch tatsächlich geänderte gemeinsame Bausteine ausgewählten Artikel-/anderen Verbraucherfälle anpassen. Fachlich unveränderte Verkäufe/Einkäufe nicht pauschal durchspielen; die konkrete CI-Auswahl entscheidet über erforderliche abhängige Fälle.
- Bestehende Browsermatrix vollständig für die betroffenen Dateien: Desktop/Mobil, Touch, Hell/Dunkel, Tastatur, AXE. Ruhende Vorschau verwenden, kein gleichzeitiger Neubau.
- Pflichtfälle: leere Maske ruhig; Fotos zuerst; unvollständiger Entwurf speichern/zurücklesen; angeforderte Prüfung fokussiert Fehler; direkte Auswahl und gültige IDs zurücklesen; Marke tippen/auswählen/ändern; Crop 2:3; Bildname und Reihenfolge; Kategoriepanelhöhe; kein zusätzlicher Modal; keine Veröffentlichung oder echtes Duplikat.

## 8. Abschluss vor neuer PR-Freigabe

- Geänderte Dateien formatieren/linten; Root-Typprüfung und regulären Angular-Produktionsbau ausführen. `scripts/affected-tests.test.mjs`, Suite-/Registrierungsprüfung und tatsächliche Playwright-Auflistung ausführen, wenn neue/verschobene Testbausteine oder Zuordnungen betroffen sind.
- Nach letzten Änderungen nur gerechtfertigt betroffene Prüfungen erneut ausführen. Relevante CI-Unterschiede gemäß Repositoryregel nachstellen oder konkrete Lücke benennen.
- Unabhängigen Review des fertigen Diffs anfordern; Befunde korrigieren und gezielt nachprüfen. `docs/AI-CHANGELOG.md` mit ausgeführten Prüfungen, Grenzen und Nachweisen aktualisieren.
- Nutzer bekommt eine konkrete lokale Vorschau/Screenshots und kurze Zusammenfassung. Erst dann gemäß AGENTS.md fragen: **Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?** Kein Push/PR/Merge aus der Freigabe des vorherigen bereits abgeschlossenen Auftrags ableiten.

## Planprüfung

Der Plan trennt vorhandene Berechnungen von ihrer frühen Darstellung, erhält die Veröffentlichungssperren und adressiert den Unterschied zwischen Artikelmedien und Inseratbildern ausdrücklich. Cache und asynchrone Antworten sind kontextgebunden. Die Bild-/Kategorieänderungen berücksichtigen gemeinsame Verbraucher. Keine automatische KI-Funktion und keine dauerhafte Katalogmigration als Nebeneffekt. Exakte neue Dateinamen für kleine UI-Unterbausteine dürfen bei der Umsetzung entsprechend der bestehenden gemeinsamen Auswahltechnik angepasst werden; die beschriebenen Verantwortungen bleiben verbindlich.
