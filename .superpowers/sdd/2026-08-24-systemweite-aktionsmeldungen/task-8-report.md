# Task 8 – Systemweiter Abschlussaudit

## Ruling und Vorgehen

Der im ursprünglichen Task-8-Entwurf vorgeschlagene Test mit einer ausschließlich für den Test gepflegten `aktionsabdeckung` wurde gemäß Preflight-Ruling **nicht** erstellt. Eine solche Registry würde nur ihre eigene Liste prüfen, nicht das sichtbare Verhalten der Anwendung.

Stattdessen wurden alle erreichbaren Nutzeraktionen aus den Templates, alle mutationsnahen Komponentenaufrufe, alle Toast-Aufrufe sowie alte Banner-, Timer- und Fehlersignale mit `rg` inventarisiert. Die Abdeckung stützt sich auf die vorhandenen Feature-Verhaltenstests aus Tasks 1–7 und auf neue Regressionstests für die im Audit gefundenen Lücken.

## Reproduzierbare Auditbefehle

```powershell
# 257 Ereignisbindungen als Einstieg in alle erreichbaren Nutzeraktionen
rg -n --glob '*.html' '\((click|ngSubmit|submit|change|checkedChange|valueChange)\)=' src/app

# Mutationsbegriffe in Komponenten, Templates und Services
rg -n -i --glob '*.{ts,html}' '(create|update|delete|archive|restore|save|send|sync|publish|status|checkout|confirm|import|export|book|bundle|upload|remove)' src/app

# Sämtliche produktiven Feature-Meldungen
rg -n --glob '*.ts' --glob '!*.spec.ts' 'toast\.(success|error|warning|info)\(' src/app

# Alte Rückmeldungen, Browserdialoge und Timer
rg -n -i --glob '*.{ts,html}' 'saveSuccess|publishSuccessMsg|bookingFeedback|successMessage|emailSentMessage|errorMessage|setTimeout|window\.alert|alert\(|banner|feedback|statusMessage' src/app

# Doppelte globale Darstellung
rg -n --glob '*.html' '<app-toast-container|<app-sync-error-banner' src/app
rg -n --glob '*.ts' 'ToastContainerComponent|SyncErrorBannerComponent|ToastSyncBridgeService' src/app

# Persistenzpfade hinter Nutzeraktionen
rg -n --glob '*.service.ts' '\.(insert|update|upsert|delete|upload|remove|rpc)\(' src/app/core/services

# Sync-Provenienz und potenzielle Fire-and-forget-Schreibpfade
rg -n --glob '*.ts' 'reportedBySyncStatus|istZentralGemeldet|schreibeImHintergrund' src/app
```

Ergebnis des Container-Scans: genau ein `<app-toast-container>` in `src/app/app.html`, kein `<app-sync-error-banner>` in einem Template. Die alte `SyncErrorBannerComponent`-Quelldatei ist weiterhin vorhanden, aber nicht in die UI eingebunden.

## Maschinenlesbare Aktionsmatrix

Jeder Eintrag mit `status: "included"` besitzt einen echten Komponenten-/Servicepfad und Verhaltenstests für das relevante Erfolgs-, Fehler- oder Teilergebnis. Mehrere Varianten derselben Methode sind in `variants` angegeben.

