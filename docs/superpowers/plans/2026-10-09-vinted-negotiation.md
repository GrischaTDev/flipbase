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

UI-RPCs: `marketplace_read_negotiation(p_workspace_id,p_connection_id)`,
`marketplace_save_negotiation(p_workspace_id,p_connection_id,p_expected_version,
p_enabled,p_config)`, `marketplace_enqueue_negotiation(p_workspace_id,p_connection_id,
p_conversation_id,p_message_id,p_request_id,p_action,p_price_cents default null)`.
Lesen liefert `{ok:true,enabled,version,config,events:[{id,action,state,errorCode,createdAt}]}`.
Speichern liefert denselben Stand, Enqueue `{ok:true,id,state}`.
Service-RPCs folgen vorhandenen lokalen/Cloud-Claim/Check/Begin/Finish-Signaturen;
Agent benennt die konkreten Funktionen vor Providerintegration im Bericht.

## Task 1: gespeicherte Regeln und abgesicherte Aufträge

- [ ] Neue deklarative Schemas `426_marketplace_negotiation.sql` und passende DB-Tests:
      private Settings, Threads, Jobs, RLS/Grants/Workspace-/Konto-/Versionsschutz.
- [ ] Neuer freigegebener gemeinsamer Konfigurations-/Preisvertrag und Tests.
- [ ] UI-RPCs sowie lokale/Cloud-Ausführungsfunktionen; automatische Planung auf
      neuen bestätigten Importereignissen, kein Altbestand und keine Poll-Duplikate.
- [ ] Erst gültiger neuer Eingang führt zur nächsten Stufe. Kauf stoppt Verhandlung.
      Neue Konfiguration und manuelle Übernahme stornieren unbegonnene veraltete Jobs.
- [ ] Fälligkeit, Abhängigkeit und gespeicherte Vorlagenauswahl; unklarer Ausgang
      blockiert Folge. Existierende Freigaben, Profilbindung und Pausen bleiben nötig.
- [ ] Schema auf eigener Wegwerfkopie testen; Migration erzeugt der Controller.

## Task 2: Provider und Ausführung

- [ ] Angebotsdaten aus strukturierten Anbieterfeldern in beiden Importpfaden;
      keine Preisentscheidungen aus Anzeigetext.
- [ ] Browseradapter bestätigt Kontoinhaber, Einzelartikel, Käufer, Preis und
      offenen Angebotsstatus; Accept-PUT und Counter-POST aus Recherche abgleichen.
      Ablehnen über den aktuell bestätigten Reject-PUT; kein erfundener Endpunkt.
- [ ] Eigener Cloud-Runner/Store und `negotiationWrite`-Scope einschließlich
      isoliertem Browserkanal, Brokerprüfung, Begin-ACK und Stoppschutz.
- [ ] Eigene lokale Claim/Begin/Finish-Aktionen und Extension-Executor. Ältere
      Extension übernimmt neue Jobs nie über die normale Text-Outbox.
- [ ] Adapter/Dispatch-/Wiederherstellungstests und bestehende Text-/Favoritentests.

## Task 3: Einstellungen und Chat

- [ ] Neuer Menüpunkt und Lazy-Route `automatic-negotiation` mit vorhandenen
      Konten-/Shared-Formmustern, Preview, Speichern und Ergebnisverlauf.
- [ ] Preise, Preisbereiche, Stufen, Ereignistexte, Alternative/Folge, Verzögerung,
      Sendereihenfolge und unabhängige Kaufnachricht konfigurieren.
- [ ] Aktuelle erhaltene Angebote: Annahme volle Breite, darunter Ablehnen und
      Gegenangebotdialog. Aktion nur bei vollständigen aktuellen Daten/Freigabe.
- [ ] Konto-/Workspacewechsel, Deaktivierung, fehlende Daten, Preisgrenzen,
      duplizierte Klicks, mobil/hell/dunkel und AXE testen; Angular-Produktionsbau.

## Task 4: Integration und Abschluss

- [ ] Neue Migration per `supabase db diff` erzeugen und transaktional prüfen;
      Typen neu aus eigener Datenbank erzeugen. Keine Handänderung generierter Typen.
- [ ] Aufgaben- und vollständiges Zweigreview, gezielte Regressionen, Format/Lint,
      Typprüfung, Worker-Bau, UI-Bau, Datenbank- und Browserabläufe.
- [ ] Changelog, Entwurf und Plan mit tatsächlichen Ergebnissen aktualisieren.
- [ ] Erst nach fertigem geprüftem Stand die vorgeschriebene PR-Freigabe fragen.
      Keine Veröffentlichung oder Echtkonto-Schreibaktion ohne entsprechende Freigabe.
