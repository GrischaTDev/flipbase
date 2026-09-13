# Produkterstellung, Bildergalerie und Shop – Abschlussprüfung

Stand: 13. September 2026. Branch `codex/product-editor-storefront`,
Basis `origin/master` bei `5291bff`. Umsetzung des freigegebenen Folgeumfangs.

## Ergebnis für Nutzer

- „Artikel erstellen“ öffnet eine eigene Seite. Erstellung und Bearbeitung nutzen
  denselben Editor mit Beschreibung, Stammdaten und optionalen Shopangaben.
- Mehrere Bilder über Dateiauswahl oder Ablegen hinzufügen, zuschneiden, drehen,
  sortieren, als Hauptbild festlegen und entfernen. Die bestehende Bildbibliothek
  wird weiterverwendet, ohne neue Abhängigkeit.
- Artikel erscheinen nach Freigabe mit Preis und verfügbarem Bestand im Shop.
  Katalogartikel besitzen jetzt eine vollständige Detailseite mit Beschreibung
  und Galerie. Reservierungen werden berücksichtigt.
- Optionaler Suchmaschineneintrag mit Titel, Beschreibung und lesbarem URL-Teil.
  Die Shopseite setzt diese Angaben tatsächlich als Metadaten und Canonical.

## Bewusste Grenze

Der integrierte Shop ist laut bestehendem Routing absichtlich nur mit Anmeldung
erreichbar und verwendet eine Zahlungsdemo. Diese Freigabe wurde nicht geändert.
Produktseiten setzen `noindex, nofollow`; die Suchvorschau bereitet eine spätere
öffentliche Shopseite vor. Eine tatsächliche Google-Indexierung wurde weder
implementiert noch zugesagt. Steuerliche Modelländerungen gehören weiterhin zum
separaten Audit und sind nicht Teil dieses Bedienumbaus.

## Daten und Fehlerfälle

SEO-Felder sind nullable ergänzt. Die Migration wurde per Supabase-Diff erzeugt;
die Funktionsrechte wurden beim SQL-Review mit dem deklarativen Schema abgeglichen.
Beide finalen Funktionskörper stimmen zwischen Migration und Schema überein.
Typen wurden nach dem abschließenden lokalen Datenbank-Reset neu erzeugt.

Die Galerie wird je Produkt atomar gespeichert. Erwartete Bild-IDs erkennen
zwischenzeitliche Uploads/Löschungen. Ein Datenbanktest mit zwei gleichzeitigen
Verbindungen bestätigt die Produktsperre und Konfliktmeldung ohne Bildverlust.
Storage-Dateien werden erst nach bestätigter Metadatenänderung aufgeräumt.
Eine fehlgeschlagene Dateibereinigung macht den bereits gespeicherten Stand nicht
wieder ungespeichert. Zugriffe bleiben auf den jeweiligen Workspace begrenzt.

Erfolgreiche Neuanlagen und einzelne Uploads bleiben bei Teilfehlern bestätigt.
Wiederholen erzeugt keine zweite Anlage und lädt erfolgreiche Dateien nicht erneut
hoch. Workspacewechsel erhalten den ursprünglichen Entwurf. Neue Eingaben bleiben
während Speichern und Wechsel auf die angelegte Artikelseite gesperrt.

## Prüfung und Review

| Prüfung                  | Ergebnis                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Gezielte Anwendungstests | 152 erfolgreich: 60 Node, 54 Angular, 38 DOM                                        |
| Datenbank                | 173 SQL-Prüfungen, davon 24 neue; zusätzlicher Paralleltest erfolgreich             |
| Browser                  | 24 betroffene Fälle erfolgreich, einschließlich bestehender Einkaufsabläufe         |
| Responsive Darstellung   | 1440/390 px, vorhandene Artikelansichten hell/dunkel                                |
| Zugänglichkeit           | AXE/WCAG-AA auf Editor, Erstellungsseiten, Cropper und Shopdetail erfolgreich       |
| Statische Prüfung        | App-/Testtypen, gezieltes ESLint/Prettier, Shared-UI- und Testzuordnung erfolgreich |
| Produktionsbau           | Erfolgreich                                                                         |
| PR-Testauswahl           | Zwei neue Pflichtfälle; acht Tests der PR-/Nightly-Auswahl erfolgreich              |

Browserprüfung über vorhandenes Playwright: `Browser plugin not available`.
Lokale Anwendung unter `http://127.0.0.1:4218`, Chromium. Screenshots von Editor,
mobilem Cropper und Shopdetail visuell geprüft; keine horizontale Überbreite.
Neue Abläufe prüfen auch Browserfehler, Tastaturbedienung, erneutes Öffnen,
Hauptbildwechsel und tatsächlich gerenderte Metadaten.

Der unabhängige Review fand zwei P2-Befunde: private Bildadressen wurden zunächst
nicht reaktiv übernommen, und die Shopübersicht behielt das alte Hauptbild.
Beides behoben und mit Regressionstests abgesichert. Nachreview ohne weitere
belegbare P1/P2. Der Browser fand zusätzlich ein sehr kurzes Eingabefenster nach
Neuanlage sowie die fehlende ARIA-Rolle des Bibliotheks-Croppers; ebenfalls behoben
und erfolgreich nachgeprüft.

Nur eine isolierte lokale Supabase-Instanz wurde verwendet und danach gestoppt.
Produktionsdaten und der absichtlich geschützte Shopzugang wurden nicht verändert.
Firefox/WebKit sind für die vorhandene Nightly-Prüfung vorgesehen und wurden hier
nicht lokal ausgeführt. PR-Push und Veröffentlichung wurden anschließend vom Nutzer freigegeben;
der Merge erfolgt erst nach erfolgreichen Pflichtprüfungen.
