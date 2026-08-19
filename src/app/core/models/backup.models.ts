/**
 * Datenmodelle für die Sicherung und Wiederherstellung des lokalen Datenbestands.
 *
 * Solange die Anwendung ihre Daten im localStorage des Browsers hält, ist eine
 * Sicherung ausserhalb des Browsers die einzige Absicherung gegen Datenverlust.
 * Ein geleerter Browser-Cache löscht andernfalls den kompletten Bestand.
 */

/** Kennung im Dateikopf, an der eine ReFlip-Sicherung erkannt wird. */
export const BACKUP_FORMAT = 'reflip-backup';

/** Aktuelle Formatversion. Wird bei strukturellen Änderungen erhöht. */
export const BACKUP_VERSION = 1;

/** Präfix, an dem die Datenschlüssel der Anwendung im Speicher erkannt werden. */
export const BACKUP_KEY_PREFIX = 'reflip_';

/**
 * Schlüssel, die bewusst NICHT gesichert werden.
 *
 * - `reflip_logged_out` ist Anmeldezustand. Würde er mitgesichert und später
 *   eingespielt, könnte eine alte Sicherung den aktuellen Anmeldestatus
 *   überschreiben.
 * - `reflip_last_backup_at` beschreibt die Sicherung selbst und gehört daher
 *   nicht in die Sicherung hinein.
 */
export const BACKUP_EXCLUDED_KEYS: readonly string[] = [
  'reflip_logged_out',
  'reflip_last_backup_at',
];

/** Speicherschlüssel für den Zeitpunkt der letzten Sicherung. */
export const LAST_BACKUP_KEY = 'reflip_last_backup_at';

/** Ab wie vielen Tagen ohne Sicherung erinnert wird. */
export const BACKUP_REMINDER_DAYS = 7;

/**
 * Inhalt einer Sicherungsdatei.
 *
 * `entries` hält die Werte in geparster Form, damit die Datei lesbar bleibt.
 * `rawKeys` listet die Schlüssel auf, deren Wert kein gültiges JSON war
 * (z. B. `reflip_theme` = `dark`). Nur so lässt sich der ursprüngliche
 * Speicherinhalt beim Einspielen zeichengenau wiederherstellen.
 */
export interface ReflipBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  entries: Record<string, unknown>;
  rawKeys: string[];
}

/** Überblick über den Inhalt einer Sicherung – Grundlage der Vorschau vor dem Einspielen. */
export interface BackupSummary {
  createdAt: string;
  purchases: number;
  inventoryItems: number;
  sales: number;
  returns: number;
  invoices: number;
  storeOrders: number;
  mediaFiles: number;
  /** Anzahl der gesicherten Speicherschlüssel insgesamt. */
  totalKeys: number;
  /** Grösse der Sicherung in Bytes. */
  sizeBytes: number;
}

/** Ergebnis der Prüfung einer eingelesenen Datei. */
export interface BackupValidationResult {
  isValid: boolean;
  /** Verständliche Fehlermeldung, wenn die Datei nicht eingespielt werden kann. */
  error?: string;
  /** Hinweise, die das Einspielen nicht verhindern (z. B. neuere Formatversion). */
  warnings: string[];
  backup?: ReflipBackup;
}

/** Zuordnung Speicherschlüssel → Feld in der Übersicht. */
export const BACKUP_SUMMARY_KEYS = {
  purchases: 'reflip_local_purchases',
  inventoryItems: 'reflip_local_inventory',
  sales: 'reflip_local_sales',
  returns: 'reflip_saved_returns',
  invoices: 'reflip_generated_invoices',
  storeOrders: 'reflip_store_orders',
  mediaFiles: 'reflip_local_media',
} as const;
