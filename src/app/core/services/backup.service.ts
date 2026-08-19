import { Injectable, computed, signal } from '@angular/core';
import {
  BACKUP_EXCLUDED_KEYS,
  BACKUP_FORMAT,
  BACKUP_KEY_PREFIX,
  BACKUP_REMINDER_DAYS,
  BACKUP_SUMMARY_KEYS,
  BACKUP_VERSION,
  BackupSummary,
  BackupValidationResult,
  LAST_BACKUP_KEY,
  ReflipBackup,
} from '../models/backup.models';

/**
 * Minimaler Speicher-Vertrag. Erlaubt es, den Dienst in Tests ohne Browser
 * zu betreiben, indem eine einfache Attrappe übergeben wird.
 */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Liefert den Browser-Speicher oder null, wenn keiner verfügbar ist (Tests, SSR). */
function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    // Zugriff kann durch Browsereinstellungen blockiert sein
  }
  return null;
}

/**
 * Sichert und stellt den lokalen Datenbestand wieder her.
 *
 * Anders als der bisherige "Vollständiges Backup"-Export, der nur Workspace,
 * Einkäufe, Inventar und Verkäufe erfasst hat, sichert dieser Dienst **alle**
 * Schlüssel mit dem Präfix `reflip_` – also auch Retouren, Rechnungen,
 * Shop-Bestellungen, Artikelkosten, Belege, Bargeldkasse, Offline-Warteschlange
 * und sämtliche Konfigurationen. Und er kann sie wieder einspielen.
 */
@Injectable({
  providedIn: 'root',
})
export class BackupService {
  /** Zeitpunkt der letzten Sicherung als ISO-Zeichenkette, oder null. */
  readonly lastBackupAt = signal<string | null>(this.readLastBackupAt());

  /** Vollendete Tage seit der letzten Sicherung; null, wenn noch nie gesichert wurde. */
  readonly daysSinceLastBackup = computed<number | null>(() => {
    const last = this.lastBackupAt();
    if (!last) return null;
    const then = new Date(last).getTime();
    if (Number.isNaN(then)) return null;
    return Math.floor((Date.now() - then) / 86_400_000);
  });

  /** Wahr, wenn noch nie oder seit über sieben Tagen nicht gesichert wurde. */
  readonly isBackupOverdue = computed<boolean>(() => {
    const days = this.daysSinceLastBackup();
    return days === null || days >= BACKUP_REMINDER_DAYS;
  });

  // ───────────────────────────── Sicherung erstellen ─────────────────────────────

