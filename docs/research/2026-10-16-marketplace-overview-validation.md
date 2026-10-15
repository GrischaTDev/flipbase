# Lokale Abnahme der Marktplatzübersicht

Stand: 16.10.2026. Umfang: Paket A, Branch juna/marketplace-overview.

## Gelieferter Umfang

- Gemeinsame Übersicht unter /marketplaces/overview; /marketplaces leitet dorthin.
- Sichtbarkeit persönlich je Benutzer und Workspace, serverseitig gespeichert.
  Fehlgeschlagene Änderungen werden zurückgenommen; alte Browserauswahl wird
  einmalig einem Benutzer und Workspace zugeordnet. Sie ändert keine Freigaben
  und stoppt keine bestehenden Hintergrundaufträge.
- Vorhandene Vinted- und persönliche eBay-Accounts mit getrennten Inseratlisten.
  Bekannte Gesamtzahlen, gespeicherte Teilbestände und unbekannte Angaben werden
  unterschieden. Standardseite 25, höchstens 100 Einträge.
- Vinted-Suche und Statusfilter erfassen die gespeicherte Lesekopie. Die eBay-API
  unterstützt diese Filter derzeit nicht; deshalb werden sie dort nicht angeboten.
- Auswahl gilt nur für sichtbare Zeilen des betreffenden Accounts. Kontext-,
  Account-, Filter- und Seitenwechsel löschen die jeweils betroffene Auswahl.
- Vorhandene Detail-, eBay-Bearbeitungs- und Erstellungswege werden wiederverwendet.
  Vinted benötigt weiterhin die bestehende Freigabe und einen geladenen Account.
- Kleinanzeigen zeigt die vorhandenen Entwürfe. Kontoabgleich und Übertragung
  folgen in Paket B/C. Gebührenstopp und Kontingentprüfung gehören zu diesem
  späteren Veröffentlichungsweg; Paket A veröffentlicht keine Inserate.

## Tatsächlich ausgeführte Prüfungen

| Prüfung                                        | Ergebnis                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| npm test                                       | 5.287 bestanden: Node 2.461, DOM 347, Angular 2.479                                           |
| Neue SQL-Zugriffsfälle                         | 14 bestanden, auch nach vollständigem Neuaufbau aus der erzeugten Migration                   |
| Neue Browserfälle                              | 21 bestanden; Filter/Auswahl und Workspacewechsel jeweils in acht Breite-/Theme-Kombinationen |
| Bestehende Account-/Einstellungsfälle          | 29 bestanden; vier zunächst fehlerhafte Fälle nach gezielter Testkorrektur bestanden          |
| Bestehende Sidebar-/Listing-Studio-Fälle       | 6 bestanden gegen eigenes lokales Backend                                                     |
| Test- und Schemaregistrierung                  | 4 bestanden                                                                                   |
| Suite-Audit / gemeinsame UI-Bausteine          | bestanden, keine UI-Befunde                                                                   |
| Gezieltes ESLint und Prettier / Typprüfung     | bestanden                                                                                     |
| Produktionsbau einschließlich Angular-Vorlagen | bestanden                                                                                     |

Browser: lokale ruhende Produktionsvorschau, Chromium, 320/390/834/1440 Pixel,
Hell/Dunkel, Touch, Tastatur und AXE. Eigene synthetische Daten und eigene lokale
Supabase; keine echten Marktplatzkonten angesprochen. Der Browser-Plugin mit
browser-Skill war nicht verfügbar; vorhandenes Projekt-Playwright verwendet.

Vier vorhandene Accounttests lasen Kontrast während der Dialoganimation oder
fanden den Status gleichzeitig in Karte und Dialog. Die Tests warten nun auf den
fertigen Dialog und sprechen die betreffende Karte eindeutig an. Keine
Kontrastschwellen oder Funktionsprüfungen wurden gelockert.

## Entscheidungen und Abweichungen

1. Vorhandenen eigenen Worktree wiederverwendet und ausschließlich origin/master
   integriert. Fremde Zweige und Änderungen blieben unberührt.
2. Aufgabenüberschriften für den Ausführungshelfer auf Task 1–4 vereinheitlicht.
   Das ändert keinen Produktumfang.
3. Die Anmeldung und der Workspace steuern das Laden über einen eigenen
   MarketplaceSettingsContextService; Persistenz bleibt im bisherigen
   Settings-Service. Risiko: zusätzliche zentrale Anbindung; gesamte Anwendungssuite
   und reale Navigation wurden deshalb geprüft.
