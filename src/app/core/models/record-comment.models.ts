/** Lokale Demo-Kommentare; fachliche Ereignisse bleiben im eigenen Journal. */
export interface DemoRecordComment {
  readonly id: string;
  readonly workspace_id: string;
  readonly entityType: 'purchase' | 'sale';
  readonly entityId: string;
  readonly createdAt: string;
  readonly actorName: string;
  readonly body: string;
}
