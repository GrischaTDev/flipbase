# Vinted-Inserate erstellen, planen und bearbeiten

**Stand:** 09.10.2026. Umsetzung durch „dann los“ freigegeben. Die Planung
beruhte auf `8d66d3d3`; die Umsetzung beginnt auf `origin/master` bei `638b2ace`,
einschließlich PR #356 und #357. Der fremde PR-Zweig und der ältere lokale
Arbeitsplatz bleiben unverändert. Der
[Anbieter- und Umsetzungsbericht](../../research/2026-10-09-vinted-listing-provider-contract.md)
unterscheidet die fertige Entwurfsgrundlage von noch offenen Anbieteraktionen.

**Ziel:** Du kannst in Flipbase ein Vinted-Inserat mit Fotos vorbereiten, als
Entwurf behalten, sofort oder zu einem Termin veröffentlichen und später mit
demselben Editor bearbeiten. Vorlagen erleichtern wiederkehrende Erfassungen.
Manuelles erneutes Einstellen folgt als eigenes, ausdrücklich sichtbares Paket.

## Recherche und vorhandene Grundlage

Am 09.10.2026 live geprüft: Bleam-Publish, Zusatzmenü, Terminplanung,
Entwurfsdialog, Vorlagenverwaltung, Kleiderschrank, Inseratdetails, Relist-Dialog
und Archiv. Keine Eingaben gespeichert, Fotos hochgeladen, Einstellungen
geändert oder Inserate veröffentlicht, bearbeitet oder gelöscht. Zum Schluss
die ursprüngliche Publish-Seite wieder geöffnet.

- Publish zeigt Zielkonto, Fotos, Titel, Beschreibung, Kategorie, Preis,
  Paketgröße und optionale Einkaufsverknüpfung. Fotos können per Ziehen oder
  Dateiauswahl hinzugefügt werden; die Oberfläche nennt auch Einfügen und HEIC.
