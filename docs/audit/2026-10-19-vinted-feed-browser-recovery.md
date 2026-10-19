# Vinted-Feed: Renderer-Absturz und sichere Wiederherstellung

Stand: 19.10.2026, Uhrzeiten Europe/Berlin.

## Veröffentlichte Sitzungskorrektur

[PR #447](https://github.com/GrischaTDev/flipbase/pull/447) ist nach allen
Pflichtprüfungen aus Lauf `39305545722` mit Merge-Commit
`4adcc781a0cbca0e4206beee296fc7253e466dea` integriert. Während des ersten
PR-Laufs wurde PR #446 in master übernommen. Der ausschließlich additive
Konflikt im gemeinsamen Protokoll wurde mit beiden vollständigen Einträgen
aufgelöst; der aktuelle integrierte PR-Stand wurde erneut erfolgreich geprüft.

[Produktionslauf 39306033344](https://github.com/GrischaTDev/flipbase/actions/runs/39306033344)
ist einschließlich Abbildprüfungen, Deployment und öffentlicher Kontrolle
erfolgreich. Der öffentliche Commit wurde unabhängig mit dem vorhandenen
Prüfskript bestätigt. Der Feedcontainer läuft seit 21:03:06 Uhr mit Digest
`sha256:7e0724f547857fba0cdcf2499e793b949e27197f757041f5019165fb0e547086`.
Die Prüfsumme seines übersetzten Browserlesers stimmt mit dem lokal geprüften
Abbild überein. Remote- und lokaler PR-Zweig gelöscht, eigene Arbeitskopie
archiviert. Fremde Zweige unverändert.

## Zweiter, unabhängig bestätigter Ausfall

Nach Hinzufügen von Blauer lieferten alle vier aktiven Marken erfolgreiche
Abrufe. Der Kernel beendete um **20:49:01 Uhr** einen Chrome-Renderer im
Feedcontainer an dessen bestehender 2-GiB-Speichergrenze. Der betroffene Prozess
hatte rund 1,8 GiB anonymen Speicher. Cgroup-Ereignisse bestätigen genau einen
OOM-Kill und einen Spitzenverbrauch von etwa 2 GiB. Der Node-Prozess blieb
laufen; seine Betriebsmeldung und Logs standen seit 20:48 Uhr still. Blauer
war unmittelbar vorher erfolgreich. Ein fehlerhafter Markenfilter ist damit
nicht belegt.

Die normale Bereinigung wartete nach dem Renderer-Ausfall unbegrenzt auf
Browserbefehle. Der Dockerstatus wurde erst nach der bestehenden
Fortschrittsfrist ungesund; dieser Status startet einen Container nicht selbst
neu. Der bereits laufende vorherige Release #446 ersetzte den Container um
20:55 Uhr. Zurückgebliebene Singleton-Sperren blockierten anschließend den
Browserstart.

Zur Sofortwiederherstellung wurde ausschließlich der Feedcontainer gestoppt.
Nach Nachweis keiner zugehörigen Browserprozesse und freiem Steuerungsport
wurden genau `SingletonLock`, `SingletonCookie` und `SingletonSocket` als
verwaiste Symlinks entfernt. Keine Linkziele, Cookies oder Profile gelöscht.
Neustart um 20:56:28 Uhr; anschließend alle vier Marken wieder erfolgreich.
Auch nach Veröffentlichung von #447 um 21:03 Uhr waren um 21:07 Uhr sämtliche
Fehlerzähler null, Betriebsmeldungen aktuell und 3.101 Artikel gespeichert.
Der Verbrauch von rund 1,39 GiB nach vier Minuten zeigt, dass die zusätzliche
Speicher-/Absturzabsicherung weiterhin nötig ist. Ein dauerhafter Speicherverlust
oder eine interne Vinted-Ursache ist dadurch noch nicht bewiesen.

## Zusätzliche Korrektur

Eigener Zweig `juna/vinted-feed-browser-recovery`, direkt auf aktuellem
`origin/master` mit der bereits veröffentlichten Sitzungskorrektur:

- Vor dem 16. abgeschlossenen automatischen Abruf einen neuen Tab öffnen,
  anschließend alte Tabs schließen. Auch HTTP-Fehlerantworten zählen. Bei
  ungeklärtem Schließen keine weiteren Tabs hinzufügen. Manuelle Bedienung
  bleibt gesondert; Seiten- und Sitzungsskripte dürfen weiterhin normal laufen.
- Eine gemeinsame Frist von zwei Sekunden für Dokumentbereinigung, Ablösen
  der Sitzung und Verbindungsabbau. Nach Fristablauf keine weiteren
  Aufräumbefehle starten oder den fraglichen Browser weiterverwenden.
- Bestehenden Taktfortschritt beibehalten: abgeschlossene Fehlversuche, leere
  Durchläufe und bewusste Pausen bleiben lebendig. Nur bei echtem Stillstand
  oder einem unbrauchbaren Browser einmalig geordnet schließen und mit
  Fehlercode beenden. Die Beendigung ist auf 20 Sekunden begrenzt; Docker
  startet mit der bestehenden Regel neu. Gleichzeitige Beendigungen teilen
  denselben Vorgang; spät fertig werdende Verbindungen starten keinen Katalog.
- Beim Start nur verwaiste Profilsperren bereinigen: bestätigter Besitzer,
  bekannte Symlinknamen, vollständig geprüfte PID, ausschließlich ESRCH als
  Nachweis eines fehlenden Prozesses und tatsächliche Prüfung eines freien
  Ports. EPERM, unbekannte Einträge, fremder Besitzer oder belegter Port
  bleiben Sperrgründe. Kein pauschales Löschen von Chrome- oder X11-Dateien.

Die Sperrbereinigung setzt weiterhin den exklusiven Betrieb genau eines
Containers mit diesem Profil voraus. Keine Erhöhung des Speichers, Änderung
an Filtern, Pausen, Abruftakt, Datenbankschema oder Abhängigkeiten. Ein fremder
älterer Wiederherstellungsentwurf wurde ausschließlich gelesen und nicht als
Grundlage zusammengeführt.

## Nachweise und Grenzen

Regressionen für hängende innere und äußere Browserbereinigung, fehlenden
Tabwechsel und parallele beziehungsweise späte Shutdown-Abläufe zuerst rot,
danach grün. Vollständige Feed-Suite: **358 Fälle unter Linux erfolgreich**;
unter Windows 351 erfolgreich und sieben ausschließlich für echte
Linux-Symlinks vorgesehene Fälle übersprungen. Typprüfung und Dienstbau grün.
Bestehende Testauswahl und Suite-Audit geprüft; neue Dateien werden durch den
vorhandenen Dienst-Testlauf erfasst.

Der echte Chrome-Containertest besitzt kein externes Netzwerk. Vierzig
zusätzliche Abrufe durchlaufen drei tatsächliche Tabs, jeweils genau eine
offene Seite und erhaltene Cookies. Im ersten Lauf höchstens 384 MiB
stichprobenartig gemessen; das ist ein lokaler Testwert, kein Nachweis für
Vinted im Langzeitbetrieb. Ein tatsächlich verwaistes Profil wird anschließend
neu gestartet; Cookies bleiben erhalten. Bestehende Prüfseiten-,
Sitzungserneuerungs-, Abbruch-, Sandbox- und manuelle Bedienprüfungen bleiben
enthalten. Unabhängiger Review und gezielter Nachreview ohne offene wichtige
Befunde. Ein mehrstündiger realer Vinted-Lauf bleibt eine spätere Betriebsprüfung.

Die zusätzliche Korrektur ist noch nicht veröffentlicht; sie benötigt einen
eigenen freigegebenen PR. Die Veröffentlichung von #447 behebt ausschließlich
die bereits nachgewiesene Sitzungserneuerung.

## Lokale Arbeitskopien

Beim Archivieren der ersten Arbeitskopie entfernte die Bereinigung über eine
Windows-Junction Teile der gemeinsam verknüpften lokalen Testpakete. Die
ursprünglichen Pakete wurden aus der unveränderten Sperrdatei wiederhergestellt;
kein Quellcode oder Produktionsdienst betroffen. Die neue Arbeitskopie besitzt
nun eine eigene echte Paketinstallation. Vor weiterer Archivierung vorhandene
Junctions ausdrücklich prüfen und sicher entfernen, statt sie rekursiv zu
bereinigen.
