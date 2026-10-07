# Eigene Browsersitzung für den zentralen Vinted-Artikelbot

## Auftrag und Freigabe

Der zentrale Artikelbot im Adminbereich soll nach einer Vinted-Prüfseite
kontrolliert wieder Artikel sammeln können. Der Nutzer hat Änderungen am
serverseitigen Node-Bot ausdrücklich als Ausnahme zur allgemeinen
Frontend-Grenze freigegeben. Persönliche Vinted-Kontoverbindungen gehören nicht
zu diesem Auftrag. Branch: `juna/vinted-access-analysis`, Grundlage:
`origin/master` bei `96126477`.

## Gesicherter Befund

Am 7. Oktober 2026 melden produktive Katalogabrufe HTTP 403 mit
`cf-mitigated: challenge`. Die Ablehnung geschieht vor Artikelparser und
Titelprüfung. Der Wechsel des aktiven Auftrags „Nike Neu“ von zehn auf
60 Sekunden verhindert die nächste Ablehnung nicht. Ein einzelner Vergleich
mit regulärem Chrome erhält ebenfalls eine Prüfseite. Dieser Vergleich beendet
die Antwort vor Ausführung und prüft keine manuelle Freigabe.

Eine konkrete IP-Sperre, der Abrufrhythmus als alleinige Ursache oder eine
Regression im letzten Botupdate sind nicht nachgewiesen. Der aktuelle Bot
probiert erkannte Prüfseiten alle fünf Minuten erneut. Auch gespeicherte
`blocked`-Zustände werden derzeit wieder geprüft.

## Gewählter Zugriffspfad

Der Bot erhält eine eigene persistente Chrome-Sitzung. Er lädt seine vorhandenen
Katalogadressen in dieser Sitzung und verarbeitet erfolgreiche Antworten mit
dem bestehenden Parser und der bestehenden revisionsgesicherten Speicherung.
Bei einer erkannten Prüfseite stoppt er sämtliche automatischen Vinted-Abrufe.
Ein Betreiber kann dieselbe Sitzung im Adminbereich öffnen und eine angebotene
Prüfung selbst bedienen. Erst ein erfolgreich geladener und angenommener
Katalogabruf hebt die Pause auf.

Weiteres Verlangsamen allein ist bereits ohne Erfolg getestet. Ein bloßer
Wechsel zu einem frischen Browser reicht ebenfalls nicht als Reparaturnachweis.
Die geprüfte Vinted-Pro-Dokumentation belegt keinen allgemeinen Ersatz für die
Markensuche. Deshalb wird der vorhandene Bot um diesen begrenzten Zugriffspfad
ergänzt. Eine automatisierte Challenge-Lösung, wechselnde Browseridentitäten
oder Proxyrotation sind kein Bestandteil.

## Browser und Transport

- `services/sniper` startet einen regulären Chrome-Prozess unter Xvfb. Die
  bestehenden Chrome-, Sandbox- und Desktopsteuerungsmuster des Marketplace-
  Workers dienen als Vorlage; dessen Kontositzungen und Profile bleiben getrennt.
- Ein eigenes Profil unter `/var/lib/flipbase-sniper/browser` bleibt über
  Containerneustarts erhalten. Es gehört dem unprivilegierten Dienstnutzer;
  Verzeichnisrechte sind `0700`, sensible Profildateien werden nicht exportiert.
  Ein Prozess besitzt das Profil. Fehlgeschlagene Starts oder Profilkonflikte
  melden einen Fehler und starten keine zweite Sitzung.
- Chrome wird erst bei Bedarf gestartet. Der Prozess-Healthcheck bleibt ohne
  Vinted-Zugriff möglich. CDP lauscht ausschließlich auf Loopback und wird
  weder über Caddy noch über den Adminbereich erreichbar.
- Als lokaler CDP-Leser wird die bereits im Projekt verwendete Playwright-
  Version `1.63.0` übernommen. Chrome startet regulär, ohne Playwright-Launch,
  User-Agent-Überschreibung oder Navigator-Manipulation.
- Der Transport liefert Status, relevante Antwortheader und HTML an den Bot.
  Chrome verwaltet seine Cookies selbst. Es gibt keinen Cookieexport und
  keinen HTTP-Fallback bei einer Ablehnung.
- Automatische Abrufe verwenden dieselben Kategorie-, Marken-, Preis- und
  Titelbedingungen sowie denselben Parser. Katalog- und Kategorieabrufe
  teilen das vorhandene Budget, die Zeitlimits und die Mindestabstände.
  Automatische Dokumentabrufe enden nach Erfassung der Antwort ohne Ausführung
  des gelieferten Seitencodes. Nur in der manuellen Sitzung läuft die normale
  Seitendarstellung einschließlich JavaScript und Cookies.
