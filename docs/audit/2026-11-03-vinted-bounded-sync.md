# Begrenzte Vinted-Abrufe und verlässliche Verkaufsprüfstände

## Was der bisherige Teilstand bedeutet

Die drei produktiven Cloudkonten werden regelmäßig erfolgreich aktualisiert.
Nachrichten und Verkäufe melden dabei `partial`, jedoch keinen Fehler und
keine Anbietersperre. Der Import setzt diese beiden Statuswerte bisher fest,
auch bei einem leeren Postfach. Pro Durchlauf werden höchstens drei
Gesprächsdetails gelesen; Verkaufsbelege werden aus diesen Gesprächen und
gebundenen Transaktionsantworten abgeleitet.

Die vorhandenen Konten besitzen 19, 86 und 116 gespeicherte Gespräche.
Keines davon hat einen fehlenden Detailprüfzeitpunkt; alle besitzen den
bisherigen Verkaufsprüfstand der Version 2. Das beweist keine vollständige
Nachrichten- oder Verkaufshistorie und ist ebenso wenig ein Nachweis
fehlgeschlagener aktueller Abrufe.

## Ausdrücklich gewünschter Umfang

Der Nutzer möchte das begrenzte Hintergrundlesen erhalten. Keine vollständige
Postfachhistorie, kein Massennachimport und kein zusätzlicher Verkaufsfeed
auf Grundlage geratener Anbieterparameter. Die vorhandene leichte
Gesprächsliste und das gezielte Lesen beim Öffnen eines Chats bleiben die
Grundlage. Nach dem Live-Laufzeitvergleich hat der Nutzer fünf Detailversuche
im normalen Lauf und höchstens zehn bei Rückstand freigegeben. Rückstand
bedeutet mehr als fünf tatsächlich nachzuholende Gesprächsstände;
unveränderte frisch geprüfte ungelesene Gespräche allein erhöhen das Limit
nicht. Kein zusätzlicher historischer Vollabruf.

Ein Startbudget von 45 Sekunden begrenzt neue Abrufe der Detailphase.
Bereits gestartete GETs behalten ihre bestehende Zwölf-Sekunden-Grenze;
notwendige Ungelesen-Gegenproben werden sicher abgeschlossen. Die Grenze ist
kein hartes Zeitlimit des gesamten Kontoimports. Ein separater
Versuchsstempel ist keine erfolgreiche Datenprüfung: Ein lokal gescheiterter
Chat darf bei wiederholten Durchläufen nicht ständig denselben Platz
beanspruchen. Neue Quellversionen müssen sofort erneut berücksichtigt werden.
Ungelesene Gespräche werden weiterhin geprüft; ein unveränderter
Listenzeitstempel allein beweist bei Vinted keine unveränderten Nachrichten.
Gezielte Chatabrufe behalten sämtliche Rechte-, Identitäts- und
Ungelesen-Prüfungen.

## Bestätigter Fehler bei Verkaufsständen

Eine zuvor bestätigte eigene Transaktion kann in späteren Gesprächsantworten
weiter mit derselben Kennung erscheinen, während Verkäuferfelder fehlen.
Die alte Abrufentscheidung berücksichtigt den gespeicherten Verkäuferbeleg
nicht, ruft keine Transaktionsdetails ab und erneuert trotzdem den
Verkaufsprüfstand. Dadurch kann ein alter Verkaufsstatus wieder bis zu
24 Stunden übersprungen werden.

Der passende frühere Beleg muss bei derselben aktuellen Transaktionskennung
und demselben eigenen Verkäuferkonto berücksichtigt werden. Eine aktuelle
widersprechende Verkäufer-/Käuferbindung hat Vorrang. Fehlende oder geänderte
Relationen sowie ungültige oder widersprüchliche Transaktionsantworten dürfen
keinen neuen erfolgreichen Verkaufsprüfstand erzeugen. Vorhandene echte
Verkaufsdaten bleiben erhalten.

## Prüfung

Regressionen müssen aufeinanderfolgende Hintergrunddurchläufe mit mehr als
der gewählten Höchstzahl und einem dauerhaft lokal fehlerhaften Chat abdecken.
Versuchsstempel gehören zum selben geprüften Vertrag zwischen Datenbankleser,
isoliertem Browser und Import wie die bestehenden Cachefelder. Direkte
Chatabrufe, Ungelesen-Erhalt, Anbieterpausen und echte Rechteentzüge bleiben
geschützt. Tatsächliche Prüf- und Betriebsnachweise werden im zugehörigen PR
festgehalten.

## Performanceprüfung vor der Anzahlentscheidung

