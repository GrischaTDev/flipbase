# Richtlinie für öffentliche Beta-Updates

Diese Richtlinie gilt für Nachrichten im Discord-Kanal für Beta-Updates und für
andere öffentlich lesbare Update-Texte zu Flipbase. Sie ergänzt das technische
[KI-Änderungsprotokoll](AI-CHANGELOG.md), das auch Arbeiten ohne öffentliche
Update-Nachricht festhält.

## Wann erscheint ein Update?

Ein öffentlicher Text wird nur geschrieben, wenn **alle** folgenden Punkte
zutreffen:

1. Die Änderung ist für Beta-Nutzer in der Oberfläche oder im Ablauf erkennbar.
2. Sie ändert, was Nutzer tun können, wie sie es tun oder welches Problem dabei
   behoben wurde.
3. Der konkrete Inhalt ist ausdrücklich zur Veröffentlichung freigegeben.
4. Die Funktion ist erfolgreich veröffentlicht und geprüft.
5. Der Inhalt gehört nicht zu den unten ausgeschlossenen internen Themen.

Die Freigabe erfolgt bewusst für den jeweiligen Inhalt. Ein Merge, eine neue
Versionsnummer oder ein GitHub Release allein gelten nicht als Freigabe. Enthält
eine Version keinen freigegebenen nutzerbezogenen Inhalt, erscheint **keine**
Nachricht im Beta-Update-Kanal. Auch eine Meldung wie „interne Verbesserungen“
ist dann nicht nötig.

Bei mehreren Änderungen in einer Version werden nur die freigegebenen Punkte
zusammengefasst. Gemischte PRs werden genauso behandelt: Der sichtbare Teil darf
beschrieben werden, der interne Teil bleibt unerwähnt.

## Was bleibt intern?

Für reine Admin-Arbeiten, Backend, Datenbanken, Migrationen, Verschlüsselung,
Sicherheitsmaßnahmen, Konten und Berechtigungen, interne Speicherabläufe,
Analytics, Infrastruktur und Wartung wird kein öffentlicher Update-Text
geschrieben. Auch technische Einzelheiten, interne Kennungen, Zugangsdaten,
Schwachstellen und noch nicht veröffentlichte Pläne gehören nicht hinein.

Das GitHub-Repository ist öffentlich. Deshalb sind auch PR-Beschreibungen,
Commits und das KI-Änderungsprotokoll öffentlich lesbar. Vertrauliche Details
dürfen **in keinem dieser Texte** stehen. Sie werden nicht durch das Weglassen
einer Discord-Nachricht geschützt.

Entscheidend ist, **was Nutzer tatsächlich sehen und tun können**: Eine neue
Schaltfläche „Speichern“ kann ein öffentliches Update sein, wenn sie Nutzern eine
neue Funktion bietet. Wie Daten dafür gespeichert, verschlüsselt oder in der
Datenbank verarbeitet werden, bleibt intern. Im Zweifel wird nichts
veröffentlicht, bis der konkrete Wortlaut freigegeben ist.

## So wird der Text geschrieben

- Verwende durchgehend **Du** und beschreibe die Änderung aus Sicht der Nutzer.
- Beginne jeden Punkt mit **Hinzugefügt**, **Geändert**, **Entfernt** oder
  **Behoben**. Verwende nur die Kategorien, die für diese Version zutreffen.
- Nenne die betroffene Seite oder Funktion. Beschreibe kurz, was vorher galt und
  was jetzt möglich oder anders ist. Erkläre den praktischen Nutzen oder die
  Auswirkung auf den Ablauf.
- Halte jeden Punkt bei ein bis zwei kurzen Sätzen. Schreibe konkret und ohne
  Fachbegriffe, PR-Nummern oder interne Umsetzungsdetails.
- Beschreibe nur das Verhalten, das in der veröffentlichten Version wirklich
  verfügbar und geprüft ist. Versprich keine künftigen Funktionen.
- Bei **Entfernt**: Sage, was wegfällt und welchen Weg Nutzer stattdessen nehmen
  können. Wenn es keinen Ersatz gibt, benenne die Auswirkung klar.

Die Überschrift nennt die veröffentlichte Versionsnummer. Danach folgen nur die
relevanten Punkte und bei Bedarf ein Link zu einer freigegebenen öffentlichen
Beschreibung. Es gibt keine Pflicht, jede Kategorie zu füllen.

## Beispiele für den Ton

Die folgenden Beispiele zeigen nur die Schreibweise; sie kündigen keine
tatsächlich veröffentlichten Funktionen an.

> **Hinzugefügt:** In der Artikelerfassung kannst Du mehrere Größen zu einem
> Artikel speichern. So musst Du gemeinsame Angaben nur einmal eingeben.

> **Geändert:** Auf der Einkaufsseite öffnet der bisherige Button „Hinzufügen“
> jetzt direkt die Artikelerfassung. Du erreichst den nächsten Schritt ohne
> Umweg über ein weiteres Menü.

> **Entfernt:** Die alte Sammelaktion in der Artikelliste entfällt. Wähle die
> gewünschten Artikel jetzt über die Auswahlfelder aus und starte die Aktion
> über die Leiste am unteren Rand.

> **Behoben:** Beim Speichern eines Artikels bleibt Deine Auswahl jetzt
> erhalten, wenn eine Pflichtangabe fehlt. Du kannst die Angabe ergänzen, ohne
> erneut anfangen zu müssen.

## Freigabe vor dem Versand

Wer eine nutzerbezogene Änderung vorschlägt, kennzeichnet sie im PR-Text
ausdrücklich als öffentliches Beta-Update und liefert einen kurzen Entwurf.
Fehlt diese Kennzeichnung, wird kein öffentlicher Text daraus abgeleitet. Vor
der Veröffentlichung wird geprüft: Ist die Änderung
bereits live? Ist der beschriebene Ablauf korrekt? Versteht ein Beta-Nutzer den
Nutzen? Enthält der Text ausschließlich freigegebene Informationen? Die
verantwortliche Person für das Release gibt den endgültigen Wortlaut frei. Ein
PR-Entwurf allein reicht dafür nicht. Erst danach darf der Text für die jeweilige
Version versendet werden. Ohne freigegebenen Text bleibt der Kanal still.

**Aktueller technischer Stand:** Der bestehende Release-Workflow erzeugt die
GitHub-Release-Beschreibung noch automatisch aus PR-Informationen. Diese
Richtlinie ändert den Workflow nicht. Damit auch die öffentliche
GitHub-Release-Seite ausschließlich freigegebene Update-Texte enthält, muss die
automatische Beschreibung vor dem nächsten entsprechenden Release angepasst
werden.
