# Vintz-Einstellungen und Teamrechte im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Ausschließlich Einstellungen und Teamrechte nach
gesonderter Freigabe untersuchen. Danach stoppen. Keine Einstellungen ändern,
Teams anlegen, Personen einladen, Rechte vergeben oder Produktänderungen umsetzen.

## Ergebnis

Vintz bündelt die Vorgaben für wiederkehrende Angebotsarbeit: kontobezogene
Schreibstile, eigene Größenregeln, Textvorlagen und Uploadverhalten. Beim Team
trennt das Produkt einen persönlichen Bereich von gemeinsamen Workspaces mit
ausgewählten Verkaufskonten; der ausgelieferte Code sieht zusätzlich freigegebene
Seiten und vier Rollen vor. Diese Aufteilung ist für Flipbase interessant.

Flipbase hat mehr kaufmännische Einstellungen und sechs fachlich benannte Rollen.
**Die Teamfunktion ist jedoch noch nicht durchgängig fertig:** Einladungen werden
im geprüften Service nur im Browser vorgemerkt, obwohl die Oberfläche Versand
meldet. Mehrere untersuchte Datenbank-Schreibpfade prüfen Mitgliedschaft und
Workspacezugang, aber keine fachliche Rolle. Deshalb sind Rollenbeschriftungen
wie „Nur-Lesen“ derzeit keine durchgehend belegte Zugriffsgarantie.

## Prüfrahmen und Grenzen

