import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  readonly id: number;
  readonly type: ToastType;
  readonly title: string;
  readonly description?: string;
  readonly persistent: boolean;
}

const ANZEIGEDAUER: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private naechsteId = 1;
  private readonly timer = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<ToastMessage[]>([]);

  success(title: string, description?: string): number {
    return this.show('success', title, description, false);
  }

  error(title: string, description?: string): number {
    return this.show('error', title, description, true);
  }

  warning(title: string, description?: string): number {
    return this.show('warning', title, description, false);
  }

  info(title: string, description?: string): number {
    return this.show('info', title, description, false);
  }

  dismiss(id: number): void {
    this.loescheTimer(id);
    this.toasts.update((liste) => liste.filter((toast) => toast.id !== id));
  }

  private show(
    type: ToastType,
    title: string,
    description: string | undefined,
    persistent: boolean,
  ): number {
    const toast: ToastMessage = {
      id: this.naechsteId++,
      type,
      title: title.trim(),
      description,
      persistent,
    };

    let verworfeneIds: readonly number[] = [];
    this.toasts.update((liste) => {
      const erweitert = [...liste, toast];
      const normaleIds = new Set(
        erweitert
          .filter((meldung) => !meldung.persistent)
          .slice(-4)
          .map((meldung) => meldung.id),
      );
      const begrenzt = erweitert.filter(
        (meldung) => meldung.persistent || normaleIds.has(meldung.id),
      );
      const enthalteneIds = new Set(begrenzt.map((meldung) => meldung.id));
      verworfeneIds = liste
        .filter((meldung) => !enthalteneIds.has(meldung.id))
        .map((meldung) => meldung.id);
      return begrenzt;
    });
    verworfeneIds.forEach((id) => this.loescheTimer(id));

    if (!persistent) {
      this.timer.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), ANZEIGEDAUER[type]),
      );
    }

    return toast.id;
  }

  private loescheTimer(id: number): void {
    const laufenderTimer = this.timer.get(id);
    if (laufenderTimer !== undefined) clearTimeout(laufenderTimer);
    this.timer.delete(id);
  }
}
