# Umsetzungsplan: lokaler Vinted-Pilot

**Ziel:** Ein bestehendes Vinted-Konto über eine eigene Browsererweiterung bestätigen und Profil sowie Anzeigen lesend nach Flipbase übernehmen.

**Architektur:** Ein Browserprofil entspricht einer Installation und genau einem Konto. Flipbase bewilligt einen auf Konto, Arbeitsbereich und 24 Stunden begrenzten Zugang; das Geheimnis bleibt im Erweiterungsspeicher. Ein reservierter Vinted-Tab liest die angemeldete Sitzung. Der Server prüft jeden Import erneut und speichert nur definierte Profil- und Anzeigenfelder.

**Technik:** Angular 22, bestehende Shared-UI, Chrome Manifest V3, native Browser-APIs und Supabase/Postgres. Keine neue Laufzeitabhängigkeit.

**Entwurf:** [Lokaler und Cloudbetrieb](vinted-local-and-cloud-design.md). Dieser Plan setzt den ersten lesenden Piloten um; weitere Funktionspakete folgen separat.

## Verbindliche Grenzen

- Nur `profile.read` und `listings.read`; kein Versand, Angebot, Relisting oder Veröffentlichen.
- Keine automatische Synchronisierung in diesem ersten Pilot.
- Anmeldung, SMS und Mensch-Prüfungen bleiben manuelle Nutzerschritte.
- Ein abgelaufener oder widerrufener lokaler Zugang startet niemals ersatzweise Cloudarbeit.
- Keine Produktionsänderung, kein Store-Upload und kein Proxykauf während der lokalen Umsetzung.
- Bestehende Kleinanzeigen-Erweiterungsfunktionen bleiben erhalten.

## Schnittstellen

Die Seite sendet `{type, requestId, payload?}` nur an ihren eigenen Ursprung. Die Antwort lautet `{type: 'FLIPBASE_VINTED_LOCAL_RESULT', requestId, success, result?, error?}`. Die Seite akzeptiert ausschließlich Antworten des eigenen Fensters und prüft den jeweiligen Inhalt.

| Anfrage                            | Nutzlast                                                                               | Ergebnis                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `FLIPBASE_VINTED_LOCAL_PREPARE`    | keine                                                                                  | `tokenHash`, `identity: {id, username}`              |
| `FLIPBASE_VINTED_LOCAL_BIND`       | `workspaceId`, `connectionId`, `externalAccountId`, `apiUrl`, `expiresAt`, `tokenHash` | öffentliche Bindungsbestätigung                      |
| `FLIPBASE_VINTED_LOCAL_SYNC`       | `workspaceId`, `connectionId`                                                          | `ok`, `counts: {profile, publication}`, `observedAt` |
| `FLIPBASE_VINTED_LOCAL_DISCONNECT` | `workspaceId`, `connectionId`                                                          | Bestätigung ohne Geheimnis                           |

Der Zugang wird über `marketplace_approve_local_extension(p_workspace_id, p_connection_id, p_token_hash, p_expected_external_account_id)` bewilligt. Lesen und Widerrufen verwenden `marketplace_read_local_extension` beziehungsweise `marketplace_revoke_local_extension` mit derselben Kontoadresse. Die Edge Function `marketplace-local-extension` nimmt ausschließlich `heartbeat` oder `import` mit ihrem eigenen Zugang entgegen.

## Prüfungsschwerpunkte

1. Abweichendes Vinted-Konto oder Kontowechsel während des Lesens: kein Import.
2. Arbeitsbereichswechsel, Abmeldung oder verlorene Verwaltungserlaubnis: keine nachträgliche Freigabe aus einer alten Ansicht.
3. Gleichzeitig laufende Cloudarbeit oder zweite Installation: keine unbemerkte Übernahme.
4. Ablauf, Widerruf, Neustart und verlorener Tab: klarer Zustand ohne wiederholte Schreibaktionen.
5. Unvollständige Seitenfolge oder fremde Anzeigen: keine Löschung gespeicherter Daten und keine Vollständigkeitsbehauptung.

## Aufgabe 1: begrenzter Zugang und Import

Verantwortung: Backend-Agent. Dateien: `supabase/schemas/350_marketplace_local_extension.sql`, gemeinsame Verträge, `supabase/functions/marketplace-local-extension/`, `supabase/tests/marketplace-local-extension.test.sql`; gezielte Guards in den bestehenden Marketplace-Schemadateien.

- [x] Ablehnungsfälle für fremden Arbeitsbereich, Identitätswechsel, Ablauf, Widerruf und parallele Cloudarbeit als Tests formulieren und fehlende Umsetzung feststellen.
- [x] Bewilligung, Widerruf und atomaren lesenden Import implementieren; Zugang nur als SHA-256-Hash speichern.
- [x] `execution_mode` als ausdrücklich gespeicherte Kontomethode ergänzen; lokale Konten in Cloudzugang, Cloudaufträgen und Zeitplänen ablehnen.
- [x] Handler- und Datenbanktests ausführen; keine private Vinted-Rohantwort speichern.

## Aufgabe 2: Browserprofil und reservierter Tab