- Eine einzelne Abruf-/Sitzungssperre verhindert parallele Katalognavigationen,
  Kategorieabrufe und manuelle Bedienung. Browsernebenanfragen dürfen keine
  weiteren automatischen Katalogabrufe oder Wiederholungsschleifen auslösen.

## Pause und Wiederaufnahme

1. Ein bestätigtes `cf-mitigated: challenge` oder die bestehende bestätigte
   Prüfseitenerkennung setzt `sniper_origin_state` auf `blocked`, ohne automatische
   Ablaufzeit, mit Grund `interaction_required`. Ein vorhandenes `Retry-After`
   wird als frühester Zeitpunkt einer manuellen Navigation gespeichert; dessen
   Ablauf hebt die Sperre nicht auf. Die vorhandenen Fehler- und Abrufdaten
   bleiben sichtbar.
2. Scheduler und Kategorieauffrischung respektieren diesen Grund dauerhaft.
   Bestehende alte Sperren behalten ihre bisherige Behandlung. Andere 403,
   HTTP 429 mit `Retry-After` und vorübergehende Serverfehler behalten ihren
   bisherigen Rückstau. Die Kategoriefehlerbehandlung muss auch die neue
   dauerhafte Pause speichern können.
3. „Vinted-Zugriff prüfen“ öffnet ausschließlich bei `interaction_required`
   eine exklusive, zehn Minuten gültige Betreibersitzung. Automatische Abrufe
   sind währenddessen angehalten. Ohne aktiven Suchauftrag meldet der Dialog
   einen verständlichen Hinweis und startet keine Vinted-Navigation.
   Vorhandene Mindestabstände und Anbieterwartezeiten gelten auch beim Öffnen.
4. Der Bot trennt während der manuellen Bedienung seine CDP-Steuerung. Der
   Betreiber sieht Bildschirmbilder des regulären Browsers und bedient ihn
   über native Maus- und Tastaturereignisse. Eine Challenge wird ausschließlich
   durch den Betreiber bedient. Eine Navigation startet nur zur vom Bot
   ermittelten Katalogadresse; es gibt keine API für beliebige Zieladressen.
5. „Zugriff erneut prüfen“ beendet die manuelle Bedienung und veranlasst genau
   einen kontrollierten Abruf des aktuellen aktiven Auftrags unter demselben
   Budget und Abstand. Nur eine Antwort ohne Prüfseite, die als Katalog
   erfolgreich geparst und durch die bestehende `completeRun`-Speicherung
   angenommen wurde, erlaubt die Wiederaufnahme.
6. Die Freigabe erfolgt nach der revisionsgesicherten Speicherung. Das bisherige
   Freigeben einer Probe unmittelbar nach dem Transporterfolg reicht hierfür
   nicht. Ändern sich Filterrevision, Aktivierung oder Auftrag während der
   Prüfung, wird die Antwort verworfen und die Pause bleibt bestehen.
7. Abbruch, Ablauf, Neustart, Browserfehler, erneute Prüfseite oder ein
   Speicherfehler lassen die manuell erforderliche Pause bestehen. Der
   Betreiber kann erneut öffnen. Ein Klick allein setzt keine Sperre zurück.

Die vorhandenen Datenbankfelder reichen hierfür aus. Es sind keine
Schemaänderungen, Migrationen oder manuell geänderten generierten Typen geplant.
Ausgangszustände nach einem Neustart werden aus der Datenbank gelesen; eine
inzwischen verlorene manuelle Sitzung wird niemals als Freigabe interpretiert.

## Adminoberfläche und API

Die Seite `platform-admin/pages/sniper-operation` zeigt bei einer Prüfseite
„Manuelle Prüfung erforderlich“ und den Knopf „Vinted-Zugriff prüfen“.
Das bestehende Seitenlayout bleibt erhalten. Ein eigener Dialog zeigt den
Browser, Restlaufzeit, verständliche Fehler sowie „Zugriff erneut prüfen“ und
„Schließen“. Persönliche Kontoaktionen werden nicht eingebunden. Ein eigener
Feature-Service spricht die Bot-API an; UI-Komponenten laden keine Botdaten direkt.

Eine kleine API unter `/sniper-browser/` bietet Sitzungsstatus, Öffnen,
Bildschirmbild, Eingabe, kontrollierte Prüfung und Schließen. Jeder Aufruf
validiert das Supabase-Bearer-Token und prüft `is_platform_operator` mit dem
Token des Aufrufers. Service-Role-Zugriff ersetzt keine Rollenprüfung.
Eingaben sind zusätzlich an Betreiberkennung und zufällige Sitzungskennung
gebunden. Ein zweiter Betreiber erhält einen belegten Sitzungsstatus.

