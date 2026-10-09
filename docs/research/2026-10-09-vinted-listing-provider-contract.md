# Vinted-Inserate: Anbieterprüfung und Umsetzungsstand

Stand: 09.10.2026. Der Nutzer hat die Umsetzung mit „dann los“ freigegeben.
Arbeitsbasis ist `origin/master` bei `638b2ace`, einschließlich PR #356 und #357.

## Nachgewiesen und offen

Nach „probier nochmal“ wurden am 09.10.2026 das angemeldete Neuanlageformular
und die vollständige Bearbeitungsmaske eines eigenen aktiven Inserats gelesen.
Unterbrechungen beim Seitenwechsel wurden durch erneutes Verbinden überwunden.
Die Prüfung benutzt sichtbare Bedienelemente und deren DOM-Attribute; es wurden
keine versteckten Anwendungszustände oder Zugangsdaten ausgelesen.
Die Bleam-Recherche ist im
[Produktentwurf](../superpowers/specs/2026-10-09-vinted-listing-publishing-design.md)
festgehalten. Die folgenden Vinted-Nachweise ergänzen diese Recherche.

| Bereich                                    | Aktueller Nachweis                                                                                  | Nächster Nachweis                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Kategorie                                  | Gespeicherter Baum; Neuanlage/Bearbeitung mit Kleidung und Kinderschuhen geprüft                    | Weitere Kategoriearten und deren Pflichtmerkmale prüfen                                 |
| Titel, Beschreibung, Verkaufspreis         | Frei speicherbare Flipbase-Arbeitskopie; Betrag in Cent, kein Übernehmen von Einkaufskosten         | Vinted-Längen, Preisgrenzen und Währung bestätigen                                      |
| Marke, Größe, Zustand, Farben, Materialien | Auswahlstruktur und Beispiele am Anbieter bestätigt; Entwurfeditor verwendet noch freie Angaben     | Dynamische Auswahl mit bestätigten IDs integrieren; weitere Kategorien prüfen           |
| Paketgröße und weitere Merkmale            | Sendungsgrößen 1/2/3 am Anbieter bestätigt; KI-Fotokennzeichnung im Inhaltstyp noch nicht enthalten | Sendungsgröße und Kennzeichnung in den vollständigen Editorvertrag aufnehmen            |
| Fotos                                      | Private Originaldateien und Auswahlreihenfolge; Zuschneiden/Drehen erzeugt neue Datei               | Anbietergrenzen, Uploadvertrag und Fotozuordnung bestätigen                             |
| Flipbase-Entwurf                           | Anlegen, automatisch speichern, suchen und wieder bearbeiten implementiert                          | Echte Umgebung erst nach abgeschlossener Integration migrieren                          |
| Vinted-Entwurf                             | Eigene Schaltfläche im Vinted-Formular nachgewiesen; noch kein Schreibadapter                       | Speicherung und bestätigte Entwurfs-ID an später freigegebenem Fall prüfen              |
| Veröffentlichen und Bearbeiten             | Beide vollständigen Formulare gelesen; neue Schreibwege und Ergebnisbelege fehlen                   | Ergebnis-ID, Antwortverlust und Wiedererkennung am geprüften Schreibweg bestätigen      |
| Termin und Relist                          | Terminmodell einschließlich Zeitzone/Zeitumstellung getestet; keine Aufträge oder Relist            | Aufträge erst auf geprüftem Anbieterweg aufbauen; Relist-Reihenfolge separat bestätigen |

Es wurden keine neuen Vinted-Schreibendpunkte oder Anbieter-IDs geraten.
Ein echter Schreibtest braucht einen vom Nutzer ausgewählten Artikel und die
Freigabe der konkreten Aktion. Die automatischen Browserprüfungen verwenden
ausschließlich künstliche Konten, Inserate und Fotos mit abgefangenen Anfragen.

## Direkt am Vinted-Formular bestätigt

- Neuanlage: `/items/new`, getrennte Schaltflächen **Entwurf speichern** und
  **Hochladen**. Vor der Kategorieauswahl sind Fotos, Titel, Beschreibung und
  Kategorie sichtbar. Nach Wahl der Kategorie erscheinen deren weitere Felder.
- Beispiel Herren → Kleidung → Jacken & Mäntel → Jacken → Bomberjacken:
  Kategorie `1223`; Marke, Größe, Zustand, Farbe und Material sowie Preis und
  Sendungsgröße. Material wird ausdrücklich als empfohlen bezeichnet.
