# Vinted nach Kleinanzeigen

Ein eigenes Vinted-Inserat kann aus der Marktplatzübersicht, dem Kleiderschrank oder der Detailansicht als Kleinanzeigen-Fassung vorbereitet werden. Der Weg unterstützt zunächst einen Artikel und einen privaten Zielaccount mit ausdrücklich erteilter Veröffentlichungsfreigabe.

## Ablauf

- Vollständige Quelltexte und Originalbilder werden übernommen. Zu lange Texte und Centbeträge bleiben zur bewussten Korrektur erhalten. Das Vinted-Original bleibt bestehen; ein Lagerartikel ist nicht erforderlich.
- Der Nutzer wählt Zielkonto, Kategorie und die tatsächlich angebotenen Kleinanzeigen-Felder. Die native Kategorie wird beim Formularlesen und unmittelbar vor dem Abschicken mit der bestätigten Auswahl verglichen.
- Die Zielfassung liegt im bisherigen Listing Studio. Nach vollständiger Bildübernahme kann ein dauerhafter, an Konto, Freigabegeneration und Entwurfsrevision gebundener Auftrag angelegt werden.
- Der offizielle 30-Tage-Zähler, bestehende Reservierungen und das aktuelle Formular entscheiden, ob der kostenlose Weg zulässig ist. Bei erschöpftem Kontingent, Gebühren oder unbekannten Kosten wird vor dem verbindlichen Klick gestoppt.
- Erst ein bestätigter aktiver Zieleintrag mit passender Kontoidentität und Ziel-ID gilt als veröffentlicht. Verarbeitung und unbekannter Ausgang bleiben sichtbar. Ein unbekannter Ausgang erlaubt ausschließlich einen lesenden Abgleich.

## Prüfstand

Die vollständige Projektprüfung wurde nach den Reviewkorrekturen erneut erfolgreich ausgeführt: Format, ESLint, Typprüfung, 502 erfolgreiche Workflowtests mit sechs bestehenden Windows-Ausnahmen, 402 Deno-, 2.528 Modell-, 347 DOM-, 2.555 Angular- und 45 Landingpagefälle sowie Produktionsbau. Alle 95 betroffenen Browserfälle einschließlich 320/390/834/1440 Pixel, Hell/Dunkel, Touch, Tastatur, Fokus und AXE sowie zwei bestehende Listing-Studio-Fälle bestehen auf dem integrierten Oberflächenstand. Der bestehende Worker wurde mit 88 betroffenen Fällen und Typprüfung geprüft.

Alle zehn automatisch erzeugten Transfermigrationen einschließlich der Korrekturmigration wurden zusammen mit dem aktuellen Hauptzweig vollständig auf einer eigenen Datenbank eingespielt. 361 SQL-Prüfungen, echte parallele Sitzungen und die verlustfreie Übertragung großer Kontokennungen über PostgREST bestehen. Die Supabase-Typen wurden aus dem Replay erneut erzeugt.

Die tatsächliche Erweiterung läuft in isolierten Chromium-Profilen unter Windows und Linux mit dem CI-Browser. Die neun Veröffentlichungsszenarien prüfen einen letzten freien Platz, 100/101 Anzeigen, Gebühren trotz Restkontingent, unbekannte Kosten, extern verbrauchtes Kontingent, veränderte Bilddaten sowie eine abweichende oder nachträglich geänderte native Kategorie. Worker- und Browserneustart setzen einen gespeicherten begonnenen Versuch ausschließlich lesend fort. Anbieterantworten bleiben in diesen Prüfungen synthetisch und lokal.

## Abschlussreview und Korrekturen

Der einmalige unabhängige Gesamtvergleich fand vier Verhaltensfehler. Alle vier wurden zuerst durch fehlschlagende Regressionen belegt:

1. Der letzte Freigabecheck akzeptierte einen bereits begonnenen Auftrag nicht. Er prüft nun denselben ursprünglichen Versuch innerhalb seiner Gültigkeitsfristen, ohne Lease-Verlängerung oder neue Schreibfreigabe. Ein neuer Test verbindet den tatsächlichen Erweiterungscontroller direkt mit PostgreSQL: regulär genau ein Submit; bei Widerruf oder Kontowechsel nach begin kein Submit.
2. Ein zweiter einseitiger Abgleich konnte den alten Listentab wiederverwenden. Ein neuer Run lädt den eigenen Anbietertab frisch. Bereits gespeicherte ausstehende Seiten und verlorene Abschlussantworten werden weiterhin unverändert wiederholt.
3. Bei erneuter Kontoverbindung blieben alter Kontaktname und Kontotyp gespeichert. Bestätigte Metadaten werden nun atomar aktualisiert; eine fremde aktive Installation bleibt geschützt. SQL, Handler und Erweiterung prüfen den neuen Namen konsistent.
4. Eine geänderte native Kleidungsart blieb außerhalb des Formularvergleichs. Beobachteter Kategorienpfad, sichtbare Art und zugehöriger DOM-Wert werden jetzt beim Schema und vor dem Klick geprüft. Abweichungen stoppen auch im tatsächlichen MV3-Lauf.

Zusätzlicher kleiner Befund, zurückgestellt: Ein durchgehender Browsertest ohne Lagerzuordnung vom Dialog über den vollständigen Editor, Bildumsortierung, Speichern und Wiederöffnen bis zum Auftrag fehlt. Service-, Editor-, Bildspeicher- und unveränderliche Auftragsaufnahme sind separat geprüft; ein konkreter Funktionsfehler ist hierfür nicht belegt.

## Entscheidungen und Grenzen

- Die noch fehlende Kleinanzeigen-Kontobindung aus Plan B gehört als notwendige Voraussetzung in denselben Zweig. Dadurch ist der PR größer; der Transfer erhält eine geprüfte Zielidentität.
- Der Schemaabgleich wurde auf die neuen deklarativen Dateien gegen die Migrationsbasis begrenzt. Bereits bestehender fremder Schema-Drift wird nicht übernommen. Der alte Gesamtbestand wird dadurch nicht neu bereinigt.
- Das bestehende Serververfahren für Edge Functions bleibt erhalten. Die App-Pipeline verteilt diese Endpunkte nicht automatisch; vor dem Pilot müssen neue Kleinanzeigen-Routen, der geänderte lokale Vinted-Endpoint und gemeinsame Verträge gesondert bereitgestellt werden. Einzelheiten stehen in der Erweiterungsanleitung. Ein App-Release allein genügt nicht.
- Es wurde kein echter Anbieter-Upload, Entwurf oder Inserat mit diesem neuen Weg erstellt. Ein konkreter Artikel muss vor einer echten Veröffentlichung ausdrücklich ausgewählt und freigegeben werden. Bildvorschau, Erfolgsnavigation und Anbieterannahme bleiben bis dahin ohne Live-Abnahme. Die Gebührenfreiheit wird aus offiziellem Privatkontingent und abgewählten Extras abgeleitet; ein sichtbarer Null-Gesamtpreis wird nicht behauptet.
- Relisting, Bulk und eBay-Erstellung folgen separat. Dieser Stand ermöglicht einen einzelnen Vinted-zu-Kleinanzeigen-Transfer.
