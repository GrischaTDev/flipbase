import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { SaleTargetRouteState } from '../../../../core/models/sale-target.models';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { SaleCreateModalComponent } from '../../components/sale-create-modal/sale-create-modal.component';
import type { SaleDraft } from '../../models/sale-draft.models';
import { SaleDraftService } from '../../services/sale-draft.service';

@Component({
  selector: 'app-sale-create',
  imports: [
    EntryPageLayoutComponent,
    ButtonComponent,
    LoadingIndicatorComponent,
    SaleCreateModalComponent,
  ],
  templateUrl: './sale-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class SaleCreateComponent {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  readonly entryForm = viewChild(SaleCreateModalComponent);
  readonly routeState = (this.router.getCurrentNavigation()?.extras.state ??
    globalThis.history?.state ??
    {}) as Partial<SaleTargetRouteState>;
  /** Kennung eines gespeicherten Verkaufsentwurfs aus `?draft=`. */
  readonly draftParam =
    inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('draft') ?? null;
  readonly draft = signal<SaleDraft | null>(null);
  readonly draftLoading = signal(this.draftParam !== null);
  readonly draftError = signal<string | null>(null);

  constructor() {
    const draftId = this.draftParam;
    if (!draftId) return;
    const workspace = this.injector.get(WorkspaceService);
    effect(() => {
      const workspaceId = workspace.currentWorkspace()?.id;
      if (!workspaceId) return;
      untracked(() => void this.loadDraft(workspaceId, draftId));
    });
  }

  private async loadDraft(workspaceId: string, draftId: string): Promise<void> {
    this.draftLoading.set(true);
    this.draftError.set(null);
    try {
      const draft = await this.injector.get(SaleDraftService).get(workspaceId, draftId);
      if (!draft) this.draftError.set('Dieser Verkaufsentwurf ist nicht mehr vorhanden.');
      this.draft.set(draft);
    } catch (cause: unknown) {
      this.draftError.set(
        cause instanceof Error ? cause.message : 'Der Verkaufsentwurf konnte nicht geladen werden.',
      );
    } finally {
      this.draftLoading.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return this.entryForm()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.entryForm()?.isSaving() ?? false;
  }

  canSave(): boolean {
    return this.entryForm()?.canSave() ?? false;
  }

  canSaveDraft(): boolean {
    return this.entryForm()?.canSaveDraft() ?? false;
  }

  save(): void {
    void this.entryForm()?.onSubmit();
  }

  async saveDraft(): Promise<void> {
    if (await this.entryForm()?.saveDraft()) void this.router.navigateByUrl('/sales');
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges() && !this.isSaving()) return;
    event.preventDefault();
  }

  returnToSales(): void {
    const returnUrl = this.routeState.returnUrl;
    const isInventoryRoute = returnUrl === '/inventory' || returnUrl?.startsWith('/inventory/');
    const isCatalogRoute = returnUrl === '/catalog' || returnUrl?.startsWith('/catalog?');
    void this.router.navigateByUrl(
      returnUrl && (isInventoryRoute || isCatalogRoute) ? returnUrl : '/sales',
    );
  }
}
