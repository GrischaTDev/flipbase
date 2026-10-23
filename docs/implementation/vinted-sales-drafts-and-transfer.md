# Vinted-Verkaufskarten, Anbieterentwürfe und Datenübernahme

## Auftrag

Verkaufskarten verwenden Bild, Abstände und einzeilige Titel des Kleiderschranks. Status steht neben Marke/Größe, Versand unten links und ein kompakter Chatlink rechts. Verkaufsdatum und Paket-/Stornohinweise bleiben zugänglich. Den echten Kauf-/Stornotest hat der Nutzer zurückgestellt.

Der frische Verkauf ohne Preis wird anhand seiner gebundenen Anbietertransaktion untersucht. Frühere Angebote und Inseratpreise sind kein Kaufpreisbeleg. Native Vinted-Entwürfe erscheinen getrennt von lokalen Entwürfen unter Entwürfe, ohne Altersangabe. Ihre vorhandene Bearbeitungsmaske speichert ausschließlich über den eindeutig benannten Speichern-Knopf.

Datenübernahme öffnet einen gemeinsamen Dialog in beiden Entwurfseditoren. Quelle ist ein sichtbares Inserat, ein Anbieterentwurf oder ein lokaler Entwurf desselben Arbeitsbereichs. Suche und Nachladen begrenzen die Auswahl. Nur ausdrücklich gewählte Felder werden in das bestehende Formular übernommen; Konto, Entwurfskennung und Speichern bleiben unberührt. Kategorieabhängige Angaben werden nur bei passender Kategorie übernommen. Der Dialog übernimmt die angebotenen Text-/Auswahlfelder; bestehende Bilder bleiben erhalten. Das wird im Dialog erklärt. Ein eigener Fotokopierweg gehört nicht zu dieser Umsetzung.

## Arbeitsschritte

1. Preisursache mit rein lesenden Anbieterbelegen klären und Regression ergänzen; Metadaten aus dem gebundenen Chat erhalten.
2. Verkaufskarten angleichen und lange Titel/Bedienung testen.
3. Anbieterentwürfe über eine paginierte, berechtigte Leseschnittstelle anzeigen; aus Kleiderschrank und dessen Zählern ausschließen. Schemaänderung samt generierter Migration und Typen prüfen.
4. Feldweise Datenübernahme mit Quellvorschau und Schutz vor verspäteten Antworten ergänzen; beide Editoren anbinden.
5. Betroffene bestehende Modell-, Dienst-, Komponenten-, Worker-, SQL- und Browserfälle ausführen; Format, Lint, Typen, Build und Testauswahl prüfen. Unabhängiger Abschlussreview.

## Prüfgrenzen

Keine echten Käufe, Stornierungen oder Anbieteränderungen während der Entwicklung. Allgemeines Relisting und Warenbestandsverknüpfung bleiben Folgeaufträge. Veröffentlichung erst nach abgeschlossener lokaler Prüfung und passender Nutzerfreigabe.

## Umgesetztes Verhalten

- Verkaufskarten entsprechen dem Kleiderschrank; Zusatzinformationen sind außerhalb der eigentlichen Karte aufklappbar. Lange Titel bleiben einzeilig. Native Entwürfe stehen ausschließlich im eigenen Entwurfsabschnitt und ihren Detailansichten, ohne Altersanzeige.
- Bestätigte Verkäufe lesen `offer_price` zusätzlich zur bisherigen Preisstruktur. Frühere Preisangebote oder Inseratpreise bleiben ausgeschlossen. Verkaufscaches der Version 1 werden erneut gelesen; Version 2 kann weiterhin wiederverwendet werden. Verkürzte Chatantworten erhalten bekannte Artikelzuordnungen. Eindeutige Einzelartikelmerkmale bleiben über Folgeimporte erhalten.
- Datenübernahme verändert nur ausdrücklich gewählte Formularfelder und speichert nicht selbst. Kategorieänderungen in lokalen Entwürfen leeren ungültige abhängige Kennungen. Native Zielmasken behalten ihre Kategorie und akzeptieren ausschließlich gültige Zieloptionen. Unvollständige native Masken bieten nur die drei tatsächlich gelesenen Grundfelder an. Eurozeichen, Leerzeichen und gültige Tausendertrennung werden beim Anbieterpreis normalisiert; leere Preise bleiben leer.
- Quelllisten und Vorschauen sind an Benutzer, Arbeitsbereich und Kontozuordnung gebunden. Ein Wechsel verwirft alte Antworten. Nachträgliche Formularfehler schließen den Übernahmedialog nicht.

