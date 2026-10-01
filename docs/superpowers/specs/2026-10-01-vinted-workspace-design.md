# Vinted: kompakte Kontoansicht

Stand: 01.10.2026. Geprüfte Grundlage: `origin/master` bei `f1c9e623`.
Designentwurf nach Nutzerauftrag und drei unabhängigen, lesenden Agentenprüfungen.
Die Navigation ist ausdrücklich bestätigt; die übrige Gestaltung ist eine
konkrete Empfehlung zur gemeinsamen Prüfung. Produktcode wurde nicht geändert.

## Ziel und bestätigte Entscheidungen

Die Vinted-Ansicht soll alltägliche Arbeit mit Nachrichten, Inseraten und Verkäufen
ermöglichen. Große Erklärblöcke und Anmeldeaktionen im Hauptkopf entfallen.
Kontowechsel, manuelle Aktualisierung und Einstellungen bleiben schnell erreichbar.
Die Darstellung folgt den vorhandenen Flipbase-Bausteinen in beiden Themes.

Bestätigte Reihenfolge: **Übersicht → Nachrichten → Inserate → Verkäufe →
Aktivitäten → Profil**. Bewertungen stehen im Profil. Die Anmeldung gehört in
die Kontoeinstellungen; erforderliche Anmeldung bleibt als handlungsfähiger
Hinweis sichtbar. Das helle Markengelb `#fcc601` bleibt erhalten.

## Empfohlenes Layout

```text
Vinted        [Konto auswählen ▾]                     [Aktualisieren] [Einstellungen]
              Zuletzt aktualisiert: heute, 14:35

[Übersicht] [Nachrichten] [Inserate] [Verkäufe] [Aktivitäten] [Profil]

Inhalt des ausgewählten Bereichs
```

„Aktualisieren“ und „Einstellungen“ sind kompakte Iconaktionen mit Tooltip,
zugänglichem Namen und Ladezustand. Im normalen Zustand genügt eine kurze Angabe
zur letzten erfolgreichen Datenübernahme. Der extra Kontokasten, die permanente
Automatik-Karte und der allgemeine Seitensubtitel entfallen. Auf kleinen Geräten
bricht nur die Kontosteuerung sinnvoll um; die Bereichsnavigation scrollt innerhalb
ihres eigenen Rahmens. Die ganze Seite erhält keinen horizontalen Überlauf.

Das Einstellungsmodal bündelt Abrufabstand, Automatik pausieren/fortsetzen,
Anmeldung und vorhandene Kontenverwaltung. Nächster geplanter Abruf, letzter
Versuch und technische Details stehen in einem geschlossenen Detailabschnitt.
Keine zusätzliche neue Kontenverwaltung oder neue Einstellungsseite erforderlich.

Notwendige Eingriffe bleiben sichtbar: Anmeldung erforderlich, Konto gesperrt,
Kontoverbindung pausiert, Automatik bewusst pausiert oder Aktualisierung fehlgeschlagen.
Eine bewusst pausierte Automatik genügt als kurze Statusangabe; Probleme erhalten
einen knappen Hinweis mit nächstem Schritt. Ein laufender Auftrag erhält einen
kompakten Status und Zugriff auf den vorhandenen Fortschrittsdialog. Angefordert,
laufend und erfolgreich bleiben unterscheidbar. Im aktuellen Abruf bekannte
Quellenwarnungen bleiben im Fortschrittsdialog erreichbar. Eine dauerhafte
Warnungshistorie wird hier nicht als bereits verfügbare Snapshotfunktion behauptet.

**Wichtig:** Zeitplanprüfung, automatische Erstaktivierung und Nachladen nach
Hintergrundimport bleiben im Workspace aktiv, auch wenn die Einstellungen geschlossen
sind. Der bisherige Controller darf nicht nur innerhalb des geöffneten Modals leben.

## Navigation, Aktivitäten und Profil

`RouteTabsComponent` ersetzt die derzeitige unterstrichene `SectionNavigationComponent`.
Aktiv ist eine gelbe Fläche mit dunkler Schrift, ohne zusätzliche Unterstreichung.
Die Inseratdetailroute markiert „Inserate“. Anmelderouten markieren keinen falschen
Inhaltsbereich. Bestehende Direktlinks und Browser-Zurück bleiben nutzbar.

Die bereits vorhandene Aktivitätenroute wird sichtbar eingebunden. Sie zeigt
gespeicherte Vinted-Ereignisse. Der alte Kopfbutton mit Gesamtzahl entfällt.
Ein technisches Browser-/Importprotokoll ist eine andere Datenquelle und gehört
in diesem Umbau nicht als angeblich bereits verfügbares Aktivitäten-Log dazu.

Das Profil enthält Identität, Beschreibung und Bewertungen. Alte `/feedback`-Links
führen zum Bewertungsabschnitt des Profils; nicht bloß zur Profiloberkante.
Profilbearbeitung und Bewertungsladen behalten ihre heutigen Schutzregeln.

## Übersicht mit alltäglichem Nutzen