Verantwortung: Erweiterungs-Agent. Dateien: `tools/flipbase-extension/`, Tests `scripts/local-extension-runtime.test.mjs`.

- [x] Tests für Nachrichtengrenze, Geheimnisschutz, Ablauf und Identitätswechsel zuerst fehlschlagen lassen.
- [x] Vorbereitung, Bindung, Heartbeat, lesenden Abgleich und Trennung implementieren; produktiver API-Ursprung ausschließlich `https://api.flipbase.de`.
- [x] Höchstens 25 Anzeigen-Seiten mit jeweils 20 Einträgen lesen, Identität vorher und nachher prüfen; Fehler nicht als leere vollständige Liste melden.
- [x] Reservierten Tab mit Erklärung und Nutzertab-Button versehen; nur bei laufendem Abgleich Eingaben sperren und bei manuellen Prüfungen freigeben.
- [x] Neustart und parallele Anfragen prüfen; vorhandene Kleinanzeigen-Tests erneut ausführen.

## Aufgabe 3: bestätigter lokaler Verbindungsablauf

Verantwortung: UI-Agent. Dateien: neue Vinted-Local-Connect-Komponente und Services unter `src/app/features/marketplaces/`; gezielte Konto-/Workspace-Verknüpfungen und Route.

- [x] Antworten fremder Fenster, falsche Anfragekennungen und veraltete Kontoansicht als Tests ablehnen.
- [x] Konto aus Browserprofil erkennen, dem Nutzer anzeigen und erst nach seiner Bestätigung bewilligen und binden.
- [x] Manuellen Profil-/Anzeigenabgleich samt Ergebnis zeigen; Freigabe auch ohne erreichbare Erweiterung serverseitig widerrufbar machen.
- [x] Lokale Konten nicht mit vorhandenen Cloudbuttons bearbeiten; Erweiterung ehrlich als unveröffentlichten Pilot kennzeichnen.
- [x] Gezielt Angular-Tests und Build ausführen, gemeinsame Komponenten verwenden.

## Aufgabe 4: Integration und Prüfung

Verantwortung: Hauptagent.

- [x] Migration aus dem deklarativen Schema mit der Supabase-CLI erzeugen, Inhalt vollständig auf unerwartete oder destruktive Änderungen prüfen; generierte Typen aktualisieren.
- [x] Neue Laufzeittests in die vorhandene verbindliche Prüfung aufnehmen.
- [x] `node --test scripts/local-extension-runtime.test.mjs` und betroffene bestehende Erweiterungsfälle ausführen.
- [x] Neue Handler-/Datenbanktests sowie betroffene Marketplace-Tests ausführen.
- [x] Geänderte Dateien formatieren/linten, Anwendungs-/Spec-Typen und Angular-Build prüfen.
- [x] Gesamten Unterschied gegen aktuellen Master auf Vertrag, Rechte und Rückwärtsverträglichkeit prüfen; Prüfgrenzen in `docs/AI-CHANGELOG.md` festhalten.
- [x] PR-/Merge-Freigabe nach lokal geprüftem Stand einholen.

## Selbstabgleich und Entscheidungen

Der Pilot ist lokal umgesetzt und geprüft. Bestanden sind 156 Angularfälle,
281 Datenbankprüfungen, acht Deno-Handlerfälle, 22 Workerfälle, 21 neue
Erweiterungsfälle und 19 bestehende Erweiterungsfälle. Die Workflowprüfung
besteht mit 108 erfolgreichen und fünf unter Windows übersprungenen Fällen.
Produktionsbau, Typprüfung, Formatierung, ESLint und Shared-UI-Prüfung bestehen.
Ein echter Chromium-Test bestätigt den MV3-Weg mit lokalen Testdaten; der
Abgleich einer angemeldeten echten Vinted-Sitzung steht aus.

Vor dem Nutzertest müssen die Migration und die geprüfte App ausgerollt werden.
Die neue Edge Function `marketplace-local-extension` und ihr gemeinsames
`_shared`-Verzeichnis müssen gemäß dem bestehenden Serververfahren übertragen
werden; die App-Pipeline veröffentlicht Edge Functions nicht. Die Route verwendet
ein eigenes Installationsgeheimnis und darf daher nicht durch eine vorgeschaltete
Supabase-Nutzer-JWT-Prüfung abgewiesen werden. Der Handler prüft jede Anfrage selbst.
Diese Voraussetzungen und die tatsächliche Route werden vor dem Kontopiloten geprüft.
Der Chrome-Web-Store-Upload bleibt ein eigenes Folgepaket; bis dahin erfolgt nur
eine ausdrücklich als Pilot gekennzeichnete lokale Installation.

Die drei Teilaufgaben teilen ausschließlich die oben beschriebenen Verträge. Neue Migration und generierte Datenbanktypen werden zentral erstellt, damit parallele Bearbeitung sie nicht überschreibt. Die Datenbank bleibt alleinige Autorität für Zugang und Kontomethode; lokale Bereinigung nach Widerruf ist nachgeordnet. Ein bewilligter Zugang ist noch kein nachgewiesener Import. Der vollständige Cloudbetrieb, Chrome-Web-Store-Veröffentlichung und Automatisierungsfunktionen sind eigene Folgepakete.
