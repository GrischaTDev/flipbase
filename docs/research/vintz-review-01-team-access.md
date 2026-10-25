# Schritt 1: Teamrechte und Einladungen gemeinsam bewerten

18.10.2026, Juna. Erster Entscheidungsschritt zu B01 des
[Gesamtplans](vintz-flipbase-priority-plan.md).
**Status: Vom Nutzer vorerst zurückgestellt und hinten eingeordnet.**
Die Vorschläge bleiben dokumentiert; keine Variante oder Umsetzung freigegeben.
Zunächst wählt der Nutzer einen anderen Punkt aus dem Gesamtplan.

## Maßstab und Belege

Flipbase bleibt ein eigenständiges Produkt. Vintz dient als Vergleich, nicht
als Vorgabe für Rollen, Navigation, Gestaltung oder Arbeitsabläufe. Technische
Verbesserung und optionale neue Produktfunktion werden getrennt bewertet.

Erneut gelesen: [Teamvergleich V-16](vintz-settings-team-comparison.md) und
aktueller Flipbase-Mitgliederservice bei HEAD
`8cef6b78ad34b9cbecf7c81be728d5e34883319a`. Keine neue Vintz-Browsersitzung;
Vintz-Aussagen stammen aus der datierten Oberfläche und geladenen Webquellen
vom 18.10.2026. Kein echter Teambeitritt, Rollenwechsel, Rechteentzug oder
Versandtest. Die frühere Rechteprüfung ist kein neuer vollständiger Serveraudit.

## Gegenüberstellung

| Thema                       | Vintz-Befund                                                                                                                                        | Flipbase-Befund                                                                                   | Empfehlung, noch nicht beschlossen                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Rollen                      | Owner, Admin, Mitarbeiter und Nur-Lesen im geladenen Code; tatsächliche Serverdurchsetzung nicht getestet                                           | Inhaber, Administrator, Einkauf, Logistik, Steuerberatung und Nur-Lesen                           | Eigene fachliche Rollen behalten. Anzahl und Namen nicht an Vintz angleichen.                                                            |
| Verlässliche Rechte         | UI beschreibt Seitenfreigaben; Serverwirkung offen                                                                                                  | V-16 belegt konkrete Schreibpfade ohne fachliche Rollenprüfung                                    | Bestehende Rechtezusagen gezielt überprüfen und durchsetzen. Das ist eine Verbesserung unserer vorhandenen Funktion, kein Kopierauftrag. |
| Einladungen                 | Reguläre Einladungs-/Annahmewege im Webcode; Zustellung nicht selbst getestet                                                                       | Aktuell gelesenes `inviteMember()` ergänzt nur lokalen Zustand, Widerruf ebenso                   | Tatsächliche Einladung mit Status oder ehrlicher Hinweis auf den unfertigen Weg; kein behaupteter Versand ohne Versand.                  |
| Kontofreigabe               | Ausgewählte Konten werden dem Teamworkspace zugeordnet; nicht ausgewählte bleiben privat. Individuelle Kontoauswahl pro Mitglied nicht nachgewiesen | Bestehender Workspace als gemeinsame Grenze                                                       | Zusätzliche Kontofreigabe nur bei Bedarf. Kein zweiter Teamworkspace oder geänderter Kontobegriff allein wegen Vintz.                    |
| Seitenfreigabe              | Mitarbeiter-/Leserollen können ausgewählte Seiten erhalten                                                                                          | Fachrollen bilden Aufgabenbereiche bereits ab                                                     | Vorhandene Rollen zuerst verständlich und wirksam machen; freie Einzelrechte wären ein optionaler späterer Ausbau.                       |
| Speicher-/Fehlerrückmeldung | Kontext wird nachgelesen; Widerrufwirkung nicht praktisch bestätigt                                                                                 | Rollen/Entfernen werden lokal vor Serverbestätigung geändert, ohne Rücknahme im gelesenen Service | Bestätigten Stand anzeigen beziehungsweise bei Fehler zurücknehmen. Aktuelle Benutzer und Serverfehler berücksichtigen.                  |

