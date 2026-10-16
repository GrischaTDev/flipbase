# Docker Desktop unter Windows starten

## Verbindlicher Ablauf für diese Arbeitsumgebung

Zuerst nur prüfen, ob die Engine erreichbar ist (`docker version`). Ein Zugriffsfehler auf die Docker-Pipe beweist nicht, dass Docker beendet ist: In der geschützten Befehlsumgebung sind Benutzerordner umgeleitet und die Pipe kann gesperrt sein. Deshalb dieselbe reine Statusabfrage im normalen, freigegebenen Benutzerkontext wiederholen. Läuft sie, direkt die eigene Testinstanz verwenden. Zum Starten einer beendeten App den normalen Windows-Weg per Computer Use verwenden: im Datei-Explorer den installierten Docker-Ordner öffnen und die vorhandene Docker Desktop.exe starten. Vor dem Doppelklick das aktuelle Fenster und die konkrete Datei prüfen. Danach sowohl die sichtbare Meldung Engine running als auch eine erfolgreiche Engine-Abfrage abwarten.

Kein direkter Start-Process-Aufruf mit WindowStyle Hidden. Keine parallelen Start- oder Neustartversuche. Keine Socketdateien löschen, keine Werkseinstellungen und kein WSL-Shutdown. Laufende fremde Projekte dürfen für einen Starttest nicht angehalten werden. Bei einem Fehler die tatsächliche Meldung untersuchen, statt denselben Start unverändert zu wiederholen oder den Nutzer regelmäßig zum manuellen Start aufzufordern.

## Nachweis und offene Ursache vom 16.10.2026

Der Nutzer hat klargestellt: Vor den fehlgeschlagenen automatischen Starts war Docker nicht von ihm gestartet worden. Er hat anschließend jeweils den Fehler geschlossen und die Anwendung per Hand erfolgreich gestartet. Die frühere Vermutung einer bereits laufenden zweiten Instanz ist deshalb zurückgenommen. Zwei Backend-Prozesse sind beim normalen Docker-Aufbau kein Beleg für eine doppelte Instanz.

Der automatische direkte Start scheiterte beim Entfernen der lokalen sailor-ingest.sock. Der spätere manuelle Start konnte denselben Socket öffnen; danach waren die Engine und unsere eigene isolierte Datenbank erreichbar. Die technische Ursache des Unterschieds ist noch nicht bewiesen. Der Computer-Use-App-Launcher meldete beim registrierten Docker-Appnamen ein nicht zuordenbares Fenster, obwohl das vorhandene Fenster danach lesbar war und Engine running zeigte. Auch dies ist kein bestandener Kaltstarttest. Der Explorer-Weg wird beim nächsten erforderlichen Kaltstart abschließend geprüft; der laufende Projektbetrieb wird dafür nicht unterbrochen.

## Zusätzlich geprüfter Unterschied

Die geschützte Befehlsumgebung liefert für `LOCALAPPDATA` einen Paket-Sandboxordner und verweigert den Zugriff auf `dockerDesktopLinuxEngine`. Die normale Benutzerumgebung liefert `C:\Users\Grisc\AppData\Local`; dort antwortet die bereits laufende Engine mit Version 29.7.2. Das belegt den unterschiedlichen Zugriffskontext, aber noch nicht die Ursache des ursprünglichen Socketfehlers. Ein verweigerter Statuszugriff darf keinen neuen Startversuch auslösen.
