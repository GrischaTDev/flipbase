# Vinted: Anmeldung nach manuellem Browserstart wieder verfügbar

Stand: 1. Oktober 2026. Auftrag: wiederkehrende Verbindungs- und Anmeldefehler
prüfen, obwohl das Konto im manuellen Serverbrowser bereits angemeldet ist.
Dieses Review verändert weder Anwendung noch produktive Konten.

## Ergebnis

Der gemeldete Ablauf ist in den produktiven Auftrags- und Sitzungsdaten
nachweisbar. Der heutige fehlgeschlagene Profilabruf erhielt tatsächlich
HTTP 401 von Vinted; der Cloudbrowser war dabei bereits gestartet. Nach einer
manuellen Browsersitzung gelang der nächste Datenabruf. Die Daten bestätigen
keine dauerhaft verlorene Anmeldung und keinen notwendigen Passwortwechsel.

Eine konkrete Lücke liegt in Flipbase: Der Import prüft die Sitzung unmittelbar
nach `domcontentloaded`, beendet sich bei der ersten 401-Antwort und fordert
eine Neuanmeldung. Eine begrenzte Prüfung nach Abschluss der Seiteninitialisierung
oder einmaligem Neuladen fehlt. Der manuelle Weg lässt der Seite hingegen Zeit
und kann die Identität erneut prüfen. Eine lokale Browserprobe reproduziert
genau diese Lücke ohne Eingabe von Zugangsdaten.

**Noch nicht nachgewiesen:** Ob beim echten Konto eine verzögerte
Vinted-Sitzungsaktualisierung, ein veralteter gespeicherter Profilstand oder ein
anderer Anbieterzustand die vorübergehende 401 auslöst. Die vorhandenen Logs
enthalten dafür zu wenig Metadaten. Die lokale Probe bildet eine mögliche
Ursache nach; sie beweist keinen bestimmten internen Vinted-Mechanismus.

## Geprüfter Stand

- Lokale Hauptarbeitskopie: `08c94058`.
- Vorhandener aktueller `origin/master`: `a987e304`.
- Tatsächlich laufender Worker: Image aus `e753200e8a5aac72945e0af150fd8e4b80dff544`,
  Container `running` und `healthy`.
- Cloudbrowseradapter und Identitätsleser sind zwischen laufendem Worker und
  aktuellem `origin/master` unverändert. Der neuere Import ergänzt unter anderem
  Anbieterpausen, Wartezeiten und Anfragezählung, aber keine Sitzungswiederherstellung.
- Der neue Dispatcher für geplante Abrufe ist damit noch nicht der laufende Worker.
  Sein geplanter Umgang mit 401 ist ein zusätzlicher Review-Befund, kein heutiger
  Produktionsnachweis.

## Produktionsnachweise

Alle Uhrzeiten in Europe/Berlin. Gelesen wurden ausschließlich feste
Diagnosemetadaten und SQL-Ergebnisse in einer `read only`-Transaktion.
Keine Passwörter, Tokens, Cookies oder Nachrichteninhalte wurden ausgegeben.

| Zeitpunkt am 01.10.2026 | Nachweis                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09:20:45–09:21:03       | Abruf scheitert bereits beim Browserstart. Die konkrete Unterursache fehlt im Log.                                                                                                                                           |
| 13:50:23–13:50:38       | Browserstart gelingt; Profilabruf scheitert mit `identity` und `requestFailure: unauthorized` (HTTP 401).                                                                                                                    |
| 13:51:32–13:52:12       | Separate Browsersitzung desselben Kontos, ohne zugeordneten Datenabruf, rund 39 Sekunden geöffnet und ordentlich beendet. Das passt zum beschriebenen manuellen Öffnen; eingegebene Zugangsdaten werden nicht protokolliert. |
| 13:52:21–13:53:02       | Nächster Datenabruf desselben Kontos erfolgreich einschließlich Speicherung und Browserbeendigung.                                                                                                                           |

Im gelesenen Siebentagefenster liegen 15 Aufträge: fünf erfolgreich, sieben mit
Identitätsfehler, zwei mit Browserstartfehler und einer mit Profilfehler.
Es gibt eine Vinted-Verbindung mit einem dauerhaft zugeordneten GoLogin-Profil.
Alle 43 gespeicherten Browsersitzungen sind geschlossen; anhand der gespeicherten
Start- und Stoppzeiten überschneiden sich keine Sitzungen desselben Kontos.
Das spricht gegen eine festhängende Flipbase-Sitzung oder wechselnde
Profilzuordnung. Fremde Starts direkt in GoLogin und die tatsächliche
Speicherdauer beim Anbieter sind damit nicht ausgeschlossen.

