export interface WatchlistEvaluatorDeps {
  listings: {
    evaluatePending: (batchSize?: number) => Promise<{ processed: number; hits: number }>;
  };
  log: {
    info: (event: string, payload?: Record<string, unknown>) => void;
    error: (event: string, payload?: Record<string, unknown>) => void;
  };
  batchSize?: number;
  maxBatchesPerRun?: number;
}

export interface WatchlistEvaluationResult {
  totalProcessed: number;
  totalHits: number;
  batches: number;
}

export class WatchlistEvaluator {
  private readonly batchSize: number;
  private readonly maxBatchesPerRun: number;

  constructor(private readonly deps: WatchlistEvaluatorDeps) {
    this.batchSize = deps.batchSize ?? 100;
    this.maxBatchesPerRun = deps.maxBatchesPerRun ?? 10;
  }

  /**
   * Holt ausstehende Merkzettel-Bewertungen paketweise nach.
   * Laeuft unabhaengig von Vinted-Abfragen und ohne Verbrauch des externen Request-Budgets.
   */
  async runOnce(): Promise<WatchlistEvaluationResult> {
    let totalProcessed = 0;
    let totalHits = 0;
    let batches = 0;

    while (batches < this.maxBatchesPerRun) {
      try {
        const result = await this.deps.listings.evaluatePending(this.batchSize);
        totalProcessed += result.processed;
        totalHits += result.hits;
        batches += 1;

        // Wenn weniger verarbeitet wurden als die Paketgroesse, ist die Warteschlange erschoepft
        if (result.processed < this.batchSize) {
          break;
        }
      } catch (error) {
        this.deps.log.error('watchlist_evaluation_failed', {
          reason: error instanceof Error ? error.message : String(error),
          batchesCompleted: batches,
          totalProcessed,
          totalHits,
        });
        break;
      }
    }

    if (totalHits > 0 || totalProcessed > 0) {
      this.deps.log.info('watchlist_evaluation_completed', {
        batches,
        processed: totalProcessed,
        hits: totalHits,
      });
    }

    return { totalProcessed, totalHits, batches };
  }
}
