import type { Logger } from '../log.js';
export interface CollectorWatchdogOptions {
  isLive(): boolean;
  needsBrowserRestart(): boolean;
  closeBrowser(): Promise<void>;
  exit(code: number): void;
  log: Logger;
}
export function startCollectorWatchdog(options: CollectorWatchdogOptions): () => void {
  const interval = setInterval(() => {
    if (options.isLive() && !options.needsBrowserRestart()) return;
    clearInterval(interval);
    options.log.error('collector_restart_required', {
      reason: options.needsBrowserRestart() ? 'browser_unavailable' : 'cycle_stalled',
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      options.exit(1);
    };
    // Auch eine blockierte Browserbeendigung darf den Neustart nicht verhindern.
    const deadline = setTimeout(finish, 20_000);
    void Promise.resolve()
      .then(() => options.closeBrowser())
      .catch(() => {
        options.log.error('collector_browser_shutdown_failed');
      })
      .finally(finish);
  }, 15_000);
  interval.unref?.();
  return () => clearInterval(interval);
}
