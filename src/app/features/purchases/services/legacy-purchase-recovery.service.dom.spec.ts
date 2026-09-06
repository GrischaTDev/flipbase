import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyPurchaseRecoveryService } from './legacy-purchase-recovery.service';

describe('LegacyPurchaseRecoveryService', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bietet ohne alte Aufnahmen keine Sicherung an', () => {
    expect(new LegacyPurchaseRecoveryService().hasBackup()).toBe(false);
    storage.set('flipbase_offline_purchase_entries', '[]');
    expect(new LegacyPurchaseRecoveryService().hasBackup()).toBe(false);
  });

  it('sichert Rohdaten einschließlich unbekannter Felder und Wallet ohne Änderungen', () => {
    const raw = '[{"id":"old","workspace_id":"another","sync_status":"pending","unknown":42}]';
    storage.set('flipbase_offline_purchase_entries', raw);
    storage.set('flipbase_flea_market_cash_wallet', '{"currentCash":7}');
    const service = new LegacyPurchaseRecoveryService();
    expect(service.hasBackup()).toBe(true);
    const backup = JSON.parse(service.backupContents());
    expect(backup.entries_raw).toBe(raw);
    expect(backup.wallet_raw).toBe('{"currentCash":7}');
    expect(storage.get('flipbase_offline_purchase_entries')).toBe(raw);
  });

  it('erhält auch ein beschädigtes Altformat zur manuellen Wiederherstellung', () => {
    storage.set('flipbase_offline_purchase_entries', '{unvollständig');
    const service = new LegacyPurchaseRecoveryService();
    expect(service.hasBackup()).toBe(true);
    expect(JSON.parse(service.backupContents()).entries_raw).toBe('{unvollständig');
  });
});