## Datenbanknachweis

Die deklarative Sicht schließt Vinted-Publikationen im Zustand `draft` aus. Der eigene Entwurfsabschnitt liest berechtigt aus derselben Basistabelle; andere Plattformen und deren Sichtbarkeit bleiben erhalten. Die bestehende Verkaufsfunktion ergänzt beziehungsweise bewahrt Marke/Größe nur bei einer eindeutigen Artikelzuordnung.

Die neue Migration wurde mit dem offiziellen Supabase-pg-delta zwischen isolierten Katalogen erzeugt. Frischer Replay und Ziel liefern identische Funktions- und Sichtdefinitionen; die Sicht behält `security_invoker`. Keine historische Migration verändert. Der offizielle Typgenerator ergibt keine fachliche Änderung; die vorhandene gezielte `NonNullable<Json>`-Einschränkung bleibt bestehen. Alle 128 SQL-Dateien mit 4.724 Assertions bestehen auf dem frischen Replay.

## Prüfstand

Vollständige Anwendungssuite: 545 Dateien/5.792 Tests. Anschließend betroffene Angular-Dateien erneut geprüft (117 Fälle); abschließende Preisregressionen in Dienst/Detail (23 Fälle) und bestehendem Bearbeitungsmodell (16 Fälle) erfolgreich. Vollständiger Worker: 713 bestanden, acht bestehende Auslassungen. Anwendung und Worker typgeprüft. 75 Auswahl-, echte Playwright-Registrierungs-, Migrations- und Rechteprüfungen erfolgreich. Suite-Audit: 545 Dateien, 232 Node-/48 DOM-/265 Angular-Dateien; Shared-UI: 248 Dateien ohne Befund.

Die tatsächliche CI-Auswahl ist wegen Schema und Auswahlscript umfassend: 232 Node-, 48 DOM-, 265 Angular-Dateien, 58 reguläre und vier direkt geänderte Browserdateien sowie PWA. Auswahlhash: `48dbea49c221c92b496d607d3570c4f45ab260c343877a7f70fb0dbd2df2f789`. Der Linux-/PWA-Pflichtlauf folgt im PR; lokale Windows-Prüfungen werden nicht als dessen Ersatz ausgegeben.

Die gespeicherten Daten des frischen Verkaufs enthalten den Kaufbeleg, aber keinen bereits übernommenen Kaufpreis. Frühere Chatangebote werden nicht als Kaufpreis ausgegeben. Die zusätzliche bestätigte Transaktionsstruktur ist mit Regressionen abgesichert; der konkrete aktuelle Anbieterabruf dieses Verkaufs bleibt nach Bereitstellung zu prüfen. Kein echter Kauf-/Storno-/Wiederaufnahmeversuch in diesem Auftrag.

## Lokaler Abschluss

Alle 87 Fälle der fünf betroffenen Browserdateien sind erfolgreich abgedeckt: 21 Marktplatzübersicht, 37 Entwurfsverwaltung, 19 Artikelgrenzfälle, vier Verkäufe und sechs Vinted-Arbeitsbereich. Die Tests liefen gegen eine ruhende Entwicklungsvorschau. Nach Korrektur der alten Testmasken für den nun ausgeschlossenen Entwurfsartikel und die zusätzliche Entwurfsabfrage wurden die betroffenen Dateien vollständig erneut ausgeführt. Die vier lokalen Datenübernahmevarianten liefen nach ergänzter tatsächlicher Farbschemaprüfung nochmals erfolgreich. Die native Übernahme prüft das Farbschema ebenfalls ausdrücklich. Touch, Tastatur, Fokus, AXE, lange Titel und Konto-/Arbeitsbereichswechsel sind enthalten.

Verkaufskarten, nativer Entwurf und Datenübernahmedialog wurden mobil und am Desktop visuell gelesen. Anschließend separater Produktionsbau erfolgreich; 277 App-Dateien in der PWA-Ausgabe geprüft. Der Bau meldet Budget-/CommonJS-Hinweise, keine Fehler. Abschließende Formatprüfung, gezieltes ESLint, Anwendungstypen und `git diff --check` erfolgreich. `origin/master` erneut abgerufen und unverändert bei `8281c9d187821b6cf98eb1ffe8c8e637e79a581b`. Die bereits erteilte Freigabe umfasst PR und Merge nach grünen Pflichtprüfungen; der reale Kontotest bleibt zurückgestellt.
