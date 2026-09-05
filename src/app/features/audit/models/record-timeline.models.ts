import { BusinessEvent } from '../../../core/models/business-event.models';

export type RecordTimelineEntityType = 'purchase' | 'sale';
export interface RecordTimelineEntry {
  readonly id: string;
  readonly kind: 'event' | 'comment';
  readonly createdAt: string;
  readonly actorName: string;
  readonly body: string | null;
  readonly event: BusinessEvent | null;
}
export interface RecordTimelinePage {
  readonly entries: readonly RecordTimelineEntry[];
  readonly nextCursor: string | null;
}
export interface RecordTimelineCursor {
  readonly createdAt: string;
  readonly kind: 'event' | 'comment';
  readonly id: string;
}
export function canSubmitComment(body: string): boolean {
  const length = Array.from(body.trim()).length;
  return length > 0 && length <= 5000;
}
export function compareTimelineEntries(a: RecordTimelineCursor, b: RecordTimelineCursor): number {
  // ISO-Zeiten behalten Mikrosekunden: Date.parse allein würde DB-Gleichstände erfinden.
  const timeA = normalizeTimestamp(a.createdAt);
  const timeB = normalizeTimestamp(b.createdAt);
  if (timeA !== timeB) return timeA > timeB ? -1 : 1;
  if (a.kind !== b.kind) return a.kind > b.kind ? -1 : 1;
  return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
}
function normalizeTimestamp(value: string): string {
  const iso = new Date(value).toISOString();
  const fraction = /\.(\d+)/u.exec(value)?.[1] ?? '';
  return iso.slice(0, 19) + '.' + fraction.padEnd(6, '0').slice(0, 6);
}
export function mergeTimelineEntries(
  previous: readonly RecordTimelineEntry[],
  next: readonly RecordTimelineEntry[],
): readonly RecordTimelineEntry[] {
  return [
    ...new Map(
      [...previous, ...next].map((entry) => [`${entry.kind}:${entry.id}`, entry]),
    ).values(),
  ].sort(compareTimelineEntries);
}
export function encodeTimelineCursor(entry: RecordTimelineCursor): string {
  return btoa(JSON.stringify([entry.createdAt, entry.kind, entry.id]));
}
export function decodeTimelineCursor(cursor: string): RecordTimelineCursor {
  try {
    const value: unknown = JSON.parse(atob(cursor));
    if (!Array.isArray(value) || value.length !== 3) throw new Error();
    const [createdAt, kind, id] = value;
    if (
      typeof createdAt !== 'string' ||
      Number.isNaN(Date.parse(createdAt)) ||
      (kind !== 'comment' && kind !== 'event') ||
      typeof id !== 'string' ||
      !id
    )
      throw new Error();
    return { createdAt, kind, id };
  } catch {
    throw new Error('Der Seitenzeiger für die Chronik ist ungültig.');
  }
}
