# Vinted-Inseraterstellung abschließen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eingabegrenzen und fehlende Voraussetzungen im vorhandenen Vinted-Editor erklären und den bestehenden Veröffentlichungsweg gezielt prüfen.

**Architecture:** Der Editor bleibt erhalten. Ein reines Featuremodell prüft bekannte Pflichtangaben und verwendet nach ausdrücklichem Abruf dieselbe aktuelle Kategorieprüfung wie die Veröffentlichung. Kontovoraussetzungen bleiben von der endgültigen Server- und Kontofreigabe in der bestehenden Vorschau getrennt.

**Tech Stack:** Bestehendes Angular 22, Signals, Reactive Forms, gemeinsame Formularbausteine, Vitest, Playwright und bestehende Worker-Browsertests; keine neuen Abhängigkeiten.

**Spec:** Im Chat beschriebene und vom Nutzer ausdrücklich beauftragte drei Punkte. Bedienumbau, Bildergalerie-Anbindung, KI und Relisting folgen später.

## Global Constraints

- Bestehende Entwürfe bleiben vollständig und unvollständige Entwürfe speicherbar.
- Höchstens 20 neue Fotos auswählen; bestehende größere Entwürfe weder kürzen noch löschen.
- Textgrenzen aus tatsächlich gelesener Kategorieantwort verwenden, keine geschätzten universellen Grenzen.
- Kein automatischer Anbieterabruf durch Eingabe, Konto- oder Kategoriewechsel.
- Kategorieantworten an Nutzer, Arbeitsbereich, Kontoidentität und Kategorie binden.
- Vorhandene Serverprüfung, Freigabe, Versionsbindung und Wiederholschutz beibehalten.
- Echte Veröffentlichung erst mit konkret benanntem Artikel, Zielkonto und bestätigtem Inhalt; fehlende Daten beim Nutzer erfragen.
- Tailwind und bestehende Shared Components, keine lokale Formularoptik.

## Review Focus

- Größerer alter Entwurf: alle Fotos erhalten, Veröffentlichung bis zur bewussten Korrektur sperren.
- Kategorie-/Kontowechsel: alte Textgrenzen und Auswahlantworten nicht übernehmen.
- Unvollständige Inhalte: als Entwurf speichern können, keinen Veröffentlichungsauftrag erlauben.
- Speicherfehler und verlorene Auftragsantwort: Eingaben und Anfragekennung erhalten.
- Anbieter-Zusatzfeld: als konkrete nicht unterstützte Voraussetzung erklären, niemals erfinden.

### Task 1: Frühe Eingabeprüfung

**Files:** Neues `models/vinted-listing-editor-validation.ts` und `.spec.ts`; bestehende Veröffentlichungshinweise in `models/vinted-listing-publication-review.ts`; Editor `.ts`, `.html`, `.angular.spec.ts`; Kategorieauswahldialog `.ts`, `.angular.spec.ts`.

**Interfaces:** `validateVintedListingEditor(content, photos, schema)` liefert Feldfehler. `schemaLoaded` des bestehenden Auswahldialogs liefert die geprüfte Kategorieantwort; Editor speichert sie mit dem bestehenden Kontextschlüssel und nutzt sie nur bei identischem Schlüssel.

- [ ] Modelltests für leere Pflichtwerte, Nullpreis, 20/21 Fotos, dynamische Textgrenzen und unbekannte Felder zuerst rot ausführen.
- [ ] Gemeinsame Fehlermeldungen und vorhandene Kategorieprüfung wiederverwenden; ohne Kategorieantwort nur sicher bekannte Mindestangaben prüfen.
- [ ] Im Editor Feldfehler und Bildanzahl früh anzeigen, neue Auswahl auf 20 begrenzen; Entwurfsspeicherung unabhängig von Veröffentlichungsfähigkeit erhalten.
- [ ] Kategorieantwort über bestehenden ausdrücklichen Abruf weitergeben, nach Kontextwechsel ignorieren; Grenzen und Hinweise am Feld anzeigen.
- [ ] Bestehende Modell-, Editor-, Feldauswahl- und Vorschautests einschließlich neuer Regressionen grün ausführen.

### Task 2: Voraussetzungen verständlich erklären

**Files:** Editor `.ts`, `.html`, `.angular.spec.ts` und neues Validierungsmodell samt Tests aus Aufgabe 1.

**Interfaces:** Abgeleiteter Hinweis im Editor benennt fehlendes Konto, lokale Verbindung, Verbindungsstatus, unbekannte Kontoidentität oder Kategorie. `canStartPublication` berücksichtigt frühe Fehler; `canSave` erlaubt unvollständige Inhalte weiterhin.

- [ ] Fälle für fehlendes, lokales, pausiertes, abgemeldetes und kontofremdes Konto sowie Kategorie zuerst rot prüfen.
- [ ] Hinweise mit nächster Handlung ergänzen; finale Server-/Kontofreigabe weiterhin in der bestehenden Vorschau prüfen.
- [ ] Erhalt von Entwürfen und Sperre alter Antworten/anderer Konten gezielt prüfen.

### Task 3: Veröffentlichungsweg abnehmen

**Files:** Bestehende `e2e/vinted-listing-drafts.spec.ts`, betroffene Tests und `docs/AI-CHANGELOG.md`.

- [ ] Vorhandene Browserfälle nutzen: Speichern, Wiederöffnen, Fotos/Reihenfolge, Vorlagen, Auswahl, Freigabe, Termin, verlorene Antwort und bestätigter Auftragsstand.
- [ ] Konkrete neue Risiken in derselben vorhandenen Browserdatei ergänzen: frühe Grenzen und unvollständigen Entwurf erhalten; keine fachfremden Abläufe.
- [ ] Testauswahl aus geänderten Dateien bestimmen, Registrierung/Audit, Format, ESLint, Typprüfung und Angular-Bau ausführen.
- [ ] Betroffene Browserfälle in den bestehenden Desktop-/Touch-/Hell-/Dunkelvarianten gegen ruhende lokale Vorschau ausführen. Browser-Plugin nicht verfügbar; vorhandenes Playwright verwenden.
- [ ] Bestehende echte Worker-Browserfälle für Neuanlage, Fotos und Ergebnis gegen lokale Anbieterformulare prüfen; keine echte Anbieterwirkung daraus behaupten.
- [ ] Nach Artikel-/Kontofestlegung den echten Anbieterablauf gesondert prüfen; ohne diese Daten Prüflücke ausdrücklich dokumentieren.
- [ ] Unabhängige abschließende Codeprüfung ausführen, Befunde gezielt beheben; erst nach lokalen Prüfungen die vorgeschriebene PR-/Merge-Frage stellen.

## Ausführungsnotizen

- Nutzer hat die drei beschriebenen Punkte zur Umsetzung freigegeben; keine erneute Planfreigabe erforderlich.
- Eigener verwalteter Worktree vom aktuellen `origin/master`, Branch `juna/vinted-listing-readiness`.
- Abhängigkeiten aus unveränderter Sperrdatei mit `npm ci` installiert.
