import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import type { MarketplaceListingReference } from '../models/marketplace-overview.models';
import type { MarketplaceOverviewSection } from './marketplace-overview.store';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import { KleinanzeigenActionStore } from './kleinanzeigen-action.store';
import {
  kleinanzeigenRelistingMessage,
  kleinanzeigenRelistingError,
} from '../models/kleinanzeigen-relisting';
import type { KleinanzeigenRelistingAttempt } from '../models/kleinanzeigen-relisting';

@Injectable()
export class KleinanzeigenRelistingService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly accounts = inject(KleinanzeigenAccountService);
  private readonly extension = inject(KleinanzeigenExtensionBridge);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly actions = inject(KleinanzeigenActionStore);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly results = signal<readonly { externalId: string; title: string; message: string }[]>([]);
  readonly pending = signal<readonly KleinanzeigenRelistingAttempt[]>([]);
  private destroyed = false;
  private loadingPending = false;
  private pendingPublicationId: string | null = null;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
  }

  async loadPending(section: MarketplaceOverviewSection): Promise<void> {
    if (
      this.loadingPending ||
      this.busy() ||
      !this.extension.relistingAvailable() ||
      section.account.platform !== 'kleinanzeigen'
    )
      return;
    this.loadingPending = true;
    const userId = this.auth.currentUser()?.id;
    try {
      const response = await this.accounts.readAccounts(section.account.workspaceId);
      const account = response.canManage
        ? response.accounts.find((value) => value.connectionId === section.account.connectionId)
        : null;
      if (!account?.localGrant?.active || !account.localGrant.canPublish) return;
      const result = await this.extension.relistingAttempts({
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        generation: account.localGrant.generation,
      });
      if (
        !this.destroyed &&
        userId === this.auth.currentUser()?.id &&
        this.workspace.currentWorkspace()?.id === section.account.workspaceId
      ) {
        for (const attempt of result.filter((attempt) => attempt.phase === 'confirmed')) {
          if (this.pendingPublicationId === attempt.externalId) {
            this.error.set(null);
            this.pendingPublicationId = null;
          }
          this.actions.reconcile({
            platform: 'kleinanzeigen',
            workspaceId: account.workspaceId,
            connectionId: account.connectionId,
            externalId: attempt.externalId,
          });
        }
        this.pending.set(result.filter((attempt) => attempt.phase !== 'confirmed'));
      }
    } catch (error) {
      if (
        !this.destroyed &&
        userId === this.auth.currentUser()?.id &&
        this.workspace.currentWorkspace()?.id === section.account.workspaceId
      )
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Gesicherte Anzeigen konnten nicht geladen werden.',
        );
    } finally {
      this.loadingPending = false;
    }
  }
  async remove(
    section: MarketplaceOverviewSection,
    reference: MarketplaceListingReference,
  ): Promise<boolean> {
    const account = section.account;
    if (
      this.busy() ||
      reference.platform !== 'kleinanzeigen' ||
      reference.workspaceId !== account.workspaceId ||
      reference.connectionId !== account.connectionId
    )
      return false;
    const item = section.page?.items.find(
      (item) => item.reference.externalId === reference.externalId,
    );
    if (!item || item.state !== 'active') return false;
    const userId = this.auth.currentUser()?.id;
    const current = () =>
      !this.destroyed &&
      !!userId &&
      this.auth.currentUser()?.id === userId &&
      this.workspace.currentWorkspace()?.id === account.workspaceId &&
      !this.workspace.currentWorkspace()?.archived_at;
    if (!current()) return false;
    this.busy.set(true);
    this.error.set(null);
    this.pendingPublicationId = null;
    let key: string | undefined;
    let deleted = false;
    try {
      await this.extension.ensureCurrent();
      const response = await this.accounts.readAccounts(account.workspaceId);
      const target = response.canManage
        ? response.accounts.find((value) => value.connectionId === account.connectionId)
        : null;
      if (!current()) return false;
      if (
        target?.status !== 'connected' ||
        target.accountType !== 'private' ||
        !target.localGrant?.active ||
        !target.localGrant.canPublish
      )
        throw new Error('Für dieses Konto fehlt die aktuelle Freigabe. Öffne die Kontoverwaltung.');
      if (
        !(await this.confirmation.frage({
          titel: 'Inserat endgültig löschen?',
          gefahr: true,
          text:
            item.title +
            '\n\nDie Anzeige wird bei Kleinanzeigen endgültig gelöscht. Diese Aktion lässt sich nicht rückgängig machen.',
          bestaetigenText: 'Inserat löschen',
          abbrechenText: 'Abbrechen',
        })) ||
        !current()
      )
        return false;
      key = this.actions.begin(reference, item.title, account.displayName, 'delete');
      await this.extension.deleteListing(
        {
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          generation: target.localGrant.generation,
        },
        reference.externalId,
        item.title,
      );
      deleted = true;
      this.actions.finish(key, 'success', 'Inserat gelöscht');
      if (!current()) return false;
      const run = await this.accounts.requestSync({
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
      });
      if (current()) await this.extension.synchronize(run);
      return true;
    } catch (error) {
      const message = deleted
        ? 'Inserat gelöscht. Der anschließende Bestandsabgleich ist noch nicht bestätigt.'
        : kleinanzeigenRelistingError(error);
      if (!key && current() && !this.actions.isRunning(reference))
        key = this.actions.begin(reference, item.title, account.displayName, 'delete');
      if (key)
        this.actions.finish(
          key,
          deleted ? 'success' : 'error',
          message,
          this.extension.updateRequired(),
        );
      if (current()) this.error.set(message);
      return deleted;
    } finally {
      this.busy.set(false);
    }
  }
  async run(
    section: MarketplaceOverviewSection,
    resume?: KleinanzeigenRelistingAttempt,
  ): Promise<boolean> {
    if (
      this.busy() ||
      section.account.platform !== 'kleinanzeigen' ||
      (!section.selection.length && !resume)
    )
      return false;
    const userId = this.auth.currentUser()?.id;
    const account = section.account;
    const current = () =>
      !this.destroyed &&
      !!userId &&
      this.auth.currentUser()?.id === userId &&
      this.workspace.currentWorkspace()?.id === account.workspaceId &&
      !this.workspace.currentWorkspace()?.archived_at;
    if (!current()) return false;
    this.busy.set(true);
    this.error.set(null);
    this.pendingPublicationId = null;
    this.results.set([]);
    let changed = false;
    let started = false;
    try {
      await this.extension.ensureCurrent();
      const response = await this.accounts.readAccounts(account.workspaceId);
      if (!current()) return false;
      const target = response.canManage
        ? response.accounts.find((value) => value.connectionId === account.connectionId)
        : null;
      if (
        target?.status !== 'connected' ||
        target.accountType !== 'private' ||
        !target.localGrant?.active ||
        !target.localGrant.canPublish
      )
        throw new Error(
          'Für dieses Konto fehlt die aktuelle Veröffentlichungsfreigabe. Öffne die Kontoverwaltung.',
        );
      if (!this.extension.relistingAvailable())
        throw new Error(
          'Aktualisiere die Flipbase-Erweiterung auf Version 1.14.3 und lade die Seite neu.',
        );
      const references = resume
        ? [
            {
              platform: 'kleinanzeigen' as const,
              workspaceId: account.workspaceId,
              connectionId: account.connectionId,
              externalId: resume.externalId,
            },
          ]
        : [...section.selection];
      if (
        references.some(
          (reference) =>
            reference.platform !== 'kleinanzeigen' ||
            reference.workspaceId !== account.workspaceId ||
            reference.connectionId !== account.connectionId,
        )
      )
        throw new Error('Die Auswahl gehört nicht zum aktuellen Konto.');
      const titles = references.map(
        (reference) =>
          resume?.title ??
          section.page?.items.find((item) => item.reference.externalId === reference.externalId)
            ?.title ??
          'Anzeige ' + reference.externalId,
      );
      const confirmed = await this.confirmation.frage({
        titel: resume ? 'Anzeige fertigstellen?' : 'Anzeige neu inserieren?',
        text: resume
          ? `${titles[0]}\n\nDie gesicherte Anzeige wird geprüft und fertiggestellt. Bereits ausgeführte Schritte werden nicht wiederholt.`
          : `${titles.join('\n')}\n\nDie bisherige Anzeige wird endgültig durch eine neue ersetzt. Merker und Aufrufe gehen verloren.`,
        bestaetigenText: 'Neu inserieren',
        abbrechenText: 'Abbrechen',
      });
      if (!confirmed || !current()) return false;
      const scope = {
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        generation: target.localGrant.generation,
      };
      for (const [index, reference] of references.entries()) {
        if (!current()) return changed;
        started = true;
        const actionKey = this.actions.begin(reference, titles[index], account.displayName);
        let result;
        try {
          result = await this.extension.relist(scope, reference.externalId);
          this.actions.finish(
            actionKey,
            result.outcome === 'confirmed' ? 'success' : 'paused',
            kleinanzeigenRelistingMessage(result),
          );
        } catch (error) {
          this.actions.finish(
            actionKey,
            'error',
            kleinanzeigenRelistingError(error),
            this.extension.updateRequired(),
          );
          throw error;
        }
        if (!current()) return changed;
        this.results.update((values) => [
          ...values,
          {
            externalId: reference.externalId,
            title: titles[index],
            message: kleinanzeigenRelistingMessage(result),
          },
        ]);
        if (result.outcome !== 'confirmed') {
          this.pendingPublicationId = reference.externalId;
          this.error.set(kleinanzeigenRelistingMessage(result));
          break;
        }
        changed = true;
      }
      if (changed && current()) {
        const run = await this.accounts.requestSync(scope);
        if (current()) await this.extension.synchronize(run);
      }
      return changed;
    } catch (error) {
      if (current()) {
        const message = kleinanzeigenRelistingError(error);
        this.error.set(message);
        if (!started) {
          const reference = resume
            ? {
                platform: 'kleinanzeigen' as const,
                workspaceId: account.workspaceId,
                connectionId: account.connectionId,
                externalId: resume.externalId,
              }
            : section.selection[0];
          if (
            reference &&
            reference.platform === 'kleinanzeigen' &&
            !this.actions.isRunning(reference) &&
            reference.workspaceId === account.workspaceId &&
            reference.connectionId === account.connectionId
          ) {
            const title =
              resume?.title ??
              section.page?.items.find((item) => item.reference.externalId === reference.externalId)
                ?.title ??
              'Anzeige';
            this.actions.finish(
              this.actions.begin(reference, title, account.displayName),
              'error',
              message,
              this.extension.updateRequired(),
            );
          }
        }
      }
      return changed;
    } finally {
      this.busy.set(false);
      if (current()) await this.loadPending(section);
    }
  }
}
