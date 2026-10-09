export type CloudSetupState =
  'reserved' | 'login' | 'verified' | 'finalizing' | 'completed' | 'cleanup_pending' | 'cancelled';

export type CloudSetupRequest =
  | { workspaceId: string; connectionId: string; requestId: string }
  | { workspaceId: string; displayName: string; requestId: string };

export interface CloudSetupView {
  workspaceId: string;
  connectionId: string;
  setupId: string;
  state: CloudSetupState;
  sessionId: string | null;
}

export type CloudSetupResult =
  | { status: 'ready'; setup: CloudSetupView }
  | { status: 'no_capacity' | 'purchase_pending' | 'purchase_failed' | 'limit_reached' };
