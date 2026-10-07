export type BrowserInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };

export interface BrowserStatus {
  state: 'ready' | 'interaction_required' | 'manual' | 'unavailable';
  sessionId: string | null;
  expiresAt: string | null;
  message: string | null;
}

export class BrowserSessionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface BrowserSession {
  status(operatorId: string): Promise<BrowserStatus>;
  open(operatorId: string): Promise<BrowserStatus>;
  frame(operatorId: string, sessionId: string): Promise<Uint8Array>;
  input(operatorId: string, sessionId: string, command: BrowserInput): Promise<void>;
  verify(operatorId: string, sessionId: string): Promise<BrowserStatus>;
  close(operatorId: string, sessionId: string): Promise<void>;
  runAutomatic<T>(operation: () => Promise<T>): Promise<T | undefined>;
}
