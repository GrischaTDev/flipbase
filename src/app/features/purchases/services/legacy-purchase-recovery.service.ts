import { Injectable, signal } from '@angular/core';

const entryKey = 'flipbase_offline_purchase_entries';
const walletKey = 'flipbase_flea_market_cash_wallet';

/** Ausschließlich Sicherung alter lokaler Aufnahmen; keine neue Erfassung oder Synchronisierung. */
@Injectable({ providedIn: 'root' })
export class LegacyPurchaseRecoveryService {
  readonly hasBackup = signal(this.readEntries() !== null);

  private readEntries(): string | null {
    try {
      const raw = localStorage.getItem(entryKey);
      return raw && raw !== '[]' ? raw : null;
    } catch {
      return null;
    }
  }

  backupContents(): string {
    const entries = localStorage.getItem(entryKey);
    if (!entries) throw new Error('Keine lokalen Aufnahmen vorhanden.');
    // Unverändert sichern, damit auch beschädigte oder unbekannte Altformate erhalten bleiben.
    return JSON.stringify(
      {
        format: 'flipbase-legacy-purchase-backup-v1',
        exported_at: new Date().toISOString(),
        entries_raw: entries,
        wallet_raw: localStorage.getItem(walletKey),
      },
      null,
      2,
    );
  }

  exportBackup(): void {
    const url = URL.createObjectURL(
      new Blob([this.backupContents()], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flipbase-lokale-einkaufsaufnahmen.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // Originaldaten absichtlich behalten: Ein Download-Klick bestätigt noch keine sichere Ablage.
  }
}
