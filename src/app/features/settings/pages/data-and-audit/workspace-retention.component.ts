import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AuditExportService } from '../../../../core/services/audit-export.service';
import { WorkspaceMemberService } from '../../../../core/services/workspace-member.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-workspace-retention',
  imports: [DatePipe],
  templateUrl: './workspace-retention.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceRetentionComponent {
  readonly workspaceService = inject(WorkspaceService);
  private readonly members = inject(WorkspaceMemberService);
  private readonly auth = inject(AuthService);
  private readonly archive = inject(AuditExportService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly requestedWorkspaceId = computed(() =>
    this.queryParams().get('retentionWorkspace'),
  );
  readonly workspace = computed(() =>
    this.requestedWorkspaceId()
      ? (this.workspaceService
          .workspaces()
          .find((workspace) => workspace.id === this.requestedWorkspaceId()) ?? null)
      : this.workspaceService.currentWorkspace(),
  );
  readonly isDemoMode = this.auth.isDemoMode;
  readonly isSelected = computed(
    () => this.workspace()?.id === this.workspaceService.currentWorkspace()?.id,
  );
  readonly isOwner = computed(
    () =>
      !this.isDemoMode() &&
      !this.members.isLoading() &&
      this.isSelected() &&
      this.members
        .members()
        .some(
          (member) =>
            member.workspace_id === this.workspace()?.id &&
            member.user_id === this.auth.currentUser()?.id &&
            member.role === 'owner',
        ),
  );
  readonly isPending = signal(false);
  readonly isExporting = signal(false);
  private readonly message = signal<{
    workspaceId: string;
    error: string | null;
    status: string | null;
  } | null>(null);
  readonly error = computed(() =>
    this.message()?.workspaceId === this.workspace()?.id ? (this.message()?.error ?? null) : null,
  );
  readonly status = computed(() =>
    this.message()?.workspaceId === this.workspace()?.id ? (this.message()?.status ?? null) : null,
  );
  private readonly deletionWorkspaceId = signal<string | null>(null);
  private readonly blockedWorkspaceIds = signal<readonly string[]>([]);
  readonly deletionPrepared = computed(() => this.deletionWorkspaceId() === this.workspace()?.id);
  readonly deletionBlocked = computed(() =>
    this.blockedWorkspaceIds().includes(this.workspace()?.id ?? ''),
  );
  private exportController: AbortController | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.exportController?.abort());
  }

  selectWorkspace(): void {
    const workspaceId = this.workspace()?.id;
    if (workspaceId && !this.isPending() && !this.isExporting())
      this.workspaceService.switchWorkspace(workspaceId);
  }

  prepareDeletion(): void {
    if (this.isOwner() && !this.isPending() && !this.isExporting()) {
      this.deletionWorkspaceId.set(this.workspace()!.id);
    }
  }

  cancelDeletion(): void {
    this.deletionWorkspaceId.set(null);
  }

  async changeArchiveState(): Promise<void> {
    const workspace = this.workspace();
    if (!workspace || !this.isOwner() || this.isPending() || this.isExporting()) return;
    this.isPending.set(true);
    this.message.set(null);
    try {
      const confirmed = await this.dialog.frage({
        titel: workspace.archived_at ? 'Workspace wiederherstellen?' : 'Workspace archivieren?',
        text: workspace.archived_at
          ? '„' +
            workspace.name +
            '“ wird wieder für neue Buchungen und Änderungen geöffnet. Das Prüfprotokoll bleibt erhalten.'
          : '„' +
            workspace.name +
            '“ bleibt lesbar und exportierbar. Neue Buchungen und Änderungen an Geschäftsdaten werden gesperrt. Du kannst den Workspace später wiederherstellen.',
        bestaetigenText: workspace.archived_at ? 'Wiederherstellen' : 'Archivieren',
      });
      if (!confirmed || this.workspace()?.id !== workspace.id || !this.isOwner()) return;
      const result = workspace.archived_at
        ? await this.workspaceService.restoreWorkspace(workspace.id)
        : await this.workspaceService.archiveWorkspace(workspace.id);
      if (this.workspace()?.id !== workspace.id) return;
      this.message.set({
        workspaceId: workspace.id,
        error: result.error?.message ?? null,
        status: result.error
          ? null
          : workspace.archived_at
            ? 'Workspace wurde wiederhergestellt.'
            : 'Workspace wurde archiviert.',
      });
    } catch (error) {
      this.reportError(workspace.id, error);
    } finally {
      this.isPending.set(false);
    }
  }

  async downloadArchive(): Promise<void> {
    const workspaceId = this.workspace()?.id;
    if (!workspaceId || !this.isOwner() || this.isExporting() || this.isPending()) return;
    this.isExporting.set(true);
    this.message.set(null);
    const controller = new AbortController();
    this.exportController = controller;
    try {
      // Für den Löschablauf bewusst vollständig: keine Filter der Prüfseite.
      const archive = await this.archive.createArchive({
        workspaceId,
        pageSize: 100,
        signal: controller.signal,
      });
      if (controller.signal.aborted || this.workspace()?.id !== workspaceId) return;
      this.archive.downloadArchive(archive);
      this.message.set({
        workspaceId,
        error: null,
        status: 'Vollständiges Datenarchiv wurde erstellt.',
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        this.reportError(workspaceId, error);
    } finally {
      this.exportController = null;
      this.isExporting.set(false);
    }
  }

  cancelExport(): void {
    this.exportController?.abort();
  }

  async deleteWorkspace(): Promise<void> {
    const workspace = this.workspace();
    if (
      !workspace ||
      !this.isOwner() ||
      !this.deletionPrepared() ||
      this.deletionBlocked() ||
      this.isPending() ||
      this.isExporting()
    )
      return;
    this.isPending.set(true);
    this.message.set(null);
    try {
      const confirmed = await this.dialog.frage({
        titel: 'Leeren Workspace endgültig löschen?',
        text:
          'Nur wenn „' +
          workspace.name +
          '“ keine Geschäftsdaten enthält, kann er gelöscht werden. Die Löschung kann nicht rückgängig gemacht werden. Lade bei Bedarf vorher das Datenarchiv herunter.',
        bestaetigenText: 'Endgültig löschen',
        gefahr: true,
      });
      if (!confirmed || this.workspace()?.id !== workspace.id || !this.isOwner()) return;
      const result = await this.workspaceService.deleteWorkspace(workspace.id);
      if (result.retentionBlocked) {
        this.blockedWorkspaceIds.update((ids) => [...ids, workspace.id]);
        this.reportError(
          workspace.id,
          new Error(
            'Dieser Workspace enthält aufbewahrungsrelevante Geschäftsdaten und kann nicht direkt gelöscht werden.',
          ),
        );
      } else if (!result.success) {
        this.reportError(
          workspace.id,
          new Error(
            'Der Workspace wurde nicht gelöscht. Prüfe deine Berechtigung; der einzige Workspace muss erhalten bleiben.',
          ),
        );
      } else {
        this.deletionWorkspaceId.set(null);
      }
    } catch (error) {
      this.reportError(workspace.id, error);
    } finally {
      this.isPending.set(false);
    }
  }

  private reportError(workspaceId: string, error: unknown): void {
    this.message.set({
      workspaceId,
      status: null,
      error:
        error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.',
    });
  }
}
