import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CardComponent } from '../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../shared/components/custom-checkbox/custom-checkbox.component';
import {
  AiConnectionService,
  type AiConnectionAccount,
} from '../../settings/services/ai-connection.service';

@Component({
  selector: 'app-ai-connection-consent',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
  ],
  templateUrl: './ai-connection-consent.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiConnectionConsentComponent {
  private readonly connections = inject(AiConnectionService);
  private readonly workspace = inject(WorkspaceService);
  private readonly authorizationId =
    inject(ActivatedRoute).snapshot.queryParamMap.get('authorization_id') ?? '';
  private readonly destroyRef = inject(DestroyRef);
  readonly clientName = signal('');
  readonly busy = signal(true);
  readonly loadingAccounts = signal(false);
  readonly error = signal('');
  readonly accounts = signal<readonly AiConnectionAccount[]>([]);
  readonly selectedAccounts = signal<readonly string[]>([]);
  readonly workspaceOptions = computed(() =>
    this.workspace.workspaces().map((w) => ({ value: w.id, label: w.name })),
  );
  readonly modes = [
    { value: 'read', label: 'Nur lesen' },
    { value: 'edit', label: 'Lesen und bearbeiten' },
  ] as const;
  readonly form = new FormGroup({
    workspace: new FormControl('', { nonNullable: true }),
    mode: new FormControl<'read' | 'edit'>('read', { nonNullable: true }),
  });
  private accountVersion = 0;

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id;
      if (id && !this.form.controls.workspace.value) this.form.controls.workspace.setValue(id);
    });
    this.form.controls.workspace.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => void this.loadAccounts(id));
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      if (!this.authorizationId)
        throw new Error(
          'Die Anmeldeanfrage fehlt. Starte die Verbindung in Deinem KI-Client erneut.',
        );
      const { data, error } = await this.connections.authorizationDetails(this.authorizationId);
      if (error) throw error;
      if ('redirect_url' in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      this.clientName.set(data.client.name);
    } catch (cause) {
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Die Anmeldung ist abgelaufen. Starte die Verbindung erneut.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async loadAccounts(workspaceId: string): Promise<void> {
    const version = ++this.accountVersion;
    this.accounts.set([]);
    this.selectedAccounts.set([]);
    this.loadingAccounts.set(true);
    try {
      const accounts = await this.connections.accounts(workspaceId);
      if (version === this.accountVersion) this.accounts.set(accounts);
    } catch {
      if (version === this.accountVersion)
        this.error.set('Vinted-Konten konnten nicht geladen werden.');
    } finally {
      if (version === this.accountVersion) this.loadingAccounts.set(false);
    }
  }

  selectAccount(id: string, selected: boolean): void {
    this.selectedAccounts.update((ids) =>
      selected ? [...new Set([...ids, id])] : ids.filter((current) => current !== id),
    );
  }

  async decide(approve: boolean): Promise<void> {
    if (this.busy() || this.loadingAccounts()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (approve)
        await this.connections.approve(
          this.authorizationId,
          this.form.controls.workspace.value,
          this.form.controls.mode.value,
          this.selectedAccounts(),
        );
      else await this.connections.deny(this.authorizationId);
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Die Verbindung konnte nicht bestätigt werden.',
      );
      this.busy.set(false);
    }
  }
}