  /**
   * Liest alle zu sichernden Schlüssel aus dem Speicher und baut daraus eine
   * Sicherung. Werte werden geparst abgelegt, damit die Datei lesbar bleibt;
   * nicht parsbare Werte landen unverändert als Zeichenkette und werden in
   * `rawKeys` vermerkt, damit das Einspielen zeichengenau bleibt.
   */
  createBackup(storage: StorageLike | null = getBrowserStorage()): ReflipBackup {
    const entries: Record<string, unknown> = {};
    const rawKeys: string[] = [];

    for (const key of this.collectKeys(storage)) {
      const raw = storage?.getItem(key);
      if (raw === null || raw === undefined) continue;

      try {
        entries[key] = JSON.parse(raw);
      } catch {
        entries[key] = raw;
        rawKeys.push(key);
      }
    }

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      entries,
      rawKeys,
    };
  }

  /** Erzeugt den Dateiinhalt einer Sicherung. */
  serialize(backup: ReflipBackup): string {
    return JSON.stringify(backup, null, 2);
  }

  /** Vorgeschlagener Dateiname, z. B. `reflip-backup-2026-08-19.json`. */
  buildFileName(backup: ReflipBackup): string {
    const date = backup.createdAt.split('T')[0];
    return `reflip-backup-${date}.json`;
  }

  /**
   * Erstellt eine Sicherung und lädt sie als Datei herunter.
   * Merkt sich anschliessend den Zeitpunkt für die Erinnerungsfunktion.
   */
  downloadBackup(storage: StorageLike | null = getBrowserStorage()): ReflipBackup {
    const backup = this.createBackup(storage);
    this.triggerDownload(this.serialize(backup), this.buildFileName(backup));
    this.markBackupCreated(backup.createdAt, storage);
    return backup;
  }

  // ───────────────────────────── Prüfen & Vorschau ─────────────────────────────

  /**
   * Prüft den Inhalt einer eingelesenen Datei, bevor irgendetwas überschrieben wird.
   * Gibt eine verständliche Meldung zurück, statt eine Ausnahme zu werfen.
   */
  validate(input: unknown): BackupValidationResult {
    const warnings: string[] = [];

    if (input === null || typeof input !== 'object') {
      return { isValid: false, error: 'Die Datei enthält keine gültigen Daten.', warnings };
    }

    const candidate = input as Partial<ReflipBackup>;

    if (candidate.format !== BACKUP_FORMAT) {
      return {
        isValid: false,
        error:
          'Das ist keine ReFlip-Sicherung. Erwartet wird eine Datei, die mit ' +
          `"format": "${BACKUP_FORMAT}" beginnt.`,
        warnings,
      };
    }

    if (typeof candidate.version !== 'number') {
      return { isValid: false, error: 'Der Sicherung fehlt die Formatversion.', warnings };
    }

    if (candidate.version > BACKUP_VERSION) {
      warnings.push(
        `Die Sicherung wurde mit einer neueren Version erstellt (Format ${candidate.version}, ` +
          `diese App kennt ${BACKUP_VERSION}). Möglicherweise gehen unbekannte Felder verloren.`,
      );
    }

    if (candidate.entries === null || typeof candidate.entries !== 'object') {
      return { isValid: false, error: 'Der Sicherung fehlen die Daten.', warnings };
    }

    const foreignKeys = Object.keys(candidate.entries).filter(
      (key) => !key.startsWith(BACKUP_KEY_PREFIX),
    );
    if (foreignKeys.length > 0) {
      return {
        isValid: false,
        error:
          'Die Sicherung enthält Schlüssel, die nicht zu ReFlip gehören: ' +
          `${foreignKeys.slice(0, 3).join(', ')}. Sie wird aus Sicherheitsgründen abgelehnt.`,
        warnings,
      };
    }

    if (Object.keys(candidate.entries).length === 0) {
      warnings.push('Die Sicherung enthält keine Daten. Das Einspielen würde alles leeren.');
    }

    const backup: ReflipBackup = {
      format: BACKUP_FORMAT,
      version: candidate.version,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
      entries: candidate.entries as Record<string, unknown>,
      rawKeys: Array.isArray(candidate.rawKeys) ? candidate.rawKeys : [],
    };

    return { isValid: true, warnings, backup };
  }

  /** Liest und prüft eine vom Nutzer gewählte Datei. */
  async readFile(file: File): Promise<BackupValidationResult> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      return { isValid: false, error: 'Die Datei konnte nicht gelesen werden.', warnings: [] };
    }

    try {
      return this.validate(JSON.parse(text));
    } catch {
      return {
        isValid: false,
        error: 'Die Datei ist kein gültiges JSON. Wurde sie nachträglich bearbeitet?',
        warnings: [],
      };
    }
  }

  /** Zählt die wichtigsten Datensätze für die Vorschau vor dem Einspielen. */
  summarize(backup: ReflipBackup): BackupSummary {
    const count = (key: string): number => {
      const value = backup.entries[key];
      return Array.isArray(value) ? value.length : 0;
    };

    return {
      createdAt: backup.createdAt,
      purchases: count(BACKUP_SUMMARY_KEYS.purchases),
      inventoryItems: count(BACKUP_SUMMARY_KEYS.inventoryItems),
      sales: count(BACKUP_SUMMARY_KEYS.sales),
      returns: count(BACKUP_SUMMARY_KEYS.returns),
      invoices: count(BACKUP_SUMMARY_KEYS.invoices),
      storeOrders: count(BACKUP_SUMMARY_KEYS.storeOrders),
      mediaFiles: count(BACKUP_SUMMARY_KEYS.mediaFiles),
      totalKeys: Object.keys(backup.entries).length,
      sizeBytes: this.serialize(backup).length,
    };
  }

  // ───────────────────────────── Wiederherstellen ─────────────────────────────

  /**
   * Spielt eine Sicherung ein und ersetzt dabei den gesamten bisherigen Bestand.
   *
   * Bewusst als vollständiges Ersetzen umgesetzt: Ein Zusammenführen zweier
   * Bestände liesse sich ohne stabile Zeitstempel pro Datensatz nicht
   * verlässlich entscheiden und würde stillschweigend falsche Ergebnisse
   * liefern. Der Aufrufer muss vorher eine Sicherheitskopie erstellen.
   *
   * @returns Anzahl der geschriebenen Schlüssel.
   */
  restore(backup: ReflipBackup, storage: StorageLike | null = getBrowserStorage()): number {
    if (!storage) return 0;

    // Alten Bestand entfernen, damit keine Reste aus der Zeit vor der Sicherung
    // zurückbleiben und ein widersprüchliches Bild ergeben.
    for (const key of this.collectKeys(storage)) {
      storage.removeItem(key);
    }

    const rawKeys = new Set(backup.rawKeys);
    let written = 0;

    for (const [key, value] of Object.entries(backup.entries)) {
      if (!key.startsWith(BACKUP_KEY_PREFIX)) continue;
      if (BACKUP_EXCLUDED_KEYS.includes(key)) continue;

      try {
        const raw = rawKeys.has(key) && typeof value === 'string' ? value : JSON.stringify(value);
        storage.setItem(key, raw);
        written++;
      } catch {
        // Speicher voll oder gesperrt – restliche Schlüssel trotzdem versuchen
      }
    }

    return written;
  }

  // ───────────────────────────── Erinnerung ─────────────────────────────

  /** Hält den Zeitpunkt der letzten Sicherung fest. */
  markBackupCreated(
    isoDate: string = new Date().toISOString(),
    storage: StorageLike | null = getBrowserStorage(),
  ): void {
    this.lastBackupAt.set(isoDate);
    try {
      storage?.setItem(LAST_BACKUP_KEY, isoDate);
    } catch {
      // Nicht kritisch – betrifft nur die Erinnerungsfunktion
    }
  }

  // ───────────────────────────── Interna ─────────────────────────────

  /** Sammelt alle zu sichernden Schlüssel aus dem Speicher. */
  private collectKeys(storage: StorageLike | null): string[] {
    if (!storage) return [];

    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (!key.startsWith(BACKUP_KEY_PREFIX)) continue;
      if (BACKUP_EXCLUDED_KEYS.includes(key)) continue;
      keys.push(key);
    }
    return keys.sort();
  }

  private readLastBackupAt(): string | null {
    try {
      return getBrowserStorage()?.getItem(LAST_BACKUP_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private triggerDownload(content: string, filename: string): void {
    if (typeof document === 'undefined') return;

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