```json
[
  {
    "feature": "settings",
    "status": "included",
    "actions": [
      "onSavePaymentConfig",
      "onSaveCarrierConfig",
      "onSaveProfil",
      "onSaveSettings",
      "onCreateWorkspace",
      "onDeleteWorkspace",
      "onRequestPushPermission",
      "onTestWebPush",
      "onTogglePushSetting",
      "onSaveEbayConfig",
      "onSaveWebhookConfig",
      "testWebhook",
      "onSendInvite",
      "onUpdateRole",
      "onRemoveMember",
      "onCancelInvite",
      "exportPurchasesCsv",
      "exportInventoryCsv",
      "exportSalesCsv"
    ],
    "evidence": [
      "src/app/features/settings/settings-toast-actions.spec.ts",
      "src/app/shared/components/workspace-modal/workspace-modal-actions.spec.ts"
    ]
  },
  {
    "feature": "sources",
    "status": "included",
    "actions": [
      "onAddSource",
      "speichereQuelle",
      "archiviereQuelle",
      "onDeleteSource",
      "onAddSupplier",
      "speichereLieferant",
      "archiviereLieferant",
      "onDeleteSupplier"
    ],
    "variants": ["archive", "restore"],
    "evidence": ["src/app/features/sources/sources-toast-actions.spec.ts"]
  },
  {
    "feature": "purchases",
    "status": "included",
    "actions": [
      "PurchaseCreateModal.saveNewSource",
      "PurchaseCreateModal.saveNewSupplier",
      "PurchaseCreateModal.onSubmit",
      "Purchases.onSubmitRapidPurchase",
      "Purchases.onSaveWalletConfig",
      "Purchases.onSyncNow",
      "Purchases.onDeletePending",
      "PurchaseDetail.applyAllocations",
      "PurchaseDetail.setAllocationMode",
      "PurchaseDetail.onAddCost",
      "PurchaseDetail.onDeleteCost",
      "PurchaseDetail.onAddItem",
      "PurchaseDetail.onDeletePurchase",
      "PurchaseDetail.saveTracking",
      "PurchaseDetail.markDeliveredAndSync"
    ],
    "variants": ["create", "update", "partial", "offline"],
    "evidence": [
      "src/app/features/purchases/purchases-toast-actions.spec.ts",
      "src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts",
      "src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts"
    ]
  },
  {
    "feature": "inventory",
    "status": "included",
    "actions": [
      "Inventory.onChangeItemStatus",
      "Inventory.onTogglePublicStore",
      "ItemCreateModal.onSubmit",
      "ItemDetail.onFilesSelected",
      "ItemDetail.onSetPrimary",
      "ItemDetail.onDeleteMedia",
      "ItemDetail.onChangeStatus",
      "ItemDetail.onAddCost",
      "ItemDetail.onDeleteCost",
      "ItemDetail.onTogglePublicStore",
      "ItemDetail.onDeleteItem"
    ],
    "variants": ["create", "update", "single", "batch", "partial"],
    "evidence": [
      "src/app/features/inventory/inventory-toast-actions.spec.ts",
      "src/app/features/inventory/components/item-create-modal/item-create-modal-actions.spec.ts",
      "src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts"
    ]
  },
  {
    "feature": "sales-and-invoices",
    "status": "included",
    "actions": [
      "SaleCreateModal.onSubmit",
      "Sales.onSubmitReturn",
      "Sales.onDeleteSale",
      "InvoiceModal.sendEmail"
    ],
    "variants": ["create", "update", "partial"],
    "evidence": [
      "src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts",
      "src/app/features/sales/sales-toast-actions.spec.ts",
      "src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts"
    ]
  },
  {
    "feature": "listings",
    "status": "included",
    "actions": ["markAsListed", "publishToStore"],
    "evidence": ["src/app/features/listings/listings-toast-actions.spec.ts"]
  },
  {
    "feature": "fulfillment",
    "status": "included",
    "actions": ["onBundleCandidate", "onUnbundleOrder", "onSaveTracking", "markDelivered"],
    "evidence": [
      "src/app/features/fulfillment/fulfillment-toast-actions.spec.ts",
      "src/app/core/services/fulfillment.service.spec.ts",
      ".superpowers/sdd/2026-08-24-systemweite-aktionsmeldungen/task-6-db-verification.sql"
    ]
  },
  {
    "feature": "research",
    "status": "included",
    "actions": ["onApplyRadarPrice", "onAddCurrentSearchToRadar", "onDeleteTrackItem"],
    "evidence": [
      "src/app/features/research/research-toast-actions.spec.ts",
      "src/app/core/services/price-tracker.service.spec.ts"
    ]
  },
  {
    "feature": "image-optimizer",
    "status": "included",
    "actions": ["exportiere"],
    "evidence": ["src/app/features/image-optimizer/image-optimizer-toast-actions.spec.ts"]
  },
  {
    "feature": "accounting",
    "status": "included",
    "actions": [
      "processBankFile",
      "onLoadDemoStatement",
      "onBookTransaction",
      "onBookAllExactMatches",
      "onIgnoreTransaction",
      "onResetBankStatement",
      "onDownloadDatev",
      "onDownloadDiffTaxJournal",
      "onDownloadEur",
      "onPrepareReportForAdvisor"
    ],
    "variants": ["success", "empty", "partial", "failed"],
    "evidence": [
      "src/app/features/accounting/accounting-toast-actions.spec.ts",
      "src/app/core/services/bank-reconciliation-persistence-actions.spec.ts",
      ".superpowers/sdd/2026-08-24-systemweite-aktionsmeldungen/task-7-db-verification.sql"
    ]
  },
  {
    "feature": "store-checkout",
    "status": "included",
    "actions": ["onSubmitOrder"],
    "variants": ["success", "partial", "failed", "retry", "double-click"],
    "evidence": [
      "src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts",
      "src/app/core/services/store-order-persistence-actions.spec.ts",
      ".superpowers/sdd/2026-08-24-systemweite-aktionsmeldungen/task-7-db-verification.sql",
      ".superpowers/sdd/2026-08-24-systemweite-aktionsmeldungen/task-7-db-concurrency-verification.ps1"
    ]
  }
]
```

