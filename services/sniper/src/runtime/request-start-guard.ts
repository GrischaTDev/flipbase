import { RequestBudgetUnavailableError, type RequestBudget } from './budget.js';

export class RequestPausedError extends Error {
  constructor() {
    super('Der gemeinsame Vinted-Zugang ist pausiert.');
    this.name = 'RequestPausedError';
  }
}

/** Gemeinsame lokale Startgrenze; die dauerhafte Anbieterpause bleibt in der Datenbank. */
export class RequestStartGuard {
  private paused = false;
  private operatorVerification = false;

  constructor(private readonly budget: RequestBudget) {}

  pause(): void {
    this.paused = true;
  }
  allowAutomatic(): void {
    this.paused = false;
  }
  beginOperatorVerification(): void {
    this.operatorVerification = true;
  }
  endOperatorVerification(): void {
    this.operatorVerification = false;
  }

  assertCanStart(): void {
    if (this.paused && !this.operatorVerification) throw new RequestPausedError();
    if (!this.budget.hasCapacity()) throw new RequestBudgetUnavailableError();
  }
}
