# Vinted: Umsetzung der lokalen Wiederaufnahme

> Umsetzung mit den Planungs-/Umsetzungsskills, gezielten Regressionstests und abschließendem unabhängigem Review.

**Ziel:** Bestehende lokale Konten ohne erneuten Einrichtungsdurchlauf nutzen, gespeicherte Chats sofort anzeigen und einen ehrlichen aktuellen Betriebsstatus vermitteln.

**Architektur:** Die bestehende Profilbindung, Freigabe und Scheduler bleiben maßgeblich. Ein begrenzter Bereitschaftsaufruf stellt den eigenen Arbeitstab wieder her, prüft die Identität und führt selbst keine Versandaufträge aus. Angular verwendet denselben Status auf Kontenseite und im Kopfbereich; das Erweiterungsmodal verwendet den geprüften Status und Links zu vorhandenen Einstellungen.

**Technik:** Angular 22, Chrome Manifest V3, bestehende Supabase-Funktionen, keine neuen Abhängigkeiten.

**Entwurf:** [vinted-local-session-recovery-design.md](vinted-local-session-recovery-design.md).

## Grenzen und Schnittstellen

- Eigenes Worktree, keine fremden Änderungen, kein Versand/Produktionszugriff während der Umsetzung.
- Freigaben niemals beim Wiederanlauf verlängern. Pause, Widerruf, Ablauf, falsches Konto und Mensch-Prüfungen nicht umgehen.
- Neue Bereitschaftsanfrage `FLIPBASE_VINTED_LOCAL_READINESS`, gültige App-Herkunft, ohne Nutzlast. Antwort enthält nur Status, `workspaceId`, `connectionId`, `externalAccountId`, Prüfzeit und Version; niemals Sitzungsschlüssel.
- `FLIPBASE_VINTED_LOCAL_RECHECK` ist die ausdrückliche erneute Prüfung nach einer Nutzeraktion. Eine abgeschlossene CAPTCHA-/SMS-Prüfung darf nur nach gültiger Freigabe und bestätigter Identität fortgesetzt werden; automatische Prüfungen heben diese Pause nicht auf.
- Zustände: `ready`, `unbound`, `expired`, `revoked`, `paused`, `login_required`, `identity_mismatch`, `permission_required`, `challenge_required`, `blocked`, `unavailable`.
- Erweiterungsmodal zeigt bestehende Einstellungslinks; direkte serverseitige Schalter sind ein eigener authentifizierter Vertrag und gehören nicht zu diesem Reparaturpaket.
- Getrennte Dateiverantwortung: Laufzeit-Agent bearbeitet Background/Core/Scheduler/App-Bridge-JavaScript und Laufzeittests; Chat-Agent bearbeitet Postfach, lokalen Angular-Store und gegebenenfalls notwendige SQL-Persistenz; Modal-Agent bearbeitet Account-Content-Script/CSS und Modaltests; Integration bearbeitet Angular-Bridge, Konten, Navigation, Dokumentation und Versionspaket.

## Prüfungsschwerpunkte

Falsches Profil darf keine Live-Aktion ausführen. Fehlende Websiteberechtigung darf keine Tab-Schleife erzeugen. Ein beschäftigter Vorgang darf kein falsches Erfolgssignal liefern. Teilantworten dürfen bekannte Artikelangaben nicht löschen. Statusprüfungen dürfen keinen Versand auslösen.

## Aufgabe 1: Chat-Einstiege und Datenstand

- [x] Regressionen für Übersichtseinstieg, Warteschlange/beschäftigten Store, gesprächsbezogenen Footer und erhaltene Metadaten schreiben und scheitern sehen.
- [x] `vinted-messages.component.ts/.html`, `vinted-local-extension.store.ts` und zugehörige Angular-Tests korrigieren: gleicher bewusster Detailabruf, vorhandene Daten erhalten, Status erst nach tatsächlichem Resultat grün.
- [x] Notwendige Persistenzänderung in `supabase/schemas/350_marketplace_local_extension.sql` mit neuer erzeugter Migration und passenden Datenbanktests ergänzen; alte Migrationen unverändert lassen.
- [x] Gezielte Angular-/Datenbanktests ausführen und Resultate dokumentieren.

## Aufgabe 2: Bereitschaft und Wiederaufnahme

- [x] Laufzeitregressionen für Start, geschlossenen Tab, Reload, fehlende Berechtigung, Loginpause und fremde Identität schreiben und scheitern sehen.
- [x] `vinted-local-background.js`, `vinted-local-core.js`, `vinted-local-scheduler.js`, `flipbase-bridge.js` anhand obiger Schnittstelle korrigieren. Keine Versandarbeit in Bereitschaftsprüfung; ein eigener inaktiver Arbeitstab, begrenzte Wiederholung.
- [x] `scripts/local-extension-runtime.test.mjs` und Favoritenregressionen ausführen.

