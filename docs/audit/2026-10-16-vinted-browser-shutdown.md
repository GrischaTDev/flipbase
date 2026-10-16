# Vinted: Browserabschluss und getrennte Wiederherstellung

## Nachweis

Beim Ausfall am 15. Oktober blieb nach Wiehen Stores Abruf eine globale
Browsersitzung offen. Der zugehörige Container war seit 19:55 Uhr beendet,
mit Exitcode 75, ohne laufenden Prozess und ohne Speichermangel-Abbruch.
Der Containerlauncher behandelte diesen unsauberen Abschluss dauerhaft wie einen
noch laufenden Browser. Dadurch kamen Flipbase und Maike Vintage nicht mehr dran.

Der ursprüngliche Fenster- und Prozesszustand wurde nicht aufgezeichnet. Deshalb
ist nicht nachweisbar, welche konkrete Hintergrundaufgabe damals den Abschluss
verzögerte. Nachgewiesen und unter Linux reproduziert ist die fehlerhafte Annahme
des bisherigen Stopps: Alle Fenster schließen bedeutet nicht, dass Chrome endet.

Ein synthetischer Chrome mit `--keep-alive-for-test` bleibt nach dem bisherigen
`WM_CLOSE` aktiv. Nach acht Sekunden meldet der alte Helfer einen Fehler; die
Laufzeit erzwingt anschließend den Stopp und meldet 75. Derselbe Versuch mit
ausdrücklichem `Browser.close` endet regulär mit Exitcode 0 und Profilstatus
`Normal`. Ein gespeichertes Testcookie bleibt beim nächsten Start erhalten.
Der normale Fall ohne Hintergrundaktivität besteht ebenfalls.

Das entspricht der [Chromium-Beschreibung des Browserabschlusses](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/shutdown.md):
Auch nach dem letzten Fenster können Aufgaben den Prozess am Leben halten.
Der [Chrome-Debugging-Vertrag für Browser.close](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-close)
beschreibt den ausdrücklichen regulären Browserabschluss.

## Korrektur

- Die Sitzung fordert über ihre bereits vorhandene lokale Verbindung den
  regulären Browserabschluss an. Ein verlorener Steuerkanal hat einen begrenzten
  nativen Ersatzweg. Insgesamt wartet dieser Weg höchstens 30 Sekunden auf das
  tatsächliche Prozessende; ein noch laufender Chrome wird danach gezielt beendet.
- Der Host unterscheidet den sauberen Profilabschluss vom bestätigten
  Containerende. Er prüft weiterhin Konto-/Hostkennungen, den einzigen erwarteten
  Profilmount, Containerzustand und PID. Erst nach bestätigter Entfernung kann der
  gemeinsame Platz wieder verwendet werden. Profilinhalte werden nicht entfernt.
- Ein bestätigtes Ende mit unsauberem Profil bleibt eine eigene Warnung. Der
  normale Abrufabschluss pausiert nur dessen Konto mit `cleanup`; die nächsten
  Konten dürfen im selben Worker weiterlaufen. Unbekannte Stopps oder fremde
  Container bleiben gesperrt.
- Der Host speichert die feste Warnung vor der Containerentfernung in seinem
  privaten Verzeichnis `stop-results/` neben `profiles/`. Dieses Verzeichnis ist
  nicht in den Kontobrowser eingebunden. Die Datei wird vollständig geschrieben,
  gespeichert und atomar veröffentlicht. Sie überlebt Broker-/Workerneustarts und
  fehlgeschlagene Datenbankzugriffe. Erst eine neu freigegebene, erfolgreich
  gestartete Sitzung bestätigt die Wiederverwendung des Profils.
- Die Neustartbereinigung pausiert den zum Auftrag gehörenden Zeitplan nur bei
  unveränderter `schedule_authorization_version`. Automatische Zeitstempel sind
  keine neue Nutzerfreigabe. Eine neuere Freigabe oder bestehende Pause bleibt
  erhalten. Die erhöhte Berechtigungsversion verhindert, dass der alte
  Auftragsabschluss die Pause wieder überschreibt.
- Eine bekannte eigene lokale Profilreservierung wird über ihren Besitznachweis
  freigegeben. Nach einem Workerneustart wird nur eine nachweislich verwaiste
  Reservierung übernommen; lebende fremde Besitzer bleiben geschützt.
- Bei GoLogin genügt das Ende des lokalen Steuercontainers weiterhin nicht:
  Der entfernte Anbieter-Stopp muss zusätzlich bestätigt sein.

## Prüfungen und Einführung

Die neuen Kernregressionen scheitern zunächst am bisherigen Verhalten. Der echte
Linux-Browsertest prüft normalen und Hintergrundabschluss samt Cookiepersistenz.
Ein zweiter Test betreibt das tatsächliche Sitzungsimage mit den bestehenden
Speicher-, Prozess- und Sandboxgrenzen: normaler Abschluss mit 0, absichtlich
eingefrorener Chrome mit begrenztem Abschluss und 75, anschließend erfolgreicher
Neustart desselben synthetischen Profils mit erhaltenem Cookie. Der erzwungene
Abschluss dauert rund 31 Sekunden einschließlich Containersteuerung.

Die echten Dispatcher-/Broker-/Runner-Ketten prüfen drei wartende Konten:
Ein unsauberer Start oder Abschluss pausiert ausschließlich das erste Konto;
die beiden übrigen werden ohne Runtimeverlust erfolgreich beendet. Weitere Fälle
prüfen Datenbankfehler, neue Nutzerfreigaben, dauerhafte Warnungen, unvollständige
temporäre Dateien, symbolische Links und tote beziehungsweise eigene lebende
Profilbesitzer. Beide echten Chrome-Prüfungen sind im bestehenden Imageworkflow
registriert und benötigen keine Vinted-Verbindung oder Produktivdaten.

Es gibt keine Schemaänderung und keine Migration. Vor der Veröffentlichung
Worker, Broker und Sitzungsimage gemeinsam aus demselben geprüften Gitstand
vorbereiten. Den bestehenden Worker zuerst geordnet anhalten und die Bereinigung
bestätigen; dann Broker und Sitzungsimage umstellen und den neuen Worker starten.
Alte Worker kennen die neue Warnungsantwort nicht. Der private Broker bleibt
ausschließlich über das bestehende Kontrollnetz erreichbar; Ports, Rechte und
Ressourcengrenzen werden nicht erweitert. Danach erfolgreiche geplante Abrufe
und geschlossene Browsersitzungen produktiv nachweisen.
