# Label-Leseransicht – Integrationsstand

## 07.10.2026 – Juna

Die Galerie und die Detailseite liegen als echte Angular-Komponenten mit externen
Vorlagen vor. Sie verwenden die vorhandenen Shared-Komponenten und den bestehenden
Supabase-Client. Ein seitenlokaler Signalzustand trennt Anfragen nach Nutzer,
Workspace und Suchauftrag. Eine neue Suche entfernt den alten Stand sofort; verspätete
Antworten dürfen ihn nicht wiederherstellen. Eine geänderte Katalogversion führt
beim Nachladen zur ersten Seite statt zu gemischten Ergebnissen.

Die Filter stehen in der URL. Der Rückweg von einem Label erhält Suchtext,
Marke, Labelart und Jahrzehnt. Die Detailseite zeigt Datierungen, Merkmale,
Prüfhilfen, Grenzen, Quellen und öffentliche Bildbeschreibungen.

## Bewusst noch nicht freigeschaltet

Die Lazy-Routen sind noch nicht in die Hauptnavigation eingetragen. Der
Leserbereich bleibt bis zur vollständigen Datenbank-/Storage-Abnahme geschlossen.
Die Seiten zeigen ausdrücklich neutrale Bildplatzhalter, keine erfundenen
Nike-Referenzen und keine ungeprüften Originalpfade. Bilder laden, vergrößern und
ersetzen ist noch nicht implementiert. Die Markenauswahl enthält den Nike-Pilot,
noch keine dynamische Markenverwaltung. Quellen werden gemeinsam aufgeführt;
Querverweise und die genaue Quellenzuordnung an einzelnen Aussagen sind offen.

Der Client nutzt vorläufig einen eng begrenzten, validierten RPC-Vertrag für die
SQL-Kandidaten. Er ersetzt weder erzeugte Datenbanktypen noch die Release-Migration.
Der Admineditor und die vollständige Bildverwaltung sind weiterhin offen.

## Prüfungen

26 Angular-Service-/Seitenlogiktests, zehn neue Antwortvertragsprüfungen und
acht Tests der gemeinsamen Thumbnail-Komponente bestehen lokal. Der Thumbnail-Test
prüft tatsächlich die Komponentenvorlage; die Seitenlogiktests prüfen hingegen
Formulare, Zustände und Routing und sind keine Browser-End-to-End-Tests.

Die gesamte App wurde mit `ngc -p tsconfig.app.json --noEmit` geprüft, einschließlich
der neuen Vorlagen. Projekt-Typprüfung, gezielter ESLint, Prettier und der
Shared-UI-Vertrag bestehen. Ein vollständiger CLI-Produktionsbau ist damit nicht
behauptet: Die lokale Node-Version ist für den installierten CLI-Einstieg zu alt.

Der erste vollständige `npm test`-Lauf wurde nach 300 Sekunden mit Exit 124
beendet; Node- und DOM-Gruppen bestanden, Angular war noch nicht fertig.
Der erneute Gesamtlauf und sein abschließendes Ergebnis werden im PR nachgetragen.

Eine Nachprüfung fand, dass alte Treffer zwischen Filterwechsel und Effect noch
angezeigt werden konnten. Zwei zuerst fehlgeschlagene Regressionstests prüfen
nun diese Lücke bei Suche und Detailwechsel. Die Korrektur bindet den angezeigten
Stand zusätzlich an den konkreten Suchauftrag. Beide Tests bestehen.

Der Browseraufruf auf den lokalen Vorschau-Server wurde ausdrücklich mit
`ERR_BLOCKED_BY_ADMINISTRATOR` gesperrt. Es gibt keinen visuellen Nachweis und
keinen AXE-Nachweis für diese beiden Seiten. Die Richtlinie wurde nicht umgangen.
Bisher Selbstreview, kein unabhängiges Review.

## Trennung vom alten lokalen Zusatzstand

Der neue Leser-Commit benötigt weder die bisher nur lokal vorliegende
Editorsteuerung noch Änderungen am CI-Workflow. Die separat geprüfte
Editorsteuerung mit 79 Tests sowie ältere Format- und Changelog-Nachträge bleiben
im lokalen Ergänzungspatch. 408 lokale Labeltests einschließlich dieser 79 sind
nicht mit der Zahl der Tests im übertragenen Branch gleichzusetzen.