Bildschirmbilder werden mit autorisiertem Fetch geladen und als temporäre
Blob-URL dargestellt. Tokens stehen nicht in URLs. Antworten verwenden
`Cache-Control: no-store`. Ungültige Tokens liefern 401, fehlende Rechte 403,
veraltete/belegte Sitzungen 409 und überschrittene Größenlimits 413.
Eingaben sind begrenzt auf normalisierte Mauskoordinaten, begrenzten Text ohne
Steuerzeichen und eine feste Liste notwendiger Tasten. Es gibt keine Shell-,
Datei-, CDP- oder Profilzugriffe über die API. Eingaben und Anbieterseiten werden
nicht protokolliert. Der Dialog räumt Timer und Blob-URLs beim Schließen auf.

## Betrieb und betroffene Bereiche

Der Bot behält Hostnetzwerk und seinen privaten Healthcheck auf
`127.0.0.1:8080`. Die Browser-API bindet konfigurierbar an die private
Docker-Bridge-Adresse, produktiv derzeit `172.18.0.1:8081`. Caddy leitet
`app.flipbase.de/sniper-browser/*` dorthin. Der Port wird nicht auf einer
öffentlichen Adresse geöffnet; Rollenprüfung bleibt unabhängig vom Proxy nötig.

Der Botbau übernimmt das vorhandene Debian-/Chrome-Muster. Compose ergänzt
das dedizierte Profilvolume, Xvfb-/Chrome-Temporärspeicher, den vorhandenen
Chromium-Seccomp-Vertrag und passende Ressourcenlimits. Der Bot läuft weiterhin
unprivilegiert, mit schreibgeschütztem Root-Dateisystem und ohne Docker-Socket.
Der Serverpfad, Profilbesitz und Seccomp-Datei werden vor einem Release geprüft;
fehlende Voraussetzungen führen zu einem klaren Startfehler.

Betroffen sind Bottransport, Scheduler/Fehlerbehandlung, Browsersteuerung und
API unter `services/sniper`, die bestehende Adminseite mit eigenem Dialog und
Service sowie Bot-Dockerbau, Compose und Caddy. Gemeinsame bestehende
Marketplace-Module werden nicht breit umgebaut. Der produktive Nike-Auftrag
bleibt auf 60 Sekunden, andere Suchaufträge bleiben deaktiviert.

## Prüfungen und Abnahme

- Botregressionen für dauerhafte Challenge-Pause, keine Kategorie-Nebenprobe,
  Neustartverhalten, unverändertes 429-/403-Verhalten und gemeinsame Abrufsperre.
- Tests mit synthetischen Antworten für erfolgreichen Katalog, erneute
  Prüfseite, abgelaufene Sitzung, Browserfehler, Speicherfehler und verworfene
  Filterrevision. Freigabe darf ausschließlich nach angenommener Speicherung
  erfolgen.
- API-Tests für Authentifizierung, Betreiberrolle bei jedem Endpunkt,
  Sitzungsbesitz, Exklusivität, Ablauf, Größen- und Eingabegrenzen.
- Angular-Tests für Status, Öffnen/Schließen, Fehler und Ressourcenbereinigung;
  betroffene Format-/Lint-Prüfungen, Typprüfung, Anwendungsbau und passende
  vorhandene Accessibility-Prüfungen.
- Isolierter Image-Smoke und lokaler Browser-/API-Test mit synthetischen
  Seiten. Tests erzeugen keine Vinted-Anfragen und übernehmen keine
  Produktionsprofile oder Zugangsdaten.

Nach diesen Prüfungen folgt der vorgeschriebene PR-Freigabeschritt. Produktive
Veröffentlichung und Änderungen an Serverdateien erfolgen erst mit der
Releasefreigabe. Anschließend muss der Betreiber die tatsächlich angebotene
Prüfung selbst abschließen. Abnahme: ein gültiger aktiver Katalog wird angenommen,
Artikel werden gespeichert und mindestens zehn weitere reguläre Abrufe folgen
im 60-Sekunden-Takt; eine erneute Prüfseite stoppt unmittelbar alle automatischen
Abrufe. Lokale Tests allein belegen keinen wiederhergestellten Vinted-Zugang.

Auch dieser Weg garantiert keine dauerhafte Anbieterfreigabe. Falls Vinted die
legitime manuelle Sitzung weiterhin ablehnt, bleibt der Bot pausiert und meldet
den konkreten Befund, statt Erfolg oder eine umgangene Sperre zu behaupten.

## Quellen

- [Cloudflare: Prüfseiten erkennen](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)
- [Cloudflare: unterstützte Browser](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)
- [Cloudflare: Prüfseiten bearbeiten](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/)
- [Vinted-Pro-API](https://pro-docs.svc.vinted.com/)
