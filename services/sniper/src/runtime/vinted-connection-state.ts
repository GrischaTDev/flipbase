export interface VintedConnectionSnapshot {
  connectedSince: Date | null;
  lastSuccessAt: Date | null;
}

/** Hält den aktuellen Abschnitt erfolgreicher Vinted-Operationen fest. */
export class VintedConnectionState {
  private connectedSince: Date | null = null;
  private lastSuccessAt: Date | null = null;

  recordSuccess(at = new Date()): void {
    this.connectedSince ??= at;
    this.lastSuccessAt = at;
  }

  recordFailure(): void {
    this.connectedSince = null;
    this.lastSuccessAt = null;
  }

  snapshot(): VintedConnectionSnapshot {
    return {
      connectedSince: this.connectedSince,
      lastSuccessAt: this.lastSuccessAt,
    };
  }
}