## Begründete Ausschlüsse

```json
[
  {
    "category": "authentication",
    "actions": ["login", "register", "logout", "logout-all"],
    "reason": "Vom Task-8-Brief ausdrücklich ausgeschlossen; Login/Register behalten feldnahe Fehler und die Registrierung ihre Weiterleitungsanzeige."
  },
  {
    "category": "navigation-and-dialogs",
    "actions": ["route navigation", "workspace switch", "open/close modal", "tab switch"],
    "reason": "Keine abgeschlossene fachliche Mutation."
  },
  {
    "category": "search-analysis-preview",
    "actions": ["search", "automatic load", "barcode scan", "AI scan", "market scan", "crop", "rotate", "preview"],
    "reason": "Vom Design und Task-8-Brief ausdrücklich ausgeschlossen; Scanner-/Cropperfehler sind kontextuelle Ergebnisanzeigen."
  },
  {
    "category": "local-selection",
    "actions": ["cart add/remove", "filter", "sort", "accordion", "temporary form rows"],
    "reason": "Reversible lokale Auswahl ohne abgeschlossene Servermutation."
  },
  {
    "category": "copy-and-native-output",
    "actions": ["copy", "share link", "print invoice", "print label", "print packing slip"],
    "reason": "Kopieren ist ausdrücklich ausgeschlossen; Drucken öffnet den nativen Dialog und ist in der Anwendung noch nicht abgeschlossen."
  },
  {
    "category": "notification-inbox-housekeeping",
    "actions": ["markAsRead", "markAllAsRead", "clearNotifications"],
    "reason": "Die sichtbare Inbox ist selbst die detaillierte Ergebnisansicht; einzelne Meldungen werden beim Öffnen gelesen. Diese Bedienaktionen gehören nicht zur fachlichen Aktionsmatrix der Tasks 2–7."
  },
  {
    "category": "unreachable-or-unavailable",
    "actions": ["Research.onToggleTrackItem", "Fulfillment.purchaseShippingLabel"],
    "reason": "Für onToggleTrackItem existiert keine Templatebindung. Der Versandmarkenkauf ist mangels Zusteller-Schnittstelle deaktiviert und führt keine Mutation aus."
  },
  {
    "category": "detailed-result-views",
    "actions": ["store order success page", "offline sync warning", "field validation"],
    "reason": "Ausführliche Ergebnis-/Statusansichten beziehungsweise feldnahe Validierung bleiben laut Design erhalten und sind keine doppelten allgemeinen Erfolgsbanner."
  },
  {
    "category": "demo-only-reset",
    "actions": ["Shell.reloadDemoData"],
    "reason": "Entwicklungs-/Demo-Hilfsaktion mit sofortigem vollständigem Reload, keine Produktionspersistenz."
  }
]
```

