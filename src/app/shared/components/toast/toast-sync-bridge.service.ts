import { effect, inject, Injectable } from '@angular/core';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { ToastService } from './toast.service';

/** Hält fehlgeschlagene Datenbankvorgänge und ihre Fehler-Toasts synchron. */
@Injectable({ providedIn: 'root' })
export class ToastSyncBridgeService {
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  private readonly syncZuToast = new Map<number, number>();
  private readonly toastZuSync = new Map<number, number>();

  private readonly syncAbgleich = effect(() => {
    const fehler = this.syncStatus.fehler();
    const aktuelleSyncIds = new Set(fehler.map((eintrag) => eintrag.id));

    for (const eintrag of fehler) {
      if (this.syncZuToast.has(eintrag.id)) continue;

      const toastId = this.toast.error(`${eintrag.vorgang} fehlgeschlagen.`, eintrag.meldung);
      this.syncZuToast.set(eintrag.id, toastId);
      this.toastZuSync.set(toastId, eintrag.id);
    }

    for (const [syncId, toastId] of this.syncZuToast) {
      if (aktuelleSyncIds.has(syncId)) continue;

      this.syncZuToast.delete(syncId);
      this.toastZuSync.delete(toastId);
      this.toast.dismiss(toastId);
    }
  });

  private readonly toastAbgleich = effect(() => {
    const aktuelleToastIds = new Set(this.toast.toasts().map((eintrag) => eintrag.id));

    for (const [toastId, syncId] of this.toastZuSync) {
      if (aktuelleToastIds.has(toastId)) continue;

      this.toastZuSync.delete(toastId);
      this.syncZuToast.delete(syncId);
      this.syncStatus.verwerfen(syncId);
    }
  });
}