- Der Bleam-Entwurf ist eine eigene gespeicherte Vorbereitung. Das Zusatzmenü
  bietet separat einen echten Vinted-Entwurf und geplante Veröffentlichung.
  Die [Publish-Hilfe](https://bleam.app/en/help/publier-depuis-bleam) beschreibt
  automatisches Speichern und wartende Aufträge bei fehlender Erweiterung.
- Die Terminmaske enthält Datum/Uhrzeit, Schnelltermine und eine Option,
  zum Termin einen Vinted-Entwurf anzulegen. Kein Auftrag wurde bestätigt.
- Eigene Entwürfe und Vorlagen waren leer. Wiederöffnung eines gespeicherten
  Entwurfs und Vorlagenanwendung wurden daher nicht praktisch geprüft.
- Der Inserat-Drawer zeigt Preisänderung, Sicherung auffrischen, Relist,
  Vinted-Link und Löschen. In den geprüften Ansichten wurde kein vollständiger
  Live-Editor für Titel, Kategorie, Merkmale und Fotos gefunden. Das belegt
  nicht, dass ein solcher Weg im gesamten Produkt ausgeschlossen ist.
- Die [Kleiderschrank-Hilfe](https://bleam.app/en/help/dressing) ordnet Backups
  aktiver Inserate dem Kartenraster zu; Sicherungen nicht mehr angebotener
  Inserate erscheinen im Archiv. Dies stimmt mit dem live gesehenen Leertext
  im Archiv überein.
- Die [Vorlagen-Hilfe](https://bleam.app/en/help/templates-annonces) beschreibt
  auswählbare Felder und Platzhalter; Fotos bleiben bei der Anwendung erhalten.
  [Sicherung und Transfer](https://bleam.app/en/help/sauvegardes-transfert) und
  [Relist](https://bleam.app/en/help/republier-annonce) sind getrennte Abläufe.

Die frühere Recherche enthält bereits einen genaueren statischen
[Publish-Abgleich, Abschnitt 38](../../research/bleam-vinted-analysis.md).
Anbieterangaben und alte Codebeobachtungen sind keine neuen Live-Nachweise.

Flipbase besitzt bereits:

- Vinted-Kontoauswahl, lokale Erweiterung, Cloud-Ausführung und einen Verlauf;
- Vinted-Inseratdetails und begrenzte Cloud-Bearbeitung von Titel, Beschreibung
  und Preis in `vinted-listing-detail` / `vinted-browser-listing-edit.ts`;
- einen gespeicherten Kategoriebaum in `public.vinted_categories`;
- einen Inserat-Bildeditor mit Drag-and-drop, Touch-Sortierung, Titelbild und
  zugänglichen Verschiebeaktionen im bisherigen Kleinanzeigen-Feature;
- einen Kleinanzeigen-Inseratbereich. Dessen Tabelle `listings` und
  `ListingTemplateService` sind ausdrücklich auf Kleinanzeigen begrenzt;
  Letzterer erzeugt Texte und ist keine Verwaltung gespeicherter Vinted-Vorlagen;
- kontogebundene Nachrichtenaufträge mit Freigabe, Version, Ausführersperre und
  Versandbeleg. PR #356 erweitert dieses Muster für Verhandlungen. Diese
  Infrastruktur wiederverwenden, Inserate jedoch fachlich getrennt führen.

## Bedienung und Gestaltung

Empfehlung: vollständige Erfassungsseite plus schnelle Detailansicht rechts.
Ein ausschließlich im Drawer arbeitender Editor würde Kategorien, viele Fotos
und Terminplanung auf engem Raum zusammendrängen. Ein Schrittassistent wäre
möglich, erschwert aber das schnelle Wechseln zwischen Bildern und Text.

Die Vinted-Inseratseite erhält die Ansichten **Online**, **Entwürfe** und
**Geplant**, außerdem den Button **Inserat erstellen**. Vorlagen sind über den
Editor erreichbar. Der bestehende Verlauf nimmt alle Ausführungsergebnisse auf.
Kleinanzeigen bleibt als bestehender Marktplatzbereich erhalten.

Der Editor verwendet den gemeinsamen Seitenkopf mit Zielkonto, Speicherstatus
und Aktionen. Breite Hauptspalte: Bilder, Titel, Beschreibung, Kategorie und
Artikelmerkmale. Schmale Seitenspalte: Preis, Paketgröße, optionale
Artikelzuordnung und Veröffentlichung. Mobil werden die Karten untereinander
angeordnet. Kein zusätzlicher Hauptaktionsbutton mitten im Formular.

Sichtbare Aktionen: **Als Entwurf speichern**, **Veröffentlichen**, **Planen**,
**Als Vorlage speichern**; zusätzlich **Als Vinted-Entwurf anlegen**, falls
diese Option für die erste Version bestätigt wird. Eine sichtbare Vorschau
zeigt Titelbild, Titel, Preis und Vollständigkeit der notwendigen Angaben.

Ein Klick auf ein bestehendes Inserat öffnet die rechte Detailansicht mit
Fotos, Merkmalen, Status, Kennzahlen, Kontoname und letzten Aktionen.
**Bearbeiten** öffnet denselben vollständigen Editor. Direkte URLs zur
Detailseite bleiben funktionsfähig; mobil öffnet eine vollständige Detailseite.
Die Detailansicht wird aus einem gemeinsamen Shared-Rahmen aufgebaut und erhält
Fokusführung, Escape und die Rückkehr zum auslösenden Element.

Shared Components und `docs/design/admin-ui-guidelines.md` sind verbindlich:
Flipbase-Gelb `#fcc601`, zentrale Feld-/Button-/Badge-Gestaltung, Tailwind im
HTML, OnPush, Signals, Reactive Forms, externe Templates, Lazy-Routes.
Kein Anspruch auf gemessene Shopify-Maße durch die Bleam-Beobachtung.

## Entwürfe, Fotos, Merkmale und Vorlagen

Ein **Flipbase-Entwurf** darf unvollständig sein und benötigt keine laufende
Vinted-Sitzung. Erst die erste Eingabe oder Bildauswahl legt ihn an; ein leerer
Seitenbesuch erzeugt keinen Datensatz. Speichern nach kurzer Eingabepause,
sichtbar als „Wird gespeichert“, „Gespeichert“ oder „Speichern fehlgeschlagen“.
Versionsprüfung verhindert, dass ein alter Tab neuere Änderungen überschreibt.
Bei Fehlern bleibt die Eingabe erhalten; Navigation schützt ungesicherte Arbeit.
Neue Flipbase-Entwürfe lassen sich nach einem Ausfall auch an einem anderen PC
fortsetzen, sobald ihr Speicherstand bestätigt ist.

Kategorieabhängige Vinted-Felder: Marke, Größe, Zustand, Farben, Materialien,
Paketgröße und weitere tatsächlich erforderliche Angaben, etwa Maße oder ISBN.
Keine Kategorien, Merkmals-IDs oder Auswahlwerte erfinden. Der bestehende Baum
liefert die Navigation; er enthält noch keinen vollständigen Formularvertrag.
Pflichtfelder, Auswahlwerte und Grenzen müssen zuerst am aktuellen
Vinted-Formular beziehungsweise aus bestätigten Anbieterantworten geprüft werden.
Bleams 100/2000 Zeichen sind beobachtete Werte, keine ungeprüfte Validierungsvorgabe.

Fotos: Dateiauswahl und Drag-and-drop, Uploadfortschritt pro Bild, Sortierung
mit Touch und Tastaturalternative, Titelbild an erster Stelle, Entfernen sowie
Zuschnitt/Drehen über vorhandene Bildwerkzeuge. Originale aufbewahren, bearbeitete
Versionen getrennt speichern. Speicherung und Versand müssen dasselbe Bild
verwenden. Uploadfehler dürfen weder Bilder verlieren noch Veröffentlichung
starten. Dauerhafte Storage-Pfade speichern; zeitlich begrenzte URLs erst zur
Ausführung erzeugen. Anzahl, Größe und Formate aus dem Anbieterabgleich festlegen.
JPG/PNG als erste geprüfte Formate; HEIC-Konvertierung nur als gesondertes,
geprüftes Folgepaket und mit verständlichem Hinweis bei fehlender Unterstützung.

Neue Inserate sind auch ohne Lagerartikel möglich. Eine optionale Verbindung
zu Katalog oder Bestand übernimmt bekannte Werte und Fotos, führt aber keinen
zweiten Artikelstamm ein. Einkaufskosten niemals als Verkaufspreis übernehmen;
fehlender Verkaufswert bleibt leer. Öffentliche Texte erhalten keine interne
SKU oder Einkaufsinformation ohne bewusste Entscheidung.

Vorlagen gehören zum Workspace und speichern ausdrücklich ausgewählte Felder,
Name und Textplatzhalter wie `{brand}` oder `{size}`. Sie speichern kein Zielkonto,
keinen Termin, keinen Ausführungsauftrag und standardmäßig keine Produktfotos.
Anwenden zeigt vorab die Änderungen; bestehende Angaben werden nicht unbemerkt
überschrieben. Fehlende Platzhalterwerte blockieren die Veröffentlichung und
werden am betroffenen Feld erklärt. Speichern, Anwenden, Bearbeiten und Löschen
von Vorlagen gehören zum ersten nutzbaren Editorpaket; Ordner folgen später.

## Veröffentlichung, Zeitplanung und Bearbeitung

Ein veröffentlichbares Inserat braucht vollständig bestätigte Pflichtfelder,
fertige Fotos und ein ausdrückliches Zielkonto. **Jetzt** und **zum Termin**
verwenden denselben dauerhaften Auftrag mit unveränderlicher Inhaltsrevision.
Nach Annahme heißt die Meldung „Veröffentlichung beauftragt“. Erst Anbieter-ID,
passendes Konto und überprüfter Ergebnisstatus ergeben „Veröffentlicht“.
Ein Vinted-Entwurf benötigt einen eigenen bestätigten Entwurfsbeleg.

Datum und Uhrzeit erscheinen mit Zeitzone, zunächst Europe/Berlin. UTC-Zeitpunkt
und IANA-Zeitzone speichern; doppelte oder nicht existierende Zeiten beim
Sommerzeitwechsel verständlich behandeln. Geplante Aufträge lassen sich vor
Ausführungsbeginn ändern oder abbrechen. Inhaltsänderung erfordert ausdrücklich
„Planung aktualisieren“ und ersetzt die alte Revision atomar.

Lokale Veröffentlichung benötigt zur Fälligkeit eine aktive Erweiterung und
die passende angemeldete Vinted-Sitzung. Cloud-Aufträge verwenden den gebundenen
Cloud-Ausführer. Eine Sitzung allein bestätigt keine Ausführungsbereitschaft.
Kein spontaner Wechsel zwischen lokal und Cloud, keine parallele Ausführung.
Wartezustände zeigen Grund und ursprünglichen Termin.

**Vorgeschlagene Ausfallregel zur Abstimmung:** Im Planungsdialog kann zwischen
„Sobald wieder verfügbar veröffentlichen“ und „Nach 30 Minuten Verspätung
anhalten“ gewählt werden. Voreinstellung ist Anhalten, damit ein Abendtermin
nicht unbeabsichtigt am nächsten Morgen ausgeführt wird. Die 30 Minuten sind
eine Produktentscheidung, keine Vinted- oder Bleam-Vorgabe. Auch wartende Jobs
bleiben abbrechbar; ein begonnener Schreibversuch braucht zuerst Ergebnisabgleich.

Bearbeitung liest zunächst den aktuellen Anbieterstand. Lokale Änderungen
speichern nur die Arbeitskopie; erst **Änderungen bei Vinted speichern** löst
den Auftrag aus. Konflikte mit inzwischen extern bearbeiteten Inseraten zeigen
die Abweichungen. Fotos und alle bestätigten Kategorieangaben gehören zur
vollständigen Bearbeitung; nicht unterstützte Felder werden konkret benannt.
Verkaufte, gelöschte oder reservierte Artikel werden unmittelbar vor der Aktion
erneut geprüft und bei nicht erlaubter Änderung gesperrt.

Nach Verbindungsabbruch nach dem Absenden: **Ergebnis unklar**, keine blinde
Wiederholung. Ein eigener Abgleich versucht die externe ID und den Stand zu
bestätigen; ohne belastbaren Beleg bleibt manuelle Klärung nötig. Reiner
Titel-/Preisvergleich allein beweist keine eindeutige Neuanlage.

## Daten und Ausführung

Neue, getrennte Tabellen im `public`-Schema: `marketplace_listing_drafts`,
`marketplace_listing_images`, `marketplace_listing_templates` und
`marketplace_listing_jobs`. Neue interne IDs als `bigint generated always as
identity`; vorhandene Workspace-/Verbindungs-/Anbieter-IDs nicht umdeuten.
Drafts speichern Inhalt, Revision, optionalen Artikelbezug und Zielkonto; Jobs
speichern Aktion, feste Revision, Termin, Zeitzone, Ausfallregel, Ausführer,
Schreibbeginn und Ergebnisbeleg. Importierter Anbieterstatus und Auftragsstatus
bleiben getrennt. Neue Tabellen, Storage-Zugriff und RPCs erhalten RLS,
Workspace-/Kontoprüfung und Indizes auf Zugriffsspalten.

RPCs prüfen Rechte und Status erneut. Jobs verwenden die bestehenden
Kontosperren, Lease-/Epoch-Regeln, Widerrufe und begin/finish-Belege. Eine
abgelaufene Lease nach Schreibbeginn gibt niemals automatisch einen neuen
Veröffentlichungsversuch frei. Alte Erweiterungsversionen übernehmen keine
unbekannten Inserataufträge. UI-Komponenten führen keine Datenbankabfragen aus.
Statusupdates verwenden private Broadcast-Kanäle mit automatischem Cleanup.

## Manuelles erneutes Einstellen und spätere Erweiterungen

**Erneut einstellen** ist eine eigene Aktion mit vollständigem Daten-/Foto-Backup,
Vorschau und sichtbarer Erklärung des Umgangs mit dem bisherigen Inserat.
Vor Umsetzung Reihenfolge von Anlage und Entfernen am Anbieter prüfen. Ein
Teilfehler muss „alt entfernt, neu unbestätigt“ bzw. „neu vorhanden, alt noch
vorhanden“ nachvollziehbar zeigen. Dauerhaftes Backup darf dabei nicht verloren
gehen. Eigene Foto- oder Textverbesserungen bleiben bewusst ausgewählte Änderungen.

Kontotransfer, automatische Relist-Zyklen, Auto-Restock, Stapelveröffentlichung,
KI-Text-/Bildänderungen und automatische Vollsicherung gehören zu späteren
Paketen. Ihre Datenbasis wird vorbereitet, ihre Bedienung jetzt nicht gebaut.

## Abnahme

1. Entwurf mit mehreren Bildern anlegen, schließen und an anderem PC fortsetzen;
   Fotos und Reihenfolge bleiben erhalten, Fehler und Konflikte sind sichtbar.
2. Kategorie wechseln: nur gültige abhängige Angaben bleiben erhalten; Text,
   Fotos und Verkaufspreis verschwinden nicht unbeabsichtigt.
3. Vorlage mit vorhandenen Angaben anwenden, Vorschau prüfen und fehlende
   Platzhalter vor Veröffentlichung verständlich korrigieren.
4. Jetzt und zum Termin über lokal und Cloud testen: falsches Konto, fehlende
   Sitzung, Neustart, Widerruf und Doppelclick erzeugen kein falsches Inserat.
5. Anbieterbestätigung, unklarer Ausgang und Teilfehler getrennt prüfen. Ein
   angenommener Auftrag allein darf niemals als veröffentlicht erscheinen.
6. Vollständige Bearbeitung einschließlich Fotoänderung nach aktuellem Abruf;
   externer Konflikt, Verkauf und Konto-/Workspacewechsel sind abgesichert.
7. Desktop/Mobil, hell/dunkel, Tastatur, Fokus und AXE; Angular-Bau, gezielte
   Anwendungstests, SQL-/Storage-Rechte, Extension-/Workerregressionen.

**Umsetzungsentscheidung:** Die Freigabe „dann los“ wird als Zustimmung zum
vorgeschlagenen Umfang verstanden: beide Entwurfsarten und die beschriebene
Ausfallregel. Aktuelle Anbieterfelder, Grenzen und bestätigte Veröffentlichung
bleiben erforderliche Nachweise des ersten Pakets. Die derzeit fertige
Teilgrundlage speichert ausschließlich Flipbase-Entwürfe.
