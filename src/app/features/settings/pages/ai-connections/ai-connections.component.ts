import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { AiConnectionService, type AiConnection } from '../../services/ai-connection.service';

@Component({
  selector: 'app-ai-connections',
  imports: [ButtonComponent, CardComponent],
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
  private loadVersion = 0;

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id;
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
