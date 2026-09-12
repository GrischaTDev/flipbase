import type { MarketplaceListing } from '../domain/listing.js';
import type { QueryStatus, SniperQuery } from '../domain/query.js';
import type { Logger } from '../log.js';
import { ForbiddenError, RateLimitedError } from '../vinted/errors.js';
import type { RequestBudget } from './budget.js';

const MAX_CONSECUTIVE_FAILURES = 3;

export interface QueryStoreLike {
  dueQueries(now: Date): Promise<SniperQuery[]>;
  markPolled(id: string, status: QueryStatus): Promise<void>;
  markSeeded(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
}

export interface CollectorLike {
  collect(query: SniperQuery): Promise<MarketplaceListing[]>;
}

export interface ListingStoreLike {
  saveNew(
    listings: MarketplaceListing[],
    discoveredByQueryId: string,
  ): Promise<MarketplaceListing[]>;
  evaluateHits(queryId: string, reportHits: boolean): Promise<number>;
}

export interface CycleReport {
  polled: number;
  skippedForBudget: number;
  newListings: number;
  seeded: number;
  failed: number;
  newHits: number;
}

export interface SchedulerDeps {
  queries: QueryStoreLike;
  collector: CollectorLike;
  listings: ListingStoreLike;
  budget: RequestBudget;
  log: Logger;
}

export class QueryScheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  async runOnce(now: Date): Promise<CycleReport> {
    const report: CycleReport = {
      polled: 0,
      skippedForBudget: 0,
      newListings: 0,
      seeded: 0,
      failed: 0,
      newHits: 0,
    };

