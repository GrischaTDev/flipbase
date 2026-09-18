import { ErrorHandler, Injectable, inject } from '@angular/core';
import { StaleChunkRecoveryService } from '../services/stale-chunk-recovery.service';

@Injectable()
export class AppErrorHandler extends ErrorHandler {
  private readonly staleChunkRecovery = inject(StaleChunkRecoveryService);

  override handleError(error: unknown): void {
    if (this.staleChunkRecovery.tryRecover(error)) return;
    super.handleError(error);
  }
}
