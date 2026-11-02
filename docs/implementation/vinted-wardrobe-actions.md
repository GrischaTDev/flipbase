# Kleiderschrank: Aktionen und kurzes Relisten

Freigabegrundlage: Nutzerkorrektur nach der echten Sichtkontrolle von #543.
Vor einem PR die fertige lokale Oberfläche mit Screenshots zur Sichtkontrolle zeigen.
Keine Veröffentlichung vor dieser Abnahme.

## 1. Falschen Einstieg entfernen

- [x] „Inserieren“ aus der gemeinsamen Aktionsleiste von Raster und Liste entfernen.
- [x] Preis ändern, Relisten und neue Inserate aus Vorlage erhalten.

## 2. Einheitliche Artikelaktionen

- [x] Vorhandenen Shared Button um eine neutrale graue Tabellenaktion ergänzen.
- [x] Artikelaktionen mit demselben grauen Hover-/Fokuszustand wie Einstellungsaktionen.
- [x] Zugängliche Icon-Beschriftungen und Touch-Flächen erhalten.

## 3. Inserat löschen

- [x] Eigene Löschaktion mit Bestätigung ergänzen.
- [x] Server prüft Konto und Artikel; genau eine Löschung mit eindeutiger Anbieterbestätigung.
- [x] Erst nach bestätigter Löschung den zugehörigen Cacheeintrag entfernen.
- [x] Laufende Aktion sichtbar halten; bei Fehlern oder unklarem Ausgang nicht als gelöscht melden.
- [x] Prüfung ausschließlich mit synthetischen Anbieterantworten, keine echte Anzeige löschen.

## 4. Kompaktes Relist-Modal

- [x] Ein Modal mit Titel und Beschreibung, anschließend Bildoptionen und Veröffentlichung.
- [x] Keine vollständige Artikeldatenmaske und kein zusätzlicher Detailschritt beim Relisten.
- [x] Bestehende übrige Artikeldaten unverändert übernehmen; Vorlagen und regulären Editor erhalten.
- [x] Sofort, Wartezeit und fester Termin sowie Originalbilder und vorhandene Bildoptionen erhalten.
- [x] Aktionen oben; keine zusätzlichen Erklärtexte.
- [x] Dasselbe kurze Formular für die Bearbeitung noch nicht ausgeführter Relist-Planungen.

## 5. Funktionsprüfung und Sichtkontrolle

- [x] Vorbereiteten Leser-Fix für fehlende optionale KI-Auswahl erhalten.
- [x] Betroffene Komponenten, Anbieterabläufe und gemeinsame Verbraucher prüfen.
- [x] Lokale Screenshots von Aktionsleiste, kurzem Modal und Löschbestätigung für die Abnahme erstellen.
- [ ] Nutzerabnahme vor PR und Veröffentlichung abwarten.

## Prüfnachweis und verbleibende Abnahme

- Lokale Vorschau mit synthetischen Artikeln: Relisten, Vorlagen, geplante Titeländerungen,
  Bildoptionen, Löschbestätigung, unklarer Löschstatus und Fehleranzeige in Hell/Dunkel bei
  390 und 1440 Pixeln. Vier Preisfälle und zwei vollständige Bearbeitungsfälle ebenfalls bestanden.
- Der erste Browserlauf fand eine fehlende Anzeige von Artikelaktionen ohne aktivierte
  Veröffentlichungsautomatik. Header und Fehlerindikator berücksichtigen jetzt auch Preis-
  und Löschaktionen. Zwei veraltete Testannahmen an den früheren Relist-Ablauf angepasst.
- 214 Angular-Fälle und 736 Worker-Fälle bestanden, acht reguläre Worker-Auslassungen.
  76 ausgewählte native Browserfälle bestanden; danach die neun Preisfälle einschließlich
  neuer Gegenprobe erneut bestanden. Alle Anbieter-Schreibanfragen synthetisch abgefangen.
- Leser- und Preisabruf erlauben eine fehlende optionale KI-Auswahl; eine fehlende oder
  aktivierte Push-Auswahl bleibt gesperrt. Kein echter Anbieter-Schreibzugriff.
- Formatprüfung, Lint, beide Typprüfungen und Builds erfolgreich; Suite-Audit mit 566 Dateien
  und Shared-UI-Prüfung mit 263 Dateien ohne Befund. Prüfprotokolle liegen lokal unter
  `C:/Users/Grisc/.codex/tmp/wardrobe-actions-*`.
- Gesamtvorabcheck bleibt unvollständig: Der verbindliche Marketplace-Image-/Hostnachweis
  ist ausschließlich auf dem wegwerfbaren GitHub-Linux-Runner möglich. Der umfassende
  CI-Plan einschließlich übriger Anwendungsbrowser- und PWA-Prüfungen bleibt vor dem Merge offen.
- Screenshots: lokale Prüfartefakte unter `wardrobe-review` im Visualisierungsordner dieser Sitzung.
  Browser-Plugin nicht verfügbar; vorhandene Playwright-Prüfungen gegen die ruhende lokale Vorschau.
- Kein Push, kein PR und keine Veröffentlichung vor der ausdrücklich verlangten Sichtkontrolle.
