# Vintz-Archiv im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Nach Festhalten der Auswertungspunkte ausschließlich
Archiv untersuchen und vergleichen. Danach Stopp. Keine Umsetzung, Löschung,
Archivierung, Wiederherstellung oder Veröffentlichung freigegeben.

## Ergebnis

Vintz' Archiv ist eine **gesicherte Bibliothek von Vinted-Angeboten und Fotos**
mit Bearbeitung und Vorbereitung erneuter Uploads. Flipbase hat bereits ein
**reversibles internes Artikelarchiv**, das Daten und Geschäftsvorgänge erhält,
Artikel aber aus der aktiven Arbeit nimmt. Diese beiden Bedeutungen von
„Archiv“ dürfen nicht gleichgesetzt werden.

Der relevante Vintz-Vorsprung ist die sichtbare Sicherung von Angebotsfeldern
und Originalfotos mit Vollständigkeitsprüfung sowie ein kontrollierter Weg zu
neuen Uploads. Für Flipbase wäre das eine zusätzliche Angebotsbibliothek neben
dem bestehenden Artikelarchiv. Ein neuer Archiv-Grundmechanismus ist bereits
vorhanden und müsste dafür nicht ersetzt werden.

## Prüfrahmen

- [Vintz-Archiv](https://vintz.ai/archive), Prozugang, persönlicher Workspace,
  globale Kontoanzeige Maike Vintage; Archivfilter „Alle Accounts“.
- Live: bestehende Bibliothek, Raster/Liste, Such-Leerzustand, Details und
  unverändertes Bearbeitungsformular, Import-Einstieg, Sicherungsoptionen,
  lokale Einzelauswahl/Transferdialog sowie leerer Transferverlauf.
- Nur geladene Erstanbieter-Skripte gelesen; kein Serverzugriff jenseits der
  gewöhnlichen Seitenabrufe, keine vollständige Netzwerkaufzeichnung.
- Flipbase: [Katalogarchiv](https://app.flipbase.de/catalog?view=archive) live
  mit fünf archivierten Artikeln und Wiederherstellungsbestätigung gelesen;
  Bestätigung abgebrochen. Quellen und unabhängige Gegenprüfung auf HEAD
  `e3ef736370640125c1abddcaf82de6079205d9fa`.
- Unterschiedliche Konten-/Artikelbestände, kein Mengen- oder
  Geschwindigkeitsbenchmark. Schreibende Abläufe nur bis zum Einstieg gelesen.

## Vintz: vorhandener Bestand und Bedienung

Die Bibliothek war vor eigenen Aktionen bereits gefüllt: **8 Einträge,
18/18 Fotos als gesichert markiert, 4 bereit und 4 mit Prüfbedarf**.
Ein Eintrag zeigte zusätzlich „Needs retry“. Die Ursache des bereits
vorhandenen Bestands und dessen genaue Erfassungsfolge wurden nicht neu geprüft.

| Funktion    | Tatsächlich beobachtet                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Kontofilter | Alle Accounts oder archiviertes Profil `maikevintage · vinted.de`; unabhängig vom globalen Kontonamen. Kein Kontowechsel ausgeführt.           |
| Raster      | Vorschaubild, Fotoanzahl, Titel, Marke/Größe, Preis, Kategorie-/Beschreibungsauszug, Herkunftskonto und Bereitschaft.                          |
| Liste       | Kompakte Zeilen und Summen für sichtbare Einträge: 8, Angebotspreise 250,56 €, 4 bereit, 4 prüfen. Kein Verkaufsumsatz oder Lagerwert.         |
| Suche       | Sucht im Archiv; nicht passende Suche führt zu „Keine passenden Angebote“. Suchwert anschließend geleert.                                      |
| Auswahl     | Nur übertragbare Einträge auswählbar; fehlende Angaben stehen als Sperrgrund am Feld. Auswahl zurückgenommen.                                  |
| Details     | Fotos mit Vor/Zurück und Miniaturen, Originalfoto-Link, Beschreibung, Artikeldetails, Sicherungszeit und Prüfgründe.                           |
| Bearbeiten  | Expliziter Hinweis „Änderungen werden nur in deinem Archiv gespeichert“. Eigenes Speichern/Abbrechen, kein Autospeichern im gelesenen Handler. |
| Transfers   | Eigener Verlauf; hier leer. Nicht mit dem bereits vom Nutzer vorgemerkten manuellen Neueinstellen gleichgesetzt.                               |

Ein gesicherter Nike-Pullover zeigte beispielsweise eine fehlende Farbe und
war daher nicht auswählbar. Dass sein Foto „1 von 1“ gesichert ist, macht seine
Angebotsfelder noch nicht vollständig. **18/18 bezeichnet die bekannten
Fotoeinträge, nicht unabhängig bewiesene Vollständigkeit gegenüber allen
ursprünglichen Vinted-Fotos.** Ein gleichlautender Mares-Titel erschien zweimal;
das allein beweist keine fehlerhaften Duplikate, weil Titel keine Identität sind.

Die Details der Nike-Jogginghose zeigten vier Fotos, Beschreibung, Marke,
Größe, Zustand, Kategorie, Paketgröße und Farbe. Bearbeitbar waren Titel,
Beschreibung, Preis/Währung, Marke, Größe, Zustand, Material, Kategorie,
Paketgröße und Farben; zusätzliche Angaben enthalten ISBN, Breite und Länge.
Größen werden passend zur Kategorie nachgeladen. Es wurde kein Feld geändert.
Fotobearbeitung/-löschung oder eine Löschung des Archiveintrags wurde in diesen
Ansichten nicht angeboten. Der Originalfoto-Link ist kein belegter
vollständiger Archiv-/ZIP-Export.

## Was Vintz unter Sicherung versteht

### Öffentlichen Kleiderschrank erfassen

„Kleiderschrank archivieren“ öffnet einen Dialog für Nutzername und Land,
zunächst ohne Datenänderung. Die Oberfläche beschreibt öffentliche, aktuell
sichtbare Angebote, verfügbare Details und Fotos. Vor einer Sicherung entfernte
Angebote könne sie nicht zurückholen. Vorhandene Einträge würden ohne Duplikate
aktualisiert. Diese Aktualisierung ist kein Nachweis einer Versionshistorie.

Der geladene Code verwendet `POST /api/seller/archive/import`: zunächst
`action: lookup`, danach gesonderte Seitenimporte. **Bereits die Suche ist ein
POST und wurde nicht gestartet.** Die Seitenfolge hat Wiederholungsprüfung,
maximal 1.000 Seiten und kurze Pausen. Sie muss während des Erfassens geöffnet
bleiben; Pause/Schließen beendet weitere Seiten, bereits erfasste Daten bleiben
laut Oberfläche erhalten. Danach sollen Kategorien, Beschreibungen und Fotos
im Hintergrund weiter gesichert werden. Keine fremden Profile gesucht oder
importiert; tatsächlicher Hintergrundabschluss und Duplikatvermeidung offen.

### Verbundene Konten und vollständige Details

Die aufklappbaren Sicherungsoptionen trennen einfache Listeninformationen von
vollständigen Bearbeitungsdaten:

- Browserkonto: Abruf der eigenen Angebotsseiten, Sicherung über
  `POST /api/seller/archive/capture` in Gruppen bis zehn; Kontoidentität wird
  vor/nach Abrufen geprüft. Ein Wechsel soll den Lauf anhalten.
- Bereites verwaltetes Konto: gesonderter Sync-POST mit Archivkennzeichen.
  Die gelesene UI beschreibt hierfür Listeninformationen und nicht automatisch
  sämtliche ursprünglichen Bearbeitungsfelder.
- Fehlende vollständige Details: ursprüngliches Konto muss in diesem Browser
  über Vintz Connect verbunden sein. Pro Artikel wird eine Bearbeitungsseite
  gelesen. Bestehende vollständige Sicherungen werden übersprungen.
- Detailsabruf mit 5–300 Sekunden Abstand, Standard 10; die Oberfläche zeigt
  rund 17 Minuten zusätzliche Wartezeit für 100 Artikel, plus Laden. Sie
  erklärt selbst, dass das Anfragelimits nicht sicher vermeidet.
- Fehler sollen den Lauf stoppen, gespeicherte Daten erhalten; laufender
  Browserabruf kann abgebrochen werden. Fortschritt wird lokal gespeichert.

Keiner dieser Sicherungs-/Sync-/Retryknöpfe wurde betätigt. Normaler Einstieg
ins Archiv liest vorhandene Daten; ein frischer vollständiger Backup-Lauf
wurde damit nicht praktisch bestätigt. Unterbrechungsfestigkeit, Bildintegrität,
Speicherdauer, Kontolöschung, Tarifgrenzen und vollständiger Export bleiben offen.

## Wiederherstellen bedeutet hier erneuten Upload

Die lokale Auswahl öffnet „Listings übertragen“. Live waren sichtbar:

- Herkunft aus dem Archiv und Zielkontoauswahl;
- halbautomatisch, jedes Listing einzeln freigeben, als Vorgabe;
- alternativ automatische gesamte Warteschlange;
- Uploadabstand, Standard 300 Sekunden, Vorschläge 1/5/15/30 Minuten;
- ausgewählte Artikel und zusätzlicher Prüfschritt vor dem Erstellen/Starten.

Im Prüfstand war **kein Zielkonto auswählbar**, daher „Übertragung prüfen“
gesperrt. Eine genaue Ursache für die fehlende Zieleignung wurde nicht
festgestellt. Der Frontendfilter verlangt ein bereites, für Transfers
freigegebenes verbundenes Ziel im selben Vinted-Land wie die Quelle.

Der Code begrenzt eine Auswahl auf 50 Einträge und verlangt eine gemeinsame
Quelle. Ein Bibliotheksblatt umfasst 48, eine Transferseite 20 Einträge.
Nur gültige Angebotsfelder und Fotos erlauben die Auswahl. Im gleichen Konto
sieht der Dialog den erneuten Upload nur für dort nicht mehr online befindliche
Angebote vor, etwa verkauft/gelöscht. Das ist eine neue Veröffentlichung,
keine Wiederbelebung der alten Angebotskennung oder alter Favoriten.
Die tatsächliche serverseitige Prüfung wurde nicht ausgeführt nachgewiesen.

Erst nach Prüfung erstellt ein POST auf `/api/seller/transfers` den Auftrag.
Der halbautomatische Weg wartet laut Code auf die erste Freigabe; der
automatische startet die Warteschlange. Eine Anforderungskennung wird für
Wiederholungen verwendet; deren Serverdurchsetzung bleibt ungeprüft.

Der geladene Transferverlauf kennt Status je Artikel, Fehler, Ergebnislinks,
Freigeben des nächsten Uploads, Pause/Fortsetzen und „Rest abbrechen“ per PATCH.
Abbrechen verbleibender Arbeit bedeutet nicht nachgewiesenermaßen, bereits
veröffentlichte Angebote zurückzunehmen. Aktive Abläufe lesen ihren Stand
regelmäßig nach. Da der Verlauf leer war, sind das Codebefunde und keine
erfolgreich ausgeführten Transfer-/Recoverytests.

Originale und Archiv sollen laut UI erhalten bleiben. Einen allgemeinen
Papierkorb, endgültiges Archivlöschen oder einen Restore auf alte Vinted-IDs
haben die untersuchten Bibliotheks-, Import-, Detail- und Transferpfade nicht
gezeigt. Daraus keine Aussage über jede andere Kontoeinstellung ableiten.

## Flipbase: bestehendes internes Archiv

Live zeigte die Katalogansicht fünf archivierte Artikel, Suche, Bearbeiten-
und Wiederherstellen-Aktionen. Der gelesene Bestätigungsdialog sagt ausdrücklich,
dass der Artikel wieder in den aktiven Artikeln angezeigt wird. **Abgebrochen.**

| Punkt            | Tatsächlicher Flipbase-Stand                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archivieren      | Einzelaktion im Katalog und Lager, Bestätigung und laufende Sperre. Keine Sammelarchivierung in den untersuchten Komponenten.                                           |
| Erhaltene Daten  | Archivmetadaten statt Löschung; Artikel, Bilder, Belege, Bestands-/Verkaufsgeschichte bleiben. Archivierung ist keine Bestandskorrektur.                                |
| Wiederherstellen | Archivmetadaten zurücknehmen, wieder aktiv anzeigen; weder Verkauf stornieren noch neue Menge erzeugen oder Vinted-Angebot veröffentlichen.                             |
| Aktive Arbeit    | Neue Verkäufe/Inserate mit archiviertem Artikel gesperrt; verfügbarer Verkaufsbestand 0, obwohl physische Menge/Wert erhalten bleiben können.                           |
| Schutz           | Serverseitig Kontext/Zugang sowie lokale Reservierungen, offene Aufträge und interne Inserate prüfen. Externe Vinted-Angebote werden dadurch nicht automatisch beendet. |
| Suche            | Katalog über Titel, EAN, Marke, Modell, Kategorie; Sortierung über Titel/Menge/Wert. Lager mit zusätzlichen Zustands-/Statusfiltern.                                    |
| Ansichten        | Katalog `view=archive`; „Alle“ schließt hier archivierte Artikel aus. Lager kennt Aktiv/Archiv/Alle.                                                                    |
| Löschen          | Gesonderter endgültiger Pfad nur für unbenutzte Artikel; Server prüft Beziehungen. Kein Papierkorb. Nicht geöffnet oder ausgeführt.                                     |

Die aktuelle Archivierung setzt/löscht `archived_at` und `archived_by`, ändert
keine Verkäufe oder Mengen und schreibt ein Geschäftsereignis. Die Anwendung
prüft auch Wechsel von Nutzer/Workspace und parallele Aktionen. Historische
Lagerdatensätze mit `status: archived` werden weiterhin erkannt; eine reine
Metadaten-Wiederherstellung ist keine automatische Migration dieses Altstatus.

Der getrennte Löschpfad entfernt nur zulässige unbenutzte Artikel, merkt
Bilddateien für nachfolgende Bereinigung vor und kann diese Bereinigung
wiederholen. **Bereinigung wiederholen ist keine Wiederherstellung gelöschter
Artikel.** Beziehungsprüfungen reichen über den UI-Vorabstand hinaus. Kein
Löschen, kein Bildauftrag oder Aufräumen in dieser Untersuchung.

Zentrale „beendete“ Inserate, importierte Vinted-Endzustände und Archiv sind
getrennte Begriffe. Der ältere interne Neueinstellungsweg betrifft
Kleinanzeigen. In den untersuchten Vinted-Angebotskomponenten wurde keine
gleichwertige Angebotsbibliothek mit Originalfoto-Sicherung und Vinted-
Archivtransfer gefunden. Bestehende Entwürfe, Galerie und Medienablage allein
belegen diese durchgehende Wiederveröffentlichung nicht.

Quellen:
[Archivservice](../../src/app/features/inventory/services/inventory-archive.service.ts#L18),
[Katalogbestätigung](../../src/app/features/catalog/catalog.component.ts#L287),
[Archivfilter](../../src/app/features/catalog/models/article-view.ts#L18),
[Menge und Verkaufsverfügbarkeit](../../src/app/features/catalog/utils/catalog-overview.ts#L49),
[Lageransichten](../../src/app/features/inventory/inventory.component.ts#L394),
[Bildbereinigung](../../src/app/features/catalog/services/article-media-cleanup.service.ts#L26),
[Serverarchivierung](../../supabase/schemas/360_beta_business_access.sql#L10067),
[Serverlöschprüfung](../../supabase/schemas/360_beta_business_access.sql#L7834),
[Vinted-Entwürfe](../../supabase/schemas/460_marketplace_listing_drafts.sql#L110),
[interne Inserate](../../src/app/features/listings/services/listing.service.ts#L356).
Server-/Lagerquellen unabhängig gelesen; kein schreibender Datenbankaufruf.

## Festhalten für die Besprechung

1. **Bestehendes Artikelarchiv beibehalten.** „Aus aktiver Arbeit nehmen“,
   Angebotsbackup, externes Beenden und endgültiges Löschen klar benennen.
2. **Sinnvolle Ergänzung:** Konto und Originalangebotskennung zu einer
   gesicherten Angebotskopie, Bilder als eigene gespeicherte Dateien, Felder und
   Fotos getrennt auf Vollständigkeit prüfen. „Gesichert“ nicht mit
   „veröffentlichungsbereit“ gleichsetzen.
3. **Kontrollierte Wiederverwendung:** Archivkopie zunächst prüfen/bearbeiten,
   neues Angebot samt Zielkonto und Wirkung bestätigen. Physischer Bestand und
   bestehende aktive Veröffentlichungen müssen dabei nachvollziehbar bleiben.
4. **Fortschritt und Fehler:** Erhaltene Teilergebnisse, gezieltes Nachladen,
   verständliche Sperrgründe und ein Transferverlauf sind nützliche Muster.
   Automatik erst nach verlässlichem Einzelablauf bewerten.
5. **Offen vor einem größeren Vorhaben:** Speicherung/Aufbewahrung, Bildumfang,
   Sicherungszeitpunkte, Konten-/Ländergrenzen und kompletter Export. Kein
   vollständiges Backupversprechen allein aus einem Fotozähler ableiten.

Empfehlungen zur Diskussion, keine Umsetzungsfreigabe. Der ausgeschlossene
Konkurrenzmonitor wurde nicht untersucht; auch der öffentliche Import wurde
nicht zur Erfassung anderer Verkäufer verwendet.

## Belege und Abschluss

[Vintz-Bibliothek](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-overview-2026-10-18.png),
[Liste/Sicherungsoptionen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-library-2026-10-18.png),
[Detail mit Prüfgrund](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-details-2026-10-18.png),
[Import-Einstieg](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-import-2026-10-18.png),
[Transferdialog](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-transfer-2026-10-18.png),
[Flipbase-Archiv](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-archive-overview-2026-10-18.png),
[abgebrochene Restore-Bestätigung](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-archive-restore-confirmation-2026-10-18.png).

Geladene Vintz-Chunks unter `https://vintz.ai/_next/static/chunks/`, SHA-256:

| Chunk              | Rolle                                     | SHA-256                                                            |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| `1n2750813va6z.js` | Bibliothek, Sicherung, Transfererstellung | `5f98e89c2309330172eb2a6ae998ed138a4b7d821bded0bc743947de218e005b` |
| `0atfbf91mb637.js` | Details und Archivbearbeitung             | `6c958114a737f771b08c5698344d7b42be716432d6e8a2f97d72714c24c3c248` |
| `0n8h5fezyxj7o.js` | Öffentlicher Import                       | `5410a7cbd5baa0586be4508a14a8191a2584834c999a8607d0a5cc3b3e8318b8` |
| `3z9t69khmzie6.js` | Transferverlauf/-steuerung                | `7f3a84fcf7884e38b11c1e8cb7315e1325f1fb5d6cda7ec839f8dd9c9e71313b` |
| `0f2isfbjpqmb9.js` | Gemeinsame Felder-/Fotoprüfhilfen         | `6aa929a7f1a5de27353668898da9a679bfb180cdb7b03d62cd2e1cbb888b8a10` |

[Bereinigte Identitäts-/Zählerbelege](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-archive-evidence-2026-10-18.json).
Kein fremder Anwendungscode ins Repository kopiert.

Offen bleiben echte Sicherung/Import, vollständige Originalrekonstruktion,
Zielkontobereitschaft, Servervalidierung, Transfer/Abbruch/Wiederaufnahme,
große Datenbestände und Lebensdauer der Archivkopien. Keine vollständige
Mobil-/AXE-/Leistungsprüfung. Tatsächliche Ausführung ist nicht durch sichtbare
Buttons oder geladene Handler bewiesen.

Kein Feld gespeichert, Konto gesucht, Backup/Detailabruf/Sync/Retry gestartet,
Transfer erstellt, Artikel archiviert, wiederhergestellt oder gelöscht.
Auswahl und Suchfeld geleert, Vintz-Raster und geschlossene Optionen
wiederhergestellt. Flipbase-Bestätigung abgebrochen; beide separaten Lesetabs
geschlossen. Vorhandene Tabs und pausierte Flipbase-Verbindung unberührt.
Nur Dokumentation; Markdown, lokale Links und Unterschiedskontrolle erfolgreich
geprüft. Keine Anwendungstests erforderlich. Danach Stopp.