Drei kleine Kennzahlen zeigen die Gesamtzahlen gespeicherter Inserate, Gespräche
und gespeicherter Verkäufe. Dazu kommen maximal drei letzte Gespräche und drei
letzte gespeicherte Verkäufe mit direktem Weg zum passenden Bereich. Eine kompakte
Profilidentität mit Bewertung ergänzt den Überblick; die große Profilkarte entfällt.

Die Vorschauen werden aus dem vorhandenen Snapshot gebildet, chronologisch anhand
bekannter Zeitpunkte sortiert; fehlende Zeiten bleiben unbekannt und stehen hinten.
Gesprächslinks wählen das passende gespeicherte Gespräch aus, ohne Vinted zu öffnen.
Ist ein Eintrag inzwischen nicht verfügbar, bleibt die normale Bereichsansicht
mit verständlichem Hinweis nutzbar. Keine blinden Vorauswahlen aus fremden Konten.

Snapshot-Seiten enthalten höchstens 50 Einträge. Gesamtzahlen stammen ausschließlich
aus `total`; berechnete Summen aus geladenen Teilseiten werden nicht als Kontogesamtzahl
ausgegeben. Kein erfundener Umsatz, Gewinn, vollständiger Ungelesen-Zähler oder
Angebotszähler. Importierte Verkäufe sind keine gebuchten Flipbase-Verkäufe.

## Inserate und kompakte Detailansicht

Inserate behalten das vorhandene Raster. Titel, Preis und Kennzahlen bilden eine
kurze klar lesbare Zusammenfassung. Auge und Herz stehen mit ihrer Zahl in neutralen
Shared-Badges. Das Herz ist eine Kennzahl, keine Favorisieren-Aktion. Ein unbekannter
Wert bleibt `—`, ein bekannter Nullwert `0`; Symbole sind dekorativ, die Bedeutung
bleibt auch für Screenreader vorhanden.

Die Detailansicht bekommt eine begrenzte Fotospalte links und Angaben rechts.
Eine zusätzliche Shared-Bildvariante zeigt das gesamte Foto mit `object-contain`.
Der bestehende Rastermodus `listing` bleibt unverändert. Bildausfall und Nachladen
dürfen die Galeriegröße nicht springen lassen. Kleine auswählbare Fotos behalten
Tastaturbedienung, Fokus und ausreichend große Touchflächen.

Vorläufige Flipbase-Layoutwerte, keine gemessenen Shopify-Originalwerte:

- Detailbild: höchstens 360 px breit und 420 px hoch auf Desktop.
- Mobil: höchstens 260 px Bildhöhe; Angaben beginnen direkt danach.
- Abnahme bei 1440 × 900: Titel, Preis, wichtigste Angaben und Beschreibungsanfang
  sind sichtbar, ohne zuerst an einem bildschirmhohen Foto vorbeizuscrollen.

## Beschreibung sofort zeigen und gezielt laden

Ein dauerhafter Beschreibungs-Cache existiert bereits. Der Umbau baut darauf auf:

1. Vorhandene Inseratdaten aus dem ausgewählten Snapshot sofort darstellen;
   fehlt der Eintrag, die gespeicherte Datenbankversion lesen.
2. `textState: loaded` sofort anzeigen. Leerer geladener Text bedeutet
   „Keine Beschreibung vorhanden“, ohne erneuten Browserstart.
3. Fehlenden Text einmal für das geöffnete Inserat lesen. Gleichzeitige gleiche
   Anfragen zusammenführen und das Ergebnis im kontogebundenen Store halten.
4. Bei einem Lesefehler bleiben Titel, Bild und Preis sichtbar. Nur der
   Beschreibungsbereich bietet eine kleine Aktion „Erneut versuchen“.
5. Die bestehende Antwort `cache: pending` erhalten. Die aktuelle Anzeige darf
   erfolgreichen gelesenen Text benutzen, aber keine bestätigte dauerhafte
   Speicherung behaupten. Keine automatische Endlosschleife bei Speicherfehlern.
6. Beim Bearbeiten weiterhin aktuelle Vinted-Formfelder lesen. Ein alter
   Anzeige-Cache ersetzt keine aktuelle Prüfung vor einer Schreibaktion.

Keine Browserabfrage für jedes Inserat im Raster, für Hover oder als zusätzliche
Aufgabe jeder automatischen Kontoaktualisierung. Ein Sitzungscache enthält keine
Tokens und gilt ausschließlich für Nutzer, Workspace, Konto und Inserat.
Konto-/Workspacewechsel, Logout, Rechteverlust und Entfernen verwerfen alte Ergebnisse.
Wechsel zwischen zwei Detailrouten funktioniert auch bei wiederverwendeter Komponente.

Der Cache hat heute keine verlässliche Beschreibungsfrische; Listen- und
Kennzahlenzeitpunkte beweisen sie nicht. Daher im ersten Paket keine Behauptung
„Beschreibung aktuell“ und keine neue Aktion „Beschreibung aktualisieren“ für
bereits gespeicherten Text. Die bestehende Cache-RPC ersetzt geladenen Text bei
einer bloßen Leseaktion derzeit nicht dauerhaft.

