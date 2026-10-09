# Automatische Vinted-Verhandlung: Umsetzungsplan

**Ziel:** Manuelle Angebotsaktionen und kontobezogene automatische Verhandlung mit
Preisgrenzen, Stufen, Ereignistexten, Alternativen, Folgen und dauerhaft geplanten
Verzögerungen für Cloud und Extension.

**Grundlage:** Der Nutzer hat am 09.10.2026 die Umsetzung des vorhandenen
[Angebotsentwurfs](../../implementation/vinted-account-ui-offers-plan.md) freigegeben.
Die dort beschriebene Nachrichtenfolge und die selbstständige Kaufnachricht sind
verbindlich. Die Seite verwendet vorhandene Shared-Komponenten und Angular 22.

**Architektur:** Eigene Negotiation-Settings und Jobs; derselbe kontogebundene
Auftrag für manuelle und automatische Aktionen, getrennt von Text-Outbox und
Favoriten. Neue lokale Edge-Aktionen und Cloud-Claims verwenden vorhandene
Freigabe-, Lease-, Browserstopp- und Pausenregeln. Alle neuen Regeln sind aus.
Keine neuen Pakete, keine produktiven Schreibtests oder automatischen Freigaben.

**Ausführung:** Der Subagent-Driven-Development-Skill wird für fokussierte Aufgaben
mit Prüfung verwendet. Bestehender eigener Worktree und Zweig werden fortgesetzt.
Keine fremden Zweige ändern; generierte Typen erst aus der fertigen Testdatenbank.

## Gemeinsame Verträge

Konfiguration `VintedNegotiationConfig`: `discountType: 'amount'|'percentage'`,
`discountValue: number`, `priceBands: {upToCents:number|null,discountType,discountValue}[]`,
`stages: number[]` (streng steigend, letzte 100), `delaySeconds: number`,
`sendOrder: 'offer_first'|'message_first'`, `purchaseEnabled: boolean`,
`messages: Record<NegotiationMessageEvent,NegotiationMessageStep[]>`.
Jeder Schritt enthält `templates:string[]` und `delaySeconds:number`.
Ereignisse: `accepted`, `counter`, `final`, `after_final`, `after_acceptance`,
`buyer_accepted`, `purchased`. Leere Schrittlisten sind ausdrücklich zulässig.

Providercommand in `supabase/functions/_shared/marketplace-negotiation-contracts.d.ts`:
`{kind:'offer',action:'accept'|'decline'|'counter',externalConversationId,transactionId,
itemId,buyerId,offerId,originalPriceCents,offeredPriceCents,priceCents:number|null,
currency:'EUR'}` oder `{kind:'message',externalConversationId,text}`.
Ergebnis: `{outcome:'sent'|'failed'|'outcome_unknown'|'skipped',externalId?:string,
errorCode?:string}`. Kein Erfolg allein aus HTTP200. Fehlende Angebotskennung,
unklare Rolle, ungültiger Preis, Bundle oder veraltetes Angebot sperren eine Aktion.

Importereignisse `negotiationEvent` enthalten `id`, `type: 'buyer_accepted'|'purchased'`,
`transactionId`, `confirmed:true`. Ein vollständiges optionales Preis-Tripel
`originalPriceCents`, `priceCents`, `currency:'EUR'` muss aus belegten Artikel- und
Transaktionsangebotspreisen stammen. Fehlen diese und passende Threadpreise,
bleiben allgemeine Texte möglich; Preisplatzhalter-Schritte werden mit
`missing_event_price` als übersprungen dokumentiert, niemals mit Nullpreisen gesendet.

UI-RPCs: `marketplace_read_negotiation(p_workspace_id,p_connection_id)`,
`marketplace_save_negotiation(p_workspace_id,p_connection_id,p_expected_version,
p_enabled,p_config)`, `marketplace_enqueue_negotiation(p_workspace_id,p_connection_id,
p_conversation_id,p_message_id,p_request_id,p_action,p_price_cents default null)`.
Lesen liefert `{ok:true,enabled,version,config,events:[{id,action,state,errorCode,createdAt}]}`.
Speichern liefert denselben Stand, Enqueue `{ok:true,id,state}`.
Service-RPCs folgen vorhandenen lokalen/Cloud-Claim/Check/Begin/Finish-Signaturen;
Agent benennt die konkreten Funktionen vor Providerintegration im Bericht.

## Task 1: gespeicherte Regeln und abgesicherte Aufträge

