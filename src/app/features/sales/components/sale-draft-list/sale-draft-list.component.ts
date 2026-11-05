import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucidePencil, LucideTrash2 } from '@lucide/angular';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { SaleDraft } from '../../models/sale-draft.models';
import { SaleDraftService } from '../../services/sale-draft.service';

/** Offene Verkaufsentwürfe in der Verkaufsübersicht; sie zählen noch nicht als Verkauf. */
@Component({
  selector: 'app-sale-draft-list',
  imports: [CurrencyPipe, DatePipe, CardComponent, TableActionButtonComponent],
  templateUrl: './sale-draft-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleDraftListComponent {
  readonly drafts = inject(SaleDraftService);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  readonly deletingId = signal<string | null>(null);
  readonly editIcon = LucidePencil;
  readonly deleteIcon = LucideTrash2;

  constructor() {
    effect(() => {
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (workspaceId) untracked(() => void this.drafts.load(workspaceId));
    });
  }

  visibleDrafts(): readonly SaleDraft[] {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    return this.drafts.loadedWorkspaceId() === workspaceId ? this.drafts.drafts() : [];
  }

  async remove(draft: SaleDraft): Promise<void> {
    if (
      !(await this.dialog.frage({
        titel: 'Entwurf löschen?',
        text: `„${draft.title}“ wird endgültig gelöscht.`,
        bestaetigenText: 'Löschen',
        gefahr: true,
      }))
    )
      return;
    this.deletingId.set(draft.id);
    try {
      await this.drafts.remove(draft.workspaceId, draft.id);
      this.toast.success('Entwurf wurde gelöscht.');
    } catch (cause: unknown) {
      this.toast.error(
        'Entwurf konnte nicht gelöscht werden.',
        cause instanceof Error ? cause.message : undefined,
      );
    } finally {
      this.deletingId.set(null);
    }
  }
}
