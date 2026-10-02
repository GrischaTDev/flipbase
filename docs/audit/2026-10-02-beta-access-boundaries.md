# Prüfung der Beta-Zugangsgrenzen

Stand: 2. Oktober 2026. Zweig `juna/beta-access-lifecycle`.

## Registrierung und Rücknahme

Neue Einladungen verwenden einen zufälligen eigenen Link. Gespeichert wird nur
sein SHA-256-Streuwert. Die Frist beträgt sieben mal 24 Stunden; Prüfen, Öffnen
oder eine E-Mail-Vorschau verbraucht den Link nicht. Der endgültige Abschluss
prüft Frist, Widerruf, exklusive Vorgangskennung, bestätigte E-Mail und tatsächliches
Passwort erneut. Erst dann beginnt die gewährte Beta-Laufzeit.

Vorgänge sperren dieselbe Bewerbung. Wiederholungen erhalten ein gespeichertes
Ergebnis; eine zehnminütige Bearbeitungsfrist und erneuerte Kennung schützen vor
verspäteten Antworten. Laufzeitänderung und Rücknahme behalten ihre Anfragekennung
auch nach Netzfehler und Neuladen. Ein verlorener Registrierungsabschluss erzeugt
keine zweite Anmeldung über einen verbrauchten Link; das bereits gesetzte Passwort
bleibt zur normalen Anmeldung verwendbar.

Rücknahme widerruft zunächst Links und Beta-Zugang. Auth-Löschung und abschließende
Bereinigung bleiben wiederholbar. Die ursprünglichen Konto-/Workspace-Kennungen
überleben die externe Auth-Löschung. Vorbereitete Konten mit Betreiberrolle,
weiteren Mitgliedschaften, weiteren Workspace-Mitgliedern, abgeschlossener
Einrichtung oder Geschäftsdaten werden nicht als offene Registrierung gelöscht.
Ein Auth-Trigger wiederholt diese Prüfung unmittelbar vor der Löschung. Es gibt
keine vorgelagerte dauerhafte Auth-Sperre, die bei einer abgelehnten Löschung ein
inzwischen genutztes Konto aussperren könnte. Registrierte Konten werden erhalten.

Bestandseinladungen bleiben als `legacy` erkennbar. Ihre ursprüngliche Frist wird
mit dem bisherigen Versanddatum und 24 Stunden nachvollzogen; ein erneuter Versand
stellt einen eigenen Wochenlink aus. Bestehende abgeschlossene Registrierungen
werden weder zurückgesetzt noch erneut eingeladen.

## Geschäftszugriff

| Grenze                    | Durchsetzung                                                                                                                                                                                                          | Nachweis                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mitgliedschaft und Lizenz | `can_access_workspace` / `can_administer_workspace` prüfen zusätzlich Status, Ende und Widerruf. Mitgliedschaftsfunktionen behalten ihre bisherige Bedeutung.                                                         | Direkte Datenbanktests mit bestehender Nutzerkennung nach Beta-Ende.        |
| Geschäftstabellen         | Bestehende Policies werden ersetzt, auch bei Elternbeziehungen für Zeilen, Bilder und Belege. Schreibtrigger schützen zusätzlich Dienstimporte.                                                                       | Bestehende RLS-Suiten und neuer direkter Dienst-Schreibversuch.             |
| Datenbankfunktionen       | Späte Enddefinitionen für Geschäfts-RPCs einschließlich Export, Kostenkorrektur, Katalogarchivierung und EAN-Verwaltung prüfen den Zugang.                                                                            | Inventur ausführbarer Definer-Funktionen; negativer Exportaufruf.           |
| Private Dateien           | 18 vorhandene Storage-Regeln und die Unternehmenslogo-Verwaltung prüfen den Geschäftszugang.                                                                                                                          | Unabhängiger Policy-Abgleich sowie bestehende Datei-/Unternehmensprüfungen. |
| Live-Daten                | Geschäftsregeln erhalten die Zugangsgrenze. `workspace:<id>:access` bleibt privat für Mitglieder erreichbar, damit sie das Ende erkennen.                                                                             | Realtime-Policy-Inventur und Browser mit parallel geöffneter Sitzung.       |
| Vinted und eBay           | Synchronisationsberechtigung, Importanwendung und eBay-Verbindungssperre prüfen den aktuellen Workspace-Zugang unabhängig von einem Browser-JWT. Ressourcenbereinigung bleibt möglich.                                | Bestehende Import-/Worker-Suiten und Funktionsinventur.                     |
| Weitere Edge-Funktionen   | Bildbereinigung prüft den betreffenden Workspace; KI-/Markensuche verlangt mindestens einen aktiven Zugang. Discord prüft bereits den aktiven Beta-Zeitraum.                                                          | Edge-Suite und Quellprüfung der Aufrufgrenzen.                              |
| Kontoverwaltung           | Eigenes Profil, Mitgliedschaften, Lizenz und schmale Zugangsauskunft bleiben lesbar. Laufzeitänderungen verlangen die Betreiberrolle.                                                                                 | Direkte Rollen-/Rechteprüfungen und tatsächliche Anmeldung nach Beta-Ende.  |
| Weitere Arbeitsbereiche   | Bestehende unabhängig nutzbare Arbeitsbereiche bleiben zugänglich. Ein Beta-Konto kann keinen zusätzlichen unlizenzierten Workspace als Umgehung anlegen. Einrichtung und Auswahl berücksichtigen nur aktive Zugänge. | Datenbanktest und gezielte Guard-/Einrichtungstests.                        |

