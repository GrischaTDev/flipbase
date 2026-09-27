# Integrierte Marktplatzverwaltung: Vinted zuerst

Stand: 26.09.2026. Arbeitsfassung zum beauftragten Implementierungsstart.

## Produkt und Grenzen

Die Verwaltung gehört vollständig zu Flipbase. Unter Einstellungen werden
bestehende, berechtigt nutzbare Konten verbunden und deren Rechte verwaltet.
Der operative Bereich liegt unter „Marktplätze → Vinted“ und enthält einen
Kontowechsler sowie Übersicht, Inserate, Nachrichten, Verkäufe und Profil.
Die Oberfläche verwendet das Flipbase-Design und vorhandene Shared Components.
Desktop, Handy und iPad verwenden denselben serverseitigen Datenbestand.

Workspace und Kontoverbindung sind unterschiedliche Ebenen. Jeder Auftrag trägt
beide IDs unveränderlich. Kontowechsel dürfen weder laufende Aufträge umhängen
noch verspätete Antworten eines anderen Kontos in die neue Ansicht übernehmen.
Entwürfe und Gespräche bleiben ebenfalls ihrem Ursprungskonto zugeordnet.

Vinted kommt zuerst, Kleinanzeigen nach einer eigenen Prüfung. eBay wird später
über die offizielle Verkäufer-API angebunden. Der vorhandene Kleinanzeigen-Editor
und der Deal-Monitor unter `/vinted-bot` bleiben erhalten.

## Gemeinsame Daten

Ein Lagerartikel bleibt ein Lagerartikel, auch bei mehreren Veröffentlichungen.
Importierte Inserate dürfen zunächst ohne Zuordnung vorliegen und erzeugen keinen
zweiten Bestand. Gespeicherter Inseratinhalt bleibt im bestehenden Listings-Bereich.
Unbekannte Aufruf- und Favoritenzahlen sind `null`, nicht `0`.

Die globale Glocke und die kontobezogene Aktivitätenansicht verwenden dieselben
Ereignisse. Filter und vollständige Zähler müssen serverseitig entstehen; das
Filtern der aktuell letzten 50 Meldungen reicht nicht. Persönlicher Lesestatus,
Plattform-Lesestatus und bestätigte Verkaufsvorgänge bleiben getrennt.

## Architektur

Die native Angular-Oberfläche spricht mit einer autorisierten Flipbase-API.
Dauerhafte, kontogebundene Aufträge werden von einem separaten Server-Worker
verarbeitet. Dieser ist Teil von Flipbase, kein separates Produkt.

Browseranbieter und Marktplatzadapter bleiben austauschbar. GoLogin ist ein
Kandidat für persistente Browserprofile; seine sichere, kundenspezifische
Einbettung ist noch nicht nachgewiesen. Es werden keine Provider-Haupttoken,
Browserprofilreferenzen, Sitzungscookies oder unbeschränkten Steuerungszugänge
an das Frontend ausgegeben.

Die interaktive Anmeldung muss innerhalb von Flipbase an genau eine freigegebene
Kontoverbindung gebunden sein. Pro Verbindung darf nur eine aktive Bedienung
bestehen. Sicherheitsprüfungen pausieren die Verbindung. Es gibt keine automatische
Kontoregistrierung, keine Umgehung bestehender Sperren und keine automatische
Rotation von Identitäten oder IP-Adressen.

## Aktionen und Nachweise

Technisch bestätigte Fähigkeiten und tatsächliche Nutzerrechte sind getrennt.
`unknown`, `unsupported` und `blocked` erlauben keine Aktion. Eine erfolgreiche
DTO-Prüfung belegt weder Kontozugriff noch Plattformfreigabe.

Nachrichten und Veröffentlichungen bekommen einen bestätigten Ergebnisstatus.
Ein Abbruch nach einer möglicherweise ausgeführten Aktion führt zu
`outcome_unknown`, nicht zu blindem Wiederholen. Ein verschwundenes Inserat
ist kein Verkaufsnachweis. Anfangs werden keine automatischen Antworten,
Preisannahmen, Auszahlungen oder Identitätsprüfungen ausgeführt.

Kennzahlen und Synchronisationen erhalten Beobachtungszeitpunkte. Push wird erst
nach der Erkennung eines Ereignisses ausgelöst; eine installierbare Web-App
allein ist noch kein nachgewiesener Push-Empfang.

## Reihenfolge der Freigaben

- G0: Kontonutzung, Plattformberechtigung, Anbieter-Vertrag, Datenverarbeitung
  und Abrechnung prüfen. Alle externen Freigaben sind derzeit offen.
- G1: Kontogebundene interaktive Anmeldung, Widerruf und sichere Trennung auf
  einer eigenen Testseite nachweisen, anschließend Desktop und iPad prüfen.
- G2: Leseumfang an einem ausdrücklich ausgewählten, berechtigt nutzbaren Konto
  einzeln nachweisen. Mögliche Lesestatus-Nebenwirkungen dokumentieren.
- G3: Schreiben einschließlich Abbruch, Ergebnisabgleich und Wiederholschutz prüfen.
- G4: Zweites berechtigtes Konto, Mehrbenutzerbetrieb, Push und gemessene Kosten prüfen.

Normale Unit-, UI- und CI-Tests verwenden ausschließlich künstliche Daten.
Kein positives Simulationsergebnis wird als erfolgreicher Vinted-Livetest bezeichnet.
