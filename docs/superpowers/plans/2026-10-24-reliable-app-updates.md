# Verlässliche Aktualisierungen – Umsetzung

Die Untersuchung vom 24.10.2026 und der anschließende Nutzerauftrag geben den
Umbau frei. Umsetzung im Zweig `juna/reliable-app-updates` auf `origin/master`.
Juna führt die Umsetzung in dieser Sitzung aus; anschließend unabhängiger Review.

## Verbindliches Verhalten

- Kein fremder Tab blockiert den Wechsel des aktuellen Fensters. Fremde Eingaben
  bleiben im unveränderten Dokument; sein alter Dateistand bleibt abrufbar.
- Nur das wechselnde Dokument bestätigt seine eigenen Eingaben und laufenden
  Speichervorgänge. Keine automatischen fachlichen Schreibaktionen.
- Startansicht bleibt bis zur Entscheidung über einen bereits vorbereiteten
  Versionswechsel stehen; nach Freigabe öffnet keine Hintergrundprüfung einen
  zweiten Startbildschirm. Updateklick hält die volle Ansicht bis zum Neustart.
- Vorbereitete Version beim frischen Start automatisch übernehmen, mit
  Zielbauprüfung und begrenztem automatischem Neustart. Langsame Installation
  blockiert die vorhandene nutzbare Version nicht dauerhaft.
- Kompatibilität zum bisherigen Clientprotokoll und Versionscaches erhalten;
  unbekannte, beschädigte oder fehlende Versionen nie durch neue Bytes ersetzen.

## Schritte

1. Bestehende Worker-, Angular- und Starttests als Ausgangspunkt ausführen.
   Zuerst rote Verhaltenstests für unabhängig wechselnde aktive/fremde/schlafende
   Tabs und Änderungen der Fensterliste ergänzen. Initiatorzustimmung, Abbruch,
   Quellenprüfung und alte Chunks bleiben abgesichert.
2. Workerübergabe auf Zustimmung ausschließlich des anfordernden Dokuments
   begrenzen; vorhandene fremde Versionszuordnungen erhalten. Alte Protokollaufrufe
   unterstützen, fremden Dokumenten keine globale Eingabesperre senden. Fehlende
   Zuordnungen gezielt aus dem Clientstatus ergänzen, ohne fremde Eingaben zu ändern.
3. Startfreigabe und Updatezustand verbinden; Verhaltenstests für verzögerte
   Prüfung, langsame Installation, automatische vorbereitete Übernahme,
   Wiederholgrenze, Fehler und spätere Hintergrundantworten zuerst rot prüfen.
   Eigene Übergabe schützt Eingaben, fremde Übergabe bleibt ohne Sperre.
4. Fachlichen Routenschutz gegenüber pauschalem Dialog-/Formularstatus bevorzugen.
   Ungeschützte bearbeitete Formulare weiterhin konservativ schützen; reine Dialoge
   nicht pauschal als offene Geschäftseingabe werten. Konkrete Tests für gespeicherte
   geschützte Seiten, laufendes Speichern und ungeschützte Eingaben.
5. Versionsdateien für Reparatur alter Caches bereitstellen: getesteter
   Veröffentlichungs-/Aufbewahrungsweg und explizite URL je Bau, weiterhin
   prüfsummengesichert. Keine privaten Inhalte in diesen Dateispeicher aufnehmen.
6. Bestehende Produktions-PWA-Fälle auf den neuen Vertrag ändern: zwei echte
   Bauten, gleichzeitige aktive Eingaben in anderen Fenstern, eingefrorener Tab,
   Eingabeerhalt, keine Bildschirmwechsel, wiederholte Berührung, alter Worker,
   Cachefehler und Offline. Neue Tests/Suite-Auswahl korrekt registrieren.
7. Formatierung, Lint, Typen, Angular-Bau, betroffene Anwendungstests, PWA-Skripte,
   Workflow-/Suite-Auswahl und Produktions-PWA einschließlich Touch, Farbschemata,
   Fokus und AXE prüfen. Betroffene Lebenszyklusfälle zusätzlich unter Linux mit
   CI-Versionen ausführen. Kein paralleler Bau gegen laufende Browsertests.
8. Unabhängiger Review, konkrete Befunde beheben, Prüfungen gezielt wiederholen.
   Changelog und Geräteanleitung aktualisieren, echte Apple-Gerätelücke benennen.
   Anschließend vorgeschriebene Frage zu PR und Merge; vorher kein Push.

## Besondere Reviewpunkte

- Gleichzeitige Updateklicks oder geschlossene Fenster dürfen weder Datenverlust
  noch dauerhafte Sperre verursachen.
- Neuer Worker darf in alten Dokumenten keine neue JavaScript-/CSS-Version mischen.
- Fremde Cachezuordnung muss vor Aktivierung belastbar sein, auch nach Neustart.
- Alte Clients, übersprungene Releases und Rollback brauchen denselben Schutz.
- Eingabestatus darf nach Speichern nicht grundlos sperren und ungesicherte
  Eingaben niemals irrtümlich freigeben.
- Automatische Startübernahme darf weder sichtbare App-Zwischenbilder noch eine
  Reloadschleife erzeugen; Speicherfehler brauchen einen sicheren Rückweg.

## Abschluss der Umsetzung

Alle acht Schritte umgesetzt. Vollständige Anwendungstests erfolgreich (2.708 Node-,
354 DOM- und 2.837 Angular-Fälle), danach gezielte Update-Suite mit 46 erfolgreichen
Fällen. Produktionsbauten und vollständige PWA-Matrix unter Windows und Linux mit
jeweils 40 erfolgreichen Fällen; das vorgesehene Desktop-Duplikat des tatsächlich
geprüften eingefrorenen Touch-Kontexts bleibt ausgelassen. Lint, Typprüfung,
PWA-Skripte, Suite-Audit, Prüfregistrierung und Linux-Deployfixture erfolgreich.
Echtes Nginx prüft versionsbezogene Dateien, Sicherheitsheader und fehlende Dateien.
Abschließender unabhängiger Review ohne offene wesentliche Befunde.
Anschließend aktuellen Hauptzweig `46a51a66` übernommen und Update-/Bestandstests,
Testauswahl, Lint, Typprüfung, Formatierung, PWA-Skripte und vollständige
Linux-PWA-Matrix mit drei frischen Produktionsbauten erneut erfolgreich geprüft.

Noch kein Produktionswechsel. Vor dem ersten Release ist die in
`deploy/RELEASE-PIPELINE.md` beschriebene einmalige Übernahme des Deploy-Skripts und
Archivierers erforderlich. Echte iPhone-/iPad-Home-App-Abnahme bleibt offen; die
WebKit-Prüfungen ersetzen sie nicht. Der nächste Schritt ist die in `AGENTS.md`
vorgeschriebene Freigabe für Push, PR und Merge.
