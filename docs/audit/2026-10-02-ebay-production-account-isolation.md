# Persönliche eBay-Verbindung auf Produktion geprüft

Prüfung am 02.10.2026 um 06:38 UTC gegen `https://api.flipbase.de`,
Produktionsstand `82bb0e43cca8a791381275370265348ba36b207a` (v0.281.1).
Auftrag des Nutzers: „okay los“, nach Erklärung des zusätzlichen Zwei-Nutzer-Tests.

Das bestehende Besitzerkonto zeigt im echten Browser eine verbundene
eBay-Verbindung und 15 eigene Inserate einschließlich Artikelzuordnung.
Ein zusätzliches eBay-Konto ist dafür nicht nötig. Für den Gegentest wurde ein
temporärer gewöhnlicher Flipbase-Nutzer über die serverseitige Auth-Verwaltung
angelegt und über die öffentliche Passwortanmeldung angemeldet. Auth bestätigte
die Identität; das Nutzer-Token hatte die Rolle `authenticated`, und
`is_platform_operator` lieferte `false`. Alle Gegentests liefen mit diesem
Nutzer-Token und dem gewöhnlichen API-Schlüssel, nicht mit dem Dienstschlüssel.

| Fall                                     | Erwartung und tatsächlich beobachtetes Ergebnis                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eigener leerer Test-Workspace            | `ebay_can_connect` liefert `true`; die Sitzung ist wirklich gültig.                                                                                                                                         |
| Fremder Workspace ohne Mitgliedschaft    | `ebay_can_connect` liefert `false`. Status, Inserate, Bestellungen, Bestellstatus, Bestellprüfung, Buchung, manuelle Markierung und deren Rücknahme liefern jeweils HTTP 403 mit `forbidden`.               |
| Derselbe Workspace als normales Mitglied | `ebay_can_connect` liefert `true`. Status liefert HTTP 200 mit `connection: null` und bestätigt verfügbarer Übernahmefunktion. Die persönliche Verbindung des Besitzers wird nicht angezeigt.               |
| Fremde Verbindung mit bekannter Kennung  | Inserate und Bestellungen liefern HTTP 409 mit `connection_busy_or_unavailable`. Alle fünf Bestellaktionen liefern HTTP 409 mit `connection_changed`; keine Anbieter- oder Buchungsdaten werden ausgegeben. |
| Direkte Tabellenabfragen                 | Verbindungen und Zuordnungen liefern leere Listen. Zugangswerte, Prüfstände und Buchungsbelege liefern HTTP 403 mit SQL-Code `42501`.                                                                       |
| Direkte Datenbankfunktionen              | Fremde Verbindung trennen, Artikel zuordnen und Verkauf übernehmen liefern HTTP 403 mit SQL-Code `42501`. Die Eigentumsprüfung scheitert vor Verarbeitung der übrigen Eingaben.                             |
| Mitgliedschaft wieder entfernt           | `ebay_can_connect` liefert sofort `false`; Status, Bestellabruf und Buchung liefern mit derselben Sitzung wieder HTTP 403 mit `forbidden`.                                                                  |
| Produktionsdaten unverändert             | Prüfsummen der vollständigen Verbindung und ihrer verschlüsselten Zugangswerte unverändert. Anzahl der Zuordnungen, Bestellbelege und Verkäufe im geprüften Workspace unverändert.                          |

Die Buchungsversuche verwendeten absichtlich nicht existierende Prüfstand- und
Artikelkennungen. Ein produktiver Verkauf wurde nie ausgelöst. Die beobachtete
Ablehnung erfolgte bereits an der Zugriffsprüfung; die Prüfung ist daher nicht
von zufällig fehlenden Artikel- oder Prüfstanddaten abhängig.

Anschließend wurde ausschließlich das mit einer zufälligen Testkennung angelegte
Konto nach erneutem Abgleich von Identität, E-Mail und Testkennung aufgeräumt:
Sitzungen widerrufen, temporäre Mitgliedschaften entfernt, automatisch angelegten
leeren Test-Workspace gelöscht und Testkonto entfernt. Die Datenbank bestätigte
jeweils null verbliebene Nutzer, Mitgliedschaften, Sitzungen und Test-Workspaces.
Keine Einladung, E-Mail, Änderung bestehender Anmeldedaten oder zweiter eBay-OAuth
wurde ausgelöst. Die vorhandene Nutzeranmeldung im Browser blieb erhalten.

Grenze: Der Besitzer wurde über die tatsächliche Oberfläche geprüft; der
gewöhnliche zweite Nutzer über die echte Produktions-API. Es wurde keine zweite
Browseranmeldung und keine erfolgreiche produktive Bestellung getestet. Die
erfolgreiche Buchung und Doppelbuchungsvermeidung sind durch die bereits grünen
isolierten Browser-, Datenbank- und Paralleltests aus PR #279 abgedeckt.

Der vollständige bereinigte Ergebnisnachweis und das Prüfprogramm liegen extern
unter `C:/Users/Grisc/.codex/reports/ebay-2026-10-01/` in
`production-account-isolation-result.json` und `production-account-isolation.py`.
Sie enthalten keine Zugangsschlüssel, Passwörter oder Nutzersitzungen.

Die serverseitige Einrichtung und das Aufräumen verwenden die dokumentierten
[Auth-Verwaltungsaufrufe](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
und [Kontolöschung](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
Es wurden keine Tabellen, Rechte, Funktionen, Konfiguration oder Migrationen geändert.
