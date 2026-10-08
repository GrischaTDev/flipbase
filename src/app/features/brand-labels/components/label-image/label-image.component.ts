import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { LabelMediaService } from '../../services/label-media.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-label-image',
  imports: [ProductThumbnailComponent, ButtonComponent, ModalShellComponent],
  templateUrl: './label-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelImageComponent {
  readonly assetId = input.required<number>();
  readonly alt = input.required<string>();
  readonly canEnlarge = input(false);
  private readonly expandedKey = signal<string | null>(null);
  private readonly service = inject(LabelMediaService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly response = signal<{ key: string; src: string | null } | null>(null);
  private generation = 0;
  private readonly key = computed(() => {
    const user = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace()?.id ?? '';
    const operator = this.operator.operator();
    const active = this.access
      .access()
      .some((entry) => entry.workspace_id === workspace && entry.access_status === 'active');
    return user && (operator || active)
      ? `${user}:${workspace}:${operator}:${this.assetId()}`
      : null;
  });
  readonly src = computed(() =>
    this.response()?.key === this.key() ? (this.response()?.src ?? null) : null,
  );
  readonly expanded = computed(
    () => this.expandedKey() !== null && this.expandedKey() === this.key(),
  );
  enlarge(): void {
    if (this.src()) this.expandedKey.set(this.key());
  }
  close(): void {
    this.expandedKey.set(null);
  }
  constructor() {
    effect((cleanup) => {
      const key = this.key();
      const assetId = this.assetId();
      const load = async () => {
        const generation = ++this.generation;
        this.response.set(null);
        if (!key) return;
        const src = await this.service.signedUrl(assetId).catch(() => null);
        if (!this.destroyRef.destroyed && generation === this.generation && key === this.key())
          this.response.set({ key, src });
      };
      void load();
      const timer = setInterval(() => void load(), 45000);
      cleanup(() => {
        clearInterval(timer);
        this.generation++;
        this.response.set(null);
        this.expandedKey.set(null);
      });
    });
  }
}
