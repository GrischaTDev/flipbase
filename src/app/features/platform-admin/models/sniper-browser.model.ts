export interface SniperBrowserStatus {
  state: 'ready' | 'interaction_required' | 'manual' | 'unavailable';
  sessionId: string | null;
  expiresAt: string | null;
  message: string | null;
}

export type SniperBrowserInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };

export class SniperBrowserError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