4. Der bisherige Vinted-Lesepfad liefert keine verlässliche externe Kennung und
   keinen vollständigen Suchraum. Ein zusätzlicher Lesepfad im bestehenden
   Marktplatzdienst nutzt dieselbe geschützte Datenquelle. Plattformabrufe sind
   getrennt, damit ein Fehler die andere Plattform nicht blockiert.
   Risiko: zusätzliche Abfragelogik; Cursor, Kennungen, Filter und Seitenumfang
   sind eigens geprüft.
5. Der Datenbankvergleich ließ geerbte Standardrechte bestehen. Ein zweiter,
   ebenfalls erzeugter Rechtevergleich ergänzt die neue Migration. Unveränderte
   Zugriffstests bestanden nach erneuter Datenbankinitialisierung.
6. Komponentenverhalten über Browserfälle statt doppelter JIT-Komponententests
   geprüft. Store- und Modelltests prüfen Kontext, Auswahl und verspätete Antworten;
   der Bau prüft Vorlagen. Risiko: UI-Verhalten benötigt den Browserlauf.
7. Bestehende Accounttests wie oben beschrieben stabilisiert. Risiko:
   Unterschiede während Animationen werden nicht als fertiger UI-Zustand bewertet.
8. Vinted-Erstellung aus der Übersicht setzt einen erfolgreich geladenen,
   berechtigten Account voraus. Folge: zuerst einen Account verbinden;
   vorhandene direkte Editorwege bleiben bestehen.

## Grenzen

Diese Abnahme lief unter Windows. Die verbindlichen CI-Prüfungen und deren
Linux-Umgebung stehen vor einer Integration noch aus. Der Bau meldet bestehende
Warnungen zu Vorlagen, anfänglicher Paketgröße und pako. Ein Test gegen echte
Anbieter sowie Veröffentlichungs-, Gebühren- und Kontingentabläufe sind keine
Aussage dieser Abnahme.

## Abschließendes Review

Unabhängige einmalige Prüfung des gesamten eigenen Änderungsstands durchgeführt.
Kein kritischer Befund. Folgende Fehler in einem gemeinsamen Korrekturdurchgang
behoben und jeweils erst fehlschlagend, danach erfolgreich geprüft:

- Plattformfehler erneut laden, ohne Auswahl, Seite und geöffneten Zustand der
  anderen Plattform zu löschen. Eigener Storetest und Browserablauf mit eBay-Auswahl.
- Nach fehlgeschlagenem Erstabruf auch auf der bestehenden Einstellungsseite
  erneut laden können. Eigener Servicetest und Browserablauf bis zu wieder
  bedienbaren Schaltern.
- Den vom bestehenden Anbieter bereits unterstützten Sandbox-Ansehen-Link
  beibehalten. Eigener Normalisierungstest; ausschließlich die konkrete
  Sandbox-Domain ergänzt.

Den Sandboxbefund nach seiner Wirkung als Funktionsfehler bewertet: Ein
unterstützter Account darf seine gesamte Ansehen-Aktion nicht verlieren. Risiko
der Korrektur: genau eine zusätzliche erlaubte Anbieter-Domain. Keine offenen
kleinen Reviewbefunde zurückgestellt.

Die vom Reviewer ausgeschlossenen Kleinanzeigen-Funktionen bleiben bewusst in
Paket B/C: Hier gibt es noch keine Anbieter-Veröffentlichung und damit noch
keine aktive Kontingent- oder Gebührenausführung.

Nach dem Korrekturdurchgang die vollständige Anwendungssuite (5.287), Bau,
Typprüfung, Formatierung und Lint erneut erfolgreich ausgeführt. Abschließende
Browserprüfung: 23 bestanden (21 neue Fälle und zwei bestehende Einstellungsfälle).

## Abgleich mit dem Hauptzweig

Zum Abschluss origin/master bei ba0dcfea (PR 424) in den eigenen Zweig integriert.
Der Überschneidungskonflikt betraf ausschließlich das Änderungsprotokoll; beide
Einträge wurden erhalten. Die hinzugekommenen Änderungen betreffen die öffentliche
Startseite. Dateiinhalt von Anwendung, Supabase und Browserfällen gegenüber dem
bereits geprüften eigenen Stand unverändert nachgewiesen; zusätzliche 45
Landing-Tests bestanden. Kein Push, PR, Merge auf master oder Deployment ausgeführt.