Die vorhandenen Stage-Protokolle messen den gesamten regulären Abruf.
`conversations` umfasst dabei Gesprächsliste, Details, Ungelesen-Gegenproben,
Transaktionen und Bewertungen. Diese Zeit ist kein gemessener Preis pro Chat;
auch die Quellabrufzahl enthält alle Anbieterbereiche.

Die eingefrorene Basis umfasst 14 erfolgreiche Abrufe des aktuellen Workers:
Median 10,85 Sekunden, p90 15,62 Sekunden, Durchschnitt 15,83 Sekunden.
Ein Ausreißer von 72,19 Sekunden enthält allein 64,93 Sekunden Profilphase.
Die mediane Browserphase dauert 3,84 Sekunden. Das beschreibt den bisherigen
Dreiermodus, ohne zu behaupten, dass in jedem Lauf genau drei Details gelesen
wurden.

Ein kontrollierter Vergleich darf denselben gestarteten, autorisierten
Cloudbrowser verwenden und höchstens zehn unterschiedliche bereits gelesene
Gespräche einmalig nacheinander messen. Kumulative Kosten nach dem dritten,
fünften und zehnten Chat sowie nötige eigene Transaktionsabfragen getrennt
ausweisen. Nur aktuelle passende Lease, Identität und Berechtigung vor jedem
GET; bei Anbieter- oder Rechtesperre abbrechen. Keine Nachrichteninhalte,
Zugänge, Token, Profiländerungen oder Anbieter-Schreibaktionen in der Ausgabe.
Automatik und Produktionscode bleiben für diese Messung unverändert.

Der kontrollierte Live-Durchlauf wurde am 3. November um 12:38 Uhr
Europe/Berlin erfolgreich ausgeführt: Zehn verschiedene bereits gelesene
Gespräche mit einer bis 20 Nachrichten, dazu sieben passend gebundene eigene
Transaktionen. Kumulative reine Gesprächs- und Transaktionsabfragen:
drei Gespräche 1,8724 Sekunden, fünf 3,1563 Sekunden, zehn 5,8565 Sekunden.
Dies sind dieselben zehn Gespräche mit drei Messpunkten, keine drei
unabhängigen Gesamtimporte. Browserstart, übriger Kontoabgleich und zusätzliche
Diagnose-Guardkosten sind darin nicht enthalten. Die vollständige detaillierte
Messung und deren Grenzen sind privat außerhalb des Worktrees erhalten.

32 rein lesende Berechtigungs-/Laufzeitprüfungen erfolgreich, keine
Anbietersperre. Danach regulär geschlossen, kein verbliebener Messcontainer,
unveränderte Konfigurationsfingerabdrücke und alle drei Automatiken aktiv.
Normale Folgeabrufe nach dem Ende ebenfalls erfolgreich. Die importierten
Kontodaten wurden durch die Diagnose nicht verändert. Produktiv bleibt die
Anzahl während der Messung bei drei. Anschließend hat der Nutzer die
beschriebene Fünfer-/Zehnerstrategie, den Verkaufsfix, vollständige Prüfungen,
PR, Merge und Produktionsrollout ausdrücklich freigegeben.

## Gemeinsame Grenzen und Veröffentlichung

Die Kontodaten enthalten weiterhin höchstens die begrenzt gelesenen Details.
Der Ereignisvertrag zwischen isoliertem Browser, Edge-Funktionen und Datenbank
muss zehn Gesprächskennungen und höchstens 2.000 kanonische Ereignisse
verarbeiten können. Die Bytegrenze muss auch bei maximalen Kennungslängen
und der JSONB-Darstellung reichen. Unbekannte Felder, fremde Kontobelege,
mehrdeutige IDs und übergroße Daten bleiben gesperrt. Keine Ereignisse
abschneiden, um einen weiterhin zu kleinen Vertrag zu umgehen.

Die Datenbankänderung erweitert ausschließlich die bestehenden geprüften
Batchgrenzen derselben Funktion. Alte kleinere Batches bleiben gültig;
keine Tabelle, Berechtigung oder echte Kontodaten ändern. Die Migration wird
mit der offiziellen CLI aus getrennten eigenen lokalen Katalogen erzeugt,
frisch angewandt und mit Grenz- und Rollbackfällen geprüft. Normale
Importe, Rechteentzug und Benachrichtigungs-Deduplizierung bleiben geschützt.
Backup, Migration und Worker-Veröffentlichung erfolgen über den vorhandenen
geprüften Hauptzweigworkflow. Ein fehlgeschlagener Lauf wird vor einer
Wiederholung gezielt untersucht.