Aktuelle Quellen: [Einladen](../../src/app/core/services/workspace-member.service.ts#L151),
[Rollenänderung/Entfernen](../../src/app/core/services/workspace-member.service.ts#L194).
Der eigentliche Rollen-/Serverbefund und seine Suchgrenzen stehen in V-16.
Die echten Betreiber-Betaeinladungen sind ein anderer, bereits angebundener
Ablauf und dürfen nicht mit Workspace-Team-Einladungen verwechselt werden.

## Sinnvoller Kern, unabhängig vom Vintz-Design

Empfehlung von Juna, noch keine Nutzerentscheidung:

1. Die sechs bestehenden Fachrollen als Ausgangspunkt erhalten. Gemeinsam
   klären, wer tatsächlich welche Daten lesen, bearbeiten und exportieren darf.
   Eine Nur-Lese-Rolle bedeutet nicht automatisch Zugriff auf alle sensiblen
   Bereiche; Umfang gesondert festlegen.
2. Vereinbarte Rechte bei jeder betroffenen Serveraktion durchsetzen, nicht
   bloß Buttons ausblenden. Inhaber und letzte verantwortliche Person vor
   unbeabsichtigtem Aussperren schützen.
3. Einladung wirklich speichern und mit erkennbarem Zustand anbieten:
   offen, angenommen, abgelaufen oder widerrufen. Kein sichtbarer Demo-Eintrag
   als echte Einladung. Konkrete Laufzeit später gemeinsam festlegen.
4. Rollenänderung, Entfernen und Widerruf erst als bestätigt darstellen, wenn
   sie wirksam sind. Fehler dürfen keinen scheinbar geänderten Zugriff zeigen.

Der Kern kann zunächst auf den vorhandenen Workspace beschränkt bleiben.
Konten-/Seiten-Einzelrechte sind dafür kein zwingender zusätzlicher Umfang.

## Optional aus Vintz übernehmen

- Einzelne Verkaufskonten für Teamarbeit auswählen, wenn persönliche und
  gemeinsam bearbeitete Konten innerhalb unseres Modells getrennt werden sollen.
- Bestimmte Seiten freigeben, falls die festen Fachrollen den Alltag nicht
  ausreichend abdecken. Das erhöht Pflege- und Erklärungsaufwand.
- Persönlichen und gemeinsamen Bereich stärker sichtbar unterscheiden,
  sofern Nutzer dabei tatsächlich Orientierung benötigen.

Diese Optionen verändern das Zugriffsmodell. Sie werden nicht beiläufig an
eine technische Korrektur angehängt. Vintz' vorausgewähltes Konto und vier
Rollen werden nicht als Voreinstellung vorgeschlagen.

## Eigene zusätzliche Idee

**Vor Einladung oder Rollenänderung eine lesbare Zugriffszusammenfassung zeigen.**
Beispiel zur Diskussion, keine bereits beschlossene Rollenregel:

> Diese Person darf Artikel für den Versand sehen und Packschritte bearbeiten.
> Einkaufspreise, Gewinne, Käuferchats und Teamverwaltung sind nicht freigegeben.

Die Zusammenfassung würde aus denselben Regeln wie die tatsächliche Prüfung
entstehen. Sie könnte Rolle, Workspace und gegebenenfalls Kontenauswahl nennen
und vor Änderungen den Unterschied zeigen. Dafür ist kein umfangreicher
Rechtebaukasten erforderlich. Ein möglicher Vorteil gegenüber beiden bisher
untersuchten Darstellungen; nicht als bewiesene neue Markteinzigartigkeit
oder garantierte Verbesserung ausgeben.

## Entscheidung und weiterer Ablauf

Offen für den Nutzer: Kernumfang anpassen, optionale Konten-/Seitenfreigaben
bewerten und die Idee der Zugriffszusammenfassung annehmen, ändern oder weglassen.
Auch Zurückstellen des ganzen Teamthemas ist möglich; bestätigte bestehende
Rechtelücken bleiben dann als offene Befunde sichtbar.

Nach der Rückmeldung die genaue Entscheidung protokollieren. Eine fachliche
Zustimmung ist nicht automatisch eine Freigabe für Implementierung, Versand,
Rollenänderung oder Veröffentlichung. Den gewünschten nächsten Modus anhand
der Rückmeldung bestimmen, bei Unklarheit klären. Keine automatische
Fortsetzung zu B02 und keine stillschweigende Komplettfreigabe.

Nur Dokumentation. Markdown, lokale Verweise und Unterschiedskontrolle geprüft;
keine Anwendungstests und keine produktive Aktion. Stopp zur Entscheidung.