- Größen sind kategorieabhängig: Männergrößen gehören im Beispiel zur Gruppe
  `14`, etwa M mit Kennung `208`. Beim eigenen Inserat in Kinder → Jungs →
  Schuhe → Sportschuhe → Fußballschuhe (`2738`) erscheint stattdessen die
  Kinderschuhgrößengruppe `31`, etwa 38 mit Kennung `607`.
- Zustandskennungen im geprüften Kleidungsformular: `6` für neu mit Etikett,
  `1` für neu, `2` sehr gut, `3` gut und `4` zufriedenstellend.
- Farbe erlaubt zwei Werte. Bei Wahl eines dritten Werts ersetzt Vinted einen
  bisherigen Wert. Material erlaubt entsprechend drei Werte. Flipbase soll
  diese Grenzen erklären und vorhandene Auswahlen bewusst ändern lassen.
- Sendungsgröße: klein `1`, mittel `2`, groß `3`. Nach dem Laden der
  Bomberjacken-Kategorie wurde mittel automatisch als Empfehlung ausgewählt.
  Die Empfehlung kann verspätet erscheinen; ein Ausführer muss auf den fertigen
  Formularstand warten und die tatsächlich gewünschte Größe prüfen.
- Foto-Dateiauswahl: `name="photos"`, Mehrfachauswahl und
  `accept="image/jpeg,image/gif,image/png,image/webp"`. Eine zahlenmäßige
  Fotogrenze oder maximale Dateigröße ist damit **nicht** bestätigt. GIF ist
  am Anbieter auswählbar, im bisherigen Flipbase-Fotoweg jedoch nicht unterstützt.
- DOM-Felder: `input[name="title"]`, `textarea[name="description"]`,
  `input[name="price"]` sowie `#category`, `#brand`, `#size`, `#condition`,
  `#color` und `#material`. Die Auswahlfelder sind schreibgeschützte Eingaben
  mit aufklappbarer Auswahl, keine freien Textfelder.
- Auswahlkennungen stehen unter anderem in `catalog-<id>`,
  `catalog-suggestion-<id>`, `brand-<id>`, `suggested-brand-<id>`,
  `condition-<id>`, `color-<id>`, `material-<id>` und
  `data-testid="size-group-<group>-grid-option-<id>"`. Vorgeschlagene und
  reguläre Einträge können dieselbe Kennung enthalten; sie müssen beim Lesen
  zusammengeführt werden. Nicht aus bloßen Beschriftungen eine ID erfinden.
- Bearbeitung: Die Aktion **Angebot bearbeiten** führt zu `/items/<id>/edit`.
  Die Maske enthält die vorhandenen Fotos mit Reihenfolge und Titelbild,
  Entfernen-/Bearbeiten-Aktionen, alle genannten Angaben und **Speichern**.
- Einige Markenwechsel sind gesperrt. Im geprüften Schuh-Inserat sind etwa
  bestimmte Zielmarken deaktiviert, andere auswählbar. Flipbase muss eine
  konkrete Sperre anzeigen; sie darf keine ungefragte Neuanlage auslösen.
- Bei vorhandenen Fotos erscheint `ai_photo`, eine Kennzeichnung für KI-Fotos.
  Der aktuelle Entwurfsvertrag enthält sie noch nicht. Vor vollständiger
  Live-Bearbeitung muss sie ausdrücklich erfasst und erhalten werden.
- Die Bearbeitungsmaske enthält außerdem die kostenpflichtige Zusatzoption
  `bump`. Ein normaler Bearbeitungsauftrag darf sie nicht einschalten.
- Titel, Beschreibung und Preis haben in der beobachteten DOM-Struktur keine
  `maxlength`-/`min`-/`max`-Grenzen. Daraus folgt **keine** unbegrenzte Eingabe:
  tatsächliche Anbietergrenzen und Pflichtvalidierung bleiben zu bestätigen.

Es wurden nur Auswahllisten im ungespeicherten Neuanlageformular ausprobiert.
Anschließend wurde das leere Ausgangsformular wiederhergestellt und gelesen.
Das bestehende Inserat wurde ausschließlich gelesen. Keine Fotos hochgeladen,
kein Vinted-Entwurf angelegt und kein Inserat gespeichert oder veröffentlicht.
Ein erfolgreicher Schreib-/Ergebnisvertrag und weitere Kategorien sind noch
offen; die sichtbaren Schaltflächen allein liefern diesen Nachweis nicht.

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

Paket 1 ist durch die beschriebenen Formularbeobachtungen teilweise geklärt.
Anbietergrenzen, weitere Kategoriearten und Schreib-/Ergebnisbelege bleiben
offen. Paket 2 ist teilweise
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
