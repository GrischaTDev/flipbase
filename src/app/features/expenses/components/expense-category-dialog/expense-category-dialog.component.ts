import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-expense-category-dialog',
  imports: [ModalShellComponent, ButtonComponent],
  templateUrl: './expense-category-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCategoryDialogComponent {
  readonly categoryService = inject(ExpenseCategoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  readonly closed = output<void>();
  readonly changed = output<void>();

  readonly newName = signal('');
  readonly editingId = signal<string | null>(null);
  readonly editingName = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly isSaving = signal(false);

  constructor() {
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
  }

  async createCategory(): Promise<void> {
    const name = this.newName().trim();
    if (!name || this.isSaving()) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.categoryService.create(name);
      if (result.error) {
        this.errorMessage.set(result.error.message);
        return;
      }
      this.newName.set('');
      this.changed.emit();
    } finally {
      this.isSaving.set(false);
    }
  }

  startRename(id: string, name: string): void {
    this.editingId.set(id);
    this.editingName.set(name);
  }

  async saveRename(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const result = await this.categoryService.rename(id, this.editingName());
    if (result.error) {
      this.errorMessage.set(result.error.message);
      return;
    }
    this.editingId.set(null);
    this.editingName.set('');
    this.changed.emit();
  }

  async toggleArchived(id: string, archived: boolean): Promise<void> {
    const result = archived
      ? await this.categoryService.restore(id)
      : await this.categoryService.archive(id);
    if (result.error) {
      this.errorMessage.set(result.error.message);
      return;
    }
    this.changed.emit();
  }
}
