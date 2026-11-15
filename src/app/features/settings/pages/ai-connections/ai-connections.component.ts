import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import {
  AiConnectionService,
  type AiConnection,
  type AiConnectionAccount,
} from '../../services/ai-connection.service';

@Component({
  selector: 'app-ai-connections',
  imports: [
    ButtonComponent,
    CardComponent,
    ReactiveFormsModule,
    CustomSelectComponent,
    CustomCheckboxComponent,
    ModalShellComponent,
  ],
  templateUrl: './ai-connections.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AiConnectionsComponent {
  readonly connections = inject(AiConnectionService);
  private readonly workspace = inject(WorkspaceService);
  readonly items = signal<readonly AiConnection[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);
  readonly editing = signal<AiConnection | null>(null);
  readonly accounts = signal<readonly AiConnectionAccount[]>([]);
  readonly selectedAccounts = signal<readonly string[]>([]);
  readonly loadingAccounts = signal(false);
  readonly saving = signal(false);
  readonly editError = signal('');
  readonly modes = [
    { value: 'read', label: 'Nur lesen' },
    { value: 'edit', label: 'Lesen und bearbeiten' },
  ] as const;
  readonly form = new FormGroup({
    mode: new FormControl<'read' | 'edit'>('read', { nonNullable: true }),
  });
  private loadVersion = 0;
  private editVersion = 0;
  private editingWorkspaceId = '';

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id;
      ++this.editVersion;
      this.editing.set(null);
      void this.load(id);
    });
  }

  async load(workspaceId = this.workspace.currentWorkspace()?.id): Promise<void> {
    const version = ++this.loadVersion;
    this.items.set([]);
    this.error.set('');
    if (!workspaceId) {
      this.busy.set(false);
      return;
    }
    this.busy.set(true);
    try {
      const items = await this.connections.list(workspaceId);
      if (version === this.loadVersion) this.items.set(items);
    } catch {
      if (version === this.loadVersion)
        this.error.set('Deine KI-Verbindungen konnten nicht geladen werden.');
    } finally {
      if (version === this.loadVersion) this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.connections.endpoint);
      this.copied.set(true);
    } catch {
      this.error.set('Die Serveradresse konnte nicht kopiert werden.');
    }
  }

  async edit(connection: AiConnection): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId || connection.revoked_at || this.busy() || this.saving()) return;
    const version = ++this.editVersion;
    this.editingWorkspaceId = workspaceId;
    this.editing.set(connection);
    this.form.controls.mode.setValue(connection.access_mode);
    this.selectedAccounts.set(connection.accounts.map((account) => account.id));
    this.accounts.set([]);
    this.editError.set('');
    this.loadingAccounts.set(true);
    try {
      const accounts = await this.connections.accounts(workspaceId);
      if (version === this.editVersion) this.accounts.set(accounts);
    } catch {
      if (version === this.editVersion)
        this.editError.set(
          'Vinted-Konten konnten nicht geladen werden. Öffne die Bearbeitung erneut.',
        );
    } finally {
      if (version === this.editVersion) this.loadingAccounts.set(false);
    }
  }

  closeEditor(): void {
    if (this.saving()) return;
    ++this.editVersion;
    this.editing.set(null);
  }

  selectAccount(id: string, selected: boolean): void {
    this.selectedAccounts.update((ids) =>
      selected ? [...new Set([...ids, id])] : ids.filter((current) => current !== id),
    );
  }

  async save(): Promise<void> {
    const connection = this.editing();
    const workspaceId = this.editingWorkspaceId;
    if (
      !connection ||
      this.saving() ||
      this.loadingAccounts() ||
      this.editError() ||
      this.workspace.currentWorkspace()?.id !== workspaceId
    )
      return;
    const version = this.editVersion;
    this.saving.set(true);
    try {
      await this.connections.update(
        connection,
        workspaceId,
        this.form.controls.mode.value,
        this.selectedAccounts(),
      );
      if (version === this.editVersion) {
        this.editing.set(null);
        await this.load(workspaceId);
      }
    } catch (cause) {
      if (version === this.editVersion) {
        const message =
          typeof cause === 'object' && cause !== null && 'message' in cause ? cause.message : null;
        this.editError.set(
          typeof message === 'string'
            ? message
            : 'Die KI-Freigabe konnte nicht gespeichert werden.',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  async revoke(connection: AiConnection): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.connections.revoke(connection);
      if (this.workspace.currentWorkspace()?.id === workspaceId) await this.load(workspaceId);
    } catch {
      this.error.set(
        'Die Verbindung konnte nicht vollständig getrennt werden. Bitte erneut versuchen.',
      );
      this.busy.set(false);
    }
  }
}
