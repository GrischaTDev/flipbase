# Referenzbibliothek: Leseransichten

Stand: 08.10.2026. Assistent: Juna.

Die Lazy-Routen sind an Tools und Hauptnavigation angebunden. Die Labelgalerie
verwendet dynamische Referenzmarken, URL-Filter für Suchtext, Marke, Labelart und
Jahrzehnt sowie versionierte Pagination. Der Rückweg vom Detail erhält die Filter.
Detailseiten zeigen private Referenzbilder mit Vergrößerung, Bildnachweise,
Datierungen, Merkmale, Prüfhilfen, Grenzen und Quellen. Datierungen und Prüfhilfen
verweisen unmittelbar auf ihre hinterlegten Quellen.

Die Größenansicht filtert nach Marke, Kategorie, Zielgruppe und Suchtext.
Tabellen benennen Maßart, Einheiten und Quelle ausdrücklich. Breite Tabellen
sind auch per Tastatur erreichbar. Neue Entwürfe ersetzen veröffentlichte
Tabellenwerte erst nach erneuter Veröffentlichung.

Nutzer-, Rollen- und Workspacewechsel entfernen alte Inhalte und Bildlinks
sofort. Verspätete Antworten überschreiben keinen neuen Kontext. Bildlinks
werden über den authentifizierten Medien-Endpunkt erneuert; direkte
Storage-Signierung mit selbst gewählter Laufzeit ist ausgeschlossen.
Widerrufene Bildrechte entfernen die betroffenen Labels aus der Leseransicht.

Der Chromium-Test `e2e/brand-label-library.spec.ts` verwendet reale lokale
Anmeldung, Datenbank und Medienverarbeitung mit synthetischen Referenzen.
Er prüft Veröffentlichung, Leseröffnung, Bildanzeige, Filter, mobile AXE-Prüfung
und Bildwiderruf. Er ersetzt keine redaktionelle Prüfung tatsächlicher Markenbelege.