    // Rueckfallnetz: `dueQueries()` haengt an genau demselben Store wie
    // `markPolled`/`saveNew` und kann ebenso an einem voruebergehenden
    // Datenbankfehler scheitern. Dieser Aufruf sitzt aber vor der Schleife,
    // also ausserhalb jedes try/catch dort drinnen - ohne eigene Absicherung
    // wuerde ein Fehlschlag hier ungefangen aus runOnce() durchschlagen und
    // den gesamten Durchlauf zum Absturz bringen, noch bevor ueberhaupt ein
    // CycleReport entsteht. Ein eigener Log-Ereignisname (statt
    // `cycle_failed`) haelt diesen Fall von einem einzelnen fehlgeschlagenen
    // Abfrage-Poll unterscheidbar.
    let dueQueries: SniperQuery[];
    try {
      dueQueries = await this.deps.queries.dueQueries(now);
    } catch (error) {
      report.failed += 1;
      this.deps.log.error('due_queries_failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return report;
    }

    // Die aelteste Abfrage zuerst - das Budget entscheidet bei Knappheit nach
    // Wartezeit, nicht nach Paket.
    for (const query of dueQueries) {
      // `hasCapacity()` fragt hier nur um Erlaubnis - sie zaehlt selbst
      // nichts mit. Die tatsaechlichen HTTP-Anfragen, die ein einzelner
      // collect()-Aufruf ausloesen kann (Session-Aufwaermen, Wiederholungen
      // bei 5xx, Neuaufwaermen bei 401 mit eigener Wiederholung), werden auf
      // der Transportebene gezaehlt: `countingFetch` (runtime/counting-
      // fetch.ts) umschliesst die fetch-Funktion und ruft fuer jede
      // tatsaechlich abgeschickte Anfrage `budget.record()`. So spiegelt das
      // Budget echte Anfragen wider, nicht Abfrage-Durchlaeufe.
      if (!this.deps.budget.hasCapacity()) {
        report.skippedForBudget += 1;
        continue;
      }

      // Rueckfallnetz: Alles, was aus pollOne() ungefangen durchschlaegt - ein
      // Speicherfehler nach erfolgreichem collect(), oder ein Fehler beim
      // Aufzeichnen eines bereits erkannten Fehlschlags in handleFailure() -
      // darf nicht den ganzen Durchlauf mitreissen. Eine Abfrage bleibt eine
      // Abfrage; die naechste faellige soll trotzdem noch drankommen.
      //
      // Es wird hier bewusst kein erneuter Store-Aufruf versucht: War der
      // Store selbst der Grund fuer den Fehler, wuerde ein weiterer Versuch
      // denselben Fehler nur wiederholen und koennte so das Rueckfallnetz
      // selbst zum Absturz bringen. `failedBefore` verhindert lediglich eine
      // doppelte Zaehlung, wenn handleFailure() den Fehlschlag schon erfasst
      // hatte, bevor sein eigener Store-Aufruf ebenfalls scheiterte.
      const failedBefore = report.failed;
      try {
        await this.pollOne(query, report);
      } catch (error) {
        if (report.failed === failedBefore) {
          report.failed += 1;
        }
        this.deps.log.error('cycle_failed_unhandled', {
          query: query.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.deps.log.info('cycle', {
      polled: report.polled,
      new: report.newListings,
      seeded: report.seeded,
      failed: report.failed,
      skipped: report.skippedForBudget,
      newHits: report.newHits,
      budget: this.deps.budget.usageRatio().toFixed(2),
    });

    return report;
  }

  private async pollOne(query: SniperQuery, report: CycleReport): Promise<void> {
    let listings: MarketplaceListing[];

    try {
      listings = await this.deps.collector.collect(query);
    } catch (error) {
      await this.handleFailure(query, error, report);
      return;
    }

    const created = await this.deps.listings.saveNew(listings, query.id);
    report.polled += 1;

    // Der Einlese-Lauf meldet nichts. Er hakt den vorgefundenen Bestand nur
    // als geprueft ab - sonst wuerde die erste Runde einer neuen Abfrage jedes
    // vorhandene Angebot unter dem Median als Fund ausrufen.
    //
    // Eine gescheiterte Bewertung darf den Fund nicht entwerten: Gespeichert
    // ist er, und die Abfrage gilt als gepollt. Sonst holte der naechste
    // Durchgang dieselben Artikel noch einmal. Ungeprueft Gebliebenes kommt
    // von selbst wieder dran, weil der Vermerk in der Zeile fehlt.
    let evaluated = false;

    try {
      report.newHits += await this.deps.listings.evaluateHits(query.id, query.isSeeded);
      evaluated = true;
    } catch (error) {
      report.failed += 1;
      this.deps.log.error('evaluate_hits_failed', {
        queryId: query.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    if (query.isSeeded) {
      // Nur ausserhalb des Einlese-Laufs gelten neue Artikel als Fund.
      report.newListings += created.length;
    } else if (evaluated) {
      // Eingelesen ist die Abfrage erst, wenn der Bestand auch wirklich
      // abgehakt wurde. Ein einziger Netzfehler an dieser Stelle wuerde sonst
      // genuegen: Die Abfrage gilt als eingelesen, der Bestand traegt aber
      // keinen Vermerk - und der naechste Durchgang meldete ihn vollstaendig.
      // Ein wiederholter Einlese-Lauf kostet dagegen nichts, er ist stumm.
      await this.deps.queries.markSeeded(query.id);
      report.seeded += 1;
    }

    await this.deps.queries.markPolled(query.id, 'ok');
  }

  private async handleFailure(
    query: SniperQuery,
    error: unknown,
    report: CycleReport,
  ): Promise<void> {
    report.failed += 1;

    if (error instanceof RateLimitedError) {
      this.deps.log.error('rate_limited', { query: query.id });
      await this.deps.queries.markPolled(query.id, 'rate_limited');
      return;
    }

    if (error instanceof ForbiddenError) {
      this.deps.log.error('forbidden', { query: query.id });
      await this.deps.queries.markPolled(query.id, 'forbidden');
      await this.deps.queries.deactivate(query.id);
      return;
    }

    this.deps.log.error('cycle_failed', {
      query: query.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    await this.deps.queries.markPolled(query.id, 'failed');

    if (query.consecutiveFailures + 1 >= MAX_CONSECUTIVE_FAILURES) {
      await this.deps.queries.deactivate(query.id);
    }
  }
}
