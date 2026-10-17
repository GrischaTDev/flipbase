import { DestroyRef, Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import type {
  KleinanzeigenAccountScope,
  KleinanzeigenBinding,
  KleinanzeigenSyncResult,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
/** Gemeinsamer Ablauf für Kontoseite und Übersicht; alle Schritte bleiben an die ursprüngliche Ansicht gebunden. */
@Injectable()
export class KleinanzeigenAccountActionsService {
  private readonly api = inject(KleinanzeigenAccountService);
  private readonly extension = inject(KleinanzeigenExtensionBridge);
  private generation = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }
  cancel(): void {
    this.generation++;
    this.extension.cancel();
  }
  private assertCurrent(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Der Arbeitsbereich wurde gewechselt oder die Ansicht geschlossen.');
  }
  async connect(workspaceId: string, canPublish = false): Promise<KleinanzeigenBinding> {
    const generation = this.generation;
    const proposal = await this.extension.prepare(
      workspaceId,
      canPublish,
      environment.supabaseUrl.replace(/\/$/u, '') + '/functions/v1/kleinanzeigen-local-extension',
    );
    this.assertCurrent(generation);
    const binding = await this.api.connect(workspaceId, proposal, canPublish);
    this.assertCurrent(generation);
    return await this.extension.connect(proposal.nonce, binding);
  }
  async reconnect(
    account: KleinanzeigenAccountScope & { readonly externalAccountId: string },
    canPublish: boolean,
  ): Promise<KleinanzeigenBinding> {
    const generation = this.generation;
    const scope = { workspaceId: account.workspaceId, connectionId: account.connectionId };
    const currentBinding = await this.extension.status(scope.workspaceId);
    this.assertCurrent(generation);
    if (currentBinding) {
      if (
        currentBinding.connectionId !== scope.connectionId ||
        currentBinding.externalAccountId !== account.externalAccountId
      )
        throw new Error(
          'In diesem Browser ist ein anderes Kleinanzeigen-Konto verbunden. Wähle das passende Konto.',
        );
      await this.extension.disconnect(scope);
      this.assertCurrent(generation);
    }
    const proposal = await this.extension.prepare(
      scope.workspaceId,
      canPublish,
      environment.supabaseUrl.replace(/\/$/u, '') + '/functions/v1/kleinanzeigen-local-extension',
    );
    this.assertCurrent(generation);
    if (proposal.externalAccountId !== account.externalAccountId)
      throw new Error(
        'Melde Dich bei Kleinanzeigen im ausgewählten Konto an und versuche es erneut.',
      );
    const binding = await this.api.connect(scope.workspaceId, proposal, canPublish);
    this.assertCurrent(generation);
    if (
      binding.workspaceId !== scope.workspaceId ||
      binding.connectionId !== scope.connectionId ||
      binding.externalAccountId !== account.externalAccountId
    )
      throw new Error(
        'Die erneuerte Freigabe konnte nicht für das ausgewählte Konto bestätigt werden.',
      );
    return await this.extension.connect(proposal.nonce, binding);
  }
  async synchronize(scope: KleinanzeigenAccountScope): Promise<KleinanzeigenSyncResult> {
    const generation = this.generation;
    const binding = await this.extension.status(scope.workspaceId);
    this.assertCurrent(generation);
    if (!binding || binding.connectionId !== scope.connectionId)
      throw new Error(
        'Öffne das zu diesem Kleinanzeigen-Konto gehörende Browserprofil und prüfe die Verbindung.',
      );
    const run = await this.api.requestSync(scope);
    this.assertCurrent(generation);
    if (run.generation !== binding.generation)
      throw new Error('Die lokale Freigabe hat sich geändert. Prüfe das zugehörige Browserprofil.');
    return await this.extension.synchronize(run);
  }
  async disconnect(
    scope: KleinanzeigenAccountScope,
  ): Promise<'done' | 'not_bound' | 'unavailable'> {
    const generation = this.generation;
    await this.api.disconnect(scope);
    this.assertCurrent(generation);
    try {
      const binding = await this.extension.status(scope.workspaceId);
      this.assertCurrent(generation);
      if (!binding || binding.connectionId !== scope.connectionId) return 'not_bound';
      await this.extension.disconnect(scope);
      return 'done';
    } catch {
      return 'unavailable';
    }
  }
}
