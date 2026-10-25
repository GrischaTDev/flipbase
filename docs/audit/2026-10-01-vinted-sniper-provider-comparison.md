# Vinted-Artikelbot: Vergleich und Grenzen der bisherigen Korrektur

Stand: 1. Oktober 2026. Analyse von Juna, ohne weitere Produktänderung.

## Anlass

Der Nutzer berichtet von nahezu durchgehendem Artikelzulauf bei einem anderen
Anbieter mit vier Discord-Bots und hinterfragt, ob längere Wartezeiten unseren
Artikelbot ausreichend verbessern. Als Vergleich nennt er diese Mitgliederseite:

<https://whop.com/dreanzvintage/exp_dVdDNAjPzbuArK/app/>

## Nachgewiesener Unterschied zwischen Störungsbehandlung und Ursache

PR #275 verbessert Abstände zwischen Anfragen, Zeitlimits, Wiederprüfungen und
Fehlermeldungen. Ein dauerhaft von Vinted akzeptierter Abruf ist dadurch noch
nicht nachgewiesen. HTTP 403 belegt die Ablehnung, aber nicht deren genaue Ursache.
Weniger Anfragen allein sind deshalb keine belegte Lösung für diese Ablehnung.

Der zentrale Artikelbot in `services/sniper` liest Katalog-HTML mit Node `fetch`.
Browserähnliche Header ersetzen keinen laufenden Browser: JavaScript wird nicht
ausgeführt. Cookies liegen in einer Prozess-Map und werden bei 401/403 gelöscht.
Alle Marken teilen diesen Abrufweg und eine gemeinsame Zugriffspause. Damit
betrifft eine Ablehnung des gemeinsamen Zugangs den gesamten Artikelzulauf.

`preferIpv6()` bevorzugt IPv6 bei der DNS-Auflösung. Das beweist weder die tatsächlich
benutzte Verbindung für einen bestimmten Abruf noch, dass Vinted sie akzeptiert.
Der persönliche Marktplatz-Browserdienst ist ein anderer Dienst; dessen erfolgreich
angemeldetes Konto belegt keinen funktionierenden Zugang des zentralen Artikelbots.

## Was über DREANZVINTAGE bekannt ist

Die offizielle Produktseite bewirbt einen Vinted Snipe Bot:

<https://whop.com/dreanzvintage/dreanzvintage/>

Der Nutzerlink trägt den Seitentitel „A-Z Kursplattform“. Der hier verfügbare
Browserzugang zeigt eine Anmeldeoberfläche, keine zugänglichen Kursinhalte oder
technischen Beschreibungen des Abrufdienstes. Die öffentliche Produktseite
veröffentlicht keine überprüfbaren Angaben zu dessen Sitzungen, Transport,
Ausweichwegen oder gemessener Verfügbarkeit.

Die Beobachtung des Nutzers zu vier Discord-Bots und kontinuierlichen Meldungen
wird als Nutzerbeobachtung festgehalten. Daraus folgt nicht, dass vier unabhängige
Abrufdienste vorhanden sind. Mehrere Discord-Ausgaben können dieselbe Artikelquelle
verwenden. Eine Zuordnung dieses Angebots zu `vintz.ai` ist nicht belegt und wird
nicht vorgenommen. Fremde Anbieterarchitektur wird nicht als bekannt ausgegeben.

## Nächste sachliche Untersuchung

1. Bei der vorgesehenen automatischen Wiederprüfung die Ablehnung anhand
   datensparsamer Diagnosemerkmale einordnen; keine Cookies oder Zugangsdaten loggen.
2. Den tatsächlich verwendeten Netzwerkweg und den Zustand der Abrufsitzung
   feststellen. Netzwerk-, Sitzungs-, Zugriffsschutz- und Mengenprobleme als
   Hypothesen getrennt prüfen, statt HTTP 403 automatisch als Mengenproblem deuten.
3. Einen von Vinted akzeptierten Abrufweg unter vergleichbaren Bedingungen
   nachweisen, bevor ein größerer Umbau oder zusätzliche Dienste gewählt werden.
4. Den Erfolg über längeren Artikelzulauf, Ablehnungsquote und Erholung nach
   Störungen bewerten. Ein gesunder Container oder bestandene Tests belegen keine
   kontinuierliche externe Datenversorgung.

Ein zweiter Prozess mit demselben abgewiesenen Zugang ist kein belegter Ausweichweg.
Ein echter Browser ist eine zu prüfende Alternative, keine garantierte Lösung.
Auch bei erfolgreichen Abrufen bleibt die Lückenaufholung zu beachten: Der aktuelle
Sammler liest nur Seite 1 mit bis zu 96 Artikeln je Suchabfrage.

## Prüfung und Eingriffe

Aktuellen Quellstand aus `origin/master` gelesen; offizielle Whop-Seiten geöffnet
und den Nutzerlink im verfügbaren Browser geprüft. Keine zusätzliche Vinted-Anfrage,
keine verkürzte Zugriffspause, keine Anbieterbuchung und kein Serverumbau ausgelöst.
