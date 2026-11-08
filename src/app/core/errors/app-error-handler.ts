import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { AppErrorReportService } from '../services/app-error-report.service';
import { StaleChunkRecoveryService } from '../services/stale-chunk-recovery.service';

@Injectable()
export class AppErrorHandler extends ErrorHandler {
  private readonly staleChunkRecovery = inject(StaleChunkRecoveryService);
  // Erst bei Bedarf auflösen: Router und Auth hängen selbst am ErrorHandler.
  private readonly injector = inject(Injector);

  override handleError(error: unknown): void {
    if (this.staleChunkRecovery.tryRecover(error)) return;
    super.handleError(error);
    try {
      this.injector.get(AppErrorReportService).reportException(error);
    } catch {
      // Die Fehleranzeige darf nicht am Protokoll scheitern.
    }
  }
}
