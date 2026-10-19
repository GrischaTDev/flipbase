/** Eine gemeinsame Frist für alle Aufräumschritte eines Browserabrufs. */
export class BrowserCleanup {
  private deadline: number | undefined;
  private timedOut = false;

  get expired(): boolean {
    return this.timedOut || (this.deadline !== undefined && performance.now() >= this.deadline);
  }

  async run(operation: () => Promise<unknown>): Promise<void> {
    if (this.expired) return;
    this.deadline ??= performance.now() + 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          if (!this.expired) return operation();
        }),
        new Promise<void>((resolve) => {
          timer = setTimeout(
            () => {
              this.timedOut = true;
              resolve();
            },
            Math.max(0, this.deadline! - performance.now()),
          );
        }),
      ]);
    } catch {
      // Bereits geschlossene Ziele brauchen keinen weiteren Aufräumversuch.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
