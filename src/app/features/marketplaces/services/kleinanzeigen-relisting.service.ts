import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import type { MarketplaceOverviewSection } from './marketplace-overview.store';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
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
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly results = signal<readonly { externalId: string; title: string; message: string }[]>([]);
  readonly pending = signal<readonly KleinanzeigenRelistingAttempt[]>([]);
  private destroyed = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
  }

  async loadPending(section: MarketplaceOverviewSection): Promise<void> {
    if (!this.extension.relistingAvailable() || section.account.platform !== 'kleinanzeigen')
      return;
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
      )
        this.pending.set(result);
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
    this.results.set([]);
    let changed = false;
    try {
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
          'Aktualisiere die Flipbase-Erweiterung auf Version 1.11.0 und lade die Seite neu.',
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
        titel: resume ? 'Gesicherten Vorgang fortsetzen?' : 'Ausgewählte neu inserieren?',
        text: resume
          ? `${titles[0]}\n\nDie Erweiterung prüft den gespeicherten Stand. Unklare Lösch- oder Veröffentlichungsklicks werden nicht wiederholt. Nach bestätigter Löschung wird die gesicherte Neufassung fertiggestellt.`
          : `${titles.join('\n')}\n\nDie Erweiterung sichert Texte und Bilder, bereitet die neue Anzeige vor und löscht anschließend die alte Anzeige endgültig. Merker und Aufrufe werden nicht übernommen. Bei Gebühren oder fehlenden Angaben hält sie an.`,
        bestaetigenText: resume ? 'Fortsetzen und prüfen' : 'Neu inserieren',
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
        const result = await this.extension.relist(scope, reference.externalId);
        if (!current()) return changed;
        this.results.update((values) => [
          ...values,
          {
            externalId: reference.externalId,
            title: titles[index],
            message: kleinanzeigenRelistingMessage(result),
          },
        ]);
        if (result.outcome !== 'confirmed') break;
        changed = true;
      }
      if (changed && current()) {
        const run = await this.accounts.requestSync(scope);
        if (current()) await this.extension.synchronize(run);
      }
      return changed;
    } catch (error) {
      if (current()) this.error.set(kleinanzeigenRelistingError(error));
      return changed;
    } finally {
      this.busy.set(false);
      if (current()) await this.loadPending(section);
    }
  }
}