## Nachrichten

Ein zusammenhängender Arbeitsbereich ersetzt die großen getrennten Blöcke:
Gesprächsliste links, Verlauf rechts. Die Liste erhält eine kompakte Shared-Dichte,
einzeilige Vorschau, Zeitangabe und eine verständliche Neu-Kennzeichnung.
Mobil wird entweder die Liste oder das Gespräch gezeigt, mit eindeutiger Zurückaktion.

Eingehende Nachrichten stehen links, ausgehende rechts, Systemmeldungen neutral
mittig. Preisangebote erscheinen als kurze Zusammenfassung, ohne eine noch nicht
vorhandene Annahme-/Sendeaktion anzudeuten. Themefähige Hintergrund- und Textfarben
werden gemeinsam gewählt; die festen Pastellflächen `#e9f6f6` entfallen.

Die produktive dunkle Angebotsansicht wurde lesend geprüft: auf `rgb(233,246,246)`
liegen Text `rgb(245,245,245)` und Datum `rgb(168,168,168)`. Die Agentenprüfung
berechnet dafür ungefähr 1,01:1 beziehungsweise 2,15:1. Die geringe Lesbarkeit
ist damit ein konkreter Farbfehler, nicht nur eine Geschmacksfrage.

Vorläufige Layoutwerte: Gesprächsliste 300 px auf Desktop, mindestens 44 px
Touchfläche, 8 px zwischen Nachrichten und 8 px vertikales Innenpadding.
Normale Texte mindestens 13 px, ergänzende Angaben mindestens 12 px.
Texte einschließlich Zeitangaben erfüllen mindestens 4,5:1 in beiden Themes.

Beim Öffnen liegt der Fokus sinnvoll im Gespräch; Zurück bringt ihn zum
ausgewählten Listeneintrag. Hintergrundaktualisierung erhält Gespräch, Fokus und
Leseposition. Ältere Nachrichten nachladen verschiebt nicht den gerade gelesenen
Inhalt. Sehr lange Texte, URLs und unbekannte Nachrichtentypen bleiben lesbar.

Das Öffnen liest ausschließlich bereits gespeicherte Nachrichten. Ungelesene
Vinted-Verläufe werden nicht heimlich nachgeladen oder als gelesen markiert.
Ein bewusst nicht importierter Verlauf erhält einen konkreten Hinweis statt
einer irreführenden leeren Unterhaltung. Senden ist aktuell nicht implementiert;
ein aktives Eingabefeld ist nicht Bestandteil des optischen Umbaus.

## Abwägung und Umfang

Empfehlung: kompakter Kopf plus vorhandenes Einstellungsmodal. Ein Drawer wäre
für wenige Einstellungen schwerer und würde mobil fast die ganze Ansicht belegen.
Eine eigene Einstellungsseite wäre erst für umfangreiche spätere Kontoeinstellungen
sinnvoll; heute würde sie kleine Anpassungen unnötig unterbrechen.

Dieser Umbau ändert zunächst weder Betreiber-/Workspaceberechtigungen noch
Zeitplanintervall oder Anbieteraktionen. Aktuell bleiben Plattformbetreiberrechte
und Adminrechte im aktiven Workspace erforderlich. „Normaler Nutzer“ beschreibt
hier verständliche Bedienung; es ist keine zusätzliche Rechtefreigabe.

Getrennte Ereignisbenachrichtigungen, Nachrichtenversand, Angebotsannahme und
automatische Verkaufsbuchung bleiben eigene Vorhaben. Ein späterer Ausbau der
Beschreibungsfrische braucht einen wirklichen Beobachtungszeitpunkt
`body.textCheckedAt`, Schutz vor verspäteten Rückläufen und eine generierte
SQL-Migration für Cache-RPC/Erhaltungstrigger; keine neue Cache-Tabelle.

## Gestaltung und Abnahme

Verbindliche Quellen im Projekt: `docs/design/admin-ui-guidelines.md` und
`docs/design/shopify-admin-live-reference.md`. Vorhandene Shared-Bausteine für
Seitenkopf, Navigation, Buttons, Auswahl, Badges, Karten und Modal weiterverwenden.
Normale Groß-/Kleinschreibung; keine dekorative Versalschrift, Parallelpalette oder
neue globale Geometrie für vorhandene Rasterbilder und Listenzeilen.

Prüfen: hell/dunkel; Desktop 1440 × 900, Mobil 390 und 320 px; 200 % Zoom;
Tastatur, Touch, Fokus, reduzierte Bewegung und AXE. Dazu echte Zustandsfälle:
leere/fehlende Daten, Teilabruf, Fehler, Pause, laufender Auftrag, Konto-/Workspacewechsel
während Laden, alte Direktlinks, offenes Gespräch beim Hintergrundreload,
bekannte/leere/fehlende Beschreibung sowie nicht bestätigte Bearbeitung.
