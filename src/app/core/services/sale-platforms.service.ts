import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  mergeSalePlatforms,
  parseSalePlatforms,
  type SalePlatform,
} from '../models/sale-platforms';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import { marketplacePlatformLabel } from '../../shared/models/marketplace-platform';

@Injectable({ providedIn: 'root' })
export class SalePlatformsService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly sales = inject(SalesService);
  private readonly context = inject(WorkspaceContextLockService);
  private readonly savedPlatforms = signal<readonly SalePlatform[]>([]);
  private version = 0;
  private loadRequest = 0;
  readonly loadedWorkspaceId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly options = computed(() =>
    mergeSalePlatforms(
      this.loadedWorkspaceId() === this.workspace.currentWorkspace()?.id
        ? this.savedPlatforms()
        : [],
      this.sales
        .sales()
        .filter((sale) => sale.workspace_id === this.workspace.currentWorkspace()?.id)
        .map((sale) => sale.platform),
    ),
  );

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id ?? null;
      untracked(() => void this.reload(id));
    });
  }

  label(value: string): string {
    return (
      this.options().find((entry) => entry.value === value)?.label ??
      marketplacePlatformLabel(value)
    );
  }

  async reload(workspaceId = this.workspace.currentWorkspace()?.id ?? null): Promise<void> {
    const request = ++this.loadRequest;
    if (this.loadedWorkspaceId() !== workspaceId) {
      this.savedPlatforms.set([]);
      this.loadedWorkspaceId.set(null);
      this.version = 0;
    }
    this.error.set(null);
    this.loading.set(!!workspaceId);
    if (!workspaceId) return;
    try {
      const { data, error } = await this.supabase.client
        .from('sale_platform_settings')
        .select('platforms, version')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (request !== this.loadRequest || this.workspace.currentWorkspace()?.id !== workspaceId)
        return;
      if (error) throw error;
      this.savedPlatforms.set(parseSalePlatforms(data?.platforms));
      this.version = data?.version ?? 0;
      this.loadedWorkspaceId.set(workspaceId);
    } catch {
      if (request === this.loadRequest)
        this.error.set('Die Verkaufsplattformen konnten nicht geladen werden. Bitte erneut laden.');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

  async save(platforms: readonly SalePlatform[]): Promise<string | null> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (this.saving()) return 'Die Verkaufsplattformen werden gerade gespeichert.';
    if (!workspaceId || this.loadedWorkspaceId() !== workspaceId || this.loading())
      return 'Bitte die Verkaufsplattformen zuerst vollständig laden.';
    const request = this.loadRequest;
    const release = this.context.acquire();
    this.saving.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.supabase.client.rpc('save_sale_platforms', {
        p_workspace_id: workspaceId,
        p_platforms: platforms.map(({ value, label }) => ({ value, label })),
        p_expected_version: this.version,
      });
      if (error) throw error;
      if (request !== this.loadRequest || this.workspace.currentWorkspace()?.id !== workspaceId)
        return 'Der Workspace hat sich geändert. Bitte neu laden.';
      if (
        data === null ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        typeof data['version'] !== 'number' ||
        !Array.isArray(data['platforms'])
      )
        throw new Error('Speichern wurde nicht bestätigt.');
      this.savedPlatforms.set(parseSalePlatforms(data['platforms']));
      this.version = data['version'];
      return null;
    } catch (error: unknown) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Die Verkaufsplattformen konnten nicht gespeichert werden.';
      if (request === this.loadRequest) this.error.set(message);
      return message;
    } finally {
      this.saving.set(false);
      release();
    }
  }
}
