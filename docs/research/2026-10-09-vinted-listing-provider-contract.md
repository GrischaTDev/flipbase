# Vinted-Inserate: Anbieterprüfung und Umsetzungsstand

Stand: 09.10.2026. Der Nutzer hat die Umsetzung mit „dann los“ freigegeben.
Arbeitsbasis ist `origin/master` bei `638b2ace`, einschließlich PR #356 und #357.

## Nachgewiesen und offen

Der Nutzer hat die Anmeldung bestätigt; die angemeldete Vinted-Seite wurde
am 09.10.2026 gelesen. Die Browserverbindung brach danach wiederholt ab.
Erstellungs- und Bearbeitungsformular eines echten Inserats sind deshalb
weiterhin nicht geprüft. Die Bleam-Recherche ist im
[Produktentwurf](../superpowers/specs/2026-10-09-vinted-listing-publishing-design.md)
festgehalten; sie ersetzt keine Bestätigung des Vinted-Formulars.

| Bereich                                    | Aktueller Nachweis                                                                                  | Nächster Nachweis                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Kategorie                                  | Vorhandener gespeicherter Vinted-Baum; vollständiges Lesen und Auswahl getestet                     | Aktuelle Pflichtmerkmale je Kategorie im Anbieterformular prüfen                        |
| Titel, Beschreibung, Verkaufspreis         | Frei speicherbare Flipbase-Arbeitskopie; Betrag in Cent, kein Übernehmen von Einkaufskosten         | Vinted-Längen, Preisgrenzen und Währung bestätigen                                      |
| Marke, Größe, Zustand, Farben, Materialien | Freie Beschriftungen im Entwurf; bekannte IDs bleiben nur bei unverändertem Feld/Kategorie erhalten | Tatsächliche Auswahlwerte, IDs und Abhängigkeiten bestätigen                            |
| Paketgröße und weitere Merkmale            | Platz im gespeicherten Inhaltstyp, noch keine bestätigten Eingabefelder                             | Aktuelle Versand-/Kategorieauswahl bestätigen                                           |
| Fotos                                      | Private Originaldateien und Auswahlreihenfolge; Zuschneiden/Drehen erzeugt neue Datei               | Anbietergrenzen, Uploadvertrag und Fotozuordnung bestätigen                             |
| Flipbase-Entwurf                           | Anlegen, automatisch speichern, suchen und wieder bearbeiten implementiert                          | Echte Umgebung erst nach abgeschlossener Integration migrieren                          |
| Vinted-Entwurf                             | Noch nicht implementiert                                                                            | Eigenen Anbieterweg und bestätigte Entwurfs-ID prüfen                                   |
| Veröffentlichen und Bearbeiten             | Bestehende begrenzte Bearbeitung bleibt erhalten; neuer vollständiger Schreibweg fehlt              | Form-/Antwortvertrag, Ergebnis-ID, Antwortverlust und Wiedererkennung prüfen            |
| Termin und Relist                          | Terminmodell einschließlich Zeitzone/Zeitumstellung getestet; keine Aufträge oder Relist            | Aufträge erst auf geprüftem Anbieterweg aufbauen; Relist-Reihenfolge separat bestätigen |

Es wurden keine neuen Vinted-Schreibendpunkte oder Anbieter-IDs geraten.
Ein echter Schreibtest braucht einen vom Nutzer ausgewählten Artikel und die
Freigabe der konkreten Aktion. Die automatischen Browserprüfungen verwenden
ausschließlich künstliche Konten, Inserate und Fotos mit abgefangenen Anfragen.

## Fertige Grundlage im Arbeitszweig

- Eigene Entwürfe mit optionalem Zielkonto, unveränderlichen privaten Fotos und
  ausgewählten Vorlagenfeldern in deklarativen Schemas 460–462.
- Kontrollierte Datenbankfunktionen prüfen Arbeitsbereich, Konto und Revision.
  Derselbe Anlegeversuch kann nach Verbindungsabbruch wiederholt werden, ohne
  einen zweiten Entwurf anzulegen. Große interne IDs bleiben Zeichenketten.