Das Newsletter-Formular im Demo-Shop besitzt keine Versand- oder Persistenzanbindung und zeigt nur seinen lokalen Formularzustand. Es wird deshalb nicht fälschlich als bestätigter Versand klassifiziert.

## Gefundene und behobene Lücken

### 1. Doppelte Erfolgsmeldung beim Rechnungsversand

`InvoiceModal.sendEmail` erzeugte nach bestätigtem Versand sowohl den globalen Toast als auch ein lokales grünes Banner mit eigenem Vier-Sekunden-Timer. Ein echter DOM-Verhaltenstest belegte den doppelten sichtbaren Text. Banner, Signal, Icon und Timer wurden entfernt; Ladezustand, Fehlerbehandlung und Toast bleiben erhalten.

### 2. Zustellstatus ohne Rückmeldung und vorgezogene lokale Mutation

`Fulfillment.markDelivered` rief einen `void`-Service auf, zeigte keine Rückmeldung und setzte lokal sofort `delivered`. Die Datenbankänderung lief im Hintergrund; Fehler oder Nulltreffer konnten daher einem bereits gezeigten Erfolg beziehungsweise einem falschen lokalen Zustand folgen.

Der Service liefert nun ein typisiertes Ergebnis mit `reportedBySyncStatus`, prüft Auftrag und Workspace, schreibt außerhalb des Demo-Modus DB-first, behandelt `count === 0` als zentral sichtbaren Fehler und übernimmt den lokalen Status erst danach. Die Komponente verhindert Mehrfachausführung, meldet Erfolg konkret und räumt ihren Ladezustand im `finally` auch bei Exceptions auf.

### 3. Radar-Anlage ohne Rückmeldung und ohne echte Datenbank-ID

`onAddCurrentSearchToRadar` wechselte unmittelbar in den Radar, obwohl der Insert nur im Hintergrund lief. Lokal wurde eine temporäre `track-*`-ID behalten.

Die Anlage liefert nun ein typisiertes Ergebnis, wartet auf den Insert, fordert die echte Datenbank-ID zurück und übernimmt erst dann lokalen Zustand, Tabwechsel und Erfolgstoast. Fehler lassen Suche und Eingaben unverändert.

### 4. Radar-Löschung ohne Rückmeldung und lokal vor der Datenbank

`onDeleteTrackItem` entfernte den Eintrag sofort lokal und startete die Datenbanklöschung im Hintergrund. Die Löschung ist nun workspace-gebunden, DB-first, Nulltreffer-sicher und liefert typisierte Sync-Provenienz. Der lokale Eintrag bleibt bei Fehlern erhalten; Erfolg und lokale Fehler werden eindeutig gemeldet. Der Komponenten-Lifecycle endet per `finally`.

## TDD-Nachweis

### RED

```text
npm test -- src/app/features/fulfillment/fulfillment-toast-actions.spec.ts src/app/core/services/fulfillment.service.spec.ts src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts
→ 5 erwartete Fehlschläge: Doppelbanner, fehlende Zustelltoasts, lokale Vorabmutation, fehlendes Nulltreffer-Ergebnis

npm test -- src/app/features/research/research-toast-actions.spec.ts src/app/core/services/price-tracker.service.spec.ts
→ 6 erwartete Fehlschläge: fehlende Radar-Toasts, Wechsel trotz Fehler, lokale Vorabmutation, fehlendes Nulltreffer-Ergebnis
```

