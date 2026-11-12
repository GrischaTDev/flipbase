# Fehlgeschlagene Vinted-Relistings freigeben

Stand: 10.11.2026. Zugehöriger PR: #610.

## Fehlerbild

Ein Cloud-Relist endet beim Lesen oder Vorbereiten des Vinted-Formulars mit
`failed` (etwa `provider_unavailable` oder `category_unavailable`). Der
Kleiderschrank zeigt weiterhin einen Relistplan, sperrt aber die
Artikelaktionen. Ein bloßes Wegklicken des Eintrags unter „Laufende
Aktionen“ hat bislang nur die Benachrichtigung ausgeblendet.

## Sichere Wiederherstellung

Das Verwerfen eines fehlgeschlagenen Relists ist eine echte,
versionsgebundene Serveraktion über `marketplace_cancel_listing_job`,
keine rein lokale Filterung. Sie ist nur zulässig, wenn **alle**
Bedingungen erfüllt sind:

- Auftrag `failed`, Cloud-Ausführung und Aktion `publish`;
- eindeutige Relist-Quellkennung vorhanden, aber keine neue Anbieter-ID;
- keine bestätigte Löschung der Quelle im zugehörigen Arbeitsentwurf;
- Berechtigung auf aktuellen Workspace und passende Auftragsversion.

Danach bleibt der Auftrag samt Fehlercode in der Historie erhalten.
Der Kleiderschrank entfernt seine Plan-Sperre und erlaubt wieder das
Bearbeiten des ursprünglichen Inserats. Das Schließen der
Fehlerbenachrichtigung löst denselben sicheren Abbruch nach Bestätigung
aus. Die serverseitige Prüfung schützt insbesondere vor veralteten Tabs
und einem inzwischen geänderten Auftragszustand.

Bei `outcome_unknown`, laufenden Aufträgen oder bestätigter
Quellenlöschung bleibt der Weg gesperrt: Dort könnte das Wegklicken eine
noch benötigte Wiederherstellung unterbrechen oder zu doppelten
Anzeigen führen.

## Kontrolle

- Modelltest prüft sichere und gesperrte Zustände.
- Komponententest prüft Freigabe und Schutz nach bestätigter Löschung.
- pgTAP prüft tatsächliche Auftragsfreigabe vor dem Löschbeleg sowie
  die Abweisung nach dem Löschbeleg.
- CI muss Format, Lint, Typen, Angular- und Node-Tests, Datenbank,
  Browser-Smokes und Produktionsbau bestätigen.

Der Sammelfehler `provider_unavailable` ist nicht selbst die
ursächliche Diagnose. Der Worker speichert seit dem separaten
Formularfix einen `stage`-Wert; diesen für betroffene produktive
Aufträge prüfen, bevor eine neue Formularreparatur vorgenommen wird.
