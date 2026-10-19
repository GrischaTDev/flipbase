# Verbindliche App-Aktualisierung

**Ziel:** Freigegebenen Chatentwurf vom 19.10.2026 umsetzen: Updateprüfung bei Start/Rückkehr, bildschirmfüllende Aktualisierung ohne „Später“, offene Eingaben schützen und ausbleibende iPad-Hinweise untersuchen.

**Aufbau:** Bestehenden PwaUpdateService und die sichere Mehrfenster-Aktivierung behalten. Wiederaufnahme zusätzlich über pageshow erkennen, Prüfungen bündeln und zeitlich begrenzen. Die bestehende Hinweiskomponente zeigt die volle Ansicht nur ohne offene Eingaben; andernfalls bleibt ein dauerhafter Speicherhinweis und das Formular bedienbar. Keine neuen Abhängigkeiten.

## Arbeitsschritte

- [x] Vorhandene Update-Tests als Ausgangsstand ausführen. Fehlerfälle für Rückkehr innerhalb einer Minute, Wiederherstellung über pageshow, hängende Prüfung und volle Ansicht ohne „Später“ ergänzen und rot nachweisen.
- [x] Updateprüfung beim Verbinden und Zurückkehren starten; Ereignisse bündeln, Zeitlimit und spätere Wiederholung vorsehen. Installation und Statusmeldungen erneut prüfen. Lange Hintergrundpause ab einer Minute mit kurzer Prüfungsansicht, kurze Wechsel ohne Sperrbildschirm.
- [x] Volle Ansicht mit Logo, gelbem Aktualisierungsbutton, Fokusführung und Safe Areas umsetzen. Bei offenen Eingaben nur Speicherhinweis; keine automatische Speicherung, Verwerfung oder Seitenneuladung.
- [x] Bestehende Produktions-PWA-Fälle um automatische Rückkehrerkennung und lokale ungespeicherte Eingaben erweitern; bestehenden Mehrfenster- und Legacy-Schutz erhalten. Testauswahl, Registrierung, Barrierefreiheit und Gerätelücken dokumentieren.
- [x] Betroffene Angular-Tests, PWA-Skripte, Produktions-PWA-Browsermatrix, Format, Lint, Typprüfung und Bau prüfen. Linux-Lebenszyklusprüfung nach Möglichkeit mit CI-Versionen wiederholen. Sitzung protokollieren und Änderungen unabhängig prüfen.

## Besonders prüfen

Keine Endlossperre bei Offline/Netzwerkfehlern; parallele focus-/pageshow-/visibility-Ereignisse; neue Version während offener oder speichernder Eingaben; aktiver neuer Worker in anderem Fenster; vom Betriebssystem pausierte Ansicht und fehlende echte iPad-Abnahme. Die konkrete Geräteursache ohne Gerätelog nicht als bewiesen ausgeben.

## Prüfstand

Umsetzung und unabhängige Nachprüfung abgeschlossen. Alle 5.620 Anwendungstests erfolgreich; Produktions-PWA unter Windows und Linux jeweils 34 erfolgreich, ein erwarteter Desktop-Skip bei mobiler Abdeckung. PWA-Skripte, Format, Lint, Typen, Suite-Audit und Testauswahl erfolgreich. Zusätzliche Reviewkorrekturen: ältere Angular-Formulare und eigenständige Felder auch ohne Routenschutz erkennen, laufende Aktionen schützen und fehlgeschlagene Startregistrierungen wiederholen. Der eigene Aktualisierungsbutton ist ausdrücklich vom Beschäftigt-Schutz ausgenommen. Nach Ende kurzer Beschäftigt-Zustände wird die sichere Übernahme des bereits geladenen Baus erneut angestoßen. Bestehender Hauptarbeitsbereich enthält fremde Änderungen und bleibt unberührt; eigener Zweig basiert auf origin/master (7b80b8fa). Reale Apple-Geräteabnahme und umfassende CI-Browserauswahl bleiben vor beziehungsweise nach Veröffentlichung gesondert zu prüfen; keine Produktion verändert.