- [Vintz-Einstellungen](https://vintz.ai/settings), Prozugang, persönlicher
  Workspace, ein verbundenes Verkaufskonto; noch kein Team und keine Einladung.
- Alle neun Einstellungsbereiche gelesen. Team-Erstellungsdialog und bestehender
  Standard-Schreibstil geöffnet und abgebrochen; keine Eingaben verändert.
- Nur tatsächlich geladene Erstanbieter-Skripte gelesen. Rollen, Seitenmodule,
  Speicher- und Fehlerpfade sind technische Frontendbefunde, keine bestätigten
  Serverberechtigungen. Kein zweites Benutzerkonto und kein Test mit Fremdrechten.
- Flipbase: [Teamseite](https://app.flipbase.de/settings/team), unverändert
  geöffneter und abgebrochener Einladungsdialog sowie Kontoseite live gelesen.
  Angezeigte Version `v0.357.1`; lokale Quellen bei HEAD
  `e3ef736370640125c1abddcaf82de6079205d9fa`, einschließlich unabhängiger
  Quellengegenprüfung. Der ausgelieferte Gitstand wurde nicht separat verifiziert.
- Keine Passwort-/Sitzungsaktion, Mail, Generierung, Zahlung, Kontolöschung,
  Exportdatei oder Einstellungsänderung ausgelöst. Kein umfassender Mobil-,
  AXE-, Last- oder Sicherheitsprüflauf. Andere laufende Codearbeiten unberührt.

## Vintz: Einstellungen im Detail

| Bereich       | Beobachtung und technische Grenze                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konto         | Name und E-Mail als Anzeige, Abmelden sowie Empfehlungslink und Zähler. Keine eigene Passwort-, 2FA- oder Geräteverwaltung in diesem gelesenen Bereich gefunden; keine Aussage über andere Anmeldewege. |
| Team          | Persönlicher Workspace, leere Team-/Einladungsliste und Einstieg „Neuer Team-Workspace“. Erläutert ausgewählte Konten und freigegebene Seiten.                                                          |
| Angebote      | Standardzustand, manuelle/automatische SKU, automatischer Vinted-Upload, voller/teilautomatischer Ablauf, andere Kopien nach Verkauf ausblenden und Frist für Angebote ohne Aufrufe.                    |
| Größentabelle | Hosen/Jeans und Oberteile, eigene Messfelder und Größenbereiche, Texttest sowie notwendige Bestätigung für flach gemessene Breiten. Hier keine eigenen Größenregeln vorhanden.                          |
| Texte & KI    | Stilzuweisung je Verkaufskonto, Stilbibliothek, Sprache für erzeugte Texte, Hashtagsets und Starttitel/-beschreibung ohne KI. Bestehenden Standardstil unverändert im Dialog gelesen.                   |
| Zahlungen     | Eigenes Vintz-Abo, Credits, Verbrauch und Rechnungs-/Verwaltungseinstiege. Keine Konfiguration der Zahlungsarten für Artikelverkäufe. Tarif- und Kontingentvergleich bleibt V-18.                       |
| Präferenzen   | Hell-/Dunkelmodus; bestehender Dunkelmodus unverändert. Keine weiteren Präferenzen in diesem Panel sichtbar.                                                                                            |
| Datenschutz   | Einstieg für Kontodaten als JSON, Produkt-E-Mails und Kontolöschung samt Hinweisen auf entfernte Daten. Export und Löschung nicht ausgelöst; endgültiger geladener E-Mail-Schalterwert nicht belegt.    |
| Rewards       | Acht Umsatzmeilensteine von 500 bis 100.000 €, Fortschritt hier null und Belohnungsvorschauen. Kein Einlösen oder Adressformular; eigener Vergleich weiterhin optional V-20.                            |

### Angebotsvorgaben und Speichern

Im bestehenden Konto waren „Sehr gut“, manuelle SKU, automatischer Upload,
vollständige Automatisierung, Kopien ausblenden und drei Tage ohne Aufrufe
eingestellt. **Das sind vorhandene Werte, keine von Juna gewählte Empfehlung.**
Ob die Vorgabe jeden Cloud-/Erweiterungspfad gleich steuert, folgt daraus nicht.

Die Angebots-, Größen- und Textpanels weisen auf automatisches Speichern hin.
Der gemeinsame geladene Speicherbaustein fasst Änderungen mit **700 ms**
Verzögerung zusammen und sendet `PUT /api/seller/settings` beziehungsweise
`PUT /api/seller/upload-standards`. Er unterscheidet ausstehend, speichernd,
gespeichert und Fehler; fehlgeschlagene Speicherungen lassen sich wiederholen.
Laufende Änderungen werden vor parallelem Nachladen geschützt. Beim Verlassen
versucht der Code ausstehende Änderungen zu senden; erfolgreiche Zustellung ist
damit nicht bewiesen. Ein fehlgeschlagener Save setzt den lokalen Wert im
gelesenen Baustein nicht automatisch zurück.

Das ist **keine durchgehende Speicherregel für alle Dialoge**: Der geöffnete
Schreibstil-Editor hat einen ausdrücklichen Speichern-/Abbrechen-Weg.
Die gemeinsamen Einstellungsanfragen enthalten in diesem Baustein keine eigene
Verkaufskonto-ID. Die tatsächliche serverseitige Zuordnung zu Nutzer/Workspace
wurde nicht bestätigt; nur die Stilzuweisung wird sichtbar je Konto angeboten.

Weitere Grenzen aus dem geladenen Frontend:

- Automatische SKU: Präfix bis 16 Zeichen, SKU bis 40 Zeichen, Startwert von
  1 bis 99.999.999; Darstellung der Zahl mit mindestens vier Stellen.
- Frist ohne Aufrufe: 1 bis 365 Tage. Nicht mit einer tatsächlich gestarteten
  Neueinstellungsregel gleichsetzen.
- Größen: ein bis zehn Messfelder je Kategorie und bis 100 Größenregeln.
  Werte müssen positiv, höchstens 500 und als gültiges Min-/Max-Paar angegeben
  sein; die angelegten Bereiche einer Regel müssen zum Treffer passen.
- Standardfelder Hosen/Jeans: Hosenlänge, Innenbeinlänge, Bundweite und
  Beinöffnung. Oberteile im Code: Länge, Brustweite und Ärmellänge.
  Breiten sind flach gemessene Kleidung, kein Körperumfang.
- Ungültige, gerade unvollständige Größenregeln werden nicht als fertige Regeln
  gespeichert; der Baustein behält gegebenenfalls den letzten gültigen Stand.
- Ohne eigene Regeln ergab der bestehende Messwerttest keinen Treffer.
  Die Breitenbestätigung war nicht gesetzt; keine Änderung vorgenommen.

### Schreibstile und Vorlagen

Der Standardstil zeigte freundlich, mittlere Länge und Emojis. Der abgebrochene
Editor bietet fünf Tonlagen, drei Längen und einen Emoji-Schalter. Zusätzlich
gibt es wörtlich anzuhängenden Abschlusstext, drei Titelformate, Beispielaufbau
und eigene Anweisungen für Titel und Beschreibung. „Beispiel schreiben“ wurde
nicht betätigt; Antwortqualität, Wartezeit und Creditverbrauch bleiben offen.

Geladene Validierung: Standardstil plus bis elf weitere Stile, Stilnamen bis
40 Zeichen; bis zwölf Hashtagsets mit jeweils bis 30 Tags, Taglänge bis
40 Zeichen und Entfernung gleicher Tags ohne Beachtung der Großschreibung.
Startvorlage ohne KI: Titel bis 100 und Beschreibung bis 2.000 Zeichen.
Diese Grenzen sind Clientregeln; Servervalidierung nicht separat geprüft.

Flipbase besitzt bereits zentrale Angebotsentwürfe und wiederverwendbare
Angebotsvorlagen mit gezielt ausgewählten Feldern, Platzhaltern und Vorschau.
Eine Vorlage ist daher keine fehlende Grundfunktion. Der zusätzliche Nutzen von
Vintz liegt in wiederkehrenden, einem Konto zugewiesenen Schreibregeln und der
konfigurierbaren Größenableitung; siehe auch den
[Vergleich der Angebotserstellung](vintz-listing-creation-comparison.md).

## Vintz: Team, Konten und Seiten

Der Erstellungsdialog verlangt einen Workspace-Namen und zeigt auswählbare
Verkaufskonten. Das vorhandene Konto war **bereits vorausgewählt**. Der Text
erklärt, dass nur ausgewählte Konten im Team verfügbar werden und andere privat
bleiben. Mit leerem Namen war Erstellen gesperrt. Abgebrochen, kein Team erstellt.
Für Flipbase wäre eine bewusste Auswahl mit klarer Zusammenfassung vor Freigabe
sinnvoll; automatische Vorauswahl sollte nicht ungeprüft übernommen werden.

| Rolle im ausgelieferten Code | Beschriebener Umfang, noch nicht als Team ausgeführt                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Owner                        | Besitzer; Adminvergabe im Rollenwähler nur bei entsprechender Owner-Befugnis. Keine Übertragung praktisch geprüft.         |
| Admin                        | Alle vorgesehenen Seiten und Personen verwalten. Seitenwahl wird für Admins im gelesenen Wähler als vollständig behandelt. |
| Employee / member            | Ausgewählte Seiten nutzen. Standardauswahl im Modulcode: Übersicht, Angebote, Postfach.                                    |
| Readonly / viewer            | Ausgewählte Seiten lesen, laut Rollenbeschreibung nichts ändern. Tatsächliche Schreibsperre nicht getestet.                |

Die Seitenliste im geladenen Teammodul enthält Übersicht, Angebote, Postfach,
Automationen, Auswertung, Finanzen und KI-Chat sowie einen ausgeschlossenen
Konkurrenzbereich. Letzteren nicht weiter untersucht. **Archiv, Galerie und
Bildstudio waren in dieser Liste nicht enthalten**; keine Behauptung, dass jede
Vintz-Seite an Teams delegierbar sei.

Kontenauswahl und Seitenwahl sind zwei unterschiedliche Ebenen: Konten gehören
zur Freigabe des Workspaces, Seiten zur Rolle beziehungsweise Mitgliedsfreigabe.
Eine individuelle Kontoauswahl pro Mitglied ist damit noch nicht nachgewiesen.

Technisch sichtbar sind reguläre Lesewege für Workspaces und eigene Einladungen,
Annahme-/Ablehnungsaktionen und ein aktiver Workspacekontext. Der aktive Kontext
wird bei Fokus/Rückkehr und ungefähr minütlich nachgelesen; Änderungen an Rolle,
Seiten oder Kontenzahl können ein Neuladen auslösen. Ein Kanal informiert andere
Tabs über Workspacewechsel. Das sind Frontendmechaniken, kein Beweis für eine
sofortige serverseitige Zugriffssperre bei Entzug.

Plan-/Sitzplatzprüfungen und Hinweise auf Owner-Schutz sind im Client vorhanden.
Fehlertexte allein belegen nicht ihre serverseitige Umsetzung. Ohne Team wurden
Mitgliederverwaltung, echter Einladungsversand, Annahme, Entzug, Sitzplatzgrenzen,
gemeinsame Datensicht und parallele Sitzungen **nicht praktisch verifiziert**.

## Flipbase: vorhandene Einstellungen und tatsächliche Teamfunktion

Die Navigation umfasst Konto, Unternehmen, Workspace, Nummernkreise, Team,
Marktplätze, Benachrichtigungen, Shop/Zahlungen, Versand sowie Daten/Protokolle.
Diese zehn Bereiche sind im Quellcode vorhanden; Team und Konto wurden in diesem
Schritt live gelesen. Andere Bereiche sind hier Quellenvergleich, kein erneuter
vollständiger Bedienablauf.

| Thema              | Flipbase-Stand und Einordnung                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persönliches Konto | Profiländerung, Passwortwechsel nach erneuter Anmeldung und globales Abmelden angebunden. Nichts davon ausgeführt. „2FA: Noch nicht eingerichtet“ ist eine statische Anzeige ohne eingerichteten Setupweg im geprüften Panel. |
| Sitzungen          | Anzeige „Dieser Browser – Aktiv“ ist keine geladene Liste aller Geräte. Globale Abmeldung vorhanden, einzelne Geräteverwaltung damit nicht bewiesen.                                                                          |
| Unternehmen        | Geschäfts-/Bank-/Steuerdaten und Logo; geprüfte Serverpfade an Owner/Admin gebunden. Breiter als Vintz' persönliche Einstellungsseite.                                                                                        |
| Workspace          | Name, Rendite-/Gewinnvorgaben, Erstellung/Wechsel und Aufbewahrungs-/Archivierungsablauf. Das Währungsfeld wird im gelesenen Speicherhandler nicht mitgesendet; keine erfolgreiche Währungsänderung behaupten.                |
| Nummernkreise      | Konfigurierbare Formate, Zähler und Jahreswechsel mit Versionsprüfung; echte kaufmännische Stärke, kein Gegenstück im untersuchten Vintz-Einstellungsbereich.                                                                 |
| Benachrichtigungen | Pushkategorien und zusätzliche Ausgabekanäle im Code. Keine Testnachricht; eigener Detailblock V-19 bleibt offen.                                                                                                             |
| Shop und Versand   | Zahlungsarten und Versandkonfigurationen. Weder fertig angebundene Zahlungsabwicklung noch echte Versandlabel allein durch vorhandene Formularfelder bewiesen.                                                                |
| Daten/Protokolle   | Bestehende Geschäfts-/Prüfarchive und Exporte, teilweise explizit Owner/Admin/Accountant. Kein gleichbedeutender Ersatz für Vintz' persönlichen Kontodatenexport.                                                             |

### Einladungen: sichtbarer Ausbaupunkt

Die Mitgliederliste liest echte `workspace_members` mit Profilangaben und filtert
nach Workspace. Auch der aktuelle Benutzer wird anhand seiner Identität der
Mitgliedschaft zugeordnet. Die offene Einladung in der Liveansicht entsprach
dagegen dem **fest hinterlegten Demo-Eintrag des Services**.

`inviteMember()` ergänzt nur einen lokalen Signal-Eintrag; es gibt in diesem
Pfad weder Datenbankeintrag, Einladungs-Token noch Mailversand. Trotzdem zeigt
die Komponente danach „Einladung wurde versendet“. Widerrufen entfernt ebenfalls
nur einen lokalen Eintrag. Daraus folgt: Der vorhandene Dialog ist noch kein
funktionsfähiger Einladungsprozess. Keine Einladung eingegeben oder abgeschickt.

### Rollen: Beschriftung und Durchsetzung auseinanderhalten

Flipbase benennt Inhaber, Administrator, Sourcing/Einkauf, Packstation/Logistik,
Steuerberater/DATEV und Nur-Lesen. Diese fachlichen Rollen sind als Ausgangspunkt
sinnvoller als bloß mehr Rollen einzuführen. Allerdings:

1. Die Teamoberfläche schützt Inhaberzeilen vor Änderungen, blendet die übrigen
   Verwaltungsaktionen im gelesenen Template aber nicht nach der Rolle des
   Betrachters aus. Die Einstellungsnavigation ist ebenfalls nicht nach
   Seitenrechten gefiltert. Sichtbarkeit ersetzt keine Serverprüfung.
2. Die geprüften Mitgliedschaftspolicies erlauben Admins Rollenänderungen und
   das Hinzufügen von Mitgliedern; Entfernen ist Admins beziehungsweise selbst
   möglich. Ein zusätzlicher Schutz des letzten Inhabers, Owner-Zielschutz oder
   eine engere erlaubte Rollenzuweisung wurde in der untersuchten Kette nicht
   gefunden. Das ist ein konkreter Prüfpunkt, kein ausgeführter Rollenwechsel.
3. `can_access_workspace()` prüft Mitgliedschaft und gültigen Workspacezugang.
   Beispielsweise nutzen Artikel-Schreibpolicies, Shopkonfiguration und der
   Verkaufsbuchungspfad diese allgemeine Prüfung ohne fachliche Rollenabfrage.
   Damit sind die beworbenen Nur-Lese-/Versand-/Finanzgrenzen in diesen Pfaden
   nicht umgesetzt. Andere Pfade, etwa Unternehmen, Nummernkreise und bestimmte
   Datenarchive, besitzen bereits engere Rollenprüfungen.
4. Rollenänderung und Entfernen aktualisieren die lokale Liste vor der
   Serverantwort; Rücknahme bei Fehler sowie Prüfung tatsächlich betroffener
   Zeilen fehlen in den gelesenen Methoden. Eine Erfolgsmeldung kann deshalb
   einen vom Server nicht bestätigten lokalen Zustand überdecken.

Diese Aussagen beziehen sich auf lokale Quellen des genannten Gitstands. Kein
Nachweis einer konkreten Produktionsausnutzung, keine vollständige Prüfung aller
Rechtepfade und keine Änderung der Datenbank. Die Mitgliedschaft wird aus echten
Tabellen und Benutzer-ID geprüft, nicht aus frei bearbeitbaren Profilmetadaten.

## Festgehaltene Empfehlungen, noch ohne Umsetzung

| Priorität | Richtung für Flipbase                      | Nachprüfbares Ziel einer späteren Umsetzung                                                                                                                       |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zuerst    | Bestehende Teamrollen verbindlich machen   | Gesonderte Tests je Rolle für Lesen und Schreiben, einschließlich direkter Serverzugänge, Owner-Schutz und Rechteentzug; Seitenanzeige passt zur Befugnis.        |
| Zuerst    | Einladungsfunktion vervollständigen        | Gespeicherte, befristete und widerrufbare Einladung, tatsächliche Zustellung/Annahme, klare Fehler; keine Demo-Einträge oder unzutreffende Versandmeldung.        |
| Danach    | Konten und Seiten getrennt freigeben       | Teamfreigabe nennt ausdrücklich Konten und Funktionen; persönliche Bereiche bleiben klar erkennbar. Für jedes Mitglied verständliche Zusammenfassung.             |
| Danach    | Kontobezogene Schreibvorgaben ergänzen     | Stil, Sprache, Emojis, Abschluss und eigene Anweisungen wiederverwenden; vorhandene Feldvorlagen und Entwürfe erhalten.                                           |
| Danach    | Eigene Größenregeln prüfen                 | Flachmaße, Einheiten, Kategorien und Unsicherheit erklären; Vorschlag erst nach bewusster Prüfung übernehmen.                                                     |
| Danach    | Speicherwirkung verständlich zeigen        | Persönlich/Workspace/Konto am Feld erklären; gespeichert erst nach Bestätigung. Fehler erzeugen keinen scheinbar erfolgreich gespeicherten Zustand.               |
| Später    | Konto-/Datenschutzkomfort vervollständigen | Persönlichen Export, echten 2FA-Weg und tatsächliche Sitzungsübersicht getrennt von Geschäftsarchiven planen. Kein Vorteil durch statische Platzhalter behaupten. |

Vintz' Autospeichern nicht pauschal übernehmen: harmlose Textvorgaben und
zugriffs- oder automationswirksame Änderungen brauchen unterschiedlich klare
Rückmeldungen und gegebenenfalls ausdrückliches Anwenden. Das ist eine
Empfehlung für spätere Gestaltung, keine Freigabe zur Änderung.

## Belege und offene Fragen

Vintz: geladene Einstellungen-/Teamquellen
`34zo03lcgnagc.js`, `1-oj5sqnk61gi.js`, `2e55v10sy1ulg.js`,
`0phyucjyrrvcf.js`, `3t_pt7lo8x2se.js` unter
`https://vintz.ai/_next/static/chunks/`. URLs, Länge und SHA-256 lokal in
[Quellenkennungen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-settings-source-identities-2026-10-18.json).
Keine Zugangsdaten oder vollständigen Kontoantworten in den Bericht übernommen.

Bildbelege:
[Team-Erstellung vor Abbruch](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-settings-team-create-2026-10-18.png),
[unveränderter Schreibstil-Editor](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-settings-copy-style-2026-10-18.png).

Zentrale Flipbase-Belege:

- [Einstellungsnavigation](../../src/app/features/settings/settings-shell/settings-shell.component.ts),
  [Teamkomponente](../../src/app/features/settings/pages/team-settings/team-settings.component.ts),
  [Teamvorlage](../../src/app/features/settings/pages/team-settings/team-settings.component.html).
- [Mitglieder und Einladungen](../../src/app/core/services/workspace-member.service.ts),
  [Workspace-Vorgaben](../../src/app/features/settings/pages/workspace-settings/workspace-settings.component.ts),
  [Kontovorlage](../../src/app/features/settings/pages/account-settings/account-settings.component.html).
- [Mitgliedschaft und Basispolicies](../../supabase/schemas/database.sql),
  [Workspacezugang](../../supabase/schemas/355_beta_access.sql),
  [fachliche Schreibpfade und engere Ausnahmen](../../supabase/schemas/360_beta_business_access.sql),
  [Zugangsprüfung der Navigation](../../src/app/core/guards/workspace-access.guard.ts).

Offen bleiben bei Vintz insbesondere echte Teamaufnahme und Rechteentzug,
serverseitige Konto-/Seitengrenzen, genaue Speicherungsebene der gemeinsamen
Vorgaben, Sitzplatzabrechnung und Verhalten paralleler Nutzer. Bei Flipbase ist
die tatsächliche Rollenmatrix vor einer späteren Umsetzung ausdrücklich zu
klären und dann gezielt zu prüfen. Kein Team aktiviert oder umgebaut.

**Abschluss:** Nur Dokumentation geändert. Separate Lesetabs geschlossen,
bestehende Tabs und pausierte Flipbase-Verbindung unberührt. Danach Stopp zur
Besprechung; keine automatische Fortsetzung mit V-17 oder anderen Bereichen.
