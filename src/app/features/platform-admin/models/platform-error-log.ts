import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export {
  PLATFORM_ERROR_AREAS,
  platformErrorAreaBySlug,
  type PlatformErrorArea,
  type PlatformErrorAreaDefinition,
} from '../../../core/config/platform-error-areas';

export interface PlatformErrorEvent {
  readonly id: number;
  readonly occurredAt: string;
  readonly severity: 'error' | 'warning';
  readonly source: string;
  readonly code: string;
  readonly message: string | null;
  readonly accountLabel: string | null;
  readonly workspaceName: string | null;
  readonly userEmail: string | null;
  readonly referenceId: string | null;
  readonly detail: readonly { readonly label: string; readonly value: string }[];
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  marketplace_operations: 'Kontoabruf',
  marketplace_browser_sessions: 'Browsersitzung',
  marketplace_sync_schedules: 'Automatik',
  marketplace_local_message_outbox: 'Nachricht',
  marketplace_favorite_message_events: 'Favoriten-Nachricht',
  marketplace_negotiation_jobs: 'Preisverhandlung',
  marketplace_listing_jobs: 'Inserat',
  kleinanzeigen_sync_runs: 'Abgleich',
  kleinanzeigen_publication_jobs: 'Veröffentlichung',
  web_push_deliveries: 'Zustellung',
  sniper_runtime_status: 'Suchzyklus',
  app: 'App',
};

const CODE_LABELS: Readonly<Record<string, string>> = {
  access: 'Keine Berechtigung',
  access_revoked: 'Freigabe entzogen',
  browser: 'Browser nicht verfügbar',
  challenge: 'Sicherheitsprüfung von Vinted',
  cleanup: 'Browsersitzung noch nicht beendet',
  configuration_error: 'Push falsch eingerichtet',
  cycle_error: 'Suchzyklus fehlgeschlagen',
  expired: 'Zeit abgelaufen',
  forbidden: 'Zugriff verweigert',
  identity: 'Konto stimmt nicht überein',
  interrupted: 'Abgebrochen',
  needs_login: 'Anmeldung erforderlich',
  needs_user_action: 'Eingriff nötig',
  network: 'Netzwerkfehler',
  outcome_unknown: 'Ergebnis unklar',
  rate_limited: 'Zu viele Anfragen',
  retry: 'Wird wiederholt',
  retry_limit: 'Automatik nach Fehlversuchen angehalten',
  server: 'Anbieter nicht erreichbar',
  timeout: 'Zeitüberschreitung',
};

const DETAIL_LABELS: Readonly<Record<string, string>> = {
  action: 'Aktion',
  attempts: 'Versuche',
  authorization_kind: 'Auslöser',
  cloud_phase: 'Phase',
  consecutive_failures: 'Fehler in Folge',
  device: 'Gerät',
  error_code: 'Fehlercode',
  event_name: 'Ereignis',
  execution_mode: 'Ausführung',
  kind: 'Art',
  offer_error_code: 'Angebotsfehler',
  page: 'Seite',
  retry_after: 'Nächster Versuch',
  stage: 'Schritt',
  state: 'Zustand',
  stop_reason: 'Stoppgrund',
};

const VALUE_LABELS: Readonly<Record<string, string>> = {
  scheduled_read: 'Automatik',
  manual_read: 'Manuell',
  cloud: 'Cloud',
  local: 'Erweiterung',
};

export function platformErrorSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function platformErrorCodeLabel(code: string): string {
  return CODE_LABELS[code] ?? code;
}

export function platformErrorSeverity(event: PlatformErrorEvent): {
  label: string;
  tone: BadgeTone;
} {
  return event.severity === 'warning'
    ? { label: 'Hinweis', tone: 'caution' }
    : { label: 'Fehler', tone: 'critical' };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function detailValue(entry: string | number | boolean): string {
  const raw = String(entry);
  if (typeof entry === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(entry)) {
    const parsed = Date.parse(entry);
    if (Number.isFinite(parsed)) return TIMESTAMP_FORMAT.format(parsed);
  }
  return VALUE_LABELS[raw] ?? raw;
}

function detailEntries(value: unknown): PlatformErrorEvent['detail'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter((pair): pair is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof pair[1]),
    )
    .map(([key, entry]) => ({ label: DETAIL_LABELS[key] ?? key, value: detailValue(entry) }));
}

/** Übersetzt die Antwort von platform_error_events_list; unbrauchbare Zeilen entfallen. */
export function parsePlatformErrorEvents(value: unknown): PlatformErrorEvent[] {
  if (!Array.isArray(value)) throw new Error('Das Fehlerprotokoll ist ungültig.');
  return value.flatMap((row): PlatformErrorEvent[] => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const occurredAt = text(item['occurredAt']);
    const code = text(item['code']);
    if (typeof item['id'] !== 'number' || !occurredAt || !code) return [];
    return [
      {
        id: item['id'],
        occurredAt,
        severity: item['severity'] === 'warning' ? 'warning' : 'error',
        source: text(item['source']) ?? 'unknown',
        code,
        message: text(item['message']),
        accountLabel: text(item['accountLabel']),
        workspaceName: text(item['workspaceName']),
        userEmail: text(item['userEmail']),
        referenceId: text(item['referenceId']),
        detail: detailEntries(item['detail']),
      },
    ];
  });
}