## Aufgabe 3: Kontenstatus und tägliche Wege

- [x] Angular-Bridge validiert Bereitschaftsantwort vollständig; Regressionen für veraltete und fremde Antworten schreiben.
- [x] Kontenraster und Workspace verwenden Profilstatus getrennt von gespeicherter Zuordnung. Passende Prüf-/Reparaturaktionen stehen am bestehenden Konto.
- [x] Einrichtung aus täglicher Navigation entfernen, Hinzufügen und bestehende Freigabeerneuerung weiterhin erreichbar halten.
- [x] Angular-Tests, Typen und Produktionsbau prüfen.

## Aufgabe 4: Blase und Modal

- [x] Weißer Kreis, gelbes Logo, Schatten, dezenter Hover; zentriertes Modal mit dunkler transparenter Hintergrundfläche und kompakten Aktionen in `vinted-local-account.js` und vorhandener CSS-Datei.
- [x] Prüfstatus, Kontozuordnung und echte Einstellungslinks verwenden; keine nicht implementierten Assistenten als aktivierbar ausgeben.
- [x] Fokusführung, Escape, reduzierte Bewegung, Mobilansicht und AXE prüfen; vorhandenen Tastaturfokus erhalten.

## Integration und Abschluss

- [x] Geänderte Dateien formatieren/linten, gezielte Laufzeit-/Angular-/Datenbankprüfungen, Produktionsbau und unabhängiges Review.
- [x] Erweiterungsversion und installierbares Paket konsistent aktualisieren; bestehendes Installationsverzeichnis beibehalten, Aktualisierung erst nach geprüfter Freigabe.
- [x] Tatsächliche Prüfungen und verbleibenden echten Kontotest dokumentieren. Erst dann PR-Abschluss gemäß AGENTS.md anbieten.

## Geprüfter Umsetzungsstand

- Erweiterung 1.6.0: 122 Laufzeit-/Favoriten-/Modalprüfungen grün.
- 238 gezielte Angularprüfungen und 40 Modell-/Parser-/Navigationsprüfungen grün; einschließlich bestehender Einrichtung und Favoritenseiten.
- Zwölf Chromiumabläufe für Konten und Postfach mit synthetischen Daten grün; Cache, Suche, Filter, Auftragsergebnisse und mobile/helle/dunkle Darstellung geprüft.
- Modal mit echten Erweiterungsdateien und synthetischen Antworten bei 1440, 390 und 320 Pixeln geprüft. Sechs AXE-Läufe einschließlich Farbkontrast ohne Befund; Tastatur, Fokus-Rückgabe, Escape und reduzierte Bewegung geprüft.
- Migration `20261006091649_vinted_preserve_conversation_metadata.sql` aus isoliertem Schemaabgleich erzeugt und auf Ausgangsschema angewandt. 132 pgTAP-Prüfungen grün; anschließender Schemaabgleich ohne Differenz. Generierte Ausgangs-/Zieltypen byteidentisch.
- ESLint, Anwendung-/Testtypen, Formatierung, Shared-UI- und Testsuite-Zuordnung sowie Produktionsbau grün. Bestehende CommonJS-Warnung der PDF-Bibliothek bleibt unverändert.
- Unabhängiges Review abgeschlossen: keine verbleibenden wichtigen Befunde. Explizite Wiederprüfung, falsches Profil, alte Antworten, widerrufene Bindung und abgewählte wartende Gespräche geprüft.

Die automatische Prüfung hebt keine manuelle Pause oder Vinted-Prüfung auf.
Ein uneindeutiger Serverfehler bleibt „nicht bestätigt“; Widerruf ist daraus
nicht ableitbar. Nach erfolgreicher Bereitschaft arbeitet der vorhandene
Zeitplan weiter (Nachrichten etwa alle fünf Minuten, Aufträge etwa alle
90 Sekunden); eine Bereitschaftsanfrage führt selbst keinen Versand aus.

Das installierbare Paket liegt außerhalb des Worktrees. Die bestehende
Nutzerinstallation wird erst nach veröffentlichter App/Migration im bisherigen
Ordner aktualisiert. Noch offen sind der echte Chrome-Neustart/Erweiterungsreload
mit Nutzerkonto und der kontrollierte Produktionsnachtest. Es wurden keine
echten Nachrichten gesendet, Automatikschalter verändert oder Produktionsdaten
geschrieben. PR/Veröffentlichung erfordern die Abschlussfreigabe gemäß AGENTS.md.