- [x] Neue deklarative Schemas `426_marketplace_negotiation.sql` und passende DB-Tests:
      private Settings, Threads, Jobs, RLS/Grants/Workspace-/Konto-/Versionsschutz.
- [x] Neuer freigegebener gemeinsamer Konfigurations-/Preisvertrag und Tests.
- [x] UI-RPCs sowie lokale/Cloud-Ausführungsfunktionen; automatische Planung auf
      neuen bestätigten Importereignissen, kein Altbestand und keine Poll-Duplikate.
- [x] Erst gültiger neuer Eingang führt zur nächsten Stufe. Kauf stoppt Verhandlung.
      Neue Konfiguration und manuelle Übernahme stornieren unbegonnene veraltete Jobs.
- [x] Fälligkeit, Abhängigkeit und gespeicherte Vorlagenauswahl; unklarer Ausgang
      blockiert Folge. Existierende Freigaben, Profilbindung und Pausen bleiben nötig.
- [x] Bestätigte automatische Verhandlungsnachrichten im bestehenden Chatabruf
      ebenfalls mit dem Bot-Icon verknüpfen; nur genaue Konto-/Gesprächs-/Versandbelege,
      keine Textvergleiche und keine manuelle Herkunft.
- [x] Schema auf eigener Wegwerfkopie testen; Migration erzeugt der Controller.

## Task 2: Provider und Ausführung

- [x] Angebotsdaten aus strukturierten Anbieterfeldern in beiden Importpfaden;
      keine Preisentscheidungen aus Anzeigetext.
- [x] Browseradapter bestätigt Kontoinhaber, Einzelartikel, Käufer, Preis und
      offenen Angebotsstatus; Accept-PUT und Counter-POST aus Recherche abgleichen.
      Ablehnen über den aktuell bestätigten Reject-PUT; kein erfundener Endpunkt.
- [x] Eigener Cloud-Runner/Store und `negotiationWrite`-Scope einschließlich
      isoliertem Browserkanal, Brokerprüfung, Begin-ACK und Stoppschutz.
- [x] Eigene lokale Claim/Begin/Finish-Aktionen und Extension-Executor. Ältere
      Extension übernimmt neue Jobs nie über die normale Text-Outbox.
- [x] Adapter/Dispatch-/Wiederherstellungstests und bestehende Text-/Favoritentests.

## Task 3: Einstellungen und Chat

- [x] Neuer Menüpunkt und Lazy-Route `automatic-negotiation` mit vorhandenen
      Konten-/Shared-Formmustern, Preview, Speichern und Ergebnisverlauf.
- [x] Preise, Preisbereiche, Stufen, Ereignistexte, Alternative/Folge, Verzögerung,
      Sendereihenfolge und unabhängige Kaufnachricht konfigurieren.
- [x] Aktuelle erhaltene Angebote: Annahme volle Breite, darunter Ablehnen und
      Gegenangebotdialog. Aktion nur bei vollständigen aktuellen Daten/Freigabe.
- [x] Konto-/Workspacewechsel, Deaktivierung, fehlende Daten, Preisgrenzen,
      duplizierte Klicks, mobil/hell/dunkel und AXE testen; Angular-Produktionsbau.

## Task 4: Integration und Abschluss

- [x] Neue Migration per `supabase db diff` erzeugen und transaktional prüfen;
      Typen neu aus eigener Datenbank erzeugen. Keine Handänderung generierter Typen.
- [x] Aufgaben- und vollständiges Zweigreview, gezielte Regressionen, Format/Lint,
      Typprüfung, Worker-Bau, UI-Bau, Datenbank- und Browserabläufe.
- [x] Changelog, Entwurf und Plan mit tatsächlichen Ergebnissen aktualisieren.
- [x] Erst nach fertigem geprüftem Stand die vorgeschriebene PR-Freigabe fragen.
      Keine Veröffentlichung oder Echtkonto-Schreibaktion ohne entsprechende Freigabe.

## Geprüfter Umsetzungsstand

