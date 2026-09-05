# Landingpage: Abgleich mit dem integrierten Stand

Stand: `origin/master` bis `a2ccddb`, geprüft am 04.09.2026. Statischer Abgleich; keine rechtliche Freigabe und keine Änderung der fremden Landingpage-Arbeit.

## Bestätigte Abweichungen

- **Beta-Ablauf:** Beide Formulare in `landing/index.html` senden die E-Mail direkt an `/auth/register`. Die Registrierung übernimmt sie und ruft `AuthService.signUp` auf. Die Texte versprechen dagegen eine Anfrage und spätere Einladung in Gruppen. Vor Freigabe muss entschieden werden, ob Registrierung oder geschlossene Warteliste gewünscht ist. Keine Warteliste stillschweigend implementieren.
- **Deal-Sniper:** Die Roadmap kennzeichnet den Dienst als „In Entwicklung“. Die Funktionskarte und FAQ versprechen gleichzeitig sofortige Benachrichtigungen und Ein-Klick-Import. Der integrierte Stand enthält den Collector-Dienst, aber nicht den vollständigen beschriebenen Nutzerablauf. Diese Aussagen müssen als geplant gekennzeichnet oder nach Fertigstellung belegt werden.
- **Rechtstexte:** Die Registrierung zeigt `AUTH.TERMS_PLACEHOLDER` und einen Hinweis auf noch ausstehende verbindliche Bedingungen. Die Datenschutzhinweise der App sind ebenfalls Platzhalter. Die statische Datenschutzerklärung ist eine andere Fassung. Eine technische Zusammenführung ersetzt keine inhaltlich geprüften Texte.
- **Datenschutzversprechen:** „DSGVO-konform“, „ohne US-Datentransfer“ und konkrete Rechenzentrumsstandorte sind durch den Code allein nicht belegbar. Für die Prüfung werden tatsächliche Dienstleister, Verträge, Speicherorte, Mailversand, Analysewerkzeuge und Betriebsabläufe benötigt. Keine pauschale Zusicherung aus einer lokalen Codeprüfung ableiten.
- **Versionsanzeige:** Die Landingpage nennt fest „0.1“, während die App-Version aus GitVersion kommt. Entweder Beta ohne feste Versionsnummer benennen oder beide Anzeigen aus derselben Quelle erzeugen.

## Erhalten

FAQ-Akkordeon, responsive Gestaltung, Sprach-/Designumschalter, Logo, Registrierungs-Vorausfüllung und die Änderungen von Gemini bleiben beim Merge erhalten. Kein unaufgeforderter visueller Neuaufbau.

## Lokaler Browsernachweis

Über einen getrennten Caddy-Testcontainer auf `http://127.0.0.1:4180/` geprüft: HTTP 200, korrekter Seitentitel, keine rohen Vorlagenbefehle, keine Konsolenfehler und keine fehlgeschlagenen Asset-Anfragen. FAQ lässt sich per Enter umschalten; der Sprachwechsel zeigt die englische Überschrift. Designwechsel wurde nach Abschluss der CSS-Übergänge geprüft.

- Desktop 1440 × 1000, hell/deutsch: AXE meldet unzureichenden Textkontrast an 15 Elementen, unter anderem orange Beschriftungen und gedämpfte Fußzeilentexte.
- Mobil 390 × 844, dunkel/englisch: horizontale Überbreite; der Anmeldebutton im Kopf wird abgeschnitten. AXE meldet zusätzlich unzureichenden Kontrast bei inaktiver Sprachanzeige und Fußzeile.
- Keine Formulare abgesendet oder externen Konten angelegt. Dies ist keine WCAG-Freigabe; die Befunde bleiben offen für die gesonderte Landingpage-Korrektur.

## Weiterer Prüfumfang

Nach Abschluss der fachlichen Fehlerkorrekturen: bestätigte Kontrast- und Mobilprobleme korrigieren, Rechtstexte sowie den gewünschten Beta-Ablauf klären und anschließend beide Sprachen/Designs erneut prüfen. Ein Angular-Build allein prüft die eigenständig ausgelieferte Landingpage nicht.
