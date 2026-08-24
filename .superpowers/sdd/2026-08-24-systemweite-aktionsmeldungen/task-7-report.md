# Task 7 – Buchhaltung, Rechnungsversand und Shop-Bestellung

## Umsetzung

- Kontoauszug-Import, Demo-Import, einzelne und gebündelte Buchungen, Ignorieren, Zurücksetzen sowie DATEV-, §-25a- und EÜR-Export melden den bestätigten Abschluss per Toast.
- Abgelehnte Service-Ergebnisse und lokale Ausnahmen erscheinen als persistente Fehler-Toasts mit Ursache. Typisierte `ZentralGemeldeterFehler` werden über `SyncStatusService` erkannt und nicht doppelt gemeldet.
- Das frühere Buchhaltungsbanner samt `bookingFeedback`, `emailSentStatus` und eigenen Timern wurde entfernt; die globalen Toast-Laufzeiten gelten unverändert.
- Der Berichtsversand meldet Erfolg nur bei `success: true`; `success: false` übernimmt die vorhandene Service-Meldung als Fehlerbeschreibung.
- Der Checkout zeigt den Erfolg vor der Navigation. Bei einer Ausnahme bleiben Formular und Route erhalten, der Ladezustand wird in `finally` zurückgesetzt und der Fehler persistent angezeigt.
- Der Toast-Container liegt bereits in `app.html` neben dem obersten `router-outlet` und deckt damit auch die eigenständigen `/shop`-Routen ab; hier war keine Änderung nötig.

## TDD und Prüfungen

- RED: Die neuen Accounting- und Checkout-Specs scheiterten gezielt an fehlenden Toasts, falscher Reihenfolge und fehlender Fehlerbehandlung. Ein separater RED-GREEN-Zyklus deckt lokale Buchungsausnahmen ab.
- Gezielte Tests: 2 Dateien, 18 Tests grün.
- Vollsuite: 81 Dateien, 572 Tests grün.
- Typecheck und Prettier: grün.
- ESLint: 0 Fehler; 48 bereits bestehende `any`-Warnungen außerhalb der Task-7-Änderungen.
- Angular-Produktionsbuild: grün; ausschließlich die bestehenden CommonJS-Hinweise für `jszip` und `jsbarcode`.

## Hinweise

Die drei ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden nicht verändert oder gestaged.