Task1 und Task2 sind nach Aufgabenreview und gezielten Nachprüfungen abgeschlossen.
117 neue Datenbankprüfungen und 676 bestehende Regressionen auf der frischen
transaktionalen Migrationskopie bestehen. Migration und Typen wurden erzeugt;
Funktionsdefinitionen und Rechte stimmen mit dem geprüften Schema überein.
Cloud und Extension verwenden eine gemeinsame Providerlaufzeit. Tatsächlicher
Worker-Image-Bau sowie Import der kompilierten Module im Image bestehen.
Start ohne CommonJS-Globals, widersprüchliche Währungs-/Artikel-/Rollenbelege,
Pausen und verlorene Bestätigungen sind gezielt geprüft. Task3 ist implementiert und lokal geprüft; Aufgabenreviews, Zweigreview und abschließende Nachprüfung sind abgeschlossen.

Ein separates `buyer_accepted` für eine eigene Verkäuferofferte besitzt bislang
keinen eindeutigen Anbieterbeleg und wird nicht erfunden oder aus dem Kauf abgeleitet.
Die Oberfläche kennzeichnet die Grenze. Bestätigte Zahlungen über
`debit_processed_at` ermöglichen dagegen unabhängige Kaufnachrichten.
Keine produktive Aktivierung, Veröffentlichung oder Vinted-Schreibaktion erfolgt.

Task3: 40 Modell-/Navigationstests, 86 relevante Angularprüfungen und zehn
Mock-Browserabläufe mit AXE auf Desktop/Mobil und in hell/dunkel erfolgreich.
Angular-Produktionsbau, Typprüfung der Specs, Format/Lint und Shared-UI bestehen.
Schnellauswahl für Verzögerungen und konkrete bestätigte Aktionsmeldungen sind
enthalten. Root hat die Desktop-/Mobilansichten geprüft; die alten Mockfehler
wurden vor dem abschließenden Browserlauf korrigiert. Keine echte Provideraktion.
Die unveränderte Deno-Lintbaseline bleibt ausdrücklich dokumentiert; kein Anspruch
auf vollständigen ungefilterten Linterfolg. Die volle verbindliche CI folgt im PR.

Task3-Nachprüfung: Alle drei Befunde sind behoben. Verlaufabruf erhält den
ungespeicherten Entwurf samt Revision/Konflikt; Gegenpreise besitzen eine belegte
lokale Vorschau. Individuelle Sekunden/Minuten funktionieren global und pro
Nachrichtenschritt. 86 Angular-, 40 Modell-/Navigationtests und zehn erweiterte
Mock-Browserabläufe bestehen auf dem integrierten Hauptzweig mit neuer Glocke.
Der Produktionsbau besteht; die integrierte Header-DatePipe- und bestehende
pako-Warnung bleiben als Warnungen dokumentiert. Task1/2/3-Reviewgates sind sauber.
Keine produktive Aktivierung, Anbieter-Schreibaktion oder Veröffentlichung.

Abschlussreview: Der einzige fachliche Befund betraf den Hinweis bei unklarem
Schreibausgang. Der Verlauf behauptet jetzt keine sichere Nichtausführung und
fordert zur Prüfung auf Vinted vor einer Wiederholung auf. Zwei Renderingtests
decken unklaren Ausgang und bestätigtes Scheitern ab; die betroffene Komponente
besteht mit 11 Tests. Format/Lint, erneuter Produktionsbau und branchweiter
Diffcheck bestehen. Die zusätzliche SQL-EOF-Leerzeile ist entfernt, ohne
Schemaänderung. Die abschließende Nachprüfung bestätigt beide Korrekturen ohne
neue Befunde. Die zuvor geprüften 86 Angularprüfungen wurden um diese beiden
Renderingregressionen ergänzt; keine breite Suite erneut ausgeführt.

Die vorgeschriebene PR-Freigabe wurde erteilt; PR356 ist erstellt. Die
vollständigen Pflichtprüfungen laufen im PR. Keine echte Vinted-Abnahme oder
automatische Aktivierung wird aus den lokalen Nachweisen abgeleitet.

Entscheidungen während der Umsetzung:

- Die ausdrückliche Umsetzungsfreigabe gilt für den abgestimmten Entwurf; keine
  wiederholte Planfreigabe. Bei falscher Auslegung wäre eine Anpassung nötig.
- POSIX-Testfixtures laufen auf diesem Windows-Rechner in eigenen Dockerkopien.
  Das ersetzt keinen Echtkonto-Test; abweichendes Liveverhalten erfordert Nacharbeit.
- Die Projektregeln verlangen gezielte lokale Prüfungen und anschließend genau
  die PR-Frage, statt Skill-Abschlussmenü oder wiederholter Gesamtsuite. Eine
  falsche Auslegung würde zusätzliche Prüfungen oder Freigabe erfordern.
