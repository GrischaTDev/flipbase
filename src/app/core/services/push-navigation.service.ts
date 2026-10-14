import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ChildrenOutletContexts, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import { PushPayloadV1, PushTarget, parsePushPayload } from '../models/web-push.models';
import { hasOpenEntry } from '../../shared/guards/unsaved-entry.guard';

const pendingKey = 'flipbase_pending_push';
@Injectable({ providedIn: 'root' })
export class PushNavigationService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly context = inject(WorkspaceContextLockService);
  private readonly outlets = inject(ChildrenOutletContexts, { optional: true });
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly pending = signal<PushPayloadV1 | null>(null);
  readonly message = signal('');
  readonly isOpening = signal(false);
  private ownerId: string | null = null;

  constructor() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const receive = (event: MessageEvent) => {
        if (
          event.source !== navigator.serviceWorker.controller ||
          event.data?.type !== 'PWA_PUSH_OPEN'
        )
          return;
        if (this.enqueue(event.data.payload)) void this.openPending();
      };
      navigator.serviceWorker.addEventListener('message', receive);
      this.destroyRef.onDestroy(() =>
        navigator.serviceWorker.removeEventListener('message', receive),
      );
    }
  }
  enqueue(candidate: unknown): boolean {
    const payload = parsePushPayload(candidate);
    if (!payload) {
      this.message.set('Diese Benachrichtigung hat kein gültiges Ziel.');
      return false;
    }
    this.pending.set(payload);
    this.ownerId = this.auth.currentUser()?.id ?? null;
    try {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({ payload, ownerId: this.ownerId, expiresAt: Date.now() + 86400000 }),
      );
    } catch {
      this.message.set(
        'Das Ziel bleibt in dieser Ansicht verfügbar. Es konnte nicht für eine erneute Anmeldung gespeichert werden.',
      );
    }
    return true;
  }
  restore(): boolean {
    try {
      const serialized = sessionStorage.getItem(pendingKey);
      if (!serialized) return false;
      const stored = JSON.parse(serialized) as {
        payload: unknown;
        ownerId: string | null;
        expiresAt: number;
      };
      const payload = parsePushPayload(stored.payload);
      if (!payload || !Number.isFinite(stored.expiresAt) || stored.expiresAt <= Date.now()) {
        this.dismiss();
        return false;
      }
      this.pending.set(payload);
      this.ownerId = stored.ownerId;
      return true;
    } catch {
      this.message.set('Das gespeicherte Ziel konnte nicht gelesen werden.');
      return false;
    }
  }
  dismiss(): void {
    this.pending.set(null);
    this.ownerId = null;
    try {
      sessionStorage.removeItem(pendingKey);
    } catch {
      /* Das Ziel bleibt nicht automatisch geöffnet. */
    }
  }
  private isLocked(): boolean {
    return this.context.locked() || hasOpenEntry(this.outlets);
  }
  async openPending(): Promise<boolean> {
    const payload = this.pending();
    if (!payload || this.isOpening()) return false;
    if (this.isLocked()) {
      this.message.set(
        'Speichere oder schließe zuerst deine offene Erfassung. Das Benachrichtigungsziel bleibt hier erhalten.',
      );
      return false;
    }
    this.isOpening.set(true);
    try {
      await this.auth.sessionReady;
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        await this.router.navigate(['/auth/login'], { queryParams: { redirectTo: '/push/open' } });
        return false;
      }
      if (this.ownerId && this.ownerId !== userId) {
        this.dismiss();
        this.message.set('Diese Benachrichtigung gehört zur vorherigen Anmeldung.');
        return false;
      }
      const rows = await this.access.refresh();
      await this.workspace.ensureLoaded();
      if (
        !rows.some(
          (row) => row.workspace_id === payload.workspaceId && row.access_status === 'active',
        )
      )
        throw new Error('Du hast keinen aktuellen Zugang zu diesem Workspace.');
      const path = await this.resolveTarget(payload.target, payload.workspaceId, userId);
      if (this.auth.currentUser()?.id !== userId || this.pending()?.eventId !== payload.eventId)
        throw new Error('Die Anmeldung oder das Benachrichtigungsziel hat sich geändert.');
      if (this.isLocked()) throw new Error('Speichere zuerst deine offene Erfassung.');
      if (
        this.workspace.currentWorkspace()?.id !== payload.workspaceId &&
        !this.workspace.switchWorkspace(payload.workspaceId)
      )
        throw new Error('Der Workspace konnte nicht gewechselt werden.');
      const navigated = await this.router.navigateByUrl(path);
      if (navigated && this.pending()?.eventId === payload.eventId) this.dismiss();
      return navigated;
    } catch (reason) {
      this.message.set(
        reason instanceof Error
          ? reason.message
          : 'Das Ziel konnte nicht geprüft werden. Bitte versuche es erneut.',
      );
      return false;
    } finally {
      this.isOpening.set(false);
    }
  }
  private async resolveTarget(
    target: PushTarget,
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    if (target.kind === 'settings') return '/settings/notifications';
    if (target.kind === 'store_orders') return '/store/orders';
    if (target.kind === 'ebay_orders') {
      const { data, error } = await this.supabase.client
        .from('ebay_connections')
        .select('id')
        .eq('id', target.connectionId)
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error || !data) throw new Error('Dieses eBay-Konto ist für dich nicht verfügbar.');
      return '/marketplaces/ebay/orders';
    }
    const { data: connection, error: connectionError } = await this.supabase.client
      .from('marketplace_connections')
      .select('id,marketplace')
      .eq('id', target.connectionId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (target.kind === 'vinted_favorites') {
      if (connectionError || connection?.marketplace !== 'vinted')
        throw new Error('Dieses Vinted-Konto ist für dich nicht verfügbar.');
      return `/marketplaces/vinted/listings?connectionId=${target.connectionId}`;
    }
    if (target.kind === 'vinted_message') {
      if (connectionError || connection?.marketplace !== 'vinted')
        throw new Error('Dieses Vinted-Konto ist für dich nicht verfügbar.');
      const { data, error } = await this.supabase.client
        .from('marketplace_account_entries')
        .select('id')
        .eq('id', target.conversationId)
        .eq('connection_id', target.connectionId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error || !data) throw new Error('Dieses Gespräch ist für dich nicht verfügbar.');
      return `/marketplaces/vinted/messages?connectionId=${target.connectionId}&conversationId=${target.conversationId}`;
    }
    if (!connectionError && connection?.marketplace === 'vinted')
      return `/marketplaces/vinted/accounts?connectionId=${target.connectionId}`;
    const { data, error } = await this.supabase.client
      .from('ebay_connections')
      .select('id')
      .eq('id', target.connectionId)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) throw new Error('Diese Kontoverbindung ist für dich nicht verfügbar.');
    return '/marketplaces/ebay/connection';
  }
}
