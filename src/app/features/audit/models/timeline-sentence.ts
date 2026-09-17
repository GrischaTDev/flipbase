import { BusinessEvent } from '../../../core/models/business-event.models';
import { mapRecordChanges, RecordChange } from '../../../shared/utils/record-changes';

/**
 * Gespeichert wird nur der Satzrest. Das Subjekt entsteht erst beim Anzeigen,
 * damit dieselbe Zeile für die eigene Person „Du hast …“ und für andere
 * „Lena Meyer hat …“ ergibt.
 */
const PREDICATES: Readonly<Record<string, string>> = {
  purchase_draft_created: 'diesen Einkauf erstellt',
  purchase_draft_updated: 'diesen Einkaufsentwurf geändert',
  purchase_ordered: 'diesen Einkauf als bestellt markiert',
  purchase_arrived: 'diesen Einkauf als angekommen markiert',
  purchase_seller_details_updated: 'die Verkäuferangaben ergänzt',
  purchase_package_contents_captured: 'Paketinhalt erfasst',
  purchase_finalized: 'diesen Einkauf abgeschlossen',
  purchase_costing_finalized: 'diesen Einkauf abgeschlossen',
  purchase_corrected: 'diesen abgeschlossenen Einkauf korrigiert',
  purchase_reopened: 'diesen Einkauf wieder geöffnet',
  purchase_tracking_added: 'eine Sendungsnummer hinterlegt',
  purchase_tracking_updated: 'die Sendungsverfolgung aktualisiert',
  purchase_tracking_removed: 'die Sendungsnummer entfernt',
  purchase_costing_legacy_migrated: 'Altdaten dieses Einkaufs übernommen',
  sale_recorded: 'diesen Verkauf erfasst',
  sale_finalized: 'diesen Verkauf abgeschlossen',
  sale_voided: 'diesen Verkauf storniert',
  sale_refund_updated: 'die Erstattung aktualisiert',
  sale_return_recorded: 'eine Retoure erfasst',
  sale_returned: 'eine Retoure erfasst',
  return_created: 'eine Retoure erfasst',
};

/** Ereignisse, deren Nutzlast nur ein Schnappschuss ist und nichts zusätzlich erklärt. */
const SNAPSHOT_ONLY_EVENTS: ReadonlySet<string> = new Set(['purchase_draft_created']);

/** Felder, die der Satz des jeweiligen Ereignisses bereits ausspricht. */
const REDUNDANT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  purchase_ordered: ['receiving_status', 'shipment_status', 'arrived_at'],
  purchase_arrived: ['receiving_status', 'shipment_status', 'arrived_at'],
};

const SYSTEM_SUBJECT = 'Das System';

export function timelineSentence(
  event: BusinessEvent,
  actorName: string,
  currentUserId: string | null,
): string {
  const isSelf = Boolean(event.actorId) && event.actorId === currentUserId;
  const predicate = PREDICATES[event.eventType];
  if (!predicate) {
    // Für unbekannte Ereignisse bleibt das nüchterne Etikett stehen, statt
    // einen Satz zu erfinden, der etwas Falsches behaupten könnte.
    const subject = event.actorId ? actorName : SYSTEM_SUBJECT;
    return `${subject} · ${event.eventLabel}`;
  }
  if (isSelf) return `Du hast ${predicate}.`;
  return `${event.actorId ? actorName : SYSTEM_SUBJECT} hat ${predicate}.`;
}

export function timelineChanges(event: BusinessEvent): readonly RecordChange[] {
  if (event.eventType === 'purchase_package_contents_captured') {
    const changes = event.changes;
    const items =
      changes && typeof changes === 'object' && !Array.isArray(changes)
        ? changes['inventory_items']
        : null;
    return Array.isArray(items)
      ? items.flatMap((item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          typeof item['title'] === 'string'
            ? [{ label: 'Artikel erfasst', from: null, to: item['title'] }]
            : [],
        )
      : [];
  }
  if (SNAPSHOT_ONLY_EVENTS.has(event.eventType)) return [];
  return mapRecordChanges(event.changes, {
    hiddenKeys: new Set(REDUNDANT_FIELDS[event.eventType] ?? []),
  });
}
