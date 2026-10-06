# Zentrale Vinted-Suchfilter: Umsetzung und Prüfstand

Basis: `02dbcfbddaba4dfae0736bbd879d265fe2296b5a`. Eigener Zweig: `juna/vinted-central-search-filters`.

## Freigegebener Umfang

Die Administration bestimmt bereits vor dem Abruf, welche Warenbereiche gesammelt werden. Kategorie, optionale Marken und Titelbegriffe werden gemeinsam gespeichert und im bestehenden Collector verwendet. Persönliche Nutzerfilter schränken weiterhin den gemeinsamen Bestand ein und erzeugen keine eigenen Abfragen. Bestehende breite Markenfilter bleiben ausdrücklich erhalten; ein neuer engerer Filter deaktiviert sie nicht automatisch. Historische Funde und Favoriten werden nicht gelöscht.

Ein Suchfilter hat einen optionalen Kategoriepfad einschließlich übergeordneter Bereiche, bis zu zehn Marken und bis zu zehn Titelbegriffe mit je höchstens 80 Zeichen. Mindestens eine Bedingung ist erforderlich. ALL/ANY gilt nur für Titelbegriffe; Marke und Kategorie bleiben UND-Bedingungen. Wörter und zusammenhängende Wortgruppen werden nach Unicode-Normalisierung, Kleinschreibung und vereinheitlichten Bindestrichen mit Wortgrenzen geprüft. Beschreibungen zählen nicht. Filtername und Notiz verändern keine Bedingung.

## Integration

Der bestehende `sniper-query-editor` ersetzt die getrennten Erstellen-/Bearbeiten-Masken. Er setzt ausschließlich vorhandene Shared-Inputs, Buttons und Selects zusammen. Der fachliche Kategoriewähler bietet Ebenennavigation und direkte Vollpfadsuche. Der Service lädt alle Seiten eines konsistenten Kategorie-Snapshots, einschließlich Eltern. Doppelte Seiten, fehlende Eltern, Zyklen und zwischenzeitliche Synchronisation werden zurückgewiesen; fehlende gespeicherte IDs werden niemals stillschweigend gelöscht.

Marken werden nach mindestens zwei Zeichen gesucht. Die Oberfläche erklärt ausdrücklich, dass Vinted begrenzte Suchvorschläge liefert; es wird kein vollständiges Markenverzeichnis behauptet. Ausgeblendet sind nur im aktuellen Filter gewählte Marken. Ältere Marken-IDs ohne gespeicherten Namen bleiben erhalten und werden als solche gekennzeichnet.

## Abruf und Migration

Mehrere Marken und ODER-Begriffe ergeben Teilabfragen. Pro Takt wird genau eine Teilabfrage ausgeführt und vom vorhandenen globalen Budget begrenzt. Der gespeicherte monotone Abrufzähler rotiert über alle Kombinationen und verhindert zugleich die wiederholte Übernahme derselben Antwort. ALL verwendet einen vorgelagerten Suchbegriff und prüft anschließend sämtliche Titelbegriffe selbst. Ältere Vinted-Suchtexte und Preisgrenzen bleiben bei der Konvertierung erhalten und sichtbar.

`save_sniper_search_filter` prüft Betreiberrechte, Kategorien, Marken, Begriffe, Preispräzision und erwartete Revision. Der kanonische Schlüssel verhindert identische Filter unabhängig von Name, Reihenfolge und Groß-/Kleinschreibung. Einfache neue Markenfilter kollidieren auch mit dem bisherigen Schlüsselformat. Geänderte Bedingungen starten pausiert und setzen ausschließlich ihren Abruf-/Einlesestand zurück.

`complete_sniper_search_filter_run` übernimmt Funde, Deduplizierung, Einlesestatus, Trefferbewertung und nächsten Abrufzähler in einer Transaktion mit Zeilensperre. Revision und Abrufzähler müssen noch stimmen. Ein fehlgeschlagener Abruf darf ebenfalls keinen neueren Status überschreiben. Eine Oberkategorie wird nicht als vermeintlich bekannte Blattkategorie eines Artikels gespeichert, damit Preisvergleiche nicht verfälscht werden.

Die Aktivierung neuer Filter verlangt eine frische Fähigkeitsmeldung des aktualisierten Dienstes. Alte Clients dürfen neue Filter nicht als reine Markenfilter überschreiben; alte Collector-Schreibwege werden für neue Filter zurückgewiesen. Tabellenrechte und bestehende RLS-Grenzen bleiben erhalten. Neue RPCs für die Übernahme sind ausschließlich für die Dienstrolle freigegeben.

## Prüfmethode

Zuerst wurden fehlende Titel-/Kategoriebedingungen mit erwartbar roten Tests des echten Projekts belegt. Der vollständige Quellstand und gesperrte npm-Abhängigkeiten wurden über einen eigenen lesenden GitHub-Runner nach Prüfsummenabgleich in die isolierte Testumgebung übernommen. Keine Produktionszugänge werden verwendet.

Die Migration wird aus den deklarativen Schemas erzeugt. Bereits vorher bestehende Abweichungen zwischen Schemas und Migrationsstand werden in einer nur vorübergehenden Generator-Basis getrennt erfasst. Diese Basis wird vor dem Einspielen entfernt und gehört nicht zum Feature. So werden keine sachfremden Rechte oder Marketplace-Regeln in diese Migration übernommen.

Aktuelle Einzelergebnisse und offene Prüfungen stehen im AI-Changelog. Temporäre Transportdateien und Prüfworkflows werden vor dem fertigen PR entfernt. PR und Merge benötigen weiterhin die Abschlussfreigabe.

## Abschlussprüfung

**Abschlussprüfung vom 06.10.2026:** Lauf `37423402985`: 3764 Anwendungstests, 246 Collector-Tests, 3021 Datenbankassertions und 4 Browserabläufe bestanden. Desktop hell und Mobil dunkel jeweils zweimal ohne Wiederholungsversuch; Enter zum Zurücksetzen, Tab/Shift+Tab, Escape, Fokuswiederherstellung und AXE enthalten. 179 Workflow-Tests bestanden; 1 vorhandener optionaler Umgebungsfall übersprungen. Produktionsbau, Formatierung, Lint und Typprüfungen erfolgreich. Generierte Datenbanktypen stimmen exakt. Aktuelles master einschließlich PR 306 und 307 integriert. Temporäre Transportdateien und Prüfworkflow sind entfernt. Kein PR, kein Merge nach master und keine Produktionsänderung; Abschlussfreigabe steht noch aus.
