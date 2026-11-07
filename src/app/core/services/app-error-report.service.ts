import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/** Gleiche Meldung höchstens einmal in diesem Zeitraum aus demselben Browser. */
const REPEAT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REPORTS_PER_HOUR = 30;
const COLLECT_DELAY_MS = 1_500;

export type AppErrorDevice = 'phone' | 'tablet' | 'desktop';

/** Grobe Geräteklasse ohne Kennung oder Fingerabdruck; mit Zusatz bei installierter App. */
export function appErrorDevice(view: Pick<Window, 'innerWidth' | 'matchMedia'>): string {
  const touch = view.matchMedia?.('(pointer: coarse)').matches ?? false;
  const kind: AppErrorDevice = !touch ? 'desktop' : view.innerWidth < 768 ? 'phone' : 'tablet';
  const installed = view.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return installed ? `${kind}-pwa` : kind;
}

/** Sichtbarer Fehlertext ohne Mehrfachleerzeichen; leere oder reine Feldfehler zählen nicht. */
export function visibleAlertText(element: Element, root: Document): string | null {
  if (element.closest('[hidden], [aria-hidden="true"]')) return null;
  // Feldfehler der Formularprüfung sind mit ihrem Eingabefeld verknüpft; das ist kein Systemfehler.
  if (element.id && root.querySelector(`[aria-describedby~="${CSS.escape(element.id)}"]`))
    return null;
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length >= 3 ? text.slice(0, 500) : null;
}

/**
 * Meldet jede Fehlermeldung, die angemeldeten Nutzern angezeigt wird, an das zentrale
 * Fehlerprotokoll der Administration. Erfasst Elemente mit role="alert" und unbehandelte
 * Ausnahmen. Sendet nur Text, Seitenpfad und Geräteklasse; keine Eingaben oder Inhalte.
 */
@Injectable({ providedIn: 'root' })
export class AppErrorReportService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly client = inject(SupabaseService).client;
  private readonly lastSent = new Map<string, number>();
  private readonly sentTimes: number[] = [];
  private readonly pending = new Set<Element>();
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      clearTimeout(this.timer);
    });
  }

  /** Beobachtet die Seite auf neu sichtbare Fehlermeldungen. */
  start(): void {
    const body = this.document.body;
    if (this.observer || !body || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        const alert = target?.closest('[role="alert"]');
        if (alert) this.pending.add(alert);
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('[role="alert"]')) this.pending.add(node);
          node.querySelectorAll('[role="alert"]').forEach((child) => this.pending.add(child));
        });
      }
      if (this.pending.size > 0 && this.timer === undefined)
        this.timer = setTimeout(() => this.collect(), COLLECT_DELAY_MS);
    });
    this.observer.observe(body, { childList: true, subtree: true, characterData: true });
  }

  reportException(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    void this.report('exception', message);
  }

  private collect(): void {
    this.timer = undefined;
    const alerts = [...this.pending];
    this.pending.clear();
    for (const alert of alerts) {
      // Nur was nach kurzer Zeit noch angezeigt wird; kurzes Aufblitzen beim Laden zählt nicht.
      if (!alert.isConnected) continue;
      const text = visibleAlertText(alert, this.document);
      if (text) void this.report('visible_error', text);
    }
  }

  private async report(code: string, message: string): Promise<void> {
    if (!this.auth.currentUser()) return;
    const now = Date.now();
    const key = `${code}|${message}`;
    if (now - (this.lastSent.get(key) ?? 0) < REPEAT_WINDOW_MS) return;
    while (this.sentTimes.length > 0 && now - this.sentTimes[0] > 60 * 60 * 1000)
      this.sentTimes.shift();
    if (this.sentTimes.length >= MAX_REPORTS_PER_HOUR) return;
    this.lastSent.set(key, now);
    this.sentTimes.push(now);
    const view = this.document.defaultView;
    try {
      await this.client.rpc('platform_report_app_error', {
        p_code: code,
        p_message: message,
        p_page: this.router.url.split(/[?#]/, 1)[0],
        p_device: view ? appErrorDevice(view) : 'unknown',
      });
    } catch {
      // Ein Protokollfehler darf nie selbst eine neue Fehlermeldung auslösen.
    }
  }
}
