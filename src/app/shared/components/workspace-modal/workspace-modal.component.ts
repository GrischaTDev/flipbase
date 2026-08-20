import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon, LucideX as X, LucidePlus as Plus } from '@lucide/angular';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-workspace-modal',
  imports: [ModalDialogDirective, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './workspace-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceModalComponent {
  private readonly workspaceService = inject(WorkspaceService);

  readonly closed = output<void>();
  readonly created = output<void>();

  readonly closeIcon = X;
  readonly plusIcon = Plus;

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const name = this.form.getRawValue().name.trim();
    const { error } = await this.workspaceService.createWorkspace(name);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.closed.emit();
    }
  }
}