Bestehende Arbeitsbereiche ohne Lizenzdatensatz behalten ihre bisherige
Zugangsklasse. Das ist keine Registrierungsalternative: freie Anmeldung ist
abgeschaltet, die Beta-Vorbereitung legt ihre Lizenz atomar an und die
Workspace-Erstellung ist für reine Beta-Konten gesperrt. Ein fehlender oder
abgelaufener Beta-Zugang wird dadurch nicht automatisch verlängert.

Bereits heruntergeladene Daten und zuvor ausgestellte zeitlich begrenzte Datei-URLs
lassen sich nachträglich nicht zurückholen. Neue Geschäftsabfragen, Downloads und
Schreibvorgänge müssen die aktuelle Servergrenze passieren.

## Migration und Prüfungen

Die Migration wurde aus dem CLI-Abgleich der bisherigen Migrationen zur isolierten
Datenbank erzeugt. Die vom Abgleich nicht vollständig erfassten deklarativen
Rechte sowie Storage-/Realtime-Regeln, Auth-Trigger und Bestandsübernahme wurden
automatisch aus den Schemadateien übernommen. Vorhandene Migrationen sind unverändert.
Keine eigenen Transaktionen, psql-Befehle oder externen Seiteneffekte im SQL-Paket.

Der unabhängige Abgleich bestätigt 83 identische geänderte Funktionskörper,
24 explizite Rechteanweisungen, 18 Storage-Regeln, die Realtime-Zugangsregel und
den Auth-Löschtrigger. Eine unverändert übernommene Vinted-Importfunktion benötigt
keinen zusätzlichen Migrationsabschnitt.

Nach vollständigem Neuaufbau bestehen alle 78 Datenbank-Testdateien mit 2.687
Prüfungen. Interne Vorgangstabellen sind für `anon` und `authenticated` unzugänglich;
die Auth-lesenden internen Funktionen sind ausschließlich für Dienstrechte
freigegeben und verwenden bewusst erhöhte Datenbankrechte.

Vier Browserfälle prüfen tatsächliche lokale Auth-/Edge-/Datenbank-/SMTP-Abläufe:
Registrierung und 60-Tage-Start, Beenden/Verlängern bei geöffneter Sitzung mit
weiterhin möglicher Anmeldung, frühzeitige Rücknahme sowie abgelaufene Einladung
mit Wiederversand, Wochenfrist, Widerruf und neuer Bewerbung derselben E-Mail.
Die Dankesseite besteht die automatisierten WCAG-AA-Prüfungen. Teilfehler,
Vorgangswiederholungen und weitere Arbeitsbereiche werden zusätzlich gezielt in
Datenbank-, Edge- und Angular-Tests geprüft.

Produktive Konten wurden nicht verändert; Test-E-Mails bleiben im lokalen
SMTP-Testposteingang. Veröffentlichung und produktive Migration folgen erst nach
der vorgesehenen PR-/Merge-Freigabe.
