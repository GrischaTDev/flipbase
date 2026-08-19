import { describe, it, expect, beforeEach } from 'vitest';
import { BackupService, StorageLike } from './backup.service';
import { BACKUP_FORMAT, BACKUP_VERSION, ReflipBackup } from '../models/backup.models';

/** Einfache Speicher-Attrappe, damit die Tests ohne Browser laufen. */
class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

describe('BackupService – Sicherung & Wiederherstellung des lokalen Datenbestands', () => {
  let service: BackupService;
  let storage: FakeStorage;

  beforeEach(() => {
    service = new BackupService();
    storage = new FakeStorage();

    storage.setItem(
      'reflip_local_purchases',
      JSON.stringify([{ id: 'pur-1', title: 'Mystery Paket Elektronik', purchase_price: 40 }])
    );
    storage.setItem(
      'reflip_local_inventory',
      JSON.stringify([
        { id: 'item-1', title: 'Nintendo DS Lite', allocated_purchase_cost: 20 },
        { id: 'item-2', title: 'Sony Kopfhörer', allocated_purchase_cost: 20 },
      ])
    );
    storage.setItem('reflip_local_sales', JSON.stringify([]));
    storage.setItem('reflip_theme', 'dark'); // absichtlich kein gültiges JSON
    storage.setItem('reflip_active_workspace_id', 'demo-workspace-1');
  });

  describe('Sicherung erstellen', () => {
    it('erfasst alle reflip-Schlüssel, nicht nur Einkäufe/Inventar/Verkäufe', () => {
      const backup = service.createBackup(storage);

      expect(backup.format).toBe(BACKUP_FORMAT);
      expect(backup.version).toBe(BACKUP_VERSION);
      expect(Object.keys(backup.entries).sort()).toEqual([
        'reflip_active_workspace_id',
        'reflip_local_inventory',
        'reflip_local_purchases',
        'reflip_local_sales',
        'reflip_theme',
      ]);
    });

    it('lässt fremde Schlüssel unberührt', () => {
      storage.setItem('anderer_dienst_token', 'geheim');

      const backup = service.createBackup(storage);

      expect(backup.entries['anderer_dienst_token']).toBeUndefined();
    });

    it('sichert den Anmeldezustand bewusst nicht mit', () => {
      storage.setItem('reflip_logged_out', 'true');

      const backup = service.createBackup(storage);

      expect(backup.entries['reflip_logged_out']).toBeUndefined();
    });

    it('legt JSON-Werte geparst ab, damit die Datei lesbar bleibt', () => {
      const backup = service.createBackup(storage);

      expect(Array.isArray(backup.entries['reflip_local_inventory'])).toBe(true);
      expect((backup.entries['reflip_local_inventory'] as unknown[]).length).toBe(2);
    });

    it('vermerkt nicht parsbare Werte in rawKeys', () => {
      const backup = service.createBackup(storage);

      expect(backup.rawKeys).toContain('reflip_theme');
      expect(backup.rawKeys).toContain('reflip_active_workspace_id');
      expect(backup.rawKeys).not.toContain('reflip_local_inventory');
    });

    it('kommt ohne verfügbaren Speicher zurecht', () => {
      const backup = service.createBackup(null);

      expect(backup.entries).toEqual({});
      expect(backup.rawKeys).toEqual([]);
    });
  });

  describe('Prüfung vor dem Einspielen', () => {
    it('nimmt eine selbst erzeugte Sicherung an', () => {
      const result = service.validate(service.createBackup(storage));

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('lehnt eine beliebige JSON-Datei ab', () => {
      const result = service.validate({ irgendwas: 123 });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('keine ReFlip-Sicherung');
    });

    it('lehnt null und Zeichenketten ab', () => {
      expect(service.validate(null).isValid).toBe(false);
      expect(service.validate('kaputt').isValid).toBe(false);
    });

    it('lehnt eine Sicherung mit projektfremden Schlüsseln ab', () => {
      const manipuliert = {
        ...service.createBackup(storage),
        entries: { boeser_schluessel: 'x' },
      };

      const result = service.validate(manipuliert);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('nicht zu ReFlip');
    });

    it('warnt bei einer neueren Formatversion, blockiert aber nicht', () => {
      const neuer = { ...service.createBackup(storage), version: BACKUP_VERSION + 1 };

      const result = service.validate(neuer);

      expect(result.isValid).toBe(true);
      expect(result.warnings.join(' ')).toContain('neueren Version');
    });

    it('warnt vor einer leeren Sicherung', () => {
      const leer = { ...service.createBackup(storage), entries: {} };

      const result = service.validate(leer);

      expect(result.isValid).toBe(true);
      expect(result.warnings.join(' ')).toContain('keine Daten');
    });
  });

  describe('Vorschau', () => {
    it('zählt die Datensätze für die Anzeige vor dem Einspielen', () => {
      const summary = service.summarize(service.createBackup(storage));

      expect(summary.purchases).toBe(1);
      expect(summary.inventoryItems).toBe(2);
      expect(summary.sales).toBe(0);
      expect(summary.totalKeys).toBe(5);
      expect(summary.sizeBytes).toBeGreaterThan(0);
    });

    it('zählt fehlende Bereiche als 0 statt zu scheitern', () => {
      const summary = service.summarize(service.createBackup(new FakeStorage()));

      expect(summary.returns).toBe(0);
      expect(summary.invoices).toBe(0);
      expect(summary.storeOrders).toBe(0);
    });
  });

  describe('Wiederherstellung', () => {
    it('stellt den Bestand zeichengenau wieder her (Rundlauf)', () => {
      const vorher = storage.snapshot();
      const backup = service.createBackup(storage);

      const ziel = new FakeStorage();
      service.restore(backup, ziel);

      expect(ziel.snapshot()).toEqual(vorher);
    });

    it('erhält nicht-JSON-Werte unverändert', () => {
      const backup = service.createBackup(storage);
      const ziel = new FakeStorage();

      service.restore(backup, ziel);

      expect(ziel.getItem('reflip_theme')).toBe('dark');
      expect(ziel.getItem('reflip_active_workspace_id')).toBe('demo-workspace-1');
    });

    it('entfernt Daten, die nach der Sicherung entstanden sind', () => {
      const backup = service.createBackup(storage);
      storage.setItem('reflip_local_sales', JSON.stringify([{ id: 'sale-neu' }]));
      storage.setItem('reflip_saved_returns', JSON.stringify([{ id: 'ret-neu' }]));

      service.restore(backup, storage);

      expect(JSON.parse(storage.getItem('reflip_local_sales') ?? '[]')).toEqual([]);
      expect(storage.getItem('reflip_saved_returns')).toBeNull();
    });

    it('lässt fremde Schlüssel beim Einspielen unangetastet', () => {
      const backup = service.createBackup(storage);
      storage.setItem('anderer_dienst_token', 'geheim');

      service.restore(backup, storage);

      expect(storage.getItem('anderer_dienst_token')).toBe('geheim');
    });

    it('meldet die Anzahl der geschriebenen Schlüssel', () => {
      const backup = service.createBackup(storage);

      expect(service.restore(backup, new FakeStorage())).toBe(5);
    });

    it('kommt ohne verfügbaren Speicher zurecht', () => {
      expect(service.restore(service.createBackup(storage), null)).toBe(0);
    });
  });

  describe('Erinnerung an fällige Sicherung', () => {
    it('gilt als überfällig, solange nie gesichert wurde', () => {
      expect(service.daysSinceLastBackup()).toBeNull();
      expect(service.isBackupOverdue()).toBe(true);
    });

    it('gilt direkt nach einer Sicherung als erledigt', () => {
      service.markBackupCreated(new Date().toISOString(), storage);

      expect(service.daysSinceLastBackup()).toBe(0);
      expect(service.isBackupOverdue()).toBe(false);
    });

    it('gilt nach acht Tagen wieder als überfällig', () => {
      const achtTage = new Date(Date.now() - 8 * 86_400_000).toISOString();

      service.markBackupCreated(achtTage, storage);

      expect(service.daysSinceLastBackup()).toBe(8);
      expect(service.isBackupOverdue()).toBe(true);
    });

    it('ist nach sechs Tagen noch nicht überfällig', () => {
      const sechsTage = new Date(Date.now() - 6 * 86_400_000).toISOString();

      service.markBackupCreated(sechsTage, storage);

      expect(service.isBackupOverdue()).toBe(false);
    });

    it('behandelt einen unbrauchbaren Zeitstempel als "nie gesichert"', () => {
      service.markBackupCreated('kein-datum', storage);

      expect(service.daysSinceLastBackup()).toBeNull();
      expect(service.isBackupOverdue()).toBe(true);
    });
  });

  describe('Dateiname', () => {
    it('enthält das Datum der Sicherung', () => {
      const backup: ReflipBackup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: '2026-08-19T09:30:00.000Z',
        entries: {},
        rawKeys: [],
      };

      expect(service.buildFileName(backup)).toBe('reflip-backup-2026-08-19.json');
    });
  });
});