## Befunde im Code

1. **Hohe Priorität: erste 401 beendet den Abruf ohne Sitzungswiederherstellung.**
   `gologin-cloud-browser.ts` öffnet bei beiden Wegen die Startseite und wartet
   auf `domcontentloaded`. Das bestätigt weder fertige Seiteninitialisierung
   noch gültige Vinted-Sitzung. `readVintedAccountImport()` liest danach direkt
   `/api/v2/users/current`. `MarketplaceSyncRunner` übersetzt 401 in `identity`;
   `MarketplaceImportError` fordert ausdrücklich eine Neuanmeldung. Die manuelle
   Bestätigung kann dieselbe Identität später erneut lesen.

2. **Hohe Priorität vor dem nächsten Workerrollout: Automatik pausiert sofort.**
   Der neuere `SupabaseMarketplaceOperationStore.fail()` ordnet `unauthorized`
   dem Grund `needs_login` zu. `marketplace_sync_finish` deaktiviert dafür den
   Zeitplan. Ohne begrenzte Sitzungswiederherstellung könnte ein vorübergehender
   Startzustand somit auch automatische Abrufe dauerhaft unterbrechen.

3. **Mittlere Priorität: manuelle Identitätsprüfung vermischt Fehler.**
   `readVintedAccountIdentity()` liefert für unerwartete Herkunft, HTTP-Fehler,
   HTML statt JSON, Netzwerkfehler und verlorenen Browserkontext weitgehend
   denselben Wert `null`. Die Oberfläche kann dadurch eine Anbieter- oder
   Verbindungsstörung als Anmeldeproblem darstellen. Sichtbares Loginformular,
   abgelehnte Zugangsdaten und 2FA haben bereits eigene Zustände.

4. **Mittlere Priorität: Browserstartfehler sind zu wenig aufgeschlüsselt.**
   Der heutige Startfehler ist als `browser` erfasst. CDP-Verbindung,
   fehlender Starttab, Startseitennavigation, Profilzugriff und Anbietergrenzen
   lassen sich anhand dieses Protokolls nicht zuverlässig unterscheiden.
   Ein gesund laufender Worker bestätigt keinen erfolgreichen GoLogin-Start.

5. **Offene Anbieterfrage: Profil bereit nach dem Stoppen.**
   Flipbase schließt die CDP-Verbindung, sendet ausdrücklich
   `DELETE /browser/{profileId}/web` und gibt die Sperre erst nach erfolgreicher
   HTTP-Antwort frei. Es fehlt eine gesonderte Prüfung, ob das Profil beim Anbieter
   bereits vollständig gespeichert und wieder startbereit ist. Die gelesene
   GoLogin-Dokumentation betont diesen Zustand; sie belegt aber nicht, dass der
   verwendete DELETE-Endpunkt vor Abschluss der Speicherung antwortet. Deshalb
   keinen zusätzlichen API-Poll oder willkürliche Schlafpause auf Verdacht einbauen.

## Recherche bei GoLogin

