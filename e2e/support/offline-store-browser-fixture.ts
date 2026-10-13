import '@angular/compiler';
import { OfflinePurchaseDraftStore } from '../../src/app/features/purchases/services/offline-purchase-draft.store';

// Nur der Produktionstestserver liefert dieses Modul; es gehört nie zum App-Bau.
Object.assign(window, { createOfflinePurchaseStore: () => new OfflinePurchaseDraftStore() });