- Eine gemeinsame Bildkomponente für Kleinanzeigen und Vinted unterstützt
  Dateiauswahl, Drag-and-drop, Titelbild, zugängliche Verschiebeaktionen sowie
  den vorhandenen Zuschneide-/Drehdialog.
- Autospeichern hält nach einem Fehler an und bewahrt Eingaben. Konflikte
  verlangen bewusstes Laden des gespeicherten Stands. Ausstehende Antworten
  eines anderen Arbeitsbereichs werden verworfen.
- Vorlagen zeigen Änderungen vor dem Übernehmen. Konto und Fotos gehören
  nicht zur Vorlage; Preisübernahme ist ausdrücklich auswählbar.
- Entwürfe können ohne verbundenes Vinted-Konto vorbereitet werden. Die Seite
  bezeichnet die Speicherung ausdrücklich als Speicherung in Flipbase.

Die Speichergrenzen von 100 Fotos, 50 MiB pro Foto, 20.000 Zeichen pro Text
und 200.000 Byte JSON sind eigene Schutzgrenzen für Arbeitskopien. Sie sind
**keine bestätigten Vinted-Grenzen**. Unterstützt werden JPEG, PNG und WebP;
vor dem Upload muss der Browser die Bilddatei lesen können. HEIC und andere
Formate sind derzeit nicht unterstützt.

## Noch erforderliche Arbeit

Paket 1 bleibt bis zur tatsächlichen Formularprüfung offen. Paket 2 ist teilweise
umgesetzt: fehlschlagende Uploads werden nach Serverfreigabe bereinigt;
bestätigte Originale bleiben für spätere Sicherungen erhalten. Eine dauerhafte
serverseitige Bereinigung verwaister Uploads, vollständige Sicherungen und
deren Aufbewahrungsregeln fehlen noch. Das Löschen eines Entwurfs wird deshalb
noch nicht angeboten und hat keine öffentliche Schreibfunktion.

Paket 3 enthält die funktionsfähige eigene Entwurfsmaske. Die bestätigten
kategorieabhängigen Anbieterfelder sowie Aktionen für Vinted-Entwurf,
sofortige/geplante Veröffentlichung fehlen. Paket 5 enthält inzwischen das
Terminmodell: UTC und Zeitzone, explizite Auswahl bei doppelten Uhrzeiten,
Ablehnung übersprungener bzw. vergangener Termine und beide Ausfallregeln.
23 Modellprüfungen bestehen auch mit Gerätezeitzonen New York und Tokio.
Gemeinsame lokale/Cloud-Aufträge, Planungsdialog und serverseitige Terminsteuerung,
vollständige Live-Bearbeitung mit Drawer und manuelles Relist fehlen weiterhin.

## Prüfungen dieser Grundlage

- Produktionsbau und TypeScript-Prüfung erfolgreich; bestehende Warnungen
  zu `HeaderComponent.DatePipe` und `pdf-lib/pako` bleiben bestehen.
- 96 betroffene Angularprüfungen einschließlich bisherigem Kleinanzeigeneditor;
  30 Modell-/Navigationsprüfungen und 11 gezielte Skriptprüfungen erfolgreich.
- 56 neue Datenbankprüfungen nach frischem Reset aus allen Migrationen;
  Zugriffsrechte und private Storage-Policies tatsächlich geprüft.
- Vier echte Browserdurchläufe der Testoberfläche: Desktop/Mobil, hell/dunkel,
  Kategorieauswahl, Speichern/Wiederladen, Fotos, Reihenfolge und Vorlagen.
  AXE prüft die neue Editorfläche; alle vier Durchläufe sind ohne Befund.
  Der Bilddialog wird zusätzlich mit Escape und Fokusrückkehr geprüft.
- Die unabhängige Review fand drei Randfälle. Regressionstests reproduzierten
  sie; Vorlagen ändern nun nur ausgewählte Texte, Fotoersatz funktioniert auch
  bei voller Auswahl und Autospeichern pausiert während der Bildbearbeitung.
  Ein zusätzlicher Test sichert die Freigabe dieser Pause beim Kontextwechsel.

Kein Push, kein PR, kein Merge, keine Produktionsmigration, kein Deployment
und keine Änderung installierter Erweiterungen oder realer Inserate.