- [Cloudbrowser-FAQ](https://support.gologin.com/en/articles/15737249-faq-web-app-cloud-browser):
  Inaktive Cloudbrowser bleiben bis zu 15 Minuten nach der letzten Aktion aktiv.
  Das betrifft den laufenden Browser, nicht automatisch die Gültigkeit der
  gespeicherten Vinted-Anmeldung.
- [Profilsynchronisierung](https://support.gologin.com/en/articles/14404855-profile-synchronization):
  Ordentlich beendete Profile speichern Cookies und Browserzustand; beim nächsten
  Start wird der gespeicherte Stand wiederhergestellt. GoLogin empfiehlt, den
  fertigen Zustand `Ready` abzuwarten und dasselbe Profil nicht gleichzeitig
  auf mehreren Geräten zu öffnen.
- [Cookies](https://support.gologin.com/en/articles/14361590-what-are-browser-cookies):
  Profile haben getrennte Cookies. Anbieterzugriff hängt zusätzlich von konsistentem
  Proxy und Geräteprofil ab. Ein konkreter IP-Wechsel ist hier nicht gemessen.
- [Cloud Browser API](https://gologin.com/cloud-browser/):
  Dokumentiert den in Flipbase verwendeten CDP-Endpunkt mit festem `profile`.
  Profile und Anmeldungen können über mehrere Browserläufe erhalten bleiben.
- [GoLogin SDK](https://github.com/gologinapp/gologin):
  Das lokale SDK besitzt Optionen zur Cookieübertragung. Flipbase verwendet
  diesen SDK-Startweg nicht; `uploadCookiesToServer` ungeprüft einzubauen wäre
  deshalb keine passende Korrektur für den vorhandenen Cloudadapter.

Es gibt keinen Nachweis, dass Flipbase sich aktiv bei Vinted abmeldet:
Der untersuchte Worker sendet keinen Logout, löscht keine Sitzungscookies und
ändert bei bestehenden Profilen nicht bewusst Proxy oder Geräteprofil.
Flipbase beendet Browser absichtlich nach Aufträgen beziehungsweise spätestens
nach Ablauf der zehnminütigen Sitzungsfreigabe. Dauerhaft offene Browser sind
für gespeicherte Logins nicht erforderlich und lösen diese Prüflücke nicht.

## Konkreter Korrekturvorschlag

1. Vor einer Neuanmeldeaufforderung nur bei einer initialen 401 einmal begrenzt
   die bestehende Sitzung auf der festen Vinted-Startseite wieder prüfen:
   laufende Navigation und Seiteninitialisierung berücksichtigen, bei Bedarf
   einmal neu laden und Identität erneut lesen. Vor jeder Aktion weiterhin
   Auftrag, Kontozugriff und Sitzungsfreigabe prüfen; kein unbegrenztes Polling.
   `load` allein ist ebenfalls kein Beweis für eine fertig aktualisierte Sitzung.
2. Nur eine bestätigte Identität des zugeordneten Kontos erlaubt Datenübernahme.
   Bleibt die Anmeldung ungültig oder erscheint Login/2FA, Abruf sauber beenden
   und nötige Nutzeraktion anzeigen. Fremde Identität niemals übernehmen.
3. 403, 429, Netzwerk-/Serverfehler und verlorenen Browserkontext getrennt
   behandeln. Anbieterablehnung und Wartezeit dürfen nicht durch einen neuen
   Browserstart oder Wiederholungen umgangen werden. Für diese Fälle keinen
   automatischen Passwortlogin starten.
4. Protokolle um feste Fehlerkategorien sowie Dauer und Ergebnis des
   Wiederherstellungsversuchs ergänzen. Keine Antworttexte, Zugangsdaten oder
   Browserverbindungs-URLs protokollieren. Den Speicher-/Bereitvertrag des
   Anbieter-Stopps gesondert nachweisen, bevor er geändert wird.
5. Gezielte Tests für verzögerte Sitzung, bleibende 401, 2FA, fremdes Konto,
   entzogenen Zugriff, 403/429 und unklaren Stopp. Danach echte Kontofreigabe
   über mehrere kalte Starts und längere Pausen prüfen. Den Worker aus dem
   geprüften PR anschließend separat ausrollen; eine Web-App-Veröffentlichung
   allein aktualisiert ihn nicht.

## Ausgeführte Prüfungen und Grenzen

- 27 vorhandene Worker-Tests für Identitätsleser und Kontoimport bestanden:
  `node --experimental-strip-types --test services/marketplace-worker/test/vinted-browser-reader.test.ts services/marketplace-worker/test/vinted-account-import.test.ts`.
- Echte lokale Chromium-Probe mit vollständig abgefangenen Requests: Die
  Testseite setzt ihren Sitzungszustand nach 1,5 Sekunden. Der direkte Import
  meldet `profile/unauthorized`, der direkte Identitätsleser bestätigt nichts.
  Nach dem Seitenzustandswechsel gelingt der Import mit bestätigter Identität
  und vier Quellabfragen. Keine Zugangsdaten eingegeben, kein echter
  Vinted-Aufruf und kein GoLogin-Profil gestartet. Verwendet wurde das bereits
  vorhandene Playwright aus der gebündelten Laufzeit; keine Abhängigkeit geändert.
- Laufendes Workerimage, redigierte Logzeilen und Datenbankmetadaten gelesen.
  Keine produktiven Aufträge gestartet, Zeitpläne geändert, Konten geöffnet,
  Browser beendet oder Dienste aktualisiert.
- Anwendung unverändert. Dieses Review liefert Befunde und einen konkreten
  Korrekturvorschlag; ein behobener Produktionsfehler ist noch nicht bestätigt.