### GREEN

```text
npm test -- src/app/features/fulfillment/fulfillment-toast-actions.spec.ts src/app/core/services/fulfillment.service.spec.ts src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts
→ 3 Dateien, 22/22 Tests

npm test -- src/app/features/research/research-toast-actions.spec.ts src/app/core/services/price-tracker.service.spec.ts
→ 2 Dateien, 14/14 Tests

npm test -- src/app/features/fulfillment/fulfillment-toast-actions.spec.ts src/app/core/services/fulfillment.service.spec.ts src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts src/app/features/research/research-toast-actions.spec.ts src/app/core/services/price-tracker.service.spec.ts
→ 5 Dateien, 36/36 Tests
```

## Doppelmeldungs- und Legacy-Scan

- Produktionscode enthält kein `saveSuccess`, `publishSuccessMsg`, `bookingFeedback` oder `emailSentMessage` mehr.
- Der einzige verbleibende `successMessage`-Pfad gehört zur ausdrücklich ausgeschlossenen Registrierung und begleitet die Weiterleitung.
- Verbleibende `errorMessage`-Signale sind feld- oder dialognah: Login/Registrierung, Workspace-Formular, Verkaufs-/Einkaufs-/Artikel-Formulare, Barcode-Scanner und Bildzuschnitt.
- Verbleibende Feature-Timer gehören zu Kopierhinweisen, Barcode-/AI-Ergebnissen oder Auth-Weiterleitung. Die übrigen Timer simulieren Service-Latenz; die Toast-Dauern selbst liegen zentral im `ToastService`.
- „Offline / Sync Warning Banner“ ist ein dauerhafter fachlicher Offline-Status, kein Abschlussbanner. Die Bestellerfolgsseite ist eine ausführliche Ergebnisansicht.
- Zentral gemeldete Speicherfehler werden über `reportedBySyncStatus` beziehungsweise `istZentralGemeldet` vom zweiten Feature-Toast abgegrenzt.

## Gesamtverifikation

| Prüfung | Ergebnis |
| --- | --- |
| `npm run format:check` | Grün. Der erste Lauf nannte ausschließlich die zwei geänderten Service-Dateien; nach gezielter Prettier-Formatierung war der vollständige Check grün. |
| `npm test` | Grün: 84/84 Testdateien, 604/604 Tests. Node meldet die bereits bekannte experimentelle Warnung zur nicht konfigurierten Test-`localStorage`-Datei. |
| `npm run typecheck` | Grün: App- und Spec-TypeScript-Prüfung ohne Fehler. |
| `npm run lint` | Exitcode 0, 0 Fehler. 47 vorbestehende `no-explicit-any`-Warnungen; keine Warnung in einer neu geänderten Zeile. |
| `npm run build` | Grün. Ausschließlich die akzeptierten vorbestehenden CommonJS-Hinweise für `jszip` und `jsbarcode`. |
| `task-6-db-verification.sql` | Grün: Rechte/RLS, P0002, UUID-/`sale_id`-Varianten, Rollbacks und Snapshot-Schutz; abschließender Rollback ohne Fixture-Reste. |
| `task-7-db-verification.sql` | Grün: RPC-Rechte, atomarer/idempotenter Checkout, Rollback und Bankbuchungen. |
| `task-7-db-concurrency-verification.ps1` | Grün: zwei konkurrierende IDs ergeben exakt eine Bestellung, einen Verkauf und Artikelstatus `sold`. |
| `npx supabase db lint --local` | Grün: `No schema errors found`. |
| `npx supabase db advisors --local` | Grün: `No issues found`. |
| `npx supabase migration list --local` | Grün: alle 17 Migrationen von `20260816000001` bis `20260824205355` lokal angewandt. |

`npx supabase status` bestätigte erreichbare lokale DB/API-Dienste. Nur die für diese Prüfungen nicht benötigten optionalen Dienste Image Proxy und Pooler waren gestoppt.
